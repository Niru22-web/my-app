import { prisma } from "../config/db";

/**
 * Timesheet period lock. Time on or before the returned date (YYYY-MM-DD) can't be added, changed,
 * deleted or returned — it has been billed or closed. null = nothing is locked.
 */
export async function lockedThrough(): Promise<string | null> {
  const row = await prisma.timesheetLock.findFirst({ orderBy: { createdAt: "desc" }, select: { lockedThrough: true } });
  const d = row?.lockedThrough.toISOString().slice(0, 10);
  // Reopening everything is stored as 2019-12-31 (before any allowed date), which means "nothing locked".
  return d && d > "2019-12-31" ? d : null;
}

/** Error message when `date` falls in a locked period, else null. */
export async function lockProblem(date: Date | string): Promise<string | null> {
  const locked = await lockedThrough();
  const d = typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10);
  return locked && d <= locked ? `Timesheets up to ${locked} are locked. Ask an Admin to reopen the period.` : null;
}
