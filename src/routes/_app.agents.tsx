import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Bot,
  CalendarClock,
  Check,
  MessageSquare,
  Play,
  Plus,
  ShieldAlert,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Guard } from "@/components/app/Guard";
import { artifactMeta } from "@/components/app/artifact-meta";
import { Bar, PageHeader, Pill } from "@/components/app/ui-bits";
import { PageTransition, StaggerGroup } from "@/lib/motion";
import { api, type AgentRow, type ApprovalRow } from "@/lib/api";

export const Route = createFileRoute("/_app/agents")({
  head: () => ({
    meta: [
      { title: "Agents — Enaz Knowledge" },
      {
        name: "description",
        content: "Build agents that search, reason, take approved actions and produce artifacts.",
      },
      { property: "og:title", content: "Agents — Enaz Knowledge" },
      { property: "og:description", content: "Agents that search, act and create artifacts." },
    ],
  }),
  component: () => (
    <Guard permission="agents" area="Agents">
      <AgentsPage />
    </Guard>
  ),
});

const triggerIcon = (t: string) =>
  /(day|am|pm)/i.test(t) ? CalendarClock : t === "On demand" ? MessageSquare : Zap;

/** Epoch seconds → short relative time. */
function relTime(epoch: number | null | undefined): string {
  if (!epoch) return "never";
  const s = Math.round((Date.now() - epoch * 1000) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.round(d / 7);
  if (w < 5) return `${w}w ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(d / 365)}y ago`;
}

function argSummary(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (!entries.length) return "no arguments";
  return entries
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" · ");
}

function AgentsPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [selected, setSelected] = useState<AgentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setError(null);
    try {
      const [a, p] = await Promise.all([api.agents(), api.approvals()]);
      setAgents(a.agents);
      setApprovals(p.approvals);
    } catch {
      setError("Couldn't reach the backend. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createAgent() {
    setCreating(true);
    try {
      await api.createAgent({
        name: "Untitled agent",
        description: "Instructions · knowledge scope · tools (incl. MCP) · trigger · approvals",
        tools: [],
        trigger: "On demand",
        output: "answer",
      });
      toast("Agent created", { description: "Draft added — open it to finish setup." });
      await load();
    } catch {
      toast.error("Couldn't create the agent");
    } finally {
      setCreating(false);
    }
  }

  async function decide(id: string, decision: "approve" | "deny") {
    try {
      await api.decideApproval(id, decision);
      toast(decision === "approve" ? "Action approved" : "Action denied");
      const p = await api.approvals();
      setApprovals(p.approvals);
    } catch {
      toast.error("Couldn't record your decision");
    }
  }

  const pending = approvals.filter((a) => a.status === "pending");

  return (
    <PageTransition className="space-y-6">
      <PageHeader
        eyebrow="Automate knowledge work"
        title="Agents"
        actions={
          <button
            onClick={createAgent}
            disabled={creating}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            <Plus className="size-4" /> New agent
          </button>
        }
      />

      {pending.length > 0 && (
        <section className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <ShieldAlert className="size-4 text-brand" /> Approvals needed
            <Pill tone="brand">{pending.length}</Pill>
          </p>
          <div className="space-y-2">
            {pending.map((ap) => (
              <div
                key={ap.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-border px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{ap.tool}</p>
                  <p className="truncate text-xs text-muted-foreground">{argSummary(ap.args)}</p>
                </div>
                <span className="text-xs text-muted-foreground">{relTime(ap.createdAt)}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => decide(ap.id, "approve")}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                  >
                    <Check className="size-3.5" /> Approve
                  </button>
                  <button
                    onClick={() => decide(ap.id, "deny")}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                  >
                    <X className="size-3.5" /> Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-3xl border border-border bg-card shadow-[var(--shadow-soft)]"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
          {error}
        </div>
      ) : agents.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card p-10 text-center shadow-[var(--shadow-soft)]">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand/12 text-brand">
            <Bot className="size-6" />
          </span>
          <p className="mt-3 font-semibold">No agents yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first agent to automate searches, actions and artifacts.
          </p>
        </div>
      ) : (
        <StaggerGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((a) => {
            const TriggerIcon = triggerIcon(a.trigger);
            const Out =
              a.output === "answer"
                ? MessageSquare
                : (artifactMeta[a.output as keyof typeof artifactMeta]?.icon ?? MessageSquare);
            return (
              <motion.button
                key={a.id}
                whileHover={{ y: -3 }}
                onClick={() => setSelected(a)}
                className="flex flex-col rounded-3xl border border-border bg-card p-5 text-left shadow-[var(--shadow-soft)]"
              >
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-2xl bg-brand/12 text-brand">
                    <Bot className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{a.name}</p>
                    <p className="truncate text-xs text-muted-foreground">by {a.owner}</p>
                  </div>
                  {!a.enabled && <Pill>Paused</Pill>}
                  <Out className="size-4 text-muted-foreground" />
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{a.description}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {a.tools.map((t) => (
                    <Pill key={t}>{t}</Pill>
                  ))}
                </div>
                <div className="mt-auto pt-4">
                  <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <TriggerIcon className="size-3.5" /> {a.trigger}
                    </span>
                    <span>
                      {a.runs.toLocaleString()} runs · {a.success}%
                    </span>
                  </div>
                  <Bar value={a.success} tone={a.success >= 95 ? "success" : "brand"} />
                </div>
              </motion.button>
            );
          })}
        </StaggerGroup>
      )}

      <AnimatePresence>
        {selected && (
          <motion.div
            className="fixed inset-0 z-50 flex justify-end"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-foreground/40" onClick={() => setSelected(null)} />
            <motion.aside
              initial={{ x: 420 }}
              animate={{ x: 0 }}
              exit={{ x: 420 }}
              transition={{ type: "spring", stiffness: 360, damping: 36 }}
              className="relative flex h-full w-full max-w-md flex-col gap-5 overflow-y-auto bg-card p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Agent</p>
                  <h2 className="text-xl font-semibold">{selected.name}</h2>
                </div>
                <button onClick={() => setSelected(null)} aria-label="Close">
                  <X className="size-5" />
                </button>
              </div>
              <p className="text-sm text-muted-foreground">{selected.description}</p>
              <section>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Wrench className="size-3.5" /> Tools
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.tools.map((t) => (
                    <Pill key={t} tone="brand">
                      {t}
                    </Pill>
                  ))}
                </div>
              </section>
              <section className="space-y-2 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Guardrails
                </p>
                <p>✓ Uses only sources the requester can access</p>
                <p>✓ Side-effect actions require approval</p>
                <p>✓ Every claim checked against the evidence ledger</p>
              </section>
              <section className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Activity
                </p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl border border-border px-3 py-2">
                    <p className="text-sm font-semibold tabular-nums">
                      {selected.runs.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-muted-foreground">runs</p>
                  </div>
                  <div className="rounded-xl border border-border px-3 py-2">
                    <p className="text-sm font-semibold tabular-nums">{selected.success}%</p>
                    <p className="text-[11px] text-muted-foreground">success</p>
                  </div>
                  <div className="rounded-xl border border-border px-3 py-2">
                    <p className="text-sm font-semibold">{relTime(selected.lastRun)}</p>
                    <p className="text-[11px] text-muted-foreground">last run</p>
                  </div>
                </div>
              </section>
              <button
                onClick={() =>
                  toast(`Running ${selected.name}`, {
                    description: "Live steps stream into the assistant.",
                  })
                }
                className="mt-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
              >
                <Play className="size-4" /> Run now
              </button>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
