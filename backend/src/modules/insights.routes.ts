import type { FastifyInstance, FastifyRequest } from "fastify";
import { prisma } from "../config/db";
import { authenticate, normRole, reportingTreeIds, type JwtUser } from "../plugins/auth";
import { istToday, statusContext, ymdOf } from "../utils/attendance-policy";
import { getWorkCalendar, isOffDay } from "../utils/work-calendar";
import { computeBalances, leaveYearOf } from "../utils/leave-policy";
import { approvalContext, approversFor, powerOver } from "../utils/leave-approval";

/**
 * Role dashboards.
 *   GET /api/insights/partner?partnerId&period  — a partner's (or manager's) team and client work
 *   GET /api/insights/hr                         — firm-wide people view for HR / Admin / Owner
 * Every figure is computed from records; nothing is estimated.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const DAY = 86_400_000;
const PERIODS = ["month", "last-month", "quarter", "fy"] as const;
type Period = (typeof PERIODS)[number];

/** Period bounds (UTC dates, inclusive) in the Indian financial calendar. */
function periodBounds(p: Period, today: Date) {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  if (p === "last-month") return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 0)), label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }) };
  if (p === "quarter") {
    // FY quarters: Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar
    const qStart = m - (((m - 3) % 3) + 3) % 3;
    const from = new Date(Date.UTC(y, qStart, 1));
    const fy = m >= 3 ? y : y - 1;
    const qn = Math.floor(((m - 3 + 12) % 12) / 3) + 1;
    return { from, to: today, label: `Q${qn} FY ${fy}-${String((fy + 1) % 100).padStart(2, "0")}` };
  }
  if (p === "fy") {
    const fy = m >= 3 ? y : y - 1;
    return { from: new Date(Date.UTC(fy, 3, 1)), to: today, label: `FY ${fy}-${String((fy + 1) % 100).padStart(2, "0")}` };
  }
  return { from: new Date(Date.UTC(y, m, 1)), to: today, label: today.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }) };
}

/** Monday of the week containing `d` (UTC). */
const monday = (d: Date) => new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY);

const name = (e: { firstName: string; lastName: string | null }) => `${e.firstName} ${e.lastName ?? ""}`.trim();
const isPartnerish = (r: string) => ["partner", "owner", "admin"].includes(r);

/** Today's attendance for a set of people: who is in, late, on leave, not in yet, absent. */
async function attendanceToday(people: { id: string; employeeId: string; shiftId: string | null; firstName: string; lastName: string | null }[]) {
  const today = istToday();
  const ctx = await statusContext(today, today, people.map((p) => p.id));
  const rows = await prisma.attendance.findMany({ where: { date: today, employee_id: { in: people.map((p) => p.employeeId) } } });
  const byCode = new Map(rows.map((r) => [r.employee_id, r]));
  const out = { present: 0, late: 0, onLeave: 0, notIn: 0, offDay: false, holiday: null as string | null, lateList: [] as { name: string; minutes: number }[], leaveList: [] as string[] };
  for (const p of people) {
    const c = ctx.classify(p, today, byCode.get(p.employeeId) ?? null);
    if (c.holidayName) out.holiday = c.holidayName;
    if (c.computedStatus === "Weekly off" || c.computedStatus === "Holiday") {
      out.offDay = true;
      continue;
    }
    if (c.computedStatus === "On leave") {
      out.onLeave++;
      out.leaveList.push(name(p));
    } else if (c.computedStatus === "Late") {
      out.late++;
      out.lateList.push({ name: name(p), minutes: c.lateMinutes });
    } else if (c.computedStatus === "Present" || c.computedStatus === "Half day" || c.computedStatus === "Missing check-out") out.present++;
    else out.notIn++;
  }
  out.lateList.sort((a, b) => b.minutes - a.minutes);
  return out;
}

