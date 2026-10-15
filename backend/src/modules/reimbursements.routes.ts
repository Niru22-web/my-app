import type { FastifyInstance } from "fastify";
import { prisma, SAFE_EMPLOYEE_SELECT } from "../config/db";
import { ACCOUNTS_ROLES, authenticate, leadsATeam, normRole, reportingTreeIds, requireRoles, type JwtUser } from "../plugins/auth";
import { approversFor, notifyTargets, powerOver } from "../utils/leave-approval";
import { parseBodyOrMultipart } from "../utils/uploads";
import { createNotification } from "../utils/notify";

async function nextClaimCode(): Promise<string> {
  const rows = await prisma.reimbursement.findMany({ select: { claimId: true } });
  let max = 0;
  for (const r of rows) {
    const m = r.claimId.match(/(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  return `CLM${String(max + 1).padStart(4, "0")}`;
}

const CLAIM_INCLUDE = {
  employee: {
    select: {
      id: true,
      employeeId: true,
      firstName: true,
      lastName: true,
      department: true,
    },
  },
  client: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  job: { select: { id: true, name: true } },
  managerApprover: { select: { firstName: true, lastName: true } },
  partnerApprover: { select: { firstName: true, lastName: true } },
  processedBy: { select: { firstName: true, lastName: true } },
  attachments: true,
  logs: {
    include: { performedBy: { select: { firstName: true, lastName: true } } },
    orderBy: { performedAt: "desc" as const },
  },
} as const;

/** Claims still waiting for a decision. */
const OPEN = ["PENDING_MANAGER", "MANAGER_APPROVED", "PENDING_PARTNER"];

/**
 * What the caller may do on a claim: "level1" (manager approval), "final" (partner/higher/Admin/Owner) or null.
 * Same reporting chain as leave. Nobody — Admin included — decides on their own claim.
 */
async function claimPower(u: JwtUser, claim: { employeeId: string; status: string }) {
  if (claim.employeeId === u.id) return null;
  const r = normRole(u.role);
  if (r === "admin" || r === "owner") return "final" as const;
  const [a, tree] = await Promise.all([approversFor([claim.employeeId]), reportingTreeIds(u.id)]);
  // HR's "final" in powerOver is for leave; claims are decided by the reporting line (or Admin/Owner).
  const asLead = { ...u, role: r === "hr" ? "employee" : u.role };
  return powerOver(asLead, claim.employeeId, 2, a.get(claim.employeeId), claim.status !== "PENDING_MANAGER", new Set(tree));
}

/** Finance: sees every claim and records payments. */
function paysClaims(u: JwtUser) {
  const r = normRole(u.role);
  return ["admin", "owner", "finance manager"].includes(r) || ACCOUNTS_ROLES.has(r) || !!u.hasAccountsAccess;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Tell the people who must act next. Falls back to Admins/Owners when the claimant has no reporting line. */
async function notifyApprovers(claim: { id: string; claimId: string; employeeId: string; amount: number; category: string }, step: "level1" | "level2", who: string) {
  const a = (await approversFor([claim.employeeId])).get(claim.employeeId);
  let targets = notifyTargets(step, a);
  if (step === "level1" && !targets.length) targets = notifyTargets("level2", a);
  if (!targets.length) {
    const admins = await prisma.employee.findMany({ where: { status: { equals: "active", mode: "insensitive" }, role: { in: ["Admin", "admin", "Owner", "owner"] } }, select: { id: true } });
    targets = admins.map((x) => x.id);
  }
  for (const userId of targets.filter((x) => x !== claim.employeeId)) {
    await createNotification({
      userId,
      title: step === "level1" ? "Expense claim to approve" : "Expense claim needs final approval",
      message: `${who} — ${claim.category} ${inr(claim.amount)} (${claim.claimId})`,
      type: "reimbursement_approval",
      module: "Finance",
      actionUrl: "/portal/reimbursements/team",
    });
  }
}

/**
 * Expense policy check for a claim (new or edited). Returns the problem in plain words, or null.
 * Policies are per category (case-insensitive); categories without an active policy are unrestricted.
 */
async function policyProblem(employeeId: string, category: string, amount: number, date: Date, hasReceipt: boolean, excludeId?: string) {
  const policy = await prisma.expensePolicy.findFirst({ where: { category: { equals: category, mode: "insensitive" }, isActive: true } });
  if (!policy) return null;
  if (policy.perClaimLimit != null && amount > policy.perClaimLimit) return `${category} claims are limited to ${inr(policy.perClaimLimit)} each.`;
  if (policy.receiptRequiredAbove != null && amount > policy.receiptRequiredAbove && !hasReceipt) return `Attach the bill — it's required for ${category} claims above ${inr(policy.receiptRequiredAbove)}.`;
  if (policy.submitWithinDays != null) {
    const ageDays = Math.floor((Date.now() - date.getTime()) / 86_400_000);
    if (ageDays > policy.submitWithinDays) return `${category} expenses must be claimed within ${policy.submitWithinDays} days.`;
  }
  if (policy.monthlyLimit != null) {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
    const used = await prisma.reimbursement.aggregate({
      where: { employeeId, category: { equals: category, mode: "insensitive" }, date: { gte: start, lt: end }, status: { notIn: ["REJECTED"] }, ...(excludeId ? { id: { not: excludeId } } : {}) },
      _sum: { amount: true },
    });
    const total = (used._sum.amount ?? 0) + amount;
    if (total > policy.monthlyLimit) return `This takes your ${category} claims for the month to ${inr(total)}; the monthly limit is ${inr(policy.monthlyLimit)}.`;
  }
  return null;
}

export async function reimbursementRoutes(app: FastifyInstance) {
  // GET /api/reimbursements/access — what the caller can see/do (drives the Team claims tab)
  app.get("/api/reimbursements/access", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const r = normRole(u.role);
    const org = paysClaims(u) || ["admin", "owner"].includes(r);
    return reply.send({ success: true, data: { team: org || (await leadsATeam(u.id)), org, pay: paysClaims(u) } });
  });

  // ── Expense policies (HR / Admin / Owner / Finance edit; everyone can read) ──
  app.get("/api/expense-policies", { preHandler: [authenticate] }, async (_req, reply) => {
    const data = await prisma.expensePolicy.findMany({ orderBy: { category: "asc" } });
    return reply.send({ success: true, data });
  });
  app.put("/api/expense-policies", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    if (!["admin", "owner", "hr"].includes(normRole(u.role)) && !paysClaims(u)) return reply.code(403).send({ success: false, message: "Only HR, Finance or an Admin can change expense policies." });
    const b = (req.body ?? {}) as Record<string, any>;
    const category = String(b.category ?? "").trim();
    if (!category) return reply.code(400).send({ success: false, message: "Choose a category." });
    const num = (v: unknown, label: string) => {
      if (v === null || v === undefined || v === "") return null;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a positive number.`);
      return n;
    };
    let data;
    try {
      data = {
        perClaimLimit: num(b.perClaimLimit, "Per-claim limit"),
        monthlyLimit: num(b.monthlyLimit, "Monthly limit"),
        receiptRequiredAbove: num(b.receiptRequiredAbove, "Bill-required amount"),
        submitWithinDays: b.submitWithinDays === null || b.submitWithinDays === undefined || b.submitWithinDays === "" ? null : Math.round(num(b.submitWithinDays, "Days")!),
        isActive: b.isActive === undefined ? true : Boolean(b.isActive),
        notes: b.notes ? String(b.notes).slice(0, 300) : null,
        updatedBy: u.id,
      };
    } catch (e) {
      return reply.code(400).send({ success: false, message: (e as Error).message });
    }
    const existing = await prisma.expensePolicy.findFirst({ where: { category: { equals: category, mode: "insensitive" } } });
    const saved = existing
      ? await prisma.expensePolicy.update({ where: { id: existing.id }, data })
      : await prisma.expensePolicy.create({ data: { category, ...data } });
    return reply.send({ success: true, data: saved });
  });
  app.delete("/api/expense-policies/:id", { preHandler: [requireRoles(["admin", "owner", "hr"])] }, async (req, reply) => {
    await prisma.expensePolicy.delete({ where: { id: (req.params as { id: string }).id } });
    return reply.send({ success: true });
  });

  // GET /api/reimbursements — current user's claims with attachments & logs (fixes U3)
  app.get("/api/reimbursements", { preHandler: [authenticate] }, async (req, reply) => {
    const claims = await prisma.reimbursement.findMany({
      where: { employeeId: req.user!.id },
      include: CLAIM_INCLUDE,
      orderBy: { submittedAt: "desc" },
    });
    return reply.send({ success: true, data: claims });
  });

  // GET /api/reimbursements/team-approvals — scoped for managers/partners/finance
  app.get("/api/reimbursements/team-approvals", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const r = normRole(u.role);
    const { status } = (req.query ?? {}) as { status?: string };

    const isOrgWide = ["admin", "owner"].includes(r) || paysClaims(u);

    const where: Record<string, any> = {};
    if (!isOrgWide) {
      // Everyone below the caller in the reporting line (direct and indirect)
      where.employeeId = { in: await reportingTreeIds(u.id) };
    }

    if (status === "pending") {
      where.status = { in: ["PENDING_MANAGER", "MANAGER_APPROVED", "PENDING_PARTNER"] };
    } else if (status === "APPROVED") {
      // "Awaiting payment" covers both approved states.
      where.status = { in: ["APPROVED", "PENDING_PAYMENT"] };
    } else if (status && status !== "all") {
      where.status = status;
    }

    const claims = await prisma.reimbursement.findMany({
      where,
      include: CLAIM_INCLUDE,
      orderBy: { submittedAt: "desc" },
    });
    // What the caller may do on each claim (same rules the approve / pay routes enforce).
    const [approvers, tree] = await Promise.all([approversFor([...new Set(claims.map((c) => c.employeeId))]), reportingTreeIds(u.id)]);
    const treeSet = new Set(tree);
    const asLead = { ...u, role: r === "hr" ? "employee" : u.role };
    const pay = paysClaims(u);
    const data = claims.map((c) => {
      const power =
        c.employeeId === u.id || !OPEN.includes(c.status)
          ? null
          : r === "admin" || r === "owner"
            ? "final"
            : powerOver(asLead, c.employeeId, 2, approvers.get(c.employeeId), c.status !== "PENDING_MANAGER", treeSet);
      return {
        ...c,
        canApprove: !!power,
        approveLevel: power,
        canPay: pay && ["APPROVED", "PENDING_PAYMENT"].includes(c.status) && (c.employeeId !== u.id || ["admin", "owner"].includes(r)),
      };
    });
    return reply.send({ success: true, data });
  });

  // POST /api/reimbursements — supports multipart receipt uploads & saves ReimbursementAttachment (fixes U3)
  app.post("/api/reimbursements", { preHandler: [authenticate] }, async (req, reply) => {
    let parsed;
    try {
      parsed = await parseBodyOrMultipart(req, "documents");
    } catch (err) {
      return reply.code(400).send({
        success: false,
        message: err instanceof Error ? err.message : "Invalid receipt upload",
      });
    }

    const { fields, files } = parsed;
    const u = req.user!;
    const amount = Number(fields.amount ?? 0);
    if (!fields.category || !Number.isFinite(amount) || amount <= 0) {
      return reply.code(400).send({
        success: false,
        message: "Category and a positive amount are required.",
      });
    }

    const claimDate = fields.date ? new Date(`${fields.date.slice(0, 10)}T00:00:00.000Z`) : new Date();
    if (claimDate.getTime() > Date.now() + 86_400_000) return reply.code(400).send({ success: false, message: "The expense date can't be in the future." });
    const problem = await policyProblem(u.id, fields.category, amount, claimDate, files.length > 0);
    if (problem) return reply.code(400).send({ success: false, message: problem });
    const claimId = await nextClaimCode();
    const emp = await prisma.employee.findUnique({
      where: { id: u.id },
      select: { managerId: true, partnerId: true },
    });

    const created = await prisma.reimbursement.create({
      data: {
        claimId,
        employeeId: u.id,
        category: fields.category,
        amount,
        netPayable: amount,
        description: fields.description || null,
        date: fields.date ? new Date(`${fields.date.slice(0, 10)}T00:00:00.000Z`) : new Date(),
        clientId: fields.clientId || null,
        projectId: fields.projectId || null,
        jobId: fields.jobId || null,
        status: "PENDING_MANAGER",
        paymentStatus: "Pending",
        managerId: emp?.managerId ?? null,
        partnerId: emp?.partnerId ?? null,
        attachments: {
          create: files.map((f) => ({
            fileName: f.fileName,
            filePath: f.filePath,
            fileSize: f.fileSize,
            mimeType: f.mimeType,
          })),
        },
        logs: {
          create: {
            action: "submitted",
            status: "PENDING_MANAGER",
            remarks: "Claim submitted",
            performedById: u.id,
          },
        },
      },
      include: CLAIM_INCLUDE,
    });
    await notifyApprovers(created, "level1", `${created.employee.firstName} ${created.employee.lastName ?? ""}`.trim());

    return reply.code(201).send({ success: true, data: created });
  });

  // PATCH & PUT /api/reimbursements/:id — edit PENDING_MANAGER or SENT_BACK claim + add attachments (fixes R4, U3)
  const handleUpdateClaim = async (req: any, reply: any) => {
    const { id } = req.params as { id: string };
    const u = req.user!;
    const existing = await prisma.reimbursement.findUnique({ where: { id } });
    if (!existing || existing.employeeId !== u.id) {
      return reply.code(404).send({ success: false, message: "Expense claim not found." });
    }
    if (!["PENDING_MANAGER", "SENT_BACK"].includes(existing.status)) {
      return reply.code(400).send({
        success: false,
        message: "Only claims awaiting manager review or returned to you can be edited.",
      });
    }

    let parsed;
    try {
      parsed = await parseBodyOrMultipart(req, "documents");
    } catch (err) {
      return reply.code(400).send({
        success: false,
        message: err instanceof Error ? err.message : "Invalid receipt upload",
      });
    }

    const { fields, files } = parsed;
    const amount = fields.amount !== undefined ? Number(fields.amount) : existing.amount;
    if (!Number.isFinite(amount) || amount <= 0) {
      return reply.code(400).send({ success: false, message: "Amount must be greater than 0." });
    }

    const wasReturned = existing.status === "SENT_BACK";
    const newDate = fields.date ? new Date(`${fields.date.slice(0, 10)}T00:00:00.000Z`) : existing.date;
    const hasReceipt = files.length > 0 || (await prisma.reimbursementAttachment.count({ where: { reimbursementId: id } })) > 0;
    const problem = await policyProblem(u.id, fields.category ?? existing.category, amount, newDate, hasReceipt, id);
    if (problem) return reply.code(400).send({ success: false, message: problem });
    const updated = await prisma.reimbursement.update({
      where: { id },
      data: {
        category: fields.category ?? existing.category,
        amount,
        netPayable: amount,
        description: fields.description !== undefined ? fields.description : existing.description,
        date: fields.date ? new Date(`${fields.date.slice(0, 10)}T00:00:00.000Z`) : existing.date,
        clientId: fields.clientId !== undefined ? fields.clientId || null : existing.clientId,
        projectId: fields.projectId !== undefined ? fields.projectId || null : existing.projectId,
        jobId: fields.jobId !== undefined ? fields.jobId || null : existing.jobId,
        status: "PENDING_MANAGER",
        rejectionReason: null,
        ...(files.length
          ? {
              attachments: {
                create: files.map((f) => ({
                  fileName: f.fileName,
                  filePath: f.filePath,
                  fileSize: f.fileSize,
                  mimeType: f.mimeType,
                })),
              },
            }
          : {}),
        logs: {
          create: {
            action: wasReturned ? "resubmitted" : "edited",
            status: "PENDING_MANAGER",
            remarks: wasReturned ? "Claim updated and resubmitted" : "Claim details updated",
            performedById: u.id,
          },
        },
      },
      include: CLAIM_INCLUDE,
    });
    if (wasReturned) await notifyApprovers(updated, "level1", `${updated.employee.firstName} ${updated.employee.lastName ?? ""}`.trim());

    return reply.send({ success: true, data: updated });
  };

  app.patch("/api/reimbursements/:id", { preHandler: [authenticate] }, handleUpdateClaim);
  app.put("/api/reimbursements/:id", { preHandler: [authenticate] }, handleUpdateClaim);

  // DELETE /api/reimbursements/:id — only PENDING_MANAGER or SENT_BACK claims owned by caller
  app.delete("/api/reimbursements/:id", { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.reimbursement.findUnique({ where: { id } });
    if (!existing || existing.employeeId !== req.user!.id) {
      return reply.code(404).send({ success: false, message: "Expense claim not found." });
    }
    if (!["PENDING_MANAGER", "SENT_BACK"].includes(existing.status)) {
      return reply.code(400).send({
        success: false,
        message: "Only claims that are still waiting for your manager, or were returned to you, can be withdrawn.",
      });
    }
    await prisma.reimbursement.delete({ where: { id } });
    return reply.send({ success: true, message: "Claim withdrawn." });
  });

  // PATCH /api/reimbursements/:id/approve — stage & self-approval guarded (fixes U2, R1)
  app.patch("/api/reimbursements/:id/approve", { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { remarks } = (req.body ?? {}) as { remarks?: string };
    const u = req.user!;

    const claim = await prisma.reimbursement.findUnique({ where: { id } });
    if (!claim) return reply.code(404).send({ success: false, message: "Claim not found" });
    if (claim.employeeId === u.id) return reply.code(403).send({ success: false, message: "You cannot approve your own expense claim." });
    if (!OPEN.includes(claim.status)) {
      return reply.code(400).send({ success: false, message: `This claim is ${claim.status.replace(/_/g, " ").toLowerCase()} — it can’t be approved now.` });
    }
    const power = await claimPower(u, claim);
    if (!power) {
      return reply.code(403).send({
        success: false,
        message: claim.status === "PENDING_MANAGER" ? "This claim isn’t yours to approve." : "Step 1 is done — this claim now waits for the reporting partner.",
      });
    }
    const nextStatus = power === "level1" ? "MANAGER_APPROVED" : "APPROVED";

    // Only moves if nobody else decided in the meantime (no double approvals).
    const moved = await prisma.reimbursement.updateMany({ where: { id, status: claim.status }, data: { status: nextStatus } });
    if (!moved.count) return reply.code(409).send({ success: false, message: "Someone else just acted on this claim. Refresh and try again." });

    const now = new Date();
    const updated = await prisma.reimbursement.update({
      where: { id },
      data: {
        status: nextStatus,
        ...(nextStatus === "MANAGER_APPROVED"
          ? { managerApprovedAt: now, managerApprovedBy: u.id }
          : { approvedAt: now, approvedBy: u.id, partnerApprovedAt: now, partnerApprovedBy: u.id }),
        logs: {
          create: {
            action: nextStatus === "MANAGER_APPROVED" ? "manager_approved" : "final_approved",
            status: nextStatus,
            remarks: remarks ?? null,
            performedById: u.id,
          },
        },
      },
      include: CLAIM_INCLUDE,
    });

    await createNotification({
      userId: claim.employeeId,
      title: nextStatus === "APPROVED" ? "Expense Claim Approved" : "Expense Claim Approved by Manager",
      message: `Claim ${claim.claimId} (₹${claim.amount}) is now ${nextStatus === "APPROVED" ? "approved for payment" : "awaiting final approval"}.`,
      type: "reimbursement_update",
      module: "Finance",
      actionUrl: "/portal/reimbursements",
    });
    if (nextStatus === "MANAGER_APPROVED") await notifyApprovers(updated, "level2", `${updated.employee.firstName} ${updated.employee.lastName ?? ""}`.trim());

    return reply.send({ success: true, data: updated });
  });

  // PATCH /api/reimbursements/:id/reject — stage & self-approval guarded
  app.patch("/api/reimbursements/:id/reject", { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { remarks } = (req.body ?? {}) as { remarks?: string };
    const u = req.user!;
    const claim = await prisma.reimbursement.findUnique({ where: { id } });
    if (!claim) return reply.code(404).send({ success: false, message: "Claim not found" });
    if (claim.employeeId === u.id) return reply.code(403).send({ success: false, message: "You cannot reject your own claim." });
    if (!OPEN.includes(claim.status)) {
      return reply.code(400).send({ success: false, message: `This claim is ${claim.status.replace(/_/g, " ").toLowerCase()} — only claims awaiting approval can be rejected.` });
    }
    if (!(await claimPower(u, claim))) return reply.code(403).send({ success: false, message: "This claim isn’t yours to decide." });
    const moved = await prisma.reimbursement.updateMany({ where: { id, status: claim.status }, data: { status: "REJECTED" } });
    if (!moved.count) return reply.code(409).send({ success: false, message: "Someone else just acted on this claim. Refresh and try again." });

    const updated = await prisma.reimbursement.update({
      where: { id },
      data: {
        status: "REJECTED",
        rejectedAt: new Date(),
        rejectionReason: remarks?.trim() || "Rejected",
        logs: {
          create: {
            action: "rejected",
            status: "REJECTED",
            remarks: remarks?.trim() || "Rejected",
            performedById: u.id,
          },
        },
      },
      include: CLAIM_INCLUDE,
    });
    await createNotification({ userId: claim.employeeId, title: "Expense claim rejected", message: `Claim ${claim.claimId} (${inr(claim.amount)}): ${remarks?.trim() || "Rejected"}`, type: "reimbursement_update", module: "Finance", actionUrl: "/portal/reimbursements" });
    return reply.send({ success: true, data: updated });
  });

  // PATCH /api/reimbursements/:id/send-back — return to employee for revision
  app.patch("/api/reimbursements/:id/send-back", { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { remarks } = (req.body ?? {}) as { remarks?: string };
    const u = req.user!;
    const claim = await prisma.reimbursement.findUnique({ where: { id } });
    if (!claim) return reply.code(404).send({ success: false, message: "Claim not found" });
    if (claim.employeeId === u.id) return reply.code(403).send({ success: false, message: "You cannot return your own claim." });
    if (!OPEN.includes(claim.status)) {
      return reply.code(400).send({ success: false, message: `This claim is ${claim.status.replace(/_/g, " ").toLowerCase()} — only claims awaiting approval can be returned.` });
    }
    if (!(await claimPower(u, claim))) return reply.code(403).send({ success: false, message: "This claim isn’t yours to decide." });
    const moved = await prisma.reimbursement.updateMany({ where: { id, status: claim.status }, data: { status: "SENT_BACK" } });
    if (!moved.count) return reply.code(409).send({ success: false, message: "Someone else just acted on this claim. Refresh and try again." });

    const updated = await prisma.reimbursement.update({
      where: { id },
      data: {
        status: "SENT_BACK",
        rejectionReason: remarks?.trim() || "Returned for additional details",
        logs: {
          create: {
            action: "sent_back",
            status: "SENT_BACK",
            remarks: remarks?.trim() || "Returned for additional details",
            performedById: u.id,
          },
        },
      },
      include: CLAIM_INCLUDE,
    });
    await createNotification({ userId: claim.employeeId, title: "Expense claim returned to you", message: `Claim ${claim.claimId}: ${remarks?.trim() || "Please add more details"}`, type: "reimbursement_update", module: "Finance", actionUrl: "/portal/reimbursements" });
    return reply.send({ success: true, data: updated });
  });

  // PATCH /api/reimbursements/:id/mark-as-paid — restricted to Finance / Accounts / Admin (fixes U2)
  app.patch("/api/reimbursements/:id/mark-as-paid", { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { paymentMode, bankReference, utrNumber, remarks } = (req.body ?? {}) as {
      paymentMode?: string;
      bankReference?: string;
      utrNumber?: string;
      remarks?: string;
    };
    const u = req.user!;
    const role = normRole(u.role);

    if (!paysClaims(u)) {
      return reply.code(403).send({ success: false, message: "Only Finance / Accounts or Admin can mark claims as paid." });
    }

    const claim = await prisma.reimbursement.findUnique({ where: { id } });
    if (!claim) return reply.code(404).send({ success: false, message: "Claim not found" });
    if (claim.status !== "APPROVED" && claim.status !== "PENDING_PAYMENT") {
      return reply.code(400).send({ success: false, message: "Only approved claims can be marked as paid." });
    }
    if (claim.employeeId === u.id && !["admin", "owner"].includes(role)) {
      return reply.code(403).send({ success: false, message: "Someone else in Finance must pay your own claim." });
    }
    // Claim the payment atomically so two clicks (or two people) can't pay it twice.
    const claimed = await prisma.reimbursement.updateMany({ where: { id, status: { in: ["APPROVED", "PENDING_PAYMENT"] } }, data: { status: "PAID" } });
    if (!claimed.count) return reply.code(409).send({ success: false, message: "This claim has just been paid by someone else." });

    const now = new Date();
    const updated = await prisma.reimbursement.update({
      where: { id },
      data: {
        status: "PAID",
        paymentStatus: "Paid",
        paymentMode: paymentMode ?? "Bank Transfer",
        bankReference: bankReference ?? null,
        utrNumber: utrNumber ?? null,
        paidAt: now,
        paymentDate: now,
        processedAt: now,
        processedById: u.id,
        logs: {
          create: {
            action: "marked_as_paid",
            status: "PAID",
            remarks: remarks ?? null,
            performedById: u.id,
          },
        },
      },
      include: CLAIM_INCLUDE,
    });

    await createNotification({
      userId: claim.employeeId,
      title: "Expense Claim Paid",
      message: `Claim ${claim.claimId} (₹${claim.amount}) has been paid via ${paymentMode ?? "Bank Transfer"}.`,
      type: "reimbursement_paid",
      module: "Finance",
      actionUrl: "/portal/reimbursements",
    });

    return reply.send({ success: true, data: updated });
  });
}
