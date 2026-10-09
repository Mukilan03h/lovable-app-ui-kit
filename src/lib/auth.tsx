import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { type Member, type Role } from "@/data/mock";
import { apiDemoLogin, apiLogin, apiMe, getToken, setToken, type SessionUser } from "@/lib/api";

export type Permission =
  | "assistant"
  | "search"
  | "connectors"
  | "connectors:manage"
  | "agents"
  | "artifacts"
  | "insights"
  | "admin"
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
    "assistant",
    "search",
    "connectors",
    "connectors:manage",
    "agents",
    "artifacts",
    "insights",
    "admin",
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
    "assistant",
    "search",
    "connectors",
    "agents",
    "artifacts",
    "insights",
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
  member: [
    "assistant",
    "search",
    "agents",
    "artifacts",
    "dashboard",
    "projects",
    "tasks",
    "calendar",
    "time",
    "notifications",
    "settings",
  ],
  client: [
    "assistant",
    "search",
    "artifacts",
    "settings",
    "dashboard",
    "projects",
    "invoices",
    "notifications",
  ],
};

export const roleLabel: Record<Role, string> = {
  admin: "Admin",
  manager: "Curator",
  member: "Member",
  client: "Guest",
};

type AuthValue = {
  user: Member | null;
  ready: boolean;
  signIn: (role: Role) => Promise<Member>;
  signInWithPassword: (email: string, password: string) => Promise<Member>;
  signOut: () => void;
  can: (permission: Permission) => boolean;
};

const AuthContext = createContext<AuthValue>({
  user: null,
  ready: false,
  signIn: async () => {
    throw new Error("AuthProvider is missing");
  },
  signInWithPassword: async () => {
    throw new Error("AuthProvider is missing");
  },
  signOut: () => {},
  can: () => false,
});

/** Map a backend session user onto the Member shape the UI already uses. */
function toMember(u: SessionUser): Member {
  return {
    id: u.id,
    name: u.name,
    role: u.role as Role,
    title: u.title,
    email: u.email,
    avatar: u.avatar || u.name.slice(0, 2).toUpperCase(),
    workload: 0,
    tasksOpen: 0,
    tasksDone: 0,
    hoursWeek: 0,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Member | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      if (getToken()) {
        try {
          const { user: u } = await apiMe();
          if (!cancelled) setUser(toMember(u));
        } catch {
          setToken(null);
        }
      }
      if (!cancelled) setReady(true);
    }
    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (role: Role) => {
    const { token, user: u } = await apiDemoLogin(role);
    setToken(token);
    const member = toMember(u);
    setUser(member);
    return member;
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { token, user: u } = await apiLogin(email, password);
    setToken(token);
    const member = toMember(u);
    setUser(member);
    return member;
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const can = useCallback(
    (permission: Permission) => (user ? rolePermissions[user.role].includes(permission) : false),
    [user],
  );

  const value = useMemo(
    () => ({ user, ready, signIn, signInWithPassword, signOut, can }),
    [user, ready, signIn, signInWithPassword, signOut, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
