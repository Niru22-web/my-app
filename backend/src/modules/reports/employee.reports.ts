import { prisma } from "../../config/db";
import { type Ctx, type ReportDef, type ScopedEmployee, DAY, monthLabel, round1, tally, todayUtc, ymd } from "./engine";

async function profilesOf(emps: ScopedEmployee[]) {
  const rows = await prisma.employeeProfile.findMany({
    where: { employeeId: { in: emps.map((e) => e.id) } },
    select: { employeeId: true, dob: true, doj: true, gender: true, employmentType: true },
  });
  return new Map(rows.map((r) => [r.employeeId, r]));
}

async function namesOf(ids: (string | null)[]) {
  const list = [...new Set(ids.filter(Boolean) as string[])];
  const rows = await prisma.employee.findMany({ where: { id: { in: list } }, select: { id: true, firstName: true, lastName: true } });
  return new Map(rows.map((r) => [r.id, `${r.firstName} ${r.lastName ?? ""}`.trim()]));
}

const yearsBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / (365.25 * DAY);
function band(years: number, edges: number[], unit: string) {
  for (let i = 0; i < edges.length; i++) if (years < edges[i]) return i === 0 ? `Under ${edges[0]} ${unit}` : `${edges[i - 1]}–${edges[i]} ${unit}`;
  return `${edges[edges.length - 1]}+ ${unit}`;
}
const TENURE = [1, 2, 5, 10];
const AGE = [25, 30, 40, 50];
const toPie = (t: [string, number][]) => t.map(([name, value]) => ({ name, value }));

async function baseRows(ctx: Ctx) {
  const [prof, names] = await Promise.all([profilesOf(ctx.emps), namesOf(ctx.emps.flatMap((e) => [e.partnerId, e.managerId]))]);
  const now = todayUtc();
  return ctx.emps.map((e) => {
    const p = prof.get(e.id);
    return {
      e,
      p,
      partner: (e.partnerId && names.get(e.partnerId)) || "Not set",
      manager: (e.managerId && names.get(e.managerId)) || "Not set",
      tenure: p?.doj ? yearsBetween(p.doj, now) : null,
      age: p?.dob ? yearsBetween(p.dob, now) : null,
    };
  });
}

