import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUp,
  BookOpen,
  Bot,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  FileText,
  FolderOpen,
  GitBranch,
  Globe,
  ListChecks,
  Mic,
  MessageSquarePlus,
  Paperclip,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/app/BrandLogo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/lib/theme";
import dunes from "@/assets/auth-dunes.jpg";
import { Guard } from "@/components/app/Guard";
import { artifactMeta } from "@/components/app/artifact-meta";
import { Pill } from "@/components/app/ui-bits";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  agents,
  modelProviders,
  sourceLabel,
  sourceLogo,
  suggestedPrompts,
  type ArtifactKind,
  type SourceApp,
  type Step,
} from "@/data/knowledge";
import { api, apiStream, downloadUrl, type ConversationSummary } from "@/lib/api";

export const Route = createFileRoute("/_app/assistant")({
  validateSearch: (search: Record<string, unknown>): { artifact?: ArtifactKind } => {
    const a = search["artifact"];
    return a === "slides" || a === "doc" || a === "sheet" ? { artifact: a } : {};
  },
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

const efforts = ["Low", "Medium", "High"] as const;

const projects = [
  { name: "GA launch", files: 12 },
  { name: "Globex renewal", files: 5 },
];

const bgClass: Record<string, string> = {
  none: "",
  aurora: "chat-bg-aurora",
  grid: "chat-bg-grid",
  dots: "chat-bg-dots",
  dunes: "",
};

type Turn = {
  id: number;
  question: string;
  artifact: ArtifactKind | undefined;
  mode: string;
  scope: SourceApp[];
};

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
  const { chatBackground } = useTheme();
  const [agent, setAgent] = useState("Enaz Assistant");
  const [model, setModel] = useState("Claude Sonnet 5.5");
  const [effort, setEffort] = useState<(typeof efforts)[number]>("Medium");
  const [web, setWeb] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  const send = (text: string, kind?: ArtifactKind) => {
    const q = text.trim();
    if (!q) return;
    setTurns((t) => [
      ...t,
      { id: Date.now(), question: q, artifact: kind ?? detectArtifact(q), mode, scope: [...scope] },
    ]);
    setInput("");
  };

  useEffect(() => {
    api.conversations().then((r) => setConversations(r.conversations)).catch(() => {});
  }, []);

  const contextUsed = Math.min(92, 6 + turns.length * 14);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length]);

  const toggleScope = (s: SourceApp) =>
    setScope((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  return (
    <div className="grid gap-4 lg:h-[calc(100vh-7.5rem)] lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="hidden min-h-0 flex-col gap-3 lg:flex">
        <button
          onClick={() => setTurns([])}
          className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          <MessageSquarePlus className="size-4" /> New chat
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-3xl border border-border bg-card p-2">
          <label className="mb-2 flex items-center gap-2 rounded-xl bg-muted px-2 py-1.5">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              placeholder="Search chats"
              className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </label>
          <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Projects
          </p>
          {projects.map((p) => (
            <button
              key={p.name}
              className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-muted"
            >
              <FolderOpen className="size-4 text-brand" />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="text-[10px] text-muted-foreground">{p.files} files</span>
            </button>
          ))}
          <div className="my-2 border-t border-border" />
          {conversations.length > 0 && (
            <div className="mb-2">
              <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Recent
              </p>
              {conversations.map((c) => (
                <button
                  key={c.id}
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {relTime(c.updatedAt)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-3xl border border-border bg-card p-3 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            <ShieldCheck className="size-3.5 text-success" /> Permission-aware
          </p>
          <p className="mt-1">Answers only use sources {user?.name.split(" ")[0]} can open.</p>
        </div>
      </aside>

      <section className="relative flex min-h-[70vh] min-w-0 flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-soft)] lg:min-h-0">
        {chatBackground === "dunes" && (
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-20"
            style={{ backgroundImage: `url(${dunes})` }}
          />
        )}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-xl px-2 py-1 text-sm font-semibold hover:bg-muted">
              <span className="grid size-6 place-items-center rounded-lg bg-brand/12 text-brand">
                <Bot className="size-3.5" />
              </span>
              {agent}
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Agents</DropdownMenuLabel>
              {["Enaz Assistant", ...agents.map((a) => a.name)].map((name) => (
                <DropdownMenuItem key={name} onClick={() => setAgent(name)}>
                  <Bot className="size-4" />
                  <span className="flex-1">{name}</span>
                  {agent === name && <Check className="size-4 text-brand" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="ml-auto flex items-center gap-2">
            <ContextMeter used={contextUsed} />
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-xl border border-border px-2 py-1 text-xs font-medium hover:bg-muted">
                <BrandLogo id={model.startsWith("Claude") ? "anthropic" : "ollama"} size="xs" />
                <span className="hidden sm:inline">{model}</span>
                <ChevronDown className="size-3 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {modelProviders
                  .filter((p) => p.status === "connected")
                  .map((p) => (
                    <div key={p.name}>
                      <DropdownMenuLabel className="flex items-center gap-2">
                        <BrandLogo id={p.logo} size="xs" /> {p.name}
                      </DropdownMenuLabel>
                      {p.models.map((m) => (
                        <DropdownMenuItem key={m} onClick={() => setModel(m)}>
                          <span className="flex-1">{m}</span>
                          {model === m && <Check className="size-4 text-brand" />}
                        </DropdownMenuItem>
                      ))}
                    </div>
                  ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="flex items-center gap-2">
                  <Brain className="size-3.5" /> Reasoning effort
                </DropdownMenuLabel>
                <div className="flex gap-1 px-2 pb-2">
                  {efforts.map((e) => (
                    <button
                      key={e}
                      onClick={() => setEffort(e)}
                      className={cn(
                        "flex-1 rounded-lg px-2 py-1 text-xs",
                        effort === e ? "bg-primary text-primary-foreground" : "bg-muted",
                      )}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div
          className={cn(
            "relative min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6",
            bgClass[chatBackground],
          )}
        >
          {turns.length === 0 ? (
            <Welcome name={user?.name.split(" ")[0] ?? "there"} onPick={(t, k) => send(t, k)} />
          ) : (
            <div className="mx-auto max-w-3xl space-y-8">
              {turns.map((t) => (
                <AnswerTurn key={t.id} turn={t} onGenerate={(k) => send(t.question, k)} />
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
                <button
                  type="button"
                  onClick={() => setWeb((w) => !w)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                    web
                      ? "border-brand bg-brand/12 text-brand"
                      : "border-border text-muted-foreground",
                  )}
                >
                  <Globe className="size-3" /> Web
                </button>
                {scopeSources.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleScope(s)}
                    title={sourceLabel[s]}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-[11px] font-medium",
                      scope.includes(s)
                        ? "border-brand bg-brand/12 text-brand"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    <BrandLogo id={sourceLogo[s]} size="xs" className="rounded-full" />
                    <span className="hidden sm:inline">{sourceLabel[s]}</span>
                  </button>
                ))}
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {scope.length ? `${scope.length} sources` : "All sources"}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    toast("Listening…", { description: "Voice input with live transcription" })
                  }
                  className="grid size-8 place-items-center rounded-xl hover:bg-muted"
                  aria-label="Voice input"
                >
                  <Mic className="size-4 text-muted-foreground" />
                </button>
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

type SourceCard = {
  n: number;
  title: string;
  source: string;
  snippet: string;
  updated: string;
  path?: string;
};
type TurnState = {
  steps: { tool: Step["tool"]; label: string; detail: string }[];
  paragraphs: { text: string; cites: number[] }[];
  streamingText: string;
  sources: SourceCard[];
  verification: { supported: number; total: number } | null;
  done: boolean;
  summary: string;
  artifactKind?: ArtifactKind;
  artifactId?: string;
};

const relTime = (epoch?: number) => {
  if (!epoch) return "";
  const mins = Math.max(0, (Date.now() / 1000 - epoch) / 60);
  if (mins < 60) return `${Math.round(mins)} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} d ago`;
};

const sourceMeta = (source: string) => ({
  logo: (sourceLogo as Record<string, string>)[source] ?? source,
  label:
    (sourceLabel as Record<string, string>)[source] ??
    source.charAt(0).toUpperCase() + source.slice(1),
});

function reduceEvent(prev: TurnState, ev: Record<string, unknown>): TurnState {
  switch (ev["type"]) {
    case "step":
      return {
        ...prev,
        steps: [
          ...prev.steps,
          {
            tool: ev["tool"] as Step["tool"],
            label: String(ev["label"]),
            detail: String(ev["detail"] ?? ""),
          },
        ],
      };
    case "delta":
      return { ...prev, streamingText: prev.streamingText + String(ev["text"] ?? "") };
    case "answer":
      return {
        ...prev,
        paragraphs: (ev["paragraphs"] as TurnState["paragraphs"]) ?? [],
        streamingText: "",
      };
    case "sources":
      return {
        ...prev,
        sources: ((ev["sources"] as Record<string, unknown>[]) ?? []).map((s) => ({
          n: Number(s["n"]),
          title: String(s["title"]),
          source: String(s["source"]),
          snippet: String(s["snippet"] ?? ""),
          updated: relTime(s["updatedAt"] as number),
          path: s["path"] as string,
        })),
      };
    case "verification":
      return {
        ...prev,
        verification: { supported: Number(ev["supported"]), total: Number(ev["total"]) },
      };
    case "artifact":
      return {
        ...prev,
        artifactKind: ev["kind"] as ArtifactKind,
        artifactId: String(ev["artifactId"]),
      };
    case "done":
      return {
        ...prev,
        done: true,
        summary: `Worked through ${prev.steps.length} steps · ${(Number(ev["latencyMs"] ?? 0) / 1000).toFixed(1)}s · $${Number(ev["cost"] ?? 0).toFixed(4)}${ev["cached"] ? " · cached" : ""}`,
      };
    case "error":
      return { ...prev, done: true, summary: `Error: ${ev["message"]}` };
    default:
      return prev;
  }
}

const EMPTY: TurnState = {
  steps: [],
  paragraphs: [],
  streamingText: "",
  sources: [],
  verification: null,
  done: false,
  summary: "Working…",
};

function useTurn(turn: Turn): TurnState {
  const [state, setState] = useState<TurnState>(EMPTY);

  useEffect(() => {
    const ctrl = new AbortController();
    apiStream(
      "/api/assistant/ask",
      {
        query: turn.question,
        mode: turn.mode,
        artifact: turn.artifact,
        sources: turn.scope.length ? turn.scope : undefined,
      },
      (ev) => setState((prev) => reduceEvent(prev, ev)),
      ctrl.signal,
    ).catch(() => setState((p) => ({ ...p, done: true, summary: "Couldn't reach the backend" })));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}

function AnswerTurn({ turn, onGenerate }: { turn: Turn; onGenerate: (k: ArtifactKind) => void }) {
  const state = useTurn(turn);
  const [focused, setFocused] = useState<number | null>(null);
  const done = state.done;
  const artifactKind = state.artifactKind ?? turn.artifact;

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
          {done ? state.summary : "Working…"}
        </p>
        <ol className="space-y-1.5">
          <AnimatePresence initial={false}>
            {state.steps.map((s, i) => {
              const Icon = stepIcon[s.tool] ?? Search;
              return (
                <motion.li
                  key={`${s.label}-${i}`}
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
        {state.paragraphs.length === 0 && state.streamingText && (
          <p className="text-muted-foreground">{state.streamingText}</p>
        )}
        {state.paragraphs.map((p, i) => (
          <motion.p key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            {p.text.replace(/\[(\d+)\]/g, "")}
            {p.cites.map((c) => (
              <button
                key={c}
                onMouseEnter={() => setFocused(c)}
                onMouseLeave={() => setFocused(null)}
                onClick={() => setFocused(c)}
                className="ml-1 inline-grid min-w-5 place-items-center rounded-md bg-brand/12 px-1 align-text-top text-[10px] font-bold text-brand"
              >
                {c}
              </button>
            ))}
          </motion.p>
        ))}
      </div>

      {done && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {state.sources.map((s) => {
              const meta = sourceMeta(s.source);
              return (
                <div
                  key={s.n}
                  className={cn(
                    "rounded-2xl border p-3 transition-colors",
                    focused === s.n ? "border-brand bg-brand/5" : "border-border",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-brand">{s.n}</span>
                    <BrandLogo id={meta.logo} size="xs" />
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {meta.label}
                    </span>
                    <span className="ml-auto text-[10px] text-muted-foreground">{s.updated}</span>
                  </div>
                  <p className="mt-1.5 truncate text-sm font-medium">{s.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{s.snippet}</p>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {state.verification && (
              <Pill
                tone={
                  state.verification.supported === state.verification.total ? "success" : "warning"
                }
              >
                <ShieldCheck className="size-3" /> {state.verification.supported}/
                {state.verification.total} claims verified
              </Pill>
            )}
            {state.artifactId && artifactKind && (
              <a
                href={downloadUrl(`/api/artifacts/${state.artifactId}/download`)}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
              >
                <FileText className="size-3.5" /> Download {artifactMeta[artifactKind].ext}
              </a>
            )}
            {(Object.keys(artifactMeta) as ArtifactKind[])
              .filter((k) => k !== artifactKind)
              .map((k) => {
                const M = artifactMeta[k];
                return (
                  <button
                    key={k}
                    onClick={() => onGenerate(k)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted"
                  >
                    <M.icon className="size-3.5" /> Turn into {M.label.toLowerCase()}
                  </button>
                );
              })}
            <button
              onClick={() => {
                const text = state.paragraphs.map((p) => p.text).join("\n\n");
                navigator.clipboard?.writeText(text);
                toast("Copied answer with citations");
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted"
            >
              <FileText className="size-3.5" /> Copy with citations
            </button>
          </div>
          <MessageToolbar />
        </motion.div>
      )}
    </div>
  );
}

function MessageToolbar() {
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const actions = [
    {
      label: "Good response",
      icon: ThumbsUp,
      active: vote === "up",
      run: () => setVote(vote === "up" ? null : "up"),
    },
    {
      label: "Bad response",
      icon: ThumbsDown,
      active: vote === "down",
      run: () => {
        setVote(vote === "down" ? null : "down");
        if (vote !== "down") toast("Thanks — feedback goes to the quality dashboard");
      },
    },
    { label: "Copy", icon: Copy, active: false, run: () => toast("Copied answer") },
    { label: "Read aloud", icon: Volume2, active: false, run: () => toast("Reading aloud…") },
    {
      label: "Retry with another model",
      icon: RotateCcw,
      active: false,
      run: () => toast("Regenerating…"),
    },
  ];
  return (
    <div className="flex items-center gap-0.5 text-muted-foreground">
      {actions.map((a) => (
        <button
          key={a.label}
          title={a.label}
          aria-label={a.label}
          onClick={a.run}
          className={cn(
            "grid size-8 place-items-center rounded-lg hover:bg-muted hover:text-foreground",
            a.active && "text-brand",
          )}
        >
          <a.icon className="size-4" />
        </button>
      ))}
    </div>
  );
}

/** Ring showing how much of the context window the conversation uses. */
function ContextMeter({ used }: { used: number }) {
  const r = 7;
  const c = 2 * Math.PI * r;
  return (
    <span
      title={`Context ${used}% used — older turns are compacted automatically`}
      className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
    >
      <svg viewBox="0 0 18 18" className="size-4 -rotate-90">
        <circle cx="9" cy="9" r={r} fill="none" stroke="var(--border)" strokeWidth="2.5" />
        <motion.circle
          cx="9"
          cy="9"
          r={r}
          fill="none"
          stroke={used > 80 ? "var(--warning)" : "var(--brand)"}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={c}
          animate={{ strokeDashoffset: c - (c * used) / 100 }}
        />
      </svg>
      <span className="hidden md:inline">{used}%</span>
    </span>
  );
}
