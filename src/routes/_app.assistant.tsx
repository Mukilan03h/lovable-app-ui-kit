import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUp,
  BookOpen,
  CheckCircle2,
  FileText,
  GitBranch,
  ListChecks,
  MessageSquarePlus,
  Paperclip,
  Search,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Guard } from "@/components/app/Guard";
import { ArtifactCanvas } from "@/components/app/ArtifactCanvas";
import { artifactMeta } from "@/components/app/artifact-meta";
import { Pill } from "@/components/app/ui-bits";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  conversations,
  demoAnswer,
  docById,
  sourceLabel,
  sourceTint,
  suggestedPrompts,
  type ArtifactKind,
  type SourceApp,
  type Step,
} from "@/data/knowledge";

export const Route = createFileRoute("/_app/assistant")({
  head: () => ({
    meta: [
      { title: "Assistant — Enaz Knowledge" },
      {
        name: "description",
        content: "Ask anything across company apps and get cited answers, slides, docs and sheets.",
      },
      { property: "og:title", content: "Assistant — Enaz Knowledge" },
      {
        property: "og:description",
        content: "Cited answers and artifacts across all company knowledge.",
      },
    ],
  }),
  component: () => (
    <Guard permission="assistant" area="The assistant">
      <AssistantPage />
    </Guard>
  ),
});

const modes = [
  { id: "auto", label: "Auto", hint: "Routes to the cheapest path that can answer" },
  { id: "quick", label: "Quick", hint: "One retrieval, one answer — under 4s" },
  {
    id: "research",
    label: "Deep research",
    hint: "Plans, searches in parallel, verifies every claim",
  },
  { id: "agent", label: "Agent", hint: "Can take actions with your approval" },
] as const;

const scopeSources: SourceApp[] = [
  "slack",
  "drive",
  "confluence",
  "jira",
  "sharepoint",
  "github",
  "salesforce",
];

const stepIcon: Record<Step["tool"], typeof Search> = {
  plan: ListChecks,
  search: Search,
  read: BookOpen,
  graph: GitBranch,
  verify: ShieldCheck,
  artifact: Wand2,
};

type Turn = { id: number; question: string; artifact: ArtifactKind | undefined };

const detectArtifact = (q: string): ArtifactKind | undefined => {
  const s = q.toLowerCase();
  if (/(deck|slide|ppt|presentation)/.test(s)) return "slides";
  if (/(sheet|excel|xlsx|spreadsheet|table|export)/.test(s)) return "sheet";
  if (/(doc|memo|word|report|draft)/.test(s)) return "doc";
  return undefined;
};

function AssistantPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState<(typeof modes)[number]["id"]>("auto");
  const [scope, setScope] = useState<SourceApp[]>([]);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [artifact, setArtifact] = useState<ArtifactKind | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const send = (text: string, kind?: ArtifactKind) => {
    const q = text.trim();
    if (!q) return;
    setTurns((t) => [...t, { id: Date.now(), question: q, artifact: kind ?? detectArtifact(q) }]);
    setInput("");
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length]);

  const toggleScope = (s: SourceApp) =>
    setScope((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  return (
    <div
      className={cn(
        "grid gap-4 lg:h-[calc(100vh-7.5rem)]",
        artifact
          ? "lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_minmax(0,1.05fr)]"
          : "lg:grid-cols-[220px_minmax(0,1fr)]",
      )}
    >
      <aside className="hidden min-h-0 flex-col gap-3 lg:flex">
        <button
          onClick={() => {
            setTurns([]);
            setArtifact(null);
          }}
          className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          <MessageSquarePlus className="size-4" /> New chat
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-3xl border border-border bg-card p-2">
          {["Today", "Yesterday", "Mon", "Last week"].map((group) => {
            const items = conversations.filter((c) => c.when === group);
            if (!items.length) return null;
            return (
              <div key={group} className="mb-2">
                <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {group}
                </p>
                {items.map((c) => (
                  <button
                    key={c.id}
                    className="w-full truncate rounded-xl px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    {c.title}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
        <div className="rounded-3xl border border-border bg-card p-3 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            <ShieldCheck className="size-3.5 text-success" /> Permission-aware
          </p>
          <p className="mt-1">Answers only use sources {user?.name.split(" ")[0]} can open.</p>
        </div>
      </aside>

      <section className="flex min-h-[70vh] min-w-0 flex-col rounded-3xl border border-border bg-card shadow-[var(--shadow-soft)] lg:min-h-0">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {turns.length === 0 ? (
            <Welcome name={user?.name.split(" ")[0] ?? "there"} onPick={(t, k) => send(t, k)} />
          ) : (
            <div className="mx-auto max-w-3xl space-y-8">
              {turns.map((t) => (
                <AnswerTurn key={t.id} turn={t} onArtifact={(k) => setArtifact(k)} />
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <div className="border-t border-border p-3 sm:p-4">
          <div className="mx-auto max-w-3xl space-y-2">
            <div className="flex gap-1 overflow-x-auto pb-1">
              {modes.map((m) => (
                <button
                  key={m.id}
                  title={m.hint}
                  onClick={() => setMode(m.id)}
                  className={cn(
                    "relative shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground",
                    mode === m.id && "text-primary-foreground",
                  )}
                >
                  {mode === m.id && (
                    <motion.span
                      layoutId="mode-pill"
                      className="absolute inset-0 rounded-full bg-primary"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  )}
                  <span className="relative">{m.label}</span>
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="rounded-2xl border border-border bg-background p-2 focus-within:ring-2 focus-within:ring-brand/30"
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={2}
                placeholder="Ask anything, or “make a deck about…”"
                className="w-full resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  className="grid size-8 place-items-center rounded-xl hover:bg-muted"
                  aria-label="Attach file"
                >
                  <Paperclip className="size-4 text-muted-foreground" />
                </button>
                {scopeSources.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleScope(s)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                      scope.includes(s)
                        ? "border-brand bg-brand/12 text-brand"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {sourceLabel[s]}
                  </button>
                ))}
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {scope.length ? `${scope.length} sources` : "All sources"}
                </span>
                <button
                  disabled={!input.trim()}
                  className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40"
                  aria-label="Send"
                >
                  <ArrowUp className="size-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      <AnimatePresence>
        {artifact && (
          <div className="min-h-0 lg:col-span-2 xl:col-span-1">
            <ArtifactCanvas key={artifact} kind={artifact} onClose={() => setArtifact(null)} />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Welcome({
  name,
  onPick,
}: {
  name: string;
  onPick: (t: string, k?: ArtifactKind) => void;
}) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center py-8 text-center sm:py-16">
      <motion.span
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="grid size-14 place-items-center rounded-3xl bg-brand/12 text-brand"
      >
        <Sparkles className="size-6" />
      </motion.span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">
        Good to see you, {name}
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Search 640K documents across 7 apps. Every answer is cited, and any answer can become
        slides, a doc or a sheet.
      </p>
      <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
        {suggestedPrompts.map((p, i) => {
          const Icon = p.kind ? artifactMeta[p.kind].icon : Search;
          return (
            <motion.button
              key={p.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
              whileHover={{ y: -2 }}
              onClick={() => onPick(p.title, p.kind)}
              className="flex items-start gap-3 rounded-2xl border border-border bg-background p-4 text-left"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted">
                <Icon className="size-4" />
              </span>
              <span>
                <span className="block text-sm font-semibold">{p.title}</span>
                <span className="block text-xs text-muted-foreground">{p.hint}</span>
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function AnswerTurn({ turn, onArtifact }: { turn: Turn; onArtifact: (k: ArtifactKind) => void }) {
  const steps = demoAnswer.steps.filter((s) => s.tool !== "artifact" || turn.artifact);
  const total = steps.length + demoAnswer.paragraphs.length;
  const [tick, setTick] = useState(0);
  const [focused, setFocused] = useState<string | null>(null);
  const openedRef = useRef(false);

  useEffect(() => {
    if (tick >= total) return;
    const id = window.setTimeout(() => setTick((t) => t + 1), 450);
    return () => window.clearTimeout(id);
  }, [tick, total]);

  const stepCount = Math.min(tick, steps.length);
  const paraCount = Math.max(0, tick - steps.length);
  const done = tick >= total;

  useEffect(() => {
    if (done && turn.artifact && !openedRef.current) {
      openedRef.current = true;
      onArtifact(turn.artifact);
    }
  }, [done, turn.artifact, onArtifact]);

  const cited = Array.from(new Set(demoAnswer.paragraphs.flatMap((p) => p.cites)));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          {turn.question}
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-background/60 p-3">
        <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          {done ? (
            <CheckCircle2 className="size-3.5 text-success" />
          ) : (
            <span className="size-2 animate-ping rounded-full bg-brand" />
          )}
          {done ? `Worked through ${steps.length} steps · 3.4s · $0.006` : "Working…"}
        </p>
        <ol className="space-y-1.5">
          <AnimatePresence initial={false}>
            {steps.slice(0, stepCount).map((s) => {
              const Icon = stepIcon[s.tool];
              return (
                <motion.li
                  key={s.label}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-2 text-xs"
                >
                  <Icon className="size-3.5 shrink-0 text-brand" />
                  <span className="font-medium">{s.label}</span>
                  <span className="truncate text-muted-foreground">{s.detail}</span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      </div>

      <div className="space-y-3 text-sm leading-relaxed">
        {demoAnswer.paragraphs.slice(0, paraCount).map((p, i) => (
          <motion.p key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            {p.text}
            {p.cites.map((c) => (
              <button
                key={c}
                onMouseEnter={() => setFocused(c)}
                onMouseLeave={() => setFocused(null)}
                onClick={() => setFocused(c)}
                className="ml-1 inline-grid min-w-5 place-items-center rounded-md bg-brand/12 px-1 align-text-top text-[10px] font-bold text-brand"
              >
                {cited.indexOf(c) + 1}
              </button>
            ))}
          </motion.p>
        ))}
      </div>

      {done && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {cited.map((id, i) => {
              const d = docById(id);
              if (!d) return null;
              return (
                <div
                  key={id}
                  className={cn(
                    "rounded-2xl border p-3 transition-colors",
                    focused === id ? "border-brand bg-brand/5" : "border-border",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-brand">{i + 1}</span>
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                        sourceTint[d.source],
                      )}
                    >
                      {sourceLabel[d.source]}
                    </span>
                    <span className="ml-auto text-[10px] text-muted-foreground">{d.updated}</span>
                  </div>
                  <p className="mt-1.5 truncate text-sm font-medium">{d.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{d.snippet}</p>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="success">
              <ShieldCheck className="size-3" /> 7/7 claims verified
            </Pill>
            {(Object.keys(artifactMeta) as ArtifactKind[]).map((k) => {
              const M = artifactMeta[k];
              return (
                <button
                  key={k}
                  onClick={() => onArtifact(k)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted"
                >
                  <M.icon className="size-3.5" /> {turn.artifact === k ? "Open" : "Turn into"}{" "}
                  {M.label.toLowerCase()}
                </button>
              );
            })}
            <button className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted">
              <FileText className="size-3.5" /> Copy with citations
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
