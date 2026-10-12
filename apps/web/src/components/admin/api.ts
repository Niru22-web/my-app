"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { normRole } from "@/lib/roles";
import type { Envelope } from "@/lib/types";

// ── Who can do what (never wider than the API allows) ──────────────────────

const r = (role?: string | null) => normRole(role);
/** GET /system/* — admin, it, owner. */
export const canSystem = (role?: string | null) => ["admin", "it", "owner"].includes(r(role));
/** Master writes — the API allows admin and IT only. */
export const canEditMasters = (role?: string | null) => ["admin", "it"].includes(r(role));
/** Permissions: the API also lets managers/partners write (and grant themselves) — the UI keeps it to Admin/Owner. */
export const canManageAccess = (role?: string | null) => ["admin", "owner"].includes(r(role));
/** ESSL routes allow Admin and IT. */
export const canEssl = (role?: string | null) => ["admin", "it"].includes(r(role));
/** Email templates/config — admin only. */
export const canEmail = (role?: string | null) => r(role) === "admin";

// ── Masters ────────────────────────────────────────────────────────────────

export type MasterKind = "roles" | "designations" | "departments" | "employment-types" | "shifts" | "locations";
export interface MasterItem {
  id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  isActive: boolean;
  createdAt?: string;
}
export const MASTERS: { kind: MasterKind; label: string; singular: string; hint: string }[] = [
  { kind: "roles", label: "Roles", singular: "role", hint: "Job roles with a short code, e.g. Audit Associate (AA)." },
  { kind: "designations", label: "Designations", singular: "designation", hint: "Titles shown on profiles." },
  { kind: "departments", label: "Departments", singular: "department", hint: "Used for reports, compliance and filters." },
  { kind: "employment-types", label: "Employment types", singular: "employment type", hint: "e.g. Full-time, Article, Consultant." },
  { kind: "shifts", label: "Shifts", singular: "shift", hint: "Working hours used by attendance." },
  { kind: "locations", label: "Locations", singular: "location", hint: "Offices and sites (also used by assets)." },
];

export function useMasterList(kind: MasterKind) {
  return useQuery({
    queryKey: ["admin", "masters", kind],
    queryFn: async () => (await api<Envelope<MasterItem[]>>(`masters/${kind}`, { query: { page: "1", limit: "500", status: "all" } })).data ?? [],
  });
}

// ── Users & permissions ────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string | null;
  officeEmail: string;
  designation: string | null;
  department: string | null;
  role: string | null;
  status: string | null;
}
export interface ModulePermission {
  moduleName: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}
export const MODULES: { key: string; label: string; group: string; viewOnly?: boolean }[] = [
  { key: "dashboard", label: "Dashboard", group: "Overview" },
  { key: "inbox", label: "Inbox", group: "Overview" },
  { key: "calendar", label: "Calendar", group: "Overview" },
  { key: "timesheet", label: "Timesheet", group: "My work" },
  { key: "attendance", label: "Attendance", group: "My work" },
  { key: "leave_management", label: "Leave", group: "My work" },
  { key: "reimbursement", label: "Reimbursements", group: "My work" },
  { key: "employees", label: "Employees", group: "Management" },
  { key: "clients", label: "Clients", group: "Management" },
  { key: "projects", label: "Projects", group: "Management" },
  { key: "jobs", label: "Jobs", group: "Management" },
  { key: "reports", label: "Reports", group: "Operations" },
  { key: "analytics", label: "Analytics", group: "Operations", viewOnly: true },
  { key: "compliance", label: "Compliance", group: "Operations" },
  { key: "help_desk", label: "Help Desk", group: "Operations" },
  { key: "asset_management", label: "Asset management", group: "Operations" },
  { key: "accounts", label: "Accounts & Finance", group: "Operations" },
  { key: "admin_panel", label: "Administration", group: "Administration" },
  { key: "email_templates", label: "Email templates", group: "Administration" },
];
/** The API never returns jobs View/Create/Edit (it only selects jobsDelete), so those three are unknown until set. */
export const UNREADABLE = new Set(["jobs:canView", "jobs:canCreate", "jobs:canEdit"]);

export const useAdminUsers = (enabled: boolean) =>
  useQuery({ queryKey: ["admin", "users"], queryFn: async () => (await api<{ users: AdminUser[] }>("admin/users")).users ?? [], enabled });
export const useUserPermissions = (userId: string | null) =>
  useQuery({
    queryKey: ["admin", "perm", "user", userId],
    queryFn: async () => (await api<{ permissions: ModulePermission[] }>(`admin/user-permissions/${userId}`)).permissions ?? [],
    enabled: !!userId,
  });
export const useRolePermissions = (role: string | null) =>
  useQuery({
    queryKey: ["admin", "perm", "role", role],
    queryFn: async () => (await api<{ permissions: ModulePermission[] }>(`admin/role-permissions/${encodeURIComponent(role!)}`)).permissions ?? [],
    enabled: !!role,
  });

// ── System ─────────────────────────────────────────────────────────────────

export interface SystemStatus {
  server: { status: string; environment: string; nodeVersion: string; uptimeFormatted: string; serverTime: string };
  memory: { systemUsedPercent?: number; heapUsedFormatted?: string; rssFormatted?: string; [k: string]: unknown };
  cpu: { cores: number; model: string; loadAverage: number[] };
  database: { status: string; latencyMs: number; counts: Record<string, number> };
  storage: { totalFormatted: string; totalFiles: number; breakdown: Record<string, { formatted: string; count: number }> };
}
export const useSystemStatus = (enabled: boolean) =>
  useQuery({ queryKey: ["admin", "system"], queryFn: async () => (await api<Envelope<SystemStatus>>("system/status")).data, enabled, refetchInterval: 60_000 });

