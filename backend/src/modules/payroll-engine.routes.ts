import fs from "fs";
import ExcelJS from "exceljs";
import type { FastifyInstance, FastifyReply } from "fastify";
import { prisma } from "../config/db";
import { calculate, daysInMonth, employedDays, grossOf, isEmployed, type SalaryStructure } from "../utils/payroll-calc";
import { parseBodyOrMultipart } from "../utils/uploads";
import { resolveUpload, sendUpload } from "../utils/file-access";
import { logAccountsAudit, requireAccountsAccess } from "./accounts.routes";

/**
 * Payroll engine (ported from ASA MIS): salary structures + monthly runs.
 *
 * A run is one firm + one month. Creating it adds a line for everyone employed that month, calculated by
 * payroll-calc (full month = master structure exactly; joiners/leavers/LOP prorated). Lines stay editable
 * while the run is a Draft. To finalise, every line needs a timesheet — the person's own portal time for the
 * month, or an attached file for people who don't log time in the portal — and must be approved ("Okay").
 * Editing a line or replacing its file puts it back to Pending, so an approval always refers to what is paid.
 *
 * Finalising creates the regular Payroll (payables) entries plus their ledger accrual for people linked to a
 * portal account, so bank reconciliation and statements work exactly as for manually entered payroll.
 * Access: Admin, Owner and Accounts (same as Payroll & payables).
 */

const AMOUNT_FIELDS = ["basic", "hra", "conv", "bonus", "pt", "pfEmployee", "esicEmployee", "pfEmployer", "esicEmployer"] as const;
type AmountField = (typeof AMOUNT_FIELDS)[number];
const STRUCTURE_NUMBERS = ["basicPct", "ctc", ...AMOUNT_FIELDS] as const;
const TIMESHEET_TYPES = new Set([".pdf", ".png", ".jpg", ".jpeg", ".xlsx", ".xls", ".xlsm", ".csv", ".docx", ".doc"]);
const MAX_TIMESHEET_BYTES = 20 * 1024 * 1024;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

class PayrollError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
const fail = (status: number, message: string): never => {
  throw new PayrollError(status, message);
};

const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const toDate = (s: string | null | undefined) => (s ? new Date(`${s.slice(0, 10)}T00:00:00.000Z`) : null);
const r2 = (n: number) => Number(n.toFixed(2));
const cleanName = (s: string) => s.split(/\s+/).filter(Boolean).join(" ");
const monthRange = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)), y, m };
};

type StructureRow = NonNullable<Awaited<ReturnType<typeof prisma.payrollStructure.findUnique>>>;

const toCalc = (s: StructureRow): SalaryStructure => ({
  basicPct: s.basicPct ?? 0,
  bonus: s.bonus,
  basic: s.basic,
  hra: s.hra,
  conv: s.conv,
  pt: s.pt,
  pfEmployee: s.pfEmployee,
  esicEmployee: s.esicEmployee,
  pfEmployer: s.pfEmployer,
  esicEmployer: s.esicEmployer,
  pfApplicable: s.pfApplicable,
  esicApplicable: s.esicApplicable,
  gender: s.gender === "M" || s.gender === "F" ? s.gender : null,
});

/** Line values for a structure + month + days (MIS `_line_values`). */
function lineValues(s: StructureRow, month: string, totalDays: number, lopDays: number) {
  const a = calculate(toCalc(s), month, totalDays, lopDays);
  return {
    basic: a.basic,
    hra: a.hra,
    conv: a.conv,
    bonus: a.bonus,
    pt: a.pt,
    pfEmployee: a.pfEmployee,
    esicEmployee: a.esicEmployee,
    pfEmployer: a.pfEmployer,
    esicEmployer: a.esicEmployer,
    gross: a.gross,
    netPay: a.netPay,
    totalDays: a.totalDays,
    lopDays: a.lopDays,
    paidDays: a.paidDays,
    pfApplicable: s.pfApplicable,
    esicApplicable: s.esicApplicable,
    basicPct: s.basicPct,
    ctc: s.ctc,
    calcBasis: a.paidDays === a.totalDays ? "full month" : "prorated",
  };
}

const UNAPPROVE = { approvalStatus: "Pending", approvedById: null, approvedAt: null } as const;

