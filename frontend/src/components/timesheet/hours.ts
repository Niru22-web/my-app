// Hours helpers shared by the Time logs screens. Hours are stored as decimals (7.5 = 7 h 30 m).

/** Accepts "7.5", "7,5", "7:30" or "7h 30m". Empty = 0. NaN when unreadable. */
export function parseHours(v: string): number {
  const s = v.trim().toLowerCase();
  if (!s) return 0;
  const hm = s.match(/^(\d{1,2}):([0-5]?\d)$/);
  if (hm) return Number(hm[1]) + Number(hm[2]) / 60;
  const hx = s.match(/^(?:(\d{1,2})\s*h)?\s*(?:(\d{1,2})\s*m)?$/);
  if (hx && (hx[1] || hx[2])) return Number(hx[1] ?? 0) + Number(hx[2] ?? 0) / 60;
  return Number(s.replace(",", "."));
}

/** 7.5 → "07:30" (Zoho-style hh:mm). */
export function hhmm(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "00:00";
  const mins = Math.round(value * 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Problem with a single entry's hours, or null when fine (0.25–24, the server's rule). */
export function hoursProblem(h: number): string | null {
  if (Number.isNaN(h)) return "Enter hours, e.g. 7.5 or 7:30.";
  if (h < 0.25) return "The minimum is 15 minutes (0.25 h).";
  if (h > 24) return "One entry can’t be more than 24 hours.";
  return null;
}

/** Rounds up to the next quarter hour, minimum 0.25. */
export function roundUpQuarter(hours: number): number {
  return Math.max(0.25, Math.ceil(hours * 4 - 1e-9) / 4);
}

/** "09:15" → minutes since midnight, NaN when unreadable. */
export function minutesOf(t: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

/** Elapsed milliseconds → "01:02:03". */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

/** Short "Job name • Project (Client)" label. */
export function jobLine(job: { name?: string | null; project?: { name?: string | null; client?: { name?: string | null; alias?: string | null } | null } | null } | null | undefined): string {
  if (!job) return "Unknown job";
  const client = job.project?.client?.name || job.project?.client?.alias;
  const project = job.project?.name;
  return [job.name ?? "Job", project ? `${project}${client ? ` (${client})` : ""}` : client].filter(Boolean).join(" • ");
}
