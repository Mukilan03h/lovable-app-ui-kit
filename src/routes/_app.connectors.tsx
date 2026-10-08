import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "motion/react";
import {
  AlertTriangle,
  CheckCircle2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
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
  connectorCatalog,
  connectors,
  sourceLabel,
  sourceLogo,
  type CatalogCategory,
  type Connector,
} from "@/data/knowledge";

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

const categories: ("All" | CatalogCategory)[] = [
  "All",
  "Messaging",
  "Storage",
  "Wiki & Docs",
  "Tickets & Projects",
  "Code",
  "Sales & CRM",
  "Other",
];

function ConnectorsPage() {
  const { can } = useAuth();
  const manage = can("connectors:manage");
  const [category, setCategory] = useState<(typeof categories)[number]>("All");
  const [query, setQuery] = useState("");
  const connected = connectors.filter((c) => c.status !== "available");
  const totalDocs = connected.reduce((n, c) => n + c.docs, 0);
  const connectedNames = new Set(connected.map((c) => sourceLabel[c.source]));

  const catalog = connectorCatalog.filter(
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

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Connected</h2>
        <StaggerGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {connected.map((c) => (
            <motion.div
              key={c.id}
              whileHover={{ y: -2 }}
              className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]"
            >
              <div className="flex items-center gap-3">
                <BrandLogo id={sourceLogo[c.source]} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{sourceLabel[c.source]}</p>
                  <p className="text-xs text-muted-foreground">Last sync {c.lastSync}</p>
                </div>
                <Pill tone={statusTone[c.status]} className="capitalize">
                  {c.status === "healthy" && <CheckCircle2 className="size-3" />}
                  {c.status === "syncing" && <RefreshCw className="size-3 animate-spin" />}
                  {c.status === "error" && <AlertTriangle className="size-3" />}
                  {c.status}
                </Pill>
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

              {c.status === "error" && (
                <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  Nested group expansion failed (depth &gt; 3). Results from this source are hidden
                  until ACLs resync.
                </p>
              )}

              {manage && (
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => toast(`Resync queued for ${sourceLabel[c.source]}`)}
                    className="flex-1 rounded-xl border border-border py-2 text-xs font-semibold hover:bg-muted"
                  >
                    Resync
                  </button>
                  <button className="flex-1 rounded-xl border border-border py-2 text-xs font-semibold hover:bg-muted">
                    Scope & filters
                  </button>
                </div>
              )}
            </motion.div>
          ))}
        </StaggerGroup>
      </section>

      <section id="catalog" className="scroll-mt-24 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Add a source</h2>
            <p className="text-sm text-muted-foreground">
              {connectorCatalog.length} connectors. Index a source for speed, or search it live
              without copying data.
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
          {catalog.map((c) => {
            const isConnected = connectedNames.has(c.name);
            return (
              <motion.button
                layout
                key={c.name}
                whileHover={{ y: -2 }}
                disabled={!manage}
                onClick={() =>
                  toast(`Connect ${c.name}`, {
                    description: `${c.sync === "Federated" ? "Searched live" : `Sync: ${c.sync}`} · ${
                      c.acl ? "permissions mirrored" : "workspace-wide access"
                    }`,
                  })
                }
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
    </PageTransition>
  );
}
