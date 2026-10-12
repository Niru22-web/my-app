"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ACCOUNTS_ROLES, normRole } from "@/lib/roles";
import { workDate, type YMD } from "@/lib/dates";
import type { Envelope } from "@/lib/types";

// The current Accounts API computes several totals wrongly (drafts counted as revenue, currencies
// mixed, aging by issue date). Every figure in the new screens is therefore computed here, from
// the invoices and receipts themselves — see docs/BACKEND_FINDINGS.md AC6–AC9.

/** Exactly the roles the API's checkAccountsAccess lets through (HR and Owner get 403). */
export const canUseAccounts = (role?: string | null) => normRole(role) === "admin" || (ACCOUNTS_ROLES as readonly string[]).includes(normRole(role));

// ── Shapes ─────────────────────────────────────────────────────────────────

export interface BankDetails {
  bankName?: string;
  accountName?: string;
  accountNo?: string;
  ifsc?: string;
  swift?: string;
  invoicePrefix?: string;
  customFormat?: string;
  [k: string]: unknown;
}
export interface Entity {
  id: string;
  name: string;
  legalName: string | null;
  gstin: string | null;
  pan: string | null;
  address: string | null;
  msmeReg: string | null;
  status: string;
  bankDetails: BankDetails | null;
}
export interface InvoiceItem {
  id?: string;
  description: string;
  sacCode: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
  gstRate: number | null;
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  gstAmount: number | null;
}
export interface Invoice {
  id: string;
  invoiceNumber: string;
  entityId: string;
  clientId: string;
  projectId: string | null;
  udin: string | null;
  issueDate: string;
  dueDate: string | null;
  subTotal: number;
  taxAmount: number;
  totalAmount: number;
  status: string;
  currency: string;
  exchangeRate: number;
  entity?: Entity;
  client?: { id: string; name: string; gstin: string | null; address: string | null; state?: string | null; pan?: string | null };
  project?: { id: string; name: string } | null;
  items: InvoiceItem[];
  receiptAllocations?: { id: string; amountAllocated: number; receiptId: string; receipt?: { receiptNumber: string; receiptDate: string } }[];
  createdAt: string;
}
export interface Receipt {
  id: string;
  receiptNumber: string;
  clientId: string;
  entityId: string;
  amount: number;
  currency: string;
  exchangeRate: number;
  receiptDate: string;
  paymentMode: string;
  referenceNumber: string | null;
  notes: string | null;
  client?: { id: string; name: string };
  entity?: { id: string; name: string };
  allocations?: { id: string; invoiceId: string; amountAllocated: number }[];
}

// ── Status & money helpers ─────────────────────────────────────────────────

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  PARTIALLY_PAID: "Part paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
  PENDING_APPROVAL: "Awaiting approval",
};
export const STATUS_TONE: Record<string, "neutral" | "brand" | "warning" | "success" | "danger"> = {
  DRAFT: "neutral",
  SENT: "brand",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  OVERDUE: "danger",
  CANCELLED: "neutral",
  PENDING_APPROVAL: "warning",
};
/** Invoices that are real receivables (not drafts, not cancelled). */
export const isIssued = (i: Pick<Invoice, "status">) => !["DRAFT", "CANCELLED"].includes(i.status);
const OPEN = new Set(["SENT", "PARTIALLY_PAID", "OVERDUE", "PENDING_APPROVAL"]);

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const toInr = (amount: number, rate: number | null | undefined) => amount * (rate && rate > 0 ? rate : 1);
export const allocated = (i: Invoice) => (i.receiptAllocations ?? []).reduce((s, a) => s + a.amountAllocated, 0);
/** Still owed, in the invoice currency. Auto-matched invoices are PAID without allocations — treat PAID as settled. */
export const outstanding = (i: Invoice) => (i.status === "PAID" || !OPEN.has(i.status) ? 0 : Math.max(0, round2(i.totalAmount - allocated(i))));
export const daysOverdue = (i: Invoice, today: YMD) => {
  if (!i.dueDate) return 0;
  const due = workDate(i.dueDate);
  return due < today ? Math.round((Date.parse(today) - Date.parse(due)) / 864e5) : 0;
};

