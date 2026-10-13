import { prisma } from "../config/db";

/**
 * Firm work calendar: which days are weekly offs, and when the leave year starts.
 * Until HR saves the settings, Saturdays and Sundays are both off (the portal's original behaviour).
 * Firm holidays are separate — they come from the Calendar (events of type "Holiday").
 */
export interface WorkCalendar {
  leaveYearStartMonth: number;
  /** "all", "none" or the Saturday week-numbers that are off, e.g. [2, 4] */
  saturdaysOff: "all" | "none" | number[];
  sundayOff: boolean;
  /** Leave accrues from this date (null = from the start of each leave year) */
  leaveAccrualFrom: Date | null;
  configured: boolean;
}

const DEFAULT: WorkCalendar = { leaveYearStartMonth: 1, saturdaysOff: "all", sundayOff: true, leaveAccrualFrom: null, configured: false };
let cache: { value: WorkCalendar; at: number } = { value: DEFAULT, at: 0 };

export function parseSaturdays(raw: string): WorkCalendar["saturdaysOff"] {
  const s = raw.trim().toLowerCase();
  if (s === "all" || s === "none") return s;
  const weeks = [...new Set(s.split(/[,\s]+/).map(Number).filter((n) => n >= 1 && n <= 5))].sort();
  return weeks.length ? weeks : "none";
}
export const formatSaturdays = (v: WorkCalendar["saturdaysOff"]) => (Array.isArray(v) ? v.join(",") : v);

/** Loads (and caches for a minute) the calendar. Call before using `isOffDay`/`currentCalendar` in a request. */
export async function getWorkCalendar(): Promise<WorkCalendar> {
  if (Date.now() - cache.at < 60_000) return cache.value;
  const row = await prisma.firmSettings.findUnique({ where: { id: "default" } });
  const value: WorkCalendar = row
    ? { leaveYearStartMonth: row.leaveYearStartMonth, saturdaysOff: parseSaturdays(row.saturdaysOff), sundayOff: row.sundayOff, leaveAccrualFrom: row.leaveAccrualFrom, configured: true }
    : DEFAULT;
  cache = { value, at: Date.now() };
  return value;
}
export const invalidateWorkCalendar = () => (cache = { value: cache.value, at: 0 });
/** The most recently loaded calendar (synchronous; refreshed by getWorkCalendar). */
export const currentCalendar = () => cache.value;

/** Weekly off? (dates are calendar days at UTC midnight) */
export function isOffDay(d: Date, cal: WorkCalendar = cache.value): boolean {
  const dow = d.getUTCDay();
  if (dow === 0) return cal.sundayOff;
  if (dow !== 6) return false;
  if (cal.saturdaysOff === "all") return true;
  if (cal.saturdaysOff === "none") return false;
  return cal.saturdaysOff.includes(Math.ceil(d.getUTCDate() / 7));
}

export function describeCalendar(cal: WorkCalendar) {
  const sat =
    cal.saturdaysOff === "all" ? "every Saturday" : cal.saturdaysOff === "none" ? "" : `${cal.saturdaysOff.map((n) => ["1st", "2nd", "3rd", "4th", "5th"][n - 1]).join(" and ")} Saturdays`;
  return [cal.sundayOff ? "Sundays" : "", sat].filter(Boolean).join(" and ") + " off";
}
