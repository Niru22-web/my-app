import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../config/db";
import { authenticate, normRole, requireRoles, type JwtUser } from "../plugins/auth";
import {
  activePeople,
  addDaysYmd,
  audienceIsEmpty,
  CATEGORIES,
  cleanAudience,
  festivalKey,
  fullName,
  HttpError,
  isYearlyOn,
  istYmd,
  matchAudience,
  peopleWithDates,
  runAnnouncementJobs,
  seedTemplatesIfEmpty,
  sendAnnouncement,
  sendWish,
  SYSTEM_SENDER,
  THEMES,
  WISH_KINDS,
  yearsBetween,
  type WishKind,
} from "../utils/announce-core";

const MANAGERS = ["admin", "owner", "hr"];
const canManage = (u?: JwtUser) => MANAGERS.includes(normRole(u?.role));
const manageOnly = requireRoles(MANAGERS);

const bad = (reply: FastifyReply, status: number, message: string) => reply.code(status).send({ success: false, message });

function fail(reply: FastifyReply, req: FastifyRequest, e: unknown) {
  if (e instanceof HttpError) return bad(reply, e.status, e.message);
  req.log.error(e, "announcements");
  return bad(reply, 500, "Something went wrong. Please try again.");
}

/** Optional ISO date-time; undefined = not sent, null = cleared, "invalid" = unreadable. */
function parseInstant(v: unknown): Date | null | undefined | "invalid" {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v !== "string") return "invalid";
  // A bare date means the end of that IST day (used for "Expires on").
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T23:59:59+05:30`) : new Date(v);
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}

interface Body {
  title?: unknown;
  message?: unknown;
  category?: unknown;
  audience?: unknown;
  pinned?: unknown;
  scheduledAt?: unknown;
  expiresAt?: unknown;
  action?: unknown;
}

/** Validates create / edit input. Returns the data to write or an error message. */
function readBody(b: Body, partial: boolean) {
  const out: { title?: string; message?: string; category?: string; audience?: object; pinned?: boolean; scheduledAt?: Date | null; expiresAt?: Date | null } = {};
  if (b.title !== undefined || !partial) {
    const t = typeof b.title === "string" ? b.title.trim() : "";
    if (!t) return { error: "Enter a title." };
    if (t.length > 200) return { error: "Keep the title under 200 characters." };
    out.title = t;
  }
  if (b.message !== undefined || !partial) {
    const m = typeof b.message === "string" ? b.message.replace(/\r\n/g, "\n").trim() : "";
    if (!m) return { error: "Enter a message." };
    if (m.length > 5000) return { error: "Keep the message under 5,000 characters." };
    out.message = m;
  }
  if (b.category !== undefined) {
    if (!CATEGORIES.includes(b.category as (typeof CATEGORIES)[number])) return { error: "Choose a valid category." };
    out.category = b.category as string;
  }
  if (b.audience !== undefined) out.audience = cleanAudience(b.audience);
  if (b.pinned !== undefined) out.pinned = b.pinned === true;
  const s = parseInstant(b.scheduledAt);
  if (s === "invalid") return { error: "The schedule time isn't a valid date." };
  if (s !== undefined) out.scheduledAt = s;
  const x = parseInstant(b.expiresAt);
  if (x === "invalid") return { error: "The expiry date isn't valid." };
  if (x !== undefined) out.expiresAt = x;
  return { data: out };
}

type Row = Awaited<ReturnType<typeof prisma.announcement.findMany>>[number];

/** Adds sender name, template theme, read counts and (for the viewer) the read flag. */
async function decorate(rows: Row[], viewerId: string, manager: boolean) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const senders = [...new Set(rows.map((r) => r.createdById).filter((x) => x !== SYSTEM_SENDER))];
  const tplIds = [...new Set(rows.map((r) => r.templateId).filter(Boolean) as string[])];
  const [people, templates, mine, counts] = await Promise.all([
    senders.length ? prisma.employee.findMany({ where: { id: { in: senders } }, select: { id: true, firstName: true, lastName: true, designation: true, profileImage: true } }) : [],
    tplIds.length ? prisma.wishTemplate.findMany({ where: { id: { in: tplIds } }, select: { id: true, theme: true } }) : [],
    prisma.announcementRead.findMany({ where: { announcementId: { in: ids }, employeeId: viewerId }, select: { announcementId: true, readAt: true } }),
    manager ? prisma.announcementRead.groupBy({ by: ["announcementId"], where: { announcementId: { in: ids } }, _count: { _all: true } }) : [],
  ]);
  const pm = new Map(people.map((p) => [p.id, p]));
  const tm = new Map(templates.map((t) => [t.id, t.theme]));
  const rm = new Map(mine.map((r) => [r.announcementId, r.readAt]));
  const cm = new Map(counts.map((c) => [c.announcementId, c._count._all]));
  const now = Date.now();
  return rows.map((r) => {
    const p = pm.get(r.createdById);
    const isRecipient = r.recipientIds.includes(viewerId);
    const { recipientIds, ...rest } = r;
    return {
      ...rest,
      ...(manager ? { recipientIds } : {}),
      recipientCount: recipientIds.length,
      readCount: manager ? (cm.get(r.id) ?? 0) : undefined,
      sender: r.createdById === SYSTEM_SENDER ? { name: "ASA Portal", designation: null, profileImage: null } : p ? { name: fullName(p), designation: p.designation, profileImage: p.profileImage } : { name: "Former employee", designation: null, profileImage: null },
      theme: r.templateId ? (tm.get(r.templateId) ?? null) : null,
      isRecipient,
      read: rm.has(r.id),
      readAt: rm.get(r.id) ?? null,
      expired: !!r.expiresAt && r.expiresAt.getTime() <= now,
    };
  });
}

function readTemplate(b: Record<string, unknown>, partial: boolean) {
  const out: { kind?: string; name?: string; title?: string; message?: string; festivalOn?: Date | null; autoSend?: boolean; isActive?: boolean; theme?: string } = {};
  if (b.kind !== undefined || !partial) {
    if (!WISH_KINDS.includes(b.kind as WishKind)) return { error: "Choose birthday, work anniversary or festival." };
    out.kind = b.kind as string;
  }
  for (const [k, max, label] of [["name", 80, "a name"], ["title", 200, "a title"], ["message", 2000, "a message"]] as const) {
    if (b[k] !== undefined || !partial) {
      const v = typeof b[k] === "string" ? (b[k] as string).replace(/\r\n/g, "\n").trim() : "";
      if (!v) return { error: `Enter ${label}.` };
      if (v.length > max) return { error: `Keep the ${k} under ${max} characters.` };
      out[k] = v;
    }
  }
  if (b.festivalOn !== undefined) {
    if (b.festivalOn === null || b.festivalOn === "") out.festivalOn = null;
    else if (typeof b.festivalOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.festivalOn) && !Number.isNaN(new Date(`${b.festivalOn}T00:00:00Z`).getTime()))
      out.festivalOn = new Date(`${b.festivalOn}T00:00:00Z`);
    else return { error: "The festival date isn't valid." };
  }
  if (b.autoSend !== undefined) out.autoSend = b.autoSend === true;
  if (b.isActive !== undefined) out.isActive = b.isActive === true;
  if (b.theme !== undefined) {
    if (!THEMES.includes(b.theme as (typeof THEMES)[number])) return { error: "Choose a valid card style." };
    out.theme = b.theme as string;
  }
  return { data: out };
}

const tplOut = <T extends { festivalOn: Date | null }>(t: T) => ({ ...t, festivalOn: t.festivalOn ? t.festivalOn.toISOString().slice(0, 10) : null });

export async function announcementRoutes(app: FastifyInstance) {
  const P = "/api/announcements";

  // ── Background job: scheduled sends + automatic wishes ────────────────────────
  let interval: NodeJS.Timeout | null = null;
  let first: NodeJS.Timeout | null = null;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runAnnouncementJobs(app.log);
    } catch (e) {
      app.log.error(e, "Announcements job failed");
    } finally {
      running = false;
    }
  };
  app.addHook("onReady", async () => {
    if (process.env.DISABLE_JOBS === "true") return;
    first = setTimeout(() => void tick(), 10_000);
    interval = setInterval(() => void tick(), 5 * 60_000);
    first.unref();
    interval.unref();
  });
  app.addHook("onClose", async () => {
    if (first) clearTimeout(first);
    if (interval) clearInterval(interval);
  });

  // ── Feed / list ─────────────────────────────────────────────────────────────
  app.get(P, { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const q = req.query as { status?: string; category?: string; q?: string; mine?: string };
    const manager = canManage(u) && q.mine !== "true" && q.mine !== "1";
    const where: Record<string, unknown> = manager ? {} : { status: "SENT", recipientIds: { has: u.id } };
    if (manager && q.status && ["DRAFT", "SCHEDULED", "SENT", "CANCELLED"].includes(q.status.toUpperCase())) where.status = q.status.toUpperCase();
    if (q.category && CATEGORIES.includes(q.category as (typeof CATEGORIES)[number])) where.category = q.category;
    if (q.q?.trim()) where.OR = [{ title: { contains: q.q.trim(), mode: "insensitive" } }, { message: { contains: q.q.trim(), mode: "insensitive" } }];
    const rows = await prisma.announcement.findMany({
      where,
      orderBy: manager ? [{ updatedAt: "desc" }] : [{ sentAt: "desc" }],
      take: 500,
    });
    return reply.send({ success: true, data: await decorate(rows, u.id, canManage(u)) });
  });

  // GET /banner — latest pinned, unexpired, unread announcement for me
  app.get(`${P}/banner`, { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const rows = await prisma.announcement.findMany({
      where: {
        status: "SENT",
        pinned: true,
        recipientIds: { has: u.id },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { sentAt: "desc" },
      take: 20,
    });
    if (!rows.length) return reply.send({ success: true, data: null });
    const read = new Set((await prisma.announcementRead.findMany({ where: { employeeId: u.id, announcementId: { in: rows.map((r) => r.id) } }, select: { announcementId: true } })).map((r) => r.announcementId));
    const hit = rows.find((r) => !read.has(r.id));
    if (!hit) return reply.send({ success: true, data: null });
    return reply.send({ success: true, data: (await decorate([hit], u.id, false))[0] });
  });

  // GET /audience-options
  app.get(`${P}/audience-options`, { preHandler: [manageOnly] }, async (_req, reply) => {
    const people = await activePeople();
    const uniq = (xs: (string | null)[]) => [...new Set(xs.map((x) => (x ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return reply.send({
      success: true,
      data: {
        departments: uniq(people.map((p) => p.department)),
        designations: uniq(people.map((p) => p.designation)),
        roles: uniq(people.map((p) => p.role)),
        locations: uniq(people.map((p) => p.location)),
        people: people.map((p) => ({ id: p.id, name: fullName(p), sub: [p.designation, p.department].filter(Boolean).join(" · "), employeeId: p.employeeId })),
        totalActive: people.length,
      },
    });
  });

  // POST /audience-preview
  app.post(`${P}/audience-preview`, { preHandler: [manageOnly] }, async (req, reply) => {
    const a = cleanAudience((req.body as { audience?: unknown } | null)?.audience ?? req.body);
    const all = await activePeople();
    const hit = matchAudience(all, a);
    return reply.send({ success: true, data: { everyone: audienceIsEmpty(a), count: hit.length, totalActive: all.length, names: hit.slice(0, 20).map(fullName) } });
  });

  // ── Templates ───────────────────────────────────────────────────────────────
  app.get(`${P}/templates`, { preHandler: [manageOnly] }, async (req, reply) => {
    try {
      await seedTemplatesIfEmpty(req.user!.id);
    } catch (e) {
      req.log.error(e, "Seeding wish templates failed");
    }
    const rows = await prisma.wishTemplate.findMany({ orderBy: [{ kind: "asc" }, { name: "asc" }] });
    return reply.send({ success: true, data: rows.map(tplOut) });
  });

  app.post(`${P}/templates`, { preHandler: [manageOnly] }, async (req, reply) => {
    const r = readTemplate((req.body ?? {}) as Record<string, unknown>, false);
    if ("error" in r) return bad(reply, 400, r.error!);
    const d = r.data;
    if (d.kind !== "FESTIVAL") d.festivalOn = null;
    const row = await prisma.wishTemplate.create({
      data: { kind: d.kind!, name: d.name!, title: d.title!, message: d.message!, festivalOn: d.festivalOn ?? null, autoSend: d.autoSend ?? false, isActive: d.isActive ?? true, theme: d.theme ?? "classic", createdById: req.user!.id },
    });
    return reply.code(201).send({ success: true, data: tplOut(row), message: "Template saved." });
  });

  app.put(`${P}/templates/:id`, { preHandler: [manageOnly] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const cur = await prisma.wishTemplate.findUnique({ where: { id } });
    if (!cur) return bad(reply, 404, "Template not found.");
    const r = readTemplate((req.body ?? {}) as Record<string, unknown>, true);
    if ("error" in r) return bad(reply, 400, r.error!);
    const d = r.data;
    if ((d.kind ?? cur.kind) !== "FESTIVAL") d.festivalOn = null;
    const row = await prisma.wishTemplate.update({ where: { id }, data: d });
    return reply.send({ success: true, data: tplOut(row), message: "Template saved." });
  });

  app.delete(`${P}/templates/:id`, { preHandler: [manageOnly] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const n = await prisma.wishTemplate.deleteMany({ where: { id } });
    if (!n.count) return bad(reply, 404, "Template not found.");
    return reply.send({ success: true, message: "Template deleted." });
  });

  // ── Wishes ──────────────────────────────────────────────────────────────────
  app.get(`${P}/wishes/today`, { preHandler: [manageOnly] }, async (req, reply) => {
    const ymd = istYmd();
    const days = Math.min(60, Math.max(1, Number((req.query as { days?: string }).days) || 30));
    const [people, logs, festivals] = await Promise.all([
      peopleWithDates(),
      prisma.wishLog.findMany({ where: { forDate: ymd }, select: { kind: true, employeeId: true, announcementId: true, createdAt: true, sentById: true } }),
      prisma.wishTemplate.findMany({ where: { kind: "FESTIVAL", festivalOn: { not: null } }, orderBy: { festivalOn: "asc" } }),
    ]);
    const logOf = (kind: string, key: string) => logs.find((l) => l.kind === kind && l.employeeId === key) ?? null;
    const at = (d: string) => new Date(`${d}T00:00:00Z`);
    const person = (p: (typeof people)[number]) => ({ id: p.id, employeeId: p.employeeId, name: p.name, firstName: p.firstName, department: p.department, designation: p.designation, profileImage: p.profileImage });
    const sentInfo = (l: ReturnType<typeof logOf>) => (l ? { sent: true, announcementId: l.announcementId, sentAt: l.createdAt, auto: !l.sentById } : { sent: false, announcementId: null, sentAt: null, auto: false });

    const birthdays = people.filter((p) => p.dob && isYearlyOn(at(p.dob), ymd)).map((p) => ({ person: person(p), ...sentInfo(logOf("BIRTHDAY", p.id)) }));
    const anniversaries = people
      .filter((p) => p.doj && isYearlyOn(at(p.doj), ymd) && yearsBetween(at(p.doj), ymd) >= 1)
      .map((p) => ({ person: person(p), years: yearsBetween(at(p.doj!), ymd), ...sentInfo(logOf("ANNIVERSARY", p.id)) }));
    const festToday = festivals
      .filter((f) => f.festivalOn!.toISOString().slice(0, 10) === ymd)
      .map((f) => ({ template: tplOut(f), ...sentInfo(logOf("FESTIVAL", festivalKey(f.id))) }));

    const upcoming: { date: string; kind: WishKind; person?: ReturnType<typeof person>; years?: number; festival?: { id: string; name: string } }[] = [];
    for (let i = 1; i <= days; i++) {
      const d = addDaysYmd(ymd, i);
      for (const p of people) {
        if (p.dob && isYearlyOn(at(p.dob), d)) upcoming.push({ date: d, kind: "BIRTHDAY", person: person(p) });
        if (p.doj && isYearlyOn(at(p.doj), d) && yearsBetween(at(p.doj), d) >= 1) upcoming.push({ date: d, kind: "ANNIVERSARY", person: person(p), years: yearsBetween(at(p.doj), d) });
      }
      for (const f of festivals) if (f.festivalOn!.toISOString().slice(0, 10) === d) upcoming.push({ date: d, kind: "FESTIVAL", festival: { id: f.id, name: f.name } });
    }
    return reply.send({
      success: true,
      data: { date: ymd, birthdays, anniversaries, festivals: festToday, upcoming, missingDates: people.filter((p) => !p.dob || !p.doj).length },
    });
  });

  app.post(`${P}/wishes/send`, { preHandler: [manageOnly] }, async (req, reply) => {
    const b = (req.body ?? {}) as { kind?: string; employeeId?: string; templateId?: string };
    if (!WISH_KINDS.includes(b.kind as WishKind)) return bad(reply, 400, "Choose birthday, work anniversary or festival.");
    if (!b.templateId || typeof b.templateId !== "string") return bad(reply, 400, "Choose a template.");
    try {
      const r = await sendWish({ kind: b.kind as WishKind, templateId: b.templateId, employeeId: b.employeeId ?? null, sentById: req.user!.id });
      return reply.code(201).send({ success: true, data: r, message: `Wishes sent to ${r.recipients} people.` });
    } catch (e) {
      return fail(reply, req, e);
    }
  });

  // ── Single announcement ─────────────────────────────────────────────────────
  app.get(`${P}/:id`, { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const { id } = req.params as { id: string };
    const a = await prisma.announcement.findUnique({ where: { id } });
    const manager = canManage(u);
    if (!a || (!manager && (a.status !== "SENT" || !a.recipientIds.includes(u.id)))) return bad(reply, 404, "Announcement not found.");
    return reply.send({ success: true, data: (await decorate([a], u.id, manager))[0] });
  });

  /** Applies body.action after a create/update: draft, schedule or send now. */
  async function applyAction(id: string, action: string, scheduledAt: Date | null | undefined) {
    if (action === "draft") {
      await prisma.announcement.update({ where: { id }, data: { status: "DRAFT" } });
      return { message: "Saved as draft." };
    }
    if (action === "schedule" || (action === "send" && scheduledAt && scheduledAt.getTime() > Date.now() + 30_000)) {
      if (!scheduledAt) throw new HttpError(400, "Choose when to send it.");
      if (scheduledAt.getTime() <= Date.now()) throw new HttpError(400, "The schedule time has already passed.");
      await prisma.announcement.update({ where: { id }, data: { status: "SCHEDULED" } });
      return { message: `Scheduled for ${scheduledAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}.` };
    }
    const r = await sendAnnouncement(id);
    return { message: `Sent to ${r.recipients} ${r.recipients === 1 ? "person" : "people"}.` };
  }

  app.post(P, { preHandler: [manageOnly] }, async (req, reply) => {
    const b = (req.body ?? {}) as Body;
    const action = typeof b.action === "string" ? b.action : "draft";
    if (!["draft", "send", "schedule"].includes(action)) return bad(reply, 400, "Unknown action.");
    const r = readBody(b, false);
    if ("error" in r) return bad(reply, 400, r.error!);
    const d = r.data;
    if (action === "send" && !d.scheduledAt) {
      // Check the audience before anything is saved.
      const n = matchAudience(await activePeople(), (d.audience ?? {}) as ReturnType<typeof cleanAudience>).length;
      if (!n) return bad(reply, 400, "No active staff match the selected audience.");
    }
    const a = await prisma.announcement.create({
      data: {
        title: d.title!,
        message: d.message!,
        category: d.category ?? "Announcement",
        audience: d.audience ?? {},
        pinned: d.pinned ?? false,
        scheduledAt: d.scheduledAt ?? null,
        expiresAt: d.expiresAt ?? null,
        status: "DRAFT",
        createdById: req.user!.id,
      },
    });
    try {
      const res = await applyAction(a.id, action, d.scheduledAt);
      const fresh = await prisma.announcement.findUniqueOrThrow({ where: { id: a.id } });
      return reply.code(201).send({ success: true, data: (await decorate([fresh], req.user!.id, true))[0], message: res.message });
    } catch (e) {
      // Keep what they wrote as a draft so nothing is lost.
      if (e instanceof HttpError) return reply.code(e.status).send({ success: false, message: `${e.message} It was saved as a draft.`, data: { id: a.id } });
      return fail(reply, req, e);
    }
  });

  app.put(`${P}/:id`, { preHandler: [manageOnly] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const cur = await prisma.announcement.findUnique({ where: { id } });
    if (!cur) return bad(reply, 404, "Announcement not found.");
    const b = (req.body ?? {}) as Body;
    const action = typeof b.action === "string" ? b.action : undefined;
    if (action && !["draft", "send", "schedule"].includes(action)) return bad(reply, 400, "Unknown action.");
    // Pinning and expiry can still be changed after sending; everything else only before.
    if (cur.status === "SENT" || cur.status === "CANCELLED") {
      const allowed = Object.keys(b).every((k) => ["pinned", "expiresAt"].includes(k));
      if (!allowed || cur.status === "CANCELLED") return bad(reply, 409, "Only drafts and scheduled announcements can be edited. Duplicate it instead.");
    }
    const r = readBody(b, true);
    if ("error" in r) return bad(reply, 400, r.error!);
    const d = r.data;
    const n = await prisma.announcement.updateMany({ where: { id, status: cur.status }, data: d });
    if (!n.count) return bad(reply, 409, "It changed while you were editing. Reload and try again.");
    try {
      // Editing a scheduled one keeps it scheduled unless an action says otherwise.
      const effective = action ?? (cur.status === "SCHEDULED" ? "schedule" : undefined);
      const res = effective && cur.status !== "SENT" ? await applyAction(id, effective, d.scheduledAt !== undefined ? d.scheduledAt : cur.scheduledAt) : { message: "Saved." };
      const fresh = await prisma.announcement.findUniqueOrThrow({ where: { id } });
      return reply.send({ success: true, data: (await decorate([fresh], req.user!.id, true))[0], message: res.message });
    } catch (e) {
      return fail(reply, req, e);
    }
  });

  app.post(`${P}/:id/send`, { preHandler: [manageOnly] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const r = await sendAnnouncement(id);
      return reply.send({ success: true, data: r, message: `Sent to ${r.recipients} ${r.recipients === 1 ? "person" : "people"}.` });
    } catch (e) {
      return fail(reply, req, e);
    }
  });

  app.post(`${P}/:id/cancel`, { preHandler: [manageOnly] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const cur = await prisma.announcement.findUnique({ where: { id }, select: { status: true } });
    if (!cur) return bad(reply, 404, "Announcement not found.");
    if (cur.status === "CANCELLED") return bad(reply, 409, "It's already cancelled.");
    const n = await prisma.announcement.updateMany({ where: { id, status: { in: ["DRAFT", "SCHEDULED", "SENT"] } }, data: { status: "CANCELLED" } });
    if (!n.count) return bad(reply, 409, "It changed in the meantime. Reload and try again.");
    // A withdrawn announcement shouldn't leave unread notifications pointing at it.
    if (cur.status === "SENT") await prisma.notification.deleteMany({ where: { relatedId: id, module: "Announcements", isRead: false } });
    return reply.send({ success: true, message: cur.status === "SENT" ? "Withdrawn — staff no longer see it." : "Cancelled." });
  });

  app.delete(`${P}/:id`, { preHandler: [manageOnly] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const cur = await prisma.announcement.findUnique({ where: { id }, select: { status: true } });
    if (!cur) return bad(reply, 404, "Announcement not found.");
    const r = normRole(req.user!.role);
    if (cur.status !== "DRAFT" && r !== "admin" && r !== "owner") return bad(reply, 403, "Only drafts can be deleted. Cancel it instead.");
    await prisma.$transaction([
      prisma.announcementRead.deleteMany({ where: { announcementId: id } }),
      prisma.notification.deleteMany({ where: { relatedId: id, module: "Announcements" } }),
      // Deleting a wish lets it be sent again the same day.
      prisma.wishLog.deleteMany({ where: { announcementId: id } }),
      prisma.announcement.delete({ where: { id } }),
    ]);
    return reply.send({ success: true, message: "Deleted." });
  });

  app.post(`${P}/:id/read`, { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const { id } = req.params as { id: string };
    const a = await prisma.announcement.findUnique({ where: { id }, select: { status: true, recipientIds: true } });
    if (!a || a.status !== "SENT" || !a.recipientIds.includes(u.id)) return bad(reply, 404, "Announcement not found.");
    await prisma.announcementRead.upsert({
      where: { announcementId_employeeId: { announcementId: id, employeeId: u.id } },
      create: { announcementId: id, employeeId: u.id },
      update: {},
    });
    // Its notification is read too.
    await prisma.notification.updateMany({ where: { userId: u.id, relatedId: id, module: "Announcements", isRead: false }, data: { isRead: true } });
    return reply.send({ success: true });
  });
}
