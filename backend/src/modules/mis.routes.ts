import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../config/db";
import { logAccountsAudit, requireAccountsAccess } from "./accounts.routes";
import { cleanHeader, parseLedgerMasters, parseRegister, TallyParseError } from "../utils/tally-parse";
import { classifiedVouchers, costAllocation, costMonths, dimensionsLookup, invoiceRevenue, ymRe, type CostSource } from "../utils/mis-core";

/**
 * ASA MIS features inside Accounts & Finance (Admin, Owner, Accounts):
 *   Tally import (voucher registers + ledger masters) with the Grand Total check, group → head mapping,
 *   Tally party links; P&L by entity; cost allocation; reporting dimensions; vertical-head MIS (live, plus
 *   uploaded historical snapshots); data checks.
 */

const HEADS = ["Revenue", "Expense", "Tax", "Balance Sheet", "Suspense"];
const CATEGORIES = ["Employee", "Consultant", "Partner", "Other"];
const MAX_FILE = 25 * 1024 * 1024;

class MisError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
const fail = (status: number, message: string): never => {
  throw new MisError(status, message);
};
function handle(reply: FastifyReply, e: unknown) {
  if (e instanceof MisError) return reply.code(e.status).send({ success: false, message: e.message });
  if (e instanceof TallyParseError) return reply.code(400).send({ success: false, message: e.message });
  throw e;
}

const monthsParam = (raw?: string) => {
  const ms = String(raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ms.some((m) => !ymRe.test(m))) fail(400, "Months must be YYYY-MM, comma-separated.");
  return [...new Set(ms)].sort();
};
const sourceParam = (raw?: string): CostSource => (raw === "tally" ? "tally" : "payroll");

/** Reads uploaded files (and plain fields) from a multipart request without saving them to disk. */
async function readUpload(req: FastifyRequest) {
  if (!(req.headers["content-type"] ?? "").includes("multipart/form-data")) fail(400, "Upload the file(s) as a form.");
  const fields: Record<string, string> = {};
  const files: { name: string; buf: Buffer }[] = [];
  for await (const part of req.parts()) {
    if (part.type === "field") fields[part.fieldname] = String(part.value ?? "");
    else {
      const buf = await part.toBuffer();
      if (!buf.length) continue;
      if (buf.length > MAX_FILE) fail(400, `${part.filename} is larger than 25 MB.`);
      files.push({ name: (part.filename || "upload.xlsx").split(/[\\/]/).pop()!, buf });
    }
  }
  return { fields, files };
}

const stem = (fileName: string) => fileName.replace(/\.[^.]+$/, "");

