import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { AuthLayout, Field } from "@/components/app/AuthLayout";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset password — Enaz Project Tracker" },
      { name: "description", content: "Request a reset link for your Enaz workspace account." },
      { property: "og:title", content: "Reset password — Enaz Project Tracker" },
      { property: "og:description", content: "Request a reset link for your Enaz account." },
    ],
  }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const [sent, setSent] = useState(false);

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll send a secure link to your inbox."
      slide={2}
    >
      {sent ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-border bg-card p-6 text-center"
        >
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-success/15 text-success">
            <MailCheck className="size-6" />
          </div>
          <p className="mt-4 font-medium">Check your inbox</p>
          <p className="mt-1 text-sm text-muted-foreground">
            If that address exists, a reset link is on its way.
          </p>
        </motion.div>
      ) : (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            setSent(true);
          }}
        >
          <Field label="Email" type="email" placeholder="you@company.com" />
          <motion.button
            whileTap={{ scale: 0.98 }}
            type="submit"
            className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
          >
            Send reset link
          </motion.button>
        </form>
      )}

      <p className="mt-8 text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link to="/auth" className="font-medium text-brand hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
