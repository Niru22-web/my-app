import crypto from "crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import { prisma, SAFE_EMPLOYEE_SELECT } from "../config/db";
import { normRole } from "../plugins/auth";
import { logAccountsAudit, requireAccountsAccess } from "./accounts.routes";
import { AccountsError, createReceipt, invoiceBalance, nextDocNumber, OPEN_INVOICE, postLedger, refreshInvoiceStatus, reverseReceipt } from "../utils/accounts-core";
import { cleanPrefix, financialYear, formatDocNumber, placeOfSupply, splitTax, STATE_BY_CODE, type SupplyType } from "../utils/gst";

const r2 = (n: number) => Math.round(n * 100) / 100;
const todayIst = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const ymd = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);

const INVOICE_INCLUDE = {
  client: true,
  project: true,
  entity: true,
  items: true,
  receiptAllocations: { include: { receipt: { select: { id: true, receiptNumber: true, receiptDate: true } } } },
} as const;

/** Runs an accounts write; AccountsError becomes a 400 with its message. */
async function guarded<T>(reply: FastifyReply, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AccountsError) {
      reply.code(400).send({ success: false, message: e.message });
      return undefined;
    }
    throw e;
  }
}

/** Line items with GST split for a supply type. */
function buildItems(items: any[], supply: SupplyType, currency: string) {
  let subTotal = 0;
  let taxAmount = 0;
  const rows = items.map((it: any) => {
    const qty = Number(it.quantity ?? 1);
    const unitPrice = Number(it.unitPrice ?? 0);
    const gstRate = supply === "NO_GST" ? 0 : Number(it.gstRate ?? 0);
    if (!String(it.description ?? "").trim()) throw new AccountsError("Every line needs a description.");
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) throw new AccountsError("Quantity must be above 0 and rate can't be negative.");
    if (![0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28].includes(gstRate)) throw new AccountsError(`GST rate ${gstRate}% isn't a valid GST rate.`);
    const lineSub = r2(qty * unitPrice);
    const gstAmt = r2((lineSub * gstRate) / 100);
    subTotal += lineSub;
    taxAmount += gstAmt;
    return {
      description: String(it.description).trim().slice(0, 500),
      sacCode: it.sacCode ? String(it.sacCode).trim().slice(0, 8) : null,
      quantity: qty,
      unitPrice,
      total: r2(lineSub + gstAmt),
      gstRate,
      ...splitTax(gstAmt, supply),
      gstAmount: gstAmt,
      currency,
    };
  });
  return { rows, subTotal: r2(subTotal), taxAmount: r2(taxAmount), totalAmount: r2(subTotal + taxAmount) };
}

/** Adds balance, credit notes, place of supply and the shown status (OVERDUE when past due) to invoices. */
async function decorateInvoices<T extends { id: string; status: string; dueDate: Date | null; totalAmount: number; receiptAllocations?: { amountAllocated: number }[]; entity?: any; client?: any }>(invoices: T[]) {
  const ids = invoices.map((i) => i.id);
  const [credits, metas] = await Promise.all([
    ids.length ? prisma.creditNote.findMany({ where: { invoiceId: { in: ids } }, orderBy: { date: "asc" } }) : [],
    ids.length ? prisma.invoiceMeta.findMany({ where: { invoiceId: { in: ids } } }) : [],
  ]);
  const today = todayIst();
  return invoices.map((inv) => {
    const cn = credits.filter((c) => c.invoiceId === inv.id);
    const meta = metas.find((m) => m.invoiceId === inv.id) ?? null;
    const paid = r2((inv.receiptAllocations ?? []).reduce((s, a) => s + a.amountAllocated, 0));
    const credited = r2(cn.filter((c) => c.status === "ISSUED").reduce((s, c) => s + c.total, 0));
    const balanceDue = OPEN_INVOICE.includes(inv.status) ? Math.max(0, r2(inv.totalAmount - paid - credited)) : 0;
    const overdue = balanceDue > 0 && !!inv.dueDate && ymd(inv.dueDate) < today;
    const pos = meta
      ? { supplyType: meta.supplyType, code: meta.placeOfSupply, label: meta.placeOfSupply ? `${meta.placeOfSupply === "96" ? "Outside India" : (STATE_BY_CODE[meta.placeOfSupply] ?? meta.placeOfSupply)} (${meta.placeOfSupply})` : "—", problem: null }
      : inv.entity && inv.client
        ? placeOfSupply(inv.entity, inv.client)
        : null;
    return {
      ...inv,
      status: overdue && inv.status !== "PAID" ? "OVERDUE" : inv.status,
      storedStatus: inv.status,
      paidAmount: paid,
      creditedAmount: credited,
      balanceDue,
      creditNotes: cn,
      placeOfSupply: pos,
      issuedAt: meta?.issuedAt ?? null,
      cancelReason: meta?.cancelReason ?? null,
    };
  });
}

