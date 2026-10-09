import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Blocks,
  Bot,
  CalendarClock,
  Check,
  FlaskConical,
  Globe,
  Lock,
  MessageSquare,
  Play,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Guard } from "@/components/app/Guard";
import { artifactMeta } from "@/components/app/artifact-meta";
import { Bar, PageHeader, Pill } from "@/components/app/ui-bits";
import { fadeUp, PageTransition, StaggerGroup } from "@/lib/motion";
import {
  api,
  type ActionRow,
  type AgentRow,
  type AgentTestResult,
  type ApprovalRow,
  type SkillRow,
} from "@/lib/api";

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

/** Color pill classes per HTTP method — GET green, POST blue, DELETE red, else gray. */
const methodTone: Record<string, string> = {
  GET: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  POST: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  DELETE: "bg-red-500/15 text-red-600 dark:text-red-400",
};
const methodClass = (m: string) =>
  methodTone[m.toUpperCase()] ?? "bg-muted text-muted-foreground";

/** Group actions by their collection, preserving first-seen order. */
function groupByCollection(actions: ActionRow[]): [string, ActionRow[]][] {
  const groups = new Map<string, ActionRow[]>();
  for (const a of actions) {
    const bucket = groups.get(a.collection);
    if (bucket) bucket.push(a);
    else groups.set(a.collection, [a]);
  }
  return [...groups.entries()];
}

const inputClass =
  "w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-brand";

function AgentsPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [selected, setSelected] = useState<AgentRow | null>(null);
  const [testing, setTesting] = useState<AgentRow | null>(null);
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
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setTesting(a);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        setTesting(a);
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    <FlaskConical className="size-3.5" /> Test
                  </span>
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
        {testing && <TestDialog agent={testing} onClose={() => setTesting(null)} />}
      </AnimatePresence>

      <SkillsSection />

      <ActionsSection />

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

function CheckPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Pill tone={ok ? "success" : "danger"}>
      {ok ? <Check className="size-3" /> : <X className="size-3" />} {label}
    </Pill>
  );
}

