import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import authImage from "@/assets/auth-dunes.jpg";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  slide = 0,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  slide?: number;
}) {
  const { theme, toggle } = useTheme();

  return (
    <div className="min-h-screen bg-background p-3 text-foreground lg:p-5">
      <div className="grid min-h-[calc(100vh-1.5rem)] gap-5 lg:min-h-[calc(100vh-2.5rem)] lg:grid-cols-2">
        <motion.aside
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative hidden overflow-hidden rounded-[2rem] lg:block"
        >
          <img src={authImage} alt="" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/40" />
          <div className="relative flex h-full flex-col justify-between p-10 text-white">
            <span className="text-2xl font-bold tracking-tight">enaz</span>
            <div>
              <motion.h2
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.5 }}
                className="max-w-sm text-3xl font-semibold leading-snug"
              >
                Every project, task and invoice — in one calm workspace.
              </motion.h2>
              <p className="mt-3 max-w-sm text-sm text-white/70">
                Plan the work, track the hours, bill the client. Nothing slips.
              </p>
              <div className="mt-7 flex gap-2">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1.5 rounded-full bg-white/35 transition-all",
                      i === slide ? "w-8 bg-white" : "w-4",
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
        </motion.aside>

        <main className="flex items-center justify-center px-2 py-8 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md"
          >
            <div className="mb-8 flex items-center justify-between">
              <Link to="/" className="text-xl font-bold tracking-tight lg:hidden">
                enaz
              </Link>
              <button
                onClick={toggle}
                aria-label="Toggle theme"
                className="ml-auto grid size-9 place-items-center rounded-xl border border-border"
              >
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </button>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-8 text-sm text-muted-foreground">{footer}</div>}
          </motion.div>
        </main>
      </div>
    </div>
  );
}

export function Field({
  label,
  type = "text",
  placeholder,
  defaultValue,
}: {
  label: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <input
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40"
      />
    </label>
  );
}

export function SocialButtons() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {["Continue with Google", "Continue with Apple"].map((l) => (
        <button
          key={l}
          type="button"
          className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
        >
          {l}
        </button>
      ))}
    </div>
  );
}
