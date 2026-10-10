import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowRightLeft,
  CheckCircle2,
  Gavel,
  MessageSquare,
  Plus,
  Users,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { Guard } from "@/components/app/Guard";
import { PageHeader, Panel, Pill } from "@/components/app/ui-bits";
import { PageTransition, StaggerGroup } from "@/lib/motion";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  api,
  type AdminUser,
  type RoomDetail,
  type RoomSummary,
} from "@/lib/api";

export const Route = createFileRoute("/_app/rooms")({
  head: () => ({
    meta: [
      { title: "Task rooms — Enaz Knowledge" },
      { name: "description", content: "Collaborate with colleagues on a task: comments, decisions and hand-offs." },
      { property: "og:title", content: "Task rooms — Enaz Knowledge" },
      { property: "og:description", content: "Shared workspaces for getting work done together." },
    ],
  }),
  component: () => (
    <Guard permission="assistant" area="Task rooms">
      <RoomsPage />
    </Guard>
  ),
});

const KINDS = [
  { id: "comment", label: "Comment", icon: MessageSquare, tone: "brand" as const },
  { id: "decision", label: "Decision", icon: Gavel, tone: "warning" as const },
  { id: "handoff", label: "Hand-off", icon: ArrowRightLeft, tone: "success" as const },
];

