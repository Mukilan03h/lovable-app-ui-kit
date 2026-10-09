"""Pluggable vector store.

Vectors live in PostgreSQL (pgvector) by default. This is the right choice for
the great majority of deployments: it keeps retrieval permission-aware *in the
database* (the ACL intersection and tenant RLS run in the same query as the ANN
search, so a user can never be returned a chunk they cannot open), and it avoids
a second datastore to operate, back up and keep consistent. Research puts
pgvector + HNSW comfortably in production range to tens of millions of vectors.

For deployments that outgrow a single Postgres — billions of vectors, sub-5ms
p99 at very high QPS, or heavy concurrent re-indexing — the vector backend is
swappable: set ``ENAZ_VECTOR_BACKEND=qdrant`` and a dedicated Qdrant cluster
handles the ANN search while Postgres stays the system of record for documents,
full-text, metadata and ACLs. ACLs are enforced in Qdrant via a payload filter
on the caller's principals, so the permission guarantee is preserved either way.

The interface is deliberately small: upsert vectors for a document, ANN-search
within a principal set, and delete a document's vectors.
"""

from __future__ import annotations

from typing import Any, Protocol

import asyncpg
import numpy as np


class VectorStore(Protocol):
    name: str

    async def upsert(
        self, conn: asyncpg.Connection, tenant_id: str, doc_id: str,
        chunk_ids: list[str], vectors: list[Any], principals: list[str],
    ) -> None: ...

    async def search(
        self, conn: asyncpg.Connection, tenant_id: str, qvec: np.ndarray,
        principals: list[str], limit: int,
    ) -> list[tuple[str, float]]: ...

    async def delete_doc(self, conn: asyncpg.Connection, tenant_id: str, doc_id: str) -> None: ...


class PgVectorStore:
    """Default backend: vectors in the `chunks.embedding` pgvector column.

    ACL is enforced by intersecting `doc_acl` with the caller's principals inside
    the ANN query, and tenant isolation by RLS on the acquired connection.
    """

    name = "pgvector"

    async def upsert(self, conn, tenant_id, doc_id, chunk_ids, vectors, principals) -> None:
        # Chunks are already inserted by the index; attach their embeddings.
        await conn.executemany(
            "UPDATE chunks SET embedding = $2 WHERE id = $1",
            [(cid, np.asarray(vec, dtype=np.float32)) for cid, vec in zip(chunk_ids, vectors)],
        )

    async def search(self, conn, tenant_id, qvec, principals, limit) -> list[tuple[str, float]]:
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

    async def delete_doc(self, conn, tenant_id, doc_id) -> None:
        # Embeddings live in `chunks`, which is removed by the document delete cascade.
        return None


# ---- optional dedicated backend ------------------------------------------
def qdrant_filter(principals: list[str]) -> dict:
    """Payload filter: the point's `acl` list must contain one of the caller's
    principals. Returned as a plain dict so it is testable without a live server."""
    return {
        "should": [{"key": "acl", "match": {"value": p.lower()}} for p in principals],
    }


def qdrant_point(chunk_id: str, doc_id: str, vector: Any, principals: list[str], tenant: str = "") -> dict:
    return {
        "id": chunk_id,
        "vector": [float(x) for x in vector],
        "payload": {
            "chunk_id": chunk_id, "doc_id": doc_id, "tenant": tenant,
            "acl": [p.lower() for p in principals],
        },
    }


async def _tenant_from_conn(conn) -> str:
    try:
        return str(await conn.fetchval("SELECT current_setting('enaz.tenant_id', true)") or "")
    except Exception:  # noqa: BLE001
        return ""


class QdrantVectorStore:
    """Dedicated ANN backend. Postgres remains the system of record; only the
    vector index lives in Qdrant. ACL is enforced with a payload filter so the
    permission guarantee matches the pgvector path."""

    name = "qdrant"

    def __init__(self, url: str, api_key: str | None, collection: str, dim: int):
        self.url = url
        self.api_key = api_key
        self.collection = collection
        self.dim = dim
        self._client = None

    def _c(self):
        if self._client is None:
            from qdrant_client import QdrantClient  # lazy: optional dependency
            from qdrant_client.http import models as qm

            self._client = QdrantClient(url=self.url, api_key=self.api_key)
            existing = {c.name for c in self._client.get_collections().collections}
            if self.collection not in existing:
                self._client.create_collection(
                    self.collection,
                    vectors_config=qm.VectorParams(size=self.dim, distance=qm.Distance.COSINE),
                )
                # Index the acl payload for fast filtered search.
                self._client.create_payload_index(self.collection, "acl", qm.PayloadSchemaType.KEYWORD)
        return self._client

    async def upsert(self, conn, tenant_id, doc_id, chunk_ids, vectors, principals) -> None:
        import asyncio

        from qdrant_client.http import models as qm

        points = [
            qm.PointStruct(**qdrant_point(cid, doc_id, vec, principals, tenant_id or ""))
            for cid, vec in zip(chunk_ids, vectors)
        ]
        if points:
            await asyncio.to_thread(self._c().upsert, collection_name=self.collection, points=points)

    async def search(self, conn, tenant_id, qvec, principals, limit) -> list[tuple[str, float]]:
        import asyncio

        from qdrant_client.http import models as qm

        if not principals:
            return []
        tenant = tenant_id or await _tenant_from_conn(conn)
        flt = qm.Filter(
            must=[qm.FieldCondition(key="tenant", match=qm.MatchValue(value=tenant))] if tenant else [],
            should=[qm.FieldCondition(key="acl", match=qm.MatchValue(value=p.lower())) for p in principals],
        )
        res = await asyncio.to_thread(
            self._c().search, collection_name=self.collection,
            query_vector=[float(x) for x in qvec], query_filter=flt, limit=limit,
        )
        return [(str(p.payload.get("chunk_id", p.id)), float(p.score)) for p in res]

    async def delete_doc(self, conn, tenant_id, doc_id) -> None:
        import asyncio

        from qdrant_client.http import models as qm

        flt = qm.Filter(must=[qm.FieldCondition(key="doc_id", match=qm.MatchValue(value=doc_id))])
        await asyncio.to_thread(
            self._c().delete, collection_name=self.collection,
            points_selector=qm.FilterSelector(filter=flt),
        )


def build_vector_store(settings) -> VectorStore:
    backend = (getattr(settings, "vector_backend", "pgvector") or "pgvector").lower()
    if backend == "qdrant":
        return QdrantVectorStore(
            settings.qdrant_url, settings.qdrant_api_key,
            settings.qdrant_collection, settings.embedding_dim,
        )
    return PgVectorStore()
