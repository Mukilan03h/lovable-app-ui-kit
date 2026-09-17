import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Enaz — Project Tracker Workspace" },
      {
        name: "description",
        content:
          "Enaz is a project tracker for teams: dashboards, tasks, invoices, time tracking and reports.",
      },
      { property: "og:title", content: "Enaz — Project Tracker Workspace" },
      {
        property: "og:description",
        content: "Dashboards, tasks, invoices, time tracking and reports for delivery teams.",
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
    navigate({ to: user ? "/dashboard" : "/auth", replace: true });
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
