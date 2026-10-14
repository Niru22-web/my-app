"use client";

import { Suspense, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Download, HandCoins, Plus, Search } from "lucide-react";
import { ApiError } from "@/lib/api";
import { today, workDate } from "@/lib/dates";
import { formatCurrency, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { FormRow, Input, Select, Textarea } from "@/components/ui/inputs";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { downloadCsv } from "@/components/claims/claim-tabs";
import { STATUS_LABEL, outstanding, simulateReceipt, useAccountsMutations, useEntities, useInvoices, useReceipts, type Receipt } from "@/components/accounts/api";

const MODES = ["NEFT", "RTGS", "IMPS", "UPI", "Cheque", "Wire transfer", "Cash"];

export default function ReceiptsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Receipts />
    </Suspense>
  );
}

function Receipts() {
  const params = useSearchParams();
  const q = useReceipts();
  const inv = useInvoices();
  const [search, setSearch] = useState("");
  const [recording, setRecording] = useState<string | null>(params.get("client"));
  const numberOf = useMemo(() => new Map((inv.data ?? []).map((i) => [i.id, i.invoiceNumber])), [inv.data]);

  const rows = (q.data ?? []).filter((r) => !search.trim() || `${r.receiptNumber} ${r.client?.name ?? ""} ${r.referenceNumber ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const columns: Column<Receipt>[] = [
    { key: "no", header: "Receipt", sortValue: (r) => r.receiptNumber, cell: (r) => <div className="w-40 sm:w-48"><p className="truncate font-medium text-ink">{r.receiptNumber}</p><p className="truncate text-xs text-ink-subtle">{r.client?.name}</p></div> },
    { key: "date", header: "Received", sortValue: (r) => r.receiptDate, cell: (r) => <span className="text-ink-muted">{formatDate(r.receiptDate)}</span> },
    { key: "mode", header: "Mode", hideBelow: "md", cell: (r) => <span className="text-ink-muted">{r.paymentMode}{r.referenceNumber ? ` · ${r.referenceNumber}` : ""}</span> },
    {
      key: "applied",
      header: "Applied to",
      hideBelow: "lg",
      cell: (r) => {
        const list = (r.allocations ?? []).map((a) => numberOf.get(a.invoiceId) ?? "invoice");
        const used = (r.allocations ?? []).reduce((s, a) => s + a.amountAllocated, 0);
        const left = Math.round((r.amount - used) * 100) / 100;
        return <span className="text-ink-muted">{list.length ? list.join(", ") : "—"}{left > 0 ? <span className="text-warning"> · {formatCurrency(left, r.currency)} unapplied</span> : null}</span>;
      },
    },
    { key: "amt", header: "Amount", align: "right", sortValue: (r) => r.amount * (r.exchangeRate || 1), cell: (r) => <span className="font-semibold tabular text-ink">{formatCurrency(r.amount, r.currency)}</span> },
  ];

  if (q.isError)
    return (
      <Card>
        <ErrorState message="Receipts couldn’t be loaded." onRetry={() => q.refetch()} />
      </Card>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Receipts"
        description="Money received from clients"
        actions={
          <>
            <Button
              variant="secondary"
              disabled={!rows.length}
              onClick={() =>
                downloadCsv(
                  `receipts-${today()}.csv`,
                  ["Receipt", "Date", "Client", "Entity", "Mode", "Reference", "Currency", "Amount", "Applied to"],
                  rows.map((r) => [r.receiptNumber, workDate(r.receiptDate), r.client?.name, r.entity?.name, r.paymentMode, r.referenceNumber, r.currency, r.amount, (r.allocations ?? []).map((a) => numberOf.get(a.invoiceId)).join("; ")]),
                )
              }
            >
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button onClick={() => setRecording("")}>
              <Plus className="h-4 w-4" /> Record receipt
            </Button>
          </>
        }
      />
      <div className="relative sm:w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
        <Input placeholder="Receipt, client or reference" aria-label="Search receipts" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} loading={q.isLoading} initialSort={{ key: "date", dir: "desc" }} pageSize={20} empty={{ icon: HandCoins, title: q.data?.length ? "No receipts match" : "No receipts recorded yet" }} />
      {recording !== null && <ReceiptDialog initialClient={recording} onClose={() => setRecording(null)} />}
    </div>
  );
}

function ReceiptDialog({ initialClient, onClose }: { initialClient: string; onClose: () => void }) {
  const toast = useToast();
  const m = useAccountsMutations();
  const inv = useInvoices();
  const entities = useEntities();
  const invoices = useMemo(() => inv.data ?? [], [inv.data]);
  const clients = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of invoices) if (outstanding(i) > 0 || i.status === "DRAFT") map.set(i.clientId, i.client?.name ?? "—");
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [invoices]);
  const [clientId, setClient] = useState(initialClient);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [mode, setMode] = useState("NEFT");
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");
  const [tried, setTried] = useState(false);

  const open = invoices.filter((i) => i.clientId === clientId && outstanding(i) > 0);
  const currency = open[0]?.currency ?? "INR";
  const entityId = open[0]?.entityId ?? entities.data?.[0]?.id ?? "";
  const amt = Number(amount);
  const sim = clientId && amt > 0 ? simulateReceipt(invoices, clientId, amt) : null;
  const draftHit = sim?.plan.find((p) => p.invoice.status === "DRAFT");
  const fxHit = sim?.plan.find((p) => p.invoice.currency !== currency);
  const entityHit = sim?.plan.find((p) => p.invoice.entityId !== entityId);
  const blocked = draftHit
    ? `The server would apply this money to draft ${draftHit.invoice.invoiceNumber} first. Mark that draft as sent, or delete it, before recording this receipt.`
    : fxHit
      ? `This client has invoices in more than one currency; the server would apply ${currency} money to ${fxHit.invoice.invoiceNumber} (${fxHit.invoice.currency}) without converting. Record this in the current portal for now.`
      : "";
  const errors = {
    clientId: !clientId ? "Choose a client." : "",
    amount: !(amt > 0) ? "Enter the amount received." : "",
    date: !date || date > today() ? "Can’t be in the future." : "",
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.values(errors).some(Boolean) || blocked) return;
    try {
      // The UI never lets the rate differ from the invoices it settles, so ₹ figures stay consistent.
      const rate = open[0]?.exchangeRate ?? 1;
      const res = await m.recordReceipt.mutateAsync({ clientId, entityId, amount: amt, currency, exchangeRate: rate, receiptDate: date, paymentMode: mode, referenceNumber: ref.trim() || undefined, notes: notes.trim() || undefined });
      toast.success(`Receipt ${res.data?.receiptNumber ?? ""} recorded`.trim(), sim?.plan.length ? `Applied to ${sim.plan.map((p) => p.invoice.invoiceNumber).join(", ")}.` : undefined);
      onClose();
    } catch (err) {
      toast.error("Couldn’t record the receipt", err instanceof ApiError ? err.message : undefined);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Record a receipt"
      description="The server applies receipts to the client’s oldest unpaid invoices first. You’ll see exactly where it goes before saving."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="receipt-form" disabled={!!blocked} loading={m.recordReceipt.isPending}>
            Record receipt
          </Button>
        </>
      }
    >
      <form id="receipt-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Client" htmlFor="rc-client" required error={tried ? errors.clientId : undefined} className="sm:col-span-2" hint={!inv.isLoading && !clients.length ? "No client has an unpaid invoice." : undefined}>
          <Select id="rc-client" value={clientId} onChange={(e) => setClient(e.target.value)} invalid={tried && !!errors.clientId}>
            <option value="">Choose…</option>
            {clients.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label={`Amount (${currency})`} htmlFor="rc-amt" required error={tried ? errors.amount : undefined}>
          <Input id="rc-amt" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} invalid={tried && !!errors.amount} />
        </FormRow>
        <FormRow label="Received on" htmlFor="rc-date" required error={tried ? errors.date : undefined}>
          <Input id="rc-date" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} invalid={tried && !!errors.date} />
        </FormRow>
        <FormRow label="Mode" htmlFor="rc-mode">
          <Select id="rc-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
            {MODES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Reference / UTR" htmlFor="rc-ref" hint="Optional">
          <Input id="rc-ref" value={ref} onChange={(e) => setRef(e.target.value)} />
        </FormRow>
        <FormRow label="Notes" htmlFor="rc-notes" hint="Optional — e.g. TDS deducted" className="sm:col-span-2">
          <Textarea id="rc-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FormRow>

        {sim && (
          <div className="rounded-2xl border border-line p-4 text-[13px] sm:col-span-2">
            <p className="mb-2 font-semibold text-ink">Where this money will go</p>
            {sim.plan.length ? (
              <ul className="space-y-1">
                {sim.plan.map((p) => (
                  <li key={p.invoice.id} className="flex justify-between gap-3">
                    <span className={p.invoice.status === "DRAFT" || p.invoice.currency !== currency ? "text-danger" : "text-ink"}>
                      {p.invoice.invoiceNumber} · {STATUS_LABEL[p.invoice.status] ?? p.invoice.status} · {formatDate(p.invoice.issueDate)}
                      {p.settles ? " — fully paid" : " — part paid"}
                    </span>
                    <span className="tabular">{formatCurrency(p.applied, p.invoice.currency)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-muted">No unpaid invoice — the whole amount is kept as an advance.</p>
            )}
            {sim.advance > 0 && sim.plan.length > 0 && <p className="mt-2 text-warning">{formatCurrency(sim.advance, currency)} left over is kept as an advance (not applied to anything).</p>}
            {entityHit && !blocked && <p className="mt-2 text-ink-muted">Note: {entityHit.invoice.invoiceNumber} was billed by a different entity than the receipt.</p>}
          </div>
        )}
        {blocked ? (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger sm:col-span-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {blocked}
          </p>
        ) : (
          sim?.plan.length ? (
            <p className="flex items-center gap-2 text-[13px] text-success sm:col-span-2">
              <CheckCircle2 className="h-4 w-4" aria-hidden /> Safe to record.
            </p>
          ) : null
        )}
      </form>
    </Dialog>
  );
}
