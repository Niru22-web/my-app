import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/db";
import { authenticate, normRole } from "../plugins/auth";
import { createNotification } from "../utils/notify";

// ── Release notes ("What's new") and feedback ────────────────────────────────

const RELEASE_MANAGERS = new Set(["admin", "owner", "it"]);
const FEEDBACK_REVIEWERS = new Set(["admin", "owner", "it", "hr"]);
const isReleaseManager = (req: FastifyRequest) => RELEASE_MANAGERS.has(normRole(req.user?.role));
const isFeedbackReviewer = (req: FastifyRequest) => FEEDBACK_REVIEWERS.has(normRole(req.user?.role));

const TAGS = ["feature", "fix", "improvement", "security"] as const;
const ITEM_TYPES = ["New", "Improved", "Changed", "Fixed"] as const;
const VERSION_RE = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/;

type ItemType = (typeof ITEM_TYPES)[number];
interface SectionItem {
  type: ItemType;
  text: string;
}
interface Section {
  module: string;
  items: SectionItem[];
}

const bad = (reply: FastifyReply, message: string, code = 400) => reply.code(code).send({ success: false, message });
const forbidden = (reply: FastifyReply) => bad(reply, "You don’t have permission to perform this action.", 403);

/** Checks and normalises the editable fields. Returns an error message or the clean data. */
function parseRelease(body: unknown, partial: boolean): { error: string } | { data: Record<string, unknown> } {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  if (!partial || b.version !== undefined) {
    const v = typeof b.version === "string" ? b.version.trim() : "";
    if (!VERSION_RE.test(v)) return { error: "Version must look like v1.4.0 (a “v” followed by major.minor.patch)." };
    out.version = v;
  }
  if (!partial || b.title !== undefined) {
    const t = typeof b.title === "string" ? b.title.trim() : "";
    if (!t) return { error: "Add a title for the release." };
    if (t.length > 160) return { error: "Keep the title under 160 characters." };
    out.title = t;
  }
  if (b.summary !== undefined) {
    const s = typeof b.summary === "string" ? b.summary.trim() : "";
    if (s.length > 2000) return { error: "Keep the summary under 2,000 characters." };
    out.summary = s || null;
  }
  if (!partial || b.tags !== undefined) {
    const tags = Array.isArray(b.tags) ? b.tags.map((t) => String(t).trim().toLowerCase()) : [];
    const wrong = tags.find((t) => !(TAGS as readonly string[]).includes(t));
    if (wrong) return { error: `“${wrong}” isn’t a release tag. Use feature, fix, improvement or security.` };
    out.tags = TAGS.filter((t) => tags.includes(t));
  }
  if (!partial || b.sections !== undefined) {
    if (!Array.isArray(b.sections) || b.sections.length === 0) return { error: "Add at least one module with a change." };
    const sections: Section[] = [];
    for (const [i, raw] of b.sections.entries()) {
      const s = (raw ?? {}) as Record<string, unknown>;
      const module = typeof s.module === "string" ? s.module.trim() : "";
      if (!module) return { error: `Section ${i + 1} needs a module name.` };
      if (!Array.isArray(s.items) || s.items.length === 0) return { error: `Add at least one change under “${module}”.` };
      const items: SectionItem[] = [];
      for (const [j, it] of s.items.entries()) {
        const x = (it ?? {}) as Record<string, unknown>;
        const type = typeof x.type === "string" ? x.type.trim() : "";
        const match = ITEM_TYPES.find((t) => t.toLowerCase() === type.toLowerCase());
        if (!match) return { error: `Change ${j + 1} under “${module}” needs a type: New, Improved, Changed or Fixed.` };
        const text = typeof x.text === "string" ? x.text.trim() : "";
        if (!text) return { error: `Change ${j + 1} under “${module}” is empty.` };
        if (text.length > 500) return { error: `Change ${j + 1} under “${module}” is too long (500 characters max).` };
        items.push({ type: match, text });
      }
      sections.push({ module, items });
    }
    out.sections = sections as unknown as Prisma.InputJsonValue;
  }
  return { data: out };
}

