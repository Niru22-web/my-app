"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { normRole } from "@/lib/roles";
import { formatDate } from "@/lib/format";
import type { Envelope } from "@/lib/types";
import type { Step } from "@/components/ui/stepper";

export const CATEGORIES = ["Travel", "Food", "Accommodation", "Office Supplies", "Other"] as const;

interface Person {
  firstName: string;
  lastName: string;
}

export interface Claim {
  id: string;
  claimId: string;
  category: string;
  amount: number;
  description: string | null;
  date: string;
  status: string;
  paymentStatus: string | null;
  paymentMode: string | null;
  utrNumber: string | null;
  bankReference: string | null;
  rejectionReason: string | null;
  submittedAt: string | null;
  managerApprovedAt: string | null;
  partnerApprovedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  paidAt: string | null;
  employeeId: string;
  clientId: string | null;
  projectId: string | null;
  jobId: string | null;
  employee?: { id: string; firstName: string; lastName: string; employeeId?: string; department?: string | null } | null;
  client?: { id: string; name: string } | null;
  project?: { id: string; name: string } | null;
  job?: { id: string; name: string } | null;
  managerApprover?: Person | null;
  partnerApprover?: Person | null;
  processedBy?: Person | null;
  receiptFile?: string | null;
  attachments?: { id: string; fileName: string; filePath: string; fileSize?: number | null; mimeType?: string | null; uploadedAt?: string }[];
  logs?: { id: string; action: string; status: string | null; remarks: string | null; performedAt: string; performedBy?: Person | null }[];
}

export type Stage = "manager" | "final" | "payment" | "paid" | "rejected" | "returned" | "finance";

export function stageOf(c: Pick<Claim, "status" | "paymentStatus">): Stage {
  const s = (c.status ?? "").toUpperCase();
  if (s === "PAID" || (c.paymentStatus ?? "").toLowerCase() === "paid") return "paid";
  if (s === "PENDING_MANAGER") return "manager";
  if (s === "MANAGER_APPROVED" || s === "PENDING_PARTNER") return "final";
  if (s === "APPROVED" || s === "PENDING_PAYMENT") return "payment";
  if (s === "REJECTED") return "rejected";
  if (s === "SENT_BACK") return "returned";
  return "finance"; // accounts-portal states (PENDING_ACCOUNTS, APPROVED_DIRECTOR, APPROVED_CFO, …)
}

export const STAGE_LABEL: Record<Stage, string> = {
  manager: "Awaiting manager",
  final: "Awaiting final approval",
  payment: "Approved · awaiting payment",
  paid: "Paid",
  rejected: "Rejected",
  returned: "Returned to you",
  finance: "In finance review",
};

export const STAGE_TONE: Record<Stage, "warning" | "success" | "danger" | "brand" | "neutral"> = {
  manager: "warning",
  final: "warning",
  payment: "brand",
  paid: "success",
  rejected: "danger",
  returned: "danger",
  finance: "warning",
};

const name = (p?: Person | null) => (p ? `${p.firstName} ${p.lastName}`.trim() : null);

export function claimSteps(c: Claim): Step[] {
  const st = stageOf(c);
  const managerDone = !!c.managerApprovedAt || ["final", "payment", "paid", "finance"].includes(st);
  const finalDone = ["payment", "paid"].includes(st);
  const failedAtFinal = (st === "rejected" || st === "returned") && !!c.managerApprovedAt;
  const failedAtManager = (st === "rejected" || st === "returned") && !c.managerApprovedAt;
  return [
    { label: "Submitted", state: "done", detail: formatDate(c.submittedAt ?? c.date) },
    {
      label: "Manager",
      state: failedAtManager ? "failed" : managerDone ? "done" : st === "manager" ? "current" : "upcoming",
      detail: failedAtManager ? (st === "returned" ? "Returned" : "Rejected") : managerDone ? [name(c.managerApprover), c.managerApprovedAt && formatDate(c.managerApprovedAt)].filter(Boolean).join(" · ") || null : null,
    },
    {
      label: "Final approval",
      state: failedAtFinal ? "failed" : finalDone ? "done" : st === "final" || st === "finance" ? "current" : "upcoming",
      detail: failedAtFinal ? (st === "returned" ? "Returned" : "Rejected") : finalDone ? [name(c.partnerApprover), (c.approvedAt ?? c.partnerApprovedAt) && formatDate(c.approvedAt ?? c.partnerApprovedAt)].filter(Boolean).join(" · ") || null : null,
    },
    {
      label: "Paid",
      state: st === "paid" ? "done" : st === "payment" ? "current" : "upcoming",
      detail: st === "paid" ? [c.paymentMode, c.paidAt && formatDate(c.paidAt)].filter(Boolean).join(" · ") || null : null,
    },
  ];
}