/** Last full week (Mon–Sun): logged vs expected hours per person, leave and holidays excluded. */
async function lastWeekCompliance(people: { id: string; firstName: string; lastName: string | null }[]) {
  const cal = await getWorkCalendar();
  const thisMon = monday(istToday());
  const from = new Date(thisMon.getTime() - 7 * DAY);
  const to = new Date(thisMon.getTime() - DAY);
  const ids = people.map((p) => p.id);
  const [logs, holidays, leaves] = await Promise.all([
    prisma.timelog.groupBy({ by: ["employeeId"], where: { employeeId: { in: ids }, date: { gte: from, lte: new Date(to.getTime() + DAY - 1) } }, _sum: { hours: true } }),
    prisma.event.findMany({ where: { type: "Holiday", date: { gte: from, lte: to } }, select: { date: true } }),
    prisma.leave.findMany({ where: { employeeId: { in: ids }, status: { equals: "approved", mode: "insensitive" }, fromDate: { lte: to }, toDate: { gte: from } }, select: { employeeId: true, fromDate: true, toDate: true, duration: true } }),
  ]);
  const hol = new Set(holidays.map((h) => ymdOf(h.date)));
  const working: string[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += DAY) {
    const d = new Date(t);
    if (!isOffDay(d, cal) && !hol.has(ymdOf(d))) working.push(ymdOf(d));
  }
  const logged = new Map(logs.map((l) => [l.employeeId, l._sum.hours ?? 0]));
  const rows = people.map((p) => {
    let leaveDays = 0;
    for (const l of leaves.filter((x) => x.employeeId === p.id)) {
      for (const d of working) if (d >= ymdOf(l.fromDate) && d <= ymdOf(l.toDate)) leaveDays += /half/i.test(l.duration) ? 0.5 : 1;
    }
    const expected = Math.max(0, (working.length - leaveDays) * cal.standardDayHours);
    const hours = r2(logged.get(p.id) ?? 0);
    return { id: p.id, name: name(p), hours, expected: r2(expected), pct: expected ? Math.round((hours / expected) * 100) : 100 };
  });
  return {
    week: { from: ymdOf(from), to: ymdOf(to) },
    compliant: rows.filter((r) => r.pct >= 100).length,
    partial: rows.filter((r) => r.pct > 0 && r.pct < 100).length,
    none: rows.filter((r) => r.hours === 0 && r.expected > 0).length,
    shortfall: rows.filter((r) => r.pct < 100).sort((a, b) => a.pct - b.pct).slice(0, 8),
    total: rows.length,
  };
}

/** What the viewer can act on right now, across modules. */
export async function myQueue(u: JwtUser, tree: string[]) {
  const [leaves, claims, timesheets, corrections] = await Promise.all([
    prisma.leave.findMany({ where: { status: { equals: "pending", mode: "insensitive" }, employeeId: { not: u.id } }, select: { id: true, employeeId: true } }),
    prisma.reimbursement.findMany({ where: { status: { in: ["PENDING_MANAGER", "MANAGER_APPROVED", "PENDING_PARTNER"] }, employeeId: { not: u.id } }, select: { id: true, employeeId: true, status: true } }),
    prisma.timelog.count({ where: { submissionStatus: "submitted", employeeId: { in: tree } } }),
    prisma.attendanceRegularization.count({ where: { status: "PENDING", employeeId: { in: tree } } }),
  ]);
  const ctx = await approvalContext(u, leaves);
  const leaveCount = leaves.filter((l) => ctx.power(l)).length;
  const r = normRole(u.role);
  const treeSet = new Set(tree);
  const approvers = await approversFor([...new Set(claims.map((c) => c.employeeId))]);
  const asLead = { ...u, role: r === "hr" ? "employee" : u.role };
  const claimCount = claims.filter((c) => (r === "admin" || r === "owner" ? true : powerOver(asLead, c.employeeId, 2, approvers.get(c.employeeId), c.status !== "PENDING_MANAGER", treeSet))).length;
  return { leaves: leaveCount, claims: claimCount, timesheets, corrections };
}

const PEOPLE_SELECT = { id: true, employeeId: true, firstName: true, lastName: true, shiftId: true, designation: true, department: true } as const;

