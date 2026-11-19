"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getToken } from "@/lib/api";
import type { Envelope } from "@/lib/types";

/** Payroll engine (ported from ASA MIS): salary structures and monthly runs. Accounts, Admin and Owner only. */

const B = "accounts/payroll-engine";

export const AMOUNT_FIELDS = ["basic", "hra", "conv", "bonus", "pt", "pfEmployee", "esicEmployee", "pfEmployer", "esicEmployer"] as const;
export type AmountField = (typeof AMOUNT_FIELDS)[number];
export const AMOUNT_LABEL: Record<AmountField, string> = {
  basic: "Basic",
  hra: "HRA",
  conv: "Conveyance",
  bonus: "Bonus",
  pt: "Professional tax",
  pfEmployee: "PF (employee)",
  esicEmployee: "ESIC (employee)",
  pfEmployer: "PF (employer)",
  esicEmployer: "ESIC (employer)",
};

export interface SalaryStructure {
  id: string;
  entityId: string;
  employeeId: string | null;
  name: string;
  gender: "M" | "F" | null;
  status: "Active" | "Left";
  dateOfJoining: string | null;
  dateOfLeaving: string | null;
  pfApplicable: boolean;
  esicApplicable: boolean;
  basicPct: number | null;
  ctc: number | null;
  basic: number;
  hra: number;
  conv: number;
  bonus: number;
  pt: number;
  pfEmployee: number;
  esicEmployee: number;
  pfEmployer: number;
  esicEmployer: number;
  structureSource: string | null;
  needsReview: boolean;
  reviewNote: string | null;
  gross: number;
  netPay: number;
  entity?: { id: string; name: string };
  employee?: { id: string; firstName: string; lastName: string; employeeId: string } | null;
}

export interface PayrollRunSummary {
  id: string;
  entityId: string;
  month: string;
  status: "Draft" | "Finalised";
  createdAt: string;
  finalisedAt: string | null;
  entity: { id: string; name: string };
  employees: number;
  gross: number;
  netPay: number;
  approved: number;
}

export interface PayrollLine {
  id: string;
  runId: string;
  structureId: string;
  basic: number;
  hra: number;
  conv: number;
  bonus: number;
  gross: number;
  pt: number;
  pfEmployee: number;
  esicEmployee: number;
  pfEmployer: number;
  esicEmployer: number;
  netPay: number;
  totalDays: number;
  lopDays: number;
  paidDays: number;
  pfApplicable: boolean;
  esicApplicable: boolean;
  basicPct: number | null;
  ctc: number | null;
  calcBasis: "full month" | "prorated" | "edited";
  remarks: string | null;
  approvalStatus: "Pending" | "Okay";
  approvalRemarks: string | null;
  approvedAt: string | null;
  timesheetName: string | null;
  timesheetAt: string | null;
  payrollId: string | null;
  hasTimesheetFile: boolean;
  /** Hours the linked person logged in the portal that month; null when not linked to a portal account. */
  portalHours: number | null;
  timesheetOk: boolean;
  structure: {
    name: string;
    gender: "M" | "F" | null;
    needsReview: boolean;
    reviewNote: string | null;
    status: string;
    employeeId: string | null;
    employee: { firstName: string; lastName: string; employeeId: string } | null;
  };
}

export interface PayrollRunDetail {
  run: {
    id: string;
    entityId: string;
    month: string;
    status: "Draft" | "Finalised";
    createdAt: string;
    finalisedAt: string | null;
    entity: { id: string; name: string; legalName: string | null; address: string | null };
  };
  lines: PayrollLine[];
  notInRun: { id: string; name: string; status: string }[];
}

export const monthLabel = (month: string, long = false) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: long ? "long" : "short", year: "numeric", timeZone: "UTC" });

export const deductionsOf = (l: Pick<PayrollLine, "pt" | "pfEmployee" | "esicEmployee">) => l.pt + l.pfEmployee + l.esicEmployee;

const KEY = ["accounts", "payroll-engine"] as const;

