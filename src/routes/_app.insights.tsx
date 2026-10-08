import { createFileRoute } from "@tanstack/react-router";
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
import { toast } from "sonner";
import { Guard } from "@/components/app/Guard";
import { Panel, PageHeader, Pill } from "@/components/app/ui-bits";
import { AnimatedNumber, PageTransition, StaggerGroup } from "@/lib/motion";
import { knowledgeGaps, modelMix, queryVolume } from "@/data/knowledge";

export const Route = createFileRoute("/_app/insights")({
  head: () => ({
    meta: [
      { title: "Insights — Enaz Knowledge" },
      { name: "description", content: "Usage, answer quality, cost and knowledge-gap analytics." },
      { property: "og:title", content: "Insights — Enaz Knowledge" },
      { property: "og:description", content: "Usage, quality, cost and knowledge gaps." },
    ],
  }),
  component: () => (
    <Guard permission="insights" area="Insights">
      <InsightsPage />
    </Guard>
  ),
});

const pieColors = ["var(--chart-2)", "var(--brand)", "var(--chart-5)"];

const stats = [
  {
    label: "Queries this week",
    value: 25090,
    format: (n: number) => Math.round(n).toLocaleString(),
  },
  { label: "Answered with citations", value: 93.4, format: (n: number) => `${n.toFixed(1)}%` },
  { label: "p50 answer latency", value: 2.1, format: (n: number) => `${n.toFixed(1)}s` },
  { label: "Avg cost / answer", value: 0.008, format: (n: number) => `$${n.toFixed(3)}` },
];

function InsightsPage() {
  return (
    <PageTransition className="space-y-6">
      <PageHeader eyebrow="Quality · cost · coverage" title="Insights" />

      <StaggerGroup className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Panel key={s.label}>
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">
              <AnimatedNumber value={s.value} format={s.format} />
            </p>
          </Panel>
        ))}
      </StaggerGroup>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel title="Queries vs answered">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={queryVolume}>
                <defs>
                  <linearGradient id="q" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={40} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="queries"
                  stroke="var(--brand)"
                  fill="url(#q)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="answered"
                  stroke="var(--chart-2)"
                  fill="transparent"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Model routing mix">
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={modelMix}
                  dataKey="value"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={3}
                >
                  {modelMix.map((m, i) => (
                    <Cell key={m.name} fill={pieColors[i]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 space-y-1.5 text-xs">
            {modelMix.map((m, i) => (
              <li key={m.name} className="flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ background: pieColors[i] }} />
                <span className="flex-1 text-muted-foreground">{m.name}</span>
                <span className="font-semibold tabular-nums">{m.value}%</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel
        title="Knowledge gaps"
        action={<Pill tone="warning">{knowledgeGaps.length} open</Pill>}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">Question people ask</th>
                <th className="pb-2 font-medium">Asks</th>
                <th className="pb-2 font-medium">Problem</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {knowledgeGaps.map((g) => (
                <tr key={g.question} className="border-t border-border">
                  <td className="py-3 pr-4">{g.question}</td>
                  <td className="py-3 tabular-nums">{g.asks}</td>
                  <td className="py-3">
                    <Pill tone={g.status === "No source found" ? "danger" : "warning"}>
                      {g.status}
                    </Pill>
                  </td>
                  <td className="py-3 text-right">
                    <button
                      onClick={() =>
                        toast("Owner assigned", {
                          description: "They'll get a task to write or update the source.",
                        })
                      }
                      className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                    >
                      Assign owner
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </PageTransition>
  );
}
