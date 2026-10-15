import type { FastifyInstance } from "fastify";
import { prisma } from "../config/db";
import {
  ACCOUNTS_ROLES,
  authenticate,
  forgetLiveAccount,
  isTeamMemberOrSelf,
  normRole,
  reportingTreeIds,
  requireRoles,
  revokeSessions,
  type JwtUser,
} from "../plugins/auth";
import { createNotification } from "../utils/notify";

// ── HR operations: exit clearance and the joining-document checklist ─────────────────────────────

const HR_ROLES = ["admin", "owner", "hr"];
const TOP_ROLES = new Set(["admin", "owner"]);
const EXIT_TYPES = ["Resignation", "Termination", "Retirement", "Contract end", "Absconding"];
const ACTIVE_EXIT = ["INITIATED", "IN_PROGRESS"];
const TEAMS = ["HR", "IT", "Accounts", "Manager"] as const;
type Team = (typeof TEAMS)[number];

const DEFAULT_TASKS: { team: Team; title: string }[] = [
  { team: "HR", title: "Exit interview" },
  { team: "HR", title: "Full & final settlement prepared" },
  { team: "HR", title: "Relieving & experience letter issued" },
  { team: "HR", title: "Deactivate portal access on last day" },
  { team: "IT", title: "Laptop and accessories returned" },
  { team: "IT", title: "Email and system access removed" },
  { team: "Accounts", title: "Pending expense claims settled" },
  { team: "Accounts", title: "Advances / dues recovered" },
  { team: "Manager", title: "Work and client files handed over" },
];

/** Claims that are still moving (not paid, rejected or withdrawn). */
const OPEN_CLAIMS = ["PENDING_MANAGER", "MANAGER_APPROVED", "PENDING_PARTNER", "APPROVED", "PENDING_PAYMENT", "SENT_BACK"];

const isHR = (u: JwtUser) => HR_ROLES.includes(normRole(u.role));
const isIT = (u: JwtUser) => normRole(u.role) === "it";
const isAccounts = (u: JwtUser) => ACCOUNTS_ROLES.has(normRole(u.role)) || !!u.hasAccountsAccess;

/** Today's date in India as YYYY-MM-DD. */
const todayIST = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
const name = (e?: { firstName: string; lastName: string } | null) => (e ? `${e.firstName} ${e.lastName}`.trim() : null);

