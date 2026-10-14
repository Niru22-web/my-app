import { prisma } from "../config/db";
import { normRole, reportingTreeIds, type JwtUser } from "../plugins/auth";
import { getWorkCalendar } from "./work-calendar";

// ── Leave approval chain ─────────────────────────────────────────────────────
// One step  (setting = 1): anyone above the person in the reporting line approves.
// Two steps (setting = 2):
//   step 1 — the person's reporting manager / team leader (manager, sub-manager)
//   step 2 — their reporting partner; the request is approved only after this step.
//   • If the person has no reporting manager, the partner decides in one step.
//   • If they have no reporting partner, the manager's approval is final.
//   • A partner, anyone higher up, HR, Admin or Owner can give the final approval at either step.
// The status stays "pending" until the final approval; step-1 approvals live in leave_approvals.

export interface Approvers { level1: Set<string>; level2: Set<string> }

export async function approversFor(employeeIds: string[]): Promise<Map<string, Approvers>> {
  const rows = await prisma.employee.findMany({
    where: { id: { in: employeeIds } },
    select: {
      id: true, managerId: true, reportingManagerIds: true, subManagerId: true, subManagerIds: true, partnerId: true, reportingPartnerIds: true,
      managers: { select: { managerId: true } },
      partners: { select: { partnerId: true } },
    },
  });
  const out = new Map<string, Approvers>();
  for (const e of rows) {
    const level2 = new Set([e.partnerId, ...e.reportingPartnerIds, ...e.partners.map((p) => p.partnerId)].filter((x): x is string => !!x && x !== e.id));
    const level1 = new Set(
      [e.managerId, e.subManagerId, ...e.reportingManagerIds, ...e.subManagerIds, ...e.managers.map((m) => m.managerId)].filter((x): x is string => !!x && x !== e.id && !level2.has(x)),
    );
    out.set(e.id, { level1, level2 });
  }
  return out;
}

/** Leave ids that already have a step-1 approval. */
export async function stepOneApproved(leaveIds: string[]): Promise<Map<string, { approverId: string; at: Date }>> {
  if (!leaveIds.length) return new Map();
  const rows = await prisma.leaveApproval.findMany({
    where: { leaveId: { in: leaveIds }, level: 1, decision: "approved" },
    orderBy: { createdAt: "desc" },
    select: { leaveId: true, approverId: true, createdAt: true },
  });
  const out = new Map<string, { approverId: string; at: Date }>();
  for (const r of rows) if (!out.has(r.leaveId)) out.set(r.leaveId, { approverId: r.approverId, at: r.createdAt });
  return out;
}

export type Stage = "level1" | "level2" | "final";
export type Power = "final" | "level1" | null;

/** Which step a pending request is waiting for. */
export function stageOf(levels: number, a: Approvers | undefined, stepOneDone: boolean): Stage {
  if (levels < 2 || !a) return "final";
  if (!a.level1.size) return "level2"; // no team leader → straight to the partner
  if (!a.level2.size) return "level1"; // no partner → the manager's approval is final
  return stepOneDone ? "level2" : "level1";
}

/**
 * What the caller may do on a pending request: "final" (approve completely), "level1"
 * (step-1 approval only) or null (not theirs to decide).
 */
export function powerOver(
  u: JwtUser,
  employeeId: string,
  levels: number,
  a: Approvers | undefined,
  stepOneDone: boolean,
  callerTree: Set<string>,
): Power {
  const r = normRole(u.role);
  if (employeeId === u.id) return ["admin", "owner"].includes(r) ? "final" : null;
  if (["admin", "owner", "hr"].includes(r)) return "final";
  if (!callerTree.has(employeeId)) return null;
  if (levels < 2 || !a) return "final";
  if (a.level2.has(u.id)) return "final";
  if (a.level1.has(u.id)) {
    if (!a.level2.size) return "final";
    return stepOneDone ? null : "level1";
  }
  // Higher up the tree than both the manager and the partner
  return "final";
}

/** Everything needed to decide on many requests at once (for lists). */
export async function approvalContext(u: JwtUser, leaves: { id: string; employeeId: string }[]) {
  const [cal, approvers, stepOne, tree] = await Promise.all([
    getWorkCalendar(),
    approversFor([...new Set(leaves.map((l) => l.employeeId))]),
    stepOneApproved(leaves.map((l) => l.id)),
    reportingTreeIds(u.id),
  ]);
  const treeSet = new Set(tree);
  const levels = cal.leaveApprovalLevels;
  return {
    levels,
    approvers,
    stepOne,
    stage: (l: { id: string; employeeId: string }) => stageOf(levels, approvers.get(l.employeeId), stepOne.has(l.id)),
    power: (l: { id: string; employeeId: string }) => powerOver(u, l.employeeId, levels, approvers.get(l.employeeId), stepOne.has(l.id), treeSet),
  };
}

/** People to notify when a request reaches a step. */
export function notifyTargets(stage: Stage, a: Approvers | undefined): string[] {
  if (!a) return [];
  if (stage === "level1") return [...a.level1];
  if (stage === "level2") return [...a.level2];
  return [...new Set([...a.level1, ...a.level2])];
}
