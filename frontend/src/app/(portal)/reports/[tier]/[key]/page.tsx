"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Info, Lock } from "lucide-react";
import { addDays, endOfMonth, fmtRange, startOfMonth, today, type YMD } from "@/lib/dates";
import { formatDate, formatNumber } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat";
import { Input, Select } from "@/components/ui/inputs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { ApiError } from "@/lib/api";
import { TIER_META, useFilterOptions, useReport, useReportCatalog, type RunParams, type Tier } from "@/components/reports/api";
import { ReportChart } from "@/components/reports/report-chart";
import { ReportTable, formatValue } from "@/components/reports/report-table";

type Preset = "month" | "last-month" | "quarter" | "fy" | "30" | "custom";
const PRESETS: { value: Preset; label: string }[] = [
  { value: "month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "30", label: "Last 30 days" },
  { value: "quarter", label: "This quarter" },
  { value: "fy", label: "This financial year" },
  { value: "custom", label: "Custom range" },
];
function presetRange(p: Preset, now: YMD): [YMD, YMD] {
  const [y, m] = now.split("-").map(Number);
  if (p === "last-month") {
    const prev = addDays(startOfMonth(now), -1);
    return [startOfMonth(prev), endOfMonth(prev)];
  }
  if (p === "30") return [addDays(now, -29), now];
  if (p === "quarter") {
    const qStart = Math.floor((m - 1) / 3) * 3 + 1;
    return [`${y}-${String(qStart).padStart(2, "0")}-01`, now];
  }
  if (p === "fy") return [`${m >= 4 ? y : y - 1}-04-01`, now];
  return [startOfMonth(now), now];
}
const shiftMonth = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const TONE = { good: "success", warn: "warning", bad: "danger" } as const;

export default function ReportPage({ params }: { params: Promise<{ tier: string; key: string }> }) {
  const { tier: rawTier, key } = use(params);
  const tier = rawTier as Tier;
  const now = today();
  const cat = useReportCatalog();
  const def = cat.data?.reports.find((r) => r.key === key && r.tiers.includes(tier));
  const p = new Set(def?.params ?? []);

  const [preset, setPreset] = useState<Preset>("month");
  const [custom, setCustom] = useState<[YMD, YMD]>(presetRange("month", now));
  const [date, setDate] = useState<YMD>(now);
  const [month, setMonth] = useState(now.slice(0, 7));
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const opts = useFilterOptions(p.has("client"), p.has("project"));

  const [from, to] = preset === "custom" ? custom : presetRange(preset, now);
  const run: RunParams = p.has("date") ? { date } : p.has("month") ? { month } : { from, to };
  if (p.has("client") && clientId) run.clientId = clientId;
  if (p.has("project") && projectId) run.projectId = projectId;
  const rep = useReport(tier, key, run, !!def);

  const back = (
    <Link href={TIER_META[tier]?.href ?? "/reports"} className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink-muted hover:text-brand print:hidden">
      <ArrowLeft className="h-4 w-4" aria-hidden /> {TIER_META[tier]?.label ?? "Reports"}
    </Link>
  );

  if (cat.isLoading) return <Skeleton className="h-[480px]" />;
  if (!def)
    return (
      <div className="space-y-4">
        {back}
        <Card>
          <EmptyState icon={Lock} title="This report isn’t available" description="It may not exist, or your access doesn’t include it." />
        </Card>
      </div>
    );

  const data = rep.data;
  const projects = clientId ? opts.projects.filter((x) => x.clientId === clientId) : opts.projects;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        {back}
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-xl font-bold text-ink">{def.title}</h1>
            <p className="mt-1 text-sm text-ink-muted">{def.description}</p>
          </div>
          {data && (
            <p className="text-[13px] text-ink-muted">
              {formatNumber(data.meta.people)} {data.meta.people === 1 ? "person" : "people"}
              {p.size > 0 && " · "}
              {p.size === 0 ? null : data.meta.from === data.meta.to ? formatDate(data.meta.from, { day: "numeric", month: "short", year: "numeric" }) : fmtRange(data.meta.from, data.meta.to)}
            </p>
          )}
        </div>
      </div>

      {(p.has("range") || p.has("date") || p.has("month") || p.has("client")) && (
        <Card className="flex flex-wrap items-end gap-3 p-4 print:hidden">
          {p.has("range") && (
            <>
              <label className="grid gap-1 text-xs font-semibold text-ink-muted">
                Period
                <Select value={preset} onChange={(e) => { const v = e.target.value as Preset; setPreset(v); if (v === "custom") setCustom([from, to]); }} aria-label="Period" className="w-48">
                  {PRESETS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </label>
              {preset === "custom" && (
                <>
                  <label className="grid gap-1 text-xs font-semibold text-ink-muted">
                    From
                    <Input type="date" value={custom[0]} max={custom[1]} onChange={(e) => e.target.value && setCustom([e.target.value, custom[1]])} />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-ink-muted">
                    To
                    <Input type="date" value={custom[1]} min={custom[0]} onChange={(e) => e.target.value && setCustom([custom[0], e.target.value])} />
                  </label>
                </>
              )}
            </>
          )}
          {p.has("date") && (
            <Stepper label="Day" onPrev={() => setDate(addDays(date, -1))} onNext={() => setDate(addDays(date, 1))}>
              <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Day" />
            </Stepper>
          )}
          {p.has("month") && (
            <Stepper label="Month" onPrev={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))}>
              <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" />
            </Stepper>
          )}
          {p.has("client") && (
            <label className="grid gap-1 text-xs font-semibold text-ink-muted">
              Client
              <Select value={clientId} onChange={(e) => { setClientId(e.target.value); setProjectId(""); }} aria-label="Client" className="w-56">
                <option value="">All clients</option>
                {opts.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </label>
          )}
          {p.has("project") && (
            <label className="grid gap-1 text-xs font-semibold text-ink-muted">
              Project
              <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Project" className="w-56">
                <option value="">All projects</option>
                {projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            </label>
          )}
          {rep.isFetching && <span className="pb-2.5 text-xs text-ink-subtle">Updating…</span>}
        </Card>
      )}

      {rep.isError ? (
        <Card>
          <ErrorState message={rep.error instanceof ApiError ? rep.error.message : undefined} onRetry={() => rep.refetch()} />
        </Card>
      ) : !data ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
          <Skeleton className="h-80" />
        </div>
      ) : (
        <>
          {data.kpis.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {data.kpis.map((k) => (
                <StatCard key={k.label} label={k.label} value={formatValue(k.value, k.format)} hint={k.hint} tone={k.tone ? TONE[k.tone] : "neutral"} />
              ))}
            </div>
          )}

          {data.charts.length > 0 && (
            <div className={data.charts.length > 1 ? "grid gap-6 lg:grid-cols-2" : ""}>
              {data.charts.map((c) => <ReportChart key={c.title} chart={c} />)}
            </div>
          )}

          {!!data.notes?.length && (
            <div className="flex gap-2 rounded-xl border border-line bg-surface-muted px-4 py-3 text-[13px] text-ink-muted">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
              <ul className="space-y-1">{data.notes.map((n) => <li key={n}>{n}</li>)}</ul>
            </div>
          )}

          <ReportTable columns={data.columns} rows={data.rows} fileName={`${key}-${data.meta.from}${data.meta.to !== data.meta.from ? `-to-${data.meta.to}` : ""}`} />
        </>
      )}
    </div>
  );
}

function Stepper({ label, onPrev, onNext, children }: { label: string; onPrev: () => void; onNext: () => void; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 text-xs font-semibold text-ink-muted">
      {label}
      <div className="flex items-center gap-1">
        <Button variant="secondary" size="icon" onClick={onPrev} aria-label={`Previous ${label.toLowerCase()}`}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {children}
        <Button variant="secondary" size="icon" onClick={onNext} aria-label={`Next ${label.toLowerCase()}`}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
