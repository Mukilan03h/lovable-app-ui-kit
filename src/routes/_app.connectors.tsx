import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import { AlertTriangle, CheckCircle2, Lock, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Guard } from "@/components/app/Guard";
import { Panel, PageHeader, Pill } from "@/components/app/ui-bits";
import { AnimatedNumber, PageTransition, StaggerGroup } from "@/lib/motion";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { connectors, sourceLabel, sourceTint, type Connector } from "@/data/knowledge";

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

const statusTone: Record<Connector["status"], "success" | "info" | "danger" | "neutral"> = {
  healthy: "success",
  syncing: "info",
  error: "danger",
  available: "neutral",
};

function ConnectorsPage() {
  const { can } = useAuth();
  const manage = can("connectors:manage");
  const connected = connectors.filter((c) => c.status !== "available");
  const totalDocs = connected.reduce((n, c) => n + c.docs, 0);

  return (
    <PageTransition className="space-y-6">
      <PageHeader
        eyebrow="Knowledge sources"
        title="Connectors"
        actions={
          manage ? (
            <button
              onClick={() =>
                toast("Connector catalogue", {
                  description: "60+ connectors, plus any MCP server or REST/SQL source.",
                })
              }
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              <Plus className="size-4" /> Add source
            </button>
          ) : (
            <Pill>
              <Lock className="size-3" /> View only
            </Pill>
          )
        }
      />

      <StaggerGroup className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Documents indexed", value: totalDocs },
          { label: "Connected apps", value: connected.length },
          { label: "Median freshness (min)", value: 3 },
          { label: "Permission-synced", value: connected.filter((c) => c.permissionSync).length },
        ].map((s) => (
          <Panel key={s.label}>
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">
              <AnimatedNumber value={s.value} />
            </p>
          </Panel>
        ))}
      </StaggerGroup>

      <StaggerGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {connectors.map((c) => (
          <motion.div
            key={c.id}
            whileHover={{ y: -2 }}
            className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]"
          >
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "grid size-10 place-items-center rounded-2xl text-sm font-bold",
                  sourceTint[c.source],
                )}
              >
                {sourceLabel[c.source].slice(0, 2)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{sourceLabel[c.source]}</p>
                <p className="text-xs text-muted-foreground">
                  {c.status === "available" ? "Not connected" : `Last sync ${c.lastSync}`}
                </p>
              </div>
              <Pill tone={statusTone[c.status]} className="capitalize">
                {c.status === "healthy" && <CheckCircle2 className="size-3" />}
                {c.status === "syncing" && <RefreshCw className="size-3 animate-spin" />}
                {c.status === "error" && <AlertTriangle className="size-3" />}
                {c.status}
              </Pill>
            </div>

            {c.status !== "available" ? (
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
            ) : (
              <p className="mt-4 text-xs text-muted-foreground">
                Includes permission sync on every plan, including self-hosted.
              </p>
            )}

            {c.status === "error" && (
              <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
                Nested group expansion failed (depth &gt; 3). Results from this source are hidden
                until ACLs resync.
              </p>
            )}

            {manage && (
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() =>
                    toast(
                      c.status === "available"
                        ? `Connecting ${sourceLabel[c.source]}…`
                        : `Resync queued for ${sourceLabel[c.source]}`,
                    )
                  }
                  className="flex-1 rounded-xl border border-border py-2 text-xs font-semibold hover:bg-muted"
                >
                  {c.status === "available" ? "Connect" : "Resync"}
                </button>
                {c.status !== "available" && (
                  <button className="flex-1 rounded-xl border border-border py-2 text-xs font-semibold hover:bg-muted">
                    Scope & filters
                  </button>
                )}
              </div>
            )}
          </motion.div>
        ))}
      </StaggerGroup>
    </PageTransition>
  );
}
