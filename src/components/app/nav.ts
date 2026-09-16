import {
  LayoutGrid,
  FolderKanban,
  CheckSquare,
  Users,
  Receipt,
  CalendarDays,
  Timer,
  BarChart3,
  Bell,
  Settings,
} from "lucide-react";
import type { Permission } from "@/lib/auth";

export type NavItem = {
  label: string;
  to: string;
  icon: typeof LayoutGrid;
  permission: Permission;
};

export const navItems: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutGrid, permission: "dashboard" },
  { label: "Projects", to: "/projects", icon: FolderKanban, permission: "projects" },
  { label: "Tasks", to: "/tasks", icon: CheckSquare, permission: "tasks" },
  { label: "Team", to: "/team", icon: Users, permission: "team" },
  { label: "Invoices", to: "/invoices", icon: Receipt, permission: "invoices" },
  { label: "Calendar", to: "/calendar", icon: CalendarDays, permission: "calendar" },
  { label: "Time", to: "/time", icon: Timer, permission: "time" },
  { label: "Reports", to: "/reports", icon: BarChart3, permission: "reports" },
  { label: "Notifications", to: "/notifications", icon: Bell, permission: "notifications" },
  { label: "Settings", to: "/settings", icon: Settings, permission: "settings" },
];
