import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "motion/react";
import { History, Link2 } from "lucide-react";
import { Guard } from "@/components/app/Guard";
import { artifactMeta } from "@/components/app/artifact-meta";
import { PageHeader } from "@/components/app/ui-bits";
import { PageTransition, StaggerGroup } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { artifactItems, type ArtifactKind } from "@/data/knowledge";

export const Route = createFileRoute("/_app/artifacts")({
  head: () => ({
    meta: [
      { title: "Artifacts — Enaz Knowledge" },
      {
        name: "description",
        content: "Slides, documents and spreadsheets generated from cited answers.",
      },
      { property: "og:title", content: "Artifacts — Enaz Knowledge" },
      {
        property: "og:description",
        content: "Generated slides, docs and sheets with versions and sources.",
      },
    ],
  }),
  component: () => (
    <Guard permission="artifacts" area="Artifacts">
      <ArtifactsPage />
    </Guard>
  ),
});

const previewTint: Record<ArtifactKind, string> = {
  slides: "from-brand/20 to-chart-3/10",
  doc: "from-info/15 to-background",
  sheet: "from-success/15 to-background",
};

function ArtifactsPage() {
  const [filter, setFilter] = useState<ArtifactKind | "all">("all");
  const items = artifactItems.filter((a) => filter === "all" || a.kind === filter);

  return (
    <PageTransition className="space-y-6">
      <PageHeader
        eyebrow="Work products"
        title="Artifacts"
        actions={
          <div className="flex gap-1 rounded-full bg-muted p-1">
            {(["all", "slides", "doc", "sheet"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium",
                  filter === k ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {k === "all" ? "All" : artifactMeta[k].label}
              </button>
            ))}
          </div>
        }
      />

      <StaggerGroup className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((a) => {
          const M = artifactMeta[a.kind];
          return (
            <motion.div
              key={a.id}
              layout
              whileHover={{ y: -3 }}
              className="overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-soft)]"
            >
              <Link to="/assistant" className="block">
                <div
                  className={cn(
                    "grid aspect-[16/8] place-items-center bg-gradient-to-br",
                    previewTint[a.kind],
                  )}
                >
                  <M.icon className="size-10 text-foreground/40" />
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate font-semibold">{a.title}</p>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold">
                      {M.ext}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {a.author} · {a.updated}
                  </p>
                  <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <History className="size-3.5" /> {a.versions} versions
                    </span>
                    <span className="flex items-center gap-1">
                      <Link2 className="size-3.5" /> {a.sources} sources
                    </span>
                  </div>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </StaggerGroup>
    </PageTransition>
  );
}
