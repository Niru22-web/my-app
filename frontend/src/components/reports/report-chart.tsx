"use client";

import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatNumber } from "@/lib/format";
import type { Chart } from "./api";

// Fixed categorical order (validated in globals.css); a lone series uses the brand colour.
const SERIES = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);
const MAX_PIE_SLICES = 7;

const axis = { fontSize: 12, fill: "var(--text-muted)" };
const tooltipStyle = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 13, boxShadow: "var(--shadow-pop)" },
  labelStyle: { color: "var(--text)", fontWeight: 600 },
  itemStyle: { color: "var(--text)" },
  cursor: { fill: "var(--surface-muted)" },
};
const truncate = (s: unknown, n = 14) => {
  const t = String(s ?? "");
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};

/** Folds a long pie into its top slices + "Other" so colours are never cycled. */
function foldPie(data: Record<string, string | number>[], xKey: string, valueKey: string) {
  const sorted = [...data].sort((a, b) => Number(b[valueKey]) - Number(a[valueKey]));
  if (sorted.length <= MAX_PIE_SLICES) return sorted;
  const head = sorted.slice(0, MAX_PIE_SLICES - 1);
  const rest = sorted.slice(MAX_PIE_SLICES - 1).reduce((s, d) => s + Number(d[valueKey]), 0);
  return [...head, { [xKey]: "Other", [valueKey]: rest }];
}

export function ReportChart({ chart }: { chart: Chart }) {
  const empty = !chart.data.length || chart.data.every((d) => chart.series.every((s) => !Number(d[s.key])));
  const many = chart.data.length > 10;
  const single = chart.series.length === 1;
  // Long category names (people, clients, groups) read better as horizontal bars.
  const horizontal = chart.type !== "line" && chart.data.length <= 15 && chart.data.some((d) => String(d[chart.xKey] ?? "").length > 8);
  const colour = (i: number) => (single ? "var(--chart-current)" : SERIES[i % SERIES.length]);

  return (
    <Card>
      <CardHeader title={chart.title} />
      <div className="px-3 pb-4 sm:px-5">
        {empty ? (
          <EmptyState title="No data in this period" className="py-10" />
        ) : chart.type === "pie" ? (
          <PieBlock chart={chart} />
        ) : (
          <div style={{ height: horizontal ? Math.max(180, chart.data.length * 30 + 40) : 288 }}>
            <ResponsiveContainer width="100%" height="100%">
              {chart.type === "line" ? (
                <LineChart data={chart.data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey={chart.xKey} tick={axis} tickLine={false} axisLine={false} tickFormatter={(v) => truncate(v)} minTickGap={12} />
                  <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip {...tooltipStyle} cursor={{ stroke: "var(--border-strong)" }} />
                  {!single && <Legend wrapperStyle={{ fontSize: 12, color: "var(--text-muted)" }} />}
                  {chart.series.map((s, i) => (
                    <Line key={s.key} dataKey={s.key} name={s.label} stroke={colour(i)} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  ))}
                </LineChart>
              ) : (
                <BarChart
                  data={chart.data}
                  layout={horizontal ? "vertical" : "horizontal"}
                  margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                  barCategoryGap={many ? 2 : "20%"}
                >
                  <CartesianGrid vertical={horizontal} horizontal={!horizontal} stroke="var(--chart-grid)" />
                  {horizontal ? (
                    <>
                      <XAxis type="number" tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
                      <YAxis type="category" dataKey={chart.xKey} tick={axis} tickLine={false} axisLine={false} width={130} tickFormatter={(v) => truncate(v, 18)} />
                    </>
                  ) : (
                    <>
                      <XAxis dataKey={chart.xKey} tick={axis} tickLine={false} axisLine={false} tickFormatter={(v) => truncate(v, many ? 8 : 14)} minTickGap={4} interval="preserveStartEnd" />
                      <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
                    </>
                  )}
                  <Tooltip {...tooltipStyle} formatter={(v) => formatNumber(Number(v))} />
                  {!single && <Legend wrapperStyle={{ fontSize: 12, color: "var(--text-muted)" }} />}
                  {chart.series.map((s, i) => (
                    <Bar
                      key={s.key}
                      dataKey={s.key}
                      name={s.label}
                      stackId={chart.type === "stacked" ? "s" : undefined}
                      fill={colour(i)}
                      stroke="var(--surface)"
                      strokeWidth={chart.type === "stacked" ? 1 : 0}
                      radius={chart.type === "stacked" && i < chart.series.length - 1 ? 0 : 4}
                      maxBarSize={36}
                    />
                  ))}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  );
}

function PieBlock({ chart }: { chart: Chart }) {
  const vk = chart.series[0]?.key ?? "value";
  const data = foldPie(chart.data, chart.xKey, vk);
  const total = data.reduce((s, d) => s + Number(d[vk]), 0);
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[180px_1fr]">
      <div className="mx-auto h-44 w-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey={vk} nameKey={chart.xKey} innerRadius="58%" outerRadius="100%" paddingAngle={1} stroke="var(--surface)" strokeWidth={2}>
              {data.map((_, i) => (
                <Cell key={i} fill={SERIES[i]} />
              ))}
            </Pie>
            <Tooltip {...tooltipStyle} formatter={(v) => formatNumber(Number(v))} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-2 text-[13px]">
        {data.map((d, i) => (
          <li key={String(d[chart.xKey])} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: SERIES[i] }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-ink">{String(d[chart.xKey])}</span>
            <span className="font-semibold tabular text-ink">{formatNumber(Number(d[vk]))}</span>
            <span className="w-11 text-right tabular text-ink-muted">{total ? Math.round((Number(d[vk]) / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