export interface Summary {
  receivable: number;
  overdue: number;
  buckets: { label: string; value: number }[];
  revenueMonth: number;
  gstMonth: number;
  collectedMonth: number;
  drafts: number;
  openCount: number;
}
/** Correct receivables/revenue figures in INR (each document at its own exchange rate). */
export function summarise(invoices: Invoice[], receipts: Receipt[], today: YMD): Summary {
  const month = today.slice(0, 7);
  const b = { current: 0, d30: 0, d60: 0, d90: 0, older: 0 };
  let receivable = 0, revenueMonth = 0, gstMonth = 0, drafts = 0, openCount = 0;
  for (const i of invoices) {
    if (i.status === "DRAFT") drafts++;
    if (!isIssued(i)) continue;
    if (workDate(i.issueDate).slice(0, 7) === month) {
      revenueMonth += toInr(i.subTotal, i.exchangeRate);
      gstMonth += toInr(i.taxAmount, i.exchangeRate);
    }
    const o = toInr(outstanding(i), i.exchangeRate);
    if (o <= 0) continue;
    openCount++;
    receivable += o;
    const d = daysOverdue(i, today);
    if (d === 0) b.current += o;
    else if (d <= 30) b.d30 += o;
    else if (d <= 60) b.d60 += o;
    else if (d <= 90) b.d90 += o;
    else b.older += o;
  }
  const collectedMonth = receipts.filter((r) => workDate(r.receiptDate).slice(0, 7) === month).reduce((s, r) => s + toInr(r.amount, r.exchangeRate), 0);
  return {
    receivable,
    overdue: b.d30 + b.d60 + b.d90 + b.older,
    buckets: [
      { label: "Not yet due", value: b.current },
      { label: "1–30 days late", value: b.d30 },
      { label: "31–60 days late", value: b.d60 },
      { label: "61–90 days late", value: b.d90 },
      { label: "Over 90 days late", value: b.older },
    ],
    revenueMonth,
    gstMonth,
    collectedMonth,
    drafts,
    openCount,
  };
}

/**
 * What POST /receipts will actually do: it settles the client's DRAFT/SENT/PARTIALLY_PAID/OVERDUE
 * invoices oldest-first, across entities and currencies, with no conversion. Simulated here so the
 * form can show — and refuse — an unsafe receipt before it is saved.
 */
export function simulateReceipt(invoices: Invoice[], clientId: string, amount: number) {
  const targets = invoices
    .filter((i) => i.clientId === clientId && ["DRAFT", "SENT", "PARTIALLY_PAID", "OVERDUE"].includes(i.status))
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate));
  let left = amount;
  const plan: { invoice: Invoice; applied: number; settles: boolean }[] = [];
  for (const inv of targets) {
    if (left <= 0) break;
    const due = round2(inv.totalAmount - allocated(inv));
    if (due <= 0) continue;
    const applied = Math.min(left, due);
    plan.push({ invoice: inv, applied: round2(applied), settles: applied >= due - 0.005 });
    left = round2(left - applied);
  }
  return { plan, advance: Math.max(0, left) };
}

// ── Queries ────────────────────────────────────────────────────────────────

const list = async <T,>(p: string, query?: Record<string, string>) => (await api<Envelope<T[]>>(p, { query })).data ?? [];
export const useInvoices = (on = true) => useQuery({ queryKey: ["accounts", "invoices"], queryFn: () => list<Invoice>("accounts/invoices"), enabled: on });
export const useInvoice = (id: string) => useQuery({ queryKey: ["accounts", "invoice", id], queryFn: async () => (await api<Envelope<Invoice>>(`accounts/invoices/${id}`)).data });
export const useReceipts = (on = true) => useQuery({ queryKey: ["accounts", "receipts"], queryFn: () => list<Receipt>("accounts/receipts"), enabled: on });
/**
 * Entities via the masters API: GET /accounts/entities inserts four sample firms with made-up GSTIN/PAN/bank
 * numbers when the table is empty, which must never happen.
 */
