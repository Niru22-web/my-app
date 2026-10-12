"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, HandCoins, Info, IndianRupee, Receipt, Wallet } from "lucide-react";
import { today, workDate } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat";
import { Select } from "@/components/ui/inputs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { useTeamClaims } from "@/components/claims/api";
import { isIssued, toInr, useInvoices, useReceipts } from "@/components/accounts/api";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function RevenueExpenses() {
  const inv = useInvoices();
  const rec = useReceipts();
  const claims = useTeamClaims("PAID", true);
  const now = today();
  const y = Number(now.slice(0, 4)), mo = Number(now.slice(5, 7));
  const thisFy = mo >= 4 ? y : y - 1;
  const [fy, setFy] = useState(thisFy);
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => { const m = ((3 + i) % 12) + 1; const yy = m >= 4 ? fy : fy + 1; return `${yy}-${String(m).padStart(2, "0")}`; }), [fy]);

  const data = useMemo(() => {
    const row = new Map(months.map((m) => [m, { month: m, billed: 0, collected: 0, claims: 0 }]));
    const byClient = new Map<string, number>();
    const byCategory = new Map<string, number>();
    for (const i of inv.data ?? []) {
      if (!isIssued(i)) continue;
      const r = row.get(workDate(i.issueDate).slice(0, 7));
      if (!r) continue;
      const v = toInr(i.subTotal, i.exchangeRate);
      r.billed += v;
      byClient.set(i.client?.name ?? "—", (byClient.get(i.client?.name ?? "—") ?? 0) + v);
    }
    for (const x of rec.data ?? []) {
      const r = row.get(workDate(x.receiptDate).slice(0, 7));
      if (r) r.collected += toInr(x.amount, x.exchangeRate);
    }
    for (const c of claims.data ?? []) {
      const d = c.paidAt ?? c.date;
      const r = row.get(workDate(d).slice(0, 7));
      if (!r) continue;
      r.claims += c.amount;
      byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + c.amount);
    }
    const rows = [...row.values()];
    return {
      rows,
      chart: rows.filter((r) => r.month <= now.slice(0, 7)).map((r) => ({ label: `${MONTHS[Number(r.month.slice(5)) - 1]} ${r.month.slice(2, 4)}`, Billed: Math.round(r.billed), "Claims paid": Math.round(r.claims) })),
      billed: rows.reduce((s, r) => s + r.billed, 0),
      collected: rows.reduce((s, r) => s + r.collected, 0),
      claims: rows.reduce((s, r) => s + r.claims, 0),
      byClient: [...byClient.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
      byCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [inv.data, rec.data, claims.data, months, now]);

  const loading = inv.isLoading || rec.isLoading;
  if (inv.isError || rec.isError)
    return (
      <Card>
        <ErrorState message="Report data couldn’t be loaded." onRetry={() => (inv.refetch(), rec.refetch())} />
      </Card>
    );
  const maxClient = Math.max(1, ...data.byClient.map(([, v]) => v));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revenue & expenses"
        description={
          <span className="inline-flex items-start gap-1.5">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> Billed = issued invoices before GST, in ₹. Expenses here are only paid expense claims — salaries and other costs aren’t recorded in the portal, so this isn’t a full profit &amp; loss.
          </span>
        }
        actions={
          <Select aria-label="Financial year" value={fy} onChange={(e) => setFy(Number(e.target.value))} className="w-40">
            {[thisFy, thisFy - 1, thisFy - 2].map((f) => (
              <option key={f} value={f}>
                FY {f}-{String(f + 1).slice(2)}
              </option>
            ))}
          </Select>
        }
      />
      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Billed" icon={IndianRupee} tone="brand" loading={loading} value={formatCurrency(data.billed)} hint="Before GST" />
        <StatCard label="Collected" icon={HandCoins} loading={loading} value={formatCurrency(data.collected)} />
        <StatCard label="Expense claims paid" icon={Receipt} loading={claims.isLoading} value={claims.isError ? "—" : formatCurrency(data.claims)} hint={claims.isError ? "Not available to your role" : undefined} />
        <StatCard label="Billed minus claims" icon={Wallet} loading={loading || claims.isLoading} value={claims.isError ? "—" : formatCurrency(data.billed - data.claims)} hint="Not profit — excludes salaries and overheads" />
      </section>

      <Card>
        <CardHeader icon={BarChart3} title="By month" />
        <div className="px-3 pb-4 pt-3">
          {loading ? (
            <Skeleton className="mx-2 h-[260px]" />
          ) : !data.chart.some((c) => c.Billed || c["Claims paid"]) ? (
            <EmptyState title="Nothing billed or paid in this year" />
          ) : (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.chart} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--text-subtle)", fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--text-subtle)", fontSize: 12 }} width={64} tickFormatter={(v) => (v >= 1e5 ? `${(v / 1e5).toFixed(1)}L` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(v))} />
                  <Tooltip cursor={{ fill: "var(--surface-muted)" }} contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12 }} formatter={(v, n) => [formatCurrency(Number(v)), n]} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Billed" fill="var(--chart-current)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Claims paid" fill="var(--chart-previous)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader icon={IndianRupee} title="Billed by client" />
          {!data.byClient.length ? (
            <EmptyState title="No issued invoices this year" className="py-8" />
          ) : (
            <ul className="space-y-3 p-5">
              {data.byClient.map(([n, v]) => (
                <li key={n}>
                  <div className="flex justify-between text-[13px]">
                    <span className="truncate text-ink">{n}</span>
                    <span className="font-semibold tabular text-ink">{formatCurrency(v)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(v / maxClient) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader icon={Receipt} title="Claims paid by category" />
          {claims.isError ? (
            <EmptyState title="Paid claims aren’t available to your role" className="py-8" />
          ) : !data.byCategory.length ? (
            <EmptyState title="No claims paid this year" className="py-8" />
          ) : (
            <ul className="divide-y divide-line px-5 pb-2">
              {data.byCategory.map(([c, v]) => (
                <li key={c} className="flex justify-between py-2.5 text-[13px]">
                  <span className="capitalize text-ink">{c.toLowerCase()}</span>
                  <span className="font-semibold tabular text-ink">{formatCurrency(v)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
