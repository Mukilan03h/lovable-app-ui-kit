"""Semantic answer cache, scoped by the asker's permission set.

Two users with different access can ask the same words and must not share a
cached answer (the evidence differs). So the cache key is (tenant, acl_key), and
within that bucket we match on query-embedding cosine similarity.
"""

from __future__ import annotations

import json
from typing import Any

import numpy as np

from ..db import Database

SIMILARITY_THRESHOLD = 0.96


class SemanticCache:
    def __init__(self, db: Database, ttl_seconds: int = 3600):
        self.db = db
        self.ttl = ttl_seconds

    async def get(self, tenant_id: str, acl_key: str, qvec: np.ndarray) -> dict[str, Any] | None:
        async with self.db.acquire(tenant_id) as conn:
            row = await conn.fetchrow(
                """SELECT payload, 1 - (embedding <=> $1) AS sim
                   FROM answer_cache
                   WHERE acl_key = $2 AND created_at > now() - make_interval(secs => $3)
                   ORDER BY embedding <=> $1 LIMIT 1""",
                np.asarray(qvec, dtype=np.float32), acl_key, self.ttl,
            )
        if row and float(row["sim"]) >= SIMILARITY_THRESHOLD:
            payload = row["payload"]
            return json.loads(payload) if isinstance(payload, str) else payload
        return None

    async def put(self, tenant_id: str, acl_key: str, query: str, qvec: np.ndarray, payload: dict[str, Any]) -> None:
        async with self.db.acquire(tenant_id) as conn:
            await conn.execute(
                "INSERT INTO answer_cache (tenant_id, acl_key, query, embedding, payload) VALUES ($1,$2,$3,$4,$5)",
                tenant_id, acl_key, query, np.asarray(qvec, dtype=np.float32), json.dumps(payload, default=str),
            )
            # Keep the per-bucket cache bounded.
            await conn.execute(
                """DELETE FROM answer_cache WHERE id IN (
                     SELECT id FROM answer_cache WHERE acl_key = $1
                     ORDER BY created_at DESC OFFSET 500)""",
                acl_key,
            )
