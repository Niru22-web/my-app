import type { FastifyInstance } from "fastify";
import { prisma } from "../config/db";
import { authenticate, isTeamMemberOrSelf, normRole, requireRoles, leadsATeam } from "../plugins/auth";
import { isScope, scopeIds } from "../utils/scope";
import { checkRequest, computeBalances, leaveYearOf, yearBounds } from "../utils/leave-policy";
import { getWorkCalendar } from "../utils/work-calendar";
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
    const scopeQ = (req.query as Record<string, string | undefined>)?.scope;
    let scoped: string[] | null | undefined;
    if (isScope(scopeQ)) {
      scoped = await scopeIds(u, scopeQ, reply);
      if (scoped === undefined) return;
    }
    const { employeeId, status, dateFrom, dateTo } = (req.query ?? {}) as {
      employeeId?: string;
      status?: string;
      dateFrom?: string;
      dateTo?: string;
    };

    const where: Record<string, any> = {};

    if (scoped !== undefined) {
      const pick = employeeId && employeeId !== "all" ? employeeId : null;
      if (scoped === null) {
        if (pick) where.employeeId = pick;
      } else {
        where.employeeId = pick ? (scoped.includes(pick) ? pick : "__none__") : { in: scoped };
      }
    } else if (["admin", "owner", "hr"].includes(r)) {
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

  // GET /api/leaves/balance — totals of paid leave types from the rules engine (legacy response shape)
  app.get("/api/leaves/balance", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const { employeeId } = (req.query ?? {}) as { employeeId?: string };
    const targetId = employeeId && (await isTeamMemberOrSelf(u, employeeId)) ? employeeId : u.id;
    const cal = await getWorkCalendar();
    const year = leaveYearOf(new Date(), cal.leaveYearStartMonth);
    const { start, end } = yearBounds(year, cal.leaveYearStartMonth);
    const { balances } = await computeBalances([targetId], year);
    const paid = (balances.get(targetId) ?? []).filter((b) => b.paid);
    const sum = (k: "accrued" | "used" | "adjusted" | "available" | "opening") => Math.round(paid.reduce((a, b) => a + b[k], 0) * 100) / 100;
    return reply.send({
      success: true,
      data: {
        accrued: sum("accrued") + sum("opening"),
        used: sum("used"),
        adjustment: sum("adjusted"),
        available: sum("available"),
        financialYearStart: start.toISOString().slice(0, 10),
        financialYearEnd: end.toISOString().slice(0, 10),
      },
    });
  });

  // GET /api/leaves/negative-balances — paid types below zero this leave year
  app.get("/api/leaves/negative-balances", { preHandler: [requireRoles(["admin", "owner", "hr", "partner"])] }, async (_req, reply) => {
    const cal = await getWorkCalendar();
    const year = leaveYearOf(new Date(), cal.leaveYearStartMonth);
    const people = await prisma.employee.findMany({
      where: { status: { equals: "active", mode: "insensitive" } },
      select: { id: true, employeeId: true, firstName: true, lastName: true, department: true },
    });
    const { balances } = await computeBalances(people.map((p) => p.id), year);
    const data = people.flatMap((p) =>
      (balances.get(p.id) ?? [])
        .filter((b) => b.paid && b.available < 0)
        .map((b) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName, employeeId: p.employeeId, department: `${p.department} · ${b.name}`, balance: b.available, used: b.used, accrued: b.accrued })),
    );
    return reply.send({ success: true, data });
  });

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

    if (!body.type || !body.reason?.trim() || !body.fromDate || !body.toDate) {
      return reply.code(400).send({ success: false, message: "Leave type, reason and dates are required." });
    }

    const fromDate = new Date(`${body.fromDate.slice(0, 10)}T00:00:00.000Z`);
    const toDate = new Date(`${body.toDate.slice(0, 10)}T00:00:00.000Z`);
    // Day count comes from the rules engine (weekly offs + firm holidays), never from the browser.
    const check = await checkRequest({ employeeId: u.id, type: body.type, fromDate, toDate, duration: body.duration || "Full Day" });
    if (check.errors.length) return reply.code(400).send({ success: false, message: check.errors.join(" "), errors: check.errors });
    const totalDays = check.days;

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
        type: check.type?.name ?? body.type,
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

    // Balances are computed from approved leave, so nothing else needs updating.
    return reply.code(201).send({ success: true, data: created, warnings: check.warnings });
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
    const fromDate = body.fromDate ? new Date(`${String(body.fromDate).slice(0, 10)}T00:00:00.000Z`) : existing.fromDate;
    const toDate = body.toDate ? new Date(`${String(body.toDate).slice(0, 10)}T00:00:00.000Z`) : existing.toDate;
    const check = await checkRequest({
      employeeId: existing.employeeId, type: body.type ?? existing.type, fromDate, toDate, duration: body.duration ?? existing.duration, excludeLeaveId: id,
    });
    if (check.errors.length) return reply.code(400).send({ success: false, message: check.errors.join(" "), errors: check.errors });
    const totalDays = check.days;

    const updated = await prisma.leave.update({
      where: { id },
      data: {
        type: check.type?.name ?? body.type ?? existing.type,
        reason: body.reason ? String(body.reason).trim() : existing.reason,
        duration: body.duration ?? existing.duration,
        fromDate,
        toDate,
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

    const updated = await prisma.leave.update({
      where: { id },
      data: { status: "cancelled" },
    });

    return reply.send({ success: true, data: updated });
  });

  // PUT /api/leaves/:id — approve or reject leave (fixes L1 self-approval guard)
  app.put("/api/leaves/:id", { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { status } = (req.body ?? {}) as { status?: "approved" | "rejected" };
    const u = req.user!;
    const r = normRole(u.role);

    if (!["admin", "owner", "hr"].includes(r) && !(await leadsATeam(u.id))) {
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

    if (status === "approved" && existing.status.toLowerCase() !== "approved") {
      const check = await checkRequest({
        employeeId: existing.employeeId, type: existing.type, fromDate: existing.fromDate, toDate: existing.toDate,
        duration: existing.duration, excludeLeaveId: existing.id, forApproval: true,
      });
      if (check.errors.length) return reply.code(400).send({ success: false, message: `Can’t approve: ${check.errors.join(" ")}` });
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

    await createNotification({
      userId: existing.employeeId,
      title: `Leave Request ${status === "approved" ? "Approved" : "Declined"}`,
      message: `Your ${existing.type} request (${existing.totalDays} day(s)) was ${status}.`,
      type: `leave_${status}`,
      module: "HR",
      actionUrl: "/leave",
    });

    return reply.send({ success: true, data: updated });
  });

  // POST /api/leaves/adjust — replaced by POST /api/leave-policy/credit (balances are per leave type now)
  app.post("/api/leaves/adjust", { preHandler: [requireRoles(["admin", "owner", "hr"])] }, async (_req, reply) => {
    return reply.code(410).send({ success: false, message: "Adjust balances per leave type in Leave Tracker → Leave policy." });
  });
}
