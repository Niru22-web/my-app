"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ACCOUNTS_ROLES, normRole } from "@/lib/roles";
import { workDate, type YMD } from "@/lib/dates";
import type { Envelope } from "@/lib/types";
import type { Claim } from "@/components/claims/api";

type AccountsUser = { role?: string | null; hasAccountsAccess?: boolean | null };

/** Who may open Accounts & Finance: admin/owner, accounts roles, or anyone given accounts access. Accepts a user or just a role. */
export const canUseAccounts = (who?: AccountsUser | string | null) => {
  const role = typeof who === "string" || who == null ? who : who.role;
  if (typeof who === "object" && who?.hasAccountsAccess) return true;
  const r = normRole(role);
  return ["admin", "owner"].includes(r) || (ACCOUNTS_ROLES as readonly string[]).includes(r);
};

// ── Shapes ─────────────────────────────────────────────────────────────────

export interface BankDetails {
  bankName?: string;
  accountName?: string;
  accountNo?: string;
  ifsc?: string;
  swift?: string;
  invoicePrefix?: string;
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
export type SupplyType = "INTRA" | "INTER" | "EXPORT" | "NO_GST";
export interface PlaceOfSupply {
  supplyType: SupplyType;
  code: string | null;
  label: string;
  problem: string | null;
}
export interface CreditNote {
  id: string;
  number: string;
  date: string;
  reason: string;
  subTotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  taxAmount: number;
  total: number;
  status: string;
  invoiceId?: string;
  invoiceNumber?: string | null;
  clientName?: string | null;
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
  /** Shown status: OVERDUE when open and past its due date. */
  status: string;
  /** Status as saved (never OVERDUE). */
  storedStatus?: string;
  paidAmount?: number;
  creditedAmount?: number;
  balanceDue?: number;
  creditNotes?: CreditNote[];
  placeOfSupply?: PlaceOfSupply | null;
  issuedAt?: string | null;
  cancelReason?: string | null;
  currency: string;
  exchangeRate: number;
  entity?: Entity;
  client?: { id: string; name: string; gstin: string | null; address: string | null; state?: string | null; pan?: string | null; country?: string | null };
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
  /** Cash actually received. */
  amount: number;
  tdsAmount?: number;
  tdsSection?: string | null;
  /** Cash + TDS. */
  grossAmount?: number;
  /** Advance not yet applied to any invoice. */
  unapplied?: number;
  reversedAt?: string | null;
  reverseReason?: string | null;
  currency: string;
  exchangeRate: number;
  receiptDate: string;
  paymentMode: string;
  referenceNumber: string | null;
  notes: string | null;
  client?: { id: string; name: string };
  entity?: { id: string; name: string };
  allocations?: { id: string; invoiceId: string; amountAllocated: number; invoice?: { id?: string; invoiceNumber: string } | null }[];
}

export interface BankMatch {
  kind: "RECEIPT" | "PAYROLL" | "CLAIM" | "OTHER" | string;
  receipt: { id?: string; receiptNumber: string } | null;
  claim: { id?: string; claimId: string; category: string; amount: number } | null;
  matchedAt: string;
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
  match?: BankMatch | null;
  createdAt: string;
}

export interface MatchSuggestion {
  transactionId: string;
  kind: "INVOICE" | "PAYROLL" | "CLAIM";
  targetId: string;
  label: string;
  reason: string;
  confidence: "high" | "medium";
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
  /** Running balance, already starting from the opening balance. */
  runningBalance?: number;
  referenceId: string | null;
  referenceType: string | null;
  entity?: { id: string; name: string } | null;
  client?: { id: string; name: string } | null;
  employee?: { id: string; employeeId: string; firstName: string; lastName: string | null } | null;
}
export interface LedgerView {
  rows: LedgerEntry[];
  opening: number;
  closing: number;
  totals: { debit: number; credit: number };
}

export interface SeriesInfo {
  entityId: string;
  entityName: string;
  prefix: string;
  fy: string;
  nextInvoice: string;
  nextCreditNote: string;
  nextReceipt: string;
  issuedThisYear: number;
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
  oldValue?: unknown;
  newValue?: unknown;
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
/** Issued and still open for payment. */
export const PAYABLE_STATUSES = ["SENT", "PARTIALLY_PAID", "OVERDUE"];
export const isPayable = (i: Pick<Invoice, "status">) => PAYABLE_STATUSES.includes(i.status);
const OPEN = new Set(["SENT", "PARTIALLY_PAID", "OVERDUE", "PENDING_APPROVAL"]);

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const toInr = (amount: number, rate: number | null | undefined) => amount * (rate && rate > 0 ? rate : 1);
export const allocated = (i: Invoice) => i.paidAmount ?? (i.receiptAllocations ?? []).reduce((s, a) => s + a.amountAllocated, 0);
/** Still owed, in the invoice currency (after receipts and credit notes). */
export const outstanding = (i: Invoice) => {
  if (typeof i.balanceDue === "number") return Math.max(0, i.balanceDue);
  return i.status === "PAID" || !OPEN.has(i.status) ? 0 : Math.max(0, round2(i.totalAmount - allocated(i) - (i.creditedAmount ?? 0)));
};
export const daysOverdue = (i: Invoice, today: YMD) => {
  if (!i.dueDate) return 0;
  const due = workDate(i.dueDate);
  return due < today ? Math.round((Date.parse(today) - Date.parse(due)) / 864e5) : 0;
};
export const isReversed = (r: Pick<Receipt, "reversedAt">) => !!r.reversedAt;

/** Start of the Indian financial year (1 April) that contains the date. */
export function fyStart(d: YMD): YMD {
  const y = Number(d.slice(0, 4));
  const m = Number(d.slice(5, 7));
  return `${m >= 4 ? y : y - 1}-04-01`;
}

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
  const collectedMonth = receipts
    .filter((r) => !isReversed(r) && workDate(r.receiptDate).slice(0, 7) === month)
    .reduce((s, r) => s + toInr(r.amount, r.exchangeRate), 0);
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
 * Preview of how a receipt (cash + TDS) will be applied: the client's issued invoices of the same
 * entity and currency — the chosen invoice first, then the oldest. Anything left is kept as an advance.
 */
export function simulateReceipt(invoices: Invoice[], o: { clientId: string; entityId: string; currency: string; amount: number; invoiceId?: string }) {
  const targets = invoices
    .filter((i) => i.clientId === o.clientId && i.entityId === o.entityId && i.currency === o.currency && isPayable(i) && outstanding(i) > 0)
    .sort((a, b) => (a.id === o.invoiceId ? -1 : b.id === o.invoiceId ? 1 : a.issueDate.localeCompare(b.issueDate)));
  let left = round2(o.amount);
  const plan: { invoice: Invoice; applied: number; settles: boolean }[] = [];
  for (const inv of targets) {
    if (left <= 0) break;
    const due = outstanding(inv);
    const applied = round2(Math.min(left, due));
    plan.push({ invoice: inv, applied, settles: applied >= due - 0.005 });
    left = round2(left - applied);
  }
  return { plan, advance: Math.max(0, left) };
}

// ── Queries ────────────────────────────────────────────────────────────────

type Filters = Record<string, string | undefined>;
const list = async <T,>(p: string, query?: Filters) => (await api<Envelope<T[]>>(p, { query })).data ?? [];
export const useInvoices = (on = true) => useQuery({ queryKey: ["accounts", "invoices"], queryFn: () => list<Invoice>("accounts/invoices"), enabled: on });
export const useInvoice = (id: string) => useQuery({ queryKey: ["accounts", "invoice", id], queryFn: async () => (await api<Envelope<Invoice>>(`accounts/invoices/${id}`)).data });
export const useReceipts = (on = true) => useQuery({ queryKey: ["accounts", "receipts"], queryFn: () => list<Receipt>("accounts/receipts"), enabled: on });
export const useCreditNotes = (on = true) => useQuery({ queryKey: ["accounts", "credit-notes"], queryFn: () => list<CreditNote>("accounts/credit-notes"), enabled: on });
export const useSeries = (on = true) => useQuery({ queryKey: ["accounts", "series"], queryFn: () => list<SeriesInfo>("accounts/series"), enabled: on });
export const usePlaceOfSupply = (entityId: string, clientId: string) =>
  useQuery({
    queryKey: ["accounts", "place-of-supply", entityId, clientId],
    queryFn: async () => (await api<Envelope<PlaceOfSupply>>("accounts/place-of-supply", { query: { entityId, clientId } })).data,
    enabled: !!entityId && !!clientId,
    staleTime: 60_000,
  });
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

const ledger = async (path: string, query: Filters): Promise<LedgerView> => {
  const r = await api<{ data?: LedgerEntry[]; opening?: number; closing?: number; totals?: { debit: number; credit: number } }>(path, { query });
  const rows = r.data ?? [];
  const opening = r.opening ?? 0;
  return {
    rows,
    opening,
    closing: r.closing ?? (rows.length ? rows[rows.length - 1].runningBalance ?? opening : opening),
    totals: r.totals ?? { debit: rows.reduce((s, x) => s + x.debit, 0), credit: rows.reduce((s, x) => s + x.credit, 0) },
  };
};
export const useLedgers = (filters?: { entityId?: string; type?: string; clientId?: string; employeeId?: string; from?: string; to?: string }, on = true) =>
  useQuery({ queryKey: ["accounts", "ledgers", filters ?? {}], queryFn: () => ledger("accounts/ledgers", filters ?? {}), enabled: on });
export const useClientLedger = (clientId: string, range: { from?: string; to?: string }) =>
  useQuery({ queryKey: ["accounts", "ledgers", "client", clientId, range], queryFn: () => ledger(`accounts/ledgers/client/${clientId}`, range), enabled: !!clientId });
export const useEmployeeLedger = (employeeId: string, range: { from?: string; to?: string }) =>
  useQuery({ queryKey: ["accounts", "ledgers", "employee", employeeId, range], queryFn: () => ledger(`accounts/ledgers/employee/${employeeId}`, range), enabled: !!employeeId });

/** Expense claims approved and waiting to be paid (APPROVED or PENDING_PAYMENT), organisation-wide. */
export const usePayableClaims = (on = true) =>
  useQuery({
    queryKey: ["claims", "payable"],
    queryFn: async () =>
      (await list<Claim>("reimbursements/team-approvals", { status: "all", orgView: "true" })).filter((c) => c.status === "APPROVED" || c.status === "PENDING_PAYMENT"),
    enabled: on,
  });

export const useTaxConfigs = (on = true) =>
  useQuery({ queryKey: ["accounts", "taxes"], queryFn: () => list<TaxConfig>("accounts/taxes"), enabled: on });

export const useCurrencies = (on = true) =>
  useQuery({ queryKey: ["accounts", "currencies"], queryFn: () => list<CurrencyItem>("accounts/currencies"), enabled: on });

export interface AuditParams {
  page?: number;
  limit?: number;
  action?: string;
  portal?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}
type AuditPage = { success: boolean; data: AuditLogEntry[]; pagination?: { page: number; limit: number; total: number; pages: number } };
const auditPage = (params: AuditParams) =>
  api<AuditPage>("accounts/audit-log", {
    query: {
      page: String(params.page ?? 1),
      limit: String(params.limit ?? 50),
      action: params.action || undefined,
      portal: params.portal || undefined,
      search: params.search?.trim() || undefined,
      dateFrom: params.dateFrom || undefined,
      dateTo: params.dateTo || undefined,
    },
  });
export const useAccountsAuditLog = (params: AuditParams, on = true) =>
  useQuery({ queryKey: ["accounts", "audit-log", params], queryFn: () => auditPage(params), enabled: on, placeholderData: (p) => p });
/** Every audit entry for the filters (all pages), for export. */
export async function fetchAllAuditLog(params: Omit<AuditParams, "page" | "limit">): Promise<AuditLogEntry[]> {
  const out: AuditLogEntry[] = [];
  let pages = 1;
  for (let page = 1; page <= pages && page <= 500; page++) {
    const r = await auditPage({ ...params, page, limit: 200 });
    out.push(...(r.data ?? []));
    pages = r.pagination?.pages ?? 1;
  }
  return out;
}

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
export interface ReceiptInput {
  clientId: string;
  entityId: string;
  amount: number;
  tdsAmount?: number;
  tdsSection?: string;
  currency: string;
  exchangeRate: number;
  receiptDate: string;
  paymentMode: string;
  referenceNumber?: string;
  notes?: string;
  invoiceId?: string;
}
export type ReconcileBody =
  | { invoiceId: string }
  | { payrollId: string }
  | { claimId: string }
  | { clientId: string }
  | { employeeId?: string }
  | { mappedStatus: "UNMAPPED"; reason: string };

function useAccMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["accounts"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["claims"] });
    },
  });
}

