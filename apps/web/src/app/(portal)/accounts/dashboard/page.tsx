"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, CalendarClock, FilePlus2, FileText, HandCoins, IndianRupee, Wallet } from "lucide-react";
import { today } from "@/lib/dates";
import { formatCurrency, formatDate, plural } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { daysOverdue, outstanding, summarise, toInr, useInvoices, useReceipts } from "@/components/accounts/api";

export default function AccountsOverview() {
  const inv = useInvoices();
  const rec = useReceipts();
  const now = today();
  const s = useMemo(() => summarise(inv.data ?? [], rec.data ?? [], now), [inv.data, rec.data, now]);
  const loading = inv.isLoading || rec.isLoading;

  const late = useMemo(
    () =>
      (inv.data ?? [])
        .filter((i) => outstanding(i) > 0 && daysOverdue(i, now) > 0)
        .sort((a, b) => daysOverdue(b, now) - daysOverdue(a, now))
        .slice(0, 8),
    [inv.data, now],
  );
  const byClient = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of inv.data ?? []) {
      const o = toInr(outstanding(i), i.exchangeRate);
      if (o > 0) m.set(i.client?.name ?? "—", (m.get(i.client?.name ?? "—") ?? 0) + o);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [inv.data]);
  const maxBucket = Math.max(1, ...s.buckets.map((b) => b.value));

  if (inv.isError || rec.isError)
    return (
      <Card>
        <ErrorState message="Accounts data couldn’t be loaded." onRetry={() => (inv.refetch(), rec.refetch())} />
      </Card>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts & Finance"
        description="Amounts in ₹, each document at its own exchange rate. Drafts and cancelled invoices are never counted."
        actions={
          <Link href="/accounts/invoices?new=1">
            <Button>
              <FilePlus2 className="h-4 w-4" /> New invoice
            </Button>
          </Link>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Summary">
        <StatCard label="To be collected" icon={Wallet} tone="brand" loading={loading} value={formatCurrency(s.receivable)} hint={s.openCount ? plural(s.openCount, "open invoice") : undefined} />
        <StatCard label="Overdue" icon={AlertTriangle} loading={loading} value={formatCurrency(s.overdue)} tone={s.overdue ? "danger" : "neutral"} hint="Past the due date" />
        <StatCard label="Billed this month" icon={IndianRupee} loading={loading} value={formatCurrency(s.revenueMonth)} hint={s.gstMonth ? `+ ${formatCurrency(s.gstMonth)} GST` : "Before GST"} />
        <StatCard label="Collected this month" icon={HandCoins} loading={loading} value={formatCurrency(s.collectedMonth)} tone={s.collectedMonth ? "success" : "neutral"} />
      </section>

      {s.drafts > 0 && (
        <Link href="/accounts/invoices?status=DRAFT" className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-[13px] text-ink hover:border-brand/40">
          <FileText className="h-5 w-5 shrink-0 text-ink-subtle" aria-hidden />
          <span>
            <strong>{plural(s.drafts, "draft invoice")}</strong> not yet sent — drafts aren’t counted as billed or receivable until you mark them sent.
          </span>
        </Link>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader icon={CalendarClock} title="Receivables by age" description="How late open invoices are, against their due date" />
          {loading ? (
            <Skeleton className="m-5 h-40" />
          ) : !s.receivable ? (
            <EmptyState icon={Wallet} title="Nothing outstanding" className="py-10" />
          ) : (
            <ul className="space-y-3 p-5">
              {s.buckets.map((b, i) => (
                <li key={b.label}>
                  <div className="flex justify-between text-[13px]">
                    <span className="text-ink">{b.label}</span>
                    <span className="font-semibold tabular text-ink">{formatCurrency(b.value)}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-muted">
                    <div className={i === 0 ? "h-full rounded-full bg-brand" : i < 3 ? "h-full rounded-full bg-warning" : "h-full rounded-full bg-danger"} style={{ width: `${(b.value / maxBucket) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader icon={Wallet} title="Owed by client" />
          {loading ? (
            <Skeleton className="m-5 h-40" />
          ) : !byClient.length ? (
            <EmptyState title="No client owes anything" className="py-10" />
          ) : (
            <ul className="divide-y divide-line px-5 pb-2">
              {byClient.map(([name, v]) => (
                <li key={name} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                  <span className="truncate text-ink">{name}</span>
                  <span className="shrink-0 font-semibold tabular text-ink">{formatCurrency(v)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader icon={AlertTriangle} title="Most overdue invoices" />
        {loading ? (
          <Skeleton className="m-5 h-24" />
        ) : !late.length ? (
          <EmptyState title="No overdue invoices" className="py-8" />
        ) : (
          <ul className="divide-y divide-line px-5 pb-2">
            {late.map((i) => (
              <li key={i.id}>
                <Link href={`/accounts/invoices/${i.id}`} className="flex items-center justify-between gap-3 py-3 text-[13px] hover:text-brand">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">
                      {i.invoiceNumber} · {i.client?.name}
                    </span>
                    <span className="block text-xs text-ink-subtle">Due {i.dueDate ? formatDate(i.dueDate) : "—"} · {daysOverdue(i, now)} days late</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular text-danger">{formatCurrency(outstanding(i), i.currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
