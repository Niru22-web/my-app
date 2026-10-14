"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Envelope } from "@/lib/types";
import { normRole } from "@/lib/roles";

// ---- Types (shapes returned by /api/timelogs) -------------------------------

export type SubmissionStatus = "not_submitted" | "submitted" | "approved" | "rejected" | string;

export interface Timelog {
  id: string;
  hours: number;
  description: string;
  date: string;
  employeeId: string;
  jobId: string;
  clientId: string | null;
  projectId: string | null;
  workItem: string | null;
  billableStatus: "billable" | "non_billable" | string;
  submissionStatus: SubmissionStatus;
  submittedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  createdAt: string;
  employee?: { id: string; employeeId: string; firstName: string; lastName: string; officeEmail: string };
  job?: {
    id: string;
    jobId: string;
    name: string;
    project?: { id: string; projectId: string; name: string; client?: { id: string; clientId: string; name: string; alias?: string | null } | null } | null;
  } | null;
}

export interface Client {
  id: string;
  clientId: string;
  name: string;
  alias?: string | null;
  status?: string;
}
export interface Project {
  id: string;
  projectId: string;
  name: string;
  status?: string;
  billable?: boolean;
  clientId: string;
}
export interface Job {
  id: string;
  jobId: string;
  name: string;
  status?: string;
  billable?: boolean;
  projectId: string;
}

export interface TimelogInput {
  jobId: string;
  hours: number;
  description: string;
  date: string;
  workItem: string;
  isBillable: boolean;
}

export interface ImportResult {
  success?: boolean;
  message?: string;
  totalRows?: number;
  validRows?: number;
  successfulImports?: number;
  validationErrorsCount?: number;
  importErrorsCount?: number;
  validationErrors?: { row: number; employee?: string; project?: string; job?: string; error: string }[];
  importErrors?: { row?: number; employee?: string; project?: string; job?: string; error: string }[];
  errors?: { row: number; employee?: string; project?: string; job?: string; error: string }[];
}

// ---- Status helpers ----------------------------------------------------------

export const STATUS_LABEL: Record<string, string> = {
  not_submitted: "Draft",
  draft: "Draft",
  submitted: "Awaiting approval",
  approved: "Approved",
  rejected: "Rejected",
};

export function statusOf(t: Pick<Timelog, "submissionStatus">): "draft" | "submitted" | "approved" | "rejected" {
  const s = (t.submissionStatus ?? "").toLowerCase();
  if (s === "submitted" || s === "pending") return "submitted";
  if (s === "approved") return "approved";
  if (s === "rejected") return "rejected";
  return "draft";
}

/** Roles that can review other people's time (matches the legacy Team tab + backend approval rules). */
export function canReview(role: string | null | undefined): boolean {
  return ["admin", "owner", "manager", "partner", "sub manager", "sub-manager"].includes(normRole(role));
}

export function isPrivileged(role: string | null | undefined): boolean {
  return ["admin", "owner", "manager", "partner"].includes(normRole(role));
}

// ---- Queries -------------------------------------------------------------------

export interface MyFilters {
  dateFrom: string;
  dateTo: string;
  projectId?: string;
}

export function useMyTimelogs(f: MyFilters) {
  return useQuery({
    queryKey: ["timelogs", "my", f],
    queryFn: async () => (await api<Envelope<Timelog[]>>("timelogs/my", { query: { ...f } })).data ?? [],
  });
}

export interface TeamFilters {
  /** team = reporting tree, org = whole firm (server-scoped) */
  scope?: "team" | "org";
  dateFrom?: string;
  dateTo?: string;
  employeeId?: string;
  projectId?: string;
  status?: "Submitted" | "Approved" | "Rejected" | "Draft" | "";
}

export function useTeamTimelogs(f: TeamFilters, enabled = true) {
  return useQuery({
    queryKey: ["timelogs", "team", f],
    queryFn: async () => (await api<Envelope<Timelog[]>>("timelogs/team", { query: { ...f } })).data ?? [],
    enabled,
  });
}

export function useClients() {
  return useQuery({
    queryKey: ["lookup", "clients"],
    queryFn: async () => (await api<Envelope<Client[]>>("clients")).data ?? [],
    staleTime: 5 * 60_000,
  });
}

export function useProjects(clientId?: string) {
  return useQuery({
    queryKey: ["lookup", "projects", clientId ?? "all"],
    queryFn: async () => (await api<Envelope<Project[]>>("projects", { query: { clientId } })).data ?? [],
    staleTime: 5 * 60_000,
  });
}

export function useJobs(projectId?: string) {
  return useQuery({
    queryKey: ["lookup", "jobs", projectId],
    queryFn: async () => (await api<Envelope<Job[]>>("jobs", { query: { projectId } })).data ?? [],
    enabled: !!projectId,
    staleTime: 5 * 60_000,
  });
}

interface EmployeeLite {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  status?: string;
}

export function useTeamMembers(enabled: boolean) {
  return useQuery({
    queryKey: ["lookup", "employees"],
    // The legacy endpoint returns full employee rows; keep only what the filter needs.
    queryFn: async () => {
      const res = await api<Envelope<EmployeeLite[]> | EmployeeLite[]>("employees");
      const rows = Array.isArray(res) ? res : (res.data ?? []);
      return rows.map(({ id, employeeId, firstName, lastName, status }) => ({ id, employeeId, firstName, lastName, status }));
    },
    enabled,
    staleTime: 5 * 60_000,
  });
}

// ---- Mutations -----------------------------------------------------------------

export function useTimelogMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["timelogs"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
    void qc.invalidateQueries({ queryKey: ["compliance"] });
  };

  return {
    create: useMutation({ mutationFn: (b: TimelogInput) => api("timelogs", { method: "POST", body: b }), onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: TimelogInput }) => api(`timelogs/${id}`, { method: "PUT", body }),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: (id: string) => api(`timelogs/${id}`, { method: "DELETE" }), onSuccess: refresh }),
    submit: useMutation({ mutationFn: (id: string) => api(`timelogs/${id}/submit`, { method: "PATCH" }), onSuccess: refresh }),
    submitMany: useMutation({
      mutationFn: (ids: string[]) => api<Envelope<{ count: number }>>("timelogs/submit-bulk", { method: "POST", body: { ids } }),
      onSuccess: refresh,
    }),
    approve: useMutation({ mutationFn: (id: string) => api(`timelogs/${id}/approve`, { method: "POST" }), onSuccess: refresh }),
    reject: useMutation({
      mutationFn: ({ id, reason }: { id: string; reason: string }) => api(`timelogs/${id}/reject`, { method: "POST", body: { reason } }),
      onSuccess: refresh,
    }),
    approveMany: useMutation({
      mutationFn: (ids: string[]) => api<Envelope<{ count: number }>>("timelogs/bulk-approve", { method: "POST", body: { ids } }),
      onSuccess: refresh,
    }),
    rejectMany: useMutation({
      mutationFn: ({ ids, reason }: { ids: string[]; reason: string }) =>
        api<Envelope<{ count: number }>>("timelogs/bulk-reject", { method: "POST", body: { ids, reason } }),
      onSuccess: refresh,
    }),
    importFile: useMutation({
      mutationFn: (file: File) => {
        const fd = new FormData();
        fd.append("file", file);
        return api<ImportResult>("timelogs/import", { method: "POST", body: fd });
      },
      onSuccess: refresh,
    }),
  };
}

export function employeeName(t: Timelog): string {
  return t.employee ? `${t.employee.firstName} ${t.employee.lastName}`.trim() : "—";
}
