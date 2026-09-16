import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { motion } from "motion/react";
import { fadeUp } from "@/lib/motion";

export function Panel({
  children,
  className,
  title,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <motion.section
      variants={fadeUp}
      className={cn(
        "rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]",
        className,
      )}
    >
      {(title || action) && (
        <header className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <h2 className="truncate text-base font-semibold text-card-foreground">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </motion.section>
  );
}

const toneMap: Record<string, string> = {
  neutral: "bg-muted text-muted-foreground",
  brand: "bg-brand/12 text-brand",
  success: "bg-success/15 text-success",
  warning: "bg-warning/18 text-warning",
  danger: "bg-destructive/15 text-destructive",
  info: "bg-info/15 text-info",
};

export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: keyof typeof toneMap;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        toneMap[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Avatar({ initials, className }: { initials: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-grid size-9 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground",
        className,
      )}
    >
      {initials}
    </span>
  );
}

export function Bar({ value, tone = "brand" }: { value: number; tone?: "brand" | "success" | "warning" | "danger" }) {
  const colors = {
    brand: "bg-brand",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-destructive",
  } as const;
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
      <motion.div
        className={cn("h-full rounded-full", colors[tone])}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  actions,
}: {
  eyebrow: string;
  title: string;
  actions?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 sm:flex sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{eyebrow}</p>
        <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      </div>
      {actions}
    </div>
  );
}