export async function accountsBillingRoutes(app: FastifyInstance) {
  // ── Invoices ─────────────────────────────────────────────────────────────────
  app.get("/api/accounts/invoices", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const q = (req.query ?? {}) as Record<string, string | undefined>;
    const where: Record<string, any> = {};
    if (q.entityId) where.entityId = q.entityId;
    if (q.clientId) where.clientId = q.clientId;
    if (q.from || q.to) where.issueDate = { ...(q.from ? { gte: new Date(`${q.from}T00:00:00.000Z`) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59.999Z`) } : {}) };
    const invoices = await prisma.invoice.findMany({ where, include: INVOICE_INCLUDE, orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }] });
    return reply.send({ success: true, data: await decorateInvoices(invoices) });
  });

  app.get("/api/accounts/invoices/:id", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const inv = await prisma.invoice.findUnique({ where: { id }, include: INVOICE_INCLUDE });
    if (!inv) return reply.code(404).send({ success: false, message: "Invoice not found." });
    return reply.send({ success: true, data: (await decorateInvoices([inv]))[0] });
  });

  // GET /api/accounts/place-of-supply?entityId&clientId — the same rule the server applies at issue (for the editor preview)
  app.get("/api/accounts/place-of-supply", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const { entityId, clientId } = (req.query ?? {}) as { entityId?: string; clientId?: string };
    const [entity, client] = await Promise.all([
      entityId ? prisma.entity.findUnique({ where: { id: entityId } }) : null,
      clientId ? prisma.client.findUnique({ where: { id: clientId } }) : null,
    ]);
    if (!entity || !client) return reply.code(404).send({ success: false, message: "Choose an entity and a client." });
    return reply.send({ success: true, data: placeOfSupply(entity, client) });
  });

  // POST /api/accounts/invoices — always a DRAFT with a temporary reference; the real number is given at issue.
  app.post("/api/accounts/invoices", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, any>;
    if (!b.entityId || !b.clientId || !Array.isArray(b.items) || b.items.length === 0) {
      return reply.code(400).send({ success: false, message: "Choose an entity and a client, and add at least one line." });
    }
    const [entity, client] = await Promise.all([
      prisma.entity.findUnique({ where: { id: String(b.entityId) } }),
      prisma.client.findUnique({ where: { id: String(b.clientId) } }),
    ]);
    if (!entity || (entity.status ?? "ACTIVE").toUpperCase() !== "ACTIVE") return reply.code(400).send({ success: false, message: "Choose an active billing entity." });
    if (!client) return reply.code(400).send({ success: false, message: "Client not found." });
    const currency = String(b.currency ?? "INR").toUpperCase();
    const built = await guarded(reply, async () => buildItems(b.items, placeOfSupply(entity, client).supplyType, currency));
    if (!built) return;
    const created = await prisma.invoice.create({
      data: {
        invoiceNumber: `DRAFT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        entityId: entity.id,
        clientId: client.id,
        projectId: b.projectId ? String(b.projectId) : null,
        udin: b.udin ? String(b.udin).trim() : null,
        issueDate: b.issueDate ? new Date(b.issueDate) : new Date(),
        dueDate: b.dueDate ? new Date(b.dueDate) : null,
        subTotal: built.subTotal,
        taxAmount: built.taxAmount,
        totalAmount: built.totalAmount,
        status: "DRAFT",
        currency,
        exchangeRate: currency === "INR" ? 1 : Number(b.exchangeRate ?? 1) || 1,
        items: { create: built.rows },
      },
      include: INVOICE_INCLUDE,
    });
    await logAccountsAudit({ action: "CREATE", tableName: "Invoice", recordId: created.id, performedBy: req.user!.id, newValue: { draft: created.invoiceNumber, totalAmount: created.totalAmount } });
    return reply.code(201).send({ success: true, data: (await decorateInvoices([created]))[0] });
  });

  // PUT /api/accounts/invoices/:id — drafts only (issued invoices are locked; UDIN may still be added).
  app.put("/api/accounts/invoices/:id", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as Record<string, any>;
    const existing = await prisma.invoice.findUnique({ where: { id }, include: { entity: true, client: true } });
    if (!existing) return reply.code(404).send({ success: false, message: "Invoice not found." });

    // Older screens issue/cancel through PUT { status } — route those to the proper actions.
    if (b.status === "SENT" && existing.status === "DRAFT") return issueInvoice(id, req.user!.id, reply, b.issueDate);
    if (b.status === "CANCELLED") return cancelInvoice(id, req.user!.id, String(b.reason ?? b.cancelReason ?? ""), reply);

    if (existing.status !== "DRAFT") {
      const onlyUdin = Object.keys(b).every((k) => k === "udin" || k === "status");
      if (!onlyUdin) return reply.code(409).send({ success: false, message: "Issued invoices can't be edited. Raise a credit note to correct one, or cancel it if nothing has been received." });
      const udin = b.udin ? String(b.udin).trim().toUpperCase() : null;
      if (udin && !/^\d{8}[A-Z]{6}\d{4}$/.test(udin)) return reply.code(400).send({ success: false, message: "UDIN is 18 characters: 8 digits, 6 letters, 4 digits." });
      const updated = await prisma.invoice.update({ where: { id }, data: { udin }, include: INVOICE_INCLUDE });
      await logAccountsAudit({ action: "UPDATE", tableName: "Invoice", recordId: id, performedBy: req.user!.id, oldValue: { udin: existing.udin }, newValue: { udin } });
      return reply.send({ success: true, data: (await decorateInvoices([updated]))[0] });
    }

    const data: Record<string, any> = {};
    let client = existing.client;
    if (b.clientId !== undefined && b.clientId !== existing.clientId) {
      const c = await prisma.client.findUnique({ where: { id: String(b.clientId) } });
      if (!c) return reply.code(400).send({ success: false, message: "Client not found." });
      client = c;
      data.clientId = c.id;
    }
    if (b.projectId !== undefined) data.projectId = b.projectId ? String(b.projectId) : null;
    if (b.udin !== undefined) data.udin = b.udin ? String(b.udin).trim() : null;
    if (b.issueDate) data.issueDate = new Date(b.issueDate);
    if (b.dueDate !== undefined) data.dueDate = b.dueDate ? new Date(b.dueDate) : null;
    if (b.currency !== undefined) data.currency = String(b.currency).toUpperCase();
    if (b.exchangeRate !== undefined) data.exchangeRate = (data.currency ?? existing.currency) === "INR" ? 1 : Number(b.exchangeRate) || 1;

    // Lines are re-priced with the (possibly new) client, so the CGST/SGST vs IGST split is always current.
    const items = Array.isArray(b.items) ? b.items : data.clientId ? (await prisma.invoiceItem.findMany({ where: { invoiceId: id } })) : null;
    if (items) {
      const built = await guarded(reply, async () => buildItems(items, placeOfSupply(existing.entity, client).supplyType, data.currency ?? existing.currency));
      if (!built) return;
      Object.assign(data, { subTotal: built.subTotal, taxAmount: built.taxAmount, totalAmount: built.totalAmount });
      data.items = { deleteMany: {}, create: built.rows };
    }
    const moved = await prisma.invoice.updateMany({ where: { id, status: "DRAFT" }, data: { updatedAt: new Date() } });
    if (!moved.count) return reply.code(409).send({ success: false, message: "This invoice was just issued. Refresh to see it." });
    const updated = await prisma.invoice.update({ where: { id }, data, include: INVOICE_INCLUDE });
    await logAccountsAudit({ action: "UPDATE", tableName: "Invoice", recordId: id, performedBy: req.user!.id, newValue: { totalAmount: updated.totalAmount } });
    return reply.send({ success: true, data: (await decorateInvoices([updated]))[0] });
  });

  // POST /api/accounts/invoices/:id/issue { issueDate? } — numbers, locks and posts the invoice to the client ledger.
  app.post("/api/accounts/invoices/:id/issue", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { issueDate } = (req.body ?? {}) as { issueDate?: string };
    return issueInvoice(id, req.user!.id, reply, issueDate);
  });

  // POST /api/accounts/invoices/:id/cancel { reason } — only when nothing has been received or credited.
  app.post("/api/accounts/invoices/:id/cancel", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { reason } = (req.body ?? {}) as { reason?: string };
    return cancelInvoice(id, req.user!.id, String(reason ?? ""), reply);
  });

  // DELETE /api/accounts/invoices/:id — drafts only (they were never numbered).
  app.delete("/api/accounts/invoices/:id", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ success: false, message: "Invoice not found." });
    const gone = await prisma.invoice.deleteMany({ where: { id, status: "DRAFT" } });
    if (!gone.count) return reply.code(400).send({ success: false, message: "Only drafts can be deleted. Cancel an issued invoice instead." });
    await logAccountsAudit({ action: "DELETE", tableName: "Invoice", recordId: id, performedBy: req.user!.id, oldValue: { draft: existing.invoiceNumber, totalAmount: existing.totalAmount } });
    return reply.send({ success: true });
  });

  // ── Credit notes ─────────────────────────────────────────────────────────────
  app.get("/api/accounts/credit-notes", { preHandler: [requireAccountsAccess] }, async (_req, reply) => {
    const rows = await prisma.creditNote.findMany({ orderBy: [{ date: "desc" }, { createdAt: "desc" }] });
    const [invoices, clients] = await Promise.all([
      prisma.invoice.findMany({ where: { id: { in: rows.map((r) => r.invoiceId) } }, select: { id: true, invoiceNumber: true } }),
      prisma.client.findMany({ where: { id: { in: rows.map((r) => r.clientId) } }, select: { id: true, name: true } }),
    ]);
    return reply.send({
      success: true,
      data: rows.map((r) => ({ ...r, invoiceNumber: invoices.find((i) => i.id === r.invoiceId)?.invoiceNumber ?? null, clientName: clients.find((c) => c.id === r.clientId)?.name ?? null })),
    });
  });

  // POST /api/accounts/invoices/:id/credit-notes { amount (taxable value), reason, date? }
  // GST is reversed at the invoice's own rate and split. Can't exceed what's still open on the invoice.
  app.post("/api/accounts/invoices/:id/credit-notes", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as { amount?: number; reason?: string; date?: string };
    const reason = String(b.reason ?? "").trim();
    const taxable = r2(Number(b.amount ?? 0));
    if (!reason) return reply.code(400).send({ success: false, message: "Give a reason for the credit note." });
    if (!(taxable > 0)) return reply.code(400).send({ success: false, message: "Enter the taxable amount to credit." });
    const date = b.date ? new Date(`${String(b.date).slice(0, 10)}T00:00:00.000Z`) : new Date(`${todayIst()}T00:00:00.000Z`);
    const result = await guarded(reply, () =>
      prisma.$transaction(async (tx) => {
        const inv = await tx.invoice.findUnique({ where: { id }, include: { items: true } });
        if (!inv) throw new AccountsError("Invoice not found.");
        if (!OPEN_INVOICE.includes(inv.status) && inv.status !== "PAID") throw new AccountsError("Credit notes can only be raised on issued invoices.");
        if (ymd(date) < ymd(inv.issueDate)) throw new AccountsError("A credit note can't be dated before its invoice.");
        const meta = await tx.invoiceMeta.findUnique({ where: { invoiceId: id } });
        const rate = inv.subTotal > 0 ? inv.taxAmount / inv.subTotal : 0;
        const tax = r2(taxable * rate);
        const total = r2(taxable + tax);
        const bal = await invoiceBalance(tx, id);
        // A paid invoice can still be credited (refund due); otherwise limit to the open amount.
        const creditedSoFar = bal.credited;
        if (total > r2(inv.totalAmount - creditedSoFar) + 0.01) throw new AccountsError(`At most ${r2(inv.totalAmount - creditedSoFar)} ${inv.currency} can still be credited on this invoice.`);
        const supply = (meta?.supplyType ?? "INTRA") as SupplyType;
        const split = splitTax(tax, supply);
        const number = await nextDocNumber(tx, inv.entityId, "CREDIT_NOTE", date);
        const cn = await tx.creditNote.create({
          data: { number, entityId: inv.entityId, clientId: inv.clientId, invoiceId: id, date, reason: reason.slice(0, 500), subTotal: taxable, ...split, taxAmount: tax, total, createdById: req.user!.id },
        });
        await postLedger(tx, { entityId: inv.entityId, type: "CLIENT", clientId: inv.clientId, date, description: `Credit note ${number} against ${inv.invoiceNumber}: ${reason}`, credit: total * (inv.exchangeRate || 1), referenceId: cn.id, referenceType: "CREDIT_NOTE" });
        await refreshInvoiceStatus(tx, id);
        return cn;
      }),
    );
    if (!result) return;
    await logAccountsAudit({ action: "CREATE", tableName: "CreditNote", recordId: result.id, performedBy: req.user!.id, newValue: { number: result.number, invoiceId: id, total: result.total } });
    return reply.code(201).send({ success: true, data: result });
  });

  // ── Receipts ─────────────────────────────────────────────────────────────────
  app.get("/api/accounts/receipts", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const q = (req.query ?? {}) as Record<string, string | undefined>;
    const where: Record<string, any> = {};
    if (q.entityId) where.entityId = q.entityId;
    if (q.clientId) where.clientId = q.clientId;
    if (q.from || q.to) where.receiptDate = { ...(q.from ? { gte: new Date(`${q.from}T00:00:00.000Z`) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59.999Z`) } : {}) };
    const rows = await prisma.receipt.findMany({
      where,
      include: { client: { select: { id: true, name: true } }, entity: { select: { id: true, name: true } }, allocations: { include: { invoice: { select: { id: true, invoiceNumber: true } } } } },
      orderBy: [{ receiptDate: "desc" }, { createdAt: "desc" }],
    });
    const extras = rows.length ? await prisma.receiptExtra.findMany({ where: { receiptId: { in: rows.map((r) => r.id) } } }) : [];
    return reply.send({
      success: true,
      data: rows.map((r) => {
        const x = extras.find((e) => e.receiptId === r.id);
        const applied = r2(r.allocations.reduce((s, a) => s + a.amountAllocated, 0));
        const gross = r2(r.amount + (x?.tdsAmount ?? 0));
        return { ...r, tdsAmount: x?.tdsAmount ?? 0, tdsSection: x?.tdsSection ?? null, grossAmount: gross, unapplied: x?.reversedAt ? 0 : Math.max(0, r2(gross - applied)), reversedAt: x?.reversedAt ?? null, reverseReason: x?.reverseReason ?? null };
      }),
    });
  });

  // POST /api/accounts/receipts { clientId, entityId, amount (net received), tdsAmount?, tdsSection?, currency, exchangeRate, receiptDate, paymentMode, referenceNumber?, notes?, invoiceId? }
  app.post("/api/accounts/receipts", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, any>;
    if (!b.clientId || !b.entityId || !b.receiptDate || !b.paymentMode) {
      return reply.code(400).send({ success: false, message: "Client, entity, date and payment mode are required." });
    }
    const date = new Date(`${String(b.receiptDate).slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || ymd(date) > todayIst()) return reply.code(400).send({ success: false, message: "The receipt date can't be in the future." });
    const currency = String(b.currency ?? "INR").toUpperCase();
    const result = await guarded(reply, () =>
      prisma.$transaction((tx) =>
        createReceipt(tx, {
          clientId: String(b.clientId),
          entityId: String(b.entityId),
          amount: Number(b.amount ?? 0),
          tdsAmount: Number(b.tdsAmount ?? 0),
          tdsSection: b.tdsSection ? String(b.tdsSection) : null,
          currency,
          exchangeRate: currency === "INR" ? 1 : Number(b.exchangeRate ?? 1) || 1,
          receiptDate: date,
          paymentMode: String(b.paymentMode),
          referenceNumber: b.referenceNumber ?? null,
          notes: b.notes ?? null,
          invoiceId: b.invoiceId ? String(b.invoiceId) : null,
          userId: req.user!.id,
        }),
      ),
    );
    if (!result) return;
    await logAccountsAudit({ action: "CREATE", tableName: "Receipt", recordId: result.receipt.id, performedBy: req.user!.id, newValue: { receiptNumber: result.receipt.receiptNumber, amount: result.receipt.amount, tds: Number(b.tdsAmount ?? 0), advance: result.advance } });
    return reply.code(201).send({ success: true, data: { ...result.receipt, advance: result.advance } });
  });

  // POST /api/accounts/receipts/:id/reverse { reason } — bounced cheque, wrong client. Reopens the invoices it paid.
  app.post("/api/accounts/receipts/:id/reverse", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const reason = String(((req.body ?? {}) as { reason?: string }).reason ?? "").trim();
    if (!reason) return reply.code(400).send({ success: false, message: "Say why the receipt is being reversed." });
    const match = await prisma.bankMatch.findFirst({ where: { receiptId: id } });
    if (match) return reply.code(400).send({ success: false, message: "This receipt came from a bank line. Un-match the bank line instead." });
    const done = await guarded(reply, () => prisma.$transaction((tx) => reverseReceipt(tx, id, req.user!.id, reason)));
    if (!done) return;
    await logAccountsAudit({ action: "REVERSE", tableName: "Receipt", recordId: id, performedBy: req.user!.id, newValue: { reason } });
    return reply.send({ success: true });
  });

  // ── Number series ────────────────────────────────────────────────────────────
  // GET /api/accounts/series — each entity's prefix, the next numbers this FY and a sample.
  app.get("/api/accounts/series", { preHandler: [requireAccountsAccess] }, async (_req, reply) => {
    const [entities, series] = await Promise.all([prisma.entity.findMany({ orderBy: { name: "asc" } }), prisma.docSeries.findMany()]);
    const fy = financialYear(new Date());
    return reply.send({
      success: true,
      data: entities.map((e) => {
        const prefix = cleanPrefix((e.bankDetails as Record<string, unknown> | null)?.invoicePrefix, e.name);
        const next = (t: string) => (series.find((s) => s.entityId === e.id && s.docType === t && s.fy === fy)?.lastNumber ?? 0) + 1;
        return {
          entityId: e.id,
          entityName: e.name,
          prefix,
          fy,
          nextInvoice: formatDocNumber(prefix, "INVOICE", fy, next("INVOICE")),
          nextCreditNote: formatDocNumber(prefix, "CREDIT_NOTE", fy, next("CREDIT_NOTE")),
          nextReceipt: formatDocNumber(prefix, "RECEIPT", fy, next("RECEIPT")),
          issuedThisYear: next("INVOICE") - 1,
        };
      }),
    });
  });

  // ── Bank lines & reconciliation ──────────────────────────────────────────────
  const TXN_INCLUDE = {
    entity: { select: { id: true, name: true } },
    client: { select: { id: true, name: true } },
    employee: { select: SAFE_EMPLOYEE_SELECT },
    invoice: { select: { id: true, invoiceNumber: true, totalAmount: true, currency: true, status: true } },
    payroll: { select: { id: true, month: true, year: true, netPayable: true, status: true } },
  } as const;

  app.get("/api/accounts/transactions", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const { entityId, status, type, from, to } = (req.query ?? {}) as Record<string, string | undefined>;
    const where: Record<string, any> = {};
    if (entityId) where.entityId = entityId;
    if (status && status !== "all") where.mappedStatus = status;
    if (type && type !== "all") where.type = type.toUpperCase();
    if (from || to) where.date = { ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}) };
    const rows = await prisma.transaction.findMany({ where, include: TXN_INCLUDE, orderBy: [{ date: "desc" }, { createdAt: "desc" }] });
    const matches = rows.length ? await prisma.bankMatch.findMany({ where: { transactionId: { in: rows.map((r) => r.id) } } }) : [];
    const claimIds = matches.map((m) => m.claimId).filter(Boolean) as string[];
    const receiptIds = matches.map((m) => m.receiptId).filter(Boolean) as string[];
    const [claims, receipts] = await Promise.all([
      claimIds.length ? prisma.reimbursement.findMany({ where: { id: { in: claimIds } }, select: { id: true, claimId: true, category: true, amount: true } }) : [],
      receiptIds.length ? prisma.receipt.findMany({ where: { id: { in: receiptIds } }, select: { id: true, receiptNumber: true } }) : [],
    ]);
    return reply.send({
      success: true,
      data: rows.map((t) => {
        const m = matches.find((x) => x.transactionId === t.id);
        return { ...t, match: m ? { kind: m.kind, receipt: receipts.find((r) => r.id === m.receiptId) ?? null, claim: claims.find((c) => c.id === m.claimId) ?? null, matchedAt: m.matchedAt } : null };
      }),
    });
  });

  // POST /api/accounts/bank-statements/import { entityId, statements[] } — duplicates (same reference, or same date/amount/type/description/balance) are skipped.
  app.post("/api/accounts/bank-statements/import", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const b = (req.body ?? {}) as { entityId?: string; statements?: { bankReference?: string; date?: string; description?: string; type?: string; amount?: number; balance?: number | null }[] };
    if (!b.entityId || !Array.isArray(b.statements) || b.statements.length === 0) return reply.code(400).send({ success: false, message: "Choose the bank's entity and include at least one line." });
    if (b.statements.length > 5000) return reply.code(400).send({ success: false, message: "Import up to 5,000 lines at a time." });
    const entity = await prisma.entity.findUnique({ where: { id: b.entityId } });
    if (!entity) return reply.code(400).send({ success: false, message: "Entity not found." });
    let imported = 0;
    let duplicates = 0;
    const invalid: { line: number; reason: string }[] = [];
    for (const [i, st] of b.statements.entries()) {
      const amount = r2(Math.abs(Number(st.amount ?? 0)));
      const d = st.date ? new Date(`${String(st.date).slice(0, 10)}T00:00:00.000Z`) : null;
      if (!d || Number.isNaN(d.getTime())) { invalid.push({ line: i + 1, reason: "date isn't valid" }); continue; }
      if (!(amount > 0)) { invalid.push({ line: i + 1, reason: "amount is missing" }); continue; }
      if (!st.description?.trim()) { invalid.push({ line: i + 1, reason: "description is missing" }); continue; }
      const type = String(st.type ?? (Number(st.amount) < 0 ? "DEBIT" : "CREDIT")).toUpperCase() === "DEBIT" ? "DEBIT" : "CREDIT";
      const balance = st.balance != null && Number.isFinite(Number(st.balance)) ? r2(Number(st.balance)) : null;
      // No bank reference: a stable fingerprint, so importing the same statement twice doesn't double it.
      const ref = st.bankReference?.trim() || `FP-${crypto.createHash("sha1").update([b.entityId, ymd(d), type, amount, st.description.trim().toUpperCase(), balance ?? ""].join("|")).digest("hex").slice(0, 16).toUpperCase()}`;
      try {
        await prisma.transaction.create({ data: { entityId: b.entityId, bankReference: ref, date: d, description: st.description.trim().slice(0, 500), type, amount, balance, mappedStatus: "UNMAPPED" } });
        imported++;
      } catch (e: any) {
        if (e?.code === "P2002") duplicates++;
        else throw e;
      }
    }
    if (imported) await logAccountsAudit({ action: "IMPORT", tableName: "Transaction", recordId: b.entityId, performedBy: req.user!.id, newValue: { imported, duplicates, invalid: invalid.length } });
    return reply.code(201).send({ success: true, count: imported, skipped: duplicates + invalid.length, duplicates, invalid });
  });

  // POST /api/accounts/bank-statements/auto-match { entityId? } — SUGGESTS matches; nothing is changed until confirmed.
  // A suggestion needs the amount to agree AND something identifying the payer: the invoice number, the client's
  // name, or the employee's name / code / claim reference in the bank narration.
  app.post("/api/accounts/bank-statements/auto-match", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const { entityId } = (req.body ?? {}) as { entityId?: string };
    const lines = await prisma.transaction.findMany({ where: { mappedStatus: "UNMAPPED", ...(entityId ? { entityId } : {}) }, orderBy: { date: "asc" }, take: 1000 });
    const [invoices, payrolls, claims] = await Promise.all([
      prisma.invoice.findMany({ where: { status: { in: OPEN_INVOICE }, currency: "INR", ...(entityId ? { entityId } : {}) }, include: { client: { select: { name: true, alias: true } }, receiptAllocations: true } }),
      prisma.payroll.findMany({ where: { status: "PENDING", ...(entityId ? { entityId } : {}) }, include: { employee: { select: { firstName: true, lastName: true, employeeId: true } } } }),
      prisma.reimbursement.findMany({ where: { status: { in: ["APPROVED", "PENDING_PAYMENT"] } }, include: { employee: { select: { firstName: true, lastName: true, employeeId: true } } } }),
    ]);
    const credits = invoices.length ? await prisma.creditNote.groupBy({ by: ["invoiceId"], where: { invoiceId: { in: invoices.map((i) => i.id) }, status: "ISSUED" }, _sum: { total: true } }) : [];
    const dueOf = (inv: (typeof invoices)[number]) => r2(inv.totalAmount - inv.receiptAllocations.reduce((s, a) => s + a.amountAllocated, 0) - (credits.find((c) => c.invoiceId === inv.id)?._sum.total ?? 0));
    const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const nameIn = (text: string, first: string, last?: string | null) => {
      const t = norm(text);
      const f = norm(first);
      const l = norm(last ?? "");
      return (f.length >= 3 && l.length >= 3 && t.includes(f) && t.includes(l)) || (f.length >= 3 && l.length >= 3 && t.includes(f + l));
    };
    const used = new Set<string>();
    const suggestions: { transactionId: string; kind: "INVOICE" | "PAYROLL" | "CLAIM"; targetId: string; label: string; reason: string; confidence: "high" | "medium" }[] = [];
    for (const t of lines) {
      const text = `${t.description} ${t.bankReference ?? ""}`;
      if (t.type === "CREDIT") {
        const pool = invoices.filter((i) => i.entityId === t.entityId && !used.has(i.id));
        const byNumber = pool.find((i) => norm(text).includes(norm(i.invoiceNumber)) && Math.abs(dueOf(i) - t.amount) < 1);
        const byName = pool.filter((i) => Math.abs(dueOf(i) - t.amount) < 0.01 && (nameIn(text, i.client.name.split(" ")[0] ?? "", i.client.name.split(" ")[1]) || (i.client.alias && norm(i.client.alias).length >= 4 && norm(text).includes(norm(i.client.alias)))));
        const hit = byNumber ?? (byName.length === 1 ? byName[0] : null);
        if (hit) {
          used.add(hit.id);
          suggestions.push({ transactionId: t.id, kind: "INVOICE", targetId: hit.id, label: `${hit.invoiceNumber} · ${hit.client.name}`, reason: byNumber ? "Invoice number and amount match" : "Client name and amount match", confidence: byNumber ? "high" : "medium" });
        }
      } else {
        const p = payrolls.find((x) => x.entityId === t.entityId && !used.has(x.id) && Math.abs(x.netPayable - t.amount) < 0.01 && (nameIn(text, x.employee.firstName, x.employee.lastName) || norm(text).includes(norm(x.employee.employeeId))));
        if (p) {
          used.add(p.id);
          suggestions.push({ transactionId: t.id, kind: "PAYROLL", targetId: p.id, label: `Salary ${String(p.month).padStart(2, "0")}/${p.year} · ${p.employee.firstName} ${p.employee.lastName ?? ""}`.trim(), reason: "Employee and net pay match", confidence: "high" });
          continue;
        }
        const c = claims.find((x) => !used.has(x.id) && Math.abs(Number(x.amount) - t.amount) < 0.01 && (nameIn(text, x.employee.firstName, x.employee.lastName) || norm(text).includes(norm(x.employee.employeeId)) || norm(text).includes(norm(x.claimId))));
        if (c) {
          used.add(c.id);
          suggestions.push({ transactionId: t.id, kind: "CLAIM", targetId: c.id, label: `Claim ${c.claimId} (${c.category}) · ${c.employee.firstName} ${c.employee.lastName ?? ""}`.trim(), reason: "Employee and claim amount match", confidence: "medium" });
        }
      }
    }
    return reply.send({ success: true, matchedCount: 0, suggestions, scanned: lines.length });
  });

  // POST /api/accounts/bank-statements/confirm { matches: [{ transactionId, kind, targetId }] } — applies reviewed suggestions.
  app.post("/api/accounts/bank-statements/confirm", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const { matches } = (req.body ?? {}) as { matches?: { transactionId: string; kind: string; targetId: string }[] };
    if (!Array.isArray(matches) || !matches.length) return reply.code(400).send({ success: false, message: "Nothing to confirm." });
    const results: { transactionId: string; ok: boolean; message?: string }[] = [];
    for (const m of matches.slice(0, 500)) {
      try {
        await prisma.$transaction((tx) => applyMatch(tx, m.transactionId, m.kind, m.targetId, req.user!));
        results.push({ transactionId: m.transactionId, ok: true });
      } catch (e) {
        results.push({ transactionId: m.transactionId, ok: false, message: e instanceof AccountsError ? e.message : "Couldn't apply this match." });
        if (!(e instanceof AccountsError)) req.log.error(e);
      }
    }
    const done = results.filter((r) => r.ok).length;
    if (done) await logAccountsAudit({ action: "RECONCILE", tableName: "Transaction", recordId: "confirm", performedBy: req.user!.id, newValue: { confirmed: done } });
    return reply.send({ success: true, matchedCount: done, results });
  });

  // PUT /api/accounts/transactions/:id/reconcile — manual match { invoiceId | payrollId | claimId | clientId (advance) | employeeId/other }
  // or un-match { mappedStatus: "UNMAPPED" }, which exactly undoes what the match did.
  app.put("/api/accounts/transactions/:id/reconcile", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as { mappedStatus?: string; invoiceId?: string | null; payrollId?: string | null; claimId?: string | null; clientId?: string | null; employeeId?: string | null; reason?: string };
    const u = req.user!;
    const ok = await guarded(reply, () =>
      prisma.$transaction(async (tx) => {
        if (b.mappedStatus === "UNMAPPED") return unmatch(tx, id, u.id, String(b.reason ?? "Un-matched").trim() || "Un-matched");
        if (b.invoiceId) return applyMatch(tx, id, "INVOICE", b.invoiceId, u);
        if (b.payrollId) return applyMatch(tx, id, "PAYROLL", b.payrollId, u);
        if (b.claimId) return applyMatch(tx, id, "CLAIM", b.claimId, u);
        if (b.clientId) return applyMatch(tx, id, "ADVANCE", b.clientId, u);
        return applyMatch(tx, id, "OTHER", b.employeeId ?? "", u);
      }),
    );
    if (!ok) return;
    await logAccountsAudit({ action: b.mappedStatus === "UNMAPPED" ? "UNRECONCILE" : "RECONCILE", tableName: "Transaction", recordId: id, performedBy: u.id, newValue: b });
    const data = await prisma.transaction.findUnique({ where: { id }, include: TXN_INCLUDE });
    return reply.send({ success: true, data });
  });

  app.delete("/api/accounts/transactions/:id", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.transaction.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ success: false, message: "Bank line not found." });
    const gone = await prisma.transaction.deleteMany({ where: { id, mappedStatus: "UNMAPPED" } });
    if (!gone.count) return reply.code(400).send({ success: false, message: "Un-match this bank line before deleting it." });
    await logAccountsAudit({ action: "DELETE", tableName: "Transaction", recordId: id, performedBy: req.user!.id, oldValue: { date: existing.date, amount: existing.amount, description: existing.description } });
    return reply.send({ success: true });
  });

  // ── Ledgers & statements ─────────────────────────────────────────────────────
  // GET /api/accounts/ledgers?entityId&type&clientId&employeeId&from&to — with the opening balance before `from`.
  app.get("/api/accounts/ledgers", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const q = (req.query ?? {}) as Record<string, string | undefined>;
    return reply.send({ success: true, ...(await ledgerView(q)) });
  });
  app.get("/api/accounts/ledgers/client/:clientId", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const q = (req.query ?? {}) as Record<string, string | undefined>;
    return reply.send({ success: true, ...(await ledgerView({ ...q, clientId: (req.params as { clientId: string }).clientId })) });
  });
  app.get("/api/accounts/ledgers/employee/:employeeId", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const q = (req.query ?? {}) as Record<string, string | undefined>;
    return reply.send({ success: true, ...(await ledgerView({ ...q, employeeId: (req.params as { employeeId: string }).employeeId })) });
  });
}

