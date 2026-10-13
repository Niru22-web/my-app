import {
  type Ctx, type ReportDef, type ScopedEmployee, attendanceDays, attendanceTrackingStart, unpaidLeaveTypes, eachDay, hhmm, holidaysIn, isWeekend, istMinutes, leaveDays, round1, round2, shiftsFor, todayUtc, ymd,
} from "./engine";

// Day codes used across attendance reports (same rules as the Attendance page):
//   P present (≥ 8h) · HD half day (4–8h) · SD short day (< 4h) · A absent (working day, no punch)
//   L leave · HL half-day leave · H firm holiday · WO weekly off · "" future day
export type DayCode = "P" | "HD" | "SD" | "A" | "L" | "HL" | "H" | "WO" | "";
const CODE_LABEL: Record<Exclude<DayCode, "">, string> = {
  P: "Present", HD: "Half day", SD: "Short day", A: "Absent", L: "Leave", HL: "Half-day leave", H: "Holiday", WO: "Weekly off",
};

async function grid(ctx: Ctx) {
  const days = eachDay(ctx.from, ctx.to);
  const [att, lv, hol, trackingStart] = await Promise.all([
    attendanceDays(ctx.emps.map((e) => e.employeeId), ctx.from, ctx.to),
    leaveDays(ctx.emps.map((e) => e.id), ctx.from, ctx.to),
    holidaysIn(ctx.from, ctx.to),
    attendanceTrackingStart(),
  ]);
  const today = todayUtc();
  const startOf = (e: ScopedEmployee) => Math.max(trackingStart?.getTime() ?? today.getTime(), e.doj?.getTime() ?? 0);
  const codeOf = (e: ScopedEmployee, d: Date): DayCode => {
    const k = ymd(d);
    const a = att.get(e.employeeId)?.get(k);
    if (!a && d.getTime() < startOf(e)) return "";
    if (hol.has(k)) return "H";
    if (isWeekend(d)) return a ? hoursCode(a.total_hours) : "WO";
    const l = lv.get(e.id)?.get(k);
    if (l && l.fraction >= 1) return "L";
    if (a) return l ? "HL" : hoursCode(a.total_hours);
    if (l) return "HL";
    return d < today ? "A" : "";
  };
  return { days, att, lv, hol, codeOf, trackingNote: trackingStart && trackingStart > ctx.from ? `Attendance has been recorded in the portal since ${ymd(trackingStart)}; earlier days show no data.` : null };
}
const hoursCode = (h: number): DayCode => (h >= 8 ? "P" : h >= 4 ? "HD" : "SD");
const credit: Partial<Record<DayCode, number>> = { P: 1, HD: 0.5, SD: 0.5, HL: 0.5 };

function summarise(codes: DayCode[]) {
  const c = (x: DayCode) => codes.filter((k) => k === x).length;
  const working = codes.filter((k) => k !== "H" && k !== "WO" && k !== "").length;
  const present = codes.reduce((s, k) => s + (credit[k] ?? 0), 0);
  return { P: c("P"), HD: c("HD"), SD: c("SD"), A: c("A"), L: c("L"), HL: c("HL"), H: c("H"), WO: c("WO"), working, present };
}

