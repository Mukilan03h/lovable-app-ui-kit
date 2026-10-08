import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { PageTransition } from "@/lib/motion";
import { useAuth, roleLabel } from "@/lib/auth";

export function NoAccess({ area }: { area: string }) {
  const { user } = useAuth();
  return (
    <PageTransition className="grid min-h-[60vh] place-items-center">
      <div className="max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-[var(--shadow-soft)]">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-warning/15 text-warning">
          <ShieldAlert className="size-6" />
        </div>
        <h1 className="mt-4 text-xl font-semibold">{area} isn't part of your access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You're signed in as {user ? roleLabel[user.role] : "a guest"}. Ask an admin if you need this area opened up.
        </p>
        <Link
          to="/assistant"
          className="mt-6 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Back to dashboard
        </Link>
      </div>
    </PageTransition>
  );
}
