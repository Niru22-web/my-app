import crypto from "crypto";
import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { prisma } from "../config/db";
import { authenticate, normRole, reportingTreeIds, requireRoles, type JwtUser } from "../plugins/auth";
import { createNotification } from "../utils/notify";
import { approversFor } from "../utils/leave-approval";
import { getWorkCalendar, isOffDay } from "../utils/work-calendar";
import {
  fmtHHMM, getAttendancePolicy, holidayMap, invalidateAttendancePolicy, istMinutes, istToUtc, istToday, parseHHMM, statusContext, ymdOf,
} from "../utils/attendance-policy";

// ── Missed-punch requests (attendance regularisation) ────────────────────────
// An employee asks to correct a day's check-in and/or check-out. Anyone above them in the
// reporting tree, or HR/Admin/Owner, approves; approval writes the attendance row for that day.

const FIRM_ROLES = ["admin", "owner", "hr"];
const POLICY_ROLES = ["admin", "owner", "hr"];
const STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
const DAY = 86_400_000;
const isFirm = (u: JwtUser) => FIRM_ROLES.includes(normRole(u.role));
const fmtDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const istTime = (d: Date | null) => (d ? fmtHHMM(istMinutes(d)) : null);
const nameOf = (e: { firstName: string; lastName: string } | null | undefined) => (e ? `${e.firstName} ${e.lastName}`.trim() : "");

/** Thrown inside the decision transaction to roll it back with a message for the user. */
class DecideError extends Error {
  constructor(public code: number, message: string) {
    super(message);
  }
}

/** Whether `u` may approve/reject a request raised by `employeeId` (never their own). */
function canDecide(u: JwtUser, employeeId: string, tree: Set<string>) {
  if (employeeId === u.id) return false;
  return isFirm(u) || tree.has(employeeId);
}

/** People to tell about a new request: managers, else partners, else HR/Admin. */
async function approverIds(employeeId: string): Promise<string[]> {
  const a = (await approversFor([employeeId])).get(employeeId);
  if (a?.level1.size) return [...a.level1];
  if (a?.level2.size) return [...a.level2];
  const firm = await prisma.employee.findMany({
    where: { id: { not: employeeId }, status: { equals: "active", mode: "insensitive" }, role: { in: ["HR", "hr", "Admin", "admin"] } },
    select: { id: true },
  });
  return firm.map((e) => e.id);
}