// ── First-run seed: what has really been built in this re-platform ─────────
const SEED = {
  version: "v1.0.0",
  title: "Accounts, imports, dashboards and much more",
  summary:
    "The first release of the new ASA Portal. Accounts now follow GST numbering and lock issued invoices, timesheets have a weekly grid and Excel import, leave and attendance requests have proper approvals, and every table can be filtered, searched and exported.",
  tags: ["feature", "fix", "improvement", "security"],
  sections: [
    {
      module: "Accounts & Finance",
      items: [
        { type: "New", text: "GST-compliant invoice numbering per entity per financial year (e.g. ASA/2026-27/0001)." },
        { type: "New", text: "Credit notes." },
        { type: "New", text: "TDS on receipts." },
        { type: "New", text: "Receipt reversal for bounced cheques." },
        { type: "Changed", text: "Issued invoices are locked — only the UDIN can be added." },
        { type: "Improved", text: "Bank auto-match now suggests matches for review instead of applying them." },
        { type: "Fixed", text: "Invoices now post to the client ledger." },
      ],
    },
    {
      module: "Timesheets",
      items: [
        { type: "New", text: "Weekly grid entry." },
        { type: "New", text: "Period lock for Admins." },
        { type: "New", text: "Excel template, import and export." },
        { type: "Fixed", text: "The Export button now works." },
      ],
    },
    {
      module: "Attendance",
      items: [
        { type: "New", text: "Missed-punch correction requests with manager approval." },
        { type: "New", text: "Late and half-day rules set by HR." },
      ],
    },
    {
      module: "Leave",
      items: [
        { type: "New", text: "Team leave calendar." },
        { type: "Improved", text: "A reason is required when rejecting a leave request." },
        { type: "New", text: "Cancel approved leave before it starts." },
      ],
    },
    {
      module: "Expense claims",
      items: [
        { type: "New", text: "Expense policy limits per category." },
        { type: "Fixed", text: "Team leads now see the claims they need to approve." },
        { type: "Improved", text: "Approvers are notified at each step." },
      ],
    },
    {
      module: "Help desk",
      items: [
        { type: "New", text: "Response targets (SLA) with due chips." },
        { type: "New", text: "Internal notes on tickets." },
        { type: "New", text: "Assign to me." },
        { type: "Fixed", text: "Tickets are auto-assigned and show the assignee." },
      ],
    },
    {
      module: "Management",
      items: [
        { type: "New", text: "Bulk import with templates for employees, clients, projects, jobs, assets, vendors and holidays." },
        { type: "New", text: "Exit workflow with a hand-over checklist." },
        { type: "New", text: "Employee document checklist." },
      ],
    },
    {
      module: "Dashboards",
      items: [
        { type: "New", text: "Partner / Team dashboard." },
        { type: "New", text: "HR dashboard." },
        { type: "Fixed", text: "“Needs your attention” counts now show only what you can act on." },
      ],
    },
    {
      module: "Security",
      items: [
        { type: "Fixed", text: "Only Admin or Owner can grant the Admin role." },
        { type: "Fixed", text: "KYC documents require sign-in and permission." },
        { type: "Fixed", text: "Paid claims can’t be sent back or paid again." },
        { type: "Fixed", text: "Old log clean-up no longer deletes recent logs." },
      ],
    },
    {
      module: "General",
      items: [{ type: "New", text: "Every table has status filters with counts, search, rows-per-page and export." }],
    },
  ] satisfies Section[],
};

let seedChecked = false;
async function seedOnce(createdById: string) {
  if (seedChecked) return;
  const n = await prisma.release.count();
  if (n === 0) {
    try {
      await prisma.release.create({
        data: { ...SEED, sections: SEED.sections as unknown as Prisma.InputJsonValue, status: "PUBLISHED", publishedAt: new Date(), createdById },
      });
    } catch {
      /* another request seeded it first */
    }
  }
  seedChecked = true;
}