function TestDialog({ agent, onClose }: { agent: AgentRow; onClose: () => void }) {
  const [task, setTask] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AgentTestResult | null>(null);

  async function run() {
    setRunning(true);
    try {
      const res = await api.testAgent(agent.id, task.trim() || undefined);
      setResult(res);
    } catch {
      toast.error("Couldn't run the test. Check your connection and try again.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex justify-end"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-foreground/40" onClick={onClose} />
      <motion.aside
        initial={{ x: 420 }}
        animate={{ x: 0 }}
        exit={{ x: 420 }}
        transition={{ type: "spring", stiffness: 360, damping: 36 }}
        className="relative flex h-full w-full max-w-md flex-col gap-5 overflow-y-auto bg-card p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <FlaskConical className="size-3.5" /> Test mode
            </p>
            <h2 className="truncate text-xl font-semibold">{agent.name}</h2>
          </div>
          <button onClick={onClose} aria-label="Close">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex items-start gap-2 rounded-2xl border border-info/40 bg-info/10 px-3 py-2 text-xs text-info">
          <Lock className="mt-0.5 size-3.5 shrink-0" />
          <span>Dry run — read-only, no side effects. Nothing is sent to live tools.</span>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sample task (optional)
          </label>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="e.g. Summarize last quarter's support escalations"
            rows={3}
            className={`${inputClass} resize-y`}
          />
          <div className="flex justify-end">
            <button
              onClick={run}
              disabled={running}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              <FlaskConical className="size-4" /> {running ? "Running…" : "Run dry run"}
            </button>
          </div>
        </div>

        {running && !result && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-2xl border border-border bg-muted/40"
              />
            ))}
          </div>
        )}

        {result && (
          <motion.div variants={fadeUp} initial="hidden" animate="show" className="space-y-5">
            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Sources accessed
              </p>
              {result.sourcesAccessed.length === 0 ? (
                <Pill>all permitted sources</Pill>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {result.sourcesAccessed.map((s) => (
                    <Pill key={s} tone="info">
                      <Globe className="size-3" /> {s}
                    </Pill>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Proposed tools
              </p>
              {result.proposedTools.length === 0 ? (
                <p className="text-sm text-muted-foreground">none</p>
              ) : (
                <div className="space-y-2">
                  {result.proposedTools.map((t, i) => (
                    <div
                      key={`${t.tool}-${i}`}
                      className="flex flex-wrap items-center gap-2 rounded-2xl border border-border px-3 py-2"
                    >
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        <Wrench className="size-3.5 text-muted-foreground" /> {t.tool}
                      </span>
                      {t.wouldCall && (
                        <Pill tone="warning">
                          <ShieldAlert className="size-3" /> would call
                        </Pill>
                      )}
                      {!t.verifiedAgainstLive && (
                        <span className="text-xs text-muted-foreground">
                          not verified against live
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Proposed changes
              </p>
              {result.proposedChanges.length === 0 ? (
                <p className="text-sm text-muted-foreground">none</p>
              ) : (
                <ul className="space-y-2">
                  {result.proposedChanges.map((c, i) => (
                    <li
                      key={`${c.tool}-${i}`}
                      className="rounded-2xl border border-border px-3 py-2 text-sm"
                    >
                      <span className="font-medium">{c.tool}</span>
                      <span className="text-muted-foreground"> — {c.summary}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Followed instructions
              </p>
              <div className="flex flex-wrap gap-1.5">
                <CheckPill ok={result.followedInstructions.producedAnswer} label="Produced answer" />
                <CheckPill
                  ok={result.followedInstructions.stayedWithinSourceScope}
                  label="Stayed within source scope"
                />
              </div>
            </section>

            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Sample answer
              </p>
              <p className="rounded-2xl border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                {result.sampleAnswer}
              </p>
            </section>

            <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
              <span className="text-muted-foreground">Estimated cost</span>
              <span className="font-semibold tabular-nums">${result.estimatedCost.toFixed(4)}</span>
            </div>
            {result.note && <p className="text-xs text-muted-foreground">{result.note}</p>}
          </motion.div>
        )}
      </motion.aside>
    </motion.div>
  );
}

function SkillsSection() {
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [tools, setTools] = useState("");

  async function load() {
    setError(null);
    try {
      const res = await api.skills();
      setSkills(res.skills);
    } catch {
      setError("Couldn't load skills. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Give the skill a name first");
      return;
    }
    const toolList = tools
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const body: {
      name: string;
      description?: string;
      instructions?: string;
      tools?: string[];
    } = { name: trimmedName };
    const trimmedDesc = description.trim();
    if (trimmedDesc) body.description = trimmedDesc;
    const trimmedInstr = instructions.trim();
    if (trimmedInstr) body.instructions = trimmedInstr;
    if (toolList.length) body.tools = toolList;

    setSaving(true);
    try {
      await api.createSkill(body);
      toast("Skill created", { description: `"${trimmedName}" is ready to attach to agents.` });
      setName("");
      setDescription("");
      setInstructions("");
      setTools("");
      await load();
    } catch {
      toast.error("Couldn't create the skill");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string, label: string) {
    try {
      await api.deleteSkill(id);
      toast(`Deleted "${label}"`);
      await load();
    } catch {
      toast.error("Couldn't delete the skill");
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-2xl bg-brand/12 text-brand">
          <Sparkles className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Skills</h2>
          <p className="text-sm text-muted-foreground">
            Reusable instruction packs with their own tools, shared across your agents.
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Plus className="size-4 text-brand" /> New skill
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className={inputClass}
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
            className={inputClass}
          />
        </div>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Instructions — what this skill should do and how"
          rows={3}
          className={`${inputClass} mt-3 resize-y`}
        />
        <input
          value={tools}
          onChange={(e) => setTools(e.target.value)}
          placeholder="Tools (comma-separated) — e.g. search, web, code"
          className={`${inputClass} mt-3`}
        />
        <div className="mt-3 flex justify-end">
          <button
            onClick={create}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            <Plus className="size-4" /> {saving ? "Creating…" : "Create skill"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-3xl border border-border bg-card shadow-[var(--shadow-soft)]"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
          {error}
        </div>
      ) : skills.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card p-10 text-center shadow-[var(--shadow-soft)]">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand/12 text-brand">
            <Sparkles className="size-6" />
          </span>
          <p className="mt-3 font-semibold">No skills yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a skill above to package instructions and tools your agents can reuse.
          </p>
        </div>
      ) : (
        <StaggerGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {skills.map((s) => (
            <motion.div
              key={s.id}
              variants={fadeUp}
              className="flex flex-col rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]"
            >
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand/12 text-brand">
                  <Sparkles className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{s.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{s.slug}</p>
                </div>
                {s.shared ? (
                  <Pill tone="info">
                    <Globe className="size-3" /> Shared
                  </Pill>
                ) : (
                  <Pill>
                    <Lock className="size-3" /> Private
                  </Pill>
                )}
                <button
                  onClick={() => remove(s.id, s.name)}
                  aria-label={`Delete ${s.name}`}
                  className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              {s.description && (
                <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{s.description}</p>
              )}
              {s.tools.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {s.tools.map((t) => (
                    <Pill key={t} tone="brand">
                      <Wrench className="size-3" /> {t}
                    </Pill>
                  ))}
                </div>
              )}
              {!s.enabled && (
                <div className="mt-3">
                  <Pill tone="warning">Disabled</Pill>
                </div>
              )}
            </motion.div>
          ))}
        </StaggerGroup>
      )}
    </section>
  );
}

function ActionsSection() {
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [spec, setSpec] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  async function load() {
    setError(null);
    try {
      const res = await api.actions();
      setActions(res.actions);
    } catch {
      setError("Couldn't load actions. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function runImport() {
    const trimmedSpec = spec.trim();
    if (!trimmedSpec) {
      toast.error("Paste an OpenAPI spec first");
      return;
    }
    const trimmedBase = baseUrl.trim();
    setImporting(true);
    try {
      const res = await api.importActions(trimmedSpec, trimmedBase || undefined);
      toast("Actions imported", {
        description: `${res.imported} action${res.imported === 1 ? "" : "s"} added to "${res.collection}".`,
      });
      setSpec("");
      setBaseUrl("");
      await load();
    } catch {
      toast.error("Couldn't import — check the spec is valid JSON or YAML");
    } finally {
      setImporting(false);
    }
  }

  async function remove(id: string, label: string) {
    try {
      await api.deleteAction(id);
      toast(`Deleted "${label}"`);
      await load();
    } catch {
      toast.error("Couldn't delete the action");
    }
  }

  const groups = groupByCollection(actions);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-2xl bg-brand/12 text-brand">
          <Blocks className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Actions</h2>
          <p className="text-sm text-muted-foreground">
            Import an OpenAPI spec to give agents typed, approvable API calls.
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Upload className="size-4 text-brand" /> Import from OpenAPI
        </p>
        <textarea
          value={spec}
          onChange={(e) => setSpec(e.target.value)}
          placeholder="Paste an OpenAPI spec (JSON or YAML)…"
          rows={5}
          className={`${inputClass} resize-y font-mono text-xs`}
        />
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="Base URL (optional) — e.g. https://api.example.com"
            className={`${inputClass} sm:flex-1`}
          />
          <button
            onClick={runImport}
            disabled={importing}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            <Upload className="size-4" /> {importing ? "Importing…" : "Import"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
          {error}
        </div>
      ) : actions.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card p-10 text-center shadow-[var(--shadow-soft)]">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand/12 text-brand">
            <Blocks className="size-6" />
          </span>
          <p className="mt-3 font-semibold">No actions yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Import an OpenAPI spec above to turn its endpoints into agent actions.
          </p>
        </div>
      ) : (
        <StaggerGroup className="space-y-5">
          {groups.map(([collection, rows]) => (
            <motion.div
              key={collection}
              variants={fadeUp}
              className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]"
            >
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Blocks className="size-4 text-brand" /> {collection}
                <Pill>{rows.length}</Pill>
              </p>
              <div className="space-y-2">
                {rows.map((a) => (
                  <div
                    key={a.id}
                    className="flex flex-wrap items-center gap-3 rounded-2xl border border-border px-4 py-3"
                  >
                    <span
                      className={`inline-flex min-w-16 justify-center rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${methodClass(
                        a.method,
                      )}`}
                    >
                      {a.method}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-sm">{a.path}</p>
                      {a.summary && (
                        <p className="truncate text-xs text-muted-foreground">{a.summary}</p>
                      )}
                    </div>
                    {a.requiresApproval && (
                      <Pill tone="warning">
                        <ShieldAlert className="size-3" /> Needs approval
                      </Pill>
                    )}
                    <button
                      onClick={() => remove(a.id, a.name)}
                      aria-label={`Delete ${a.name}`}
                      className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </StaggerGroup>
      )}
    </section>
  );
}
