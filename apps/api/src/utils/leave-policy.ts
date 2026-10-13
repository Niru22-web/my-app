import type { LeaveType } from "@prisma/client";
import { prisma } from "../config/db";
import { getWorkCalendar, isOffDay } from "./work-calendar";

// ── Leave rules engine ───────────────────────────────────────────────────────
// Entitlements come from LeaveType settings that HR maintains. Nothing is assumed:
// a type without `annualDays` has no automatic entitlement.
//
// available = opening + accrued − used − encashed − lapsed + adjusted
//   opening   carried forward / imported opening balance (LeaveTypeBalance)
//   accrued   computed from the type's rule and the person's joining date
//   used      computed from APPROVED leave of that type (so it can never drift)
//   adjusted  HR adjustments (comp-off credits, corrections) — every change is in LeaveLedger

const DAY = 86_400_000;
export const ymd = (d: Date) => d.toISOString().slice(0, 10);
const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getLeaveSettings() {
  const cal = await getWorkCalendar();
  return { yearStartMonth: cal.leaveYearStartMonth, accrualFrom: cal.leaveAccrualFrom, configured: cal.configured };
}

/** Leave year containing `d`, named by the calendar year it starts in. */
export function leaveYearOf(d: Date, startMonth: number) {
  return d.getUTCMonth() + 1 >= startMonth ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}
export function yearBounds(year: number, startMonth: number) {
  const start = new Date(Date.UTC(year, startMonth - 1, 1));
  const end = new Date(Date.UTC(year + 1, startMonth - 1, 1) - DAY);
  return { start, end };
}
export function yearLabel(year: number, startMonth: number) {
  return startMonth === 1 ? String(year) : `${year}–${String(year + 1).slice(2)}`;
}

export async function holidaySet(from: Date, to: Date): Promise<Set<string>> {
  const rows = await prisma.event.findMany({ where: { type: "Holiday", date: { gte: from, lte: to } }, select: { date: true } });
  return new Set(rows.map((r) => ymd(r.date)));
}

export const isHalfDay = (duration: string | null | undefined) => /half/i.test(duration ?? "");

/** Days a leave consumes between `from` and `to`, optionally clipped to [clipFrom, clipTo]. */
export function countLeaveDays(
  from: Date,
  to: Date,
  opts: { halfDay: boolean; countNonWorkingDays: boolean; holidays: Set<string>; clipFrom?: Date; clipTo?: Date },
) {
  const a = utcDay(opts.clipFrom && opts.clipFrom > from ? opts.clipFrom : from);
  const b = utcDay(opts.clipTo && opts.clipTo < to ? opts.clipTo : to);
  let days = 0;
  for (let t = a.getTime(); t <= b.getTime(); t += DAY) {
    const d = new Date(t);
    if (!opts.countNonWorkingDays && (isOffDay(d) || opts.holidays.has(ymd(d)))) continue;
    days += 1;
  }
  return opts.halfDay ? Math.min(days, 1) * 0.5 : days;
}

/** Entitlement accrued for `year` up to `asOf` (inclusive). */
export function accruedFor(type: LeaveType, doj: Date | null, year: number, startMonth: number, asOf: Date, accrualFrom: Date | null = null) {
  if (type.annualDays == null || type.annualDays <= 0) return 0;
  const { start, end } = yearBounds(year, startMonth);
  if (doj && doj > end) return 0;
  // Joiners earn from their joining month (from the next month if they joined after the 15th).
  // With "prorate" off, a yearly entitlement is credited in full whatever the joining date.
  let firstMonth: Date | null = null;
  if (doj && doj > start && (type.prorateOnJoining || type.accrual === "monthly")) {
    firstMonth = new Date(Date.UTC(doj.getUTCFullYear(), doj.getUTCMonth() + (doj.getUTCDate() > 15 ? 1 : 0), 1));
  }
  let credits = 0;
  for (let i = 0; i < 12; i++) {
    const monthStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    if (firstMonth && monthStart < firstMonth) continue;
    // Nothing accrues before the leave rules started in the portal (earlier balances are opening balances).
    if (accrualFrom && monthStart < new Date(Date.UTC(accrualFrom.getUTCFullYear(), accrualFrom.getUTCMonth(), 1))) continue;
    if (type.accrual === "monthly" && monthStart > asOf) continue;
    credits += 1;
  }
  return round2((type.annualDays * credits) / 12);
}

