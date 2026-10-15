import type { AttendancePolicy } from "@prisma/client";
import { prisma } from "../config/db";
import { getWorkCalendar, isOffDay } from "./work-calendar";

// ── Attendance rules ─────────────────────────────────────────────────────────
// Firm shift 11:00–20:00 IST unless the employee has another active shift. A day is:
//   Late       first check-in later than shift start + grace minutes
//   Half day   worked < fullDayMinHours and ≥ halfDayMinHours (past days only)
//   Absent     worked < halfDayMinHours, or no punch on a working day (past days only)
//   Missing check-out  checked in on a past day but never checked out (or closed by the system)
// All times are compared in IST.

export type DayStatus = "Present" | "Late" | "Half day" | "Absent" | "Weekly off" | "Holiday" | "On leave" | "Missing check-out";

export interface Shift { name: string; start: string; end: string }

const IST_OFFSET_MIN = 330;
export const DEFAULT_SHIFT: Shift = { name: "General shift", start: "11:00", end: "20:00" };

let policyCache: { value: AttendancePolicy; at: number } | null = null;

/** The firm's attendance policy (creates the default row the first time). Cached for 30 seconds. */
export async function getAttendancePolicy(): Promise<AttendancePolicy> {
  if (policyCache && Date.now() - policyCache.at < 30_000) return policyCache.value;
  const value = await prisma.attendancePolicy.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
  policyCache = { value, at: Date.now() };
  return value;
}
export const invalidateAttendancePolicy = () => (policyCache = null);

// ── Time helpers (IST) ───────────────────────────────────────────────────────

