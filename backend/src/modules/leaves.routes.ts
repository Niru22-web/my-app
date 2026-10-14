import type { FastifyInstance } from "fastify";
import { prisma } from "../config/db";
import { authenticate, isTeamMemberOrSelf, normRole, requireRoles } from "../plugins/auth";
import { isScope, scopeIds } from "../utils/scope";
import { checkRequest, computeBalances, leaveYearOf, yearBounds } from "../utils/leave-policy";
import { getWorkCalendar } from "../utils/work-calendar";
import { createNotification } from "../utils/notify";
import { approvalContext, approversFor, notifyTargets, stageOf, stepOneApproved } from "../utils/leave-approval";

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
        approvals: { orderBy: { createdAt: "asc" }, include: { approver: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { appliedDate: "desc" },
    });

    // Two-step approval: which step each pending request is at, and whether the caller can act on it.
    const pending = leaves.filter((l) => l.status.toLowerCase() === "pending");
    const ctx = await approvalContext(u, pending);
    const data = leaves.map((l) =>
      l.status.toLowerCase() === "pending" ? { ...l, stage: ctx.stage(l), canAct: ctx.power(l) } : { ...l, stage: null, canAct: null },
    );
    return reply.send({ success: true, data, approvalLevels: ctx.levels });
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

    if (!autoApprove) {
      const cal = await getWorkCalendar();
      const a = (await approversFor([u.id])).get(u.id);
      const stage = stageOf(cal.leaveApprovalLevels, a, false);
      for (const to of notifyTargets(stage, a)) {
        await createNotification({
          userId: to,
          title: "Leave request to review",
          message: `${created.employee.firstName} ${created.employee.lastName} applied for ${created.totalDays} day(s) of ${created.type}${stage === "level1" && cal.leaveApprovalLevels === 2 && a?.level2.size ? " — your approval is step 1 of 2" : ""}.`,
          type: "leave_request",
          module: "HR",
          actionUrl: "/leave/team",
        });
      }
    } else {
      await prisma.leaveApproval.create({ data: { leaveId: created.id, level: 2, approverId: u.id, decision: "approved", comment: "Auto-approved (Admin/Owner)" } });
    }
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
    if ((await stepOneApproved([id])).size) {
      return reply.code(400).send({ success: false, message: "Your manager has already approved this request. Cancel it and apply again to change it." });
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
    const wasApproved = existing.status.toLowerCase() === "approved";
    if (existing.status.toLowerCase() === "rejected") {
      return reply.code(400).send({ success: false, message: "A rejected request can’t be cancelled." });
    }
    // Approved leave can be cancelled only before it starts (the days return to the balance).
    const todayIst = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
    if (wasApproved && existing.fromDate.toISOString().slice(0, 10) <= todayIst) {
      return reply.code(400).send({ success: false, message: "This leave has already started. Ask HR to adjust it." });
    }

    const updated = await prisma.leave.update({
      where: { id },
      data: { status: "cancelled" },
    });

    if (wasApproved) {
      const a = (await approversFor([existing.employeeId])).get(existing.employeeId);
      for (const to of notifyTargets("final", a)) {
        await createNotification({
          userId: to,
          title: "Approved leave cancelled",
          message: `${existing.type} (${existing.totalDays} day(s)) from ${existing.fromDate.toISOString().slice(0, 10)} was cancelled by the employee.`,
          type: "leave_cancelled",
          module: "HR",
          actionUrl: "/leave/team",
        });
      }
    }
    return reply.send({ success: true, data: updated });
  });

  // PUT /api/leaves/:id — approve or reject leave (fixes L1 self-approval guard)
  app.put("/api/leaves/:id", { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { status } = (req.body ?? {}) as { status?: "approved" | "rejected" };
    const u = req.user!;
    const r = normRole(u.role);

    const { comment } = (req.body ?? {}) as { comment?: string };
    if (!status || !["approved", "rejected"].includes(status)) {
      return reply.code(400).send({ success: false, message: "Status must be 'approved' or 'rejected'." });
    }

    const existing = await prisma.leave.findUnique({ where: { id }, include: { employee: { select: { firstName: true, lastName: true } } } });
    if (!existing) return reply.code(404).send({ success: false, message: "Leave request not found." });
    if (existing.status.toLowerCase() !== "pending") {
      return reply.code(400).send({ success: false, message: `This request is already ${existing.status.toLowerCase()}.` });
    }
    if (existing.employeeId === u.id && !["admin", "owner"].includes(r)) {
      return reply.code(403).send({ success: false, message: "You cannot approve or reject your own leave request." });
    }

    const ctx = await approvalContext(u, [existing]);
    const power = ctx.power(existing);
    if (!power) {
      const stage = ctx.stage(existing);
      return reply.code(403).send({
        success: false,
        message: stage === "level2" && ctx.stepOne.has(existing.id) ? "Step 1 is done — this now waits for the reporting partner." : "This request isn’t yours to decide.",
      });
    }

    // Step 1 approval: record it and pass the request on to the partner
    if (status === "approved" && power === "level1") {
      await prisma.leaveApproval.create({ data: { leaveId: id, level: 1, approverId: u.id, decision: "approved", comment: comment?.trim() || null } });
      const a = ctx.approvers.get(existing.employeeId);
      for (const to of notifyTargets("level2", a)) {
        await createNotification({
          userId: to,
          title: "Leave request to approve",
          message: `${existing.employee.firstName} ${existing.employee.lastName}’s ${existing.type} request (${existing.totalDays} day(s)) was approved by their manager and needs your final approval.`,
          type: "leave_request",
          module: "HR",
          actionUrl: "/leave/team",
        });
      }
      await createNotification({
        userId: existing.employeeId,
        title: "Leave approved by your manager",
        message: `Your ${existing.type} request (${existing.totalDays} day(s)) passed step 1 and is now with your reporting partner.`,
        type: "leave_step",
        module: "HR",
        actionUrl: "/leave",
      });
      return reply.send({ success: true, data: { ...existing, stage: "level2" }, message: "Approved at step 1 — sent to the reporting partner." });
    }

    if (status === "approved") {
      const check = await checkRequest({
        employeeId: existing.employeeId, type: existing.type, fromDate: existing.fromDate, toDate: existing.toDate,
        duration: existing.duration, excludeLeaveId: existing.id, forApproval: true,
      });
      if (check.errors.length) return reply.code(400).send({ success: false, message: `Can’t approve: ${check.errors.join(" ")}` });
    }

    const level = ctx.levels === 2 ? 2 : 1;
    const [updated] = await prisma.$transaction([
      prisma.leave.update({
        where: { id },
        data: { status, approvedBy: u.id, approvedDate: new Date(), approvedRole: u.role },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, officeEmail: true } },
          approver: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.leaveApproval.create({ data: { leaveId: id, level: power === "level1" ? 1 : level, approverId: u.id, decision: status, comment: comment?.trim() || null } }),
    ]);

    await createNotification({
      userId: existing.employeeId,
      title: `Leave Request ${status === "approved" ? "Approved" : "Declined"}`,
      message: `Your ${existing.type} request (${existing.totalDays} day(s)) was ${status}.${comment?.trim() ? ` Note: ${comment.trim()}` : ""}`,
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
