"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Download } from "lucide-react";
import { today, workDate } from "@/lib/dates";
import { formatCurrency, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormRow, Input, Select } from "@/components/ui/inputs";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadCsv } from "@/components/claims/claim-tabs";
import { isIssued, toInr, useInvoices, useReceipts } from "@/components/accounts/api";

interface Line {
  date: string;
  kind: "Invoice" | "Receipt";
  ref: string;
  href?: string;
  detail: string;
  debit: number;
  credit: number;
  balance: number;
}

/** Client statement in ₹, built from issued invoices and receipts (the API's ledger mixes currencies). */
export default function ClientStatements() {
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
        .map((i) => ({ date: workDate(i.issueDate), kind: "Invoice" as const, ref: i.invoiceNumber, href: `/accounts/invoices/${i.id}`, detail: i.currency !== "INR" ? `${formatCurrency(i.totalAmount, i.currency)} @ ${i.exchangeRate}` : i.entity?.name ?? "", debit: toInr(i.totalAmount, i.exchangeRate), credit: 0 })),
      ...(rec.data ?? [])
        .filter((r) => r.clientId === clientId)
        .map((r) => ({ date: workDate(r.receiptDate), kind: "Receipt" as const, ref: r.receiptNumber, detail: [r.paymentMode, r.referenceNumber, r.currency !== "INR" ? `${formatCurrency(r.amount, r.currency)} @ ${r.exchangeRate}` : ""].filter(Boolean).join(" · "), debit: 0, credit: toInr(r.amount, r.exchangeRate) })),
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