export async function misRoutes(app: FastifyInstance) {
  const guard = { preHandler: [requireAccountsAccess] };

  // ── Tally import ───────────────────────────────────────────────────────────
  // POST /api/accounts/tally/registers  multipart: entityId + one or more register exports (.xlsx)
  app.post("/api/accounts/tally/registers", guard, async (req, reply) => {
    try {
      const { fields, files } = await readUpload(req);
      const entity = fields.entityId ? await prisma.entity.findUnique({ where: { id: fields.entityId }, select: { id: true, name: true } }) : null;
      if (!entity) fail(400, "Choose the firm these registers belong to.");
      if (!files.length) fail(400, "Choose at least one Tally register export.");
      const results = [];
      for (const f of files) {
        try {
          const parsed = await parseRegister(f.buf, stem(f.name), entity!.name);
          const outputTotal = parsed.rows.reduce((a, r) => a + r.value, 0);
          const difference = Math.round((parsed.tallyGrandTotal - outputTotal) * 100) / 100;
          // Each register is fully replaced from its file (the source is always a full re-export).
          await prisma.$transaction(
            async (tx) => {
              await tx.tallyVoucher.deleteMany({ where: { entityId: entity!.id, register: parsed.register } });
              for (let i = 0; i < parsed.rows.length; i += 1000) {
                await tx.tallyVoucher.createMany({
                  data: parsed.rows.slice(i, i + 1000).map((r) => ({ ...r, entityId: entity!.id, register: parsed.register, date: r.date ? new Date(`${r.date}T00:00:00.000Z`) : null })),
                });
              }
              await tx.tallyLoadLog.upsert({
                where: { entityId_register: { entityId: entity!.id, register: parsed.register } },
                create: { entityId: entity!.id, register: parsed.register, sourceFile: f.name, vouchers: parsed.vouchers, rows: parsed.rows.length, tallyGrandTotal: parsed.tallyGrandTotal, outputTotal, difference, loadedById: req.user!.id },
                update: { sourceFile: f.name, vouchers: parsed.vouchers, rows: parsed.rows.length, tallyGrandTotal: parsed.tallyGrandTotal, outputTotal, difference, loadedById: req.user!.id, loadedAt: new Date() },
              });
            },
            { timeout: 120_000 },
          );
          results.push({ file: f.name, register: parsed.register, vouchers: parsed.vouchers, rows: parsed.rows.length, tallyGrandTotal: parsed.tallyGrandTotal, outputTotal, difference, ok: Math.abs(difference) < 0.01 });
        } catch (e) {
          results.push({ file: f.name, error: e instanceof Error ? e.message : "Couldn’t read this file." });
        }
      }
      await logAccountsAudit({ action: "IMPORT", tableName: "TallyVoucher", recordId: entity!.id, performedBy: req.user!.id, newValue: { entity: entity!.name, files: results.map((r) => ({ file: r.file, rows: "rows" in r ? r.rows : 0, error: "error" in r ? r.error : undefined })) } });
      return reply.send({ success: true, data: results });
    } catch (e) {
      return handle(reply, e);
    }
  });

  // POST /api/accounts/tally/ledgers  multipart: file (+ entityId when the file has no "Firm Name" column)
  app.post("/api/accounts/tally/ledgers", guard, async (req, reply) => {
    try {
      const { fields, files } = await readUpload(req);
      if (!files.length) fail(400, "Choose the Ledger Masters export.");
      const chosen = fields.entityId ? await prisma.entity.findUnique({ where: { id: fields.entityId }, select: { id: true, name: true } }) : null;
      const rows = await parseLedgerMasters(files[0].buf, chosen?.name ?? null);
      const entities = await prisma.entity.findMany({ select: { id: true, name: true } });
      const byName = new Map(entities.map((e) => [e.name.toLowerCase(), e]));
      const unknown = [...new Set(rows.map((r) => r.firm).filter((f) => !byName.has(f.toLowerCase())))];
      if (unknown.length) fail(400, `These firms in the file aren’t billing entities in the portal: ${unknown.slice(0, 5).join(", ")}. Add them under Billing entities (same name) or choose a single firm.`);
      const perEntity = new Map<string, typeof rows>();
      for (const r of rows) {
        const e = byName.get(r.firm.toLowerCase())!;
        perEntity.set(e.id, [...(perEntity.get(e.id) ?? []), r]);
      }
      await prisma.$transaction(
        async (tx) => {
          for (const [entityId, list] of perEntity) {
            // A masters export is a complete snapshot for its firm(s): replace.
            await tx.tallyLedger.deleteMany({ where: { entityId } });
            const seen = new Set<string>();
            const data = list.filter((r) => !seen.has(r.ledgerName) && seen.add(r.ledgerName)).map((r) => ({ entityId, ledgerName: r.ledgerName, parent: r.parent, primaryGroup: r.primaryGroup, openingBalance: r.openingBalance, closingBalance: r.closingBalance }));
            for (let i = 0; i < data.length; i += 1000) await tx.tallyLedger.createMany({ data: data.slice(i, i + 1000) });
            await tx.tallyLoadLog.upsert({
              where: { entityId_register: { entityId, register: "Ledger Masters" } },
              create: { entityId, register: "Ledger Masters", sourceFile: files[0].name, rows: data.length, loadedById: req.user!.id },
              update: { sourceFile: files[0].name, rows: data.length, loadedById: req.user!.id, loadedAt: new Date() },
            });
          }
        },
        { timeout: 120_000 },
      );
      const summary = [...perEntity].map(([id, list]) => ({ entity: entities.find((e) => e.id === id)!.name, ledgers: list.length }));
      await logAccountsAudit({ action: "IMPORT", tableName: "TallyLedger", recordId: "ledger-masters", performedBy: req.user!.id, newValue: { file: files[0].name, summary } });
      // New primary groups appear with no head until someone maps them.
      const groups = [...new Set(rows.map((r) => r.primaryGroup).filter((g): g is string => !!g))];
      const mapped = new Set((await prisma.tallyGroupHead.findMany({ where: { primaryGroup: { in: groups } }, select: { primaryGroup: true } })).map((g) => g.primaryGroup));
      return reply.send({ success: true, data: { summary, unmappedGroups: groups.filter((g) => !mapped.has(g)) } });
    } catch (e) {
      return handle(reply, e);
    }
  });

  // GET /api/accounts/tally/status — what's loaded, per firm
  app.get("/api/accounts/tally/status", guard, async (_req, reply) => {
    const [logs, entities, counts, range] = await Promise.all([
      prisma.tallyLoadLog.findMany({ include: { entity: { select: { name: true } } }, orderBy: [{ entity: { name: "asc" } }, { register: "asc" }] }),
      prisma.entity.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.tallyVoucher.groupBy({ by: ["entityId"], _count: { _all: true } }),
      prisma.$queryRawUnsafe<{ entityId: string; first: Date | null; last: Date | null }[]>(`SELECT "entityId", MIN("date") AS first, MAX("date") AS last FROM tally_vouchers GROUP BY 1`),
    ]);
    const ledgerCounts = await prisma.tallyLedger.groupBy({ by: ["entityId"], _count: { _all: true } });
    return reply.send({
      success: true,
      data: {
        logs,
        entities: entities.map((e) => ({
          ...e,
          voucherRows: counts.find((c) => c.entityId === e.id)?._count._all ?? 0,
          ledgers: ledgerCounts.find((c) => c.entityId === e.id)?._count._all ?? 0,
          from: range.find((r) => r.entityId === e.id)?.first ?? null,
          to: range.find((r) => r.entityId === e.id)?.last ?? null,
        })),
      },
    });
  });

  // DELETE /api/accounts/tally/registers?entityId=&register=  — remove one imported register
  app.delete("/api/accounts/tally/registers", guard, async (req, reply) => {
    const { entityId, register } = (req.query ?? {}) as { entityId?: string; register?: string };
    if (!entityId || !register) return reply.code(400).send({ success: false, message: "entityId and register are required." });
    const n = await prisma.$transaction(async (tx) => {
      const del = register === "Ledger Masters" ? await tx.tallyLedger.deleteMany({ where: { entityId } }) : await tx.tallyVoucher.deleteMany({ where: { entityId, register } });
      await tx.tallyLoadLog.deleteMany({ where: { entityId, register } });
      return del.count;
    });
    await logAccountsAudit({ action: "DELETE", tableName: register === "Ledger Masters" ? "TallyLedger" : "TallyVoucher", recordId: entityId, performedBy: req.user!.id, oldValue: { register, rows: n } });
    return reply.send({ success: true, data: { removed: n } });
  });

  // Group → head mapping
  app.get("/api/accounts/tally/group-heads", guard, async (_req, reply) => {
    const [heads, used] = await Promise.all([
      prisma.tallyGroupHead.findMany({ orderBy: { primaryGroup: "asc" } }),
      prisma.tallyLedger.groupBy({ by: ["primaryGroup"], _count: { _all: true } }),
    ]);
    const known = new Set(heads.map((h) => h.primaryGroup));
    const unmapped = used.filter((u) => u.primaryGroup && !known.has(u.primaryGroup)).map((u) => ({ primaryGroup: u.primaryGroup!, head: null, ledgers: u._count._all }));
    return reply.send({ success: true, data: [...unmapped, ...heads.map((h) => ({ ...h, ledgers: used.find((u) => u.primaryGroup === h.primaryGroup)?._count._all ?? 0 }))] });
  });

  app.put("/api/accounts/tally/group-heads", guard, async (req, reply) => {
    const { primaryGroup, head } = (req.body ?? {}) as { primaryGroup?: string; head?: string };
    const g = cleanHeader(primaryGroup);
    if (!g || !HEADS.includes(String(head))) return reply.code(400).send({ success: false, message: `Choose a group and one of: ${HEADS.join(", ")}.` });
    const row = await prisma.tallyGroupHead.upsert({ where: { primaryGroup: g }, create: { primaryGroup: g, head: head! }, update: { head: head! } });
    await logAccountsAudit({ action: "UPDATE", tableName: "TallyGroupHead", recordId: g, performedBy: req.user!.id, newValue: { head } });
    return reply.send({ success: true, data: row });
  });

  // Tally party links (MIS employee_master): expense parties with their totals + current link
  app.get("/api/accounts/tally/parties", guard, async (_req, reply) => {
    const [rows, links] = await Promise.all([
      prisma.$queryRawUnsafe<{ particulars: string; value: number; months: number }[]>(`
        SELECT v.particulars, SUM(v.value)::float8 AS value, COUNT(DISTINCT to_char(v."date", 'YYYY-MM'))::int AS months
        FROM tally_vouchers v
        JOIN tally_ledgers l ON l."entityId" = v."entityId" AND l."ledgerName" = v.ledger
        JOIN tally_group_heads h ON h."primaryGroup" = l."primaryGroup" AND h.head = 'Expense'
        WHERE v.particulars IS NOT NULL AND v.particulars <> ''
        GROUP BY v.particulars ORDER BY 2 DESC LIMIT 2000`),
      prisma.tallyPartyLink.findMany({ include: { employee: { select: { id: true, firstName: true, lastName: true, employeeId: true } } } }),
    ]);
    const byName = new Map(links.map((l) => [l.tallyName.toLowerCase(), l]));
    const out = rows.map((r) => ({ tallyName: r.particulars, expense: Math.round(r.value * 100) / 100, months: r.months, link: byName.get(r.particulars.toLowerCase()) ?? null }));
    const seen = new Set(out.map((o) => o.tallyName.toLowerCase()));
    for (const l of links) if (!seen.has(l.tallyName.toLowerCase())) out.push({ tallyName: l.tallyName, expense: 0, months: 0, link: l });
    return reply.send({ success: true, data: out });
  });

  app.put("/api/accounts/tally/parties", guard, async (req, reply) => {
    const { tallyName, employeeId, category } = (req.body ?? {}) as { tallyName?: string; employeeId?: string | null; category?: string };
    const n = String(tallyName ?? "").trim();
    if (!n) return reply.code(400).send({ success: false, message: "tallyName is required." });
    if (category && !CATEGORIES.includes(category)) return reply.code(400).send({ success: false, message: `Category must be one of: ${CATEGORIES.join(", ")}.` });
    if (employeeId && !(await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } }))) return reply.code(404).send({ success: false, message: "Portal account not found." });
    const existing = await prisma.tallyPartyLink.findFirst({ where: { tallyName: { equals: n, mode: "insensitive" } } });
    const data = { employeeId: employeeId || null, category: category || existing?.category || "Employee", updatedById: req.user!.id };
    const row = existing ? await prisma.tallyPartyLink.update({ where: { id: existing.id }, data }) : await prisma.tallyPartyLink.create({ data: { tallyName: n, ...data } });
    return reply.send({ success: true, data: row });
  });

  // ── P&L by entity (MIS /pnl) ──────────────────────────────────────────────
  app.get("/api/accounts/pnl", guard, async (req, reply) => {
    try {
      const q = (req.query ?? {}) as { entityIds?: string; months?: string };
      const entityIds = String(q.entityIds ?? "").split(",").filter(Boolean);
      const months = monthsParam(q.months);
      const rows = await classifiedVouchers({ entityIds, months });
      const acc = new Map<string, { entityId: string; month: string; head: string; amount: number }>();
      for (const r of rows) {
        if (!r.month || !["Revenue", "Expense", "Tax"].includes(r.head)) continue;
        const key = `${r.entityId}|${r.month}|${r.head}`;
        const cur = acc.get(key) ?? { entityId: r.entityId, month: r.month, head: r.head, amount: 0 };
        // Revenue and tax are Cr (negative) in Tally: show them positive.
        cur.amount += r.head === "Expense" ? r.value : -r.value;
        acc.set(key, cur);
      }
      return reply.send({ success: true, data: [...acc.values()].map((r) => ({ ...r, amount: Math.round(r.amount * 100) / 100 })) });
    } catch (e) {
      return handle(reply, e);
    }
  });

  app.get("/api/accounts/pnl/filters", guard, async (_req, reply) => {
    const [months, entities] = await Promise.all([
      prisma.$queryRawUnsafe<{ m: string }[]>(`SELECT DISTINCT to_char("date", 'YYYY-MM') AS m FROM tally_vouchers WHERE "date" IS NOT NULL ORDER BY 1`),
      prisma.$queryRawUnsafe<{ id: string; name: string }[]>(`SELECT DISTINCT e.id, e.name FROM tally_vouchers v JOIN "Entity" e ON e.id = v."entityId" ORDER BY 2`),
    ]);
    return reply.send({ success: true, data: { months: months.map((r) => r.m), entities } });
  });

  // Ledger drill-down behind a P&L figure
  app.get("/api/accounts/pnl/ledgers", guard, async (req, reply) => {
    try {
      const q = (req.query ?? {}) as { entityIds?: string; months?: string; head?: string };
      if (!["Revenue", "Expense", "Tax", "Unclassified"].includes(String(q.head))) fail(400, "head must be Revenue, Expense, Tax or Unclassified.");
      const rows = await classifiedVouchers({ entityIds: String(q.entityIds ?? "").split(",").filter(Boolean), months: monthsParam(q.months) });
      const acc = new Map<string, { ledger: string; primaryGroup: string | null; amount: number; entries: number }>();
      for (const r of rows) {
        if (r.head !== q.head) continue;
        const cur = acc.get(r.ledger) ?? { ledger: r.ledger, primaryGroup: r.primaryGroup, amount: 0, entries: 0 };
        cur.amount += q.head === "Expense" || q.head === "Unclassified" ? r.value : -r.value;
        cur.entries += r.n;
        acc.set(r.ledger, cur);
      }
      return reply.send({ success: true, data: [...acc.values()].map((r) => ({ ...r, amount: Math.round(r.amount * 100) / 100 })).sort((a, b) => b.amount - a.amount) });
    } catch (e) {
      return handle(reply, e);
    }
  });

  // ── Cost allocation ──────────────────────────────────────────────────────
  app.get("/api/accounts/cost-allocation/months", guard, async (req, reply) => {
    const { source } = (req.query ?? {}) as { source?: string };
    return reply.send({ success: true, data: await costMonths(sourceParam(source)) });
  });

  app.get("/api/accounts/cost-allocation", guard, async (req, reply) => {
    try {
      const q = (req.query ?? {}) as { months?: string; source?: string; entityId?: string };
      const months = monthsParam(q.months);
      if (!months.length) fail(400, "Choose at least one month.");
      const data = await costAllocation(sourceParam(q.source), months, q.entityId || undefined);
      return reply.send({ success: true, data });
    } catch (e) {
      return handle(reply, e);
    }
  });

  // ── Reporting dimensions (MIS client_project_master) ──────────────────────
  app.get("/api/accounts/reporting-map", guard, async (_req, reply) => {
    const [clients, maps] = await Promise.all([
      prisma.client.findMany({
        select: { id: true, name: true, status: true, projects: { select: { id: true, name: true, status: true, partner: { select: { firstName: true, lastName: true } } }, orderBy: { name: "asc" } } },
        orderBy: { name: "asc" },
      }),
      prisma.reportingMap.findMany(),
    ]);
    const key = (c: string, p: string | null) => `${c}|${p ?? ""}`;
    const byKey = new Map(maps.map((m) => [key(m.clientId, m.projectId), m]));
    return reply.send({
      success: true,
      data: clients.map((c) => ({
        ...c,
        mapping: byKey.get(key(c.id, null)) ?? null,
        projects: c.projects.map((p) => ({ ...p, partner: p.partner ? `${p.partner.firstName} ${p.partner.lastName}`.trim() : null, mapping: byKey.get(key(c.id, p.id)) ?? null })),
      })),
    });
  });

  app.put("/api/accounts/reporting-map", guard, async (req, reply) => {
    const b = (req.body ?? {}) as { clientId?: string; projectId?: string | null; reportingClientName?: string; serviceCategory?: string; verticalHead?: string; engagementPartner?: string };
    if (!b.clientId) return reply.code(400).send({ success: false, message: "clientId is required." });
    if (b.projectId) {
      const p = await prisma.project.findUnique({ where: { id: b.projectId }, select: { clientId: true } });
      if (!p || p.clientId !== b.clientId) return reply.code(400).send({ success: false, message: "That project doesn’t belong to the client." });
    } else if (!(await prisma.client.findUnique({ where: { id: b.clientId }, select: { id: true } }))) {
      return reply.code(404).send({ success: false, message: "Client not found." });
    }
    const clean = (v?: string) => (v === undefined ? undefined : String(v).trim() || null);
    const data = { reportingClientName: clean(b.reportingClientName), serviceCategory: clean(b.serviceCategory), verticalHead: clean(b.verticalHead), engagementPartner: clean(b.engagementPartner), updatedById: req.user!.id };
    const existing = await prisma.reportingMap.findFirst({ where: { clientId: b.clientId, projectId: b.projectId ?? null } });
    const row = existing ? await prisma.reportingMap.update({ where: { id: existing.id }, data }) : await prisma.reportingMap.create({ data: { clientId: b.clientId, projectId: b.projectId ?? null, ...data } });
    return reply.send({ success: true, data: row });
  });

  // ── Vertical-head MIS (live) ─────────────────────────────────────────────
  // Revenue = issued invoices (excl. GST, INR) by client/project; cost = allocated employee cost.
  app.get("/api/accounts/vertical-mis", guard, async (req, reply) => {
    try {
      const q = (req.query ?? {}) as { months?: string; source?: string };
      const months = monthsParam(q.months);
      if (!months.length) fail(400, "Choose at least one month.");
      const [revenue, alloc, dims] = await Promise.all([invoiceRevenue(months), costAllocation(sourceParam(q.source), months), dimensionsLookup()]);
      type Agg = { verticalHead: string; reportingClient: string; serviceCategory: string; partner: string | null; revenue: number; cost: number; hours: number };
      const acc = new Map<string, Agg>();
      const add = (d: ReturnType<typeof dims>, f: Partial<Pick<Agg, "revenue" | "cost" | "hours">>) => {
        const vh = d.verticalHead || "Unassigned";
        const sc = d.serviceCategory || "Unassigned";
        const key = `${vh}|${d.reportingClient}|${sc}`;
        const cur = acc.get(key) ?? { verticalHead: vh, reportingClient: d.reportingClient, serviceCategory: sc, partner: d.partner, revenue: 0, cost: 0, hours: 0 };
        cur.revenue += f.revenue ?? 0;
        cur.cost += f.cost ?? 0;
        cur.hours += f.hours ?? 0;
        acc.set(key, cur);
      };
      for (const r of revenue) add(dims(r.clientId, r.projectId), { revenue: r.amount });
      for (const a of alloc.rows) add(dims(a.clientId, a.projectId), { cost: a.allocated, hours: a.hours });
      const rows = [...acc.values()].map((r) => ({ ...r, revenue: Math.round(r.revenue * 100) / 100, cost: Math.round(r.cost * 100) / 100, hours: Math.round(r.hours * 100) / 100, contribution: Math.round((r.revenue - r.cost) * 100) / 100 }));
      return reply.send({ success: true, data: { rows, unallocatedCost: Math.round(alloc.unallocated.reduce((a, u) => a + u.cost, 0) * 100) / 100 } });
    } catch (e) {
      return handle(reply, e);
    }
  });

  // Historical vertical-MIS snapshots (ASA MIS mis_data.json)
  app.get("/api/accounts/vertical-mis/snapshots", guard, async (_req, reply) => {
    const rows = await prisma.misSnapshot.findMany({ select: { id: true, label: true, uploadedAt: true, uploadedById: true }, orderBy: { uploadedAt: "desc" } });
    return reply.send({ success: true, data: rows });
  });

  app.get("/api/accounts/vertical-mis/snapshots/:id", guard, async (req, reply) => {
    const { id } = req.params as { id: string };
    const s = await prisma.misSnapshot.findUnique({ where: { id } });
    if (!s) return reply.code(404).send({ success: false, message: "Snapshot not found." });
    return reply.send({ success: true, data: s });
  });

  app.post("/api/accounts/vertical-mis/snapshots", guard, async (req, reply) => {
    try {
      const { fields, files } = await readUpload(req);
      if (!files.length) fail(400, "Choose the mis_data.json file written by the ASA MIS vertical-MIS script.");
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(files[0].buf.toString("utf8"));
      } catch {
        fail(400, "That file isn’t valid JSON.");
      }
      const d = data!;
      if (!Array.isArray(d.years) || !Array.isArray(d.rows)) fail(400, "This doesn’t look like ASA MIS vertical data (expected “years” and “rows”).");
      const years = (d.years as { fy?: string }[]).map((y) => y.fy).filter(Boolean).join(", ");
      const label = (fields.label || `Vertical MIS ${years}`).slice(0, 120);
      const s = await prisma.misSnapshot.create({ data: { label, data: d as object, uploadedById: req.user!.id }, select: { id: true, label: true, uploadedAt: true } });
      await logAccountsAudit({ action: "IMPORT", tableName: "MisSnapshot", recordId: s.id, performedBy: req.user!.id, newValue: { label, rows: (d.rows as unknown[]).length } });
      return reply.code(201).send({ success: true, data: s });
    } catch (e) {
      return handle(reply, e);
    }
  });

  app.delete("/api/accounts/vertical-mis/snapshots/:id", guard, async (req, reply) => {
    const { id } = req.params as { id: string };
    const s = await prisma.misSnapshot.findUnique({ where: { id }, select: { label: true } });
    if (!s) return reply.code(404).send({ success: false, message: "Snapshot not found." });
    await prisma.misSnapshot.delete({ where: { id } });
    await logAccountsAudit({ action: "DELETE", tableName: "MisSnapshot", recordId: id, performedBy: req.user!.id, oldValue: { label: s.label } });
    return reply.send({ success: true });
  });

  // ── Data checks (MIS data_quality + cross-checks between payroll, Tally and timesheets) ──────────
  app.get("/api/accounts/data-checks", guard, async (req, reply) => {
    try {
      const q = (req.query ?? {}) as { months?: string };
      const months = q.months ? monthsParam(q.months) : [];
      const [logs, unmappedLedgers, unmappedGroups, unlinkedParties, structures, mapsCount, projectsCount] = await Promise.all([
        prisma.tallyLoadLog.findMany({ where: { register: { not: "Ledger Masters" } }, include: { entity: { select: { name: true } } } }),
        // Ledgers used in vouchers that the Ledger Masters don't know (can't be classified)
        prisma.$queryRawUnsafe<{ entity: string; ledger: string; value: number; n: number }[]>(`
          SELECT e.name AS entity, v.ledger, SUM(v.value)::float8 AS value, COUNT(*)::int AS n
          FROM tally_vouchers v JOIN "Entity" e ON e.id = v."entityId"
          LEFT JOIN tally_ledgers l ON l."entityId" = v."entityId" AND l."ledgerName" = v.ledger
          WHERE l.id IS NULL GROUP BY 1, 2 ORDER BY ABS(SUM(v.value)) DESC LIMIT 200`),
        // Primary groups with no P&L head
        prisma.$queryRawUnsafe<{ primaryGroup: string; ledgers: number }[]>(`
          SELECT l."primaryGroup", COUNT(*)::int AS ledgers FROM tally_ledgers l
          LEFT JOIN tally_group_heads h ON h."primaryGroup" = l."primaryGroup"
          WHERE l."primaryGroup" IS NOT NULL AND h."primaryGroup" IS NULL GROUP BY 1 ORDER BY 2 DESC`),
        // Expense parties with no link (their cost can't be allocated in the Tally view)
        prisma.$queryRawUnsafe<{ particulars: string; value: number }[]>(`
          SELECT v.particulars, SUM(v.value)::float8 AS value FROM tally_vouchers v
          JOIN tally_ledgers l ON l."entityId" = v."entityId" AND l."ledgerName" = v.ledger
          JOIN tally_group_heads h ON h."primaryGroup" = l."primaryGroup" AND h.head = 'Expense'
          LEFT JOIN tally_party_links p ON lower(p."tallyName") = lower(v.particulars)
          WHERE v.particulars IS NOT NULL AND v.particulars <> '' AND p.id IS NULL
          GROUP BY 1 ORDER BY 2 DESC LIMIT 50`),
        prisma.payrollStructure.findMany({ where: { status: "Active" }, select: { name: true, employeeId: true, needsReview: true, entity: { select: { name: true } } } }),
        prisma.reportingMap.count({ where: { OR: [{ verticalHead: { not: null } }, { serviceCategory: { not: null } }] } }),
        prisma.project.count(),
      ]);

      const checks: { key: string; title: string; status: "ok" | "warn" | "info"; count: number; detail: string; sample: unknown[] }[] = [];
      const mismatch = logs.filter((l) => Math.abs(l.difference) >= 0.01);
      checks.push({
        key: "tally-totals",
        title: "Tally registers tie to their Grand Total",
        status: !logs.length ? "info" : mismatch.length ? "warn" : "ok",
        count: mismatch.length,
        detail: !logs.length ? "No Tally registers imported yet." : mismatch.length ? `${mismatch.length} of ${logs.length} registers don’t add up to Tally’s Grand Total.` : `All ${logs.length} registers tie to Tally’s Grand Total.`,
        sample: mismatch.slice(0, 20).map((l) => ({ entity: l.entity.name, register: l.register, tally: l.tallyGrandTotal, imported: l.outputTotal, difference: l.difference })),
      });
      checks.push({
        key: "ledgers-unknown",
        title: "Every ledger in the vouchers is in the Ledger Masters",
        status: unmappedLedgers.length ? "warn" : logs.length ? "ok" : "info",
        count: unmappedLedgers.length,
        detail: unmappedLedgers.length ? "These ledgers can’t be classified (shown as Unclassified in the P&L). Re-import the Ledger Masters." : "All voucher ledgers are known.",
        sample: unmappedLedgers.slice(0, 20),
      });
      checks.push({
        key: "groups-unmapped",
        title: "Every Tally primary group has a P&L head",
        status: unmappedGroups.length ? "warn" : "ok",
        count: unmappedGroups.length,
        detail: unmappedGroups.length ? "Map these groups to Revenue / Expense / Tax / Balance Sheet under Tally → Group heads." : "All primary groups are mapped.",
        sample: unmappedGroups,
      });
      checks.push({
        key: "parties-unlinked",
        title: "Expense parties are linked (people and consultants)",
        status: unlinkedParties.length ? "warn" : "ok",
        count: unlinkedParties.length,
        detail: unlinkedParties.length ? "Biggest expense parties not yet linked. Link people/consultants to their portal account (or mark them Other) so Tally cost can be allocated." : "All expense parties are linked or categorised.",
        sample: unlinkedParties.slice(0, 20).map((p) => ({ party: p.particulars, expense: Math.round(p.value) })),
      });
      const unlinked = structures.filter((s) => !s.employeeId);
      const review = structures.filter((s) => s.needsReview);
      checks.push({
        key: "payroll-unlinked",
        title: "Active salary structures are linked to a portal account",
        status: unlinked.length ? "warn" : structures.length ? "ok" : "info",
        count: unlinked.length,
        detail: unlinked.length ? "Their salary can’t be allocated to clients and no payables entry is created on finalising." : structures.length ? "Everyone on payroll is linked." : "No salary structures yet.",
        sample: unlinked.slice(0, 20).map((s) => ({ name: s.name, firm: s.entity.name })),
      });
      checks.push({
        key: "payroll-review",
        title: "No salary structure is waiting to be checked",
        status: review.length ? "warn" : "ok",
        count: review.length,
        detail: review.length ? "Marked “Check” — confirm the amounts before the next run." : "None marked “Check”.",
        sample: review.slice(0, 20).map((s) => ({ name: s.name, firm: s.entity.name })),
      });
      checks.push({
        key: "reporting-map",
        title: "Clients/projects have a vertical head and service category",
        status: projectsCount && !mapsCount ? "warn" : "info",
        count: mapsCount,
        detail: `${mapsCount} client/project mapping${mapsCount === 1 ? "" : "s"} set (for ${projectsCount} projects). Unmapped work shows as “Unassigned” in the vertical MIS.`,
        sample: [],
      });

      if (months.length) {
        const [pay, tally] = await Promise.all([costAllocation("payroll", months), costAllocation("tally", months)]);
        const dims = await dimensionsLookup();
        const unmappedHours = new Map<string, number>();
        for (const r of pay.rows) {
          const d = dims(r.clientId, r.projectId);
          if (!d.verticalHead || !d.serviceCategory) unmappedHours.set(`${d.client} · ${d.project ?? "—"}`, (unmappedHours.get(`${d.client} · ${d.project ?? "—"}`) ?? 0) + r.hours);
        }
        checks.push({
          key: "cost-no-hours",
          title: "Everyone with salary cost logged time (payroll)",
          status: pay.unallocated.length ? "warn" : "ok",
          count: pay.unallocated.length,
          detail: pay.unallocated.length ? `Salary that couldn’t be allocated in ${months.join(", ")}.` : "All salary cost was allocated to clients.",
          sample: pay.unallocated.slice(0, 20),
        });
        checks.push({
          key: "tally-no-hours",
          title: "Everyone with Tally salary cost logged time",
          status: tally.unallocated.length ? "warn" : "ok",
          count: tally.unallocated.length,
          detail: tally.unallocated.length ? `Tally cost that couldn’t be allocated in ${months.join(", ")}.` : "All linked Tally cost was allocated.",
          sample: tally.unallocated.slice(0, 20),
        });
        checks.push({
          key: "hours-unmapped",
          title: "Time is logged on mapped clients/projects",
          status: unmappedHours.size ? "warn" : "ok",
          count: unmappedHours.size,
          detail: unmappedHours.size ? "Projects with costed hours but no vertical head or service category." : "All costed hours are on mapped projects.",
          sample: [...unmappedHours].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([project, hours]) => ({ project, hours: Math.round(hours * 10) / 10 })),
        });
      }
      return reply.send({ success: true, data: checks });
    } catch (e) {
      return handle(reply, e);
    }
  });
}
