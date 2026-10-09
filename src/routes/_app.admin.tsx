import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  ArrowUpRight,
  Blocks,
  BookCheck,
  Bot,
  BrainCircuit,
  Cpu,
  CreditCard,
  Database,
  FileClock,
  Gauge,
  Globe,
  ImageIcon,
  KeyRound,
  Layers,
  LineChart,
  Mic,
  Network,
  Palette,
  Plug,
  Plus,
  Puzzle,
  RefreshCw,
  Search,
  Shield,
  SlidersHorizontal,
  Terminal,
  UserCog,
  Users,
  Webhook,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { Guard } from "@/components/app/Guard";
import { BrandLogo } from "@/components/app/BrandLogo";
import { Avatar, Bar, PageHeader, Pill } from "@/components/app/ui-bits";
import {
  SelectField,
  SettingRow,
  SettingsSection,
  Segmented,
  TextField,
  Toggle,
} from "@/components/app/settings-ui";
import { Slider } from "@/components/ui/slider";
import { PageTransition } from "@/lib/motion";
import { accents } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type {
  AdminOverview,
  AdminUser,
  AuditRow,
  ConnectorRow,
  EvalMetrics,
  GroupRow,
  SsoRow,
  VerifiedRow,
} from "@/lib/api";
import { sourceLabel, sourceLogo, type SourceApp } from "@/data/knowledge";

export const Route = createFileRoute("/_app/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Enaz Knowledge" },
      {
        name: "description",
        content: "Models, knowledge, agents, integrations, access, branding and usage controls.",
      },
      { property: "og:title", content: "Admin — Enaz Knowledge" },
      { property: "og:description", content: "Workspace administration for Enaz Knowledge." },
    ],
  }),
  component: () => (
    <Guard permission="admin" area="The admin console">
      <AdminPage />
    </Guard>
  ),
});

type Item = { id: string; label: string; icon: typeof Cpu; to?: string; badge?: string };

const sections: { title: string; items: Item[] }[] = [
  {
    title: "AI & Models",
    items: [
      { id: "models", label: "Language models", icon: Cpu },
      { id: "routing", label: "Model routing & cost", icon: Gauge, badge: "Enaz" },
      { id: "websearch", label: "Web search", icon: Globe },
      { id: "image", label: "Image generation", icon: ImageIcon },
      { id: "voice", label: "Voice", icon: Mic },
      { id: "sandbox", label: "Code sandbox", icon: Terminal },
      { id: "chatprefs", label: "Chat defaults", icon: SlidersHorizontal },
    ],
  },
  {
    title: "Knowledge",
    items: [
      { id: "connectors", label: "Connectors", icon: Plug, to: "/connectors" },
      { id: "index", label: "Index & retrieval", icon: Database },
      { id: "indexing", label: "Indexing status", icon: RefreshCw },
      { id: "docsets", label: "Document sets", icon: Layers },
      { id: "standard", label: "Verified answers", icon: BookCheck },
      { id: "graph", label: "Enterprise graph", icon: Network, badge: "Enaz" },
    ],
  },
  {
    title: "Agents & Actions",
    items: [
      { id: "agents", label: "Agents", icon: Bot, to: "/agents" },
      { id: "mcp", label: "MCP servers", icon: Blocks },
      { id: "openapi", label: "OpenAPI actions", icon: Workflow },
      { id: "skills", label: "Skills", icon: Puzzle },
    ],
  },
  {
    title: "Integrations",
    items: [
      { id: "bots", label: "Slack, Teams & Discord", icon: Bot },
      { id: "embed", label: "Widget & extension", icon: Puzzle },
      { id: "hooks", label: "Webhooks & hooks", icon: Webhook },
    ],
  },
  {
    title: "People & Access",
    items: [
      { id: "users", label: "Users", icon: Users },
      { id: "groups", label: "Groups", icon: UserCog },
      { id: "sso", label: "SSO & SCIM", icon: KeyRound },
    ],
  },
  {
    title: "Organization",
    items: [
      { id: "branding", label: "Appearance & branding", icon: Palette },
      { id: "security", label: "Security & compliance", icon: Shield },
      { id: "billing", label: "Plan & billing", icon: CreditCard },
    ],
  },
  {
    title: "Usage",
    items: [
      { id: "analytics", label: "Analytics", icon: LineChart, to: "/insights" },
      { id: "history", label: "Query history", icon: FileClock },
      { id: "tracing", label: "Tracing", icon: Activity },
      { id: "evals", label: "Evaluations", icon: BrainCircuit, badge: "Enaz" },
    ],
  },
];

const allItems = sections.flatMap((s) => s.items);

