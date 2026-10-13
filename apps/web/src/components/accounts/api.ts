"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ACCOUNTS_ROLES, normRole } from "@/lib/roles";
import { workDate, type YMD } from "@/lib/dates";
import type { Envelope } from "@/lib/types";

/** Roles allowed by the Accounts API guard. */
export const canUseAccounts = (role?: string | null) =>
  ["admin", "owner"].includes(normRole(role)) || (ACCOUNTS_ROLES as readonly string[]).includes(normRole(role));

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

export interface BankTransaction {
  id: string;
  entityId: string;
  bankReference: string | null;
  date: string;
  description: string;
  type: "CREDIT" | "DEBIT" | string;
  amount: number;
  balance: number | null;
  mappedStatus: "UNMAPPED" | "RECONCILED" | string;
  clientId: string | null;
  employeeId: string | null;
  invoiceId: string | null;
  payrollId: string | null;
  entity?: { id: string; name: string } | null;
  client?: { id: string; name: string } | null;
  employee?: { id: string; employeeId: string; firstName: string; lastName: string | null; department?: string | null } | null;
  invoice?: { id: string; invoiceNumber: string; totalAmount: number; currency: string; status: string } | null;
  payroll?: { id: string; month: number; year: number; netPayable: number; status: string } | null;
  createdAt: string;
}

export interface PayrollEntry {
  id: string;
  employeeId: string;
  entityId: string;
  month: number;
  year: number;
  basicSalary: number;
  allowances: number;
  deductions: number;
  netPayable: number;
  status: "PENDING" | "PAID" | string;
  paymentDate: string | null;
  entity?: { id: string; name: string } | null;
  employee?: { id: string; employeeId: string; firstName: string; lastName: string | null; designation?: string | null; department?: string | null } | null;
}

export interface LedgerEntry {
  id: string;
  entityId: string;
  type: "CLIENT" | "EMPLOYEE" | "VENDOR" | "GENERAL" | string;
  clientId: string | null;
  employeeId: string | null;
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  runningBalance?: number;
  referenceId: string | null;
  referenceType: string | null;
  entity?: { id: string; name: string } | null;
  client?: { id: string; name: string } | null;
  employee?: { id: string; employeeId: string; firstName: string; lastName: string | null } | null;
}

export interface TaxConfig {
  id: string;
  name: string;
  type: string;
  rate: number;
  isActive: boolean;
  createdAt?: string;
}

export interface ExchangeRateItem {
  id: string;
  currencyId: string;
  baseCurrency: string;
  rate: number;
  date: string;
  createdAt?: string;
}

export interface CurrencyItem {
  id: string;
  code: string;
  name: string;
  symbol: string | null;
  exchangeRates?: ExchangeRateItem[];
}

