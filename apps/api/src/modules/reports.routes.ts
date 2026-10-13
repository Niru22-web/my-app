import type { FastifyInstance } from "fastify";
import { authenticate } from "../plugins/auth";
import { DAY, type ReportDef, type Tier, TIERS, parseDay, scopeEmployees, tierAccess, todayUtc, ymd } from "./reports/engine";
import { employeeReports } from "./reports/employee.reports";
import { leaveReports } from "./reports/leave.reports";
import { attendanceReports } from "./reports/attendance.reports";
import { timeReports } from "./reports/time.reports";

const REPORTS: ReportDef[] = [...employeeReports, ...leaveReports, ...attendanceReports, ...timeReports];
const BY_KEY = new Map(REPORTS.map((r) => [r.key, r]));
const CATEGORIES = [
  { key: "employee", title: "Employee Information" },
  { key: "leave", title: "Leave Tracker" },
  { key: "attendance", title: "Attendance" },
  { key: "time", title: "Time Tracker" },
];

export async function reportRoutes(app: FastifyInstance) {
  // GET /api/reports/catalog — which tiers and reports the signed-in person may open
  app.get("/api/reports/catalog", { preHandler: [authenticate] }, async (req, reply) => {
    const access = await tierAccess(req.user!);
    return reply.send({
      success: true,
      data: {
        access,
        categories: CATEGORIES,
        reports: REPORTS.map(({ key, category, title, description, tiers, params }) => ({
          key, category, title, description, params, tiers: tiers.filter((t) => access[t]),
        })).filter((r) => r.tiers.length),
      },
    });
  });

  // GET /api/reports/:tier/:key?from=&to=&date=&month=YYYY-MM&clientId=&projectId=
  app.get("/api/reports/:tier/:key", { preHandler: [authenticate] }, async (req, reply) => {
    const { tier, key } = req.params as { tier: string; key: string };
    const q = (req.query ?? {}) as Record<string, string | undefined>;
    const def = BY_KEY.get(key);
    if (!def || !TIERS.includes(tier as Tier) || !def.tiers.includes(tier as Tier)) {
      return reply.code(404).send({ success: false, message: "Report not found." });
    }
    const access = await tierAccess(req.user!);
    if (!access[tier as Tier]) return reply.code(403).send({ success: false, message: "You don't have access to these reports." });

    const today = todayUtc();
    let from: Date, to: Date;
    if (def.params.includes("date")) {
      from = to = parseDay(q.date, today);
    } else if (def.params.includes("month")) {
      const m = (q.month ?? "").match(/^(\d{4})-(\d{2})$/);
      const y = m ? +m[1] : today.getUTCFullYear(), mo = m ? +m[2] - 1 : today.getUTCMonth();
      from = new Date(Date.UTC(y, mo, 1));
      to = new Date(Date.UTC(y, mo + 1, 0));
    } else {
      from = parseDay(q.from, new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
      to = parseDay(q.to, today);
    }
    if (to < from) [from, to] = [to, from];
    if (to.getTime() - from.getTime() > 366 * DAY) {
      return reply.code(400).send({ success: false, message: "Choose a period of one year or less." });
    }

    const emps = await scopeEmployees(req.user!, tier as Tier, def.includeInactive);
    const result = await def.run({ user: req.user!, tier: tier as Tier, emps, from, to, clientId: q.clientId || undefined, projectId: q.projectId || undefined });
    return reply.send({
      success: true,
      data: {
        ...result,
        meta: { key, tier, title: def.title, description: def.description, from: ymd(from), to: ymd(to), people: emps.length, generatedAt: new Date().toISOString() },
      },
    });
  });
}
