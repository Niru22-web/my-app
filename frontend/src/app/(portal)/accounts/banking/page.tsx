"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CheckCircle2, Download, Landmark, Link2, Plus, Sparkles, Trash2, Unlink, Upload } from "lucide-react";
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
import { claimant } from "@/components/claims/api";
import { fullName, useClientOptions, usePeople } from "@/components/management/api";
import {
  isPayable,
  outstanding,
  useAccountsMutations,
  useEntities,
  useInvoices,
  usePayableClaims,
  usePayrolls,
  useTransactions,
  type BankTransaction,
  type MatchSuggestion,
  type ReconcileBody,
} from "@/components/accounts/api";
import { parseBankCsv, type ParsedStatementLine } from "@/components/accounts/bank-csv";
import { ReasonDialog } from "@/components/accounts/reason-dialog";

const isCredit = (t: BankTransaction) => t.type.toUpperCase() === "CREDIT";

/** What a matched bank line is linked to, in plain words. */
function matchLabel(t: BankTransaction): string {
  const k = t.match?.kind;
  if (k === "RECEIPT") return t.invoice ? `Receipt ${t.match?.receipt?.receiptNumber ?? ""} · ${t.invoice.invoiceNumber}`.trim() : `Advance from ${t.client?.name ?? "client"}${t.match?.receipt ? ` · ${t.match.receipt.receiptNumber}` : ""}`;
  if (k === "PAYROLL") return t.payroll ? `Salary ${String(t.payroll.month).padStart(2, "0")}/${t.payroll.year} · ${fullName(t.employee)}` : `Salary · ${fullName(t.employee)}`;
  if (k === "CLAIM") return t.match?.claim ? `Claim ${t.match.claim.claimId} (${t.match.claim.category}) · ${fullName(t.employee)}` : "Expense claim";
  if (k === "OTHER") return t.employee ? `Other · ${fullName(t.employee)}` : "Other (bank charges, interest, transfer)";
  return t.invoice?.invoiceNumber ?? t.client?.name ?? (t.employee ? fullName(t.employee) : "Matched");
}

