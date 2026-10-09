"""Skills and OpenAPI actions.

Skills are reusable bundles of instructions (+ optional tool names) an agent or a
chat can load — the Onyx "skills" concept. Actions are HTTP operations imported
from an OpenAPI spec that an agent can call (with approval), which is how you give
the assistant the ability to *do* things in other systems beyond the built-in
connectors.
"""

from __future__ import annotations

import json
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ...services import Services
from ..deps import Principal, audit, get_services, require

router = APIRouter(tags=["skills"])

_SLUG = re.compile(r"[^a-z0-9]+")
_HTTP_METHODS = ("get", "post", "put", "patch", "delete")


def slugify(name: str) -> str:
    return _SLUG.sub("-", name.lower()).strip("-")[:48] or "skill"


# ---- skills ---------------------------------------------------------------
class SkillBody(BaseModel):
    name: str
    description: str = ""
    instructions: str = ""
    tools: list[str] = []
    shared: bool = True
    enabled: bool = True


def _skill_row(r) -> dict:
    tools = r["tools"]
    if isinstance(tools, str):
        tools = json.loads(tools)
    return {
        "id": str(r["id"]), "slug": r["slug"], "name": r["name"], "description": r["description"],
        "instructions": r["instructions"], "tools": tools, "shared": r["shared"], "enabled": r["enabled"],
    }


@router.get("/api/skills")
async def list_skills(principal: Principal = Depends(require("assistant")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        rows = await conn.fetch(
            "SELECT * FROM skills WHERE shared = true OR created_by = $1 ORDER BY name", principal.user.id
        )
    return {"skills": [_skill_row(r) for r in rows]}


@router.post("/api/skills")
async def create_skill(body: SkillBody, principal: Principal = Depends(require("agents")), svc: Services = Depends(get_services)) -> dict:
    slug = slugify(body.name)
    async with svc.db.acquire(principal.tenant_id) as conn:
        try:
            sid = await conn.fetchval(
                """INSERT INTO skills (tenant_id, slug, name, description, instructions, tools, shared, enabled, created_by)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id""",
                principal.tenant_id, slug, body.name[:120], body.description, body.instructions,
                json.dumps(body.tools), body.shared, body.enabled, principal.user.id,
            )
        except Exception as exc:  # noqa: BLE001 - unique slug collision
            raise HTTPException(409, "A skill with that name already exists") from exc
    await audit(svc, principal, "skill.create", slug)
    return {"id": str(sid), "slug": slug}


@router.put("/api/skills/{skill_id}")
async def update_skill(skill_id: str, body: SkillBody, principal: Principal = Depends(require("agents")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        await conn.execute(
            """UPDATE skills SET name=$2, description=$3, instructions=$4, tools=$5, shared=$6, enabled=$7
               WHERE id=$1""",
            skill_id, body.name[:120], body.description, body.instructions, json.dumps(body.tools),
            body.shared, body.enabled,
        )
    return {"ok": True}


@router.delete("/api/skills/{skill_id}")
async def delete_skill(skill_id: str, principal: Principal = Depends(require("agents")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        await conn.execute("DELETE FROM skills WHERE id=$1", skill_id)
    return {"ok": True}


# ---- OpenAPI actions ------------------------------------------------------
class ImportBody(BaseModel):
    spec: dict | str
    collection: str | None = None
    baseUrl: str | None = None


def _parse_openapi(spec: dict, base_override: str | None) -> tuple[str, list[dict]]:
    """Turn an OpenAPI 3 document into a flat list of callable actions."""
    servers = spec.get("servers") or []
    base_url = base_override or (servers[0].get("url") if servers and isinstance(servers[0], dict) else "")
    title = (spec.get("info") or {}).get("title") or "api"
    actions: list[dict] = []
    for path, item in (spec.get("paths") or {}).items():
        if not isinstance(item, dict):
            continue
        common = item.get("parameters", []) if isinstance(item.get("parameters"), list) else []
        for method in _HTTP_METHODS:
            op = item.get(method)
            if not isinstance(op, dict):
                continue
            op_id = op.get("operationId") or f"{method}_{_SLUG.sub('_', path.strip('/').lower()) or 'root'}"
            params = []
            for p in (common + (op.get("parameters") or [])):
                if isinstance(p, dict) and "name" in p:
                    params.append({"name": p["name"], "in": p.get("in", "query"), "required": bool(p.get("required"))})
            if "requestBody" in op:
                rb = op.get("requestBody") or {}
                params.append({"name": "body", "in": "body", "required": bool(rb.get("required", True))})
            actions.append({
                "name": op_id[:120], "method": method.upper(), "path": path,
                "summary": (op.get("summary") or op.get("description") or "")[:300], "parameters": params,
            })
    return title, actions


@router.post("/api/actions/import")
async def import_actions(body: ImportBody, principal: Principal = Depends(require("agents")), svc: Services = Depends(get_services)) -> dict:
    spec = body.spec
    if isinstance(spec, str):
        try:
            spec = json.loads(spec)
        except json.JSONDecodeError:
            try:
                import yaml  # type: ignore

                spec = yaml.safe_load(spec)
            except Exception as exc:  # noqa: BLE001
                raise HTTPException(400, "Spec is not valid JSON or YAML") from exc
    if not isinstance(spec, dict) or "paths" not in spec:
        raise HTTPException(400, "Not an OpenAPI document (missing 'paths')")
    title, actions = _parse_openapi(spec, body.baseUrl)
    if not actions:
        raise HTTPException(400, "No operations found in the spec")
    collection = body.collection or slugify(title)
    async with svc.db.acquire(principal.tenant_id) as conn:
        for a in actions:
            base = body.baseUrl or ((spec.get("servers") or [{}])[0].get("url", "") if spec.get("servers") else "")
            await conn.execute(
                """INSERT INTO agent_actions (tenant_id, collection, name, method, path, base_url, summary, parameters, created_by)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                   ON CONFLICT (tenant_id, collection, name)
                   DO UPDATE SET method=excluded.method, path=excluded.path, base_url=excluded.base_url,
                                 summary=excluded.summary, parameters=excluded.parameters""",
                principal.tenant_id, collection, a["name"], a["method"], a["path"], base,
                a["summary"], json.dumps(a["parameters"]), principal.user.id,
            )
    await audit(svc, principal, "actions.import", collection, {"count": len(actions)})
    return {"collection": collection, "imported": len(actions),
            "actions": [{"name": a["name"], "method": a["method"], "path": a["path"]} for a in actions]}


@router.get("/api/actions")
async def list_actions(principal: Principal = Depends(require("assistant")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        rows = await conn.fetch(
            "SELECT id, collection, name, method, path, base_url, summary, requires_approval, parameters FROM agent_actions ORDER BY collection, name"
        )
    out = []
    for r in rows:
        params = r["parameters"]
        if isinstance(params, str):
            params = json.loads(params)
        out.append({
            "id": str(r["id"]), "collection": r["collection"], "name": r["name"], "method": r["method"],
            "path": r["path"], "baseUrl": r["base_url"], "summary": r["summary"],
            "requiresApproval": r["requires_approval"], "parameters": params,
        })
    return {"actions": out}


@router.delete("/api/actions/{action_id}")
async def delete_action(action_id: str, principal: Principal = Depends(require("agents")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        await conn.execute("DELETE FROM agent_actions WHERE id=$1", action_id)
    return {"ok": True}
