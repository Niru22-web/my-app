import type { Prisma } from "@prisma/client";
import { prisma } from "../config/db";
import { cleanPrefix, financialYear, formatDocNumber } from "./gst";

type Tx = Prisma.TransactionClient;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Status an invoice can receive money against. */
export const OPEN_INVOICE = ["SENT", "PARTIALLY_PAID", "OVERDUE"];

/** A friendly error the routes turn into a 400. */
export class AccountsError extends Error {}

/**
 * Next gap-free number in an entity's series for the financial year of `date`.
 * Must run inside the transaction that saves the document: if that rolls back, the number is not used.
 */
export async function nextDocNumber(tx: Tx, entityId: string, docType: "INVOICE" | "CREDIT_NOTE" | "RECEIPT", date: Date): Promise<string> {
  const fy = financialYear(date);
  const rows = await tx.$queryRaw<{ lastNumber: number }[]>`
    INSERT INTO "doc_series" ("id", "entityId", "docType", "fy", "lastNumber", "updatedAt")
    VALUES (gen_random_uuid()::text, ${entityId}, ${docType}, ${fy}, 1, now())
    ON CONFLICT ("entityId", "docType", "fy") DO UPDATE SET "lastNumber" = "doc_series"."lastNumber" + 1, "updatedAt" = now()
    RETURNING "lastNumber"`;
  const entity = await tx.entity.findUnique({ where: { id: entityId }, select: { name: true, bankDetails: true } });
  const prefix = cleanPrefix((entity?.bankDetails as Record<string, unknown> | null)?.invoicePrefix, entity?.name ?? "INV");
  return formatDocNumber(prefix, docType, fy, Number(rows[0].lastNumber));
}

/** What's been paid and credited against an invoice, and what is still due (invoice currency). */
export async function invoiceBalance(tx: Tx | typeof prisma, invoiceId: string) {
  const [inv, alloc, credits] = await Promise.all([
    tx.invoice.findUnique({ where: { id: invoiceId }, select: { totalAmount: true, status: true } }),
    tx.receiptAllocation.aggregate({ where: { invoiceId }, _sum: { amountAllocated: true } }),
    tx.creditNote.aggregate({ where: { invoiceId, status: "ISSUED" }, _sum: { total: true } }),
  ]);
  const total = inv?.totalAmount ?? 0;
  const paid = r2(alloc._sum.amountAllocated ?? 0);
  const credited = r2(credits._sum.total ?? 0);
  return { total, paid, credited, due: Math.max(0, r2(total - paid - credited)), status: inv?.status ?? "" };
}

/** Recomputes SENT / PARTIALLY_PAID / PAID from money received and credit notes. Drafts and cancelled invoices are left alone. */
export async function refreshInvoiceStatus(tx: Tx, invoiceId: string) {
  const b = await invoiceBalance(tx, invoiceId);
  if (b.status === "DRAFT" || b.status === "CANCELLED") return b;
  const status = b.due <= 0.005 ? "PAID" : b.paid + b.credited > 0 ? "PARTIALLY_PAID" : "SENT";
  if (status !== b.status) await tx.invoice.update({ where: { id: invoiceId }, data: { status } });
  return { ...b, status };
}

/** One client/employee ledger line, in INR. */
export async function postLedger(
  tx: Tx,
  e: { entityId: string; type: "CLIENT" | "EMPLOYEE" | "GENERAL"; clientId?: string | null; employeeId?: string | null; date: Date; description: string; debit?: number; credit?: number; referenceId: string; referenceType: string },
) {
  const debit = r2(e.debit ?? 0);
  const credit = r2(e.credit ?? 0);
  if (!debit && !credit) return;
  await tx.ledger.create({
    data: {
      entityId: e.entityId,
      type: e.type,
      clientId: e.clientId ?? null,
      employeeId: e.employeeId ?? null,
      date: e.date,
      description: e.description,
      debit,
      credit,
      balance: r2(debit - credit),
      referenceId: e.referenceId,
      referenceType: e.referenceType,
    },
  });
}

export interface ReceiptInput {
  clientId: string;
  entityId: string;
  /** Money actually received (net of TDS), in `currency` */
  amount: number;
  tdsAmount?: number;
  tdsSection?: string | null;
  currency: string;
  exchangeRate: number;
  receiptDate: Date;
  paymentMode: string;
  referenceNumber?: string | null;
  notes?: string | null;
  /** Settle this invoice first, then the oldest open ones */
  invoiceId?: string | null;
  userId: string;
}

/**
 * Records a receipt: numbers it in the entity's series, applies cash + TDS to the client's issued invoices
 * (same entity and currency; the chosen invoice first, then oldest first), keeps any surplus as an advance,
 * and posts the client ledger (cash and TDS as separate credits).
 */
