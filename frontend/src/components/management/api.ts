"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { normRole } from "@/lib/roles";
import type { Envelope } from "@/lib/types";

// ---- Types ---------------------------------------------------------------------------

export interface Client {
  id: string;
  clientId: string;
  name: string;
  alias: string | null;
  address: string | null;
  pin: string | null;
  state: string | null;
  country: string | null;
  gstStatus: string | null;
  gstin: string | null;
  pan: string | null;
  status: string;
  _count?: { projects: number };
  loggedHours?: number;
}

interface PersonLite {
  id: string;
  firstName: string;
  lastName: string;
}

export interface Project {
  id: string;
  projectId: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string | null;
  billable: boolean;
  clientId: string;
  contactPerson: string | null;
  client?: Client | null;
  users?: { employee: PersonLite }[];
  _count?: { jobs: number };
  loggedHours?: number;
}

export interface Job {
  id: string;
  jobId: string;
  combinedId: string;
  name: string;
  description: string | null;
  status: string;
  billable: boolean;
  projectId: string;
  startDate: string | null;
  endDate: string | null;
  project?: (Project & { client?: Client | null }) | null;
  users?: { employee: PersonLite }[];
  _count?: { timelogs: number };
  loggedHours?: number;
}

/** Employee fields the UI needs. The API returns whole rows; everything else is dropped on arrival. */
export interface Person {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  officeEmail: string;
  role: string | null;
  designation: string | null;
  department: string | null;
  status: string | null;
  createdAt: string | null;
  profileImage: string | null;
  loggedHours: number | null;
}

function toPerson(e: Record<string, unknown>): Person {
  const s = (k: string) => (typeof e[k] === "string" ? (e[k] as string) : null);
  return {
    id: String(e.id),
    employeeId: s("employeeId") ?? "",
    firstName: s("firstName") ?? "",
    lastName: s("lastName") ?? "",
    officeEmail: s("officeEmail") ?? "",
    role: s("role"),
    designation: s("designation"),
    department: s("department"),
    status: s("status"),
    createdAt: s("createdAt"),
    profileImage: s("profileImage"),
    loggedHours: typeof e.loggedHours === "number" ? e.loggedHours : null,
  };
}

export const fullName = (p?: { firstName?: string | null; lastName?: string | null } | null) => (p ? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() : "—");

// ---- Status vocabularies ----------------------------------------------------------------

export const WORK_STATUSES = ["Started", "In-Discussion", "Completed", "Inactive"] as const;
/** Time can only be logged against jobs in these states (enforced by the timesheet API). */
export const LOGGABLE = ["active", "started"];
export const isInactive = (s?: string | null) => (s ?? "").toLowerCase() === "inactive";

export function workTone(s?: string | null): "success" | "warning" | "neutral" | "brand" {
  const v = (s ?? "").toLowerCase();
  if (v === "started" || v === "active") return "success";
  if (v === "in-discussion") return "warning";
  if (v === "completed") return "brand";
  return "neutral";
}

// ---- Roles ---------------------------------------------------------------------------------

const r = (role?: string | null) => normRole(role);
/** May create/edit clients, projects and jobs (API: Admin, Partner, Manager, IT). */
export const canManageWork = (role?: string | null) => ["admin", "owner", "partner", "manager", "it"].includes(r(role));
/** May delete clients (API: Admin, IT). */
export const canDeleteClient = (role?: string | null) => ["admin", "it"].includes(r(role));
/** May delete projects (API: Admin, Partner, IT). */
export const canDeleteProject = (role?: string | null) => ["admin", "partner", "it"].includes(r(role));
/** May invite, edit, activate/deactivate people (API: HR, Admin, Owner only). */
export const canManagePeople = (role?: string | null) => ["admin", "owner", "hr"].includes(r(role));
/** May approve/reject registrations and re-send invitations (API: HR, Admin, Owner only). */
export const canApprovePeople = (role?: string | null) => ["admin", "owner", "hr"].includes(r(role));
export const isEmployeeRole = (role?: string | null) => ["employee", "user", ""].includes(r(role));

// ---- Queries ---------------------------------------------------------------------------------

export function useClientList(enabled = true) {
  return useQuery({
    queryKey: ["mgmt", "clients"],
    queryFn: async () => (await api<Envelope<Client[]>>("clients", { query: { status: "All Status" } })).data ?? [],
    enabled,
  });
}

