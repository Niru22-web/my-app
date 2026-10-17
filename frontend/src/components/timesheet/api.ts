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
    saveWeek: useMutation({
      mutationFn: (b: { weekStart: string; rows: { jobId: string; billable?: boolean; hours: Record<string, number> }[] }) =>
        api<Envelope<{ changed: number }>>("timelogs/week", { method: "PUT", body: b }),
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

// ---- Monthly Defaulter / Pivot Tracker -------------------------------------------

export interface MonthlyTrackerWeek {
  weekIndex: number;
  label: string;
  startDate: string;
  endDate: string;
  expectedHours: number;
}

export interface MonthlyTrackerEmployeeWeek {
  weekIndex: number;
  label: string;
  startDate: string;
  endDate: string;
  loggedHours: number;
  billableHours: number;
  targetHours: number;
  status: "not_filled" | "partial" | "compliant" | "on_leave" | "upcoming";
  hasSubmitted: boolean;
}

export interface MonthlyTrackerEmployee {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  managerName: string | null;
  weeks: MonthlyTrackerEmployeeWeek[];
  totalLoggedHours: number;
  totalBillableHours: number;
  totalTargetHours: number;
  compliancePct: number;
  notFilledWeeks: number;
  partialWeeks: number;
  monthStatus: "not_filled" | "incomplete" | "compliant";
}

export interface MonthlyTrackerResponse {
  success: boolean;
  year: number;
  month: number;
  monthName: string;
  weeks: MonthlyTrackerWeek[];
  kpis: {
    totalEmployees: number;
    notFilledCount: number;
    incompleteCount: number;
    compliantCount: number;
    defaultersCount: number;
    compliancePercentage: number;
  };
  employees: MonthlyTrackerEmployee[];
}

export function useMonthlyTracker(
  params: { year: number; month: number; department?: string; defaultersOnly?: boolean },
  enabled = true,
) {
  const sp = new URLSearchParams();
  sp.set("year", String(params.year));
  sp.set("month", String(params.month));
  if (params.department) sp.set("department", params.department);
  if (params.defaultersOnly) sp.set("defaultersOnly", "true");

  return useQuery({
    queryKey: ["monthly-tracker", params],
    queryFn: () => api<MonthlyTrackerResponse>(`timelogs/monthly-tracker?${sp.toString()}`),
    enabled,
    staleTime: 60_000,
  });
}

// ---- Timesheet Period Lock -----------------------------------------------------

export interface TimesheetLockInfo {
  lockedThrough: string | null;
  history: {
    id: string;
    lockedThrough: string;
    note: string | null;
    by: string;
    at: string;
  }[];
}

export function useTimesheetLock() {
  return useQuery({
    queryKey: ["timesheet-lock"],
    queryFn: async () => {
      try {
        const res = await api<Envelope<TimesheetLockInfo>>("timelogs/lock");
        return res.data ?? { lockedThrough: null, history: [] };
      } catch {
        return { lockedThrough: null, history: [] };
      }
    },
    staleTime: 60_000,
  });
}

export function useSetTimesheetLock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { lockedThrough: string | null; note?: string }) =>
      api("timelogs/lock", { method: "POST", body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["timesheet-lock"] });
      void qc.invalidateQueries({ queryKey: ["timelogs"] });
    },
  });
}

// ---- Grids, My jobs, My projects -------------------------------------------------

export interface GridRowInput {
  jobId: string;
  billable?: boolean;
  description?: string;
  workItem?: string;
  hours: Record<string, number>;
}

export interface MyJob {
  id: string;
  jobId: string;
  name: string;
  status: string;
  billable: boolean;
  startDate: string | null;
  endDate: string | null;
  canLog: boolean;
  assigned: boolean;
  project: { id: string; projectId: string; name: string; status: string };
  client: { id: string; clientId: string; name: string; alias?: string | null };
  myHoursMonth: number;
  myHoursTotal: number;
  myBillableHours: number;
  lastLoggedOn: string | null;
  teamHours: number;
  usersCount: number;
  loggedByCount: number;
}

export interface MyProject {
  id: string;
  projectId: string;
  name: string;
  status: string;
  billable: boolean;
  startDate: string | null;
  endDate: string | null;
  member: boolean;
  client: { id: string; clientId: string; name: string; alias?: string | null };
  jobsCount: number;
  openJobsCount: number;
  usersCount: number;
  myHoursMonth: number;
  myHoursTotal: number;
  myBillableHours: number;
  lastLoggedOn: string | null;
  teamHours: number;
}

export function useMyJobs() {
  return useQuery({
    queryKey: ["timelogs", "my-jobs"],
    queryFn: async () => (await api<Envelope<MyJob[]>>("timelogs/my-jobs")).data ?? [],
    staleTime: 60_000,
  });
}

export function useMyProjects() {
  return useQuery({
    queryKey: ["timelogs", "my-projects"],
    queryFn: async () => (await api<Envelope<MyProject[]>>("timelogs/my-projects")).data ?? [],
    staleTime: 60_000,
  });
}

/** Grid save (PUT /api/timelogs/grid) and bulk delete, sharing the same cache refresh as the other mutations. */
export function useGridMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["timelogs"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
    void qc.invalidateQueries({ queryKey: ["compliance"] });
  };
  return {
    saveGrid: useMutation({
      mutationFn: (b: { from: string; to: string; mode?: "replace" | "append"; rows: GridRowInput[] }) =>
        api<Envelope<{ changed: number }>>("timelogs/grid", { method: "PUT", body: b }),
      onSuccess: refresh,
    }),
    removeMany: useMutation({
      mutationFn: async (ids: string[]) => {
        let done = 0;
        const failed: string[] = [];
        for (const id of ids) {
          try {
            await api(`timelogs/${id}`, { method: "DELETE" });
            done++;
          } catch (e) {
            failed.push(e instanceof Error ? e.message : "Couldn’t delete");
          }
        }
        return { done, failed };
      },
      onSettled: refresh,
    }),
  };
}
