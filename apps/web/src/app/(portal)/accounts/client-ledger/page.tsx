"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { BookOpen, Download, Plus } from "lucide-react";
import { ApiError } from "@/lib/api";
import { today, workDate } from "@/lib/dates";
import { formatCurrency, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { FormRow, Input, Select } from "@/components/ui/inputs";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { downloadCsv } from "@/components/claims/claim-tabs";
import { fullName, useClientOptions, usePeople } from "@/components/management/api";
import {
  isIssued,
  toInr,
  useAccountsMutations,
  useEntities,
  useInvoices,
  useLedgers,
  useReceipts,
} from "@/components/accounts/api";

interface Line {
  date: string;
  kind: string;
  ref: string;
  href?: string;
  detail: string;
  debit: number;
  credit: number;
  balance: number;
}

export default function StatementsAndLedgersPage() {
  const [mode, setMode] = useState<"client" | "employee" | "general">("client");
  const [journalOpen, setJournalOpen] = useState(false);
  const entities = useEntities();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          aria-label="Ledger section"
          value={mode}
          onChange={setMode}
          options={[
            { value: "client", label: "Client statements" },
            { value: "employee", label: "Employee ledger" },
            { value: "general", label: "General ledger" },
          ]}
        />
        {mode !== "client" && (
          <Button variant="secondary" size="sm" onClick={() => setJournalOpen(true)}>
            <Plus className="h-4 w-4" /> Add journal entry
          </Button>
        )}
      </div>

      {mode === "client" ? <ClientStatements /> : mode === "employee" ? <EmployeeLedgerView /> : <GeneralLedgerView />}

      {journalOpen && <JournalDialog entities={entities.data ?? []} onClose={() => setJournalOpen(false)} />}
    </div>
  );
}

