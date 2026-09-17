import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "motion/react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowUpRight, CheckCircle2, Clock, FolderKanban, Wallet } from "lucide-react";
import { Guard } from "@/components/app/Guard";
import { Avatar, Bar, Panel, PageHeader, Pill } from "@/components/app/ui-bits";
import { AnimatedNumber, PageTransition, StaggerGroup } from "@/lib/motion";
import { useAuth } from "@/lib/auth";
import {
  currency,
  incomeExpense,
  invoices,
  memberById,
  notifications,
  projects,
  projectById,
  statusLabel,
  tasks,
} from "@/data/mock";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Enaz Project Tracker" },
      { name: "description", content: "Your tasks, project health, revenue and invoices at a glance." },
      { property: "og:title", content: "Dashboard — Enaz Project Tracker" },
      { property: "og:description", content: "Tasks, project health, revenue and invoices at a glance." },
    ],
  }),
  component: () => (
    <Guard permission="dashboard" area="The dashboard">
      <Dashboard />
    </Guard>
  ),
});

const accentMap: Record<string, string> = {
  rose: "bg-chart-5/12 border-chart-5/30",
  slate: "bg-muted border-border",
  amber: "bg-chart-1/12 border-chart-1/30",
  violet: "bg-chart-3/12 border-chart-3/30",
  sky: "bg-chart-2/12 border-chart-2/30",
};

