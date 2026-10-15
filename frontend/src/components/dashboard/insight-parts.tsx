"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarOff, CheckCircle2, ClipboardCheck, Clock3, FileClock, Receipt, Timer, UserX } from "lucide-react";
import { fmtDay } from "@/lib/dates";
import { formatHours, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { TodayAttendance, WeekCompliance } from "./insights-api";

/** Today's attendance in four numbers, with who is late / on leave. */
export function TodayCard({ today, size, title = "Today" }: { today: TodayAttendance; size: number; title?: string }) {
  const cells = [
    { label: "In", value: today.present, tone: "text-success" },
    { label: "Late", value: today.late, tone: today.late ? "text-warning" : "text-ink" },
    { label: "On leave", value: today.onLeave, tone: "text-ink" },
    { label: "Not in yet", value: today.notIn, tone: today.notIn ? "text-ink-muted" : "text-ink" },
  ];
  return (
    <Card>
      <CardHeader icon={Clock3} title={title} description={today.holiday ? `Holiday — ${today.holiday}` : today.offDay ? "Weekly off" : `${size} people`} />
      <div className="grid grid-cols-4 divide-x divide-line px-2 pb-4 pt-3">
        {cells.map((c) => (
          <div key={c.label} className="px-3 text-center">
            <p className={cn("font-display text-2xl font-bold tabular", c.tone)}>{c.value}</p>
            <p className="text-xs text-ink-subtle">{c.label}</p>
          </div>
        ))}
      </div>
      {(today.lateList.length > 0 || today.leaveList.length > 0) && (
        <div className="space-y-1 border-t border-line px-5 py-3 text-xs text-ink-muted">
          {today.lateList.length > 0 && (
            <p>
              <span className="font-semibold text-ink">Late:</span> {today.lateList.slice(0, 5).map((l) => `${l.name} (${l.minutes} min)`).join(", ")}
              {today.lateList.length > 5 ? ` +${today.lateList.length - 5}` : ""}
            </p>
          )}
          {today.leaveList.length > 0 && (
            <p>
              <span className="font-semibold text-ink">On leave:</span> {today.leaveList.slice(0, 6).join(", ")}
              {today.leaveList.length > 6 ? ` +${today.leaveList.length - 6}` : ""}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

/** Last week's timesheets: who logged their expected hours. */
export function WeekComplianceCard({ c, href }: { c: WeekCompliance; href: string }) {
  const pct = c.total ? Math.round((c.compliant / c.total) * 100) : 0;
  return (
    <Card>
      <CardHeader
        icon={Timer}
        title="Timesheets last week"
        description={`${fmtDay(c.week.from, { day: "numeric", month: "short" })} – ${fmtDay(c.week.to, { day: "numeric", month: "short" })} · expected hours, leave excluded`}
        actions={
          <Link href={href} className="text-xs font-semibold text-brand hover:underline">
            Details
          </Link>
        }
      />
      <div className="px-5 pb-2 pt-3">
        <p className="font-display text-3xl font-bold tabular text-ink">
          {c.total ? `${pct}%` : "—"}<span className="ml-2 text-sm font-medium text-ink-muted">{c.total ? "filled in full" : "nobody to check"}</span>
        </p>
        <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={`${c.compliant} complete, ${c.partial} partly, ${c.none} nothing logged`}>
          <span className="bg-success" style={{ width: `${(c.compliant / Math.max(1, c.total)) * 100}%` }} />
          <span className="ml-0.5 bg-warning" style={{ width: `${(c.partial / Math.max(1, c.total)) * 100}%` }} />
          <span className="ml-0.5 bg-danger" style={{ width: `${(c.none / Math.max(1, c.total)) * 100}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
          <Legendish dot="bg-success" label={`${c.compliant} complete`} />
          <Legendish dot="bg-warning" label={`${c.partial} partly`} />
          <Legendish dot="bg-danger" label={`${c.none} nothing logged`} />
        </div>
      </div>
      {c.shortfall.length > 0 && (
        <ul className="divide-y divide-line border-t border-line px-5 text-sm">
          {c.shortfall.slice(0, 5).map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2">
              <span className="truncate text-ink">{s.name}</span>
              <span className="shrink-0 text-xs tabular text-ink-muted">
                {formatHours(s.hours)} of {formatHours(s.expected)} · <span className={s.pct === 0 ? "text-danger" : "text-warning"}>{s.pct}%</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Legendish({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-sm", dot)} aria-hidden /> {label}
    </span>
  );
}

/** Things waiting for the viewer, each linking to where it's done. */
export function QueueTiles({ q }: { q: { leaves: number; claims: number; timesheets: number; corrections: number } }) {
  const tiles = [
    { label: "Leave requests", value: q.leaves, href: "/leave/team", icon: CalendarOff },
    { label: "Expense claims", value: q.claims, href: "/portal/reimbursements/team", icon: Receipt },
    { label: "Timesheets to approve", value: q.timesheets, href: "/timesheet/team", icon: FileClock },
    { label: "Attendance corrections", value: q.corrections, href: "/attendance/requests", icon: ClipboardCheck },
  ];
  const total = tiles.reduce((s, t) => s + t.value, 0);
  return (
    <section aria-label="Waiting for you" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {tiles.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          className={cn(
            "flex items-center gap-3 rounded-[var(--radius-card)] border bg-surface px-4 py-3 shadow-card transition-colors hover:border-brand/40",
            t.value ? "border-warning/40" : "border-line",
          )}
        >
          <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", t.value ? "bg-warning-soft text-warning" : "bg-surface-muted text-ink-subtle")}>
            <t.icon className="h-4.5 w-4.5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-xl font-bold tabular text-ink">{t.value}</span>
            <span className="block truncate text-xs text-ink-muted">{t.label}</span>
          </span>
        </Link>
      ))}
      {total === 0 && <p className="col-span-full -mt-1 flex items-center gap-1.5 text-xs text-ink-subtle"><CheckCircle2 className="h-3.5 w-3.5 text-success" /> Nothing waiting for you.</p>}
    </section>
  );
}

/** Ranked horizontal bars in plain HTML (one series → no legend; value labels on every bar). */
export function BarList({ rows, unit = "", empty, max }: { rows: { label: string; value: number; sub?: string }[]; unit?: string; empty: string; max?: number }) {
  if (!rows.length) return <EmptyState icon={UserX} title={empty} className="py-8" />;
  const top = max ?? Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2.5 px-5 pb-5 pt-3">
      {rows.map((r) => (
        <li key={r.label} className="text-sm">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="truncate text-ink">
              {r.label}
              {r.sub && <span className="ml-1.5 text-xs text-ink-subtle">{r.sub}</span>}
            </span>
            <span className="shrink-0 text-xs font-semibold tabular text-ink">
              {formatNumber(r.value)}
              {unit}
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface-muted">
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, (r.value / top) * 100)}%`, background: "var(--series-1)" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const axis = { fontSize: 11, fill: "var(--color-ink-subtle, #6b7280)" };

/** Two-series stacked weekly bars (e.g. billable vs non-billable hours). */
export function StackedWeeks({
  data,
  xKey,
  a,
  b,
  height = 220,
  xFormat,
}: {
  data: Record<string, number | string>[];
  xKey: string;
  a: { key: string; label: string };
  b: { key: string; label: string };
  height?: number;
  xFormat: (v: string) => string;
}) {
  return (
    <div className="px-2 pb-4 pt-2" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--color-line, #e5e7eb)" strokeDasharray="3 3" />
          <XAxis dataKey={xKey} tickFormatter={xFormat} tick={axis} axisLine={false} tickLine={false} />
          <YAxis tick={axis} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
          <Tooltip content={<ChartTip a={a} b={b} xFormat={xFormat} />} cursor={{ fill: "var(--color-surface-muted, #f3f4f6)" }} />
          <Legend verticalAlign="top" align="right" iconType="square" iconSize={8} wrapperStyle={{ fontSize: 12, paddingBottom: 8 }} />
          <Bar dataKey={a.key} name={a.label} stackId="s" fill="var(--series-1)" stroke="var(--color-surface, #fff)" strokeWidth={2} radius={[0, 0, 0, 0]} />
          <Bar dataKey={b.key} name={b.label} stackId="s" fill="var(--series-2)" stroke="var(--color-surface, #fff)" strokeWidth={2} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Side-by-side bars for two counts per month (e.g. joiners vs leavers). */
export function PairedMonths({ data, a, b, height = 220 }: { data: Record<string, number | string>[]; a: { key: string; label: string }; b: { key: string; label: string }; height?: number }) {
  const xFormat = (v: string) => fmtDay(`${v}-01`, { month: "short" });
  return (
    <div className="px-2 pb-4 pt-2" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} barGap={2} barCategoryGap="24%">
          <CartesianGrid vertical={false} stroke="var(--color-line, #e5e7eb)" strokeDasharray="3 3" />
          <XAxis dataKey="month" tickFormatter={xFormat} tick={axis} axisLine={false} tickLine={false} />
          <YAxis tick={axis} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
          <Tooltip content={<ChartTip a={a} b={b} xFormat={(v) => fmtDay(`${v}-01`, { month: "long", year: "numeric" })} unit="" />} cursor={{ fill: "var(--color-surface-muted, #f3f4f6)" }} />
          <Legend verticalAlign="top" align="right" iconType="square" iconSize={8} wrapperStyle={{ fontSize: 12, paddingBottom: 8 }} />
          <Bar dataKey={a.key} name={a.label} fill="var(--series-1)" radius={[4, 4, 0, 0]} />
          <Bar dataKey={b.key} name={b.label} fill="var(--series-2)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChartTip({
  active,
  payload,
  label,
  a,
  b,
  xFormat,
  unit = " h",
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number }[];
  label?: string;
  a: { key: string; label: string };
  b: { key: string; label: string };
  xFormat: (v: string) => string;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  const v = (k: string) => payload.find((p) => p.dataKey === k)?.value ?? 0;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      <p className="mb-1 font-semibold text-ink">{xFormat(String(label))}</p>
      {[a, b].map((s, i) => (
        <p key={s.key} className="flex items-center gap-2 text-ink-muted">
          <span className="h-2 w-2 rounded-sm" style={{ background: `var(--series-${i + 1})` }} /> {s.label}
          <span className="ml-auto pl-3 font-semibold tabular text-ink">
            {formatNumber(v(s.key))}
            {unit}
          </span>
        </p>
      ))}
    </div>
  );
}

/** A small titled card. */
export function Panel({ icon, title, description, actions, children }: { icon: typeof Clock3; title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader icon={icon} title={title} description={description} actions={actions} />
      {children}
    </Card>
  );
}
