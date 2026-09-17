import type { ReactNode } from "react";
import { useAuth, type Permission } from "@/lib/auth";
import { NoAccess } from "./NoAccess";

export function Guard({
  permission,
  area,
  children,
}: {
  permission: Permission;
  area: string;
  children: ReactNode;
}) {
  const { can } = useAuth();
  if (!can(permission)) return <NoAccess area={area} />;
  return <>{children}</>;
}
