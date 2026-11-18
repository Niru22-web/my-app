import type { FastifyInstance } from "fastify";
import { prisma } from "../config/db";
import { authenticate, normRole, requireRoles } from "../plugins/auth";
import { getWorkCalendar, isOffDay } from "../utils/work-calendar";
import { createNotification } from "../utils/notify";
import { mailConfigured, sendMail, textToHtml, type MailResult } from "../utils/mailer";
import { env } from "../config/env";

function currentWeekBounds(now = new Date()): { weekStart: Date; weekEnd: Date } {
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = utc.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(utc);
  weekStart.setUTCDate(utc.getUTCDate() + diff);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6); // Sunday — working Saturdays count (firm calendar)
  return { weekStart, weekEnd };
}

const FIRM_ROLES = ["admin", "owner", "hr", "it"];

/** People who report to `leadId` in any of the ways the portal records a reporting line. */
function teamOr(leadId: string) {
  return [
    { managerId: leadId },
    { partnerId: leadId },
    { subManagerId: leadId },
    { reportingManagerIds: { has: leadId } },
    { reportingPartnerIds: { has: leadId } },
    { subManagerIds: { has: leadId } },
    { managers: { some: { managerId: leadId } } },
    { partners: { some: { partnerId: leadId } } },
  ];
}

const EMP_FOR_MAIL = {
  id: true,
  employeeId: true,
  firstName: true,
  lastName: true,
  officeEmail: true,
  managerId: true,
  partnerId: true,
  reportingManagerIds: true,
  reportingPartnerIds: true,
  managers: { select: { managerId: true } },
  partners: { select: { partnerId: true } },
} as const;

/** Find the employee a reminder/escalation is for, limited to the caller's team unless they're HR/Admin/IT. */
async function findTarget(user: { id: string; role: string }, id: string) {
  const firm = FIRM_ROLES.includes(normRole(user.role));
  return prisma.employee.findFirst({
    where: {
      AND: [{ OR: [{ employeeId: id }, { id }] }, ...(firm ? [] : [{ OR: teamOr(user.id) }])],
    },
    select: EMP_FOR_MAIL,
  });
}

