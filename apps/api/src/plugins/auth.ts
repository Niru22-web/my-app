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

/**
 * Checks whether `userId` is in the caller's reporting team (for Managers / Partners / Sub-managers).
 */
export async function isTeamMemberOrSelf(caller: JwtUser, targetEmployeeId: string): Promise<boolean> {
  if (caller.id === targetEmployeeId) return true;
  const r = normRole(caller.role);
  if (["admin", "owner", "hr", "it"].includes(r)) return true;
  if (!["manager", "partner", "sub-manager"].includes(r)) return false;

  const match = await prisma.employee.findFirst({
    where: {
      id: targetEmployeeId,
      OR: [
        { managerId: caller.id },
        { partnerId: caller.id },
        { subManagerId: caller.id },
        { reportingManagerIds: { has: caller.id } },
        { reportingPartnerIds: { has: caller.id } },
        { subManagerIds: { has: caller.id } },
        { managers: { some: { managerId: caller.id } } },
        { partners: { some: { partnerId: caller.id } } },
      ],
    },
    select: { id: true },
  });
  return !!match;
}