export async function attendanceRequestRoutes(app: FastifyInstance) {
  // ── Policy ────────────────────────────────────────────────────────────────
  app.get("/api/attendance/policy", { preHandler: [authenticate] }, async (_req, reply) => {
    const p = await getAttendancePolicy();
    const cal = await getWorkCalendar();
    return reply.send({ success: true, data: { ...p, standardDayHours: cal.standardDayHours } });
  });

  app.put("/api/attendance/policy", { preHandler: [requireRoles(POLICY_ROLES)] }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const cur = await getAttendancePolicy();
    const num = (k: string, fallback: number) => (b[k] === undefined || b[k] === null || b[k] === "" ? fallback : Number(b[k]));
    const v = {
      graceMinutes: num("graceMinutes", cur.graceMinutes),
      fullDayMinHours: num("fullDayMinHours", cur.fullDayMinHours),
      halfDayMinHours: num("halfDayMinHours", cur.halfDayMinHours),
      regularizeWithinDays: num("regularizeWithinDays", cur.regularizeWithinDays),
      regularizeMonthlyLimit: num("regularizeMonthlyLimit", cur.regularizeMonthlyLimit),
    };
    const bad = (m: string) => reply.code(400).send({ success: false, message: m });
    if (!Number.isInteger(v.graceMinutes) || v.graceMinutes < 0 || v.graceMinutes > 240) return bad("Grace time must be a whole number of minutes between 0 and 240.");
    if (!Number.isFinite(v.fullDayMinHours) || v.fullDayMinHours <= 0 || v.fullDayMinHours > 24) return bad("Full-day hours must be between 0 and 24.");
    if (!Number.isFinite(v.halfDayMinHours) || v.halfDayMinHours <= 0 || v.halfDayMinHours > 24) return bad("Half-day hours must be between 0 and 24.");
    if (v.halfDayMinHours >= v.fullDayMinHours) return bad("Half-day hours must be less than full-day hours.");
    if (!Number.isInteger(v.regularizeWithinDays) || v.regularizeWithinDays < 0 || v.regularizeWithinDays > 90) return bad("The request window must be a whole number of days between 0 and 90.");
    if (!Number.isInteger(v.regularizeMonthlyLimit) || v.regularizeMonthlyLimit < 0 || v.regularizeMonthlyLimit > 31) return bad("The monthly limit must be a whole number between 0 (no limit) and 31.");
    const saved = await prisma.attendancePolicy.upsert({
      where: { id: "default" },
      update: { ...v, updatedBy: req.user!.id },
      create: { id: "default", ...v, updatedBy: req.user!.id },
    });
    invalidateAttendancePolicy();
    return reply.send({ success: true, data: saved, message: "Attendance rules saved." });
  });

  // ── Raise a request (own only) ────────────────────────────────────────────
  app.post("/api/attendance/requests", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const b = (req.body ?? {}) as { date?: string; checkIn?: string; checkOut?: string; reason?: string };
    const bad = (m: string, code = 400) => reply.code(code).send({ success: false, message: m });

    const ymd = (b.date ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || Number.isNaN(Date.parse(`${ymd}T00:00:00Z`))) return bad("Choose the date to correct.");
    const day = new Date(`${ymd}T00:00:00.000Z`);
    const reason = (b.reason ?? "").trim();
    if (reason.length < 3) return bad("Please give a reason for the correction.");
    if (reason.length > 500) return bad("Keep the reason under 500 characters.");
    const inStr = (b.checkIn ?? "").trim();
    const outStr = (b.checkOut ?? "").trim();
    if (!inStr && !outStr) return bad("Enter the check-in time, the check-out time, or both.");
    if (inStr && parseHHMM(inStr) == null) return bad("Enter the check-in time as HH:MM (24-hour), e.g. 11:05.");
    if (outStr && parseHHMM(outStr) == null) return bad("Enter the check-out time as HH:MM (24-hour), e.g. 20:10.");
    if (inStr && outStr && parseHHMM(outStr)! <= parseHHMM(inStr)!) return bad("Check-out must be later than check-in.");

    const [policy, cal, holidays] = await Promise.all([getAttendancePolicy(), getWorkCalendar(), holidayMap(day, day)]);
    const today = istToday();
    if (day > today) return bad("You can’t request a correction for a future date.");
    const ageDays = Math.round((today.getTime() - day.getTime()) / DAY);
    if (ageDays > policy.regularizeWithinDays)
      return bad(`Corrections can be requested only for the last ${policy.regularizeWithinDays} day${policy.regularizeWithinDays === 1 ? "" : "s"}. Please contact HR for older dates.`);
    if (holidays.has(ymd)) return bad(`${fmtDate(day)} is a firm holiday (${holidays.get(ymd)}) — no correction is needed.`);
    if (isOffDay(day, cal)) return bad(`${fmtDate(day)} is a weekly off — no correction is needed.`);

    const checkIn = inStr ? istToUtc(ymd, fmtHHMM(parseHHMM(inStr)!)) : null;
    const checkOut = outStr ? istToUtc(ymd, fmtHHMM(parseHHMM(outStr)!)) : null;
    const now = new Date();
    if ((checkIn && checkIn > now) || (checkOut && checkOut > now)) return bad("The times you enter can’t be later than now.");

    const existing = await prisma.attendance.findUnique({ where: { employee_id_date: { employee_id: u.employeeId, date: day } } });
    if (!checkIn && !existing?.check_in_time) return bad("No check-in is recorded for that day, so please enter your check-in time as well.");
    const effIn = checkIn ?? existing?.check_in_time ?? null;
    if (checkOut && effIn && checkOut <= effIn) return bad(`Check-out must be later than your recorded check-in (${istTime(effIn)}).`);

    const pending = await prisma.attendanceRegularization.findFirst({ where: { employeeId: u.id, date: day, status: "PENDING" }, select: { id: true } });
    if (pending) return bad("You already have a pending request for this date. Cancel it first if you need to change it.", 409);

    if (policy.regularizeMonthlyLimit > 0) {
      const mStart = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
      const mEnd = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0));
      const used = await prisma.attendanceRegularization.count({ where: { employeeId: u.id, date: { gte: mStart, lte: mEnd }, status: { in: ["PENDING", "APPROVED"] } } });
      if (used >= policy.regularizeMonthlyLimit)
        return bad(`You’ve reached the limit of ${policy.regularizeMonthlyLimit} correction request${policy.regularizeMonthlyLimit === 1 ? "" : "s"} for this month.`);
    }

    const created = await prisma.attendanceRegularization.create({
      data: { employeeId: u.id, date: day, checkIn, checkOut, reason, status: "PENDING" },
    });

    const me = await prisma.employee.findUnique({ where: { id: u.id }, select: { firstName: true, lastName: true } });
    const targets = await approverIds(u.id);
    const firmTargets = new Set(
      (await prisma.employee.findMany({ where: { id: { in: targets } }, select: { id: true, role: true } })).filter((e) => FIRM_ROLES.includes(normRole(e.role))).map((e) => e.id),
    );
    const tree = await Promise.all(targets.map(async (t) => [t, firmTargets.has(t) && !(await reportingTreeIds(t)).includes(u.id)] as const));
    const times = [checkIn ? `in ${istTime(checkIn)}` : "", checkOut ? `out ${istTime(checkOut)}` : ""].filter(Boolean).join(", ");
    for (const [to, orgView] of tree) {
      await createNotification({
        userId: to,
        title: "Attendance correction to review",
        message: `${nameOf(me)} asked to correct ${fmtDate(day)} (${times}).`,
        type: "attendance_regularization",
        module: "Attendance",
        relatedId: created.id,
        actionUrl: orgView ? "/attendance/org#requests" : "/attendance/team#requests",
      });
    }

    return reply.code(201).send({ success: true, data: created, message: "Request sent for approval." });
  });

  // ── List ──────────────────────────────────────────────────────────────────
  app.get("/api/attendance/requests", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const q = (req.query ?? {}) as { scope?: string; status?: string; employeeId?: string; from?: string; to?: string };
    const scope = q.scope === "team" || q.scope === "org" ? q.scope : "my";
    const tree = new Set(await reportingTreeIds(u.id));

    const where: Prisma.AttendanceRegularizationWhereInput = {};
    if (scope === "my") where.employeeId = u.id;
    else if (scope === "team") {
      if (!tree.size) return reply.code(403).send({ success: false, message: "Nobody reports to you." });
      where.employeeId = q.employeeId ? (tree.has(q.employeeId) ? q.employeeId : "__none__") : { in: [...tree] };
    } else {
      if (!isFirm(u)) return reply.code(403).send({ success: false, message: "Only HR, Admin and Owner can see everyone’s correction requests." });
      if (q.employeeId) where.employeeId = q.employeeId;
    }
    const st = (q.status ?? "").toUpperCase();
    if ((STATUSES as readonly string[]).includes(st)) where.status = st;
    if (q.from || q.to) {
      where.date = {
        ...(q.from && /^\d{4}-\d{2}-\d{2}/.test(q.from) ? { gte: new Date(`${q.from.slice(0, 10)}T00:00:00.000Z`) } : {}),
        ...(q.to && /^\d{4}-\d{2}-\d{2}/.test(q.to) ? { lte: new Date(`${q.to.slice(0, 10)}T00:00:00.000Z`) } : {}),
      };
    }

    const rows = await prisma.attendanceRegularization.findMany({ where, orderBy: [{ createdAt: "desc" }], take: 500 });
    if (!rows.length) return reply.send({ success: true, data: [] });

    const people = await prisma.employee.findMany({
      where: { id: { in: [...new Set([...rows.map((r) => r.employeeId), ...rows.map((r) => r.decidedById).filter((x): x is string => !!x)])] } },
      select: { id: true, employeeId: true, firstName: true, lastName: true, designation: true, profileImage: true, shiftId: true },
    });
    const byId = new Map(people.map((p) => [p.id, p]));
    const codes = [...new Set(rows.map((r) => byId.get(r.employeeId)?.employeeId).filter((x): x is string => !!x))];
    const dates = rows.map((r) => r.date.getTime());
    const from = new Date(Math.min(...dates)), to = new Date(Math.max(...dates));
    const [att, ctx] = await Promise.all([
      prisma.attendance.findMany({ where: { employee_id: { in: codes }, date: { gte: from, lte: to } } }),
      statusContext(from, to, [...new Set(rows.map((r) => r.employeeId))]),
    ]);
    const attKey = new Map(att.map((a) => [`${a.employee_id}|${ymdOf(a.date)}`, a]));

    return reply.send({
      success: true,
      data: rows.map((r) => {
        const e = byId.get(r.employeeId);
        const a = e ? attKey.get(`${e.employeeId}|${ymdOf(r.date)}`) : undefined;
        const c = ctx.classify(e, r.date, a ?? null);
        const d = r.decidedById ? byId.get(r.decidedById) : undefined;
        return {
          id: r.id,
          date: ymdOf(r.date),
          checkIn: r.checkIn?.toISOString() ?? null,
          checkOut: r.checkOut?.toISOString() ?? null,
          checkInTime: istTime(r.checkIn),
          checkOutTime: istTime(r.checkOut),
          reason: r.reason,
          status: r.status,
          remarks: r.remarks,
          createdAt: r.createdAt.toISOString(),
          decidedAt: r.decidedAt?.toISOString() ?? null,
          decidedBy: d ? nameOf(d) : null,
          employee: e ? { id: e.id, code: e.employeeId, name: nameOf(e), designation: e.designation, photo: e.profileImage } : null,
          current: {
            checkIn: a?.check_in_time?.toISOString() ?? null,
            checkOut: a?.check_out_time?.toISOString() ?? null,
            checkInTime: istTime(a?.check_in_time ?? null),
            checkOutTime: istTime(a?.check_out_time ?? null),
            totalHours: a ? Number(a.total_hours ?? 0) : 0,
            status: a?.status ?? null,
            computedStatus: c.computedStatus,
            lateMinutes: c.lateMinutes,
          },
          canDecide: r.status === "PENDING" && canDecide(u, r.employeeId, tree),
          canCancel: r.status === "PENDING" && r.employeeId === u.id,
        };
      }),
    });
  });

  // ── Decide ────────────────────────────────────────────────────────────────
  const decide = (action: "approve" | "reject") => async (req: any, reply: any) => {
    const u = req.user! as JwtUser;
    const { id } = req.params as { id: string };
    const remarks = (((req.body ?? {}) as { remarks?: string }).remarks ?? "").trim();
    if (action === "reject" && remarks.length < 2) return reply.code(400).send({ success: false, message: "Please give a reason for rejecting the request." });
    if (remarks.length > 500) return reply.code(400).send({ success: false, message: "Keep the remarks under 500 characters." });

    const r = await prisma.attendanceRegularization.findUnique({ where: { id } });
    if (!r) return reply.code(404).send({ success: false, message: "This request no longer exists." });
    const tree = new Set(await reportingTreeIds(u.id));
    if (!canDecide(u, r.employeeId, tree))
      return reply.code(403).send({ success: false, message: r.employeeId === u.id ? "You can’t approve your own request." : "Only the employee’s managers, partners, HR or Admin can decide this request." });
    if (r.status !== "PENDING") return reply.code(409).send({ success: false, message: `This request has already been ${r.status.toLowerCase()}.` });

    const emp = await prisma.employee.findUnique({ where: { id: r.employeeId }, select: { id: true, employeeId: true, shiftId: true, firstName: true, lastName: true } });
    if (!emp) return reply.code(404).send({ success: false, message: "The employee for this request no longer exists." });

    let failure: { code: number; message: string } | null = null;
    try {
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.attendanceRegularization.updateMany({
          where: { id, status: "PENDING" },
          data: { status: action === "approve" ? "APPROVED" : "REJECTED", decidedById: u.id, decidedAt: new Date(), remarks: remarks || null },
        });
        if (!claimed.count) throw new DecideError(409, "This request was decided by someone else a moment ago.");
        if (action === "reject") return;

        // Write the corrected day (rows are keyed by employee code + date).
        const key = { employee_id_date: { employee_id: emp.employeeId, date: r.date } };
        const existing = await tx.attendance.findUnique({ where: key });
        const inT = r.checkIn ?? existing?.check_in_time ?? null;
        const outT = r.checkOut ?? existing?.check_out_time ?? null;
        if (!inT) throw new DecideError(400, "No check-in time is recorded for that day, so this request can’t be applied. Reject it and ask for a new one that includes the check-in time.");
        if (outT && outT <= inT) throw new DecideError(400, "The corrected check-out would be before the check-in. Reject the request and ask for new times.");

        await tx.attendance.upsert({
          where: key,
          update: { check_in_time: inT, check_out_time: outT, attendance_source: "REGULARIZED", is_auto_checkout: false },
          create: { id: crypto.randomUUID(), employee_id: emp.employeeId, date: r.date, check_in_time: inT, check_out_time: outT, status: "Present", attendance_source: "REGULARIZED", location_name: "Regularised" },
        });

        // Keep the day's sessions consistent with the corrected times.
        const mins = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60_000));
        const sessions = await tx.attendance_sessions.findMany({ where: { employee_id: emp.employeeId, date: r.date }, orderBy: { check_in_time: "asc" } });
        if (!sessions.length) {
          await tx.attendance_sessions.create({
            data: { id: crypto.randomUUID(), employee_id: emp.employeeId, date: r.date, check_in_time: inT, check_out_time: outT, duration: outT ? mins(inT, outT) : null, location_name: "Regularised" },
          });
        } else {
          const firstId = sessions[0].id;
          const lastId = sessions[sessions.length - 1].id;
          for (const s of sessions) {
            const sIn = r.checkIn && s.id === firstId ? r.checkIn : s.check_in_time;
            let sOut = s.check_out_time;
            if (r.checkOut && (s.id === lastId || !sOut) && r.checkOut > sIn) sOut = r.checkOut;
            if (sIn !== s.check_in_time || sOut !== s.check_out_time) {
              await tx.attendance_sessions.update({ where: { id: s.id }, data: { check_in_time: sIn, check_out_time: sOut, duration: sOut ? mins(sIn, sOut) : null, is_auto_checkout: false } });
            }
          }
        }
        const after = await tx.attendance_sessions.findMany({ where: { employee_id: emp.employeeId, date: r.date } });
        const totalHours = Math.round((after.reduce((sum, s) => sum + (s.check_out_time ? mins(s.check_in_time, s.check_out_time) : 0), 0) / 60) * 100) / 100;

        const ctx = await statusContext(r.date, r.date, [emp.id]);
        const c = ctx.classify(emp, r.date, { date: r.date, check_in_time: inT, check_out_time: outT, total_hours: totalHours, is_auto_checkout: false });
        const status = c.computedStatus === "Late" || c.computedStatus === "Half day" || c.computedStatus === "Absent" ? c.computedStatus : "Present";
        await tx.attendance.update({ where: key, data: { total_hours: totalHours, status } });
      });
    } catch (e) {
      if (!(e instanceof DecideError)) throw e;
      failure = { code: e.code, message: e.message };
    }
    if (failure) return reply.code(failure.code).send({ success: false, message: failure.message });

    const approver = await prisma.employee.findUnique({ where: { id: u.id }, select: { firstName: true, lastName: true } });
    await createNotification({
      userId: emp.id,
      title: action === "approve" ? "Attendance correction approved" : "Attendance correction rejected",
      message:
        action === "approve"
          ? `${nameOf(approver)} approved your correction for ${fmtDate(r.date)}.${remarks ? ` Remarks: ${remarks}` : ""}`
          : `${nameOf(approver)} rejected your correction for ${fmtDate(r.date)}. Reason: ${remarks}`,
      type: "attendance_regularization",
      module: "Attendance",
      relatedId: r.id,
      actionUrl: "/attendance/dashboard#requests",
    });
    return reply.send({ success: true, message: action === "approve" ? "Approved — the attendance for that day has been updated." : "Request rejected." });
  };

  app.post("/api/attendance/requests/:id/approve", { preHandler: [authenticate] }, decide("approve"));
  app.post("/api/attendance/requests/:id/reject", { preHandler: [authenticate] }, decide("reject"));

  // ── Cancel (own pending only) ─────────────────────────────────────────────
  app.post("/api/attendance/requests/:id/cancel", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const { id } = req.params as { id: string };
    const r = await prisma.attendanceRegularization.findUnique({ where: { id }, select: { employeeId: true, status: true } });
    if (!r) return reply.code(404).send({ success: false, message: "This request no longer exists." });
    if (r.employeeId !== u.id) return reply.code(403).send({ success: false, message: "You can cancel only your own requests." });
    const done = await prisma.attendanceRegularization.updateMany({ where: { id, employeeId: u.id, status: "PENDING" }, data: { status: "CANCELLED", decidedAt: new Date() } });
    if (!done.count) return reply.code(409).send({ success: false, message: `This request has already been ${r.status.toLowerCase()}.` });
    return reply.send({ success: true, message: "Request cancelled." });
  });
}
