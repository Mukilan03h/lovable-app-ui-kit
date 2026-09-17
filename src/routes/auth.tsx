import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { AuthLayout, Field, SocialButtons } from "@/components/app/AuthLayout";
import { roleLabel, useAuth } from "@/lib/auth";
import type { Role } from "@/data/mock";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Enaz Project Tracker" },
      { name: "description", content: "Sign in to your Enaz workspace and pick a role to preview." },
      { property: "og:title", content: "Sign in — Enaz Project Tracker" },
      { property: "og:description", content: "Sign in to your Enaz project tracking workspace." },
    ],
  }),
  component: SignIn,
});

const roles: Role[] = ["admin", "manager", "member", "client"];

function SignIn() {
  const { signIn, user, ready } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>("admin");

  useEffect(() => {
    if (ready && user) navigate({ to: "/dashboard", replace: true });
  }, [ready, user, navigate]);

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to pick up where your team left off." slide={0}>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          signIn(role);
          navigate({ to: "/dashboard" });
        }}
      >
        <Field label="Email" type="email" defaultValue="alina@enaz.studio" />
        <Field label="Password" type="password" defaultValue="password" />

        <div>
          <span className="mb-2 block text-sm font-medium">Preview as</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {roles.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={cn(
                  "relative rounded-xl border border-border px-3 py-2 text-xs font-medium transition-colors",
                  role === r ? "text-primary-foreground" : "text-muted-foreground hover:bg-accent",
                )}
              >
                {role === r && (
                  <motion.span
                    layoutId="role-pill"
                    className="absolute inset-0 rounded-xl bg-primary"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative">{roleLabel[r]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-muted-foreground">
            <input type="checkbox" defaultChecked className="size-4 rounded border-input" />
            Remember me
          </label>
          <Link to="/forgot-password" className="font-medium text-brand hover:underline">
            Forgot password?
          </Link>
        </div>

        <motion.button
          whileTap={{ scale: 0.98 }}
          type="submit"
          className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
        >
          Sign in as {roleLabel[role]}
        </motion.button>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
        </div>
        <SocialButtons />
      </form>

      <p className="mt-8 text-sm text-muted-foreground">
        New here?{" "}
        <Link to="/signup" className="font-medium text-brand hover:underline">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
