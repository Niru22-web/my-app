import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../config/db";
import { authenticate, normRole, type JwtUser } from "../plugins/auth";
import { parseBodyOrMultipart, type ParsedMultipart, type SavedUpload } from "../utils/uploads";
import { createNotification } from "../utils/notify";
import { sendWorkbook } from "../utils/sheets";
import { resolveUpload } from "../utils/file-access";
import { BUG_TRIAGE_ROLES, isBugTriage } from "../utils/bug-access";

// ── Bug tracker ──────────────────────────────────────────────────────────────
// Anyone signed in can report, view and comment. Admin/Owner/IT triage (any status, assignee,
// priority, due date, environment, external ref, delete). The assignee moves the work along;
// the reporter can edit while Open, reopen a closed ticket, and delete it while Open and unassigned.

const TYPES = ["Bug", "Feature", "Enhancement"];
const MODULES = [
  "Dashboard", "Timesheet", "Attendance", "Leave", "Expense claims", "Help desk", "Accounts", "Assets",
  "Management", "Reports", "Announcements", "Administration", "Other",
];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];
const STATUSES = ["Open", "In Progress", "Pending Discussion", "Ready to Test", "Resolved", "Reopened", "Not a Bug"];
const CLOSED = new Set(["Resolved", "Not a Bug"]);
const ASSIGNEE_STATUSES = ["In Progress", "Pending Discussion", "Ready to Test", "Resolved"];
const ENVIRONMENTS = ["UAT", "Live"];
const DUE_DAYS: Record<string, number> = { Critical: 1, High: 3, Medium: 14, Low: 30 };

const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".txt", ".log", ".csv", ".xlsx", ".docx"]);
const MAX_FILE_MB = 15;

// ── IST dates ────────────────────────────────────────────────────────────────
const IST_MS = 330 * 60_000;
const istYmd = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
const addDaysYmd = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const isYmd = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
/** Default due date: end of the IST day N days from today (Critical 1, High 3, Medium 14, Low 30). */
const defaultDue = (priority: string, now = new Date()) => new Date(`${addDaysYmd(istYmd(now), DUE_DAYS[priority] ?? 14)}T23:59:00.000+05:30`);

const isOpenish = (status: string) => !CLOSED.has(status);
const isPastDue = (b: { dueDate: Date | null; status: string }, now = Date.now()) => !!b.dueDate && b.dueDate.getTime() < now && isOpenish(b.status);

// ── Helpers ──────────────────────────────────────────────────────────────────
type Bug = Prisma.BugReportGetPayload<object>;
type BugEventRow = Prisma.BugEventGetPayload<object>;
interface FileRef { path: string; name: string; size: number; mimeType: string }
interface Person { id: string; name: string; employeeId: string; role: string; designation: string | null; profileImage: string | null }

const bad = (reply: FastifyReply, code: number, message: string) => reply.code(code).send({ success: false, message });
const str = (v: unknown) => (v === undefined || v === null ? undefined : String(v).trim());