export interface AuditLogEntry {
  id: string;
  portal: string;
  tableName?: string;
  action: string;
  recordId: string;
  performedBy: string;
  performerName: string;
  description?: string;
  timestamp: string;
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
 * Preview FIFO receipt allocation against the client's open invoices.
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

const list = async <T,>(p: string, query?: Record<string, string | undefined>) => (await api<Envelope<T[]>>(p, { query })).data ?? [];
export const useInvoices = (on = true) => useQuery({ queryKey: ["accounts", "invoices"], queryFn: () => list<Invoice>("accounts/invoices"), enabled: on });
export const useInvoice = (id: string) => useQuery({ queryKey: ["accounts", "invoice", id], queryFn: async () => (await api<Envelope<Invoice>>(`accounts/invoices/${id}`)).data });
export const useReceipts = (on = true) => useQuery({ queryKey: ["accounts", "receipts"], queryFn: () => list<Receipt>("accounts/receipts"), enabled: on });
export const useEntities = (on = true) =>
  useQuery({
    queryKey: ["accounts", "entities"],
    queryFn: async () => (await list<Entity & { isActive?: boolean }>("masters/entities", { page: "1", limit: "200", status: "all" })).map((e) => ({ ...e, bankDetails: (e.bankDetails ?? null) as BankDetails | null })),
    enabled: on,
  });

export const useTransactions = (on = true) =>
  useQuery({ queryKey: ["accounts", "transactions"], queryFn: () => list<BankTransaction>("accounts/transactions"), enabled: on });

export const usePayrolls = (on = true) =>
  useQuery({ queryKey: ["accounts", "payroll"], queryFn: () => list<PayrollEntry>("accounts/payroll"), enabled: on });

export const useLedgers = (filters?: { entityId?: string; type?: string; clientId?: string; employeeId?: string; from?: string; to?: string }, on = true) =>
  useQuery({
    queryKey: ["accounts", "ledgers", filters ?? {}],
    queryFn: () => list<LedgerEntry>("accounts/ledgers", filters),
    enabled: on,
  });

export const useTaxConfigs = (on = true) =>
  useQuery({ queryKey: ["accounts", "taxes"], queryFn: () => list<TaxConfig>("accounts/taxes"), enabled: on });

export const useCurrencies = (on = true) =>
  useQuery({ queryKey: ["accounts", "currencies"], queryFn: () => list<CurrencyItem>("accounts/currencies"), enabled: on });

export const useAccountsAuditLog = (
  params: { page?: number; limit?: number; action?: string; portal?: string; search?: string; dateFrom?: string; dateTo?: string },
  on = true,
) =>
  useQuery({
    queryKey: ["accounts", "audit-log", params],
    queryFn: () =>
      api<{
        success: boolean;
        data: AuditLogEntry[];
        pagination?: { page: number; limit: number; total: number; pages: number };
      }>("accounts/audit-log", {
        query: {
          page: String(params.page ?? 1),
          limit: String(params.limit ?? 50),
          action: params.action || undefined,
          portal: params.portal || undefined,
          search: params.search?.trim() || undefined,
          dateFrom: params.dateFrom || undefined,
          dateTo: params.dateTo || undefined,
        },
      }),
    enabled: on,
    placeholderData: (p) => p,
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
    updateDraft: useAccMutation(({ id, body }: { id: string; body: Omit<InvoiceInput, "entityId"> }) => api<Envelope<Invoice>>(`accounts/invoices/${id}`, { method: "PUT", body: { ...body, status: "DRAFT" } })),
    setIssueDate: useAccMutation(({ id, issueDate }: { id: string; issueDate: string }) => api(`accounts/invoices/${id}`, { method: "PUT", body: { issueDate, status: "DRAFT" } })),
    setStatus: useAccMutation(({ id, status }: { id: string; status: "SENT" | "CANCELLED" }) => api(`accounts/invoices/${id}`, { method: "PUT", body: { status } })),
    deleteDraft: useAccMutation((id: string) => api(`accounts/invoices/${id}`, { method: "DELETE" })),
    recordReceipt: useAccMutation(
      (b: { clientId: string; entityId: string; amount: number; currency: string; exchangeRate: number; receiptDate: string; paymentMode: string; referenceNumber?: string; notes?: string }) =>
        api<Envelope<Receipt>>("accounts/receipts", { method: "POST", body: b }),
    ),
    saveEntity: useAccMutation(({ id, ...body }: Partial<Entity> & { name: string }) => (id ? api(`accounts/entities/${id}`, { method: "PUT", body }) : api("accounts/entities", { method: "POST", body }))),
    importBankStatements: useAccMutation(
      (b: { entityId: string; statements: { bankReference?: string; date: string; description: string; type: "CREDIT" | "DEBIT"; amount: number; balance?: number | null }[] }) =>
        api<{ success: boolean; count: number; skipped?: number; data: BankTransaction[] }>("accounts/bank-statements/import", { method: "POST", body: b }),
    ),
    autoMatchTransactions: useAccMutation(() => api<{ success: boolean; matchedCount: number }>("accounts/bank-statements/auto-match", { method: "POST" })),
    reconcileTransaction: useAccMutation(
      ({ id, ...body }: { id: string; mappedStatus?: "RECONCILED" | "UNMAPPED"; invoiceId?: string | null; payrollId?: string | null; clientId?: string | null; employeeId?: string | null }) =>
        api<Envelope<BankTransaction>>(`accounts/transactions/${id}/reconcile`, { method: "PUT", body }),
    ),
    deleteTransaction: useAccMutation((id: string) => api(`accounts/transactions/${id}`, { method: "DELETE" })),
    createPayroll: useAccMutation(
      (b: { employeeId: string; entityId: string; month: number; year: number; basicSalary: number; allowances: number; deductions: number }) =>
        api<Envelope<PayrollEntry>>("accounts/payroll", { method: "POST", body: b }),
    ),
    markPayrollPaid: useAccMutation(({ id, paymentDate }: { id: string; paymentDate?: string }) =>
      api<Envelope<PayrollEntry>>(`accounts/payroll/${id}/pay`, { method: "PATCH", body: { paymentDate } }),
    ),
    deletePayroll: useAccMutation((id: string) => api(`accounts/payroll/${id}`, { method: "DELETE" })),
    createLedgerEntry: useAccMutation(
      (b: { entityId: string; type: string; clientId?: string | null; employeeId?: string | null; date: string; description: string; debit: number; credit: number }) =>
        api<Envelope<LedgerEntry>>("accounts/ledgers", { method: "POST", body: b }),
    ),
    saveTaxConfig: useAccMutation(({ id, ...body }: { id?: string; name: string; type: string; rate: number; isActive?: boolean }) =>
      id ? api<Envelope<TaxConfig>>(`accounts/taxes/${id}`, { method: "PUT", body }) : api<Envelope<TaxConfig>>("accounts/taxes", { method: "POST", body }),
    ),
    deleteTaxConfig: useAccMutation((id: string) => api(`accounts/taxes/${id}`, { method: "DELETE" })),
    createCurrency: useAccMutation((b: { code: string; name: string; symbol?: string }) => api<Envelope<CurrencyItem>>("accounts/currencies", { method: "POST", body: b })),
    createExchangeRate: useAccMutation((b: { currencyCode: string; baseCurrency?: string; rate: number; date: string }) =>
      api<Envelope<ExchangeRateItem>>("accounts/exchange-rates", { method: "POST", body: b }),
    ),
    deleteExchangeRate: useAccMutation((id: string) => api(`accounts/exchange-rates/${id}`, { method: "DELETE" })),
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
