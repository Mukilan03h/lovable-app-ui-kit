import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { FileText, Paperclip } from "lucide-react";
import { Guard } from "@/components/app/Guard";
import { Avatar, Bar, Panel, PageHeader, Pill } from "@/components/app/ui-bits";
import { PageTransition, StaggerGroup } from "@/lib/motion";
import {
  currency,
  events,
  invoices,
  memberById,
  projectById,
  statusLabel,
  taskStatusLabel,
  tasks,
} from "@/data/mock";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/projects/$id")({
  head: () => ({
    meta: [
      { title: "Project detail — Enaz Project Tracker" },
      { name: "description", content: "Overview, tasks, files and activity for a single project." },
      { property: "og:title", content: "Project detail — Enaz Project Tracker" },
      { property: "og:description", content: "Overview, tasks, files and activity for a project." },
    ],
  }),
  component: () => (
    <Guard permission="projects" area="Projects">
      <ProjectDetail />
    </Guard>
  ),
});

const tabs = ["Overview", "Tasks", "Files", "Activity"] as const;

function ProjectDetail() {
  const { id } = useParams({ from: "/_app/projects/$id" });
  const project = projectById(id);
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");

  if (!project) {
    return (
      <PageTransition className="grid min-h-[50vh] place-items-center">
        <div className="text-center">
          <p className="text-lg font-semibold">Project not found</p>
          <Link to="/projects" className="mt-3 inline-flex text-sm text-brand hover:underline">
            Back to projects
          </Link>
        </div>
      </PageTransition>
    );
  }

  const projectTasks = tasks.filter((t) => t.projectId === project.id);
  const projectInvoices = invoices.filter((i) => i.projectId === project.id);
  const projectEvents = events.filter((e) => e.projectId === project.id);

  return (
    <PageTransition className="space-y-6">
      <PageHeader
        eyebrow={`${project.client} · ${project.tag}`}
        title={project.name}
        actions={<Pill tone={project.status === "completed" ? "success" : "brand"}>{statusLabel[project.status]}</Pill>}
      />

      <div className="flex gap-1 overflow-x-auto rounded-full bg-muted p-1">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "shrink-0 rounded-full px-4 py-1.5 text-xs font-medium",
              tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <StaggerGroup className="grid gap-5 xl:grid-cols-3">
          <Panel className="xl:col-span-2" title="About this project">
            <p className="text-sm text-muted-foreground">{project.description}</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {[
                { l: "Budget", v: currency(project.budget) },
                { l: "Spent", v: currency(project.spent) },
                { l: "Remaining", v: currency(project.budget - project.spent) },
              ].map((x) => (
                <div key={x.l} className="rounded-2xl bg-muted p-4">
                  <p className="text-xs text-muted-foreground">{x.l}</p>
                  <p className="mt-1 text-lg font-semibold">{x.v}</p>
                </div>
              ))}
            </div>
            <div className="mt-6">
              <div className="mb-1.5 flex justify-between text-sm">
                <span className="text-muted-foreground">Completion</span>
                <span className="font-medium">{project.progress}%</span>
              </div>
              <Bar value={project.progress} />
            </div>
          </Panel>

          <div className="space-y-5">
            <Panel title="Team">
              <ul className="space-y-3">
                {project.members.map((m) => {
                  const member = memberById(m);
                  return (
                    <li key={m} className="flex items-center gap-3">
                      <Avatar initials={member?.avatar ?? "?"} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{member?.name}</p>
                        <p className="text-xs text-muted-foreground">{member?.title}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Panel>
            <Panel title="Timeline">
              <ul className="space-y-3 text-sm">
                <li className="flex justify-between"><span className="text-muted-foreground">Start</span><span>{project.start}</span></li>
                <li className="flex justify-between"><span className="text-muted-foreground">Due</span><span>{project.due}</span></li>
                {projectEvents.map((e) => (
                  <li key={e.id} className="flex justify-between gap-3">
                    <span className="truncate text-muted-foreground">{e.title}</span>
                    <span className="shrink-0">{e.date}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </StaggerGroup>
      )}

      {tab === "Tasks" && (
        <StaggerGroup className="grid gap-4 md:grid-cols-2">
          {projectTasks.map((t) => (
            <Panel key={t.id}>
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{t.title}</p>
                <Pill tone={t.status === "done" ? "success" : t.status === "review" ? "info" : "neutral"}>
                  {taskStatusLabel[t.status]}
                </Pill>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
              <div className="mt-4 flex items-center justify-between">
                <Avatar initials={memberById(t.assignee)?.avatar ?? "?"} className="size-7" />
                <span className="text-xs text-muted-foreground">Due {t.due}</span>
              </div>
            </Panel>
          ))}
          {projectTasks.length === 0 && <p className="text-sm text-muted-foreground">No tasks yet.</p>}
        </StaggerGroup>
      )}

      {tab === "Files" && (
        <StaggerGroup className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {["Brief.pdf", "Wireframes.fig", "Content-plan.xlsx", "Brand-assets.zip", "QA-checklist.pdf"].map((f) => (
            <Panel key={f} className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-muted"><FileText className="size-5" /></span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{f}</p>
                <p className="text-xs text-muted-foreground">Shared by {memberById(project.owner)?.name}</p>
              </div>
              <Paperclip className="ml-auto size-4 text-muted-foreground" />
            </Panel>
          ))}
        </StaggerGroup>
      )}

      {tab === "Activity" && (
        <Panel title="Recent activity">
          <ul className="space-y-4">
            {projectInvoices.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 text-sm">
                <span>Invoice {i.number} · {currency(i.amount)}</span>
                <Pill tone={i.status === "paid" ? "success" : i.status === "overdue" ? "danger" : "neutral"}>{i.status}</Pill>
              </li>
            ))}
            {projectTasks.slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{memberById(t.assignee)?.name} · {t.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{t.due}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </PageTransition>
  );
}
