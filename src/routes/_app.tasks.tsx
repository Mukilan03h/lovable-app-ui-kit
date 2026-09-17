import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { Guard } from "@/components/app/Guard";
import { Avatar, Panel, PageHeader, Pill } from "@/components/app/ui-bits";
import { PageTransition, StaggerGroup } from "@/lib/motion";
import { useAuth } from "@/lib/auth";
import { memberById, projectById, taskStatusLabel, tasks, type Task } from "@/data/mock";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks — Enaz Project Tracker" },
      { name: "description", content: "Kanban board and list view for every task, priority and due date." },
      { property: "og:title", content: "Tasks — Enaz Project Tracker" },
      { property: "og:description", content: "Kanban board and list view for every task." },
    ],
  }),
  component: () => (
    <Guard permission="tasks" area="Tasks">
      <TasksPage />
    </Guard>
  ),
});

const columns: Task["status"][] = ["todo", "in-progress", "review", "done"];

const priorityTone = (p: Task["priority"]) => (p === "high" ? "danger" : p === "medium" ? "warning" : "neutral");

function TasksPage() {
  const { user } = useAuth();
  const [view, setView] = useState<"board" | "list">("board");
  const [selected, setSelected] = useState<Task | null>(null);

  const visible = user?.role === "member" ? tasks.filter((t) => t.assignee === user.id) : tasks;

  return (
    <PageTransition className="space-y-6">
      <PageHeader
        eyebrow="Execution"
        title="Tasks"
        actions={
          <div className="flex gap-1 rounded-full bg-muted p-1">
            {(["board", "list"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-xs font-medium capitalize",
                  view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        }
      />

      {view === "board" ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
          <div className="grid min-w-[900px] grid-cols-4 gap-4">
            {columns.map((col) => {
              const items = visible.filter((t) => t.status === col);
              return (
                <div key={col} className="rounded-3xl bg-muted/60 p-3">
                  <div className="mb-3 flex items-center justify-between px-1">
                    <span className="text-sm font-semibold">{taskStatusLabel[col]}</span>
                    <span className="text-xs text-muted-foreground">{items.length}</span>
                  </div>
                  <StaggerGroup className="space-y-3">
                    {items.map((t) => (
                      <motion.button
                        key={t.id}
                        layout
                        whileHover={{ y: -2 }}
                        onClick={() => setSelected(t)}
                        className="w-full rounded-2xl border border-border bg-card p-4 text-left shadow-[var(--shadow-soft)]"
                      >
                        <Pill tone={priorityTone(t.priority)}>{t.priority}</Pill>
                        <p className="mt-2.5 text-sm font-medium leading-snug">{t.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{projectById(t.projectId)?.name}</p>
                        <div className="mt-3 flex items-center justify-between">
                          <Avatar initials={memberById(t.assignee)?.avatar ?? "?"} className="size-7" />
                          <span className="text-[11px] text-muted-foreground">{t.due}</span>
                        </div>
                      </motion.button>
                    ))}
                  </StaggerGroup>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <Panel className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Task</th>
                <th className="px-5 py-3">Project</th>
                <th className="px-5 py-3">Assignee</th>
                <th className="px-5 py-3">Priority</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Due</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => setSelected(t)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/50"
                >
                  <td className="px-5 py-3 font-medium">{t.title}</td>
                  <td className="px-5 py-3 text-muted-foreground">{projectById(t.projectId)?.name}</td>
                  <td className="px-5 py-3">{memberById(t.assignee)?.name}</td>
                  <td className="px-5 py-3"><Pill tone={priorityTone(t.priority)}>{t.priority}</Pill></td>
                  <td className="px-5 py-3">{taskStatusLabel[t.status]}</td>
                  <td className="px-5 py-3 text-muted-foreground">{t.due}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <AnimatePresence>
        {selected && (
          <motion.div
            className="fixed inset-0 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-foreground/40" onClick={() => setSelected(null)} />
            <motion.aside
              initial={{ x: 420 }}
              animate={{ x: 0 }}
              exit={{ x: 420 }}
              transition={{ type: "spring", stiffness: 340, damping: 34 }}
              className="absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-card p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold">{selected.title}</h2>
                <button onClick={() => setSelected(null)} aria-label="Close"><X className="size-5" /></button>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{selected.description}</p>
              <dl className="mt-6 space-y-3 text-sm">
                {[
                  ["Project", projectById(selected.projectId)?.name ?? "—"],
                  ["Assignee", memberById(selected.assignee)?.name ?? "—"],
                  ["Status", taskStatusLabel[selected.status]],
                  ["Priority", selected.priority],
                  ["Due", selected.due],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-border pb-2">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="font-medium capitalize">{v}</dd>
                  </div>
                ))}
              </dl>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