async function namesOf(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter(Boolean) as string[])];
  if (!unique.length) return new Map<string, { id: string; name: string; department: string | null }>();
  const rows = await prisma.employee.findMany({ where: { id: { in: unique } }, select: { id: true, firstName: true, lastName: true, department: true } });
  return new Map(rows.map((r) => [r.id, { id: r.id, name: `${r.firstName} ${r.lastName}`.trim(), department: r.department }]));
}

const newestFirst = (a: { publishedAt: Date | null; createdAt: Date }, b: { publishedAt: Date | null; createdAt: Date }) =>
  (b.publishedAt ?? b.createdAt).getTime() - (a.publishedAt ?? a.createdAt).getTime();

// ── Feedback ───────────────────────────────────────────────────────────────
const CATEGORIES = ["Idea", "Problem", "Praise", "Question", "Other"] as const;
const FB_STATUSES = ["NEW", "REVIEWED", "PLANNED", "DONE", "CLOSED"] as const;
const BUG_MODULES = new Set(["Dashboard", "Timesheet", "Attendance", "Leave", "Expense claims", "Help desk", "Accounts", "Assets", "Management", "Reports", "Announcements", "Administration", "Other"]);
const FB_STATUS_LABEL:Record<string, string> = { NEW: "New", REVIEWED: "Reviewed", PLANNED: "Planned", DONE: "Done", CLOSED: "Closed" };

type FeedbackRow = Prisma.FeedbackGetPayload<object>;

async function shapeFeedback(rows: FeedbackRow[], viewerId: string) {
  const people = await namesOf(rows.flatMap((r) => [r.employeeId, r.respondedById]));
  return rows.map((r) => {
    const mine = r.employeeId === viewerId;
    const hide = r.anonymous && !mine;
    return {
      id: r.id,
      category: r.category,
      rating: r.rating,
      message: r.message,
      module: r.module,
      pageUrl: r.pageUrl,
      anonymous: r.anonymous,
      status: r.status,
      response: r.response,
      respondedAt: r.respondedAt,
      respondedBy: r.respondedById ? (people.get(r.respondedById)?.name ?? null) : null,
      bugId: r.bugId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      mine,
      employeeId: hide ? null : r.employeeId,
      sender: hide ? null : (people.get(r.employeeId) ?? null),
    };
  });
}

