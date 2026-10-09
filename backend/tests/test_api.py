"""End-to-end API tests: auth, RBAC, ACL, streaming answers, artifacts, admin, SCIM."""

from __future__ import annotations

import json

import pytest

from .conftest import auth, token_for


async def read_sse(client, url, headers, body):
    events = []
    async with client.stream("POST", url, headers=headers, json=body) as resp:
        assert resp.status_code == 200
        async for line in resp.aiter_lines():
            if line.startswith("data: "):
                events.append(json.loads(line[6:]))
    return events


async def test_health(client):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
    assert resp.json()["llm"] == "offline"


async def test_login_and_me(client, services):
    token = await token_for(client, services, "admin")
    resp = await client.get("/api/auth/me", headers=auth(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data["user"]["role"] == "admin"
    assert "public" in data["principals"]


async def test_password_login(client, services):
    resp = await client.post("/api/auth/login", json={"email": "admin@test.com", "password": "pw", "tenant": services._test_slug})
    assert resp.status_code == 200
    assert resp.json()["user"]["email"] == "admin@test.com"
    bad = await client.post("/api/auth/login", json={"email": "admin@test.com", "password": "wrong", "tenant": services._test_slug})
    assert bad.status_code == 401


async def test_rbac_blocks_member_from_admin(client, services):
    token = await token_for(client, services, "member")
    resp = await client.get("/api/admin/overview", headers=auth(token))
    assert resp.status_code == 403


async def test_search_and_acl(client, services):
    admin = await token_for(client, services, "admin")
    member = await token_for(client, services, "member")
    client_tok = await token_for(client, services, "client")

    r = await client.get("/api/search", params={"q": "GA launch blocker"}, headers=auth(admin))
    assert r.status_code == 200
    assert any(h["title"] == "GA readiness" for h in r.json()["results"])

    # Member (engineering) sees eng doc; not leadership-only comp doc.
    r = await client.get("/api/search", params={"q": "executive compensation equity"}, headers=auth(member))
    titles = [h["title"] for h in r.json()["results"]]
    assert "Executive compensation" not in titles

    # Admin (leadership) does see it.
    r = await client.get("/api/search", params={"q": "executive compensation equity"}, headers=auth(admin))
    assert "Executive compensation" in [h["title"] for h in r.json()["results"]]

    # Guest sees neither public-internal nor restricted docs.
    r = await client.get("/api/search", params={"q": "retrieval architecture reranker"}, headers=auth(client_tok))
    assert "Retrieval architecture" not in [h["title"] for h in r.json()["results"]]


async def test_assistant_quick_answer(client, services):
    token = await token_for(client, services, "admin")
    events = await read_sse(client, "/api/assistant/ask", auth(token),
                            {"query": "What is blocking the GA launch?", "mode": "quick"})
    types = [e["type"] for e in events]
    assert "route" in types and "answer" in types and "sources" in types and "done" in types
    answer = next(e for e in events if e["type"] == "answer")
    assert "[1]" in answer["text"] or answer["paragraphs"][0]["cites"]
    done = next(e for e in events if e["type"] == "done")
    assert done["baselineCost"] >= done["cost"]


async def test_assistant_research_with_artifact(client, services):
    token = await token_for(client, services, "admin")
    events = await read_sse(client, "/api/assistant/ask", auth(token),
                            {"query": "Build a deck on GA readiness", "mode": "research", "artifact": "slides"})
    artifact = [e for e in events if e["type"] == "artifact"]
    assert artifact, "expected an artifact event"
    aid = artifact[0]["artifactId"]

    dl = await client.get(f"/api/artifacts/{aid}/download", headers=auth(token))
    assert dl.status_code == 200
    assert dl.content[:2] == b"PK"  # valid OOXML/zip
    assert "presentation" in dl.headers["content-type"]

    # Edit by instruction creates a new version.
    patched = await client.post(f"/api/artifacts/{aid}/patch", headers=auth(token), json={"instruction": "add a risks slide"})
    assert patched.status_code == 200
    assert patched.json()["version"] == 2


async def test_upload_and_index(client, services):
    token = await token_for(client, services, "admin")
    files = {"file": ("note.md", b"# Onboarding\nConnect the identity provider in week one.", "text/markdown")}
    resp = await client.post("/api/connectors/upload", headers=auth(token), files=files, data={"access": "public"})
    assert resp.status_code == 200
    r = await client.get("/api/search", params={"q": "identity provider week one"}, headers=auth(token))
    assert any("Onboarding" in h["title"] for h in r.json()["results"])


async def test_connectors_catalog(client, services):
    token = await token_for(client, services, "admin")
    resp = await client.get("/api/connectors/catalog", headers=auth(token))
    assert resp.status_code == 200
    cat = resp.json()["connectors"]
    assert len(cat) >= 40
    assert any(c["live"] and c["type"] == "github" for c in cat)


async def test_settings_memory_and_tokens(client, services):
    token = await token_for(client, services, "member")
    m = await client.post("/api/settings/memory", headers=auth(token), json={"text": "Prefers concise answers"})
    assert m.status_code == 200
    mem = await client.get("/api/settings/memory", headers=auth(token))
    assert any(x["text"] == "Prefers concise answers" for x in mem.json()["memories"])

    t = await client.post("/api/settings/tokens", headers=auth(token), json={"name": "CLI", "scopes": ["search"]})
    raw = t.json()["token"]
    assert raw.startswith("enaz_")
    # The raw token authenticates and is scoped.
    r = await client.get("/api/search", params={"q": "GA launch"}, headers=auth(raw))
    assert r.status_code == 200
    # ...but not for an unscoped permission.
    bad = await client.get("/api/artifacts", headers=auth(raw))
    assert bad.status_code == 403


async def test_mcp_search(client, services):
    token = await token_for(client, services, "member")
    t = await client.post("/api/settings/tokens", headers=auth(token), json={"name": "MCP", "scopes": ["search"]})
    raw = t.json()["token"]
    resp = await client.post("/api/mcp", headers=auth(raw), json={"method": "tools/list"})
    assert any(tool["name"] == "search" for tool in resp.json()["tools"])
    call = await client.post("/api/mcp", headers=auth(raw),
                             json={"method": "tools/call", "params": {"name": "search", "arguments": {"query": "GA launch"}}})
    assert call.status_code == 200 and not call.json()["isError"]


async def test_admin_eval_and_insights(client, services):
    token = await token_for(client, services, "admin")
    ev = await client.post("/api/admin/evals/run", headers=auth(token))
    assert ev.status_code == 200
    assert ev.json()["questions"] >= 1
    assert ev.json()["recallAt10"] >= 50

    # Generate some query traffic, then check insights reflect it.
    await read_sse(client, "/api/assistant/ask", auth(token), {"query": "bake-off results", "mode": "quick"})
    ins = await client.get("/api/insights", params={"days": 7}, headers=auth(token))
    assert ins.json()["stats"]["queries"] >= 1


async def test_scim_provisioning(client, services):
    admin = await token_for(client, services, "admin")
    t = await client.post("/api/settings/tokens", headers=auth(admin), json={"name": "SCIM", "scopes": ["scim"]})
    scim_token = t.json()["token"]
    created = await client.post(
        "/scim/v2/Users", headers=auth(scim_token),
        json={"userName": "scim.user@test.com", "name": {"givenName": "Scim", "familyName": "User"}, "active": True},
    )
    assert created.status_code == 201
    uid = created.json()["id"]
    listed = await client.get("/scim/v2/Users", headers=auth(scim_token))
    assert any(u["userName"] == "scim.user@test.com" for u in listed.json()["Resources"])
    # Deactivate via PATCH.
    patched = await client.patch(f"/scim/v2/Users/{uid}", headers=auth(scim_token),
                                 json={"Operations": [{"op": "replace", "path": "active", "value": False}]})
    assert patched.json()["active"] is False
    # A non-SCIM token is rejected.
    bad = await client.get("/scim/v2/Users", headers=auth(admin))
    assert bad.status_code in (401, 403)


async def test_agents_list_and_create(client, services):
    token = await token_for(client, services, "admin")
    created = await client.post("/api/agents", headers=auth(token),
                                json={"name": "Test agent", "description": "d", "tools": ["Search"], "output": "answer"})
    assert created.status_code == 200
    listed = await client.get("/api/agents", headers=auth(token))
    assert any(a["name"] == "Test agent" for a in listed.json()["agents"])


async def test_agent_stage1_enforcement(client, services):
    """Stage 1: enabled status, source scope and tool allowlist are enforced server-side."""
    token = await token_for(client, services, "admin")

    async def make(name, **extra):
        r = await client.post("/api/agents", headers=auth(token),
                              json={"name": name, "description": "research the PTO policy", "output": "answer", **extra})
        return r.json()["id"]

    # 1) A disabled agent cannot run.
    aid = await make("Disabled agent", tools=["Search"])
    async with services.db.acquire(services._test_tenant) as conn:
        await conn.execute("UPDATE agents SET enabled=false WHERE id=$1", aid)
    denied = await client.post(f"/api/agents/{aid}/run", headers=auth(token), json={})
    assert denied.status_code == 409

    # 2) Two agents with different source scopes behave differently over the same task.
    broad = await make("Broad", sources=[])                 # all sources the user can read
    narrow = await make("Narrow", sources=["nonexistent_source"])  # scoped to nothing real
    broad_ev = await read_sse(client, f"/api/agents/{broad}/run", auth(token), {"task": "what is the PTO policy"})
    narrow_ev = await read_sse(client, f"/api/agents/{narrow}/run", auth(token), {"task": "what is the PTO policy"})
    broad_sources = next((e for e in broad_ev if e.get("type") == "sources"), {"sources": []})
    narrow_sources = next((e for e in narrow_ev if e.get("type") == "sources"), {"sources": []})
    assert len(broad_sources["sources"]) > 0
    assert len(narrow_sources["sources"]) == 0  # scope restricts retrieval to nothing
    assert any(e.get("label") == "Scoped to agent sources" for e in narrow_ev)

    # 3) Tool allowlist gates side effects: a granted side-effect tool stops at an approval…
    granted = await make("Jira agent", tools=["Search", "Jira"])
    ev = await read_sse(client, f"/api/agents/{granted}/run", auth(token), {"task": "summarise"})
    assert any(e.get("type") == "approval" and e.get("tool") == "jira" for e in ev)
    # …while an agent without any granted side-effect tool never proposes one.
    readonly = await make("Readonly agent", tools=["Search"])
    ev2 = await read_sse(client, f"/api/agents/{readonly}/run", auth(token), {"task": "summarise"})
    assert not any(e.get("type") == "approval" for e in ev2)


async def test_tenant_isolation(client, services):
    """A token from this tenant must never read another tenant's data."""
    admin = await token_for(client, services, "admin")
    # Create a second tenant with a doc, directly.
    async with services.db.admin() as conn:
        other = await conn.fetchval("INSERT INTO tenants (slug,name) VALUES ($1,$1) RETURNING id", f"other-{services._test_slug}")
    try:
        from enaz.ingest.pipeline import SourceDocument
        await services.ingest.ingest(str(other), SourceDocument("x", "Other tenant secret", "drive", ["public"], text="Secret from another company entirely."))
        r = await client.get("/api/search", params={"q": "Other tenant secret company"}, headers=auth(admin))
        assert "Other tenant secret" not in [h["title"] for h in r.json()["results"]]
    finally:
        async with services.db.admin() as conn:
            await conn.execute("DELETE FROM tenants WHERE id = $1", other)


async def test_connector_catalog_has_universal(client, services):
    token = await token_for(client, services, "admin")
    resp = await client.get("/api/connectors/catalog", headers=auth(token))
    types = {c["type"] for c in resp.json()["connectors"]}
    assert {"rest", "mcp", "web", "github"} <= types
    live = {c["type"] for c in resp.json()["connectors"] if c["live"]}
    assert {"web", "github", "rest", "mcp"} <= live


async def test_code_interpreter_session(client, services):
    import uuid

    token = await token_for(client, services, "admin")
    cid = str(uuid.uuid4())
    # Upload a CSV; markitdown extracts it.
    files = {"file": ("sales.csv", b"product,revenue\nAlpha,120\nBeta,90\nGamma,150\n", "text/csv")}
    up = await client.post(f"/api/conversations/{cid}/files", headers=auth(token), files=files)
    assert up.status_code == 200
    assert up.json()["extracted"] is True

    # The AI runs code over the uploaded file: compute + chart + a derived file.
    code = (
        "import pandas as pd, matplotlib.pyplot as plt\n"
        "df = pd.read_csv('sales.csv')\n"
        "print('total', df.revenue.sum())\n"
        "df.plot.bar(x='product', y='revenue'); plt.savefig('chart.png')\n"
        "df.to_csv('out.csv', index=False)\n"
    )
    run = await client.post(f"/api/conversations/{cid}/run", headers=auth(token), json={"code": code})
    assert run.status_code == 200
    data = run.json()
    assert data["returnCode"] == 0
    assert "total 360" in data["stdout"]
    names = {f["name"] for f in data["files"]}
    assert "chart.png" in names and "out.csv" in names
    assert data["images"] and data["images"][0]["dataUrl"].startswith("data:image/png;base64,")

    # The generated file is listed and downloadable.
    listed = await client.get(f"/api/conversations/{cid}/files", headers=auth(token))
    listed_names = {f["name"] for f in listed.json()["files"]}
    assert {"sales.csv", "chart.png", "out.csv"} <= listed_names
    assert not any(n.startswith(".") for n in listed_names)
    dl = await client.get(f"/api/conversations/{cid}/files/chart.png/download", headers=auth(token))
    assert dl.status_code == 200 and dl.content[:4] == b"\x89PNG"


async def test_sandbox_blocks_network(client, services):
    import uuid

    token = await token_for(client, services, "admin")
    cid = str(uuid.uuid4())
    code = "import socket; socket.setdefaulttimeout(2); socket.create_connection(('1.1.1.1', 53)); print('REACHED')"
    run = await client.post(f"/api/conversations/{cid}/run", headers=auth(token), json={"code": code})
    data = run.json()
    assert "REACHED" not in data["stdout"]
    # Isolation is active in this environment.
    assert data["networkIsolated"] is True


async def test_connector_sync_engine_tracks_index_attempts(client, services):
    """Drive the real sync engine with an in-process connector: new/updated/removed
    classification, incremental unchanged detection, pruning, and index-attempt rows."""
    from enaz.ingest.connectors.base import Connector, ConnectorMeta, register
    from enaz.ingest.pipeline import SourceDocument
    from enaz.ingest.sync import run_sync

    # A fake connector whose output we control between syncs.
    docs_state = {
        "docs": [("a", "Alpha", "alpha body one"), ("b", "Beta", "beta body two")],
    }

    @register
    class _FakeConnector(Connector):
        meta = ConnectorMeta(type="_fake", name="Fake", category="Other", sync="poll",
                             acl=False, logo="custom", config_fields=[])

        async def fetch(self, cursor=None):
            for ext, title, body in docs_state["docs"]:
                yield SourceDocument(external_id=ext, title=title, source="_fake",
                                     acl=["public"], text=body, path="fake")

    tid = services._test_tenant
    async with services.db.acquire(tid) as conn:
        cid = str(await conn.fetchval(
            "INSERT INTO connectors (tenant_id,type,name,config,status) VALUES ($1,'_fake','Fake','{}','idle') RETURNING id",
            tid,
        ))

    # First sync: both documents are new.
    r1 = await run_sync(services, tid, cid)
    assert r1["new"] == 2 and r1["updated"] == 0 and r1["total"] == 2

    # Second sync, identical content: nothing new or updated.
    r2 = await run_sync(services, tid, cid)
    assert r2["new"] == 0 and r2["updated"] == 0 and r2["total"] == 2

    # Change one doc's body and drop the other: one updated, one removed.
    docs_state["docs"] = [("a", "Alpha", "alpha body CHANGED")]
    r3 = await run_sync(services, tid, cid)
    assert r3["new"] == 0 and r3["updated"] == 1 and r3["removed"] == 1 and r3["total"] == 1

    # Index attempts were recorded, newest first, all successful.
    async with services.db.acquire(tid) as conn:
        rows = await conn.fetch(
            "SELECT status, new_docs, updated_docs, removed_docs FROM index_attempts WHERE connector_id=$1 ORDER BY started_at",
            cid,
        )
    assert len(rows) == 3
    assert [r["status"] for r in rows] == ["success", "success", "success"]
    assert rows[0]["new_docs"] == 2 and rows[2]["removed_docs"] == 1

    # Re-index both docs so there is content to scope, then prove document-set
    # scoping actually restricts retrieval to the set's connectors.
    docs_state["docs"] = [("a", "Alpha", "alpha body one"), ("b", "Beta", "beta body two")]
    await run_sync(services, tid, cid)
    async with services.db.acquire(tid) as conn:
        scoped = await services.searcher.search(conn, "alpha", ["public"], k=5, connector_ids=[cid])
        empty = await services.searcher.search(conn, "alpha", ["public"], k=5, connector_ids=["__none__"])
    assert scoped.hits and all(getattr(h, "doc_id", None) for h in scoped.hits)
    assert empty.hits == []  # a set with no matching connector scopes to nothing