export const useEntities = (on = true) =>
  useQuery({
    queryKey: ["accounts", "entities"],
    queryFn: async () => (await list<Entity & { isActive?: boolean }>("masters/entities", { page: "1", limit: "200", status: "all" })).map((e) => ({ ...e, bankDetails: (e.bankDetails ?? null) as BankDetails | null })),
    enabled: on,
  });

// ── Mutations ──────────────────────────────────────────────────────────────

export interface ItemInput {
  description: string;
  sacCode?: string;
  quantity: number;
  unitPrice: number;
  gstRate: number;
}
export interface InvoiceInput {
  entityId: string;
  clientId: string;
  projectId?: string;
  udin?: string;
  issueDate?: string;
  dueDate?: string;
  currency: string;
  exchangeRate: number;
  items: ItemInput[];
}

function useAccMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["accounts"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useAccountsMutations() {
  return {
    createInvoice: useAccMutation((b: InvoiceInput) => api<Envelope<Invoice>>("accounts/invoices", { method: "POST", body: { ...b, status: "DRAFT" } })),
    // Always send status explicitly so an edit can never silently change it.
    updateDraft: useAccMutation(({ id, body }: { id: string; body: Omit<InvoiceInput, "entityId"> }) => api<Envelope<Invoice>>(`accounts/invoices/${id}`, { method: "PUT", body: { ...body, status: "DRAFT" } })),
    /** POST ignores issueDate (always "now"); PUT accepts it, so a back-dated draft is set straight after creation. */
    setIssueDate: useAccMutation(({ id, issueDate }: { id: string; issueDate: string }) => api(`accounts/invoices/${id}`, { method: "PUT", body: { issueDate, status: "DRAFT" } })),
    setStatus: useAccMutation(({ id, status }: { id: string; status: "SENT" | "CANCELLED" }) => api(`accounts/invoices/${id}`, { method: "PUT", body: { status } })),
    deleteDraft: useAccMutation((id: string) => api(`accounts/invoices/${id}`, { method: "DELETE" })),
    recordReceipt: useAccMutation(
      (b: { clientId: string; entityId: string; amount: number; currency: string; exchangeRate: number; receiptDate: string; paymentMode: string; referenceNumber?: string; notes?: string }) =>
        api<Envelope<Receipt>>("accounts/receipts", { method: "POST", body: b }),
    ),
    saveEntity: useAccMutation(({ id, ...body }: Partial<Entity> & { name: string }) => (id ? api(`accounts/entities/${id}`, { method: "PUT", body }) : api("accounts/entities", { method: "POST", body }))),
  };
}

/** Indian-system amount in words, for printed invoices (rupees and paise). */
export function amountInWords(n: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (x: number) => (x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? ` ${ones[x % 10]}` : ""}`);
  const three = (x: number) => (x >= 100 ? `${ones[Math.floor(x / 100)]} Hundred${x % 100 ? ` ${two(x % 100)}` : ""}` : two(x));
  const words = (x: number): string => {
    if (x === 0) return "Zero";
    const parts: string[] = [];
    const crore = Math.floor(x / 1e7), lakh = Math.floor((x % 1e7) / 1e5), thousand = Math.floor((x % 1e5) / 1e3), rest = x % 1e3;
    if (crore) parts.push(`${words(crore)} Crore`);
    if (lakh) parts.push(`${two(lakh)} Lakh`);
    if (thousand) parts.push(`${two(thousand)} Thousand`);
    if (rest) parts.push(three(rest));
    return parts.join(" ");
  };
  const rupees = Math.floor(Math.abs(n));
  const paise = Math.round((Math.abs(n) - rupees) * 100);
  return `${words(rupees)} Rupees${paise ? ` and ${two(paise)} Paise` : ""} Only`;
}
