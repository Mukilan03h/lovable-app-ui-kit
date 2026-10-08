import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bot, CalendarClock, MessageSquare, Play, Plus, Wrench, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { Guard } from "@/components/app/Guard";
import { artifactMeta } from "@/components/app/artifact-meta";
import { Bar, PageHeader, Pill } from "@/components/app/ui-bits";
import { PageTransition, StaggerGroup } from "@/lib/motion";
import { agents, type Agent } from "@/data/knowledge";

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

function AgentsPage() {
  const [selected, setSelected] = useState<Agent | null>(null);

  return (
    <PageTransition className="space-y-6">
      <PageHeader
        eyebrow="Automate knowledge work"
        title="Agents"
        actions={
          <button
            onClick={() =>
              toast("Agent builder", {
                description:
                  "Instructions · knowledge scope · tools (incl. MCP) · trigger · approvals",
              })
            }
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="size-4" /> New agent
          </button>
        }
      />

      <StaggerGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {agents.map((a) => {
          const TriggerIcon = triggerIcon(a.trigger);
          const Out = a.output === "answer" ? MessageSquare : artifactMeta[a.output].icon;
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
                  Recent runs
                </p>
                {[
                  "Succeeded · 2m 14s · $0.08",
                  "Succeeded · 1m 52s · $0.07",
                  "Needs approval · posting to #leadership",
                ].map((r) => (
                  <p key={r} className="rounded-xl border border-border px-3 py-2 text-xs">
                    {r}
                  </p>
                ))}
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
