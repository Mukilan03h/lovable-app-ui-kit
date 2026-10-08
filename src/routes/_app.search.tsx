import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, Search, Sparkles } from "lucide-react";
import { Guard } from "@/components/app/Guard";
import { Avatar, Panel, PageHeader } from "@/components/app/ui-bits";
import { PageTransition, StaggerGroup } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/app/BrandLogo";
import { docs, sourceLabel, sourceLogo, type Doc, type SourceApp } from "@/data/knowledge";

export const Route = createFileRoute("/_app/search")({
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search["q"] === "string" ? { q: search["q"] } : {},
  head: () => ({
    meta: [
      { title: "Search — Enaz Knowledge" },
      {
        name: "description",
        content: "Permission-aware search across every connected app with an AI answer card.",
      },
      { property: "og:title", content: "Search — Enaz Knowledge" },
      { property: "og:description", content: "Hybrid search across every connected app." },
    ],
  }),
  component: () => (
    <Guard permission="search" area="Search">
      <SearchPage />
    </Guard>
  ),
});

const typeLabel: Record<Doc["type"], string> = {
  doc: "Docs",
  sheet: "Sheets",
  slides: "Slides",
  thread: "Threads",
  ticket: "Tickets",
  page: "Pages",
  code: "Code",
  email: "Email",
};

const experts = [
  { name: "Liam Rodriguez", initials: "LR", topic: "Permission sync, SharePoint" },
  { name: "Mia Chen", initials: "MC", topic: "Retrieval & ranking" },
  { name: "Ava Thompson", initials: "AT", topic: "Pricing, bake-offs" },
];

function SearchPage() {
  const { q } = Route.useSearch();
  const [query, setQuery] = useState(q ?? "launch readiness");
  const [source, setSource] = useState<SourceApp | "all">("all");
  const [type, setType] = useState<Doc["type"] | "all">("all");

  useEffect(() => {
    if (q) setQuery(q);
  }, [q]);

  const results = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return docs
      .map((d) => {
        const hay = `${d.title} ${d.snippet} ${d.path}`.toLowerCase();
        return { d, score: terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0) };
      })
      .filter(
        ({ d, score }) =>
          (terms.length === 0 || score > 0) &&
          (source === "all" || d.source === source) &&
          (type === "all" || d.type === type),
      )
      .sort((a, b) => b.score - a.score)
      .map(({ d }) => d);
  }, [query, source, type]);

  const sources = Array.from(new Set(docs.map((d) => d.source)));
  const types = Array.from(new Set(docs.map((d) => d.type)));

  return (
    <PageTransition className="space-y-6">
      <PageHeader eyebrow="Hybrid · keyword + semantic + graph" title="Search" />

      <form
        onSubmit={(e) => e.preventDefault()}
        className="flex items-center gap-3 rounded-3xl border border-border bg-card px-4 py-3 shadow-[var(--shadow-soft)]"
      >
        <Search className="size-5 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search documents, threads, tickets, people…"
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {results.length} results · 112 ms
        </span>
      </form>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)_280px]">
        <aside className="space-y-5">
          <Facet
            title="Source"
            value={source}
            onChange={setSource}
            options={["all", ...sources]}
            label={(s) =>
              s === "all" ? (
                "All sources"
              ) : (
                <>
                  <BrandLogo id={sourceLogo[s as SourceApp]} size="xs" />
                  {sourceLabel[s as SourceApp]}
                </>
              )
            }
          />
          <Facet
            title="Type"
            value={type}
            onChange={setType}
            options={["all", ...types]}
            label={(t) => (t === "all" ? "All types" : typeLabel[t as Doc["type"]])}
          />
        </aside>

        <div className="min-w-0 space-y-4">
          <Panel className="border-brand/30 bg-brand/5">
            <p className="flex items-center gap-2 text-xs font-semibold text-brand">
              <Sparkles className="size-3.5" /> AI answer
            </p>
            <p className="mt-2 text-sm leading-relaxed">
              GA is on track except SharePoint permission sync (nested AD groups beyond depth 3),
              owned by Liam Rodriguez with a fix due Friday.
              <span className="ml-1 rounded-md bg-brand/12 px-1 text-[10px] font-bold text-brand">
                1
              </span>
              <span className="ml-1 rounded-md bg-brand/12 px-1 text-[10px] font-bold text-brand">
                2
              </span>
            </p>
            <Link
              to="/assistant"
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand"
            >
              Continue in assistant <ArrowRight className="size-3.5" />
            </Link>
          </Panel>

          <StaggerGroup className="space-y-3">
            {results.map((d) => (
              <motion.article
                key={d.id}
                layout
                whileHover={{ y: -2 }}
                className="rounded-3xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <BrandLogo id={sourceLogo[d.source]} size="xs" />
                  <span className="font-semibold">{sourceLabel[d.source]}</span>
                  <span className="truncate text-muted-foreground">{d.path}</span>
                  <span className="ml-auto text-muted-foreground">{d.updated}</span>
                </div>
                <h3 className="mt-2 font-semibold">{d.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{d.snippet}</p>
                <p className="mt-2 text-xs text-muted-foreground">Owner · {d.owner}</p>
              </motion.article>
            ))}
            {results.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No results you have access to.
              </p>
            )}
          </StaggerGroup>
        </div>

        <aside className="space-y-4">
          <Panel title="People who know">
            <ul className="space-y-3">
              {experts.map((e) => (
                <li key={e.name} className="flex items-center gap-3">
                  <Avatar initials={e.initials} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{e.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{e.topic}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Related">
            <div className="flex flex-wrap gap-2">
              {["permission sync", "KNOW-482", "Globex renewal", "freshness SLA"].map((t) => (
                <button
                  key={t}
                  onClick={() => setQuery(t)}
                  className="rounded-full border border-border px-3 py-1 text-xs hover:bg-muted"
                >
                  {t}
                </button>
              ))}
            </div>
          </Panel>
        </aside>
      </div>
    </PageTransition>
  );
}

function Facet<T extends string>({
  title,
  value,
  onChange,
  options,
  label,
}: {
  title: string;
  value: T;
  onChange: (v: T) => void;
  options: T[];
  label: (v: T) => React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5 lg:flex-col">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={cn(
              "flex items-center gap-2 rounded-xl px-3 py-1.5 text-left text-sm",
              value === o
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {label(o)}
          </button>
        ))}
      </div>
    </div>
  );
}
