"use client";

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { useAuth } from "./auth";
import { roleInfo } from "./roles";
import type { PermissionFlags, PermissionsResponse } from "./types";

// The API keys modules by their snake_case name (admin_panel). Older responses used camelCase — accept either.
const MODULE_ALIASES: Record<string, string> = {
  admin_panel: "adminPanel",
  email_templates: "emailTemplates",
  leave_management: "leaveManagement",
};
const flagsFor = (perms: Record<string, Partial<Record<Action, boolean>>> | undefined, module: string) =>
  perms?.[module] ?? (MODULE_ALIASES[module] ? perms?.[MODULE_ALIASES[module]] : undefined);

export type Action = keyof PermissionFlags;

/** Module permissions for the signed-in user, with the same role overrides the API applies. */
export function usePermissions() {
  const { user, status } = useAuth();
  const q = useQuery({
    queryKey: ["my-permissions", user?.id],
    queryFn: () => api<PermissionsResponse>("admin/my-permissions"),
    enabled: status === "authenticated" && !!user,
    staleTime: 5 * 60_000,
  });

  const can = useCallback(
    (module: string, action: Action = "canView") => {
      const r = roleInfo(user?.role);
      if (r.isAdmin || r.isOwner || r.isIT) return true;
      if (r.isAccounts && ["employees", "projects", "clients"].includes(module)) return action === "canView";
      return !!flagsFor(q.data?.permissions, module)?.[action];
    },
    [user?.role, q.data],
  );

  /** Only what an Admin has actually granted (no role-based bypass). Used where access must be configurable. */
  const granted = useCallback(
    (module: string, action: Action = "canView") => !!flagsFor(q.data?.permissions, module)?.[action],
    [q.data],
  );

  return { can, granted, loading: q.isLoading, error: q.error };
}
