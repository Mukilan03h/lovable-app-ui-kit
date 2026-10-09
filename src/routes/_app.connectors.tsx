import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  History,
  KeyRound,
  Layers,
  Lock,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Guard } from "@/components/app/Guard";
import { BrandLogo } from "@/components/app/BrandLogo";
import { Panel, PageHeader, Pill } from "@/components/app/ui-bits";
import { AnimatedNumber, PageTransition, StaggerGroup } from "@/lib/motion";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  api,
  type CatalogEntry,
  type ConnectorRow,
  type ConnectorsResponse,
  type CredentialRow,
  type DocumentSet,
  type IndexAttempt,
} from "@/lib/api";

export const Route = createFileRoute("/_app/connectors")({
  head: () => ({
    meta: [
      { title: "Connectors — Enaz Knowledge" },
      {
        name: "description",
        content: "Connect company apps with real-time sync and permission mirroring.",
      },
      { property: "og:title", content: "Connectors — Enaz Knowledge" },
      {
        property: "og:description",
        content: "Real-time sync and permission mirroring for every app.",
      },
    ],
  }),
  component: () => (
    <Guard permission="connectors" area="Connectors">
      <ConnectorsPage />
    </Guard>
  ),
});

const statusTone: Record<string, "success" | "info" | "danger" | "neutral"> = {
  healthy: "success",
  syncing: "info",
  error: "danger",
  available: "neutral",
};

const attemptTone: Record<string, "success" | "danger" | "warning" | "neutral"> = {
  success: "success",
  failed: "danger",
  in_progress: "warning",
};

const categories = [
  "All",
  "Messaging",
  "Storage",
  "Wiki & Docs",
  "Tickets & Projects",
  "Code",
  "Sales & CRM",
  "Other",
] as const;

/** Schedule options surfaced in the schedule selects. value is refreshFreqMinutes (0 = manual). */
const freqOptions = [
  { label: "Manual", value: 0 },
  { label: "15m", value: 15 },
  { label: "30m", value: 30 },
  { label: "1h", value: 60 },
  { label: "6h", value: 360 },
  { label: "24h", value: 1440 },
] as const;

/** Human label for a refresh frequency. */
const freqLabel = (min: number): string => {
  if (!min) return "Manual";
  if (min < 60) return `every ${min}m`;
  if (min < 1440) return `every ${Math.round(min / 60)}h`;
  return `every ${Math.round(min / 1440)}d`;
};

/** Map epoch seconds to a short relative (past) label. */
const relTime = (epoch: number | null): string => {
  if (!epoch) return "Never";
  const mins = Math.max(0, (Date.now() / 1000 - epoch) / 60);
  if (mins < 1) return "just now";
  if (mins < 60) return `${Math.round(mins)} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} d ago`;
};

/** Map a future epoch (seconds) to a short "in …" label. */
const relFuture = (epoch: number | null): string => {
  if (!epoch) return "—";
  const mins = (epoch - Date.now() / 1000) / 60;
  if (mins <= 0) return "due now";
  if (mins < 60) return `in ${Math.round(mins)} min`;
  if (mins < 1440) return `in ${Math.round(mins / 60)} h`;
  return `in ${Math.round(mins / 1440)} d`;
};

