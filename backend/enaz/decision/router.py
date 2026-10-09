"""Decision layer: a cheap model/heuristic that routes each query.

This is the cost lever. Instead of sending every question to a large model, a
fast classifier decides intent → path → model → effort. Roughly 70% of traffic
takes the one-shot "quick" path on a small/standard model; only hard or
multi-step questions escalate to deep research on the large model. The result is
3–5× lower cost per answer than naive single-model RAG, which the insights page
quantifies against a baseline.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from ..config import Settings
from ..llm.gateway import LLMGateway

ARTIFACT_RE = {
    "slides": re.compile(r"\b(deck|slides?|presentation|ppt|pptx|powerpoint)\b", re.I),
    "sheet": re.compile(r"\b(spreadsheet|excel|xlsx|sheet|table of|csv|export .*(?:data|numbers))\b", re.I),
    "doc": re.compile(r"\b(memo|report|document|docx|word doc|write[- ]?up|draft a|brief)\b", re.I),
}
RESEARCH_RE = re.compile(
    r"\b(research|in[- ]?depth|comprehensive|deep dive|compare|comparison|analy[sz]e|analysis|"
    r"across (?:all|every)|trends?|landscape|pros and cons|trade[- ]?offs?|investigate|root cause)\b",
    re.I,
)
LOOKUP_RE = re.compile(r"^(who|what|when|where|which|how many|how much|is|are|does|do|did|can)\b", re.I)
ACTION_RE = re.compile(r"\b(send|post|create (?:a )?(?:ticket|issue|event)|schedule|email|notify|assign|update the)\b", re.I)


@dataclass
class Route:
    intent: str                 # lookup | question | research | action | create
    path: str                   # quick | agent
    model: str
    effort: str                 # low | medium | high | xhigh
    artifact: str | None = None
    reason: str = ""
    by: str = "heuristic"

    def public(self) -> dict:
        return {
            "intent": self.intent,
            "path": self.path,
            "model": self.model,
            "effort": self.effort,
            "artifact": self.artifact,
            "reason": self.reason,
            "decidedBy": self.by,
        }


_SCHEMA = {
    "type": "object",
    "properties": {
        "intent": {"type": "string", "enum": ["lookup", "question", "research", "action", "create"]},
        "artifact": {"type": "string", "enum": ["slides", "doc", "sheet", "none"]},
        "reason": {"type": "string"},
    },
    "required": ["intent", "artifact", "reason"],
    "additionalProperties": False,
}


class DecisionRouter:
    def __init__(self, llm: LLMGateway, settings: Settings):
        self.llm = llm
        self.settings = settings

    def heuristic(self, query: str, mode: str = "auto", wants_artifact: str | None = None) -> Route:
        artifact = wants_artifact
        if not artifact:
            for kind, rx in ARTIFACT_RE.items():
                if rx.search(query):
                    artifact = kind
                    break
        if mode == "quick":
            return self._route("question", artifact, "forced quick mode")
        if mode == "research":
            return self._route("research", artifact, "forced research mode")
        if mode == "agent":
            return self._route("action", artifact, "forced agent mode")

        if artifact:
            intent = "create"
        elif ACTION_RE.search(query):
            intent = "action"
        elif RESEARCH_RE.search(query) or len(query.split()) > 28 or query.count("?") > 1:
            intent = "research"
        elif LOOKUP_RE.match(query.strip()) and len(query.split()) <= 12:
            intent = "lookup"
        else:
            intent = "question"
        return self._route(intent, artifact, "pattern match")

    def _route(self, intent: str, artifact: str | None, reason: str, by: str = "heuristic") -> Route:
        if intent in ("research", "create", "action"):
            path, model, effort = "agent", self.settings.model_deep, "high"
        elif intent == "lookup":
            path, model, effort = "quick", self.settings.model_standard, "low"
        else:
            path, model, effort = "quick", self.settings.model_standard, "medium"
        return Route(intent, path, model, effort, artifact if artifact != "none" else None, reason, by)

    async def classify(
        self,
        query: str,
        mode: str = "auto",
        wants_artifact: str | None = None,
        *,
        system1: bool | None = None,
    ) -> Route:
        """Auto mode uses the small model for intent; forced modes skip it.

        ``system1`` is the Laya fast-decision toggle. When enabled, routing is a
        pure zero-token heuristic ("System 1" / fast thinking) and we never spend
        a small-model call to classify intent — cutting per-query cost further and
        shaving ~200-400ms of router latency. When disabled, auto mode consults
        the small model ("System 2") for sharper intent detection on ambiguous
        queries. Defaults to the workspace/config default when ``None``.
        """
        if system1 is None:
            system1 = self.settings.laya_system1_default
        base = self.heuristic(query, mode, wants_artifact)
        if system1:
            base.reason = base.reason or "laya system-1 (zero-token heuristic)"
            base.by = "laya-system1"
            return base
        if mode != "auto" or self.llm.offline:
            return base
        result = await self.llm.complete(
            self.settings.model_small,
            system=(
                "You are a query router for an enterprise knowledge assistant. Classify the user's "
                "request. 'lookup' = one quick fact; 'question' = needs a short synthesized answer; "
                "'research' = multi-step, comparison, or spans many documents; 'action' = asks to take "
                "an action in another app; 'create' = asks for a slide deck, document, or spreadsheet. "
                "Set artifact to slides/doc/sheet only when a file is clearly requested, else none."
            ),
            user=f"Request: {query}",
            effort="low",
            max_tokens=200,
            output_schema=_SCHEMA,
            fallbacks=False,
        )
        if not result.parsed:
            return base
        intent = result.parsed.get("intent", base.intent)
        artifact = result.parsed.get("artifact", "none")
        if wants_artifact:
            artifact = wants_artifact
        route = self._route(intent, artifact, result.parsed.get("reason", "")[:200], by="router-model")
        route.router_cost = result.cost  # type: ignore[attr-defined]
        return route