export const attendanceReports: ReportDef[] = [
  {
    key: "daily-attendance",
    category: "attendance",
    title: "Daily attendance status",
    description: "Check-in, check-out, hours and status for everyone on a day.",
    tiers: ["team", "org"],
    params: ["date"],
    async run(ctx) {
      const g = await grid(ctx);
      const d = ctx.from;
      const shift = await shiftsFor(ctx.emps);
      const rows = ctx.emps.map((e) => {
        const a = g.att.get(e.employeeId)?.get(ymd(d));
        const code = g.codeOf(e, d);
        return {
          code: e.employeeId, name: e.name,
          status: code ? CODE_LABEL[code] : "Not yet",
          checkIn: a?.check_in_time ? hhmm(istMinutes(a.check_in_time)) : "",
          checkOut: a?.check_out_time ? hhmm(istMinutes(a.check_out_time)) + (a.is_auto_checkout ? " (auto)" : "") : "",
          hours: a ? round2(a.total_hours) : null,
          shift: shift(e)?.name ?? "",
          location: a?.location_name ?? "",
          source: a?.attendance_source ?? "",
        };
      });
      const s = summarise(ctx.emps.map((e) => g.codeOf(e, d)));
      return {
        period: ymd(d),
        kpis: [
          { label: "Present", value: s.P + s.HD + s.SD, format: "number", tone: "good" },
          { label: "Absent", value: s.A, format: "number", tone: s.A ? "bad" : undefined },
          { label: "On leave", value: s.L + s.HL, format: "number" },
          { label: "Not checked out", value: rows.filter((r) => r.checkIn && !r.checkOut).length, format: "number", tone: "warn" },
        ],
        charts: [],
        columns: [
          { key: "code", label: "ID" },
          { key: "name", label: "Name" },
          { key: "status", label: "Status", format: "badge" },
          { key: "checkIn", label: "In" },
          { key: "checkOut", label: "Out" },
          { key: "hours", label: "Hours", format: "hours", align: "right" },
          { key: "location", label: "Location" },
          { key: "source", label: "Source" },
        ],
        rows,
        notes: g.hol.size ? [`Firm holiday: ${[...g.hol.values()][0]}`] : [],
      };
    },
  },
  {
    key: "early-late",
    category: "attendance",
    title: "Early/late check-in and check-out",
    description: "Arrivals after and departures before each person's shift times.",
    tiers: ["my", "team", "org"],
    params: ["range"],
    async run(ctx) {
      const g = await grid(ctx);
      const shift = await shiftsFor(ctx.emps);
      const rows: Record<string, string | number | null>[] = [];
      let late = 0, early = 0;
      for (const e of ctx.emps) {
        const s = shift(e);
        if (!s) continue;
        for (const [k, a] of g.att.get(e.employeeId) ?? []) {
          const inM = a.check_in_time ? istMinutes(a.check_in_time) : null;
          const outM = a.check_out_time && !a.is_auto_checkout ? istMinutes(a.check_out_time) : null;
          const lateBy = inM != null && inM > s.start ? inM - s.start : 0;
          const earlyBy = outM != null && outM < s.end ? s.end - outM : 0;
          if (lateBy) late++;
          if (earlyBy) early++;
          if (lateBy || earlyBy)
            rows.push({ date: k, name: e.name, shift: `${hhmm(s.start)}–${hhmm(s.end)}`, checkIn: inM != null ? hhmm(inM) : "", lateBy: lateBy ? `${lateBy} min` : "", checkOut: outM != null ? hhmm(outM) : "", earlyBy: earlyBy ? `${earlyBy} min` : "" });
        }
      }
      rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      return {
        kpis: [
          { label: "Late check-ins", value: late, format: "number", tone: late ? "warn" : undefined },
          { label: "Early check-outs", value: early, format: "number", tone: early ? "warn" : undefined },
        ],
        charts: [],
        columns: [
          { key: "date", label: "Date", format: "date" },
          { key: "name", label: "Name" },
          { key: "shift", label: "Shift" },
          { key: "checkIn", label: "In" },
          { key: "lateBy", label: "Late by" },
          { key: "checkOut", label: "Out" },
          { key: "earlyBy", label: "Left early by" },
        ],
        rows,
        notes: ["Compared with each person's shift (or the firm's default shift). Automatic check-outs are not counted as early."],
      };
    },
  },
  {
    key: "present-absent",
    category: "attendance",
    title: "Employee present/absent status",
    description: "Present, absent and leave days per person for the period.",
    tiers: ["my", "team", "org"],
    params: ["range"],
    async run(ctx) {
      const g = await grid(ctx);
      const rows = ctx.emps.map((e) => {
        const s = summarise(g.days.map((d) => g.codeOf(e, d)));
        return { code: e.employeeId, name: e.name, working: s.working, present: s.present, absent: s.A, leave: s.L + s.HL * 0.5, rate: s.working ? s.present / s.working : 0 };
      });
      const tot = rows.reduce((a, r) => ({ w: a.w + r.working, p: a.p + r.present, a: a.a + r.absent }), { w: 0, p: 0, a: 0 });
      return {
        kpis: [
          { label: "Attendance rate", value: tot.w ? tot.p / tot.w : 0, format: "percent", tone: "good" },
          { label: "Present days", value: round1(tot.p), format: "number" },
          { label: "Absent days", value: tot.a, format: "number", tone: tot.a ? "bad" : undefined },
        ],
        charts: ctx.tier === "my" ? [] : [{ type: "bar", title: "Attendance rate by person (lowest 15)", xKey: "name", series: [{ key: "pct", label: "Attendance %" }], data: [...rows].sort((a, b) => a.rate - b.rate).slice(0, 15).map((r) => ({ name: r.name, pct: Math.round(r.rate * 100) })) }],
        columns: [
          { key: "code", label: "ID" },
          { key: "name", label: "Name" },
          { key: "working", label: "Working days", format: "number", align: "right" },
          { key: "present", label: "Present", format: "number", align: "right" },
          { key: "absent", label: "Absent", format: "number", align: "right" },
          { key: "leave", label: "Leave", format: "number", align: "right" },
          { key: "rate", label: "Rate", format: "percent", align: "right" },
        ],
        rows,
        notes: [...(g.trackingNote ? [g.trackingNote] : []), "Working days exclude weekly offs and firm holidays. Half and short days count as half a present day."],
      };
    },
  },
  {
    key: "presence-hours",
    category: "attendance",
    title: "Presence hours break-up",
    description: "Hours present each day from check-in sessions.",
    tiers: ["my", "team", "org"],
    params: ["range"],
    async run(ctx) {
      const g = await grid(ctx);
      const byDay = g.days.map((d) => {
        const k = ymd(d);
        const hrs = ctx.emps.reduce((s, e) => s + (g.att.get(e.employeeId)?.get(k)?.total_hours ?? 0), 0);
        return { day: k.slice(5), hours: round2(hrs) };
      });
      const rows = ctx.emps.map((e) => {
        const recs = [...(g.att.get(e.employeeId)?.values() ?? [])];
        const total = recs.reduce((s, a) => s + a.total_hours, 0);
        return { code: e.employeeId, name: e.name, days: recs.length, total: round2(total), avg: recs.length ? round2(total / recs.length) : 0, auto: recs.filter((a) => a.is_auto_checkout).length };
      });
      const total = rows.reduce((s, r) => s + r.total, 0);
      const days = rows.reduce((s, r) => s + r.days, 0);
      return {
        kpis: [
          { label: "Total hours present", value: round1(total), format: "hours" },
          { label: "Average per day", value: days ? round2(total / days) : 0, format: "hours" },
          { label: "Auto check-outs", value: rows.reduce((s, r) => s + r.auto, 0), format: "number", tone: "warn" },
        ],
        charts: [{ type: "bar", title: "Hours present by day", xKey: "day", series: [{ key: "hours", label: "Hours" }], data: byDay }],
        columns: [
          { key: "code", label: "ID" },
          { key: "name", label: "Name" },
          { key: "days", label: "Days with punches", format: "number", align: "right" },
          { key: "total", label: "Total hours", format: "hours", align: "right" },
          { key: "avg", label: "Avg / day", format: "hours", align: "right" },
          { key: "auto", label: "Auto check-outs", format: "number", align: "right" },
        ],
        rows,
      };
    },
  },
  {
    key: "muster-roll",
    category: "attendance",
    title: "Muster roll",
    description: "Day-by-day attendance register for the month (P, A, L, H, WO).",
    tiers: ["team", "org"],
    params: ["month"],
    async run(ctx) {
      const g = await grid(ctx);
      const dayCols = g.days.map((d) => ({ key: ymd(d), label: String(d.getUTCDate()) }));
      const rows = ctx.emps.map((e) => {
        const codes = g.days.map((d) => g.codeOf(e, d));
        const s = summarise(codes);
        return { code: e.employeeId, name: e.name, ...Object.fromEntries(g.days.map((d, i) => [ymd(d), codes[i] || "·"])), present: s.present, absent: s.A, leave: s.L + s.HL * 0.5 };
      });
      return {
        kpis: [{ label: "People", value: rows.length, format: "number" }, { label: "Holidays", value: g.hol.size, format: "number" }],
        charts: [],
        columns: [
          { key: "code", label: "ID" },
          { key: "name", label: "Name" },
          ...dayCols,
          { key: "present", label: "P", format: "number", align: "right" },
          { key: "absent", label: "A", format: "number", align: "right" },
          { key: "leave", label: "L", format: "number", align: "right" },
        ],
        rows,
        notes: [...(g.trackingNote ? [g.trackingNote] : []), "P present · HD half day · SD short day · A absent · L leave · HL half-day leave · H holiday · WO weekly off · · not yet"],
      };
    },
  },
  {
    key: "attendance-payroll",
    category: "attendance",
    title: "Attendance data for payroll",
    description: "Payable days per person for the month: present + paid leave + holidays + weekends.",
    tiers: ["org"],
    params: ["month"],
    async run(ctx) {
      const g = await grid(ctx);
      const unpaidTypes = await unpaidLeaveTypes();
      const rows = ctx.emps.map((e) => {
        let lop = 0, paidLeave = 0;
        for (const d of g.days) {
          const l = g.lv.get(e.id)?.get(ymd(d));
          if (!l || g.hol.has(ymd(d)) || isWeekend(d)) continue;
          if (unpaidTypes.has(l.type.toLowerCase())) lop += l.fraction;
          else paidLeave += l.fraction;
        }
        const s = summarise(g.days.map((d) => g.codeOf(e, d)));
        const calendar = g.days.length;
        const payable = calendar - s.A - lop;
        return { code: e.employeeId, name: e.name, calendar, working: s.working, present: s.present, paidLeave, holidays: s.H, weekends: s.WO, absent: s.A, lop, payable };
      });
      return {
        kpis: [
          { label: "Days in month", value: g.days.length, format: "number" },
          { label: "People with absences", value: rows.filter((r) => r.absent > 0).length, format: "number", tone: "warn" },
          { label: "Total LOP days", value: rows.reduce((s, r) => s + r.lop, 0), format: "number" },
        ],
        charts: [],
        columns: [
          { key: "code", label: "ID" },
          { key: "name", label: "Name" },
          { key: "working", label: "Working days", format: "number", align: "right" },
          { key: "present", label: "Present", format: "number", align: "right" },
          { key: "paidLeave", label: "Paid leave", format: "number", align: "right" },
          { key: "holidays", label: "Holidays", format: "number", align: "right" },
          { key: "absent", label: "Absent", format: "number", align: "right" },
          { key: "lop", label: "LOP leave", format: "number", align: "right" },
          { key: "payable", label: "Payable days", format: "number", align: "right" },
        ],
        rows,
        notes: [...(g.trackingNote ? [g.trackingNote] : []), "Payable days = calendar days − unexplained absences − unpaid leave. Review absences before running payroll: a missing punch shows as absent."],
      };
    },
  },
  {
    key: "consecutive-absences",
    category: "attendance",
    title: "Consecutive absences",
    description: "People absent 3 or more working days in a row without approved leave.",
    tiers: ["team", "org"],
    params: ["range"],
    async run(ctx) {
      const g = await grid(ctx);
      const rows: Record<string, string | number>[] = [];
      for (const e of ctx.emps) {
        let run: Date[] = [];
        const flush = () => {
          if (run.length >= 3) rows.push({ name: e.name, code: e.employeeId, from: ymd(run[0]), to: ymd(run[run.length - 1]), days: run.length });
          run = [];
        };
        for (const d of g.days) {
          const c = g.codeOf(e, d);
          if (c === "A") run.push(d);
          else if (c !== "H" && c !== "WO") flush();
        }
        flush();
      }
      rows.sort((a, b) => Number(b.days) - Number(a.days));
      return {
        kpis: [{ label: "People flagged", value: new Set(rows.map((r) => r.code)).size, format: "number", tone: rows.length ? "bad" : "good" }],
        charts: [],
        columns: [
          { key: "code", label: "ID" },
          { key: "name", label: "Name" },
          { key: "from", label: "From", format: "date" },
          { key: "to", label: "To", format: "date" },
          { key: "days", label: "Working days", format: "number", align: "right" },
        ],
        rows,
        notes: [...(g.trackingNote ? [g.trackingNote] : []), "Weekends and firm holidays inside a run don't break it."],
      };
    },
  },
];
