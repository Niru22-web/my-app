"use client";

import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";
import { roleInfo } from "@/lib/roles";
import { canEmail, canEssl, canManageAccess, canSystem } from "./api";

const BASE = "/admin-portal";

/** Administration tabs this person may open — each mirrors the API guard behind it. */
export function useAdminTabs() {
  const { user } = useAuth();
  const { can, loading } = usePermissions();
  const r = roleInfo(user?.role);
  const inArea = r.isAdmin || r.isOwner || r.isIT || r.isHR || can("admin_panel") || can("employees") || can("email_templates");
  const tabs = [
    { href: `${BASE}/dashboard`, label: "Overview", show: true },
    { href: `${BASE}/masters`, label: "Masters", show: r.isAdmin || r.isOwner || r.isIT || r.isHR || can("admin_panel") },
    { href: `${BASE}/users`, label: "Users & access", show: canManageAccess(user?.role) },
    { href: `${BASE}/hierarchy`, label: "Hierarchy", show: r.isAdmin || r.isOwner || r.isIT || r.isHR || can("employees") },
    { href: `${BASE}/essl`, label: "Biometric devices", show: canEssl(user?.role) },
    { href: `${BASE}/system`, label: "Server & storage", show: canSystem(user?.role) },
    { href: `${BASE}/email-templates`, label: "Email", show: canEmail(user?.role) },
  ].filter((t) => t.show);
  return { inArea, tabs, loading };
}
