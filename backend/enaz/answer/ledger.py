"""Evidence ledger and claim verifier.

The ledger numbers the retrieved evidence [1..n] and maps each number back to its
document. The verifier checks that every cited sentence is actually supported by
the evidence it cites — unsupported sentences are flagged, which is what lets the
UI show "7/7 claims verified" and keeps the model honest.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

import numpy as np

from ..retrieval.embeddings import Embedder, _stem, tokenize
from ..retrieval.search import Hit

CITE_RE = re.compile(r"\[(\d+)\]")
SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(\[])")


@dataclass
class Evidence:
    n: int
    hit: Hit

    def prompt_line(self, include_parent: bool = False) -> str:
        body = self.hit.parent_text if include_parent and self.hit.parent_text else self.hit.text
        return f"[{self.n}] ({self.hit.title} — {self.hit.source}) {body}"


@dataclass
class Ledger:
    items: list[Evidence] = field(default_factory=list)

    @classmethod
    def from_hits(cls, hits: list[Hit]) -> "Ledger":
        return cls([Evidence(i + 1, h) for i, h in enumerate(hits)])

    def by_n(self, n: int) -> Evidence | None:
        return self.items[n - 1] if 1 <= n <= len(self.items) else None

    def prompt_block(self, include_parent: bool = False) -> str:
        return "\n".join(e.prompt_line(include_parent) for e in self.items)

    def sources_payload(self) -> list[dict]:
        seen: dict[str, int] = {}
        out = []
        for e in self.items:
            key = e.hit.doc_id
            if key in seen:
                continue
            seen[key] = e.n
            out.append({"n": e.n, **e.hit.public()})
        return out


@dataclass
class Claim:
    text: str
    cites: list[int]
    supported: bool
    score: float


@dataclass
class Verification:
    claims: list[Claim]

    @property
    def total(self) -> int:
        return len([c for c in self.claims if c.cites])

    @property
    def supported(self) -> int:
        return len([c for c in self.claims if c.cites and c.supported])

    @property
    def unsupported(self) -> list[str]:
        return [c.text for c in self.claims if c.cites and not c.supported]

    def payload(self) -> dict:
        return {"total": self.total, "supported": self.supported, "unsupported": self.unsupported}


def parse_paragraphs(answer: str) -> list[dict]:
    paras = []
    for block in re.split(r"\n{2,}", answer.strip()):
        block = block.strip()
        if not block:
            continue
        cites = sorted({int(n) for n in CITE_RE.findall(block)})
        paras.append({"text": block, "cites": cites})
    return paras


def verify(answer: str, ledger: Ledger, embedder: Embedder) -> Verification:
    sentences = [s.strip() for s in SENTENCE_SPLIT.split(answer.strip()) if s.strip()]
    claims: list[Claim] = []
    for sentence in sentences:
        cites = sorted({int(n) for n in CITE_RE.findall(sentence)})
        if not cites:
            claims.append(Claim(sentence, [], True, 1.0))
            continue
        clean = CITE_RE.sub("", sentence)
        best = 0.0
        for n in cites:
            ev = ledger.by_n(n)
            if not ev:
                continue
            best = max(best, _support(clean, ev.hit.text + " " + ev.hit.context, embedder))
        claims.append(Claim(sentence, cites, best >= 0.3, round(best, 3)))
    return Verification(claims)


def _support(sentence: str, evidence: str, embedder: Embedder) -> float:
    s_terms = {_stem(t) for t in tokenize(sentence)}
    e_terms = {_stem(t) for t in tokenize(evidence)}
    if not s_terms:
        return 1.0
    lexical = len(s_terms & e_terms) / len(s_terms)
    vecs = embedder.embed([sentence, evidence])
    semantic = float(np.dot(vecs[0], vecs[1]))
    return max(lexical, semantic)
