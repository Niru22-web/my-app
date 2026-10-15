"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Envelope } from "@/lib/types";

// ---- Exits -------------------------------------------------------------------------------------

export const EXIT_TYPES = ["Resignation", "Termination", "Retirement", "Contract end", "Absconding"] as const;
export const TEAMS = ["HR", "IT", "Accounts", "Manager"] as const;
export type ExitStatus = "INITIATED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export const EXIT_STATUS_LABEL: Record<ExitStatus, string> = {
  INITIATED: "Started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};
export const exitTone = (s: string) => (s === "COMPLETED" ? "success" : s === "CANCELLED" ? "neutral" : s === "IN_PROGRESS" ? "brand" : "warning") as "success" | "neutral" | "brand" | "warning";
export const TEAM_LABEL: Record<string, string> = { HR: "HR", IT: "IT", Accounts: "Accounts", Manager: "Reporting manager / partner" };

export interface ExitTask {
  id: string;
  title: string;
  team: string;
  done: boolean;
  doneAt: string | null;
  doneBy: string | null;
  note: string | null;
  canTick: boolean;
}

export interface ExitRecord {
  id: string;
  employee: { id: string; code: string | null; name: string | null; designation: string | null; department: string | null; status: string | null };
  exitType: string;
  resignationDate: string;
  lastWorkingDay: string;
  daysToLastDay: number;
  reason: string | null;
  remarks: string | null;
  status: ExitStatus;
  initiatedBy: string | null;
  createdAt: string;
  completedAt: string | null;
  completedBy: string | null;
  progress: { done: number; total: number };
  checks: {
    assets: { count: number; items: string[] };
    claims: { count: number; amount: number; items: string[] };
    leaves: { count: number; items: string[] };
  };
  blockers: string[];
  tasks: ExitTask[];
  can: { edit: boolean; cancel: boolean; complete: boolean };
}

export function useExits(enabled = true) {
  return useQuery({
    queryKey: ["hr", "exits"],
    queryFn: async () => (await api<Envelope<ExitRecord[]>>("exits", { query: { status: "ALL" } })).data ?? [],
    enabled,
  });
}

export function useExitMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ["hr", "exits"] });
  const put = (rec: ExitRecord) => {
    qc.setQueryData<ExitRecord[]>(["hr", "exits"], (xs) => (xs ? xs.map((x) => (x.id === rec.id ? rec : x)) : xs));
    void done();
  };
  return {
    start: useMutation({
      mutationFn: async (body: { employeeId?: string; exitType?: string; resignationDate: string; lastWorkingDay: string; reason?: string }) =>
        (await api<Envelope<ExitRecord>>("exits", { method: "POST", body })).data,
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => (await api<Envelope<ExitRecord>>(`exits/${id}`, { method: "PATCH", body })).data,
      onSuccess: put,
    }),
    tick: useMutation({
      mutationFn: async ({ id, taskId, body }: { id: string; taskId: string; body: { done?: boolean; note?: string | null } }) =>
        (await api<Envelope<ExitRecord>>(`exits/${id}/tasks/${taskId}`, { method: "PATCH", body })).data,
      onSuccess: put,
    }),
    cancel: useMutation({
      mutationFn: async ({ id, reason }: { id: string; reason: string }) => (await api<Envelope<ExitRecord>>(`exits/${id}/cancel`, { method: "POST", body: { reason } })).data,
      onSuccess: put,
    }),
    complete: useMutation({
      mutationFn: async (id: string) => await api<Envelope<ExitRecord>>(`exits/${id}/complete`, { method: "POST" }),
      onSuccess: (r) => {
        put(r.data);
        void qc.invalidateQueries({ queryKey: ["mgmt", "people"] });
      },
    }),
  };
}

// ---- Document checklist ------------------------------------------------------------------------

