"""Structure-aware chunking with contextual headers.

Each chunk keeps (a) its own text for precise matching, (b) a short context header
(document title, location, section and a one-line document summary) that is indexed
with it, and (c) its parent section text so the answer step can read a fuller span.
Prefixing chunks with document context is what "contextual retrieval" refers to;
it markedly reduces retrieval misses on chunks that don't repeat the topic.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .parsers import ParsedDocument

TARGET_TOKENS = 380
MAX_TOKENS = 520
PARENT_MAX_TOKENS = 1600


def estimate_tokens(text: str) -> int:
    # ~4 characters per token for English prose; good enough for budgeting.
    return max(1, len(text) // 4)


@dataclass
class Chunk:
    ord: int
    section: str
    text: str
    context: str
    parent_text: str
    tokens: int


_SENTENCE = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(\[])")


def split_sentences(text: str) -> list[str]:
    parts: list[str] = []
    for block in re.split(r"\n+", text):
        block = block.strip()
        if not block:
            continue
        parts.extend(s.strip() for s in _SENTENCE.split(block) if s.strip())
    return parts


def document_summary(doc: ParsedDocument, limit: int = 220) -> str:
    for section in doc.sections:
        sentences = split_sentences(section.text)
        if sentences:
            first = sentences[0]
            return first if len(first) <= limit else first[: limit - 1].rstrip() + "…"
    return ""


def chunk_document(doc: ParsedDocument, path: str = "") -> list[Chunk]:
    summary = document_summary(doc)
    chunks: list[Chunk] = []
    for section in doc.sections:
        pieces = _pack(split_sentences(section.text) or [section.text])
        parent = _truncate(section.text, PARENT_MAX_TOKENS)
        for piece in pieces:
            location = " › ".join(p for p in (path, section.heading) if p)
            context = f"{doc.title}" + (f" — {location}" if location else "") + (f". {summary}" if summary else "")
            chunks.append(
                Chunk(
                    ord=len(chunks),
                    section=section.heading,
                    text=piece,
                    context=context,
                    parent_text=parent,
                    tokens=estimate_tokens(piece),
                )
            )
    return chunks


def _pack(sentences: list[str]) -> list[str]:
    out: list[str] = []
    buf: list[str] = []
    size = 0
    for sentence in sentences:
        t = estimate_tokens(sentence)
        if t > MAX_TOKENS:
            # Very long sentence (tables, code): hard-split by characters.
            if buf:
                out.append(" ".join(buf))
                buf, size = [], 0
            step = MAX_TOKENS * 4
            out.extend(sentence[i : i + step] for i in range(0, len(sentence), step))
            continue
        if size + t > TARGET_TOKENS and buf:
            out.append(" ".join(buf))
            # One-sentence overlap keeps cross-boundary facts retrievable.
            buf, size = [buf[-1]], estimate_tokens(buf[-1])
        buf.append(sentence)
        size += t
    if buf:
        out.append(" ".join(buf))
    return [p for p in out if p.strip()]


def _truncate(text: str, max_tokens: int) -> str:
    limit = max_tokens * 4
    return text if len(text) <= limit else text[:limit].rsplit(" ", 1)[0] + " …"
