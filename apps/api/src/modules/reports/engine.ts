import { prisma } from "../../config/db";
import { ACCOUNTS_ROLES, normRole, type JwtUser } from "../../plugins/auth";

// ── Tiers ────────────────────────────────────────────────────────────────────
// my   — the signed-in person only (everyone)
// team — everyone who reports to them, directly or further down (managers, partners)
// org  — the whole firm (Admin/Owner/HR/IT/Accounts by default; Admin can grant or remove
//        per person with the "Analytics" view permission in Users & Access)
export type Tier = "my" | "team" | "org";
export const TIERS: Tier[] = ["my", "team", "org"];

const ORG_ROLES = new Set(["admin", "owner", "hr", "it", ...ACCOUNTS_ROLES]);

export interface ScopedEmployee {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  designation: string;
  department: string;
  role: string;
  status: string;
  partnerId: string | null;
  managerId: string | null;
  shiftId: string | null;
  createdAt: Date;
  doj: Date | null;
}

export async function tierAccess(user: JwtUser): Promise<Record<Tier, boolean>> {
  const r = normRole(user.role);
  if (r === "admin" || r === "owner") return { my: true, team: true, org: true };

  const [userPerm, rolePerm, reportee] = await Promise.all([
    prisma.userPermission.findUnique({ where: { userId: user.id }, select: { reportsView: true, analyticsView: true } }),
    prisma.rolePermission.findFirst({ where: { role: { equals: user.role, mode: "insensitive" } }, select: { reportsView: true, analyticsView: true } }),
    prisma.employee.findFirst({ where: teamWhere(user.id), select: { id: true } }),
  ]);
  // User-level permissions replace role-level ones entirely (portal rule).
  // My Reports only ever shows the person's own data, so it is always available.
  const reportsView = userPerm ? userPerm.reportsView : rolePerm ? rolePerm.reportsView : true;
  const orgView = userPerm ? userPerm.analyticsView : ORG_ROLES.has(r) || !!rolePerm?.analyticsView;
  return { my: true, team: reportsView && !!reportee, org: orgView };
}

function teamWhere(leadId: string) {
  return {
    id: { not: leadId },
    OR: [
      { managerId: leadId },
      { partnerId: leadId },
      { subManagerId: leadId },
      { reportingManagerIds: { has: leadId } },
      { reportingPartnerIds: { has: leadId } },
      { subManagerIds: { has: leadId } },
      { managers: { some: { managerId: leadId } } },
      { partners: { some: { partnerId: leadId } } },
    ],
  };
}

const EMP_SELECT = {
  id: true, employeeId: true, firstName: true, lastName: true, officeEmail: true, designation: true,
  department: true, role: true, status: true, partnerId: true, managerId: true, shiftId: true, createdAt: true,
  profile: { select: { doj: true } },
} as const;

function toScoped(e: {
  id: string; employeeId: string; firstName: string; lastName: string; officeEmail: string; designation: string;
  department: string; role: string; status: string; partnerId: string | null; managerId: string | null; shiftId: string | null; createdAt: Date;
  profile: { doj: Date } | null;
}): ScopedEmployee {
  return {
    id: e.id, employeeId: e.employeeId, name: `${e.firstName} ${e.lastName ?? ""}`.trim(), email: e.officeEmail,
    designation: e.designation, department: e.department, role: e.role, status: e.status,
    partnerId: e.partnerId, managerId: e.managerId, shiftId: e.shiftId, createdAt: e.createdAt, doj: e.profile?.doj ?? null,
  };
}