/** Minutes after IST midnight for an instant. */
export function istMinutes(t: Date): number {
  const ist = new Date(t.getTime() + IST_OFFSET_MIN * 60_000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}
/** IST calendar day ("YYYY-MM-DD") of an instant. */
export const istYmd = (t: Date) => new Date(t.getTime() + IST_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
/** Today in IST as a UTC-midnight date (how attendance days are stored). */
export const istToday = () => new Date(`${istYmd(new Date())}T00:00:00.000Z`);
/** "HH:MM" → minutes, or null when malformed. */
export function parseHHMM(s: string | null | undefined): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec((s ?? "").trim());
  return m ? +m[1] * 60 + +m[2] : null;
}
export const fmtHHMM = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
/** A day ("YYYY-MM-DD") and IST wall-clock time ("HH:MM") → the UTC instant. */
export const istToUtc = (ymd: string, hhmm: string) => new Date(`${ymd}T${hhmm}:00.000+05:30`);
export const ymdOf = (d: Date) => d.toISOString().slice(0, 10);

// ── Shifts ───────────────────────────────────────────────────────────────────

let shiftCache: { rows: { id: string; name: string; startTime: string; endTime: string; isActive: boolean }[]; at: number } | null = null;
async function activeShifts() {
  if (shiftCache && Date.now() - shiftCache.at < 60_000) return shiftCache.rows;
  const rows = await prisma.shiftMaster.findMany({ where: { isActive: true }, select: { id: true, name: true, startTime: true, endTime: true, isActive: true } });
  shiftCache = { rows, at: Date.now() };
  return rows;
}
const toShift = (s: { name: string; startTime: string; endTime: string }): Shift | null =>
  parseHHMM(s.startTime) != null && parseHHMM(s.endTime) != null ? { name: s.name, start: s.startTime.trim(), end: s.endTime.trim() } : null;

/** Resolver for many employees at once: own active shift → active "General shift" → 11:00–20:00. */
export async function shiftResolver(): Promise<(emp: { shiftId?: string | null } | null | undefined) => Shift> {
  const rows = await activeShifts();
  const byId = new Map(rows.map((s) => [s.id, s]));
  const general = rows.find((s) => s.name.trim().toLowerCase() === "general shift");
  const fallback = (general && toShift(general)) || DEFAULT_SHIFT;
  return (emp) => {
    const own = emp?.shiftId ? byId.get(emp.shiftId) : undefined;
    return (own && toShift(own)) || fallback;
  };
}
export async function shiftFor(emp: { shiftId?: string | null } | null | undefined): Promise<Shift> {
  return (await shiftResolver())(emp);
}

// ── Day status ───────────────────────────────────────────────────────────────

export interface DayInput {
  /** The calendar day (UTC midnight, as stored in `attendance.date`) */
  date: Date;
  checkIn: Date | null;
  checkOut: Date | null;
  totalHours?: number | null;
  /** Closed by the system rather than by the person */
  autoCheckout?: boolean;
  offDay: boolean;
  holiday?: boolean;
  onLeave: boolean;
  policy: Pick<AttendancePolicy, "graceMinutes" | "fullDayMinHours" | "halfDayMinHours">;
  shift: Shift;
  /** Defaults to today in IST */
  today?: Date;
}
export interface DayResult {
  /** null = a working day still to come (or today with no punch yet) */
  status: DayStatus | null;
  lateMinutes: number;
  workedHours: number;
}

export function dayStatus(i: DayInput): DayResult {
  const today = i.today ?? istToday();
  const isPast = i.date.getTime() < today.getTime();
  const worked =
    i.totalHours && i.totalHours > 0
      ? i.totalHours
      : i.checkIn && i.checkOut
        ? Math.max(0, (i.checkOut.getTime() - i.checkIn.getTime()) / 3_600_000)
        : 0;
  const workedHours = Math.round(worked * 100) / 100;
  const start = parseHHMM(i.shift.start) ?? 660;
  const minsLate = i.checkIn ? istMinutes(i.checkIn) - start : 0;
  const late = !!i.checkIn && !i.offDay && !i.holiday && minsLate > i.policy.graceMinutes;
  const lateMinutes = late ? minsLate : 0;

  if (!i.checkIn) {
    if (i.holiday) return { status: "Holiday", lateMinutes: 0, workedHours };
    if (i.offDay) return { status: "Weekly off", lateMinutes: 0, workedHours };
    if (i.onLeave) return { status: "On leave", lateMinutes: 0, workedHours };
    return { status: isPast ? "Absent" : null, lateMinutes: 0, workedHours };
  }
  // Worked on a holiday / weekly off: the day is still shown as worked.
  if (!isPast) return { status: late ? "Late" : "Present", lateMinutes, workedHours };
  if (!i.checkOut || i.autoCheckout) return { status: "Missing check-out", lateMinutes, workedHours };
  if (i.offDay || i.holiday) return { status: "Present", lateMinutes: 0, workedHours };
  if (worked < i.policy.halfDayMinHours) return { status: i.onLeave ? "On leave" : "Absent", lateMinutes, workedHours };
  if (worked < i.policy.fullDayMinHours) return { status: "Half day", lateMinutes, workedHours };
  return { status: late ? "Late" : "Present", lateMinutes, workedHours };
}

// ── Batch context (policy + calendar + holidays + leave + shifts) ───────────

/** Firm holidays (calendar events of type Holiday) in a range, keyed by YYYY-MM-DD. */
export async function holidayMap(from: Date, to: Date): Promise<Map<string, string>> {
  const rows = await prisma.event.findMany({ where: { type: "Holiday", date: { gte: from, lte: to } }, select: { date: true, title: true } });
  return new Map(rows.map((r) => [ymdOf(r.date), r.title]));
}

/** Days with approved full-day leave per employee uuid: Map<uuid, Set<ymd>> */
async function fullLeaveDays(employeeIds: string[], from: Date, to: Date) {
  const out = new Map<string, Set<string>>();
  if (!employeeIds.length) return out;
  const rows = await prisma.leave.findMany({
    where: { employeeId: { in: employeeIds }, status: { equals: "approved", mode: "insensitive" }, fromDate: { lte: to }, toDate: { gte: from } },
    select: { employeeId: true, fromDate: true, toDate: true, duration: true },
  });
  for (const l of rows) {
    if (/half/i.test(l.duration)) continue;
    const s = Date.UTC(l.fromDate.getUTCFullYear(), l.fromDate.getUTCMonth(), l.fromDate.getUTCDate());
    const e = Date.UTC(l.toDate.getUTCFullYear(), l.toDate.getUTCMonth(), l.toDate.getUTCDate());
    for (let t = Math.max(s, from.getTime()); t <= Math.min(e, to.getTime()); t += 86_400_000) {
      if (!out.has(l.employeeId)) out.set(l.employeeId, new Set());
      out.get(l.employeeId)!.add(ymdOf(new Date(t)));
    }
  }
  return out;
}

export interface StatusRow {
  date: Date;
  check_in_time: Date | null;
  check_out_time: Date | null;
  total_hours: number | null;
  is_auto_checkout?: boolean | null;
}

/** Everything needed to classify many days for many people (one round of queries). */
export async function statusContext(from: Date, to: Date, employeeIds: string[]) {
  const [policy, cal, holidays, leave, shiftOf] = await Promise.all([
    getAttendancePolicy(),
    getWorkCalendar(),
    holidayMap(from, to),
    fullLeaveDays(employeeIds, from, to),
    shiftResolver(),
  ]);
  const today = istToday();
  const classify = (emp: { id?: string | null; shiftId?: string | null } | null | undefined, date: Date, row?: StatusRow | null) => {
    const k = ymdOf(date);
    const shift = shiftOf(emp);
    const r = dayStatus({
      date,
      checkIn: row?.check_in_time ?? null,
      checkOut: row?.check_out_time ?? null,
      totalHours: row?.total_hours ?? null,
      autoCheckout: !!row?.is_auto_checkout,
      offDay: isOffDay(date, cal),
      holiday: holidays.has(k),
      onLeave: !!(emp?.id && leave.get(emp.id)?.has(k)),
      policy,
      shift,
      today,
    });
    return { computedStatus: r.status, lateMinutes: r.lateMinutes, workedHours: r.workedHours, holidayName: holidays.get(k) ?? null, shiftStart: shift.start, shiftEnd: shift.end };
  };
  return { policy, cal, holidays, today, shiftOf, classify };
}
