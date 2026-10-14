"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { normRole } from "@/lib/roles";
import type { Envelope } from "@/lib/types";


export interface Leave {
  id: string;
  leaveId: string;
  type: string;
  reason: string;
  duration: string;
  fromDate: string;
  toDate: string;
  totalDays: number;
  status: string;
  appliedDate: string;
  approvedDate: string | null;
  approvedRole: string | null;
  employeeId: string;
  employee?: { id: string; firstName: string; lastName: string; officeEmail: string } | null;
  approver?: { firstName: string; lastName: string } | null;
  /** Pending requests only: which approval step it is waiting for */
  stage?: "level1" | "level2" | "final" | null;
  /** Pending requests only: what the signed-in person may do (step-1 approval or final decision) */
  canAct?: "level1" | "final" | null;
  approvals?: { id: string; level: number; decision: string; comment: string | null; createdAt: string; approver: { firstName: string; lastName: string } }[];
}

/** Short text for where a pending request is in the approval chain. */
export function stageLabel(l: Pick<Leave, "stage" | "approvals">): string | null {
  if (l.stage === "level1") return "With reporting manager";
  if (l.stage === "level2") {
    const step1 = l.approvals?.find((a) => a.level === 1 && a.decision === "approved");
    return step1 ? `Approved by ${step1.approver.firstName} · with partner` : "With reporting partner";
  }
  return null;
}

export type LeaveState = "pending" | "approved" | "rejected" | "cancelled";

export function leaveState(l: Pick<Leave, "status">): LeaveState {
  const s = (l.status ?? "").toLowerCase();
  if (s.includes("approved")) return "approved";
  if (s === "rejected") return "rejected";
  if (s === "cancelled") return "cancelled";
  return "pending";
}

export const LEAVE_STATE_LABEL: Record<LeaveState, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

/** Roles that can adjust balances and see negative balances firm-wide. */
export function canManageBalances(role: string | null | undefined) {
  return ["admin", "owner", "hr"].includes(normRole(role));
}

export function useLeaves(query: { employeeId?: string; status?: string; dateFrom?: string; dateTo?: string; scope?: "team" | "org" }, enabled = true) {
  return useQuery({
    queryKey: ["leaves", query],
    queryFn: async () => (await api<Envelope<Leave[]>>("leaves", { query })).data ?? [],
    enabled,
  });
}

export interface NegativeBalance {
  id: string;
  firstName: string;
  lastName: string;
  employeeId: string;
  department: string | null;
  balance: number;
  used: number;
  accrued: number;
}

export function useNegativeBalances(enabled: boolean) {
  return useQuery({
    queryKey: ["leaves", "negative"],
    queryFn: async () => (await api<Envelope<NegativeBalance[]>>("leaves/negative-balances")).data ?? [],
    enabled,
  });
}

export interface LeaveInput {
  type: string;
  reason: string;
  duration: "Full Day" | "Half Day";
  fromDate: string;
  toDate: string;
}

export function useLeaveMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["leaves"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  return {
    apply: useMutation({ mutationFn: (b: LeaveInput) => api<Envelope<Leave>>("leaves", { method: "POST", body: b }), onSuccess: refresh }),
    edit: useMutation({ mutationFn: ({ id, body }: { id: string; body: LeaveInput }) => api(`leaves/${id}`, { method: "PATCH", body }), onSuccess: refresh }),
    cancel: useMutation({ mutationFn: (id: string) => api(`leaves/${id}`, { method: "DELETE" }), onSuccess: refresh }),
    decide: useMutation({
      mutationFn: ({ id, status, comment }: { id: string; status: "approved" | "rejected"; comment?: string }) =>
        api<{ success: boolean; message?: string }>(`leaves/${id}`, { method: "PUT", body: { status, comment } }),
      onSuccess: refresh,
    }),
  };
}

export function personName(p?: { firstName?: string; lastName?: string } | null) {
  return p ? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() : "—";
}
