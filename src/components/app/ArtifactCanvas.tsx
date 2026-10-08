import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Download, History, Share2, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { Pill } from "./ui-bits";
import { artifactMeta } from "./artifact-meta";
import { cn } from "@/lib/utils";
import {
  deckSlides,
  demoAnswer,
  docById,
  sheetRows,
  sourceLabel,
  type ArtifactKind,
} from "@/data/knowledge";

const titles: Record<ArtifactKind, string> = {
  slides: "GA readiness deck",
  doc: "GA readiness memo",
  sheet: "Bake-off results",
};

const citedIds = Array.from(new Set(demoAnswer.paragraphs.flatMap((p) => p.cites)));

export function ArtifactCanvas({ kind, onClose }: { kind: ArtifactKind; onClose: () => void }) {
  const [tab, setTab] = useState<"preview" | "sources" | "versions">("preview");
  const [instruction, setInstruction] = useState("");
  const meta = artifactMeta[kind];

  return (
    <motion.aside
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      className="flex min-h-[520px] flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-soft)]"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <span className="grid size-8 place-items-center rounded-xl bg-brand/12 text-brand">
          <meta.icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{titles[kind]}</p>
          <p className="text-[11px] text-muted-foreground">
            {meta.label} · v3 · {citedIds.length} sources
          </p>
        </div>
        <button
          onClick={() =>
            toast("Share link copied", {
              description: "Viewers only see sources they have access to.",
            })
          }
          className="grid size-8 place-items-center rounded-xl border border-border"
          aria-label="Share"
        >
          <Share2 className="size-4" />
        </button>
        <button
          onClick={() =>
            toast(`Exporting ${titles[kind]}${meta.ext}`, {
              description: "The renderer service builds the file from the artifact spec.",
            })
          }
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
        >
          <Download className="size-3.5" /> {meta.ext}
        </button>
        <button
          onClick={onClose}
          className="grid size-8 place-items-center rounded-xl hover:bg-muted"
          aria-label="Close artifact"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="flex gap-1 border-b border-border px-3 py-2">
        {(["preview", "sources", "versions"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "relative rounded-full px-3 py-1 text-xs font-medium capitalize text-muted-foreground",
              tab === t && "text-foreground",
            )}
          >
            {tab === t && (
              <motion.span
                layoutId="artifact-tab"
                className="absolute inset-0 rounded-full bg-muted"
              />
            )}
            <span className="relative">{t}</span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab + kind}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {tab === "preview" &&
              (kind === "slides" ? (
                <SlidesPreview />
              ) : kind === "doc" ? (
                <DocPreview />
              ) : (
                <SheetPreview />
              ))}
            {tab === "sources" && <SourcesList />}
            {tab === "versions" && <Versions />}
          </motion.div>
        </AnimatePresence>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!instruction.trim()) return;
          toast("Applying edit as a patch", { description: `“${instruction}” → new version v4` });
          setInstruction("");
        }}
        className="flex items-center gap-2 border-t border-border p-3"
      >
        <Wand2 className="size-4 shrink-0 text-brand" />
        <input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={`Edit with an instruction, e.g. “make slide 3 a table”`}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <button className="rounded-xl bg-muted px-3 py-1.5 text-xs font-semibold">Apply</button>
      </form>
    </motion.aside>
  );
}

