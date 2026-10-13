import type { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../config/db";

export interface JwtUser {
  id: string;
  employeeId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  hasAccountsAccess?: boolean;
  iat?: number;
  exp?: number;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: JwtUser;
  }
}

export const ACCOUNTS_ROLES = new Set([
  "accounts",
  "accounts_admin",
  "accounts_manager",
  "accounts_executive",
  "finance_approver",
  "ar_manager",
  "ap_manager",
  "accountant",
]);

export function normRole(role?: string | null): string {
  return (role ?? "").trim().toLowerCase();
}

export function signToken(payload: Omit<JwtUser, "iat" | "exp">): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "2d" });
}

/**
 * Strict Bearer JWT authentication (fixes S1 dev-mode bypass and S8 query-string token leak).
 */
export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return reply.code(401).send({ success: false, message: "Unauthorized" });
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    return reply.code(401).send({ success: false, message: "Unauthorized" });
  }
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtUser;
    if (!decoded?.id || !decoded?.employeeId) {
      return reply.code(401).send({ success: false, message: "Invalid authentication token" });
    }
    req.user = decoded;
  } catch {
    return reply.code(401).send({ success: false, message: "Invalid or expired token" });
  }
}

/**
 * Role guard factory (case-insensitive).
 */
export function requireRoles(allowedRoles: string[]) {
  const allowed = new Set(allowedRoles.map((r) => r.toLowerCase()));
  return async (req: FastifyRequest, reply: FastifyReply) => {
    await authenticate(req, reply);
    if (reply.sent || !req.user) return;
    const role = normRole(req.user.role);
    if (allowed.has(role) || (allowed.has("accounts") && ACCOUNTS_ROLES.has(role))) {
      return;
    }
    return reply.code(403).send({
      success: false,
      message: "You don’t have permission to perform this action.",
    });
  };
}

/** Every way an employee can report to `leadId` (manager, partner, sub-manager — legacy columns and join tables). */
export function reportsToWhere(leadId: string) {
  return [
    { managerId: leadId },
    { partnerId: leadId },
    { subManagerId: leadId },
    { reportingManagerIds: { has: leadId } },
    { reportingPartnerIds: { has: leadId } },
    { subManagerIds: { has: leadId } },
    { managers: { some: { managerId: leadId } } },
    { partners: { some: { partnerId: leadId } } },
  ];
}

/**
 * Everyone below `leadId` in the reporting tree — direct reports, their reports, and so on.
 * Role doesn't matter: whoever has people reporting to them leads that team.
 */
export async function reportingTreeIds(leadId: string, activeOnly = false): Promise<string[]> {
  const seen = new Set<string>([leadId]);
  const out: string[] = [];
  let frontier = [leadId];
  for (let depth = 0; depth < 8 && frontier.length; depth++) {
    const next = await prisma.employee.findMany({
      where: {
        id: { notIn: [...seen] },
        OR: frontier.flatMap(reportsToWhere),
        ...(activeOnly ? { status: { equals: "active", mode: "insensitive" as const } } : {}),
      },
      select: { id: true },
    });
    frontier = [];
    for (const e of next) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      frontier.push(e.id);
      out.push(e.id);
    }
  }
  return out;
}

/**
 * Whether the caller may see/act on `targetEmployeeId`: themselves; anyone for Admin/Owner/HR/IT;
 * otherwise anyone below them in the reporting tree (direct or indirect), whatever their role.
 */
export async function isTeamMemberOrSelf(
  caller: JwtUser,
  targetEmployeeId: string,
  opts: { leadRolesOnly?: boolean } = {},
): Promise<boolean> {
  if (caller.id === targetEmployeeId) return true;
  const r = normRole(caller.role);
  if (["admin", "owner", "hr", "it"].includes(r)) return true;
  // Sensitive records (KYC documents) stay limited to Manager / Partner / Sub-manager roles.
  if (opts.leadRolesOnly && !["manager", "partner", "sub-manager", "sub manager"].includes(r)) return false;
  return (await reportingTreeIds(caller.id)).includes(targetEmployeeId);
}

/** True when at least one person reports to `leadId`. */
export async function leadsATeam(leadId: string): Promise<boolean> {
  return !!(await prisma.employee.findFirst({ where: { id: { not: leadId }, OR: reportsToWhere(leadId) }, select: { id: true } }));
}
