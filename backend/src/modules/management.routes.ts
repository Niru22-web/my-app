import type { FastifyInstance } from "fastify";
import { prisma } from "../config/db";
import { authenticate, normRole, requireRoles } from "../plugins/auth";

async function nextCode(prefix: string, existingCodes: string[]): Promise<string> {
  let max = 0;
  for (const c of existingCodes) {
    const m = c.match(/(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

const WORK_WRITE_ROLES = ["admin", "owner", "partner", "manager", "it"];

/**
 * The team picked in the project/job dialog. undefined = not sent (leave the team as it is).
 * Unknown or inactive ids are dropped, so a stale selection can't break the save.
 */
async function teamFrom(raw: unknown): Promise<string[] | undefined> {
  if (raw === undefined) return undefined;
  const ids = Array.isArray(raw) ? [...new Set(raw.map(String).filter(Boolean))] : [];
  if (!ids.length) return [];
  const found = await prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true } });
  return found.map((e) => e.id);
}

const PARTNER_ROLES = ["partner", "owner"];

/** A client's engagement partner must be an active Partner/Owner. Returns an error message or null. */
async function checkPartner(id: string): Promise<string | null> {
  const p = await prisma.employee.findUnique({ where: { id }, select: { role: true, status: true } });
  if (!p || !PARTNER_ROLES.includes(normRole(p.role))) return "Choose a partner from the list.";
  if ((p.status ?? "").toLowerCase() !== "active") return "That partner is no longer active.";
  return null;
}

export async function managementRoutes(app: FastifyInstance) {
  // Partners, for the client's engagement-partner picker.
  app.get("/api/employees/partners", { preHandler: [authenticate] }, async (_req, reply) => {
    const data = await prisma.employee.findMany({
      where: { status: { equals: "active", mode: "insensitive" }, OR: PARTNER_ROLES.map((r) => ({ role: { equals: r, mode: "insensitive" as const } })) },
      select: { id: true, firstName: true, lastName: true, employeeId: true },
      orderBy: { firstName: "asc" },
    });
    return reply.send({ success: true, data });
  });

  // ── Clients ────────────────────────────────────────────────────────────────
  app.get("/api/clients", { preHandler: [authenticate] }, async (req, reply) => {
    const { status } = (req.query ?? {}) as { status?: string };
    const where: Record<string, any> = {};
    if (status && status !== "All Status" && status !== "all") {
      where.status = { equals: status, mode: "insensitive" };
    }

    const [clients, hoursByClient] = await Promise.all([
      prisma.client.findMany({
        where,
        include: { _count: { select: { projects: true } } },
        orderBy: { name: "asc" },
      }),
      prisma.timelog.groupBy({
        by: ["clientId"],
        _sum: { hours: true },
      }),
    ]);

    const hoursMap = new Map(hoursByClient.map((h) => [h.clientId, Number(h._sum.hours ?? 0)]));
    return reply.send({
      success: true,
      data: clients.map((c) => ({ ...c, loggedHours: hoursMap.get(c.id) ?? 0 })),
    });
  });

  app.post("/api/clients", { preHandler: [requireRoles(WORK_WRITE_ROLES)] }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, any>;
    const name = String(b.name ?? "").trim();
    if (!name) return reply.code(400).send({ success: false, message: "Client name is required." });

    // Engagement partner: the one chosen, else the creator's own partner (or the creator, if a partner).
    let partnerId: string | null = b.partnerId ? String(b.partnerId) : null;
    if (partnerId) {
      const problem = await checkPartner(partnerId);
      if (problem) return reply.code(400).send({ success: false, message: problem });
    } else if (PARTNER_ROLES.includes(normRole(req.user!.role))) {
      partnerId = req.user!.id;
    } else {
      const me = await prisma.employee.findUnique({ where: { id: req.user!.id }, select: { partnerId: true, reportingPartnerIds: true } });
      partnerId = me?.partnerId ?? me?.reportingPartnerIds?.[0] ?? null;
    }
    const existing = await prisma.client.findMany({ select: { clientId: true } });
    const clientId = b.clientId ? String(b.clientId).trim() : await nextCode("CLI", existing.map((x) => x.clientId));

    const created = await prisma.client.create({
      data: {
        clientId,
        name,
        alias: String(b.alias ?? name.slice(0, 12)),
        gstStatus: String(b.gstStatus ?? "No"),
        gstin: b.gstin ? String(b.gstin) : null,
        pan: String(b.pan ?? ""),
        address: b.address ? String(b.address) : null,
        pin: b.pin ? String(b.pin) : null,
        state: b.state ? String(b.state) : null,
        country: b.country ? String(b.country) : "India",
        status: String(b.status ?? "Active"),
        partnerId,
        createdBy: req.user!.id,
      },
    });
    return reply.code(201).send({ success: true, data: created });
  });

  app.put("/api/clients/:id", { preHandler: [requireRoles(WORK_WRITE_ROLES)] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as Record<string, any>;
    const data: Record<string, any> = {};
    for (const k of ["name", "alias", "gstStatus", "gstin", "pan", "address", "pin", "state", "country", "status"] as const) {
      if (b[k] !== undefined) data[k] = b[k];
    }
    if (b.partnerId !== undefined) {
      if (b.partnerId) {
        const problem = await checkPartner(String(b.partnerId));
        if (problem) return reply.code(400).send({ success: false, message: problem });
      }
      data.partnerId = b.partnerId ? String(b.partnerId) : null;
    }
    const updated = await prisma.client.update({ where: { id }, data });
    return reply.send({ success: true, data: updated });
  });

  app.delete("/api/clients/:id", { preHandler: [requireRoles(["admin", "owner", "it"])] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [projCount, logCount, invCount] = await Promise.all([
      prisma.project.count({ where: { clientId: id } }),
      prisma.timelog.count({ where: { clientId: id } }),
      prisma.invoice.count({ where: { clientId: id } }),
    ]);
    if (projCount > 0 || logCount > 0 || invCount > 0) {
      return reply.code(400).send({
        success: false,
        message: "Cannot delete a client with existing projects, timelogs, or invoices. Mark it Inactive instead.",
      });
    }
    await prisma.client.delete({ where: { id } });
    return reply.send({ success: true, message: "Client deleted." });
  });

  // ── Projects ───────────────────────────────────────────────────────────────
  app.get("/api/projects", { preHandler: [authenticate] }, async (req, reply) => {
    const { clientId, status } = (req.query ?? {}) as { clientId?: string; status?: string };
    const where: Record<string, any> = {};
    if (clientId && clientId !== "all") where.clientId = clientId;
    if (status && status !== "all") where.status = { equals: status, mode: "insensitive" };

    const [projects, hoursByProj] = await Promise.all([
      prisma.project.findMany({
        where,
        include: {
          client: true,
          users: { include: { employee: { select: { id: true, firstName: true, lastName: true } } } },
          _count: { select: { jobs: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.timelog.groupBy({
        by: ["projectId"],
        _sum: { hours: true },
      }),
    ]);

    const hoursMap = new Map(hoursByProj.map((h) => [h.projectId, Number(h._sum.hours ?? 0)]));
    return reply.send({
      success: true,
      data: projects.map((p) => ({ ...p, loggedHours: hoursMap.get(p.id) ?? 0 })),
    });
  });

  app.post("/api/projects", { preHandler: [requireRoles(WORK_WRITE_ROLES)] }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, any>;
    const name = String(b.name ?? "").trim();
    const clientId = String(b.clientId ?? "").trim();
    if (!name || !clientId) {
      return reply.code(400).send({ success: false, message: "Project name and client are required." });
    }

    const team = await teamFrom(b.assignedEmployees);
    const existing = await prisma.project.findMany({ select: { projectId: true } });
    const projectId = b.projectId ? String(b.projectId).trim() : await nextCode("PRJ", existing.map((x) => x.projectId));

    const created = await prisma.project.create({
      data: {
        projectId,
        name,
        clientId,
        status: String(b.status ?? "Started"),
        startDate: b.startDate ? new Date(b.startDate) : new Date(),
        endDate: b.endDate ? new Date(b.endDate) : null,
        billable: b.billable !== undefined ? Boolean(b.billable) : true,
        contactPerson: b.contactPerson ? String(b.contactPerson) : null,
        createdBy: req.user!.id,
        createdByEmail: req.user!.email,
        ...(team?.length ? { users: { create: team.map((employeeId) => ({ employeeId })) } } : {}),
      },
      include: { client: true, users: { include: { employee: { select: { id: true, firstName: true, lastName: true } } } } },
    });
    return reply.code(201).send({ success: true, data: created });
  });

  // PUT /api/projects/:id — preserves all fields not explicitly sent (fixes M5)
  app.put("/api/projects/:id", { preHandler: [requireRoles(WORK_WRITE_ROLES)] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as Record<string, any>;
    const data: Record<string, any> = {};
    if (b.name !== undefined) data.name = String(b.name);
    if (b.clientId !== undefined) data.clientId = String(b.clientId);
    if (b.status !== undefined) data.status = String(b.status);
    if (b.startDate !== undefined && b.startDate) data.startDate = new Date(b.startDate);
    if (b.endDate !== undefined) data.endDate = b.endDate ? new Date(b.endDate) : null;
    if (b.billable !== undefined) data.billable = Boolean(b.billable);
    if (b.contactPerson !== undefined) data.contactPerson = b.contactPerson ? String(b.contactPerson) : null;
    const team = await teamFrom(b.assignedEmployees);
    if (team) data.users = { deleteMany: {}, create: team.map((employeeId) => ({ employeeId })) };

    const updated = await prisma.project.update({
      where: { id },
      data,
      include: { client: true, users: { include: { employee: { select: { id: true, firstName: true, lastName: true } } } } },
    });
    return reply.send({ success: true, data: updated });
  });

  app.delete("/api/projects/:id", { preHandler: [requireRoles(["admin", "owner", "partner", "it"])] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [jobCount, logCount, claimCount] = await Promise.all([
      prisma.job.count({ where: { projectId: id } }),
      prisma.timelog.count({ where: { projectId: id } }),
      prisma.reimbursement.count({ where: { projectId: id } }),
    ]);
    if (jobCount > 0 || logCount > 0 || claimCount > 0) {
      return reply.code(400).send({
        success: false,
        message: "Cannot delete a project that has jobs, timelogs, or expense claims. Mark it Completed or Inactive instead.",
      });
    }
    await prisma.project.delete({ where: { id } });
    return reply.send({ success: true, message: "Project deleted." });
  });

  // ── Jobs ───────────────────────────────────────────────────────────────────
  app.get("/api/jobs", { preHandler: [authenticate] }, async (req, reply) => {
    const { projectId, status } = (req.query ?? {}) as { projectId?: string; status?: string };
    const where: Record<string, any> = {};
    if (projectId && projectId !== "all") where.projectId = projectId;
    if (status && status !== "all") where.status = { equals: status, mode: "insensitive" };

    const [jobs, hoursByJob] = await Promise.all([
      prisma.job.findMany({
        where,
        include: {
          project: { include: { client: true } },
          users: { include: { employee: { select: { id: true, firstName: true, lastName: true } } } },
          _count: { select: { timelogs: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.timelog.groupBy({
        by: ["jobId"],
        _sum: { hours: true },
      }),
    ]);

    const hoursMap = new Map(hoursByJob.map((h) => [h.jobId, Number(h._sum.hours ?? 0)]));
    return reply.send({
      success: true,
      data: jobs.map((j) => ({ ...j, loggedHours: hoursMap.get(j.id) ?? 0 })),
    });
  });

  app.post("/api/jobs", { preHandler: [requireRoles(WORK_WRITE_ROLES)] }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, any>;
    const name = String(b.name ?? "").trim();
    const projectId = String(b.projectId ?? "").trim();
    if (!name || !projectId) {
      return reply.code(400).send({ success: false, message: "Job name and project are required." });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { client: true },
    });
    if (!project) return reply.code(404).send({ success: false, message: "Project not found." });

    const team = await teamFrom(b.assignedEmployees);
    const existing = await prisma.job.findMany({ select: { jobId: true } });
    const jobId = b.jobId ? String(b.jobId).trim() : await nextCode("JOB", existing.map((x) => x.jobId));
    const combinedId = `${project.client.clientId}-${project.projectId}-${jobId}`;

    const created = await prisma.job.create({
      data: {
        jobId,
        combinedId,
        name,
        projectId,
        description: b.description ? String(b.description) : null,
        status: String(b.status ?? "Started"),
        billable: b.billable !== undefined ? Boolean(b.billable) : project.billable,
        startDate: b.startDate ? new Date(b.startDate) : null,
        endDate: b.endDate ? new Date(b.endDate) : null,
        createdBy: req.user!.id,
        createdByEmail: req.user!.email,
        ...(team?.length ? { users: { create: team.map((employeeId) => ({ employeeId })) } } : {}),
      },
      include: { project: { include: { client: true } }, users: { include: { employee: { select: { id: true, firstName: true, lastName: true } } } } },
    });
    return reply.code(201).send({ success: true, data: created });
  });

  // PUT /api/jobs/:id — preserves all fields not explicitly sent (fixes M6)
  app.put("/api/jobs/:id", { preHandler: [requireRoles(WORK_WRITE_ROLES)] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as Record<string, any>;
    const data: Record<string, any> = {};
    if (b.name !== undefined) data.name = String(b.name);
    if (b.projectId !== undefined) data.projectId = String(b.projectId);
    if (b.description !== undefined) data.description = b.description ? String(b.description) : null;
    if (b.status !== undefined) data.status = String(b.status);
    if (b.billable !== undefined) data.billable = Boolean(b.billable);
    if (b.startDate !== undefined) data.startDate = b.startDate ? new Date(b.startDate) : null;
    if (b.endDate !== undefined) data.endDate = b.endDate ? new Date(b.endDate) : null;
    const team = await teamFrom(b.assignedEmployees);
    if (team) data.users = { deleteMany: {}, create: team.map((employeeId) => ({ employeeId })) };

    const updated = await prisma.job.update({
      where: { id },
      data,
      include: { project: { include: { client: true } }, users: { include: { employee: { select: { id: true, firstName: true, lastName: true } } } } },
    });
    return reply.send({ success: true, data: updated });
  });

  // DELETE /api/jobs/:id — checks both timelog and reimbursement rows before deleting (fixes M7)
  app.delete("/api/jobs/:id", { preHandler: [requireRoles(WORK_WRITE_ROLES)] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [logCount, claimCount] = await Promise.all([
      prisma.timelog.count({ where: { jobId: id } }),
      prisma.reimbursement.count({ where: { jobId: id } }),
    ]);
    if (logCount > 0 || claimCount > 0) {
      return reply.code(400).send({
        success: false,
        message: "Cannot delete a job that has logged time or expense claims. Mark it Completed or Inactive instead.",
      });
    }
    await prisma.job.delete({ where: { id } });
    return reply.send({ success: true, message: "Job deleted." });
  });
}
