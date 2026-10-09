import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import { AuthLayout, Field, SocialButtons } from "@/components/app/AuthLayout";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create account — Enaz Knowledge" },
      {
        name: "description",
        content: "Create your Enaz workspace and search all your company knowledge.",
      },
      { property: "og:title", content: "Create account — Enaz Knowledge" },
      { property: "og:description", content: "Create your Enaz workspace in under a minute." },
    ],
  }),
  component: SignUp,
});

function SignUp() {
  const { signIn } = useAuth();
  const navigate = useNavigate();

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Set up your workspace and invite the team in minutes."
      slide={1}
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void signIn("admin");
          navigate({ to: "/assistant" });
        }}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="First name" placeholder="Alina" />
          <Field label="Last name" placeholder="Verma" />
        </div>
        <Field label="Work email" type="email" placeholder="you@company.com" />
        <Field label="Password" type="password" placeholder="At least 8 characters" />
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <input type="checkbox" defaultChecked className="mt-0.5 size-4 rounded border-input" />I
          agree to the terms of service and privacy policy.
        </label>
        <motion.button
          whileTap={{ scale: 0.98 }}
          type="submit"
          className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
        >
          Create account
        </motion.button>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
        </div>
        <SocialButtons />
      </form>

      <p className="mt-8 text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/auth" className="font-medium text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