export async function releaseRoutes(app: FastifyInstance) {
  // ── Releases ──────────────────────────────────────────────────────────────

  // GET /api/releases — published, newest first. Managers get drafts too with ?all=1.
  app.get("/api/releases", { preHandler: [authenticate] }, async (req, reply) => {
    await seedOnce(req.user!.id);
    const all = (req.query as { all?: string })?.all === "1" && isReleaseManager(req);
    const rows = await prisma.release.findMany({ where: all ? {} : { status: "PUBLISHED" } });
    rows.sort((a, b) => {
      // Drafts on top for managers, then newest first.
      if (a.status !== b.status) return a.status === "DRAFT" ? -1 : 1;
      return newestFirst(a, b);
    });
    const people = await namesOf(rows.map((r) => r.createdById));
    return reply.send({
      success: true,
      data: rows.map((r) => ({ ...r, createdBy: people.get(r.createdById)?.name ?? null })),
      canManage: isReleaseManager(req),
    });
  });

  // GET /api/releases/latest-unseen — newest published release I haven't dismissed, or null.
  app.get("/api/releases/latest-unseen", { preHandler: [authenticate] }, async (req, reply) => {
    const latest = await prisma.release.findFirst({ where: { status: "PUBLISHED" }, orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }] });
    if (!latest) return reply.send({ success: true, data: null });
    const seen = await prisma.releaseSeen.findUnique({ where: { employeeId: req.user!.id } });
    if (seen) {
      if (seen.releaseId === latest.id) return reply.send({ success: true, data: null });
      const seenRelease = await prisma.release.findUnique({ where: { id: seen.releaseId }, select: { publishedAt: true, status: true } });
      if (seenRelease?.status === "PUBLISHED" && seenRelease.publishedAt && latest.publishedAt && seenRelease.publishedAt >= latest.publishedAt) {
        return reply.send({ success: true, data: null });
      }
    }
    return reply.send({ success: true, data: latest });
  });

  // GET /api/releases/:id — by id or by version (e.g. v1.0.0)
  app.get<{ Params: { id: string } }>("/api/releases/:id", { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params;
    const r = await prisma.release.findFirst({ where: VERSION_RE.test(id) ? { version: id } : { id } });
    if (!r || (r.status !== "PUBLISHED" && !isReleaseManager(req))) return bad(reply, "This release couldn’t be found.", 404);
    const people = await namesOf([r.createdById]);
    return reply.send({ success: true, data: { ...r, createdBy: people.get(r.createdById)?.name ?? null } });
  });

  // POST /api/releases — new draft
  app.post("/api/releases", { preHandler: [authenticate] }, async (req, reply) => {
    if (!isReleaseManager(req)) return forbidden(reply);
    const parsed = parseRelease(req.body, false);
    if ("error" in parsed) return bad(reply, parsed.error);
    const d = parsed.data as { version: string; title: string; summary?: string | null; tags: string[]; sections: Prisma.InputJsonValue };
    if (await prisma.release.findUnique({ where: { version: d.version } })) return bad(reply, `Version ${d.version} already exists. Use a new version number.`, 409);
    const created = await prisma.release.create({ data: { ...d, status: "DRAFT", createdById: req.user!.id } });
    return reply.code(201).send({ success: true, data: created, message: `Draft ${created.version} saved.` });
  });

  // PUT /api/releases/:id
  app.put<{ Params: { id: string } }>("/api/releases/:id", { preHandler: [authenticate] }, async (req, reply) => {
    if (!isReleaseManager(req)) return forbidden(reply);
    const existing = await prisma.release.findUnique({ where: { id: req.params.id } });
    if (!existing) return bad(reply, "This release couldn’t be found.", 404);
    const parsed = parseRelease(req.body, true);
    if ("error" in parsed) return bad(reply, parsed.error);
    const d = parsed.data as { version?: string };
    if (d.version && d.version !== existing.version && (await prisma.release.findUnique({ where: { version: d.version } }))) {
      return bad(reply, `Version ${d.version} already exists. Use a new version number.`, 409);
    }
    const updated = await prisma.release.update({ where: { id: existing.id }, data: parsed.data });
    return reply.send({ success: true, data: updated, message: `${updated.version} saved.` });
  });

  // POST /api/releases/:id/publish — publishes and tells everyone active.
  app.post<{ Params: { id: string } }>("/api/releases/:id/publish", { preHandler: [authenticate] }, async (req, reply) => {
    if (!isReleaseManager(req)) return forbidden(reply);
    const r = await prisma.release.findUnique({ where: { id: req.params.id } });
    if (!r) return bad(reply, "This release couldn’t be found.", 404);
    if (r.status === "PUBLISHED") return bad(reply, `${r.version} is already published.`);
    const check = parseRelease(r, false);
    if ("error" in check) return bad(reply, `Fix this before publishing: ${check.error}`);
    const published = await prisma.release.update({ where: { id: r.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });

    const people = await prisma.employee.findMany({
      where: { status: { equals: "active", mode: "insensitive" }, approvalStatus: { not: "REJECTED" } },
      select: { id: true },
    });
    let notified = 0;
    for (let i = 0; i < people.length; i += 20) {
      const batch = await Promise.all(
        people.slice(i, i + 20).map((p) =>
          createNotification({
            userId: p.id,
            title: `What’s new: ${published.version}`,
            message: published.title,
            type: "Release",
            module: "Releases",
            priority: "Info",
            relatedId: published.id,
            actionUrl: `/releases#${published.version}`,
          }),
        ),
      );
      notified += batch.filter(Boolean).length;
    }
    return reply.send({ success: true, data: published, notified, message: `${published.version} published. ${notified} people were notified.` });
  });

  // POST /api/releases/:id/unpublish — back to draft; withdraws its notifications.
  app.post<{ Params: { id: string } }>("/api/releases/:id/unpublish", { preHandler: [authenticate] }, async (req, reply) => {
    if (!isReleaseManager(req)) return forbidden(reply);
    const r = await prisma.release.findUnique({ where: { id: req.params.id } });
    if (!r) return bad(reply, "This release couldn’t be found.", 404);
    if (r.status !== "PUBLISHED") return bad(reply, `${r.version} isn’t published.`);
    const updated = await prisma.release.update({ where: { id: r.id }, data: { status: "DRAFT", publishedAt: null } });
    const removed = await prisma.notification.deleteMany({ where: { relatedId: r.id, type: "Release" } });
    return reply.send({ success: true, data: updated, withdrawn: removed.count, message: `${r.version} moved back to drafts.` });
  });

  // DELETE /api/releases/:id — drafts only
  app.delete<{ Params: { id: string } }>("/api/releases/:id", { preHandler: [authenticate] }, async (req, reply) => {
    if (!isReleaseManager(req)) return forbidden(reply);
    const r = await prisma.release.findUnique({ where: { id: req.params.id } });
    if (!r) return bad(reply, "This release couldn’t be found.", 404);
    if (r.status !== "DRAFT") return bad(reply, "Only drafts can be deleted. Unpublish the release first.");
    await prisma.release.delete({ where: { id: r.id } });
    await prisma.notification.deleteMany({ where: { relatedId: r.id, type: "Release" } });
    await prisma.releaseSeen.deleteMany({ where: { releaseId: r.id } });
    return reply.send({ success: true, message: `${r.version} deleted.` });
  });

  // POST /api/releases/:id/seen — dismisses the "What's new" prompt.
  app.post<{ Params: { id: string } }>("/api/releases/:id/seen", { preHandler: [authenticate] }, async (req, reply) => {
    const r = await prisma.release.findUnique({ where: { id: req.params.id }, select: { id: true, status: true } });
    if (!r || r.status !== "PUBLISHED") return bad(reply, "This release couldn’t be found.", 404);
    const employeeId = req.user!.id;
    await prisma.releaseSeen.upsert({ where: { employeeId }, create: { employeeId, releaseId: r.id }, update: { releaseId: r.id, seenAt: new Date() } });
    return reply.send({ success: true });
  });

  // ── Feedback ──────────────────────────────────────────────────────────────

  // POST /api/feedback
  app.post("/api/feedback", { preHandler: [authenticate] }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const category = CATEGORIES.find((c) => c.toLowerCase() === String(b.category ?? "").trim().toLowerCase());
    if (!category) return bad(reply, "Pick a category: Idea, Problem, Praise, Question or Other.");
    let rating: number | null = null;
    if (b.rating !== undefined && b.rating !== null && b.rating !== "") {
      rating = Number(b.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) return bad(reply, "Rating must be between 1 and 5 stars.");
    }
    const message = typeof b.message === "string" ? b.message.trim() : "";
    if (message.length < 5) return bad(reply, "Tell us a little more — at least 5 characters.");
    if (message.length > 2000) return bad(reply, "Keep your message under 2,000 characters.");
    const module = typeof b.module === "string" && b.module.trim() ? b.module.trim().slice(0, 80) : null;
    const pageUrl = typeof b.pageUrl === "string" && b.pageUrl.startsWith("/") ? b.pageUrl.slice(0, 300) : null;
    const created = await prisma.feedback.create({
      data: { employeeId: req.user!.id, category, rating, message, module, pageUrl, anonymous: b.anonymous === true },
    });
    const [data] = await shapeFeedback([created], req.user!.id);
    return reply.code(201).send({ success: true, data, message: "Thanks — your feedback was sent." });
  });

  // GET /api/feedback — mine; reviewers see everything (unless ?mine=1).
  app.get("/api/feedback", { preHandler: [authenticate] }, async (req, reply) => {
    const q = (req.query ?? {}) as { status?: string; category?: string; q?: string; mine?: string };
    const reviewer = isFeedbackReviewer(req) && q.mine !== "1";
    const base: Prisma.FeedbackWhereInput = reviewer ? {} : { employeeId: req.user!.id };
    const where: Prisma.FeedbackWhereInput = { ...base };
    if (q.status && q.status !== "all") where.status = q.status.toUpperCase();
    if (q.category && q.category !== "all") where.category = { equals: q.category, mode: "insensitive" };
    if (q.q?.trim()) {
      const term = q.q.trim();
      where.OR = [{ message: { contains: term, mode: "insensitive" } }, { module: { contains: term, mode: "insensitive" } }, { response: { contains: term, mode: "insensitive" } }];
    }
    const rows = await prisma.feedback.findMany({ where, orderBy: { createdAt: "desc" }, take: 2000 });
    const data = await shapeFeedback(rows, req.user!.id);

    const groups = await prisma.feedback.groupBy({ by: ["status"], where: base, _count: { _all: true } });
    const counts: Record<string, number> = Object.fromEntries(FB_STATUSES.map((s) => [s, 0]));
    let total = 0;
    for (const g of groups) {
      counts[g.status] = (counts[g.status] ?? 0) + g._count._all;
      total += g._count._all;
    }
    const agg = await prisma.feedback.aggregate({ where: { ...base, rating: { not: null } }, _avg: { rating: true }, _count: { rating: true } });
    const converted = await prisma.feedback.count({ where: { ...base, bugId: { not: null } } });
    return reply.send({
      success: true,
      data,
      reviewer,
      canReview: isFeedbackReviewer(req),
      summary: {
        total,
        counts,
        averageRating: agg._avg.rating == null ? null : Math.round(agg._avg.rating * 10) / 10,
        rated: agg._count.rating,
        convertedToBugs: converted,
      },
    });
  });

  // PATCH /api/feedback/:id — reviewers set status and reply.
  app.patch<{ Params: { id: string } }>("/api/feedback/:id", { preHandler: [authenticate] }, async (req, reply) => {
    if (!isFeedbackReviewer(req)) return forbidden(reply);
    const fb = await prisma.feedback.findUnique({ where: { id: req.params.id } });
    if (!fb) return bad(reply, "This feedback couldn’t be found.", 404);
    const b = (req.body ?? {}) as { status?: unknown; response?: unknown };
    const data: Prisma.FeedbackUpdateInput = {};
    if (b.status !== undefined) {
      const s = String(b.status).toUpperCase();
      if (!(FB_STATUSES as readonly string[]).includes(s)) return bad(reply, "Status must be New, Reviewed, Planned, Done or Closed.");
      data.status = s;
    }
    let newReply = false;
    if (b.response !== undefined) {
      const text = typeof b.response === "string" ? b.response.trim() : "";
      if (text.length > 2000) return bad(reply, "Keep the reply under 2,000 characters.");
      if (text && text !== (fb.response ?? "")) newReply = true;
      data.response = text || null;
      data.respondedById = text ? req.user!.id : null;
      data.respondedAt = text ? new Date() : null;
      // A reply on brand-new feedback means it has been looked at.
      if (text && b.status === undefined && fb.status === "NEW") data.status = "REVIEWED";
    }
    if (!Object.keys(data).length) return bad(reply, "Nothing to update.");
    const updated = await prisma.feedback.update({ where: { id: fb.id }, data });
    if (newReply && !fb.anonymous) {
      await createNotification({
        userId: fb.employeeId,
        title: "Reply to your feedback",
        message: `${String(data.response).slice(0, 140)}${String(data.response).length > 140 ? "…" : ""}`,
        type: "Feedback",
        module: "Feedback",
        relatedId: fb.id,
        actionUrl: "/feedback",
      });
    }
    const [shaped] = await shapeFeedback([updated], req.user!.id);
    return reply.send({ success: true, data: shaped, message: newReply ? (fb.anonymous ? "Reply saved. The sender was anonymous, so they’ll see it in their list." : "Reply sent.") : `Marked as ${FB_STATUS_LABEL[updated.status] ?? updated.status}.` });
  });

  // POST /api/feedback/:id/convert-to-bug — files it in the bug tracker.
  app.post<{ Params: { id: string } }>("/api/feedback/:id/convert-to-bug", { preHandler: [authenticate] }, async (req, reply) => {
    if (!isFeedbackReviewer(req)) return forbidden(reply);
    const fb = await prisma.feedback.findUnique({ where: { id: req.params.id } });
    if (!fb) return bad(reply, "This feedback couldn’t be found.", 404);
    if (fb.bugId) return bad(reply, "A bug ticket was already created from this feedback.", 409);

    const firstLine = fb.message.split(/\r?\n/)[0].trim();
    const title = firstLine.length >= 5 ? (firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine) : `Feedback: ${fb.category}`;
    const payload = {
      title,
      description: `${fb.message}\n\nFrom feedback (${fb.category}${fb.rating ? `, rating ${fb.rating}/5` : ""})`,
      type: fb.category === "Problem" ? "Bug" : "Enhancement",
      // The bug tracker has a fixed module list; anything else is filed under Other.
      module: fb.module ? (BUG_MODULES.has(fb.module) ? fb.module : "Other") : undefined,
      priority: "Medium",
      environment: "Live",
      pageUrl: fb.pageUrl ?? undefined,
    };
    const res = await app.inject({
      method: "POST",
      url: "/api/bugs",
      headers: { authorization: req.headers.authorization ?? "", "content-type": "application/json" },
      payload: JSON.stringify(payload),
    });
    if (res.statusCode === 404) return bad(reply, "The bug tracker isn’t ready yet. Try again once it’s available.", 503);
    let body: { success?: boolean; message?: string; data?: { id?: string; code?: string } } = {};
    try {
      body = res.json();
    } catch {
      /* non-JSON */
    }
    if (res.statusCode >= 400 || !body.data?.id) {
      return bad(reply, body.message || `The bug tracker didn’t accept the ticket (${res.statusCode}).`, res.statusCode >= 400 && res.statusCode < 500 ? res.statusCode : 502);
    }
    const updated = await prisma.feedback.update({ where: { id: fb.id }, data: { bugId: body.data.id, status: "PLANNED" } });
    const [shaped] = await shapeFeedback([updated], req.user!.id);
    return reply.send({
      success: true,
      data: shaped,
      bug: { id: body.data.id, code: body.data.code ?? null },
      message: body.data.code ? `Bug ticket ${body.data.code} created.` : "Bug ticket created.",
    });
  });

  // DELETE /api/feedback/:id — own while still New, or reviewers.
  app.delete<{ Params: { id: string } }>("/api/feedback/:id", { preHandler: [authenticate] }, async (req, reply) => {
    const fb = await prisma.feedback.findUnique({ where: { id: req.params.id } });
    if (!fb) return bad(reply, "This feedback couldn’t be found.", 404);
    const own = fb.employeeId === req.user!.id;
    if (!isFeedbackReviewer(req)) {
      if (!own) return forbidden(reply);
      if (fb.status !== "NEW") return bad(reply, "This feedback has already been looked at, so it can’t be deleted.");
    }
    await prisma.feedback.delete({ where: { id: fb.id } });
    return reply.send({ success: true, message: "Feedback deleted." });
  });
}
