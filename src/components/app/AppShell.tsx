import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { Menu, Moon, Search, Sun, X, LogOut, Bell } from "lucide-react";
import { navItems } from "./nav";
import { useAuth, roleLabel } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { Avatar } from "./ui-bits";
import { notifications } from "@/data/mock";

const filters = ["Today", "This Week", "This Month", "Reports"];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut, can } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState("This Month");

  const items = navItems.filter((i) => can(i.permission));
  const unread = notifications.filter((n) => !n.read).length;

  const handleSignOut = () => {
    signOut();
    navigate({ to: "/auth", replace: true });
  };

  const Rail = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="flex h-full flex-col items-center gap-1 py-4">
      <Link
        to="/dashboard"
        onClick={onNavigate}
        className="mb-3 grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground"
        aria-label="Enaz home"
      >
        <span className="text-sm font-bold">e</span>
      </Link>
      {items.map((item) => {
        const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            title={item.label}
            className={cn(
              "group relative grid size-10 place-items-center rounded-2xl text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              active && "bg-sidebar-accent text-sidebar-accent-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId="rail-active"
                className="absolute inset-0 rounded-2xl bg-brand/15 ring-1 ring-brand/30"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <item.icon className="relative size-[18px]" />
            <span className="pointer-events-none absolute left-12 z-30 hidden whitespace-nowrap rounded-lg bg-popover px-2 py-1 text-xs text-popover-foreground shadow-[var(--shadow-soft)] group-hover:block lg:block lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-16 border-r border-sidebar-border bg-sidebar lg:block">
        <Rail />
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 z-50 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-foreground/40" onClick={() => setMobileOpen(false)} />
            <motion.div
              className="absolute inset-y-0 left-0 flex w-64 flex-col bg-sidebar p-2"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
            >
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-lg font-bold tracking-tight">enaz</span>
                <button onClick={() => setMobileOpen(false)} aria-label="Close menu">
                  <X className="size-5" />
                </button>
              </div>
              <div className="flex gap-2 overflow-y-auto">
                <Rail onNavigate={() => setMobileOpen(false)} />
                <div className="flex flex-1 flex-col gap-1 py-4">
                  {items.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setMobileOpen(false)}
                      className="rounded-xl px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="lg:pl-16">
        <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
            <button
              className="grid size-9 shrink-0 place-items-center rounded-xl border border-border lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="size-4" />
            </button>
            <span className="text-xl font-bold tracking-tight">enaz</span>

            <div className="order-last flex w-full items-center gap-1 overflow-x-auto rounded-full bg-muted p-1 sm:order-none sm:mx-auto sm:w-auto">
              {filters.map((f) => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className={cn(
                    "relative shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors",
                    activeFilter === f && "text-primary-foreground",
                  )}
                >
                  {activeFilter === f && (
                    <motion.span
                      layoutId="filter-pill"
                      className="absolute inset-0 rounded-full bg-primary"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  )}
                  <span className="relative">{f}</span>
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <label className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-2 md:flex">
                <Search className="size-4 text-muted-foreground" />
                <input
                  placeholder="Search tasks, projects"
                  className="w-40 bg-transparent text-sm outline-none placeholder:text-muted-foreground xl:w-56"
                />
              </label>
              <Link
                to="/notifications"
                className="relative grid size-9 place-items-center rounded-xl border border-border"
                aria-label="Notifications"
              >
                <Bell className="size-4" />
                {unread > 0 && (
                  <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                    {unread}
                  </span>
                )}
              </Link>
              <button
                onClick={toggle}
                className="grid size-9 place-items-center rounded-xl border border-border"
                aria-label="Toggle theme"
              >
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </button>
              <div className="flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-2">
                <Avatar initials={user?.avatar ?? "?"} className="size-7" />
                <div className="hidden leading-tight sm:block">
                  <p className="text-xs font-semibold">{user?.name}</p>
                  <p className="text-[10px] text-muted-foreground">{user ? roleLabel[user.role] : ""}</p>
                </div>
                <button onClick={handleSignOut} aria-label="Sign out" className="text-muted-foreground hover:text-foreground">
                  <LogOut className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