function ConnectorsPage() {
  const { can } = useAuth();
  const manage = can("connectors:manage");
  const [category, setCategory] = useState<(typeof categories)[number]>("All");
  const [query, setQuery] = useState("");

  const [data, setData] = useState<ConnectorsResponse | null>(null);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [credentials, setCredentials] = useState<CredentialRow[]>([]);
  const [documentSets, setDocumentSets] = useState<DocumentSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // per-connector expanded indexing history
  const [expanded, setExpanded] = useState<string | null>(null);
  // catalog connect dialog target
  const [connectTarget, setConnectTarget] = useState<CatalogEntry | null>(null);

  const load = () => {
    setError(null);
    return Promise.all([
      api.connectors(),
      api.connectorCatalog(),
      api.credentials(),
      api.documentSets(),
    ])
      .then(([conn, cat, cred, sets]) => {
        setData(conn);
        setCatalog(cat.connectors);
        setCredentials(cred.credentials);
        setDocumentSets(sets.documentSets);
      })
      .catch(() => setError("Couldn't reach the backend. Check your connection and try again."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connected = data?.connected ?? [];
  const totalDocs = data?.stats.documents ?? 0;
  const connectedTypes = new Set(connected.map((c) => c.type));
  const logoByType = new Map(catalog.map((c) => [c.type, c.logo]));
  const logoFor = (type: string) => logoByType.get(type) ?? type;
  const nameById = new Map(connected.map((c) => [c.id, c.name]));

  const resync = async (c: ConnectorRow) => {
    setBusy(c.id);
    // optimistic: flip to syncing
    setData((cur) =>
      cur
        ? { ...cur, connected: cur.connected.map((r) => (r.id === c.id ? { ...r, status: "syncing" } : r)) }
        : cur,
    );
    try {
      await api.syncConnector(c.id);
      toast.success(`Resync queued for ${c.name}`);
      await load();
    } catch {
      toast.error(`Couldn't resync ${c.name}`);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const remove = async (c: ConnectorRow) => {
    setBusy(c.id);
    // optimistic: drop the row
    setData((cur) =>
      cur ? { ...cur, connected: cur.connected.filter((r) => r.id !== c.id) } : cur,
    );
    try {
      await api.deleteConnector(c.id);
      toast.success(`Removed ${c.name}`);
      await load();
    } catch {
      toast.error(`Couldn't remove ${c.name}`);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const togglePause = async (c: ConnectorRow) => {
    setBusy(c.id);
    try {
      if (c.paused) {
        await api.resumeConnector(c.id);
        toast.success(`Resumed ${c.name}`);
      } else {
        await api.pauseConnector(c.id);
        toast.success(`Paused ${c.name}`);
      }
      await load();
    } catch {
      toast.error(`Couldn't update ${c.name}`);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const setFreq = async (c: ConnectorRow, min: number) => {
    setBusy(c.id);
    try {
      await api.patchConnector(c.id, { refreshFreqMinutes: min });
      toast.success(`${c.name} syncs ${freqLabel(min)}`);
      await load();
    } catch {
      toast.error(`Couldn't update schedule for ${c.name}`);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const createFromCatalog = async (
    entry: CatalogEntry,
    opts: { credentialId?: string; refreshFreqMinutes?: number },
  ) => {
    setBusy(entry.type);
    try {
      const body: {
        type: string;
        name?: string;
        credentialId?: string;
        refreshFreqMinutes?: number;
        sync?: boolean;
      } = { type: entry.type, name: entry.name, sync: true };
      if (opts.credentialId) body.credentialId = opts.credentialId;
      if (opts.refreshFreqMinutes !== undefined) body.refreshFreqMinutes = opts.refreshFreqMinutes;
      await api.createConnector(body);
      toast.success(`Connecting ${entry.name}`, {
        description: `${entry.sync === "Federated" ? "Searched live" : `Sync: ${entry.sync}`} · ${
          entry.acl ? "permissions mirrored" : "workspace-wide access"
        }`,
      });
      setConnectTarget(null);
      await load();
    } catch {
      toast.error(`Couldn't connect ${entry.name}`);
    } finally {
      setBusy(null);
    }
  };

  const catalogList = catalog.filter(
    (c) =>
      (category === "All" || c.category === category) &&
      c.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <PageTransition className="space-y-6">
      <PageHeader
        eyebrow="Knowledge sources"
        title="Connectors"
        actions={
          manage ? (
            <a
              href="#catalog"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              <Plus className="size-4" /> Add source
            </a>
          ) : (
            <Pill>
              <Lock className="size-3" /> View only
            </Pill>
          )
        }
      />

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{error}</span>
          <button onClick={() => void load()} className="ml-auto font-semibold underline">
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Loading connectors…</p>
      ) : (
        <>
          <StaggerGroup className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Documents indexed", value: totalDocs },
              { label: "Connected apps", value: connected.length },
              { label: "Median freshness (min)", value: 3 },
              {
                label: "Permission-synced",
                value: connected.filter((c) => c.permissionSync).length,
              },
            ].map((s) => (
              <Panel key={s.label}>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums">
                  <AnimatedNumber value={s.value} />
                </p>
              </Panel>
            ))}
          </StaggerGroup>

          <section className="space-y-3">
            <h2 className="text-base font-semibold">Connected</h2>
            {connected.length === 0 ? (
              <Panel>
                <p className="text-sm text-muted-foreground">
                  No sources connected yet. Add one from the catalog below to start indexing.
                </p>
              </Panel>
            ) : (
              <StaggerGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {connected.map((c) => (
                  <motion.div
                    key={c.id}
                    whileHover={{ y: -2 }}
                    className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]"
                  >
                    <div className="flex items-center gap-3">
                      <BrandLogo id={logoFor(c.type)} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Last sync {relTime(c.lastSync)}
                        </p>
                      </div>
                      <Pill tone={statusTone[c.status] ?? "neutral"} className="capitalize">
                        {c.status === "healthy" && <CheckCircle2 className="size-3" />}
                        {c.status === "syncing" && <RefreshCw className="size-3 animate-spin" />}
                        {c.status === "error" && <AlertTriangle className="size-3" />}
                        {c.status}
                      </Pill>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <Pill tone="neutral">
                        <Clock className="size-3" /> {freqLabel(c.refreshFreqMinutes)}
                      </Pill>
                      {c.paused && (
                        <Pill tone="warning">
                          <Pause className="size-3" /> Paused
                        </Pill>
                      )}
                      {!c.paused && c.refreshFreqMinutes > 0 && c.nextSync && (
                        <span className="text-[11px] text-muted-foreground">
                          next {relFuture(c.nextSync)}
                        </span>
                      )}
                    </div>

                    <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <dt className="text-muted-foreground">Docs</dt>
                        <dd className="font-semibold tabular-nums">{c.docs.toLocaleString()}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Freshness</dt>
                        <dd className="font-semibold">{c.freshness}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">ACLs</dt>
                        <dd
                          className={cn(
                            "flex items-center gap-1 font-semibold",
                            c.permissionSync ? "text-success" : "text-destructive",
                          )}
                        >
                          <ShieldCheck className="size-3" />
                          {c.permissionSync ? "Synced" : "Failing"}
                        </dd>
                      </div>
                    </dl>

                    <p className="mt-3 text-xs text-muted-foreground">
                      Last run <span className="font-semibold text-success">+{c.newDocs} new</span> ·{" "}
                      <span className="font-semibold text-foreground">{c.updatedDocs}</span> updated ·{" "}
                      <span className="font-semibold text-foreground">{c.removedDocs}</span> removed
                    </p>

                    {c.status === "error" && (
                      <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        {c.error ??
                          "Nested group expansion failed (depth > 3). Results from this source are hidden until ACLs resync."}
                      </p>
                    )}

                    <button
                      onClick={() => setExpanded((cur) => (cur === c.id ? null : c.id))}
                      className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                    >
                      <History className="size-3.5" /> Indexing history
                      <ChevronDown
                        className={cn("size-3.5 transition-transform", expanded === c.id && "rotate-180")}
                      />
                    </button>
                    {expanded === c.id && <AttemptHistory id={c.id} />}

                    {manage && (
                      <div className="mt-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <label className="flex flex-1 items-center gap-2 rounded-xl border border-border px-2 py-1.5 text-xs">
                            <Clock className="size-3.5 text-muted-foreground" />
                            <select
                              value={c.refreshFreqMinutes}
                              disabled={busy === c.id}
                              onChange={(e) => void setFreq(c, Number(e.target.value))}
                              className="min-w-0 flex-1 bg-transparent font-semibold outline-none disabled:opacity-50"
                            >
                              {freqOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            disabled={busy === c.id}
                            onClick={() => void togglePause(c)}
                            className="inline-flex items-center justify-center gap-1 rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                          >
                            {c.paused ? (
                              <>
                                <Play className="size-3.5" /> Resume
                              </>
                            ) : (
                              <>
                                <Pause className="size-3.5" /> Pause
                              </>
                            )}
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <button
                            disabled={busy === c.id}
                            onClick={() => void resync(c)}
                            className="flex-1 rounded-xl border border-border py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                          >
                            Resync
                          </button>
                          <button
                            disabled={busy === c.id}
                            onClick={() => void remove(c)}
                            className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl border border-border py-2 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
                          >
                            <Trash2 className="size-3.5" /> Remove
                          </button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </StaggerGroup>
            )}
          </section>

          <CredentialsSection
            credentials={credentials}
            manage={manage}
            onChanged={() => void load()}
          />

          <DocumentSetsSection
            documentSets={documentSets}
            connected={connected}
            nameById={nameById}
            manage={manage}
            onChanged={() => void load()}
          />

          <section id="catalog" className="scroll-mt-24 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Add a source</h2>
                <p className="text-sm text-muted-foreground">
                  {catalog.length} connectors. Index a source for speed, or search it live without
                  copying data.
                </p>
              </div>
              <label className="flex w-full items-center gap-2 rounded-full border border-border bg-card px-3 py-2 sm:w-64">
                <Search className="size-4 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find a connector"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </label>
            </div>

            <div className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={cn(
                    "relative shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground",
                    category === c && "text-primary-foreground",
                  )}
                >
                  {category === c && (
                    <motion.span
                      layoutId="catalog-cat"
                      className="absolute inset-0 rounded-full bg-primary"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  )}
                  <span className="relative">{c}</span>
                </button>
              ))}
            </div>

            <motion.div
              layout
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
            >
              {catalogList.map((c) => {
                const isConnected = connectedTypes.has(c.type);
                return (
                  <motion.button
                    layout
                    key={c.type}
                    whileHover={{ y: -2 }}
                    disabled={!manage || isConnected || busy === c.type}
                    onClick={() => setConnectTarget(c)}
                    className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-[var(--shadow-soft)] disabled:cursor-default"
                  >
                    <div className="flex w-full items-start justify-between">
                      <BrandLogo id={c.logo} />
                      {isConnected && <CheckCircle2 className="size-4 text-success" />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{c.name}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        {c.sync === "Webhook" || c.sync === "Federated" ? (
                          <Zap className="size-3" />
                        ) : (
                          <RefreshCw className="size-3" />
                        )}
                        {c.sync === "Federated" ? "Live search" : c.sync}
                        {c.acl && (
                          <>
                            <span>·</span>
                            <ShieldCheck className="size-3" /> ACL
                          </>
                        )}
                      </p>
                    </div>
                  </motion.button>
                );
              })}
            </motion.div>
          </section>
        </>
      )}

      {connectTarget && (
        <ConnectDialog
          entry={connectTarget}
          credentials={credentials}
          busy={busy === connectTarget.type}
          onClose={() => setConnectTarget(null)}
          onConfirm={(opts) => void createFromCatalog(connectTarget, opts)}
        />
      )}
    </PageTransition>
  );
}

/** Lazily-fetched index-attempt history for one connector. */
function AttemptHistory({ id }: { id: string }) {
  const [attempts, setAttempts] = useState<IndexAttempt[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setAttempts(null);
    setFailed(false);
    api
      .connectorAttempts(id)
      .then((r) => {
        if (active) setAttempts(r.attempts);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (failed) {
    return <p className="mt-3 text-xs text-destructive">Couldn't load indexing history.</p>;
  }
  if (!attempts) {
    return <p className="mt-3 text-xs text-muted-foreground">Loading history…</p>;
  }
  if (attempts.length === 0) {
    return <p className="mt-3 text-xs text-muted-foreground">No index attempts yet.</p>;
  }

  return (
    <ul className="mt-3 space-y-2 rounded-2xl border border-border bg-muted/30 p-3">
      {attempts.map((a) => (
        <li key={a.id} className="space-y-1 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={attemptTone[a.status] ?? "neutral"} className="capitalize">
              {a.status === "success" && <CheckCircle2 className="size-3" />}
              {a.status === "failed" && <AlertTriangle className="size-3" />}
              {a.status === "in_progress" && <RefreshCw className="size-3 animate-spin" />}
              {a.status.replace("_", " ")}
            </Pill>
            <span className="capitalize text-muted-foreground">{a.trigger}</span>
            <span className="ml-auto text-muted-foreground">{relTime(a.startedAt)}</span>
          </div>
          <p className="text-muted-foreground">
            <span className="font-semibold text-success">+{a.new} new</span> · {a.updated} updated ·{" "}
            {a.removed} removed
          </p>
          {a.error && <p className="text-destructive">{a.error}</p>}
        </li>
      ))}
    </ul>
  );
}

/** Credentials card list with create + delete. Secret values are never displayed. */
function CredentialsSection({
  credentials,
  manage,
  onChanged,
}: {
  credentials: CredentialRow[];
  manage: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("");
  const [name, setName] = useState("");
  const [rows, setRows] = useState<{ key: string; value: string }[]>([
    { key: "token", value: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reset = () => {
    setType("");
    setName("");
    setRows([{ key: "token", value: "" }]);
    setOpen(false);
  };

  const create = async () => {
    if (!type.trim() || !name.trim()) {
      toast.error("Type and name are required");
      return;
    }
    const secret: Record<string, unknown> = {};
    rows.forEach((r) => {
      if (r.key.trim()) secret[r.key.trim()] = r.value;
    });
    if (Object.keys(secret).length === 0) {
      toast.error("Add at least one secret key");
      return;
    }
    setSaving(true);
    try {
      await api.createCredential({ type: type.trim(), name: name.trim(), secret });
      toast.success(`Saved credential ${name.trim()}`);
      reset();
      onChanged();
    } catch {
      toast.error("Couldn't save credential");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: CredentialRow) => {
    setBusyId(c.id);
    try {
      await api.deleteCredential(c.id);
      toast.success(`Removed ${c.name}`);
      onChanged();
    } catch {
      toast.error(`Couldn't remove ${c.name}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <KeyRound className="size-4" /> Credentials
        </span>
      }
      action={
        manage ? (
          <button
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
          >
            <Plus className="size-3.5" /> New credential
          </button>
        ) : undefined
      }
    >
      {manage && open && (
        <div className="mb-4 space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Type</span>
              <input
                value={type}
                onChange={(e) => setType(e.target.value)}
                placeholder="e.g. slack"
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Prod bot token"
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none"
              />
            </label>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Secret keys</p>
            {rows.map((r, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={r.key}
                  onChange={(e) =>
                    setRows((cur) => cur.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))
                  }
                  placeholder="key"
                  className="w-32 rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none"
                />
                <input
                  value={r.value}
                  type="password"
                  onChange={(e) =>
                    setRows((cur) => cur.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                  }
                  placeholder="value"
                  className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none"
                />
                <button
                  onClick={() => setRows((cur) => (cur.length > 1 ? cur.filter((_, j) => j !== i) : cur))}
                  className="rounded-xl border border-border px-2 text-muted-foreground hover:bg-muted"
                  aria-label="Remove key"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            <button
              onClick={() => setRows((cur) => [...cur, { key: "", value: "" }])}
              className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-3.5" /> Add key
            </button>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={reset} className="rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:bg-muted">
              Cancel
            </button>
            <button
              disabled={saving}
              onClick={() => void create()}
              className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              Save credential
            </button>
          </div>
        </div>
      )}

      {credentials.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No credentials yet. Store a token or API key to authenticate a connector.
        </p>
      ) : (
        <ul className="space-y-2">
          {credentials.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3"
            >
              <KeyRound className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{c.name}</p>
                <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="capitalize">{c.type}</span>
                  {c.keys.map((k) => (
                    <span key={k} className="rounded-full bg-muted px-2 py-0.5 font-mono">
                      {k}
                    </span>
                  ))}
                </p>
              </div>
              {manage && (
                <button
                  disabled={busyId === c.id}
                  onClick={() => void remove(c)}
                  className="rounded-xl border border-border p-2 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  aria-label={`Remove ${c.name}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** Document sets list with create + delete and a connector multiselect. */
function DocumentSetsSection({
  documentSets,
  connected,
  nameById,
  manage,
  onChanged,
}: {
  documentSets: DocumentSet[];
  connected: ConnectorRow[];
  nameById: Map<string, string>;
  manage: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setDescription("");
    setSelected([]);
    setOpen(false);
  };

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const create = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const body: { name: string; description?: string; connectorIds?: string[] } = {
        name: name.trim(),
      };
      if (description.trim()) body.description = description.trim();
      if (selected.length > 0) body.connectorIds = selected;
      await api.createDocumentSet(body);
      toast.success(`Created set ${name.trim()}`);
      reset();
      onChanged();
    } catch {
      toast.error("Couldn't create document set");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s: DocumentSet) => {
    setBusyId(s.id);
    try {
      await api.deleteDocumentSet(s.id);
      toast.success(`Removed ${s.name}`);
      onChanged();
    } catch {
      toast.error(`Couldn't remove ${s.name}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <Layers className="size-4" /> Document sets
        </span>
      }
      action={
        manage ? (
          <button
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
          >
            <Plus className="size-3.5" /> New set
          </button>
        ) : undefined
      }
    >
      {manage && open && (
        <div className="mb-4 space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
          <label className="block space-y-1 text-xs">
            <span className="text-muted-foreground">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Customer-facing docs"
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none"
            />
          </label>
          <label className="block space-y-1 text-xs">
            <span className="text-muted-foreground">Description</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none"
            />
          </label>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Connectors</p>
            {connected.length === 0 ? (
              <p className="text-xs text-muted-foreground">Connect a source first.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {connected.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => toggle(c.id)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium",
                      selected.includes(c.id)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={reset} className="rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:bg-muted">
              Cancel
            </button>
            <button
              disabled={saving}
              onClick={() => void create()}
              className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              Create set
            </button>
          </div>
        </div>
      )}

      {documentSets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No document sets yet. Group connectors into a set to scope search and permissions.
        </p>
      ) : (
        <ul className="space-y-2">
          {documentSets.map((s) => (
            <li
              key={s.id}
              className="flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3"
            >
              <Layers className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  {s.name}
                  <Pill tone="neutral">
                    {s.connectorIds.length} connector{s.connectorIds.length === 1 ? "" : "s"}
                  </Pill>
                </p>
                {s.description && (
                  <p className="truncate text-xs text-muted-foreground">{s.description}</p>
                )}
                {s.connectorIds.length > 0 && (
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {s.connectorIds.map((id) => nameById.get(id) ?? id).join(" · ")}
                  </p>
                )}
              </div>
              {manage && (
                <button
                  disabled={busyId === s.id}
                  onClick={() => void remove(s)}
                  className="rounded-xl border border-border p-2 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  aria-label={`Remove ${s.name}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** Lightweight dialog for configuring a connector before creating it from the catalog. */
function ConnectDialog({
  entry,
  credentials,
  busy,
  onClose,
  onConfirm,
}: {
  entry: CatalogEntry;
  credentials: CredentialRow[];
  busy: boolean;
  onClose: () => void;
  onConfirm: (opts: { credentialId?: string; refreshFreqMinutes?: number }) => void;
}) {
  const [credentialId, setCredentialId] = useState("");
  // -1 = use connector default; otherwise a refreshFreqMinutes value
  const [freq, setFreq] = useState(-1);

  const matching = credentials.filter((c) => c.type === entry.type);
  const others = credentials.filter((c) => c.type !== entry.type);

  const submit = () => {
    const opts: { credentialId?: string; refreshFreqMinutes?: number } = {};
    if (credentialId) opts.credentialId = credentialId;
    if (freq >= 0) opts.refreshFreqMinutes = freq;
    onConfirm(opts);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <BrandLogo id={entry.logo} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">Connect {entry.name}</p>
            <p className="text-xs text-muted-foreground">
              {entry.sync === "Federated" ? "Live search" : `Sync: ${entry.sync}`}
              {entry.acl && " · permissions mirrored"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-border p-2 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block space-y-1 text-xs">
            <span className="text-muted-foreground">Credential (optional)</span>
            <select
              value={credentialId}
              onChange={(e) => setCredentialId(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none"
            >
              <option value="">No credential</option>
              {matching.length > 0 && (
                <optgroup label={`${entry.type} credentials`}>
                  {matching.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {others.length > 0 && (
                <optgroup label="Other credentials">
                  {others.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.type} · {c.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>

          <label className="block space-y-1 text-xs">
            <span className="text-muted-foreground">Sync schedule (optional)</span>
            <select
              value={freq}
              onChange={(e) => setFreq(Number(e.target.value))}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none"
            >
              <option value={-1}>Connector default</option>
              {freqOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
          >
            Cancel
          </button>
          <button
            disabled={busy}
            onClick={submit}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Plus className="size-4" /> Connect
          </button>
        </div>
      </motion.div>
    </div>
  );
}
