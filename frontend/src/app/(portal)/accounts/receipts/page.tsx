"use client";

import { Suspense, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Download, HandCoins, Plus, Undo2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { today, workDate } from "@/lib/dates";
import { formatCurrency, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { FormRow, Input, Select, Textarea } from "@/components/ui/inputs";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { downloadCsv } from "@/components/claims/claim-tabs";
import { useClientOptions } from "@/components/management/api";
import {
  STATUS_LABEL,
  isPayable,
  isReversed,
  outstanding,
  round2,
  simulateReceipt,
  useAccountsMutations,
  useCurrencies,
  useEntities,
  useInvoices,
  useReceipts,
  type Receipt,
} from "@/components/accounts/api";
import { ReasonDialog } from "@/components/accounts/reason-dialog";

const MODES = ["NEFT", "RTGS", "IMPS", "UPI", "Cheque", "Wire transfer", "Cash", "Bank Transfer"];

export default function ReceiptsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Receipts />
    </Suspense>
  );
}

const gross = (r: Receipt) => r.grossAmount ?? round2(r.amount + (r.tdsAmount ?? 0));
const receiptStatus = (r: Receipt) => (isReversed(r) ? "Reversed" : (r.unapplied ?? 0) > 0 ? "Advance" : "Applied");
const appliedTo = (r: Receipt) => (r.allocations ?? []).map((a) => a.invoice?.invoiceNumber ?? "invoice");

