import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { CheckCircle2, Sparkles } from "lucide-react";
import { BrandLogo } from "@/components/app/BrandLogo";
import { api, type SharedChat } from "@/lib/api";
import { sourceLabel, sourceLogo } from "@/data/knowledge";

export const Route = createFileRoute("/shared/$id")({
  head: () => ({
    meta: [
      { title: "Shared chat — Enaz Knowledge" },
      { name: "description", content: "A shared, read-only Enaz conversation." },
    ],
  }),
  component: SharedChatView,
});

type Turn = {
  question: string;
  answer: string;
  sources: { n: number; title: string; source: string }[];
};

function SharedChatView() {
  const { id } = Route.useParams();
  const [data, setData] = useState<SharedChat | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .readShared(id)
      .then(setData)
      .catch(() => setError("This shared chat is not available. The link may have been revoked."));
  }, [id]);

  const meta = (source: string) => ({
    logo: (sourceLogo as Record<string, string>)[source] ?? source,
    label: (sourceLabel as Record<string, string>)[source] ?? source,
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <span className="grid size-7 place-items-center rounded-xl bg-brand/12 text-brand">
            <Sparkles className="size-4" />
          </span>
          <span className="text-sm font-semibold">Enaz Knowledge</span>
          <span className="ml-auto text-xs text-muted-foreground">Shared · read-only</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {error && (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
            {error}
          </div>
        )}
        {!error && !data && <div className="text-sm text-muted-foreground">Loading…</div>}
        {data && (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">{data.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Shared by {data.author}</p>
            <div className="mt-8 space-y-8">
              {(data.turns as Turn[]).map((t, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 * i }}
                  className="space-y-3"
                >
                  <div className="flex justify-end">
                    <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                      {t.question}
                    </p>
                  </div>
                  <div className="space-y-3 text-sm leading-relaxed">
                    {t.answer
                      .split("\n\n")
                      .filter(Boolean)
                      .map((para, j) => (
                        <p key={j}>{para.replace(/\[(\d+)\]/g, "")}</p>
                      ))}
                  </div>
                  {t.sources?.length > 0 && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {t.sources.map((s) => {
                        const m = meta(s.source);
                        return (
                          <div key={s.n} className="rounded-2xl border border-border p-3">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-brand">{s.n}</span>
                              <BrandLogo id={m.logo} size="xs" />
                              <span className="text-[11px] font-medium text-muted-foreground">{m.label}</span>
                            </div>
                            <p className="mt-1.5 truncate text-sm font-medium">{s.title}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
            <p className="mt-10 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="size-3.5 text-success" /> Snapshot shared from an Enaz workspace.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
