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
  /** Issue time in milliseconds (exact session revocation) */
  iatMs?: number;
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

export function signToken(payload: Omit<JwtUser, "iat" | "exp" | "iatMs">): string {
  return jwt.sign({ ...payload, iatMs: Date.now() }, env.JWT_SECRET, { expiresIn: "12h" });
}

// ── Live account check ───────────────────────────────────────────────────────
// The JWT only proves who the caller is. Role, accounts access and active status are read from the
// database on every request (cached for a few seconds), so deactivation, rejection or a role change
// takes effect immediately instead of when the token expires.
interface LiveAccount { active: boolean; role: string; hasAccountsAccess: boolean; /** ms */ validAfter: number; at: number }
const LIVE_TTL_MS = 5_000;
const live = new Map<string, LiveAccount>();

async function liveAccount(id: string): Promise<LiveAccount | null> {
  const hit = live.get(id);
  if (hit && Date.now() - hit.at < LIVE_TTL_MS) return hit;
  const [emp, state] = await Promise.all([
    prisma.employee.findUnique({ where: { id }, select: { status: true, approvalStatus: true, role: true, hasAccountsAccess: true } }),
    prisma.authState.findUnique({ where: { employeeId: id }, select: { tokensValidAfter: true } }),
  ]);
  if (!emp) return null;
  const r = normRole(emp.role);
  const value: LiveAccount = {
    active: (emp.status ?? "").toLowerCase() === "active" && emp.approvalStatus !== "REJECTED",
    role: emp.role,
    hasAccountsAccess: emp.hasAccountsAccess || ACCOUNTS_ROLES.has(r) || r === "admin",
    validAfter: state ? state.tokensValidAfter.getTime() : 0,
    at: Date.now(),
  };
  live.set(id, value);
  return value;
}

/**
 * Signs the person out everywhere: every token issued before now stops working.
 * Call on password change/reset, deactivation, rejection and role changes.
 */
export async function revokeSessions(employeeId: string, reason: string) {
  // Exact to the millisecond (tokens carry iatMs), so a sign-in straight after still works.
  const now = new Date();
  await prisma.authState.upsert({
    where: { employeeId },
    create: { employeeId, tokensValidAfter: now, reason },
    update: { tokensValidAfter: now, reason },
  });
  live.delete(employeeId);
}
/** Drop the cached account state after a profile change that doesn't need a sign-out. */
export const forgetLiveAccount = (employeeId: string) => live.delete(employeeId);

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
  const result = await verifyAccessToken(token);
  if ("error" in result) return reply.code(401).send({ success: false, ...result.error });
  req.user = result.user;
}

/**
 * Checks a login token: valid signature, account still active, not signed out since it was issued.
 * Role and accounts access in the returned user always come from the database. Shared by HTTP and Socket.IO.
 */
export async function verifyAccessToken(token: string): Promise<{ user: JwtUser } | { error: { message: string; errorCode?: string } }> {
  let decoded: JwtUser;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as JwtUser;
    if (!decoded?.id || !decoded?.employeeId) return { error: { message: "Invalid authentication token" } };
  } catch {
    return { error: { message: "Invalid or expired token" } };
  }
  const acct = await liveAccount(decoded.id);
  if (!acct || !acct.active) return { error: { message: "Your account is no longer active.", errorCode: "ACCOUNT_INACTIVE" } };
  const issuedMs = decoded.iatMs ?? (decoded.iat ?? 0) * 1000;
  if (issuedMs <= acct.validAfter) return { error: { message: "Your session has ended. Please sign in again.", errorCode: "SESSION_REVOKED" } };
  return { user: { ...decoded, role: acct.role, hasAccountsAccess: acct.hasAccountsAccess } };
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
  // Sensitive records (KYC documents): the person, HR/Admin/Owner, and their Manager/Partner — never IT.
  if (opts.leadRolesOnly) {
    if (["admin", "owner", "hr"].includes(r)) return true;
    if (!["manager", "partner", "sub-manager", "sub manager"].includes(r)) return false;
  } else if (["admin", "owner", "hr", "it"].includes(r)) return true;
  return (await reportingTreeIds(caller.id)).includes(targetEmployeeId);
}

/** True when at least one person reports to `leadId`. */
export async function leadsATeam(leadId: string): Promise<boolean> {
  return !!(await prisma.employee.findFirst({ where: { id: { not: leadId }, OR: reportsToWhere(leadId) }, select: { id: true } }));
}
