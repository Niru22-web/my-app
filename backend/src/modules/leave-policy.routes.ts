import type { FastifyInstance } from "fastify";
import { prisma } from "../config/db";
import { authenticate, isTeamMemberOrSelf, normRole, reportingTreeIds, requireRoles } from "../plugins/auth";
import { isScope, scopeIds } from "../utils/scope";
import { checkRequest, computeBalances, leaveYearOf, yearBounds, yearLabel } from "../utils/leave-policy";
import { describeCalendar, formatSaturdays, getWorkCalendar, invalidateWorkCalendar, parseSaturdays } from "../utils/work-calendar";

const POLICY_ROLES = ["admin", "owner", "hr"];
const round2 = (n: number) => Math.round(n * 100) / 100;

const TYPE_FIELDS = [
  "code", "name", "description", "paid", "annualDays", "accrual", "prorateOnJoining", "carryForward", "carryForwardMax", "encashable", "encashMax",
  "allowNegative", "allowHalfDay", "countNonWorkingDays", "minServiceDays", "maxPerRequest", "noticeDays", "gender", "active", "sortOrder",
] as const;

function typeData(b: Record<string, unknown>, partial: boolean) {
  const out: Record<string, unknown> = {};
  const num = (v: unknown) => (v === null || v === "" ? null : Number(v));
  for (const f of TYPE_FIELDS) {
    if (!(f in b)) continue;
    const v = b[f];
    if (["annualDays", "carryForwardMax", "encashMax", "maxPerRequest"].includes(f)) out[f] = num(v);
    else if (["minServiceDays", "noticeDays", "sortOrder"].includes(f)) out[f] = Math.max(0, Math.round(Number(v) || 0));
    else if (["paid", "prorateOnJoining", "encashable", "allowNegative", "allowHalfDay", "countNonWorkingDays", "active"].includes(f)) out[f] = !!v;
    else out[f] = v == null ? null : String(v).trim();
  }
  const errors: string[] = [];
  if (!partial && (!out.code || !out.name)) errors.push("Code and name are required.");
  if (out.code !== undefined) out.code = String(out.code).toUpperCase().replace(/[^A-Z0-9_]/g, "");
  if (out.accrual !== undefined && !["yearly", "monthly"].includes(String(out.accrual))) errors.push("Accrual must be yearly or monthly.");
  if (out.gender !== undefined && !["all", "female", "male"].includes(String(out.gender))) errors.push("Gender must be all, female or male.");
  if (out.carryForward !== undefined && !["none", "all", "limit"].includes(String(out.carryForward))) errors.push("Carry forward must be none, all or limit.");
  if (out.carryForward === "limit" && (out.carryForwardMax == null || (out.carryForwardMax as number) <= 0)) errors.push("Set how many days can be carried forward.");
  for (const f of ["annualDays", "carryForwardMax", "encashMax", "maxPerRequest"])
    if (out[f] != null && (!Number.isFinite(out[f] as number) || (out[f] as number) < 0 || (out[f] as number) > 366)) errors.push(`${f} must be between 0 and 366.`);
  return { data: out, errors };
}