async function ledgerView(q: Record<string, string | undefined>) {
  const base: Record<string, any> = {};
  if (q.entityId) base.entityId = q.entityId;
  if (q.type && q.type !== "all") base.type = q.type.toUpperCase();
  if (q.clientId) base.clientId = q.clientId;
  if (q.employeeId) base.employeeId = q.employeeId;
  const from = q.from ? new Date(`${q.from}T00:00:00.000Z`) : null;
  const to = q.to ? new Date(`${q.to}T23:59:59.999Z`) : null;
  const [before, rows] = await Promise.all([
    from ? prisma.ledger.aggregate({ where: { ...base, date: { lt: from } }, _sum: { debit: true, credit: true } }) : null,
    prisma.ledger.findMany({
      where: { ...base, ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
      include: { entity: { select: { id: true, name: true } }, client: { select: { id: true, name: true } }, employee: { select: SAFE_EMPLOYEE_SELECT } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      take: 20_000,
    }),
  ]);
  const opening = before ? r2((before._sum.debit ?? 0) - (before._sum.credit ?? 0)) : 0;
  let running = opening;
  const data = rows.map((r) => {
    running = r2(running + (r.debit || 0) - (r.credit || 0));
    return { ...r, runningBalance: running };
  });
  const totals = { debit: r2(rows.reduce((s, r) => s + r.debit, 0)), credit: r2(rows.reduce((s, r) => s + r.credit, 0)) };
  return { data, opening, closing: running, totals };
}

// ── Issue / cancel ─────────────────────────────────────────────────────────────
async function issueInvoice(id: string, userId: string, reply: FastifyReply, issueDateRaw?: string) {
  const out = await guarded(reply, () =>
    prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.findUnique({ where: { id }, include: { entity: true, client: true, items: true } });
      if (!inv) throw new AccountsError("Invoice not found.");
      if (inv.status !== "DRAFT") throw new AccountsError("This invoice has already been issued.");
      if (!inv.items.length || inv.totalAmount <= 0) throw new AccountsError("Add at least one line with an amount before issuing.");
      const issueDate = issueDateRaw ? new Date(`${String(issueDateRaw).slice(0, 10)}T00:00:00.000Z`) : new Date(`${ymd(inv.issueDate)}T00:00:00.000Z`);
      if (Number.isNaN(issueDate.getTime())) throw new AccountsError("Issue date isn't valid.");
      if (ymd(issueDate) > todayIst()) throw new AccountsError("An invoice can't be issued with a future date.");
      if ((inv.entity.status ?? "ACTIVE").toUpperCase() !== "ACTIVE") throw new AccountsError("This billing entity is inactive.");
      const pos = placeOfSupply(inv.entity, inv.client);
      if (pos.problem) throw new AccountsError(pos.problem);
      if (pos.supplyType === "NO_GST" && inv.items.some((i) => (i.gstRate ?? 0) > 0)) throw new AccountsError("This entity has no GSTIN, so it can't charge GST. Set the GST rates to 0%.");
      if (pos.supplyType !== "EXPORT" && pos.supplyType !== "NO_GST" && inv.client.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(inv.client.gstin)) throw new AccountsError("The client's GSTIN isn't valid. Fix it on the client first.");
      // Numbers must follow dates within a series: no issuing before the last invoice of this entity in the same year.
      const fy = financialYear(issueDate);
      const last = await tx.invoice.findFirst({ where: { entityId: inv.entityId, status: { notIn: ["DRAFT"] }, id: { not: id } }, orderBy: { issueDate: "desc" }, select: { issueDate: true, invoiceNumber: true } });
      if (last && financialYear(last.issueDate) === fy && ymd(last.issueDate) > ymd(issueDate)) {
        throw new AccountsError(`${last.invoiceNumber} is dated ${ymd(last.issueDate)}. Issue this one on or after that date so numbers stay in date order.`);
      }
      // Re-price with the final place of supply (the client may have changed since the draft was saved).
      const built = buildItems(inv.items, pos.supplyType, inv.currency);
      const number = await nextDocNumber(tx, inv.entityId, "INVOICE", issueDate);
      const claimed = await tx.invoice.updateMany({ where: { id, status: "DRAFT" }, data: { status: "SENT" } });
      if (!claimed.count) throw new AccountsError("This invoice was just issued by someone else.");
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      const updated = await tx.invoice.update({
        where: { id },
        data: { invoiceNumber: number, issueDate, subTotal: built.subTotal, taxAmount: built.taxAmount, totalAmount: built.totalAmount, items: { create: built.rows } },
      });
      await tx.invoiceMeta.create({ data: { invoiceId: id, placeOfSupply: pos.code, supplyType: pos.supplyType, draftNumber: inv.invoiceNumber, issuedAt: new Date(), issuedById: userId } });
      await postLedger(tx, { entityId: inv.entityId, type: "CLIENT", clientId: inv.clientId, date: issueDate, description: `Invoice ${number}`, debit: built.totalAmount * (inv.exchangeRate || 1), referenceId: id, referenceType: "INVOICE" });
      // Money received in advance is applied now that there is something to apply it to.
      await applyAdvances(tx, inv.clientId, inv.entityId, inv.currency);
      return updated;
    }),
  );
  if (!out) return;
  await logAccountsAudit({ action: "ISSUE", tableName: "Invoice", recordId: id, performedBy: userId, newValue: { invoiceNumber: out.invoiceNumber, totalAmount: out.totalAmount } });
  const full = await prisma.invoice.findUnique({ where: { id }, include: INVOICE_INCLUDE });
  return reply.send({ success: true, data: (await decorateInvoices([full!]))[0] });
}