const relTime = (epoch: number | null) => {
  if (!epoch) return "";
  const mins = Math.max(0, (Date.now() / 1000 - epoch) / 60);
  if (mins < 1) return "just now";
  if (mins < 60) return `${Math.round(mins)}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};

const initials = (name: string) =>
  name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";

function RoomsPage() {
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "manager";

  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RoomDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTask, setNewTask] = useState("");
  const [busy, setBusy] = useState(false);

  const loadRooms = () =>
    api.rooms().then((r) => {
      setRooms(r.rooms);
      setError(null);
      setSelectedId((cur) => cur ?? r.rooms[0]?.id ?? null);
    }).catch(() => setError("Couldn't load your rooms."));

  useEffect(() => {
    void loadRooms();
  }, []);

  const loadDetail = (id: string) =>
    api.room(id).then(setDetail).catch(() => toast.error("Couldn't open that room."));

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId]);

  const createRoom = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const r = await api.createRoom({ name: newName.trim(), task: newTask.trim() });
      setNewName("");
      setNewTask("");
      setCreating(false);
      await loadRooms();
      setSelectedId(r.id);
      toast("Room created");
    } catch {
      toast.error("Couldn't create the room.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageTransition>
      <PageHeader
        eyebrow="Collaborate on a task"
        title="Task rooms"
        actions={
          <button
            onClick={() => setCreating((v) => !v)}
            className="inline-flex items-center gap-2 rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="size-4" /> New room
          </button>
        }
      />

      {creating && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
          <Panel className="mt-4">
            <div className="grid gap-3">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Room name (e.g. GA launch)"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
              />
              <textarea
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                placeholder="What's the task? (optional)"
                rows={2}
                className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setCreating(false)} className="rounded-xl border border-border px-3 py-2 text-sm hover:bg-muted">
                  Cancel
                </button>
                <button
                  onClick={() => void createRoom()}
                  disabled={busy || !newName.trim()}
                  className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  Create room
                </button>
              </div>
            </div>
          </Panel>
        </motion.div>
      )}

      {error && (
        <div className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Room list */}
        <StaggerGroup className="grid content-start gap-2">
          {rooms.length === 0 && !error && (
            <Panel>
              <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                <UsersRound className="size-7" />
                <p className="text-sm">No rooms yet. Create one to start collaborating.</p>
              </div>
            </Panel>
          )}
          {rooms.map((r) => {
            const active = r.id === selectedId;
            return (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={cn(
                  "rounded-2xl border p-3 text-left transition-colors",
                  active ? "border-brand bg-brand/5" : "border-border hover:bg-muted",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{r.name}</span>
                  {r.status === "resolved" ? (
                    <Pill tone="success">Resolved</Pill>
                  ) : (
                    <Pill tone="brand">Open</Pill>
                  )}
                </div>
                {r.task && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.task}</p>}
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Users className="size-3.5" /> {r.members}</span>
                  <span className="flex items-center gap-1"><MessageSquare className="size-3.5" /> {r.messages}</span>
                  {r.decisions > 0 && <span className="flex items-center gap-1"><Gavel className="size-3.5" /> {r.decisions}</span>}
                </div>
              </button>
            );
          })}
        </StaggerGroup>

        {/* Room detail */}
        {detail ? (
          <RoomView
            key={detail.room.id}
            detail={detail}
            canManage={canManage}
            onChanged={async () => {
              await loadDetail(detail.room.id);
              await loadRooms();
            }}
          />
        ) : (
          <Panel>
            <p className="py-10 text-center text-sm text-muted-foreground">Select a room to open it.</p>
          </Panel>
        )}
      </div>
    </PageTransition>
  );
}

function RoomView({
  detail,
  canManage,
  onChanged,
}: {
  detail: RoomDetail;
  canManage: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const { room, members, messages } = detail;
  const [kind, setKind] = useState("comment");
  const [body, setBody] = useState("");
  const [assignee, setAssignee] = useState("");
  const [busy, setBusy] = useState(false);

  // Member picker (managers/admins): list of users to add.
  const [dir, setDir] = useState<AdminUser[]>([]);
  useEffect(() => {
    if (!canManage) return;
    api.adminUsers().then((r) => setDir(r.users)).catch(() => setDir([]));
  }, [canManage]);

  const memberIds = useMemo(() => new Set(members.map((m) => m.userId)), [members]);
  const addable = dir.filter((u) => !memberIds.has(u.id) && !u.disabled);

  const needsAssignee = kind === "decision" || kind === "handoff";

  const post = async () => {
    if (!body.trim() && kind === "comment") return;
    if (needsAssignee && !assignee.trim()) {
      toast.error(`A ${kind} needs an assignee.`);
      return;
    }
    setBusy(true);
    try {
      await api.postRoomMessage(room.id, {
        kind,
        body: body.trim(),
        ...(needsAssignee ? { assignee: assignee.trim() } : {}),
      });
      setBody("");
      setAssignee("");
      setKind("comment");
      await onChanged();
    } catch {
      toast.error("Couldn't post that.");
    } finally {
      setBusy(false);
    }
  };

  const addMember = async (userId: string) => {
    try {
      await api.addRoomMember(room.id, userId);
      toast("Member added");
      await onChanged();
    } catch {
      toast.error("Couldn't add that member.");
    }
  };

  const toggleStatus = async () => {
    try {
      await api.setRoomStatus(room.id, room.status === "resolved" ? "open" : "resolved");
      await onChanged();
    } catch {
      toast.error("Couldn't update the room.");
    }
  };

  return (
    <Panel className="flex min-h-[60vh] flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-semibold">{room.name}</h2>
            {room.status === "resolved" ? <Pill tone="success">Resolved</Pill> : <Pill tone="brand">Open</Pill>}
          </div>
          {room.task && <p className="mt-1 text-sm text-muted-foreground">{room.task}</p>}
        </div>
        <button
          onClick={() => void toggleStatus()}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          <CheckCircle2 className="size-4" />
          {room.status === "resolved" ? "Reopen" : "Mark resolved"}
        </button>
      </div>

      {/* Members */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border py-3">
        <span className="text-xs font-medium text-muted-foreground">Members</span>
        {members.map((m) => (
          <span
            key={m.userId}
            className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs"
            title={m.email}
          >
            <span className="grid size-5 place-items-center rounded-full bg-brand/15 text-[10px] font-bold text-brand">
              {initials(m.name)}
            </span>
            {m.name}
            {m.role === "owner" && <span className="text-muted-foreground">· owner</span>}
          </span>
        ))}
        {canManage && addable.length > 0 && (
          <select
            value=""
            onChange={(e) => e.target.value && void addMember(e.target.value)}
            className="rounded-full border border-dashed border-border bg-background px-2.5 py-1 text-xs outline-none hover:bg-muted"
          >
            <option value="">+ Add member…</option>
            {addable.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Thread */}
      <div className="flex-1 space-y-3 overflow-y-auto py-4">
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No messages yet. Start the conversation.</p>
        )}
        {messages.map((m) => {
          const meta = KINDS.find((k) => k.id === m.kind) ?? KINDS[0]!;
          const Icon = meta.icon;
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-border p-3"
            >
              <div className="flex items-center gap-2 text-sm">
                <span className="grid size-6 place-items-center rounded-full bg-brand/15 text-[10px] font-bold text-brand">
                  {initials(m.author)}
                </span>
                <span className="font-medium">{m.author || "Someone"}</span>
                {m.kind !== "comment" && (
                  <Pill tone={meta.tone}>
                    <Icon className="mr-1 inline size-3" />
                    {meta.label}
                  </Pill>
                )}
                <span className="ml-auto text-xs text-muted-foreground">{relTime(m.createdAt)}</span>
              </div>
              {m.body && <p className="mt-2 whitespace-pre-wrap text-sm">{m.body}</p>}
              {m.assignee && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Assigned to <span className="font-medium text-foreground">{m.assignee}</span>
                </p>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Composer */}
      <div className="border-t border-border pt-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {KINDS.map((k) => {
            const Icon = k.icon;
            return (
              <button
                key={k.id}
                onClick={() => setKind(k.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-colors",
                  kind === k.id ? "border-brand bg-brand/10 text-brand" : "border-border hover:bg-muted",
                )}
              >
                <Icon className="size-3.5" /> {k.label}
              </button>
            );
          })}
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={kind === "comment" ? "Write a comment…" : `Describe this ${kind}…`}
          rows={2}
          className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <div className="mt-2 flex items-center gap-2">
          {needsAssignee && (
            <input
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              placeholder="Assignee (person or agent)"
              className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
            />
          )}
          <button
            onClick={() => void post()}
            disabled={busy}
            className="ml-auto rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            Post
          </button>
        </div>
      </div>
    </Panel>
  );
}