function Receipts() {
  const params = useSearchParams();
  const toast = useToast();
  const q = useReceipts();
  const entities = useEntities();
  const m = useAccountsMutations();
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [client, setClient] = useState("");
  const [mode, setMode] = useState("");
  const [entity, setEntity] = useState("");
  const [status, setStatus] = useState("all");
  const [recording, setRecording] = useState<{ client: string; invoice: string } | null>(
    params.get("client") || params.get("invoice") ? { client: params.get("client") ?? "", invoice: params.get("invoice") ?? "" } : null,
  );
  const [reversing, setReversing] = useState<Receipt | null>(null);

  const all = useMemo(() => q.data ?? [], [q.data]);
  const clientOptions = useMemo(() => [...new Map(all.map((r) => [r.clientId, r.client?.name ?? "—"])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [all]);
  const modeOptions = useMemo(() => [...new Set(all.map((r) => r.paymentMode))].sort(), [all]);
  const s = search.trim().toLowerCase();
  const rows = all.filter((r) => {
    const d = workDate(r.receiptDate);
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (client && r.clientId !== client) return false;
    if (mode && r.paymentMode !== mode) return false;
    if (entity && r.entityId !== entity) return false;
    if (status !== "all" && receiptStatus(r) !== status) return false;
    return !s || `${r.receiptNumber} ${r.client?.name ?? ""} ${r.referenceNumber ?? ""} ${appliedTo(r).join(" ")}`.toLowerCase().includes(s);
  });
  const filtered = !!(s || from || to || client || mode || entity || status !== "all");

  const columns: Column<Receipt>[] = [
    {
      key: "no",
      header: "Receipt",
      sortValue: (r) => r.receiptNumber,
      cell: (r) => (
        <div className="w-40 sm:w-48">
          <p className={`truncate font-medium ${isReversed(r) ? "text-ink-subtle line-through" : "text-ink"}`}>{r.receiptNumber}</p>
          <p className="truncate text-xs text-ink-subtle">{r.client?.name}</p>
        </div>
      ),
    },
    { key: "date", header: "Received", sortValue: (r) => r.receiptDate, cell: (r) => <span className="text-ink-muted">{formatDate(r.receiptDate)}</span> },
    { key: "mode", header: "Mode", hideBelow: "md", sortValue: (r) => r.paymentMode, cell: (r) => <span className="text-ink-muted">{r.paymentMode}{r.referenceNumber ? ` · ${r.referenceNumber}` : ""}</span> },
    {
      key: "applied",
      header: "Applied to",
      hideBelow: "lg",
      cell: (r) => {
        const list = (r.allocations ?? []).filter((a) => a.invoiceId);
        const left = r.unapplied ?? 0;
        return (
          <span className="text-ink-muted">
            {list.length
              ? list.map((a, k) => (
                  <span key={a.id}>
                    {k > 0 && ", "}
                    <Link href={`/accounts/invoices/${a.invoiceId}`} className="hover:text-brand hover:underline">
                      {a.invoice?.invoiceNumber ?? "invoice"}
                    </Link>
                  </span>
                ))
              : "—"}
            {left > 0 && !isReversed(r) ? <span className="text-warning"> · {formatCurrency(left, r.currency)} advance</span> : null}
          </span>
        );
      },
    },
    { key: "amt", header: "Received", align: "right", sortValue: (r) => r.amount * (r.exchangeRate || 1), cell: (r) => <span className="font-semibold tabular text-ink">{formatCurrency(r.amount, r.currency)}</span> },
    {
      key: "tds",
      header: "TDS",
      align: "right",
      hideBelow: "sm",
      sortValue: (r) => r.tdsAmount ?? 0,
      cell: (r) => (r.tdsAmount ? <span className="tabular text-ink-muted" title={r.tdsSection ? `Section ${r.tdsSection}` : undefined}>{formatCurrency(r.tdsAmount, r.currency)}</span> : <span className="text-ink-subtle">—</span>),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (r) => (isReversed(r) ? "Reversed" : (r.unapplied ?? 0) > 0 ? "Advance" : "Applied"),
      cell: (r) =>
        isReversed(r) ? (
          <span title={r.reverseReason ?? undefined}>
            <Badge tone="danger">Reversed</Badge>
          </span>
        ) : (r.unapplied ?? 0) > 0 ? (
          <Badge tone="warning">Advance held</Badge>
        ) : (
          <Badge tone="success">Applied</Badge>
        ),
    },
    {
      key: "act",
      header: "",
      align: "right",
      cell: (r) =>
        isReversed(r) ? null : (
          <Button variant="ghost" size="sm" onClick={() => setReversing(r)} aria-label={`Reverse ${r.receiptNumber}`}>
            <Undo2 className="h-3.5 w-3.5" /> Reverse
          </Button>
        ),
    },
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
        description="Money received from clients, including TDS they deducted"
        actions={
          <Button onClick={() => setRecording({ client: "", invoice: "" })}>
            <Plus className="h-4 w-4" /> Record receipt
          </Button>
        }
      />
      <DataTable
        exportName={false}
        itemsLabel="receipts"
        filterTabs={[
          { key: "all", label: "All", count: all.length },
          { key: "Applied", label: "Applied", count: all.filter((r) => receiptStatus(r) === "Applied").length },
          { key: "Advance", label: "Advance held", count: all.filter((r) => receiptStatus(r) === "Advance").length },
          { key: "Reversed", label: "Reversed", count: all.filter((r) => receiptStatus(r) === "Reversed").length },
        ]}
        activeFilterTab={status}
        onFilterTabChange={setStatus}
        searchable
        searchPlaceholder="Receipt, client, reference, invoice"
        searchValue={search}
        onSearchChange={setSearch}
        toolbarActions={
          <>
            <Input type="date" aria-label="Received from" title="From" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[150px]" />
            <Input type="date" aria-label="Received to" title="To" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-9 w-[150px]" />
            <Select aria-label="Client" value={client} onChange={(e) => setClient(e.target.value)} className="w-44">
              <option value="">All clients</option>
              {clientOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
            <Select aria-label="Payment mode" value={mode} onChange={(e) => setMode(e.target.value)} className="w-36">
              <option value="">All modes</option>
              {modeOptions.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
            {(entities.data?.length ?? 0) > 1 && (
              <Select aria-label="Billing entity" value={entity} onChange={(e) => setEntity(e.target.value)} className="w-44">
                <option value="">All entities</option>
                {entities.data!.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
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
                  `receipts-${today()}.csv`,
                  ["Receipt", "Date", "Client", "Entity", "Mode", "Reference", "Currency", "Cash received", "TDS", "TDS section", "Gross credited", "Advance left", "Applied to", "Status", "Reversal reason"],
                  rows.map((r) => [
                    r.receiptNumber,
                    workDate(r.receiptDate),
                    r.client?.name,
                    r.entity?.name,
                    r.paymentMode,
                    r.referenceNumber,
                    r.currency,
                    r.amount,
                    r.tdsAmount ?? 0,
                    r.tdsSection ?? "",
                    gross(r),
                    r.unapplied ?? 0,
                    appliedTo(r).join("; "),
                    isReversed(r) ? "Reversed" : "Active",
                    r.reverseReason ?? "",
                  ]),
                )
              }
            >
              <Download className="h-4 w-4" /> Export
            </Button>
          </>
        }
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        loading={q.isLoading}
        initialSort={{ key: "date", dir: "desc" }}
        pageSize={20}
        empty={{ icon: HandCoins, title: all.length && filtered ? "No receipts match these filters" : "No receipts recorded yet" }}
      />
      {recording && <ReceiptDialog initialClient={recording.client} initialInvoice={recording.invoice} onClose={() => setRecording(null)} />}
      {reversing && (
        <ReasonDialog
          title={`Reverse ${reversing.receiptNumber}?`}
          description={
            <>
              Use this for a bounced cheque or money recorded against the wrong client. The {formatCurrency(gross(reversing), reversing.currency)} is taken off{" "}
              {appliedTo(reversing).length ? appliedTo(reversing).join(", ") : "the client’s advance"} and those invoices are open again. The receipt stays on record as reversed.
            </>
          }
          placeholder="e.g. Cheque returned unpaid"
          confirmLabel="Reverse receipt"
          busy={m.reverseReceipt.isPending}
          onClose={() => setReversing(null)}
          onConfirm={(reason) =>
            m.reverseReceipt.mutate(
              { id: reversing.id, reason },
              {
                onSuccess: () => (toast.success(`Receipt ${reversing.receiptNumber} reversed`), setReversing(null)),
                onError: (e) => toast.error("Couldn’t reverse the receipt", e instanceof ApiError ? e.message : undefined),
              },
            )
          }
        />
      )}
    </div>
  );
}

function ReceiptDialog({ initialClient, initialInvoice, onClose }: { initialClient: string; initialInvoice: string; onClose: () => void }) {
  const toast = useToast();
  const m = useAccountsMutations();
  const inv = useInvoices();
  const entities = useEntities();
  const clientsQ = useClientOptions();
  const currenciesQ = useCurrencies();
  const invoices = useMemo(() => inv.data ?? [], [inv.data]);
  const now = today();

  const [clientId, setClient] = useState(initialClient);
  const [invoiceId, setInvoice] = useState(initialInvoice);
  const [entityPick, setEntity] = useState("");
  const [currencyPick, setCurrency] = useState("");
  const [ratePick, setRate] = useState("");
  const [amount, setAmount] = useState("");
  const [tds, setTds] = useState("");
  const [tdsSection, setTdsSection] = useState("194J");
  const [date, setDate] = useState(now);
  const [mode, setMode] = useState("NEFT");
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");
  const [tried, setTried] = useState(false);

  const chosen = invoices.find((i) => i.id === invoiceId);
  const effectiveClient = clientId || chosen?.clientId || "";
  const activeEntities = (entities.data ?? []).filter((e) => e.status !== "INACTIVE");
  const entityId = entityPick || chosen?.entityId || (activeEntities.length === 1 ? activeEntities[0].id : "");
  const currency = currencyPick || chosen?.currency || "INR";
  const rateText = currency === "INR" ? "1" : ratePick || String(chosen?.exchangeRate ?? "");
  const rate = Number(rateText);

  const clients = useMemo(() => {
    const map = new Map<string, string>((clientsQ.data ?? []).map((c) => [c.id, c.name]));
    for (const i of invoices) if (isPayable(i) && !map.has(i.clientId)) map.set(i.clientId, i.client?.name ?? "—");
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [clientsQ.data, invoices]);
  const currencies = useMemo(() => {
    const set = new Set(["INR", ...(currenciesQ.data ?? []).map((c) => c.code.toUpperCase())]);
    if (chosen) set.add(chosen.currency);
    return [...set];
  }, [currenciesQ.data, chosen]);
  const openForClient = invoices.filter((i) => i.clientId === effectiveClient && i.entityId === entityId && i.currency === currency && isPayable(i) && outstanding(i) > 0);

  const cash = Number(amount) || 0;
  const tdsAmt = Number(tds) || 0;
  const total = round2(cash + tdsAmt);
  const sim = effectiveClient && entityId && total > 0 ? simulateReceipt(invoices, { clientId: effectiveClient, entityId, currency, amount: total, invoiceId: invoiceId || undefined }) : null;
  const errors = {
    clientId: !effectiveClient ? "Choose a client." : "",
    entityId: !entityId ? "Choose which entity received the money." : "",
    amount: !(cash > 0) && !(tdsAmt > 0) ? "Enter the amount received." : cash < 0 ? "Can’t be negative." : "",
    tds: tdsAmt < 0 ? "Can’t be negative." : "",
    rate: currency !== "INR" && !(rate > 0) ? `Enter the ₹ rate for 1 ${currency}.` : "",
    date: !date || date > now ? "Can’t be in the future." : "",
  };

  const pickInvoice = (id: string) => {
    setInvoice(id);
    const i = invoices.find((x) => x.id === id);
    if (i) {
      setEntity(i.entityId);
      setCurrency(i.currency);
      setRate(String(i.exchangeRate ?? ""));
    }
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.values(errors).some(Boolean)) return;
    try {
      const res = await m.recordReceipt.mutateAsync({
        clientId: effectiveClient,
        entityId,
        amount: round2(cash),
        tdsAmount: tdsAmt > 0 ? round2(tdsAmt) : undefined,
        tdsSection: tdsAmt > 0 ? tdsSection.trim() || "194J" : undefined,
        currency,
        exchangeRate: currency === "INR" ? 1 : rate,
        receiptDate: date,
        paymentMode: mode,
        referenceNumber: ref.trim() || undefined,
        notes: notes.trim() || undefined,
        invoiceId: invoiceId && openForClient.some((i) => i.id === invoiceId) ? invoiceId : undefined,
      });
      const adv = res.data?.advance ?? 0;
      toast.success(
        res.data?.receiptNumber ? `Receipt ${res.data.receiptNumber} recorded` : "Receipt recorded",
        adv > 0 ? `${formatCurrency(adv, currency)} kept as an advance for the next invoice.` : sim?.plan.length ? `Applied to ${sim.plan.map((p) => p.invoice.invoiceNumber).join(", ")}.` : undefined,
      );
      onClose();
    } catch (err) {
      toast.error("Couldn’t record the receipt", err instanceof ApiError ? err.message : undefined);
    }
  }

  const show = (k: keyof typeof errors) => (tried ? errors[k] || undefined : undefined);
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Record a receipt"
      description="Money is applied to the chosen invoice first, then the client’s oldest unpaid invoices of the same entity and currency. Anything left is kept as an advance."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="receipt-form" loading={m.recordReceipt.isPending}>
            Record receipt
          </Button>
        </>
      }
    >
      <form id="receipt-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Client" htmlFor="rc-client" required error={show("clientId")}>
          <Select id="rc-client" value={effectiveClient} onChange={(e) => (setClient(e.target.value), setInvoice(""))} invalid={!!show("clientId")}>
            <option value="">Choose…</option>
            {clients.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Received by (entity)" htmlFor="rc-entity" required error={show("entityId")}>
          <Select id="rc-entity" value={entityId} onChange={(e) => (setEntity(e.target.value), setInvoice(""))} invalid={!!show("entityId")}>
            <option value="">Choose…</option>
            {activeEntities.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Currency" htmlFor="rc-cur">
          <Select id="rc-cur" value={currency} onChange={(e) => (setCurrency(e.target.value), setInvoice(""), setRate(""))}>
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </FormRow>
        {currency !== "INR" ? (
          <FormRow label={`₹ per 1 ${currency}`} htmlFor="rc-rate" required error={show("rate")}>
            <Input id="rc-rate" type="number" min={0} step="0.0001" value={rateText} onChange={(e) => setRate(e.target.value)} invalid={!!show("rate")} />
          </FormRow>
        ) : (
          <span className="hidden sm:block" />
        )}
        <FormRow label="Apply to invoice" htmlFor="rc-inv" hint={effectiveClient && entityId && !openForClient.length ? "No unpaid invoice — the money is kept as an advance." : "Optional — otherwise the oldest unpaid invoice is paid first"} className="sm:col-span-2">
          <Select id="rc-inv" value={openForClient.some((i) => i.id === invoiceId) ? invoiceId : ""} onChange={(e) => pickInvoice(e.target.value)} disabled={!openForClient.length}>
            <option value="">Oldest unpaid first</option>
            {openForClient.map((i) => (
              <option key={i.id} value={i.id}>
                {i.invoiceNumber} · {formatDate(i.issueDate)} · due {formatCurrency(outstanding(i), i.currency)}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label={`Cash received (${currency})`} htmlFor="rc-amt" required error={show("amount")} hint="What actually reached the bank">
          <Input id="rc-amt" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} invalid={!!show("amount")} />
        </FormRow>
        <div className="grid grid-cols-[1fr_7rem] gap-2">
          <FormRow label="TDS deducted" htmlFor="rc-tds" error={show("tds")} hint="Optional">
            <Input id="rc-tds" type="number" min={0} step="0.01" value={tds} onChange={(e) => setTds(e.target.value)} invalid={!!show("tds")} />
          </FormRow>
          <FormRow label="Section" htmlFor="rc-tds-sec">
            <Input id="rc-tds-sec" value={tdsSection} maxLength={10} onChange={(e) => setTdsSection(e.target.value.toUpperCase())} disabled={!(tdsAmt > 0)} />
          </FormRow>
        </div>
        <p className="-mt-1 text-[13px] text-ink-muted sm:col-span-2">
          Gross credited = cash + TDS = <strong className="tabular text-ink">{formatCurrency(total, currency)}</strong>
        </p>
        <FormRow label="Received on" htmlFor="rc-date" required error={show("date")}>
          <Input id="rc-date" type="date" max={now} value={date} onChange={(e) => setDate(e.target.value)} invalid={!!show("date")} />
        </FormRow>
        <FormRow label="Mode" htmlFor="rc-mode">
          <Select id="rc-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
            {MODES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Reference / UTR / cheque no." htmlFor="rc-ref" hint="Optional">
          <Input id="rc-ref" value={ref} onChange={(e) => setRef(e.target.value)} />
        </FormRow>
        <FormRow label="Notes" htmlFor="rc-notes" hint="Optional">
          <Textarea id="rc-notes" rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FormRow>

        {sim && (
          <div className="rounded-2xl border border-line p-4 text-[13px] sm:col-span-2">
            <p className="mb-2 font-semibold text-ink">Where this money will go</p>
            {sim.plan.length ? (
              <ul className="space-y-1">
                {sim.plan.map((p) => (
                  <li key={p.invoice.id} className="flex justify-between gap-3">
                    <span className="text-ink">
                      {p.invoice.invoiceNumber} · {STATUS_LABEL[p.invoice.status] ?? p.invoice.status} · {formatDate(p.invoice.issueDate)}
                      {p.settles ? " — fully paid" : " — part paid"}
                    </span>
                    <span className="tabular">{formatCurrency(p.applied, p.invoice.currency)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-muted">No unpaid invoice for this client, entity and currency — the whole amount is kept as an advance and applied when the next invoice is issued.</p>
            )}
            {sim.advance > 0 && sim.plan.length > 0 && <p className="mt-2 text-warning">{formatCurrency(sim.advance, currency)} left over is kept as an advance and applied when the next invoice is issued.</p>}
          </div>
        )}
      </form>
    </Dialog>
  );
}