async function cancelInvoice(id: string, userId: string, reason: string, reply: FastifyReply) {
  if (!reason.trim()) return reply.code(400).send({ success: false, message: "Give a reason for cancelling." });
  const out = await guarded(reply, () =>
    prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.findUnique({ where: { id } });
      if (!inv) throw new AccountsError("Invoice not found.");
      if (inv.status === "DRAFT") throw new AccountsError("Drafts aren't cancelled — delete the draft instead.");
      if (inv.status === "CANCELLED") throw new AccountsError("Already cancelled.");
      const bal = await invoiceBalance(tx, id);
      if (bal.paid > 0) throw new AccountsError("Money has been received against this invoice. Reverse the receipt first, or raise a credit note.");
      if (bal.credited > 0) throw new AccountsError("A credit note exists on this invoice; raise a credit note for the rest instead of cancelling.");
      const claimed = await tx.invoice.updateMany({ where: { id, status: { in: OPEN_INVOICE } }, data: { status: "CANCELLED" } });
      if (!claimed.count) throw new AccountsError("This invoice can't be cancelled now.");
      await tx.invoiceMeta.updateMany({ where: { invoiceId: id }, data: { cancelledAt: new Date(), cancelledById: userId, cancelReason: reason.trim().slice(0, 300) } });
      // The number stays used (GST needs the series intact); the ledger debit is reversed.
      await postLedger(tx, { entityId: inv.entityId, type: "CLIENT", clientId: inv.clientId, date: new Date(), description: `Invoice ${inv.invoiceNumber} cancelled: ${reason.trim()}`, credit: inv.totalAmount * (inv.exchangeRate || 1), referenceId: id, referenceType: "INVOICE_CANCEL" });
      return inv;
    }),
  );
  if (!out) return;
  await logAccountsAudit({ action: "CANCEL", tableName: "Invoice", recordId: id, performedBy: userId, newValue: { invoiceNumber: out.invoiceNumber, reason } });
  return reply.send({ success: true });
}