export async function insightsRoutes(app: FastifyInstance) {
  // ── Partner / team lead ─────────────────────────────────────────────────────
  app.get("/api/insights/partner", { preHandler: [authenticate] }, async (req: FastifyRequest, reply) => {
    const u = req.user!;
    const r = normRole(u.role);
    const q = (req.query ?? {}) as { partnerId?: string; period?: string };
    // Admin / Owner can look at any partner; everyone else sees their own team.
    let leadId = u.id;
    if (q.partnerId && q.partnerId !== u.id) {
      if (!["admin", "owner"].includes(r)) return reply.code(403).send({ success: false, message: "You can only see your own team." });
      leadId = q.partnerId;
    }
    const lead = await prisma.employee.findUnique({ where: { id: leadId }, select: { id: true, firstName: true, lastName: true, role: true, designation: true } });
    if (!lead) return reply.code(404).send({ success: false, message: "Person not found." });
    const tree = await reportingTreeIds(leadId, true);
    if (!tree.length && !isPartnerish(normRole(lead.role))) return reply.code(403).send({ success: false, message: "Nobody reports to you, so there is no team dashboard." });

    const period: Period = PERIODS.includes(q.period as Period) ? (q.period as Period) : "month";
    const today = istToday();
    const { from, to, label } = periodBounds(period, today);
    const toEnd = new Date(to.getTime() + DAY - 1);

    const people = await prisma.employee.findMany({ where: { id: { in: tree } }, select: PEOPLE_SELECT, orderBy: { firstName: "asc" } });

    // Clients: where the lead is the engagement partner (client or project), plus clients the team worked on.
    const [ownClients, ownProjects, teamLogs] = await Promise.all([
      prisma.client.findMany({ where: { partnerId: leadId }, select: { id: true } }),
      prisma.project.findMany({ where: { partnerId: leadId }, select: { clientId: true } }),
      prisma.timelog.findMany({
        where: { employeeId: { in: tree }, date: { gte: from, lte: toEnd } },
        select: { hours: true, billableStatus: true, clientId: true, employeeId: true, date: true },
      }),
    ]);
    const engaged = new Set([...ownClients.map((c) => c.id), ...ownProjects.map((p) => p.clientId)]);
    const clientIds = [...new Set([...engaged, ...teamLogs.map((l) => l.clientId)])];

    // Hours by client (team's time) and by person
    const byClient = new Map<string, { hours: number; billable: number }>();
    const byPerson = new Map<string, { hours: number; billable: number }>();
    let total = 0;
    let billable = 0;
    for (const l of teamLogs) {
      const b = l.billableStatus === "billable" ? l.hours : 0;
      total += l.hours;
      billable += b;
      const c = byClient.get(l.clientId) ?? { hours: 0, billable: 0 };
      c.hours += l.hours;
      c.billable += b;
      byClient.set(l.clientId, c);
      const p = byPerson.get(l.employeeId) ?? { hours: 0, billable: 0 };
      p.hours += l.hours;
      p.billable += b;
      byPerson.set(l.employeeId, p);
    }
    const clientRows = await prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true, alias: true, clientId: true } });
    const clientName = new Map(clientRows.map((c) => [c.id, c.alias || c.name]));

    // 8-week trend (team), independent of the period filter
    const trendFrom = new Date(monday(today).getTime() - 7 * 7 * DAY);
    const trendLogs = await prisma.timelog.findMany({ where: { employeeId: { in: tree }, date: { gte: trendFrom } }, select: { hours: true, billableStatus: true, date: true } });
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const s = new Date(trendFrom.getTime() + i * 7 * DAY);
      return { week: ymdOf(s), billable: 0, nonBillable: 0 };
    });
    for (const l of trendLogs) {
      const i = Math.floor((monday(l.date).getTime() - trendFrom.getTime()) / (7 * DAY));
      if (i < 0 || i > 7) continue;
      if (l.billableStatus === "billable") weeks[i].billable += l.hours;
      else weeks[i].nonBillable += l.hours;
    }

    // Projects of these clients that are past their end date but still open
    const overdueProjects = await prisma.project.findMany({
      where: { clientId: { in: [...engaged] }, status: { in: ["Active", "Started", "On Hold"] }, endDate: { lt: today } },
      select: { id: true, name: true, projectId: true, endDate: true, client: { select: { name: true, alias: true } } },
      orderBy: { endDate: "asc" },
      take: 8,
    });
    const activeProjects = await prisma.project.count({ where: { clientId: { in: clientIds }, status: { in: ["Active", "Started"] } } });

    // Receivables for these clients (issued invoices still open), in INR
    const invoices = clientIds.length
      ? await prisma.invoice.findMany({
          where: { clientId: { in: clientIds }, status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } },
          select: { id: true, totalAmount: true, exchangeRate: true, dueDate: true, clientId: true, receiptAllocations: { select: { amountAllocated: true } } },
        })
      : [];
    const credits = invoices.length ? await prisma.creditNote.groupBy({ by: ["invoiceId"], where: { invoiceId: { in: invoices.map((i) => i.id) }, status: "ISSUED" }, _sum: { total: true } }) : [];
    let outstanding = 0;
    let overdue = 0;
    for (const inv of invoices) {
      const due = Math.max(0, inv.totalAmount - inv.receiptAllocations.reduce((s, a) => s + a.amountAllocated, 0) - (credits.find((c) => c.invoiceId === inv.id)?._sum.total ?? 0)) * (inv.exchangeRate || 1);
      outstanding += due;
      if (inv.dueDate && inv.dueDate < today) overdue += due;
    }

    const [att, comp, queue] = await Promise.all([attendanceToday(people), lastWeekCompliance(people), leadId === u.id ? myQueue(u, tree) : Promise.resolve(null)]);
    const upcomingLeave = await prisma.leave.findMany({
      where: { employeeId: { in: tree }, status: { equals: "approved", mode: "insensitive" }, fromDate: { gt: today, lte: new Date(today.getTime() + 14 * DAY) } },
      select: { fromDate: true, toDate: true, type: true, totalDays: true, employee: { select: { firstName: true, lastName: true } } },
      orderBy: { fromDate: "asc" },
      take: 8,
    });

    return reply.send({
      success: true,
      data: {
        lead: { id: lead.id, name: name(lead), role: lead.role, designation: lead.designation },
        period: { key: period, from: ymdOf(from), to: ymdOf(to), label },
        team: { size: people.length, today: att, compliance: comp, upcomingLeave: upcomingLeave.map((l) => ({ name: name(l.employee), from: ymdOf(l.fromDate), to: ymdOf(l.toDate), type: l.type, days: l.totalDays })) },
        queue,
        work: {
          hours: r2(total),
          billableHours: r2(billable),
          billablePct: total ? Math.round((billable / total) * 100) : null,
          clients: clientIds.length,
          engagedClients: engaged.size,
          activeProjects,
          byClient: [...byClient.entries()]
            .map(([id, v]) => ({ id, name: clientName.get(id) ?? "—", hours: r2(v.hours), billable: r2(v.billable) }))
            .sort((a, b) => b.hours - a.hours)
            .slice(0, 8),
          byPerson: people
            .map((p) => ({ id: p.id, name: name(p), designation: p.designation, hours: r2(byPerson.get(p.id)?.hours ?? 0), billable: r2(byPerson.get(p.id)?.billable ?? 0) }))
            .sort((a, b) => b.hours - a.hours),
          trend: weeks.map((w) => ({ ...w, billable: r2(w.billable), nonBillable: r2(w.nonBillable) })),
          overdueProjects: overdueProjects.map((p) => ({ id: p.id, name: p.name, code: p.projectId, client: p.client.alias || p.client.name, endDate: p.endDate ? ymdOf(p.endDate) : null })),
        },
        receivables: { outstanding: r2(outstanding), overdue: r2(overdue), invoices: invoices.length },
      },
    });
  });

  // List of partners (for Admin / Owner's picker)
  app.get("/api/insights/partners", { preHandler: [authenticate] }, async (req, reply) => {
    if (!["admin", "owner"].includes(normRole(req.user!.role))) return reply.code(403).send({ success: false, message: "Only Admin and Owner can switch between partners." });
    const rows = await prisma.employee.findMany({
      where: { status: { equals: "active", mode: "insensitive" }, role: { in: ["Partner", "partner", "Owner", "owner"] } },
      select: { id: true, firstName: true, lastName: true, role: true },
      orderBy: { firstName: "asc" },
    });
    return reply.send({ success: true, data: rows.map((p) => ({ id: p.id, name: name(p), role: p.role })) });
  });

  // ── HR ──────────────────────────────────────────────────────────────────────
  app.get("/api/insights/hr", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    if (!["admin", "owner", "hr"].includes(normRole(u.role))) return reply.code(403).send({ success: false, message: "The HR dashboard is for HR, Admin and Owner." });
    const today = istToday();
    const cal = await getWorkCalendar();
    const notTest = { NOT: { officeEmail: { endsWith: "@asa-local.test" } } };

    const [active, invited, pendingApproval, profiles, exits, completedExits] = await Promise.all([
      prisma.employee.findMany({ where: { status: { equals: "active", mode: "insensitive" }, ...notTest }, select: PEOPLE_SELECT }),
      prisma.employee.count({ where: { status: { equals: "invited", mode: "insensitive" }, ...notTest } }),
      prisma.employee.count({ where: { approvalStatus: "PENDING", status: { equals: "pending", mode: "insensitive" }, ...notTest } }),
      prisma.employeeProfile.findMany({ select: { employeeId: true, dob: true, doj: true, gender: true } }),
      prisma.employeeExit.findMany({ where: { status: { in: ["INITIATED", "IN_PROGRESS"] } }, select: { employeeId: true, lastWorkingDay: true, exitType: true } }),
      prisma.employeeExit.findMany({ where: { status: "COMPLETED" }, select: { lastWorkingDay: true, completedAt: true } }),
    ]);
    const activeIds = new Set(active.map((a) => a.id));
    const prof = new Map(profiles.filter((p) => activeIds.has(p.employeeId)).map((p) => [p.employeeId, p]));
    const byId = new Map(active.map((a) => [a.id, a]));

    // Headcount by department
    const dept = new Map<string, number>();
    for (const a of active) dept.set(a.department || "General", (dept.get(a.department || "General") ?? 0) + 1);
    const desig = new Map<string, number>();
    for (const a of active) desig.set(a.designation || "Not set", (desig.get(a.designation || "Not set") ?? 0) + 1);

    // Joiners (date of joining) in the last 30 days; joiners vs leavers over 12 months
    const joinedRecently = [...prof.values()].filter((p) => p.doj && p.doj <= today && p.doj >= new Date(today.getTime() - 30 * DAY));
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11 + i, 1));
      return { month: ymdOf(d).slice(0, 7), joiners: 0, leavers: 0 };
    });
    const monthIdx = new Map(months.map((m, i) => [m.month, i]));
    for (const p of profiles) {
      const i = p.doj ? monthIdx.get(ymdOf(p.doj).slice(0, 7)) : undefined;
      if (i !== undefined) months[i].joiners++;
    }
    for (const x of completedExits) {
      const i = monthIdx.get(ymdOf(x.lastWorkingDay).slice(0, 7));
      if (i !== undefined) months[i].leavers++;
    }
    const fyStart = new Date(Date.UTC(today.getUTCMonth() >= 3 ? today.getUTCFullYear() : today.getUTCFullYear() - 1, 3, 1));
    const leftThisFy = completedExits.filter((x) => x.lastWorkingDay >= fyStart).length;

    // Birthdays and work anniversaries in the next 30 days
    const soon = (d: Date | null) => {
      if (!d) return null;
      for (let k = 0; k <= 30; k++) {
        const t = new Date(today.getTime() + k * DAY);
        if (t.getUTCMonth() === d.getUTCMonth() && t.getUTCDate() === d.getUTCDate()) return k;
      }
      return null;
    };
    const celebrations: { name: string; kind: "Birthday" | "Work anniversary"; inDays: number; years?: number; date: string }[] = [];
    for (const [id, p] of prof) {
      const e = byId.get(id)!;
      const b = soon(p.dob);
      if (b !== null) celebrations.push({ name: name(e), kind: "Birthday", inDays: b, date: ymdOf(new Date(today.getTime() + b * DAY)) });
      const a = soon(p.doj);
      if (a !== null && p.doj) {
        const years = new Date(today.getTime() + a * DAY).getUTCFullYear() - p.doj.getUTCFullYear();
        if (years >= 1) celebrations.push({ name: name(e), kind: "Work anniversary", inDays: a, years, date: ymdOf(new Date(today.getTime() + a * DAY)) });
      }
    }
    celebrations.sort((x, y) => x.inDays - y.inDays);

    // Leave
    const [pendingLeaves, upcomingLeaves, corrections] = await Promise.all([
      prisma.leave.count({ where: { status: { equals: "pending", mode: "insensitive" } } }),
      prisma.leave.count({ where: { status: { equals: "approved", mode: "insensitive" }, fromDate: { gt: today, lte: new Date(today.getTime() + 7 * DAY) } } }),
      prisma.attendanceRegularization.count({ where: { status: "PENDING" } }),
    ]);
    const { balances } = await computeBalances([...activeIds], leaveYearOf(today, cal.leaveYearStartMonth));
    let negative = 0;
    for (const list of balances.values()) if (list.some((b) => b.paid && b.available < 0)) negative++;

    // Documents (same rules as the checklist screen)
    const docRes = await app.inject({ method: "GET", url: "/api/hr/document-checklist/summary", headers: { authorization: req.headers.authorization ?? "" } });
    let documents: { missingPeople: number; awaiting: number; complete: number; requirements: number } | null = null;
    if (docRes.statusCode === 200) {
      const raw = (JSON.parse(docRes.body) as { data: { requirements: number; rows: { employee: { id: string }; mandatoryMissing: number; awaiting: number }[] } }).data;
      // Same people as the rest of this page: active, real staff.
      const d = { requirements: raw.requirements, rows: raw.rows.filter((x) => activeIds.has(x.employee.id)) };
      documents = {
        requirements: d.requirements,
        missingPeople: d.rows.filter((x) => x.mandatoryMissing > 0).length,
        awaiting: d.rows.reduce((s, x) => s + x.awaiting, 0),
        complete: d.rows.filter((x) => x.mandatoryMissing === 0 && x.awaiting === 0).length,
      };
    }

    const [att, comp] = await Promise.all([attendanceToday(active), lastWeekCompliance(active)]);
    const exitRows = exits
      .map((x) => ({ name: byId.get(x.employeeId) ? name(byId.get(x.employeeId)!) : "—", type: x.exitType, lastDay: ymdOf(x.lastWorkingDay), inDays: Math.round((x.lastWorkingDay.getTime() - today.getTime()) / DAY) }))
      .sort((a, b) => a.inDays - b.inDays);

    return reply.send({
      success: true,
      data: {
        headcount: {
          active: active.length,
          invited,
          pendingApproval,
          joinedLast30: joinedRecently.length,
          byDepartment: [...dept.entries()].map(([k, v]) => ({ name: k, count: v })).sort((a, b) => b.count - a.count),
          byDesignation: [...desig.entries()].map(([k, v]) => ({ name: k, count: v })).sort((a, b) => b.count - a.count),
          missingProfile: active.filter((a) => !prof.has(a.id)).length,
        },
        movement: { months, leftThisFy, exitsInProgress: exits.length, leavingIn30: exitRows.filter((x) => x.inDays >= 0 && x.inDays <= 30).length, exits: exitRows.slice(0, 8) },
        today: att,
        leave: { pending: pendingLeaves, upcoming7: upcomingLeaves, negative },
        corrections,
        documents,
        compliance: comp,
        celebrations: celebrations.slice(0, 12),
      },
    });
  });
}
