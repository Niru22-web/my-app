"use client";

import { useMemo, useState, type FormEvent } from "react";
import { BookOpen, Download, Plus } from "lucide-react";
import { ApiError } from "@/lib/api";
import { today, workDate } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { FormRow, Input, Select } from "@/components/ui/inputs";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { downloadCsv } from "@/components/claims/claim-tabs";
import { fullName, useClientOptions, usePeople } from "@/components/management/api";
import { fyStart, useAccountsMutations, useClientLedger, useEmployeeLedger, useEntities, useInvoices, useLedgers, type LedgerView } from "@/components/accounts/api";
import { LedgerTable } from "@/components/accounts/ledger-table";

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

/** CSV rows for a ledger: opening, entries, closing. */
function ledgerCsv(view: LedgerView, from: string, to: string, row: (r: LedgerView["rows"][number]) => (string | number)[], blanks: number) {
  const pad = Array<string>(blanks).fill("");
  return [
    [from || "", "Opening balance", ...pad, "", "", view.opening.toFixed(2)],
    ...view.rows.map((r) => [workDate(r.date), ...row(r), r.debit ? r.debit.toFixed(2) : "", r.credit ? r.credit.toFixed(2) : "", (r.runningBalance ?? r.balance).toFixed(2)]),
    [to || "", "Closing balance", ...pad, view.totals.debit.toFixed(2), view.totals.credit.toFixed(2), view.closing.toFixed(2)],
  ];
}

function DateRange({ id, from, to, setFrom, setTo, fromHint }: { id: string; from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void; fromHint?: string }) {
  return (
    <>
      <FormRow label="From" htmlFor={`${id}-from`} hint={fromHint}>
        <Input id={`${id}-from`} type="date" max={to || undefined} value={from} onChange={(e) => setFrom(e.target.value)} />
      </FormRow>
      <FormRow label="To" htmlFor={`${id}-to`}>
        <Input id={`${id}-to`} type="date" min={from || undefined} value={to} onChange={(e) => setTo(e.target.value)} />
      </FormRow>
    </>
  );
}

/** Client statement in ₹ from the client's ledger: invoices, credit notes, receipts (with TDS), cancellations and reversals. */
function ClientStatements() {
  const clientsQ = useClientOptions();
  const inv = useInvoices();
  const [clientId, setClient] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(today());
  const q = useClientLedger(clientId, { from: from || undefined, to: to || undefined });

  const clients = useMemo(() => {
    const m = new Map<string, string>((clientsQ.data ?? []).map((c) => [c.id, c.name]));
    for (const i of inv.data ?? []) if (!m.has(i.clientId)) m.set(i.clientId, i.client?.name ?? "—");
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [clientsQ.data, inv.data]);
  const name = clients.find(([id]) => id === clientId)?.[1] ?? "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Client statements"
        description="Invoices, credit notes, receipts (including TDS), cancellations and reversals for a client, with the running balance in ₹"
        actions={
          <Button
            variant="secondary"
            disabled={!q.data}
            onClick={() =>
              q.data &&
              downloadCsv(`statement-${name.replace(/\W+/g, "-")}-${to}.csv`, ["Date", "Description", "Debit (₹)", "Credit (₹)", "Balance (₹)"], ledgerCsv(q.data, from, to, (r) => [r.description], 0))
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
        <DateRange id="st" from={from} to={to} setFrom={setFrom} setTo={setTo} fromHint="Optional — leave empty for the full history" />
      </div>

      <Card>
        {!clientId ? (
          <EmptyState icon={BookOpen} title="Choose a client" description="The statement shows everything posted to the client’s account." />
        ) : q.isLoading ? (
          <Skeleton className="m-5 h-48" />
        ) : q.isError ? (
          <ErrorState message="The statement couldn’t be loaded." onRetry={() => q.refetch()} />
        ) : (
          <LedgerTable
            key={`${clientId}-${from}-${to}`}
            view={q.data!}
            from={from}
            mode="client"
            closingNote={(c) => (c > 0 ? "(client owes)" : c < 0 ? "(advance held)" : "(settled)")}
          />
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
  const q = useEmployeeLedger(employeeId, { from: from || undefined, to: to || undefined });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employee ledger"
        description="Salary due and paid, and reversals of salary payments, for an employee"
        actions={
          <Button
            variant="secondary"
            disabled={!q.data}
            onClick={() =>
              q.data &&
              downloadCsv(
                `employee-ledger-${to}.csv`,
                ["Date", "Description", "Entity", "Due (₹)", "Paid (₹)", "Balance (₹)"],
                ledgerCsv(q.data, from, to, (r) => [r.description, r.entity?.name ?? ""], 1),
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
        <DateRange id="el" from={from} to={to} setFrom={setFrom} setTo={setTo} fromHint="Optional" />
      </div>

      <Card>
        {!employeeId ? (
          <EmptyState icon={BookOpen} title="Choose an employee" description="Select an employee to see their salary ledger." />
        ) : q.isLoading ? (
          <Skeleton className="m-5 h-48" />
        ) : q.isError ? (
          <ErrorState message="Employee ledger couldn’t be loaded." onRetry={() => q.refetch()} />
        ) : (
          <LedgerTable
            key={`${employeeId}-${from}-${to}`}
            view={q.data!}
            from={from}
            mode="employee"
            debitLabel="Due (Dr)"
            creditLabel="Paid (Cr)"
            closingNote={(c) => (c > 0 ? "(payable to employee)" : c < 0 ? "(paid in advance)" : "(settled)")}
          />
        )}
      </Card>
    </div>
  );
}

function GeneralLedgerView() {
  const entities = useEntities();
  const [entityId, setEntityId] = useState("");
  const [type, setType] = useState("all");
  const [from, setFrom] = useState(() => fyStart(today()));
  const [to, setTo] = useState(today());

  const q = useLedgers({ entityId: entityId || undefined, type: type !== "all" ? type : undefined, from: from || undefined, to: to || undefined });

  return (
    <div className="space-y-6">
      <PageHeader
        title="General ledger"
        description="Every posting: invoices, credit notes, receipts and TDS, cancellations, reversals, payroll and manual journal entries"
        actions={
          <Button
            variant="secondary"
            disabled={!q.data}
            onClick={() =>
              q.data &&
              downloadCsv(
                `general-ledger-${from || "start"}-to-${to}.csv`,
                ["Date", "Entity", "Account", "Party", "Description", "Debit (₹)", "Credit (₹)", "Balance (₹)"],
                ledgerCsv(q.data, from, to, (r) => [r.entity?.name ?? "", r.type, r.client?.name ?? (r.employee ? fullName(r.employee) : ""), r.description], 3),
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
        <DateRange id="gl" from={from} to={to} setFrom={setFrom} setTo={setTo} fromHint="Starts at 1 April (this financial year)" />
      </div>

      <Card>
        {q.isLoading ? (
          <Skeleton className="m-5 h-48" />
        ) : q.isError ? (
          <ErrorState message="General ledger couldn’t be loaded." onRetry={() => q.refetch()} />
        ) : !q.data?.rows.length && !q.data?.opening ? (
          <EmptyState icon={BookOpen} title={entityId || type !== "all" ? "No ledger postings match these filters" : "No ledger postings in this period"} />
        ) : (
          <LedgerTable key={`${entityId}-${type}-${from}-${to}`} view={q.data!} from={from} mode="general" />
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
