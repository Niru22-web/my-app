import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma, SAFE_EMPLOYEE_SELECT } from "../config/db";
import { authenticate, isTeamMemberOrSelf, normRole, requireRoles, reportingTreeIds, revokeSessions, forgetLiveAccount } from "../plugins/auth";
import { env } from "../config/env";
import { parseBodyOrMultipart } from "../utils/uploads";
import { resolveUpload, sendUpload } from "../utils/file-access";
import { createNotification } from "../utils/notify";

async function nextEmployeeCode(): Promise<string> {
  const rows = await prisma.employee.findMany({
    select: { employeeId: true },
  });
  let max = 0;
  for (const r of rows) {
    const m = r.employeeId.match(/(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  return `EMP${String(max + 1).padStart(3, "0")}`;
}

const PHOTO_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const PHOTO_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

// ── People-management rules ──────────────────────────────────────────────────
// Only HR, Admin and Owner manage people (invite, edit, approve, reject, activate/deactivate).
// Only Admin/Owner grant or remove Admin/Owner. Nobody changes their own role or status.
// The firm always keeps at least one active Admin.
const PEOPLE_ADMIN = ["admin", "owner", "hr"];
const TOP_ROLES = new Set(["admin", "owner"]);
const isPeopleAdmin = (role: string) => PEOPLE_ADMIN.includes(normRole(role));

/** Fields an employee may change on their own profile; everything else goes through HR. */
const SELF_EDITABLE = [
  "personalEmail", "personalMobile", "currentAddress", "currentPinCode", "permanentAddress",
  "emergencyContactName", "emergencyContactPhone", "emergencyContactRelation",
  "guardianName", "guardianNumber", "guardianAddress", "education", "maritalStatus",
] as const;
/** HR-only: identity, statutory, bank and employment facts (they drive leave, payroll and compliance). */
const HR_ONLY = [
  "pan", "aadhaar", "bankName", "accountHolderName", "bankAccountNumber", "ifscCode", "branchName",
  "gender", "employmentType", "seniorityLevel", "experience",
] as const;

async function activeAdminCount(excludeId?: string) {
  return prisma.employee.count({
    where: { role: { equals: "Admin", mode: "insensitive" }, status: { equals: "active", mode: "insensitive" }, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
}

/**
 * What a viewer may see of someone's profile:
 *   full  — the person, HR, Admin, Owner
 *   lead  — anyone above them in the reporting line: work facts + emergency contact
 *   basic — everyone else: joining date and employment type only
 * Statutory numbers, bank details, salary, DOB, family details and document links are "full" only.
 */
type ProfileRow = Record<string, unknown> | null;
function profileFor(level: "full" | "lead" | "basic", p: ProfileRow) {
  if (!p || level === "full") return p;
  const pick = (keys: string[]) => Object.fromEntries(keys.filter((k) => k in p).map((k) => [k, p[k]]));
  const work = ["id", "employeeId", "doj", "employmentType", "seniorityLevel", "experience", "education"];
  return level === "lead" ? pick([...work, "emergencyContactName", "emergencyContactPhone", "emergencyContactRelation"]) : pick(["id", "employeeId", "doj", "employmentType"]);
}
async function viewLevel(u: { id: string; role: string }, targetId: string): Promise<"full" | "lead" | "basic"> {
  if (u.id === targetId || isPeopleAdmin(u.role)) return "full";
  return (await reportingTreeIds(u.id)).includes(targetId) ? "lead" : "basic";
}

/** Registration link for an invite (email isn't connected yet, so HR copies and shares it). */
const inviteLink = (token: string) => `${env.FRONTEND_URL.replace(/\/$/, "")}/complete-registration?token=${token}`;

export async function employeeRoutes(app: FastifyInstance) {
  // GET /api/employees — role-scoped list with loggedHours (fixes M10, P2)
  app.get("/api/employees", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const r = normRole(u.role);
    const isFirmWide = ["admin", "owner", "hr", "it", "accounts", "accounts_admin", "accounts_manager"].includes(r);
    const isTeamLead = ["manager", "partner", "sub-manager", "sub manager"].includes(r);

    const where = isFirmWide
      ? {}
      : isTeamLead
        ? {
            OR: [
              { id: u.id },
              { managerId: u.id },
              { partnerId: u.id },
              { subManagerId: u.id },
              { reportingManagerIds: { has: u.id } },
              { reportingPartnerIds: { has: u.id } },
              { subManagerIds: { has: u.id } },
              { managers: { some: { managerId: u.id } } },
              { partners: { some: { partnerId: u.id } } },
            ],
          }
        : { id: u.id };

    const [employees, hoursByEmp] = await Promise.all([
      prisma.employee.findMany({
        where,
        select: SAFE_EMPLOYEE_SELECT,
        orderBy: { createdAt: "desc" },
      }),
      prisma.timelog.groupBy({
        by: ["employeeId"],
        _sum: { hours: true },
      }),
    ]);

    const hoursMap = new Map(hoursByEmp.map((h) => [h.employeeId, Number(h._sum.hours ?? 0)]));
    const data = employees.map((e) => ({
      ...e,
      loggedHours: hoursMap.get(e.id) ?? 0,
    }));

    return reply.send({ success: true, data });
  });

  // GET /api/employees/team — authenticated and role-scoped (fixes M1)
  app.get("/api/employees/team", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const r = normRole(u.role);
    const where = ["admin", "owner", "hr", "it"].includes(r)
      ? {}
      : ["manager", "partner", "sub-manager", "sub manager"].includes(r)
        ? {
            OR: [
              { id: u.id },
              { managerId: u.id },
              { partnerId: u.id },
              { subManagerId: u.id },
              { reportingManagerIds: { has: u.id } },
              { reportingPartnerIds: { has: u.id } },
              { subManagerIds: { has: u.id } },
              { managers: { some: { managerId: u.id } } },
              { partners: { some: { partnerId: u.id } } },
            ],
          }
        : { id: u.id };

    const team = await prisma.employee.findMany({
      where,
      select: SAFE_EMPLOYEE_SELECT,
      orderBy: { firstName: "asc" },
    });
    return reply.send({ success: true, data: team });
  });

  // GET /api/employees/pending-approvals
  app.get(
    "/api/employees/pending-approvals",
    { preHandler: [requireRoles(["admin", "owner", "hr", "it", "manager", "partner", "accounts"])] },
    async (_req, reply) => {
      const pending = await prisma.employee.findMany({
        where: {
          OR: [
            { status: { equals: "Pending", mode: "insensitive" } },
            { approvalStatus: "PENDING" },
          ],
        },
        select: SAFE_EMPLOYEE_SELECT,
        orderBy: { createdAt: "desc" },
      });
      return reply.send({ success: true, data: pending });
    },
  );

  // GET /api/employees/:id — scoped & never returns password hash (fixes P3, T9)
  app.get("/api/employees/:id", { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = req.user!;
    const level = await viewLevel(u, id);

    const emp = await prisma.employee.findUnique({
      where: { id },
      select: {
        ...SAFE_EMPLOYEE_SELECT,
        profile: true,
        managers: {
          include: {
            manager: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
          },
        },
        partners: {
          include: {
            partner: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!emp) {
      return reply.code(404).send({ success: false, message: "Employee not found" });
    }

    const subIds = [...new Set([emp.subManagerId, ...(emp.subManagerIds ?? [])].filter(Boolean) as string[])];
    const subRows = subIds.length
      ? await prisma.employee.findMany({
          where: { id: { in: subIds } },
          select: { id: true, employeeId: true, firstName: true, lastName: true },
        })
      : [];

    // Statutory, bank, salary, DOB, family details and document links only for the person / HR / Admin.
    const safeProfile = profileFor(level, emp.profile as ProfileRow);

    return reply.send({
      success: true,
      data: {
        ...emp,
        profile: safeProfile,
        managers: emp.managers.map((m) => ({
          id: m.manager.id,
          name: `${m.manager.firstName} ${m.manager.lastName}`.trim(),
          employeeCode: m.manager.employeeId,
        })),
        partners: emp.partners.map((p) => ({
          id: p.partner.id,
          name: `${p.partner.firstName} ${p.partner.lastName}`.trim(),
          employeeCode: p.partner.employeeId,
        })),
        subManagers: subRows.map((s) => ({
          id: s.id,
          name: `${s.firstName} ${s.lastName}`.trim(),
          employeeCode: s.employeeId,
        })),
      },
    });
  });

  // POST /api/employees — invite new employee with collision-safe code & reporting lines (fixes M3, M11, M12)
  app.post(
    "/api/employees",
    { preHandler: [requireRoles(PEOPLE_ADMIN)] },
    async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const firstName = String(body.firstName ?? "").trim();
      const lastName = String(body.lastName ?? "").trim();
      const officeEmail = String(body.officeEmail ?? body.email ?? "").trim().toLowerCase();
      const designation = String(body.designation ?? "Associate").trim();
      const department = String(body.department ?? "General").trim();
      const role = String(body.role ?? "Employee").trim();
      if (TOP_ROLES.has(normRole(role)) && !TOP_ROLES.has(normRole(req.user!.role))) {
        return reply.code(403).send({ success: false, message: "Only an Admin or Owner can invite someone as Admin or Owner." });
      }

      if (!firstName || !officeEmail) {
        return reply.code(400).send({
          success: false,
          message: "First name and office email are required.",
        });
      }

      const existing = await prisma.employee.findFirst({
        where: { officeEmail: { equals: officeEmail, mode: "insensitive" } },
      });
      if (existing) {
        return reply.code(400).send({
          success: false,
          message: "An employee with this office email already exists.",
        });
      }

      const employeeId = body.employeeId ? String(body.employeeId).trim() : await nextEmployeeCode();
      const mgrIds = Array.isArray(body.reportingManagerIds) ? (body.reportingManagerIds.filter(Boolean) as string[]) : [];
      const ptrIds = Array.isArray(body.reportingPartnerIds) ? (body.reportingPartnerIds.filter(Boolean) as string[]) : [];

      const created = await prisma.$transaction(async (tx) => {
        const emp = await tx.employee.create({
          data: {
            employeeId,
            firstName,
            lastName,
            officeEmail,
            designation,
            department,
            role,
            status: "Invited",
            approvalStatus: "PENDING",
            isApproved: false,
            reportingManagerIds: mgrIds,
            reportingPartnerIds: ptrIds,
            managerId: mgrIds[0] ?? null,
            partnerId: ptrIds[0] ?? null,
            roleId: body.roleId ?? null,
            designationId: body.designationId ?? null,
            departmentId: body.departmentId ?? null,
            shiftId: body.shiftId ?? null,
            locationId: body.locationId ?? null,
          },
          select: SAFE_EMPLOYEE_SELECT,
        });

        if (mgrIds.length > 0) {
          await tx.employeeManager.createMany({
            data: mgrIds.map((managerId) => ({ employeeId: emp.id, managerId })),
            skipDuplicates: true,
          });
        }
        if (ptrIds.length > 0) {
          await tx.employeePartner.createMany({
            data: ptrIds.map((partnerId) => ({ employeeId: emp.id, partnerId })),
            skipDuplicates: true,
          });
        }

        const token = crypto.randomBytes(32).toString("hex");
        await tx.registrationToken.create({
          data: {
            token,
            email: officeEmail,
            employeeId: emp.id,
            expiresAt: new Date(Date.now() + 7 * 24 * 3_600_000),
          },
        });

        return { emp, token };
      });

      // Email isn't connected yet: hand HR the link to share, and say so honestly.
      return reply.code(201).send({
        success: true,
        emailStatus: "not_sent",
        inviteLink: inviteLink(created.token),
        message: "Invitation created. Email isn’t connected yet — copy the link and send it to the joiner.",
        data: created.emp,
      });
    },
  );

  /**
   * PUT /api/employees/:id — Safe partial update (fixes U1 & AD4):
   * 1. Enforces self or Admin/HR/Owner authorization.
   * 2. Blocks non-Admin/HR/Owner from changing role, status, isApproved, or hasAccountsAccess.
   * 3. Never wipes EmployeeManager/EmployeePartner rows unless reportingManagerIds / reportingPartnerIds
   *    were explicitly passed by Admin/HR/Owner.
   * 4. Never nulls out omitted bank, emergency, or personal profile fields.
   */
  app.put("/api/employees/:id", { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = req.user!;
    const admin = isPeopleAdmin(u.role);
    const isSelf = u.id === id;
    if (!isSelf && !admin) {
      return reply.code(403).send({ success: false, message: "Only HR or an Admin can change someone else’s details." });
    }

    const target = await prisma.employee.findUnique({ where: { id }, select: { id: true, role: true, status: true, profile: true } });
    if (!target) return reply.code(404).send({ success: false, message: "Employee not found." });
    const body = (req.body ?? {}) as Record<string, any>;
    const callerTop = TOP_ROLES.has(normRole(u.role));
    const targetTop = TOP_ROLES.has(normRole(target.role));

    // Employees editing themselves: contact details only. Anything HR-owned that actually changes is refused.
    if (!admin) {
      const prof = (target.profile ?? {}) as Record<string, unknown>;
      const iso = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? "" : String(v).slice(0, 10));
      // Unchanged values sent back by the form are fine; job/role fields are simply not applied for self-edits.
      const blocked = [
        ...HR_ONLY.filter((k) => body[k] !== undefined && String(body[k] ?? "") !== String(prof[k] ?? "")),
        ...(["dob", "doj"] as const).filter((k) => body[k] !== undefined && iso(body[k]) !== iso(prof[k])),
      ];
      if (blocked.length) {
        return reply.code(403).send({
          success: false,
          message: "PAN, Aadhaar, bank details, date of birth, joining date and gender are updated by HR. Raise an HR ticket in Help Desk to change them.",
          fields: blocked,
        });
      }
    }

    // Role / status rules
    const roleChange = body.role !== undefined && normRole(body.role) !== normRole(target.role);
    const statusChange = body.status !== undefined && String(body.status).toLowerCase() !== String(target.status ?? "").toLowerCase();
    if ((roleChange || statusChange) && isSelf) {
      return reply.code(403).send({ success: false, message: "You can’t change your own role or status." });
    }
    if ((roleChange && (TOP_ROLES.has(normRole(body.role)) || targetTop)) && !callerTop) {
      return reply.code(403).send({ success: false, message: "Only an Admin or Owner can grant or remove Admin/Owner." });
    }
    if (targetTop && !callerTop && !isSelf) {
      return reply.code(403).send({ success: false, message: "Only an Admin or Owner can change an Admin or Owner’s account." });
    }
    if (statusChange && !["active", "inactive"].includes(String(body.status).toLowerCase())) {
      return reply.code(400).send({ success: false, message: "Status can only be set to Active or Inactive here. Use Approve / Reject for new joiners." });
    }
    const losingAdmin =
      normRole(target.role) === "admin" && String(target.status ?? "").toLowerCase() === "active" &&
      ((roleChange && normRole(body.role) !== "admin") || (statusChange && String(body.status).toLowerCase() !== "active"));
    if (losingAdmin && (await activeAdminCount(id)) === 0) {
      return reply.code(400).send({ success: false, message: "This is the last active Admin — make someone else Admin first." });
    }

    const empData: Record<string, any> = {};
    if (admin) {
      for (const k of ["firstName", "lastName", "officeEmail", "designation", "department", "role", "status"] as const) {
        if (body[k] !== undefined) empData[k] = typeof body[k] === "string" ? body[k].trim() : body[k];
      }
      if (body.hasAccountsAccess !== undefined) empData.hasAccountsAccess = Boolean(body.hasAccountsAccess);
    }
    const ids = (v: unknown) => (Array.isArray(v) ? [...new Set((v as unknown[]).filter((x): x is string => typeof x === "string" && !!x && x !== id))] : null);
    const mgrIds = admin ? ids(body.reportingManagerIds) : null;
    const ptrIds = admin ? ids(body.reportingPartnerIds) : null;
    const subIds = admin ? (ids(body.subManagerIds) ?? (body.subManagerId !== undefined ? (body.subManagerId ? [String(body.subManagerId)] : []) : null)) : null;
    if (mgrIds) Object.assign(empData, { reportingManagerIds: mgrIds, managerId: mgrIds[0] ?? null });
    if (ptrIds) Object.assign(empData, { reportingPartnerIds: ptrIds, partnerId: ptrIds[0] ?? null });
    if (subIds) Object.assign(empData, { subManagerIds: subIds, subManagerId: subIds[0] ?? null });

    // Profile fields: self → contact fields only; HR/Admin → everything
    const allowed: readonly string[] = admin ? [...SELF_EDITABLE, ...HR_ONLY] : SELF_EDITABLE;
    const profUpdate: Record<string, any> = {};
    for (const k of allowed) if (body[k] !== undefined) profUpdate[k] = body[k] === "" ? null : body[k];
    if (typeof profUpdate.pan === "string") profUpdate.pan = profUpdate.pan.toUpperCase();
    if (admin) {
      for (const k of ["dob", "doj"] as const) {
        if (body[k]) {
          const d = new Date(String(body[k]).slice(0, 10) + "T00:00:00.000Z");
          if (Number.isNaN(d.getTime())) return reply.code(400).send({ success: false, message: `${k === "dob" ? "Date of birth" : "Joining date"} isn’t a valid date.` });
          profUpdate[k] = d;
        }
      }
      if (body.salary !== undefined) profUpdate.salary = body.salary === null || body.salary === "" ? null : Number(body.salary);
    }
    if (Object.keys(profUpdate).length && !target.profile && !(profUpdate.dob && profUpdate.doj)) {
      return reply.code(400).send({ success: false, message: "This person has no profile yet. Add their date of birth and joining date to create it." });
    }

    await prisma.$transaction(async (tx) => {
      if (Object.keys(empData).length) await tx.employee.update({ where: { id }, data: empData });
      if (mgrIds) {
        await tx.employeeManager.deleteMany({ where: { employeeId: id } });
        if (mgrIds.length) await tx.employeeManager.createMany({ data: mgrIds.map((managerId) => ({ employeeId: id, managerId })), skipDuplicates: true });
      }
      if (ptrIds) {
        await tx.employeePartner.deleteMany({ where: { employeeId: id } });
        if (ptrIds.length) await tx.employeePartner.createMany({ data: ptrIds.map((partnerId) => ({ employeeId: id, partnerId })), skipDuplicates: true });
      }
      if (Object.keys(profUpdate).length) {
        if (target.profile) await tx.employeeProfile.update({ where: { employeeId: id }, data: profUpdate });
        else await tx.employeeProfile.create({ data: { employeeId: id, ...(profUpdate as { dob: Date; doj: Date }) } });
      }
    });

    if (roleChange || statusChange || body.hasAccountsAccess !== undefined) {
      await revokeSessions(id, roleChange ? "role changed" : statusChange ? "status changed" : "access changed");
    }
    forgetLiveAccount(id);

    const updated = await prisma.employee.findUnique({ where: { id }, select: { ...SAFE_EMPLOYEE_SELECT, profile: true } });
    return reply.send({ success: true, data: updated ? { ...updated, profile: profileFor(await viewLevel(u, id), updated.profile as ProfileRow) } : null });
  });

  // PATCH /api/employees/:id/toggle-status
  // Only Active ↔ Inactive; never yourself; HR can't switch off an Admin/Owner; keeps one Admin;
  // blocked while the person still holds firm assets (exit clearance).
  app.patch(
    "/api/employees/:id/toggle-status",
    { preHandler: [requireRoles(PEOPLE_ADMIN)] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const u = req.user!;
      if (id === u.id) return reply.code(403).send({ success: false, message: "You can’t deactivate your own account." });
      const emp = await prisma.employee.findUnique({ where: { id }, select: { id: true, status: true, role: true, firstName: true } });
      if (!emp) return reply.code(404).send({ success: false, message: "Employee not found" });
      const current = (emp.status ?? "").toLowerCase();
      if (!["active", "inactive"].includes(current)) {
        return reply.code(400).send({ success: false, message: "Only active or inactive accounts can be switched. Approve or reject new joiners instead." });
      }
      if (TOP_ROLES.has(normRole(emp.role)) && !TOP_ROLES.has(normRole(u.role))) {
        return reply.code(403).send({ success: false, message: "Only an Admin or Owner can change an Admin or Owner’s account." });
      }
      const deactivating = current === "active";
      if (deactivating && normRole(emp.role) === "admin" && (await activeAdminCount(id)) === 0) {
        return reply.code(400).send({ success: false, message: "This is the last active Admin — make someone else Admin first." });
      }
      if (deactivating) {
        const held = await prisma.assetAllocation.count({ where: { employeeId: id, status: "Allocated", returnedAt: null } });
        if (held) {
          return reply.code(409).send({
            success: false,
            message: `${emp.firstName} still holds ${held} firm asset${held === 1 ? "" : "s"}. Recover ${held === 1 ? "it" : "them"} in Asset Management before deactivating.`,
          });
        }
      }
      const updated = await prisma.employee.update({ where: { id }, data: { status: deactivating ? "Inactive" : "Active" }, select: SAFE_EMPLOYEE_SELECT });
      if (deactivating) await revokeSessions(id, "deactivated");
      else forgetLiveAccount(id);
      return reply.send({ success: true, data: updated });
    },
  );

  // POST /api/employees/approve-employee/:id
  // Approve a joiner who has completed registration (status Pending with a password set).
  app.post(
    "/api/employees/approve-employee/:id",
    { preHandler: [requireRoles(PEOPLE_ADMIN)] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const target = await prisma.employee.findUnique({ where: { id }, select: { status: true, password: true, role: true } });
      if (!target) return reply.code(404).send({ success: false, message: "Employee not found." });
      const st = (target.status ?? "").toLowerCase();
      if (!st.startsWith("pending") || !target.password) {
        return reply.code(400).send({
          success: false,
          message: st === "invited" ? "This person hasn’t completed registration yet." : `This account is ${target.status} — only registered joiners awaiting approval can be approved.`,
        });
      }
      if (TOP_ROLES.has(normRole(target.role)) && !TOP_ROLES.has(normRole(req.user!.role))) {
        return reply.code(403).send({ success: false, message: "Only an Admin or Owner can approve an Admin or Owner account." });
      }
      const emp = await prisma.employee.update({
        where: { id },
        data: { status: "Active", approvalStatus: "APPROVED", isApproved: true, approvedAt: new Date(), approvedBy: req.user!.id },
        select: SAFE_EMPLOYEE_SELECT,
      });
      forgetLiveAccount(id);
      // Leave balances come from the leave rules engine — nothing to create here.
      await createNotification({
        userId: id,
        title: "Account Approved",
        message: "Welcome aboard! Your account has been approved.",
        type: "account_approved",
        module: "HR",
        actionUrl: "/dashboard",
      });
      return reply.send({ success: true, data: emp });
    },
  );

  // Reject a pending joiner (or withdraw an invitation), with a reason.
  app.post(
    "/api/employees/reject-employee/:id",
    { preHandler: [requireRoles(PEOPLE_ADMIN)] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const reason = String(((req.body ?? {}) as { reason?: string }).reason ?? "").trim();
      const target = await prisma.employee.findUnique({ where: { id }, select: { status: true } });
      if (!target) return reply.code(404).send({ success: false, message: "Employee not found." });
      const st = (target.status ?? "").toLowerCase();
      if (!st.startsWith("pending") && st !== "invited") {
        return reply.code(400).send({ success: false, message: `This account is ${target.status} — use Deactivate for existing employees.` });
      }
      const updated = await prisma.$transaction(async (tx) => {
        await tx.registrationToken.updateMany({ where: { employeeId: id, isUsed: false }, data: { isUsed: true } });
        return tx.employee.update({ where: { id }, data: { status: "Rejected", approvalStatus: "REJECTED", isApproved: false }, select: SAFE_EMPLOYEE_SELECT });
      });
      await revokeSessions(id, "rejected");
      await createNotification({
        userId: id,
        title: "Registration not approved",
        message: reason ? `Your registration wasn’t approved: ${reason}` : "Your registration wasn’t approved. Please contact HR.",
        type: "account_rejected",
        module: "HR",
      });
      return reply.send({ success: true, data: updated, reason: reason || null });
    },
  );

  // Re-issue an invitation link (Invited or Rejected people only). Older links stop working.
  app.post(
    "/api/employees/resend-registration/:id",
    { preHandler: [requireRoles(PEOPLE_ADMIN)] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const emp = await prisma.employee.findUnique({ where: { id }, select: SAFE_EMPLOYEE_SELECT });
      if (!emp) return reply.code(404).send({ success: false, message: "Employee not found" });
      const st = (emp.status ?? "").toLowerCase();
      if (!["invited", "rejected"].includes(st)) {
        return reply.code(400).send({
          success: false,
          message: st.startsWith("pending") ? "This person has already registered — approve or reject them." : "This person already has an account. They can use “Forgot password” to sign in.",
        });
      }
      const token = crypto.randomBytes(32).toString("hex");
      await prisma.$transaction([
        prisma.registrationToken.updateMany({ where: { employeeId: id, isUsed: false }, data: { isUsed: true } }),
        prisma.registrationToken.create({ data: { token, email: emp.officeEmail, employeeId: emp.id, expiresAt: new Date(Date.now() + 7 * 24 * 3_600_000) } }),
        prisma.employee.update({ where: { id }, data: { status: "Invited", approvalStatus: "PENDING", isApproved: false } }),
      ]);
      forgetLiveAccount(id); // status changed: don't serve the cached account state
      return reply.send({
        success: true,
        emailStatus: "not_sent",
        inviteLink: inviteLink(token),
        message: "New invitation link created (older links no longer work). Email isn’t connected yet — copy the link and send it to the joiner.",
      });
    },
  );

  // Profile photo upload — never creates fake EmployeeProfile row (fixes P1)
  // POST /api/employees/profile-photo           — own photo (legacy path, used by the web app)
  // POST /api/employees/profile/photo/:employeeId — own photo, or anyone's for Admin/Owner/HR
  const uploadProfilePhoto = async (req: FastifyRequest, reply: FastifyReply, employeeId: string) => {
    const u = req.user!;
    const r = normRole(u.role);
    if (u.id !== employeeId && !["admin", "owner", "hr"].includes(r)) {
      return reply.code(403).send({ success: false, message: "Forbidden" });
    }

    let parsed;
    try {
      parsed = await parseBodyOrMultipart(req, "profile");
    } catch (err) {
      return reply.code(400).send({
        success: false,
        message: err instanceof Error ? err.message : "Invalid image upload",
      });
    }

    const file = parsed.files[0];
    if (!file) {
      return reply.code(400).send({ success: false, message: "No photo file provided." });
    }
    if (!PHOTO_MIME.has(file.mimeType) || !PHOTO_EXT.has(path.extname(file.savedName).toLowerCase())) {
      fs.rmSync(file.diskPath, { force: true });
      return reply.code(400).send({ success: false, message: "Use a JPG, PNG or WEBP image." });
    }

    const updated = await prisma.employee.update({
      where: { id: employeeId },
      data: { profileImage: file.filePath },
      select: SAFE_EMPLOYEE_SELECT,
    });

    const existingProf = await prisma.employeeProfile.findUnique({ where: { employeeId } });
    if (existingProf) {
      await prisma.employeeProfile.update({
        where: { employeeId },
        data: { profileImage: file.filePath },
      });
    }

    return reply.send({
      success: true,
      profileImage: updated.profileImage,
      data: { profileImage: updated.profileImage, employeePhotoUrl: updated.profileImage },
    });
  };

  app.post("/api/employees/profile-photo", { preHandler: [authenticate] }, (req, reply) =>
    uploadProfilePhoto(req, reply, req.user!.id),
  );
  app.post("/api/employees/profile/photo/:employeeId", { preHandler: [authenticate] }, (req, reply) =>
    uploadProfilePhoto(req, reply, (req.params as { employeeId: string }).employeeId),
  );

  // DELETE /api/employees/:id — restricted to Admin only (fixes M3, M7)
  app.delete("/api/employees/:id", { preHandler: [requireRoles(["admin", "owner"])] }, async (_req, reply) => {
    return reply.code(400).send({
      success: false,
      message: "To preserve historical timesheet and financial records, deactivate employees instead of deleting them.",
    });
  });

  // GET /api/employees/:employeeId/documents — ownership/role checked (fixes P4)
  app.get("/api/employees/:employeeId/documents", { preHandler: [authenticate] }, async (req, reply) => {
    const { employeeId } = req.params as { employeeId: string };
    if (!(await isTeamMemberOrSelf(req.user!, employeeId, { leadRolesOnly: true }))) {
      return reply.code(403).send({ success: false, message: "Access denied" });
    }
    const docs = await prisma.employeeDocument.findMany({
      where: { employeeId },
      orderBy: { uploadedAt: "desc" },
    });
    return reply.send({ success: true, data: docs });
  });

  // POST /api/employees/:employeeId/documents — ownership/role checked (fixes P4)
  app.post("/api/employees/:employeeId/documents", { preHandler: [authenticate] }, async (req, reply) => {
    const { employeeId } = req.params as { employeeId: string };
    if (!(await isTeamMemberOrSelf(req.user!, employeeId, { leadRolesOnly: true }))) {
      return reply.code(403).send({ success: false, message: "Access denied" });
    }
    let parsed;
    try {
      parsed = await parseBodyOrMultipart(req, "documents");
    } catch (err) {
      return reply.code(400).send({ success: false, message: err instanceof Error ? err.message : "Upload failed" });
    }
    const file = parsed.files[0];
    if (!file) {
      return reply.code(400).send({ success: false, message: "Document file is required." });
    }
    const doc = await prisma.employeeDocument.create({
      data: {
        employeeId,
        title: parsed.fields.title || file.fileName,
        category: parsed.fields.category || "Other",
        fileName: file.fileName,
        filePath: file.filePath,
        fileSize: file.fileSize,
        mimeType: file.mimeType,
        uploadedBy: req.user!.id,
      },
    });
    return reply.code(201).send({ success: true, data: doc });
  });

  // DELETE /api/employees/documents/:docId — ownership/role checked (fixes P4)
  app.delete("/api/employees/documents/:docId", { preHandler: [authenticate] }, async (req, reply) => {
    const { docId } = req.params as { docId: string };
    const doc = await prisma.employeeDocument.findUnique({ where: { id: docId } });
    if (!doc) return reply.code(404).send({ success: false, message: "Document not found" });
    if (!(await isTeamMemberOrSelf(req.user!, doc.employeeId, { leadRolesOnly: true }))) {
      return reply.code(403).send({ success: false, message: "Access denied" });
    }
    await prisma.employeeDocument.delete({ where: { id: docId } });
    // Remove the file too, so a deleted document can’t still be fetched by its link.
    const full = resolveUpload(doc.filePath);
    if (full) fs.rmSync(full, { force: true });
    return reply.send({ success: true, message: "Document removed." });
  });

  // GET /api/employees/documents/:docId/download — same access rule as viewing the documents list
  app.get("/api/employees/documents/:docId/download", { preHandler: [authenticate] }, async (req, reply) => {
    const { docId } = req.params as { docId: string };
    const doc = await prisma.employeeDocument.findUnique({ where: { id: docId } });
    if (!doc) return reply.code(404).send({ success: false, message: "Document not found" });
    if (!(await isTeamMemberOrSelf(req.user!, doc.employeeId, { leadRolesOnly: true }))) {
      return reply.code(403).send({ success: false, message: "Access denied" });
    }
    const full = resolveUpload(doc.filePath);
    if (!full) return reply.code(404).send({ success: false, message: "The file is missing from storage." });
    return sendUpload(reply, full, doc.fileName);
  });
}
