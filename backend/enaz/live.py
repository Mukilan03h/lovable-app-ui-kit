"""Live business-data querying (read-only, at answer time).

A live source returns current records without indexing them, so an answer can
combine documents with up-to-the-moment data and say when it was last checked.
Everything here is read-only by construction: SQL runs as a single SELECT inside
a READ ONLY transaction with a statement timeout and a row cap; REST does a GET.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

import asyncpg
import httpx

MAX_ROWS = 100
STATEMENT_TIMEOUT_MS = 4000

_FORBIDDEN = re.compile(
    r"\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|merge|"
    r"vacuum|call|do|comment|reindex|refresh|lock|set\s+role)\b",
    re.I,
)


class LiveQueryError(Exception):
    pass


def _validate_sql(query: str) -> str:
    q = query.strip().rstrip(";").strip()
    if not q:
        raise LiveQueryError("Empty query")
    if ";" in q:
        raise LiveQueryError("Only a single statement is allowed")
    if not re.match(r"^\s*(select|with)\b", q, re.I):
        raise LiveQueryError("Only SELECT/WITH queries are allowed")
    if _FORBIDDEN.search(q):
        raise LiveQueryError("Query contains a forbidden keyword")
    return q


def _dig(obj: Any, path: str) -> Any:
    cur = obj
    for part in filter(None, path.split(".")):
        cur = cur.get(part) if isinstance(cur, dict) else None
    return cur


async def _run_sql(config: dict, default_dsn: str) -> dict:
    query = _validate_sql(str(config.get("query", "")))
    dsn = config.get("read_dsn") or default_dsn
    # Wrap in a bounded subquery so a row cap always applies.
    wrapped = f"SELECT * FROM ({query}) AS _live LIMIT {MAX_ROWS}"
    conn = await asyncpg.connect(dsn)
    try:
        await conn.execute("SET TRANSACTION READ ONLY")
        await conn.execute(f"SET statement_timeout = {STATEMENT_TIMEOUT_MS}")
        rows = await conn.fetch(wrapped)
    finally:
        await conn.close()
    columns = list(rows[0].keys()) if rows else []
    return {"columns": columns, "rows": [list(r.values()) for r in rows]}


async def _run_rest(config: dict) -> dict:
    url = config["url"]
    headers = {"Accept": "application/json", "User-Agent": "EnazLive/1.0"}
    if config.get("auth_header"):
        headers["Authorization"] = config["auth_header"]
    async with httpx.AsyncClient(timeout=10, headers=headers, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        payload = resp.json()
    items = _dig(payload, config["items_path"]) if config.get("items_path") else payload
    if isinstance(items, dict):
        items = [items]
    if not isinstance(items, list):
        items = [items]
    items = items[:MAX_ROWS]
    columns = sorted({k for it in items if isinstance(it, dict) for k in it.keys()})
    rows = [[it.get(c) if isinstance(it, dict) else it for c in columns] for it in items]
    return {"columns": columns, "rows": rows}


async def run_live_query(kind: str, config: dict, default_dsn: str) -> dict:
    """Execute a live source and return current records with a checked-at stamp."""
    checked_at = datetime.now(timezone.utc).timestamp()
    if kind == "sql":
        out = await _run_sql(config, default_dsn)
    elif kind == "rest":
        out = await _run_rest(config)
    else:
        raise LiveQueryError(f"Unknown live source kind: {kind}")
    out["checkedAt"] = checked_at
    out["rowCount"] = len(out["rows"])
    return out


def as_evidence_block(name: str, result: dict) -> str:
    """Render live rows as a compact, labelled block for the answer prompt."""
    cols = result.get("columns", [])
    lines = [" | ".join(str(c) for c in cols)]
    for row in result.get("rows", [])[:40]:
        lines.append(" | ".join("" if v is None else str(v) for v in row))
    return f"Live source '{name}' (current records, checked just now):\n" + "\n".join(lines)