/** Client statement in ₹, built from issued invoices and receipts. */
function ClientStatements() {
  const inv = useInvoices();
  const rec = useReceipts();
  const [clientId, setClient] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(today());

  const clients = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of inv.data ?? []) if (isIssued(i)) m.set(i.clientId, i.client?.name ?? "—");
    for (const r of rec.data ?? []) m.set(r.clientId, r.client?.name ?? m.get(r.clientId) ?? "—");
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [inv.data, rec.data]);

  const { opening, lines, closing } = useMemo(() => {
    const all: Omit<Line, "balance">[] = [
      ...(inv.data ?? [])
        .filter((i) => i.clientId === clientId && isIssued(i))
        .map((i) => ({
          date: workDate(i.issueDate),
          kind: "Invoice" as const,
          ref: i.invoiceNumber,
          href: `/accounts/invoices/${i.id}`,
          detail: i.currency !== "INR" ? `${formatCurrency(i.totalAmount, i.currency)} @ ${i.exchangeRate}` : i.entity?.name ?? "",
          debit: toInr(i.totalAmount, i.exchangeRate),
          credit: 0,
        })),
      ...(rec.data ?? [])
        .filter((r) => r.clientId === clientId)
        .map((r) => ({
          date: workDate(r.receiptDate),
          kind: "Receipt" as const,
          ref: r.receiptNumber,
          detail: [r.paymentMode, r.referenceNumber, r.currency !== "INR" ? `${formatCurrency(r.amount, r.currency)} @ ${r.exchangeRate}` : ""].filter(Boolean).join(" · "),
          debit: 0,
          credit: toInr(r.amount, r.exchangeRate),
        })),
    ].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "Invoice" ? -1 : 1));
    let bal = 0;
    let opening = 0;
    const out: Line[] = [];
    for (const l of all) {
      bal += l.debit - l.credit;
      if (from && l.date < from) {
        opening = bal;
        continue;
      }
      if (to && l.date > to) continue;
      out.push({ ...l, balance: bal });
    }
    return { opening, lines: out, closing: out.length ? out[out.length - 1].balance : opening };
  }, [inv.data, rec.data, clientId, from, to]);

  const name = clients.find(([id]) => id === clientId)?.[1] ?? "";
  const totals = lines.reduce((t, l) => ({ d: t.d + l.debit, c: t.c + l.credit }), { d: 0, c: 0 });

  if (inv.isError || rec.isError)
    return (
      <Card>
        <ErrorState message="Statement data couldn’t be loaded." onRetry={() => (inv.refetch(), rec.refetch())} />
      </Card>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Client statements"
        description="Issued invoices and receipts for a client, with the running balance in ₹"
        actions={
          <Button
            variant="secondary"
            disabled={!lines.length}
            onClick={() =>
              downloadCsv(`statement-${name.replace(/\W+/g, "-")}-${to}.csv`, ["Date", "Type", "Reference", "Detail", "Debit (₹)", "Credit (₹)", "Balance (₹)"], [
                ...(from ? [[from, "Opening balance", "", "", "", "", opening.toFixed(2)]] : []),
                ...lines.map((l) => [l.date, l.kind, l.ref, l.detail, l.debit ? l.debit.toFixed(2) : "", l.credit ? l.credit.toFixed(2) : "", l.balance.toFixed(2)]),
              ])
            }
          >
            <Download className="h-4 w-4" /> Export
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <FormRow label="Client" htmlFor="st-client">
          <Select id="st-client" value={clientId} onChange={(e) => setClient(e.target.value)}>
            <option value="">Choose…</option>
            {clients.map(([id, n]) => (
              <option key={id} value={id}>
                {n}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="From" htmlFor="st-from" hint="Optional">
          <Input id="st-from" type="date" max={to} value={from} onChange={(e) => setFrom(e.target.value)} />
        </FormRow>
        <FormRow label="To" htmlFor="st-to">
          <Input id="st-to" type="date" min={from || undefined} value={to} onChange={(e) => setTo(e.target.value)} />
        </FormRow>
      </div>

      <Card>
        {inv.isLoading || rec.isLoading ? (
          <Skeleton className="m-5 h-48" />
        ) : !clientId ? (
          <EmptyState icon={BookOpen} title="Choose a client" description={clients.length ? undefined : "No client has an issued invoice or a receipt yet."} />
        ) : (
          <div className="overflow-x-auto p-5">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-subtle">
                  <th className="py-2 font-medium">Date</th>
                  <th className="py-2 font-medium">Reference</th>
                  <th className="py-2 font-medium">Detail</th>
                  <th className="py-2 text-right font-medium">Debit</th>
                  <th className="py-2 text-right font-medium">Credit</th>
                  <th className="py-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {from && (
                  <tr className="border-b border-line bg-surface-muted/60">
                    <td className="py-2">{formatDate(from)}</td>
                    <td className="py-2 font-medium" colSpan={4}>
                      Opening balance
                    </td>
                    <td className="py-2 text-right font-semibold tabular">{formatCurrency(opening)}</td>
                  </tr>
                )}
                {lines.map((l, k) => (
                  <tr key={k} className="border-b border-line last:border-0">
                    <td className="py-2 text-ink-muted">{formatDate(l.date)}</td>
                    <td className="py-2">{l.href ? <Link href={l.href} className="font-medium text-ink hover:text-brand">{l.ref}</Link> : <span className="font-medium text-ink">{l.ref}</span>}</td>
                    <td className="max-w-[16rem] truncate py-2 text-ink-muted">{l.detail}</td>
                    <td className="py-2 text-right tabular">{l.debit ? formatCurrency(l.debit) : ""}</td>
                    <td className="py-2 text-right tabular text-success">{l.credit ? formatCurrency(l.credit) : ""}</td>
                    <td className="py-2 text-right font-medium tabular">{formatCurrency(l.balance)}</td>
                  </tr>
                ))}
                {!lines.length && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-ink-subtle">
                      Nothing in this period
                    </td>
                  </tr>
                )}
              </tbody>
              {lines.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-line font-semibold">
                    <td className="pt-2" colSpan={3}>
                      Closing balance {closing > 0 ? "(client owes)" : closing < 0 ? "(advance held)" : ""}
                    </td>
                    <td className="pt-2 text-right tabular">{formatCurrency(totals.d)}</td>
                    <td className="pt-2 text-right tabular">{formatCurrency(totals.c)}</td>
                    <td className="pt-2 text-right tabular">{formatCurrency(Math.abs(closing))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function EmployeeLedgerView() {
  const people = usePeople();
  const [employeeId, setEmployeeId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(today());
  const q = useLedgers({ type: "EMPLOYEE", employeeId: employeeId || undefined, from: from || undefined, to: to || undefined }, !!employeeId);

  const rows = q.data ?? [];
  const totals = rows.reduce((t, r) => ({ d: t.d + r.debit, c: t.c + r.credit }), { d: 0, c: 0 });
  const closing = rows.length ? (rows[rows.length - 1].runningBalance ?? 0) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employee ledger"
        description="Salary accruals, disbursements, and approved expense claims for an employee"
        actions={
          <Button
            variant="secondary"
            disabled={!rows.length}
            onClick={() =>
              downloadCsv(
                `employee-ledger-${to}.csv`,
                ["Date", "Entity", "Description", "Reference Type", "Debit (₹)", "Credit (₹)", "Running Balance (₹)"],
                rows.map((r) => [workDate(r.date), r.entity?.name ?? "", r.description, r.referenceType ?? "", r.debit.toFixed(2), r.credit.toFixed(2), (r.runningBalance ?? r.balance).toFixed(2)]),
              )
            }
          >
            <Download className="h-4 w-4" /> Export
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <FormRow label="Employee" htmlFor="el-emp">
          <Select id="el-emp" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Choose employee…</option>
            {(people.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {fullName(p)} ({p.employeeId})
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="From" htmlFor="el-from" hint="Optional">
          <Input id="el-from" type="date" max={to} value={from} onChange={(e) => setFrom(e.target.value)} />
        </FormRow>
        <FormRow label="To" htmlFor="el-to">
          <Input id="el-to" type="date" min={from || undefined} value={to} onChange={(e) => setTo(e.target.value)} />
        </FormRow>
      </div>

      <Card>
        {!employeeId ? (
          <EmptyState icon={BookOpen} title="Choose an employee" description="Select an employee to view their salary and reimbursement ledger." />
        ) : q.isLoading ? (
          <Skeleton className="m-5 h-48" />
        ) : q.isError ? (
          <ErrorState message="Employee ledger couldn’t be loaded." onRetry={() => q.refetch()} />
        ) : !rows.length ? (
          <EmptyState icon={BookOpen} title="No ledger entries for this employee in this period" />
        ) : (
          <div className="overflow-x-auto p-5">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-subtle">
                  <th className="py-2 font-medium">Date</th>
                  <th className="py-2 font-medium">Description</th>
                  <th className="py-2 font-medium">Entity</th>
                  <th className="py-2 text-right font-medium">Accrued (Dr)</th>
                  <th className="py-2 text-right font-medium">Paid (Cr)</th>
                  <th className="py-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="py-2 text-ink-muted">{formatDate(r.date)}</td>
                    <td className="py-2 font-medium text-ink">{r.description}</td>
                    <td className="py-2 text-ink-muted">{r.entity?.name ?? "—"}</td>
                    <td className="py-2 text-right tabular">{r.debit ? formatCurrency(r.debit) : ""}</td>
                    <td className="py-2 text-right tabular text-success">{r.credit ? formatCurrency(r.credit) : ""}</td>
                    <td className="py-2 text-right font-medium tabular">{formatCurrency(r.runningBalance ?? r.balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line font-semibold">
                  <td className="pt-2" colSpan={3}>
                    Net balance {closing > 0 ? "(payable to employee)" : closing < 0 ? "(advance)" : "(settled)"}
                  </td>
                  <td className="pt-2 text-right tabular">{formatCurrency(totals.d)}</td>
                  <td className="pt-2 text-right tabular">{formatCurrency(totals.c)}</td>
                  <td className="pt-2 text-right tabular">{formatCurrency(Math.abs(closing))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function GeneralLedgerView() {
  const entities = useEntities();
  const [entityId, setEntityId] = useState("");
  const [type, setType] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(today());

  const q = useLedgers({
    entityId: entityId || undefined,
    type: type !== "all" ? type : undefined,
    from: from || undefined,
    to: to || undefined,
  });

  const rows = q.data ?? [];
  const totals = rows.reduce((t, r) => ({ d: t.d + r.debit, c: t.c + r.credit }), { d: 0, c: 0 });
  const closing = rows.length ? (rows[rows.length - 1].runningBalance ?? 0) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="General ledger"
        description="Double-entry ledger postings across client invoices, receipts, payroll, claims, and manual journal entries"
        actions={
          <Button
            variant="secondary"
            disabled={!rows.length}
            onClick={() =>
              downloadCsv(
                `general-ledger-${to}.csv`,
                ["Date", "Entity", "Type", "Counterparty", "Description", "Debit (₹)", "Credit (₹)", "Running Balance (₹)"],
                rows.map((r) => [
                  workDate(r.date),
                  r.entity?.name ?? "",
                  r.type,
                  r.client?.name ?? (r.employee ? fullName(r.employee) : ""),
                  r.description,
                  r.debit.toFixed(2),
                  r.credit.toFixed(2),
                  (r.runningBalance ?? r.balance).toFixed(2),
                ]),
              )
            }
          >
            <Download className="h-4 w-4" /> Export
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <FormRow label="Billing entity" htmlFor="gl-ent">
          <Select id="gl-ent" value={entityId} onChange={(e) => setEntityId(e.target.value)}>
            <option value="">All entities</option>
            {(entities.data ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Ledger account" htmlFor="gl-type">
          <Select id="gl-type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">All accounts</option>
            <option value="CLIENT">Client receivables</option>
            <option value="EMPLOYEE">Employee payables</option>
            <option value="VENDOR">Vendor payables</option>
            <option value="GENERAL">General journal</option>
          </Select>
        </FormRow>
        <FormRow label="From" htmlFor="gl-from">
          <Input id="gl-from" type="date" max={to} value={from} onChange={(e) => setFrom(e.target.value)} />
        </FormRow>
        <FormRow label="To" htmlFor="gl-to">
          <Input id="gl-to" type="date" min={from || undefined} value={to} onChange={(e) => setTo(e.target.value)} />
        </FormRow>
      </div>

      <Card>
        {q.isLoading ? (
          <Skeleton className="m-5 h-48" />
        ) : q.isError ? (
          <ErrorState message="General ledger couldn’t be loaded." onRetry={() => q.refetch()} />
        ) : !rows.length ? (
          <EmptyState icon={BookOpen} title="No ledger postings match these filters" />
        ) : (
          <div className="overflow-x-auto p-5">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-subtle">
                  <th className="py-2 font-medium">Date</th>
                  <th className="py-2 font-medium">Account</th>
                  <th className="py-2 font-medium">Counterparty</th>
                  <th className="py-2 font-medium">Description</th>
                  <th className="py-2 text-right font-medium">Debit</th>
                  <th className="py-2 text-right font-medium">Credit</th>
                  <th className="py-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="py-2 text-ink-muted">{formatDate(r.date)}</td>
                    <td className="py-2">
                      <Badge>{r.type}</Badge>
                    </td>
                    <td className="py-2 text-ink-muted">{r.client?.name ?? (r.employee ? fullName(r.employee) : r.entity?.name ?? "—")}</td>
                    <td className="max-w-xs truncate py-2 font-medium text-ink">{r.description}</td>
                    <td className="py-2 text-right tabular">{r.debit ? formatCurrency(r.debit) : ""}</td>
                    <td className="py-2 text-right tabular text-success">{r.credit ? formatCurrency(r.credit) : ""}</td>
                    <td className="py-2 text-right font-medium tabular">{formatCurrency(r.runningBalance ?? r.balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line font-semibold">
                  <td className="pt-2" colSpan={4}>
                    Totals
                  </td>
                  <td className="pt-2 text-right tabular">{formatCurrency(totals.d)}</td>
                  <td className="pt-2 text-right tabular">{formatCurrency(totals.c)}</td>
                  <td className="pt-2 text-right tabular">{formatCurrency(closing)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function JournalDialog({ entities, onClose }: { entities: { id: string; name: string }[]; onClose: () => void }) {
  const toast = useToast();
  const m = useAccountsMutations();
  const clients = useClientOptions();
  const people = usePeople();

  const [entityId, setEntityId] = useState(entities[0]?.id ?? "");
  const [type, setType] = useState("GENERAL");
  const [clientId, setClientId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState("");
  const [debit, setDebit] = useState("0");
  const [credit, setCredit] = useState("0");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const d = Number(debit) || 0;
    const c = Number(credit) || 0;
    if (!entityId || !description.trim() || (d <= 0 && c <= 0)) return;
    try {
      await m.createLedgerEntry.mutateAsync({
        entityId,
        type,
        clientId: type === "CLIENT" ? clientId || null : null,
        employeeId: type === "EMPLOYEE" ? employeeId || null : null,
        date,
        description: description.trim(),
        debit: d,
        credit: c,
      });
      toast.success("Journal entry posted");
      onClose();
    } catch (err) {
      toast.error("Couldn’t post entry", err instanceof ApiError ? err.message : undefined);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add ledger journal entry"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="journal-form"
            disabled={!entityId || !description.trim() || ((Number(debit) || 0) <= 0 && (Number(credit) || 0) <= 0)}
            loading={m.createLedgerEntry.isPending}
          >
            Post entry
          </Button>
        </>
      }
    >
      <form id="journal-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Billing entity" htmlFor="jn-ent" required>
          <Select id="jn-ent" value={entityId} onChange={(e) => setEntityId(e.target.value)}>
            <option value="">Choose…</option>
            {entities.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Ledger account" htmlFor="jn-type" required>
          <Select id="jn-type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="GENERAL">General journal</option>
            <option value="CLIENT">Client account</option>
            <option value="EMPLOYEE">Employee account</option>
            <option value="VENDOR">Vendor account</option>
          </Select>
        </FormRow>
        {type === "CLIENT" && (
          <FormRow label="Client" htmlFor="jn-client" className="sm:col-span-2">
            <Select id="jn-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Choose client…</option>
              {(clients.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FormRow>
        )}
        {type === "EMPLOYEE" && (
          <FormRow label="Employee" htmlFor="jn-emp" className="sm:col-span-2">
            <Select id="jn-emp" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Choose employee…</option>
              {(people.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {fullName(p)} ({p.employeeId})
                </option>
              ))}
            </Select>
          </FormRow>
        )}
        <FormRow label="Date" htmlFor="jn-date" required>
          <Input id="jn-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </FormRow>
        <span />
        <FormRow label="Debit (₹)" htmlFor="jn-dr">
          <Input id="jn-dr" type="number" min="0" step="0.01" value={debit} onChange={(e) => setDebit(e.target.value)} />
        </FormRow>
        <FormRow label="Credit (₹)" htmlFor="jn-cr">
          <Input id="jn-cr" type="number" min="0" step="0.01" value={credit} onChange={(e) => setCredit(e.target.value)} />
        </FormRow>
        <FormRow label="Narration / description" htmlFor="jn-desc" required className="sm:col-span-2">
          <Input id="jn-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Opening balance adjustment" />
        </FormRow>
      </form>
    </Dialog>
  );
}