export async function leavePolicyRoutes(app: FastifyInstance) {
  // GET /api/leave-policy — work calendar + leave types (everyone can read the rules)
  app.get("/api/leave-policy", { preHandler: [authenticate] }, async (_req, reply) => {
    invalidateWorkCalendar();
    const cal = await getWorkCalendar();
    const types = await prisma.leaveType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    const today = new Date();
    const year = leaveYearOf(today, cal.leaveYearStartMonth);
    const { start, end } = yearBounds(year, cal.leaveYearStartMonth);
    return reply.send({
      success: true,
      data: {
        calendar: { ...cal, leaveAccrualFrom: cal.leaveAccrualFrom?.toISOString().slice(0, 10) ?? null, saturdaysOff: formatSaturdays(cal.saturdaysOff), summary: describeCalendar(cal) },
        currentYear: { year, label: yearLabel(year, cal.leaveYearStartMonth), start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) },
        types,
      },
    });
  });

  // PUT /api/leave-policy/settings — work calendar & leave year
  app.put("/api/leave-policy/settings", { preHandler: [requireRoles(POLICY_ROLES)] }, async (req, reply) => {
    const b = (req.body ?? {}) as {
      leaveYearStartMonth?: number; saturdaysOff?: string; sundayOff?: boolean; leaveAccrualFrom?: string | null; standardDayHours?: number; leaveApprovalLevels?: number;
    };
    const hours = Number(b.standardDayHours ?? 8);
    if (!(hours >= 1 && hours <= 16)) return reply.code(400).send({ success: false, message: "Expected hours per day must be between 1 and 16." });
    const levels = Number(b.leaveApprovalLevels ?? 1);
    if (![1, 2].includes(levels)) return reply.code(400).send({ success: false, message: "Leave approval is one or two steps." });
    const month = Number(b.leaveYearStartMonth ?? 1);
    if (![1, 4].includes(month)) return reply.code(400).send({ success: false, message: "The leave year starts in January or April." });
    const saturdaysOff = formatSaturdays(parseSaturdays(String(b.saturdaysOff ?? "all")));
    const from = b.leaveAccrualFrom ? String(b.leaveAccrualFrom).slice(0, 10) : null;
    if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) return reply.code(400).send({ success: false, message: "Leave start date must be YYYY-MM-DD." });
    const data = {
      leaveYearStartMonth: month, saturdaysOff, sundayOff: b.sundayOff !== false, updatedBy: req.user!.id,
      leaveAccrualFrom: from ? new Date(`${from}T00:00:00.000Z`) : null,
      standardDayHours: hours,
      leaveApprovalLevels: levels,
    };
    await prisma.firmSettings.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
    invalidateWorkCalendar();
    return reply.send({ success: true, message: "Work calendar saved." });
  });

  // POST /api/leave-policy/types · PUT /api/leave-policy/types/:id — types are never deleted, only deactivated
  app.post("/api/leave-policy/types", { preHandler: [requireRoles(POLICY_ROLES)] }, async (req, reply) => {
    const { data, errors } = typeData((req.body ?? {}) as Record<string, unknown>, false);
    if (errors.length) return reply.code(400).send({ success: false, message: errors.join(" ") });
    const clash = await prisma.leaveType.findFirst({ where: { OR: [{ code: String(data.code) }, { name: { equals: String(data.name), mode: "insensitive" } }] } });
    if (clash) return reply.code(400).send({ success: false, message: "A leave type with this code or name already exists." });
    const created = await prisma.leaveType.create({ data: data as never });
    return reply.code(201).send({ success: true, data: created });
  });
  app.put("/api/leave-policy/types/:id", { preHandler: [requireRoles(POLICY_ROLES)] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.leaveType.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ success: false, message: "Leave type not found." });
    const { data, errors } = typeData((req.body ?? {}) as Record<string, unknown>, true);
    if (errors.length) return reply.code(400).send({ success: false, message: errors.join(" ") });
    // Renaming would orphan existing requests (they store the type name).
    if (data.name && String(data.name).toLowerCase() !== existing.name.toLowerCase()) {
      const used = await prisma.leave.count({ where: { type: { equals: existing.name, mode: "insensitive" } } });
      if (used) return reply.code(400).send({ success: false, message: `${existing.name} is used by ${used} request(s), so it can’t be renamed. Create a new type instead.` });
    }
    const updated = await prisma.leaveType.update({ where: { id }, data: data as never });
    return reply.send({ success: true, data: updated });
  });

  // GET /api/leave-policy/balances/me?employeeId=&year= — one person's balances by type
  app.get("/api/leave-policy/balances/me", { preHandler: [authenticate] }, async (req, reply) => {
    const q = (req.query ?? {}) as { employeeId?: string; year?: string };
    const u = req.user!;
    const target = q.employeeId && q.employeeId !== u.id ? q.employeeId : u.id;
    if (target !== u.id && !(await isTeamMemberOrSelf(u, target))) return reply.code(403).send({ success: false, message: "Not in your team." });
    const cal = await getWorkCalendar();
    const year = Number(q.year) || leaveYearOf(new Date(), cal.leaveYearStartMonth);
    const { balances } = await computeBalances([target], year);
    return reply.send({ success: true, data: { year, label: yearLabel(year, cal.leaveYearStartMonth), balances: balances.get(target) ?? [] } });
  });

  // GET /api/leave-policy/balances?scope=team|org&year= — everyone's balances in a view
  app.get("/api/leave-policy/balances", { preHandler: [authenticate] }, async (req, reply) => {
    const q = (req.query ?? {}) as { scope?: string; year?: string };
    const scope = isScope(q.scope) ? q.scope : "my";
    const ids = await scopeIds(req.user!, scope, reply);
    if (ids === undefined) return;
    const people = await prisma.employee.findMany({
      where: { ...(ids ? { id: { in: ids } } : {}), status: { equals: "active", mode: "insensitive" }, NOT: { officeEmail: { endsWith: "@asa-local.test" } } },
      select: { id: true, employeeId: true, firstName: true, lastName: true, designation: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });
    const cal = await getWorkCalendar();
    const year = Number(q.year) || leaveYearOf(new Date(), cal.leaveYearStartMonth);
    const { balances, types } = await computeBalances(people.map((p) => p.id), year);
    return reply.send({
      success: true,
      data: { year, label: yearLabel(year, cal.leaveYearStartMonth), types: types.filter((t) => t.active), people: people.map((p) => ({ ...p, balances: balances.get(p.id) ?? [] })) },
    });
  });

  // POST /api/leave-policy/preview — server day count + rule check before applying
  app.post("/api/leave-policy/preview", { preHandler: [authenticate] }, async (req, reply) => {
    const b = (req.body ?? {}) as { type?: string; fromDate?: string; toDate?: string; duration?: string; leaveId?: string };
    if (!b.type || !b.fromDate || !b.toDate) return reply.code(400).send({ success: false, message: "Type and dates are required." });
    const res = await checkRequest({
      employeeId: req.user!.id, type: b.type, duration: b.duration ?? "Full Day", excludeLeaveId: b.leaveId,
      fromDate: new Date(`${b.fromDate.slice(0, 10)}T00:00:00.000Z`), toDate: new Date(`${b.toDate.slice(0, 10)}T00:00:00.000Z`),
    });
    return reply.send({ success: true, data: { days: res.days, available: res.available, errors: res.errors, warnings: res.warnings } });
  });

  // POST /api/leave-policy/credit — opening balance, adjustment (incl. comp-off credit) or encashment
  //   HR/Admin/Owner: anyone, any kind. Team leads: positive credits of earned-leave types
  //   (paid types with no fixed entitlement, e.g. Compensatory Off) for people in their team.
  app.post("/api/leave-policy/credit", { preHandler: [authenticate] }, async (req, reply) => {
    const u = req.user!;
    const b = (req.body ?? {}) as { employeeId?: string; leaveTypeId?: string; days?: number; note?: string; kind?: string; year?: number };
    const kind = b.kind ?? "adjustment";
    const days = Number(b.days);
    if (!b.employeeId || !b.leaveTypeId || !Number.isFinite(days) || days === 0 || Math.round(days * 4) !== days * 4)
      return reply.code(400).send({ success: false, message: "Choose a person, a leave type and a non-zero number of days (quarter-day steps)." });
    if (!["opening", "adjustment", "encash"].includes(kind)) return reply.code(400).send({ success: false, message: "Unknown kind." });
    if (!b.note?.trim() || b.note.trim().length < 3) return reply.code(400).send({ success: false, message: "Add a short note for the record." });
    const type = await prisma.leaveType.findUnique({ where: { id: b.leaveTypeId } });
    if (!type) return reply.code(404).send({ success: false, message: "Leave type not found." });

    const policy = POLICY_ROLES.includes(normRole(u.role));
    if (!policy) {
      const earned = type.paid && type.annualDays == null;
      const inTeam = (await reportingTreeIds(u.id)).includes(b.employeeId);
      if (!(earned && kind === "adjustment" && days > 0 && inTeam))
        return reply.code(403).send({ success: false, message: "Team leads can only credit earned leave (such as compensatory off) to people in their team." });
    }

    const cal = await getWorkCalendar();
    const year = Number(b.year) || leaveYearOf(new Date(), cal.leaveYearStartMonth);
    if (kind === "encash") {
      if (!type.encashable) return reply.code(400).send({ success: false, message: `${type.name} isn’t encashable.` });
      if (days < 0) return reply.code(400).send({ success: false, message: "Encash a positive number of days." });
      const { balances } = await computeBalances([b.employeeId], year);
      const bal = balances.get(b.employeeId)?.find((x) => x.leaveTypeId === type.id);
      if (!bal || days > bal.available) return reply.code(400).send({ success: false, message: `Only ${bal?.available ?? 0} day(s) available to encash.` });
      if (type.encashMax != null && bal.encashed + days > type.encashMax) return reply.code(400).send({ success: false, message: `At most ${type.encashMax} day(s) can be encashed in a year.` });
    }
    const key = { employeeId_leaveTypeId_year: { employeeId: b.employeeId, leaveTypeId: type.id, year } };
    const field = kind === "opening" ? "opening" : kind === "encash" ? "encashed" : "adjusted";
    await prisma.$transaction([
      prisma.leaveTypeBalance.upsert({
        where: key,
        create: { employeeId: b.employeeId, leaveTypeId: type.id, year, [field]: days },
        // Opening balance is a value (re-importing replaces it); adjustments and encashments add up.
        update: kind === "opening" ? { opening: days } : { [field]: { increment: days } },
      }),
      prisma.leaveLedger.create({ data: { employeeId: b.employeeId, leaveTypeId: type.id, year, kind, days, note: b.note.trim(), createdById: u.id } }),
    ]);
    return reply.send({ success: true, message: "Saved." });
  });

  // POST /api/leave-policy/opening — bulk opening balances (e.g. closing balances from Zoho)
  app.post("/api/leave-policy/opening", { preHandler: [requireRoles(POLICY_ROLES)] }, async (req, reply) => {
    const b = (req.body ?? {}) as { rows?: { employeeCode: string; type: string; days: number }[]; year?: number; note?: string };
    const rows = Array.isArray(b.rows) ? b.rows.slice(0, 5000) : [];
    if (!rows.length) return reply.code(400).send({ success: false, message: "No rows to import." });
    const cal = await getWorkCalendar();
    const year = Number(b.year) || leaveYearOf(new Date(), cal.leaveYearStartMonth);
    const [types, emps] = await Promise.all([
      prisma.leaveType.findMany(),
      prisma.employee.findMany({ where: { employeeId: { in: rows.map((r) => String(r.employeeCode).trim()) } }, select: { id: true, employeeId: true } }),
    ]);
    const byCode = new Map(emps.map((e) => [e.employeeId, e.id]));
    const typeOf = (s: string) => types.find((t) => t.code === s.trim().toUpperCase() || t.name.toLowerCase() === s.trim().toLowerCase());
    const problems: string[] = [];
    let saved = 0;
    for (const [i, r] of rows.entries()) {
      const id = byCode.get(String(r.employeeCode).trim());
      const t = typeOf(String(r.type ?? ""));
      const days = Number(r.days);
      if (!id || !t || !Number.isFinite(days)) {
        problems.push(`Row ${i + 2}: ${!id ? `employee ${r.employeeCode} not found` : !t ? `leave type "${r.type}" not found` : "days is not a number"}`);
        continue;
      }
      await prisma.$transaction([
        prisma.leaveTypeBalance.upsert({
          where: { employeeId_leaveTypeId_year: { employeeId: id, leaveTypeId: t.id, year } },
          create: { employeeId: id, leaveTypeId: t.id, year, opening: days },
          update: { opening: days },
        }),
        prisma.leaveLedger.create({ data: { employeeId: id, leaveTypeId: t.id, year, kind: "opening", days, note: b.note?.trim() || "Opening balance import", createdById: req.user!.id } }),
      ]);
      saved++;
    }
    return reply.send({ success: true, data: { saved, problems: problems.slice(0, 50), problemCount: problems.length } });
  });

  // POST /api/leave-policy/close-year { year } — carry forward up to each type's limit, lapse the rest
  app.post("/api/leave-policy/close-year", { preHandler: [requireRoles(POLICY_ROLES)] }, async (req, reply) => {
    const cal = await getWorkCalendar();
    const year = Number((req.body as { year?: number } | undefined)?.year);
    const current = leaveYearOf(new Date(), cal.leaveYearStartMonth);
    if (!Number.isInteger(year) || year >= current) return reply.code(400).send({ success: false, message: "Only a leave year that has ended can be closed." });
    if (cal.leaveAccrualFrom && yearBounds(year, cal.leaveYearStartMonth).end < cal.leaveAccrualFrom)
      return reply.code(400).send({ success: false, message: `Leave rules started on ${cal.leaveAccrualFrom.toISOString().slice(0, 10)}; earlier years are covered by opening balances.` });
    const people = await prisma.employee.findMany({ where: { status: { equals: "active", mode: "insensitive" } }, select: { id: true } });
    const { balances, types } = await computeBalances(people.map((p) => p.id), year, yearBounds(year, cal.leaveYearStartMonth).end);
    let carried = 0, lapsed = 0, skipped = 0;
    for (const [employeeId, list] of balances) {
      for (const bal of list) {
        const t = types.find((x) => x.id === bal.leaveTypeId)!;
        if (bal.closed) { skipped++; continue; }
        const closing = bal.available;
        const carry =
          closing < 0 ? closing : t.carryForward === "all" ? closing : t.carryForward === "limit" ? round2(Math.min(closing, t.carryForwardMax ?? 0)) : 0;
        const lapse = closing > 0 ? round2(closing - carry) : 0;
        const ops = [
          prisma.leaveTypeBalance.upsert({
            where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: t.id, year } },
            create: { employeeId, leaveTypeId: t.id, year, lapsed: lapse, closedAt: new Date() },
            update: { lapsed: { increment: lapse }, closedAt: new Date() },
          }),
          prisma.leaveTypeBalance.upsert({
            where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: t.id, year: year + 1 } },
            create: { employeeId, leaveTypeId: t.id, year: year + 1, opening: carry },
            update: { opening: carry },
          }),
        ];
        if (carry) ops.push(prisma.leaveLedger.create({ data: { employeeId, leaveTypeId: t.id, year: year + 1, kind: "carry_forward", days: carry, note: `Carried from ${yearLabel(year, cal.leaveYearStartMonth)}`, createdById: req.user!.id } }) as never);
        if (lapse) ops.push(prisma.leaveLedger.create({ data: { employeeId, leaveTypeId: t.id, year, kind: "lapse", days: lapse, note: "Year-end lapse", createdById: req.user!.id } }) as never);
        await prisma.$transaction(ops);
        carried += carry > 0 ? carry : 0;
        lapsed += lapse;
      }
    }
    return reply.send({ success: true, data: { year, carried: round2(carried), lapsed: round2(lapsed), alreadyClosed: skipped } });
  });

  // GET /api/leave-policy/ledger?employeeId=&year= — audit trail of manual balance changes
  app.get("/api/leave-policy/ledger", { preHandler: [authenticate] }, async (req, reply) => {
    const q = (req.query ?? {}) as { employeeId?: string; year?: string };
    const u = req.user!;
    const target = q.employeeId || u.id;
    if (target !== u.id && !(await isTeamMemberOrSelf(u, target))) return reply.code(403).send({ success: false, message: "Not in your team." });
    const rows = await prisma.leaveLedger.findMany({
      where: { employeeId: target, ...(q.year ? { year: Number(q.year) } : {}) },
      include: { leaveType: { select: { name: true, code: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return reply.send({ success: true, data: rows });
  });
}
