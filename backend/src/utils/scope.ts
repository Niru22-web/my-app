import type { FastifyReply } from "fastify";
import { prisma } from "../config/db";
import { reportingTreeIds, type JwtUser } from "../plugins/auth";
import { tierAccess, type Tier } from "../modules/reports/engine";

/**
 * My / Team / Organization views used by Timesheet, Attendance, Leave and Reports.
 *   my   → the caller
 *   team → everyone below the caller in the reporting tree (any role can lead a team)
 *   org  → the whole firm (Admin/Owner/HR/IT/Accounts, or the Analytics permission)
 */
export type Scope = Tier;
export const isScope = (s: unknown): s is Scope => s === "my" || s === "team" || s === "org";

/** Employee ids (uuid) for the scope, `null` meaning "everyone"; replies 403 and returns undefined when not allowed. */
export async function scopeIds(user: JwtUser, scope: Scope, reply: FastifyReply): Promise<string[] | null | undefined> {
  if (scope === "my") return [user.id];
  const access = await tierAccess(user);
  if (!access[scope]) {
    reply.code(403).send({ success: false, message: scope === "team" ? "Nobody reports to you." : "You don’t have access to organization-wide records." });
    return undefined;
  }
  return scope === "team" ? reportingTreeIds(user.id) : null;
}

/** Same as scopeIds but returns employee codes (attendance rows are keyed by code). */
export async function scopeCodes(user: JwtUser, scope: Scope, reply: FastifyReply): Promise<string[] | null | undefined> {
  const ids = await scopeIds(user, scope, reply);
  if (ids === undefined || ids === null) return ids;
  if (scope === "my") return [user.employeeId];
  const rows = await prisma.employee.findMany({ where: { id: { in: ids } }, select: { employeeId: true } });
  return rows.map((r) => r.employeeId);
}

/** People in a scope, for filter dropdowns. */
export async function scopePeople(ids: string[] | null) {
  return prisma.employee.findMany({
    where: { ...(ids ? { id: { in: ids } } : {}), NOT: { officeEmail: { endsWith: "@asa-local.test" } } },
    select: { id: true, employeeId: true, firstName: true, lastName: true, designation: true, status: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });
}
