"use client";

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { useAuth } from "./auth";
import { roleInfo } from "./roles";
import type { PermissionFlags, PermissionsResponse } from "./types";

// The API returns camelCase keys for some modules; screens use snake_case names.
const MODULE_ALIASES: Record<string, string> = {
  admin_panel: "adminPanel",
  email_templates: "emailTemplates",
  leave_management: "leaveManagement",
};

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
      const key = MODULE_ALIASES[module] ?? module;
      return !!q.data?.permissions?.[key]?.[action];
    },
    [user?.role, q.data],
  );

  /** Only what an Admin has actually granted (no role-based bypass). Used where access must be configurable. */
  const granted = useCallback(
    (module: string, action: Action = "canView") => !!q.data?.permissions?.[MODULE_ALIASES[module] ?? module]?.[action],
    [q.data],
  );

  return { can, granted, loading: q.isLoading, error: q.error };
}
