import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Building2,
  Copy,
  Download,
  History,
  LayoutGrid,
  Link2,
  List,
  Lock,
  MoreHorizontal,
  Pin,
  Search,
  Share2,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Guard } from "@/components/app/Guard";
import { FileTypeIcon } from "@/components/app/FileTypeIcon";
import { formatColor, formatLabel, type FileFormat } from "@/components/app/file-formats";
import { PageHeader, Pill } from "@/components/app/ui-bits";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageTransition } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { artifactItems, type ArtifactItem } from "@/data/knowledge";

export const Route = createFileRoute("/_app/artifacts")({
  head: () => ({
    meta: [
      { title: "Artifacts — Enaz Knowledge" },
      {
        name: "description",
        content: "Slides, documents, spreadsheets, PDFs and web apps generated from cited answers.",
      },
      { property: "og:title", content: "Artifacts — Enaz Knowledge" },
      {
        property: "og:description",
        content: "Generated files with versions, sources and sharing.",
      },
    ],
  }),
  component: () => (
    <Guard permission="artifacts" area="Artifacts">
      <ArtifactsPage />
    </Guard>
  ),
});

const shareMeta = {
  private: { label: "Only me", icon: Lock },
  team: { label: "Team", icon: Users },
  org: { label: "Organization", icon: Building2 },
} as const;

const formats = Array.from(new Set(artifactItems.map((a) => a.format)));

