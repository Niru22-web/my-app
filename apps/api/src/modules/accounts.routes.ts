import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma, SAFE_EMPLOYEE_SELECT } from "../config/db";
import { ACCOUNTS_ROLES, authenticate, normRole } from "../plugins/auth";

async function requireAccountsAccess(req: FastifyRequest, reply: FastifyReply) {
  await authenticate(req, reply);
  if (reply.sent || !req.user) return;
  const role = normRole(req.user.role);
  if (["admin", "owner"].includes(role) || ACCOUNTS_ROLES.has(role) || req.user.hasAccountsAccess) {
    return;
  }
  return reply.code(403).send({
    success: false,
    message: "Accounts & Finance access is required.",
  });
}

async function nextInvoiceNumber(prefix = "INV"): Promise<string> {
  const rows = await prisma.invoice.findMany({ select: { invoiceNumber: true } });
  let max = 0;
  for (const r of rows) {
    const m = r.invoiceNumber.match(/(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  return `${prefix}-${new Date().getFullYear()}-${String(max + 1).padStart(4, "0")}`;
}

async function nextReceiptNumber(): Promise<string> {
  const rows = await prisma.receipt.findMany({ select: { receiptNumber: true } });
  let max = 0;
  for (const r of rows) {
    const m = r.receiptNumber.match(/(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  return `RCP-${new Date().getFullYear()}-${String(max + 1).padStart(4, "0")}`;
}

/**
 * Parameterized audit logger using Prisma ORM — eliminates SQL injection (fixes S6, AC1, AD8).
 */
export async function logAccountsAudit(params: {
  action: string;
  tableName: string;
  recordId: string;
  performedBy: string;
  oldValue?: Record<string, any> | null;
  newValue?: Record<string, any> | null;
}) {
  try {
    await prisma.auditTrail.create({
      data: {
        action: params.action,
        tableName: params.tableName,
        recordId: params.recordId,
        performedBy: params.performedBy,
        oldValue: params.oldValue ?? undefined,
        newValue: params.newValue ?? undefined,
      },
    });
  } catch {
    // Non-fatal if audit table write fails
  }
}

const INVOICE_INCLUDE = {
  client: true,
  project: true,
  entity: true,
  items: true,
  receiptAllocations: {
    include: {
      receipt: { select: { id: true, receiptNumber: true, receiptDate: true } },
    },
  },
} as const;

export async function accountsRoutes(app: FastifyInstance) {
  // ── 1. Audit Log (fixes S6, AC1, AD8 SQL injection) ────────────────────────
  app.get("/api/accounts/audit-log", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const q = (req.query ?? {}) as {
      page?: string;
      limit?: string;
      action?: string;
      portal?: string;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
    };

    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 50));
    const where: Record<string, any> = {};

    if (q.action && q.action !== "all") {
      where.action = { equals: q.action.trim(), mode: "insensitive" };
    }
    if (q.portal && q.portal !== "all") {
      where.tableName = { equals: q.portal.trim(), mode: "insensitive" };
    }
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [
        { tableName: { contains: s, mode: "insensitive" } },
        { recordId: { contains: s, mode: "insensitive" } },
        { performedBy: { contains: s, mode: "insensitive" } },
      ];
    }
    if (q.dateFrom || q.dateTo) {
      where.timestamp = {};
      if (q.dateFrom) {
        const d = new Date(q.dateFrom);
        if (!Number.isNaN(d.getTime())) where.timestamp.gte = d;
      }
      if (q.dateTo) {
        const d = new Date(q.dateTo);
        if (!Number.isNaN(d.getTime())) {
          d.setDate(d.getDate() + 1);
          where.timestamp.lte = d;
        }
      }
    }

    const [rows, total] = await Promise.all([
      prisma.auditTrail.findMany({
        where,
        orderBy: { timestamp: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditTrail.count({ where }),
    ]);

    const performerIds = [...new Set(rows.map((r) => r.performedBy).filter(Boolean))];
    const empMap = new Map<string, string>();
    if (performerIds.length > 0) {
      const emps = await prisma.employee.findMany({
        where: { id: { in: performerIds } },
        select: { id: true, firstName: true, lastName: true, officeEmail: true },
      });
      for (const e of emps) {
        empMap.set(e.id, `${e.firstName} ${e.lastName ?? ""}`.trim() || e.officeEmail);
      }
    }

    const data = rows.map((log) => ({
      id: log.id,
      portal: log.tableName,
      tableName: log.tableName,
      action: log.action,
      recordId: log.recordId,
      performedBy: log.performedBy,
      performerName: empMap.get(log.performedBy) ?? log.performedBy ?? "System",
      oldValue: log.oldValue,
      newValue: log.newValue,
      timestamp: log.timestamp,
    }));

    return reply.send({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  });

  // ── 2. Invoices ────────────────────────────────────────────────────────────
  app.get("/api/accounts/invoices", { preHandler: [requireAccountsAccess] }, async (_req, reply) => {
    const invoices = await prisma.invoice.findMany({
      include: INVOICE_INCLUDE,
      orderBy: { issueDate: "desc" },
    });
    return reply.send({ success: true, data: invoices });
  });

  app.get("/api/accounts/invoices/:id", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const inv = await prisma.invoice.findUnique({
      where: { id },
      include: INVOICE_INCLUDE,
    });
    if (!inv) return reply.code(404).send({ success: false, message: "Invoice not found." });
    return reply.send({ success: true, data: inv });
  });

  // POST /api/accounts/invoices — honors issueDate and local/IGST split (fixes AC10, AC16)
  app.post("/api/accounts/invoices", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, any>;
    if (!b.entityId || !b.clientId || !Array.isArray(b.items) || b.items.length === 0) {
      return reply.code(400).send({
        success: false,
        message: "entityId, clientId, and at least one line item are required.",
      });
    }

    const [entity, client] = await Promise.all([
      prisma.entity.findUnique({ where: { id: String(b.entityId) } }),
      prisma.client.findUnique({ where: { id: String(b.clientId) } }),
    ]);
    const prefix = (entity?.bankDetails as any)?.invoicePrefix || "INV";
    const invoiceNumber = b.invoiceNumber ? String(b.invoiceNumber).trim() : await nextInvoiceNumber(prefix);

    const entityStateCode = entity?.gstin?.trim().slice(0, 2) || "27";
    const clientStateCode = client?.gstin?.trim().slice(0, 2) || "";
    const isIntraState = clientStateCode ? clientStateCode === entityStateCode : true;

    let subTotal = 0;
    let taxAmount = 0;
    const itemsData = b.items.map((it: any) => {
      const qty = Number(it.quantity ?? 1);
      const unitPrice = Number(it.unitPrice ?? 0);
      const gstRate = Number(it.gstRate ?? 0);
      const lineSub = Math.round(qty * unitPrice * 100) / 100;
      const gstAmt = Math.round(((lineSub * gstRate) / 100) * 100) / 100;
      subTotal += lineSub;
      taxAmount += gstAmt;
      return {
        description: String(it.description ?? "").trim(),
        sacCode: it.sacCode ? String(it.sacCode).trim() : null,
        quantity: qty,
        unitPrice,
        total: Math.round((lineSub + gstAmt) * 100) / 100,
        gstRate,
        cgst: isIntraState ? Math.round((gstAmt / 2) * 100) / 100 : 0,
        sgst: isIntraState ? Math.round((gstAmt / 2) * 100) / 100 : 0,
        igst: isIntraState ? 0 : gstAmt,
        gstAmount: gstAmt,
        currency: String(b.currency ?? "INR"),
      };
    });

    const totalAmount = Math.round((subTotal + taxAmount) * 100) / 100;
    const created = await prisma.invoice.create({
      data: {
        invoiceNumber,
        entityId: String(b.entityId),
        clientId: String(b.clientId),
        projectId: b.projectId ? String(b.projectId) : null,
        udin: b.udin ? String(b.udin).trim() : null,
        issueDate: b.issueDate ? new Date(b.issueDate) : new Date(),
        dueDate: b.dueDate ? new Date(b.dueDate) : null,
        subTotal: Math.round(subTotal * 100) / 100,
        taxAmount: Math.round(taxAmount * 100) / 100,
        totalAmount,
        status: String(b.status ?? "DRAFT"),
        currency: String(b.currency ?? "INR"),
        exchangeRate: Number(b.exchangeRate ?? 1) || 1,
        items: { create: itemsData },
      },
      include: INVOICE_INCLUDE,
    });

    await logAccountsAudit({
      action: "CREATE",
      tableName: "Invoice",
      recordId: created.id,
      performedBy: req.user!.id,
      newValue: { invoiceNumber: created.invoiceNumber, totalAmount: created.totalAmount },
    });

    return reply.code(201).send({ success: true, data: created });
  });

  // PUT /api/accounts/invoices/:id — blocks cancelling settled invoices (fixes AC10)
  app.put("/api/accounts/invoices/:id", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.invoice.findUnique({
      where: { id },
      include: { receiptAllocations: true, entity: true, client: true },
    });
    if (!existing) return reply.code(404).send({ success: false, message: "Invoice not found." });

    const b = (req.body ?? {}) as Record<string, any>;
    if (b.status === "CANCELLED" && existing.receiptAllocations.length > 0) {
      return reply.code(400).send({
        success: false,
        message: "Cannot cancel an invoice that already has receipt allocations.",
      });
    }

    const data: Record<string, any> = {};
    if (b.clientId !== undefined) data.clientId = String(b.clientId);
    if (b.projectId !== undefined) data.projectId = b.projectId ? String(b.projectId) : null;
    if (b.udin !== undefined) data.udin = b.udin ? String(b.udin).trim() : null;
    if (b.issueDate !== undefined && b.issueDate) data.issueDate = new Date(b.issueDate);
    if (b.dueDate !== undefined) data.dueDate = b.dueDate ? new Date(b.dueDate) : null;
    if (b.status !== undefined) data.status = String(b.status);
    if (b.currency !== undefined) data.currency = String(b.currency);
    if (b.exchangeRate !== undefined) data.exchangeRate = Number(b.exchangeRate) || 1;

    if (Array.isArray(b.items) && existing.status === "DRAFT") {
      const entityStateCode = existing.entity?.gstin?.trim().slice(0, 2) || "27";
      const clientStateCode = existing.client?.gstin?.trim().slice(0, 2) || "";
      const isIntraState = clientStateCode ? clientStateCode === entityStateCode : true;

      let subTotal = 0;
      let taxAmount = 0;
      const itemsData = b.items.map((it: any) => {
        const qty = Number(it.quantity ?? 1);
        const unitPrice = Number(it.unitPrice ?? 0);
        const gstRate = Number(it.gstRate ?? 0);
        const lineSub = Math.round(qty * unitPrice * 100) / 100;
        const gstAmt = Math.round(((lineSub * gstRate) / 100) * 100) / 100;
        subTotal += lineSub;
        taxAmount += gstAmt;
        return {
          description: String(it.description ?? "").trim(),
          sacCode: it.sacCode ? String(it.sacCode).trim() : null,
          quantity: qty,
          unitPrice,
          total: Math.round((lineSub + gstAmt) * 100) / 100,
          gstRate,
          cgst: isIntraState ? Math.round((gstAmt / 2) * 100) / 100 : 0,
          sgst: isIntraState ? Math.round((gstAmt / 2) * 100) / 100 : 0,
          igst: isIntraState ? 0 : gstAmt,
          gstAmount: gstAmt,
          currency: String(b.currency ?? existing.currency),
        };
      });
      data.subTotal = Math.round(subTotal * 100) / 100;
      data.taxAmount = Math.round(taxAmount * 100) / 100;
      data.totalAmount = Math.round((subTotal + taxAmount) * 100) / 100;
      await prisma.invoiceItem.deleteMany({ where: { invoiceId: id } });
      data.items = { create: itemsData };
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data,
      include: INVOICE_INCLUDE,
    });

    await logAccountsAudit({
      action: "UPDATE",
      tableName: "Invoice",
      recordId: id,
      performedBy: req.user!.id,
      newValue: { status: updated.status, totalAmount: updated.totalAmount },
    });

    return reply.send({ success: true, data: updated });
  });

  // DELETE /api/accounts/invoices/:id — only DRAFT invoices
  app.delete("/api/accounts/invoices/:id", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ success: false, message: "Invoice not found." });
    if (existing.status !== "DRAFT") {
      return reply.code(400).send({ success: false, message: "Only draft invoices can be deleted." });
    }
    await prisma.invoice.delete({ where: { id } });
    await logAccountsAudit({
      action: "DELETE",
      tableName: "Invoice",
      recordId: id,
      performedBy: req.user!.id,
      oldValue: { invoiceNumber: existing.invoiceNumber },
    });
    return reply.send({ success: true });
  });

  // ── 3. Receipts (fixes AC6: transactional FIFO allocation, excludes DRAFT & cross-currency) ──
  app.get("/api/accounts/receipts", { preHandler: [requireAccountsAccess] }, async (_req, reply) => {
    const rows = await prisma.receipt.findMany({
      include: {
        client: { select: { id: true, name: true } },
        entity: { select: { id: true, name: true } },
        allocations: true,
      },
      orderBy: { receiptDate: "desc" },
    });
    return reply.send({ success: true, data: rows });
  });

  app.post("/api/accounts/receipts", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const b = (req.body ?? {}) as {
      clientId?: string;
      entityId?: string;
      amount?: number;
      currency?: string;
      exchangeRate?: number;
      receiptDate?: string;
      paymentMode?: string;
      referenceNumber?: string;
      notes?: string;
    };

    const amount = Number(b.amount ?? 0);
    if (!b.clientId || !b.entityId || !Number.isFinite(amount) || amount <= 0 || !b.receiptDate || !b.paymentMode) {
      return reply.code(400).send({
        success: false,
        message: "clientId, entityId, positive amount, receiptDate, and paymentMode are required.",
      });
    }

    const currency = String(b.currency ?? "INR");
    const receiptNumber = await nextReceiptNumber();

    const created = await prisma.$transaction(async (tx) => {
      const receipt = await tx.receipt.create({
        data: {
          receiptNumber,
          clientId: b.clientId!,
          entityId: b.entityId!,
          amount,
          currency,
          exchangeRate: Number(b.exchangeRate ?? 1) || 1,
          receiptDate: new Date(b.receiptDate!),
          paymentMode: b.paymentMode!,
          referenceNumber: b.referenceNumber?.trim() || null,
          notes: b.notes?.trim() || null,
        },
      });

      await tx.ledger.create({
        data: {
          entityId: b.entityId!,
          type: "CLIENT",
          clientId: b.clientId!,
          date: new Date(b.receiptDate!),
          description: `Receipt ${receiptNumber}`,
          debit: 0,
          credit: Math.round(amount * (Number(b.exchangeRate ?? 1) || 1) * 100) / 100,
          balance: -Math.round(amount * (Number(b.exchangeRate ?? 1) || 1) * 100) / 100,
          referenceId: receipt.id,
          referenceType: "RECEIPT",
        },
      });

      // Only allocate against issued (non-DRAFT, non-CANCELLED) invoices of the same client, entity, and currency
      const openInvoices = await tx.invoice.findMany({
        where: {
          clientId: b.clientId!,
          entityId: b.entityId!,
          currency,
          status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
        },
        include: { receiptAllocations: true },
        orderBy: { issueDate: "asc" },
      });

      let left = amount;
      for (const inv of openInvoices) {
        if (left <= 0) break;
        const alreadyAllocated = inv.receiptAllocations.reduce((s, a) => s + Number(a.amountAllocated ?? 0), 0);
        const due = Math.round((inv.totalAmount - alreadyAllocated) * 100) / 100;
        if (due <= 0) continue;

        const applied = Math.round(Math.min(left, due) * 100) / 100;
        await tx.receiptAllocation.create({
          data: {
            receiptId: receipt.id,
            invoiceId: inv.id,
            amountAllocated: applied,
          },
        });

        const settled = applied >= due - 0.005;
        await tx.invoice.update({
          where: { id: inv.id },
          data: { status: settled ? "PAID" : "PARTIALLY_PAID" },
        });
        left = Math.round((left - applied) * 100) / 100;
      }

      return tx.receipt.findUnique({
        where: { id: receipt.id },
        include: {
          client: { select: { id: true, name: true } },
          entity: { select: { id: true, name: true } },
          allocations: true,
        },
      });
    });

    await logAccountsAudit({
      action: "CREATE",
      tableName: "Receipt",
      recordId: created!.id,
      performedBy: req.user!.id,
      newValue: { receiptNumber, amount, currency },
    });

    return reply.code(201).send({ success: true, data: created });
  });

  // ── 4. Billing Entities (fixes AC12: never auto-seeds fake firms) ──────────
  app.get("/api/accounts/entities", { preHandler: [requireAccountsAccess] }, async (_req, reply) => {
    const entities = await prisma.entity.findMany({ orderBy: { name: "asc" } });
    return reply.send({ success: true, data: entities });
  });

  app.post("/api/accounts/entities", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, any>;
    if (!b.name?.trim()) return reply.code(400).send({ success: false, message: "Entity name is required." });
    const created = await prisma.entity.create({
      data: {
        name: String(b.name).trim(),
        legalName: b.legalName || null,
        gstin: b.gstin || null,
        pan: b.pan || null,
        address: b.address || null,
        msmeReg: b.msmeReg || null,
        status: b.status || "ACTIVE",
        bankDetails: b.bankDetails ?? null,
      },
    });
    await logAccountsAudit({
      action: "CREATE",
      tableName: "Entity",
      recordId: created.id,
      performedBy: req.user!.id,
      newValue: { name: created.name, gstin: created.gstin },
    });
    return reply.code(201).send({ success: true, data: created });
  });

  app.put("/api/accounts/entities/:id", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as Record<string, any>;
    const updated = await prisma.entity.update({
      where: { id },
      data: {
        ...(b.name !== undefined ? { name: String(b.name).trim() } : {}),
        ...(b.legalName !== undefined ? { legalName: b.legalName || null } : {}),
        ...(b.gstin !== undefined ? { gstin: b.gstin || null } : {}),
        ...(b.pan !== undefined ? { pan: b.pan || null } : {}),
        ...(b.address !== undefined ? { address: b.address || null } : {}),
        ...(b.msmeReg !== undefined ? { msmeReg: b.msmeReg || null } : {}),
        ...(b.status !== undefined ? { status: b.status } : {}),
        ...(b.bankDetails !== undefined ? { bankDetails: b.bankDetails } : {}),
      },
    });
    await logAccountsAudit({
      action: "UPDATE",
      tableName: "Entity",
      recordId: id,
      performedBy: req.user!.id,
      newValue: { name: updated.name, status: updated.status },
    });
    return reply.send({ success: true, data: updated });
  });

  // ── 5. Bank Transactions & Reconciliation (fixes AC2, AC7, AC13) ───────────
  app.get("/api/accounts/transactions", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const { entityId, status, type } = (req.query ?? {}) as {
      entityId?: string;
      status?: string;
      type?: string;
    };
    const where: Record<string, any> = {};
    if (entityId) where.entityId = entityId;
    if (status && status !== "all") where.mappedStatus = status;
    if (type && type !== "all") where.type = type.toUpperCase();

    const rows = await prisma.transaction.findMany({
      where,
      include: {
        entity: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        employee: { select: SAFE_EMPLOYEE_SELECT },
        invoice: { select: { id: true, invoiceNumber: true, totalAmount: true, currency: true, status: true } },
        payroll: { select: { id: true, month: true, year: true, netPayable: true, status: true } },
      },
      orderBy: { date: "desc" },
    });
    return reply.send({ success: true, data: rows });
  });

  app.post("/api/accounts/bank-statements/import", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const b = (req.body ?? {}) as {
      entityId?: string;
      statements?: {
        bankReference?: string;
        date?: string;
        description?: string;
        type?: string;
        amount?: number;
        balance?: number | null;
      }[];
    };

    if (!b.entityId || !Array.isArray(b.statements) || b.statements.length === 0) {
      return reply.code(400).send({
        success: false,
        message: "entityId and a non-empty statements array are required.",
      });
    }

    const imported = [];
    let skipped = 0;

    for (const stmt of b.statements) {
      const amount = Math.abs(Number(stmt.amount ?? 0));
      if (!Number.isFinite(amount) || amount <= 0 || !stmt.date || !stmt.description?.trim()) {
        skipped++;
        continue;
      }
      const d = new Date(stmt.date);
      if (Number.isNaN(d.getTime())) {
        skipped++;
        continue;
      }
      const ref = stmt.bankReference?.trim() || `TXN-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      const type = String(stmt.type ?? (Number(stmt.amount) < 0 ? "DEBIT" : "CREDIT")).toUpperCase() === "DEBIT" ? "DEBIT" : "CREDIT";

      try {
        const created = await prisma.transaction.create({
          data: {
            entityId: b.entityId,
            bankReference: ref,
            date: d,
            description: stmt.description.trim(),
            type,
            amount: Math.round(amount * 100) / 100,
            balance: stmt.balance != null && Number.isFinite(Number(stmt.balance)) ? Math.round(Number(stmt.balance) * 100) / 100 : null,
            mappedStatus: "UNMAPPED",
          },
        });
        imported.push(created);
      } catch {
        skipped++;
      }
    }

    if (imported.length > 0) {
      await logAccountsAudit({
        action: "IMPORT",
        tableName: "Transaction",
        recordId: b.entityId,
        performedBy: req.user!.id,
        newValue: { importedCount: imported.length, skipped },
      });
    }

    return reply.code(201).send({
      success: true,
      count: imported.length,
      skipped,
      data: imported,
    });
  });

  // POST /api/accounts/bank-statements/auto-match — creates real ReceiptAllocation on invoice match (fixes AC7)
  app.post("/api/accounts/bank-statements/auto-match", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const unmapped = await prisma.transaction.findMany({
      where: { mappedStatus: "UNMAPPED" },
      orderBy: { date: "asc" },
    });

    let matchedCount = 0;

    for (const txn of unmapped) {
      const amount = Math.abs(txn.amount);
      if (txn.type.toUpperCase() === "CREDIT") {
        // Look for an issued INR invoice on the same entity whose remaining balance matches txn.amount
        // or whose invoiceNumber is mentioned in the transaction description/reference
        const candidates = await prisma.invoice.findMany({
          where: {
            entityId: txn.entityId,
            currency: "INR",
            status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
          },
          include: { receiptAllocations: true },
          orderBy: { issueDate: "asc" },
        });

        const text = `${txn.description} ${txn.bankReference ?? ""}`.toUpperCase();
        const match =
          candidates.find((inv) => {
            const due = Math.round((inv.totalAmount - inv.receiptAllocations.reduce((s, a) => s + a.amountAllocated, 0)) * 100) / 100;
            return text.includes(inv.invoiceNumber.toUpperCase()) && Math.abs(due - amount) < 1;
          }) ??
          candidates.find((inv) => {
            const due = Math.round((inv.totalAmount - inv.receiptAllocations.reduce((s, a) => s + a.amountAllocated, 0)) * 100) / 100;
            return Math.abs(due - amount) < 0.01;
          });

        if (match) {
          const receiptNo = await nextReceiptNumber();
          await prisma.$transaction(async (tx) => {
            const receipt = await tx.receipt.create({
              data: {
                receiptNumber: receiptNo,
                clientId: match.clientId,
                entityId: match.entityId,
                amount,
                currency: "INR",
                exchangeRate: 1,
                receiptDate: txn.date,
                paymentMode: "Bank Transfer",
                referenceNumber: txn.bankReference ?? undefined,
                notes: `Auto-reconciled from bank statement: ${txn.description}`,
              },
            });
            await tx.receiptAllocation.create({
              data: {
                receiptId: receipt.id,
                invoiceId: match.id,
                amountAllocated: amount,
              },
            });
            await tx.invoice.update({
              where: { id: match.id },
              data: { status: "PAID" },
            });
            await tx.transaction.update({
              where: { id: txn.id },
              data: {
                mappedStatus: "RECONCILED",
                invoiceId: match.id,
                clientId: match.clientId,
              },
            });
          });
          matchedCount++;
          continue;
        }
      } else {
        // DEBIT: try matching pending payroll first, then approved reimbursement
        const payroll = await prisma.payroll.findFirst({
          where: {
            entityId: txn.entityId,
            status: "PENDING",
            netPayable: { gte: amount - 0.01, lte: amount + 0.01 },
          },
        });
        if (payroll) {
          await prisma.$transaction([
            prisma.payroll.update({
              where: { id: payroll.id },
              data: { status: "PAID", paymentDate: txn.date },
            }),
            prisma.transaction.update({
              where: { id: txn.id },
              data: {
                mappedStatus: "RECONCILED",
                payrollId: payroll.id,
                employeeId: payroll.employeeId,
              },
            }),
          ]);
          matchedCount++;
          continue;
        }

        const reimb = await prisma.reimbursement.findFirst({
          where: {
            status: { in: ["APPROVED", "PENDING_PAYMENT"] },
            amount: { gte: amount - 0.01, lte: amount + 0.01 },
          },
        });
        if (reimb) {
          await prisma.$transaction([
            prisma.reimbursement.update({
              where: { id: reimb.id },
              data: {
                status: "PAID",
                paidAt: txn.date,
                paymentDate: txn.date,
                paymentStatus: "Paid",
                utrNumber: txn.bankReference ?? undefined,
              },
            }),
            prisma.transaction.update({
              where: { id: txn.id },
              data: {
                mappedStatus: "RECONCILED",
                employeeId: reimb.employeeId,
              },
            }),
          ]);
          matchedCount++;
        }
      }
    }

    if (matchedCount > 0) {
      await logAccountsAudit({
        action: "UPDATE",
        tableName: "Transaction",
        recordId: "auto-match",
        performedBy: req.user!.id,
        newValue: { matchedCount },
      });
    }

    return reply.send({ success: true, matchedCount });
  });

  // PUT /api/accounts/transactions/:id/reconcile — manual reconciliation (fixes AC13)
  app.put("/api/accounts/transactions/:id/reconcile", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const txn = await prisma.transaction.findUnique({ where: { id } });
    if (!txn) return reply.code(404).send({ success: false, message: "Transaction not found." });

    const b = (req.body ?? {}) as {
      mappedStatus?: "RECONCILED" | "UNMAPPED";
      invoiceId?: string | null;
      payrollId?: string | null;
      clientId?: string | null;
      employeeId?: string | null;
    };

    const nextStatus = b.mappedStatus ?? "RECONCILED";

    if (nextStatus === "UNMAPPED") {
      const updated = await prisma.transaction.update({
        where: { id },
        data: {
          mappedStatus: "UNMAPPED",
          invoiceId: null,
          payrollId: null,
          clientId: null,
          employeeId: null,
        },
      });
      return reply.send({ success: true, data: updated });
    }

    const updated = await prisma.$transaction(async (tx) => {
      let resolvedClientId = b.clientId || null;
      let resolvedEmployeeId = b.employeeId || null;

      if (b.invoiceId) {
        const inv = await tx.invoice.findUnique({
          where: { id: b.invoiceId },
          include: { receiptAllocations: true },
        });
        if (!inv) throw new Error("Selected invoice not found.");
        resolvedClientId = inv.clientId;

        const alreadyAllocated = inv.receiptAllocations.reduce((s, a) => s + a.amountAllocated, 0);
        const due = Math.max(0, Math.round((inv.totalAmount - alreadyAllocated) * 100) / 100);
        const applied = Math.min(Math.abs(txn.amount), due || Math.abs(txn.amount));

        if (due > 0) {
          const receiptNo = await nextReceiptNumber();
          const receipt = await tx.receipt.create({
            data: {
              receiptNumber: receiptNo,
              clientId: inv.clientId,
              entityId: inv.entityId,
              amount: applied,
              currency: inv.currency,
              exchangeRate: inv.exchangeRate,
              receiptDate: txn.date,
              paymentMode: "Bank Transfer",
              referenceNumber: txn.bankReference ?? undefined,
              notes: `Reconciled with bank transaction: ${txn.description}`,
            },
          });
          await tx.receiptAllocation.create({
            data: {
              receiptId: receipt.id,
              invoiceId: inv.id,
              amountAllocated: applied,
            },
          });
          await tx.invoice.update({
            where: { id: inv.id },
            data: { status: applied >= due - 0.005 ? "PAID" : "PARTIALLY_PAID" },
          });
        }
      }

      if (b.payrollId) {
        const pay = await tx.payroll.findUnique({ where: { id: b.payrollId } });
        if (pay) {
          resolvedEmployeeId = pay.employeeId;
          await tx.payroll.update({
            where: { id: pay.id },
            data: { status: "PAID", paymentDate: txn.date },
          });
        }
      }

      return tx.transaction.update({
        where: { id },
        data: {
          mappedStatus: "RECONCILED",
          invoiceId: b.invoiceId || null,
          payrollId: b.payrollId || null,
          clientId: resolvedClientId,
          employeeId: resolvedEmployeeId,
        },
        include: {
          entity: { select: { id: true, name: true } },
          client: { select: { id: true, name: true } },
          employee: { select: SAFE_EMPLOYEE_SELECT },
          invoice: { select: { id: true, invoiceNumber: true, totalAmount: true, currency: true, status: true } },
          payroll: { select: { id: true, month: true, year: true, netPayable: true, status: true } },
        },
      });
    });

    await logAccountsAudit({
      action: "UPDATE",
      tableName: "Transaction",
      recordId: id,
      performedBy: req.user!.id,
      newValue: { mappedStatus: updated.mappedStatus, invoiceId: updated.invoiceId, payrollId: updated.payrollId },
    });

    return reply.send({ success: true, data: updated });
  });

  app.delete("/api/accounts/transactions/:id", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.transaction.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ success: false, message: "Transaction not found." });
    if (existing.mappedStatus === "RECONCILED") {
      return reply.code(400).send({
        success: false,
        message: "Unlink the reconciled transaction before deleting it.",
      });
    }
    await prisma.transaction.delete({ where: { id } });
    return reply.send({ success: true });
  });

  // ── 6. Payroll & Payables ──────────────────────────────────────────────────
  app.get("/api/accounts/payroll", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const { month, year, entityId, status } = (req.query ?? {}) as {
      month?: string;
      year?: string;
      entityId?: string;
      status?: string;
    };
    const where: Record<string, any> = {};
    if (month) where.month = Number(month);
    if (year) where.year = Number(year);
    if (entityId) where.entityId = entityId;
    if (status && status !== "all") where.status = status;

    const rows = await prisma.payroll.findMany({
      where,
      include: {
        entity: { select: { id: true, name: true } },
        employee: { select: SAFE_EMPLOYEE_SELECT },
      },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });
    return reply.send({ success: true, data: rows });
  });

  app.post("/api/accounts/payroll", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const b = (req.body ?? {}) as {
      employeeId?: string;
      entityId?: string;
      month?: number;
      year?: number;
      basicSalary?: number;
      allowances?: number;
      deductions?: number;
    };

    const month = Number(b.month ?? 0);
    const year = Number(b.year ?? 0);
    const basicSalary = Number(b.basicSalary ?? 0);
    const allowances = Number(b.allowances ?? 0);
    const deductions = Number(b.deductions ?? 0);

    if (!b.employeeId || !b.entityId || month < 1 || month > 12 || year < 2000 || basicSalary <= 0) {
      return reply.code(400).send({
        success: false,
        message: "employeeId, entityId, valid month/year, and positive basicSalary are required.",
      });
    }

    const netPayable = Math.max(0, Math.round((basicSalary + allowances - deductions) * 100) / 100);

    const created = await prisma.$transaction(async (tx) => {
      const p = await tx.payroll.create({
        data: {
          employeeId: b.employeeId!,
          entityId: b.entityId!,
          month,
          year,
          basicSalary: Math.round(basicSalary * 100) / 100,
          allowances: Math.round(allowances * 100) / 100,
          deductions: Math.round(deductions * 100) / 100,
          netPayable,
          status: "PENDING",
        },
        include: {
          entity: { select: { id: true, name: true } },
          employee: { select: SAFE_EMPLOYEE_SELECT },
        },
      });

      await tx.ledger.create({
        data: {
          entityId: b.entityId!,
          type: "EMPLOYEE",
          employeeId: b.employeeId!,
          date: new Date(Date.UTC(year, month - 1, 28)),
          description: `Payroll accrual (${String(month).padStart(2, "0")}/${year})`,
          debit: netPayable,
          credit: 0,
          balance: netPayable,
          referenceId: p.id,
          referenceType: "PAYROLL",
        },
      });

      return p;
    });

    await logAccountsAudit({
      action: "CREATE",
      tableName: "Payroll",
      recordId: created.id,
      performedBy: req.user!.id,
      newValue: { employeeId: created.employeeId, month, year, netPayable },
    });

    return reply.code(201).send({ success: true, data: created });
  });

  app.patch("/api/accounts/payroll/:id/pay", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { paymentDate } = (req.body ?? {}) as { paymentDate?: string };
    const existing = await prisma.payroll.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ success: false, message: "Payroll entry not found." });
    if (existing.status === "PAID") {
      return reply.code(400).send({ success: false, message: "Payroll entry is already marked paid." });
    }

    const paidDate = paymentDate ? new Date(paymentDate) : new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const p = await tx.payroll.update({
        where: { id },
        data: { status: "PAID", paymentDate: paidDate },
        include: {
          entity: { select: { id: true, name: true } },
          employee: { select: SAFE_EMPLOYEE_SELECT },
        },
      });

      await tx.ledger.create({
        data: {
          entityId: existing.entityId,
          type: "EMPLOYEE",
          employeeId: existing.employeeId,
          date: paidDate,
          description: `Salary disbursed (${String(existing.month).padStart(2, "0")}/${existing.year})`,
          debit: 0,
          credit: existing.netPayable,
          balance: -existing.netPayable,
          referenceId: existing.id,
          referenceType: "PAYROLL_PAYMENT",
        },
      });

      return p;
    });

    await logAccountsAudit({
      action: "UPDATE",
      tableName: "Payroll",
      recordId: id,
      performedBy: req.user!.id,
      newValue: { status: "PAID", paymentDate: paidDate.toISOString() },
    });

    return reply.send({ success: true, data: updated });
  });

  app.delete("/api/accounts/payroll/:id", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.payroll.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ success: false, message: "Payroll entry not found." });
    if (existing.status === "PAID") {
      return reply.code(400).send({ success: false, message: "Paid payroll entries cannot be deleted." });
    }
    await prisma.$transaction([
      prisma.ledger.deleteMany({ where: { referenceId: id, referenceType: "PAYROLL" } }),
      prisma.payroll.delete({ where: { id } }),
    ]);
    return reply.send({ success: true });
  });

  // ── 7. Ledgers (Client, Employee & General Ledger) ─────────────────────────
  app.get("/api/accounts/ledgers", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const { entityId, type, clientId, employeeId, from, to } = (req.query ?? {}) as {
      entityId?: string;
      type?: string;
      clientId?: string;
      employeeId?: string;
      from?: string;
      to?: string;
    };

    const where: Record<string, any> = {};
    if (entityId) where.entityId = entityId;
    if (type && type !== "all") where.type = type.toUpperCase();
    if (clientId) where.clientId = clientId;
    if (employeeId) where.employeeId = employeeId;
    if (from || to) {
      where.date = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
      };
    }

    const rows = await prisma.ledger.findMany({
      where,
      include: {
        entity: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        employee: { select: SAFE_EMPLOYEE_SELECT },
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });

    let runningBalance = 0;
    const data = rows.map((r) => {
      runningBalance = Math.round((runningBalance + (r.debit || 0) - (r.credit || 0)) * 100) / 100;
      return { ...r, runningBalance };
    });

    return reply.send({ success: true, data });
  });

  app.get("/api/accounts/ledgers/employee/:employeeId", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const { employeeId } = req.params as { employeeId: string };
    const rows = await prisma.ledger.findMany({
      where: { employeeId },
      include: { entity: { select: { id: true, name: true } } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });
    let runningBalance = 0;
    const data = rows.map((r) => {
      runningBalance = Math.round((runningBalance + (r.debit || 0) - (r.credit || 0)) * 100) / 100;
      return { ...r, runningBalance };
    });
    return reply.send({ success: true, data });
  });

  app.get("/api/accounts/ledgers/client/:clientId", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const { clientId } = req.params as { clientId: string };
    const rows = await prisma.ledger.findMany({
      where: { clientId },
      include: { entity: { select: { id: true, name: true } } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });
    let runningBalance = 0;
    const data = rows.map((r) => {
      runningBalance = Math.round((runningBalance + (r.debit || 0) - (r.credit || 0)) * 100) / 100;
      return { ...r, runningBalance };
    });
    return reply.send({ success: true, data });
  });

  app.post("/api/accounts/ledgers", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const b = (req.body ?? {}) as {
      entityId?: string;
      type?: string;
      clientId?: string | null;
      employeeId?: string | null;
      date?: string;
      description?: string;
      debit?: number;
      credit?: number;
    };

    const debit = Math.max(0, Number(b.debit ?? 0));
    const credit = Math.max(0, Number(b.credit ?? 0));
    if (!b.entityId || !b.description?.trim() || (debit === 0 && credit === 0)) {
      return reply.code(400).send({
        success: false,
        message: "entityId, description, and a non-zero debit or credit are required.",
      });
    }

    const created = await prisma.ledger.create({
      data: {
        entityId: b.entityId,
        type: (b.type || (b.clientId ? "CLIENT" : b.employeeId ? "EMPLOYEE" : "GENERAL")).toUpperCase(),
        clientId: b.clientId || null,
        employeeId: b.employeeId || null,
        date: b.date ? new Date(b.date) : new Date(),
        description: b.description.trim(),
        debit: Math.round(debit * 100) / 100,
        credit: Math.round(credit * 100) / 100,
        balance: Math.round((debit - credit) * 100) / 100,
        referenceType: "JOURNAL",
      },
      include: {
        entity: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        employee: { select: SAFE_EMPLOYEE_SELECT },
      },
    });

    await logAccountsAudit({
      action: "CREATE",
      tableName: "Ledger",
      recordId: created.id,
      performedBy: req.user!.id,
      newValue: { description: created.description, debit: created.debit, credit: created.credit },
    });

    return reply.code(201).send({ success: true, data: created });
  });

  // ── 8. Tax & GST Configuration ─────────────────────────────────────────────
  app.get("/api/accounts/taxes", { preHandler: [requireAccountsAccess] }, async (_req, reply) => {
    const rows = await prisma.taxConfiguration.findMany({ orderBy: [{ type: "asc" }, { rate: "asc" }] });
    return reply.send({ success: true, data: rows });
  });

  app.post("/api/accounts/taxes", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const b = (req.body ?? {}) as { name?: string; type?: string; rate?: number; isActive?: boolean };
    if (!b.name?.trim() || !b.type?.trim() || !Number.isFinite(Number(b.rate))) {
      return reply.code(400).send({ success: false, message: "name, type, and rate are required." });
    }
    const created = await prisma.taxConfiguration.create({
      data: {
        name: b.name.trim(),
        type: b.type.trim().toUpperCase(),
        rate: Number(b.rate),
        isActive: b.isActive !== undefined ? Boolean(b.isActive) : true,
      },
    });
    await logAccountsAudit({
      action: "CREATE",
      tableName: "TaxConfiguration",
      recordId: created.id,
      performedBy: req.user!.id,
      newValue: created,
    });
    return reply.code(201).send({ success: true, data: created });
  });

  app.put("/api/accounts/taxes/:id", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as { name?: string; type?: string; rate?: number; isActive?: boolean };
    const updated = await prisma.taxConfiguration.update({
      where: { id },
      data: {
        ...(b.name !== undefined ? { name: b.name.trim() } : {}),
        ...(b.type !== undefined ? { type: b.type.trim().toUpperCase() } : {}),
        ...(b.rate !== undefined ? { rate: Number(b.rate) } : {}),
        ...(b.isActive !== undefined ? { isActive: Boolean(b.isActive) } : {}),
      },
    });
    return reply.send({ success: true, data: updated });
  });

  app.delete("/api/accounts/taxes/:id", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await prisma.taxConfiguration.delete({ where: { id } });
    return reply.send({ success: true });
  });

  // ── 9. Currencies & Exchange Rates ─────────────────────────────────────────
  app.get("/api/accounts/currencies", { preHandler: [requireAccountsAccess] }, async (_req, reply) => {
    const currencies = await prisma.currency.findMany({
      include: {
        exchangeRates: {
          orderBy: { date: "desc" },
          take: 25,
        },
      },
      orderBy: { code: "asc" },
    });
    return reply.send({ success: true, data: currencies });
  });

  app.post("/api/accounts/currencies", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const b = (req.body ?? {}) as { code?: string; name?: string; symbol?: string };
    const code = b.code?.trim().toUpperCase();
    const name = b.name?.trim();
    if (!code || !/^[A-Z]{3}$/.test(code) || !name) {
      return reply.code(400).send({ success: false, message: "A 3-letter ISO currency code and name are required." });
    }
    const created = await prisma.currency.upsert({
      where: { code },
      create: { code, name, symbol: b.symbol?.trim() || code },
      update: { name, symbol: b.symbol?.trim() || code },
      include: { exchangeRates: { orderBy: { date: "desc" } } },
    });
    await logAccountsAudit({
      action: "CREATE",
      tableName: "Currency",
      recordId: created.id,
      performedBy: req.user!.id,
      newValue: { code: created.code, name: created.name },
    });
    return reply.code(201).send({ success: true, data: created });
  });

  app.post("/api/accounts/exchange-rates", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const b = (req.body ?? {}) as {
      currencyCode?: string;
      currencyId?: string;
      baseCurrency?: string;
      rate?: number;
      date?: string;
    };

    const rate = Number(b.rate ?? 0);
    if (!Number.isFinite(rate) || rate <= 0 || !b.date) {
      return reply.code(400).send({ success: false, message: "A positive exchange rate and date are required." });
    }

    const currency = b.currencyId
      ? await prisma.currency.findUnique({ where: { id: b.currencyId } })
      : b.currencyCode
        ? await prisma.currency.findUnique({ where: { code: b.currencyCode.trim().toUpperCase() } })
        : null;

    if (!currency) {
      return reply.code(404).send({ success: false, message: "Currency not found." });
    }

    const created = await prisma.exchangeRate.create({
      data: {
        currencyId: currency.id,
        baseCurrency: (b.baseCurrency || "INR").trim().toUpperCase(),
        rate: Math.round(rate * 10000) / 10000,
        date: new Date(b.date),
      },
    });

    await logAccountsAudit({
      action: "CREATE",
      tableName: "ExchangeRate",
      recordId: created.id,
      performedBy: req.user!.id,
      newValue: { currency: currency.code, rate: created.rate, date: b.date },
    });

    return reply.code(201).send({ success: true, data: created });
  });

  app.delete("/api/accounts/exchange-rates/:id", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await prisma.exchangeRate.delete({ where: { id } });
    return reply.send({ success: true });
  });
}
