"""Artifact service: generate a spec, store versions, render Office files, edit by patch."""

from __future__ import annotations

import json
import re
import time
from typing import Any


def _now() -> float:
    return time.time()

from ..config import Settings
from ..db import Database
from ..llm.gateway import CostLedger, LLMGateway
from ..retrieval.embeddings import tokenize
from .render import render
from .specs import FORMATS, SPEC_MODELS, DeckSpec, DocSpec, Slide, SheetSpec, SheetTab, DocSection

MEDIA_TYPES = {
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

SPEC_SYSTEM = {
    "slides": ("You turn research evidence into a professional slide deck spec. Produce a title slide, "
               "3–6 content slides (bullets, and a chart or table where numbers warrant it), and a next-steps "
               "slide. Keep bullets short. Put the citing source numbers in each slide's notes. Use ONLY the evidence."),
    "doc": ("You turn research evidence into a concise document spec: a short summary section, 2–4 themed "
            "sections, and a sources list. Cite source numbers inline in paragraphs as [n]. Use ONLY the evidence."),
    "sheet": ("You turn research evidence into a spreadsheet spec: one tab with clear columns and rows of the "
              "concrete data points found, plus a formula column if a calculation is natural. Use ONLY the evidence."),
}


class ArtifactService:
    def __init__(self, db: Database, llm: LLMGateway, settings: Settings):
        self.db = db
        self.llm = llm
        self.settings = settings

    async def generate(self, tenant_id, user_id, query, kind, ledger, cost: CostLedger | None = None) -> dict[str, Any]:
        spec = await self._build_spec(query, kind, ledger, cost)
        return await self._store(tenant_id, user_id, kind, spec, sources=len(ledger.items),
                                 note="Generated from answer", source_query=query, ledger=ledger)

    async def _build_spec(self, query, kind, ledger, cost):
        model_cls = SPEC_MODELS[kind]
        if not self.llm.offline:
            prompt = (f"Request: {query}\n\nEvidence:\n{ledger.prompt_block(include_parent=True)}\n\n"
                      f"Produce the {kind} spec as JSON.")
            result = await self.llm.complete(
                self.settings.model_deep, SPEC_SYSTEM[kind], prompt,
                effort="high", max_tokens=3000, output_schema=model_cls.model_json_schema(), fallbacks=False,
            )
            if cost is not None:
                cost.add(result)
            if result.parsed:
                try:
                    return model_cls.model_validate(result.parsed)
                except Exception:
                    pass
        return self._offline_spec(query, kind, ledger)

    def _offline_spec(self, query, kind, ledger):
        title = _titleize(query)
        points = _key_points(ledger)
        sources = [f"[{e.n}] {e.hit.title} — {e.hit.source}" for e in ledger.items]
        if kind == "slides":
            slides = [Slide(layout="bullets", title="Summary",
                            bullets=[p for p, _ in points[:4]], notes="; ".join(f"[{n}]" for _, n in points[:4]))]
            for p, n in points[4:10]:
                slides.append(Slide(layout="bullets", title=_titleize(p)[:60], bullets=[p], notes=f"[{n}]"))
            slides.append(Slide(layout="bullets", title="Next steps",
                                bullets=["Review the cited sources", "Confirm with owners", "Decide next action"]))
            return DeckSpec(title=title, subtitle="Prepared from cited sources", slides=slides)
        if kind == "doc":
            summary = DocSection(heading="Summary", paragraphs=[f"{p} [{n}]" for p, n in points[:4]])
            detail = DocSection(heading="Details", bullets=[f"{p} [{n}]" for p, n in points[4:10]])
            return DocSpec(title=title, subtitle="Prepared from cited sources",
                           sections=[summary, detail], sources=sources)
        rows = [[_titleize(p)[:40], f"[{n}]"] for p, n in points[:10]]
        return SheetSpec(title=title, tabs=[SheetTab(name="Findings", columns=["Finding", "Source"], rows=rows)],
                         sources=sources)

    async def _store(self, tenant_id, user_id, kind, spec, sources, note, source_query="", ledger=None) -> dict[str, Any]:
        fmt = FORMATS[kind]
        spec_json = json.dumps(spec.model_dump())
        async with self.db.acquire(tenant_id) as conn:
            row = await conn.fetchrow(
                """INSERT INTO artifacts (tenant_id, user_id, title, kind, format, sources, current_version, source_query)
                   VALUES ($1,$2,$3,$4,$5,$6,1,$7) RETURNING id, created_at""",
                tenant_id, user_id, spec.title, kind, fmt, sources, source_query,
            )
            aid = str(row["id"])
            await conn.execute(
                "INSERT INTO artifact_versions (tenant_id, artifact_id, version, spec, note) VALUES ($1,$2,1,$3,$4)",
                tenant_id, aid, spec_json, note,
            )
            await self._record_sources(conn, tenant_id, aid, ledger)
        return {"id": aid, "title": spec.title, "kind": kind, "format": fmt, "version": 1, "sources": sources}

    async def _record_sources(self, conn, tenant_id, artifact_id, ledger) -> None:
        """Snapshot the artifact's source documents and their current content hash,
        so a later source change can be detected."""
        if ledger is None:
            return
        doc_ids = {str(e.hit.doc_id): e.hit.title for e in ledger.items if getattr(e.hit, "doc_id", None)}
        if not doc_ids:
            return
        await conn.execute("DELETE FROM artifact_sources WHERE artifact_id=$1", artifact_id)
        hashes = {str(r["id"]): r["content_hash"] for r in await conn.fetch(
            "SELECT id, content_hash FROM documents WHERE id = ANY($1::uuid[])", list(doc_ids.keys())
        )}
        await conn.executemany(
            "INSERT INTO artifact_sources (tenant_id, artifact_id, doc_id, title, built_hash) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (artifact_id, doc_id) DO UPDATE SET built_hash=excluded.built_hash, title=excluded.title",
            [(tenant_id, artifact_id, did, title, hashes.get(did, "")) for did, title in doc_ids.items()],
        )

    async def freshness(self, tenant_id, artifact_id) -> dict[str, Any]:
        """Compare each source document's current content hash with the hash
        recorded when the artifact was built."""
        async with self.db.acquire(tenant_id) as conn:
            rows = await conn.fetch(
                """SELECT s.doc_id, s.title, s.built_hash, d.content_hash AS current_hash
                   FROM artifact_sources s LEFT JOIN documents d ON d.id = s.doc_id
                   WHERE s.artifact_id = $1""",
                artifact_id,
            )
        changed, missing = [], []
        for r in rows:
            if r["current_hash"] is None:
                missing.append({"docId": str(r["doc_id"]), "title": r["title"]})
            elif r["current_hash"] != r["built_hash"]:
                changed.append({"docId": str(r["doc_id"]), "title": r["title"]})
        return {
            "stale": bool(changed or missing), "sourceCount": len(rows),
            "changedSources": changed, "missingSources": missing,
            "checkedAt": _now(),
        }

    async def accept_refresh(self, tenant_id, artifact_id, spec_dict: dict, note: str = "Refreshed from updated sources") -> dict[str, Any] | None:
        """Store a refreshed spec as a NEW version (history preserved) and
        re-snapshot the source hashes so the artifact reads fresh again."""
        async with self.db.acquire(tenant_id) as conn:
            art = await conn.fetchrow("SELECT current_version FROM artifacts WHERE id=$1", artifact_id)
            if not art:
                return None
            version = art["current_version"] + 1
            title = spec_dict.get("title") or ""
            await conn.execute(
                "INSERT INTO artifact_versions (tenant_id, artifact_id, version, spec, note) VALUES ($1,$2,$3,$4,$5)",
                tenant_id, artifact_id, version, json.dumps(spec_dict), note,
            )
            await conn.execute(
                "UPDATE artifacts SET current_version=$2, title=COALESCE(NULLIF($3,''), title), updated_at=now() WHERE id=$1",
                artifact_id, version, title,
            )
            # Re-snapshot: all current sources are now the built baseline.
            await conn.execute(
                """UPDATE artifact_sources s SET built_hash = d.content_hash
                   FROM documents d WHERE d.id = s.doc_id AND s.artifact_id = $1""",
                artifact_id,
            )
        return {"id": artifact_id, "version": version, "title": title}

    async def get(self, tenant_id, artifact_id) -> dict[str, Any] | None:
        async with self.db.acquire(tenant_id) as conn:
            row = await conn.fetchrow("SELECT * FROM artifacts WHERE id = $1", artifact_id)
            if not row:
                return None
            ver = await conn.fetchrow(
                "SELECT spec, version FROM artifact_versions WHERE artifact_id = $1 AND version = $2",
                artifact_id, row["current_version"],
            )
            versions = await conn.fetch(
                "SELECT version, note, extract(epoch FROM created_at) AS created_at FROM artifact_versions WHERE artifact_id=$1 ORDER BY version DESC",
                artifact_id,
            )
        art = dict(row)
        art["id"] = str(art["id"])
        art["spec"] = _loads(ver["spec"]) if ver else {}
        art["versions"] = [dict(v) for v in versions]
        return art

    async def render_bytes(self, tenant_id, artifact_id) -> tuple[str, bytes, str] | None:
        art = await self.get(tenant_id, artifact_id)
        if not art:
            return None
        kind = art["kind"]
        spec = SPEC_MODELS[kind].model_validate(art["spec"])
        data = render(kind, spec)
        fmt = FORMATS[kind]
        safe = re.sub(r"[^A-Za-z0-9 _-]", "", art["title"]).strip().replace(" ", "_") or "artifact"
        return f"{safe}.{fmt}", data, MEDIA_TYPES[fmt]

    async def patch(self, tenant_id, artifact_id, instruction: str) -> dict[str, Any] | None:
        art = await self.get(tenant_id, artifact_id)
        if not art:
            return None
        kind = art["kind"]
        model_cls = SPEC_MODELS[kind]
        current = model_cls.model_validate(art["spec"])
        new_spec = current
        if not self.llm.offline:
            result = await self.llm.complete(
                self.settings.model_standard,
                system=(f"You edit an existing {kind} spec. Apply the user's instruction and return the COMPLETE "
                        "updated spec as JSON, preserving everything the instruction did not change."),
                user=f"Current spec:\n{json.dumps(art['spec'])}\n\nInstruction: {instruction}",
                effort="medium", max_tokens=3000, output_schema=model_cls.model_json_schema(), fallbacks=False,
            )
            if result.parsed:
                try:
                    new_spec = model_cls.model_validate(result.parsed)
                except Exception:
                    new_spec = current
        else:
            new_spec = _offline_patch(current, instruction)

        async with self.db.acquire(tenant_id) as conn:
            version = art["current_version"] + 1
            await conn.execute(
                "INSERT INTO artifact_versions (tenant_id, artifact_id, version, spec, note) VALUES ($1,$2,$3,$4,$5)",
                tenant_id, artifact_id, version, json.dumps(new_spec.model_dump()), instruction[:200],
            )
            await conn.execute(
                "UPDATE artifacts SET current_version=$2, title=$3, updated_at=now() WHERE id=$1",
                artifact_id, version, new_spec.title,
            )
        return {"id": artifact_id, "version": version, "title": new_spec.title}


def _loads(value):
    return json.loads(value) if isinstance(value, str) else value


def _titleize(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip().rstrip("?.")
    return text[:1].upper() + text[1:] if text else "Untitled"


def _key_points(ledger) -> list[tuple[str, int]]:
    points: list[tuple[str, int]] = []
    seen: set[str] = set()
    for e in ledger.items:
        for sentence in re.split(r"(?<=[.!?])\s+", e.hit.text.strip()):
            s = sentence.strip()
            key = " ".join(sorted(tokenize(s)))[:80]
            if len(s) > 25 and key and key not in seen:
                seen.add(key)
                points.append((s, e.n))
                break
    return points


def _offline_patch(spec, instruction: str):
    note = f"(edit: {instruction[:60]})"
    if isinstance(spec, DeckSpec):
        spec.slides.append(Slide(layout="bullets", title="Update", bullets=[instruction], notes=note))
    elif isinstance(spec, DocSpec):
        spec.sections.append(DocSection(heading="Update", paragraphs=[instruction]))
    elif isinstance(spec, SheetSpec) and spec.tabs:
        spec.tabs[0].rows.append([instruction[:40], "edit"])
    return spec
