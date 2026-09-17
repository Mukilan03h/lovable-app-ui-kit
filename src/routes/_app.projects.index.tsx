import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { LayoutGrid, Rows3 } from "lucide-react";
import { Guard } from "@/components/app/Guard";
import { Avatar, Bar, Panel, PageHeader, Pill } from "@/components/app/ui-bits";
import { PageTransition, StaggerGroup } from "@/lib/motion";
import { currency, memberById, projects, statusLabel, type Project } from "@/data/mock";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/projects/")({
  head: () => ({
    meta: [
      { title: "Projects — Enaz Project Tracker" },
      { name: "description", content: "Browse every project with progress, budget, owner and status." },
      { property: "og:title", content: "Projects — Enaz Project Tracker" },
      { property: "og:description", content: "Progress, budget, owner and status for every project." },
    ],
  }),
  component: () => (
    <Guard permission="projects" area="Projects">
      <ProjectsPage />
    </Guard>
  ),
});

const statuses: (Project["status"] | "all")[] = ["all", "in-progress", "completed", "not-started", "on-hold"];

const statusTone = (s: Project["status"]) =>
  s === "completed" ? "success" : s === "on-hold" ? "warning" : s === "not-started" ? "neutral" : "brand";

function ProjectsPage() {
  const [view, setView] = useState<"grid" | "table">("grid");
  const [filter, setFilter] = useState<Project["status"] | "all">("all");

  const list = projects.filter((p) => filter === "all" || p.status === filter);

  return (
    <PageTransition className="space-y-6">
      <PageHeader
        eyebrow="Delivery"
        title="Projects"
        actions={
          <div className="flex gap-1 rounded-xl border border-border p-1">
            <button
              onClick={() => setView("grid")}
              aria-label="Grid view"
              className={cn("grid size-8 place-items-center rounded-lg", view === "grid" && "bg-accent")}
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              onClick={() => setView("table")}
              aria-label="Table view"
              className={cn("grid size-8 place-items-center rounded-lg", view === "table" && "bg-accent")}
            >
              <Rows3 className="size-4" />
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        {statuses.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              "rounded-full border border-border px-3.5 py-1.5 text-xs font-medium capitalize transition-colors",
              filter === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
            )}
          >
            {s === "all" ? "All" : statusLabel[s]}
          </button>
        ))}
      </div>

      {view === "grid" ? (
        <StaggerGroup className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => (
            <Panel key={p.id} className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link to="/projects/$id" params={{ id: p.id }} className="truncate text-base font-semibold hover:underline">
                    {p.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">{p.client} · {p.tag}</p>
                </div>
                <Pill tone={statusTone(p.status)}>{statusLabel[p.status]}</Pill>
              </div>
              <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
              <div>
                <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                  <span>Progress</span>
                  <span>{p.progress}%</span>
                </div>
                <Bar value={p.progress} tone={p.status === "completed" ? "success" : "brand"} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex -space-x-2">
                  {p.members.map((m) => (
                    <Avatar key={m} initials={memberById(m)?.avatar ?? "?"} className="size-8 ring-2 ring-card" />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">Due {p.due}</span>
              </div>
            </Panel>
          ))}
        </StaggerGroup>
      ) : (
        <Panel className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Project</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Progress</th>
                <th className="px-5 py-3">Budget</th>
                <th className="px-5 py-3">Due</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3">
                    <Link to="/projects/$id" params={{ id: p.id }} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{p.client}</p>
                  </td>
                  <td className="px-5 py-3"><Pill tone={statusTone(p.status)}>{statusLabel[p.status]}</Pill></td>
                  <td className="w-40 px-5 py-3"><Bar value={p.progress} /></td>
                  <td className="px-5 py-3">{currency(p.budget)}</td>
                  <td className="px-5 py-3 text-muted-foreground">{p.due}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </PageTransition>
  );
}
