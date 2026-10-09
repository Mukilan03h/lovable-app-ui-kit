import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  CircleSlash,
  Clock,
  Loader2,
  Play,
  ShieldQuestion,
  Terminal,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Guard } from "@/components/app/Guard";
import { PageHeader, Panel, Pill } from "@/components/app/ui-bits";
import { PageTransition } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { api, type AgentRow, type JobDetail, type JobRow } from "@/lib/api";

export const Route = createFileRoute("/_app/runs")({
  head: () => ({
    meta: [
      { title: "Runs — Enaz Knowledge" },
      { name: "description", content: "Durable agent runs: live progress, receipts and inline approvals." },
    ],
  }),
  component: () => (
    <Guard permission="agents" area="Agent runs">
      <RunsPage />
    </Guard>
  ),
});

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);

const statusTone: Record<string, "neutral" | "brand" | "success" | "warning" | "danger"> = {
  queued: "neutral",
  running: "brand",
  awaiting_approval: "warning",
  paused: "warning",
  succeeded: "success",
  failed: "danger",
  cancelled: "neutral",
  interrupted: "danger",
};

const relTime = (epoch: number | null) => {
  if (!epoch) return "";
  const mins = Math.max(0, (Date.now() / 1000 - epoch) / 60);
  if (mins < 1) return "just now";
  if (mins < 60) return `${Math.round(mins)}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};

function RunsPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [launchAgent, setLaunchAgent] = useState("");
  const [launchTask, setLaunchTask] = useState("");
  const [launching, setLaunching] = useState(false);

  const loadJobs = () => api.jobs().then((r) => setJobs(r.jobs)).catch(() => {});

  useEffect(() => {
    loadJobs();
    api.agents().then((r) => {
      setAgents(r.agents);
      if (r.agents[0]) setLaunchAgent(r.agents[0].id);
    }).catch(() => {});
    const t = setInterval(loadJobs, 5000);
    return () => clearInterval(t);
  }, []);

  const launch = async () => {
    if (!launchAgent) return;
    setLaunching(true);
    try {
      const { jobId } = await api.enqueueJob(launchAgent, launchTask.trim() ? { task: launchTask.trim() } : {});
      setLaunchTask("");
      await loadJobs();
      setSelected(jobId);
      toast("Run started", { description: "It runs durably — you can leave this page." });
    } catch {
      toast.error("Couldn't start the run");
    } finally {
      setLaunching(false);
    }
  };

  return (
    <PageTransition>
      <PageHeader eyebrow="Durable agent work" title="Runs" />

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <div className="space-y-3">
          <Panel>
            <p className="text-sm font-semibold">Start a run</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Runs continue in the background and survive leaving the page.
            </p>
            <select
              value={launchAgent}
              onChange={(e) => setLaunchAgent(e.target.value)}
              className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none"
            >
              {agents.length === 0 && <option value="">No agents yet</option>}
              {agents.map((a) => (
                <option key={a.id} value={a.id} disabled={!a.enabled}>
                  {a.name} {a.enabled ? "" : "(disabled)"}
                </option>
              ))}
            </select>
            <textarea
              value={launchTask}
              onChange={(e) => setLaunchTask(e.target.value)}
              rows={2}
              placeholder="Task (optional) — defaults to the agent's purpose"
              className="mt-2 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
              disabled={launching || !launchAgent}
              onClick={launch}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Play className="size-4" /> {launching ? "Starting…" : "Start durable run"}
            </button>
          </Panel>

          <div className="space-y-2">
            {jobs.length === 0 && <p className="px-1 text-sm text-muted-foreground">No runs yet.</p>}
            {jobs.map((j) => (
              <button
                key={j.id}
                onClick={() => setSelected(j.id)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors",
                  selected === j.id ? "border-brand bg-brand/5" : "border-border hover:bg-muted",
                )}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand/12 text-brand">
                  <Bot className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{j.agent || "Agent"}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">{relTime(j.createdAt)}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">{j.task || "—"}</span>
                  <span className="mt-1 inline-block">
                    <Pill tone={statusTone[j.status] ?? "neutral"}>{j.status.replace("_", " ")}</Pill>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {selected ? (
          <RunDetail jobId={selected} onChanged={loadJobs} />
        ) : (
          <Panel>
            <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
              <ListIcon />
              <p className="text-sm">Select a run to see its live progress.</p>
            </div>
          </Panel>
        )}
      </div>
    </PageTransition>
  );
}

function ListIcon() {
  return <Terminal className="size-7" />;
}

function RunDetail({ jobId, onChanged }: { jobId: string; onChanged: () => void }) {
  const [job, setJob] = useState<JobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editSummary, setEditSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = () =>
    api
      .job(jobId)
      .then((j) => {
        setJob(j);
        setError(null);
      })
      .catch(() => setError("Couldn't load this run."));

  useEffect(() => {
    setJob(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // Live poll while the run is not terminal.
  useEffect(() => {
    if (!job || TERMINAL.has(job.status)) return;
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status, jobId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [job?.events.length]);

  const interrupt = job?.events.filter((e) => e.type === "interrupt").slice(-1)[0];
  const approvalId = interrupt?.["approvalId"] as string | undefined;
  const proposedTool = interrupt?.["tool"] as string | undefined;

  const decide = async (decision: "approve" | "deny") => {
    if (!approvalId) return;
    setBusy(true);
    try {
      const args = decision === "approve" && editing && editSummary.trim() ? { summary: editSummary.trim() } : undefined;
      const res = await api.decideApproval(approvalId, decision, args);
      toast(decision === "approve" ? "Approved — action executed" : "Denied", {
        description: res.jobStatus ? `Run ${res.jobStatus}` : undefined,
      });
      setEditing(false);
      await load();
      onChanged();
    } catch {
      toast.error("Decision failed");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await api.cancelJob(jobId);
      toast("Run cancelled");
      await load();
      onChanged();
    } catch {
      toast.error("Couldn't cancel");
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <Panel>
        <p className="text-sm text-destructive">{error}</p>
      </Panel>
    );
  }
  if (!job) {
    return (
      <Panel>
        <p className="text-sm text-muted-foreground">Loading run…</p>
      </Panel>
    );
  }

  const running = !TERMINAL.has(job.status);

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-brand/12 text-brand">
            <Bot className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{job.agent || "Agent"} run</p>
            <p className="truncate text-xs text-muted-foreground">{job.task || "—"}</p>
          </div>
          <span className="ml-auto flex items-center gap-2">
            <Pill tone={statusTone[job.status] ?? "neutral"}>{job.status.replace("_", " ")}</Pill>
            {running && (
              <button
                disabled={busy}
                onClick={cancel}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                <CircleSlash className="size-3" /> Cancel
              </button>
            )}
          </span>
        </div>
        {job.error && <p className="mt-2 text-xs text-destructive">{job.error}</p>}
        {typeof job.result?.["answer"] === "string" && job.result["answer"] && (
          <p className="mt-3 border-t border-border pt-3 text-sm leading-relaxed">
            {String(job.result["answer"]).replace(/\[(\d+)\]/g, "")}
          </p>
        )}
      </Panel>

      {/* Inline Approve / Edit / Deny when the run is parked for a decision. */}
      <AnimatePresence>
        {job.status === "awaiting_approval" && approvalId && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl border border-warning/40 bg-warning/5 p-4"
          >
            <p className="flex items-center gap-2 text-sm font-semibold">
              <ShieldQuestion className="size-4 text-warning" /> Needs your decision
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              This run proposes a <span className="font-medium">{proposedTool}</span> action. Approve to execute it,
              edit the details first, or deny to finish without it.
            </p>
            {editing ? (
              <textarea
                value={editSummary}
                onChange={(e) => setEditSummary(e.target.value)}
                rows={3}
                placeholder="Edited action summary…"
                className="mt-3 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none"
              />
            ) : (
              <p className="mt-3 rounded-xl bg-background/60 px-3 py-2 text-sm">{job.task || "(proposed action)"}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                disabled={busy}
                onClick={() => decide("approve")}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                <Check className="size-3.5" /> Approve{editing ? " edited" : ""}
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  setEditing((v) => !v);
                  if (!editing) setEditSummary(job.task || "");
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                {editing ? "Cancel edit" : "Edit"}
              </button>
              <button
                disabled={busy}
                onClick={() => decide("deny")}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                <X className="size-3.5" /> Deny
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Panel>
        <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          {running ? <Loader2 className="size-3.5 animate-spin text-brand" /> : <CheckCircle2 className="size-3.5 text-success" />}
          Activity
        </p>
        <ol className="space-y-1.5">
          {job.events.map((e) => (
            <li key={e.seq} className="flex items-start gap-2 text-xs">
              <EventDot type={e.type} />
              <span className="min-w-0">
                <span className="font-medium">{eventLabel(e)}</span>
                {eventDetail(e) && <span className="ml-1 text-muted-foreground">{eventDetail(e)}</span>}
              </span>
            </li>
          ))}
          <div ref={endRef} />
        </ol>
      </Panel>

      {job.receipts.length > 0 && (
        <Panel>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Action receipts</p>
          <div className="space-y-1.5">
            {job.receipts.map((r) => (
              <div key={r.actionId} className="flex items-center gap-2 text-xs">
                <Pill
                  tone={r.status === "done" ? "success" : r.status === "denied" ? "danger" : "warning"}
                >
                  {r.status}
                </Pill>
                <span className="font-medium">{r.tool}</span>
                <span className="text-muted-foreground">{r.step}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">{relTime(r.createdAt)}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

function EventDot({ type }: { type: string }) {
  if (type === "error") return <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />;
  if (type === "interrupt") return <ShieldQuestion className="mt-0.5 size-3.5 shrink-0 text-warning" />;
  if (type === "tool.result" || type === "run.finished")
    return <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />;
  if (type === "tool.denied") return <X className="mt-0.5 size-3.5 shrink-0 text-destructive" />;
  return <Clock className="mt-0.5 size-3.5 shrink-0 text-brand" />;
}

function eventLabel(e: { type: string; [k: string]: unknown }): string {
  switch (e.type) {
    case "run.started": return `Started · ${String(e["agent"] ?? "")}`;
    case "run.finished": return e["resumed"] ? "Finished (resumed)" : "Finished";
    case "interrupt": return `Awaiting approval · ${String(e["tool"] ?? "")}`;
    case "tool.result": return `Action executed · ${String(e["tool"] ?? "")}${e["simulated"] ? " (simulated)" : ""}`;
    case "tool.denied": return `Action denied · ${String(e["tool"] ?? "")}`;
    case "step": return String(e["label"] ?? "Step");
    case "answer": return "Answer ready";
    case "sources": return "Sources gathered";
    case "error": return `Error`;
    default: return e.type;
  }
}

function eventDetail(e: { type: string; [k: string]: unknown }): string {
  if (e.type === "step") return String(e["detail"] ?? "");
  if (e.type === "error") return String(e["message"] ?? "");
  if (e.type === "tool.result" && e["ref"]) return `ref ${String(e["ref"])}`;
  return "";
}