/** Applies a client's unapplied receipt money (advances) to its open invoices, oldest first. */
async function applyAdvances(tx: any, clientId: string, entityId: string, currency: string) {
  const receipts = await tx.receipt.findMany({ where: { clientId, entityId, currency }, include: { allocations: true }, orderBy: { receiptDate: "asc" } });
  if (!receipts.length) return;
  const extras = await tx.receiptExtra.findMany({ where: { receiptId: { in: receipts.map((r: any) => r.id) } } });
  const open = await tx.invoice.findMany({ where: { clientId, entityId, currency, status: { in: OPEN_INVOICE } }, orderBy: [{ issueDate: "asc" }, { createdAt: "asc" }], select: { id: true } });
  for (const r of receipts) {
    const x = extras.find((e: any) => e.receiptId === r.id);
    if (x?.reversedAt) continue;
    let left = r2(r.amount + (x?.tdsAmount ?? 0) - r.allocations.reduce((s: number, a: any) => s + a.amountAllocated, 0));
    for (const inv of open) {
      if (left <= 0.005) break;
      const { due } = await invoiceBalance(tx, inv.id);
      if (due <= 0) continue;
      const applied = r2(Math.min(left, due));
      await tx.receiptAllocation.create({ data: { receiptId: r.id, invoiceId: inv.id, amountAllocated: applied } });
      await refreshInvoiceStatus(tx, inv.id);
      left = r2(left - applied);
    }
  }
}

