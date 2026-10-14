"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Download, Landmark, Link2, Plus, Sparkles, Trash2, Unlink, Upload } from "lucide-react";
import { ApiError } from "@/lib/api";
import { today, workDate } from "@/lib/dates";
import { formatCurrency, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { FormRow, Input, Select } from "@/components/ui/inputs";
import { Segmented } from "@/components/ui/segmented";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ErrorState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { downloadCsv } from "@/components/claims/claim-tabs";
import { fullName, useClientOptions, usePeople } from "@/components/management/api";
import {
  outstanding,
  useAccountsMutations,
  useEntities,
  useInvoices,
  usePayrolls,
  useTransactions,
  type BankTransaction,
} from "@/components/accounts/api";

interface ParsedStatementLine {
  date: string;
  description: string;
  bankReference: string;
  type: "CREDIT" | "DEBIT";
  amount: number;
  balance: number | null;
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cur.push(field.trim());
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      cur.push(field.trim());
      if (cur.some(Boolean)) rows.push(cur);
      cur = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field.length || cur.length) {
    cur.push(field.trim());
    if (cur.some(Boolean)) rows.push(cur);
  }
  return rows;
}

function normalizeDate(raw: string): string {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? today() : d.toISOString().slice(0, 10);
}

function cleanNum(raw?: string): number {
  if (!raw) return 0;
  const n = Number(raw.replace(/[₹$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseBankCsv(text: string): ParsedStatementLine[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const idx = (keys: string[]) => headers.findIndex((h) => keys.some((k) => h.includes(k)));

  const dateCol = idx(["date", "txndate", "valuedate"]);
  const descCol = idx(["description", "narration", "particular", "remark", "details"]);
  const refCol = idx(["ref", "utr", "chq", "cheque", "txnid"]);
  const creditCol = idx(["credit", "deposit", "cr"]);
  const debitCol = idx(["debit", "withdrawal", "dr"]);
  const amtCol = idx(["amount", "value"]);
  const typeCol = idx(["type", "drcr", "crdr"]);
  const balCol = idx(["balance", "closing"]);

  const out: ParsedStatementLine[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const dateStr = normalizeDate(r[dateCol >= 0 ? dateCol : 0] ?? "");
    const description = (r[descCol >= 0 ? descCol : 1] ?? "").trim();
    if (!description) continue;
    const bankReference = (refCol >= 0 ? r[refCol] : "")?.trim() || "";

    let amount = 0;
    let type: "CREDIT" | "DEBIT" = "CREDIT";

    if (creditCol >= 0 || debitCol >= 0) {
      const cr = creditCol >= 0 ? cleanNum(r[creditCol]) : 0;
      const dr = debitCol >= 0 ? cleanNum(r[debitCol]) : 0;
      if (cr > 0) {
        amount = cr;
        type = "CREDIT";
      } else if (dr > 0) {
        amount = dr;
        type = "DEBIT";
      }
    } else if (amtCol >= 0) {
      const rawAmt = cleanNum(r[amtCol]);
      const rawType = (typeCol >= 0 ? r[typeCol] : "")?.toUpperCase() ?? "";
      if (rawAmt < 0 || rawType.startsWith("D") || rawType === "DR") {
        amount = Math.abs(rawAmt);
        type = "DEBIT";
      } else {
        amount = Math.abs(rawAmt);
        type = "CREDIT";
      }
    }

    if (amount <= 0) continue;
    const balance = balCol >= 0 && r[balCol] ? cleanNum(r[balCol]) : null;
    out.push({ date: dateStr, description, bankReference, type, amount, balance });
  }
  return out;
}

export default function BankingPage() {
  const q = useTransactions();
  const entities = useEntities();
  const m = useAccountsMutations();
  const toast = useToast();

  const [entityFilter, setEntityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "UNMAPPED" | "RECONCILED">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "CREDIT" | "DEBIT">("all");
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [reconciling, setReconciling] = useState<BankTransaction | null>(null);
  const [deleting, setDeleting] = useState<BankTransaction | null>(null);

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data ?? []).filter((t) => {
      if (entityFilter && t.entityId !== entityFilter) return false;
      if (statusFilter !== "all" && t.mappedStatus !== statusFilter) return false;
      if (typeFilter !== "all" && t.type.toUpperCase() !== typeFilter) return false;
      if (s && !`${t.description} ${t.bankReference ?? ""} ${t.client?.name ?? ""} ${t.invoice?.invoiceNumber ?? ""}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [q.data, entityFilter, statusFilter, typeFilter, search]);

  const stats = useMemo(() => {
    let reconciled = 0;
    let unmappedCredits = 0;
    let unmappedDebits = 0;
    let unmappedCreditCount = 0;
    let unmappedDebitCount = 0;
    for (const t of q.data ?? []) {
      if (entityFilter && t.entityId !== entityFilter) continue;
      if (t.mappedStatus === "RECONCILED") reconciled++;
      else if (t.type.toUpperCase() === "CREDIT") {
        unmappedCredits += Math.abs(t.amount);
        unmappedCreditCount++;
      } else {
        unmappedDebits += Math.abs(t.amount);
        unmappedDebitCount++;
      }
    }
    return {
      total: (q.data ?? []).filter((t) => !entityFilter || t.entityId === entityFilter).length,
      reconciled,
      unmappedCredits,
      unmappedDebits,
      unmappedCreditCount,
      unmappedDebitCount,
    };
  }, [q.data, entityFilter]);

  const columns: Column<BankTransaction>[] = [
    {
      key: "date",
      header: "Date",
      sortValue: (t) => workDate(t.date),
      cell: (t) => <span className="tabular text-ink-muted">{formatDate(t.date)}</span>,
    },
    {
      key: "desc",
      header: "Statement line",
      sortValue: (t) => t.description,
      cell: (t) => (
        <div className="max-w-md">
          <p className="truncate font-medium text-ink">{t.description}</p>
          <p className="truncate text-xs text-ink-subtle">
            {[t.bankReference ? `Ref: ${t.bankReference}` : null, t.entity?.name].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      sortValue: (t) => t.type,
      cell: (t) =>
        t.type.toUpperCase() === "CREDIT" ? (
          <Badge tone="success">
            <ArrowDownLeft className="mr-1 inline h-3 w-3" /> Credit
          </Badge>
        ) : (
          <Badge tone="warning">
            <ArrowUpRight className="mr-1 inline h-3 w-3" /> Debit
          </Badge>
        ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      sortValue: (t) => Math.abs(t.amount),
      cell: (t) => (
        <span className={`font-semibold tabular ${t.type.toUpperCase() === "CREDIT" ? "text-success" : "text-ink"}`}>
          {t.type.toUpperCase() === "CREDIT" ? "+" : "−"}
          {formatCurrency(Math.abs(t.amount))}
        </span>
      ),
    },
    {
      key: "status",
      header: "Reconciliation",
      sortValue: (t) => t.mappedStatus,
      cell: (t) => {
        if (t.mappedStatus !== "RECONCILED") {
          return <Badge tone="neutral">Unmapped</Badge>;
        }
        return (
          <div className="space-y-0.5 text-xs">
            <Badge tone="brand">Reconciled</Badge>
            {t.invoice && (
              <Link href={`/accounts/invoices/${t.invoice.id}`} className="block font-medium text-brand hover:underline">
                {t.invoice.invoiceNumber}
              </Link>
            )}
            {t.client && !t.invoice && <span className="block text-ink-muted">{t.client.name}</span>}
            {t.employee && <span className="block text-ink-muted">{fullName(t.employee)}</span>}
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (t) => (
        <div className="flex items-center justify-end gap-1.5">
          {t.mappedStatus === "RECONCILED" ? (
            <Button
              variant="ghost"
              size="sm"
              loading={m.reconcileTransaction.isPending}
              onClick={() =>
                m.reconcileTransaction.mutate(
                  { id: t.id, mappedStatus: "UNMAPPED" },
                  {
                    onSuccess: () => toast.success("Transaction unlinked"),
                    onError: (e) => toast.error("Couldn’t unlink", e instanceof ApiError ? e.message : undefined),
                  },
                )
              }
            >
              <Unlink className="h-3.5 w-3.5" /> Unlink
            </Button>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={() => setReconciling(t)}>
                <Link2 className="h-3.5 w-3.5" /> Reconcile
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDeleting(t)} aria-label="Delete transaction">
                <Trash2 className="h-3.5 w-3.5 text-danger" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  if (q.isError) {
    return (
      <Card>
        <ErrorState message="Bank transactions couldn’t be loaded." onRetry={() => q.refetch()} />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bank & reconciliation"
        description="Import bank statement CSVs, auto-match credits to open invoices and debits to payroll or claims, or reconcile lines manually."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              loading={m.autoMatchTransactions.isPending}
              disabled={!stats.unmappedCreditCount && !stats.unmappedDebitCount}
              onClick={() =>
                m.autoMatchTransactions.mutate(undefined, {
                  onSuccess: (res) =>
                    res.matchedCount > 0
                      ? toast.success(`Auto-matched ${res.matchedCount} transaction(s)`)
                      : toast.info("No exact matches found", "Use Reconcile on a line to match it manually."),
                  onError: (e) => toast.error("Auto-match failed", e instanceof ApiError ? e.message : undefined),
                })
              }
            >
              <Sparkles className="h-4 w-4" /> Auto-match
            </Button>
            <Button variant="secondary" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add entry
            </Button>
            <Button onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" /> Import CSV
            </Button>
            <Button
              variant="secondary"
              disabled={!rows.length}
              onClick={() =>
                downloadCsv(
                  `bank-transactions-${today()}.csv`,
                  ["Date", "Entity", "Reference", "Description", "Type", "Amount (₹)", "Status", "Matched Invoice / Person"],
                  rows.map((r) => [
                    workDate(r.date),
                    r.entity?.name ?? "",
                    r.bankReference ?? "",
                    r.description,
                    r.type,
                    Math.abs(r.amount).toFixed(2),
                    r.mappedStatus,
                    r.invoice?.invoiceNumber ?? r.client?.name ?? (r.employee ? fullName(r.employee) : ""),
                  ]),
                )
              }
            >
              <Download className="h-4 w-4" /> Export
            </Button>
          </div>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Statement lines" icon={Landmark} tone="brand" loading={q.isLoading} value={String(stats.total)} />
        <StatCard label="Reconciled" icon={CheckCircle2} tone="success" loading={q.isLoading} value={String(stats.reconciled)} hint={stats.total ? `${Math.round((stats.reconciled / stats.total) * 100)}% matched` : undefined} />
        <StatCard label="Unmapped credits" icon={ArrowDownLeft} tone={stats.unmappedCreditCount ? "warning" : "neutral"} loading={q.isLoading} value={formatCurrency(stats.unmappedCredits)} hint={`${stats.unmappedCreditCount} line(s)`} />
        <StatCard label="Unmapped debits" icon={ArrowUpRight} loading={q.isLoading} value={formatCurrency(stats.unmappedDebits)} hint={`${stats.unmappedDebitCount} line(s)`} />
      </section>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <Segmented
            aria-label="Reconciliation status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: "All" },
              { value: "UNMAPPED", label: "Unmapped" },
              { value: "RECONCILED", label: "Reconciled" },
            ]}
          />
          <Segmented
            aria-label="Transaction type"
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: "all", label: "All types" },
              { value: "CREDIT", label: "Credits" },
              { value: "DEBIT", label: "Debits" },
            ]}
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {(entities.data?.length ?? 0) > 1 && (
            <Select aria-label="Billing entity" value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} className="sm:w-52">
              <option value="">All entities</option>
              {entities.data!.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          )}
          <Input placeholder="Search description, ref, client…" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:w-64" />
        </div>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(t) => t.id}
        loading={q.isLoading}
        initialSort={{ key: "date", dir: "desc" }}
        pageSize={25}
        empty={{ icon: Landmark, title: "No bank transactions yet", description: "Import a CSV bank statement or add an entry manually." }}
      />

      {importOpen && <ImportCsvDialog entities={entities.data ?? []} onClose={() => setImportOpen(false)} />}
      {addOpen && <AddTransactionDialog entities={entities.data ?? []} onClose={() => setAddOpen(false)} />}
      {reconciling && <ReconcileDialog txn={reconciling} onClose={() => setReconciling(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        tone="danger"
        title="Delete statement line?"
        description={deleting ? `Remove "${deleting.description}" (${formatCurrency(Math.abs(deleting.amount))})?` : ""}
        confirmLabel="Delete"
        busy={m.deleteTransaction.isPending}
        onConfirm={() =>
          deleting &&
          m.deleteTransaction.mutate(deleting.id, {
            onSuccess: () => (toast.success("Transaction deleted"), setDeleting(null)),
            onError: (e) => (toast.error("Couldn’t delete", e instanceof ApiError ? e.message : undefined), setDeleting(null)),
          })
        }
      />
    </div>
  );
}

function ImportCsvDialog({ entities, onClose }: { entities: { id: string; name: string }[]; onClose: () => void }) {
  const toast = useToast();
  const m = useAccountsMutations();
  const [entityId, setEntityId] = useState(entities[0]?.id ?? "");
  const [parsed, setParsed] = useState<ParsedStatementLine[]>([]);
  const [fileName, setFileName] = useState("");

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const rows = parseBankCsv(text);
      setParsed(rows);
      if (!rows.length) {
        toast.error("No valid rows found in CSV", "Ensure columns include Date, Description, and Credit/Debit or Amount.");
      }
    };
    reader.readAsText(file);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!entityId || !parsed.length) return;
    try {
      const res = await m.importBankStatements.mutateAsync({ entityId, statements: parsed });
      toast.success(`Imported ${res.count} statement line(s)`);
      onClose();
    } catch (err) {
      toast.error("Import failed", err instanceof ApiError ? err.message : undefined);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Import bank statement (CSV)"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="csv-import-form" disabled={!entityId || !parsed.length} loading={m.importBankStatements.isPending}>
            Import {parsed.length ? `${parsed.length} line(s)` : ""}
          </Button>
        </>
      }
    >
      <form id="csv-import-form" onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormRow label="Billing entity" htmlFor="imp-entity" required>
            <Select id="imp-entity" value={entityId} onChange={(e) => setEntityId(e.target.value)}>
              <option value="">Choose entity…</option>
              {entities.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </FormRow>
          <FormRow label="Statement CSV file" htmlFor="imp-file" required hint="Columns: Date, Description/Narration, Ref/UTR, Credit, Debit (or Amount & Type)">
            <Input id="imp-file" type="file" accept=".csv,text/csv" onChange={handleFile} />
          </FormRow>
        </div>

        {parsed.length > 0 && (
          <div className="max-h-64 overflow-y-auto rounded-xl border border-line">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-muted text-left text-ink-subtle">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Ref</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {parsed.slice(0, 50).map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 tabular">{r.date}</td>
                    <td className="max-w-xs truncate px-3 py-1.5">{r.description}</td>
                    <td className="px-3 py-1.5 font-mono">{r.bankReference || "—"}</td>
                    <td className="px-3 py-1.5">{r.type}</td>
                    <td className="px-3 py-1.5 text-right font-medium tabular">{formatCurrency(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsed.length > 50 && <p className="border-t border-line px-3 py-2 text-xs text-ink-subtle">Showing first 50 of {parsed.length} rows from {fileName}.</p>}
          </div>
        )}
      </form>
    </Dialog>
  );
}

function AddTransactionDialog({ entities, onClose }: { entities: { id: string; name: string }[]; onClose: () => void }) {
  const toast = useToast();
  const m = useAccountsMutations();
  const [entityId, setEntityId] = useState(entities[0]?.id ?? "");
  const [date, setDate] = useState(today());
  const [type, setType] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [amount, setAmount] = useState("");
  const [bankReference, setBankReference] = useState("");
  const [description, setDescription] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!entityId || !description.trim() || !Number.isFinite(amt) || amt <= 0) return;
    try {
      await m.importBankStatements.mutateAsync({
        entityId,
        statements: [{ date, description: description.trim(), bankReference: bankReference.trim() || undefined, type, amount: amt }],
      });
      toast.success("Bank transaction recorded");
      onClose();
    } catch (err) {
      toast.error("Couldn’t save", err instanceof ApiError ? err.message : undefined);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add bank transaction"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="add-txn-form" loading={m.importBankStatements.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id="add-txn-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Billing entity" htmlFor="tx-entity" required>
          <Select id="tx-entity" value={entityId} onChange={(e) => setEntityId(e.target.value)}>
            <option value="">Choose…</option>
            {entities.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Date" htmlFor="tx-date" required>
          <Input id="tx-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </FormRow>
        <FormRow label="Type" htmlFor="tx-type" required>
          <Select id="tx-type" value={type} onChange={(e) => setType(e.target.value as "CREDIT" | "DEBIT")}>
            <option value="CREDIT">Credit (Money in)</option>
            <option value="DEBIT">Debit (Money out)</option>
          </Select>
        </FormRow>
        <FormRow label="Amount (₹)" htmlFor="tx-amt" required>
          <Input id="tx-amt" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </FormRow>
        <FormRow label="UTR / bank reference" htmlFor="tx-ref" className="sm:col-span-2">
          <Input id="tx-ref" value={bankReference} onChange={(e) => setBankReference(e.target.value)} placeholder="Optional" />
        </FormRow>
        <FormRow label="Description / narration" htmlFor="tx-desc" required className="sm:col-span-2">
          <Input id="tx-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. NEFT inward from Client" />
        </FormRow>
      </form>
    </Dialog>
  );
}

function ReconcileDialog({ txn, onClose }: { txn: BankTransaction; onClose: () => void }) {
  const toast = useToast();
  const m = useAccountsMutations();
  const invoices = useInvoices();
  const payrolls = usePayrolls();
  const clients = useClientOptions();
  const people = usePeople();

  const isCredit = txn.type.toUpperCase() === "CREDIT";
  const [invoiceId, setInvoiceId] = useState("");
  const [payrollId, setPayrollId] = useState("");
  const [clientId, setClientId] = useState("");
  const [employeeId, setEmployeeId] = useState("");

  const openInvoices = useMemo(
    () => (invoices.data ?? []).filter((i) => i.entityId === txn.entityId && outstanding(i) > 0),
    [invoices.data, txn.entityId],
  );
  const pendingPayrolls = useMemo(
    () => (payrolls.data ?? []).filter((p) => p.entityId === txn.entityId && p.status === "PENDING"),
    [payrolls.data, txn.entityId],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await m.reconcileTransaction.mutateAsync({
        id: txn.id,
        mappedStatus: "RECONCILED",
        invoiceId: invoiceId || null,
        payrollId: payrollId || null,
        clientId: clientId || null,
        employeeId: employeeId || null,
      });
      toast.success("Transaction reconciled");
      onClose();
    } catch (err) {
      toast.error("Couldn’t reconcile", err instanceof ApiError ? err.message : undefined);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Reconcile statement line"
      description={`${txn.description} · ${formatCurrency(Math.abs(txn.amount))} (${txn.type})`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="reconcile-form" loading={m.reconcileTransaction.isPending}>
            Mark reconciled
          </Button>
        </>
      }
    >
      <form id="reconcile-form" onSubmit={submit} className="space-y-4">
        {isCredit ? (
          <>
            <FormRow label="Match to open invoice (creates receipt & allocation)" htmlFor="rec-inv">
              <Select id="rec-inv" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
                <option value="">None (general credit / advance)</option>
                {openInvoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoiceNumber} · {inv.client?.name} · Due {formatCurrency(outstanding(inv), inv.currency)}
                  </option>
                ))}
              </Select>
            </FormRow>
            {!invoiceId && (
              <FormRow label="Or tag client" htmlFor="rec-client">
                <Select id="rec-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                  <option value="">Optional…</option>
                  {(clients.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </FormRow>
            )}
          </>
        ) : (
          <>
            <FormRow label="Match to pending payroll (marks salary paid)" htmlFor="rec-pay">
              <Select id="rec-pay" value={payrollId} onChange={(e) => setPayrollId(e.target.value)}>
                <option value="">None (other expense / vendor debit)</option>
                {pendingPayrolls.map((p) => (
                  <option key={p.id} value={p.id}>
                    {fullName(p.employee)} · {String(p.month).padStart(2, "0")}/{p.year} · {formatCurrency(p.netPayable)}
                  </option>
                ))}
              </Select>
            </FormRow>
            {!payrollId && (
              <FormRow label="Or tag employee" htmlFor="rec-emp">
                <Select id="rec-emp" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                  <option value="">Optional…</option>
                  {(people.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {fullName(p)} ({p.employeeId})
                    </option>
                  ))}
                </Select>
              </FormRow>
            )}
          </>
        )}
      </form>
    </Dialog>
  );
}
