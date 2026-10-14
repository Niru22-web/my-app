import crypto from "crypto";
import type { FastifyInstance } from "fastify";
import { prisma, SAFE_EMPLOYEE_SELECT } from "../config/db";
import { authenticate, normRole, requireRoles, isTeamMemberOrSelf } from "../plugins/auth";
import { isScope, scopeCodes } from "../utils/scope";

function utcDayDate(d = new Date()): Date {
  return new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

export async function attendanceRoutes(app: FastifyInstance) {
  // GET /api/attendance/today — returns exact AttendanceToday shape & never leaks password hash (fixes S4, A3)
  app.get("/api/attendance/today", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const now = new Date();
    const day = utcDayDate(now);
    const weekAgo = new Date(day.getTime() - 6 * 86_400_000);

    const [record, recentRows] = await Promise.all([
      prisma.attendance.findFirst({
        where: {
          employee_id: u.employeeId,
          OR: [{ date: day }, { attendance_sessions: { some: { check_out_time: null } } }],
        },
        include: { attendance_sessions: { orderBy: { check_in_time: "asc" } } },
        orderBy: { date: "desc" },
      }),
      prisma.attendance.findMany({
        where: { employee_id: u.employeeId, date: { gte: weekAgo, lte: day } },
        include: { attendance_sessions: { orderBy: { check_in_time: "asc" } } },
        orderBy: { date: "desc" },
      }),
    ]);

    const sessions = record?.attendance_sessions ?? [];
    const activeSession = [...sessions].reverse().find((s) => !s.check_out_time) ?? null;

    const totalWeekHours = recentRows.reduce((s, r) => s + Number(r.total_hours ?? 0), 0);
    const presentDays = recentRows.filter((r) => (r.status ?? "").toLowerCase() === "present").length;

    return reply.send({
      success: true,
      data: {
        status: activeSession ? "Active" : "Inactive",
        todayRecord: record
          ? {
              checkInTime: record.check_in_time?.toISOString() ?? null,
              checkOutTime: record.check_out_time?.toISOString() ?? null,
              status: record.status,
              totalHours: Number(record.total_hours ?? 0),
              checkInLocation: record.check_in_location,
              checkOutLocation: record.check_out_location,
              location_name: record.location_name,
            }
          : null,
        checkInLocation: record?.check_in_location ?? null,
        checkOutLocation: record?.check_out_location ?? null,
        activeSession: activeSession
          ? {
              id: activeSession.id,
              check_in_time: activeSession.check_in_time.toISOString(),
              check_out_time: null,
              duration: activeSession.duration,
              location_name: activeSession.location_name,
              check_in_location: activeSession.check_in_location,
            }
          : null,
        activeSessions: sessions.map((s) => ({
          id: s.id,
          check_in_time: s.check_in_time.toISOString(),
          check_out_time: s.check_out_time?.toISOString() ?? null,
          duration: s.duration,
          location_name: s.location_name,
          check_in_location: s.check_in_location,
        })),
        weeklyStats: {
          totalHours: totalWeekHours.toFixed(1),
          presentDays,
          avgInTime: record?.check_in_time
            ? record.check_in_time.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
            : "—",
        },
        workLog: recentRows.map((r) => ({
          date: r.date.toISOString().slice(0, 10),
          status: r.status,
          checkInTime: r.check_in_time?.toISOString() ?? null,
          checkOutTime: r.check_out_time?.toISOString() ?? null,
          totalHours: Number(r.total_hours ?? 0),
        })),
      },
    });
  });

  // POST /api/attendance/check-in & /api/attendance/login (fixes A4, A9)
  const handleCheckIn = async (req: any, reply: any) => {
    const u = req.user!;
    const body = (req.body ?? {}) as {
      latitude?: number;
      longitude?: number;
      location?: string;
      locationName?: string;
    };
    const now = new Date();
    const day = utcDayDate(now);
    const loc = body.locationName ?? body.location ?? null;

    const record = await prisma.attendance.upsert({
      where: { employee_id_date: { employee_id: u.employeeId, date: day } },
      update: {
        status: "Present",
        check_out_time: null,
        is_auto_checkout: false,
      },
      create: {
        id: crypto.randomUUID(),
        employee_id: u.employeeId,
        date: day,
        check_in_time: now,
        check_in_location: loc,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        location_name: loc,
        status: "Present",
        attendance_source: "WEB",
      },
      include: { attendance_sessions: true },
    });

    const openSession = record.attendance_sessions.find((s) => !s.check_out_time);
    if (!openSession) {
      await prisma.attendance_sessions.create({
        data: {
          id: crypto.randomUUID(),
          employee_id: u.employeeId,
          date: record.date,
          check_in_time: now,
          check_in_location: loc,
          latitude: body.latitude ?? null,
          longitude: body.longitude ?? null,
          location_name: loc,
        },
      });
    }

    const updated = await prisma.attendance.findUnique({
      where: { id: record.id },
      include: { attendance_sessions: { orderBy: { check_in_time: "asc" } } },
    });

    return reply.send({ success: true, data: updated });
  };

  app.post("/api/attendance/check-in", { preHandler: [authenticate] }, handleCheckIn);
  app.post("/api/attendance/login", { preHandler: [authenticate] }, handleCheckIn);

  /**
   * POST /api/attendance/logout & /api/attendance/check-out — fixes C1 & C2:
   * Updates the active day's attendance row (matched via open session or UTC date key)
   * instead of computing local midnight and upserting a phantom previous-day row!
   */
  const handleCheckOut = async (req: any, reply: any) => {
    const u = req.user!;
    const body = (req.body ?? {}) as {
      latitude?: number;
      longitude?: number;
      location?: string;
      locationName?: string;
    };
    const now = new Date();
    const day = utcDayDate(now);
    const loc = body.locationName ?? body.location ?? null;

    let record = await prisma.attendance.findFirst({
      where: {
        employee_id: u.employeeId,
        OR: [{ date: day }, { attendance_sessions: { some: { check_out_time: null } } }],
      },
      include: { attendance_sessions: { orderBy: { check_in_time: "asc" } } },
      orderBy: { date: "desc" },
    });

    if (!record) {
      return reply.code(400).send({
        success: false,
        message: "No active check-in found for today.",
      });
    }

    const openSession = [...record.attendance_sessions].reverse().find((s) => !s.check_out_time);
    if (openSession) {
      const durMinutes = Math.max(0, Math.round((now.getTime() - openSession.check_in_time.getTime()) / 60_000));
      await prisma.attendance_sessions.update({
        where: { id: openSession.id },
        data: {
          check_out_time: now,
          check_out_location: loc,
          duration: durMinutes,
        },
      });
    }

    const allSessions = await prisma.attendance_sessions.findMany({
      where: { employee_id: record.employee_id, date: record.date },
    });
    const totalMinutes = allSessions.reduce((sum, s) => {
      if (s.duration != null && s.duration > 0) return sum + Number(s.duration);
      if (s.check_out_time) return sum + Math.max(0, Math.round((s.check_out_time.getTime() - s.check_in_time.getTime()) / 60_000));
      return sum;
    }, 0);
    const totalHours = Math.round((totalMinutes / 60) * 100) / 100;

    record = await prisma.attendance.update({
      where: { id: record.id },
      data: {
        check_out_time: now,
        check_out_location: loc,
        total_hours: totalHours,
        status: "Present",
      },
      include: { attendance_sessions: { orderBy: { check_in_time: "asc" } } },
    });

    return reply.send({ success: true, data: record });
  };

  app.post("/api/attendance/logout", { preHandler: [authenticate] }, handleCheckOut);
  app.post("/api/attendance/check-out", { preHandler: [authenticate] }, handleCheckOut);

  // GET /api/attendance/weekly-pulse
  app.get("/api/attendance/weekly-pulse", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const { startDate, endDate } = (req.query ?? {}) as { startDate?: string; endDate?: string };
    const start = startDate ? new Date(`${startDate.slice(0, 10)}T00:00:00.000Z`) : new Date(Date.now() - 13 * 86_400_000);
    const end = endDate ? new Date(`${endDate.slice(0, 10)}T23:59:59.999Z`) : new Date();

    const rows = await prisma.attendance.findMany({
      where: {
        employee_id: u.employeeId,
        date: { gte: start, lte: end },
      },
      orderBy: { date: "asc" },
    });

    const midTime = start.getTime() + 7 * 86_400_000;
    const prevWeekDays: Record<string, number> = {};
    const thisWeekDays: Record<string, number> = {};
    let prevWeekHours = 0;
    let thisWeekHours = 0;

    for (const r of rows) {
      const ymd = r.date.toISOString().slice(0, 10);
      const hrs = Number(r.total_hours ?? 0);
      if (r.date.getTime() < midTime) {
        prevWeekDays[ymd] = hrs;
        prevWeekHours += hrs;
      } else {
        thisWeekDays[ymd] = hrs;
        thisWeekHours += hrs;
      }
    }

    const hoursDiff = Math.round((thisWeekHours - prevWeekHours) * 100) / 100;
    const percentDiff = prevWeekHours > 0 ? Math.round(((thisWeekHours - prevWeekHours) / prevWeekHours) * 100) : 0;

    return reply.send({
      success: true,
      data: {
        thisWeekHours: Math.round(thisWeekHours * 100) / 100,
        prevWeekHours: Math.round(prevWeekHours * 100) / 100,
        hoursDiff,
        percentDiff,
        thisWeekDays,
        prevWeekDays,
      },
    });
  });

  // GET /api/attendance/all — role-scoped & strips password (fixes A1, A3)
  app.get("/api/attendance/all", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const r = normRole(u.role);
    const scopeQ = (req.query as Record<string, string | undefined>)?.scope;
    let scoped: string[] | null | undefined;
    if (isScope(scopeQ)) {
      // IT sees firm-wide attendance only when an Admin grants the Attendance permission (firm decision).
      if (scopeQ === "org" && r === "it") {
        const perm = await prisma.userPermission.findUnique({ where: { userId: u.id }, select: { attendanceView: true } });
        if (!perm?.attendanceView) return reply.code(403).send({ success: false, message: "Attendance access hasn’t been granted to you." });
      }
      scoped = await scopeCodes(u, scopeQ, reply);
      if (scoped === undefined) return;
    }
    const { startDate, endDate, employeeId } = (req.query ?? {}) as {
      startDate?: string;
      endDate?: string;
      employeeId?: string;
    };

    const where: Record<string, any> = {};
    if (startDate || endDate) {
      where.date = {
        ...(startDate ? { gte: new Date(`${startDate.slice(0, 10)}T00:00:00.000Z`) } : {}),
        ...(endDate ? { lte: new Date(`${endDate.slice(0, 10)}T23:59:59.999Z`) } : {}),
      };
    }

    if (scoped !== undefined) {
      if (scoped === null) {
        if (employeeId) where.employee_id = employeeId;
      } else {
        where.employee_id = employeeId ? (scoped.includes(employeeId) ? employeeId : "__none__") : { in: scoped };
      }
    } else if (["admin", "owner", "hr", "it"].includes(r)) {
      if (r === "it") {
        const perm = await prisma.userPermission.findUnique({ where: { userId: u.id }, select: { attendanceView: true } });
        if (!perm?.attendanceView) return reply.code(403).send({ success: false, message: "Attendance access hasn’t been granted to you." });
      }
      if (employeeId) where.employee_id = employeeId;
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
        select: { employeeId: true },
      });
      const codes = team.map((t) => t.employeeId);
      where.employee_id = employeeId && codes.includes(employeeId) ? employeeId : { in: codes };
    } else {
      where.employee_id = u.employeeId;
    }

    const rows = await prisma.attendance.findMany({
      where,
      include: {
        Employee: { select: SAFE_EMPLOYEE_SELECT },
        attendance_sessions: { orderBy: { check_in_time: "asc" } },
      },
      orderBy: [{ date: "desc" }, { check_in_time: "desc" }],
    });

    return reply.send({ success: true, data: rows });
  });

  // GET /api/attendance/monthly — role-scoped monthly breakdown (fixes A1, A3)
  app.get("/api/attendance/monthly", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const r = normRole(u.role);
    const { employeeId, month } = (req.query ?? {}) as { employeeId?: string; month?: string };
    let targetCode = u.employeeId;
    if (employeeId && employeeId !== u.employeeId) {
      // Only the person, anyone above them in the reporting tree, or firm-wide roles (fixes cross-team viewing)
      const target = await prisma.employee.findUnique({ where: { employeeId }, select: { id: true } });
      if (!target || !(await isTeamMemberOrSelf(u, target.id))) {
        return reply.code(403).send({ success: false, message: "This employee is not in your reporting team." });
      }
      targetCode = employeeId;
    }

    const ym = month && /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7);
    const start = new Date(`${ym}-01T00:00:00.000Z`);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 23, 59, 59));

    const [emp, rows] = await Promise.all([
      prisma.employee.findUnique({
        where: { employeeId: targetCode },
        select: SAFE_EMPLOYEE_SELECT,
      }),
      prisma.attendance.findMany({
        where: { employee_id: targetCode, date: { gte: start, lte: end } },
        include: { attendance_sessions: true },
        orderBy: { date: "asc" },
      }),
    ]);

    return reply.send({
      success: true,
      data: {
        employee: emp,
        month: ym,
        dailyStats: rows.map((row) => ({
          date: row.date.toISOString().slice(0, 10),
          status: row.status,
          totalHours: Number(row.total_hours ?? 0),
          sessionCount: row.attendance_sessions.length,
          checkInTime: row.check_in_time?.toISOString() ?? null,
          checkOutTime: row.check_out_time?.toISOString() ?? null,
        })),
      },
    });
  });

  // POST /api/attendance/force-checkout — restricted to Admin/Owner/HR/IT (fixes A2)
  app.post(
    "/api/attendance/force-checkout",
    { preHandler: [requireRoles(["admin", "owner", "hr", "it"])] },
    async (req, reply) => {
      const { attendanceId, employeeId, date, checkOutTime } = (req.body ?? {}) as {
        attendanceId?: string;
        employeeId?: string;
        date?: string;
        checkOutTime?: string;
      };
      const outTime = checkOutTime ? new Date(checkOutTime) : new Date();

      const record = attendanceId
        ? await prisma.attendance.findUnique({ where: { id: attendanceId } })
        : employeeId && date
          ? await prisma.attendance.findUnique({
              where: {
                employee_id_date: {
                  employee_id: employeeId,
                  date: new Date(`${date.slice(0, 10)}T00:00:00.000Z`),
                },
              },
            })
          : null;

      if (!record) {
        return reply.code(404).send({ success: false, message: "Attendance record not found" });
      }

      await prisma.attendance_sessions.updateMany({
        where: { employee_id: record.employee_id, date: record.date, check_out_time: null },
        data: { check_out_time: outTime },
      });

      const updated = await prisma.attendance.update({
        where: { id: record.id },
        data: { check_out_time: outTime, status: "Present" },
      });
      return reply.send({ success: true, data: updated });
    },
  );

  // PUT /api/attendance/update — restricted to Admin/Owner/HR/IT (fixes A2)
  app.put(
    "/api/attendance/update",
    { preHandler: [requireRoles(["admin", "owner", "hr", "it"])] },
    async (req, reply) => {
      const { employeeId, date, checkInTime, checkOutTime } = (req.body ?? {}) as {
        employeeId?: string;
        date?: string;
        checkInTime?: string;
        checkOutTime?: string;
      };
      if (!employeeId || !date || !checkInTime || !checkOutTime) {
        return reply.code(400).send({
          success: false,
          message: "employeeId, date, checkInTime, and checkOutTime are required.",
        });
      }

      const day = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
      const inTime = new Date(checkInTime);
      const outTime = new Date(checkOutTime);
      const totalHours = Math.max(0, Math.round(((outTime.getTime() - inTime.getTime()) / 3_600_000) * 100) / 100);

      const updated = await prisma.attendance.upsert({
        where: { employee_id_date: { employee_id: employeeId, date: day } },
        update: {
          check_in_time: inTime,
          check_out_time: outTime,
          total_hours: totalHours,
          status: "Present",
          is_auto_checkout: false,
        },
        create: {
          id: crypto.randomUUID(),
          employee_id: employeeId,
          date: day,
          check_in_time: inTime,
          check_out_time: outTime,
          total_hours: totalHours,
          status: "Present",
          attendance_source: "MANUAL",
        },
      });
      return reply.send({ success: true, data: updated });
    },
  );
}
