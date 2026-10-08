import { Sparkles, Search, Plug, Bot, Files, BarChart3 } from "lucide-react";
import type { Permission } from "@/lib/auth";

export type NavItem = {
  label: string;
  to: string;
  icon: typeof Sparkles;
  permission: Permission;
};

export const navItems: NavItem[] = [
  { label: "Assistant", to: "/assistant", icon: Sparkles, permission: "assistant" },
  { label: "Search", to: "/search", icon: Search, permission: "search" },
  { label: "Artifacts", to: "/artifacts", icon: Files, permission: "artifacts" },
  { label: "Agents", to: "/agents", icon: Bot, permission: "agents" },
  { label: "Connectors", to: "/connectors", icon: Plug, permission: "connectors" },
  { label: "Insights", to: "/insights", icon: BarChart3, permission: "insights" },
];
