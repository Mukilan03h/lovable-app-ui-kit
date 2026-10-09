"""Assistant: streaming answers (SSE), conversations and feedback."""

from __future__ import annotations

import json
from typing import AsyncIterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ...security import acl_key
from ...services import Services
from ..deps import Principal, authenticate, get_services, require

router = APIRouter(prefix="/api/assistant", tags=["assistant"])


class AskRequest(BaseModel):
    query: str
    mode: str = "auto"              # auto | quick | research | agent
    sources: list[str] | None = None
    artifact: str | None = None     # slides | doc | sheet
    conversationId: str | None = None


async def _sse(events: AsyncIterator[dict]) -> AsyncIterator[bytes]:
    try:
        async for event in events:
            yield f"data: {json.dumps(event, default=str)}\n\n".encode()
    except Exception as exc:  # noqa: BLE001 - surface errors to the stream, don't hang
        yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n".encode()
    yield b"data: {\"type\": \"end\"}\n\n"


@router.post("/ask")
async def ask(
    body: AskRequest,
    principal: Principal = Depends(require("assistant")),
    svc: Services = Depends(get_services),
) -> StreamingResponse:
    principals = principal.principals
    ak = acl_key(principals)
    # Resolve the Laya System-1 toggle: per-user setting wins, else workspace default.
    async with svc.db.acquire(principal.tenant_id) as conn:
        row = await conn.fetchrow("SELECT settings FROM user_settings WHERE user_id = $1", principal.user.id)
    system1: bool | None = None
    if row and row["settings"]:
        raw = row["settings"]
        prefs = json.loads(raw) if isinstance(raw, str) else raw
        if isinstance(prefs, dict) and "layaDecision" in prefs:
            system1 = bool(prefs["layaDecision"])
    events = svc.answers.answer(
        principal.tenant_id, principals, ak, body.query,
        mode=body.mode, sources=body.sources, user_id=principal.user.id,
        wants_artifact=body.artifact, system1=system1, conversation_id=body.conversationId,
    )
    return StreamingResponse(
        _sse(events),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@router.get("/conversations")
async def conversations(principal: Principal = Depends(require("assistant")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        rows = await conn.fetch(
            "SELECT id, title, extract(epoch FROM updated_at) AS updated_at FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 50",
            principal.user.id,
        )
    return {
        "conversations": [
            {"id": str(r["id"]), "title": r["title"], "updatedAt": r["updated_at"]} for r in rows
        ]
    }


class FeedbackRequest(BaseModel):
    messageId: str
    rating: str          # up | down
    comment: str = ""


@router.post("/feedback")
async def feedback(body: FeedbackRequest, principal: Principal = Depends(require("assistant")), svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        await conn.execute(
            "INSERT INTO feedback (tenant_id, user_id, message_id, rating, comment) VALUES ($1,$2,$3,$4,$5)",
            principal.tenant_id, principal.user.id, body.messageId, body.rating, body.comment,
        )
    return {"ok": True}