function unmatchEffect(t: BankTransaction): string {
  switch (t.match?.kind) {
    case "RECEIPT":
      return `Receipt ${t.match.receipt?.receiptNumber ?? ""} is reversed${t.invoice ? `, and ${t.invoice.invoiceNumber} is open for payment again` : ""}.`;
    case "PAYROLL":
      return "The salary goes back to unpaid and the employee ledger payment is reversed.";
    case "CLAIM":
      return "The expense claim goes back to approved, waiting for payment.";
    case "OTHER":
      return "Nothing else changes — the line just goes back to unmatched.";
    default:
      return "Whatever the match recorded is undone.";
  }
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
  const [unmatching, setUnmatching] = useState<BankTransaction | null>(null);
  const [deleting, setDeleting] = useState<BankTransaction | null>(null);
  const [review, setReview] = useState<{ suggestions: MatchSuggestion[]; scanned: number } | null>(null);

  const all = useMemo(() => q.data ?? [], [q.data]);
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return all.filter((t) => {
      if (entityFilter && t.entityId !== entityFilter) return false;
      if (statusFilter !== "all" && t.mappedStatus !== statusFilter) return false;
      if (typeFilter !== "all" && t.type.toUpperCase() !== typeFilter) return false;
      if (s && !`${t.description} ${t.bankReference ?? ""} ${t.client?.name ?? ""} ${t.invoice?.invoiceNumber ?? ""} ${t.match?.receipt?.receiptNumber ?? ""}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [all, entityFilter, statusFilter, typeFilter, search]);
  const filtered = !!(entityFilter || statusFilter !== "all" || typeFilter !== "all" || search.trim());

  const stats = useMemo(() => {
    let reconciled = 0, unmappedCredits = 0, unmappedDebits = 0, unmappedCreditCount = 0, unmappedDebitCount = 0, total = 0;
    for (const t of all) {
      if (entityFilter && t.entityId !== entityFilter) continue;
      total++;
      if (t.mappedStatus === "RECONCILED") reconciled++;
      else if (isCredit(t)) (unmappedCredits += Math.abs(t.amount)), unmappedCreditCount++;
      else (unmappedDebits += Math.abs(t.amount)), unmappedDebitCount++;
    }
    return { total, reconciled, unmappedCredits, unmappedDebits, unmappedCreditCount, unmappedDebitCount };
  }, [all, entityFilter]);

  const findMatches = () =>
    m.suggestMatches.mutate(entityFilter || undefined, {
      onSuccess: (res) =>
        res.suggestions.length
          ? setReview({ suggestions: res.suggestions, scanned: res.scanned })
          : toast.info("No likely matches found", `Checked ${res.scanned} unmatched line(s). Use Match on a line to do it by hand.`),
      onError: (e) => toast.error("Couldn’t look for matches", e instanceof ApiError ? e.message : undefined),
    });

  const columns: Column<BankTransaction>[] = [
    { key: "date", header: "Date", sortValue: (t) => workDate(t.date), cell: (t) => <span className="tabular text-ink-muted">{formatDate(t.date)}</span> },
    {
      key: "desc",
      header: "Statement line",
      sortValue: (t) => t.description,
      cell: (t) => (
        <div className="max-w-md">
          <p className="truncate font-medium text-ink">{t.description}</p>
          <p className="truncate text-xs text-ink-subtle">{[t.bankReference && !t.bankReference.startsWith("FP-") ? `Ref: ${t.bankReference}` : null, t.entity?.name].filter(Boolean).join(" · ") || "—"}</p>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      sortValue: (t) => t.type,
      cell: (t) =>
        isCredit(t) ? (
          <Badge tone="success">
            <ArrowDownLeft className="mr-1 inline h-3 w-3" /> Money in
          </Badge>
        ) : (
          <Badge tone="warning">
            <ArrowUpRight className="mr-1 inline h-3 w-3" /> Money out
          </Badge>
        ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      sortValue: (t) => Math.abs(t.amount),
      cell: (t) => (
        <span className={`font-semibold tabular ${isCredit(t) ? "text-success" : "text-ink"}`}>
          {isCredit(t) ? "+" : "−"}
          {formatCurrency(Math.abs(t.amount))}
        </span>
      ),
    },
    {
      key: "status",
      header: "Matched to",
      sortValue: (t) => t.mappedStatus,
      exportValue: (t) => (t.mappedStatus === "RECONCILED" ? matchLabel(t) : "Unmatched"),
      cell: (t) =>
        t.mappedStatus !== "RECONCILED" ? (
          <Badge tone="neutral">Unmatched</Badge>
        ) : (
          <div className="max-w-[16rem] space-y-0.5 text-xs">
            <Badge tone="brand">Matched</Badge>
            {t.invoice ? (
              <Link href={`/accounts/invoices/${t.invoice.id}`} className="block truncate font-medium text-brand hover:underline">
                {matchLabel(t)}
              </Link>
            ) : (
              <span className="block truncate text-ink-muted">{matchLabel(t)}</span>
            )}
          </div>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (t) => (
        <div className="flex items-center justify-end gap-1.5">
          {t.mappedStatus === "RECONCILED" ? (
            <Button variant="ghost" size="sm" onClick={() => setUnmatching(t)}>
              <Unlink className="h-3.5 w-3.5" /> Un-match
            </Button>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={() => setReconciling(t)}>
                <Link2 className="h-3.5 w-3.5" /> Match
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDeleting(t)} aria-label="Delete statement line">
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
        description="Import bank statements, then match money in to invoices and money out to salaries or expense claims. Suggested matches are only applied after you confirm them."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" loading={m.suggestMatches.isPending} disabled={!stats.unmappedCreditCount && !stats.unmappedDebitCount} onClick={findMatches}>
              <Sparkles className="h-4 w-4" /> Suggest matches
            </Button>
            <Button variant="secondary" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add line
            </Button>
            <Button onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" /> Import statement
            </Button>
          </div>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Statement lines" icon={Landmark} tone="brand" loading={q.isLoading} value={String(stats.total)} />
        <StatCard label="Matched" icon={CheckCircle2} tone="success" loading={q.isLoading} value={String(stats.reconciled)} hint={stats.total ? `${Math.round((stats.reconciled / stats.total) * 100)}% matched` : undefined} />
        <StatCard label="Unmatched money in" icon={ArrowDownLeft} tone={stats.unmappedCreditCount ? "warning" : "neutral"} loading={q.isLoading} value={formatCurrency(stats.unmappedCredits)} hint={`${stats.unmappedCreditCount} line(s)`} />
        <StatCard label="Unmatched money out" icon={ArrowUpRight} loading={q.isLoading} value={formatCurrency(stats.unmappedDebits)} hint={`${stats.unmappedDebitCount} line(s)`} />
      </section>

      <DataTable
        exportName={false}
        itemsLabel="bank lines"
        filterTabs={[
          { key: "all", label: "All", count: stats.total },
          { key: "UNMAPPED", label: "Unmatched", count: all.filter((t) => (!entityFilter || t.entityId === entityFilter) && t.mappedStatus === "UNMAPPED").length },
          { key: "RECONCILED", label: "Matched", count: stats.reconciled },
        ]}
        activeFilterTab={statusFilter}
        onFilterTabChange={(k) => setStatusFilter(k as "all" | "UNMAPPED" | "RECONCILED")}
        searchable
        searchPlaceholder="Search narration, ref, client…"
        searchValue={search}
        onSearchChange={setSearch}
        toolbarActions={
          <>
            <Select aria-label="Money in or out" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as "all" | "CREDIT" | "DEBIT")} className="w-36">
              <option value="all">In &amp; out</option>
              <option value="CREDIT">Money in</option>
              <option value="DEBIT">Money out</option>
            </Select>
            {(entities.data?.length ?? 0) > 1 && (
              <Select aria-label="Billing entity" value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} className="w-44">
                <option value="">All entities</option>
                {entities.data!.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            )}
            <Button
              variant="secondary"
              size="sm"
              disabled={!rows.length}
              onClick={() =>
                downloadCsv(
                  `bank-transactions-${today()}.csv`,
                  ["Date", "Entity", "Reference", "Description", "Type", "Amount (₹)", "Status", "Matched to"],
                  rows.map((r) => [workDate(r.date), r.entity?.name ?? "", r.bankReference ?? "", r.description, isCredit(r) ? "Money in" : "Money out", Math.abs(r.amount).toFixed(2), r.mappedStatus === "RECONCILED" ? "Matched" : "Unmatched", r.mappedStatus === "RECONCILED" ? matchLabel(r) : ""]),
                )
              }
            >
              <Download className="h-4 w-4" /> Export
            </Button>
          </>
        }
        rows={rows}
        columns={columns}
        rowKey={(t) => t.id}
        loading={q.isLoading}
        initialSort={{ key: "date", dir: "desc" }}
        pageSize={25}
        empty={
          all.length && filtered
            ? { icon: Landmark, title: "No transactions match these filters" }
            : { icon: Landmark, title: "No bank transactions yet", description: "Import a bank statement (CSV) or add a line by hand." }
        }
      />

      {importOpen && <ImportCsvDialog entities={entities.data ?? []} defaultEntity={entityFilter} onClose={() => setImportOpen(false)} />}
      {addOpen && <AddTransactionDialog entities={entities.data ?? []} defaultEntity={entityFilter} onClose={() => setAddOpen(false)} />}
      {reconciling && <ReconcileDialog txn={reconciling} onClose={() => setReconciling(null)} />}
      {review && <ReviewMatchesDialog suggestions={review.suggestions} scanned={review.scanned} lines={all} onClose={() => setReview(null)} />}
      {unmatching && (
        <ReasonDialog
          title="Un-match this bank line?"
          description={
            <>
              <span className="block">
                {unmatching.description} · {formatCurrency(Math.abs(unmatching.amount))} — matched to {matchLabel(unmatching)}.
              </span>
              <span className="mt-2 block">{unmatchEffect(unmatching)}</span>
            </>
          }
          placeholder="e.g. Matched to the wrong invoice"
          confirmLabel="Un-match"
          busy={m.reconcileTransaction.isPending}
          onClose={() => setUnmatching(null)}
          onConfirm={(reason) =>
            m.reconcileTransaction.mutate(
              { id: unmatching.id, body: { mappedStatus: "UNMAPPED", reason } },
              {
                onSuccess: () => (toast.success("Bank line un-matched"), setUnmatching(null)),
                onError: (e) => toast.error("Couldn’t un-match", e instanceof ApiError ? e.message : undefined),
              },
            )
          }
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        tone="danger"
        title="Delete statement line?"
        description={deleting ? `Remove “${deleting.description}” (${formatCurrency(Math.abs(deleting.amount))})? Use this only for a line imported by mistake.` : ""}
        confirmLabel="Delete"
        busy={m.deleteTransaction.isPending}
        onConfirm={() =>
          deleting &&
          m.deleteTransaction.mutate(deleting.id, {
            onSuccess: () => (toast.success("Statement line deleted"), setDeleting(null)),
            onError: (e) => (toast.error("Couldn’t delete", e instanceof ApiError ? e.message : undefined), setDeleting(null)),
          })
        }
      />
    </div>
  );
}

function ReviewMatchesDialog({ suggestions, scanned, lines, onClose }: { suggestions: MatchSuggestion[]; scanned: number; lines: BankTransaction[]; onClose: () => void }) {
  const toast = useToast();
  const m = useAccountsMutations();
  const byId = useMemo(() => new Map(lines.map((t) => [t.id, t])), [lines]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(suggestions.filter((s) => s.confidence === "high").map((s) => s.transactionId)));
  const [failures, setFailures] = useState<{ transactionId: string; message?: string }[]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const remaining = suggestions.filter((s) => !done.has(s.transactionId));
  const toggle = (id: string) => setPicked((p) => (p.has(id) ? new Set([...p].filter((x) => x !== id)) : new Set([...p, id])));

  function confirm() {
    const matches = remaining.filter((s) => picked.has(s.transactionId)).map((s) => ({ transactionId: s.transactionId, kind: s.kind, targetId: s.targetId }));
    if (!matches.length) return;
    m.confirmMatches.mutate(matches, {
      onSuccess: (res) => {
        const ok = res.results.filter((r) => r.ok).map((r) => r.transactionId);
        const bad = res.results.filter((r) => !r.ok);
        setDone((d) => new Set([...d, ...ok]));
        setFailures(bad);
        if (ok.length) toast.success(`Matched ${ok.length} bank line(s)`);
        if (bad.length) toast.error(`${bad.length} match(es) couldn’t be applied`, "See the reasons in the list.");
        else onClose();
      },
      onError: (e) => toast.error("Couldn’t confirm the matches", e instanceof ApiError ? e.message : undefined),
    });
  }

  const failed = new Map(failures.map((f) => [f.transactionId, f.message ?? "Couldn’t apply this match."]));
  const count = remaining.filter((s) => picked.has(s.transactionId)).length;
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Review suggested matches"
      description={`${suggestions.length} suggestion(s) from ${scanned} unmatched line(s). Nothing is changed until you confirm. Strong matches are ticked; check the others before ticking them.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button onClick={confirm} disabled={!count} loading={m.confirmMatches.isPending}>
            Confirm selected{count ? ` (${count})` : ""}
          </Button>
        </>
      }
    >
      <ul className="divide-y divide-line rounded-xl border border-line">
        {suggestions.map((s) => {
          const t = byId.get(s.transactionId);
          const isDone = done.has(s.transactionId);
          const err = failed.get(s.transactionId);
          return (
            <li key={s.transactionId} className={`flex gap-3 px-3.5 py-3 text-[13px] ${isDone ? "opacity-60" : ""}`}>
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 accent-brand"
                aria-label={`Confirm match for ${t?.description ?? "bank line"}`}
                checked={isDone || picked.has(s.transactionId)}
                disabled={isDone}
                onChange={() => toggle(s.transactionId)}
              />
              <div className="grid min-w-0 flex-1 gap-1 sm:grid-cols-2 sm:gap-4">
                <div className="min-w-0">
                  <p className="text-xs text-ink-subtle">Bank line</p>
                  <p className="font-medium text-ink">
                    {t ? `${formatDate(t.date)} · ${isCredit(t) ? "+" : "−"}${formatCurrency(Math.abs(t.amount))}` : "—"}
                  </p>
                  <p className="truncate text-ink-muted" title={t?.description}>
                    {t?.description}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-ink-subtle">Proposed match</p>
                  <p className="truncate font-medium text-ink" title={s.label}>
                    {s.label}
                  </p>
                  <p className="text-ink-muted">
                    {s.reason} · <Badge tone={s.confidence === "high" ? "success" : "warning"}>{s.confidence === "high" ? "Strong" : "Check"}</Badge>
                  </p>
                  {isDone && <p className="mt-0.5 text-success">Matched</p>}
                  {err && (
                    <p className="mt-0.5 flex items-start gap-1.5 text-danger">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {err}
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}

function ImportCsvDialog({ entities, defaultEntity, onClose }: { entities: { id: string; name: string; status?: string }[]; defaultEntity: string; onClose: () => void }) {
  const toast = useToast();
  const m = useAccountsMutations();
  const active = entities.filter((e) => e.status !== "INACTIVE");
  const [entityId, setEntityId] = useState(defaultEntity || (active.length === 1 ? active[0].id : ""));
  const [lines, setLines] = useState<ParsedStatementLine[]>([]);
  const [fileError, setFileError] = useState("");
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<{ count: number; duplicates: number; invalid: { line: number; reason: string }[] } | null>(null);
  const good = lines.filter((l) => !l.problem);
  const bad = lines.filter((l) => l.problem);

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setResult(null);
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const res = parseBankCsv(String(reader.result ?? ""));
      setLines(res.lines);
      setFileError(res.error);
    };
    reader.onerror = () => setFileError("The file couldn’t be read.");
    reader.readAsText(file);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!entityId || !good.length) return;
    try {
      const res = await m.importBankStatements.mutateAsync({
        entityId,
        statements: good.map((l) => ({ date: l.date, description: l.description, bankReference: l.bankReference || undefined, type: l.type, amount: l.amount, balance: l.balance })),
      });
      // The server numbers lines in the order sent; map them back to lines in the file.
      const invalid = (res.invalid ?? []).map((x) => ({ line: good[x.line - 1]?.line ?? x.line, reason: x.reason }));
      const duplicates = res.duplicates ?? 0;
      toast.success(`Imported ${res.count} line(s)`, duplicates ? `${duplicates} were already imported and were skipped.` : undefined);
      if (duplicates || invalid.length || bad.length) setResult({ count: res.count, duplicates, invalid });
      else onClose();
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
      description="Lines already imported are skipped automatically, so importing the same statement twice is safe."
      footer={
        result ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="csv-import-form" disabled={!entityId || !good.length} loading={m.importBankStatements.isPending}>
              Import {good.length ? `${good.length} line(s)` : ""}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3 text-sm">
          <p className="flex items-center gap-2 text-success">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> {result.count} line(s) imported.
          </p>
          {result.duplicates > 0 && <p className="text-ink-muted">{result.duplicates} line(s) were already imported earlier and were skipped.</p>}
          {(bad.length > 0 || result.invalid.length > 0) && (
            <div>
              <p className="font-medium text-ink">Not imported — fix these in the file and import it again:</p>
              <ul className="mt-1 max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5 text-[13px] text-danger">
                {bad.map((l) => (
                  <li key={`f${l.line}`}>
                    Line {l.line}: {l.problem}
                  </li>
                ))}
                {result.invalid.map((x) => (
                  <li key={`s${x.line}`}>
                    Line {x.line}: {x.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <form id="csv-import-form" onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormRow label="Bank account of" htmlFor="imp-entity" required>
              <Select id="imp-entity" value={entityId} onChange={(e) => setEntityId(e.target.value)}>
                <option value="">Choose entity…</option>
                {active.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            </FormRow>
            <FormRow label="Statement CSV file" htmlFor="imp-file" required hint="Columns: Date, Narration/Description, Ref/UTR, and Credit + Debit (or Amount + Dr/Cr)">
              <Input id="imp-file" type="file" accept=".csv,text/csv" onChange={handleFile} />
            </FormRow>
          </div>

          {fileError && (
            <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {fileError}
            </p>
          )}
          {bad.length > 0 && (
            <p className="text-[13px] text-warning">
              {bad.length} line(s) can’t be read and won’t be imported — they’re shown in red below.
            </p>
          )}

          {lines.length > 0 && (
            <div className="max-h-72 overflow-y-auto rounded-xl border border-line">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-muted text-left text-ink-subtle">
                  <tr>
                    <th className="px-3 py-2">Line</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2">In / out</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[...bad, ...good].slice(0, 100).map((r) => (
                    <tr key={r.line} className={r.problem ? "bg-danger-soft/40 text-danger" : undefined}>
                      <td className="px-3 py-1.5 tabular">{r.line}</td>
                      <td className="px-3 py-1.5 tabular">{r.date ? formatDate(r.date) : "—"}</td>
                      <td className="max-w-xs px-3 py-1.5">
                        <span className="block truncate">{r.description || "—"}</span>
                        {r.problem && <span className="block font-medium">Can’t import: {r.problem}</span>}
                      </td>
                      <td className="px-3 py-1.5">{r.type === "CREDIT" ? "In" : "Out"}</td>
                      <td className="px-3 py-1.5 text-right font-medium tabular">{r.amount ? formatCurrency(r.amount) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {lines.length > 100 && <p className="border-t border-line px-3 py-2 text-xs text-ink-subtle">Showing 100 of {lines.length} lines from {fileName}.</p>}
            </div>
          )}
        </form>
      )}
    </Dialog>
  );
}

function AddTransactionDialog({ entities, defaultEntity, onClose }: { entities: { id: string; name: string; status?: string }[]; defaultEntity: string; onClose: () => void }) {
  const toast = useToast();
  const m = useAccountsMutations();
  const active = entities.filter((e) => e.status !== "INACTIVE");
  const [entityId, setEntityId] = useState(defaultEntity || (active.length === 1 ? active[0].id : ""));
  const [date, setDate] = useState(today());
  const [type, setType] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [amount, setAmount] = useState("");
  const [bankReference, setBankReference] = useState("");
  const [description, setDescription] = useState("");
  const [tried, setTried] = useState(false);
  const amt = Number(amount);
  const errors = {
    entityId: !entityId ? "Choose the entity." : "",
    date: !date ? "Choose a date." : date > today() ? "Can’t be in the future." : "",
    amount: !(amt > 0) ? "Enter the amount." : "",
    description: !description.trim() ? "Enter the narration." : "",
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.values(errors).some(Boolean)) return;
    try {
      const res = await m.importBankStatements.mutateAsync({
        entityId,
        statements: [{ date, description: description.trim(), bankReference: bankReference.trim() || undefined, type, amount: amt }],
      });
      if (res.count) toast.success("Bank line added");
      else if (res.duplicates) toast.info("Already recorded", "A line with the same details is already there.");
      else toast.error("Couldn’t add the line", res.invalid?.[0]?.reason);
      if (res.count || res.duplicates) onClose();
    } catch (err) {
      toast.error("Couldn’t save", err instanceof ApiError ? err.message : undefined);
    }
  }

  const show = (k: keyof typeof errors) => (tried ? errors[k] || undefined : undefined);
  return (
    <Dialog
      open
      onClose={onClose}
      title="Add a bank line"
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
      <form id="add-txn-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Bank account of" htmlFor="tx-entity" required error={show("entityId")}>
          <Select id="tx-entity" value={entityId} onChange={(e) => setEntityId(e.target.value)} invalid={!!show("entityId")}>
            <option value="">Choose…</option>
            {active.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Date" htmlFor="tx-date" required error={show("date")}>
          <Input id="tx-date" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} invalid={!!show("date")} />
        </FormRow>
        <FormRow label="Money in or out" htmlFor="tx-type" required>
          <Select id="tx-type" value={type} onChange={(e) => setType(e.target.value as "CREDIT" | "DEBIT")}>
            <option value="CREDIT">Money in (credit)</option>
            <option value="DEBIT">Money out (debit)</option>
          </Select>
        </FormRow>
        <FormRow label="Amount (₹)" htmlFor="tx-amt" required error={show("amount")}>
          <Input id="tx-amt" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} invalid={!!show("amount")} />
        </FormRow>
        <FormRow label="UTR / bank reference" htmlFor="tx-ref" className="sm:col-span-2" hint="Optional">
          <Input id="tx-ref" value={bankReference} onChange={(e) => setBankReference(e.target.value)} />
        </FormRow>
        <FormRow label="Narration" htmlFor="tx-desc" required className="sm:col-span-2" error={show("description")}>
          <Input id="tx-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="As shown on the statement" invalid={!!show("description")} />
        </FormRow>
      </form>
    </Dialog>
  );
}

type Target = "INVOICE" | "ADVANCE" | "PAYROLL" | "CLAIM" | "OTHER";

function ReconcileDialog({ txn, onClose }: { txn: BankTransaction; onClose: () => void }) {
  const toast = useToast();
  const m = useAccountsMutations();
  const credit = isCredit(txn);
  const invoices = useInvoices(credit);
  const clients = useClientOptions(credit);
  const payrolls = usePayrolls(!credit);
  const claims = usePayableClaims(!credit);
  const people = usePeople(!credit);

  const [target, setTarget] = useState<Target>(credit ? "INVOICE" : "PAYROLL");
  const [invoiceId, setInvoiceId] = useState("");
  const [clientId, setClientId] = useState("");
  const [payrollId, setPayrollId] = useState("");
  const [claimId, setClaimId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [tried, setTried] = useState(false);

  const openInvoices = useMemo(
    () => (invoices.data ?? []).filter((i) => i.entityId === txn.entityId && i.currency === "INR" && isPayable(i) && outstanding(i) > 0),
    [invoices.data, txn.entityId],
  );
  const pendingPayrolls = useMemo(() => (payrolls.data ?? []).filter((p) => p.entityId === txn.entityId && p.status === "PENDING"), [payrolls.data, txn.entityId]);
  const amt = Math.abs(txn.amount);
  const near = (x: number) => Math.abs(x - amt) < 1;

  const error =
    target === "INVOICE" && !invoiceId ? "Choose the invoice." : target === "ADVANCE" && !clientId ? "Choose the client." : target === "PAYROLL" && !payrollId ? "Choose the salary." : target === "CLAIM" && !claimId ? "Choose the claim." : "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (error) return;
    const body: ReconcileBody =
      target === "INVOICE" ? { invoiceId } : target === "ADVANCE" ? { clientId } : target === "PAYROLL" ? { payrollId } : target === "CLAIM" ? { claimId } : employeeId ? { employeeId } : {};
    try {
      await m.reconcileTransaction.mutateAsync({ id: txn.id, body });
      toast.success("Bank line matched", target === "INVOICE" || target === "ADVANCE" ? "A receipt was recorded for this money." : target === "PAYROLL" ? "The salary is marked paid." : target === "CLAIM" ? "The claim is marked paid." : undefined);
      onClose();
    } catch (err) {
      toast.error("Couldn’t match", err instanceof ApiError ? err.message : undefined);
    }
  }

  const options: { value: Target; label: string }[] = credit
    ? [
        { value: "INVOICE", label: "Invoice" },
        { value: "ADVANCE", label: "Advance from client" },
        { value: "OTHER", label: "Other" },
      ]
    : [
        { value: "PAYROLL", label: "Salary" },
        { value: "CLAIM", label: "Approved claim" },
        { value: "OTHER", label: "Other" },
      ];

  return (
    <Dialog
      open
      onClose={onClose}
      title="Match bank line"
      description={`${formatDate(txn.date)} · ${txn.description} · ${credit ? "+" : "−"}${formatCurrency(amt)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="reconcile-form" loading={m.reconcileTransaction.isPending}>
            Match
          </Button>
        </>
      }
    >
      <div className="mb-4">
        <Segmented aria-label="Match to" value={target} onChange={(v) => (setTarget(v), setTried(false))} options={options} />
      </div>
      <form id="reconcile-form" onSubmit={submit} noValidate className="space-y-4">
        {target === "INVOICE" && (
          <FormRow
            label="Invoice"
            htmlFor="rec-inv"
            required
            error={tried ? error || undefined : undefined}
            hint={!invoices.isLoading && !openInvoices.length ? "No unpaid ₹ invoice for this entity. Invoices in other currencies are recorded on the Receipts page." : "A receipt is recorded and applied to this invoice first; any extra is kept as an advance."}
          >
            <Select id="rec-inv" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} invalid={tried && !!error}>
              <option value="">Choose…</option>
              {openInvoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {near(outstanding(inv)) ? "✓ " : ""}
                  {inv.invoiceNumber} · {inv.client?.name} · due {formatCurrency(outstanding(inv))}
                </option>
              ))}
            </Select>
          </FormRow>
        )}
        {target === "ADVANCE" && (
          <FormRow label="Client" htmlFor="rec-client" required error={tried ? error || undefined : undefined} hint="Recorded as a receipt and kept as an advance; it’s applied when the client’s next invoice is issued.">
            <Select id="rec-client" value={clientId} onChange={(e) => setClientId(e.target.value)} invalid={tried && !!error}>
              <option value="">Choose…</option>
              {(clients.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FormRow>
        )}
        {target === "PAYROLL" && (
          <FormRow label="Unpaid salary" htmlFor="rec-pay" required error={tried ? error || undefined : undefined} hint={!payrolls.isLoading && !pendingPayrolls.length ? "No unpaid salary for this entity." : "Marks the salary paid on the bank date."}>
            <Select id="rec-pay" value={payrollId} onChange={(e) => setPayrollId(e.target.value)} invalid={tried && !!error}>
              <option value="">Choose…</option>
              {pendingPayrolls.map((p) => (
                <option key={p.id} value={p.id}>
                  {near(p.netPayable) ? "✓ " : ""}
                  {fullName(p.employee)} · {String(p.month).padStart(2, "0")}/{p.year} · {formatCurrency(p.netPayable)}
                </option>
              ))}
            </Select>
          </FormRow>
        )}
        {target === "CLAIM" && (
          <FormRow
            label="Approved claim"
            htmlFor="rec-claim"
            required
            error={tried ? error || undefined : undefined}
            hint={claims.isError ? "Claims couldn’t be loaded." : !claims.isLoading && !(claims.data ?? []).length ? "No approved claim is waiting for payment." : "Marks the claim paid on the bank date."}
          >
            <Select id="rec-claim" value={claimId} onChange={(e) => setClaimId(e.target.value)} invalid={tried && !!error}>
              <option value="">Choose…</option>
              {(claims.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {near(c.amount) ? "✓ " : ""}
                  {c.claimId} · {claimant(c)} · {c.category} · {formatCurrency(c.amount)}
                </option>
              ))}
            </Select>
          </FormRow>
        )}
        {target === "OTHER" && (
          <>
            <p className="text-[13px] text-ink-muted">For bank charges, interest, transfers between accounts and similar. The line is marked matched and nothing else changes.</p>
            {!credit && (
              <FormRow label="Employee" htmlFor="rec-emp" hint="Optional">
                <Select id="rec-emp" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                  <option value="">None</option>
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
        {(target === "INVOICE" || target === "PAYROLL" || target === "CLAIM") && <p className="text-xs text-ink-subtle">✓ = amount agrees with this bank line.</p>}
      </form>
    </Dialog>
  );
}
