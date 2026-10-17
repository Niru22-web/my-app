import type { FastifyInstance, FastifyReply } from "fastify";
import fs from "fs";
import ExcelJS from "exceljs";
import { prisma, SAFE_EMPLOYEE_SELECT } from "../config/db";
import { authenticate, isTeamMemberOrSelf, normRole, leadsATeam, reportingTreeIds } from "../plugins/auth";
import { isScope, scopeIds } from "../utils/scope";
import { parseBodyOrMultipart } from "../utils/uploads";
import { lockedThrough, lockProblem } from "../utils/timesheet-lock";
import { getWorkCalendar, isOffDay } from "../utils/work-calendar";

const BILLABLE = new Set(["billable", "non_billable"]);

/** Entries can be logged up to 7 days ahead (planned leave days aside) and not before 2020. */
function checkEntryDate(d: Date): string | null {
  if (Number.isNaN(d.getTime())) return "That date isn’t valid.";
  if (d.getTime() > Date.now() + 7 * 86_400_000) return "Time can be logged at most 7 days ahead.";
  if (d.getUTCFullYear() < 2020) return "That date is too far in the past.";
  return null;
}

/** Prisma filter that keeps only entries after the locked period. */
async function afterLock() {
  const locked = await lockedThrough();
  return locked ? { date: { gt: new Date(`${locked}T23:59:59.999Z`) } } : {};
}

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


const round2 = (n: number) => Math.round(n * 100) / 100;
const isOpenJob = (s: string | null | undefined) => ["active", "started"].includes((s ?? "").toLowerCase());

/** Calendar month (IST) as UTC-midnight bounds. `ym` = "YYYY-MM", default the current month in India. */
function currentMonth(ym?: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym ?? ""));
  const ist = new Date(Date.now() + 330 * 60_000);
  const y = m ? Number(m[1]) : ist.getUTCFullYear();
  const mo = m ? Number(m[2]) - 1 : ist.getUTCMonth();
  return { monthStart: new Date(Date.UTC(y, mo, 1)), monthEnd: new Date(Date.UTC(y, mo + 1, 0, 23, 59, 59, 999)) };
}

export interface GridRow {
  jobId?: string;
  billable?: boolean;
  description?: string;
  workItem?: string;
  hours?: Record<string, number | string | null>;
}

const MAX_GRID_DAYS = 31;

/**
 * Saves a job × day grid of the caller's time for [from, to] (both "YYYY-MM-DD", at most 31 days).
 * Same rules as single entries: 0.25–24 h a cell, ≤ 24 h a day (submitted/approved time included),
 * open (Active/Started) jobs only, nothing in a locked period, at most 7 days ahead.
 * Only the caller's draft/returned cells are changed; submitted and approved time is never touched.
 */
