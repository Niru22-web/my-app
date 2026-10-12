"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import type { CombinedDashboard } from "@/lib/types";
import { Card, CardHeader } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function mondayOf(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return x;
}

type Row = { day: string; current: number; previous: number };

function bucket(points: CombinedDashboard["attendance"]): Row[] {
  const thisMon = mondayOf(new Date()).getTime();
  const lastMon = thisMon - 7 * 86400000;
  const rows: Row[] = DAYS.map((day) => ({ day, current: 0, previous: 0 }));
  for (const p of points) {
    const d = new Date(p.date);
    if (Number.isNaN(d.getTime())) continue;
    const local = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const idx = (d.getDay() + 6) % 7;
    if (local >= thisMon) rows[idx].current += p.hours;
    else if (local >= lastMon) rows[idx].previous += p.hours;
  }
  return rows.map((r) => ({ ...r, current: +r.current.toFixed(2), previous: +r.previous.toFixed(2) }));
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const get = (k: string) => payload.find((p) => p.dataKey === k)?.value ?? 0;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      <p className="mb-1 font-semibold text-ink">{label}</p>
      <p className="flex items-center gap-2 text-ink-muted">
        <span className="h-2 w-2 rounded-sm bg-chart-current" /> This week <span className="ml-auto pl-3 font-semibold text-ink tabular">{get("current")} h</span>
      </p>
      <p className="flex items-center gap-2 text-ink-muted">
        <span className="h-2 w-2 rounded-sm bg-chart-previous" /> Last week <span className="ml-auto pl-3 font-semibold text-ink tabular">{get("previous")} h</span>
      </p>
    </div>
  );
}

export function WeeklyHours({ data, loading, firmWide }: { data?: CombinedDashboard; loading: boolean; firmWide: boolean }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const rows = useMemo(() => bucket(data?.attendance ?? []), [data]);
  const totals = rows.reduce((a, r) => ({ current: a.current + r.current, previous: a.previous + r.previous }), { current: 0, previous: 0 });
  const empty = !loading && totals.current === 0 && totals.previous === 0;

  return (
    <Card className="flex flex-col">
      <CardHeader
        icon={BarChart3}
        title={
          <span className="flex items-center gap-2">
            Attendance hours {firmWide && <Badge tone="brand">Firm-wide</Badge>}
          </span>
        }
        description="Hours recorded each day — this week compared with last week"
        actions={
          <Segmented
            aria-label="View"
            value={view}
            onChange={setView}
            options={[
              { value: "chart", label: "Chart" },
              { value: "table", label: "Table" },
            ]}
          />
        }
      />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 pt-4">
        <Legend swatch="bg-chart-current" label="This week" value={totals.current} />
        <Legend swatch="bg-chart-previous" label="Last week" value={totals.previous} />
      </div>
      <div className="px-3 pb-4 pt-2">
        {loading ? (
          <Skeleton className="mx-2 h-[260px]" />
        ) : empty ? (
          <EmptyState icon={BarChart3} title="No hours recorded yet" description="Attendance hours for this week and last week will appear here." />
        ) : view === "chart" ? (
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} barGap={2} barCategoryGap="28%" margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: "var(--text-subtle)", fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} tick={{ fill: "var(--text-subtle)", fontSize: 12 }} width={44} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--brand-softer)" }} />
                <Bar dataKey="current" name="This week" fill="var(--chart-current)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="previous" name="Last week" fill="var(--chart-previous)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="overflow-x-auto px-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-subtle">
                  <th className="py-2 font-medium">Day</th>
                  <th className="py-2 text-right font-medium">This week</th>
                  <th className="py-2 text-right font-medium">Last week</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.day} className="border-b border-line last:border-0">
                    <td className="py-2 text-ink">{r.day}</td>
                    <td className="py-2 text-right text-ink tabular">{r.current} h</td>
                    <td className="py-2 text-right text-ink-muted tabular">{r.previous} h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

function Legend({ swatch, label, value }: { swatch: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-sm ${swatch}`} aria-hidden />
      <span className="text-[13px] text-ink-muted">{label}</span>
      <span className="text-[13px] font-semibold text-ink tabular">{value.toFixed(1)} h</span>
    </div>
  );
}