// ── ESSL ───────────────────────────────────────────────────────────────────

export interface EsslMachine {
  id: string;
  name: string;
  ipAddress: string;
  port: number;
  branch: string;
  syncInterval: number;
  isActive: boolean;
  status: string;
  lastSyncAt: string | null;
}
export interface EsslMapping {
  id: string;
  portalEmployeeId: string | null;
  biometricEmployeeId: string;
  biometricName: string;
  syncStatus: string;
  lastPunch: string | null;
  employee?: { id: string; employeeId: string; firstName: string; lastName: string | null; department: string | null } | null;
  machine?: { name: string } | null;
}
export interface EsslLog {
  id: string;
  syncTime: string;
  status: string;
  recordsSynced: number;
  errorMessage: string | null;
  machine?: { name: string } | null;
}
const list = async <T,>(p: string, query?: Record<string, string>) => (await api<Envelope<T[]>>(p, { query })).data ?? [];
export const useEsslMachines = (on: boolean) => useQuery({ queryKey: ["admin", "essl", "machines"], queryFn: () => list<EsslMachine>("essl/machines"), enabled: on });
export const useEsslMappings = (on: boolean) => useQuery({ queryKey: ["admin", "essl", "mappings"], queryFn: () => list<EsslMapping>("essl/mappings"), enabled: on });
export const useEsslLogs = (on: boolean) => useQuery({ queryKey: ["admin", "essl", "logs"], queryFn: () => list<EsslLog>("essl/logs", { limit: "50" }), enabled: on });

// ── Email ──────────────────────────────────────────────────────────────────

export interface EmailTemplate {
  id: string;
  name: string;
  category: string;
  subject: string;
  body: string;
  variables: string[];
  status: string;
  updatedAt: string;
}
export const useEmailStatus = (on: boolean) =>
  useQuery({ queryKey: ["admin", "email", "status"], queryFn: () => api<{ connected: boolean; providers: Record<string, { connected: boolean; email?: string }> }>("email/status"), enabled: on });
export const useEmailTemplates = (on: boolean) =>
  useQuery({ queryKey: ["admin", "email", "templates"], queryFn: async () => (await api<{ templates: EmailTemplate[] }>("email/templates")).templates ?? [], enabled: on });

// ── Mutations ──────────────────────────────────────────────────────────────

function useAdminMutation<V, R>(fn: (v: V) => Promise<R>, keys: string[][]) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => keys.forEach((k) => void qc.invalidateQueries({ queryKey: k })) });
}

export function useAdminMutations() {
  return {
    saveMaster: useAdminMutation(
      ({ kind, id, body }: { kind: MasterKind; id?: string; body: Record<string, unknown> }) =>
        id ? api(`masters/${kind}/${id}`, { method: "PUT", body }) : api(`masters/${kind}`, { method: "POST", body }),
      [["admin", "masters"], ["masters"]],
    ),
    toggleMaster: useAdminMutation(({ kind, id }: { kind: MasterKind; id: string }) => api(`masters/${kind}/${id}/toggle-status`, { method: "PATCH" }), [["admin", "masters"], ["masters"]]),
    deleteMaster: useAdminMutation(({ kind, id }: { kind: MasterKind; id: string }) => api(`masters/${kind}/${id}`, { method: "DELETE" }), [["admin", "masters"], ["masters"]]),
    saveUserPerms: useAdminMutation(
      ({ userId, permissions }: { userId: string; permissions: ModulePermission[] }) => api("admin/user-permissions", { method: "POST", body: { userId, permissions } }),
      [["admin", "perm"], ["my-permissions"]],
    ),
    saveRolePerms: useAdminMutation(
      ({ role, permissions }: { role: string; permissions: ModulePermission[] }) => api("admin/role-permissions", { method: "POST", body: { role, permissions } }),
      [["admin", "perm"], ["my-permissions"]],
    ),
    saveMachine: useAdminMutation(
      ({ id, ...body }: Partial<EsslMachine> & { deviceKey?: string; apiKey?: string }) => (id ? api(`essl/machines/${id}`, { method: "PUT", body }) : api("essl/machines", { method: "POST", body })),
      [["admin", "essl"]],
    ),
    deleteMachine: useAdminMutation((id: string) => api(`essl/machines/${id}`, { method: "DELETE" }), [["admin", "essl"]]),
    testMachine: useAdminMutation((id: string) => api<Envelope<{ success: boolean; status: string; message: string; latency?: number }>>(`essl/machines/${id}/test-connection`, { method: "POST" }), [["admin", "essl", "machines"]]),
    mapEmployee: useAdminMutation(
      ({ id, portalEmployeeId }: { id: string; portalEmployeeId: string | null }) =>
        api(`essl/mappings/${id}`, { method: "PUT", body: { portalEmployeeId, syncStatus: portalEmployeeId ? "Mapped" : "Unmapped" } }),
      [["admin", "essl", "mappings"]],
    ),
    autoMatch: useAdminMutation(() => api<{ message: string; data: { matchedCount: number } }>("essl/mappings/auto-match", { method: "POST" }), [["admin", "essl", "mappings"]]),
    cleanup: useAdminMutation((action: "clean_temp" | "clean_logs") => api<{ message: string }>("system/storage/cleanup", { method: "POST", body: { action } }), [["admin", "system"]]),
    saveTemplate: useAdminMutation(
      ({ id, ...body }: Partial<EmailTemplate> & { name: string; category: string; subject: string; body: string }) =>
        id ? api(`email/templates/${id}`, { method: "PUT", body }) : api("email/templates", { method: "POST", body }),
      [["admin", "email", "templates"]],
    ),
    testEmail: useAdminMutation((b: { to: string; subject: string; text: string; html: string }) => api("email/test-email-configuration", { method: "POST", body: b }), []),
  };
}