export interface TypeBalance {
  leaveTypeId: string;
  code: string;
  name: string;
  paid: boolean;
  /** Full-year entitlement (null = no fixed entitlement) */
  entitled: number | null;
  accrued: number;
  opening: number;
  adjusted: number;
  used: number;
  pending: number;
  encashed: number;
  lapsed: number;
  available: number;
  closed: boolean;
}

interface Person { id: string; doj: Date | null; gender: string | null }

/**
 * Balances for many people at once. `asOf` controls monthly accrual (defaults to today, clipped to the year).
 * Unknown legacy leave types (not in leave_types) are ignored.
 */
export async function computeBalances(employeeIds: string[], year: number, asOf?: Date) {
  const { yearStartMonth, accrualFrom } = await getLeaveSettings();
  const { start, end } = yearBounds(year, yearStartMonth);
  const today = utcDay(new Date(Date.now() + 330 * 60_000));
  const at = asOf ?? (today < start ? start : today > end ? end : today);

  const [types, people, rows, leaves, holidays] = await Promise.all([
    prisma.leaveType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, profile: { select: { doj: true, gender: true } } } }),
    prisma.leaveTypeBalance.findMany({ where: { employeeId: { in: employeeIds }, year } }),
    prisma.leave.findMany({
      where: { employeeId: { in: employeeIds }, status: { in: ["approved", "Approved", "pending", "Pending"] }, fromDate: { lte: end }, toDate: { gte: start } },
      select: { employeeId: true, type: true, fromDate: true, toDate: true, duration: true, status: true },
    }),
    holidaySet(start, end),
  ]);
  const typeByName = new Map(types.map((t) => [t.name.toLowerCase(), t]));
  const person = new Map<string, Person>(people.map((p) => [p.id, { id: p.id, doj: p.profile?.doj ?? null, gender: p.profile?.gender ?? null }]));
  const stored = new Map(rows.map((r) => [`${r.employeeId}|${r.leaveTypeId}`, r]));
  const usage = new Map<string, { used: number; pending: number }>();
  for (const l of leaves) {
    const t = typeByName.get(l.type.toLowerCase());
    if (!t) continue;
    const k = `${l.employeeId}|${t.id}`;
    const days = countLeaveDays(l.fromDate, l.toDate, { halfDay: isHalfDay(l.duration), countNonWorkingDays: t.countNonWorkingDays, holidays, clipFrom: start, clipTo: end });
    const u = usage.get(k) ?? { used: 0, pending: 0 };
    if (l.status.toLowerCase() === "approved") u.used += days;
    else u.pending += days;
    usage.set(k, u);
  }

  const out = new Map<string, TypeBalance[]>();
  for (const id of employeeIds) {
    const p = person.get(id) ?? { id, doj: null, gender: null };
    out.set(
      id,
      types
        .filter((t) => appliesTo(t, p))
        .map((t) => {
          const s = stored.get(`${id}|${t.id}`);
          const u = usage.get(`${id}|${t.id}`) ?? { used: 0, pending: 0 };
          const accrued = accruedFor(t, p.doj, year, yearStartMonth, at, accrualFrom);
          const b = {
            leaveTypeId: t.id, code: t.code, name: t.name, paid: t.paid,
            entitled: t.annualDays == null ? null : accruedFor(t, p.doj, year, yearStartMonth, end, accrualFrom),
            accrued, opening: s?.opening ?? 0, adjusted: s?.adjusted ?? 0, used: round2(u.used), pending: round2(u.pending),
            encashed: s?.encashed ?? 0, lapsed: s?.lapsed ?? 0, available: 0, closed: !!s?.closedAt,
          };
          b.available = round2(b.opening + b.accrued + b.adjusted - b.used - b.encashed - b.lapsed);
          return b;
        }),
    );
  }
  return { types, balances: out, year, yearStartMonth, start, end };
}

export function appliesTo(t: LeaveType, p: { gender: string | null }) {
  if (t.gender === "all") return true;
  return (p.gender ?? "").toLowerCase() === t.gender;
}

export interface Check { days: number; available: number | null; errors: string[]; warnings: string[]; type: LeaveType | null }

/**
 * Validates a leave request against the rules and returns the server-computed day count.
 * Unknown types are rejected once leave types have been set up; until then the request
 * passes with its own working-day count (legacy behaviour, no balance check).
 */
