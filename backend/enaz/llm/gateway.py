"""LLM gateway: provider abstraction, prompt caching, fallbacks and cost accounting.

Uses the Anthropic SDK when a credential is available; otherwise an offline
extractive engine answers from the retrieved evidence so the whole product works
without a key (useful for air-gapped installs, CI and local demos).
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from typing import Any

# Per-million-token prices (USD), used for the cost ledger and the baseline
# "what naive single-Opus RAG would cost" comparison.
PRICES: dict[str, tuple[float, float]] = {
    "claude-opus-5-5": (4.0, 20.0),
    "claude-sonnet-5-5": (2.0, 10.0),
    "claude-haiku-5-5": (0.10, 0.50),
    "claude-opus-5": (5.0, 25.0),
}
CACHE_READ_DISCOUNT = 0.1  # cached input tokens bill at ~10%


@dataclass
class LLMResult:
    text: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    cached_tokens: int = 0
    cost: float = 0.0
    refused: bool = False
    offline: bool = False
    raw: Any = None
    parsed: Any = None


@dataclass
class CostLedger:
    input_tokens: int = 0
    output_tokens: int = 0
    cost: float = 0.0
    calls: int = 0
    by_model: dict[str, int] = field(default_factory=dict)

    def add(self, r: LLMResult) -> None:
        self.input_tokens += r.input_tokens
        self.output_tokens += r.output_tokens
        self.cost += r.cost
        self.calls += 1
        self.by_model[r.model] = self.by_model.get(r.model, 0) + 1


def price_of(model: str, input_tokens: int, output_tokens: int, cached_tokens: int = 0) -> float:
    pin, pout = PRICES.get(model, PRICES["claude-sonnet-5-5"])
    billable_in = max(0, input_tokens - cached_tokens)
    return (
        billable_in * pin / 1e6
        + cached_tokens * pin * CACHE_READ_DISCOUNT / 1e6
        + output_tokens * pout / 1e6
    )


class LLMGateway:
    def __init__(self, offline: bool | None = None):
        self._client = None
        self._has_key = bool(
            os.environ.get("ANTHROPIC_API_KEY")
            or os.environ.get("ANTHROPIC_AUTH_TOKEN")
            or os.environ.get("ANTHROPIC_BASE_URL")
        )
        self.offline = (not self._has_key) if offline is None else offline
        if not self.offline:
            try:
                import anthropic

                self._client = anthropic.AsyncAnthropic()
            except Exception:
                self.offline = True

    # ---- text completion --------------------------------------------------

    async def complete(
        self,
        model: str,
        system: str,
        user: str,
        *,
        effort: str = "medium",
        max_tokens: int = 2048,
        cache_system: bool = True,
        output_schema: dict | None = None,
        fallbacks: bool = True,
    ) -> LLMResult:
        if self.offline or self._client is None:
            return self._offline_complete(model, system, user, output_schema)

        system_block: Any = system
        if cache_system:
            system_block = [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]

        kwargs: dict[str, Any] = {
            "model": model,
            "max_tokens": max_tokens,
            "system": system_block,
            "messages": [{"role": "user", "content": user}],
            "output_config": {"effort": effort},
        }
        betas: list[str] = []
        # Server-side fallback is only wired for the models that support it.
        if fallbacks and model in {"claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"}:
            kwargs["fallbacks"] = "default"
            betas.append("server-side-fallback-2026-07-01")
        if output_schema is not None:
            kwargs["output_config"]["format"] = {"type": "json_schema", "schema": output_schema}

        try:
            if betas:
                resp = await self._client.beta.messages.create(betas=betas, **kwargs)
            else:
                resp = await self._client.messages.create(**kwargs)
        except Exception as exc:  # noqa: BLE001 - degrade to offline on any API failure
            result = self._offline_complete(model, system, user, output_schema)
            result.raw = {"error": str(exc)}
            return result

        text = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text")
        usage = resp.usage
        cached = int(getattr(usage, "cache_read_input_tokens", 0) or 0)
        served_model = getattr(resp, "model", model)
        refused = getattr(resp, "stop_reason", None) == "refusal"
        result = LLMResult(
            text=text,
            model=served_model,
            input_tokens=int(usage.input_tokens or 0) + cached,
            output_tokens=int(usage.output_tokens or 0),
            cached_tokens=cached,
            refused=refused,
            raw=resp,
        )
        result.cost = price_of(served_model, result.input_tokens, result.output_tokens, cached)
        if output_schema is not None and text and not refused:
            try:
                result.parsed = json.loads(text)
            except json.JSONDecodeError:
                result.parsed = None
        return result

    # ---- offline extractive engine ---------------------------------------

    def _offline_complete(self, model: str, system: str, user: str, output_schema: dict | None) -> LLMResult:
        """Deterministic answer built from the evidence embedded in the prompt.

        The answer pipeline passes numbered evidence as ``[n] text`` lines; this
        engine selects the lines most relevant to the question and stitches a
        grounded, cited paragraph — no external call, no fabrication.
        """
        from ..retrieval.embeddings import _stem, tokenize

        if output_schema is not None:
            return LLMResult(text=_offline_structured(user, output_schema), model="offline", offline=True, parsed=None)

        question = _extract_question(user)
        q_terms = {_stem(t) for t in tokenize(question)}
        evidence = _extract_evidence(user)
        scored: list[tuple[float, int, str]] = []
        for idx, text in evidence:
            terms = {_stem(t) for t in tokenize(text)}
            overlap = len(q_terms & terms) / (len(q_terms) or 1)
            scored.append((overlap, idx, text))
        scored.sort(reverse=True)
        picked = [(idx, text) for score, idx, text in scored[:3] if score > 0] or [(i, t) for i, t in evidence[:2]]

        sentences: list[str] = []
        for idx, text in picked:
            first = _first_sentences(text, 2)
            sentences.append(f"{first} [{idx}]")
        if not sentences:
            body = "I could not find anything in the sources you can access that answers this."
        else:
            body = " ".join(sentences)
        return LLMResult(text=body, model="offline", offline=True)


def _extract_question(user: str) -> str:
    m = re.search(r"(?:Question|Request):\s*(.+?)(?:\n\n|\Z)", user, re.S)
    return (m.group(1) if m else user).strip()[:500]


def _extract_evidence(user: str) -> list[tuple[int, str]]:
    out: list[tuple[int, str]] = []
    for m in re.finditer(r"\[(\d+)\]\s*(.+?)(?=\n\[\d+\]|\Z)", user, re.S):
        body = re.sub(r"\s+", " ", m.group(2)).strip()
        body = re.sub(r"^\([^)]*\)\s*", "", body)  # drop leading "(title — source)" metadata
        out.append((int(m.group(1)), body))
    return out


def _first_sentences(text: str, n: int) -> str:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return " ".join(parts[:n]).strip()


def _offline_structured(user: str, schema: dict) -> str:
    """Best-effort JSON matching a schema, for the router/verifier when offline."""
    props = schema.get("properties", {})
    out: dict[str, Any] = {}
    for key, spec in props.items():
        t = spec.get("type")
        if "enum" in spec:
            out[key] = spec["enum"][0]
        elif t == "boolean":
            out[key] = True
        elif t == "number":
            out[key] = 0.0
        elif t == "array":
            out[key] = []
        else:
            out[key] = ""
    return json.dumps(out)