// ── Matching bank lines ────────────────────────────────────────────────────────
async function applyMatch(tx: any, transactionId: string, kind: string, targetId: string, u: { id: string; role: string }) {
  const t = await tx.transaction.findUnique({ where: { id: transactionId } });
  if (!t) throw new AccountsError("Bank line not found.");
  if (t.mappedStatus !== "UNMAPPED") throw new AccountsError("This bank line is already matched.");
  const claim = await tx.transaction.updateMany({ where: { id: transactionId, mappedStatus: "UNMAPPED" }, data: { mappedStatus: "RECONCILED" } });
  if (!claim.count) throw new AccountsError("This bank line was just matched by someone else.");

  if (kind === "INVOICE" || kind === "ADVANCE") {
    if (t.type !== "CREDIT") throw new AccountsError("Only money received (credits) can be matched to a client.");
    let clientId = targetId;
    let invoiceId: string | null = null;
    if (kind === "INVOICE") {
      const inv = await tx.invoice.findUnique({ where: { id: targetId } });
      if (!inv) throw new AccountsError("Invoice not found.");
      if (inv.entityId !== t.entityId) throw new AccountsError("That invoice belongs to a different entity than this bank account.");
      if (inv.currency !== "INR") throw new AccountsError(`That invoice is in ${inv.currency}. Record the receipt manually with the exchange rate.`);
      if (!OPEN_INVOICE.includes(inv.status)) throw new AccountsError("That invoice isn't open for payment.");
      clientId = inv.clientId;
      invoiceId = inv.id;
    }
    const { receipt } = await createReceipt(tx, { clientId, entityId: t.entityId, amount: t.amount, currency: "INR", exchangeRate: 1, receiptDate: t.date, paymentMode: "Bank Transfer", referenceNumber: t.bankReference, notes: `Bank: ${t.description}`, invoiceId, userId: u.id });
    await tx.transaction.update({ where: { id: transactionId }, data: { clientId, invoiceId } });
    await tx.bankMatch.create({ data: { transactionId, kind: "RECEIPT", receiptId: receipt.id, matchedById: u.id } });
    return true;
  }
  if (kind === "PAYROLL") {
    if (t.type !== "DEBIT") throw new AccountsError("Salary payments are money going out (debits).");
    const p = await tx.payroll.findUnique({ where: { id: targetId } });
    if (!p) throw new AccountsError("Payroll entry not found.");
    if (p.entityId !== t.entityId) throw new AccountsError("That salary belongs to a different entity.");
    if (Math.abs(p.netPayable - t.amount) > 1) throw new AccountsError(`Net pay is ${p.netPayable}, but the bank line is ${t.amount}.`);
    const paid = await tx.payroll.updateMany({ where: { id: p.id, status: "PENDING" }, data: { status: "PAID", paymentDate: t.date } });
    if (!paid.count) throw new AccountsError("That salary is already marked paid.");
    await postLedger(tx, { entityId: p.entityId, type: "EMPLOYEE", employeeId: p.employeeId, date: t.date, description: `Salary disbursed (${String(p.month).padStart(2, "0")}/${p.year}) — bank`, credit: p.netPayable, referenceId: p.id, referenceType: "PAYROLL_PAYMENT" });
    await tx.transaction.update({ where: { id: transactionId }, data: { payrollId: p.id, employeeId: p.employeeId } });
    await tx.bankMatch.create({ data: { transactionId, kind: "PAYROLL", payrollId: p.id, matchedById: u.id } });
    return true;
  }
  if (kind === "CLAIM") {
    if (t.type !== "DEBIT") throw new AccountsError("Claim payments are money going out (debits).");
    const c = await tx.reimbursement.findUnique({ where: { id: targetId } });
    if (!c) throw new AccountsError("Claim not found.");
    if (Math.abs(Number(c.amount) - t.amount) > 1) throw new AccountsError(`The claim is for ${c.amount}, but the bank line is ${t.amount}.`);
    if (c.employeeId === u.id && !["admin", "owner"].includes(normRole(u.role))) throw new AccountsError("Someone else in Finance must record payment of your own claim.");
    const paid = await tx.reimbursement.updateMany({
      where: { id: c.id, status: { in: ["APPROVED", "PENDING_PAYMENT"] } },
      data: { status: "PAID", paidAt: t.date, paymentDate: t.date, paymentStatus: "Paid", paymentMode: "Bank Transfer", utrNumber: t.bankReference ?? undefined },
    });
    if (!paid.count) throw new AccountsError("That claim isn't waiting for payment.");
    await tx.transaction.update({ where: { id: transactionId }, data: { employeeId: c.employeeId } });
    await tx.bankMatch.create({ data: { transactionId, kind: "CLAIM", claimId: c.id, matchedById: u.id } });
    return true;
  }
  // OTHER: bank charges, interest, transfers — marked reconciled with an optional employee, nothing else changes.
  if (targetId) await tx.transaction.update({ where: { id: transactionId }, data: { employeeId: targetId } });
  await tx.bankMatch.create({ data: { transactionId, kind: "OTHER", matchedById: u.id } });
  return true;
}

