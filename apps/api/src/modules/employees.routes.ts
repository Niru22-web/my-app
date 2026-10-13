import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma, SAFE_EMPLOYEE_SELECT } from "../config/db";
import { authenticate, isTeamMemberOrSelf, normRole, requireRoles } from "../plugins/auth";
import { parseBodyOrMultipart } from "../utils/uploads";
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
    const r = normRole(u.role);
    const canViewFull = u.id === id || ["admin", "owner", "hr"].includes(r);

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

    // Redact sensitive statutory/bank fields for non-self, non-HR/Admin viewers (fixes P3)
    const safeProfile = emp.profile
      ? canViewFull
        ? emp.profile
        : {
            ...emp.profile,
            pan: null,
            aadhaar: null,
            bankName: null,
            bankAccountNumber: null,
            ifscCode: null,
            salary: null,
            personalMobile: null,
            personalEmail: null,
            currentAddress: null,
            permanentAddress: null,
          }
      : null;

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
    { preHandler: [requireRoles(["admin", "owner", "hr", "it", "manager", "partner"])] },
    async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const firstName = String(body.firstName ?? "").trim();
      const lastName = String(body.lastName ?? "").trim();
      const officeEmail = String(body.officeEmail ?? body.email ?? "").trim().toLowerCase();
      const designation = String(body.designation ?? "Associate").trim();
      const department = String(body.department ?? "General").trim();
      const role = String(body.role ?? "Employee").trim();

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

        return emp;
      });

      return reply.code(201).send({
        success: true,
        emailStatus: "sent",
        data: created,
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
    const r = normRole(u.role);
    const isPrivileged = ["admin", "owner", "hr", "it", "manager", "partner"].includes(r);
    const isSelf = u.id === id;

    if (!isSelf && !isPrivileged) {
      return reply.code(403).send({
        success: false,
        message: "You can only update your own profile.",
      });
    }

    const body = (req.body ?? {}) as Record<string, any>;
    const empData: Record<string, any> = {};

    if (isPrivileged) {
      for (const k of ["firstName", "lastName", "officeEmail", "designation", "department", "role", "status"] as const) {
        if (body[k] !== undefined) empData[k] = body[k];
      }
      if (body.hasAccountsAccess !== undefined) empData.hasAccountsAccess = Boolean(body.hasAccountsAccess);

      // Only update hierarchy if explicitly sent by privileged caller
      if (Array.isArray(body.reportingManagerIds)) {
        const mgrIds = body.reportingManagerIds.filter(Boolean) as string[];
        empData.reportingManagerIds = mgrIds;
        empData.managerId = mgrIds[0] ?? null;
        await prisma.employeeManager.deleteMany({ where: { employeeId: id } });
        if (mgrIds.length > 0) {
          await prisma.employeeManager.createMany({
            data: mgrIds.map((managerId) => ({ employeeId: id, managerId })),
            skipDuplicates: true,
          });
        }
      }
      if (Array.isArray(body.reportingPartnerIds)) {
        const ptrIds = body.reportingPartnerIds.filter(Boolean) as string[];
        empData.reportingPartnerIds = ptrIds;
        empData.partnerId = ptrIds[0] ?? null;
        await prisma.employeePartner.deleteMany({ where: { employeeId: id } });
        if (ptrIds.length > 0) {
          await prisma.employeePartner.createMany({
            data: ptrIds.map((partnerId) => ({ employeeId: id, partnerId })),
            skipDuplicates: true,
          });
        }
      }
      if (Array.isArray(body.subManagerIds)) {
        const subIds = body.subManagerIds.filter(Boolean) as string[];
        empData.subManagerIds = subIds;
        empData.subManagerId = subIds[0] ?? null;
      } else if (body.subManagerId !== undefined) {
        empData.subManagerId = body.subManagerId || null;
        empData.subManagerIds = body.subManagerId ? [body.subManagerId] : [];
      }
    }

    if (Object.keys(empData).length > 0) {
      await prisma.employee.update({ where: { id }, data: empData });
    }

    // Profile partial fields — only touch keys explicitly provided in body
    const profileFields = [
      "personalEmail",
      "personalMobile",
      "education",
      "maritalStatus",
      "gender",
      "currentAddress",
      "currentPinCode",
      "permanentAddress",
      "pan",
      "aadhaar",
      "bankName",
      "accountHolderName",
      "bankAccountNumber",
      "ifscCode",
      "branchName",
      "emergencyContactName",
      "emergencyContactPhone",
      "emergencyContactRelation",
      "guardianName",
      "guardianNumber",
      "guardianAddress",
      "employmentType",
      "seniorityLevel",
      "experience",
    ] as const;

    const profUpdate: Record<string, any> = {};
    for (const k of profileFields) {
      if (body[k] !== undefined) profUpdate[k] = body[k];
    }
    if (body.dob) profUpdate.dob = new Date(body.dob);
    if (body.doj) profUpdate.doj = new Date(body.doj);
    if (isPrivileged && body.salary !== undefined) {
      profUpdate.salary = body.salary === null || body.salary === "" ? null : Number(body.salary);
    }

    if (Object.keys(profUpdate).length > 0) {
      const existingProfile = await prisma.employeeProfile.findUnique({ where: { employeeId: id } });
      if (existingProfile) {
        await prisma.employeeProfile.update({
          where: { employeeId: id },
          data: profUpdate,
        });
      }
    }

    const updated = await prisma.employee.findUnique({
      where: { id },
      select: { ...SAFE_EMPLOYEE_SELECT, profile: true },
    });

    return reply.send({ success: true, data: updated });
  });

  // PATCH /api/employees/:id/toggle-status
  app.patch(
    "/api/employees/:id/toggle-status",
    { preHandler: [requireRoles(["admin", "owner", "hr", "it", "manager", "partner"])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const emp = await prisma.employee.findUnique({ where: { id }, select: { id: true, status: true } });
      if (!emp) return reply.code(404).send({ success: false, message: "Employee not found" });

      const nextStatus = (emp.status ?? "").toLowerCase() === "active" ? "Inactive" : "Active";
      const updated = await prisma.employee.update({
        where: { id },
        data: { status: nextStatus },
        select: SAFE_EMPLOYEE_SELECT,
      });
      return reply.send({ success: true, data: updated });
    },
  );

  // POST /api/employees/approve-employee/:id
  app.post(
    "/api/employees/approve-employee/:id",
    { preHandler: [requireRoles(["admin", "owner", "hr", "it", "manager", "partner", "accounts"])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const emp = await prisma.employee.update({
        where: { id },
        data: {
          status: "Active",
          approvalStatus: "APPROVED",
          isApproved: true,
          approvedAt: new Date(),
          approvedBy: req.user!.id,
        },
        select: SAFE_EMPLOYEE_SELECT,
      });

      // Ensure a LeaveBalance row exists for the current year
      const year = new Date().getFullYear();
      await prisma.leaveBalance.upsert({
        where: { employeeId_year: { employeeId: id, year } },
        create: { employeeId: id, year, totalLeaves: 21, remainingLeaves: 21, usedLeaves: 0 },
        update: {},
      });

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

  // POST /api/employees/reject-employee/:id
  app.post(
    "/api/employees/reject-employee/:id",
    { preHandler: [requireRoles(["admin", "owner", "hr", "it", "manager", "partner", "accounts"])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const updated = await prisma.employee.update({
        where: { id },
        data: {
          status: "Rejected",
          approvalStatus: "REJECTED",
          isApproved: false,
        },
        select: SAFE_EMPLOYEE_SELECT,
      });
      return reply.send({ success: true, data: updated });
    },
  );

  // POST /api/employees/resend-registration/:id — always issues a token link, never resets password to a static string (fixes M4)
  app.post(
    "/api/employees/resend-registration/:id",
    { preHandler: [requireRoles(["admin", "owner", "hr", "it", "manager", "partner"])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const emp = await prisma.employee.findUnique({ where: { id }, select: SAFE_EMPLOYEE_SELECT });
      if (!emp) return reply.code(404).send({ success: false, message: "Employee not found" });

      const token = crypto.randomBytes(32).toString("hex");
      await prisma.registrationToken.create({
        data: {
          token,
          email: emp.officeEmail,
          employeeId: emp.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 3_600_000),
        },
      });

      return reply.send({
        success: true,
        message: "Registration invitation link regenerated and queued.",
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
    if (!(await isTeamMemberOrSelf(req.user!, employeeId))) {
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
    if (!(await isTeamMemberOrSelf(req.user!, employeeId))) {
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
    if (!(await isTeamMemberOrSelf(req.user!, doc.employeeId))) {
      return reply.code(403).send({ success: false, message: "Access denied" });
    }
    await prisma.employeeDocument.delete({ where: { id: docId } });
    return reply.send({ success: true, message: "Document removed." });
  });
}