export async function createReceipt(tx: Tx, input: ReceiptInput) {
  const amount = r2(input.amount);
  const tds = r2(input.tdsAmount ?? 0);
  if (!(amount > 0) && !(tds > 0)) throw new AccountsError("Enter the amount received.");
  if (amount < 0 || tds < 0) throw new AccountsError("Amounts can't be negative.");
  const [client, entity] = await Promise.all([
    tx.client.findUnique({ where: { id: input.clientId }, select: { id: true, name: true } }),
    tx.entity.findUnique({ where: { id: input.entityId }, select: { id: true } }),
  ]);
  if (!client) throw new AccountsError("Client not found.");
  if (!entity) throw new AccountsError("Billing entity not found.");
  if (input.invoiceId) {
    const target = await tx.invoice.findUnique({ where: { id: input.invoiceId }, select: { clientId: true, entityId: true, currency: true, status: true } });
    if (!target || target.clientId !== input.clientId || target.entityId !== input.entityId) throw new AccountsError("That invoice belongs to a different client or entity.");
    if (target.currency !== input.currency) throw new AccountsError(`That invoice is in ${target.currency}; record the receipt in ${target.currency}.`);
    if (!OPEN_INVOICE.includes(target.status)) throw new AccountsError("That invoice isn't open for payment.");
  }

  const receiptNumber = await nextDocNumber(tx, input.entityId, "RECEIPT", input.receiptDate);
  const receipt = await tx.receipt.create({
    data: {
      receiptNumber,
      clientId: input.clientId,
      entityId: input.entityId,
      amount,
      currency: input.currency,
      exchangeRate: input.exchangeRate || 1,
      receiptDate: input.receiptDate,
      paymentMode: input.paymentMode,
      referenceNumber: input.referenceNumber?.trim() || null,
      notes: input.notes?.trim() || null,
    },
  });
  if (tds > 0 || input.tdsSection) {
    await tx.receiptExtra.create({ data: { receiptId: receipt.id, tdsAmount: tds, tdsSection: input.tdsSection?.trim() || (tds > 0 ? "194J" : null) } });
  }

  // Apply cash + TDS: the client has paid the gross amount (TDS was deposited with the government on our behalf).
  const open = await tx.invoice.findMany({
    where: { clientId: input.clientId, entityId: input.entityId, currency: input.currency, status: { in: OPEN_INVOICE } },
    orderBy: [{ issueDate: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const order = input.invoiceId ? [input.invoiceId, ...open.map((o) => o.id).filter((id) => id !== input.invoiceId)] : open.map((o) => o.id);
  let left = r2(amount + tds);
  for (const invoiceId of order) {
    if (left <= 0) break;
    const { due } = await invoiceBalance(tx, invoiceId);
    if (due <= 0) continue;
    const applied = r2(Math.min(left, due));
    await tx.receiptAllocation.create({ data: { receiptId: receipt.id, invoiceId, amountAllocated: applied } });
    await refreshInvoiceStatus(tx, invoiceId);
    left = r2(left - applied);
  }

  const rate = input.exchangeRate || 1;
  await postLedger(tx, { entityId: input.entityId, type: "CLIENT", clientId: input.clientId, date: input.receiptDate, description: `Receipt ${receiptNumber} (${input.paymentMode})`, credit: amount * rate, referenceId: receipt.id, referenceType: "RECEIPT" });
  if (tds > 0) {
    await postLedger(tx, { entityId: input.entityId, type: "CLIENT", clientId: input.clientId, date: input.receiptDate, description: `TDS u/s ${input.tdsSection?.trim() || "194J"} on receipt ${receiptNumber}`, credit: tds * rate, referenceId: receipt.id, referenceType: "RECEIPT_TDS" });
  }
  return { receipt, advance: left };
}

/**
 * Reverses a receipt (bounced cheque, wrong client, un-matched bank line): removes its allocations,
 * reopens the invoices, posts reversing ledger lines. The receipt stays on record, marked reversed.
 */
export async function reverseReceipt(tx: Tx, receiptId: string, userId: string, reason: string) {
  const receipt = await tx.receipt.findUnique({ where: { id: receiptId }, include: { allocations: true } });
  if (!receipt) throw new AccountsError("Receipt not found.");
  const extra = await tx.receiptExtra.findUnique({ where: { receiptId } });
  if (extra?.reversedAt) throw new AccountsError("This receipt has already been reversed.");
  // Claim the reversal first so two clicks can't reverse twice.
  await tx.receiptExtra.upsert({
    where: { receiptId },
    create: { receiptId, reversedAt: new Date(), reversedById: userId, reverseReason: reason },
    update: { reversedAt: new Date(), reversedById: userId, reverseReason: reason },
  });
  await tx.receiptAllocation.deleteMany({ where: { receiptId } });
  for (const a of receipt.allocations) await refreshInvoiceStatus(tx, a.invoiceId);
  const rate = receipt.exchangeRate || 1;
  const now = new Date();
  await postLedger(tx, { entityId: receipt.entityId, type: "CLIENT", clientId: receipt.clientId, date: now, description: `Reversal of receipt ${receipt.receiptNumber}: ${reason}`, debit: receipt.amount * rate, referenceId: receipt.id, referenceType: "RECEIPT_REVERSAL" });
  if (extra?.tdsAmount) {
    await postLedger(tx, { entityId: receipt.entityId, type: "CLIENT", clientId: receipt.clientId, date: now, description: `Reversal of TDS on receipt ${receipt.receiptNumber}`, debit: extra.tdsAmount * rate, referenceId: receipt.id, referenceType: "RECEIPT_TDS_REVERSAL" });
  }
  return receipt;
}
