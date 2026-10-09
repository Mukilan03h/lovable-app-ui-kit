"""Minimal MCP-style HTTP endpoint exposing permission-scoped search.

Point an MCP client (with a personal access token) here and it gets company
context under the same access controls as the user who owns the token.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ...services import Services
from ..deps import Principal, authenticate, get_services

router = APIRouter(prefix="/api/mcp", tags=["mcp"])

TOOLS = [
    {
        "name": "search",
        "description": "Search the company's knowledge, returning only sources the caller can access.",
        "inputSchema": {
            "type": "object",
            "properties": {"query": {"type": "string"}, "k": {"type": "integer"}},
            "required": ["query"],
        },
    }
]


class MCPRequest(BaseModel):
    method: str
    params: dict = {}


@router.post("")
async def mcp(body: MCPRequest, principal: Principal = Depends(authenticate), svc: Services = Depends(get_services)) -> dict:
    if body.method == "tools/list":
        return {"tools": TOOLS}
    if body.method == "tools/call":
        name = body.params.get("name")
        args = body.params.get("arguments", {})
        if name != "search":
            return {"isError": True, "content": [{"type": "text", "text": f"Unknown tool: {name}"}]}
        query = args.get("query", "")
        k = min(int(args.get("k", 6)), 20)
        async with svc.db.acquire(principal.tenant_id) as conn:
            result = await svc.searcher.search(conn, query, principal.principals, k=k)
        lines = [f"[{i + 1}] {h.title} ({h.source}): {h.text[:280]}" for i, h in enumerate(result.hits)]
        text = "\n\n".join(lines) or "No accessible results."
        return {"content": [{"type": "text", "text": text}], "isError": False}
    return {"isError": True, "content": [{"type": "text", "text": f"Unsupported method: {body.method}"}]}
