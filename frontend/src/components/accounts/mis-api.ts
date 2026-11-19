"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getToken } from "@/lib/api";
import type { Envelope } from "@/lib/types";

/** ASA MIS features in Accounts: Tally import, P&L by entity, cost allocation, vertical MIS, data checks. */

export type CostSource = "payroll" | "tally";
export type Head = "Revenue" | "Expense" | "Tax";
export const HEADS = ["Revenue", "Expense", "Tax", "Balance Sheet", "Suspense"] as const;
export const PARTY_CATEGORIES = ["Employee", "Consultant", "Partner", "Other"] as const;

export interface PnlRow {
  entityId: string;
  month: string;
  head: Head;
  amount: number;
}
export interface PnlLedger {
  ledger: string;
  primaryGroup: string | null;
  amount: number;
  entries: number;
}
export interface TallyLoadLog {
  id: string;
  entityId: string;
  register: string;
  sourceFile: string | null;
  vouchers: number;
  rows: number;
  tallyGrandTotal: number;
  outputTotal: number;
  difference: number;
  loadedAt: string;
  entity: { name: string };
}
export interface TallyStatus {
  logs: TallyLoadLog[];
  entities: { id: string; name: string; voucherRows: number; ledgers: number; from: string | null; to: string | null }[];
}
export interface RegisterResult {
  file: string;
  register?: string;
  vouchers?: number;
  rows?: number;
  tallyGrandTotal?: number;
  outputTotal?: number;
  difference?: number;
  ok?: boolean;
  error?: string;
}
export interface GroupHead {
  primaryGroup: string;
  head: string | null;
  ledgers: number;
}
export interface TallyParty {
  tallyName: string;
  expense: number;
  months: number;
  link: { id: string; employeeId: string | null; category: string; employee?: { id: string; firstName: string; lastName: string; employeeId: string } | null } | null;
}
export interface AllocationRow {
  month: string;
  employeeId: string;
  person: string;
  clientId: string;
  client: string;
  projectId: string;
  project: string | null;
  reportingClient: string;
  serviceCategory: string | null;
  verticalHead: string | null;
  partner: string | null;
  hours: number;
  totalHours: number;
  monthCost: number;
  allocated: number;
}
export interface UnallocatedRow {
  month: string;
  person: string;
  employeeId: string | null;
  cost: number;
  reason: string;
}
export interface ReportingMapping {
  id: string;
  reportingClientName: string | null;
  serviceCategory: string | null;
  verticalHead: string | null;
  engagementPartner: string | null;
}
export interface ReportingClient {
  id: string;
  name: string;
  status: string;
  mapping: ReportingMapping | null;
  projects: { id: string; name: string; status: string; partner: string | null; mapping: ReportingMapping | null }[];
}
export interface VerticalRow {
  verticalHead: string;
  reportingClient: string;
  serviceCategory: string;
  partner: string | null;
  revenue: number;
  cost: number;
  hours: number;
  contribution: number;
}
export interface DataCheck {
  key: string;
  title: string;
  status: "ok" | "warn" | "info";
  count: number;
  detail: string;
  sample: Record<string, unknown>[];
}
export interface MisSnapshotInfo {
  id: string;
  label: string;
  uploadedAt: string;
}

const env = async <T,>(p: string, query?: Record<string, string | undefined>) => (await api<Envelope<T>>(p, { query })).data;
const KEY = ["accounts", "mis"] as const;

export const usePnlFilters = () => useQuery({ queryKey: [...KEY, "pnl-filters"], queryFn: () => env<{ months: string[]; entities: { id: string; name: string }[] }>("accounts/pnl/filters") });
export const usePnl = (entityIds: string[], months: string[]) =>
  useQuery({ queryKey: [...KEY, "pnl", entityIds, months], queryFn: () => env<PnlRow[]>("accounts/pnl", { entityIds: entityIds.join(","), months: months.join(",") }), enabled: months.length > 0 });
export const usePnlLedgers = (entityIds: string[], months: string[], head: string | null) =>
  useQuery({ queryKey: [...KEY, "pnl-ledgers", entityIds, months, head], queryFn: () => env<PnlLedger[]>("accounts/pnl/ledgers", { entityIds: entityIds.join(","), months: months.join(","), head: head! }), enabled: !!head && months.length > 0 });

