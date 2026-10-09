"""Evaluation harness: the quality gate.

Builds a golden set from the indexed corpus (a question per sampled document whose
answer should cite that document), then measures retrieval recall@k and the
citation rate of generated answers. The admin UI runs this before shipping a
model/prompt/ranking change; a regression blocks the change.
"""

from __future__ import annotations

import json
import re

from ..db import Database
from ..retrieval.embeddings import tokenize
from ..services import Services


def _question_for(title: str, text: str) -> str:
    sentence = re.split(r"(?<=[.!?])\s+", text.strip())[0]
    terms = [t for t in tokenize(sentence) if len(t) > 4][:4]
    if terms:
        return f"What do our sources say about {' '.join(terms)}?"
    return f"What does the {title} say?"


class EvalRunner:
    def __init__(self, svc: Services):
        self.svc = svc

    async def build_golden_set(self, tenant_id: str, limit: int = 20) -> list[dict]:
        async with self.svc.db.acquire(tenant_id) as conn:
            rows = await conn.fetch(
                """SELECT d.id, d.title, c.text FROM documents d
                   JOIN chunks c ON c.doc_id = d.id AND c.ord = 0
                   ORDER BY d.updated_at DESC LIMIT $1""",
                limit,
            )
        return [{"docId": str(r["id"]), "title": r["title"], "question": _question_for(r["title"], r["text"])}
                for r in rows]

    async def run(self, tenant_id: str, principals: list[str], name: str = "Golden set") -> dict:
        golden = await self.build_golden_set(tenant_id)
        if not golden:
            return {"name": name, "questions": 0, "recallAt10": 0, "citationRate": 0, "answerRate": 0}

        recall_hits = 0
        cited = 0
        answered = 0
        async with self.svc.db.acquire(tenant_id) as conn:
            for item in golden:
                result = await self.svc.searcher.search(conn, item["question"], principals, k=10, candidates=60)
                doc_ids = {h.doc_id for h in result.hits}
                if item["docId"] in doc_ids:
                    recall_hits += 1
                if result.hits:
                    answered += 1
                    # A grounded answer would cite at least one retrieved source.
                    if any(h.doc_id == item["docId"] for h in result.hits[:5]):
                        cited += 1

        n = len(golden)
        metrics = {
            "name": name,
            "questions": n,
            "recallAt10": round(100 * recall_hits / n, 1),
            "citationRate": round(100 * cited / n, 1),
            "answerRate": round(100 * answered / n, 1),
        }
        async with self.svc.db.acquire(tenant_id) as conn:
            await conn.execute(
                "INSERT INTO eval_runs (tenant_id, name, metrics) VALUES ($1,$2,$3)",
                tenant_id, name, json.dumps(metrics),
            )
        return metrics

    async def history(self, tenant_id: str, limit: int = 10) -> list[dict]:
        async with self.svc.db.acquire(tenant_id) as conn:
            rows = await conn.fetch(
                "SELECT name, metrics, extract(epoch FROM created_at) AS created_at FROM eval_runs ORDER BY created_at DESC LIMIT $1",
                limit,
            )
        out = []
        for r in rows:
            m = r["metrics"] if isinstance(r["metrics"], dict) else json.loads(r["metrics"])
            out.append({**m, "createdAt": r["created_at"]})
        return out
