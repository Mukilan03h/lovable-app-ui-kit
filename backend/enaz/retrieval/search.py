"""Hybrid search: FTS + vectors fused with RRF, reranked, boosted, diversified."""

from __future__ import annotations

import math
import time
from dataclasses import dataclass, field
from typing import Any

import asyncpg
import httpx

from .embeddings import Embedder, _stem, tokenize
from .index import DocumentIndex

RRF_K = 60


@dataclass
class Hit:
    chunk_id: str
    doc_id: str
    title: str
    source: str
    url: str | None
    path: str
    doc_type: str
    owner: str
    updated_at: float
    section: str
    text: str
    context: str
    parent_text: str
    score: float
    signals: dict[str, float] = field(default_factory=dict)

    def public(self, snippet_len: int = 320) -> dict[str, Any]:
        snippet = self.text if len(self.text) <= snippet_len else self.text[: snippet_len - 1].rsplit(" ", 1)[0] + "…"
        return {
            "chunkId": self.chunk_id,
            "docId": self.doc_id,
            "title": self.title,
            "source": self.source,
            "url": self.url,
            "path": self.path,
            "type": self.doc_type,
            "owner": self.owner,
            "updatedAt": self.updated_at,
            "section": self.section,
            "snippet": snippet,
            "score": round(self.score, 4),
        }


@dataclass
class SearchResult:
    hits: list[Hit]
    confidence: float
    signals: dict[str, float]
    latency_ms: int


class LocalReranker:
    """Cross-feature reranker: term coverage, phrase/proximity, title match and cosine.

    Cheap and dependency-free. Swap for a hosted cross-encoder (Cohere / Voyage)
    with ENAZ_RERANK_PROVIDER for higher precision.
    """

    name = "local"

    def score(self, query: str, hits: list[Hit], cosines: dict[str, float]) -> list[float]:
        q_terms = [_stem(t) for t in tokenize(query)]
        q_set = set(q_terms)
        out = []
        for h in hits:
            body_terms = [_stem(t) for t in tokenize(h.text)]
            ctx_terms = {_stem(t) for t in tokenize(f"{h.title} {h.context} {h.section}")}
            body_set = set(body_terms)
            coverage = len(q_set & (body_set | ctx_terms)) / max(1, len(q_set))
            title_cov = len(q_set & {_stem(t) for t in tokenize(h.title)}) / max(1, len(q_set))
            proximity = _proximity(q_terms, body_terms)
            cos = max(0.0, cosines.get(h.chunk_id, 0.0))
            out.append(0.45 * coverage + 0.15 * title_cov + 0.15 * proximity + 0.25 * cos)
        return out


class CohereReranker:
    name = "cohere"

    def __init__(self, api_key: str, model: str = "rerank-v3.5"):
        self.api_key = api_key
        self.model = model
        self._client = httpx.Client(timeout=30)

    def score(self, query: str, hits: list[Hit], cosines: dict[str, float]) -> list[float]:
        resp = self._client.post(
            "https://api.cohere.com/v2/rerank",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={"model": self.model, "query": query, "documents": [f"{h.title}\n{h.text}" for h in hits]},
        )
        resp.raise_for_status()
        scores = [0.0] * len(hits)
        for item in resp.json()["results"]:
            scores[item["index"]] = float(item["relevance_score"])
        return scores


def _proximity(q_terms: list[str], body: list[str]) -> float:
    """1.0 when all query terms appear within a short window, decaying with distance."""
    wanted = set(q_terms)
    if len(wanted) < 2 or not body:
        return 1.0 if wanted & set(body) else 0.0
    positions = [(i, t) for i, t in enumerate(body) if t in wanted]
    best = math.inf
    left = 0
    counts: dict[str, int] = {}
    present = wanted & {t for _, t in positions}
    for right, (pos, term) in enumerate(positions):
        counts[term] = counts.get(term, 0) + 1
        while len([k for k, v in counts.items() if v > 0]) == len(present):
            best = min(best, pos - positions[left][0] + 1)
            lt = positions[left][1]
            counts[lt] -= 1
            left += 1
    if best is math.inf:
        return 0.0
    coverage = len(present) / len(wanted)
    return coverage * min(1.0, 8 / best)


