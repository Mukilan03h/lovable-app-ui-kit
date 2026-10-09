"""Permission-aware document index on PostgreSQL + pgvector + native full-text.

Access control is enforced in the database: RLS scopes every query to the tenant,
and each search intersects document ACLs with the caller's principals. The LLM
never sees a document the user cannot open.

Methods take an explicit asyncpg connection (already scoped to the tenant by
`Database.acquire(tenant_id)`) so a single request runs keyword + vector + fetch
on one transaction.
"""

from __future__ import annotations

from typing import Any, Iterable

import asyncpg
import numpy as np

from ..db import new_uuid


class DocumentIndex:
    async def upsert_document(
        self,
        conn: asyncpg.Connection,
        tenant_id: str,
        doc: dict[str, Any],
        principals: Iterable[str],
        chunks: list[dict[str, Any]],
        vectors: Any,
    ) -> str:
        row = await conn.fetchrow(
            """INSERT INTO documents
                   (tenant_id, connector_id, source, external_id, title, url, path, doc_type,
                    owner, content_hash, metadata, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, to_timestamp($12))
               ON CONFLICT (tenant_id, connector_id, external_id) DO UPDATE SET
                   title=excluded.title, url=excluded.url, path=excluded.path, doc_type=excluded.doc_type,
                   owner=excluded.owner, content_hash=excluded.content_hash, metadata=excluded.metadata,
                   updated_at=excluded.updated_at
               RETURNING id""",
            tenant_id, doc.get("connector_id"), doc["source"], doc["external_id"], doc["title"],
            doc.get("url"), doc.get("path", ""), doc.get("doc_type", "doc"), doc.get("owner", ""),
            doc.get("content_hash"), _json(doc.get("metadata", {})), float(doc.get("updated_at") or _now()),
        )
        doc_id = str(row["id"])
        await conn.execute("DELETE FROM chunks WHERE doc_id = $1", doc_id)
        await conn.execute("DELETE FROM doc_acl WHERE doc_id = $1", doc_id)
        acl_rows = [(tenant_id, doc_id, p.lower()) for p in dict.fromkeys(principals)]
        if acl_rows:
            await conn.executemany(
                "INSERT INTO doc_acl (tenant_id, doc_id, principal) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", acl_rows
            )
        if chunks:
            await conn.executemany(
                """INSERT INTO chunks (id, tenant_id, doc_id, ord, section, text, context, parent_text, tokens, embedding)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)""",
                [
                    (
                        new_uuid(), tenant_id, doc_id, c["ord"], c.get("section", ""), c["text"],
                        c.get("context", ""), c.get("parent_text", ""), c.get("tokens", 0),
                        np.asarray(vec, dtype=np.float32),
                    )
                    for c, vec in zip(chunks, vectors)
                ],
            )
        return doc_id

    async def delete_document(self, conn: asyncpg.Connection, doc_id: str) -> None:
        await conn.execute("DELETE FROM documents WHERE id = $1", doc_id)

    async def set_acl(self, conn: asyncpg.Connection, tenant_id: str, doc_id: str, principals: Iterable[str]) -> None:
        await conn.execute("DELETE FROM doc_acl WHERE doc_id = $1", doc_id)
        await conn.executemany(
            "INSERT INTO doc_acl (tenant_id, doc_id, principal) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
            [(tenant_id, doc_id, p.lower()) for p in dict.fromkeys(principals)],
        )

    async def can_read(self, conn: asyncpg.Connection, doc_id: str, principals: list[str]) -> bool:
        row = await conn.fetchrow(
            "SELECT 1 FROM doc_acl WHERE doc_id = $1 AND principal = ANY($2::text[]) LIMIT 1",
            doc_id, [p.lower() for p in principals],
        )
        return row is not None

    async def keyword_search(
        self, conn: asyncpg.Connection, query: str, principals: list[str], limit: int = 60
    ) -> list[tuple[str, float]]:
        if not query.strip() or not principals:
            return []
        rows = await conn.fetch(
            """SELECT c.id, ts_rank_cd(c.tsv, q, 32) AS rank
               FROM chunks c, websearch_to_tsquery('english', $1) q
               WHERE c.tsv @@ q
                 AND EXISTS (SELECT 1 FROM doc_acl a WHERE a.doc_id = c.doc_id AND a.principal = ANY($2::text[]))
               ORDER BY rank DESC LIMIT $3""",
            query, [p.lower() for p in principals], limit,
        )
        return [(str(r["id"]), float(r["rank"])) for r in rows]

    async def vector_search(
        self, conn: asyncpg.Connection, qvec: np.ndarray, principals: list[str], limit: int = 60
    ) -> list[tuple[str, float]]:
        if not principals:
            return []
        # Keep recall high when the ACL filter is selective (restricted users).
        await conn.execute("SET LOCAL hnsw.iterative_scan = 'relaxed_order'")
        await conn.execute("SET LOCAL hnsw.max_scan_tuples = 20000")
        rows = await conn.fetch(
            """SELECT c.id, 1 - (c.embedding <=> $1) AS cosine
               FROM chunks c
               WHERE c.embedding IS NOT NULL
                 AND EXISTS (SELECT 1 FROM doc_acl a WHERE a.doc_id = c.doc_id AND a.principal = ANY($2::text[]))
               ORDER BY c.embedding <=> $1 LIMIT $3""",
            np.asarray(qvec, dtype=np.float32), [p.lower() for p in principals], limit,
        )
        return [(str(r["id"]), float(r["cosine"])) for r in rows]

    async def get_chunks(self, conn: asyncpg.Connection, chunk_ids: list[str]) -> dict[str, dict[str, Any]]:
        if not chunk_ids:
            return {}
        rows = await conn.fetch(
            """SELECT c.id, c.doc_id, c.ord, c.section, c.text, c.context, c.parent_text,
                      d.title, d.source, d.url, d.path, d.doc_type, d.owner, d.connector_id,
                      extract(epoch FROM d.updated_at) AS updated_at, d.metadata
               FROM chunks c JOIN documents d ON d.id = c.doc_id
               WHERE c.id = ANY($1::uuid[])""",
            chunk_ids,
        )
        out: dict[str, dict[str, Any]] = {}
        for r in rows:
            d = dict(r)
            d["id"] = str(d["id"])
            d["doc_id"] = str(d["doc_id"])
            d["connector_id"] = str(d["connector_id"]) if d.get("connector_id") else None
            out[d["id"]] = d
        return out

    async def get_document(self, conn: asyncpg.Connection, doc_id: str) -> dict[str, Any] | None:
        row = await conn.fetchrow("SELECT * FROM documents WHERE id = $1", doc_id)
        if not row:
            return None
        doc = dict(row)
        doc["id"] = str(doc["id"])
        acls = await conn.fetch("SELECT principal FROM doc_acl WHERE doc_id = $1", doc_id)
        doc["acl"] = [a["principal"] for a in acls]
        return doc

    async def document_chunks(self, conn: asyncpg.Connection, doc_id: str) -> list[dict[str, Any]]:
        rows = await conn.fetch(
            "SELECT id, ord, section, text, parent_text FROM chunks WHERE doc_id = $1 ORDER BY ord", doc_id
        )
        return [{**dict(r), "id": str(r["id"])} for r in rows]

    async def stats(self, conn: asyncpg.Connection) -> dict[str, Any]:
        docs = await conn.fetchval("SELECT count(*) FROM documents")
        chunks = await conn.fetchval("SELECT count(*) FROM chunks")
        by_source = await conn.fetch(
            "SELECT source, count(*) AS docs FROM documents GROUP BY source ORDER BY docs DESC"
        )
        return {"documents": docs, "chunks": chunks, "bySource": [dict(r) for r in by_source]}


def _json(value: Any) -> str:
    import json

    return json.dumps(value, default=str)


def _now() -> float:
    import time

    return time.time()
