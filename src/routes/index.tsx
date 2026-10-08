import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Enaz — Enterprise Knowledge Assistant" },
      {
        name: "description",
        content:
          "Enaz searches every company app, answers with citations and turns answers into slides, docs and sheets.",
      },
      { property: "og:title", content: "Enaz — Enterprise Knowledge Assistant" },
      {
        property: "og:description",
        content: "Permission-aware enterprise search, AI assistant, agents and artifacts.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!ready) return;
    navigate({ to: user ? "/assistant" : "/auth", replace: true });
  }, [ready, user, navigate]);

  return (
    <div className="grid min-h-screen place-items-center bg-background">
      <div className="flex items-center gap-3 text-muted-foreground">
        <span className="size-3 animate-ping rounded-full bg-brand" />
        <span className="text-sm">Loading your workspace…</span>
      </div>
    </div>
  );
}