export function useAccountsMutations() {
  return {
    createInvoice: useAccMutation((b: InvoiceInput) => api<Envelope<Invoice>>("accounts/invoices", { method: "POST", body: b })),
    updateDraft: useAccMutation(({ id, body }: { id: string; body: Omit<InvoiceInput, "entityId"> }) => api<Envelope<Invoice>>(`accounts/invoices/${id}`, { method: "PUT", body })),
    setUdin: useAccMutation(({ id, udin }: { id: string; udin: string }) => api<Envelope<Invoice>>(`accounts/invoices/${id}`, { method: "PUT", body: { udin } })),
    issueInvoice: useAccMutation(({ id, issueDate }: { id: string; issueDate?: string }) => api<Envelope<Invoice>>(`accounts/invoices/${id}/issue`, { method: "POST", body: { issueDate } })),
    cancelInvoice: useAccMutation(({ id, reason }: { id: string; reason: string }) => api(`accounts/invoices/${id}/cancel`, { method: "POST", body: { reason } })),
    deleteDraft: useAccMutation((id: string) => api(`accounts/invoices/${id}`, { method: "DELETE" })),
    createCreditNote: useAccMutation(({ id, ...body }: { id: string; amount: number; reason: string; date?: string }) =>
      api<Envelope<CreditNote>>(`accounts/invoices/${id}/credit-notes`, { method: "POST", body }),
    ),
    recordReceipt: useAccMutation((b: ReceiptInput) => api<Envelope<Receipt & { advance?: number }>>("accounts/receipts", { method: "POST", body: b })),
    reverseReceipt: useAccMutation(({ id, reason }: { id: string; reason: string }) => api(`accounts/receipts/${id}/reverse`, { method: "POST", body: { reason } })),
    saveEntity: useAccMutation(({ id, ...body }: Partial<Entity> & { name: string }) => (id ? api(`accounts/entities/${id}`, { method: "PUT", body }) : api("accounts/entities", { method: "POST", body }))),
    importBankStatements: useAccMutation(
      (b: { entityId: string; statements: { bankReference?: string; date: string; description: string; type: "CREDIT" | "DEBIT"; amount: number; balance?: number | null }[] }) =>
        api<{ success: boolean; count: number; skipped?: number; duplicates?: number; invalid?: { line: number; reason: string }[] }>("accounts/bank-statements/import", { method: "POST", body: b }),
    ),
    /** Suggests matches only — nothing changes until confirmMatches. */
    suggestMatches: useMutation({
      mutationFn: (entityId?: string) => api<{ success: boolean; suggestions: MatchSuggestion[]; scanned: number }>("accounts/bank-statements/auto-match", { method: "POST", body: { entityId: entityId || undefined } }),
    }),
    confirmMatches: useAccMutation((matches: { transactionId: string; kind: string; targetId: string }[]) =>
      api<{ success: boolean; matchedCount: number; results: { transactionId: string; ok: boolean; message?: string }[] }>("accounts/bank-statements/confirm", { method: "POST", body: { matches } }),
    ),
    reconcileTransaction: useAccMutation(({ id, body }: { id: string; body: ReconcileBody }) =>
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
