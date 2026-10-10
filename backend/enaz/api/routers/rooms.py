"""Shared task rooms.

A task room is where colleagues collaborate on one piece of work: a small group
of members, a running thread of comments, decisions assigned to a person, and
hand-offs between people or agents. Rooms are gated by membership (you only see
rooms you belong to), while the documents and artifacts referenced inside a room
stay governed by each user's own access — a room never widens document access.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ...db import new_uuid
from ...services import Services
from ..deps import Principal, audit, get_services, require

router = APIRouter(prefix="/api/rooms", tags=["rooms"])

VALID_KINDS = {"comment", "decision", "handoff"}


async def _require_member(conn, room_id: str, user_id: str) -> dict:
    """Load the room and the caller's membership, or raise. Tenant isolation is
    enforced by RLS, so a room in another tenant reads as not found."""
    room = await conn.fetchrow("SELECT id, name, task, status, created_by FROM task_rooms WHERE id=$1", room_id)
    if not room:
        raise HTTPException(404, "Room not found")
    member = await conn.fetchrow(
        "SELECT role FROM room_members WHERE room_id=$1 AND user_id=$2", room_id, user_id
    )
    if not member:
        raise HTTPException(403, "You are not a member of this room")
    return {"room": room, "role": member["role"]}


def _room_json(r) -> dict:
    return {"id": str(r["id"]), "name": r["name"], "task": r["task"], "status": r["status"],
            "createdBy": str(r["created_by"]) if r["created_by"] else None}


class CreateRoom(BaseModel):
    name: str
    task: str = ""
    memberIds: list[str] = []       # additional members to seed (besides the creator)


@router.post("")
async def create_room(body: CreateRoom, principal: Principal = Depends(require("assistant")),
                      svc: Services = Depends(get_services)) -> dict:
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Room name is required")
    room_id = new_uuid()
    async with svc.db.acquire(principal.tenant_id) as conn:
        async with conn.transaction():
            await conn.execute(
                "INSERT INTO task_rooms (id, tenant_id, name, task, created_by) VALUES ($1,$2,$3,$4,$5)",
                room_id, principal.tenant_id, name, body.task.strip(), principal.user.id,
            )
            # Creator is always an owner member.
            await conn.execute(
                "INSERT INTO room_members (tenant_id, room_id, user_id, role) VALUES ($1,$2,$3,'owner')",
                principal.tenant_id, room_id, principal.user.id,
            )
            for uid in {u for u in body.memberIds if u and u != principal.user.id}:
                exists = await conn.fetchval(
                    "SELECT 1 FROM users WHERE id=$1 AND disabled=false", uid
                )
                if exists:
                    await conn.execute(
                        "INSERT INTO room_members (tenant_id, room_id, user_id, role) VALUES ($1,$2,$3,'member') "
                        "ON CONFLICT (room_id, user_id) DO NOTHING",
                        principal.tenant_id, room_id, uid,
                    )
    await audit(svc, principal, "room.create", room_id, {"name": name})
    return {"id": room_id, "name": name, "task": body.task.strip(), "status": "open"}


@router.get("")
async def list_rooms(principal: Principal = Depends(require("assistant")),
                     svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        rows = await conn.fetch(
            """SELECT r.id, r.name, r.task, r.status, r.created_by,
                      (SELECT count(*) FROM room_members m WHERE m.room_id=r.id) AS members,
                      (SELECT count(*) FROM room_messages msg WHERE msg.room_id=r.id) AS messages,
                      (SELECT count(*) FROM room_messages msg WHERE msg.room_id=r.id
                         AND msg.kind='decision') AS decisions,
                      extract(epoch FROM r.created_at) AS created_at
               FROM task_rooms r
               JOIN room_members me ON me.room_id=r.id AND me.user_id=$1
               ORDER BY r.created_at DESC LIMIT 100""",
            principal.user.id,
        )
    return {"rooms": [
        {**_room_json(r), "members": r["members"], "messages": r["messages"],
         "decisions": r["decisions"], "createdAt": r["created_at"]}
        for r in rows
    ]}


@router.get("/{room_id}")
async def get_room(room_id: str, principal: Principal = Depends(require("assistant")),
                   svc: Services = Depends(get_services)) -> dict:
    async with svc.db.acquire(principal.tenant_id) as conn:
        ctx = await _require_member(conn, room_id, principal.user.id)
        members = await conn.fetch(
            """SELECT m.user_id, m.role, u.name, u.email FROM room_members m
               JOIN users u ON u.id=m.user_id WHERE m.room_id=$1 ORDER BY m.added_at""",
            room_id,
        )
        messages = await conn.fetch(
            """SELECT id, user_id, author_name, kind, body, artifact_id, assignee,
                      extract(epoch FROM created_at) AS created_at
               FROM room_messages WHERE room_id=$1 ORDER BY created_at""",
            room_id,
        )
    return {
        "room": _room_json(ctx["room"]),
        "myRole": ctx["role"],
        "members": [
            {"userId": str(m["user_id"]), "role": m["role"], "name": m["name"], "email": m["email"]}
            for m in members
        ],
        "messages": [
            {"id": str(m["id"]), "userId": str(m["user_id"]) if m["user_id"] else None,
             "author": m["author_name"], "kind": m["kind"], "body": m["body"],
             "artifactId": str(m["artifact_id"]) if m["artifact_id"] else None,
             "assignee": m["assignee"], "createdAt": m["created_at"]}
            for m in messages
        ],
    }


class AddMember(BaseModel):
    userId: str
    role: str = "member"


@router.post("/{room_id}/members")
async def add_member(room_id: str, body: AddMember, principal: Principal = Depends(require("assistant")),
                     svc: Services = Depends(get_services)) -> dict:
    role = "owner" if body.role == "owner" else "member"
    async with svc.db.acquire(principal.tenant_id) as conn:
        await _require_member(conn, room_id, principal.user.id)
        target = await conn.fetchrow("SELECT id, name FROM users WHERE id=$1 AND disabled=false", body.userId)
        if not target:
            raise HTTPException(404, "User not found")
        await conn.execute(
            "INSERT INTO room_members (tenant_id, room_id, user_id, role) VALUES ($1,$2,$3,$4) "
            "ON CONFLICT (room_id, user_id) DO UPDATE SET role=excluded.role",
            principal.tenant_id, room_id, body.userId, role,
        )
    await audit(svc, principal, "room.add_member", room_id, {"user": body.userId, "role": role})
    return {"ok": True, "userId": body.userId, "role": role}


class PostMessage(BaseModel):
    kind: str = "comment"           # comment | decision | handoff
    body: str = ""
    artifactId: str | None = None
    assignee: str = ""              # person (or agent) a decision/handoff is assigned to


@router.post("/{room_id}/messages")
async def post_message(room_id: str, body: PostMessage, principal: Principal = Depends(require("assistant")),
                       svc: Services = Depends(get_services)) -> dict:
    kind = body.kind if body.kind in VALID_KINDS else "comment"
    text = body.body.strip()
    if not text and kind == "comment":
        raise HTTPException(400, "A comment needs a body")
    if kind in ("decision", "handoff") and not body.assignee.strip():
        raise HTTPException(400, f"A {kind} must name an assignee")
    msg_id = new_uuid()
    async with svc.db.acquire(principal.tenant_id) as conn:
        await _require_member(conn, room_id, principal.user.id)
        # An artifact reference is only accepted if the caller can actually see it.
        if body.artifactId:
            seen = await conn.fetchval("SELECT 1 FROM artifacts WHERE id=$1", body.artifactId)
            if not seen:
                raise HTTPException(403, "You do not have access to that artifact")
        await conn.execute(
            """INSERT INTO room_messages (id, tenant_id, room_id, user_id, author_name, kind, body, artifact_id, assignee)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)""",
            msg_id, principal.tenant_id, room_id, principal.user.id, principal.user.name,
            kind, text, body.artifactId, body.assignee.strip(),
        )
    return {"id": msg_id, "kind": kind}


class ResolveRoom(BaseModel):
    status: str = "resolved"        # open | resolved


@router.post("/{room_id}/status")
async def set_status(room_id: str, body: ResolveRoom, principal: Principal = Depends(require("assistant")),
                     svc: Services = Depends(get_services)) -> dict:
    status = "resolved" if body.status == "resolved" else "open"
    async with svc.db.acquire(principal.tenant_id) as conn:
        await _require_member(conn, room_id, principal.user.id)
        await conn.execute("UPDATE task_rooms SET status=$2 WHERE id=$1", room_id, status)
    return {"ok": True, "status": status}
