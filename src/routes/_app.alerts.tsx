import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  BellRing,
  Check,
  ExternalLink,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Guard } from "@/components/app/Guard";
import { PageHeader, Panel, Pill } from "@/components/app/ui-bits";
import { PageTransition, StaggerGroup } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { api, type AlertCheck, type AlertRow } from "@/lib/api";

export const Route = createFileRoute("/_app/alerts")({
  head: () => ({
    meta: [
      { title: "Knowledge alerts — Enaz Knowledge" },
      { name: "description", content: "Subscribe to a search and get told when the answer changes." },
      { property: "og:title", content: "Knowledge alerts — Enaz Knowledge" },
      { property: "og:description", content: "Saved searches that surface what's new or changed." },
    ],
  }),
  component: () => (
    <Guard permission="search" area="Knowledge alerts">
      <AlertsPage />
    </Guard>
  ),
});

const relTime = (epoch: number | null) => {
  if (!epoch) return "never";
  const mins = Math.max(0, (Date.now() / 1000 - epoch) / 60);
  if (mins < 1) return "just now";
  if (mins < 60) return `${Math.round(mins)}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};

function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const [checking, setChecking] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, AlertCheck>>({});

  const load = () =>
    api.alerts().then((r) => { setAlerts(r.alerts); setError(null); })
      .catch(() => setError("Couldn't load your alerts."));

  useEffect(() => { void load(); }, []);

  const create = async () => {
    if (!query.trim()) return;
    setBusy(true);
    try {
      await api.createAlert({ name: name.trim() || query.trim(), query: query.trim() });
      setName(""); setQuery(""); setCreating(false);
      await load();
      toast("Alert created — we're tracking it now");
    } catch {
      toast.error("Couldn't create that alert.");
    } finally {
      setBusy(false);
    }
  };

  const check = async (id: string) => {
    setChecking(id);
    try {
      const res = await api.checkAlert(id);
      setResults((r) => ({ ...r, [id]: res }));
      const n = res.new + res.changed;
      toast(n > 0 ? `${res.new} new · ${res.changed} changed` : "Nothing new since last check");
      await load();
    } catch {
      toast.error("Check failed.");
    } finally {
      setChecking(null);
    }
  };

  const toggle = async (a: AlertRow) => {
    try {
      await api.patchAlert(a.id, !a.enabled);
      await load();
    } catch {
      toast.error("Couldn't update the alert.");
    }
  };

  const remove = async (id: string) => {
    try {
      await api.deleteAlert(id);
      setResults((r) => { const n = { ...r }; delete n[id]; return n; });
      await load();
    } catch {
      toast.error("Couldn't delete the alert.");
    }
  };

  return (
    <PageTransition>
      <PageHeader
        eyebrow="Stay ahead of changes"
        title="Knowledge alerts"
        actions={
          <button
            onClick={() => setCreating((v) => !v)}
            className="inline-flex items-center gap-2 rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="size-4" /> New alert
          </button>
        }
      />

      {creating && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
          <Panel className="mt-4">
            <div className="grid gap-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="What do you want to watch? (e.g. GA launch blockers)"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
              />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name (optional)"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setCreating(false)} className="rounded-xl border border-border px-3 py-2 text-sm hover:bg-muted">Cancel</button>
                <button
                  onClick={() => void create()}
                  disabled={busy || !query.trim()}
                  className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  Create alert
                </button>
              </div>
            </div>
          </Panel>
        </motion.div>
      )}

      {error && (
        <div className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
      )}

      <StaggerGroup className="mt-4 grid gap-3">
        {alerts.length === 0 && !error && (
          <Panel>
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <BellRing className="size-7" />
              <p className="text-sm">No alerts yet. Subscribe to a search to get told when it changes.</p>
            </div>
          </Panel>
        )}
        {alerts.map((a) => {
          const res = results[a.id];
          return (
            <Panel key={a.id} className={cn(!a.enabled && "opacity-60")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-base font-semibold">{a.name}</h2>
                    {!a.enabled && <Pill tone="neutral">Paused</Pill>}
                  </div>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Sparkles className="size-3.5" /> {a.query}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Tracking {a.tracked} doc{a.tracked === 1 ? "" : "s"} · checked {relTime(a.lastChecked)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => void check(a.id)}
                    disabled={checking === a.id}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    <RefreshCw className={cn("size-3.5", checking === a.id && "animate-spin")} /> Check now
                  </button>
                  <button onClick={() => void toggle(a)} title={a.enabled ? "Pause" : "Resume"} className="rounded-xl border border-border px-2.5 py-1.5 text-sm hover:bg-muted">
                    {a.enabled ? "Pause" : "Resume"}
                  </button>
                  <button onClick={() => void remove(a.id)} title="Delete" className="rounded-xl border border-border p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>

              {res && (
                <div className="mt-4 border-t border-border pt-3">
                  <div className="mb-2 flex items-center gap-2 text-xs">
                    {res.new > 0 && <Pill tone="success">{res.new} new</Pill>}
                    {res.changed > 0 && <Pill tone="warning">{res.changed} changed</Pill>}
                    {res.new + res.changed === 0 && (
                      <span className="flex items-center gap-1 text-muted-foreground"><Check className="size-3.5" /> up to date</span>
                    )}
                  </div>
                  <ul className="grid gap-1.5">
                    {res.hits.slice(0, 8).map((h) => (
                      <li key={h.docId} className="flex items-center gap-2 text-sm">
                        {h.status === "new" && <Pill tone="success">new</Pill>}
                        {h.status === "changed" && <Pill tone="warning">changed</Pill>}
                        <span className="truncate">{h.title}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">· {h.source}</span>
                        {h.url && (
                          <a href={h.url} target="_blank" rel="noreferrer" className="shrink-0 text-muted-foreground hover:text-brand">
                            <ExternalLink className="size-3.5" />
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>
          );
        })}
      </StaggerGroup>
    </PageTransition>
  );
}