class HybridSearcher:
    def __init__(self, index: DocumentIndex, embedder: Embedder, reranker: Any | None = None):
        self.index = index
        self.embedder = embedder
        self.reranker = reranker or LocalReranker()

    async def search(
        self,
        conn: asyncpg.Connection,
        query: str,
        principals: list[str],
        k: int = 8,
        sources: list[str] | None = None,
        doc_types: list[str] | None = None,
        candidates: int = 60,
        per_doc: int = 2,
        connector_ids: list[str] | None = None,
    ) -> SearchResult:
        started = time.perf_counter()
        if not principals:
            return SearchResult([], 0.0, {"candidates": 0}, 0)

        qvec = self.embedder.embed([query], kind="query")[0]
        kw = await self.index.keyword_search(conn, query, principals, candidates)
        vec = await self.index.vector_search(conn, qvec, principals, candidates)

        fused: dict[str, float] = {}
        for rank, (cid, _) in enumerate(kw):
            fused[cid] = fused.get(cid, 0.0) + 1.0 / (RRF_K + rank + 1)
        for rank, (cid, _) in enumerate(vec):
            fused[cid] = fused.get(cid, 0.0) + 1.0 / (RRF_K + rank + 1)
        cosines = dict(vec)
        bm25 = dict(kw)

        ordered = sorted(fused, key=fused.get, reverse=True)[: max(30, k * 4)]
        rows = await self.index.get_chunks(conn, ordered)
        hits = []
        for cid in ordered:
            r = rows.get(cid)
            if not r:
                continue
            if sources and r["source"] not in sources:
                continue
            if doc_types and r["doc_type"] not in doc_types:
                continue
            if connector_ids and r.get("connector_id") not in connector_ids:
                continue
            hits.append(
                Hit(
                    chunk_id=cid, doc_id=r["doc_id"], title=r["title"], source=r["source"], url=r["url"],
                    path=r["path"] or "", doc_type=r["doc_type"], owner=r["owner"] or "",
                    updated_at=float(r["updated_at"] or 0), section=r["section"] or "", text=r["text"],
                    context=r["context"] or "", parent_text=r["parent_text"] or "", score=fused[cid],
                )
            )
        if not hits:
            return SearchResult([], 0.0, {"candidates": 0}, int((time.perf_counter() - started) * 1000))

        rerank = self.reranker.score(query, hits, cosines)
        max_rrf = max(h.score for h in hits)
        now = time.time()
        for h, rr in zip(hits, rerank):
            age_days = max(0.0, (now - h.updated_at) / 86400)
            recency = 0.5 ** (age_days / 180)
            h.signals = {
                "rerank": round(rr, 4),
                "rrf": round(h.score / max_rrf, 4),
                "cosine": round(cosines.get(h.chunk_id, 0.0), 4),
                "bm25": round(bm25.get(h.chunk_id, 0.0), 4),
                "recency": round(recency, 4),
            }
            h.score = 0.7 * rr + 0.22 * (h.score / max_rrf) + 0.08 * recency

        hits.sort(key=lambda h: h.score, reverse=True)
        diversified = _diversify(hits, k, per_doc)
        confidence, signals = _confidence(query, diversified)
        signals["candidates"] = float(len(fused))
        return SearchResult(diversified, confidence, signals, int((time.perf_counter() - started) * 1000))


def _diversify(hits: list[Hit], k: int, per_doc: int) -> list[Hit]:
    out: list[Hit] = []
    seen: dict[str, int] = {}
    for h in hits:
        if seen.get(h.doc_id, 0) >= per_doc:
            continue
        seen[h.doc_id] = seen.get(h.doc_id, 0) + 1
        out.append(h)
        if len(out) == k:
            break
    return out


def _confidence(query: str, hits: list[Hit]) -> tuple[float, dict[str, float]]:
    """How well the evidence covers the question: drives the decision layer's escalation."""
    if not hits:
        return 0.0, {"top": 0.0, "coverage": 0.0, "docs": 0.0}
    q_set = {_stem(t) for t in tokenize(query)}
    covered: set[str] = set()
    for h in hits[:5]:
        covered |= q_set & {_stem(t) for t in tokenize(f"{h.title} {h.context} {h.text}")}
    coverage = len(covered) / max(1, len(q_set))
    top = hits[0].signals.get("rerank", 0.0)
    docs = len({h.doc_id for h in hits[:5]})
    confidence = max(0.0, min(1.0, 0.55 * coverage + 0.45 * min(1.0, top / 0.6)))
    return round(confidence, 3), {"top": round(top, 3), "coverage": round(coverage, 3), "docs": float(docs)}