// ---- Roles -------------------------------------------------------------------------

const r = (role: string | null | undefined) => normRole(role);
export const canSeeTeamClaims = (role?: string | null) =>
  ["manager", "partner", "admin", "owner", "hr", "accountant", "finance manager", "accounts"].includes(r(role));
/** Sees all claims firm-wide (API "orgView"). */
export const isFinanceWide = (role?: string | null) => ["admin", "partner", "owner", "hr", "accountant", "finance manager"].includes(r(role));
const finalApprover = (role?: string | null) => ["partner", "admin", "owner"].includes(r(role));
const canPayRole = (role?: string | null) => ["admin", "owner", "accountant", "finance manager", "accounts"].includes(r(role));

/** What the signed-in reviewer may do with someone else's claim, following the API's stage rules. */
export function reviewerActions(c: Claim, role: string | null | undefined, userId: string | undefined) {
  const st = stageOf(c);
  const own = c.employeeId === userId;
  const approve = !own && ((st === "manager" && (r(role) === "manager" || finalApprover(role))) || (st === "final" && finalApprover(role)));
  return {
    approve,
    approveLabel: st === "manager" && !finalApprover(role) ? "Approve (manager)" : "Final approve",
    reject: approve,
    sendBack: approve,
    pay: !own && st === "payment" && canPayRole(role),
  };
}

// ---- Queries & mutations -------------------------------------------------------------

export function useMyClaims(enabled = true) {
  return useQuery({
    queryKey: ["claims", "mine"],
    queryFn: async () => (await api<Envelope<Claim[]>>("reimbursements")).data ?? [],
    enabled,
  });
}

export type TeamTab = "pending" | "APPROVED" | "PAID" | "REJECTED" | "SENT_BACK";

export function useTeamClaims(tab: TeamTab, orgView: boolean, enabled = true) {
  return useQuery({
    queryKey: ["claims", "team", tab, orgView],
    queryFn: async () => (await api<Envelope<Claim[]>>("reimbursements/team-approvals", { query: { status: tab, orgView: orgView ? "true" : undefined } })).data ?? [],
    enabled,
  });
}

export interface ClaimInput {
  category: string;
  amount: number;
  description: string;
  date: string;
  clientId: string;
  projectId: string;
  jobId: string;
  files?: File[];
}

function toForm(b: ClaimInput) {
  const fd = new FormData();
  Object.entries(b).forEach(([k, v]) => {
    if (k === "files" || v === undefined) return;
    fd.append(k, String(v));
  });
  for (const f of b.files ?? []) {
    fd.append("receipts", f);
  }
  return fd;
}

export function useClaimMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["claims"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  return {
    create: useMutation({ mutationFn: (b: ClaimInput) => api<Envelope<Claim>>("reimbursements", { method: "POST", body: toForm(b) }), onSuccess: refresh }),
    update: useMutation({ mutationFn: ({ id, body }: { id: string; body: ClaimInput }) => api(`reimbursements/${id}`, { method: "PATCH", body: toForm(body) }), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (id: string) => api(`reimbursements/${id}`, { method: "DELETE" }), onSuccess: refresh }),
    approve: useMutation({ mutationFn: ({ id, remarks }: { id: string; remarks?: string }) => api(`reimbursements/${id}/approve`, { method: "PATCH", body: { remarks } }), onSuccess: refresh }),
    reject: useMutation({ mutationFn: ({ id, remarks }: { id: string; remarks: string }) => api(`reimbursements/${id}/reject`, { method: "PATCH", body: { remarks } }), onSuccess: refresh }),
    sendBack: useMutation({ mutationFn: ({ id, remarks }: { id: string; remarks: string }) => api(`reimbursements/${id}/send-back`, { method: "PATCH", body: { remarks } }), onSuccess: refresh }),
    pay: useMutation({
      mutationFn: ({ id, ...b }: { id: string; paymentMode: string; bankReference: string; utrNumber: string; remarks: string }) =>
        api(`reimbursements/${id}/mark-as-paid`, { method: "PATCH", body: b }),
      onSuccess: refresh,
    }),
  };
}

export function claimant(c: Claim) {
  return c.employee ? `${c.employee.firstName} ${c.employee.lastName}`.trim() : "—";
}