function Dashboard() {
  const { user, can } = useAuth();
  const [bucket, setBucket] = useState<"today" | "tomorrow">("today");

  const visibleProjects = user?.role === "client"
    ? projects.filter((p) => p.client === "BrightBridge")
    : projects;
  const myTasks = user?.role === "member" ? tasks.filter((t) => t.assignee === user.id) : tasks;
  const bucketTasks = myTasks.filter((t) => t.bucket === bucket).slice(0, 4);

  const donut = [
    { name: "In Progress", value: visibleProjects.filter((p) => p.status === "in-progress").length },
    { name: "Completed", value: visibleProjects.filter((p) => p.status === "completed").length },
    { name: "Not Started", value: visibleProjects.filter((p) => p.status === "not-started").length },
    { name: "On Hold", value: visibleProjects.filter((p) => p.status === "on-hold").length },
  ];
  const donutColors = ["var(--chart-3)", "var(--chart-4)", "var(--chart-2)", "var(--chart-1)"];

  const paid = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const outstanding = invoices
    .filter((i) => i.status === "not-paid" || i.status === "overdue")
    .reduce((s, i) => s + i.amount, 0);

  const stats = [
    { label: "Active projects", value: visibleProjects.filter((p) => p.status === "in-progress").length, icon: FolderKanban, tone: "brand" as const },
    { label: "Tasks completed", value: tasks.filter((t) => t.status === "done").length, icon: CheckCircle2, tone: "success" as const },
    { label: "Hours this week", value: 187, icon: Clock, tone: "info" as const },
    { label: "Outstanding", value: outstanding, icon: Wallet, tone: "warning" as const, money: true },
  ];

  return (
    <PageTransition className="space-y-6">
      <PageHeader
        eyebrow={`Good morning, ${user?.name.split(" ")[0]}`}
        title="Here's your workspace today"
        actions={
          <Link
            to="/projects"
            className="hidden rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground sm:inline-flex"
          >
            View projects
          </Link>
        }
      />

      <StaggerGroup className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Panel key={s.label} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="mt-2 text-2xl font-semibold">
                  {s.money ? (
                    <AnimatedNumber value={s.value} format={(n) => currency(n)} />
                  ) : (
                    <AnimatedNumber value={s.value} />
                  )}
                </p>
              </div>
              <span className={cn("grid size-10 place-items-center rounded-2xl", {
                brand: "bg-brand/12 text-brand",
                success: "bg-success/15 text-success",
                info: "bg-info/15 text-info",
                warning: "bg-warning/18 text-warning",
              }[s.tone])}>
                <s.icon className="size-5" />
              </span>
            </div>
          </Panel>
        ))}
      </StaggerGroup>

      <StaggerGroup className="grid gap-5 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="My Tasks"
          action={
            <div className="flex gap-1 rounded-full bg-muted p-1">
              {(["today", "tomorrow"] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => setBucket(b)}
                  className={cn(
                    "relative rounded-full px-3 py-1 text-xs font-medium capitalize",
                    bucket === b ? "text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  {bucket === b && (
                    <motion.span layoutId="bucket-pill" className="absolute inset-0 rounded-full bg-primary" />
                  )}
                  <span className="relative">{b}</span>
                </button>
              ))}
            </div>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {bucketTasks.map((t) => (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn("rounded-2xl border p-4", accentMap[t.accent])}
              >
                <div className="flex items-center justify-between gap-2">
                  <Pill tone={t.priority === "high" ? "danger" : t.priority === "medium" ? "warning" : "neutral"}>
                    {t.priority}
                  </Pill>
                  <span className="text-xs text-muted-foreground">{t.due}</span>
                </div>
                <p className="mt-3 font-medium leading-snug">{t.title}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
                <div className="mt-4 flex items-center gap-2">
                  <Avatar initials={memberById(t.assignee)?.avatar ?? "?"} className="size-7" />
                  <span className="text-xs text-muted-foreground">
                    {projectById(t.projectId)?.name}
                  </span>
                </div>
              </motion.div>
            ))}
            {bucketTasks.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing scheduled — enjoy the quiet.</p>
            )}
          </div>
        </Panel>

        <Panel title="Projects Overview">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donut} dataKey="value" innerRadius={55} outerRadius={82} paddingAngle={3} stroke="none">
                  {donut.map((_, i) => (
                    <Cell key={i} fill={donutColors[i]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    color: "var(--popover-foreground)",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-4 space-y-2">
            {donut.map((d, i) => (
              <li key={d.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span className="size-2.5 rounded-full" style={{ background: donutColors[i] }} />
                  {d.name}
                </span>
                <span className="font-medium">{d.value}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </StaggerGroup>

      <StaggerGroup className="grid gap-5 xl:grid-cols-3">
        {can("invoices") && (
          <Panel
            className="xl:col-span-2"
            title="Income vs Expense"
            action={<Pill tone="success">+12.4% <ArrowUpRight className="size-3" /></Pill>}
          >
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={incomeExpense} margin={{ left: -18, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="inc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      color: "var(--popover-foreground)",
                    }}
                  />
                  <Area type="monotone" dataKey="income" stroke="var(--chart-3)" strokeWidth={2.5} fill="url(#inc)" />
                  <Area type="monotone" dataKey="expense" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#exp)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        )}

        <Panel title="Invoice Overview">
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 flex justify-between text-sm">
                <span className="text-muted-foreground">Paid</span>
                <span className="font-medium">{currency(paid)}</span>
              </div>
              <Bar value={(paid / (paid + outstanding)) * 100} tone="success" />
            </div>
            <div>
              <div className="mb-1.5 flex justify-between text-sm">
                <span className="text-muted-foreground">Outstanding</span>
                <span className="font-medium">{currency(outstanding)}</span>
              </div>
              <Bar value={(outstanding / (paid + outstanding)) * 100} tone="warning" />
            </div>
            <ul className="space-y-3 pt-2">
              {invoices.slice(0, 4).map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">
                    <span className="font-medium">{i.number}</span>
                    <span className="ml-2 text-muted-foreground">{i.client}</span>
                  </span>
                  <Pill tone={i.status === "paid" ? "success" : i.status === "overdue" ? "danger" : "neutral"}>
                    {i.status}
                  </Pill>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      </StaggerGroup>

      <StaggerGroup className="grid gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Project progress">
          <ul className="space-y-4">
            {visibleProjects.slice(0, 5).map((p) => (
              <li key={p.id}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                  <Link to="/projects/$id" params={{ id: p.id }} className="truncate font-medium hover:underline">
                    {p.name}
                  </Link>
                  <span className="text-muted-foreground">{statusLabel[p.status]} · {p.progress}%</span>
                </div>
                <Bar value={p.progress} tone={p.status === "completed" ? "success" : p.status === "on-hold" ? "warning" : "brand"} />
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Recent activity">
          <ul className="space-y-4">
            {notifications.slice(0, 5).map((n) => (
              <li key={n.id} className="flex gap-3">
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-border" : "bg-brand")} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{n.title}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{n.time}</p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </StaggerGroup>
    </PageTransition>
  );
}
