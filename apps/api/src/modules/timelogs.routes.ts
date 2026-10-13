import type { FastifyInstance } from "fastify";
import { prisma, SAFE_EMPLOYEE_SELECT } from "../config/db";
import { authenticate, isTeamMemberOrSelf, normRole, leadsATeam, reportingTreeIds } from "../plugins/auth";
import { isScope, scopeIds } from "../utils/scope";
import { parseBodyOrMultipart } from "../utils/uploads";

function computeWeekStart(d: Date): Date {
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay(); // 0=Sun, 1=Mon
  const diff = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + diff);
  return utc;
}

const TIMELOG_INCLUDE = {
  employee: {
    select: {
      id: true,
      employeeId: true,
      firstName: true,
      lastName: true,
      officeEmail: true,
    },
  },
  job: {
    select: {
      id: true,
      jobId: true,
      name: true,
      project: {
        select: {
          id: true,
          projectId: true,
          name: true,
          client: {
            select: {
              id: true,
              clientId: true,
              name: true,
              alias: true,
            },
          },
        },
      },
    },
  },
} as const;

export async function timelogRoutes(app: FastifyInstance) {
  // GET /api/timelogs/my
  app.get("/api/timelogs/my", { preHandler: [authenticate] }, async (req, reply) => {
    const { dateFrom, dateTo, projectId } = (req.query ?? {}) as {
      dateFrom?: string;
      dateTo?: string;
      projectId?: string;
    };

    const where: Record<string, any> = { employeeId: req.user!.id };
    if (projectId && projectId !== "all") where.projectId = projectId;
    if (dateFrom || dateTo) {
      where.date = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(`${dateTo.slice(0, 10)}T23:59:59.999Z`) } : {}),
      };
    }

    const logs = await prisma.timelog.findMany({
      where,
      include: TIMELOG_INCLUDE,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    return reply.send({ success: true, data: logs });
  });

  // GET /api/timelogs/team — scoped to reporting team for Managers/Partners/Sub-managers (fixes T1, T9)
  app.get("/api/timelogs/team", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const r = normRole(u.role);
    const scopeQ = (req.query as Record<string, string | undefined>)?.scope;
    let scoped: string[] | null | undefined;
    if (isScope(scopeQ)) {
      scoped = await scopeIds(u, scopeQ, reply);
      if (scoped === undefined) return;
    }
    if (scoped === undefined && !["admin", "owner", "manager", "partner", "sub-manager", "sub manager", "hr"].includes(r)) {
      return reply.code(403).send({ success: false, message: "Forbidden" });
    }

    const { dateFrom, dateTo, employeeId, projectId, status } = (req.query ?? {}) as {
      dateFrom?: string;
      dateTo?: string;
      employeeId?: string;
      projectId?: string;
      status?: string;
    };

    const where: Record<string, any> = {};

    if (scoped !== undefined) {
      const pick = employeeId && employeeId !== "all" ? employeeId : null;
      if (scoped === null) {
        if (pick) where.employeeId = pick;
      } else {
        if (pick && !scoped.includes(pick)) return reply.send({ success: true, data: [] });
        where.employeeId = pick ?? { in: scoped };
      }
    } else if (!["admin", "owner", "hr"].includes(r)) {
      const teamMembers = await prisma.employee.findMany({
        where: {
          OR: [
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
      const teamIds = teamMembers.map((m) => m.id);
      if (employeeId && employeeId !== "all") {
        if (!teamIds.includes(employeeId)) {
          return reply.send({ success: true, data: [] });
        }
        where.employeeId = employeeId;
      } else {
        where.employeeId = { in: teamIds };
      }
    } else if (employeeId && employeeId !== "all") {
      where.employeeId = employeeId;
    }

    if (projectId && projectId !== "all") where.projectId = projectId;
    if (status && status !== "all") {
      const norm = status.toLowerCase();
      where.submissionStatus = norm === "draft" ? "not_submitted" : norm;
    }
    if (dateFrom || dateTo) {
      where.date = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(`${dateTo.slice(0, 10)}T23:59:59.999Z`) } : {}),
      };
    }

    const logs = await prisma.timelog.findMany({
      where,
      include: TIMELOG_INCLUDE,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    return reply.send({ success: true, data: logs });
  });

  // GET /api/timelogs/reports — fixes RP1, RP2, RP3, RP4
  app.get("/api/timelogs/reports", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const r = normRole(u.role);
    const { dateFrom, dateTo, clientId, projectId, employeeId } = (req.query ?? {}) as {
      dateFrom?: string;
      dateTo?: string;
      clientId?: string;
      projectId?: string;
      employeeId?: string;
    };

    const where: Record<string, any> = {};
    if (["admin", "owner", "hr", "it"].includes(r)) {
      if (employeeId) where.employeeId = employeeId;
    } else if (["manager", "partner", "sub-manager", "sub manager"].includes(r)) {
      const teamMembers = await prisma.employee.findMany({
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
      const allowedIds = teamMembers.map((m) => m.id);
      where.employeeId = employeeId && allowedIds.includes(employeeId) ? employeeId : { in: allowedIds };
    } else {
      where.employeeId = u.id;
    }

    if (clientId) where.clientId = clientId;
    if (projectId) where.projectId = projectId;
    if (dateFrom || dateTo) {
      where.date = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo.includes("T") ? dateTo : `${dateTo}T23:59:59.999Z`) } : {}),
      };
    }

    const timelogs = await prisma.timelog.findMany({
      where,
      include: TIMELOG_INCLUDE,
      orderBy: { date: "desc" },
    });

    const totalHours = timelogs.reduce((s, l) => s + Number(l.hours ?? 0), 0);
    return reply.send({
      success: true,
      data: {
        totalHours: Math.round(totalHours * 100) / 100,
        totalEntries: timelogs.length,
        timelogs,
      },
    });
  });

  // POST /api/timelogs — validates hours, daily cap <= 24h, and active job (fixes T1, T2, T5)
  app.post("/api/timelogs", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const body = (req.body ?? {}) as {
      jobId?: string;
      hours?: number;
      description?: string;
      date?: string;
      workItem?: string;
      isBillable?: boolean;
      billableStatus?: string;
    };

    const hours = Number(body.hours ?? 0);
    if (!body.jobId || !body.date || !Number.isFinite(hours) || hours <= 0 || hours > 24) {
      return reply.code(400).send({
        success: false,
        message: "Job, date, and hours between 0.25 and 24 are required.",
      });
    }

    const job = await prisma.job.findUnique({
      where: { id: body.jobId },
      include: { project: { include: { client: true } } },
    });
    if (!job || !job.project) {
      return reply.code(404).send({ success: false, message: "Selected job not found." });
    }
    if (!["active", "started"].includes((job.status ?? "").toLowerCase())) {
      return reply.code(400).send({
        success: false,
        message: `Cannot log time against a job with status "${job.status}".`,
      });
    }

    const entryDate = new Date(`${body.date.slice(0, 10)}T00:00:00.000Z`);
    const existingDay = await prisma.timelog.aggregate({
      where: { employeeId: u.id, date: entryDate },
      _sum: { hours: true },
    });
    if ((existingDay._sum.hours ?? 0) + hours > 24) {
      return reply.code(400).send({
        success: false,
        message: "Total logged hours for a single day cannot exceed 24 hours.",
      });
    }

    const emp = await prisma.employee.findUnique({
      where: { id: u.id },
      select: { managerId: true, partnerId: true },
    });

    const billableStatus =
      body.billableStatus ?? (body.isBillable === false ? "non_billable" : job.billable ? "billable" : "non_billable");

    const created = await prisma.timelog.create({
      data: {
        employeeId: u.id,
        jobId: job.id,
        projectId: job.projectId,
        clientId: job.project.clientId,
        combinedJobCode: job.combinedId,
        hours,
        description: String(body.description ?? "").trim(),
        workItem: body.workItem ? String(body.workItem).trim() : null,
        date: entryDate,
        weekStart: computeWeekStart(entryDate),
        billableStatus,
        submissionStatus: "not_submitted",
        reportingManagerId: emp?.managerId ?? null,
        reportingPartnerId: emp?.partnerId ?? null,
      },
      include: TIMELOG_INCLUDE,
    });

    return reply.code(201).send({ success: true, data: created });
  });

  // PUT /api/timelogs/:id — updates job/project/client/weekStart and blocks editing approved entries (fixes T1, T2, T3)
  app.put("/api/timelogs/:id", { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = req.user!;
    const r = normRole(u.role);
    const existing = await prisma.timelog.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ success: false, message: "Timelog not found" });

    if (existing.employeeId !== u.id && !["admin", "owner"].includes(r)) {
      return reply.code(403).send({ success: false, message: "You can only edit your own time entries." });
    }
    if (existing.submissionStatus === "approved" && !["admin", "owner"].includes(r)) {
      return reply.code(400).send({ success: false, message: "Approved time entries cannot be edited." });
    }

    const body = (req.body ?? {}) as {
      jobId?: string;
      hours?: number;
      description?: string;
      date?: string;
      workItem?: string;
      isBillable?: boolean;
      billableStatus?: string;
    };

    const data: Record<string, any> = {};
    if (body.hours !== undefined) {
      const h = Number(body.hours);
      if (!Number.isFinite(h) || h <= 0 || h > 24) {
        return reply.code(400).send({ success: false, message: "Hours must be between 0.25 and 24." });
      }
      data.hours = h;
    }
    if (body.description !== undefined) data.description = String(body.description).trim();
    if (body.workItem !== undefined) data.workItem = body.workItem ? String(body.workItem).trim() : null;
    if (body.date !== undefined) {
      const d = new Date(`${body.date.slice(0, 10)}T00:00:00.000Z`);
      data.date = d;
      data.weekStart = computeWeekStart(d);
    }
    if (body.jobId && body.jobId !== existing.jobId) {
      const job = await prisma.job.findUnique({
        where: { id: body.jobId },
        include: { project: true },
      });
      if (!job || !job.project) {
        return reply.code(404).send({ success: false, message: "Selected job not found." });
      }
      data.jobId = job.id;
      data.projectId = job.projectId;
      data.clientId = job.project.clientId;
      data.combinedJobCode = job.combinedId;
    }
    if (body.billableStatus !== undefined) {
      data.billableStatus = body.billableStatus;
    } else if (body.isBillable !== undefined) {
      data.billableStatus = body.isBillable ? "billable" : "non_billable";
    }

    if (existing.submissionStatus === "rejected") {
      data.submissionStatus = "not_submitted";
      data.rejectionReason = null;
    }

    const updated = await prisma.timelog.update({
      where: { id },
      data,
      include: TIMELOG_INCLUDE,
    });
    return reply.send({ success: true, data: updated });
  });

  // DELETE /api/timelogs/:id — blocks deleting submitted/approved entries (fixes T4)
  app.delete("/api/timelogs/:id", { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = req.user!;
    const r = normRole(u.role);
    const existing = await prisma.timelog.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ success: false, message: "Timelog not found" });

    if (existing.employeeId !== u.id && !["admin", "owner"].includes(r)) {
      return reply.code(403).send({ success: false, message: "You can only delete your own time entries." });
    }
    if (["submitted", "approved"].includes(existing.submissionStatus) && !["admin", "owner"].includes(r)) {
      return reply.code(400).send({
        success: false,
        message: "Submitted or approved time entries cannot be deleted.",
      });
    }

    await prisma.timelog.delete({ where: { id } });
    return reply.send({ success: true, message: "Entry deleted." });
  });

  // PATCH /api/timelogs/:id/submit — only submits draft/rejected entries (fixes T8)
  app.patch("/api/timelogs/:id/submit", { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.timelog.findUnique({ where: { id } });
    if (!existing || existing.employeeId !== req.user!.id) {
      return reply.code(404).send({ success: false, message: "Time entry not found." });
    }
    if (!["not_submitted", "draft", "rejected"].includes(existing.submissionStatus)) {
      return reply.code(400).send({ success: false, message: "Entry is already submitted or approved." });
    }

    const updated = await prisma.timelog.update({
      where: { id },
      data: {
        submissionStatus: "submitted",
        submittedAt: new Date(),
        rejectionReason: null,
      },
      include: TIMELOG_INCLUDE,
    });
    return reply.send({ success: true, data: updated });
  });

  // POST /api/timelogs/submit-bulk — only submits draft/rejected entries owned by caller (fixes T8)
  app.post("/api/timelogs/submit-bulk", { preHandler: [authenticate] }, async (req, reply) => {
    const { ids } = (req.body ?? {}) as { ids?: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      return reply.code(400).send({ success: false, message: "No entries selected." });
    }

    const res = await prisma.timelog.updateMany({
      where: {
        id: { in: ids },
        employeeId: req.user!.id,
        submissionStatus: { in: ["not_submitted", "draft", "rejected"] },
      },
      data: {
        submissionStatus: "submitted",
        submittedAt: new Date(),
        rejectionReason: null,
      },
    });
    return reply.send({ success: true, data: { count: res.count } });
  });

  // POST /api/timelogs/:id/approve — blocks self-approval & requires submitted state (fixes T6, T7)
  app.post("/api/timelogs/:id/approve", { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = req.user!;
    const r = normRole(u.role);
    if (!["admin", "owner"].includes(r) && !(await leadsATeam(u.id))) {
      return reply.code(403).send({ success: false, message: "You are not authorized to approve time entries." });
    }

    const entry = await prisma.timelog.findUnique({ where: { id } });
    if (!entry) return reply.code(404).send({ success: false, message: "Time entry not found." });

    if (entry.employeeId === u.id && !["admin", "owner"].includes(r)) {
      return reply.code(403).send({ success: false, message: "You cannot approve your own time entry." });
    }
    if (!(await isTeamMemberOrSelf(u, entry.employeeId))) {
      return reply.code(403).send({ success: false, message: "This employee is not in your reporting team." });
    }
    if (entry.submissionStatus !== "submitted") {
      return reply.code(400).send({ success: false, message: "Only submitted time entries can be approved." });
    }

    const updated = await prisma.timelog.update({
      where: { id },
      data: {
        submissionStatus: "approved",
        approvedAt: new Date(),
        approvedBy: u.id,
        rejectedAt: null,
        rejectedBy: null,
        rejectionReason: null,
      },
      include: TIMELOG_INCLUDE,
    });
    return reply.send({ success: true, data: updated });
  });

  // POST /api/timelogs/:id/reject — blocks self-rejection (fixes T6, T7)
  app.post("/api/timelogs/:id/reject", { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { reason } = (req.body ?? {}) as { reason?: string };
    const u = req.user!;
    const r = normRole(u.role);
    if (!["admin", "owner"].includes(r) && !(await leadsATeam(u.id))) {
      return reply.code(403).send({ success: false, message: "You are not authorized to reject time entries." });
    }

    const entry = await prisma.timelog.findUnique({ where: { id } });
    if (!entry) return reply.code(404).send({ success: false, message: "Time entry not found." });
    if (entry.employeeId === u.id && !["admin", "owner"].includes(r)) {
      return reply.code(403).send({ success: false, message: "You cannot reject your own time entry." });
    }
    if (!(await isTeamMemberOrSelf(u, entry.employeeId))) {
      return reply.code(403).send({ success: false, message: "This employee is not in your reporting team." });
    }

    const updated = await prisma.timelog.update({
      where: { id },
      data: {
        submissionStatus: "rejected",
        rejectedAt: new Date(),
        rejectedBy: u.id,
        rejectionReason: reason?.trim() || "Returned for revision",
      },
      include: TIMELOG_INCLUDE,
    });
    return reply.send({ success: true, data: updated });
  });

  // POST /api/timelogs/bulk-approve — excludes caller's own entries unless Admin/Owner (fixes T6)
  app.post("/api/timelogs/bulk-approve", { preHandler: [authenticate] }, async (req, reply) => {
    const { ids } = (req.body ?? {}) as { ids?: string[] };
    const u = req.user!;
    const r = normRole(u.role);
    if (!["admin", "owner"].includes(r) && !(await leadsATeam(u.id))) {
      return reply.code(403).send({ success: false, message: "Forbidden" });
    }
    if (!Array.isArray(ids) || !ids.length) {
      return reply.code(400).send({ success: false, message: "No entries provided." });
    }

    const res = await prisma.timelog.updateMany({
      where: {
        id: { in: ids },
        submissionStatus: "submitted",
        ...(!["admin", "owner"].includes(r) ? { employeeId: { in: await reportingTreeIds(u.id) } } : {}),
      },
      data: {
        submissionStatus: "approved",
        approvedAt: new Date(),
        approvedBy: u.id,
      },
    });
    return reply.send({ success: true, data: { count: res.count } });
  });

  // POST /api/timelogs/bulk-reject — excludes caller's own entries unless Admin/Owner (fixes T6)
  app.post("/api/timelogs/bulk-reject", { preHandler: [authenticate] }, async (req, reply) => {
    const { ids, reason } = (req.body ?? {}) as { ids?: string[]; reason?: string };
    const u = req.user!;
    const r = normRole(u.role);
    if (!["admin", "owner"].includes(r) && !(await leadsATeam(u.id))) {
      return reply.code(403).send({ success: false, message: "Forbidden" });
    }
    if (!Array.isArray(ids) || !ids.length) {
      return reply.code(400).send({ success: false, message: "No entries provided." });
    }

    const res = await prisma.timelog.updateMany({
      where: {
        id: { in: ids },
        submissionStatus: "submitted",
        ...(!["admin", "owner"].includes(r) ? { employeeId: { in: await reportingTreeIds(u.id) } } : {}),
      },
      data: {
        submissionStatus: "rejected",
        rejectedAt: new Date(),
        rejectedBy: u.id,
        rejectionReason: reason?.trim() || "Returned for revision",
      },
    });
    return reply.send({ success: true, data: { count: res.count } });
  });

  // GET /api/timelogs/template — CSV template download
  app.get("/api/timelogs/template", { preHandler: [authenticate] }, async (_req, reply) => {
    const csv = "Date (YYYY-MM-DD),Job Code,Hours,Billable (Yes/No),Work Item,Description\n2026-10-12,JOB001,8,Yes,Audit,Statutory audit fieldwork\n";
    reply.header("Content-Type", "text/csv");
    reply.header("Content-Disposition", 'attachment; filename="timesheet-template.csv"');
    return reply.send(csv);
  });

  // POST /api/timelogs/import — CSV import
  app.post("/api/timelogs/import", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const parsed = await parseBodyOrMultipart(req, "temp");
    const file = parsed.files[0];
    if (!file) {
      return reply.code(400).send({ success: false, message: "Please upload a CSV file." });
    }

    const fs = await import("fs");
    const content = fs.readFileSync(file.diskPath, "utf8");
    try {
      fs.unlinkSync(file.diskPath);
    } catch {
      // ignore
    }

    const lines = content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length <= 1) {
      return reply.send({
        success: true,
        totalRows: 0,
        validRows: 0,
        successfulImports: 0,
        validationErrors: [],
      });
    }

    const jobs = await prisma.job.findMany({ include: { project: true } });
    const jobByCode = new Map(jobs.map((j) => [j.jobId.toUpperCase(), j]));

    const validationErrors: { row: number; job?: string; error: string }[] = [];
    let successfulImports = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      const [dateStr, jobCode, hoursStr, billableStr, workItem, description] = cols;
      const job = jobByCode.get((jobCode ?? "").toUpperCase());
      const hours = Number(hoursStr);

      if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        validationErrors.push({ row: i + 1, job: jobCode, error: "Invalid date (use YYYY-MM-DD)" });
        continue;
      }
      if (!job) {
        validationErrors.push({ row: i + 1, job: jobCode, error: `Unknown Job Code "${jobCode}"` });
        continue;
      }
      if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
        validationErrors.push({ row: i + 1, job: jobCode, error: "Hours must be between 0.25 and 24" });
        continue;
      }

      const d = new Date(`${dateStr}T00:00:00.000Z`);
      await prisma.timelog.create({
        data: {
          employeeId: u.id,
          jobId: job.id,
          projectId: job.projectId,
          clientId: job.project.clientId,
          combinedJobCode: job.combinedId,
          hours,
          date: d,
          weekStart: computeWeekStart(d),
          billableStatus: (billableStr ?? "yes").toLowerCase().startsWith("n") ? "non_billable" : "billable",
          workItem: workItem || null,
          description: description || "",
          submissionStatus: "not_submitted",
        },
      });
      successfulImports++;
    }

    return reply.send({
      success: true,
      totalRows: lines.length - 1,
      validRows: successfulImports,
      successfulImports,
      validationErrorsCount: validationErrors.length,
      validationErrors,
    });
  });
}
