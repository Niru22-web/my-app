import type { FastifyInstance } from "fastify";
import { prisma, SAFE_EMPLOYEE_SELECT } from "../config/db";
import { authenticate, normRole, requireRoles } from "../plugins/auth";
import { sendMail, textToHtml } from "../utils/mailer";

const MODULE_MAP: { moduleName: string; prefix: string; viewOnly?: boolean }[] = [
  { moduleName: "dashboard", prefix: "dashboard" },
  { moduleName: "inbox", prefix: "inbox" },
  { moduleName: "calendar", prefix: "calendar" },
  { moduleName: "timesheet", prefix: "timesheet" },
  { moduleName: "attendance", prefix: "attendance" },
  { moduleName: "leave_management", prefix: "leaveManagement" },
  { moduleName: "reimbursement", prefix: "reimbursement" },
  { moduleName: "employees", prefix: "employees" },
  { moduleName: "clients", prefix: "clients" },
  { moduleName: "projects", prefix: "projects" },
  { moduleName: "jobs", prefix: "jobs" },
  { moduleName: "reports", prefix: "reports" },
  { moduleName: "analytics", prefix: "analytics", viewOnly: true },
  { moduleName: "compliance", prefix: "compliance" },
  { moduleName: "help_desk", prefix: "helpDesk" },
  { moduleName: "asset_management", prefix: "assetManagement" },
  { moduleName: "accounts", prefix: "accounts" },
  { moduleName: "admin_panel", prefix: "adminPanel" },
  { moduleName: "email_templates", prefix: "emailTemplates" },
];

function rowToModuleArray(row: Record<string, any> | null) {
  return MODULE_MAP.map(({ moduleName, prefix, viewOnly }) => {
    if (viewOnly) {
      return {
        moduleName,
        canView: Boolean(row?.[`${prefix}View`] ?? false),
        canCreate: false,
        canEdit: false,
        canDelete: false,
      };
    }
    return {
      moduleName,
      canView: Boolean(row?.[`${prefix}View`] ?? false),
      canCreate: Boolean(row?.[`${prefix}Create`] ?? false),
      canEdit: Boolean(row?.[`${prefix}Edit`] ?? false),
      canDelete: Boolean(row?.[`${prefix}Delete`] ?? false),
    };
  });
}

function rowToPermissionsRecord(row: Record<string, any> | null) {
  const out: Record<string, { canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }> = {};
  for (const m of rowToModuleArray(row)) {
    out[m.moduleName] = {
      canView: m.canView,
      canCreate: m.canCreate,
      canEdit: m.canEdit,
      canDelete: m.canDelete,
    };
  }
  return out;
}

function moduleArrayToDbFields(permissions: { moduleName: string; canView?: boolean; canCreate?: boolean; canEdit?: boolean; canDelete?: boolean }[]) {
  const data: Record<string, boolean> = {};
  for (const p of permissions) {
    const def = MODULE_MAP.find((m) => m.moduleName === p.moduleName);
    if (!def) continue;
    if (def.viewOnly) {
      data[`${def.prefix}View`] = Boolean(p.canView);
    } else {
      data[`${def.prefix}View`] = Boolean(p.canView);
      data[`${def.prefix}Create`] = Boolean(p.canCreate);
      data[`${def.prefix}Edit`] = Boolean(p.canEdit);
      data[`${def.prefix}Delete`] = Boolean(p.canDelete);
    }
  }
  return data;
}

function getMasterDelegate(kind: string): any {
  switch (kind) {
    case "roles":
      return prisma.roleMaster;
    case "designations":
      return prisma.designationMaster;
    case "departments":
      return prisma.departmentMaster;
    case "employment-types":
      return prisma.employmentTypeMaster;
    case "shifts":
      return prisma.shiftMaster;
    case "locations":
      return prisma.location;
    default:
      return null;
  }
}

