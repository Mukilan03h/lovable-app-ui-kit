import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Inbox as InboxIcon,
  Loader2,
  PencilLine,
} from "lucide-react";
import { toast } from "sonner";
import { Guard } from "@/components/app/Guard";
import { PageHeader, Panel, Pill } from "@/components/app/ui-bits";
import { PageTransition, StaggerGroup } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { api, type InboxItem, type InboxResponse } from "@/lib/api";

export const Route = createFileRoute("/_app/inbox")({
  head: () => ({
    meta: [
      { title: "Inbox — Enaz Knowledge" },
      { name: "description", content: "Agent results, approvals, failed tasks and knowledge reviews in one place." },
      { property: "og:title", content: "Work inbox — Enaz Knowledge" },
      { property: "og:description", content: "One place to supervise AI work." },
    ],
  }),
  component: () => (
    <Guard permission="assistant" area="The work inbox">
      <InboxPage />
    </Guard>
  ),
});

const BUCKETS = [
  { id: "needs_decision", label: "Needs your decision", icon: ClipboardCheck, tone: "warning" },
  { id: "running", label: "Running", icon: Loader2, tone: "brand" },
  { id: "completed", label: "Completed", icon: CheckCircle2, tone: "success" },
  { id: "failed", label: "Failed", icon: AlertTriangle, tone: "danger" },
] as const;

const typeIcon = { approval: ClipboardCheck, run: Bot, correction: PencilLine } as const;

const relTime = (epoch: number | null) => {
  if (!epoch) return "";
  const mins = Math.max(0, (Date.now() / 1000 - epoch) / 60);
  if (mins < 60) return `${Math.round(mins)}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};

function InboxPage() {
  const [data, setData] = useState<InboxResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bucket, setBucket] = useState<string>("needs_decision");
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    api
      .inbox()
      .then((r) => {
        setData(r);
        setError(null);
      })
      .catch(() => setError("Couldn't load your inbox."));

  useEffect(() => {
    load();
    const t = setInterval(load, 20000); // keep it live for running work
    return () => clearInterval(t);
  }, []);

  const items = useMemo(
    () => (data?.items ?? []).filter((i) => i.bucket === bucket),
    [data, bucket],
  );

  const decideApproval = async (id: string, decision: "approve" | "deny") => {
    setBusy(id);
    try {
      await api.decideApproval(id, decision);
      toast(decision === "approve" ? "Approved" : "Denied");
      await load();
    } catch {
      toast.error("Action failed");
    } finally {
      setBusy(null);
    }
  };

  const reviewCorrection = async (id: string, decision: "approve" | "reject") => {
    setBusy(id);
    try {
      await api.reviewCorrection(id, decision === "approve" ? { decision, expiresDays: 180 } : { decision });
      toast(decision === "approve" ? "Correction approved" : "Correction rejected");
      await load();
    } catch {
      toast.error("Review failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <PageTransition>
      <PageHeader
        eyebrow="Supervise AI work"
        title="Work inbox"
      />

      <div className="mt-4 flex flex-wrap gap-2">
        {BUCKETS.map((b) => {
          const count = data?.counts?.[b.id as keyof InboxResponse["counts"]] ?? 0;
          const active = bucket === b.id;
          return (
            <button
              key={b.id}
              onClick={() => setBucket(b.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium transition-colors",
                active ? "border-brand bg-brand/10 text-brand" : "border-border hover:bg-muted",
              )}
            >
              <b.icon className={cn("size-4", b.id === "running" && "animate-spin")} />
              {b.label}
              <span
                className={cn(
                  "grid min-w-5 place-items-center rounded-full px-1.5 text-xs font-bold",
                  active ? "bg-brand text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="mt-4">
        {!data && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
        {data && items.length === 0 && (
          <Panel>
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <InboxIcon className="size-7" />
              <p className="text-sm">Nothing here right now.</p>
            </div>
          </Panel>
        )}
        <StaggerGroup className="grid gap-3">
          {items.map((it) => (
            <InboxCard
              key={`${it.type}-${it.id}`}
              item={it}
              busy={busy === it.id}
              canReview={data?.canReview ?? false}
              onApprove={() => decideApproval(it.id, "approve")}
              onDeny={() => decideApproval(it.id, "deny")}
              onReview={(d) => reviewCorrection(it.id, d)}
            />
          ))}
        </StaggerGroup>
      </div>
    </PageTransition>
  );
}

function InboxCard({
  item,
  busy,
  canReview,
  onApprove,
  onDeny,
  onReview,
}: {
  item: InboxItem;
  busy: boolean;
  canReview: boolean;
  onApprove: () => void;
  onDeny: () => void;
  onReview: (d: "approve" | "reject") => void;
}) {
  const Icon = typeIcon[item.type] ?? Bot;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand/12 text-brand">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{item.title}</p>
            <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="size-3" /> {relTime(item.createdAt)}
            </span>
          </div>
          {item.detail && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.detail}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Pill tone="neutral">{item.nextAction}</Pill>
            {item.type === "approval" && item.bucket === "needs_decision" && (
              <>
                <button
                  disabled={busy}
                  onClick={onApprove}
                  className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  disabled={busy}
                  onClick={onDeny}
                  className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
                >
                  Deny
                </button>
              </>
            )}
            {item.type === "correction" && item.bucket === "needs_decision" && canReview && (
              <>
                <button
                  disabled={busy}
                  onClick={() => onReview("approve")}
                  className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                >
                  Approve correction
                </button>
                <button
                  disabled={busy}
                  onClick={() => onReview("reject")}
                  className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
                >
                  Reject
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