export const employeeReports: ReportDef[] = [
  {
    key: "employee-dashboard",
    category: "employee",
    title: "Dashboard",
    description: "Headcount, joiners, gender mix and partner groups at a glance.",
    tiers: ["org"],
    params: [],
    async run(ctx) {
      const rows = await baseRows(ctx);
      const now = todayUtc();
      const fyStart = new Date(Date.UTC(now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1, 3, 1));
      const joinedFy = rows.filter((r) => r.p?.doj && r.p.doj >= fyStart).length;
      const joined90 = rows.filter((r) => r.p?.doj && now.getTime() - r.p.doj.getTime() <= 90 * DAY).length;
      const withTenure = rows.filter((r) => r.tenure != null);
      const avgTenure = withTenure.length ? withTenure.reduce((s, r) => s + r.tenure!, 0) / withTenure.length : 0;
      const missing = rows.filter((r) => !r.p).length;
      return {
        kpis: [
          { label: "Active employees", value: rows.length, format: "number" },
          { label: "Joined this financial year", value: joinedFy, format: "number", hint: `Since ${fyStart.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}` },
          { label: "Joined in last 90 days", value: joined90, format: "number" },
          { label: "Average tenure", value: `${round1(avgTenure)} yrs`, hint: `${withTenure.length} with a joining date` },
          ...(missing ? [{ label: "Profiles incomplete", value: missing, format: "number" as const, tone: "warn" as const, hint: "No joining date / date of birth" }] : []),
        ],
        charts: [
          { type: "pie", title: "Gender", xKey: "name", series: [{ key: "value", label: "People" }], data: toPie(tally(rows, (r) => r.p?.gender || "Not recorded")) },
          { type: "bar", title: "By partner group", xKey: "name", series: [{ key: "value", label: "People" }], data: toPie(tally(rows, (r) => r.partner)) },
          { type: "bar", title: "By role", xKey: "name", series: [{ key: "value", label: "People" }], data: toPie(tally(rows, (r) => r.e.role)) },
          { type: "bar", title: "Tenure", xKey: "name", series: [{ key: "value", label: "People" }], data: toPie(tally(withTenure, (r) => band(r.tenure!, TENURE, "yrs"))) },
        ],
        columns: [
          { key: "group", label: "Partner group" },
          { key: "count", label: "People", format: "number", align: "right" },
          { key: "managers", label: "Managers", format: "number", align: "right" },
          { key: "share", label: "Share", format: "percent", align: "right" },
        ],
        rows: tally(rows, (r) => r.partner).map(([group, count]) => ({
          group,
          count,
          managers: rows.filter((r) => r.partner === group && /manager/i.test(r.e.role)).length,
          share: rows.length ? count / rows.length : 0,
        })),
      };
    },
  },
  {
    key: "headcount",
    category: "employee",
    title: "Headcount",
    description: "Everyone in scope with role, designation, reporting lines and joining date.",
    tiers: ["org", "team"],
    params: [],
    async run(ctx) {
      const rows = await baseRows(ctx);
      return {
        kpis: [
          { label: "Headcount", value: rows.length, format: "number" },
          { label: "Partner groups", value: new Set(rows.map((r) => r.partner)).size, format: "number" },
          { label: "Managers", value: rows.filter((r) => /manager/i.test(r.e.role)).length, format: "number" },
          { label: "No reporting manager", value: rows.filter((r) => r.manager === "Not set").length, format: "number", tone: rows.some((r) => r.manager === "Not set") ? "warn" : undefined },
        ],
        charts: [{ type: "bar", title: "By designation", xKey: "name", series: [{ key: "value", label: "People" }], data: toPie(tally(rows, (r) => r.e.designation || "Not set")) }],
        columns: [
          { key: "code", label: "ID" },
          { key: "name", label: "Name" },
          { key: "designation", label: "Designation" },
          { key: "role", label: "Role" },
          { key: "partner", label: "Partner" },
          { key: "manager", label: "Reporting manager" },
          { key: "doj", label: "Joined", format: "date" },
        ],
        rows: rows.map((r) => ({
          code: r.e.employeeId, name: r.e.name, designation: r.e.designation, role: r.e.role,
          partner: r.partner, manager: r.manager, doj: r.p?.doj ? ymd(r.p.doj) : null,
        })),
      };
    },
  },
  {
    key: "addition-trend",
    category: "employee",
    title: "Employee addition trend",
    description: "People who joined each month, from their joining dates.",
    tiers: ["org"],
    params: ["range"],
    async run(ctx) {
      const rows = (await baseRows(ctx)).filter((r) => r.p?.doj && r.p.doj >= ctx.from && r.p.doj <= ctx.to);
      const months = new Map<string, number>();
      for (let d = new Date(Date.UTC(ctx.from.getUTCFullYear(), ctx.from.getUTCMonth(), 1)); d <= ctx.to; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)))
        months.set(monthLabel(d), 0);
      for (const r of rows) months.set(monthLabel(r.p!.doj), (months.get(monthLabel(r.p!.doj)) ?? 0) + 1);
      return {
        kpis: [
          { label: "Joined in period", value: rows.length, format: "number" },
          { label: "Busiest month", value: [...months.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—" },
        ],
        charts: [{ type: "bar", title: "Joiners per month", xKey: "month", series: [{ key: "joined", label: "Joined" }], data: [...months.entries()].map(([month, joined]) => ({ month, joined })) }],
        columns: [
          { key: "doj", label: "Joined", format: "date" },
          { key: "name", label: "Name" },
          { key: "designation", label: "Designation" },
          { key: "partner", label: "Partner" },
          { key: "type", label: "Employment type" },
        ],
        rows: rows
          .sort((a, b) => b.p!.doj.getTime() - a.p!.doj.getTime())
          .map((r) => ({ doj: ymd(r.p!.doj), name: r.e.name, designation: r.e.designation, partner: r.partner, type: r.p?.employmentType ?? "Not set" })),
        notes: ["Only employees with a joining date on their profile are counted."],
      };
    },
  },
  {
    key: "distribution",
    category: "employee",
    title: "Distribution",
    description: "How people are spread across partner groups, roles, designations and employment types.",
    tiers: ["org", "team"],
    params: [],
    async run(ctx) {
      const rows = await baseRows(ctx);
      const dims: [string, (r: (typeof rows)[number]) => string][] = [
        ["Partner group", (r) => r.partner],
        ["Role", (r) => r.e.role],
        ["Designation", (r) => r.e.designation || "Not set"],
        ["Employment type", (r) => r.p?.employmentType || "Not set"],
        ["Department", (r) => r.e.department || "Not set"],
      ];
      return {
        kpis: [{ label: "People", value: rows.length, format: "number" }],
        charts: dims.slice(0, 4).map(([title, f]) => ({ type: "bar" as const, title, xKey: "name", series: [{ key: "value", label: "People" }], data: toPie(tally(rows, f)) })),
        columns: [
          { key: "dimension", label: "Dimension" },
          { key: "value", label: "Value" },
          { key: "count", label: "People", format: "number", align: "right" },
          { key: "share", label: "Share", format: "percent", align: "right" },
        ],
        rows: dims.flatMap(([dimension, f]) => tally(rows, f).map(([value, count]) => ({ dimension, value, count, share: rows.length ? count / rows.length : 0 }))),
      };
    },
  },
  {
    key: "diversity",
    category: "employee",
    title: "Diversity",
    description: "Gender and age mix, overall and by partner group.",
    tiers: ["org", "team"],
    params: [],
    async run(ctx) {
      const rows = await baseRows(ctx);
      const genders = [...new Set(rows.map((r) => r.p?.gender || "Not recorded"))];
      const groups = tally(rows, (r) => r.partner).map(([g]) => g);
      const women = rows.filter((r) => r.p?.gender === "Female").length;
      const recorded = rows.filter((r) => r.p?.gender).length;
      const ages = rows.filter((r) => r.age != null);
      return {
        kpis: [
          { label: "Women", value: recorded ? women / recorded : 0, format: "percent", hint: `${women} of ${recorded} with gender recorded` },
          { label: "Median age", value: ages.length ? `${Math.round(ages.map((r) => r.age!).sort((a, b) => a - b)[Math.floor(ages.length / 2)])} yrs` : "—" },
          { label: "Gender not recorded", value: rows.length - recorded, format: "number", tone: rows.length - recorded ? "warn" : undefined },
        ],
        charts: [
          { type: "pie", title: "Gender", xKey: "name", series: [{ key: "value", label: "People" }], data: toPie(tally(rows, (r) => r.p?.gender || "Not recorded")) },
          { type: "bar", title: "Age bands", xKey: "name", series: [{ key: "value", label: "People" }], data: toPie(tally(ages, (r) => band(r.age!, AGE, "yrs"))) },
          {
            type: "stacked", title: "Gender by partner group", xKey: "group",
            series: genders.map((g) => ({ key: g, label: g })),
            data: groups.map((group) => Object.fromEntries([["group", group], ...genders.map((g) => [g, rows.filter((r) => r.partner === group && (r.p?.gender || "Not recorded") === g).length])])),
          },
        ],
        columns: [{ key: "group", label: "Partner group" }, ...genders.map((g) => ({ key: g, label: g, format: "number" as const, align: "right" as const })), { key: "total", label: "Total", format: "number", align: "right" }],
        rows: groups.map((group) => {
          const inG = rows.filter((r) => r.partner === group);
          return { group, ...Object.fromEntries(genders.map((g) => [g, inG.filter((r) => (r.p?.gender || "Not recorded") === g).length])), total: inG.length };
        }),
      };
    },
  },
  {
    key: "profile-completeness",
    category: "employee",
    title: "Profile completeness",
    description: "Who is missing joining date, date of birth, PAN, Aadhaar or bank details — needed before payroll.",
    tiers: ["org", "team"],
    params: [],
    async run(ctx) {
      const prof = await prisma.employeeProfile.findMany({
        where: { employeeId: { in: ctx.emps.map((e) => e.id) } },
        select: { employeeId: true, doj: true, dob: true, pan: true, aadhaar: true, bankAccountNumber: true, ifscCode: true, emergencyContactPhone: true },
      });
      const byId = new Map(prof.map((p) => [p.employeeId, p]));
      const checks: [string, (p: (typeof prof)[number] | undefined) => boolean][] = [
        ["Profile", (p) => !!p],
        ["PAN", (p) => !!p?.pan],
        ["Aadhaar", (p) => !!p?.aadhaar],
        ["Bank account", (p) => !!p?.bankAccountNumber && !!p?.ifscCode],
        ["Emergency contact", (p) => !!p?.emergencyContactPhone],
      ];
      const rows = ctx.emps.map((e) => {
        const p = byId.get(e.id);
        const missing = checks.filter(([, ok]) => !ok(p)).map(([n]) => n);
        return { code: e.employeeId, name: e.name, designation: e.designation, missing: missing.join(", ") || "Complete", score: (checks.length - missing.length) / checks.length };
      });
      return {
        kpis: [
          { label: "Complete profiles", value: rows.filter((r) => r.score === 1).length, format: "number", tone: "good" },
          ...checks.map(([n, ok]) => ({ label: `Missing ${n.toLowerCase()}`, value: ctx.emps.filter((e) => !ok(byId.get(e.id))).length, format: "number" as const, tone: "warn" as const })),
        ],
        charts: [],
        columns: [
          { key: "code", label: "ID" },
          { key: "name", label: "Name" },
          { key: "designation", label: "Designation" },
          { key: "score", label: "Complete", format: "percent", align: "right" },
          { key: "missing", label: "Missing" },
        ],
        rows: rows.sort((a, b) => a.score - b.score),
      };
    },
  },
];