export async function checkRequest(input: {
  employeeId: string; type: string; fromDate: Date; toDate: Date; duration: string; excludeLeaveId?: string; forApproval?: boolean;
}): Promise<Check> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const types = await prisma.leaveType.findMany();
  const t = types.find((x) => x.name.toLowerCase() === input.type.toLowerCase()) ?? null;
  const half = isHalfDay(input.duration);
  const holidays = await holidaySet(input.fromDate, input.toDate);
  await getWorkCalendar();

  if (input.toDate < input.fromDate) errors.push("The end date is before the start date.");
  if (half && ymd(input.fromDate) !== ymd(input.toDate)) errors.push("A half day must start and end on the same date.");

  if (!t) {
    if (types.length) errors.push(`“${input.type}” isn’t a leave type. Choose one from the list.`);
    const days = countLeaveDays(input.fromDate, input.toDate, { halfDay: half, countNonWorkingDays: false, holidays });
    if (days <= 0) errors.push("These dates are all weekly offs or firm holidays.");
    return { days, available: null, errors, warnings, type: null };
  }

  const days = countLeaveDays(input.fromDate, input.toDate, { halfDay: half, countNonWorkingDays: t.countNonWorkingDays, holidays });
  if (days <= 0) errors.push("These dates are all weekly offs or firm holidays — no leave is needed.");
  if (!t.active) errors.push(`${t.name} is no longer available.`);
  if (half && !t.allowHalfDay) errors.push(`${t.name} can’t be taken as a half day.`);
  if (t.maxPerRequest != null && days > t.maxPerRequest) errors.push(`${t.name} allows at most ${t.maxPerRequest} day(s) per request.`);

  const emp = await prisma.employee.findUnique({ where: { id: input.employeeId }, select: { profile: { select: { doj: true, gender: true } } } });
  const doj = emp?.profile?.doj ?? null;
  if (!appliesTo(t, { gender: emp?.profile?.gender ?? null })) errors.push(`${t.name} doesn’t apply to you.`);
  if (t.minServiceDays > 0) {
    if (!doj) warnings.push(`${t.name} needs ${t.minServiceDays} days of service, but no joining date is on record.`);
    else if ((input.fromDate.getTime() - doj.getTime()) / DAY < t.minServiceDays) errors.push(`${t.name} is available after ${t.minServiceDays} days of service.`);
  }
  if (!input.forApproval && t.noticeDays > 0) {
    const today = utcDay(new Date(Date.now() + 330 * 60_000));
    if ((input.fromDate.getTime() - today.getTime()) / DAY < t.noticeDays) warnings.push(`${t.name} should be applied ${t.noticeDays} day(s) in advance.`);
  }

  // Overlap with other pending / approved leave
  const clash = await prisma.leave.findFirst({
    where: {
      employeeId: input.employeeId,
      id: input.excludeLeaveId ? { not: input.excludeLeaveId } : undefined,
      status: { in: ["approved", "Approved", "pending", "Pending"] },
      fromDate: { lte: input.toDate },
      toDate: { gte: input.fromDate },
    },
    select: { leaveId: true },
  });
  if (clash) {
    errors.push(`These dates overlap your request ${clash.leaveId}.`);
  }

  // Balance — paid types with an entitlement or credited balance
  let available: number | null = null;
  if (t.paid && days > 0) {
    const { yearStartMonth } = await getLeaveSettings();
    const year = leaveYearOf(input.fromDate, yearStartMonth);
    const { balances } = await computeBalances([input.employeeId], year, input.fromDate > new Date() ? input.fromDate : undefined);
    const b = balances.get(input.employeeId)?.find((x) => x.leaveTypeId === t.id);
    if (b) {
      // Pending requests (other than this one) are already promised.
      const self = input.excludeLeaveId ? await prisma.leave.findUnique({ where: { id: input.excludeLeaveId }, select: { status: true } }) : null;
      const pendingOthers = b.pending - (self && self.status.toLowerCase() === "pending" ? days : 0);
      available = round2(b.available - Math.max(0, input.forApproval ? 0 : pendingOthers));
      const hasEntitlement = t.annualDays != null || b.opening !== 0 || b.adjusted !== 0;
      if (hasEntitlement && days > available && !t.allowNegative) {
        errors.push(`Not enough ${t.name}: ${Math.max(0, available)} day(s) available, ${days} requested.`);
      } else if (!hasEntitlement) {
        warnings.push(`No ${t.name} entitlement has been set up yet, so the balance isn’t checked.`);
      } else if (days > available) {
        warnings.push(`This takes ${t.name} below zero (${round2(available - days)}).`);
      }
    }
  }
  return { days, available, errors, warnings, type: t };
}
