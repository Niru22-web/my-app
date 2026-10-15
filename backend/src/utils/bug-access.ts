import { prisma } from "../config/db";
import { normRole, type JwtUser } from "../plugins/auth";

/** Roles that run the bug tracker: change any status, assign, set priority/due date, delete. */
export const BUG_TRIAGE_ROLES = new Set(["admin", "owner", "it"]);
export const isBugTriage = (role?: string | null) => BUG_TRIAGE_ROLES.has(normRole(role));

/**
 * Bug tracker screenshots (uploads/bugs/…): the reporter, the assignee, Admin/Owner/IT,
 * and anyone who has commented on that bug. `variants` are the stored spellings of the path.
 */
export async function canReadBugFile(u: JwtUser, variants: string[]): Promise<boolean> {
  if (isBugTriage(u.role)) return true;
  const ev = await prisma.bugEvent.findFirst({
    where: { OR: variants.map((v) => ({ files: { array_contains: [{ path: v }] } })) },
    select: { bugId: true },
  });
  if (!ev) return false;
  const bug = await prisma.bugReport.findUnique({ where: { id: ev.bugId }, select: { reporterId: true, assigneeId: true } });
  if (!bug) return false;
  if (bug.reporterId === u.id || bug.assigneeId === u.id) return true;
  const commented = await prisma.bugEvent.findFirst({ where: { bugId: ev.bugId, actorId: u.id, kind: "comment" }, select: { id: true } });
  return !!commented;
}
