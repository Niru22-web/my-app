import { prisma } from "../../config/db";
import { currentCalendar } from "../../utils/work-calendar";
import { type Ctx, type ReportDef, eachDay, holidaysIn, isWeekend, leaveDays, round1, round2, ymd } from "./engine";

// Expected hours per working day come from the firm settings (Leave Tracker → Leave policy).
const stdDayHours = () => currentCalendar().standardDayHours;

async function logs(ctx: Ctx) {
  return prisma.timelog.findMany({
    where: {
      employeeId: { in: ctx.emps.map((e) => e.id) },
      date: { gte: ctx.from, lte: new Date(ctx.to.getTime() + 86_399_999) },
      ...(ctx.clientId ? { clientId: ctx.clientId } : {}),
      ...(ctx.projectId ? { projectId: ctx.projectId } : {}),
    },
    select: {
      id: true, date: true, hours: true, description: true, billableStatus: true, submissionStatus: true, employeeId: true, workItem: true,
      job: { select: { id: true, jobId: true, name: true, status: true, project: { select: { id: true, projectId: true, name: true, status: true, client: { select: { id: true, name: true } } } } } },
    },
    orderBy: { date: "desc" },
  });
}
type Log = Awaited<ReturnType<typeof logs>>[number];
const billable = (l: Log) => (l.billableStatus ?? "").toLowerCase() === "billable";
const status = (s: string) => ({ not_submitted: "Draft", draft: "Draft", submitted: "Submitted", approved: "Approved", rejected: "Rejected" })[s.toLowerCase()] ?? s;
function sumBy<K extends string>(ls: Log[], key: (l: Log) => K) {
  const m = new Map<K, { hours: number; billable: number; entries: number; people: Set<string> }>();
  for (const l of ls) {
    const k = key(l);
    const v = m.get(k) ?? { hours: 0, billable: 0, entries: 0, people: new Set<string>() };
    v.hours += l.hours;
    if (billable(l)) v.billable += l.hours;
    v.entries++;
    v.people.add(l.employeeId);
    m.set(k, v);
  }
  return [...m.entries()].sort((a, b) => b[1].hours - a[1].hours);
}
function totalsKpis(ls: Log[]) {
  const hours = ls.reduce((s, l) => s + l.hours, 0);
  const bill = ls.filter(billable).reduce((s, l) => s + l.hours, 0);
  return [
    { label: "Hours logged", value: round1(hours), format: "hours" as const },
    { label: "Billable", value: hours ? bill / hours : 0, format: "percent" as const, hint: `${Math.round(bill).toLocaleString("en-IN")} h billable` },
    { label: "Entries", value: ls.length, format: "number" as const },
    { label: "Awaiting approval", value: round1(ls.filter((l) => /submitted/i.test(l.submissionStatus)).reduce((s, l) => s + l.hours, 0)), format: "hours" as const, tone: "warn" as const },
  ];
}

/** Expected hours per person: 8 h each Mon–Fri, less firm holidays and approved leave. */
async function expectedHours(ctx: Ctx) {
  const [hol, lv] = await Promise.all([holidaysIn(ctx.from, ctx.to), leaveDays(ctx.emps.map((e) => e.id), ctx.from, ctx.to)]);
  const days = eachDay(ctx.from, ctx.to).filter((d) => !isWeekend(d) && !hol.has(ymd(d)));
  return new Map(ctx.emps.map((e) => [e.id, days.filter((d) => !e.doj || d >= e.doj).reduce((s, d) => s + stdDayHours() * (1 - (lv.get(e.id)?.get(ymd(d))?.fraction ?? 0)), 0)]));
}