function SlidesPreview() {
  const [active, setActive] = useState(0);
  const slide = deckSlides[active] ?? deckSlides[0]!;
  return (
    <div className="space-y-3">
      <div className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-brand/15 via-background to-chart-2/10 p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.25 }}
            className="flex h-full flex-col"
          >
            <p
              className={cn(
                "font-semibold tracking-tight",
                slide.layout === "title" ? "mt-auto text-2xl" : "text-lg",
              )}
            >
              {slide.title}
            </p>
            {slide.layout === "chart" ? (
              <div className="mt-2 min-h-0 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { name: "Enaz", v: 82 },
                      { name: "Incumbent", v: 71 },
                    ]}
                  >
                    <CartesianGrid
                      vertical={false}
                      strokeDasharray="3 3"
                      className="stroke-border"
                    />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis hide domain={[0, 100]} />
                    <Bar dataKey="v" radius={[8, 8, 0, 0]} fill="var(--brand)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <ul
                className={cn(
                  "mt-3 space-y-1.5 text-sm text-muted-foreground",
                  slide.layout === "title" && "mb-auto",
                )}
              >
                {slide.bullets.map((b) => (
                  <li key={b} className="flex gap-2">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
                    {b}
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        </AnimatePresence>
        <span className="absolute bottom-3 right-4 text-[10px] text-muted-foreground">
          {active + 1} / {deckSlides.length}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {deckSlides.map((s, i) => (
          <button
            key={s.title}
            onClick={() => setActive(i)}
            className={cn(
              "aspect-video truncate rounded-lg border bg-muted/50 p-1.5 text-left text-[8px] leading-tight",
              i === active ? "border-brand ring-2 ring-brand/30" : "border-border",
            )}
          >
            {s.title}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Speaker notes carry the citations for each slide.
      </p>
    </div>
  );
}

function DocPreview() {
  return (
    <article className="mx-auto max-w-prose rounded-2xl border border-border bg-background p-6 text-sm leading-relaxed shadow-inner">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Memo · Internal</p>
      <h3 className="mt-1 text-xl font-semibold">GA readiness — Enaz Knowledge</h3>
      <h4 className="mt-5 font-semibold">Summary</h4>
      {demoAnswer.paragraphs.map((p, i) => (
        <p key={i} className="mt-2 text-muted-foreground">
          {p.text}
          {p.cites.map((c) => (
            <sup key={c} className="ml-0.5 font-semibold text-brand">
              {citedIds.indexOf(c) + 1}
            </sup>
          ))}
        </p>
      ))}
      <h4 className="mt-5 font-semibold">Recommendation</h4>
      <p className="mt-2 text-muted-foreground">
        Hold the go / no-go review on Monday once KNOW-482 merges and the ACL audit passes.
      </p>
      <hr className="my-5 border-border" />
      <ol className="space-y-1 text-xs text-muted-foreground">
        {citedIds.map((id, i) => {
          const d = docById(id);
          return (
            <li key={id}>
              {i + 1}. {d?.title} — {d ? sourceLabel[d.source] : ""}
            </li>
          );
        })}
      </ol>
    </article>
  );
}

function SheetPreview() {
  const cols = ["A", "B", "C", "D"];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-1.5 font-mono text-xs">
        <span className="text-muted-foreground">D2</span>
        <span className="text-brand">fx</span>
        <span>=B2-C2</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[420px] text-xs">
          <thead>
            <tr className="bg-muted/60 text-muted-foreground">
              <th className="w-8 border-r border-border" />
              {cols.map((c) => (
                <th
                  key={c}
                  className="border-r border-border px-2 py-1 font-medium last:border-r-0"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border font-semibold">
              <td className="border-r border-border bg-muted/60 text-center text-muted-foreground">
                1
              </td>
              <td className="border-r border-border px-2 py-1.5">Metric</td>
              <td className="border-r border-border px-2 py-1.5">Enaz</td>
              <td className="border-r border-border px-2 py-1.5">Incumbent</td>
              <td className="px-2 py-1.5">Delta</td>
            </tr>
            {sheetRows.map((r, i) => (
              <tr key={r.metric} className="border-t border-border">
                <td className="border-r border-border bg-muted/60 text-center text-muted-foreground">
                  {i + 2}
                </td>
                <td className="border-r border-border px-2 py-1.5">{r.metric}</td>
                <td className="border-r border-border px-2 py-1.5 tabular-nums">{r.enaz}</td>
                <td className="border-r border-border px-2 py-1.5 tabular-nums">{r.incumbent}</td>
                <td className="px-2 py-1.5 tabular-nums text-brand">
                  {+(r.enaz - r.incumbent).toFixed(3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <Pill tone="brand">Results</Pill>
        <Pill>Raw grades</Pill>
        <Pill>Sources</Pill>
      </div>
      <p className="text-xs text-muted-foreground">
        Values come from the code sandbox, never from model memory. Formulas stay live in Excel.
      </p>
    </div>
  );
}

function SourcesList() {
  return (
    <ul className="space-y-2">
      {citedIds.map((id, i) => {
        const d = docById(id);
        if (!d) return null;
        return (
          <li key={id} className="rounded-2xl border border-border p-3">
            <p className="text-sm font-medium">
              <span className="mr-2 text-brand">[{i + 1}]</span>
              {d.title}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{d.path}</p>
          </li>
        );
      })}
    </ul>
  );
}

function Versions() {
  const versions = [
    { v: "v3", note: "Added bake-off chart", when: "just now" },
    { v: "v2", note: "“Shorten to 5 slides”", when: "4 min ago" },
    { v: "v1", note: "Generated from answer", when: "6 min ago" },
  ];
  return (
    <ul className="space-y-2">
      {versions.map((v, i) => (
        <li key={v.v} className="flex items-center gap-3 rounded-2xl border border-border p-3">
          <History className="size-4 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {v.v} · {v.note}
            </p>
            <p className="text-xs text-muted-foreground">{v.when}</p>
          </div>
          {i === 0 ? (
            <Pill tone="success">Current</Pill>
          ) : (
            <button className="text-xs font-semibold text-brand">Restore</button>
          )}
        </li>
      ))}
    </ul>
  );
}
