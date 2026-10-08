"""Parse → chunk → contextualize → embed → index, with change detection (async)."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field

from ..db import Database
from ..retrieval.embeddings import Embedder
from ..retrieval.index import DocumentIndex
from .chunker import chunk_document
from .parsers import ParsedDocument, Section, parse_text


@dataclass
class SourceDocument:
    """What a connector yields: content plus permissions copied from the source app."""

    external_id: str
    title: str
    source: str
    acl: list[str]
    text: str | None = None
    parsed: ParsedDocument | None = None
    url: str | None = None
    path: str = ""
    doc_type: str = "doc"
    owner: str = ""
    updated_at: float | None = None
    metadata: dict = field(default_factory=dict)

    def to_parsed(self) -> ParsedDocument:
        if self.parsed is not None:
            if not self.parsed.title:
                self.parsed.title = self.title
            return self.parsed
        return parse_text(self.title, self.text or "", doc_type=self.doc_type)


class IngestionService:
    def __init__(self, db: Database, index: DocumentIndex, embedder: Embedder):
        self.db = db
        self.index = index
        self.embedder = embedder

    async def ingest(self, tenant_id: str, item: SourceDocument, connector_id: str | None = None) -> tuple[str, bool]:
        parsed = item.to_parsed()
        if not parsed.sections:
            parsed.sections = [Section("", item.title)]
        content = parsed.full_text
        digest = hashlib.sha256(
            (parsed.title + "\n" + content + "\n" + ",".join(sorted(item.acl))).encode()
        ).hexdigest()

        async with self.db.acquire(tenant_id) as conn:
            existing = await conn.fetchrow(
                "SELECT id, content_hash FROM documents WHERE tenant_id=$1 AND connector_id IS NOT DISTINCT FROM $2 AND external_id=$3",
                tenant_id, connector_id, item.external_id,
            )
            if existing and existing["content_hash"] == digest:
                return str(existing["id"]), False

        chunks = chunk_document(parsed, item.path)
        texts = [f"{c.context}\n{c.section}\n{c.text}" for c in chunks]
        vectors = self.embedder.embed(texts) if texts else []

        async with self.db.acquire(tenant_id) as conn:
            doc_id = await self.index.upsert_document(
                conn,
                tenant_id,
                {
                    "connector_id": connector_id,
                    "source": item.source,
                    "external_id": item.external_id,
                    "title": parsed.title or item.title,
                    "url": item.url,
                    "path": item.path,
                    "doc_type": parsed.doc_type if item.parsed is not None else item.doc_type,
                    "owner": item.owner,
                    "updated_at": item.updated_at,
                    "content_hash": digest,
                    "metadata": {**parsed.metadata, **item.metadata},
                },
                item.acl,
                [
                    {
                        "ord": c.ord,
                        "section": c.section,
                        "text": c.text,
                        "context": c.context,
                        "parent_text": c.parent_text,
                        "tokens": c.tokens,
                    }
                    for c in chunks
                ],
                list(vectors),
            )
        return doc_id, True

    async def remove_missing(self, tenant_id: str, connector_id: str, keep_doc_ids: set[str]) -> int:
        async with self.db.acquire(tenant_id) as conn:
            rows = await conn.fetch("SELECT id FROM documents WHERE connector_id = $1", connector_id)
            removed = 0
            for r in rows:
                if str(r["id"]) not in keep_doc_ids:
                    await conn.execute("DELETE FROM documents WHERE id = $1", r["id"])
                    removed += 1
        return removed
