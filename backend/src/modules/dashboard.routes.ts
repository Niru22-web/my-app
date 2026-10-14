import type { FastifyInstance } from "fastify";
import { prisma } from "../config/db";
import { authenticate, isTeamMemberOrSelf, normRole, requireRoles } from "../plugins/auth";
import { getIO } from "../plugins/socket";
import { computeBalances, leaveYearOf } from "../utils/leave-policy";
import { getWorkCalendar } from "../utils/work-calendar";

const EVENT_COLORS: Record<string, string> = {
  Holiday: "#ef4444",
  Meeting: "#003887",
  Event: "#16a34a",
};

export async function dashboardRoutes(app: FastifyInstance) {
  // GET /api/dashboard/combined — real figures, no fabricated 21-day balance when no row exists (fixes C4, C5)
  app.get("/api/dashboard/combined", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const r = normRole(u.role);
    const now = new Date();
    const year = now.getFullYear();
    const sevenDaysAgo = new Date(now.getTime() - 6 * 86_400_000);

    const [
      projectCount,
      jobCount,
      hoursAgg,
      attRows,
      leaveBal,
      claims,
      profilesWithDob,
      events,
      activities,
      pendingLeaves,
      pendingAssets,
      pendingClaims,
      openTickets,
      myAssetRequests,
      myTickets,
    ] = await Promise.all([
      // "My projects" — open projects/jobs this person is on (team member, manager or partner of the project)
      prisma.project.count({
        where: {
          status: { in: ["Active", "Started"] },
          OR: [{ users: { some: { employeeId: u.id } } }, { managerId: u.id }, { partnerId: u.id }],
        },
      }),
      prisma.job.count({ where: { status: { in: ["Active", "Started"] }, users: { some: { employeeId: u.id } } } }),
      prisma.timelog.aggregate({
        where: { employeeId: u.id },
        _sum: { hours: true },
      }),
      prisma.attendance.findMany({
        where: { employee_id: u.employeeId, date: { gte: sevenDaysAgo } },
        orderBy: { date: "asc" },
      }),
      // Paid leave with an entitlement, from the leave rules engine (current leave year)
      getWorkCalendar().then((cal) =>
        computeBalances([u.id], leaveYearOf(now, cal.leaveYearStartMonth)).then(({ balances }) =>
          (balances.get(u.id) ?? []).filter((b) => b.paid && (b.entitled != null || b.opening !== 0 || b.adjusted !== 0)),
        ),
      ),
      prisma.reimbursement.findMany({
        where: { employeeId: u.id },
        select: { category: true, amount: true },
      }),
      prisma.employeeProfile.findMany({
        include: {
          employee: { select: { firstName: true, lastName: true, designation: true, status: true } },
        },
      }),
      prisma.event.findMany({
        where: { date: { gte: new Date(now.toISOString().slice(0, 10)) } },
        orderBy: { date: "asc" },
        take: 10,
      }),
      prisma.activity.findMany({
        where: { type: { not: "team_message" } },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      ["admin", "owner", "hr", "manager", "partner"].includes(r)
        ? prisma.leave.count({ where: { status: "pending" } })
        : Promise.resolve(0),
      ["admin", "owner", "hr", "it"].includes(r)
        ? prisma.assetRequest.count({ where: { status: "Pending" } })
        : Promise.resolve(0),
      ["admin", "owner", "manager", "partner"].includes(r)
        ? prisma.reimbursement.count({ where: { status: { in: ["PENDING_MANAGER", "MANAGER_APPROVED"] } } })
        : Promise.resolve(0),
      ["admin", "owner", "it"].includes(r)
        ? prisma.ticket.count({ where: { status: { in: ["Open", "In Progress"] } } })
        : Promise.resolve(0),
      prisma.assetRequest.count({ where: { employeeId: u.id } }),
      prisma.ticket.count({ where: { createdById: u.id } }),
    ]);

    const expByCat = new Map<string, number>();
    let expTotal = 0;
    for (const c of claims) {
      const amt = Number(c.amount ?? 0);
      expTotal += amt;
      expByCat.set(c.category, (expByCat.get(c.category) ?? 0) + amt);
    }

    const curMonth = now.getUTCMonth();
    const curDay = now.getUTCDate();
    const birthdays = profilesWithDob
      .filter(
        (p) =>
          (p.employee.status ?? "").toLowerCase() === "active" &&
          p.dob.getUTCMonth() === curMonth &&
          p.dob.getUTCDate() >= curDay,
      )
      .sort((a, b) => a.dob.getUTCDate() - b.dob.getUTCDate())
      .map((p) => ({
        name: `${p.employee.firstName} ${p.employee.lastName}`.trim(),
        role: p.employee.designation,
        date: p.dob.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      }));

    return reply.send({
      success: true,
      data: {
        stats: {
          totalProjects: projectCount,
          totalTasks: jobCount,
          hoursLogged: Math.round(Number(hoursAgg._sum.hours ?? 0) * 100) / 100,
        },
        attendance: attRows.map((a) => ({
          date: a.date.toISOString().slice(0, 10),
          day: a.date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
          hours: Number(a.total_hours ?? 0),
        })),
        leaves: {
          balance: Math.round(leaveBal.reduce((a, b) => a + b.available, 0) * 100) / 100,
          used: Math.round(leaveBal.reduce((a, b) => a + b.used, 0) * 100) / 100,
          total: Math.round(leaveBal.reduce((a, b) => a + b.opening + b.adjusted + (b.entitled ?? 0), 0) * 100) / 100,
          configured: leaveBal.length > 0,
        },
        expenses: {
          total: Math.round(expTotal * 100) / 100,
          breakdown: [...expByCat.entries()].map(([category, amount]) => ({ category, amount })),
        },
        birthdays,
        events: events.map((ev) => ({
          id: ev.id,
          title: ev.title,
          date: ev.date.toISOString().slice(0, 10),
          time: ev.time,
          type: ev.type,
          color: EVENT_COLORS[ev.type] ?? "#003887",
        })),
        activities: activities.map((act) => ({
          title: act.title,
          description: act.description,
          type: act.type,
          createdAt: act.createdAt.toISOString(),
        })),
        pendingApprovals: {
          leaves: pendingLeaves,
          assets: pendingAssets,
          reimbursements: pendingClaims,
          tickets: openTickets,
        },
        myAssetRequests,
        myTickets,
      },
    });
  });

  // GET /api/search — global search for employees, projects, and jobs
  app.get("/api/search", { preHandler: [authenticate] }, async (req, reply) => {
    const { q = "" } = (req.query ?? {}) as { q?: string };
    const term = q.trim();
    if (term.length < 2) {
      return reply.send({ success: true, data: { employees: [], projects: [], jobs: [] } });
    }

    const [employees, projects, jobs] = await Promise.all([
      prisma.employee.findMany({
        where: {
          OR: [
            { firstName: { contains: term, mode: "insensitive" } },
            { lastName: { contains: term, mode: "insensitive" } },
            { employeeId: { contains: term, mode: "insensitive" } },
            { officeEmail: { contains: term, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          employeeId: true,
          firstName: true,
          lastName: true,
          officeEmail: true,
          designation: true,
          profileImage: true,
        },
        take: 8,
      }),
      prisma.project.findMany({
        where: {
          OR: [
            { name: { contains: term, mode: "insensitive" } },
            { projectId: { contains: term, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          projectId: true,
          name: true,
          client: { select: { name: true } },
        },
        take: 8,
      }),
      prisma.job.findMany({
        where: {
          OR: [
            { name: { contains: term, mode: "insensitive" } },
            { jobId: { contains: term, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          jobId: true,
          name: true,
          project: { select: { name: true } },
        },
        take: 8,
      }),
    ]);

    return reply.send({ success: true, data: { employees, projects, jobs } });
  });

  // GET & POST /api/chat — firm-wide team chat
  app.get("/api/chat", { preHandler: [authenticate] }, async (_req, reply) => {
    const rows = await prisma.activity.findMany({
      where: { type: "team_message" },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, role: true, profileImage: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    });

    const data = rows.map((r) => ({
      id: r.id,
      senderId: r.userId ?? "",
      senderName: r.user ? `${r.user.firstName} ${r.user.lastName}`.trim() : r.title,
      senderRole: r.user?.role ?? null,
      senderImage: r.user?.profileImage ?? null,
      content: r.description,
      createdAt: r.createdAt.toISOString(),
    }));

    return reply.send({ success: true, data });
  });

  app.post("/api/chat", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const { content } = (req.body ?? {}) as { content?: string };
    const text = (content ?? "").trim();
    if (!text) return reply.code(400).send({ success: false, message: "Message content is required." });

    const emp = await prisma.employee.findUnique({
      where: { id: u.id },
      select: { id: true, firstName: true, lastName: true, role: true, profileImage: true },
    });

    const senderName = emp ? `${emp.firstName} ${emp.lastName}`.trim() : u.email;
    const created = await prisma.activity.create({
      data: {
        userId: u.id,
        title: senderName,
        description: text.slice(0, 1000),
        type: "team_message",
      },
    });

    const msg = {
      id: created.id,
      senderId: u.id,
      senderName,
      senderRole: emp?.role ?? u.role,
      senderImage: emp?.profileImage ?? null,
      content: created.description,
      createdAt: created.createdAt.toISOString(),
    };

    getIO()?.emit("new_team_message", msg);
    return reply.code(201).send({ success: true, data: msg });
  });

  // ── Events (Firm Calendar) ─────────────────────────────────────────────────
  app.get("/api/events", { preHandler: [authenticate] }, async (_req, reply) => {
    const events = await prisma.event.findMany({
      include: { createdBy: { select: { firstName: true, lastName: true } } },
      orderBy: { date: "asc" },
    });
    return reply.send({
      success: true,
      data: events.map((e) => ({
        ...e,
        date: e.date.toISOString().slice(0, 10),
      })),
    });
  });

  app.post(
    "/api/events",
    { preHandler: [requireRoles(["admin", "owner", "hr", "partner", "manager"])] },
    async (req, reply) => {
      const { title, date, time, type } = (req.body ?? {}) as {
        title?: string;
        date?: string;
        time?: string;
        type?: string;
      };
      if (!title?.trim() || !date) {
        return reply.code(400).send({ success: false, message: "Event title and date are required." });
      }
      const created = await prisma.event.create({
        data: {
          title: title.trim(),
          date: new Date(`${date.slice(0, 10)}T00:00:00.000Z`),
          time: time?.trim() || null,
          type: type || "Event",
          createdById: req.user!.id,
        },
      });
      return reply.code(201).send({ success: true, data: created });
    },
  );

  // DELETE /api/events/:id — restricted to event managers (fixes E8)
  app.delete(
    "/api/events/:id",
    { preHandler: [requireRoles(["admin", "owner", "hr", "partner", "manager"])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await prisma.event.delete({ where: { id } });
      return reply.send({ success: true, message: "Event removed." });
    },
  );

  // ── Notifications ──────────────────────────────────────────────────────────
  app.get("/api/notifications", { preHandler: [authenticate] }, async (req, reply) => {
    const { archived } = (req.query ?? {}) as { archived?: string };
    const where: Record<string, any> = { userId: req.user!.id };
    if (archived === "false") {
      where.isArchived = false;
    } else if (archived === "true") {
      where.isArchived = true;
    }

    const items = await prisma.notification.findMany({
      where,
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      take: 200,
    });
    return reply.send({ success: true, data: items });
  });

  app.patch("/api/notifications/read-all", { preHandler: [authenticate] }, async (req, reply) => {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, isRead: false },
      data: { isRead: true },
    });
    return reply.send({ success: true });
  });

  app.patch("/api/notifications/:id", { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as {
      isRead?: boolean;
      isArchived?: boolean;
      isPinned?: boolean;
      isStarred?: boolean;
      snoozedUntil?: string | null;
    };
    const data: Record<string, any> = {};
    for (const k of ["isRead", "isArchived", "isPinned", "isStarred"] as const) {
      if (body[k] !== undefined) data[k] = Boolean(body[k]);
    }
    if (body.snoozedUntil !== undefined) {
      data.snoozedUntil = body.snoozedUntil ? new Date(body.snoozedUntil) : null;
    }

    await prisma.notification.updateMany({
      where: { id, userId: req.user!.id },
      data,
    });
    return reply.send({ success: true });
  });

  app.post("/api/notifications/bulk-update", { preHandler: [authenticate] }, async (req, reply) => {
    const body = (req.body ?? {}) as {
      ids?: string[];
      isRead?: boolean;
      isArchived?: boolean;
      isPinned?: boolean;
      isStarred?: boolean;
      snoozedUntil?: string | null;
    };
    if (!Array.isArray(body.ids) || !body.ids.length) {
      return reply.code(400).send({ success: false, message: "No notifications selected." });
    }
    const data: Record<string, any> = {};
    for (const k of ["isRead", "isArchived", "isPinned", "isStarred"] as const) {
      if (body[k] !== undefined) data[k] = Boolean(body[k]);
    }
    if (body.snoozedUntil !== undefined) {
      data.snoozedUntil = body.snoozedUntil ? new Date(body.snoozedUntil) : null;
    }
    await prisma.notification.updateMany({
      where: { id: { in: body.ids }, userId: req.user!.id },
      data,
    });
    return reply.send({ success: true });
  });

  app.delete("/api/notifications/:id", { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await prisma.notification.deleteMany({
      where: { id, userId: req.user!.id },
    });
    return reply.send({ success: true });
  });

  app.post("/api/notifications/bulk-delete", { preHandler: [authenticate] }, async (req, reply) => {
    const { ids } = (req.body ?? {}) as { ids?: string[] };
    if (!Array.isArray(ids) || !ids.length) {
      return reply.code(400).send({ success: false, message: "No notifications selected." });
    }
    await prisma.notification.deleteMany({
      where: { id: { in: ids }, userId: req.user!.id },
    });
    return reply.send({ success: true });
  });

  // POST /api/notifications/approve-employee — scoped to Admin/Owner/HR or the employee's reporting Manager/Partner (fixes E7)
  app.post(
    "/api/notifications/approve-employee",
    { preHandler: [requireRoles(["admin", "owner", "hr", "manager", "partner"])] },
    async (req, reply) => {
      const { employeeId } = (req.body ?? {}) as { employeeId?: string };
      if (!employeeId) {
        return reply.code(400).send({ success: false, message: "employeeId is required." });
      }
      if (!(await isTeamMemberOrSelf(req.user!, employeeId))) {
        return reply.code(403).send({ success: false, message: "This employee does not report to you." });
      }
      await prisma.employee.update({
        where: { id: employeeId },
        data: {
          status: "Active",
          approvalStatus: "APPROVED",
          isApproved: true,
          approvedAt: new Date(),
          approvedBy: req.user!.id,
        },
      });
      return reply.send({ success: true, message: "Employee approved." });
    },
  );
}