function parseDate(v: unknown): Date | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null;
  const d = new Date(`${v.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function canTick(u: JwtUser, team: string, exit: { employeeId: string; status: string }, leads: boolean): boolean {
  if (!ACTIVE_EXIT.includes(exit.status)) return false;
  if (exit.employeeId === u.id) return false; // nobody clears their own exit
  if (isHR(u)) return true;
  if (team === "IT") return isIT(u);
  if (team === "Accounts") return isAccounts(u);
  if (team === "Manager") return leads;
  return false;
}

const EMP_SELECT = { id: true, employeeId: true, firstName: true, lastName: true, designation: true, department: true, status: true, role: true } as const;

/** Assets still held, open claims and leave beyond the last day — for many people at once. */
async function liveChecks(exits: { employeeId: string; lastWorkingDay: Date }[]) {
  const ids = [...new Set(exits.map((e) => e.employeeId))];
  if (!ids.length) return new Map<string, ReturnType<typeof emptyChecks>>();
  const [assets, claims, leaves] = await Promise.all([
    prisma.assetAllocation.findMany({
      where: { employeeId: { in: ids }, status: "Allocated", returnedAt: null },
      select: { employeeId: true, inventory: { select: { assetName: true, serialNumber: true, officeTagNo: true } } },
    }),
    prisma.reimbursement.findMany({ where: { employeeId: { in: ids }, status: { in: OPEN_CLAIMS } }, select: { employeeId: true, claimId: true, amount: true, status: true } }),
    prisma.leave.findMany({
      where: { employeeId: { in: ids }, OR: [{ status: { equals: "pending", mode: "insensitive" } }, { status: { equals: "approved", mode: "insensitive" } }] },
      select: { employeeId: true, leaveId: true, type: true, fromDate: true, toDate: true, status: true },
    }),
  ]);
  const lwdOf = new Map(exits.map((e) => [e.employeeId, ymd(e.lastWorkingDay)!]));
  const out = new Map(ids.map((id) => [id, emptyChecks()]));
  for (const a of assets) {
    const c = out.get(a.employeeId)!;
    c.assets.count++;
    c.assets.items.push([a.inventory.assetName, a.inventory.officeTagNo || a.inventory.serialNumber].filter(Boolean).join(" · "));
  }
  for (const r of claims) {
    const c = out.get(r.employeeId)!;
    c.claims.count++;
    c.claims.amount += r.amount ?? 0;
    c.claims.items.push(r.claimId);
  }
  for (const l of leaves) {
    if ((ymd(l.toDate) ?? "") <= (lwdOf.get(l.employeeId) ?? "")) continue;
    const c = out.get(l.employeeId)!;
    c.leaves.count++;
    c.leaves.items.push(`${l.type} ${ymd(l.fromDate)} to ${ymd(l.toDate)} (${l.status.toLowerCase()})`);
  }
  return out;
}
function emptyChecks() {
  return { assets: { count: 0, items: [] as string[] }, claims: { count: 0, amount: 0, items: [] as string[] }, leaves: { count: 0, items: [] as string[] } };
}

type ExitRow = NonNullable<Awaited<ReturnType<typeof loadExit>>>;
function loadExit(id: string) {
  return prisma.employeeExit.findUnique({ where: { id }, include: { tasks: { orderBy: { sortOrder: "asc" } } } });
}

/** Shapes exits for the screen, with what the caller may do on each. */
async function present(u: JwtUser, exits: ExitRow[], tree: Set<string>) {
  const empIds = exits.map((e) => e.employeeId);
  const actorIds = exits.flatMap((e) => [e.initiatedById, e.completedById, ...e.tasks.map((t) => t.doneById)]).filter((x): x is string => !!x);
  const [emps, actors, checks] = await Promise.all([
    prisma.employee.findMany({ where: { id: { in: empIds } }, select: EMP_SELECT }),
    prisma.employee.findMany({ where: { id: { in: [...new Set(actorIds)] } }, select: { id: true, firstName: true, lastName: true } }),
    liveChecks(exits),
  ]);
  const empBy = new Map(emps.map((e) => [e.id, e]));
  const actorBy = new Map(actors.map((a) => [a.id, name(a)]));
  const today = todayIST();
  const hr = isHR(u);
  return exits.map((x) => {
    const emp = empBy.get(x.employeeId);
    const leads = tree.has(x.employeeId);
    const lwd = ymd(x.lastWorkingDay)!;
    const live = checks.get(x.employeeId) ?? emptyChecks();
    const done = x.tasks.filter((t) => t.done).length;
    const active = ACTIVE_EXIT.includes(x.status);
    const blockers: string[] = [];
    if (active) {
      if (done < x.tasks.length) blockers.push(`${x.tasks.length - done} clearance task${x.tasks.length - done === 1 ? "" : "s"} still open`);
      if (live.assets.count) blockers.push(`${live.assets.count} firm asset${live.assets.count === 1 ? "" : "s"} not yet returned`);
      if (today < lwd) blockers.push(`Last working day (${lwd}) hasn’t come yet`);
    }
    return {
      id: x.id,
      employee: emp
        ? { id: emp.id, code: emp.employeeId, name: name(emp), designation: emp.designation, department: emp.department, status: emp.status }
        : { id: x.employeeId, code: null, name: "Unknown person", designation: null, department: null, status: null },
      exitType: x.exitType,
      resignationDate: ymd(x.resignationDate),
      lastWorkingDay: lwd,
      daysToLastDay: daysBetween(today, lwd),
      reason: x.reason,
      remarks: x.remarks,
      status: x.status,
      initiatedBy: actorBy.get(x.initiatedById) ?? null,
      createdAt: x.createdAt,
      completedAt: x.completedAt,
      completedBy: x.completedById ? actorBy.get(x.completedById) ?? null : null,
      progress: { done, total: x.tasks.length },
      checks: live,
      blockers,
      tasks: x.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        team: t.team,
        done: t.done,
        doneAt: t.doneAt,
        doneBy: t.doneById ? actorBy.get(t.doneById) ?? null : null,
        note: t.note,
        canTick: canTick(u, t.team, x, leads),
      })),
      can: {
        edit: hr && active && x.employeeId !== u.id,
        cancel: hr && active && x.employeeId !== u.id,
        complete: hr && active && x.employeeId !== u.id,
      },
    };
  });
}

/** Who hears about a new exit: HR, IT, Accounts and the person's own managers/partners. */
async function exitAudience(employeeId: string): Promise<string[]> {
  const [teams, emp] = await Promise.all([
    prisma.employee
      .findMany({ where: { status: { equals: "active", mode: "insensitive" } }, select: { id: true, role: true } })
      .then((xs) => xs.filter((x) => ["hr", "it"].includes(normRole(x.role)) || ACCOUNTS_ROLES.has(normRole(x.role)))),
    prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        managerId: true,
        partnerId: true,
        subManagerId: true,
        reportingManagerIds: true,
        reportingPartnerIds: true,
        managers: { select: { managerId: true } },
        partners: { select: { partnerId: true } },
      },
    }),
  ]);
  const ids = new Set(teams.map((t) => t.id));
  if (emp) {
    for (const x of [emp.managerId, emp.partnerId, emp.subManagerId, ...emp.reportingManagerIds, ...emp.reportingPartnerIds, ...emp.managers.map((m) => m.managerId), ...emp.partners.map((p) => p.partnerId)])
      if (x) ids.add(x);
  }
  ids.delete(employeeId);
  return [...ids];
}

// ── Document checklist helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_REQUIREMENTS = [
  { name: "PAN card", category: "PAN", description: "Copy of the PAN card (needed for payroll and TDS).", mandatory: true },
  { name: "Aadhaar card", category: "Aadhaar", description: "Copy of the Aadhaar card, front and back.", mandatory: true },
  { name: "Passport-size photo", category: "Photo", description: "A recent passport-size photograph.", mandatory: true },
  { name: "Address proof", category: "Address Proof", description: "Utility bill, rent agreement or passport showing the current address.", mandatory: true },
  { name: "Educational certificates", category: "Education", description: "Mark sheets and degree / CA / CS certificates.", mandatory: true },
  { name: "Previous employment / relieving letter", category: "Experience", description: "Relieving or experience letter from the last employer (if any).", mandatory: false },
  { name: "Bank details / cancelled cheque", category: "Bank", description: "Cancelled cheque or bank statement for the salary account.", mandatory: true },
  { name: "Signed offer letter", category: "Offer Letter", description: "The offer / appointment letter, signed and returned.", mandatory: true },
];

let seeded = false;
async function requirements(includeInactive = false) {
  if (!seeded) {
    if ((await prisma.documentRequirement.count()) === 0) {
      await prisma.documentRequirement.createMany({ data: DEFAULT_REQUIREMENTS.map((r, i) => ({ ...r, sortOrder: (i + 1) * 10 })), skipDuplicates: true });
    }
    seeded = true;
  }
  return prisma.documentRequirement.findMany({ where: includeInactive ? {} : { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
}

type Req = Awaited<ReturnType<typeof requirements>>[number];
type DocLite = { id: string; employeeId: string; title: string; category: string; uploadedAt: Date };
type ProfileFiles = { panFileUrl: string | null; aadhaarFileUrl: string | null; bankStatementFileUrl: string | null } | null | undefined;
type CheckRow = { requirementId: string; status: string; note: string | null; documentId: string | null; checkedAt: Date; checkedById: string };

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A document counts when its category matches, or (older uploads filed under "Identity" etc.) its title names it. */
function matches(req: Req, d: DocLite) {
  const cat = req.category.trim().toLowerCase();
  if (d.category.trim().toLowerCase() === cat) return true;
  const words = [cat, ...(cat === "aadhaar" ? ["aadhar"] : []), ...(cat === "bank" ? ["cheque"] : [])];
  return words.some((w) => new RegExp(`\\b${esc(w)}\\b`, "i").test(d.title));
}
function profileFile(req: Req, p: ProfileFiles): string | null {
  if (!p) return null;
  const cat = req.category.trim().toLowerCase();
  if (cat === "pan") return p.panFileUrl;
  if (cat === "aadhaar") return p.aadhaarFileUrl;
  if (cat === "bank") return p.bankStatementFileUrl;
  return null;
}

function checklistFor(reqs: Req[], docs: DocLite[], profile: ProfileFiles, checks: CheckRow[], names: Map<string, string | null>) {
  const checkBy = new Map(checks.map((c) => [c.requirementId, c]));
  return reqs.map((r) => {
    const doc = docs.filter((d) => matches(r, d)).sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())[0] ?? null;
    const file = doc ? null : profileFile(r, profile);
    const check = checkBy.get(r.id);
    const hasFile = !!doc || !!file;
    let status: string = hasFile ? "UPLOADED" : "MISSING";
    if (check) status = check.status;
    // A new upload after a rejection goes back to "awaiting check".
    if (check?.status === "REJECTED" && doc && doc.uploadedAt > check.checkedAt) status = "UPLOADED";
    return {
      requirement: { id: r.id, name: r.name, category: r.category, description: r.description, mandatory: r.mandatory },
      status,
      document: doc ? { id: doc.id, title: doc.title, category: doc.category, uploadedAt: doc.uploadedAt } : null,
      profileFile: file,
      note: check?.note ?? null,
      checkedAt: check?.checkedAt ?? null,
      checkedBy: check ? names.get(check.checkedById) ?? null : null,
    };
  });
}

function tally(items: ReturnType<typeof checklistFor>) {
  const mandatoryMissing = items.filter((i) => i.requirement.mandatory && (i.status === "MISSING" || i.status === "REJECTED")).length;
  return {
    total: items.length,
    mandatoryMissing,
    awaiting: items.filter((i) => i.status === "UPLOADED").length,
    verified: items.filter((i) => i.status === "VERIFIED").length,
    waived: items.filter((i) => i.status === "WAIVED").length,
    rejected: items.filter((i) => i.status === "REJECTED").length,
    missing: items.filter((i) => i.status === "MISSING").length,
  };
}

function reqData(b: Record<string, unknown>, partial: boolean) {
  const out: Record<string, unknown> = {};
  const errors: string[] = [];
  for (const f of ["name", "category", "description"] as const) if (f in b) out[f] = b[f] == null ? null : String(b[f]).trim() || null;
  for (const f of ["mandatory", "isActive"] as const) if (f in b) out[f] = !!b[f];
  if ("sortOrder" in b) out.sortOrder = Math.max(0, Math.round(Number(b.sortOrder) || 0));
  if (!partial && (!out.name || !out.category)) errors.push("Give the document a name and a category.");
  if (partial && ("name" in out || "category" in out) && (out.name === null || out.category === null)) errors.push("Name and category can’t be blank.");
  if (typeof out.name === "string" && out.name.length > 120) errors.push("The name is too long.");
  return { data: out, errors };
}

export async function hrOpsRoutes(app: FastifyInstance) {
  // ═══ EXITS ═══════════════════════════════════════════════════════════════════════════════════

  // GET /api/exits?status=&employeeId=
  app.get("/api/exits", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const q = req.query as { status?: string; employeeId?: string };
    const tree = new Set(await reportingTreeIds(u.id));
    const seeAll = isHR(u) || isIT(u) || isAccounts(u);
    const where: Record<string, unknown> = {};
    if (!seeAll) where.employeeId = { in: [u.id, ...tree] };
    if (q.employeeId) where.employeeId = seeAll || q.employeeId === u.id || tree.has(q.employeeId) ? q.employeeId : "__none__";
    if (q.status === "ACTIVE") where.status = { in: ACTIVE_EXIT };
    else if (q.status && q.status !== "ALL") where.status = q.status.toUpperCase();
    const rows = await prisma.employeeExit.findMany({ where, include: { tasks: { orderBy: { sortOrder: "asc" } } }, orderBy: [{ lastWorkingDay: "asc" }] });
    return reply.send({ success: true, data: await present(u, rows, tree) });
  });

  // GET /api/exits/:id
  app.get("/api/exits/:id", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const x = await loadExit((req.params as { id: string }).id);
    if (!x) return reply.code(404).send({ success: false, message: "This exit record wasn’t found." });
    const tree = new Set(await reportingTreeIds(u.id));
    if (!(isHR(u) || isIT(u) || isAccounts(u) || x.employeeId === u.id || tree.has(x.employeeId)))
      return reply.code(403).send({ success: false, message: "You don’t have access to this exit record." });
    return reply.send({ success: true, data: (await present(u, [x], tree))[0] });
  });

  // POST /api/exits — HR starts an exit for anyone; an employee can submit their own resignation.
  app.post("/api/exits", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const b = (req.body ?? {}) as Record<string, unknown>;
    const hr = isHR(u);
    const employeeId = String(b.employeeId ?? (hr ? "" : u.id));
    const self = employeeId === u.id;
    if (!employeeId) return reply.code(400).send({ success: false, message: "Choose the person who is leaving." });
    if (!hr && !self) return reply.code(403).send({ success: false, message: "Only HR can start an exit for someone else." });
    const exitType = hr && !self ? String(b.exitType ?? "Resignation") : "Resignation";
    if (!EXIT_TYPES.includes(exitType)) return reply.code(400).send({ success: false, message: `Exit type must be one of: ${EXIT_TYPES.join(", ")}.` });
    const resignationDate = parseDate(b.resignationDate ?? todayIST());
    const lastWorkingDay = parseDate(b.lastWorkingDay);
    if (!resignationDate || !lastWorkingDay) return reply.code(400).send({ success: false, message: "Enter the resignation date and the last working day." });
    if (lastWorkingDay < resignationDate) return reply.code(400).send({ success: false, message: "The last working day can’t be before the resignation date." });
    const reason = b.reason ? String(b.reason).trim().slice(0, 2000) || null : null;

    const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: EMP_SELECT });
    if (!emp) return reply.code(404).send({ success: false, message: "Employee not found." });
    if ((emp.status ?? "").toLowerCase() !== "active") return reply.code(400).send({ success: false, message: `${emp.firstName} isn’t an active employee.` });
    if (TOP_ROLES.has(normRole(emp.role)) && !TOP_ROLES.has(normRole(u.role)) && !self)
      return reply.code(403).send({ success: false, message: "Only an Admin or Owner can start an exit for an Admin or Owner." });

    const existing = await prisma.employeeExit.findUnique({ where: { employeeId }, include: { tasks: true } });
    if (existing && existing.status !== "CANCELLED")
      return reply.code(409).send({
        success: false,
        message: existing.status === "COMPLETED" ? `${emp.firstName}’s exit was already completed.` : `${emp.firstName} already has an exit in progress.`,
      });

    const data = { exitType, resignationDate, lastWorkingDay, reason, status: "INITIATED", initiatedById: u.id, completedAt: null, completedById: null };
    const exit = await prisma.$transaction(async (tx) => {
      if (!existing) {
        return tx.employeeExit.create({
          data: { employeeId, ...data, tasks: { create: DEFAULT_TASKS.map((t, i) => ({ ...t, sortOrder: (i + 1) * 10 })) } },
        });
      }
      // One record per person: a cancelled exit is reopened with a fresh checklist (history kept in remarks).
      const prevNote = `Earlier exit (last day ${ymd(existing.lastWorkingDay)}) was cancelled${existing.remarks ? ` — ${existing.remarks}` : ""}.`;
      await tx.exitTask.updateMany({ where: { exitId: existing.id }, data: { done: false, doneById: null, doneAt: null, note: null } });
      const have = new Set(existing.tasks.map((t) => `${t.team}|${t.title}`));
      const missing = DEFAULT_TASKS.map((t, i) => ({ ...t, sortOrder: (i + 1) * 10 })).filter((t) => !have.has(`${t.team}|${t.title}`));
      if (missing.length) await tx.exitTask.createMany({ data: missing.map((t) => ({ ...t, exitId: existing.id })) });
      return tx.employeeExit.update({ where: { id: existing.id }, data: { ...data, remarks: prevNote.slice(0, 2000) } });
    });

    const who = name(emp);
    const lwdText = ymd(lastWorkingDay);
    for (const userId of await exitAudience(employeeId)) {
      if (userId === u.id) continue;
      await createNotification({
        userId,
        title: self ? "Resignation submitted" : "Employee exit started",
        message: `${who} (${emp.employeeId}) — ${exitType.toLowerCase()}, last working day ${lwdText}. Please complete your exit clearance tasks.`,
        type: "exit_started",
        module: "HR",
        priority: "High",
        relatedId: exit.id,
        actionUrl: `/management/exits?open=${exit.id}`,
      });
    }
    if (!self)
      await createNotification({
        userId: employeeId,
        title: "Your exit process has started",
        message: `HR has recorded your ${exitType.toLowerCase()} with last working day ${lwdText}.`,
        type: "exit_started",
        module: "HR",
        relatedId: exit.id,
        actionUrl: "/management/exits",
      });

    const full = await loadExit(exit.id);
    const tree = new Set(await reportingTreeIds(u.id));
    return reply.code(201).send({ success: true, data: (await present(u, [full!], tree))[0] });
  });

  // PATCH /api/exits/:id — dates, type, reason, remarks (HR)
  app.patch("/api/exits/:id", { preHandler: [requireRoles(HR_ROLES)] }, async (req, reply) => {
    const u = req.user!;
    const x = await loadExit((req.params as { id: string }).id);
    if (!x) return reply.code(404).send({ success: false, message: "This exit record wasn’t found." });
    if (!ACTIVE_EXIT.includes(x.status)) return reply.code(400).send({ success: false, message: "This exit is closed and can’t be changed." });
    if (x.employeeId === u.id) return reply.code(403).send({ success: false, message: "You can’t change your own exit record." });
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if ("exitType" in b) {
      if (!EXIT_TYPES.includes(String(b.exitType))) return reply.code(400).send({ success: false, message: `Exit type must be one of: ${EXIT_TYPES.join(", ")}.` });
      data.exitType = String(b.exitType);
    }
    for (const f of ["resignationDate", "lastWorkingDay"] as const) {
      if (!(f in b)) continue;
      const d = parseDate(b[f]);
      if (!d) return reply.code(400).send({ success: false, message: "Enter valid dates." });
      data[f] = d;
    }
    for (const f of ["reason", "remarks"] as const) if (f in b) data[f] = b[f] ? String(b[f]).trim().slice(0, 2000) || null : null;
    const rd = (data.resignationDate as Date | undefined) ?? x.resignationDate;
    const lwd = (data.lastWorkingDay as Date | undefined) ?? x.lastWorkingDay;
    if (lwd < rd) return reply.code(400).send({ success: false, message: "The last working day can’t be before the resignation date." });
    await prisma.employeeExit.update({ where: { id: x.id }, data });
    const tree = new Set(await reportingTreeIds(u.id));
    return reply.send({ success: true, data: (await present(u, [(await loadExit(x.id))!], tree))[0] });
  });

  // POST /api/exits/:id/cancel {reason}
  app.post("/api/exits/:id/cancel", { preHandler: [requireRoles(HR_ROLES)] }, async (req, reply) => {
    const u = req.user!;
    const x = await loadExit((req.params as { id: string }).id);
    if (!x) return reply.code(404).send({ success: false, message: "This exit record wasn’t found." });
    if (!ACTIVE_EXIT.includes(x.status)) return reply.code(400).send({ success: false, message: "This exit is already closed." });
    if (x.employeeId === u.id) return reply.code(403).send({ success: false, message: "You can’t cancel your own exit record." });
    const reason = String((req.body as { reason?: string } | undefined)?.reason ?? "").trim();
    if (!reason) return reply.code(400).send({ success: false, message: "Say why the exit is being cancelled (for example, resignation withdrawn)." });
    await prisma.employeeExit.update({
      where: { id: x.id },
      data: { status: "CANCELLED", remarks: [x.remarks, `Cancelled on ${todayIST()}: ${reason}`].filter(Boolean).join("\n").slice(0, 2000) },
    });
    await createNotification({
      userId: x.employeeId,
      title: "Exit cancelled",
      message: `Your exit process has been cancelled. Reason: ${reason}`,
      type: "exit_cancelled",
      module: "HR",
      relatedId: x.id,
      actionUrl: "/management/exits",
    });
    const tree = new Set(await reportingTreeIds(u.id));
    return reply.send({ success: true, data: (await present(u, [(await loadExit(x.id))!], tree))[0] });
  });

  // PATCH /api/exits/:id/tasks/:taskId {done, note}
  app.patch("/api/exits/:id/tasks/:taskId", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const { id, taskId } = req.params as { id: string; taskId: string };
    const x = await loadExit(id);
    const task = x?.tasks.find((t) => t.id === taskId);
    if (!x || !task) return reply.code(404).send({ success: false, message: "This clearance task wasn’t found." });
    const tree = new Set(await reportingTreeIds(u.id));
    if (!canTick(u, task.team, x, tree.has(x.employeeId))) {
      const msg = !ACTIVE_EXIT.includes(x.status)
        ? "This exit is closed."
        : x.employeeId === u.id
          ? "You can’t tick off your own exit tasks."
          : task.team === "HR" ? "Only HR can update this task." : `Only ${task.team === "Manager" ? "the person’s manager or partner" : `the ${task.team} team`} or HR can update this task.`;
      return reply.code(403).send({ success: false, message: msg });
    }
    const b = (req.body ?? {}) as { done?: unknown; note?: unknown };
    const data: Record<string, unknown> = {};
    if ("note" in b) data.note = b.note ? String(b.note).trim().slice(0, 1000) || null : null;
    if ("done" in b) {
      const done = !!b.done;
      data.done = done;
      data.doneById = done ? u.id : null;
      data.doneAt = done ? new Date() : null;
    }
    await prisma.exitTask.update({ where: { id: task.id }, data });
    if (data.done === true && x.status === "INITIATED") await prisma.employeeExit.update({ where: { id: x.id }, data: { status: "IN_PROGRESS" } });
    const fresh = (await loadExit(x.id))!;
    if (data.done === true && fresh.tasks.every((t) => t.done) && fresh.initiatedById !== u.id) {
      const emp = await prisma.employee.findUnique({ where: { id: x.employeeId }, select: { firstName: true, lastName: true } });
      await createNotification({
        userId: fresh.initiatedById,
        title: "Exit clearance done",
        message: `All clearance tasks for ${name(emp)} are ticked off. You can now complete the exit.`,
        type: "exit_ready",
        module: "HR",
        relatedId: x.id,
        actionUrl: `/management/exits?open=${x.id}`,
      });
    }
    return reply.send({ success: true, data: (await present(u, [fresh], tree))[0] });
  });

  // POST /api/exits/:id/complete — closes the exit and switches off the account
  app.post("/api/exits/:id/complete", { preHandler: [requireRoles(HR_ROLES)] }, async (req, reply) => {
    const u = req.user!;
    const x = await loadExit((req.params as { id: string }).id);
    if (!x) return reply.code(404).send({ success: false, message: "This exit record wasn’t found." });
    if (!ACTIVE_EXIT.includes(x.status)) return reply.code(400).send({ success: false, message: "This exit is already closed." });
    if (x.employeeId === u.id) return reply.code(403).send({ success: false, message: "You can’t complete your own exit." });
    const emp = await prisma.employee.findUnique({ where: { id: x.employeeId }, select: EMP_SELECT });
    if (!emp) return reply.code(404).send({ success: false, message: "Employee not found." });
    if (TOP_ROLES.has(normRole(emp.role)) && !TOP_ROLES.has(normRole(u.role)))
      return reply.code(403).send({ success: false, message: "Only an Admin or Owner can complete the exit of an Admin or Owner." });
    if (normRole(emp.role) === "admin") {
      const others = await prisma.employee.count({ where: { id: { not: emp.id }, role: { equals: "admin", mode: "insensitive" }, status: { equals: "active", mode: "insensitive" } } });
      if (!others) return reply.code(400).send({ success: false, message: "This is the last active Admin — make someone else Admin first." });
    }
    const open = x.tasks.filter((t) => !t.done);
    const live = (await liveChecks([x])).get(x.employeeId) ?? emptyChecks();
    const problems: string[] = [];
    if (open.length) problems.push(`${open.length} clearance task${open.length === 1 ? " is" : "s are"} still open (${open.map((t) => t.title).join(", ")})`);
    if (live.assets.count) problems.push(`${emp.firstName} still holds ${live.assets.count} firm asset${live.assets.count === 1 ? "" : "s"} (${live.assets.items.join(", ")})`);
    const lwd = ymd(x.lastWorkingDay)!;
    if (todayIST() < lwd) problems.push(`the last working day (${lwd}) hasn’t come yet`);
    if (problems.length) return reply.code(409).send({ success: false, message: `Can’t complete the exit yet: ${problems.join("; ")}.` });

    await prisma.$transaction([
      prisma.employee.update({ where: { id: emp.id }, data: { status: "Inactive" } }),
      prisma.employeeExit.update({ where: { id: x.id }, data: { status: "COMPLETED", completedAt: new Date(), completedById: u.id } }),
    ]);
    await revokeSessions(emp.id, "exit");
    forgetLiveAccount(emp.id);
    const tree = new Set(await reportingTreeIds(u.id));
    return reply.send({ success: true, data: (await present(u, [(await loadExit(x.id))!], tree))[0], message: `${name(emp)}’s exit is complete and their portal access is switched off.` });
  });

  // ═══ DOCUMENT CHECKLIST ══════════════════════════════════════════════════════════════════════

  // GET /api/hr/document-requirements?all=1
  app.get("/api/hr/document-requirements", { preHandler: [authenticate] }, async (req, reply) => {
    const all = (req.query as { all?: string }).all === "1" && isHR(req.user!);
    return reply.send({ success: true, data: await requirements(all) });
  });

  app.post("/api/hr/document-requirements", { preHandler: [requireRoles(HR_ROLES)] }, async (req, reply) => {
    await requirements();
    const { data, errors } = reqData((req.body ?? {}) as Record<string, unknown>, false);
    if (errors.length) return reply.code(400).send({ success: false, message: errors.join(" ") });
    if (await prisma.documentRequirement.findUnique({ where: { name: data.name as string } }))
      return reply.code(409).send({ success: false, message: "A document with this name is already on the list." });
    const row = await prisma.documentRequirement.create({ data: data as { name: string; category: string } });
    return reply.code(201).send({ success: true, data: row });
  });

  app.put("/api/hr/document-requirements/:id", { preHandler: [requireRoles(HR_ROLES)] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { data, errors } = reqData((req.body ?? {}) as Record<string, unknown>, true);
    if (errors.length) return reply.code(400).send({ success: false, message: errors.join(" ") });
    const cur = await prisma.documentRequirement.findUnique({ where: { id } });
    if (!cur) return reply.code(404).send({ success: false, message: "Document requirement not found." });
    if (typeof data.name === "string" && data.name !== cur.name && (await prisma.documentRequirement.findUnique({ where: { name: data.name } })))
      return reply.code(409).send({ success: false, message: "A document with this name is already on the list." });
    return reply.send({ success: true, data: await prisma.documentRequirement.update({ where: { id }, data }) });
  });

  // DELETE — removed if never checked for anyone, otherwise switched off (keeps the history).
  app.delete("/api/hr/document-requirements/:id", { preHandler: [requireRoles(HR_ROLES)] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const cur = await prisma.documentRequirement.findUnique({ where: { id } });
    if (!cur) return reply.code(404).send({ success: false, message: "Document requirement not found." });
    if (await prisma.employeeDocumentCheck.count({ where: { requirementId: id } })) {
      await prisma.documentRequirement.update({ where: { id }, data: { isActive: false } });
      return reply.send({ success: true, message: "HR has already checked this document for some people, so it was switched off instead of removed." });
    }
    await prisma.documentRequirement.delete({ where: { id } });
    return reply.send({ success: true, message: "Removed from the checklist." });
  });

  // GET /api/hr/document-checklist?employeeId=
  app.get("/api/hr/document-checklist", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const employeeId = (req.query as { employeeId?: string }).employeeId || u.id;
    if (!(await isTeamMemberOrSelf(u, employeeId, { leadRolesOnly: true })))
      return reply.code(403).send({ success: false, message: "You don’t have access to this person’s documents." });
    const [reqs, emp, docs, checks] = await Promise.all([
      requirements(),
      prisma.employee.findUnique({ where: { id: employeeId }, select: { ...EMP_SELECT, profile: { select: { panFileUrl: true, aadhaarFileUrl: true, bankStatementFileUrl: true } } } }),
      prisma.employeeDocument.findMany({ where: { employeeId }, select: { id: true, employeeId: true, title: true, category: true, uploadedAt: true } }),
      prisma.employeeDocumentCheck.findMany({ where: { employeeId } }),
    ]);
    if (!emp) return reply.code(404).send({ success: false, message: "Employee not found." });
    const checkers = await prisma.employee.findMany({ where: { id: { in: [...new Set(checks.map((c) => c.checkedById))] } }, select: { id: true, firstName: true, lastName: true } });
    const items = checklistFor(reqs, docs, emp.profile, checks, new Map(checkers.map((c) => [c.id, name(c)])));
    return reply.send({
      success: true,
      data: {
        employee: { id: emp.id, code: emp.employeeId, name: name(emp), designation: emp.designation, department: emp.department, status: emp.status },
        canVerify: isHR(u) && emp.id !== u.id,
        canUpload: isHR(u) || emp.id === u.id,
        summary: tally(items),
        items,
      },
    });
  });

  // GET /api/hr/document-checklist/summary — every active employee
  app.get("/api/hr/document-checklist/summary", { preHandler: [requireRoles(HR_ROLES)] }, async (_req, reply) => {
    const [reqs, emps] = await Promise.all([
      requirements(),
      prisma.employee.findMany({
        where: { status: { equals: "active", mode: "insensitive" } },
        select: { ...EMP_SELECT, profile: { select: { panFileUrl: true, aadhaarFileUrl: true, bankStatementFileUrl: true } } },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      }),
    ]);
    const ids = emps.map((e) => e.id);
    const [docs, checks] = await Promise.all([
      prisma.employeeDocument.findMany({ where: { employeeId: { in: ids } }, select: { id: true, employeeId: true, title: true, category: true, uploadedAt: true } }),
      prisma.employeeDocumentCheck.findMany({ where: { employeeId: { in: ids } } }),
    ]);
    const group = <T extends { employeeId: string }>(xs: T[]) => {
      const m = new Map<string, T[]>();
      for (const x of xs) (m.get(x.employeeId) ?? m.set(x.employeeId, []).get(x.employeeId)!).push(x);
      return m;
    };
    const docsBy = group(docs);
    const checksBy = group(checks);
    const noNames = new Map<string, string | null>();
    const rows = emps.map((e) => {
      const items = checklistFor(reqs, docsBy.get(e.id) ?? [], e.profile, checksBy.get(e.id) ?? [], noNames);
      return {
        employee: { id: e.id, code: e.employeeId, name: name(e), designation: e.designation, department: e.department },
        ...tally(items),
        missingNames: items.filter((i) => i.requirement.mandatory && (i.status === "MISSING" || i.status === "REJECTED")).map((i) => i.requirement.name),
      };
    });
    return reply.send({ success: true, data: { requirements: reqs.length, rows } });
  });

  // PUT /api/hr/document-checklist/:employeeId/:requirementId {status: VERIFIED|WAIVED|REJECTED|null, note}
  app.put("/api/hr/document-checklist/:employeeId/:requirementId", { preHandler: [requireRoles(HR_ROLES)] }, async (req, reply) => {
    const u = req.user!;
    const { employeeId, requirementId } = req.params as { employeeId: string; requirementId: string };
    const b = (req.body ?? {}) as { status?: string | null; note?: string | null };
    if (employeeId === u.id) return reply.code(403).send({ success: false, message: "Someone else in HR needs to check your own documents." });
    const status = b.status ? String(b.status).toUpperCase() : null;
    if (status && !["VERIFIED", "WAIVED", "REJECTED"].includes(status)) return reply.code(400).send({ success: false, message: "Status must be verified, waived or rejected." });
    const note = b.note ? String(b.note).trim().slice(0, 1000) || null : null;
    if (status === "REJECTED" && !note) return reply.code(400).send({ success: false, message: "Tell the employee what’s wrong with the document." });
    const [emp, reqRow] = await Promise.all([
      prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } }),
      prisma.documentRequirement.findUnique({ where: { id: requirementId } }),
    ]);
    if (!emp || !reqRow) return reply.code(404).send({ success: false, message: "Employee or document not found." });

    if (!status) {
      await prisma.employeeDocumentCheck.deleteMany({ where: { employeeId, requirementId } });
      return reply.send({ success: true, message: "Check cleared." });
    }
    const docs = await prisma.employeeDocument.findMany({ where: { employeeId }, select: { id: true, employeeId: true, title: true, category: true, uploadedAt: true } });
    const doc = docs.filter((d) => matches(reqRow, d)).sort((a, z) => z.uploadedAt.getTime() - a.uploadedAt.getTime())[0];
    const data = { status, note, documentId: doc?.id ?? null, checkedById: u.id, checkedAt: new Date() };
    const row = await prisma.employeeDocumentCheck.upsert({
      where: { employeeId_requirementId: { employeeId, requirementId } },
      create: { employeeId, requirementId, ...data },
      update: data,
    });
    if (status === "REJECTED")
      await createNotification({
        userId: employeeId,
        title: `Please re-submit: ${reqRow.name}`,
        message: `HR couldn’t accept your ${reqRow.name.toLowerCase()}. ${note}`,
        type: "document_rejected",
        module: "HR",
        priority: "High",
        relatedId: row.id,
        actionUrl: "/portal/profile",
      });
    return reply.send({ success: true, data: row });
  });
}
