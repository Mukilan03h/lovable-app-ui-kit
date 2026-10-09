"""Universal connectors: ingest from any REST/GraphQL API or any MCP server.

These make the connector catalog open-ended — if a system has an HTTP API or an
MCP server, it can become a knowledge source without writing a bespoke connector,
which is how we exceed any platform's fixed connector list.
"""

from __future__ import annotations

from typing import Any, AsyncIterator

import httpx

from ..pipeline import SourceDocument
from .base import Connector, ConnectorMeta, register


def _dig(obj: Any, path: str) -> Any:
    cur = obj
    for part in filter(None, path.split(".")):
        if isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return None
    return cur


@register
class RestConnector(Connector):
    """Ingest a JSON list endpoint from any REST API, mapping fields to documents."""

    meta = ConnectorMeta(
        type="rest", name="REST / JSON API", category="Other", sync="poll", acl=False, logo="custom",
        config_fields=[
            {"key": "url", "label": "List endpoint URL", "type": "text", "required": True},
            {"key": "auth_header", "label": "Authorization header value", "type": "text", "required": False, "secret": True},
            {"key": "items_path", "label": "Path to array (e.g. data.items)", "type": "text", "required": False},
            {"key": "id_field", "label": "ID field", "type": "text", "required": False},
            {"key": "title_field", "label": "Title field", "type": "text", "required": False},
            {"key": "text_field", "label": "Text/body field", "type": "text", "required": False},
            {"key": "principal", "label": "Who can see it", "type": "text", "required": False},
        ],
    )

    async def fetch(self, cursor: str | None = None) -> AsyncIterator[SourceDocument]:
        cfg = self.config
        principal = cfg.get("principal") or "public"
        headers = {"Accept": "application/json", "User-Agent": "EnazBot/1.0"}
        if cfg.get("auth_header"):
            headers["Authorization"] = cfg["auth_header"]
        async with httpx.AsyncClient(timeout=30, headers=headers, follow_redirects=True) as client:
            resp = await client.get(cfg["url"])
            resp.raise_for_status()
            payload = resp.json()
        items = _dig(payload, cfg.get("items_path", "")) if cfg.get("items_path") else payload
        if isinstance(items, dict):
            items = items.get("items") or items.get("data") or items.get("results") or [items]
        if not isinstance(items, list):
            items = [items]
        id_f = cfg.get("id_field") or "id"
        title_f = cfg.get("title_field") or "title"
        text_f = cfg.get("text_field") or "text"
        for i, item in enumerate(items):
            if not isinstance(item, dict):
                item = {"text": str(item)}
            ext = str(item.get(id_f, i))
            title = str(item.get(title_f) or item.get("name") or f"Item {ext}")
            text = item.get(text_f) or item.get("body") or item.get("content") or _flatten(item)
            yield SourceDocument(external_id=ext, title=title, source="rest", acl=[principal],
                                 text=str(text), url=item.get("url"), path=cfg["url"])


@register
class McpConnector(Connector):
    """Ingest results from any MCP server by calling one of its tools."""

    meta = ConnectorMeta(
        type="mcp", name="MCP server", category="Other", sync="federated", acl=True, logo="custom",
        config_fields=[
            {"key": "url", "label": "MCP HTTP endpoint", "type": "text", "required": True},
            {"key": "token", "label": "Bearer token", "type": "text", "required": False, "secret": True},
            {"key": "tool", "label": "Tool to call (e.g. search)", "type": "text", "required": False},
            {"key": "query", "label": "Query argument", "type": "text", "required": False},
            {"key": "principal", "label": "Who can see it", "type": "text", "required": False},
        ],
    )

    async def fetch(self, cursor: str | None = None) -> AsyncIterator[SourceDocument]:
        cfg = self.config
        principal = cfg.get("principal") or "public"
        headers = {"content-type": "application/json", "User-Agent": "EnazBot/1.0"}
        if cfg.get("token"):
            headers["Authorization"] = f"Bearer {cfg['token']}"
        tool = cfg.get("tool") or "search"
        args = {"query": cfg["query"]} if cfg.get("query") else {}
        async with httpx.AsyncClient(timeout=30, headers=headers) as client:
            resp = await client.post(cfg["url"], json={"method": "tools/call",
                                                        "params": {"name": tool, "arguments": args}})
            resp.raise_for_status()
            data = resp.json()
        blocks = (data.get("content") or data.get("result", {}).get("content") or [])
        for i, block in enumerate(blocks):
            text = block.get("text") if isinstance(block, dict) else str(block)
            if not text:
                continue
            yield SourceDocument(external_id=f"{tool}:{i}", title=f"{tool} result {i + 1}",
                                 source="mcp", acl=[principal], text=text, path=cfg["url"])


def _flatten(item: dict) -> str:
    return "\n".join(f"{k}: {v}" for k, v in item.items() if isinstance(v, (str, int, float)))
