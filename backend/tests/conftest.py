"""Test fixtures: an app wired to the test Postgres, running fully offline.

Tests run against a dedicated tenant so they never touch the demo 'acme' data,
and the LLM gateway is forced offline so there are no network calls.
"""

from __future__ import annotations

import os
import uuid

import pytest
import pytest_asyncio

os.environ["ENAZ_LLM_OFFLINE"] = "true"
os.environ["ENAZ_SEED_SAMPLE_DATA"] = "false"
os.environ.pop("ANTHROPIC_API_KEY", None)
os.environ.pop("ANTHROPIC_BASE_URL", None)
os.environ.pop("ANTHROPIC_AUTH_TOKEN", None)

import httpx  # noqa: E402

from enaz.config import Settings  # noqa: E402
from enaz.ingest.pipeline import SourceDocument  # noqa: E402
from enaz.security import hash_password  # noqa: E402
from enaz.services import Services  # noqa: E402

TEST_DB = os.environ.get("ENAZ_TEST_DATABASE_URL", "postgresql://enaz_app@127.0.0.1:5433/enaz")
TEST_ADMIN_DB = os.environ.get("ENAZ_TEST_ADMIN_DATABASE_URL", "postgresql://enaz@127.0.0.1:5433/enaz")


@pytest_asyncio.fixture
async def services():
    settings = Settings(
        database_url=TEST_DB, admin_database_url=TEST_ADMIN_DB, embedding_dim=512,
        llm_offline=True, seed_sample_data=False, secret_key="test-secret-key-at-least-32-bytes-long!",
    )
    svc = Services(settings)
    await svc.startup()
    slug = f"test-{uuid.uuid4().hex[:8]}"
    async with svc.db.admin() as conn:
        tenant_id = await conn.fetchval("INSERT INTO tenants (slug, name) VALUES ($1, $2) RETURNING id", slug, slug)
        pw = hash_password("pw")
        for email, name, role, groups in [
            ("admin@test.com", "Admin", "admin", ["Leadership"]),
            ("member@test.com", "Member", "member", ["Engineering"]),
            ("client@test.com", "Guest", "client", []),
        ]:
            uid = await conn.fetchval(
                "INSERT INTO users (tenant_id,email,name,role,password_hash) VALUES ($1,$2,$3,$4,$5) RETURNING id",
                tenant_id, email, name, role, pw,
            )
            for g in groups:
                gid = await conn.fetchval(
                    "INSERT INTO groups (tenant_id,name) VALUES ($1,$2) ON CONFLICT (tenant_id,name) DO UPDATE SET name=excluded.name RETURNING id",
                    tenant_id, g,
                )
                await conn.execute("INSERT INTO user_groups (tenant_id,user_id,group_id) VALUES ($1,$2,$3)", tenant_id, uid, gid)
    tid = str(tenant_id)
    for ext, title, src, acl, text in [
        ("pub1", "GA readiness", "slack", ["public"], "The GA launch is blocked by SharePoint permission sync for nested AD groups beyond depth three. Liam owns the fix, ETA Friday."),
        ("pub2", "Bake-off results", "sharepoint", ["public"], "Enaz scored 82 percent with citations versus 71 percent for the incumbent. Latency 2.1s versus 3.8s."),
        ("eng1", "Retrieval architecture", "confluence", ["group:engineering"], "Hybrid BM25 plus vectors with reciprocal rank fusion and a cross encoder reranker."),
        ("sec1", "Executive compensation", "drive", ["group:leadership"], "Confidential executive compensation and equity refresh for leadership."),
    ]:
        await svc.ingest.ingest(tid, SourceDocument(ext, title, src, acl, text=text))
    svc._test_tenant = tid  # type: ignore[attr-defined]
    svc._test_slug = slug  # type: ignore[attr-defined]
    try:
        yield svc
    finally:
        async with svc.db.admin() as conn:
            await conn.execute("DELETE FROM tenants WHERE id = $1", tenant_id)
        await svc.shutdown()


@pytest_asyncio.fixture
async def client(services):
    from enaz.app import create_app

    app = create_app(services.settings)
    app.state.services = services
    app.state.settings = services.settings
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def token_for(client: httpx.AsyncClient, services, role: str) -> str:
    resp = await client.post("/api/auth/demo-login", json={"role": role, "tenant": services._test_slug})
    assert resp.status_code == 200, resp.text
    return resp.json()["token"]


def auth(token: str) -> dict:
    return {"authorization": f"Bearer {token}"}