const fullName = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`.trim();

function mailNote(m: MailResult | null) {
  if (!m) return "";
  if (m.status === "sent") return " Email sent.";
  if (m.status === "not_configured") return " Email not sent: email isn’t set up yet.";
  return ` Email failed: ${m.error ?? "the mail server refused it"}.`;
}

export async function complianceRoutes(app: FastifyInstance) {
  // GET /api/compliance/email-status — lets the page say whether "Send email" will actually deliver.
  app.get("/api/compliance/email-status", { preHandler: [authenticate] }, async (_req, reply) => {
    return reply.send({ success: true, data: { configured: mailConfigured() } });
  });

  // GET /api/compliance/dashboard — fixes C1, C2, T14, L7
  app.get("/api/compliance/dashboard", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const r = normRole(u.role);
    const isFirm = ["admin", "owner", "hr", "it"].includes(r);
    const isTeamLead = ["manager", "partner", "sub-manager", "sub manager"].includes(r);

    const { weekStart, weekEnd } = currentWeekBounds();
    const todayYmd = new Date().toISOString().slice(0, 10);

    const empWhere: Record<string, any> = {
      status: { equals: "Active", mode: "insensitive" },
    };
    if (!isFirm) {
      if (isTeamLead) {
        empWhere.OR = [{ id: u.id }, ...teamOr(u.id)];
      } else {
        empWhere.id = u.id;
      }
    }

    const employees = await prisma.employee.findMany({
      where: empWhere,
      select: {
        id: true,
        employeeId: true,
        firstName: true,
        lastName: true,
        officeEmail: true,
        role: true,
        department: true,
        manager: { select: { firstName: true, lastName: true } },
        managers: {
          include: { manager: { select: { firstName: true, lastName: true } } },
          take: 1,
        },
      },
      orderBy: { firstName: "asc" },
    });
    // Only the people on this page: a team lead's view no longer reads (or returns) the whole firm's week.
    const forShown = isFirm ? {} : { employeeId: { in: employees.map((e) => e.id) } };

    const [timelogs, holidays, leaves, reminders] = await Promise.all([
      prisma.timelog.findMany({
        where: { ...forShown, date: { gte: weekStart, lte: new Date(weekStart.getTime() + 6 * 86_400_000) } },
        select: { employeeId: true, date: true, hours: true, billableStatus: true },
      }),
      prisma.event.findMany({
        where: { type: "Holiday", date: { gte: weekStart, lte: weekEnd } },
        select: { date: true },
      }),
      prisma.leave.findMany({
        where: {
          ...forShown,
          status: { equals: "approved", mode: "insensitive" },
          fromDate: { lte: weekEnd },
          toDate: { gte: weekStart },
        },
        select: { employeeId: true, fromDate: true, toDate: true },
      }),
      prisma.reminderHistory.findMany({
        where: { ...forShown, weekStart },
        include: { employee: { select: { firstName: true, lastName: true } } },
        orderBy: { sentAt: "desc" },
      }),
    ]);

    const holidayYmds = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));
    // Firm work calendar: weekly offs (e.g. Sundays + 2nd/4th Saturdays) and expected hours per working day.
    const cal = await getWorkCalendar();
    const stdHours = cal.standardDayHours;
    const weekWorkingDays: string[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart.getTime() + i * 86_400_000);
      const d = day.toISOString().slice(0, 10);
      if (!isOffDay(day, cal) && !holidayYmds.has(d)) weekWorkingDays.push(d);
    }

    const logsByEmp = new Map<string, typeof timelogs>();
    for (const l of timelogs) {
      const arr = logsByEmp.get(l.employeeId) ?? [];
      arr.push(l);
      logsByEmp.set(l.employeeId, arr);
    }

    const remByEmp = new Map<string, typeof reminders>();
    for (const rm of reminders) {
      const arr = remByEmp.get(rm.employeeId) ?? [];
      arr.push(rm);
      remByEmp.set(rm.employeeId, arr);
    }

    let compliantEmployees = 0;
    let missingYesterday = 0;
    let below40Hours = 0;
    let criticalRisk = 0;
    let escalationsTriggered = 0;
    let totalHoursAll = 0;

    // The last working day before today (skips weekly offs and holidays); time for today can still be logged.
    const pastDays = weekWorkingDays.filter((d) => d < todayYmd);
    const yesterdayYmd = pastDays[pastDays.length - 1];

    const empRows = employees.map((emp) => {
      const myLogs = logsByEmp.get(emp.id) ?? [];
      const weeklyHours = Math.round(myLogs.reduce((s, l) => s + Number(l.hours ?? 0), 0) * 100) / 100;
      const billableHours = Math.round(
        myLogs.filter((l) => l.billableStatus === "billable").reduce((s, l) => s + Number(l.hours ?? 0), 0) * 100,
      ) / 100;
      totalHoursAll += weeklyHours;

      const loggedDates = new Set(myLogs.map((l) => l.date.toISOString().slice(0, 10)));
      const empLeaves = leaves.filter((lv) => lv.employeeId === emp.id);
      const isOnLeave = (ymd: string) =>
        empLeaves.some((lv) => lv.fromDate.toISOString().slice(0, 10) <= ymd && lv.toDate.toISOString().slice(0, 10) >= ymd);

      const missingDays = pastDays.filter((ymd) => !loggedDates.has(ymd) && !isOnLeave(ymd));
      if (yesterdayYmd && missingDays.includes(yesterdayYmd)) missingYesterday++;

      // Expected hours this week = working days not on leave × expected hours per day
      const targetHours = Math.round((weekWorkingDays.length - weekWorkingDays.filter(isOnLeave).length) * stdHours * 100) / 100;
      // Expected so far: working days before today (a week in progress isn't judged against the full week).
      const dueHours = Math.round((pastDays.length - pastDays.filter(isOnLeave).length) * stdHours * 100) / 100;
      const complianceStatus =
        weeklyHours >= dueHours && missingDays.length === 0
          ? "compliant"
          : weeklyHours === 0
            ? "unsubmitted"
            : missingDays.length > 0
              ? "missing_daily"
              : "under_40_hours";

      if (complianceStatus === "compliant") compliantEmployees++;
      if (weeklyHours < dueHours) below40Hours++;

      const riskScore = Math.min(100, missingDays.length * 25 + (weeklyHours === 0 ? 40 : weeklyHours < 20 ? 20 : 0));
      const riskLevel = riskScore >= 60 ? "critical" : riskScore >= 25 ? "warning" : "healthy";
      if (riskLevel === "critical") criticalRisk++;

      const myRem = remByEmp.get(emp.id) ?? [];
      const maxEsc = myRem.reduce((m, r) => Math.max(m, r.escalationLevel), 0);
      if (maxEsc > 0) escalationsTriggered++;

      const mgr = emp.manager ?? emp.managers[0]?.manager ?? null;

      return {
        id: emp.id,
        employeeId: emp.employeeId,
        name: `${emp.firstName} ${emp.lastName}`.trim(),
        email: emp.officeEmail,
        role: emp.role,
        department: emp.department,
        managerName: mgr ? `${mgr.firstName} ${mgr.lastName}`.trim() : null,
        weeklyHours,
        billableHours,
        targetHours,
        dueHours,
        complianceStatus,
        compliancePct: dueHours > 0 ? Math.min(100, Math.round((weeklyHours / dueHours) * 100)) : 100,
        missingDays,
        riskScore,
        riskLevel,
        reminderCount: myRem.length,
        lastReminderAt: myRem[0]?.sentAt.toISOString() ?? null,
        escalationLevel: maxEsc,
        isRepeatedOffender: myRem.length >= 3,
      };
    });

    const totalEmployees = empRows.length;
    const weeklyCompliance = totalEmployees > 0 ? Math.round((compliantEmployees / totalEmployees) * 100) : 100;
    const totalTarget = empRows.reduce((s, x) => s + x.dueHours, 0);
    const teamUtilization = totalTarget > 0 ? Math.min(100, Math.round((totalHoursAll / totalTarget) * 100)) : 0;

    // Department breakdown
    const deptMap = new Map<string, typeof empRows>();
    for (const row of empRows) {
      const d = row.department || "General";
      deptMap.set(d, [...(deptMap.get(d) ?? []), row]);
    }
    const departmentAnalytics = [...deptMap.entries()].map(([department, list]) => {
      const comp = list.filter((x) => x.complianceStatus === "compliant").length;
      const hrs = list.reduce((s, x) => s + x.weeklyHours, 0);
      return {
        department,
        totalEmployees: list.length,
        compliantCount: comp,
        compliancePct: Math.round((comp / list.length) * 100),
        avgHours: Math.round((hrs / list.length) * 10) / 10,
        utilizationPct: (() => {
          const t = list.reduce((s, x) => s + x.dueHours, 0);
          return t > 0 ? Math.min(100, Math.round((hrs / t) * 100)) : 0;
        })(),
        criticalCount: list.filter((x) => x.riskLevel === "critical").length,
        belowHoursCount: list.filter((x) => x.weeklyHours < x.dueHours).length,
      };
    });

    const remindersSentToday = reminders.filter((rm) => rm.sentAt.toISOString().slice(0, 10) === todayYmd).length;

    return reply.send({
      success: true,
      data: {
        kpis: {
          weeklyCompliance,
          missingYesterday,
          below40Hours,
          criticalRisk,
          escalationsTriggered,
          teamUtilization,
          remindersSentToday,
          totalEmployees,
          compliantEmployees,
        },
        employees: empRows,
        departmentAnalytics,
        trends: [
          {
            weekLabel: weekStart.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }),
            weekStart: weekStart.toISOString().slice(0, 10),
            compliancePct: weeklyCompliance,
            avgHours: totalEmployees > 0 ? Math.round((totalHoursAll / totalEmployees) * 10) / 10 : 0,
            missingCount: empRows.filter((e) => e.missingDays.length > 0).length,
            totalEmployees,
          },
        ],
        recentActivity: reminders.slice(0, 10).map((rm) => ({
          id: rm.id,
          type: rm.escalationLevel > 0 ? "escalation_triggered" : "reminder_sent",
          employeeName: `${rm.employee.firstName} ${rm.employee.lastName}`.trim(),
          description: rm.escalationLevel > 0 ? "Escalated to manager & HR" : "Timesheet reminder sent",
          timestamp: rm.sentAt.toISOString(),
        })),
        weekStart: weekStart.toISOString().slice(0, 10),
        weekEnd: weekEnd.toISOString().slice(0, 10),
        generatedAt: new Date().toISOString(),
      },
    });
  });

  // POST /api/compliance/trigger-reminder/:id  body: { sendEmail?: boolean }
  app.post(
    "/api/compliance/trigger-reminder/:id",
    { preHandler: [requireRoles(["admin", "owner", "hr", "it", "manager", "partner"])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { sendEmail = false } = (req.body ?? {}) as { sendEmail?: boolean };
      const emp = await findTarget(req.user!, id);
      if (!emp) {
        return reply.code(404).send({ success: false, message: "Employee not found in your team." });
      }

      const { weekStart } = currentWeekBounds();
      const name = fullName(emp);
      let mail: MailResult | null = null;
      if (sendEmail) {
        const text =
          `Hi ${emp.firstName},\n\n` +
          `Your timesheet for the week of ${weekStart.toISOString().slice(0, 10)} is incomplete. ` +
          `Please log and submit your pending entries.\n\n` +
          `Open your timesheet: ${env.FRONTEND_URL}/timesheet\n\n` +
          `— ASA Portal`;
        mail = await sendMail({
          to: emp.officeEmail,
          subject: "Timesheet reminder: please complete this week",
          text,
          html: textToHtml(text),
          category: "compliance_reminder",
          employeeId: emp.id,
        });
      }

      await prisma.reminderHistory.create({
        data: { employeeId: emp.id, reminderType: "manual", weekStart, escalationLevel: 0 },
      });
      await createNotification({
        userId: emp.id,
        title: "Timesheet Reminder",
        message: "Please log and submit your pending timesheet entries for this week.",
        type: "timesheet_reminder",
        module: "HR",
        priority: "High",
        actionUrl: "/timesheet",
      });

      return reply.send({
        success: true,
        message: `Reminder sent to ${name} in the portal.${mailNote(mail)}`,
        email: mail ? mail.status : "skipped",
      });
    },
  );

  // POST /api/compliance/escalate/:id  body: { sendEmail?: boolean }
  app.post(
    "/api/compliance/escalate/:id",
    { preHandler: [requireRoles(["admin", "owner", "hr", "it"])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { sendEmail = false } = (req.body ?? {}) as { sendEmail?: boolean };
      const emp = await findTarget(req.user!, id);
      if (!emp) {
        return reply.code(404).send({ success: false, message: "Employee not found." });
      }

      // Reporting line: managers get the escalation; HR and partners are copied. No manager → HR receives it.
      const managerIds = [...new Set([emp.managerId, ...emp.reportingManagerIds, ...emp.managers.map((m) => m.managerId)])].filter(
        (x): x is string => !!x && x !== emp.id,
      );
      const partnerIds = [...new Set([emp.partnerId, ...emp.reportingPartnerIds, ...emp.partners.map((p) => p.partnerId)])].filter(
        (x): x is string => !!x && x !== emp.id,
      );
      const active = { status: { equals: "Active", mode: "insensitive" as const } };
      const [managers, partners, hr] = await Promise.all([
        prisma.employee.findMany({ where: { id: { in: managerIds }, ...active }, select: { id: true, officeEmail: true } }),
        prisma.employee.findMany({ where: { id: { in: partnerIds }, ...active }, select: { id: true, officeEmail: true } }),
        prisma.employee.findMany({ where: { role: { equals: "HR", mode: "insensitive" }, ...active }, select: { id: true, officeEmail: true } }),
      ]);
      const leads = managers.length ? managers : hr;
      const to = leads.map((m) => m.officeEmail);
      const cc = [...hr, ...partners].map((x) => x.officeEmail).filter((e) => !to.includes(e));

      const { weekStart } = currentWeekBounds();
      const name = fullName(emp);
      let mail: MailResult | null = null;
      if (sendEmail) {
        const text =
          `Timesheet compliance escalation\n\n` +
          `${name} (${emp.employeeId}) has not completed their timesheet for the week of ${weekStart.toISOString().slice(0, 10)}. ` +
          `Please follow up with them.\n\n` +
          `Compliance overview: ${env.FRONTEND_URL}/compliance\n\n` +
          `— ASA Portal`;
        mail = await sendMail({
          to,
          cc,
          subject: `Timesheet escalation: ${name}`,
          text,
          html: textToHtml(text),
          category: "compliance_escalation",
          employeeId: emp.id,
        });
      }

      await prisma.reminderHistory.create({
        data: { employeeId: emp.id, reminderType: "monday_escalation", weekStart, escalationLevel: 2, ccEmails: sendEmail ? cc : [] },
      });
      await createNotification({
        userId: emp.id,
        title: "Timesheet Compliance Escalation",
        message: "Your incomplete timesheet has been escalated to your reporting manager and HR.",
        type: "timesheet_escalation",
        module: "HR",
        priority: "Critical",
        actionUrl: "/timesheet",
      });
      // Whoever it was escalated to also hears about it in the portal, whether or not email went out.
      for (const lead of leads) {
        await createNotification({
          userId: lead.id,
          title: "Timesheet escalation",
          message: `${name}’s timesheet for this week is still incomplete.`,
          type: "timesheet_escalation",
          module: "HR",
          priority: "High",
          actionUrl: "/compliance",
        });
      }

      return reply.send({
        success: true,
        message: `Escalation recorded for ${name}.${mailNote(mail)}`,
        email: mail ? mail.status : "skipped",
      });
    },
  );

  // GET /api/reports/overview — fixes RP6, RP7
  app.get("/api/reports/overview", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const r = normRole(u.role);
    const { fromDate, toDate } = (req.query ?? {}) as { fromDate?: string; toDate?: string };
    const start = fromDate ? new Date(`${fromDate.slice(0, 10)}T00:00:00.000Z`) : new Date(Date.now() - 30 * 86_400_000);
    const end = toDate ? new Date(`${toDate.slice(0, 10)}T23:59:59.999Z`) : new Date();

    const isFirm = ["admin", "owner", "hr", "it"].includes(r);

    const [attGroups, leaveGroups, claimGroups] = await Promise.all([
      prisma.attendance.groupBy({
        by: ["status"],
        where: {
          date: { gte: start, lte: end },
          ...(!isFirm ? { employee_id: u.employeeId } : {}),
        },
        _count: { _all: true },
      }),
      prisma.leave.groupBy({
        by: ["status"],
        where: {
          appliedDate: { gte: start, lte: end },
          ...(!isFirm ? { employeeId: u.id } : {}),
        },
        _sum: { totalDays: true },
      }),
      prisma.reimbursement.groupBy({
        by: ["status"],
        where: {
          submittedAt: { gte: start, lte: end },
          ...(!isFirm ? { employeeId: u.id } : {}),
        },
        _sum: { amount: true },
      }),
    ]);

    return reply.send({
      success: true,
      data: {
        attendanceBreakdown: attGroups.map((g) => ({ label: g.status, value: g._count._all })),
        leaveBreakdown: leaveGroups.map((g) => ({ label: g.status, value: Number(g._sum.totalDays ?? 0) })),
        reimbursementBreakdown: claimGroups.map((g) => ({ label: g.status, value: Number(g._sum.amount ?? 0) })),
      },
    });
  });
}