/** Undoes exactly what applyMatch did. */
async function unmatch(tx: any, transactionId: string, userId: string, reason: string) {
  const t = await tx.transaction.findUnique({ where: { id: transactionId } });
  if (!t) throw new AccountsError("Bank line not found.");
  if (t.mappedStatus !== "RECONCILED") throw new AccountsError("This bank line isn't matched.");
  const m = await tx.bankMatch.findUnique({ where: { transactionId } });
  if (m?.receiptId) await reverseReceipt(tx, m.receiptId, userId, `Bank line un-matched: ${reason}`);
  if (m?.payrollId) {
    const p = await tx.payroll.findUnique({ where: { id: m.payrollId } });
    await tx.payroll.update({ where: { id: m.payrollId }, data: { status: "PENDING", paymentDate: null } });
    if (p) await postLedger(tx, { entityId: p.entityId, type: "EMPLOYEE", employeeId: p.employeeId, date: new Date(), description: `Salary payment reversed (${String(p.month).padStart(2, "0")}/${p.year}): ${reason}`, debit: p.netPayable, referenceId: p.id, referenceType: "PAYROLL_PAYMENT_REVERSAL" });
  }
  if (m?.claimId) {
    await tx.reimbursement.updateMany({ where: { id: m.claimId, status: "PAID" }, data: { status: "APPROVED", paidAt: null, paymentDate: null, paymentStatus: null, utrNumber: null } });
    await tx.reimbursementLog.create({ data: { reimbursementId: m.claimId, action: "PAYMENT_REVERSED", status: "APPROVED", performedById: userId, remarks: `Bank line un-matched: ${reason}` } }).catch(() => undefined);
  }
  if (!m && (t.invoiceId || t.payrollId)) {
    // Matched before this version (no record of what was created) — refuse rather than guess.
    throw new AccountsError("This line was matched by the old portal. Reverse its receipt or payroll payment by hand, then un-match.");
  }
  if (m) await tx.bankMatch.delete({ where: { transactionId } });
  await tx.transaction.update({ where: { id: transactionId }, data: { mappedStatus: "UNMAPPED", invoiceId: null, payrollId: null, clientId: null, employeeId: null } });
  return true;
}
