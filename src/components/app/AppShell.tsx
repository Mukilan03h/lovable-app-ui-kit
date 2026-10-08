import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  CircleHelp,
  Keyboard,
  Laptop,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { footerNavItems, navItems, type NavItem } from "./nav";
import { useAuth, roleLabel } from "@/lib/auth";
import { accents, useTheme, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { Avatar } from "./ui-bits";

const themeModes: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Laptop },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut, can } = useAuth();
  const { theme, toggle, mode, accent, setPref } = useTheme();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");

  const items = navItems.filter((i) => can(i.permission));
  const footerItems = footerNavItems.filter((i) => can(i.permission));

  const handleSignOut = () => {
    signOut();
    navigate({ to: "/auth", replace: true });
  };

  const RailLink = ({
    item,
    onNavigate,
  }: {
    item: NavItem;
    onNavigate?: (() => void) | undefined;
  }) => {
    const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
    return (
      <Link
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
  };

  const Rail = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="flex h-full flex-col items-center gap-1 py-4">
      <Link
        to="/assistant"
        onClick={onNavigate}
        className="mb-3 grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground"
        aria-label="Enaz home"
      >
        <span className="text-sm font-bold">e</span>
      </Link>
      {items.map((item) => (
        <RailLink key={item.to} item={item} onNavigate={onNavigate} />
      ))}
      <div className="mt-auto flex flex-col gap-1">
        {footerItems.map((item) => (
          <RailLink key={item.to} item={item} onNavigate={onNavigate} />
        ))}
      </div>
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
            <div
              className="absolute inset-0 bg-foreground/40"
              onClick={() => setMobileOpen(false)}
            />
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
                  {[...items, ...footerItems].map((item) => (
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
            <span className="hidden rounded-full bg-brand/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand sm:inline">
              Knowledge
            </span>

            <div className="ml-auto flex items-center gap-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  navigate({ to: "/search", search: { q: query } });
                }}
                className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-2 md:flex"
              >
                <Search className="size-4 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search all company knowledge"
                  className="w-48 bg-transparent text-sm outline-none placeholder:text-muted-foreground xl:w-72"
                />
                <kbd className="hidden rounded-md border border-border px-1.5 text-[10px] text-muted-foreground xl:inline">
                  ⏎
                </kbd>
              </form>
              <button
                onClick={toggle}
                className="grid size-9 place-items-center rounded-xl border border-border"
                aria-label="Toggle theme"
              >
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-2 hover:bg-muted">
                  <Avatar initials={user?.avatar ?? "?"} className="size-7" />
                  <span className="hidden text-left leading-tight sm:block">
                    <span className="block text-xs font-semibold">{user?.name}</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {user ? roleLabel[user.role] : ""}
                    </span>
                  </span>
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel className="font-normal">
                    <p className="text-sm font-semibold">{user?.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
                    <Settings className="size-4" /> Settings
                  </DropdownMenuItem>
                  {can("admin") && (
                    <DropdownMenuItem onClick={() => navigate({ to: "/admin" })}>
                      <ShieldCheck className="size-4" /> Admin console
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Theme
                  </DropdownMenuLabel>
                  <div className="grid grid-cols-3 gap-1 px-2 pb-2">
                    {themeModes.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setPref("mode", m.id)}
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-lg py-1.5 text-[11px]",
                          mode === m.id ? "bg-primary text-primary-foreground" : "bg-muted",
                        )}
                      >
                        <m.icon className="size-3.5" /> {m.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between px-3 pb-2">
                    {accents.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setPref("accent", a.id)}
                        aria-label={`${a.label} accent`}
                        className="grid size-6 place-items-center rounded-full"
                        style={{ background: a.swatch }}
                      >
                        {accent === a.id && <Check className="size-3.5 text-white" />}
                      </button>
                    ))}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <Keyboard className="size-4" /> Keyboard shortcuts
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <CircleHelp className="size-4" /> Help & docs
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                    <LogOut className="size-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
