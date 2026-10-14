import type { FastifyInstance } from "fastify";
import { prisma, SAFE_EMPLOYEE_SELECT } from "../config/db";
import { ACCOUNTS_ROLES, authenticate, normRole, reportingTreeIds, type JwtUser } from "../plugins/auth";
import { approversFor, powerOver } from "../utils/leave-approval";
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

export async function reimbursementRoutes(app: FastifyInstance) {
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

    const isOrgWide = ["admin", "owner", "finance manager"].includes(r) || ACCOUNTS_ROLES.has(r);

    const where: Record<string, any> = {};
    if (!isOrgWide) {
      // Everyone below the caller in the reporting line (direct and indirect)
      where.employeeId = { in: await reportingTreeIds(u.id) };
    }

    if (status === "pending") {
      where.status = { in: ["PENDING_MANAGER", "MANAGER_APPROVED", "PENDING_PARTNER"] };
    } else if (status && status !== "all") {
      where.status = status;
    }

    const claims = await prisma.reimbursement.findMany({
      where,
      include: CLAIM_INCLUDE,
      orderBy: { submittedAt: "desc" },
    });
    return reply.send({ success: true, data: claims });
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
        message: "Approved or paid claims cannot be deleted.",
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

    if (!["admin", "owner", "finance manager"].includes(role) && !ACCOUNTS_ROLES.has(role)) {
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