/** Employees in scope for a tier. Test/system accounts on @asa-local.test are excluded from team/org views. */
export async function scopeEmployees(user: JwtUser, tier: Tier, includeInactive = false): Promise<ScopedEmployee[]> {
  const statusFilter = includeInactive ? {} : { status: { equals: "active", mode: "insensitive" as const } };
  if (tier === "my") {
    const me = await prisma.employee.findUnique({ where: { id: user.id }, select: EMP_SELECT });
    return me ? [toScoped(me)] : [];
  }
  if (tier === "org") {
    const all = await prisma.employee.findMany({
      where: { ...statusFilter, NOT: { officeEmail: { endsWith: "@asa-local.test" } } },
      select: EMP_SELECT,
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });
    return all.map(toScoped);
  }
  // team: walk the reporting tree downwards
  const seen = new Set<string>([user.id]);
  const out: ScopedEmployee[] = [];
  let frontier = [user.id];
  for (let depth = 0; depth < 8 && frontier.length; depth++) {
    const next = await prisma.employee.findMany({
      where: { ...statusFilter, OR: frontier.flatMap((id) => teamWhere(id).OR), id: { notIn: [...seen] } },
      select: EMP_SELECT,
    });
    frontier = [];
    for (const e of next) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      frontier.push(e.id);
      out.push(toScoped(e));
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ── Dates (all report dates are calendar days, stored as UTC midnight) ───────
export const DAY = 86_400_000;
export const ymd = (d: Date) => d.toISOString().slice(0, 10);
export function parseDay(s: string | undefined, fallback: Date): Date {
  const m = (s ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : fallback;
}
export function todayUtc(): Date {
  // IST calendar day
  const ist = new Date(Date.now() + 330 * 60_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}
export function eachDay(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  for (let t = from.getTime(); t <= to.getTime() && out.length < 400; t += DAY) out.push(new Date(t));
  return out;
}
export const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;
/** Minutes after IST midnight for a stored timestamp. */
export const istMinutes = (t: Date) => {
  const ist = new Date(t.getTime() + 330 * 60_000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
};
export const hhmm = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
export const parseHHMM = (s: string) => {
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  return m ? +m[1] * 60 + +m[2] : null;
};
export const monthLabel = (d: Date) => d.toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });

/** Firm holidays (calendar events of type Holiday) in a range, keyed by YYYY-MM-DD. */
export async function holidaysIn(from: Date, to: Date): Promise<Map<string, string>> {
  const rows = await prisma.event.findMany({ where: { type: "Holiday", date: { gte: from, lte: to } }, select: { date: true, title: true } });
  return new Map(rows.map((r) => [ymd(r.date), r.title]));
}

/** Approved leave per employee per day: Map<employeeUuid, Map<ymd, {type, fraction}>> */
export async function leaveDays(employeeIds: string[], from: Date, to: Date) {
  const rows = await prisma.leave.findMany({
    where: { employeeId: { in: employeeIds }, status: { equals: "approved", mode: "insensitive" }, fromDate: { lte: to }, toDate: { gte: from } },
    select: { employeeId: true, type: true, fromDate: true, toDate: true, duration: true },
  });
  const out = new Map<string, Map<string, { type: string; fraction: number }>>();
  for (const l of rows) {
    const half = /half/i.test(l.duration);
    const start = new Date(Date.UTC(l.fromDate.getUTCFullYear(), l.fromDate.getUTCMonth(), l.fromDate.getUTCDate()));
    const end = new Date(Date.UTC(l.toDate.getUTCFullYear(), l.toDate.getUTCMonth(), l.toDate.getUTCDate()));
    for (const d of eachDay(start < from ? from : start, end > to ? to : end)) {
      if (!out.has(l.employeeId)) out.set(l.employeeId, new Map());
      out.get(l.employeeId)!.set(ymd(d), { type: l.type, fraction: half ? 0.5 : 1 });
    }
  }
  return out;
}

/** Attendance rows per employee code per day. */
export async function attendanceDays(codes: string[], from: Date, to: Date) {
  const rows = await prisma.attendance.findMany({
    where: { employee_id: { in: codes }, date: { gte: from, lte: to } },
    select: { employee_id: true, date: true, status: true, total_hours: true, check_in_time: true, check_out_time: true, location_name: true, attendance_source: true, is_auto_checkout: true },
  });
  const out = new Map<string, Map<string, (typeof rows)[number]>>();
  for (const r of rows) {
    if (!out.has(r.employee_id)) out.set(r.employee_id, new Map());
    out.get(r.employee_id)!.set(ymd(r.date), r);
  }
  return out;
}

/**
 * First day attendance was recorded in the portal at all. Before this (and before a person's
 * joining date) a missing punch is "no data", never "absent".
 */
export async function attendanceTrackingStart(): Promise<Date | null> {
  const first = await prisma.attendance.findFirst({ orderBy: { date: "asc" }, select: { date: true } });
  return first?.date ?? null;
}

/** Each employee's shift (their own, else the firm's first active shift). */
export async function shiftsFor(emps: ScopedEmployee[]) {
  const shifts = await prisma.shiftMaster.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
  const byId = new Map(shifts.map((s) => [s.id, s]));
  const fallback = shifts[0] ?? null;
  return (e: ScopedEmployee) => {
    const s = (e.shiftId && byId.get(e.shiftId)) || fallback;
    if (!s) return null;
    const start = parseHHMM(s.startTime), end = parseHHMM(s.endTime);
    return start != null && end != null ? { name: s.name, start, end } : null;
  };
}

// ── Result shape (rendered generically by the web app) ──────────────────────
export type Fmt = "text" | "number" | "hours" | "percent" | "date" | "currency" | "badge";
export interface Kpi { label: string; value: number | string; format?: Fmt; hint?: string; tone?: "good" | "warn" | "bad" }
export interface Chart {
  type: "bar" | "stacked" | "line" | "pie";
  title: string;
  xKey: string;
  series: { key: string; label: string }[];
  data: Record<string, string | number>[];
}
export interface Column { key: string; label: string; format?: Fmt; align?: "right" }
export interface ReportResult {
  kpis: Kpi[];
  charts: Chart[];
  columns: Column[];
  rows: Record<string, string | number | null>[];
  notes?: string[];
  period?: string;
}

export interface Ctx {
  user: JwtUser;
  tier: Tier;
  emps: ScopedEmployee[];
  from: Date;
  to: Date;
  clientId?: string;
  projectId?: string;
}

export type Category = "employee" | "leave" | "attendance" | "time";
export type Param = "range" | "date" | "month" | "client" | "project";
export interface ReportDef {
  key: string;
  category: Category;
  title: string;
  description: string;
  tiers: Tier[];
  params: Param[];
  includeInactive?: boolean;
  run(ctx: Ctx): Promise<ReportResult>;
}

export const tally = <T>(items: T[], key: (t: T) => string) => {
  const m = new Map<string, number>();
  for (const i of items) m.set(key(i), (m.get(key(i)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
export const round1 = (n: number) => Math.round(n * 10) / 10;
export const round2 = (n: number) => Math.round(n * 100) / 100;
