import { Sparkles, Search, Plug, Bot, Files, BarChart3, Settings, ShieldCheck, Inbox, ListChecks } from "lucide-react";
import type { Permission } from "@/lib/auth";

export type NavItem = {
  label: string;
  to: string;
  icon: typeof Sparkles;
  permission: Permission;
};

export const navItems: NavItem[] = [
  { label: "Assistant", to: "/assistant", icon: Sparkles, permission: "assistant" },
  { label: "Inbox", to: "/inbox", icon: Inbox, permission: "assistant" },
  { label: "Search", to: "/search", icon: Search, permission: "search" },
  { label: "Artifacts", to: "/artifacts", icon: Files, permission: "artifacts" },
  { label: "Agents", to: "/agents", icon: Bot, permission: "agents" },
  { label: "Runs", to: "/runs", icon: ListChecks, permission: "agents" },
  { label: "Connectors", to: "/connectors", icon: Plug, permission: "connectors" },
  { label: "Insights", to: "/insights", icon: BarChart3, permission: "insights" },
];

/** Pinned to the bottom of the rail. */
export const footerNavItems: NavItem[] = [
  { label: "Settings", to: "/settings", icon: Settings, permission: "settings" },
  { label: "Admin", to: "/admin", icon: ShieldCheck, permission: "admin" },
];