export const timeReports: ReportDef[] = [
  {
    key: "time-logs",
    category: "time",
    title: "Time Logs",
    description: "Every timesheet entry in the period.",
    tiers: ["my", "team", "org"],
    params: ["range", "client", "project"],
    async run(ctx) {
      const ls = await logs(ctx);
      const names = new Map(ctx.emps.map((e) => [e.id, e.name]));
      const byDay = new Map<string, { billable: number; nonBillable: number }>();
      for (const d of eachDay(ctx.from, ctx.to)) byDay.set(ymd(d), { billable: 0, nonBillable: 0 });
      for (const l of ls) {
        const v = byDay.get(ymd(l.date));
        if (v) billable(l) ? (v.billable += l.hours) : (v.nonBillable += l.hours);
      }
      return {
        kpis: totalsKpis(ls),
        charts: [{ type: "stacked", title: "Hours by day", xKey: "day", series: [{ key: "billable", label: "Billable" }, { key: "nonBillable", label: "Non-billable" }], data: [...byDay.entries()].map(([k, v]) => ({ day: k.slice(5), billable: round2(v.billable), nonBillable: round2(v.nonBillable) })) }],
        columns: [
          { key: "date", label: "Date", format: "date" },
          ...(ctx.tier === "my" ? [] : [{ key: "name", label: "Name" }]),
          { key: "client", label: "Client" },
          { key: "project", label: "Project" },
          { key: "job", label: "Job" },
          { key: "hours", label: "Hours", format: "hours" as const, align: "right" as const },
          { key: "billable", label: "Billable" },
          { key: "status", label: "Status", format: "badge" as const },
          { key: "description", label: "Description" },
        ],
        rows: ls.map((l) => ({
          date: ymd(l.date), name: names.get(l.employeeId) ?? "", client: l.job.project.client.name, project: l.job.project.name, job: l.job.name,
          hours: l.hours, billable: billable(l) ? "Yes" : "No", status: status(l.submissionStatus), description: l.description,
        })),
      };
    },
  },
  {
    key: "jobs-status",
    category: "time",
    title: "Jobs status",
    description: "Hours logged against each job, with its status and team.",
    tiers: ["my", "team", "org"],
    params: ["range", "client", "project"],
    async run(ctx) {
      const ls = await logs(ctx);
      const agg = sumBy(ls, (l) => l.job.id);
      const job = new Map(ls.map((l) => [l.job.id, l.job]));
      return {
        kpis: [{ label: "Jobs worked on", value: agg.length, format: "number" }, ...totalsKpis(ls).slice(0, 2)],
        charts: [{ type: "bar", title: "Top jobs by hours", xKey: "name", series: [{ key: "hours", label: "Hours" }], data: agg.slice(0, 12).map(([id, v]) => ({ name: job.get(id)!.name, hours: round1(v.hours) })) }],
        columns: [
          { key: "jobId", label: "Job ID" },
          { key: "job", label: "Job" },
          { key: "project", label: "Project" },
          { key: "client", label: "Client" },
          { key: "status", label: "Status", format: "badge" },
          { key: "people", label: "People", format: "number", align: "right" },
          { key: "hours", label: "Hours", format: "hours", align: "right" },
          { key: "billable", label: "Billable", format: "hours", align: "right" },
        ],
        rows: agg.map(([id, v]) => {
          const j = job.get(id)!;
          return { jobId: j.jobId, job: j.name, project: j.project.name, client: j.project.client.name, status: j.status, people: v.people.size, hours: round2(v.hours), billable: round2(v.billable) };
        }),
      };
    },
  },
  {
    key: "projects-status",
    category: "time",
    title: "Projects status",
    description: "Hours, billable share and people per project.",
    tiers: ["my", "team", "org"],
    params: ["range", "client"],
    async run(ctx) {
      const ls = await logs(ctx);
      const agg = sumBy(ls, (l) => l.job.project.id);
      const proj = new Map(ls.map((l) => [l.job.project.id, l.job.project]));
      return {
        kpis: [{ label: "Projects worked on", value: agg.length, format: "number" }, ...totalsKpis(ls).slice(0, 2)],
        charts: [{ type: "stacked", title: "Hours by project", xKey: "name", series: [{ key: "billable", label: "Billable" }, { key: "other", label: "Non-billable" }], data: agg.slice(0, 12).map(([id, v]) => ({ name: proj.get(id)!.name, billable: round1(v.billable), other: round1(v.hours - v.billable) })) }],
        columns: [
          { key: "projectId", label: "Project ID" },
          { key: "project", label: "Project" },
          { key: "client", label: "Client" },
          { key: "status", label: "Status", format: "badge" },
          { key: "people", label: "People", format: "number", align: "right" },
          { key: "hours", label: "Hours", format: "hours", align: "right" },
          { key: "share", label: "Billable", format: "percent", align: "right" },
        ],
        rows: agg.map(([id, v]) => {
          const p = proj.get(id)!;
          return { projectId: p.projectId, project: p.name, client: p.client.name, status: p.status, people: v.people.size, hours: round2(v.hours), share: v.hours ? v.billable / v.hours : 0 };
        }),
      };
    },
  },
  {
    key: "client-hours",
    category: "time",
    title: "Logged hours for Clients",
    description: "Total and billable hours per client.",
    tiers: ["org"],
    params: ["range"],
    async run(ctx) {
      const ls = await logs(ctx);
      const agg = sumBy(ls, (l) => l.job.project.client.name);
      return {
        kpis: [{ label: "Clients worked for", value: agg.length, format: "number" }, ...totalsKpis(ls).slice(0, 2)],
        charts: [{ type: "bar", title: "Hours by client", xKey: "name", series: [{ key: "hours", label: "Hours" }], data: agg.slice(0, 15).map(([name, v]) => ({ name, hours: round1(v.hours) })) }],
        columns: [
          { key: "client", label: "Client" },
          { key: "people", label: "People", format: "number", align: "right" },
          { key: "entries", label: "Entries", format: "number", align: "right" },
          { key: "hours", label: "Hours", format: "hours", align: "right" },
          { key: "billable", label: "Billable hours", format: "hours", align: "right" },
          { key: "share", label: "Billable", format: "percent", align: "right" },
        ],
        rows: agg.map(([client, v]) => ({ client, people: v.people.size, entries: v.entries, hours: round2(v.hours), billable: round2(v.billable), share: v.hours ? v.billable / v.hours : 0 })),
      };
    },
  },
  {
    key: "employee-hours",
    category: "time",
    title: "Employee logged hours",
    description: "Hours each person logged, billable vs non-billable.",
    tiers: ["org"],
    params: ["range", "client", "project"],
    async run(ctx) {
      const ls = await logs(ctx);
      const agg = new Map(sumBy(ls, (l) => l.employeeId));
      const rows = ctx.emps.map((e) => {
        const v = agg.get(e.id);
        return { code: e.employeeId, name: e.name, hours: round2(v?.hours ?? 0), billable: round2(v?.billable ?? 0), share: v?.hours ? v.billable / v.hours : 0, entries: v?.entries ?? 0 };
      });
      return {
        kpis: [...totalsKpis(ls).slice(0, 2), { label: "People with no hours", value: rows.filter((r) => !r.hours).length, format: "number", tone: "warn" }],
        charts: [{ type: "stacked", title: "Top 15 by hours", xKey: "name", series: [{ key: "billable", label: "Billable" }, { key: "other", label: "Non-billable" }], data: [...rows].sort((a, b) => b.hours - a.hours).slice(0, 15).map((r) => ({ name: r.name, billable: r.billable, other: round2(r.hours - r.billable) })) }],
        columns: [
          { key: "code", label: "ID" },
          { key: "name", label: "Name" },
          { key: "entries", label: "Entries", format: "number", align: "right" },
          { key: "hours", label: "Hours", format: "hours", align: "right" },
          { key: "billable", label: "Billable", format: "hours", align: "right" },
          { key: "share", label: "Billable %", format: "percent", align: "right" },
        ],
        rows: rows.sort((a, b) => b.hours - a.hours),
      };
    },
  },
  {
    key: "scheduled-vs-worked",
    category: "time",
    title: "Scheduled vs Worked hours",
    description: "Hours logged against the firm’s expected hours per working day, after leave and holidays.",
    tiers: ["my", "team", "org"],
    params: ["range"],
    async run(ctx) {
      const [ls, exp] = await Promise.all([logs(ctx), expectedHours(ctx)]);
      const worked = new Map(sumBy(ls, (l) => l.employeeId));
      const rows = ctx.emps.map((e) => {
        const s = round2(exp.get(e.id) ?? 0), w = round2(worked.get(e.id)?.hours ?? 0);
        return { code: e.employeeId, name: e.name, scheduled: s, worked: w, gap: round2(w - s), pct: s ? w / s : 0 };
      });
      const S = rows.reduce((a, r) => a + r.scheduled, 0), W = rows.reduce((a, r) => a + r.worked, 0);
      return {
        kpis: [
          { label: "Scheduled", value: round1(S), format: "hours" },
          { label: "Worked (logged)", value: round1(W), format: "hours" },
          { label: "Utilisation", value: S ? W / S : 0, format: "percent", tone: S && W / S >= 0.9 ? "good" : "warn" },
          { label: "Below 90%", value: rows.filter((r) => r.scheduled && r.pct < 0.9).length, format: "number", tone: "warn" },
        ],
        charts: ctx.tier === "my" ? [] : [{ type: "bar", title: "Utilisation % (lowest 15)", xKey: "name", series: [{ key: "pct", label: "Utilisation %" }], data: [...rows].filter((r) => r.scheduled).sort((a, b) => a.pct - b.pct).slice(0, 15).map((r) => ({ name: r.name, pct: Math.round(r.pct * 100) })) }],
        columns: [
          { key: "code", label: "ID" },
          { key: "name", label: "Name" },
          { key: "scheduled", label: "Scheduled", format: "hours", align: "right" },
          { key: "worked", label: "Worked", format: "hours", align: "right" },
          { key: "gap", label: "Difference", format: "hours", align: "right" },
          { key: "pct", label: "Utilisation", format: "percent", align: "right" },
        ],
        rows: rows.sort((a, b) => a.pct - b.pct),
        notes: [`Scheduled = ${stdDayHours()} h for each working day from the joining date, less weekly offs, firm holidays and approved leave.`],
      };
    },
  },
  {
    key: "timesheet-payroll",
    category: "time",
    title: "Timesheet data for payroll",
    description: "Approved, pending and draft hours per person for the month.",
    tiers: ["org"],
    params: ["month"],
    async run(ctx) {
      const [ls, exp] = await Promise.all([logs(ctx), expectedHours(ctx)]);
      const rows = ctx.emps.map((e) => {
        const mine = ls.filter((l) => l.employeeId === e.id);
        const h = (re: RegExp) => round2(mine.filter((l) => re.test(l.submissionStatus)).reduce((s, l) => s + l.hours, 0));
        return { code: e.employeeId, name: e.name, expected: round2(exp.get(e.id) ?? 0), approved: h(/approved/i), submitted: h(/submitted/i), draft: h(/not_submitted|draft/i), rejected: h(/rejected/i) };
      });
      return {
        kpis: [
          { label: "Approved hours", value: round1(rows.reduce((s, r) => s + r.approved, 0)), format: "hours", tone: "good" },
          { label: "Pending approval", value: round1(rows.reduce((s, r) => s + r.submitted, 0)), format: "hours", tone: "warn" },
          { label: "Not submitted", value: round1(rows.reduce((s, r) => s + r.draft, 0)), format: "hours" },
        ],
        charts: [],
        columns: [
          { key: "code", label: "ID" },
          { key: "name", label: "Name" },
          { key: "expected", label: "Expected", format: "hours", align: "right" },
          { key: "approved", label: "Approved", format: "hours", align: "right" },
          { key: "submitted", label: "Pending", format: "hours", align: "right" },
          { key: "draft", label: "Draft", format: "hours", align: "right" },
          { key: "rejected", label: "Rejected", format: "hours", align: "right" },
        ],
        rows,
      };
    },
  },
];