async function loadPeople(ids: (string | null | undefined)[]): Promise<Map<string, Person>> {
  const list = [...new Set(ids.filter(Boolean) as string[])];
  if (!list.length) return new Map();
  const rows = await prisma.employee.findMany({
    where: { id: { in: list } },
    select: { id: true, employeeId: true, firstName: true, lastName: true, role: true, designation: true, profileImage: true },
  });
  return new Map(
    rows.map((e) => [e.id, { id: e.id, name: `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim() || e.employeeId, employeeId: e.employeeId, role: e.role, designation: e.designation ?? null, profileImage: e.profileImage ?? null }]),
  );
}

async function actorName(u: JwtUser) {
  const fromToken = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  if (fromToken) return fromToken;
  return (await loadPeople([u.id])).get(u.id)?.name ?? "Someone";
}

/** What the caller may do with this bug. */
function permsFor(u: JwtUser, b: Pick<Bug, "reporterId" | "assigneeId" | "status">) {
  const triage = isBugTriage(u.role);
  const reporter = b.reporterId === u.id;
  const assignee = !!b.assigneeId && b.assigneeId === u.id;
  const allowed = new Set<string>();
  if (triage) STATUSES.forEach((s) => allowed.add(s));
  if (assignee && b.status !== "Not a Bug") ASSIGNEE_STATUSES.forEach((s) => allowed.add(s));
  if (reporter && CLOSED.has(b.status)) allowed.add("Reopened");
  allowed.delete(b.status);
  return {
    canTriage: triage,
    canEdit: triage || (reporter && b.status === "Open"),
    statuses: STATUSES.filter((s) => allowed.has(s)),
    canReopen: CLOSED.has(b.status) && (triage || reporter),
    canDelete: triage || (reporter && b.status === "Open" && !b.assigneeId),
  };
}

function removeFiles(files: { path?: string; diskPath?: string }[]) {
  for (const f of files) {
    try {
      const full = f.diskPath ?? (f.path ? resolveUpload(f.path) : null);
      if (full && fs.existsSync(full)) fs.unlinkSync(full);
    } catch {
      /* best effort */
    }
  }
}

/** Reads JSON or multipart (files saved under uploads/bugs) and checks the attachments. Sends the error itself. */
async function readInput(req: FastifyRequest, reply: FastifyReply): Promise<ParsedMultipart | null> {
  let parsed: ParsedMultipart;
  try {
    parsed = await parseBodyOrMultipart(req, "bugs");
  } catch (e) {
    bad(reply, 400, e instanceof Error ? e.message : "The attachment couldn’t be read.");
    return null;
  }
  const wrong = parsed.files.find((f) => !ALLOWED_EXT.has(path.extname(f.fileName).toLowerCase()));
  const big = parsed.files.find((f) => f.fileSize > MAX_FILE_MB * 1024 * 1024);
  if (wrong || big) {
    removeFiles(parsed.files);
    bad(reply, 400, wrong ? `${wrong.fileName}: only images, PDF, text, Excel and Word files can be attached.` : `${big!.fileName} is larger than ${MAX_FILE_MB} MB.`);
    return null;
  }
  return parsed;
}
const fileRefs = (files: SavedUpload[]): FileRef[] => files.map((f) => ({ path: f.filePath, name: f.fileName, size: f.fileSize, mimeType: f.mimeType }));
const asFiles = (v: Prisma.JsonValue | null): FileRef[] => (Array.isArray(v) ? (v as unknown as FileRef[]) : []);

async function nextCode(now = new Date()) {
  const prefix = `BUG-${istYmd(now).replace(/-/g, "")}-`;
  const last = await prisma.bugReport.findFirst({ where: { code: { startsWith: prefix } }, orderBy: { code: "desc" }, select: { code: true } });
  const n = last ? (parseInt(last.code.slice(prefix.length), 10) || 0) + 1 : 1;
  return `${prefix}${String(n).padStart(5, "0")}`;
}
const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

async function notifyMany(userIds: (string | null | undefined)[], actorId: string, n: { title: string; message: string; type: string; bugId: string; priority?: string }) {
  const targets = [...new Set(userIds.filter((x): x is string => !!x && x !== actorId))];
  for (const userId of targets) {
    await createNotification({ userId, title: n.title, message: n.message, type: n.type, module: "Bug Tracker", priority: n.priority, relatedId: n.bugId, actionUrl: `/bugs/${n.bugId}` });
  }
}
const short = (s: string | null | undefined, n = 140) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};

// ── Listing ──────────────────────────────────────────────────────────────────
type Q = Record<string, string | undefined>;
const list = (v?: string) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);

/** Filters that narrow the whole set (the pill counts follow them). */
function baseWhere(q: Q, u: JwtUser): Prisma.BugReportWhereInput {
  const where: Prisma.BugReportWhereInput = {};
  if (list(q.type).length) where.type = { in: list(q.type) };
  if (list(q.priority).length) where.priority = { in: list(q.priority) };
  if (list(q.module).length) where.module = { in: list(q.module) };
  if (list(q.environment).length) where.environment = { in: list(q.environment) };
  if (q.reporter === "me") where.reporterId = u.id;
  else if (q.reporter) where.reporterId = q.reporter;
  const created: Prisma.DateTimeFilter = {};
  if (isYmd(q.from)) created.gte = new Date(`${q.from}T00:00:00.000+05:30`);
  if (isYmd(q.to)) created.lte = new Date(`${q.to}T23:59:59.999+05:30`);
  if (created.gte || created.lte) where.createdAt = created;
  return where;
}

interface Row extends Bug {
  reporter: Person | null;
  assignee: Person | null;
  commentCount: number;
  isPastDue: boolean;
  allowedStatuses: string[];
  canDelete: boolean;
}

async function decorate(bugs: Bug[], u: JwtUser): Promise<Row[]> {
  const people = await loadPeople(bugs.flatMap((b) => [b.reporterId, b.assigneeId]));
  const ids = bugs.map((b) => b.id);
  const comments = ids.length
    ? await prisma.bugEvent.groupBy({ by: ["bugId"], where: { kind: "comment", bugId: { in: ids } }, _count: { _all: true } })
    : [];
  const cc = new Map(comments.map((c) => [c.bugId, c._count._all]));
  const now = Date.now();
  return bugs.map((b) => {
    const p = permsFor(u, b);
    return {
      ...b,
      reporter: people.get(b.reporterId) ?? null,
      assignee: b.assigneeId ? (people.get(b.assigneeId) ?? null) : null,
      commentCount: cc.get(b.id) ?? 0,
      isPastDue: isPastDue(b, now),
      allowedStatuses: p.statuses,
      canDelete: p.canDelete,
    };
  });
}

function searchMatch(r: Row, q: string, field: string) {
  const x = q.toLowerCase();
  const has = (s?: string | null) => (s ?? "").toLowerCase().includes(x);
  if (field === "id") return has(r.code) || has(r.externalRef);
  if (field === "subject") return has(r.title);
  if (field === "description") return has(r.description);
  if (field === "reporter") return has(r.reporter?.name) || has(r.reporter?.employeeId);
  return has(r.code) || has(r.title) || has(r.description) || has(r.reporter?.name) || has(r.assignee?.name) || has(r.externalRef) || has(r.module);
}

/** Runs the list query: rows for the current view plus the pill counts for the narrowed set. */
async function runList(q: Q, u: JwtUser) {
  const bugs = await prisma.bugReport.findMany({ where: baseWhere(q, u), orderBy: { createdAt: "desc" } });
  let rows = await decorate(bugs, u);
  const term = (q.q ?? "").trim();
  if (term) rows = rows.filter((r) => searchMatch(r, term, q.field ?? "all"));

  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<string, number>;
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  const counts = {
    all: rows.length,
    byStatus,
    openish: rows.filter((r) => isOpenish(r.status)).length,
    unassigned: rows.filter((r) => !r.assigneeId && isOpenish(r.status)).length,
    pastDue: rows.filter((r) => r.isPastDue).length,
    mine: rows.filter((r) => r.assigneeId === u.id && isOpenish(r.status)).length,
    reportedByMe: rows.filter((r) => r.reporterId === u.id).length,
    critical: rows.filter((r) => r.priority === "Critical" && isOpenish(r.status)).length,
  };

  // The view (pill) filters.
  const statuses = list(q.status);
  if (statuses.length) rows = rows.filter((r) => statuses.includes(r.status));
  if (q.open === "1") rows = rows.filter((r) => isOpenish(r.status));
  if (q.assignee === "me") rows = rows.filter((r) => r.assigneeId === u.id);
  else if (q.assignee === "none") rows = rows.filter((r) => !r.assigneeId);
  else if (q.assignee) rows = rows.filter((r) => r.assigneeId === q.assignee);
  if (q.pastDue === "1") rows = rows.filter((r) => r.isPastDue);
  return { rows, counts };
}

// ── Events ───────────────────────────────────────────────────────────────────
async function eventRows(events: BugEventRow[], opts: { shortBody?: boolean } = {}) {
  const bugIds = [...new Set(events.map((e) => e.bugId))];
  const bugs = bugIds.length
    ? await prisma.bugReport.findMany({ where: { id: { in: bugIds } }, select: { id: true, code: true, title: true, environment: true, status: true } })
    : [];
  const bmap = new Map(bugs.map((b) => [b.id, b]));
  const people = await loadPeople(events.flatMap((e) => [e.actorId, ...(e.kind === "assign" ? [e.fromValue, e.toValue] : [])]));
  const label = (e: BugEventRow, v: string | null) => (v && e.kind === "assign" ? (people.get(v)?.name ?? "someone") : v);
  return events.map((e) => {
    const b = bmap.get(e.bugId);
    const a = people.get(e.actorId);
    return {
      id: e.id,
      bugId: e.bugId,
      bugCode: b?.code ?? null,
      bugTitle: b?.title ?? null,
      environment: b?.environment ?? null,
      kind: e.kind,
      body: opts.shortBody ? short(e.body) : e.body,
      fromValue: e.fromValue,
      toValue: e.toValue,
      fromLabel: label(e, e.fromValue),
      toLabel: label(e, e.toValue),
      files: asFiles(e.files),
      createdAt: e.createdAt,
      actor: a ? { id: a.id, name: a.name, role: a.role, profileImage: a.profileImage } : { id: e.actorId, name: "Someone", role: "", profileImage: null },
    };
  });
}

async function detail(id: string, u: JwtUser) {
  const bug = await prisma.bugReport.findUnique({ where: { id } });
  if (!bug) return null;
  const [row] = await decorate([bug], u);
  const events = await prisma.bugEvent.findMany({ where: { bugId: id }, orderBy: { createdAt: "asc" } });
  return { ...row, events: await eventRows(events), permissions: permsFor(u, bug) };
}

async function activeTriagePeople() {
  const rows = await prisma.employee.findMany({
    where: { status: { equals: "active", mode: "insensitive" } },
    select: { id: true, role: true },
  });
  return rows.filter((e) => BUG_TRIAGE_ROLES.has(normRole(e.role)));
}

// ── Routes ───────────────────────────────────────────────────────────────────
export async function bugRoutes(app: FastifyInstance) {
  // List with pill counts
  app.get("/api/bugs", { preHandler: [authenticate] }, async (req, reply) => {
    const { rows, counts } = await runList(req.query as Q, req.user!);
    return reply.send({ success: true, data: rows.map((r) => ({ ...r, description: short(r.description, 300) })), counts });
  });

  // Dashboard
  app.get("/api/bugs/summary", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const bugs = await prisma.bugReport.findMany({ select: { id: true, status: true, assigneeId: true, dueDate: true, createdAt: true, resolvedAt: true } });
    const now = Date.now();
    const DAY = 86_400_000;
    const inWindow = (d: Date | null, fromDaysAgo: number, toDaysAgo: number) => !!d && d.getTime() > now - fromDaysAgo * DAY && d.getTime() <= now - toDaysAgo * DAY;
    const last = bugs.filter((b) => inWindow(b.createdAt, 7, 0));
    const prev = bugs.filter((b) => inWindow(b.createdAt, 14, 7));
    const byStatus = STATUSES.map((status) => ({ status, count: bugs.filter((b) => b.status === status).length }));

    const today = istYmd(new Date());
    const days: { date: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) days.push({ date: addDaysYmd(today, -i), count: 0 });
    const dayIndex = new Map(days.map((d, i) => [d.date, i]));
    for (const b of bugs) {
      const i = dayIndex.get(istYmd(b.createdAt));
      if (i !== undefined) days[i].count++;
    }

    const recent = await prisma.bugEvent.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
    return reply.send({
      success: true,
      data: {
        totals: {
          all: bugs.length,
          open: bugs.filter((b) => isOpenish(b.status)).length,
          pendingDiscussion: bugs.filter((b) => b.status === "Pending Discussion").length,
          resolved: bugs.filter((b) => b.status === "Resolved").length,
        },
        deltas: {
          all: { current: last.length, previous: prev.length },
          open: { current: last.filter((b) => isOpenish(b.status)).length, previous: prev.filter((b) => isOpenish(b.status)).length },
          pendingDiscussion: { current: last.filter((b) => b.status === "Pending Discussion").length, previous: prev.filter((b) => b.status === "Pending Discussion").length },
          resolved: { current: bugs.filter((b) => inWindow(b.resolvedAt, 7, 0) && b.status === "Resolved").length, previous: bugs.filter((b) => inWindow(b.resolvedAt, 14, 7) && b.status === "Resolved").length },
        },
        byStatus,
        daily: days,
        newLast14: days.reduce((s, d) => s + d.count, 0),
        unassigned: bugs.filter((b) => !b.assigneeId && isOpenish(b.status)).length,
        pastDue: bugs.filter((b) => isPastDue(b, now)).length,
        mine: bugs.filter((b) => b.assigneeId === u.id && isOpenish(b.status)).length,
        recent: await eventRows(recent, { shortBody: true }),
      },
    });
  });

  // People who can be assigned: active Admin/Owner/IT, plus anyone already assigned a bug.
  app.get("/api/bugs/assignees", { preHandler: [authenticate] }, async (_req, reply) => {
    const [triage, assigned] = await Promise.all([
      activeTriagePeople(),
      prisma.bugReport.findMany({ where: { assigneeId: { not: null } }, distinct: ["assigneeId"], select: { assigneeId: true } }),
    ]);
    const people = await loadPeople([...triage.map((t) => t.id), ...assigned.map((a) => a.assigneeId)]);
    const data = [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
    return reply.send({ success: true, data });
  });

  // Paged activity feed
  app.get("/api/bugs/activity", { preHandler: [authenticate] }, async (req, reply) => {
    const q = req.query as Q;
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 25));
    const page = Math.max(1, Number(q.page) || 1);
    const where: Prisma.BugEventWhereInput = {};
    if (q.kind) where.kind = { in: list(q.kind) };
    if (q.actor === "me") where.actorId = req.user!.id;
    else if (q.actor) where.actorId = q.actor;
    if (q.bug) where.bugId = q.bug;
    const [total, events, actors] = await Promise.all([
      prisma.bugEvent.count({ where }),
      prisma.bugEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      prisma.bugEvent.findMany({ distinct: ["actorId"], select: { actorId: true } }),
    ]);
    const people = await loadPeople(actors.map((a) => a.actorId));
    return reply.send({
      success: true,
      data: await eventRows(events, { shortBody: true }),
      total,
      page,
      limit,
      people: [...people.values()].map((p) => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name)),
    });
  });

  // Excel export of the current view
  app.get("/api/bugs/export", { preHandler: [authenticate] }, async (req, reply) => {
    const { rows } = await runList(req.query as Q, req.user!);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Bugs");
    ws.columns = [
      { header: "ID", key: "code", width: 22 },
      { header: "Subject", key: "title", width: 48 },
      { header: "Description", key: "description", width: 60 },
      { header: "Type", key: "type", width: 13 },
      { header: "Module", key: "module", width: 16 },
      { header: "Priority", key: "priority", width: 10 },
      { header: "Status", key: "status", width: 18 },
      { header: "Environment", key: "environment", width: 12 },
      { header: "Reported by", key: "reporter", width: 24 },
      { header: "Assigned to", key: "assignee", width: 24 },
      { header: "Created", key: "createdAt", width: 18 },
      { header: "Due", key: "dueDate", width: 18 },
      { header: "Past due", key: "pastDue", width: 9 },
      { header: "Resolved", key: "resolvedAt", width: 18 },
      { header: "Comments", key: "comments", width: 10 },
      { header: "External ref", key: "externalRef", width: 14 },
      { header: "Page", key: "pageUrl", width: 30 },
    ];
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF003887" } };
    const ist = (d: Date | null) => (d ? new Date(d.getTime() + IST_MS).toISOString().slice(0, 16).replace("T", " ") : "");
    for (const r of rows) {
      ws.addRow({
        code: r.code, title: r.title, description: r.description, type: r.type, module: r.module ?? "", priority: r.priority, status: r.status,
        environment: r.environment, reporter: r.reporter?.name ?? "", assignee: r.assignee?.name ?? "Unassigned", createdAt: ist(r.createdAt),
        dueDate: ist(r.dueDate), pastDue: r.isPastDue ? "Yes" : "", resolvedAt: ist(r.resolvedAt), comments: r.commentCount,
        externalRef: r.externalRef ?? "", pageUrl: r.pageUrl ?? "",
      });
    }
    ws.views = [{ state: "frozen", ySplit: 1 }];
    return sendWorkbook(reply, wb, `bugs-${istYmd(new Date())}.xlsx`);
  });

  // One bug with its full history
  app.get("/api/bugs/:id", { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = await detail(id, req.user!);
    if (!data) return bad(reply, 404, "This ticket doesn’t exist or was deleted.");
    return reply.send({ success: true, data });
  });

  // Report a bug (JSON or multipart with screenshots). Also used by the Feedback module.
  app.post("/api/bugs", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const input = await readInput(req, reply);
    if (!input) return;
    const { fields, files } = input;
    const fail = (m: string) => (removeFiles(files), bad(reply, 400, m));

    const title = str(fields.title) ?? "";
    const description = str(fields.description) ?? "";
    const type = str(fields.type) || "Bug";
    const module = str(fields.module) || null;
    const priority = str(fields.priority) || "Medium";
    const environment = str(fields.environment) || "UAT";
    const pageUrl = str(fields.pageUrl) || null;
    if (title.length < 5) return fail("Give the ticket a title of at least 5 characters.");
    if (title.length > 200) return fail("Keep the title under 200 characters.");
    if (!description) return fail("Describe the problem or request.");
    if (description.length > 10_000) return fail("The description is too long (10,000 characters at most).");
    if (!TYPES.includes(type)) return fail(`Type must be one of: ${TYPES.join(", ")}.`);
    if (module && !MODULES.includes(module)) return fail(`Module must be one of: ${MODULES.join(", ")}.`);
    if (!PRIORITIES.includes(priority)) return fail(`Priority must be one of: ${PRIORITIES.join(", ")}.`);
    if (!ENVIRONMENTS.includes(environment)) return fail(`Environment must be UAT or Live.`);
    if (pageUrl && (pageUrl.length > 500 || !/^(\/|https?:\/\/)/.test(pageUrl))) return fail("The page link isn’t valid.");

    const now = new Date();
    let created: Bug | null = null;
    for (let attempt = 0; attempt < 8 && !created; attempt++) {
      const code = await nextCode(now);
      try {
        created = await prisma.$transaction(async (tx) => {
          const bug = await tx.bugReport.create({
            data: { code, title, description, type, module, priority, environment, pageUrl, status: "Open", reporterId: u.id, dueDate: defaultDue(priority, now) },
          });
          await tx.bugEvent.create({
            data: { bugId: bug.id, actorId: u.id, kind: "created", toValue: "Open", files: files.length ? (fileRefs(files) as unknown as Prisma.InputJsonValue) : undefined },
          });
          return bug;
        });
      } catch (e) {
        if (!isUniqueViolation(e)) {
          removeFiles(files);
          throw e;
        }
      }
    }
    if (!created) return fail("Couldn’t number the ticket, please try again.");

    const triage = await activeTriagePeople();
    await notifyMany(
      triage.map((t) => t.id),
      u.id,
      {
        title: `New ${type.toLowerCase()} reported: ${created.code}`,
        message: `${short(title, 90)} — ${module ?? "General"}, ${priority} priority (${environment}).`,
        type: "bug_created",
        bugId: created.id,
        priority: priority === "Critical" || priority === "High" ? "High" : undefined,
      },
    );
    return reply.code(201).send({ success: true, data: { id: created.id, code: created.code, status: created.status, dueDate: created.dueDate } });
  });

  // Change fields (each change is recorded)
  app.patch("/api/bugs/:id", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as Record<string, unknown>;
    const bug = await prisma.bugReport.findUnique({ where: { id } });
    if (!bug) return bad(reply, 404, "This ticket doesn’t exist or was deleted.");
    const p = permsFor(u, bug);
    const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k) && body[k] !== undefined;

    const data: Prisma.BugReportUpdateInput = {};
    const events: { kind: string; body?: string | null; fromValue?: string | null; toValue?: string | null }[] = [];
    const triageOnly = "Only Admin, Owner or IT can change this.";

    // Reporter (while Open) or triage: the ticket's content.
    const edits: [key: "title" | "description" | "module" | "type", label: string][] = [["title", "title"], ["description", "description"], ["module", "module"], ["type", "type"]];
    for (const [key, labelText] of edits) {
      if (!has(key)) continue;
      const v = key === "module" ? str(body[key]) || null : (str(body[key]) ?? "");
      if (v === bug[key]) continue;
      if (!p.canEdit) return bad(reply, 403, "Only the reporter (while the ticket is Open) or Admin/Owner/IT can edit the ticket.");
      if (key === "title" && ((v as string).length < 5 || (v as string).length > 200)) return bad(reply, 400, "The title must be 5 to 200 characters.");
      if (key === "description" && (!v || (v as string).length > 10_000)) return bad(reply, 400, "The description can’t be empty (10,000 characters at most).");
      if (key === "module" && v && !MODULES.includes(v)) return bad(reply, 400, `Module must be one of: ${MODULES.join(", ")}.`);
      if (key === "type" && !TYPES.includes(v as string)) return bad(reply, 400, `Type must be one of: ${TYPES.join(", ")}.`);
      (data as Record<string, unknown>)[key] = v;
      events.push({ kind: "edit", body: labelText, fromValue: key === "description" ? null : (bug[key] ?? null), toValue: key === "description" ? null : v });
    }

    if (has("priority") && body.priority !== bug.priority) {
      if (!p.canTriage) return bad(reply, 403, triageOnly);
      const v = String(body.priority);
      if (!PRIORITIES.includes(v)) return bad(reply, 400, `Priority must be one of: ${PRIORITIES.join(", ")}.`);
      data.priority = v;
      events.push({ kind: "priority", fromValue: bug.priority, toValue: v });
    }
    if (has("environment") && body.environment !== bug.environment) {
      if (!p.canTriage) return bad(reply, 403, triageOnly);
      const v = String(body.environment);
      if (!ENVIRONMENTS.includes(v)) return bad(reply, 400, "Environment must be UAT or Live.");
      data.environment = v;
      events.push({ kind: "edit", body: "environment", fromValue: bug.environment, toValue: v });
    }
    if (has("externalRef")) {
      const v = str(body.externalRef) || null;
      if (v !== bug.externalRef) {
        if (!p.canTriage) return bad(reply, 403, triageOnly);
        if (v && v.length > 100) return bad(reply, 400, "Keep the external reference under 100 characters.");
        data.externalRef = v;
        events.push({ kind: "edit", body: "external ref", fromValue: bug.externalRef, toValue: v });
      }
    }
    if (has("dueDate") || body.dueDate === null) {
      const raw = body.dueDate;
      const v = raw === null || raw === "" ? null : new Date(String(raw));
      if (v && Number.isNaN(v.getTime())) return bad(reply, 400, "The due date isn’t valid.");
      if ((v?.getTime() ?? null) !== (bug.dueDate?.getTime() ?? null)) {
        if (!p.canTriage) return bad(reply, 403, triageOnly);
        data.dueDate = v;
        events.push({ kind: "due", fromValue: bug.dueDate?.toISOString() ?? null, toValue: v?.toISOString() ?? null });
      }
    }
    let newAssignee: string | null | undefined;
    if (has("assigneeId") || body.assigneeId === null) {
      const v = str(body.assigneeId) || null;
      if (v !== bug.assigneeId) {
        if (!p.canTriage) return bad(reply, 403, "Only Admin, Owner or IT can assign tickets.");
        if (v) {
          const e = await prisma.employee.findUnique({ where: { id: v }, select: { status: true } });
          if (!e || (e.status ?? "").toLowerCase() !== "active") return bad(reply, 400, "Tickets can only be assigned to an active employee.");
        }
        data.assigneeId = v;
        newAssignee = v;
        events.push({ kind: "assign", fromValue: bug.assigneeId, toValue: v });
      }
    }
    let newStatus: string | undefined;
    if (has("status") && body.status !== bug.status) {
      const v = String(body.status);
      if (!STATUSES.includes(v)) return bad(reply, 400, `Status must be one of: ${STATUSES.join(", ")}.`);
      if (!p.statuses.includes(v)) {
        return bad(reply, 403, v === "Reopened" ? "Only the reporter or Admin/Owner/IT can reopen a resolved ticket." : "You can’t move this ticket to that status.");
      }
      const comment = str(body.comment) || null;
      if (v === "Reopened" && !p.canTriage && !comment) return bad(reply, 400, "Add a comment saying why the ticket is being reopened.");
      if (comment && comment.length > 4000) return bad(reply, 400, "Keep the comment under 4,000 characters.");
      data.status = v;
      if (CLOSED.has(v)) data.resolvedAt = new Date();
      else if (CLOSED.has(bug.status)) data.resolvedAt = null;
      newStatus = v;
      events.push({ kind: "status", fromValue: bug.status, toValue: v, body: comment });
    }

    if (!events.length) return reply.send({ success: true, data: await detail(id, u), message: "Nothing changed." });

    await prisma.$transaction([
      prisma.bugReport.update({ where: { id }, data }),
      prisma.bugEvent.createMany({ data: events.map((e) => ({ bugId: id, actorId: u.id, ...e })) }),
    ]);

    const who = await actorName(u);
    const title = typeof data.title === "string" ? data.title : bug.title;
    if (newAssignee) {
      await notifyMany([newAssignee], u.id, { title: `${bug.code} assigned to you`, message: `${short(title, 100)} (${typeof data.priority === "string" ? data.priority : bug.priority} priority), assigned by ${who}.`, type: "bug_assigned", bugId: id });
    }
    if (newStatus) {
      await notifyMany([bug.reporterId, newAssignee === undefined ? bug.assigneeId : newAssignee], u.id, {
        title: `${bug.code} is now ${newStatus}`,
        message: `${who} moved “${short(title, 80)}” from ${bug.status} to ${newStatus}.`,
        type: "bug_status",
        bugId: id,
      });
    }
    return reply.send({ success: true, data: await detail(id, u) });
  });

  // Comment (with attachments)
  app.post("/api/bugs/:id/comments", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const { id } = req.params as { id: string };
    const bug = await prisma.bugReport.findUnique({ where: { id } });
    if (!bug) return bad(reply, 404, "This ticket doesn’t exist or was deleted.");
    const input = await readInput(req, reply);
    if (!input) return;
    const text = str(input.fields.body ?? input.fields.comment) ?? "";
    if (!text && !input.files.length) return bad(reply, 400, "Write a comment or attach a file.");
    if (text.length > 4000) {
      removeFiles(input.files);
      return bad(reply, 400, "Keep the comment under 4,000 characters.");
    }
    const ev = await prisma.bugEvent.create({
      data: { bugId: id, actorId: u.id, kind: "comment", body: text || null, files: input.files.length ? (fileRefs(input.files) as unknown as Prisma.InputJsonValue) : undefined },
    });
    await prisma.bugReport.update({ where: { id }, data: { updatedAt: new Date() } });
    const who = await actorName(u);
    await notifyMany([bug.reporterId, bug.assigneeId], u.id, {
      title: `New comment on ${bug.code}`,
      message: `${who}: ${text ? short(text, 120) : `attached ${input.files.length} file${input.files.length === 1 ? "" : "s"}`}`,
      type: "bug_comment",
      bugId: id,
    });
    const [row] = await eventRows([ev]);
    return reply.code(201).send({ success: true, data: row });
  });

  // Delete (triage; or the reporter while Open and unassigned)
  app.delete("/api/bugs/:id", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const { id } = req.params as { id: string };
    const bug = await prisma.bugReport.findUnique({ where: { id } });
    if (!bug) return bad(reply, 404, "This ticket doesn’t exist or was deleted.");
    if (!permsFor(u, bug).canDelete) {
      return bad(reply, 403, bug.reporterId === u.id ? "You can delete your ticket only while it is Open and nobody is assigned." : "Only Admin, Owner or IT can delete this ticket.");
    }
    const events = await prisma.bugEvent.findMany({ where: { bugId: id }, select: { files: true } });
    await prisma.$transaction([prisma.bugEvent.deleteMany({ where: { bugId: id } }), prisma.bugReport.delete({ where: { id } })]);
    removeFiles(events.flatMap((e) => asFiles(e.files)));
    return reply.send({ success: true, message: `${bug.code} deleted.` });
  });
}