async function saveGrid(
  employeeId: string,
  from: string,
  to: string,
  rawRows: GridRow[] | undefined,
  mode: "replace" | "append",
): Promise<{ status: number; body: Record<string, unknown> }> {
  const bad = (message: string, errors?: string[]) => ({ status: 400, body: { success: false, message, ...(errors ? { errors } : {}) } });
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return bad("That period isn’t valid.");
  if (end < start) return bad("The end date must be on or after the start date.");
  const span = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (span > MAX_GRID_DAYS) return bad(`A grid can cover at most ${MAX_GRID_DAYS} days.`);
  const days = Array.from({ length: span }, (_, i) => new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10));
  const daySet = new Set(days);

  if (rawRows !== undefined && !Array.isArray(rawRows)) return bad("Rows must be a list.");
  const rows = rawRows ?? [];
  if (rows.length > 60) return bad("Too many rows for one grid (60 at most).");

  const locked = await lockedThrough();
  const jobIds = [...new Set(rows.map((r) => String(r?.jobId ?? "")).filter(Boolean))];
  const jobs = await prisma.job.findMany({ where: { id: { in: jobIds } }, include: { project: true } });
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const existing = await prisma.timelog.findMany({
    where: { employeeId, date: { gte: new Date(`${days[0]}T00:00:00.000Z`), lte: new Date(`${days[days.length - 1]}T23:59:59.999Z`) } },
  });
  const isDraft = (t: { submissionStatus: string }) => ["not_submitted", "draft", "rejected"].includes(t.submissionStatus);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);

  const errors: string[] = [];
  const gridJobs = new Set(jobIds);
  // Day totals: time the grid doesn't replace (submitted/approved, other jobs' drafts, everything in append mode) + the cells.
  const dayTotal = new Map<string, number>(days.map((d) => [d, 0]));
  for (const t of existing) {
    if (mode === "append" || !isDraft(t) || !gridJobs.has(t.jobId)) dayTotal.set(ymd(t.date), (dayTotal.get(ymd(t.date)) ?? 0) + t.hours);
  }

  type Cell = { jobId: string; day: string; hours: number; billable?: boolean; description?: string; workItem?: string };
  const cells: Cell[] = [];
  const seenJobs = new Set<string>();
  for (const r of rows) {
    const jobId = String(r?.jobId ?? "");
    const job = jobById.get(jobId);
    if (!job) {
      errors.push(jobId ? "A selected job no longer exists." : "Every row needs a job.");
      continue;
    }
    if (mode === "replace") {
      if (seenJobs.has(jobId)) errors.push(`${job.jobId} appears more than once — use one row per job.`);
      seenJobs.add(jobId);
    }
    if (r.description !== undefined && String(r.description).length > 2000) errors.push(`${job.jobId}: keep the description under 2,000 characters.`);
    const hoursMap = r.hours && typeof r.hours === "object" ? r.hours : {};
    for (const key of Object.keys(hoursMap)) {
      if (!daySet.has(key.slice(0, 10))) errors.push(`${job.jobId}: ${key} is outside ${from} – ${to}.`);
    }
    for (const day of days) {
      const raw = hoursMap[day];
      const h = raw === null || raw === undefined || raw === "" ? 0 : Number(raw);
      const current =
        mode === "append" ? 0 : existing.filter((t) => t.jobId === jobId && ymd(t.date) === day && isDraft(t)).reduce((x, t) => x + t.hours, 0);
      const changed = Math.abs(current - h) > 0.001;
      const dateProblem = checkEntryDate(new Date(`${day}T00:00:00.000Z`));
      if (!Number.isFinite(h) || h < 0 || h > 24) errors.push(`${job.jobId} on ${day}: hours must be between 0.25 and 24.`);
      else if (h > 0 && h < 0.25) errors.push(`${job.jobId} on ${day}: the minimum is 0.25 h.`);
      else if (changed && locked && day <= locked) errors.push(`${day} is in a locked period.`);
      else if (changed && h > 0 && !isOpenJob(job.status)) errors.push(`${job.jobId} is ${job.status}; time can't be added to it.`);
      else if (changed && h > 0 && dateProblem) errors.push(`${day}: ${dateProblem}`);
      dayTotal.set(day, (dayTotal.get(day) ?? 0) + (Number.isFinite(h) ? h : 0));
      if (changed) cells.push({ jobId, day, hours: h, billable: r.billable, description: r.description, workItem: r.workItem });
    }
  }
  for (const [day, total] of dayTotal) if (total > 24) errors.push(`${day} adds up to ${round2(total)} h — a day can't exceed 24 h.`);
  if (errors.length) return bad(errors[0], [...new Set(errors)]);

  const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { managerId: true, partnerId: true } });
  await prisma.$transaction(async (tx) => {
    for (const c of cells) {
      const job = jobById.get(c.jobId)!;
      const drafts = mode === "append" ? [] : existing.filter((t) => t.jobId === c.jobId && ymd(t.date) === c.day && isDraft(t));
      if (c.hours === 0) {
        if (drafts.length) await tx.timelog.deleteMany({ where: { id: { in: drafts.map((t) => t.id) } } });
        continue;
      }
      const [first, ...rest] = drafts;
      if (rest.length) await tx.timelog.deleteMany({ where: { id: { in: rest.map((t) => t.id) } } });
      const d = new Date(`${c.day}T00:00:00.000Z`);
      const billableStatus = c.billable === undefined ? (job.billable ? "billable" : "non_billable") : c.billable ? "billable" : "non_billable";
      if (first) {
        await tx.timelog.update({
          where: { id: first.id },
          data: {
            hours: c.hours,
            submissionStatus: "not_submitted",
            rejectionReason: null,
            submittedAt: null,
            ...(c.description !== undefined ? { description: String(c.description).trim().slice(0, 2000) } : {}),
            ...(c.billable !== undefined ? { billableStatus } : {}),
          },
        });
      } else {
        await tx.timelog.create({
          data: {
            employeeId,
            jobId: job.id,
            projectId: job.projectId,
            clientId: job.project.clientId,
            combinedJobCode: job.combinedId,
            hours: c.hours,
            date: d,
            weekStart: computeWeekStart(d),
            billableStatus,
            description: String(c.description ?? "").trim().slice(0, 2000),
            workItem: c.workItem ? String(c.workItem).trim().slice(0, 200) : null,
            submissionStatus: "not_submitted",
            reportingManagerId: emp?.managerId ?? null,
            reportingPartnerId: emp?.partnerId ?? null,
          },
        });
      }
    }
  });
  return { status: 200, body: { success: true, data: { changed: cells.length } } };
}

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
    if (!body.jobId || !body.date || !Number.isFinite(hours) || hours < 0.25 || hours > 24) {
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
    const dateProblem = checkEntryDate(entryDate) ?? (await lockProblem(entryDate));
    if (dateProblem) return reply.code(400).send({ success: false, message: dateProblem });
    if ((body.description ?? "").length > 2000) return reply.code(400).send({ success: false, message: "Keep the description under 2,000 characters." });
    if (body.billableStatus !== undefined && !BILLABLE.has(String(body.billableStatus))) {
      return reply.code(400).send({ success: false, message: "Billable status must be billable or non_billable." });
    }
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
    const lockedNow = await lockProblem(existing.date);
    if (lockedNow) return reply.code(400).send({ success: false, message: lockedNow });

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
      if (!Number.isFinite(h) || h < 0.25 || h > 24) {
        return reply.code(400).send({ success: false, message: "Hours must be between 0.25 and 24." });
      }
      data.hours = h;
    }
    if (body.description !== undefined) {
      if (String(body.description).length > 2000) return reply.code(400).send({ success: false, message: "Keep the description under 2,000 characters." });
      data.description = String(body.description).trim();
    }
    if (body.workItem !== undefined) data.workItem = body.workItem ? String(body.workItem).trim() : null;
    if (body.date !== undefined) {
      const d = new Date(`${body.date.slice(0, 10)}T00:00:00.000Z`);
      const dateProblem = checkEntryDate(d) ?? (await lockProblem(d));
      if (dateProblem) return reply.code(400).send({ success: false, message: dateProblem });
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
      if (!["active", "started"].includes((job.status ?? "").toLowerCase())) {
        return reply.code(400).send({ success: false, message: `Cannot log time against a job with status "${job.status}".` });
      }
      data.jobId = job.id;
      data.projectId = job.projectId;
      data.clientId = job.project.clientId;
      data.combinedJobCode = job.combinedId;
    }
    if (body.billableStatus !== undefined) {
      if (!BILLABLE.has(String(body.billableStatus))) return reply.code(400).send({ success: false, message: "Billable status must be billable or non_billable." });
      data.billableStatus = body.billableStatus;
    } else if (body.isBillable !== undefined) {
      data.billableStatus = body.isBillable ? "billable" : "non_billable";
    }

    // The day's total must stay within 24 h after the change.
    const newHours = data.hours ?? existing.hours;
    const newDate: Date = data.date ?? existing.date;
    const others = await prisma.timelog.aggregate({ where: { employeeId: existing.employeeId, date: newDate, id: { not: id } }, _sum: { hours: true } });
    if ((others._sum.hours ?? 0) + newHours > 24) {
      return reply.code(400).send({ success: false, message: "Total logged hours for a single day cannot exceed 24 hours." });
    }

    // Changing a returned or submitted entry puts it back to draft, so the approver never approves edited time unknowingly.
    if (existing.submissionStatus === "rejected" || existing.submissionStatus === "submitted") {
      data.submissionStatus = "not_submitted";
      data.rejectionReason = null;
      data.submittedAt = null;
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
    const lockedDel = await lockProblem(existing.date);
    if (lockedDel) return reply.code(400).send({ success: false, message: lockedDel });

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
    if (entry.submissionStatus !== "submitted") {
      return reply.code(400).send({ success: false, message: "Only submitted entries can be returned. Approved time is final." });
    }
    const lockedRej = await lockProblem(entry.date);
    if (lockedRej) return reply.code(400).send({ success: false, message: lockedRej });

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
        ...(await afterLock()),
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

  // GET /api/timelogs/monthly-tracker — Monthly Pivot of Timesheet Submissions & Defaulters
  app.get("/api/timelogs/monthly-tracker", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const r = normRole(u.role);
    const query = (req.query ?? {}) as {
      year?: string;
      month?: string;
      department?: string;
      scope?: string;
      defaultersOnly?: string;
    };

    const isFirm = ["admin", "owner", "hr", "it"].includes(r);
    const isTeamLead = ["manager", "partner", "sub-manager", "sub manager"].includes(r);

    const now = new Date();
    const year = Number(query.year) || now.getUTCFullYear();
    const month = Number(query.month) || (now.getUTCMonth() + 1); // 1-12

    const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const monthEnd = new Date(Date.UTC(year, month - 1, lastDay, 23, 59, 59, 999));

    interface WeekInterval {
      weekIndex: number;
      label: string;
      startDate: string;
      endDate: string;
      expectedWorkingDays: number;
      expectedHours: number;
    }

    const cal = await getWorkCalendar();
    const stdHours = cal.standardDayHours || 8;

    // Fetch calendar holidays in this month
    const holidays = await prisma.event.findMany({
      where: { type: "Holiday", date: { gte: monthStart, lte: monthEnd } },
      select: { date: true },
    });
    const holidayYmds = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));

    const weeks: WeekInterval[] = [];
    let cur = new Date(monthStart);
    let weekIdx = 1;

    while (cur <= monthEnd) {
      const wStart = new Date(cur);
      const dayOfWeek = cur.getUTCDay(); // 0=Sun, 1=Mon
      const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
      const wEnd = new Date(cur);
      wEnd.setUTCDate(cur.getUTCDate() + daysUntilSunday);
      if (wEnd > monthEnd) {
        wEnd.setTime(monthEnd.getTime());
      }

      let workingDays = 0;
      const checkDay = new Date(wStart);
      while (checkDay <= wEnd) {
        const ymd = checkDay.toISOString().slice(0, 10);
        if (!isOffDay(checkDay, cal) && !holidayYmds.has(ymd)) {
          workingDays++;
        }
        checkDay.setUTCDate(checkDay.getUTCDate() + 1);
      }

      const startDayNum = wStart.getUTCDate();
      const endDayNum = wEnd.getUTCDate();
      const monthShort = wStart.toLocaleString("en-US", { month: "short", timeZone: "UTC" });

      weeks.push({
        weekIndex: weekIdx++,
        label: `${monthShort} ${startDayNum}–${endDayNum}`,
        startDate: wStart.toISOString().slice(0, 10),
        endDate: wEnd.toISOString().slice(0, 10),
        expectedWorkingDays: workingDays,
        expectedHours: workingDays * stdHours,
      });

      cur = new Date(wEnd);
      cur.setUTCDate(cur.getUTCDate() + 1);
      cur.setUTCHours(0, 0, 0, 0);
    }

    const empWhere: Record<string, any> = {
      status: { equals: "Active", mode: "insensitive" },
    };

    if (query.department) {
      empWhere.department = query.department;
    }

    if (!isFirm) {
      if (isTeamLead) {
        empWhere.OR = [
          { id: u.id },
          { managerId: u.id },
          { partnerId: u.id },
          { subManagerId: u.id },
          { reportingManagerIds: { has: u.id } },
          { reportingPartnerIds: { has: u.id } },
          { subManagerIds: { has: u.id } },
          { managers: { some: { managerId: u.id } } },
          { partners: { some: { partnerId: u.id } } },
        ];
      } else {
        empWhere.id = u.id;
      }
    }

    const [employees, timelogs, leaves] = await Promise.all([
      prisma.employee.findMany({
        where: empWhere,
        select: {
          id: true,
          employeeId: true,
          firstName: true,
          lastName: true,
          officeEmail: true,
          department: true,
          designation: true,
          manager: { select: { firstName: true, lastName: true } },
          managers: {
            include: { manager: { select: { firstName: true, lastName: true } } },
            take: 1,
          },
        },
        orderBy: { firstName: "asc" },
      }),
      prisma.timelog.findMany({
        where: {
          date: { gte: monthStart, lte: monthEnd },
          employee: empWhere,
        },
        select: {
          employeeId: true,
          date: true,
          hours: true,
          billableStatus: true,
          submissionStatus: true,
        },
      }),
      prisma.leave.findMany({
        where: {
          status: { equals: "approved", mode: "insensitive" },
          fromDate: { lte: monthEnd },
          toDate: { gte: monthStart },
        },
        select: {
          employeeId: true,
          fromDate: true,
          toDate: true,
        },
      }),
    ]);

    const logsByEmp = new Map<string, typeof timelogs>();
    for (const log of timelogs) {
      const arr = logsByEmp.get(log.employeeId) ?? [];
      arr.push(log);
      logsByEmp.set(log.employeeId, arr);
    }

    const todayYmd = now.toISOString().slice(0, 10);

    const empRows = employees.map((emp) => {
      const empLogs = logsByEmp.get(emp.id) ?? [];
      const empLeaves = leaves.filter((lv) => lv.employeeId === emp.id);

      const weekStatuses = weeks.map((w) => {
        const wLogs = empLogs.filter((l) => {
          const ymd = l.date.toISOString().slice(0, 10);
          return ymd >= w.startDate && ymd <= w.endDate;
        });

        const loggedHours = Math.round(wLogs.reduce((acc, l) => acc + Number(l.hours || 0), 0) * 10) / 10;
        const billableHours = Math.round(
          wLogs.filter((l) => l.billableStatus === "billable").reduce((acc, l) => acc + Number(l.hours || 0), 0) * 10
        ) / 10;

        const isOnLeave = empLeaves.some((lv) => {
          const lvFrom = lv.fromDate.toISOString().slice(0, 10);
          const lvTo = lv.toDate.toISOString().slice(0, 10);
          return lvFrom <= w.endDate && lvTo >= w.startDate;
        });

        const isPastOrCurrent = w.startDate <= todayYmd;
        const target = w.expectedHours;

        let status: "not_filled" | "partial" | "compliant" | "on_leave" | "upcoming" = "upcoming";

        if (isOnLeave && loggedHours === 0) {
          status = "on_leave";
        } else if (isPastOrCurrent) {
          if (loggedHours === 0) {
            status = "not_filled";
          } else if (loggedHours < target) {
            status = "partial";
          } else {
            status = "compliant";
          }
        }

        return {
          weekIndex: w.weekIndex,
          label: w.label,
          startDate: w.startDate,
          endDate: w.endDate,
          loggedHours,
          billableHours,
          targetHours: target,
          status,
          hasSubmitted: wLogs.some((l) => l.submissionStatus === "submitted" || l.submissionStatus === "approved"),
        };
      });

      const totalLoggedHours = Math.round(weekStatuses.reduce((acc, w) => acc + w.loggedHours, 0) * 10) / 10;
      const totalBillableHours = Math.round(weekStatuses.reduce((acc, w) => acc + w.billableHours, 0) * 10) / 10;
      const totalTargetHours = Math.round(
        weekStatuses.filter((w) => w.startDate <= todayYmd).reduce((acc, w) => acc + w.targetHours, 0) * 10
      ) / 10;

      const notFilledWeeks = weekStatuses.filter((w) => w.status === "not_filled").length;
      const partialWeeks = weekStatuses.filter((w) => w.status === "partial").length;

      let monthStatus: "not_filled" | "incomplete" | "compliant" = "compliant";
      if (totalLoggedHours === 0 && totalTargetHours > 0) {
        monthStatus = "not_filled";
      } else if (notFilledWeeks > 0 || partialWeeks > 0) {
        monthStatus = "incomplete";
      }

      const mgr = emp.manager ?? emp.managers[0]?.manager ?? null;

      return {
        id: emp.id,
        employeeId: emp.employeeId,
        name: `${emp.firstName} ${emp.lastName}`.trim(),
        email: emp.officeEmail,
        department: emp.department ?? "General",
        designation: emp.designation ?? "Employee",
        managerName: mgr ? `${mgr.firstName} ${mgr.lastName}`.trim() : null,
        weeks: weekStatuses,
        totalLoggedHours,
        totalBillableHours,
        totalTargetHours,
        compliancePct: totalTargetHours > 0 ? Math.min(100, Math.round((totalLoggedHours / totalTargetHours) * 100)) : 100,
        notFilledWeeks,
        partialWeeks,
        monthStatus,
      };
    });

    const totalEmployees = empRows.length;
    const notFilledCount = empRows.filter((e) => e.monthStatus === "not_filled").length;
    const incompleteCount = empRows.filter((e) => e.monthStatus === "incomplete").length;
    const compliantCount = empRows.filter((e) => e.monthStatus === "compliant").length;

    const filteredRows = query.defaultersOnly === "true"
      ? empRows.filter((e) => e.monthStatus !== "compliant")
      : empRows;

    return reply.send({
      success: true,
      year,
      month,
      monthName: monthStart.toLocaleString("en-US", { month: "long", timeZone: "UTC" }),
      weeks: weeks.map((w) => ({
        weekIndex: w.weekIndex,
        label: w.label,
        startDate: w.startDate,
        endDate: w.endDate,
        expectedHours: w.expectedHours,
      })),
      kpis: {
        totalEmployees,
        notFilledCount,
        incompleteCount,
        compliantCount,
        defaultersCount: notFilledCount + incompleteCount,
        compliancePercentage: totalEmployees > 0 ? Math.round((compliantCount / totalEmployees) * 100) : 100,
      },
      employees: filteredRows,
    });
  });

  // Older path names for the same lock (used by the monthly tracker screen)
  app.get("/api/timelogs/lock", { preHandler: [authenticate] }, async (req, reply) => {
    const res = await app.inject({ method: "GET", url: "/api/timesheet-lock", headers: { authorization: req.headers.authorization ?? "" } });
    return reply.code(res.statusCode).header("content-type", "application/json").send(res.body);
  });
  app.post("/api/timelogs/lock", { preHandler: [authenticate] }, async (req, reply) => {
    const res = await app.inject({ method: "POST", url: "/api/timesheet-lock", headers: { authorization: req.headers.authorization ?? "", "content-type": "application/json" }, payload: JSON.stringify(req.body ?? {}) });
    return reply.code(res.statusCode).header("content-type", "application/json").send(res.body);
  });

  // ── Period lock ──────────────────────────────────────────────────────────────
  // GET /api/timesheet-lock — current lock (everyone) and history (Admin/Owner)
  app.get("/api/timesheet-lock", { preHandler: [authenticate] }, async (req, reply) => {
    const admin = ["admin", "owner"].includes(normRole(req.user!.role));
    const history = admin
      ? await prisma.timesheetLock.findMany({ orderBy: { createdAt: "desc" }, take: 50 })
      : [];
    const ids = [...new Set(history.map((h) => h.createdById))];
    const people = ids.length ? await prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }) : [];
    const name = new Map(people.map((p) => [p.id, `${p.firstName} ${p.lastName}`.trim()]));
    return reply.send({
      success: true,
      data: {
        lockedThrough: await lockedThrough(),
        history: history.map((h) => ({ id: h.id, lockedThrough: h.lockedThrough.toISOString().slice(0, 10), note: h.note, by: name.get(h.createdById) ?? "—", at: h.createdAt })),
      },
    });
  });

  // POST /api/timesheet-lock { lockedThrough: "YYYY-MM-DD" | null, note } — Admin/Owner. An earlier date (or null) reopens.
  app.post("/api/timesheet-lock", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    if (!["admin", "owner"].includes(normRole(u.role))) return reply.code(403).send({ success: false, message: "Only an Admin can lock or reopen timesheets." });
    const b = (req.body ?? {}) as { lockedThrough?: string | null; note?: string };
    const raw = b.lockedThrough ? String(b.lockedThrough).slice(0, 10) : null;
    if (raw && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return reply.code(400).send({ success: false, message: "Choose a valid date." });
    const todayIst = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
    if (raw && raw >= todayIst) return reply.code(400).send({ success: false, message: "You can only lock periods that have ended (up to yesterday)." });
    const note = String(b.note ?? "").trim().slice(0, 300);
    const previous = await lockedThrough();
    if (raw && previous && raw < previous && !note) {
      return reply.code(400).send({ success: false, message: "Say why you're reopening an already-locked period." });
    }
    await prisma.timesheetLock.create({
      // "Nothing locked" is stored as the earliest allowed date, so history stays one simple list.
      data: { lockedThrough: new Date(`${raw ?? "2019-12-31"}T00:00:00.000Z`), note: note || null, createdById: u.id },
    });
    return reply.send({ success: true, data: { lockedThrough: raw && raw > "2019-12-31" ? raw : null } });
  });

  // ── Grid entry (daily / weekly / semi-monthly / monthly logs) ─────────────────
  // PUT /api/timelogs/week — save a whole week grid for the caller (kept for existing clients).
  // Body: { weekStart: "YYYY-MM-DD" (Monday), rows: [{ jobId, billable?, description?, hours: { "YYYY-MM-DD": number } }] }
  app.put("/api/timelogs/week", { preHandler: [authenticate] }, async (req, reply) => {
    const b = (req.body ?? {}) as { weekStart?: string; rows?: GridRow[] };
    const ws = String(b.weekStart ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ws)) return reply.code(400).send({ success: false, message: "Week start is required." });
    const monday = computeWeekStart(new Date(`${ws}T00:00:00.000Z`));
    if (Number.isNaN(monday.getTime())) return reply.code(400).send({ success: false, message: "Week start is required." });
    const from = monday.toISOString().slice(0, 10);
    const to = new Date(monday.getTime() + 6 * 86_400_000).toISOString().slice(0, 10);
    const res = await saveGrid(req.user!.id, from, to, b.rows, "replace");
    return reply.code(res.status).send(res.body);
  });

  // PUT /api/timelogs/grid — save any period of up to 31 days for the caller.
  // Body: { from, to, mode?: "replace" | "append", rows: [{ jobId, billable?, description?, workItem?, hours: { "YYYY-MM-DD": n } }] }
  // replace (default): each job × day cell holds the caller's draft time for that day — a number replaces the drafts
  //   in that cell, 0 or empty removes them. Submitted and approved time is never touched.
  // append: every non-zero cell becomes a new draft entry (used by the daily log); existing entries are left alone.
  app.put("/api/timelogs/grid", { preHandler: [authenticate] }, async (req, reply) => {
    const b = (req.body ?? {}) as { from?: string; to?: string; mode?: string; rows?: GridRow[] };
    const from = String(b.from ?? "").slice(0, 10);
    const to = String(b.to ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return reply.code(400).send({ success: false, message: "Choose the start and end dates of the period." });
    }
    if (b.mode !== undefined && b.mode !== "replace" && b.mode !== "append") {
      return reply.code(400).send({ success: false, message: "Mode must be replace or append." });
    }
    const res = await saveGrid(req.user!.id, from, to, b.rows, (b.mode as "replace" | "append" | undefined) ?? "replace");
    return reply.code(res.status).send(res.body);
  });

  // ── My jobs / My projects ─────────────────────────────────────────────────────
  // Jobs and projects the caller is assigned to (job team or project team) or has logged time on.
  // Hours: the caller's own (this month, all time, billable) and the team total for those jobs/projects only.
  app.get("/api/timelogs/my-jobs", { preHandler: [authenticate] }, async (req, reply) => {
    const me = req.user!.id;
    const { monthStart, monthEnd } = currentMonth((req.query as { month?: string } | undefined)?.month);
    const [jobUsers, projectUsers, mine] = await Promise.all([
      prisma.jobUser.findMany({ where: { employeeId: me }, select: { jobId: true } }),
      prisma.projectUser.findMany({ where: { employeeId: me }, select: { projectId: true } }),
      prisma.timelog.groupBy({ by: ["jobId"], where: { employeeId: me }, _sum: { hours: true }, _max: { date: true } }),
    ]);
    const assigned = new Set(jobUsers.map((j) => j.jobId));
    const memberProjects = new Set(projectUsers.map((p) => p.projectId));
    const jobs = await prisma.job.findMany({
      where: { OR: [{ id: { in: [...assigned, ...mine.map((m) => m.jobId)] } }, { projectId: { in: [...memberProjects] } }] },
      include: {
        project: { include: { client: { select: { id: true, clientId: true, name: true, alias: true } } } },
        _count: { select: { users: true } },
      },
      orderBy: { name: "asc" },
    });
    const ids = jobs.map((j) => j.id);
    const [month, billable, team, loggers] = await Promise.all([
      prisma.timelog.groupBy({ by: ["jobId"], where: { employeeId: me, jobId: { in: ids }, date: { gte: monthStart, lte: monthEnd } }, _sum: { hours: true } }),
      prisma.timelog.groupBy({ by: ["jobId"], where: { employeeId: me, jobId: { in: ids }, billableStatus: "billable" }, _sum: { hours: true } }),
      prisma.timelog.groupBy({ by: ["jobId"], where: { jobId: { in: ids } }, _sum: { hours: true } }),
      prisma.timelog.groupBy({ by: ["jobId", "employeeId"], where: { jobId: { in: ids } } }),
    ]);
    const sum = (rows: { jobId: string; _sum: { hours: number | null } }[]) => new Map(rows.map((r) => [r.jobId, round2(r._sum.hours ?? 0)]));
    const mineMap = new Map(mine.map((m) => [m.jobId, m]));
    const monthMap = sum(month);
    const billMap = sum(billable);
    const teamMap = sum(team);
    const loggerCount = new Map<string, number>();
    for (const l of loggers) loggerCount.set(l.jobId, (loggerCount.get(l.jobId) ?? 0) + 1);
    const data = jobs.map((j) => ({
      id: j.id,
      jobId: j.jobId,
      name: j.name,
      status: j.status,
      billable: j.billable,
      startDate: j.startDate,
      endDate: j.endDate,
      canLog: isOpenJob(j.status),
      assigned: assigned.has(j.id) || memberProjects.has(j.projectId),
      project: { id: j.project.id, projectId: j.project.projectId, name: j.project.name, status: j.project.status },
      client: j.project.client,
      myHoursMonth: monthMap.get(j.id) ?? 0,
      myHoursTotal: round2(mineMap.get(j.id)?._sum.hours ?? 0),
      myBillableHours: billMap.get(j.id) ?? 0,
      lastLoggedOn: mineMap.get(j.id)?._max.date ?? null,
      teamHours: teamMap.get(j.id) ?? 0,
      usersCount: j._count.users,
      loggedByCount: loggerCount.get(j.id) ?? 0,
    }));
    return reply.send({ success: true, month: monthStart.toISOString().slice(0, 7), data });
  });

  app.get("/api/timelogs/my-projects", { preHandler: [authenticate] }, async (req, reply) => {
    const me = req.user!.id;
    const { monthStart, monthEnd } = currentMonth((req.query as { month?: string } | undefined)?.month);
    const [jobUsers, projectUsers, mine] = await Promise.all([
      prisma.jobUser.findMany({ where: { employeeId: me }, select: { job: { select: { projectId: true } } } }),
      prisma.projectUser.findMany({ where: { employeeId: me }, select: { projectId: true } }),
      prisma.timelog.groupBy({ by: ["projectId"], where: { employeeId: me }, _sum: { hours: true }, _max: { date: true } }),
    ]);
    const memberOf = new Set(projectUsers.map((p) => p.projectId));
    const ids = [...new Set([...memberOf, ...jobUsers.map((j) => j.job.projectId), ...mine.map((m) => m.projectId)])];
    const projects = await prisma.project.findMany({
      where: { id: { in: ids } },
      include: { client: { select: { id: true, clientId: true, name: true, alias: true } }, _count: { select: { jobs: true, users: true } } },
      orderBy: { name: "asc" },
    });
    const [month, billable, team, projectJobs] = await Promise.all([
      prisma.timelog.groupBy({ by: ["projectId"], where: { employeeId: me, projectId: { in: ids }, date: { gte: monthStart, lte: monthEnd } }, _sum: { hours: true } }),
      prisma.timelog.groupBy({ by: ["projectId"], where: { employeeId: me, projectId: { in: ids }, billableStatus: "billable" }, _sum: { hours: true } }),
      prisma.timelog.groupBy({ by: ["projectId"], where: { projectId: { in: ids } }, _sum: { hours: true } }),
      prisma.job.findMany({ where: { projectId: { in: ids } }, select: { projectId: true, status: true } }),
    ]);
    const sum = (rows: { projectId: string; _sum: { hours: number | null } }[]) => new Map(rows.map((r) => [r.projectId, round2(r._sum.hours ?? 0)]));
    const mineMap = new Map(mine.map((m) => [m.projectId, m]));
    const monthMap = sum(month);
    const billMap = sum(billable);
    const teamMap = sum(team);
    const openMap = new Map<string, number>();
    for (const j of projectJobs) if (isOpenJob(j.status)) openMap.set(j.projectId, (openMap.get(j.projectId) ?? 0) + 1);
    const data = projects.map((p) => ({
      id: p.id,
      projectId: p.projectId,
      name: p.name,
      status: p.status,
      billable: p.billable,
      startDate: p.startDate,
      endDate: p.endDate,
      member: memberOf.has(p.id),
      client: p.client,
      jobsCount: p._count.jobs,
      openJobsCount: openMap.get(p.id) ?? 0,
      usersCount: p._count.users,
      myHoursMonth: monthMap.get(p.id) ?? 0,
      myHoursTotal: round2(mineMap.get(p.id)?._sum.hours ?? 0),
      myBillableHours: billMap.get(p.id) ?? 0,
      lastLoggedOn: mineMap.get(p.id)?._max.date ?? null,
      teamHours: teamMap.get(p.id) ?? 0,
    }));
    return reply.send({ success: true, month: monthStart.toISOString().slice(0, 7), data });
  });

  // GET /api/timelogs/template — Excel template for bulk import
  app.get("/api/timelogs/template", { preHandler: [authenticate] }, async (_req, reply) => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Timesheet");
    ws.columns = IMPORT_COLUMNS.map((header) => ({ header, width: header === "Description" ? 50 : 20 }));
    ws.getRow(1).font = { bold: true };
    ws.addRow(["2026-10-12", "JOB001", 8, "Yes", "Audit", "Statutory audit fieldwork"]);
    ws.getColumn(1).numFmt = "@";
    const help = wb.addWorksheet("How to fill");
    help.addRows([
      ["Date", "YYYY-MM-DD. Up to 7 days ahead."],
      ["Job Code", "The job code shown on the Jobs page (e.g. JOB001). The job must be active."],
      ["Hours", "0.25 to 24. A day can't add up to more than 24 hours."],
      ["Billable", "Yes or No"],
      ["Work Item / Description", "Optional. Description up to 2,000 characters."],
    ]);
    help.getColumn(1).width = 26;
    help.getColumn(2).width = 80;
    return sendWorkbook(reply, wb, "timesheet-import-template.xlsx");
  });

  // GET /api/timelogs/export?scope=my|team|organization&dateFrom&dateTo&employeeId&status — Excel export
  app.get("/api/timelogs/export", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const q = (req.query ?? {}) as Record<string, string | undefined>;
    if (q.scope !== undefined && !isScope(q.scope)) return reply.code(400).send({ success: false, message: "Scope must be my, team or org." });
    const scope = isScope(q.scope) ? q.scope : "my";
    const ids = await scopeIds(u, scope, reply);
    if (ids === undefined) return;

    const where: Record<string, any> = {};
    const pick = q.employeeId && q.employeeId !== "all" ? q.employeeId : null;
    if (ids === null) {
      if (pick) where.employeeId = pick;
    } else {
      if (pick && !ids.includes(pick)) return reply.code(403).send({ success: false, message: "That person isn't in this view." });
      where.employeeId = pick ?? { in: ids };
    }
    if (q.status && q.status !== "all") where.submissionStatus = q.status.toLowerCase() === "draft" ? "not_submitted" : q.status.toLowerCase();
    if (q.dateFrom || q.dateTo) {
      where.date = {
        ...(q.dateFrom ? { gte: new Date(`${q.dateFrom.slice(0, 10)}T00:00:00.000Z`) } : {}),
        ...(q.dateTo ? { lte: new Date(`${q.dateTo.slice(0, 10)}T23:59:59.999Z`) } : {}),
      };
    }

    const logs = await prisma.timelog.findMany({ where, include: TIMELOG_INCLUDE, orderBy: [{ date: "asc" }, { createdAt: "asc" }], take: 50_000 });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Timesheet");
    ws.columns = [
      { header: "Date", key: "date", width: 12 },
      { header: "Employee ID", key: "code", width: 12 },
      { header: "Employee", key: "name", width: 24 },
      { header: "Client", key: "client", width: 30 },
      { header: "Project", key: "project", width: 30 },
      { header: "Job Code", key: "job", width: 12 },
      { header: "Job", key: "jobName", width: 30 },
      { header: "Hours", key: "hours", width: 8 },
      { header: "Billable", key: "billable", width: 10 },
      { header: "Work Item", key: "workItem", width: 18 },
      { header: "Description", key: "description", width: 50 },
      { header: "Status", key: "status", width: 12 },
    ];
    ws.getRow(1).font = { bold: true };
    const STATUS: Record<string, string> = { not_submitted: "Draft", submitted: "Submitted", approved: "Approved", rejected: "Returned" };
    for (const l of logs) {
      ws.addRow({
        date: l.date.toISOString().slice(0, 10),
        code: l.employee?.employeeId ?? "",
        name: l.employee ? `${l.employee.firstName} ${l.employee.lastName}`.trim() : "",
        client: l.job?.project?.client?.name ?? "",
        project: l.job?.project?.name ?? "",
        job: l.job?.jobId ?? "",
        jobName: l.job?.name ?? "",
        hours: l.hours,
        billable: l.billableStatus === "billable" ? "Yes" : "No",
        workItem: l.workItem ?? "",
        description: l.description ?? "",
        status: STATUS[l.submissionStatus] ?? l.submissionStatus,
      });
    }
    const total = logs.reduce((s, l) => s + l.hours, 0);
    const totalRow = ws.addRow({ jobName: "Total", hours: Math.round(total * 100) / 100 });
    totalRow.font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    return sendWorkbook(reply, wb, `timesheet-${scope}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  });

  // POST /api/timelogs/import — .xlsx or .csv; same rules as entering time by hand
  app.post("/api/timelogs/import", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const parsed = await parseBodyOrMultipart(req, "temp");
    const file = parsed.files[0];
    if (!file) return reply.code(400).send({ success: false, message: "Please upload the filled-in template (.xlsx or .csv)." });

    let rows: string[][];
    try {
      rows = await readSheet(file.diskPath, file.fileName);
    } catch {
      return reply.code(400).send({ success: false, message: "That file couldn't be read. Use the template (.xlsx or .csv)." });
    } finally {
      try {
        fs.unlinkSync(file.diskPath);
      } catch {
        // already gone
      }
    }
    const body = rows.slice(1).filter((r) => r.some((c) => c));
    if (body.length > 1000) return reply.code(400).send({ success: false, message: "Import up to 1,000 rows at a time." });

    const jobs = await prisma.job.findMany({ include: { project: true } });
    const jobByCode = new Map(jobs.map((j) => [j.jobId.toUpperCase(), j]));
    // Hours already logged per day, so imported rows respect the 24 h cap together with existing time.
    const dayTotals = new Map<string, number>();
    const existing = await prisma.timelog.groupBy({ by: ["date"], where: { employeeId: u.id }, _sum: { hours: true } });
    for (const e of existing) dayTotals.set(e.date.toISOString().slice(0, 10), e._sum.hours ?? 0);
    const locked = await lockedThrough();

    const validationErrors: { row: number; job?: string; error: string }[] = [];
    const toCreate: any[] = [];
    body.forEach((cols, i) => {
      const row = i + 2;
      const [dateStr, jobCode, hoursStr, billableStr, workItem, description] = cols;
      const job = jobByCode.get((jobCode ?? "").toUpperCase());
      const hours = Number(hoursStr);
      if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return validationErrors.push({ row, job: jobCode, error: "Date must be YYYY-MM-DD" });
      const d = new Date(`${dateStr}T00:00:00.000Z`);
      const dateProblem = checkEntryDate(d);
      if (dateProblem) return validationErrors.push({ row, job: jobCode, error: dateProblem });
      if (locked && dateStr <= locked) return validationErrors.push({ row, job: jobCode, error: `Timesheets up to ${locked} are locked` });
      if (!job) return validationErrors.push({ row, job: jobCode, error: `Unknown job code "${jobCode ?? ""}"` });
      if (!["active", "started"].includes((job.status ?? "").toLowerCase())) return validationErrors.push({ row, job: jobCode, error: `Job is ${job.status}` });
      if (!Number.isFinite(hours) || hours < 0.25 || hours > 24) return validationErrors.push({ row, job: jobCode, error: "Hours must be between 0.25 and 24" });
      if ((description ?? "").length > 2000) return validationErrors.push({ row, job: jobCode, error: "Description is over 2,000 characters" });
      const dayTotal = (dayTotals.get(dateStr) ?? 0) + hours;
      if (dayTotal > 24) return validationErrors.push({ row, job: jobCode, error: `${dateStr} would add up to more than 24 hours` });
      dayTotals.set(dateStr, dayTotal);
      toCreate.push({
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
      });
    });

    // All or nothing: a file with mistakes imports nothing, so it can be fixed and uploaded again without duplicates.
    if (!validationErrors.length && toCreate.length) await prisma.timelog.createMany({ data: toCreate });
    const imported = validationErrors.length ? 0 : toCreate.length;
    return reply.send({
      success: true,
      totalRows: body.length,
      validRows: toCreate.length,
      successfulImports: imported,
      validationErrorsCount: validationErrors.length,
      validationErrors,
      message: validationErrors.length ? "Nothing was imported. Fix the rows listed and upload the file again." : `${imported} entr${imported === 1 ? "y" : "ies"} imported as drafts.`,
    });
  });
}

const IMPORT_COLUMNS = ["Date (YYYY-MM-DD)", "Job Code", "Hours", "Billable (Yes/No)", "Work Item", "Description"];

async function sendWorkbook(reply: FastifyReply, wb: ExcelJS.Workbook, filename: string) {
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return reply
    .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    .header("Content-Disposition", `attachment; filename=${filename}`)
    .send(buf);
}

/** Reads the first sheet of an .xlsx, or a .csv, into rows of trimmed strings (dates as YYYY-MM-DD). */
async function readSheet(path: string, name: string): Promise<string[][]> {
  if (/\.csv$/i.test(name)) {
    return fs
      .readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => splitCsv(line));
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.worksheets[0];
  const out: string[][] = [];
  ws?.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let c = 1; c <= 6; c++) {
      const v = row.getCell(c).value as unknown;
      if (v instanceof Date) cells.push(v.toISOString().slice(0, 10));
      else if (v && typeof v === "object" && "text" in (v as object)) cells.push(String((v as { text: unknown }).text).trim());
      else if (v && typeof v === "object" && "result" in (v as object)) cells.push(String((v as { result: unknown }).result ?? "").trim());
      else cells.push(v === null || v === undefined ? "" : String(v).trim());
    }
    out.push(cells);
  });
  return out;
}

/** One CSV line, honouring quoted fields with commas and doubled quotes. */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}