function ArtifactsPage() {
  const navigate = useNavigate();
  const [format, setFormat] = useState<FileFormat | "all">("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState("");
  const [pinned, setPinned] = useState(
    () => new Set(artifactItems.filter((a) => a.pinned).map((a) => a.id)),
  );

  const items = artifactItems.filter(
    (a) =>
      (format === "all" || a.format === format) &&
      a.title.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const pinnedItems = items.filter((a) => pinned.has(a.id));

  const open = (a: ArtifactItem) =>
    a.kind
      ? navigate({ to: "/assistant", search: { artifact: a.kind } })
      : toast(`Opening ${a.title}`, { description: `${formatLabel[a.format]} preview` });

  const togglePin = (id: string) =>
    setPinned((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <PageTransition className="space-y-6">
      <PageHeader
        eyebrow="Work products"
        title="Artifacts"
        actions={
          <div className="flex gap-1 rounded-full bg-muted p-1">
            {(
              [
                ["grid", LayoutGrid],
                ["list", List],
              ] as const
            ).map(([v, Icon]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-label={`${v} view`}
                className={cn(
                  "grid size-8 place-items-center rounded-full",
                  view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex w-full items-center gap-2 rounded-full border border-border bg-card px-3 py-2 sm:w-72">
          <Search className="size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search artifacts"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        <div className="-mx-4 flex max-w-full gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <FilterChip active={format === "all"} onClick={() => setFormat("all")}>
            All
          </FilterChip>
          {formats.map((f) => (
            <FilterChip key={f} active={format === f} onClick={() => setFormat(f)}>
              <span className="size-2 rounded-full" style={{ background: formatColor[f] }} />
              {formatLabel[f]}
            </FilterChip>
          ))}
        </div>
      </div>

      {pinnedItems.length > 0 && format === "all" && !query && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Pin className="size-4" /> Pinned
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {pinnedItems.map((a) => (
              <button
                key={a.id}
                onClick={() => open(a)}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left shadow-[var(--shadow-soft)] hover:bg-muted/50"
              >
                <FileTypeIcon format={a.format} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{a.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {a.updated} · v{a.versions}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <AnimatePresence mode="wait">
        {view === "grid" ? (
          <motion.div
            key="grid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
          >
            {items.map((a, i) => (
              <motion.article
                key={a.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                whileHover={{ y: -3 }}
                className="group overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-soft)]"
              >
                <button onClick={() => open(a)} className="block w-full text-left">
                  <Thumbnail format={a.format} />
                </button>
                <div className="flex items-start gap-3 p-4">
                  <FileTypeIcon format={a.format} className="h-9 w-7" />
                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => open(a)}
                      className="block max-w-full truncate text-left font-semibold"
                    >
                      {a.title}
                    </button>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {a.author} · {a.updated} · {a.size}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <History className="size-3.5" /> v{a.versions}
                      </span>
                      <span className="flex items-center gap-1">
                        <Link2 className="size-3.5" /> {a.sources} sources
                      </span>
                      <ShareBadge shared={a.shared} />
                    </div>
                  </div>
                  <ItemMenu item={a} pinned={pinned.has(a.id)} onPin={() => togglePin(a.id)} />
                </div>
              </motion.article>
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="overflow-x-auto rounded-3xl border border-border bg-card shadow-[var(--shadow-soft)]"
          >
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Created by</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                  <th className="px-4 py-3 font-medium">Sources</th>
                  <th className="px-4 py-3 font-medium">Access</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id} className="border-t border-border hover:bg-muted/40">
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => open(a)}
                        className="flex items-center gap-3 text-left font-medium"
                      >
                        <FileTypeIcon format={a.format} className="h-8 w-6" />
                        {a.title}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{formatLabel[a.format]}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{a.author}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{a.updated}</td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{a.sources}</td>
                    <td className="px-4 py-2.5">
                      <ShareBadge shared={a.shared} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <ItemMenu item={a} pinned={pinned.has(a.id)} onPin={() => togglePin(a.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        )}
      </AnimatePresence>

      {items.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">No artifacts match.</p>
      )}
    </PageTransition>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function ShareBadge({ shared }: { shared: ArtifactItem["shared"] }) {
  const M = shareMeta[shared];
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <M.icon className="size-3.5" /> {M.label}
    </span>
  );
}

function ItemMenu({
  item,
  pinned,
  onPin,
}: {
  item: ArtifactItem;
  pinned: boolean;
  onPin: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="grid size-8 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-muted"
        aria-label="Artifact actions"
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => toast(`Downloading ${item.title}.${item.format}`)}>
          <Download className="size-4" /> Download .{item.format}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => toast("Share link copied")}>
          <Share2 className="size-4" /> Share
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onPin}>
          <Pin className="size-4" /> {pinned ? "Unpin" : "Pin"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => toast(`Duplicated ${item.title}`)}>
          <Copy className="size-4" /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive"
          onClick={() => toast(`Moved ${item.title} to trash`)}
        >
          <Trash2 className="size-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Lightweight visual preview of each artifact type, drawn with divs. */
function Thumbnail({ format }: { format: FileFormat }) {
  const color = formatColor[format];
  const frame = "relative aspect-[16/9] overflow-hidden border-b border-border";
  const bg = { background: `linear-gradient(135deg, ${color}26, transparent 70%)` };

  if (format === "pptx") {
    return (
      <div className={cn(frame, "p-5")} style={bg}>
        <div className="flex h-full flex-col rounded-xl bg-card p-4 shadow-md">
          <div className="h-2.5 w-2/3 rounded-full" style={{ background: color }} />
          <div className="mt-3 space-y-1.5">
            <div className="h-1.5 w-1/2 rounded-full bg-muted-foreground/30" />
            <div className="h-1.5 w-3/5 rounded-full bg-muted-foreground/30" />
          </div>
          <div className="mt-auto flex items-end gap-1.5">
            {[40, 70, 55, 90].map((h, i) => (
              <div
                key={i}
                className="w-4 rounded-t"
                style={{ height: `${h * 0.35}px`, background: color, opacity: 0.4 + i * 0.15 }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (format === "xlsx" || format === "csv") {
    return (
      <div className={cn(frame, "p-4")} style={bg}>
        <div className="grid h-full grid-cols-4 grid-rows-5 overflow-hidden rounded-lg border border-border bg-card">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="border-b border-r border-border/70"
              style={i < 4 ? { background: `${color}33` } : undefined}
            />
          ))}
        </div>
      </div>
    );
  }
  if (format === "html") {
    return (
      <div className={cn(frame, "p-4")} style={bg}>
        <div className="h-full overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
            {["#f87171", "#fbbf24", "#34d399"].map((c) => (
              <span key={c} className="size-1.5 rounded-full" style={{ background: c }} />
            ))}
            <span className="ml-2 h-1.5 w-1/3 rounded-full bg-muted" />
          </div>
          <div className="grid grid-cols-3 gap-2 p-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-6 rounded-md"
                style={{ background: `${color}${i === 0 ? "55" : "22"}` }}
              />
            ))}
            <div className="col-span-3 flex h-12 items-end gap-1 rounded-md bg-muted/60 p-1.5">
              {[30, 55, 40, 75, 60, 90, 70].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm"
                  style={{ height: `${h}%`, background: color }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (format === "png") {
    return (
      <div className={cn(frame, "grid place-items-center")} style={bg}>
        <div className="flex items-center">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center">
              <div
                className="h-8 w-14 rounded-lg border-2 bg-card"
                style={{ borderColor: color }}
              />
              {i < 2 && <div className="h-0.5 w-5" style={{ background: color }} />}
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className={cn(frame, "flex justify-center pt-4")} style={bg}>
      <div className="w-3/5 space-y-1.5 rounded-t-lg bg-card p-4 shadow-md">
        <div className="mb-3 h-2 w-1/2 rounded-full" style={{ background: color }} />
        {[100, 92, 96, 70, 88, 94].map((w, i) => (
          <div
            key={i}
            className="h-1.5 rounded-full bg-muted-foreground/25"
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
      {format === "pdf" && (
        <Pill className="absolute right-3 top-3" tone="danger">
          Signed
        </Pill>
      )}
    </div>
  );
}