export type CheckStatus = "MISSING" | "UPLOADED" | "VERIFIED" | "WAIVED" | "REJECTED";
export const CHECK_LABEL: Record<CheckStatus, string> = {
  MISSING: "Not received",
  UPLOADED: "Received — to check",
  VERIFIED: "Verified",
  WAIVED: "Not needed",
  REJECTED: "Sent back",
};
export const checkTone = (s: string) =>
  (s === "VERIFIED" ? "success" : s === "UPLOADED" ? "brand" : s === "WAIVED" ? "neutral" : s === "REJECTED" ? "danger" : "warning") as
    | "success"
    | "brand"
    | "neutral"
    | "danger"
    | "warning";

export interface DocRequirement {
  id: string;
  name: string;
  category: string;
  description: string | null;
  mandatory: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface ChecklistItem {
  requirement: { id: string; name: string; category: string; description: string | null; mandatory: boolean };
  status: CheckStatus;
  document: { id: string; title: string; category: string; uploadedAt: string } | null;
  profileFile: string | null;
  note: string | null;
  checkedAt: string | null;
  checkedBy: string | null;
}

export interface Tally {
  total: number;
  mandatoryMissing: number;
  awaiting: number;
  verified: number;
  waived: number;
  rejected: number;
  missing: number;
}

export interface Checklist {
  employee: { id: string; code: string; name: string; designation: string | null; department: string | null; status: string | null };
  canVerify: boolean;
  canUpload: boolean;
  summary: Tally;
  items: ChecklistItem[];
}

export interface SummaryRow extends Tally {
  employee: { id: string; code: string; name: string; designation: string | null; department: string | null };
  missingNames: string[];
}

export function useRequirements(all = false, enabled = true) {
  return useQuery({
    queryKey: ["hr", "doc-reqs", all],
    queryFn: async () => (await api<Envelope<DocRequirement[]>>("hr/document-requirements", { query: all ? { all: 1 } : undefined })).data ?? [],
    enabled,
  });
}

export function useChecklist(employeeId: string | undefined | null, enabled = true) {
  return useQuery({
    queryKey: ["hr", "checklist", employeeId],
    queryFn: async () => (await api<Envelope<Checklist>>("hr/document-checklist", { query: { employeeId: employeeId! } })).data,
    enabled: enabled && !!employeeId,
  });
}

export function useChecklistSummary(enabled = true) {
  return useQuery({
    queryKey: ["hr", "checklist-summary"],
    queryFn: async () => (await api<Envelope<{ requirements: number; rows: SummaryRow[] }>>("hr/document-checklist/summary")).data,
    enabled,
  });
}

export function useDocMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["hr", "checklist"] });
    void qc.invalidateQueries({ queryKey: ["hr", "checklist-summary"] });
  };
  const refreshReqs = () => {
    void qc.invalidateQueries({ queryKey: ["hr", "doc-reqs"] });
    refresh();
  };
  return {
    setCheck: useMutation({
      mutationFn: async ({ employeeId, requirementId, status, note }: { employeeId: string; requirementId: string; status: "VERIFIED" | "WAIVED" | "REJECTED" | null; note?: string | null }) =>
        api(`hr/document-checklist/${employeeId}/${requirementId}`, { method: "PUT", body: { status, note: note ?? null } }),
      onSuccess: refresh,
    }),
    upload: useMutation({
      mutationFn: async ({ employeeId, file, title, category }: { employeeId: string; file: File; title: string; category: string }) => {
        const fd = new FormData();
        fd.append("title", title);
        fd.append("category", category);
        fd.append("file", file);
        return api(`employees/${employeeId}/documents`, { method: "POST", body: fd });
      },
      onSuccess: (_r, v) => {
        refresh();
        void qc.invalidateQueries({ queryKey: ["profile", v.employeeId, "documents"] });
      },
    }),
    saveReq: useMutation({
      mutationFn: async ({ id, body }: { id?: string; body: Partial<DocRequirement> }) =>
        api<Envelope<DocRequirement>>(id ? `hr/document-requirements/${id}` : "hr/document-requirements", { method: id ? "PUT" : "POST", body }),
      onSuccess: refreshReqs,
    }),
    removeReq: useMutation({
      mutationFn: async (id: string) => api<{ message?: string }>(`hr/document-requirements/${id}`, { method: "DELETE" }),
      onSuccess: refreshReqs,
    }),
  };
}