async function getRun(id: string, draftOnly = false) {
  const run = await prisma.payrollRun.findUnique({ where: { id }, include: { entity: { select: { id: true, name: true, legalName: true, address: true } } } });
  if (!run) fail(404, "Payroll run not found.");
  if (draftOnly && run!.status !== "Draft") fail(409, `This run is ${run!.status} — reopen it to make changes.`);
  return run!;
}

async function getLine(runId: string, lineId: string) {
  const line = await prisma.payrollLine.findFirst({ where: { id: lineId, runId } });
  if (!line) fail(404, "Payroll line not found.");
  return line!;
}

/** Hours each linked person logged in the portal during the month (their timesheet). */
async function portalHours(employeeIds: string[], month: string) {
  if (!employeeIds.length) return new Map<string, number>();
  const { from, to } = monthRange(month);
  const rows = await prisma.timelog.groupBy({ by: ["employeeId"], where: { employeeId: { in: employeeIds }, date: { gte: from, lte: to } }, _sum: { hours: true } });
  return new Map(rows.map((r) => [r.employeeId, Number(r._sum.hours ?? 0)]));
}

function validateStructure(b: Record<string, any>) {
  if (b.gender !== undefined && ![null, "", "M", "F"].includes(b.gender)) fail(400, "Gender must be M or F.");
  if (b.status !== undefined && !["Active", "Left"].includes(b.status)) fail(400, "Status must be Active or Left.");
  for (const f of ["dateOfJoining", "dateOfLeaving"]) {
    if (b[f] && (!/^\d{4}-\d{2}-\d{2}$/.test(String(b[f])) || Number.isNaN(new Date(`${b[f]}T00:00:00Z`).getTime()))) fail(400, `${f === "dateOfJoining" ? "Joining" : "Leaving"} date must be a date (YYYY-MM-DD).`);
  }
  for (const f of STRUCTURE_NUMBERS) {
    if (b[f] === undefined || b[f] === null || b[f] === "") continue;
    const n = Number(b[f]);
    if (!Number.isFinite(n) || n < 0) fail(400, `${f} can’t be negative.`);
    if (f === "basicPct" && n > 1) fail(400, "Basic % is a fraction (e.g. 0.5 for 50%).");
  }
}

function structureData(b: Record<string, any>) {
  const data: Record<string, any> = {};
  for (const f of STRUCTURE_NUMBERS) if (b[f] !== undefined) data[f] = b[f] === null || b[f] === "" ? (f === "basicPct" || f === "ctc" ? null : 0) : Number(b[f]);
  for (const f of ["pfApplicable", "esicApplicable", "needsReview"]) if (b[f] !== undefined) data[f] = Boolean(b[f]);
  if (b.gender !== undefined) data.gender = b.gender || null;
  if (b.status !== undefined) data.status = b.status;
  if (b.dateOfJoining !== undefined) data.dateOfJoining = toDate(b.dateOfJoining);
  if (b.dateOfLeaving !== undefined) data.dateOfLeaving = toDate(b.dateOfLeaving);
  if (b.employeeId !== undefined) data.employeeId = b.employeeId || null;
  return data;
}

const structureOut = (s: StructureRow & { employee?: { id: string; firstName: string; lastName: string; employeeId: string } | null; entity?: { id: string; name: string } }) => {
  const gross = grossOf(s);
  return { ...s, dateOfJoining: ymd(s.dateOfJoining), dateOfLeaving: ymd(s.dateOfLeaving), gross, netPay: gross - s.pt - s.pfEmployee - s.esicEmployee };
};

async function insertLine(runId: string, s: StructureRow, month: string) {
  const { total, lop, remark } = employedDays({ dateOfJoining: ymd(s.dateOfJoining), dateOfLeaving: ymd(s.dateOfLeaving) }, month);
  await prisma.payrollLine.create({ data: { ...lineValues(s, month, total, lop), runId, structureId: s.id, remarks: remark } });
}

function handle(reply: FastifyReply, e: unknown) {
  if (e instanceof PayrollError) return reply.code(e.status).send({ success: false, message: e.message });
  throw e;
}