export const useTallyStatus = () => useQuery({ queryKey: [...KEY, "tally-status"], queryFn: () => env<TallyStatus>("accounts/tally/status") });
export const useGroupHeads = () => useQuery({ queryKey: [...KEY, "group-heads"], queryFn: () => env<GroupHead[]>("accounts/tally/group-heads") });
export const useTallyParties = () => useQuery({ queryKey: [...KEY, "parties"], queryFn: () => env<TallyParty[]>("accounts/tally/parties") });

export const useCostMonths = (source: CostSource) => useQuery({ queryKey: [...KEY, "cost-months", source], queryFn: () => env<string[]>("accounts/cost-allocation/months", { source }) });
export const useCostAllocation = (source: CostSource, months: string[], entityId?: string) =>
  useQuery({
    queryKey: [...KEY, "cost", source, months, entityId ?? ""],
    queryFn: () => env<{ rows: AllocationRow[]; unallocated: UnallocatedRow[] }>("accounts/cost-allocation", { source, months: months.join(","), entityId }),
    enabled: months.length > 0,
  });
export const useReportingMap = () => useQuery({ queryKey: [...KEY, "reporting-map"], queryFn: () => env<ReportingClient[]>("accounts/reporting-map") });
export const useVerticalMis = (source: CostSource, months: string[]) =>
  useQuery({ queryKey: [...KEY, "vertical", source, months], queryFn: () => env<{ rows: VerticalRow[]; unallocatedCost: number }>("accounts/vertical-mis", { source, months: months.join(",") }), enabled: months.length > 0 });
export const useMisSnapshots = () => useQuery({ queryKey: [...KEY, "snapshots"], queryFn: () => env<MisSnapshotInfo[]>("accounts/vertical-mis/snapshots") });
export const useMisSnapshot = (id: string | null) =>
  useQuery({ queryKey: [...KEY, "snapshot", id], queryFn: () => env<{ id: string; label: string; data: Record<string, unknown> }>(`accounts/vertical-mis/snapshots/${id}`), enabled: !!id, staleTime: 10 * 60_000 });
export const useDataChecks = (months: string[]) => useQuery({ queryKey: [...KEY, "checks", months], queryFn: () => env<DataCheck[]>("accounts/data-checks", { months: months.join(",") || undefined }) });

async function upload<T>(path: string, files: File[], fields: Record<string, string> = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  for (const f of files) fd.append("file", f);
  const token = getToken();
  const res = await fetch(`/api/${path}`, { method: "POST", body: fd, headers: token ? { Authorization: `Bearer ${token}` } : undefined });
  const j = (await res.json().catch(() => ({}))) as { message?: string; data?: T };
  if (!res.ok) throw new Error(j.message || `Upload failed (${res.status})`);
  return j.data as T;
}

export function useMisMutations() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: KEY });
  const useMut = <V, R = unknown>(fn: (v: V) => Promise<R>) => useMutation({ mutationFn: fn, onSuccess: refresh });
  return {
    importRegisters: useMut(({ entityId, files }: { entityId: string; files: File[] }) => upload<RegisterResult[]>("accounts/tally/registers", files, { entityId })),
    importLedgers: useMut(({ entityId, file }: { entityId?: string; file: File }) =>
      upload<{ summary: { entity: string; ledgers: number }[]; unmappedGroups: string[] }>("accounts/tally/ledgers", [file], entityId ? { entityId } : {}),
    ),
    removeRegister: useMut(({ entityId, register }: { entityId: string; register: string }) => api(`accounts/tally/registers`, { method: "DELETE", query: { entityId, register } })),
    setGroupHead: useMut((b: { primaryGroup: string; head: string }) => api("accounts/tally/group-heads", { method: "PUT", body: b })),
    linkParty: useMut((b: { tallyName: string; employeeId: string | null; category: string }) => api("accounts/tally/parties", { method: "PUT", body: b })),
    setMapping: useMut((b: { clientId: string; projectId?: string | null; reportingClientName?: string; serviceCategory?: string; verticalHead?: string; engagementPartner?: string }) =>
      api("accounts/reporting-map", { method: "PUT", body: b }),
    ),
    uploadSnapshot: useMut(({ file, label }: { file: File; label?: string }) => upload<MisSnapshotInfo>("accounts/vertical-mis/snapshots", [file], label ? { label } : {})),
    deleteSnapshot: useMut((id: string) => api(`accounts/vertical-mis/snapshots/${id}`, { method: "DELETE" })),
  };
}

export const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });

/** Indian financial year of a YYYY-MM month, e.g. "2026-27". */
export const fyOf = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  const start = mo >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
};
