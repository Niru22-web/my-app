import type { FastifyInstance } from "fastify";
import { prisma } from "../config/db";
import { authenticate, isTeamMemberOrSelf, normRole, requireRoles } from "../plugins/auth";
import { parseBodyOrMultipart } from "../utils/uploads";
import { createNotification } from "../utils/notify";

function isSupportRole(role?: string | null): boolean {
  const r = normRole(role);
  return r === "admin" || r === "owner" || r === "it" || r.includes("support");
}

async function nextTicketCode(): Promise<string> {
  const rows = await prisma.ticket.findMany({ select: { ticketId: true } });
  let max = 0;
  for (const r of rows) {
    const m = (r.ticketId ?? "").match(/(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  return `TKT-${String(max + 1).padStart(4, "0")}`;
}

function mapCategory(c: any): any {
  return {
    id: c.id,
    categoryName: c.category_name,
    description: c.description,
    isActive: c.is_active,
    displayOrder: c.display_order,
    parentId: c.parent_id,
    assignedTeam: c.assigned_team,
    slaHours: c.sla_hours,
    supportEmail: c.support_email,
    ccEmail: c.cc_email,
    escalationEmail: c.escalation_email,
    autoAssignUserId: c.auto_assign_user_id,
    ...(c.children ? { children: c.children.map(mapCategory) } : {}),
  };
}

const TICKET_INCLUDE = {
  createdBy: {
    select: {
      id: true,
      employeeId: true,
      firstName: true,
      lastName: true,
      department: true,
    },
  },
  categoryRel: true,
  subcategoryRel: true,
  attachments: true,
  history: {
    include: {
      performer: { select: { firstName: true, lastName: true } },
      attachments: true,
    },
    orderBy: { performedAt: "asc" as const },
  },
} as const;

export async function helpdeskRoutes(app: FastifyInstance) {
  // GET /api/tickets — scoped & strips password (fixes H1, H2, H4)
  app.get("/api/tickets", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const r = normRole(u.role);
    let where: Record<string, any> = {};

    if (isSupportRole(r)) {
      where = {};
    } else if (["manager", "partner", "sub-manager", "sub manager"].includes(r)) {
      const team = await prisma.employee.findMany({
        where: {
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
        },
        select: { id: true },
      });
      where = { createdById: { in: team.map((t) => t.id) } };
    } else {
      where = { createdById: u.id };
    }

    const tickets = await prisma.ticket.findMany({
      where,
      include: TICKET_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ success: true, data: tickets });
  });

  // GET /api/tickets/:id
  app.get("/api/tickets/:id", { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = req.user!;
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: TICKET_INCLUDE,
    });
    if (!ticket) return reply.code(404).send({ success: false, message: "Ticket not found." });

    if (!isSupportRole(u.role) && !(await isTeamMemberOrSelf(u, ticket.createdById))) {
      return reply.code(403).send({ success: false, message: "Access denied." });
    }
    return reply.send({ success: true, data: ticket });
  });

  // POST /api/tickets — multipart form with safe extension filter (fixes H6, H8)
  app.post("/api/tickets", { preHandler: [authenticate] }, async (req, reply) => {
    let parsed;
    try {
      parsed = await parseBodyOrMultipart(req, "tickets");
    } catch (err) {
      return reply.code(400).send({
        success: false,
        message: err instanceof Error ? err.message : "Invalid attachment",
      });
    }

    const { fields, files } = parsed;
    const title = (fields.title ?? "").trim();
    const description = (fields.description ?? "").trim();
    if (!title || !description) {
      return reply.code(400).send({
        success: false,
        message: "Ticket title and description are required.",
      });
    }

    const ticketId = await nextTicketCode();
    const categoryId = fields.categoryId ? Number(fields.categoryId) : null;
    const subcategoryId = fields.subcategoryId ? Number(fields.subcategoryId) : null;

    const created = await prisma.ticket.create({
      data: {
        ticketId,
        title,
        description,
        priority: fields.priority || "Medium",
        category: fields.category || "IT Support",
        categoryId: Number.isFinite(categoryId) ? categoryId : null,
        subcategoryId: Number.isFinite(subcategoryId) ? subcategoryId : null,
        status: "Open",
        createdById: req.user!.id,
        attachmentUrl: files[0]?.filePath ?? null,
        attachments: {
          create: files.map((f) => ({
            url: f.filePath,
            filename: f.fileName,
            size: f.fileSize,
            mimeType: f.mimeType,
          })),
        },
        history: {
          create: {
            action: "Ticket created",
            toStatus: "Open",
            performedById: req.user!.id,
            remarks: "Ticket submitted",
          },
        },
      },
      include: TICKET_INCLUDE,
    });

    return reply.code(201).send({ success: true, data: created });
  });

  // PATCH /api/tickets/:id — update status or assignee
  app.patch("/api/tickets/:id", { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = req.user!;
    if (!isSupportRole(u.role)) {
      return reply.code(403).send({ success: false, message: "Only support agents can update ticket status or assignment." });
    }

    const existing = await prisma.ticket.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ success: false, message: "Ticket not found." });

    const { status, assignedTo, remarks } = (req.body ?? {}) as {
      status?: string;
      assignedTo?: string | null;
      remarks?: string;
    };

    const updated = await prisma.ticket.update({
      where: { id },
      data: {
        ...(status !== undefined ? { status } : {}),
        ...(assignedTo !== undefined ? { assignedTo } : {}),
        history: {
          create: {
            action: status && status !== existing.status ? `Status changed to ${status}` : "Assignment updated",
            fromStatus: existing.status,
            toStatus: status ?? existing.status,
            fromAssignee: existing.assignedTo,
            toAssignee: assignedTo !== undefined ? assignedTo : existing.assignedTo,
            performedById: u.id,
            remarks: remarks ?? null,
          },
        },
      },
      include: TICKET_INCLUDE,
    });

    if (status && status !== existing.status && existing.createdById !== u.id) {
      await createNotification({
        userId: existing.createdById,
        title: `Ticket ${existing.ticketId ?? ""} Updated`,
        message: `Your support ticket "${existing.title}" is now ${status}.`,
        type: "ticket_update",
        module: "HelpDesk",
        actionUrl: "/help-desk",
      });
    }

    return reply.send({ success: true, data: updated });
  });

  // POST /api/tickets/:id/history — add comment/reply with optional attachments and status change
  app.post("/api/tickets/:id/history", { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = req.user!;
    const existing = await prisma.ticket.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ success: false, message: "Ticket not found." });

    if (!isSupportRole(u.role) && existing.createdById !== u.id) {
      return reply.code(403).send({ success: false, message: "Forbidden" });
    }

    let parsed;
    try {
      parsed = await parseBodyOrMultipart(req, "tickets");
    } catch (err) {
      return reply.code(400).send({
        success: false,
        message: err instanceof Error ? err.message : "Invalid attachment",
      });
    }

    const { fields, files } = parsed;
    const remarks = (fields.remarks ?? fields.comment ?? "").trim();
    const nextStatus = isSupportRole(u.role) && fields.status ? fields.status : existing.status;

    const event = await prisma.ticketHistory.create({
      data: {
        ticketId: id,
        action: fields.action || (nextStatus !== existing.status ? `Status changed to ${nextStatus}` : "Comment added"),
        fromStatus: existing.status,
        toStatus: nextStatus,
        performedById: u.id,
        remarks: remarks || null,
        attachments: {
          create: files.map((f) => ({
            ticketId: id,
            url: f.filePath,
            filename: f.fileName,
            size: f.fileSize,
            mimeType: f.mimeType,
          })),
        },
      },
      include: {
        performer: { select: { firstName: true, lastName: true } },
        attachments: true,
      },
    });

    if (nextStatus !== existing.status) {
      await prisma.ticket.update({
        where: { id },
        data: { status: nextStatus },
      });
    }

    return reply.code(201).send({ success: true, data: event });
  });

  // DELETE /api/tickets/:id
  app.delete("/api/tickets/:id", { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = req.user!;
    const existing = await prisma.ticket.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ success: false, message: "Ticket not found." });

    if (!isSupportRole(u.role) && (existing.createdById !== u.id || existing.status !== "Open")) {
      return reply.code(403).send({ success: false, message: "You can only delete your own open tickets." });
    }

    await prisma.ticket.delete({ where: { id } });
    return reply.send({ success: true, message: "Ticket deleted." });
  });

  // ── Helpdesk Categories (fixes H9, H10) ────────────────────────────────────
  app.get("/api/helpdesk/categories/tree", { preHandler: [authenticate] }, async (_req, reply) => {
    const roots = await prisma.helpdeskCategory.findMany({
      where: { parent_id: null, is_active: true },
      include: {
        children: {
          where: { is_active: true },
          orderBy: [{ display_order: "asc" }, { category_name: "asc" }],
        },
      },
      orderBy: [{ display_order: "asc" }, { category_name: "asc" }],
    });
    return reply.send({ success: true, data: roots.map(mapCategory) });
  });

  app.get("/api/helpdesk/categories", { preHandler: [authenticate] }, async (_req, reply) => {
    const roots = await prisma.helpdeskCategory.findMany({
      where: { parent_id: null },
      include: {
        children: {
          orderBy: [{ display_order: "asc" }, { category_name: "asc" }],
        },
      },
      orderBy: [{ display_order: "asc" }, { category_name: "asc" }],
    });
    return reply.send({ success: true, data: roots.map(mapCategory) });
  });

  app.post(
    "/api/helpdesk/categories",
    { preHandler: [requireRoles(["admin", "owner", "it"])] },
    async (req, reply) => {
      const b = (req.body ?? {}) as Record<string, any>;
      const categoryName = String(b.categoryName ?? b.category_name ?? "").trim();
      if (!categoryName) {
        return reply.code(400).send({ success: false, message: "categoryName is required." });
      }
      const created = await prisma.helpdeskCategory.create({
        data: {
          category_name: categoryName,
          description: b.description || null,
          is_active: b.isActive !== undefined ? Boolean(b.isActive) : true,
          display_order: Number(b.displayOrder ?? 0) || 0,
          parent_id: b.parentId ? Number(b.parentId) : null,
          assigned_team: b.assignedTeam || "IT",
          sla_hours: Number(b.slaHours ?? 24) || 24,
          support_email: b.supportEmail || null,
          cc_email: b.ccEmail || null,
          escalation_email: b.escalationEmail || null,
          auto_assign_user_id: b.autoAssignUserId || null,
          created_by: req.user!.id,
        },
      });
      return reply.code(201).send({ success: true, data: mapCategory(created) });
    },
  );

  app.put(
    "/api/helpdesk/categories/:id",
    { preHandler: [requireRoles(["admin", "owner", "it"])] },
    async (req, reply) => {
      const id = Number((req.params as { id: string }).id);
      const b = (req.body ?? {}) as Record<string, any>;
      if (b.parentId && Number(b.parentId) === id) {
        return reply.code(400).send({ success: false, message: "A category cannot be its own parent." });
      }
      const updated = await prisma.helpdeskCategory.update({
        where: { id },
        data: {
          ...(b.categoryName !== undefined ? { category_name: String(b.categoryName).trim() } : {}),
          ...(b.description !== undefined ? { description: b.description || null } : {}),
          ...(b.isActive !== undefined ? { is_active: Boolean(b.isActive) } : {}),
          ...(b.displayOrder !== undefined ? { display_order: Number(b.displayOrder) || 0 } : {}),
          ...(b.parentId !== undefined ? { parent_id: b.parentId ? Number(b.parentId) : null } : {}),
          ...(b.assignedTeam !== undefined ? { assigned_team: b.assignedTeam || "IT" } : {}),
          ...(b.slaHours !== undefined ? { sla_hours: Number(b.slaHours) || 24 } : {}),
          ...(b.supportEmail !== undefined ? { support_email: b.supportEmail || null } : {}),
          ...(b.ccEmail !== undefined ? { cc_email: b.ccEmail || null } : {}),
          ...(b.escalationEmail !== undefined ? { escalation_email: b.escalationEmail || null } : {}),
          ...(b.autoAssignUserId !== undefined ? { auto_assign_user_id: b.autoAssignUserId || null } : {}),
        },
      });
      return reply.send({ success: true, data: mapCategory(updated) });
    },
  );

  app.delete(
    "/api/helpdesk/categories/:id",
    { preHandler: [requireRoles(["admin", "owner", "it"])] },
    async (req, reply) => {
      const id = Number((req.params as { id: string }).id);
      await prisma.helpdeskCategory.delete({ where: { id } });
      return reply.send({ success: true });
    },
  );
}
