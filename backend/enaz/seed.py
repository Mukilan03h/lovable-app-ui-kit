"""Seed a tenant with demo users and real, indexed sample documents.

Sample documents are ingested through the real pipeline (chunked, embedded,
indexed with ACLs), so the demo exercises genuine permission-aware retrieval —
not a hard-coded result list. Restricted docs are visible only to the roles that
should see them, which the ACL tests rely on.
"""

from __future__ import annotations

import json

from .ingest.pipeline import SourceDocument
from .security import hash_password
from .services import Services

DEMO_USERS = [
    ("alina@enaz.studio", "Alina Verma", "admin", "Founder & Admin", "AV", ["Leadership", "Engineering"]),
    ("marcus@enaz.studio", "Marcus Hale", "manager", "Delivery Manager", "MH", ["Leadership"]),
    ("priya@enaz.studio", "Priya Nair", "member", "Product Designer", "PN", ["Product"]),
    ("diego@enaz.studio", "Diego Santos", "member", "Frontend Engineer", "DS", ["Engineering"]),
    ("lena@enaz.studio", "Lena Fischer", "member", "Backend Engineer", "LF", ["Engineering"]),
    ("tom@brightbridge.io", "Tom Whitaker", "client", "Client — BrightBridge", "TW", []),
]

# (external_id, title, source, doc_type, acl, text)
SAMPLE_DOCS = [
    ("launch-thread", "#launch-knowledge — GA readiness", "slack", "thread", ["public"],
     "Connector freshness is now under four minutes for Slack, Drive and Jira. SharePoint permission sync for nested AD groups is the last blocker before GA. Liam owns the fix with an ETA of Friday."),
    ("retrieval-v2", "Retrieval Architecture v2", "confluence", "page", ["public", "group:engineering"],
     "The retrieval stack fuses BM25 keyword search, dense vectors and learned sparse signals with reciprocal rank fusion, followed by a cross-encoder reranker. Prefixing each chunk with document context reduced retrieval failures by 41 percent on the golden set."),
    ("know-482", "KNOW-482 SharePoint nested group expansion fails", "jira", "ticket", ["public", "group:engineering"],
     "Nested Active Directory groups beyond depth three are not expanded, causing false negatives in ACL filtering. The fix is in review and owned by Liam Rodriguez, ETA Friday."),
    ("bakeoff", "Competitive bake-off results — Acme", "sharepoint", "sheet", ["public", "group:leadership"],
     "Blind grading on 300 questions: Enaz answered 82 percent correctly with citations versus 71 percent for the incumbent. Median answer latency was 2.1 seconds versus 3.8 seconds, and cost per answer was under one cent."),
    ("pricing", "Q3 Enterprise Pricing Proposal", "drive", "doc", ["group:leadership"],
     "Proposed seat price moves to 24 dollars per user per month with volume tiers at 500 and 2000 seats. The self-hosted edition stays free and includes permission sync, which is a paid feature for competitors."),
    ("globex", "Renewal risk — Globex", "salesforce", "doc", ["public", "group:leadership"],
     "The Globex renewal on November 30 depends on the SharePoint permission sync fix and an on-prem deployment option. The champion asked for both in the last call."),
    ("onboarding", "Customer onboarding playbook", "notion", "page", ["public"],
     "Week one: connect the identity provider and the top three sources. Week two: create a golden set with champions. Week three: roll out to ten percent of employees, then expand."),
    ("deck-renderer", "artifacts-service deck renderer", "github", "code", ["public", "group:engineering"],
     "renderDeck takes a DeckSpec and maps each slide layout to brand template masters, writing speaker notes that carry the source citations for every slide."),
]

SAMPLE_AGENTS = [
    ("Weekly status deck", "Every Friday, summarizes Jira progress and Slack decisions into a branded 6-slide deck.",
     ["Jira", "Slack", "Slides"], "schedule", "slides"),
    ("Renewal risk analyst", "Scores open renewals from Salesforce, support tickets and usage, exports a ranked sheet.",
     ["Salesforce", "Zendesk", "Sheet"], "schedule", "sheet"),
    ("Support answer drafter", "Drafts cited replies to new support tickets and asks for approval before posting.",
     ["Zendesk", "Confluence", "Search"], "event", "answer"),
    ("RFP responder", "Answers security and RFP questionnaires from approved knowledge, outputs a Word doc.",
     ["Search", "Drive", "Doc"], "manual", "doc"),
]

VERIFIED = [
    ("What is our data retention default?", "Chats are retained for one year by default; admins can change it in Security settings.", "Security"),
    ("Which SSO providers are supported?", "OIDC via Okta, Microsoft Entra ID and Auth0, plus SAML; SCIM is available for provisioning.", "IT"),
]


async def seed(svc: Services) -> dict:
    s = svc.settings
    async with svc.db.admin() as conn:
        tenant_id = await conn.fetchval("SELECT id FROM tenants WHERE slug = $1", s.default_tenant_slug)
        if tenant_id is None:
            tenant_id = await conn.fetchval(
                "INSERT INTO tenants (slug, name) VALUES ($1, $2) RETURNING id", s.default_tenant_slug, s.default_tenant_name
            )
        existing = await conn.fetchval("SELECT count(*) FROM users WHERE tenant_id = $1", tenant_id)
        if existing and existing > 0:
            return {"tenant_id": str(tenant_id), "seeded": False}

        group_ids: dict[str, str] = {}
        for g in ("Leadership", "Engineering", "Product"):
            gid = await conn.fetchval(
                "INSERT INTO groups (tenant_id, name) VALUES ($1,$2) ON CONFLICT (tenant_id,name) DO UPDATE SET name=excluded.name RETURNING id",
                tenant_id, g,
            )
            group_ids[g] = gid
        pw = hash_password("demo-password")
        for email, name, role, title, avatar, groups in DEMO_USERS:
            uid = await conn.fetchval(
                "INSERT INTO users (tenant_id,email,name,role,title,avatar,password_hash) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
                tenant_id, email, name, role, title, avatar, pw,
            )
            for g in groups:
                await conn.execute(
                    "INSERT INTO user_groups (tenant_id,user_id,group_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
                    tenant_id, uid, group_ids[g],
                )
        owner = await conn.fetchval("SELECT id FROM users WHERE tenant_id=$1 AND role='admin' LIMIT 1", tenant_id)
        for name, desc, tools, trig, output in SAMPLE_AGENTS:
            await conn.execute(
                "INSERT INTO agents (tenant_id,name,description,instructions,tools,trigger,output,owner_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
                tenant_id, name, desc, "Use only sources the requester can access. Cite every claim.",
                json.dumps(tools), trig, output, owner,
            )
        for q, a, cat in VERIFIED:
            await conn.execute(
                "INSERT INTO verified_answers (tenant_id,question,answer,category,owner_id) VALUES ($1,$2,$3,$4,$5)",
                tenant_id, q, a, cat, owner,
            )
        # A sample connector row (the website crawler), marked synced.
        await conn.execute(
            "INSERT INTO connectors (tenant_id,type,name,status,freshness,doc_count,last_sync,created_by) VALUES ($1,'web','Company handbook (web)','healthy','poll 15m',$2,now(),$3)",
            tenant_id, len(SAMPLE_DOCS), owner,
        )

    tid = str(tenant_id)
    for ext, title, source, doc_type, acl, text in SAMPLE_DOCS:
        await svc.ingest.ingest(tid, SourceDocument(ext, title, source, acl, text=text, doc_type=doc_type, owner="Enaz team"))
    return {"tenant_id": tid, "seeded": True, "users": len(DEMO_USERS), "docs": len(SAMPLE_DOCS)}