export const useSalaryStructures = (entityId?: string, on = true) =>
  useQuery({
    queryKey: [...KEY, "structures", entityId ?? "all"],
    queryFn: async () => (await api<Envelope<SalaryStructure[]>>(`${B}/structures`, { query: { entityId } })).data ?? [],
    enabled: on,
  });

export const usePayrollRuns = (on = true) =>
  useQuery({ queryKey: [...KEY, "runs"], queryFn: async () => (await api<Envelope<PayrollRunSummary[]>>(`${B}/runs`)).data ?? [], enabled: on });

export const usePayrollRun = (id: string, on = true) =>
  useQuery({ queryKey: [...KEY, "run", id], queryFn: async () => (await api<Envelope<PayrollRunDetail>>(`${B}/runs/${id}`)).data, enabled: on && !!id });

/** Uploads a timesheet file for a line (multipart; the JSON helper can't send files). */
async function uploadTimesheet(runId: string, lineId: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const token = getToken();
  const res = await fetch(`/api/${B}/runs/${runId}/lines/${lineId}/timesheet`, { method: "POST", body: fd, headers: token ? { Authorization: `Bearer ${token}` } : undefined });
  const j = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) throw new Error(j.message || `Upload failed (${res.status})`);
  return j;
}

export function usePayrollMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: KEY });
    // Finalising/reopening adds or removes regular payables entries.
    void qc.invalidateQueries({ queryKey: ["accounts", "payroll"] });
  };
  const useMut = <V,>(fn: (v: V) => Promise<unknown>) => useMutation({ mutationFn: fn, onSuccess: refresh });
  return {
    createStructure: useMut((b: Partial<SalaryStructure>) => api(`${B}/structures`, { method: "POST", body: b })),
    updateStructure: useMut(({ id, ...b }: Partial<SalaryStructure> & { id: string }) => api(`${B}/structures/${id}`, { method: "PATCH", body: b })),
    createRun: useMut((b: { entityId: string; month: string }) => api<Envelope<{ id: string }>>(`${B}/runs`, { method: "POST", body: b })),
    deleteRun: useMut((id: string) => api(`${B}/runs/${id}`, { method: "DELETE" })),
    addLine: useMut(({ runId, structureId }: { runId: string; structureId: string }) => api(`${B}/runs/${runId}/lines`, { method: "POST", body: { structureId } })),
    removeLine: useMut(({ runId, lineId }: { runId: string; lineId: string }) => api(`${B}/runs/${runId}/lines/${lineId}`, { method: "DELETE" })),
    updateLine: useMut(({ runId, lineId, ...b }: { runId: string; lineId: string; totalDays?: number; lopDays?: number; amounts?: Partial<Record<AmountField, number>>; remarks?: string }) =>
      api(`${B}/runs/${runId}/lines/${lineId}`, { method: "PATCH", body: b }),
    ),
    recalculate: useMut(({ runId, lineId }: { runId: string; lineId: string }) => api(`${B}/runs/${runId}/lines/${lineId}/recalculate`, { method: "POST" })),
    setApproval: useMut(({ runId, lineId, status, remarks }: { runId: string; lineId: string; status: "Okay" | "Pending"; remarks?: string }) =>
      api(`${B}/runs/${runId}/lines/${lineId}/approval`, { method: "POST", body: { status, remarks } }),
    ),
    attachTimesheet: useMut(({ runId, lineId, file }: { runId: string; lineId: string; file: File }) => uploadTimesheet(runId, lineId, file)),
    finalise: useMut((runId: string) => api<Envelope<{ payablesCreated: number; notLinked: number }>>(`${B}/runs/${runId}/finalise`, { method: "POST" })),
    reopen: useMut((runId: string) => api(`${B}/runs/${runId}/reopen`, { method: "POST" })),
  };
}

export const payrollFilePath = (runId: string, lineId: string) => `${B}/runs/${runId}/lines/${lineId}/timesheet`;
export const payrollExportPath = (runId: string) => `${B}/runs/${runId}/export`;
