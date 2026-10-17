"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingDown, TrendingUp, BarChart3 } from "lucide-react";
import { addDays, today, weekStart } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { Card, CardHeader } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { useWeeklyPulse } from "./api";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** This week vs last week, from the caller's own attendance (GET /attendance/weekly-pulse). */
export function WeekCompare() {
  const thisMon = weekStart(today());
  const q = useWeeklyPulse(addDays(thisMon, -7), addDays(thisMon, 6));
  const [view, setView] = useState<"chart" | "table">("chart");
  const d = q.data;
  const rows = DAYS.map((day) => ({ day, current: +(d?.thisWeekDays?.[day] ?? 0).toFixed(2), previous: +(d?.prevWeekDays?.[day] ?? 0).toFixed(2) }));
  const empty = d && !d.thisWeekHours && !d.prevWeekHours;
  const up = (d?.hoursDiff ?? 0) >= 0;

  return (
    <Card className="flex flex-col">
      <CardHeader
        icon={BarChart3}
        title="Week on week"
        description="Hours at work this week compared with last week"
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
        <Legend swatch="bg-chart-current" label="This week" value={d?.thisWeekHours} />
        <Legend swatch="bg-chart-previous" label="Last week" value={d?.prevWeekHours} />
        {d && d.prevWeekHours > 0 && (
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", up ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>
            {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {up ? "+" : ""}
            {d.hoursDiff.toFixed(1)} h ({up ? "+" : ""}
            {d.percentDiff.toFixed(0)}%)
          </span>
        )}
      </div>
      <div className="px-3 pb-4 pt-2">
        {q.isLoading ? (
          <Skeleton className="mx-2 h-[220px]" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : empty ? (
          <EmptyState icon={BarChart3} title="No attendance hours in the last two weeks" />
        ) : view === "chart" ? (
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} barGap={2} barCategoryGap="28%" margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: "var(--text-subtle)", fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} tick={{ fill: "var(--text-subtle)", fontSize: 12 }} width={44} />
                <Tooltip
                  cursor={{ fill: "var(--brand-softer)" }}
                  contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12 }}
                  formatter={(v, n) => [`${v ?? 0} h`, n === "current" ? "This week" : "Last week"]}
                />
                <Bar dataKey="current" fill="var(--chart-current)" radius={[4, 4, 0, 0]} maxBarSize={26} />
                <Bar dataKey="previous" fill="var(--chart-previous)" radius={[4, 4, 0, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <table className="mx-2 w-[calc(100%-1rem)] text-sm">
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
                  <td className="py-2">{r.day}</td>
                  <td className="py-2 text-right tabular">{r.current} h</td>
                  <td className="py-2 text-right tabular text-ink-muted">{r.previous} h</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}

function Legend({ swatch, label, value }: { swatch: string; label: string; value?: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-sm ${swatch}`} aria-hidden />
      <span className="text-[13px] text-ink-muted">{label}</span>
      <span className="text-[13px] font-semibold text-ink tabular">{value != null ? `${value.toFixed(1)} h` : "—"}</span>
    </div>
  );
}