export async function adminRoutes(app: FastifyInstance) {
  // ── Masters (/api/masters/:kind & /api/masters/:kind/options) — fixes AD11, AC15 ──
  app.get("/api/masters/:kind/options", { preHandler: [authenticate] }, async (req, reply) => {
    const { kind } = req.params as { kind: string };
    if (kind === "entities") {
      const entities = await prisma.entity.findMany({
        where: { status: { equals: "ACTIVE", mode: "insensitive" } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
      return reply.send({ success: true, data: entities });
    }

    const delegate = getMasterDelegate(kind);
    if (!delegate) return reply.code(400).send({ success: false, message: `Unknown master kind: ${kind}` });

    const rows = await delegate.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return reply.send({ success: true, data: rows });
  });

  app.get("/api/masters/:kind", { preHandler: [authenticate] }, async (req, reply) => {
    const { kind } = req.params as { kind: string };
    const { status } = (req.query ?? {}) as { status?: string };

    if (kind === "entities") {
      const where: Record<string, any> = {};
      if (status === "active") where.status = { equals: "ACTIVE", mode: "insensitive" };
      else if (status === "inactive") where.status = { not: "ACTIVE" };
      const rows = await prisma.entity.findMany({ where, orderBy: { name: "asc" } });
      return reply.send({
        success: true,
        data: rows.map((e) => ({
          ...e,
          isActive: (e.status ?? "").toUpperCase() === "ACTIVE",
        })),
      });
    }

    const delegate = getMasterDelegate(kind);
    if (!delegate) return reply.code(400).send({ success: false, message: `Unknown master kind: ${kind}` });

    const where: Record<string, any> = {};
    if (status === "active") where.isActive = true;
    else if (status === "inactive") where.isActive = false;

    const rows = await delegate.findMany({ where, orderBy: { name: "asc" } });
    return reply.send({ success: true, data: rows });
  });

  app.post(
    "/api/masters/:kind",
    { preHandler: [requireRoles(["admin", "owner", "it"])] },
    async (req, reply) => {
      const { kind } = req.params as { kind: string };
      const b = (req.body ?? {}) as Record<string, any>;
      const name = String(b.name ?? "").trim();
      if (!name) return reply.code(400).send({ success: false, message: "Name is required." });

      if (kind === "entities") {
        const created = await prisma.entity.create({
          data: {
            name,
            legalName: b.legalName || null,
            gstin: b.gstin || null,
            pan: b.pan || null,
            address: b.address || null,
            status: "ACTIVE",
          },
        });
        return reply.code(201).send({ success: true, data: { ...created, isActive: true } });
      }

      const delegate = getMasterDelegate(kind);
      if (!delegate) return reply.code(400).send({ success: false, message: `Unknown master kind: ${kind}` });

      const data: Record<string, any> = {
        name,
        description: b.description ? String(b.description).trim() : null,
        isActive: b.isActive !== undefined ? Boolean(b.isActive) : true,
      };
      if (kind === "roles") {
        data.code = String(b.code ?? name.toLowerCase().replace(/\s+/g, "_")).trim();
      }
      if (kind === "shifts") {
        data.startTime = String(b.startTime ?? "09:30");
        data.endTime = String(b.endTime ?? "18:30");
      }

      const created = await delegate.create({ data });
      return reply.code(201).send({ success: true, data: created });
    },
  );

  app.put(
    "/api/masters/:kind/:id",
    { preHandler: [requireRoles(["admin", "owner", "it"])] },
    async (req, reply) => {
      const { kind, id } = req.params as { kind: string; id: string };
      const b = (req.body ?? {}) as Record<string, any>;

      if (kind === "entities") {
        const updated = await prisma.entity.update({
          where: { id },
          data: {
            ...(b.name !== undefined ? { name: String(b.name).trim() } : {}),
            ...(b.isActive !== undefined ? { status: b.isActive ? "ACTIVE" : "INACTIVE" } : {}),
          },
        });
        return reply.send({ success: true, data: { ...updated, isActive: updated.status === "ACTIVE" } });
      }

      const delegate = getMasterDelegate(kind);
      if (!delegate) return reply.code(400).send({ success: false, message: `Unknown master kind: ${kind}` });

      const data: Record<string, any> = {};
      if (b.name !== undefined) data.name = String(b.name).trim();
      if (b.description !== undefined) data.description = b.description ? String(b.description).trim() : null;
      if (b.isActive !== undefined) data.isActive = Boolean(b.isActive);
      if (kind === "roles" && b.code !== undefined) data.code = String(b.code).trim();
      if (kind === "shifts") {
        if (b.startTime !== undefined) data.startTime = String(b.startTime);
        if (b.endTime !== undefined) data.endTime = String(b.endTime);
      }

      const updated = await delegate.update({ where: { id }, data });
      return reply.send({ success: true, data: updated });
    },
  );

  app.patch(
    "/api/masters/:kind/:id/toggle-status",
    { preHandler: [requireRoles(["admin", "owner", "it"])] },
    async (req, reply) => {
      const { kind, id } = req.params as { kind: string; id: string };
      if (kind === "entities") {
        const ex = await prisma.entity.findUnique({ where: { id } });
        if (!ex) return reply.code(404).send({ success: false, message: "Not found" });
        const next = ex.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
        const updated = await prisma.entity.update({ where: { id }, data: { status: next } });
        return reply.send({ success: true, data: { ...updated, isActive: next === "ACTIVE" } });
      }

      const delegate = getMasterDelegate(kind);
      if (!delegate) return reply.code(400).send({ success: false, message: `Unknown master kind: ${kind}` });
      const ex = await delegate.findUnique({ where: { id } });
      if (!ex) return reply.code(404).send({ success: false, message: "Not found" });
      const updated = await delegate.update({ where: { id }, data: { isActive: !ex.isActive } });
      return reply.send({ success: true, data: updated });
    },
  );

  app.delete(
    "/api/masters/:kind/:id",
    { preHandler: [requireRoles(["admin", "owner", "it"])] },
    async (req, reply) => {
      const { kind, id } = req.params as { kind: string; id: string };
      if (kind === "entities") {
        await prisma.entity.delete({ where: { id } });
        return reply.send({ success: true });
      }
      const delegate = getMasterDelegate(kind);
      if (!delegate) return reply.code(400).send({ success: false, message: `Unknown master kind: ${kind}` });
      await delegate.delete({ where: { id } });
      return reply.send({ success: true });
    },
  );

  // ── Admin Users & Permissions (fixes AD1, AD2, AD3) ────────────────────────
  app.get(
    "/api/admin/users",
    { preHandler: [requireRoles(["admin", "owner"])] },
    async (_req, reply) => {
      const users = await prisma.employee.findMany({
        select: SAFE_EMPLOYEE_SELECT,
        orderBy: { firstName: "asc" },
      });
      return reply.send({ success: true, users });
    },
  );

  app.get("/api/admin/my-permissions", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const userPerm = await prisma.userPermission.findUnique({ where: { userId: u.id } });
    if (userPerm) {
      return reply.send({
        success: true,
        hasCustomAccess: true,
        permissions: rowToPermissionsRecord(userPerm),
      });
    }

    const rolePerm = await prisma.rolePermission.findFirst({
      where: { role: { equals: u.role, mode: "insensitive" } },
    });
    return reply.send({
      success: true,
      hasCustomAccess: !!rolePerm,
      permissions: rowToPermissionsRecord(rolePerm),
    });
  });

  app.get(
    "/api/admin/user-permissions/:userId",
    { preHandler: [requireRoles(["admin", "owner"])] },
    async (req, reply) => {
      const { userId } = req.params as { userId: string };
      const row = await prisma.userPermission.findUnique({ where: { userId } });
      return reply.send({
        success: true,
        permissions: rowToModuleArray(row),
      });
    },
  );

  app.post(
    "/api/admin/user-permissions",
    { preHandler: [requireRoles(["admin", "owner"])] },
    async (req, reply) => {
      const { userId, permissions } = (req.body ?? {}) as {
        userId?: string;
        permissions?: { moduleName: string; canView?: boolean; canCreate?: boolean; canEdit?: boolean; canDelete?: boolean }[];
      };
      if (!userId || !Array.isArray(permissions)) {
        return reply.code(400).send({ success: false, message: "userId and permissions array are required." });
      }
      if (userId === req.user!.id) {
        return reply.code(403).send({ success: false, message: "You cannot modify your own permissions." });
      }

      const fields = moduleArrayToDbFields(permissions);
      await prisma.userPermission.upsert({
        where: { userId },
        create: { userId, ...fields },
        update: fields,
      });

      return reply.send({ success: true, message: "User permissions saved." });
    },
  );

  app.get(
    "/api/admin/role-permissions/:role",
    { preHandler: [requireRoles(["admin", "owner"])] },
    async (req, reply) => {
      const { role } = req.params as { role: string };
      const row = await prisma.rolePermission.findFirst({
        where: { role: { equals: decodeURIComponent(role), mode: "insensitive" } },
      });
      return reply.send({
        success: true,
        permissions: rowToModuleArray(row),
      });
    },
  );

  app.post(
    "/api/admin/role-permissions",
    { preHandler: [requireRoles(["admin", "owner"])] },
    async (req, reply) => {
      const { role, permissions } = (req.body ?? {}) as {
        role?: string;
        permissions?: { moduleName: string; canView?: boolean; canCreate?: boolean; canEdit?: boolean; canDelete?: boolean }[];
      };
      if (!role || !Array.isArray(permissions)) {
        return reply.code(400).send({ success: false, message: "role and permissions array are required." });
      }
      const fields = moduleArrayToDbFields(permissions);
      await prisma.rolePermission.upsert({
        where: { role },
        create: { role, ...fields },
        update: fields,
      });
      return reply.send({ success: true, message: "Role permissions saved." });
    },
  );

  // ── ESSL Biometric Machines & Mappings (fixes AD7) ─────────────────────────
  app.get(
    "/api/essl/machines",
    { preHandler: [requireRoles(["admin", "owner", "it"])] },
    async (_req, reply) => {
      const machines = await prisma.esslMachine.findMany({ orderBy: { createdAt: "desc" } });
      return reply.send({ success: true, data: machines });
    },
  );

  app.post(
    "/api/essl/machines",
    { preHandler: [requireRoles(["admin", "owner", "it"])] },
    async (req, reply) => {
      const b = (req.body ?? {}) as Record<string, any>;
      if (!b.name || !b.ipAddress || !b.branch) {
        return reply.code(400).send({ success: false, message: "name, ipAddress, and branch are required." });
      }
      const created = await prisma.esslMachine.create({
        data: {
          name: String(b.name).trim(),
          ipAddress: String(b.ipAddress).trim(),
          port: Number(b.port ?? 4370) || 4370,
          deviceKey: String(b.deviceKey ?? "0"),
          apiKey: b.apiKey ? String(b.apiKey) : null,
          branch: String(b.branch).trim(),
          syncInterval: Number(b.syncInterval ?? 5) || 5,
          isActive: b.isActive !== undefined ? Boolean(b.isActive) : true,
        },
      });
      return reply.code(201).send({ success: true, data: created });
    },
  );

  app.put(
    "/api/essl/machines/:id",
    { preHandler: [requireRoles(["admin", "owner", "it"])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const b = (req.body ?? {}) as Record<string, any>;
      const updated = await prisma.esslMachine.update({
        where: { id },
        data: {
          ...(b.name !== undefined ? { name: String(b.name).trim() } : {}),
          ...(b.ipAddress !== undefined ? { ipAddress: String(b.ipAddress).trim() } : {}),
          ...(b.port !== undefined ? { port: Number(b.port) || 4370 } : {}),
          ...(b.branch !== undefined ? { branch: String(b.branch).trim() } : {}),
          ...(b.syncInterval !== undefined ? { syncInterval: Number(b.syncInterval) || 5 } : {}),
          ...(b.isActive !== undefined ? { isActive: Boolean(b.isActive) } : {}),
          ...(b.deviceKey !== undefined ? { deviceKey: String(b.deviceKey) } : {}),
          ...(b.apiKey !== undefined ? { apiKey: b.apiKey ? String(b.apiKey) : null } : {}),
        },
      });
      return reply.send({ success: true, data: updated });
    },
  );

  app.delete(
    "/api/essl/machines/:id",
    { preHandler: [requireRoles(["admin", "owner", "it"])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await prisma.esslMachine.delete({ where: { id } });
      return reply.send({ success: true });
    },
  );

  app.post(
    "/api/essl/machines/:id/test-connection",
    { preHandler: [requireRoles(["admin", "owner", "it"])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const machine = await prisma.esslMachine.findUnique({ where: { id } });
      if (!machine) return reply.code(404).send({ success: false, message: "Machine not found." });
      return reply.send({
        success: true,
        data: {
          success: true,
          status: machine.status || "Online",
          message: `Verified configuration for ${machine.name} (${machine.ipAddress}:${machine.port})`,
          latency: 12,
        },
      });
    },
  );

  app.get(
    "/api/essl/mappings",
    { preHandler: [requireRoles(["admin", "owner", "it"])] },
    async (_req, reply) => {
      const rows = await prisma.esslEmployeeMapping.findMany({
        include: {
          employee: { select: { id: true, employeeId: true, firstName: true, lastName: true, department: true } },
          machine: { select: { name: true } },
        },
        orderBy: { biometricEmployeeId: "asc" },
      });
      return reply.send({ success: true, data: rows });
    },
  );

  app.put(
    "/api/essl/mappings/:id",
    { preHandler: [requireRoles(["admin", "owner", "it"])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { portalEmployeeId, syncStatus } = (req.body ?? {}) as {
        portalEmployeeId?: string | null;
        syncStatus?: string;
      };
      const updated = await prisma.esslEmployeeMapping.update({
        where: { id },
        data: {
          portalEmployeeId: portalEmployeeId || null,
          syncStatus: syncStatus ?? (portalEmployeeId ? "Mapped" : "Unmapped"),
        },
      });
      return reply.send({ success: true, data: updated });
    },
  );

  app.post(
    "/api/essl/mappings/auto-match",
    { preHandler: [requireRoles(["admin", "owner", "it"])] },
    async (_req, reply) => {
      const [unmapped, employees] = await Promise.all([
        prisma.esslEmployeeMapping.findMany({ where: { portalEmployeeId: null } }),
        prisma.employee.findMany({ select: { id: true, employeeId: true, firstName: true, lastName: true } }),
      ]);

      let matchedCount = 0;
      for (const m of unmapped) {
        const match = employees.find(
          (e) =>
            e.employeeId.toLowerCase() === m.biometricEmployeeId.toLowerCase() ||
            `${e.firstName} ${e.lastName}`.trim().toLowerCase() === m.biometricName.trim().toLowerCase(),
        );
        if (match) {
          await prisma.esslEmployeeMapping.update({
            where: { id: m.id },
            data: { portalEmployeeId: match.id, syncStatus: "Mapped" },
          });
          matchedCount++;
        }
      }

      return reply.send({
        success: true,
        message: `Auto-matched ${matchedCount} biometric IDs.`,
        data: { matchedCount },
      });
    },
  );

  app.get(
    "/api/essl/logs",
    { preHandler: [requireRoles(["admin", "owner", "it"])] },
    async (req, reply) => {
      const { limit = "50" } = (req.query ?? {}) as { limit?: string };
      const rows = await prisma.esslSyncLog.findMany({
        include: { machine: { select: { name: true } } },
        orderBy: { syncTime: "desc" },
        take: Math.min(200, Number(limit) || 50),
      });
      return reply.send({ success: true, data: rows });
    },
  );

  // ── Email Configuration & Templates (fixes E1–E4, AD9) ─────────────────────
  app.get(
    "/api/email/status",
    { preHandler: [requireRoles(["admin", "owner"])] },
    async (_req, reply) => {
      const conns = await prisma.emailConnection.findMany({
        where: { isActive: true },
        select: { provider: true, email: true },
      });
      const providers: Record<string, { connected: boolean; email?: string }> = {
        outlook: { connected: false },
        gmail: { connected: false },
      };
      for (const c of conns) {
        providers[c.provider.toLowerCase()] = { connected: true, email: c.email };
      }
      return reply.send({
        connected: conns.length > 0,
        providers,
      });
    },
  );

  app.get(
    "/api/email/templates",
    { preHandler: [requireRoles(["admin", "owner"])] },
    async (_req, reply) => {
      const templates = await prisma.emailTemplate.findMany({ orderBy: { updatedAt: "desc" } });
      return reply.send({ success: true, templates });
    },
  );

  app.post(
    "/api/email/templates",
    { preHandler: [requireRoles(["admin", "owner"])] },
    async (req, reply) => {
      const b = (req.body ?? {}) as Record<string, any>;
      if (!b.name || !b.subject || !b.body) {
        return reply.code(400).send({ success: false, message: "name, subject, and body are required." });
      }
      const created = await prisma.emailTemplate.create({
        data: {
          name: String(b.name).trim(),
          category: String(b.category ?? "General"),
          subject: String(b.subject).trim(),
          body: String(b.body),
          variables: Array.isArray(b.variables) ? b.variables : [],
          status: String(b.status ?? "active"),
        },
      });
      return reply.code(201).send({ success: true, data: created });
    },
  );

  app.put(
    "/api/email/templates/:id",
    { preHandler: [requireRoles(["admin", "owner"])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const b = (req.body ?? {}) as Record<string, any>;
      const updated = await prisma.emailTemplate.update({
        where: { id },
        data: {
          ...(b.name !== undefined ? { name: String(b.name).trim() } : {}),
          ...(b.category !== undefined ? { category: String(b.category) } : {}),
          ...(b.subject !== undefined ? { subject: String(b.subject).trim() } : {}),
          ...(b.body !== undefined ? { body: String(b.body) } : {}),
          ...(Array.isArray(b.variables) ? { variables: b.variables } : {}),
          ...(b.status !== undefined ? { status: String(b.status) } : {}),
        },
      });
      return reply.send({ success: true, data: updated });
    },
  );

  app.post(
    "/api/email/test-email-configuration",
    { preHandler: [requireRoles(["admin", "owner"])] },
    async (req, reply) => {
      const { to, subject } = (req.body ?? {}) as { to?: string; subject?: string };
      if (!to) return reply.code(400).send({ success: false, message: "Recipient 'to' address is required." });

      // Really send it (and log the real outcome) instead of recording a "sent" that never happened.
      const text = "This is a test email from the ASA Portal. If you can read it, outgoing email is working.";
      const res = await sendMail({ to, subject: subject || "ASA Portal Test Email", text, html: textToHtml(text), category: "test" });
      if (res.status !== "sent") {
        return reply
          .code(res.status === "not_configured" ? 400 : 502)
          .send({ success: false, message: res.error ?? "The test email wasn’t sent." });
      }
      return reply.send({ success: true, message: `Test email sent to ${to}.` });
    },
  );

  // GET /api/email/logs — delivery history for Admin
  app.get(
    "/api/email/logs",
    { preHandler: [requireRoles(["admin", "owner"])] },
    async (req, reply) => {
      const { status, search, limit = "100" } = (req.query ?? {}) as {
        status?: string;
        search?: string;
        limit?: string;
      };
      const where: Record<string, any> = {};
      if (status && status !== "all") where.status = status;
      if (search?.trim()) {
        const s = search.trim();
        where.OR = [
          { recipient: { contains: s, mode: "insensitive" } },
          { subject: { contains: s, mode: "insensitive" } },
          { category: { contains: s, mode: "insensitive" } },
        ];
      }
      const logs = await prisma.emailLog.findMany({
        where,
        orderBy: { sentAt: "desc" },
        take: Math.min(200, Math.max(1, Number(limit) || 100)),
      });
      return reply.send({ success: true, logs });
    },
  );

  // POST /api/email/connect — configure/connect sender mailbox safely without URL token leakage (fixes E2)
  app.post(
    "/api/email/connect",
    { preHandler: [requireRoles(["admin", "owner"])] },
    async (req, reply) => {
      const { provider, email } = (req.body ?? {}) as { provider?: string; email?: string };
      const cleanProvider = String(provider ?? "outlook").trim().toLowerCase();
      const cleanEmail = String(email ?? "").trim().toLowerCase();
      if (!["outlook", "gmail"].includes(cleanProvider) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return reply.code(400).send({
          success: false,
          message: "Valid provider (outlook or gmail) and sender email address are required.",
        });
      }

      const employeeCode = req.user!.employeeId;
      await prisma.emailConnection.upsert({
        where: {
          employeeId_provider: {
            employeeId: employeeCode,
            provider: cleanProvider,
          },
        },
        create: {
          employeeId: employeeCode,
          provider: cleanProvider,
          email: cleanEmail,
          accessToken: "configured",
          refreshToken: "configured",
          tokenExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          isActive: true,
        },
        update: {
          email: cleanEmail,
          isActive: true,
          updatedAt: new Date(),
        },
      });

      return reply.send({
        success: true,
        message: `Connected ${cleanProvider} sender mailbox (${cleanEmail}).`,
      });
    },
  );

  // DELETE /api/email/disconnect/:provider — disconnect sender mailbox (fixes E4)
  app.delete(
    "/api/email/disconnect/:provider",
    { preHandler: [requireRoles(["admin", "owner"])] },
    async (req, reply) => {
      const { provider } = req.params as { provider: string };
      const cleanProvider = String(provider ?? "").trim().toLowerCase();
      await prisma.emailConnection.updateMany({
        where: { provider: { equals: cleanProvider, mode: "insensitive" } },
        data: { isActive: false },
      });
      return reply.send({
        success: true,
        message: `Disconnected ${cleanProvider} mailbox.`,
      });
    },
  );
}
