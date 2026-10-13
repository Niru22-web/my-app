import type { FastifyInstance } from "fastify";
import { prisma } from "../config/db";
import { authenticate, isTeamMemberOrSelf, normRole, requireRoles } from "../plugins/auth";
import { createNotification } from "../utils/notify";

async function nextLeaveCode(): Promise<string> {
  const rows = await prisma.leave.findMany({ select: { leaveId: true } });
  let max = 0;
  for (const r of rows) {
    const m = r.leaveId.match(/(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  return `LV${String(max + 1).padStart(4, "0")}`;
}

export async function leaveRoutes(app: FastifyInstance) {
  // GET /api/leaves — role-scoped & strips password (fixes L5)
  app.get("/api/leaves", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const r = normRole(u.role);
    const { employeeId, status, dateFrom, dateTo } = (req.query ?? {}) as {
      employeeId?: string;
      status?: string;
      dateFrom?: string;
      dateTo?: string;
    };

    const where: Record<string, any> = {};

    if (["admin", "owner", "hr"].includes(r)) {
      if (employeeId && employeeId !== "all") where.employeeId = employeeId;
    } else if (["manager", "partner", "sub-manager", "sub manager"].includes(r)) {
      const team = await prisma.employee.findMany({
        where: {
          OR: [
            { id: u.id },
            { managerId: u.id },
            { partnerId: u.id },
            { subManagerId: u.id },
            { reportingManagerIds: { has: u.id } },
            { reportingPartnerIds: { has: u.id } },
            { subManagerIds: { has: u.id } },
            { managers: { some: { managerId: u.id } } },
            { partners: { some: { partnerId: u.id } } },
          ],
        },
        select: { id: true },
      });
      const teamIds = team.map((t) => t.id);
      where.employeeId = employeeId && teamIds.includes(employeeId) ? employeeId : { in: teamIds };
    } else {
      where.employeeId = u.id;
    }

    if (status && status !== "all") {
      where.status = { equals: status, mode: "insensitive" };
    }
    if (dateFrom || dateTo) {
      where.fromDate = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(`${dateTo.slice(0, 10)}T23:59:59.999Z`) } : {}),
      };
    }

    const leaves = await prisma.leave.findMany({
      where,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, officeEmail: true } },
        approver: { select: { firstName: true, lastName: true } },
      },
      orderBy: { appliedDate: "desc" },
    });

    return reply.send({ success: true, data: leaves });
  });

  // GET /api/leaves/balance
  app.get("/api/leaves/balance", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const { employeeId } = (req.query ?? {}) as { employeeId?: string };
    const targetId = employeeId && (await isTeamMemberOrSelf(u, employeeId)) ? employeeId : u.id;
    const year = new Date().getFullYear();

    const [bal, txns] = await Promise.all([
      prisma.leaveBalance.findUnique({
        where: { employeeId_year: { employeeId: targetId, year } },
      }),
      prisma.leaveTransaction.findMany({
        where: { employeeId: targetId, year },
      }),
    ]);

    const adjustment = txns
      .filter((t) => t.type.toLowerCase().includes("adjust"))
      .reduce((s, t) => s + Number(t.amount ?? 0), 0);

    const accrued = bal ? Number(bal.totalLeaves) : 0;
    const used = bal ? Number(bal.usedLeaves) : 0;
    const available = bal ? Number(bal.remainingLeaves) : 0;

    return reply.send({
      success: true,
      data: {
        accrued,
        used,
        adjustment,
        available,
        financialYearStart: `${year}-04-01`,
        financialYearEnd: `${year + 1}-03-31`,
      },
    });
  });

  // GET /api/leaves/negative-balances
  app.get(
    "/api/leaves/negative-balances",
    { preHandler: [requireRoles(["admin", "owner", "hr", "partner"])] },
    async (_req, reply) => {
      const year = new Date().getFullYear();
      const rows = await prisma.leaveBalance.findMany({
        where: { year, remainingLeaves: { lt: 0 } },
        include: {
          employee: {
            select: { id: true, employeeId: true, firstName: true, lastName: true, department: true },
          },
        },
      });
      return reply.send({
        success: true,
        data: rows.map((r) => ({
          id: r.employee.id,
          firstName: r.employee.firstName,
          lastName: r.employee.lastName,
          employeeId: r.employee.employeeId,
          department: r.employee.department,
          balance: r.remainingLeaves,
          used: r.usedLeaves,
          accrued: r.totalLeaves,
        })),
      });
    },
  );

  // POST /api/leaves — validates totalDays > 0 (L2) and case-insensitive Admin auto-approve (L3)
  app.post("/api/leaves", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const r = normRole(u.role);
    const body = (req.body ?? {}) as {
      type?: string;
      reason?: string;
      duration?: string;
      fromDate?: string;
      toDate?: string;
      totalDays?: number;
    };

    const totalDays = Number(body.totalDays ?? 0);
    if (!body.type || !body.reason?.trim() || !body.fromDate || !body.toDate || totalDays <= 0) {
      return reply.code(400).send({
        success: false,
        message: "Leave type, reason, valid dates, and totalDays > 0 are required.",
      });
    }

    const fromDate = new Date(`${body.fromDate.slice(0, 10)}T00:00:00.000Z`);
    const toDate = new Date(`${body.toDate.slice(0, 10)}T00:00:00.000Z`);
    if (toDate < fromDate) {
      return reply.code(400).send({ success: false, message: "End date cannot be before start date." });
    }

    const autoApprove = ["admin", "owner"].includes(r);
    const leaveId = await nextLeaveCode();

    const emp = await prisma.employee.findUnique({
      where: { id: u.id },
      select: { managerId: true, partnerId: true },
    });

    const created = await prisma.leave.create({
      data: {
        leaveId,
        employeeId: u.id,
        type: body.type,
        reason: body.reason.trim(),
        duration: body.duration || "Full Day",
        fromDate,
        toDate,
        totalDays,
        status: autoApprove ? "approved" : "pending",
        approvedBy: autoApprove ? u.id : null,
        approvedDate: autoApprove ? new Date() : null,
        approvedRole: autoApprove ? u.role : null,
        reportingManagerId: emp?.managerId ?? null,
        reportingPartnerId: emp?.partnerId ?? null,
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, officeEmail: true } },
        approver: { select: { firstName: true, lastName: true } },
      },
    });

    if (autoApprove && body.type.toLowerCase() !== "unpaid leave") {
      const year = fromDate.getUTCFullYear();
      await prisma.leaveBalance.upsert({
        where: { employeeId_year: { employeeId: u.id, year } },
        create: {
          employeeId: u.id,
          year,
          totalLeaves: 21,
          usedLeaves: totalDays,
          remainingLeaves: 21 - totalDays,
        },
        update: {
          usedLeaves: { increment: totalDays },
          remainingLeaves: { decrement: totalDays },
        },
      });
    }

    return reply.code(201).send({ success: true, data: created });
  });

  // PATCH /api/leaves/:id — edit pending leave
  app.patch("/api/leaves/:id", { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.leave.findUnique({ where: { id } });
    if (!existing || existing.employeeId !== req.user!.id) {
      return reply.code(404).send({ success: false, message: "Leave request not found." });
    }
    if (existing.status.toLowerCase() !== "pending") {
      return reply.code(400).send({ success: false, message: "Only pending leave requests can be edited." });
    }

    const body = (req.body ?? {}) as Record<string, any>;
    const totalDays = Number(body.totalDays ?? existing.totalDays);
    if (totalDays <= 0) {
      return reply.code(400).send({ success: false, message: "totalDays must be greater than 0." });
    }

    const updated = await prisma.leave.update({
      where: { id },
      data: {
        type: body.type ?? existing.type,
        reason: body.reason ? String(body.reason).trim() : existing.reason,
        duration: body.duration ?? existing.duration,
        fromDate: body.fromDate ? new Date(`${body.fromDate.slice(0, 10)}T00:00:00.000Z`) : existing.fromDate,
        toDate: body.toDate ? new Date(`${body.toDate.slice(0, 10)}T00:00:00.000Z`) : existing.toDate,
        totalDays,
      },
    });
    return reply.send({ success: true, data: updated });
  });

  // DELETE /api/leaves/:id — cancel leave
  app.delete("/api/leaves/:id", { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.leave.findUnique({ where: { id } });
    if (!existing || existing.employeeId !== req.user!.id) {
      return reply.code(404).send({ success: false, message: "Leave request not found." });
    }
    if (existing.status.toLowerCase() === "cancelled") {
      return reply.code(400).send({ success: false, message: "Leave is already cancelled." });
    }

    const wasApproved = existing.status.toLowerCase().includes("approved");
    const updated = await prisma.leave.update({
      where: { id },
      data: { status: "cancelled" },
    });

    if (wasApproved && existing.type.toLowerCase() !== "unpaid leave") {
      const year = existing.fromDate.getUTCFullYear();
      await prisma.leaveBalance.updateMany({
        where: { employeeId: existing.employeeId, year },
        data: {
          usedLeaves: { decrement: existing.totalDays },
          remainingLeaves: { increment: existing.totalDays },
        },
      });
    }

    return reply.send({ success: true, data: updated });
  });

  // PUT /api/leaves/:id — approve or reject leave (fixes L1 self-approval guard)
  app.put("/api/leaves/:id", { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { status } = (req.body ?? {}) as { status?: "approved" | "rejected" };
    const u = req.user!;
    const r = normRole(u.role);

    if (!["admin", "owner", "hr", "manager", "partner", "sub-manager", "sub manager"].includes(r)) {
      return reply.code(403).send({ success: false, message: "You are not authorized to approve leave." });
    }
    if (!status || !["approved", "rejected"].includes(status)) {
      return reply.code(400).send({ success: false, message: "Status must be 'approved' or 'rejected'." });
    }

    const existing = await prisma.leave.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ success: false, message: "Leave request not found." });

    if (existing.employeeId === u.id && !["admin", "owner"].includes(r)) {
      return reply.code(403).send({ success: false, message: "You cannot approve or reject your own leave request." });
    }
    if (!(await isTeamMemberOrSelf(u, existing.employeeId))) {
      return reply.code(403).send({ success: false, message: "This employee is not in your reporting team." });
    }

    const updated = await prisma.leave.update({
      where: { id },
      data: {
        status,
        approvedBy: u.id,
        approvedDate: new Date(),
        approvedRole: u.role,
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, officeEmail: true } },
        approver: { select: { firstName: true, lastName: true } },
      },
    });

    if (status === "approved" && existing.status.toLowerCase() !== "approved" && existing.type.toLowerCase() !== "unpaid leave") {
      const year = existing.fromDate.getUTCFullYear();
      await prisma.leaveBalance.upsert({
        where: { employeeId_year: { employeeId: existing.employeeId, year } },
        create: {
          employeeId: existing.employeeId,
          year,
          totalLeaves: 21,
          usedLeaves: existing.totalDays,
          remainingLeaves: 21 - existing.totalDays,
        },
        update: {
          usedLeaves: { increment: existing.totalDays },
          remainingLeaves: { decrement: existing.totalDays },
        },
      });
    }

    await createNotification({
      userId: existing.employeeId,
      title: `Leave Request ${status === "approved" ? "Approved" : "Declined"}`,
      message: `Your ${existing.type} request (${existing.totalDays} day(s)) was ${status}.`,
      type: `leave_${status}`,
      module: "HR",
      actionUrl: "/portal/leaves",
    });

    return reply.send({ success: true, data: updated });
  });

  // POST /api/leaves/adjust
  app.post(
    "/api/leaves/adjust",
    { preHandler: [requireRoles(["admin", "owner", "hr", "partner"])] },
    async (req, reply) => {
      const { employeeId, amount, reason } = (req.body ?? {}) as {
        employeeId?: string;
        amount?: number;
        reason?: string;
      };
      const delta = Number(amount ?? 0);
      if (!employeeId || !Number.isFinite(delta) || delta === 0 || !reason?.trim()) {
        return reply.code(400).send({
          success: false,
          message: "employeeId, non-zero amount, and reason are required.",
        });
      }

      const year = new Date().getFullYear();
      await prisma.$transaction([
        prisma.leaveTransaction.create({
          data: {
            employeeId,
            type: "Manual Adjustment",
            amount: delta,
            reason: reason.trim(),
            year,
          },
        }),
        prisma.leaveBalance.upsert({
          where: { employeeId_year: { employeeId, year } },
          create: {
            employeeId,
            year,
            totalLeaves: 21 + delta,
            remainingLeaves: 21 + delta,
            usedLeaves: 0,
          },
          update: {
            totalLeaves: { increment: delta },
            remainingLeaves: { increment: delta },
          },
        }),
      ]);

      return reply.send({ success: true, message: "Leave balance adjusted." });
    },
  );
}
