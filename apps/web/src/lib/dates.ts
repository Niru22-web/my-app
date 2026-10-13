// Calendar-date helpers. Work dates are calendar days, not instants: the API stores them as
// UTC midnight ("2026-10-09T00:00:00.000Z"), so we always read the YYYY-MM-DD part and never
// shift it through the viewer's time zone.

import { isWeeklyOff } from "./work-calendar";

export type YMD = string; // "2026-10-09"

const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar date → "YYYY-MM-DD". */
export function toYMD(d: Date): YMD {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Stored API date (ISO or YMD) → "YYYY-MM-DD" without time-zone shifting. */
export function workDate(iso: string | null | undefined): YMD {
  return (iso ?? "").slice(0, 10);
}

/** "YYYY-MM-DD" → local Date at midnight. */
export function fromYMD(ymd: YMD): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function today(): YMD {
  return toYMD(new Date());
}

export function addDays(ymd: YMD, n: number): YMD {
  const d = fromYMD(ymd);
  d.setDate(d.getDate() + n);
  return toYMD(d);
}

/** Monday of the week containing `ymd`. */
export function weekStart(ymd: YMD): YMD {
  const d = fromYMD(ymd);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return toYMD(d);
}

export function weekDays(start: YMD): YMD[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Weekly off per the firm work calendar (e.g. Sundays + 2nd/4th Saturdays). */
export function isWeekend(ymd: YMD): boolean {
  return isWeeklyOff(ymd);
}

export function fmtDay(ymd: YMD, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }): string {
  if (!ymd) return "—";
  return fromYMD(ymd).toLocaleDateString("en-IN", opts);
}

export function fmtRange(start: YMD, end: YMD): string {
  const a = fromYMD(start);
  const b = fromYMD(end);
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  const left = a.toLocaleDateString("en-IN", sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" });
  const right = b.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return `${left} – ${right}`;
}

export function startOfMonth(ymd: YMD): YMD {
  return ymd.slice(0, 8) + "01";
}

export function endOfMonth(ymd: YMD): YMD {
  const d = fromYMD(startOfMonth(ymd));
  d.setMonth(d.getMonth() + 1, 0);
  return toYMD(d);
}