/** All clients, for pickers (the scoped list can hide clients a manager needs to choose). */
export function useClientOptions(enabled = true) {
  return useQuery({
    queryKey: ["mgmt", "clients", "options"],
    queryFn: async () => (await api<Envelope<Client[]>>("clients", { query: { status: "Active", all: "true" } })).data ?? [],
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useProjectList(enabled = true) {
  return useQuery({
    queryKey: ["mgmt", "projects"],
    queryFn: async () => (await api<Envelope<Project[]>>("projects")).data ?? [],
    enabled,
  });
}

export function useJobList(enabled = true) {
  return useQuery({
    queryKey: ["mgmt", "jobs"],
    queryFn: async () => (await api<Envelope<Job[]>>("jobs")).data ?? [],
    enabled,
  });
}

export function usePeople(enabled = true) {
  return useQuery({
    queryKey: ["mgmt", "people"],
    queryFn: async () => {
      const res = await api<Envelope<Record<string, unknown>[]> | Record<string, unknown>[]>("employees");
      return (Array.isArray(res) ? res : (res.data ?? [])).map(toPerson);
    },
    enabled,
  });
}

export function usePendingPeople(enabled: boolean) {
  return useQuery({
    queryKey: ["mgmt", "people", "pending"],
    queryFn: async () => ((await api<Envelope<Record<string, unknown>[]>>("employees/pending-approvals")).data ?? []).map(toPerson),
    enabled,
  });
}

export interface MasterOption {
  id: string;
  name: string;
}
export function useMaster(kind: "roles" | "designations" | "departments" | "shifts" | "locations" | "employment-types", enabled = true) {
  return useQuery({
    queryKey: ["masters", kind],
    queryFn: async () => (await api<Envelope<MasterOption[]>>(`masters/${kind}/options`)).data ?? [],
    enabled,
    staleTime: 10 * 60_000,
  });
}

// ---- Mutations -------------------------------------------------------------------------------

export function useMgmtMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["mgmt"] });
    void qc.invalidateQueries({ queryKey: ["lookup"] });
  };
  // Keeps each action’s own response type so callers can read e.g. the invitation link.
  const useAction = <T, R = unknown>(fn: (v: T) => Promise<R>) => useMutation({ mutationFn: fn, onSuccess: refresh });
  return {
    saveClient: useAction(({ id, body }: { id?: string; body: Record<string, unknown> }) => api(id ? `clients/${id}` : "clients", { method: id ? "PUT" : "POST", body })),
    deleteClient: useAction((id: string) => api(`clients/${id}`, { method: "DELETE" })),
    saveProject: useAction(({ id, body }: { id?: string; body: Record<string, unknown> }) => api(id ? `projects/${id}` : "projects", { method: id ? "PUT" : "POST", body })),
    deleteProject: useAction((id: string) => api(`projects/${id}`, { method: "DELETE" })),
    saveJob: useAction(({ id, body }: { id?: string; body: Record<string, unknown> }) => api(id ? `jobs/${id}` : "jobs", { method: id ? "PUT" : "POST", body })),
    deleteJob: useAction((id: string) => api(`jobs/${id}`, { method: "DELETE" })),
    createPerson: useAction((body: Record<string, unknown>) =>
      api<{ success: boolean; emailStatus?: string; inviteLink?: string; data?: { employeeId?: string } }>("employees", { method: "POST", body }),
    ),
    togglePerson: useAction((id: string) => api(`employees/${id}/toggle-status`, { method: "PATCH" })),
    approvePerson: useAction((id: string) => api(`employees/approve-employee/${id}`, { method: "POST" })),
    rejectPerson: useAction(({ id, reason }: { id: string; reason: string }) => api(`employees/reject-employee/${id}`, { method: "POST", body: { reason } })),
    resendInvite: useAction((id: string) => api<{ success: boolean; inviteLink?: string; message?: string }>(`employees/resend-registration/${id}`, { method: "POST" })),
  };
}

// ---- Full-record payloads (status changes go through PUT so nothing else is wiped) -------

export function clientBody(c: Client, patch: Partial<Client> = {}) {
  const x = { ...c, ...patch };
  return { name: x.name, alias: x.alias ?? "", address: x.address, pin: x.pin, state: x.state, country: x.country, gstStatus: x.gstStatus ?? "No", gstin: x.gstin, pan: x.pan ?? "", status: x.status };
}

export function projectBody(p: Project, patch: Partial<Project> = {}) {
  const x = { ...p, ...patch };
  return {
    name: x.name,
    clientId: x.clientId,
    status: x.status,
    startDate: x.startDate?.slice(0, 10),
    endDate: x.endDate ? x.endDate.slice(0, 10) : null,
    billable: x.billable,
    contactPerson: x.contactPerson,
  };
}

export function jobBody(j: Job, patch: Partial<Job> = {}) {
  const x = { ...j, ...patch };
  return {
    name: x.name,
    projectId: x.projectId,
    description: x.description,
    status: x.status,
    startDate: x.startDate ? x.startDate.slice(0, 10) : null,
    endDate: x.endDate ? x.endDate.slice(0, 10) : null,
    billable: x.billable,
  };
}
