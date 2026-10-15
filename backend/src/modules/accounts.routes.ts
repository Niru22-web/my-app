import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma, SAFE_EMPLOYEE_SELECT } from "../config/db";
import { ACCOUNTS_ROLES, authenticate, normRole } from "../plugins/auth";

export async function requireAccountsAccess(req: FastifyRequest, reply: FastifyReply) {
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
    const dup = await prisma.payroll.findFirst({ where: { employeeId: b.employeeId, entityId: b.entityId, month, year }, select: { id: true } });
    if (dup) return reply.code(409).send({ success: false, message: "Salary for this person and month is already on record." });

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
    const claimed = await prisma.payroll.updateMany({ where: { id, status: "PENDING" }, data: { status: "PAID", paymentDate: paidDate } });
    if (!claimed.count) return reply.code(409).send({ success: false, message: "This salary was just marked paid." });
    const updated = await prisma.$transaction(async (tx) => {
      const p = await tx.payroll.update({
        where: { id },
        data: { paymentDate: paidDate },
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
    await logAccountsAudit({ action: "DELETE", tableName: "Payroll", recordId: id, performedBy: req.user!.id, oldValue: { employeeId: existing.employeeId, month: existing.month, year: existing.year, netPayable: existing.netPayable } });
    return reply.send({ success: true });
  });

  // ── 7. Ledgers (Client, Employee & General Ledger) ─────────────────────────
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
    await logAccountsAudit({ action: "UPDATE", tableName: "TaxConfiguration", recordId: id, performedBy: req.user!.id, newValue: updated });
    return reply.send({ success: true, data: updated });
  });

  app.delete("/api/accounts/taxes/:id", { preHandler: [requireAccountsAccess] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const old = await prisma.taxConfiguration.delete({ where: { id } });
    await logAccountsAudit({ action: "DELETE", tableName: "TaxConfiguration", recordId: id, performedBy: req.user!.id, oldValue: old });
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
    const old = await prisma.exchangeRate.delete({ where: { id } });
    await logAccountsAudit({ action: "DELETE", tableName: "ExchangeRate", recordId: id, performedBy: req.user!.id, oldValue: old });
    return reply.send({ success: true });
  });
}
