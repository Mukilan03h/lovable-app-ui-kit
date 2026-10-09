"""Answer pipeline: quick path, escalation, and deep research — all streamed.

Emits a sequence of event dicts the API serializes as SSE, matching the
assistant UI: the routing decision, a live step timeline, the answer, cited
sources, a verification summary, an optional artifact, and a cost/latency total.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, AsyncIterator

import numpy as np

from ..config import Settings
from ..db import Database
from ..decision.cache import SemanticCache
from ..decision.router import DecisionRouter, Route
from ..llm.gateway import CostLedger, LLMGateway, price_of
from ..retrieval.embeddings import Embedder
from ..retrieval.search import Hit, HybridSearcher
from ..sandbox.workspace import Workspace
from .compute import run_compute, wants_compute
from .ledger import Ledger, parse_paragraphs, verify

ANSWER_SYSTEM = (
    "You are Enaz, an enterprise knowledge assistant. Answer the question using ONLY the numbered "
    "evidence provided. Cite every factual claim with its source number like [1] or [2][3]. Lead with "
    "the direct answer in the first sentence, then the supporting detail. If the evidence does not "
    "contain the answer, say so plainly and name what is missing — never invent facts. Keep it tight: "
    "2–5 short paragraphs."
)
RESEARCH_SYSTEM = (
    "You are Enaz's deep-research analyst. Write a structured, well-organized answer using ONLY the "
    "numbered evidence. Cite every claim with [n]. Open with a one-paragraph executive summary, then "
    "organized findings. Note disagreements between sources and call out what the evidence does not "
    "cover. Never invent facts or citations."
)
PLAN_SCHEMA = {
    "type": "object",
    "properties": {"subquestions": {"type": "array", "items": {"type": "string"}}},
    "required": ["subquestions"],
    "additionalProperties": False,
}
ESCALATE_CONFIDENCE = 0.35


class AnswerService:
    def __init__(
        self,
        db: Database,
        searcher: HybridSearcher,
        embedder: Embedder,
        router: DecisionRouter,
        cache: SemanticCache,
        llm: LLMGateway,
        settings: Settings,
    ):
        self.db = db
        self.searcher = searcher
        self.embedder = embedder
        self.router = router
        self.cache = cache
        self.llm = llm
        self.settings = settings

    async def answer(
        self,
        tenant_id: str,
        principals: list[str],
        acl_key: str,
        query: str,
        *,
        mode: str = "auto",
        sources: list[str] | None = None,
        user_id: str | None = None,
        wants_artifact: str | None = None,
        allow_cache: bool = True,
        system1: bool | None = None,
        conversation_id: str | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        started = time.perf_counter()
        ledger_cost = CostLedger()
        qvec = self.embedder.embed([query], kind="query")[0]

        route = await self.router.classify(query, mode, wants_artifact, system1=system1)
        ledger_cost.cost += getattr(route, "router_cost", 0.0)
        yield {"type": "route", "route": route.public()}

        # In-chat code interpreter: if the session has data files and the question
        # needs computation, run Python over the workspace and fold the result in.
        compute_note = ""
        compute_ran = False
        if conversation_id:
            try:
                ws = Workspace(self.settings.data_dir, tenant_id, conversation_id)
                files = ws.list()
            except Exception:  # noqa: BLE001
                files = []
            if files and wants_compute(query, files):
                outcome = await run_compute(self.llm, ws, query, files, ledger_cost)
                if outcome.ran and outcome.result is not None:
                    compute_ran = True
                    yield {
                        "type": "step", "tool": "code", "label": "Ran code interpreter",
                        "detail": f"{len(files)} session file(s) · {outcome.result.duration_ms} ms"
                        + ("" if outcome.result.network_isolated else " · no net-isolation"),
                    }
                    yield {
                        "type": "compute",
                        "code": outcome.code,
                        "stdout": (outcome.result.stdout or "")[:4000],
                        "stderr": (outcome.result.stderr or "")[-1500:],
                        "ok": outcome.result.ok(),
                        "images": outcome.images,
                        "files": outcome.new_files,
                        "networkIsolated": outcome.result.network_isolated,
                    }
                    if outcome.new_files:
                        async with self.db.acquire(tenant_id) as conn:
                            for name in outcome.new_files:
                                size = (ws.root / name).stat().st_size if (ws.root / name).is_file() else 0
                                await conn.execute(
                                    """INSERT INTO session_files (tenant_id, conversation_id, name, size, source)
                                       VALUES ($1,$2,$3,$4,'generated')
                                       ON CONFLICT (conversation_id, name) DO UPDATE SET size=excluded.size""",
                                    tenant_id, conversation_id, name, size,
                                )
                    compute_note = outcome.summary
        # Computed answers depend on session files, so never serve them from cache.
        allow_cache = allow_cache and not compute_ran

        if allow_cache and route.intent in ("lookup", "question") and not route.artifact:
            cached = await self.cache.get(tenant_id, acl_key, qvec)
            if cached:
                for event in cached.get("events", []):
                    yield event
                yield {
                    "type": "done",
                    "cached": True,
                    "cost": 0.0,
                    "model": cached.get("model", route.model),
                    "confidence": cached.get("confidence", 0.0),
                    "latencyMs": int((time.perf_counter() - started) * 1000),
                }
                await self._log(tenant_id, user_id, query, route, ledger_cost, cached.get("confidence", 0.0),
                                latency_ms=int((time.perf_counter() - started) * 1000), cached=True, answered=True)
                return

        collected: list[dict[str, Any]] = []

        async def emit(event: dict[str, Any]) -> dict[str, Any]:
            if event["type"] in ("step", "answer", "sources", "verification", "artifact"):
                collected.append(event)
            return event

        if route.path == "quick":
            gen = self._quick(tenant_id, principals, query, route, ledger_cost, sources, compute_note)
        else:
            gen = self._research(tenant_id, principals, query, route, ledger_cost, sources, user_id,
                                 compute_note=compute_note)

        confidence = 0.0
        answered = True
        async for event in gen:
            if event.get("type") == "_meta":
                confidence = event.get("confidence", confidence)
                answered = event.get("answered", answered)
                continue
            yield await emit(event)

        latency_ms = int((time.perf_counter() - started) * 1000)
        baseline = price_of(self.settings.model_deep, max(ledger_cost.input_tokens, 4000), max(ledger_cost.output_tokens, 400))
        yield {
            "type": "done",
            "cached": False,
            "cost": round(ledger_cost.cost, 6),
            "baselineCost": round(baseline, 6),
            "model": route.model,
            "confidence": confidence,
            "inputTokens": ledger_cost.input_tokens,
            "outputTokens": ledger_cost.output_tokens,
            "latencyMs": latency_ms,
        }

        if allow_cache and answered and route.intent in ("lookup", "question") and confidence >= ESCALATE_CONFIDENCE:
            await self.cache.put(tenant_id, acl_key, query, qvec,
                                 {"events": collected, "model": route.model, "confidence": confidence})
        await self._log(tenant_id, user_id, query, route, ledger_cost, confidence, latency_ms, cached=False, answered=answered)

    # ---- quick path -------------------------------------------------------

    async def _quick(self, tenant_id, principals, query, route, cost, sources, compute_note: str = "") -> AsyncIterator[dict[str, Any]]:
        yield {"type": "step", "tool": "search", "label": "Searched knowledge", "detail": "hybrid retrieval"}
        async with self.db.acquire(tenant_id) as conn:
            result = await self.searcher.search(conn, query, principals, k=8, sources=sources)
        yield {
            "type": "step", "tool": "search",
            "label": f"Searched {int(result.signals.get('candidates', 0))} candidates",
            "detail": f"{len(result.hits)} relevant · confidence {result.confidence:.0%}",
        }

        if route.intent != "lookup" and result.confidence < ESCALATE_CONFIDENCE and route.path == "quick":
            yield {"type": "step", "tool": "plan", "label": "Escalated to deep research", "detail": "low confidence"}
            route.path = "agent"
            route.model = self.settings.model_deep
            async for e in self._research(tenant_id, principals, query, route, cost, sources, None,
                                          prefetched=result.hits, compute_note=compute_note):
                yield e
            return

        if not result.hits:
            if compute_note:
                # No documents, but the code interpreter produced a result — answer from it.
                ledger = Ledger.from_hits([])
                async for e in self._synthesize(query, ledger, route, cost, ANSWER_SYSTEM,
                                                max_tokens=1000, effort=route.effort, compute_note=compute_note):
                    yield e
                yield {"type": "_meta", "confidence": 0.6, "answered": True}
                return
            yield {"type": "answer", "text": "I couldn't find anything you have access to that answers this.",
                   "paragraphs": [{"text": "I couldn't find anything you have access to that answers this.", "cites": []}]}
            yield {"type": "sources", "sources": []}
            yield {"type": "_meta", "confidence": 0.0, "answered": False}
            return

        ledger = Ledger.from_hits(result.hits)
        async for e in self._synthesize(query, ledger, route, cost, ANSWER_SYSTEM, max_tokens=1200,
                                        effort=route.effort, compute_note=compute_note):
            yield e
        yield {"type": "_meta", "confidence": result.confidence, "answered": True}

    # ---- research path ----------------------------------------------------

    async def _research(
        self, tenant_id, principals, query, route, cost, sources, user_id, prefetched: list[Hit] | None = None,
        compute_note: str = "",
    ) -> AsyncIterator[dict[str, Any]]:
        subquestions = await self._plan(query, cost)
        yield {"type": "step", "tool": "plan", "label": "Planned research",
               "detail": f"{len(subquestions)} line(s): " + "; ".join(q[:40] for q in subquestions)}

        hits_by_id: dict[str, Hit] = {}
        for h in prefetched or []:
            hits_by_id[h.chunk_id] = h

        async def run_search(q: str) -> list[Hit]:
            async with self.db.acquire(tenant_id) as conn:
                return (await self.searcher.search(conn, q, principals, k=6, sources=sources, candidates=80)).hits

        results = await asyncio.gather(*(run_search(q) for q in subquestions))
        for q, hits in zip(subquestions, results):
            for h in hits:
                hits_by_id.setdefault(h.chunk_id, h)
            yield {"type": "step", "tool": "search", "label": "Searched sources",
                   "detail": f"“{q[:48]}” · {len(hits)} hits"}

        merged = sorted(hits_by_id.values(), key=lambda h: h.score, reverse=True)[:14]
        docs = len({h.doc_id for h in merged})
        yield {"type": "step", "tool": "read", "label": f"Read {docs} documents",
               "detail": f"{len(merged)} passages loaded"}

        owners = sorted({h.owner for h in merged[:6] if h.owner})
        if owners:
            yield {"type": "step", "tool": "graph", "label": "Resolved owners",
                   "detail": ", ".join(owners[:3])}

        if not merged:
            if compute_note:
                ledger = Ledger.from_hits([])
                async for e in self._synthesize(query, ledger, route, cost, RESEARCH_SYSTEM,
                                                max_tokens=1400, effort="high", compute_note=compute_note):
                    yield e
                yield {"type": "_meta", "confidence": 0.6, "answered": True}
                return
            yield {"type": "answer", "text": "I couldn't find enough in your sources to research this.",
                   "paragraphs": [{"text": "I couldn't find enough in your sources to research this.", "cites": []}]}
            yield {"type": "sources", "sources": []}
            yield {"type": "_meta", "confidence": 0.0, "answered": False}
            return

        ledger = Ledger.from_hits(merged)
        async for e in self._synthesize(query, ledger, route, cost, RESEARCH_SYSTEM, max_tokens=2600,
                                        effort="high", include_parent=True, compute_note=compute_note):
            yield e

        if route.artifact:
            yield {"type": "step", "tool": "artifact", "label": "Created artifact",
                   "detail": f"{route.artifact}"}
            artifact_event = await self._make_artifact(tenant_id, user_id, query, route.artifact, ledger, cost)
            if artifact_event:
                yield artifact_event

        # Research confidence from evidence breadth.
        conf = min(1.0, 0.4 + 0.1 * docs)
        yield {"type": "_meta", "confidence": round(conf, 3), "answered": True}

    # ---- synthesis + verification ----------------------------------------

    async def _synthesize(
        self, query, ledger: Ledger, route: Route, cost: CostLedger, system: str,
        *, max_tokens: int, effort: str, include_parent: bool = False, compute_note: str = ""
    ) -> AsyncIterator[dict[str, Any]]:
        evidence = ledger.prompt_block(include_parent)
        compute_block = (
            f"\n\nComputed results from the code interpreter (ran over the session's files; "
            f"treat these numbers as ground truth and reference them directly):\n{compute_note}\n"
            if compute_note else ""
        )
        prompt = (
            f"Question: {query}\n\nEvidence:\n{evidence}{compute_block}\n\n"
            "Write the answer now, citing sources with [n]."
        )
        if compute_note and self.llm.offline:
            # Offline: the extractive engine keys on [n] evidence markers and would
            # ignore the computed block, so present the computed result directly and
            # append any supporting document sentence the engine can ground.
            answer = _offline_compute_answer(self.llm, query, compute_note, prompt, system)
        else:
            result = await self.llm.complete(route.model, system, prompt, effort=effort, max_tokens=max_tokens)
            cost.add(result)
            answer = result.text.strip() or "I couldn't find anything you have access to that answers this."

        # Stream the answer in word batches for a live feel (offline or online).
        words = answer.split(" ")
        for i in range(0, len(words), 6):
            yield {"type": "delta", "text": " ".join(words[i : i + 6]) + (" " if i + 6 < len(words) else "")}
            await asyncio.sleep(0)

        yield {"type": "answer", "text": answer, "paragraphs": parse_paragraphs(answer)}
        yield {"type": "sources", "sources": ledger.sources_payload()}

        v = verify(answer, ledger, self.embedder)
        yield {"type": "verification", **v.payload()}

    async def _plan(self, query: str, cost: CostLedger) -> list[str]:
        if self.llm.offline:
            return [query]
        result = await self.llm.complete(
            self.settings.model_small,
            system=("Break the user's request into 2–4 focused sub-questions that together answer it. "
                    "Return only the sub-questions."),
            user=f"Request: {query}",
            effort="low", max_tokens=300, output_schema=PLAN_SCHEMA, fallbacks=False,
        )
        cost.add(result)
        subs = (result.parsed or {}).get("subquestions") if result.parsed else None
        subs = [s for s in (subs or []) if isinstance(s, str) and s.strip()][:4]
        return subs or [query]

    async def _make_artifact(self, tenant_id, user_id, query, kind, ledger: Ledger, cost: CostLedger):
        from ..artifacts.service import ArtifactService

        svc = ArtifactService(self.db, self.llm, self.settings)
        try:
            artifact = await svc.generate(tenant_id, user_id, query, kind, ledger, cost)
        except Exception:
            return None
        return {"type": "artifact", "artifactId": artifact["id"], "kind": kind, "title": artifact["title"]}

    async def _log(self, tenant_id, user_id, query, route: Route, cost: CostLedger, confidence, latency_ms, cached, answered):
        baseline = price_of(self.settings.model_deep, max(cost.input_tokens, 4000), max(cost.output_tokens, 400))
        async with self.db.acquire(tenant_id) as conn:
            await conn.execute(
                """INSERT INTO query_log (tenant_id, user_id, query, normalized, path, model, input_tokens,
                        output_tokens, cost, baseline_cost, latency_ms, confidence, answered, cached)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)""",
                tenant_id, user_id, query, query.lower().strip(), route.path, route.model,
                cost.input_tokens, cost.output_tokens, cost.cost, baseline, latency_ms,
                float(confidence), answered, cached,
            )


def _offline_compute_answer(llm: LLMGateway, query: str, compute_note: str, prompt: str, system: str) -> str:
    """Grounded answer for offline mode when the code interpreter produced a result.

    Leads with the computed figures (ground truth from the sandbox), then appends
    the best supporting document sentence the extractive engine can cite, if any.
    """
    lines = [ln.rstrip() for ln in compute_note.splitlines() if ln.strip()]
    head = "\n".join(lines[:12])
    answer = (
        "Here is what the code interpreter computed over the files in this session:\n\n"
        f"{head}\n\n"
        "These figures come from running Python directly on your session files, so they "
        "reflect the current data rather than a retrieved snapshot."
    )
    # If there is retrievable document evidence, add one grounded, cited sentence.
    extractive = llm._offline_complete("offline", system, prompt, None).text.strip()  # noqa: SLF001
    if extractive and "could not find" not in extractive.lower() and "[" in extractive:
        answer += "\n\nSupporting context from your documents: " + extractive
    return answer