export async function payrollEngineRoutes(app: FastifyInstance) {
  const guard = { preHandler: [requireAccountsAccess] };
  const B = "/api/accounts/payroll-engine";

  // ── Salary structures (the master) ────────────────────────────────────────
  app.get(`${B}/structures`, guard, async (req, reply) => {
    const { entityId, status } = (req.query ?? {}) as { entityId?: string; status?: string };
    const rows = await prisma.payrollStructure.findMany({
      where: { ...(entityId ? { entityId } : {}), ...(status ? { status } : {}) },
      include: { entity: { select: { id: true, name: true } }, employee: { select: { id: true, firstName: true, lastName: true, employeeId: true } } },
      orderBy: [{ entity: { name: "asc" } }, { status: "asc" }, { name: "asc" }],
    });
    return reply.send({ success: true, data: rows.map(structureOut) });
  });

  app.post(`${B}/structures`, guard, async (req, reply) => {
    try {
      const b = (req.body ?? {}) as Record<string, any>;
      const name = cleanName(String(b.name ?? ""));
      if (!b.entityId || !name) fail(400, "Firm and name are required.");
      validateStructure(b);
      const entity = await prisma.entity.findUnique({ where: { id: b.entityId }, select: { id: true, name: true } });
      if (!entity) fail(404, "Firm not found.");
      const dup = await prisma.payrollStructure.findFirst({ where: { entityId: b.entityId, name: { equals: name, mode: "insensitive" } }, select: { id: true } });
      if (dup) fail(409, `${name} already exists in ${entity!.name}.`);
      const who = await prisma.employee.findUnique({ where: { id: req.user!.id }, select: { firstName: true, lastName: true } });
      const created = await prisma.payrollStructure.create({
        data: { ...structureData(b), entityId: b.entityId, name, status: b.status || "Active", structureSource: `Added by ${who ? `${who.firstName} ${who.lastName}`.trim() : req.user!.email}` } as any,
      });
      await logAccountsAudit({ action: "CREATE", tableName: "PayrollStructure", recordId: created.id, performedBy: req.user!.id, newValue: { name, entity: entity!.name } });
      return reply.code(201).send({ success: true, data: structureOut(created) });
    } catch (e) {
      return handle(reply, e);
    }
  });

  app.patch(`${B}/structures/:id`, guard, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const b = { ...((req.body ?? {}) as Record<string, any>) };
      delete b.entityId; // moving someone between firms = a new structure
      const existing = await prisma.payrollStructure.findUnique({ where: { id } });
      if (!existing) fail(404, "Salary structure not found.");
      validateStructure(b);
      const data = structureData(b);
      if (b.name !== undefined) {
        data.name = cleanName(String(b.name ?? ""));
        if (!data.name) fail(400, "Name can’t be blank.");
        const dup = await prisma.payrollStructure.findFirst({ where: { entityId: existing!.entityId, name: { equals: data.name, mode: "insensitive" }, id: { not: id } }, select: { id: true } });
        if (dup) fail(409, `${data.name} already exists in this firm.`);
      }
      if (data.employeeId) {
        const emp = await prisma.employee.findUnique({ where: { id: data.employeeId }, select: { id: true } });
        if (!emp) fail(404, "Portal account not found.");
      }
      if (!Object.keys(data).length) fail(400, "Nothing to update.");
      if ([...STRUCTURE_NUMBERS, "pfApplicable", "esicApplicable"].some((f) => f in data)) {
        const who = await prisma.employee.findUnique({ where: { id: req.user!.id }, select: { firstName: true, lastName: true } });
        const d = new Date();
        data.structureSource = `Edited by ${who ? `${who.firstName} ${who.lastName}`.trim() : req.user!.email} on ${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
        if (!("needsReview" in data)) data.needsReview = false;
        data.reviewNote = null;
      }
      const updated = await prisma.payrollStructure.update({ where: { id }, data });
      await logAccountsAudit({ action: "UPDATE", tableName: "PayrollStructure", recordId: id, performedBy: req.user!.id, newValue: Object.keys(data) });
      return reply.send({ success: true, data: structureOut(updated) });
    } catch (e) {
      return handle(reply, e);
    }
  });

  // ── Runs ────────────────────────────────────────────────────────────────────
  app.get(`${B}/runs`, guard, async (req, reply) => {
    const { entityId } = (req.query ?? {}) as { entityId?: string };
    const runs = await prisma.payrollRun.findMany({
      where: entityId ? { entityId } : {},
      include: { entity: { select: { id: true, name: true } }, lines: { select: { netPay: true, gross: true, approvalStatus: true, timesheetPath: true } } },
      orderBy: [{ month: "desc" }, { entity: { name: "asc" } }],
    });
    return reply.send({
      success: true,
      data: runs.map(({ lines, ...r }) => ({
        ...r,
        employees: lines.length,
        gross: lines.reduce((a, l) => a + l.gross, 0),
        netPay: lines.reduce((a, l) => a + l.netPay, 0),
        approved: lines.filter((l) => l.approvalStatus === "Okay").length,
      })),
    });
  });

  app.post(`${B}/runs`, guard, async (req, reply) => {
    try {
      const { entityId, month } = (req.body ?? {}) as { entityId?: string; month?: string };
      if (!month || !MONTH_RE.test(month)) fail(400, "Month must be YYYY-MM.");
      const entity = entityId ? await prisma.entity.findUnique({ where: { id: entityId }, select: { id: true, name: true } }) : null;
      if (!entity) fail(404, "Firm not found.");
      const existing = await prisma.payrollRun.findUnique({ where: { entityId_month: { entityId: entityId!, month: month! } }, select: { status: true } });
      if (existing) fail(409, `${entity!.name} ${month} already exists (${existing.status}).`);
      const people = (await prisma.payrollStructure.findMany({ where: { entityId } })).filter((s) =>
        isEmployed({ dateOfJoining: ymd(s.dateOfJoining), dateOfLeaving: ymd(s.dateOfLeaving), status: s.status }, month!),
      );
      if (!people.length) fail(400, `No one is on ${entity!.name}’s payroll for ${month}. Add salary structures first.`);
      const run = await prisma.payrollRun.create({ data: { entityId: entityId!, month: month!, createdById: req.user!.id } });
      for (const s of people) await insertLine(run.id, s, month!);
      await logAccountsAudit({ action: "CREATE", tableName: "PayrollRun", recordId: run.id, performedBy: req.user!.id, newValue: { entity: entity!.name, month, employees: people.length } });
      return reply.code(201).send({ success: true, data: { id: run.id } });
    } catch (e) {
      return handle(reply, e);
    }
  });

  app.get(`${B}/runs/:id`, guard, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const run = await getRun(id);
      const lines = await prisma.payrollLine.findMany({
        where: { runId: id },
        include: { structure: { select: { name: true, gender: true, needsReview: true, reviewNote: true, status: true, employeeId: true, employee: { select: { firstName: true, lastName: true, employeeId: true } } } } },
        orderBy: { structure: { name: "asc" } },
      });
      const hours = await portalHours(lines.map((l) => l.structure.employeeId).filter((x): x is string => !!x), run.month);
      const notInRun = await prisma.payrollStructure.findMany({
        where: { entityId: run.entityId, id: { notIn: lines.map((l) => l.structureId) } },
        select: { id: true, name: true, status: true },
        orderBy: [{ status: "asc" }, { name: "asc" }],
      });
      return reply.send({
        success: true,
        data: {
          run,
          lines: lines.map(({ timesheetPath, ...l }) => {
            const ph = l.structure.employeeId ? hours.get(l.structure.employeeId) ?? 0 : null;
            return { ...l, hasTimesheetFile: !!timesheetPath, portalHours: ph, timesheetOk: !!timesheetPath || (ph ?? 0) > 0 };
          }),
          notInRun,
        },
      });
    } catch (e) {
      return handle(reply, e);
    }
  });

  app.delete(`${B}/runs/:id`, guard, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const run = await getRun(id, true);
      const files = await prisma.payrollLine.findMany({ where: { runId: id, timesheetPath: { not: null } }, select: { timesheetPath: true } });
      await prisma.payrollRun.delete({ where: { id } }); // lines cascade
      for (const f of files) {
        const full = f.timesheetPath && resolveUpload(f.timesheetPath);
        if (full) fs.rmSync(full, { force: true });
      }
      await logAccountsAudit({ action: "DELETE", tableName: "PayrollRun", recordId: id, performedBy: req.user!.id, oldValue: { entity: run.entity.name, month: run.month } });
      return reply.send({ success: true });
    } catch (e) {
      return handle(reply, e);
    }
  });

  app.post(`${B}/runs/:id/lines`, guard, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const { structureId } = (req.body ?? {}) as { structureId?: string };
      const run = await getRun(id, true);
      const s = structureId ? await prisma.payrollStructure.findFirst({ where: { id: structureId, entityId: run.entityId } }) : null;
      if (!s) fail(404, "That person isn’t on this firm’s payroll.");
      if (await prisma.payrollLine.findFirst({ where: { runId: id, structureId }, select: { id: true } })) fail(409, "Already in this run.");
      await insertLine(id, s!, run.month);
      return reply.code(201).send({ success: true });
    } catch (e) {
      return handle(reply, e);
    }
  });

  app.delete(`${B}/runs/:id/lines/:lineId`, guard, async (req, reply) => {
    try {
      const { id, lineId } = req.params as { id: string; lineId: string };
      await getRun(id, true);
      const line = await getLine(id, lineId);
      await prisma.payrollLine.delete({ where: { id: lineId } });
      const full = line.timesheetPath && resolveUpload(line.timesheetPath);
      if (full) fs.rmSync(full, { force: true });
      return reply.send({ success: true });
    } catch (e) {
      return handle(reply, e);
    }
  });

  app.patch(`${B}/runs/:id/lines/:lineId`, guard, async (req, reply) => {
    try {
      const { id, lineId } = req.params as { id: string; lineId: string };
      const b = (req.body ?? {}) as { totalDays?: number; lopDays?: number; amounts?: Partial<Record<AmountField, number>>; remarks?: string };
      const run = await getRun(id, true);
      const line = await getLine(id, lineId);
      const updates: Record<string, any> = {};

      if (b.totalDays !== undefined || b.lopDays !== undefined) {
        const total = b.totalDays !== undefined ? Number(b.totalDays) : line.totalDays;
        const lop = b.lopDays !== undefined ? Number(b.lopDays) : line.lopDays;
        if (!(total > 0) || !(lop >= 0) || lop > total) fail(400, "LOP days must be between 0 and total days.");
        const s = await prisma.payrollStructure.findUnique({ where: { id: line.structureId } });
        Object.assign(updates, lineValues(s!, run.month, total, lop));
      }

      if (b.amounts && Object.keys(b.amounts).length) {
        const bad = Object.keys(b.amounts).filter((k) => !(AMOUNT_FIELDS as readonly string[]).includes(k));
        if (bad.length) fail(400, `Not editable: ${bad.sort().join(", ")}`);
        const current = Object.fromEntries(AMOUNT_FIELDS.map((k) => [k, updates[k] ?? (line as any)[k]])) as Record<AmountField, number>;
        for (const [k, v] of Object.entries(b.amounts)) {
          const n = Number(v);
          if (v === null || v === undefined || !Number.isFinite(n) || n < 0) fail(400, `${k} must be a non-negative amount.`);
          current[k as AmountField] = r2(n);
        }
        Object.assign(updates, current);
        updates.gross = current.basic + current.hra + current.conv + current.bonus;
        updates.netPay = updates.gross - current.pt - current.pfEmployee - current.esicEmployee;
        updates.calcBasis = "edited";
      }

      if (b.remarks !== undefined) updates.remarks = String(b.remarks ?? "").trim() || null;
      if (!Object.keys(updates).length) fail(400, "Nothing to update.");
      await prisma.payrollLine.update({ where: { id: lineId }, data: { ...updates, ...UNAPPROVE } });
      return reply.send({ success: true });
    } catch (e) {
      return handle(reply, e);
    }
  });

  app.post(`${B}/runs/:id/lines/:lineId/recalculate`, guard, async (req, reply) => {
    try {
      const { id, lineId } = req.params as { id: string; lineId: string };
      const run = await getRun(id, true);
      const line = await getLine(id, lineId);
      const s = await prisma.payrollStructure.findUnique({ where: { id: line.structureId } });
      await prisma.payrollLine.update({ where: { id: lineId }, data: { ...lineValues(s!, run.month, line.totalDays, line.lopDays), ...UNAPPROVE } });
      return reply.send({ success: true });
    } catch (e) {
      return handle(reply, e);
    }
  });

  app.post(`${B}/runs/:id/lines/:lineId/approval`, guard, async (req, reply) => {
    try {
      const { id, lineId } = req.params as { id: string; lineId: string };
      const { status, remarks } = (req.body ?? {}) as { status?: string; remarks?: string };
      const run = await getRun(id, true);
      const line = await getLine(id, lineId);
      if (status !== "Okay" && status !== "Pending") fail(400, "Status must be Okay or Pending.");
      if (status === "Okay" && !line.timesheetPath) {
        const s = await prisma.payrollStructure.findUnique({ where: { id: line.structureId }, select: { employeeId: true } });
        const ph = s?.employeeId ? (await portalHours([s.employeeId], run.month)).get(s.employeeId) ?? 0 : 0;
        if (ph <= 0) fail(400, "No timesheet yet: this person has no portal time for the month — attach their timesheet before approving.");
      }
      const ok = status === "Okay";
      await prisma.payrollLine.update({
        where: { id: lineId },
        data: { approvalStatus: status!, approvalRemarks: String(remarks ?? "").trim() || null, approvedById: ok ? req.user!.id : null, approvedAt: ok ? new Date() : null },
      });
      return reply.send({ success: true });
    } catch (e) {
      return handle(reply, e);
    }
  });

  app.post(`${B}/runs/:id/lines/:lineId/timesheet`, guard, async (req, reply) => {
    try {
      const { id, lineId } = req.params as { id: string; lineId: string };
      await getRun(id, true);
      const line = await getLine(id, lineId);
      let parsed;
      try {
        parsed = await parseBodyOrMultipart(req, "payroll");
      } catch (e) {
        fail(400, e instanceof Error ? e.message : "Upload failed.");
      }
      const file = parsed!.files[0];
      const drop = (f?: { diskPath: string }) => f && fs.rmSync(f.diskPath, { force: true });
      if (!file) fail(400, "Choose the timesheet file to attach.");
      const ext = (file.fileName.match(/\.[^.]+$/)?.[0] ?? "").toLowerCase();
      if (!TIMESHEET_TYPES.has(ext)) {
        drop(file);
        fail(400, `Timesheet must be one of: ${[...TIMESHEET_TYPES].sort().join(", ")}`);
      }
      if (file.fileSize > MAX_TIMESHEET_BYTES) {
        drop(file);
        fail(400, "Timesheet is larger than 20 MB.");
      }
      const old = line.timesheetPath && resolveUpload(line.timesheetPath);
      await prisma.payrollLine.update({
        where: { id: lineId },
        data: { timesheetName: file.fileName, timesheetPath: file.filePath, timesheetById: req.user!.id, timesheetAt: new Date(), ...UNAPPROVE },
      });
      if (old) fs.rmSync(old, { force: true });
      return reply.send({ success: true, data: { timesheetName: file.fileName } });
    } catch (e) {
      return handle(reply, e);
    }
  });

  app.get(`${B}/runs/:id/lines/:lineId/timesheet`, guard, async (req, reply) => {
    try {
      const { id, lineId } = req.params as { id: string; lineId: string };
      const line = await getLine(id, lineId);
      const full = line.timesheetPath && resolveUpload(line.timesheetPath);
      if (!full) fail(404, "No timesheet file attached.");
      return sendUpload(reply, full!, line.timesheetName ?? undefined);
    } catch (e) {
      return handle(reply, e);
    }
  });

  app.post(`${B}/runs/:id/finalise`, guard, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const run = await getRun(id, true);
      const lines = await prisma.payrollLine.findMany({ where: { runId: id }, include: { structure: { select: { name: true, employeeId: true } } } });
      if (!lines.length) fail(400, "This run has no employees.");
      const hours = await portalHours(lines.map((l) => l.structure.employeeId).filter((x): x is string => !!x), run.month);
      const noSheet = lines.filter((l) => !l.timesheetPath && !((l.structure.employeeId && hours.get(l.structure.employeeId)) ?? 0)).map((l) => l.structure.name);
      const unapproved = lines.filter((l) => l.approvalStatus !== "Okay").map((l) => l.structure.name);
      const list = (xs: string[]) => `${xs.slice(0, 5).join(", ")}${xs.length > 5 ? "…" : ""}`;
      if (noSheet.length || unapproved.length) {
        const problems = [];
        if (noSheet.length) problems.push(`${noSheet.length} without a timesheet (${list(noSheet)})`);
        if (unapproved.length) problems.push(`${unapproved.length} not approved (${list(unapproved)})`);
        fail(400, `Can’t finalise yet: ${problems.join("; ")}.`);
      }
      // People with a portal account get a regular payables entry (+ ledger accrual) so the bank match can mark it paid.
      const { y, m } = monthRange(run.month);
      const linked = lines.filter((l) => l.structure.employeeId && l.netPay > 0);
      const clashes = await prisma.payroll.findMany({
        where: { entityId: run.entityId, month: m, year: y, employeeId: { in: linked.map((l) => l.structure.employeeId!) } },
        select: { employee: { select: { firstName: true, lastName: true } } },
      });
      if (clashes.length) {
        fail(409, `Salary for ${list(clashes.map((c) => `${c.employee.firstName} ${c.employee.lastName}`.trim()))} is already recorded for ${run.month} under Accounts → Payables. Delete those manual entries (or unlink the person) and finalise again.`);
      }
      await prisma.$transaction(async (tx) => {
        for (const l of linked) {
          const deductions = l.pt + l.pfEmployee + l.esicEmployee;
          const p = await tx.payroll.create({
            data: {
              employeeId: l.structure.employeeId!,
              entityId: run.entityId,
              month: m,
              year: y,
              basicSalary: r2(l.basic),
              allowances: r2(l.hra + l.conv + l.bonus),
              deductions: r2(deductions),
              netPayable: r2(l.netPay),
              status: "PENDING",
            },
          });
          await tx.ledger.create({
            data: {
              entityId: run.entityId,
              type: "EMPLOYEE",
              employeeId: l.structure.employeeId!,
              date: new Date(Date.UTC(y, m - 1, 28)),
              description: `Payroll accrual (${String(m).padStart(2, "0")}/${y})`,
              debit: r2(l.netPay),
              credit: 0,
              balance: r2(l.netPay),
              referenceId: p.id,
              referenceType: "PAYROLL",
            },
          });
          await tx.payrollLine.update({ where: { id: l.id }, data: { payrollId: p.id } });
        }
        await tx.payrollRun.update({ where: { id }, data: { status: "Finalised", finalisedById: req.user!.id, finalisedAt: new Date() } });
      });
      await logAccountsAudit({ action: "FINALISE", tableName: "PayrollRun", recordId: id, performedBy: req.user!.id, newValue: { entity: run.entity.name, month: run.month, employees: lines.length, payablesCreated: linked.length } });
      return reply.send({ success: true, data: { payablesCreated: linked.length, notLinked: lines.length - linked.length } });
    } catch (e) {
      return handle(reply, e);
    }
  });

  app.post(`${B}/runs/:id/reopen`, guard, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const run = await getRun(id);
      if (run.status !== "Finalised") fail(409, "Only a finalised run can be reopened.");
      const lines = await prisma.payrollLine.findMany({ where: { runId: id, payrollId: { not: null } }, select: { id: true, payrollId: true } });
      const payIds = lines.map((l) => l.payrollId!);
      const paid = await prisma.payroll.findMany({ where: { id: { in: payIds }, status: "PAID" }, select: { employee: { select: { firstName: true, lastName: true } } } });
      if (paid.length) {
        fail(409, `Can’t reopen: ${paid.length} salar${paid.length === 1 ? "y is" : "ies are"} already marked paid (${paid.slice(0, 5).map((p) => `${p.employee.firstName} ${p.employee.lastName}`.trim()).join(", ")}). Reverse the bank match first.`);
      }
      await prisma.$transaction([
        prisma.ledger.deleteMany({ where: { referenceId: { in: payIds }, referenceType: "PAYROLL" } }),
        prisma.payroll.deleteMany({ where: { id: { in: payIds } } }),
        prisma.payrollLine.updateMany({ where: { runId: id }, data: { payrollId: null } }),
        prisma.payrollRun.update({ where: { id }, data: { status: "Draft", finalisedById: null, finalisedAt: null } }),
      ]);
      await logAccountsAudit({ action: "REOPEN", tableName: "PayrollRun", recordId: id, performedBy: req.user!.id, newValue: { entity: run.entity.name, month: run.month, payablesRemoved: payIds.length } });
      return reply.send({ success: true });
    } catch (e) {
      return handle(reply, e);
    }
  });

  // ── Salary sheet (the firm's layout: same columns, same formulas, totals row above the header) ──
  app.get(`${B}/runs/:id/export`, guard, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const run = await getRun(id);
      const lines = await prisma.payrollLine.findMany({ where: { runId: id }, include: { structure: { select: { name: true } } }, orderBy: { structure: { name: "asc" } } });
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(`${run.entity.name}-Salary Sheet`.slice(0, 31), { views: [{ state: "frozen", xSplit: 3, ySplit: 2 }] });
      const headers = ["Month", "Sr No", "Name", "PF", "ESIC", "%", "Total CTC", "Basic", "HRA", "Conv", "Bonus", "Total Gross", "PT", "PF", "ESIC", "Net Pay", "PF", "ESIC", "Remarks", "Total Days", "Worked Days", "LOP", "Remarks for Salary Go Ahead"];
      const first = 3;
      const last = 2 + lines.length;
      for (let c = 8; c <= 18; c++) {
        const col = ws.getColumn(c).letter;
        const cell = ws.getCell(1, c);
        cell.value = lines.length ? { formula: `SUM(${col}${first}:${col}${last})` } : 0;
        cell.font = { bold: true };
        cell.numFmt = "#,##0";
      }
      headers.forEach((h, i) => {
        const cell = ws.getCell(2, i + 1);
        cell.value = h;
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      });
      const [yy, mm] = run.month.split("-").map(Number);
      const monthDate = new Date(Date.UTC(yy, mm - 1, 1));
      const thin = { style: "thin" as const, color: { argb: "FF999999" } };
      lines.forEach((l, i) => {
        const r = first + i;
        const values: ExcelJS.CellValue[] = [
          monthDate, i + 1, l.structure.name, l.pfApplicable ? "Yes" : "No", l.esicApplicable ? "Yes" : "No", l.basicPct, l.ctc,
          l.basic, l.hra, l.conv, l.bonus, { formula: `SUM(H${r}:K${r})` }, l.pt, l.pfEmployee, l.esicEmployee,
          { formula: `L${r}-M${r}-N${r}-O${r}` }, l.pfEmployer, l.esicEmployer, l.remarks || "Ok",
          { formula: `U${r}+V${r}` }, l.paidDays, l.lopDays, l.approvalRemarks || l.approvalStatus,
        ];
        values.forEach((v, c) => {
          const cell = ws.getCell(r, c + 1);
          cell.value = v;
          cell.border = { top: thin, bottom: thin, left: thin, right: thin };
          if (c === 0) cell.numFmt = "mmm-yy";
          else if (c === 5) cell.numFmt = "0%";
          else if (c >= 6 && c <= 17) cell.numFmt = "#,##0";
        });
      });
      [9, 6, 26, 5, 6, 6, 10, ...Array(11).fill(10), 18, 9, 10, 6, 24].forEach((w, i) => (ws.getColumn(i + 1).width = w));
      const label = monthDate.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }).replace(" ", "-");
      const buf = await wb.xlsx.writeBuffer();
      reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      reply.header("Content-Disposition", `attachment; filename="${run.entity.name.replace(/["\r\n]/g, "")} Salary ${label}.xlsx"`);
      return reply.send(Buffer.from(buf));
    } catch (e) {
      return handle(reply, e);
    }
  });

  /** Days in a month, for the run editor's default (and a sanity check from the client). */
  app.get(`${B}/days-in-month/:month`, guard, async (req, reply) => {
    const { month } = req.params as { month: string };
    if (!MONTH_RE.test(month)) return reply.code(400).send({ success: false, message: "Month must be YYYY-MM." });
    return reply.send({ success: true, data: { days: daysInMonth(month) } });
  });
}
