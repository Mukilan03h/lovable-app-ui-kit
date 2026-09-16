import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { members, type Member, type Role } from "@/data/mock";

export type Permission =
  | "dashboard"
  | "projects"
  | "tasks"
  | "team"
  | "invoices"
  | "calendar"
  | "time"
  | "reports"
  | "notifications"
  | "settings"
  | "team:manage"
  | "finance:manage";

const rolePermissions: Record<Role, Permission[]> = {
  admin: [
    "dashboard",
    "projects",
    "tasks",
    "team",
    "invoices",
    "calendar",
    "time",
    "reports",
    "notifications",
    "settings",
    "team:manage",
    "finance:manage",
  ],
  manager: [
    "dashboard",
    "projects",
    "tasks",
    "team",
    "invoices",
    "calendar",
    "time",
    "reports",
    "notifications",
    "settings",
    "finance:manage",
  ],
  member: ["dashboard", "projects", "tasks", "calendar", "time", "notifications", "settings"],
  client: ["dashboard", "projects", "invoices", "notifications"],
};

export const roleLabel: Record<Role, string> = {
  admin: "Admin",
  manager: "Manager",
  member: "Member",
  client: "Client",
};

type AuthValue = {
  user: Member | null;
  ready: boolean;
  signIn: (role: Role) => Member;
  signOut: () => void;
  can: (permission: Permission) => boolean;
};

const AuthContext = createContext<AuthValue>({
  user: null,
  ready: false,
  signIn: () => members[0],
  signOut: () => {},
  can: () => false,
});

const STORAGE_KEY = "enaz-session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Member | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = window.localStorage.getItem(STORAGE_KEY);
    const found = members.find((m) => m.id === id) ?? null;
    setUser(found);
    setReady(true);
  }, []);

  const signIn = useCallback((role: Role) => {
    const next = members.find((m) => m.role === role) ?? members[0];
    window.localStorage.setItem(STORAGE_KEY, next.id);
    setUser(next);
    return next;
  }, []);

  const signOut = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }, []);

  const can = useCallback(
    (permission: Permission) => (user ? rolePermissions[user.role].includes(permission) : false),
    [user],
  );

  const value = useMemo(() => ({ user, ready, signIn, signOut, can }), [user, ready, signIn, signOut, can]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