function AdminPage() {
  const [active, setActive] = useState("models");
  const [query, setQuery] = useState("");
  const item = allItems.find((i) => i.id === active) ?? allItems[0]!;

  return (
    <PageTransition className="space-y-6">
      <PageHeader eyebrow="Workspace administration" title="Admin console" />
      <div className="grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
          <label className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
            <Search className="size-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a setting"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
          <nav className="flex gap-4 overflow-x-auto lg:block lg:space-y-4">
            {sections.map((s) => {
              const items = s.items.filter((i) =>
                i.label.toLowerCase().includes(query.toLowerCase()),
              );
              if (!items.length) return null;
              return (
                <div key={s.title} className="shrink-0">
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {s.title}
                  </p>
                  {items.map((i) => {
                    const content = (
                      <>
                        {active === i.id && !i.to && (
                          <motion.span
                            layoutId="admin-nav"
                            className="absolute inset-0 rounded-xl bg-muted"
                          />
                        )}
                        <i.icon className="relative size-4" />
                        <span className="relative flex-1">{i.label}</span>
                        {i.badge && (
                          <span className="relative rounded-md bg-brand/12 px-1.5 text-[10px] font-semibold text-brand">
                            New
                          </span>
                        )}
                        {i.to && <ArrowUpRight className="relative size-3.5" />}
                      </>
                    );
                    const cls = cn(
                      "relative flex w-full items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-left text-sm",
                      active === i.id && !i.to
                        ? "text-foreground"
                        : "text-muted-foreground hover:bg-muted",
                    );
                    return i.to ? (
                      <Link key={i.id} to={i.to} className={cls}>
                        {content}
                      </Link>
                    ) : (
                      <button key={i.id} onClick={() => setActive(i.id)} className={cls}>
                        {content}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </nav>
        </aside>

        <AnimatePresence mode="wait">
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="min-w-0 space-y-5"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-2xl bg-brand/12 text-brand">
                <item.icon className="size-5" />
              </span>
              <h2 className="text-xl font-semibold">{item.label}</h2>
            </div>
            {panels[item.id]?.() ?? <ComingSoon />}
          </motion.div>
        </AnimatePresence>
      </div>
    </PageTransition>
  );
}

function ComingSoon() {
  return (
    <SettingsSection
      title="Not configured"
      description="This area is designed in the plan; the UI ships next."
    >
      <div className="py-4 text-sm text-muted-foreground">See docs/PLAN.md for the full spec.</div>
    </SettingsSection>
  );
}

function Btn({
  children,
  onClick,
  primary,
}: {
  children: ReactNode;
  onClick?: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold",
        primary ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function useFlags<T extends Record<string, boolean>>(initial: T) {
  const [flags, setFlags] = useState(initial);
  return (k: keyof T, label: string) => (
    <Toggle
      label={label}
      checked={Boolean(flags[k])}
      onChange={(v) => setFlags((f) => ({ ...f, [k]: v }))}
    />
  );
}

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

/** Initials from a name or email. */
function initials(who: string): string {
  const base = who.includes("@") ? (who.split("@")[0] ?? who) : who;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  const chars = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return (chars || base.slice(0, 2)).toUpperCase();
}

/** Metric values may arrive as a 0–1 fraction or a 0–100 percentage. */
function pct(x: number): number {
  return Math.round(x <= 1 ? x * 100 : x);
}

/** Small data-loader hook: loads once, exposes loading/error and a reload. */
function useFetch<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    loader()
      .then(setData)
      .catch(() => setError("Couldn't reach the backend. Please try again."))
      .finally(() => setLoading(false));
    // loader only closes over the stable `api` client
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(reload, [reload]);
  return { data, loading, error, reload, setData };
}

function PanelLoading() {
  return (
    <div className="space-y-2 py-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-2xl border border-border bg-muted/40" />
      ))}
    </div>
  );
}

function PanelError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
      {message}{" "}
      <button onClick={onRetry} className="font-semibold underline">
        Retry
      </button>
    </div>
  );
}

function PanelEmpty({ message }: { message: string }) {
  return <div className="py-6 text-center text-sm text-muted-foreground">{message}</div>;
}

function ModelsPanel() {
  const { data, loading, error, reload } = useFetch<AdminOverview>(() => api.adminOverview());
  const entries = data ? Object.entries(data.llm.models) : [];
  return (
    <SettingsSection
      title="Active models"
      description="Models resolved by the router for each task."
      action={
        data?.llm.offline ? (
          <Pill tone="info">Offline · air-gapped</Pill>
        ) : (
          <Pill tone="success">Online</Pill>
        )
      }
    >
      {loading ? (
        <PanelLoading />
      ) : error ? (
        <PanelError message={error} onRetry={reload} />
      ) : entries.length === 0 ? (
        <PanelEmpty message="No models configured." />
      ) : (
        entries.map(([role, model]) => (
          <div key={role} className="flex flex-wrap items-center gap-3 py-3">
            <span className="grid size-9 place-items-center rounded-xl bg-brand/12 text-brand">
              <Cpu className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold capitalize">{role}</p>
              <p className="truncate text-xs text-muted-foreground">{model}</p>
            </div>
            <Btn onClick={() => toast(`Configure ${role}`)}>Configure</Btn>
          </div>
        ))
      )}
    </SettingsSection>
  );
}

function RoutingPanel() {
  const rows = [
    { task: "Router, query rewrite, chunk context", model: "haiku", share: 71 },
    { task: "Standard answers", model: "sonnet", share: 24 },
    { task: "Deep research & artifact authoring", model: "opus", share: 5 },
  ];
  const [budget, setBudget] = useState(2500);
  const flag = useFlags({ cache: true, semantic: true, escalate: true });
  return (
    <>
      <SettingsSection
        title="Route by task"
        description="Most calls go to the smallest model that can do the job."
      >
        {rows.map((r) => (
          <div
            key={r.task}
            className="grid gap-3 py-3 sm:grid-cols-[1fr_200px_120px] sm:items-center"
          >
            <p className="text-sm font-medium">{r.task}</p>
            <SelectField
              value={r.model}
              onChange={() => toast("Routing updated")}
              options={[
                { value: "haiku", label: "Claude Haiku 5.5" },
                { value: "sonnet", label: "Claude Sonnet 5.5" },
                { value: "opus", label: "Claude Opus 5.5" },
                { value: "local", label: "Local (Ollama)" },
              ]}
            />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Bar value={r.share} /> {r.share}%
            </div>
          </div>
        ))}
      </SettingsSection>
      <SettingsSection title="Cost controls">
        <SettingRow
          label="Prompt caching"
          description="Reuse system prompts, tools and long documents."
        >
          {flag("cache", "Prompt caching")}
        </SettingRow>
        <SettingRow
          label="Semantic answer cache"
          description="Keyed by the asker's permission set."
        >
          {flag("semantic", "Semantic cache")}
        </SettingRow>
        <SettingRow
          label="Escalate on low confidence"
          description="Retry with a larger model when evidence is weak."
        >
          {flag("escalate", "Escalate")}
        </SettingRow>
        <SettingRow
          label="Monthly budget"
          description={`$${budget.toLocaleString()} — alerts at 80%`}
        >
          <Slider
            className="w-full sm:w-56"
            value={[budget]}
            min={500}
            max={10000}
            step={250}
            onValueChange={(v) => setBudget(v[0] ?? 500)}
          />
        </SettingRow>
      </SettingsSection>
    </>
  );
}

function ProviderList({
  items,
}: {
  items: { logo: string; name: string; note: string; on?: boolean }[];
}) {
  const [on, setOn] = useState(() => Object.fromEntries(items.map((i) => [i.name, Boolean(i.on)])));
  return (
    <>
      {items.map((i) => (
        <div key={i.name} className="flex items-center gap-3 py-3">
          <BrandLogo id={i.logo} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{i.name}</p>
            <p className="text-xs text-muted-foreground">{i.note}</p>
          </div>
          <Toggle
            label={i.name}
            checked={on[i.name] ?? false}
            onChange={(v) => setOn((s) => ({ ...s, [i.name]: v }))}
          />
        </div>
      ))}
    </>
  );
}

function IndexPanel() {
  const [alpha, setAlpha] = useState(0.55);
  const [chunk, setChunk] = useState(512);
  const [embed, setEmbed] = useState("voyage");
  const [rerank, setRerank] = useState("cohere");
  const flag = useFlags({
    contextual: true,
    visual: true,
    sparse: true,
    dedupe: true,
    ocr: true,
    pii: false,
  });
  return (
    <>
      <SettingsSection title="Retrieval">
        <SettingRow label="Embedding model">
          <SelectField
            value={embed}
            onChange={setEmbed}
            options={[
              { value: "voyage", label: "Voyage (hosted)" },
              { value: "cohere", label: "Cohere Embed (hosted)" },
              { value: "bge", label: "BGE-M3 (self-hosted)" },
              { value: "qwen", label: "Qwen3-Embedding (self-hosted)" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Reranker">
          <SelectField
            value={rerank}
            onChange={setRerank}
            options={[
              { value: "cohere", label: "Cohere Rerank" },
              { value: "voyage", label: "Voyage Rerank" },
              { value: "bge", label: "bge-reranker (self-hosted)" },
              { value: "none", label: "Off" },
            ]}
          />
        </SettingRow>
        <SettingRow
          label="Keyword ↔ semantic balance"
          description={`${Math.round((1 - alpha) * 100)}% keyword · ${Math.round(alpha * 100)}% semantic`}
        >
          <Slider
            className="w-full sm:w-56"
            value={[alpha]}
            min={0}
            max={1}
            step={0.05}
            onValueChange={(v) => setAlpha(v[0] ?? 0.5)}
          />
        </SettingRow>
        <SettingRow
          label="Learned sparse signal"
          description="Better on jargon, IDs and error codes."
        >
          {flag("sparse", "Sparse")}
        </SettingRow>
        <SettingRow
          label="Contextual chunk headers"
          description="Prefix each chunk with document context before indexing."
        >
          {flag("contextual", "Contextual")}
        </SettingRow>
        <SettingRow
          label="Visual page retrieval"
          description="Match slides, charts and scanned pages as images."
        >
          {flag("visual", "Visual")}
        </SettingRow>
      </SettingsSection>
      <SettingsSection title="Processing">
        <SettingRow label="Chunk size" description={`${chunk} tokens`}>
          <Segmented
            id="chunk"
            value={String(chunk)}
            onChange={(v) => setChunk(Number(v))}
            options={["256", "512", "768", "1024"].map((v) => ({ value: v, label: v }))}
          />
        </SettingRow>
        <SettingRow label="OCR for scans & images">{flag("ocr", "OCR")}</SettingRow>
        <SettingRow label="Near-duplicate removal">{flag("dedupe", "Dedupe")}</SettingRow>
        <SettingRow label="Redact PII before indexing">{flag("pii", "PII")}</SettingRow>
      </SettingsSection>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <span className="text-xs text-muted-foreground">
          Re-index estimate: 643K docs · ~3h · $41
        </span>
        <Btn
          primary
          onClick={() =>
            toast("Re-index scheduled", {
              description: "Runs in the background; search stays live.",
            })
          }
        >
          <RefreshCw className="size-3.5" /> Apply & re-index
        </Btn>
      </div>
    </>
  );
}

function IndexingPanel() {
  const { data, loading, error, reload } = useFetch(() => api.connectors());
  const rows: ConnectorRow[] = (data?.connected ?? []).filter((c) => c.status !== "available");
  return (
    <SettingsSection title="Sources">
      {loading ? (
        <PanelLoading />
      ) : error ? (
        <PanelError message={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <PanelEmpty message="No connected sources yet." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Source</th>
                <th className="py-2 font-medium">Docs</th>
                <th className="py-2 font-medium">Last run</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="flex items-center gap-2 py-2.5">
                    <BrandLogo id={sourceLogo[c.type as SourceApp] ?? c.type} size="xs" />{" "}
                    {sourceLabel[c.type as SourceApp] ?? c.name}
                  </td>
                  <td className="py-2.5 tabular-nums">{c.docs.toLocaleString()}</td>
                  <td className="py-2.5 text-muted-foreground">
                    {c.status === "syncing" ? "syncing…" : relTime(c.lastSync)}
                  </td>
                  <td className="py-2.5">
                    <Pill
                      tone={
                        c.status === "healthy"
                          ? "success"
                          : c.status === "error"
                            ? "danger"
                            : "info"
                      }
                      className="capitalize"
                    >
                      {c.status}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SettingsSection>
  );
}

function StandardPanel() {
  const { data, loading, error, reload } = useFetch<{ answers: VerifiedRow[] }>(() =>
    api.adminVerified(),
  );
  const items = data?.answers ?? [];
  return (
    <SettingsSection
      title="Verified answers"
      description="Curated answers shown first, with an owner and a review date."
      action={
        <Btn primary onClick={() => toast("New verified answer")}>
          <Plus className="size-3.5" /> New answer
        </Btn>
      }
    >
      {loading ? (
        <PanelLoading />
      ) : error ? (
        <PanelError message={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <PanelEmpty message="No verified answers yet." />
      ) : (
        items.map((i) => (
          <div key={i.id} className="py-3">
            <div className="flex items-center gap-2">
              <p className="flex-1 text-sm font-medium">{i.question}</p>
              <Pill>{i.category}</Pill>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{i.answer}</p>
          </div>
        ))
      )}
    </SettingsSection>
  );
}

function GraphPanel() {
  const flag = useFlags({ people: true, projects: true, customers: true, llm: false });
  return (
    <SettingsSection
      title="Entities"
      description="Built from metadata for free; LLM extraction is opt-in per corpus."
    >
      <SettingRow label="People & expertise">{flag("people", "People")}</SettingRow>
      <SettingRow label="Projects & tickets">{flag("projects", "Projects")}</SettingRow>
      <SettingRow label="Customers & accounts">{flag("customers", "Customers")}</SettingRow>
      <SettingRow
        label="LLM relation extraction"
        description="Contracts, PRDs and postmortems only. ~$18 one-time."
      >
        {flag("llm", "LLM extraction")}
      </SettingRow>
    </SettingsSection>
  );
}

function McpPanel() {
  const servers = [
    { id: "custom", name: "PagerDuty MCP", tools: 9, auth: "OAuth per user" },
    { id: "linear", name: "Linear MCP", tools: 14, auth: "OAuth per user" },
    { id: "github", name: "GitHub MCP", tools: 22, auth: "Service account" },
  ];
  return (
    <SettingsSection
      title="Connected MCP servers"
      description="Tools are allow-listed per agent; actions with side effects need approval."
      action={
        <Btn primary>
          <Plus className="size-3.5" /> Add server
        </Btn>
      }
    >
      {servers.map((s) => (
        <div key={s.name} className="flex items-center gap-3 py-3">
          <BrandLogo id={s.id} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{s.name}</p>
            <p className="text-xs text-muted-foreground">
              {s.tools} tools · {s.auth}
            </p>
          </div>
          <Pill tone="success">Healthy</Pill>
        </div>
      ))}
    </SettingsSection>
  );
}

function BotsPanel() {
  return (
    <SettingsSection
      title="Chat apps"
      description="Same permissions as the web app; answers cite sources inline."
    >
      <ProviderList
        items={[
          {
            logo: "slack",
            name: "Slack bot",
            note: "12 channels · auto-answer in #help-*",
            on: true,
          },
          { logo: "teams", name: "Microsoft Teams bot", note: "Not installed" },
          { logo: "discord", name: "Discord bot", note: "Community server" },
        ]}
      />
    </SettingsSection>
  );
}

function UsersPanel() {
  const { data, loading, error, reload, setData } = useFetch<{ users: AdminUser[] }>(() =>
    api.adminUsers(),
  );
  const users = data?.users ?? [];

  async function patch(u: AdminUser, body: { role?: string; disabled?: boolean }) {
    try {
      await api.updateUser(u.id, body);
      setData((prev) =>
        prev
          ? { users: prev.users.map((x) => (x.id === u.id ? { ...x, ...body } : x)) }
          : prev,
      );
      toast(`Updated ${u.name}`);
    } catch {
      toast.error(`Couldn't update ${u.name}`);
      reload();
    }
  }

  return (
    <SettingsSection
      title={loading ? "Users" : `${users.length} users`}
      action={
        <Btn primary onClick={() => toast("Invite teammate")}>
          <Plus className="size-3.5" /> Invite
        </Btn>
      }
    >
      {loading ? (
        <PanelLoading />
      ) : error ? (
        <PanelError message={error} onRetry={reload} />
      ) : users.length === 0 ? (
        <PanelEmpty message="No users found." />
      ) : (
        users.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-3 py-3">
            <Avatar initials={m.avatar || initials(m.name || m.email)} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-medium">
                {m.name}
                {m.disabled && <Pill tone="danger">Disabled</Pill>}
              </p>
              <p className="truncate text-xs text-muted-foreground">{m.email}</p>
            </div>
            <SelectField
              value={m.role}
              onChange={(role) => void patch(m, { role })}
              options={[
                { value: "admin", label: "Admin" },
                { value: "manager", label: "Curator" },
                { value: "member", label: "Member" },
                { value: "client", label: "Guest" },
              ]}
            />
            <Toggle
              label={`Enable ${m.name}`}
              checked={!m.disabled}
              onChange={(v) => void patch(m, { disabled: !v })}
            />
          </div>
        ))
      )}
    </SettingsSection>
  );
}

function SsoPanel() {
  const { data, loading, error, reload } = useFetch<{ providers: SsoRow[] }>(() => api.adminSso());
  const providers = data?.providers ?? [];
  return (
    <>
      <SettingsSection title="Single sign-on">
        {loading ? (
          <PanelLoading />
        ) : error ? (
          <PanelError message={error} onRetry={reload} />
        ) : providers.length === 0 ? (
          <PanelEmpty message="No identity providers configured." />
        ) : (
          providers.map((p) => (
            <div key={p.id} className="flex items-center gap-3 py-3">
              <BrandLogo id={p.type} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{p.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {p.issuer ?? "Not configured"}
                </p>
              </div>
              {p.enabled ? <Pill tone="success">Enabled</Pill> : <Pill>Off</Pill>}
            </div>
          ))
        )}
      </SettingsSection>
      <SettingsSection
        title="SCIM provisioning"
        description="Sync users and groups from your identity provider."
      >
        <SettingRow label="SCIM endpoint">
          <code className="rounded-lg bg-muted px-2 py-1 text-xs">
            https://enaz.example.com/scim/v2
          </code>
        </SettingRow>
        <SettingRow label="Bearer token">
          <Btn onClick={() => toast("New SCIM token generated")}>Regenerate</Btn>
        </SettingRow>
      </SettingsSection>
    </>
  );
}

function BrandingPanel() {
  const [name, setName] = useState("Enaz Knowledge");
  const [greeting, setGreeting] = useState("What can I find for you today?");
  const [announcement, setAnnouncement] = useState("");
  const [footer, setFooter] = useState("AI answers can be wrong — check the cited sources.");
  const [accent, setAccent] = useState("violet");
  const flag = useFlags({ consent: false, firstVisit: true });
  return (
    <>
      <SettingsSection title="White label">
        <SettingRow label="App name" description="Replaces “Enaz” across the product.">
          <TextField value={name} onChange={setName} className="sm:w-72" />
        </SettingRow>
        <SettingRow label="Logo" description="SVG or PNG, shown in the rail and login page.">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-primary text-sm font-bold text-primary-foreground">
              {name.slice(0, 1).toLowerCase()}
            </span>
            <Btn>Upload</Btn>
          </div>
        </SettingRow>
        <SettingRow label="Default accent for new users">
          <div className="flex gap-2">
            {accents.map((a) => (
              <button
                key={a.id}
                onClick={() => setAccent(a.id)}
                aria-label={a.label}
                className={cn(
                  "size-7 rounded-full ring-offset-2 ring-offset-card",
                  accent === a.id && "ring-2 ring-foreground",
                )}
                style={{ background: a.swatch }}
              />
            ))}
          </div>
        </SettingRow>
        <SettingRow label="Home greeting">
          <TextField value={greeting} onChange={setGreeting} className="sm:w-72" />
        </SettingRow>
      </SettingsSection>
      <SettingsSection title="Notices">
        <SettingRow
          label="Announcement banner"
          description="Dismissible banner for all users."
          stack
        >
          <TextField
            value={announcement}
            onChange={setAnnouncement}
            placeholder="e.g. SharePoint search is back to normal"
          />
        </SettingRow>
        <SettingRow label="Chat footer" stack>
          <TextField value={footer} onChange={setFooter} />
        </SettingRow>
        <SettingRow label="Require consent to a usage notice">
          {flag("consent", "Consent")}
        </SettingRow>
        <SettingRow label="First-visit welcome tour">{flag("firstVisit", "Tour")}</SettingRow>
      </SettingsSection>
    </>
  );
}

function SecurityPanel() {
  const [retention, setRetention] = useState("365");
  const flag = useFlags({
    injection: true,
    approvals: true,
    audit: true,
    egress: true,
    byok: false,
    residency: true,
  });
  return (
    <>
      <SettingsSection title="AI safety">
        <SettingRow
          label="Prompt-injection guard"
          description="Treat indexed content as data, never as instructions."
        >
          {flag("injection", "Injection guard")}
        </SettingRow>
        <SettingRow
          label="Approve side-effect actions"
          description="Posting, emailing and writes always ask first."
        >
          {flag("approvals", "Approvals")}
        </SettingRow>
        <SettingRow label="Restrict agent network egress">{flag("egress", "Egress")}</SettingRow>
      </SettingsSection>
      <SettingsSection title="Data">
        <SettingRow label="Chat retention">
          <SelectField
            value={retention}
            onChange={setRetention}
            options={[
              { value: "30", label: "30 days" },
              { value: "90", label: "90 days" },
              { value: "365", label: "1 year" },
              { value: "forever", label: "Forever" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Audit log of queries, reads and actions">
          {flag("audit", "Audit")}
        </SettingRow>
        <SettingRow label="Customer-managed encryption keys">{flag("byok", "BYOK")}</SettingRow>
        <SettingRow label="Keep data in region (EU / IN / US)">
          {flag("residency", "Residency")}
        </SettingRow>
      </SettingsSection>
      <SettingsSection title="Rate limits">
        <SettingRow label="Per user" description="Tokens per hour">
          <Segmented
            id="rl"
            value="200k"
            onChange={() => toast("Limit updated")}
            options={["50k", "200k", "1M", "None"].map((v) => ({ value: v, label: v }))}
          />
        </SettingRow>
      </SettingsSection>
    </>
  );
}

function BillingPanel() {
  const { data, loading, error, reload } = useFetch<AdminOverview>(() => api.adminOverview());
  if (loading)
    return (
      <SettingsSection title="Plan & billing">
        <PanelLoading />
      </SettingsSection>
    );
  if (error)
    return (
      <SettingsSection title="Plan & billing">
        <PanelError message={error} onRetry={reload} />
      </SettingsSection>
    );
  return (
    <SettingsSection
      title={data ? `${data.plan} plan` : "Plan & billing"}
      description="$24 per user / month · billed yearly"
    >
      <SettingRow label="Seats">
        <span className="text-sm tabular-nums">{data?.users ?? 0} users</span>
      </SettingRow>
      <SettingRow label="Groups">
        <span className="text-sm tabular-nums">{data?.groups ?? 0}</span>
      </SettingRow>
      <SettingRow label="Knowledge indexed">
        <span className="text-sm tabular-nums">
          {(data?.documents ?? 0).toLocaleString()} docs · {(data?.chunks ?? 0).toLocaleString()}{" "}
          chunks
        </span>
      </SettingRow>
      <SettingRow label="Connectors">
        <span className="text-sm tabular-nums">{data?.connectors ?? 0} connected</span>
      </SettingRow>
      <SettingRow label="Self-hosting">
        <Pill tone="success">Included · permission sync free</Pill>
      </SettingRow>
    </SettingsSection>
  );
}

function HistoryPanel() {
  const { data, loading, error, reload } = useFetch<{ log: AuditRow[] }>(() => api.auditLog());
  const rows = data?.log ?? [];
  return (
    <SettingsSection
      title="Recent activity"
      description="Visible to admins only; retention follows Security settings."
    >
      {loading ? (
        <PanelLoading />
      ) : error ? (
        <PanelError message={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <PanelEmpty message="No activity recorded yet." />
      ) : (
        rows.map((r, i) => (
          <div key={`${r.action}-${r.createdAt}-${i}`} className="flex items-center gap-3 py-3">
            <Avatar initials={initials(r.user)} className="size-7" />
            <p className="min-w-0 flex-1 truncate text-sm">
              <span className="font-medium">{r.user}</span>{" "}
              <span className="text-muted-foreground">{r.action}</span> {r.target}
            </p>
            <span className="text-xs text-muted-foreground">{relTime(r.createdAt)}</span>
          </div>
        ))
      )}
    </SettingsSection>
  );
}

function EvalsPanel() {
  const { data, loading, error, reload, setData } = useFetch<{ runs: EvalMetrics[] }>(() =>
    api.evalHistory(),
  );
  const [running, setRunning] = useState(false);
  const runs = data?.runs ?? [];

  async function run() {
    setRunning(true);
    try {
      const result = await api.runEval();
      setData((prev) => ({ runs: [result, ...(prev?.runs ?? [])] }));
      toast("Evaluation complete", {
        description: `${pct(result.recallAt10)}% recall@10 · ${pct(result.citationRate)}% cited`,
      });
    } catch {
      toast.error("Evaluation failed to run");
      reload();
    } finally {
      setRunning(false);
    }
  }

  return (
    <SettingsSection
      title="Quality gate"
      description="No model, prompt or ranking change ships if the golden set regresses."
      action={
        <Btn primary onClick={run}>
          {running ? "Running…" : "Run evaluation"}
        </Btn>
      }
    >
      {loading ? (
        <PanelLoading />
      ) : error ? (
        <PanelError message={error} onRetry={reload} />
      ) : runs.length === 0 ? (
        <PanelEmpty message="No evaluation runs yet — run one to start the history." />
      ) : (
        runs.map((r, i) => {
          const recall = pct(r.recallAt10);
          return (
            <div
              key={`${r.name}-${r.createdAt ?? i}`}
              className="grid gap-2 py-3 sm:grid-cols-[1fr_160px_160px] sm:items-center"
            >
              <p className="text-sm font-medium">
                {r.name} · {r.questions} questions{" "}
                {r.createdAt && (
                  <span className="text-xs text-muted-foreground">· {relTime(r.createdAt)}</span>
                )}
              </p>
              <div className="flex items-center gap-2 text-xs">
                <Bar value={recall} tone={recall >= 80 ? "success" : "warning"} /> {recall}% recall
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Bar value={pct(r.citationRate)} /> {pct(r.citationRate)}% cited
              </div>
            </div>
          );
        })
      )}
    </SettingsSection>
  );
}

function GroupsPanel() {
  const { data, loading, error, reload } = useFetch<{ groups: GroupRow[] }>(() =>
    api.adminGroups(),
  );
  const groups = data?.groups ?? [];
  return (
    <SettingsSection title={loading ? "Groups" : `${groups.length} groups`}>
      {loading ? (
        <PanelLoading />
      ) : error ? (
        <PanelError message={error} onRetry={reload} />
      ) : groups.length === 0 ? (
        <PanelEmpty message="No groups yet." />
      ) : (
        groups.map((g) => (
          <div key={g.id} className="flex items-center gap-3 py-3">
            <span className="grid size-9 place-items-center rounded-xl bg-brand/12 text-brand">
              <UserCog className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{g.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {g.members.toLocaleString()} members · synced from {g.source}
              </p>
            </div>
          </div>
        ))
      )}
    </SettingsSection>
  );
}

function SimpleToggles({ title, rows }: { title: string; rows: [string, string?][] }) {
  const [on, setOn] = useState(() => rows.map((_, i) => i % 3 !== 2));
  return (
    <SettingsSection title={title}>
      {rows.map(([label, description], i) => (
        <SettingRow key={label} label={label} {...(description ? { description } : {})}>
          <Toggle
            label={label}
            checked={on[i] ?? false}
            onChange={(v) => setOn((s) => s.map((x, j) => (j === i ? v : x)))}
          />
        </SettingRow>
      ))}
    </SettingsSection>
  );
}

const panels: Record<string, () => ReactNode> = {
  models: () => <ModelsPanel />,
  routing: () => <RoutingPanel />,
  websearch: () => (
    <SettingsSection title="Search providers" description="Used when users turn on Web.">
      <ProviderList
        items={[
          { logo: "web", name: "Built-in crawler", note: "Free · respects robots.txt", on: true },
          { logo: "custom", name: "Brave Search", note: "API key" },
          { logo: "custom", name: "Google Programmable Search", note: "API key" },
          { logo: "custom", name: "Exa / Firecrawl", note: "Neural search and page extraction" },
          { logo: "custom", name: "SearXNG (self-hosted)", note: "Private metasearch" },
        ]}
      />
    </SettingsSection>
  ),
  image: () => (
    <SimpleToggles
      title="Image generation"
      rows={[
        ["Allow image generation in chat"],
        ["Use brand palette in generated images"],
        ["Watermark generated images"],
      ]}
    />
  ),
  voice: () => (
    <SimpleToggles
      title="Voice"
      rows={[
        ["Speech-to-text input"],
        ["Read-aloud answers"],
        ["Store voice recordings", "Off keeps only transcripts"],
      ]}
    />
  ),
  sandbox: () => (
    <SimpleToggles
      title="Code sandbox"
      rows={[
        ["Enable Python sandbox", "Isolated microVM per session"],
        ["Allow package installs"],
        ["Allow internet access from sandbox"],
        ["Persist files between sessions"],
      ]}
    />
  ),
  chatprefs: () => (
    <SimpleToggles
      title="Workspace chat defaults"
      rows={[
        ["Let users choose models"],
        ["Show research steps by default"],
        ["Suggest artifacts after answers"],
        ["Allow sharing chats outside workspace"],
        ["Allow file uploads"],
      ]}
    />
  ),
  index: () => <IndexPanel />,
  indexing: () => <IndexingPanel />,
  docsets: () => (
    <SimpleToggles
      title="Document sets"
      rows={[
        ["Engineering handbook", "Confluence › ENG · 1,204 docs"],
        ["Sales collateral", "Drive › Sales · 380 docs"],
        ["HR policies", "SharePoint › HR · 96 docs"],
      ]}
    />
  ),
  standard: () => <StandardPanel />,
  graph: () => <GraphPanel />,
  mcp: () => <McpPanel />,
  openapi: () => (
    <SimpleToggles
      title="OpenAPI actions"
      rows={[
        ["Create Jira issue", "POST /issues"],
        ["Post to Slack", "POST /chat.postMessage"],
        ["Update Salesforce opportunity", "PATCH /opportunity"],
      ]}
    />
  ),
  skills: () => (
    <SimpleToggles
      title="Skills"
      rows={[
        ["Brand deck builder", "SKILL.md + template.pptx"],
        ["Financial model", "SKILL.md + formulas.xlsx"],
        ["Security questionnaire", "SKILL.md + approved answers"],
      ]}
    />
  ),
  bots: () => <BotsPanel />,
  embed: () => (
    <SimpleToggles
      title="Distribution"
      rows={[
        ["Chrome extension", "Sidebar answers on any page"],
        ["Embeddable widget", "Add search to your intranet"],
        ["Desktop app"],
      ]}
    />
  ),
  hooks: () => (
    <SimpleToggles
      title="Hooks"
      rows={[
        ["Pre-answer hook", "Call your API before answering"],
        ["Post-answer webhook"],
        ["Agent run events"],
      ]}
    />
  ),
  users: () => <UsersPanel />,
  groups: () => <GroupsPanel />,
  sso: () => <SsoPanel />,
  branding: () => <BrandingPanel />,
  security: () => <SecurityPanel />,
  billing: () => <BillingPanel />,
  history: () => <HistoryPanel />,
  tracing: () => (
    <SimpleToggles
      title="Tracing"
      rows={[
        ["OpenTelemetry export", "Every agent step as a span"],
        ["Log prompts and completions"],
        ["Send traces to Langfuse"],
      ]}
    />
  ),
  evals: () => <EvalsPanel />,
};
