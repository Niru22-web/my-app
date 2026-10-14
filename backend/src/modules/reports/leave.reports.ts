import { prisma } from "../../config/db";
import { computeBalances, leaveYearOf, yearLabel } from "../../utils/leave-policy";
import { getWorkCalendar } from "../../utils/work-calendar";
import { type ReportDef, todayUtc, unpaidLeaveTypes, eachDay, holidaysIn, isWeekend, leaveDays, round2, ymd } from "./engine";

async function leavesInRange(ids: string[], from: Date, to: Date) {
  return prisma.leave.findMany({
    where: { employeeId: { in: ids }, fromDate: { lte: to }, toDate: { gte: from } },
    select: { leaveId: true, employeeId: true, type: true, fromDate: true, toDate: true, duration: true, totalDays: true, status: true, reason: true, appliedDate: true },
    orderBy: { fromDate: "desc" },
  });
}
const statusLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

export const leaveReports: ReportDef[] = [
  {
    key: "daily-leave-status",
    category: "leave",
    title: "Daily leave status",
    description: "Who is on approved leave on a given day.",
    tiers: ["org", "team"],
    params: ["date"],
    async run(ctx) {
      const day = ctx.from;
      const [map, hol] = await Promise.all([leaveDays(ctx.emps.map((e) => e.id), day, day), holidaysIn(day, day)]);
      const onLeave = ctx.emps.filter((e) => map.get(e.id)?.has(ymd(day)));
      const notes = hol.size ? [`${ymd(day)} is a firm holiday: ${[...hol.values()][0]}.`] : isWeekend(day) ? [`${ymd(day)} is a weekend.`] : [];
      return {
        period: ymd(day),
        kpis: [
          { label: "On leave", value: onLeave.length, format: "number" },
          { label: "Available", value: ctx.emps.length - onLeave.length, format: "number", tone: "good" },
          { label: "Half day", value: onLeave.filter((e) => map.get(e.id)!.get(ymd(day))!.fraction < 1).length, format: "number" },
        ],
        charts: [],
        columns: [
          { key: "code", label: "ID" },
          { key: "name", label: "Name" },
          { key: "type", label: "Leave type" },
          { key: "portion", label: "Portion" },
        ],
        rows: onLeave.map((e) => {
          const l = map.get(e.id)!.get(ymd(day))!;
          return { code: e.employeeId, name: e.name, type: l.type, portion: l.fraction < 1 ? "Half day" : "Full day" };
        }),
        notes,
      };
    },
  },
  {
    key: "resource-availability",
    category: "leave",
    title: "Resource availability",
    description: "People available each working day after approved leave and holidays.",
    tiers: ["org", "team"],
    params: ["range"],
    async run(ctx) {
      const days = eachDay(ctx.from, ctx.to);
      const [map, hol] = await Promise.all([leaveDays(ctx.emps.map((e) => e.id), ctx.from, ctx.to), holidaysIn(ctx.from, ctx.to)]);
      const data = days
        .filter((d) => !isWeekend(d))
        .map((d) => {
          const k = ymd(d);
          const away = hol.has(k) ? ctx.emps.length : ctx.emps.reduce((s, e) => s + (map.get(e.id)?.get(k)?.fraction ?? 0), 0);
          return { day: k.slice(5), date: k, available: round2(ctx.emps.length - away), onLeave: hol.has(k) ? 0 : round2(away), holiday: hol.get(k) ?? "" };
        });
      const workDays = data.filter((d) => !d.holiday);
      const avg = workDays.length ? workDays.reduce((s, d) => s + d.available, 0) / workDays.length : 0;
      return {
        kpis: [
          { label: "People in scope", value: ctx.emps.length, format: "number" },
          { label: "Average available / day", value: round2(avg), format: "number" },
          { label: "Leave days taken", value: round2(workDays.reduce((s, d) => s + d.onLeave, 0)), format: "number" },
          { label: "Holidays in period", value: data.filter((d) => d.holiday).length, format: "number" },
        ],
        charts: [{ type: "stacked", title: "Availability by day", xKey: "day", series: [{ key: "available", label: "Available" }, { key: "onLeave", label: "On leave" }], data }],
        columns: [
          { key: "date", label: "Date", format: "date" },
          { key: "available", label: "Available", format: "number", align: "right" },
          { key: "onLeave", label: "On leave", format: "number", align: "right" },
          { key: "holiday", label: "Holiday" },
        ],
        rows: data,
      };
    },
  },
  {
    key: "leave-balance",
    category: "leave",
    title: "Employee leave balance",
    description: "Leave entitlement, used and remaining for the year.",
    tiers: ["my", "team", "org"],
    params: [],
    async run(ctx) {
      const cal = await getWorkCalendar();
      const year = leaveYearOf(todayUtc(), cal.leaveYearStartMonth);
      const { balances, types } = await computeBalances(ctx.emps.map((e) => e.id), year);
      const shown = types.filter((t) => t.active && t.paid);
      const rows = ctx.emps.map((e) => {
        const list = balances.get(e.id) ?? [];
        const by = (id: string) => list.find((b) => b.leaveTypeId === id);
        return {
          code: e.employeeId,
          name: e.name,
          ...Object.fromEntries(shown.flatMap((t) => [[`${t.code}_avail`, by(t.id)?.available ?? null], [`${t.code}_used`, by(t.id)?.used ?? null]])),
        };
      });
      const total = (code: string, k: "avail" | "used") => rows.reduce((s, r) => s + Number((r as Record<string, unknown>)[`${code}_${k}`] ?? 0), 0);
      return {
        period: yearLabel(year, cal.leaveYearStartMonth),
        kpis: shown.flatMap((t) => [
          { label: `${t.name} available`, value: Math.round(total(t.code, "avail") * 100) / 100, format: "number" as const, tone: "good" as const },
          { label: `${t.name} used`, value: Math.round(total(t.code, "used") * 100) / 100, format: "number" as const },
        ]),
        charts: [],
        columns: [
          { key: "code", label: "ID" },
          { key: "name", label: "Name" },
          ...shown.flatMap((t) => [
            { key: `${t.code}_avail`, label: `${t.code} available`, format: "number" as const, align: "right" as const },
            { key: `${t.code}_used`, label: `${t.code} used`, format: "number" as const, align: "right" as const },
          ]),
        ],
        rows,
        notes: shown.length
          ? [`Leave year ${yearLabel(year, cal.leaveYearStartMonth)}. Available = opening + accrued to date + adjustments − approved leave.`]
          : ["No paid leave types are set up yet (Leave Tracker → Leave policy)."],
      };
    },
  },
  {
    key: "leave-booked",
    category: "leave",
    title: "Leave booked and balance",
    description: "Every leave application in the period with its status.",
    tiers: ["my", "team", "org"],
    params: ["range"],
    async run(ctx) {
      const names = new Map(ctx.emps.map((e) => [e.id, e]));
      const ls = await leavesInRange([...names.keys()], ctx.from, ctx.to);
      const by = (s: string) => ls.filter((l) => l.status.toLowerCase() === s).reduce((a, l) => a + l.totalDays, 0);
      return {
        kpis: [
          { label: "Approved days", value: by("approved"), format: "number", tone: "good" },
          { label: "Pending days", value: by("pending"), format: "number", tone: by("pending") ? "warn" : undefined },
          { label: "Rejected days", value: by("rejected"), format: "number" },
          { label: "Applications", value: ls.length, format: "number" },
        ],
        charts: [],
        columns: [
          { key: "name", label: "Name" },
          { key: "type", label: "Type" },
          { key: "from", label: "From", format: "date" },
          { key: "to", label: "To", format: "date" },
          { key: "days", label: "Days", format: "number", align: "right" },
          { key: "status", label: "Status", format: "badge" },
          { key: "reason", label: "Reason" },
        ],
        rows: ls.map((l) => ({
          name: names.get(l.employeeId)?.name ?? "", type: l.type, from: ymd(l.fromDate), to: ymd(l.toDate),
          days: l.totalDays, status: statusLabel(l.status), reason: l.reason,
        })),
      };
    },
  },
  {
    key: "leave-type-summary",
    category: "leave",
    title: "Leave type wise summary",
    description: "Approved leave days by type, per person.",
    tiers: ["team", "org"],
    params: ["range"],
    async run(ctx) {
      const map = await leaveDays(ctx.emps.map((e) => e.id), ctx.from, ctx.to);
      const hol = await holidaysIn(ctx.from, ctx.to);
      const types = new Set<string>();
      const rows = ctx.emps
        .map((e) => {
          const counts: Record<string, number> = {};
          for (const [k, v] of map.get(e.id) ?? []) {
            if (hol.has(k) || isWeekend(new Date(`${k}T00:00:00Z`))) continue;
            types.add(v.type);
            counts[v.type] = (counts[v.type] ?? 0) + v.fraction;
          }
          return { name: e.name, ...counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
        })
        .filter((r) => r.total > 0)
        .sort((a, b) => b.total - a.total);
      const t = [...types];
      const daysOf = (type: string) => rows.reduce((s, r) => s + Number((r as Record<string, unknown>)[type] ?? 0), 0);
      return {
        kpis: t.map((type) => ({ label: type, value: daysOf(type), format: "number" as const })),
        charts: [{ type: "pie", title: "Days by leave type", xKey: "name", series: [{ key: "value", label: "Days" }], data: t.map((type) => ({ name: type, value: daysOf(type) })) }],
        columns: [{ key: "name", label: "Name" }, ...t.map((k) => ({ key: k, label: k, format: "number" as const, align: "right" as const })), { key: "total", label: "Total", format: "number", align: "right" }],
        rows,
        notes: ["Working days only — weekly offs and firm holidays inside a leave are not counted."],
      };
    },
  },
  {
    key: "leave-payroll",
    category: "leave",
    title: "Leave data for payroll",
    description: "Paid and unpaid (loss of pay) leave days per person for the month.",
    tiers: ["org"],
    params: ["month"],
    async run(ctx) {
      const map = await leaveDays(ctx.emps.map((e) => e.id), ctx.from, ctx.to);
      const hol = await holidaysIn(ctx.from, ctx.to);
      const unpaidTypes = await unpaidLeaveTypes();
      const rows = ctx.emps.map((e) => {
        let paid = 0, unpaid = 0;
        for (const [k, v] of map.get(e.id) ?? []) {
          if (hol.has(k) || isWeekend(new Date(`${k}T00:00:00Z`))) continue;
          if (unpaidTypes.has(v.type.toLowerCase())) unpaid += v.fraction;
          else paid += v.fraction;
        }
        return { code: e.employeeId, name: e.name, paid, unpaid, total: paid + unpaid };
      });
      return {
        kpis: [
          { label: "Paid leave days", value: rows.reduce((s, r) => s + r.paid, 0), format: "number" },
          { label: "Loss of pay days", value: rows.reduce((s, r) => s + r.unpaid, 0), format: "number", tone: "warn" },
          { label: "People with LOP", value: rows.filter((r) => r.unpaid > 0).length, format: "number" },
        ],
        charts: [],
        columns: [
          { key: "code", label: "ID" },
          { key: "name", label: "Name" },
          { key: "paid", label: "Paid leave", format: "number", align: "right" },
          { key: "unpaid", label: "Loss of pay", format: "number", align: "right" },
          { key: "total", label: "Total", format: "number", align: "right" },
        ],
        rows,
        notes: ["Loss of pay = approved leave of a type marked unpaid in the leave policy. Weekly offs and firm holidays are excluded."],
      };
    },
  },
];
