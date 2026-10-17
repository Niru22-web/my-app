"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, Clock, Inbox, MessagesSquare, Ticket, UserCheck, UserX, type LucideIcon } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/cn";
import { formatNumber, plural } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { ActivityList } from "@/components/bugs/activity-list";
import { STATUS_COLOR, useBugSummary, type BugSummary } from "@/components/bugs/api";

const axis = { fontSize: 12, fill: "var(--text-muted)" };
const tooltipStyle = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 13, boxShadow: "var(--shadow-pop)" },
  labelStyle: { color: "var(--text)", fontWeight: 600 },
  itemStyle: { color: "var(--text)" },
};

export default function BugDashboardPage() {
  const q = useBugSummary();
  const s = q.data;

  if (q.isError)
    return (
      <Card>
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </Card>
    );

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Summary">
        <KpiCard label="Total tickets" icon={Ticket} value={s?.totals.all} delta={s?.deltas.all} loading={q.isLoading} />
        <KpiCard label="Open" icon={Inbox} value={s?.totals.open} delta={s?.deltas.open} loading={q.isLoading} />
        <KpiCard label="Pending discussion" icon={MessagesSquare} value={s?.totals.pendingDiscussion} delta={s?.deltas.pendingDiscussion} loading={q.isLoading} />
        <KpiCard label="Resolved" icon={CheckCircle2} value={s?.totals.resolved} delta={s?.deltas.resolved} loading={q.isLoading} goodWhenUp deltaNote="resolved" />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Shortcuts">
        <Shortcut href="/bugs/list?view=pending" icon={MessagesSquare} label="Pending discussion" count={s?.totals.pendingDiscussion} loading={q.isLoading} />
        <Shortcut href="/bugs/list?view=unassigned" icon={UserX} label="Unassigned" count={s?.unassigned} loading={q.isLoading} />
        <Shortcut href="/bugs/list?view=pastdue" icon={Clock} label="Past due" count={s?.pastDue} loading={q.isLoading} tone={s?.pastDue ? "danger" : undefined} />
        <Shortcut href="/bugs/list?view=mine" icon={UserCheck} label="My tickets" count={s?.mine} loading={q.isLoading} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Tickets by status" description={s ? `${plural(s.totals.all, "ticket")} in all` : undefined} />
          <div className="px-3 pb-4 sm:px-5">{q.isLoading || !s ? <Skeleton className="mt-3 h-64" /> : <StatusChart data={s.byStatus} />}</div>
        </Card>
        <Card>
          <CardHeader title="New tickets" description={s ? `${plural(s.newLast14, "ticket")} reported in the last 14 days` : undefined} />
          <div className="px-3 pb-4 sm:px-5">{q.isLoading || !s ? <Skeleton className="mt-3 h-64" /> : <DailyChart data={s.daily} />}</div>
        </Card>
      </section>

      <Card>
        <CardHeader
          title="Recent activity"
          actions={
            <Link href="/bugs/activity" className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline">
              See all <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          }
        />
        <div className="px-5 pb-4 pt-2">
          {q.isLoading || !s ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : s.recent.length === 0 ? (
            <EmptyState title="No activity yet" description="When someone reports a bug or updates a ticket, it shows up here." />
          ) : (
            <div className="max-h-[440px] overflow-y-auto pr-1 [scrollbar-gutter:stable]" tabIndex={0} aria-label="Recent activity">
              <ActivityList events={s.recent} />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function KpiCard({
  label,
  icon: Icon,
  value,
  delta,
  loading,
  hint,
  goodWhenUp,
  deltaNote = "new",
}: {
  label: string;
  icon: LucideIcon;
  value?: number;
  delta?: { current: number; previous: number };
  loading: boolean;
  hint?: string;
  goodWhenUp?: boolean;
  deltaNote?: string;
}) {
  const diff = delta ? delta.current - delta.previous : 0;
  const pct = delta && delta.previous ? Math.round((Math.abs(diff) / delta.previous) * 100) : null;
  const up = diff > 0;
  const good = diff === 0 ? null : goodWhenUp ? up : !up;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-ink-muted">{label}</p>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-soft text-brand">
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-24" />
      ) : (
        <p className="mt-3 font-display text-[28px] font-bold leading-none text-ink tabular">{formatNumber(value ?? 0)}</p>
      )}
      {!loading && delta && (
        <p className="mt-2 flex flex-wrap items-center gap-1 text-xs" title={`${delta.current} ${deltaNote} in the last 7 days, ${delta.previous} in the 7 days before`}>
          {diff === 0 ? (
            <span className="font-semibold text-ink-muted">No change</span>
          ) : (
            <span className={cn("inline-flex items-center gap-0.5 font-semibold", good ? "text-success" : "text-danger")}>
              <Arrow className="h-3.5 w-3.5" aria-hidden />
              {Math.abs(diff)}
              {pct !== null && ` (${pct}%)`}
            </span>
          )}
          <span className="text-ink-subtle">vs last week</span>
        </p>
      )}
      {!loading && hint && !delta && <p className="mt-2 text-xs text-ink-subtle">{hint}</p>}
    </div>
  );
}

function Shortcut({ href, icon: Icon, label, count, loading, tone }: { href: string; icon: LucideIcon; label: string; count?: number; loading: boolean; tone?: "danger" }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card transition-colors hover:border-brand/40 hover:bg-brand-softer focus-visible:outline-2 focus-visible:outline-brand"
    >
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", tone === "danger" ? "bg-danger-soft text-danger" : "bg-brand-soft text-brand")}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span className="block text-xs text-ink-muted">{loading ? "…" : plural(count ?? 0, "ticket")}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-brand" aria-hidden />
    </Link>
  );
}

function StatusChart({ data }: { data: BugSummary["byStatus"] }) {
  if (!data.some((d) => d.count)) return <EmptyState title="No tickets yet" className="py-10" />;
  return (
    <div style={{ height: data.length * 36 + 24 }} role="img" aria-label={`Tickets by status: ${data.map((d) => `${d.status} ${d.count}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 36, left: 0, bottom: 0 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
          <XAxis type="number" tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="status" tick={axis} tickLine={false} axisLine={false} width={150} interval={0} />
          <Tooltip {...tooltipStyle} cursor={{ fill: "var(--surface-muted)" }} formatter={(v) => [formatNumber(Number(v)), "Tickets"]} />
          <Bar dataKey="count" name="Tickets" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {data.map((d) => (
              <Cell key={d.status} fill={STATUS_COLOR[d.status] ?? "var(--chart-current)"} />
            ))}
            <LabelList dataKey="count" position="right" style={{ fontSize: 12, fill: "var(--text)", fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DailyChart({ data }: { data: BugSummary["daily"] }) {
  const rows = data.map((d) => ({ ...d, label: new Date(`${d.date}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) }));
  return (
    <div className="h-64" role="img" aria-label={`New tickets per day: ${rows.map((d) => `${d.label} ${d.count}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="bug-daily" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-current)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--chart-current)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip {...tooltipStyle} cursor={{ stroke: "var(--border-strong)" }} formatter={(v) => [formatNumber(Number(v)), "New tickets"]} />
          <Area type="monotone" dataKey="count" name="New tickets" stroke="var(--chart-current)" strokeWidth={2} fill="url(#bug-daily)" dot={false} activeDot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
