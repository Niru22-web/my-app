"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Briefcase, CheckCircle2, Clock, Download, Info, PieChart, Receipt, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { addDays, endOfMonth, fmtDay, startOfMonth, today, weekStart, workDate, type YMD } from "@/lib/dates";
import { formatCurrency, formatHours, formatNumber, plural } from "@/lib/format";
import { normRole } from "@/lib/roles";
import type { Envelope } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat";
import { Input, Select } from "@/components/ui/inputs";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { downloadCsv } from "@/components/claims/claim-tabs";

interface Row {
  id: string;
  date: string;
  hours: number;
  description: string;
  billableStatus: string;
  submissionStatus: string;
  employee: { id: string; employeeId: string; firstName: string; lastName: string | null };
  job: { id: string; jobId: string; name: string; project: { id: string; name: string; client: { id: string; name: string } } };
}
interface TimesheetReport {
  totalHours: number;
  totalEntries: number;
  timelogs: Row[];
}
interface Overview {
  attendanceBreakdown: { label: string; value: number }[];
  leaveBreakdown: { label: string; value: number }[];
  reimbursementBreakdown: { label: string; value: number }[];
}

type Preset = "week" | "month" | "last-month" | "30" | "custom";
type Dim = "client" | "project" | "job" | "person";

/** Mirrors the API's own scoping for /timelogs/reports (exact role names). */
function scopeOf(role?: string): "firm" | "team" | "self" {
  if (role === "Admin" || role === "Owner") return "firm";
  if (role === "Manager" || role === "Partner") return "team";
  return "self";
}
const SCOPE_TEXT = { firm: "everyone in the firm", team: "you and the people who report to you", self: "your own entries" };

function rangeFor(p: Preset, now: YMD): [YMD, YMD] {
  if (p === "week") return [weekStart(now), now];
  if (p === "month") return [startOfMonth(now), now];
  if (p === "last-month") {
    const prev = addDays(startOfMonth(now), -1);
    return [startOfMonth(prev), endOfMonth(prev)];
  }
  return [addDays(now, -29), now];
}

const isBillable = (r: Row) => r.billableStatus === "billable";
const person = (r: Row) => `${r.employee.firstName} ${r.employee.lastName ?? ""}`.trim();

export default function ReportsPage() {
  const { user } = useAuth();
  const scope = scopeOf(user?.role);
  // Firm-wide roles may see firm attendance/leave/claims; the overview API wrongly opens these to managers too, so they're skipped there.
  const showPeopleOps = ["admin", "owner", "hr", "it"].includes(normRole(user?.role)) || scope === "self";
  const now = today();

  const [preset, setPreset] = useState<Preset>("month");
  const [custom, setCustom] = useState<[YMD, YMD]>(() => rangeFor("30", now));
  const [from, to] = preset === "custom" ? custom : rangeFor(preset, now);
  const [client, setClient] = useState("");
  const [project, setProject] = useState("");
  const [dim, setDim] = useState<Dim>("client");

  const q = useQuery({
    queryKey: ["reports", "timesheet", from, to],
    queryFn: async () => (await api<Envelope<TimesheetReport>>("timelogs/reports", { query: { dateFrom: from, dateTo: `${to}T23:59:59.999Z` } })).data,
    enabled: !!user && from <= to,
  });
  const ov = useQuery({
    queryKey: ["reports", "overview", from, to],
    queryFn: async () => (await api<Envelope<Overview>>("reports/overview", { query: { fromDate: from, toDate: to } })).data,
    enabled: !!user && showPeopleOps && from <= to,
  });

  const all = useMemo(() => q.data?.timelogs ?? [], [q.data]);
  const clients = useMemo(() => [...new Map(all.map((r) => [r.job.project.client.id, r.job.project.client.name])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [all]);
  const projects = useMemo(
    () => [...new Map(all.filter((r) => !client || r.job.project.client.id === client).map((r) => [r.job.project.id, r.job.project.name])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [all, client],
  );
  const rows = useMemo(() => all.filter((r) => (!client || r.job.project.client.id === client) && (!project || r.job.project.id === project)), [all, client, project]);

  const totals = useMemo(() => {
    let hours = 0, billable = 0, approved = 0;
    const people = new Set<string>();
    for (const r of rows) {
      hours += r.hours;
      if (isBillable(r)) billable += r.hours;
      if (r.submissionStatus === "approved") approved += r.hours;
      people.add(r.employee.id);
    }
    return { hours, billable, approved, people: people.size };
  }, [rows]);

  // Daily buckets for ranges up to ~5 weeks, weekly (Monday) beyond that.
  const daily = (new Date(to).getTime() - new Date(from).getTime()) / 864e5 <= 35;
  const series = useMemo(() => {
    const map = new Map<YMD, { billable: number; nonBillable: number }>();
    for (let d = daily ? from : weekStart(from); d <= to; d = addDays(d, daily ? 1 : 7)) map.set(d, { billable: 0, nonBillable: 0 });
    for (const r of rows) {
      const d = workDate(r.date);
      const k = daily ? d : weekStart(d);
      const b = map.get(k);
      if (!b) continue;
      if (isBillable(r)) b.billable += r.hours;
      else b.nonBillable += r.hours;
    }
    return [...map.entries()].map(([d, v]) => ({ label: fmtDay(d, { day: "numeric", month: "short" }), billable: +v.billable.toFixed(2), nonBillable: +v.nonBillable.toFixed(2) }));
  }, [rows, from, to, daily]);

  const breakdown = useMemo(() => {
    const key = (r: Row) =>
      dim === "client" ? r.job.project.client.name : dim === "project" ? `${r.job.project.name} · ${r.job.project.client.name}` : dim === "job" ? `${r.job.name} (${r.job.jobId})` : person(r);
    const m = new Map<string, { hours: number; billable: number; entries: number }>();
    for (const r of rows) {
      const k = key(r);
      const v = m.get(k) ?? { hours: 0, billable: 0, entries: 0 };
      v.hours += r.hours;
      if (isBillable(r)) v.billable += r.hours;
      v.entries++;
      m.set(k, v);
    }
    return [...m.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.hours - a.hours);
  }, [rows, dim]);

  const exportCsv = () =>
    downloadCsv(
      `timesheet-report-${from}-to-${to}.csv`,
      ["Date", "Employee code", "Employee", "Client", "Project", "Job code", "Job", "Hours", "Billable", "Status", "Description"],
      [...rows]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((r) => [workDate(r.date), r.employee.employeeId, person(r), r.job.project.client.name, r.job.project.name, r.job.jobId, r.job.name, r.hours, isBillable(r) ? "Yes" : "No", r.submissionStatus, r.description]),
    );

  const pct = (n: number) => (totals.hours ? `${Math.round((n / totals.hours) * 100)}% of logged` : undefined);
  const dims: { value: Dim; label: string }[] = [
    { value: "client", label: "Clients" },
    { value: "project", label: "Projects" },
    { value: "job", label: "Jobs" },
    ...(scope !== "self" ? [{ value: "person" as const, label: "People" }] : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description={
          <span className="inline-flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" aria-hidden /> Timesheet figures cover {SCOPE_TEXT[scope]}.
          </span>
        }
        actions={
          <Button variant="secondary" disabled={!rows.length} onClick={exportCsv}>
            <Download className="h-4 w-4" /> Export entries
          </Button>
        }
      />

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <Segmented
          aria-label="Period"
          value={preset}
          onChange={setPreset}
          options={[
            { value: "week", label: "This week" },
            { value: "month", label: "This month" },
            { value: "last-month", label: "Last month" },
            { value: "30", label: "Last 30 days" },
            { value: "custom", label: "Custom" },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          {preset === "custom" && (
            <div className="flex items-center gap-2">
              <Input type="date" aria-label="From" value={custom[0]} max={custom[1]} onChange={(e) => setCustom([e.target.value, custom[1]])} className="sm:w-40" />
              <span className="text-ink-subtle">–</span>
              <Input type="date" aria-label="To" value={custom[1]} min={custom[0]} onChange={(e) => setCustom([custom[0], e.target.value])} className="sm:w-40" />
            </div>
          )}
          <Select aria-label="Client" value={client} onChange={(e) => (setClient(e.target.value), setProject(""))} className="sm:w-48">
            <option value="">All clients</option>
            {clients.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
          <Select aria-label="Project" value={project} onChange={(e) => setProject(e.target.value)} className="sm:w-48">
            <option value="">All projects</option>
            {projects.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {q.isError ? (
        <Card>
          <ErrorState message="The report couldn’t be generated." onRetry={() => q.refetch()} />
        </Card>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Summary">
            <StatCard label="Hours logged" icon={Clock} tone="brand" loading={q.isLoading} value={formatHours(totals.hours)} hint={`${plural(rows.length, "entry", "entries")} · ${fmtDay(from, { day: "numeric", month: "short" })} – ${fmtDay(to, { day: "numeric", month: "short" })}`} />
            <StatCard label="Billable hours" icon={Briefcase} loading={q.isLoading} value={formatHours(totals.billable)} hint={pct(totals.billable)} />
            <StatCard label="Approved hours" icon={CheckCircle2} loading={q.isLoading} value={formatHours(totals.approved)} hint={pct(totals.approved)} />
            <StatCard label={scope === "self" ? "Clients worked for" : "People who logged time"} icon={Users} loading={q.isLoading} value={formatNumber(scope === "self" ? new Set(rows.map((r) => r.job.project.client.id)).size : totals.people)} />
          </section>

          <Card>
            <CardHeader icon={BarChart3} title={daily ? "Hours per day" : "Hours per week"} description="Billable and non-billable" />
            <div className="px-3 pb-4 pt-3">
              {q.isLoading ? (
                <Skeleton className="mx-2 h-[260px]" />
              ) : !rows.length ? (
                <EmptyState icon={Clock} title="No hours logged in this period" />
              ) : (
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--text-subtle)", fontSize: 12 }} minTickGap={12} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--text-subtle)", fontSize: 12 }} width={40} />
                      <Tooltip cursor={{ fill: "var(--surface-muted)" }} contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12 }} formatter={(v, n) => [`${v} h`, n]} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="billable" name="Billable" stackId="h" fill="var(--chart-current)" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="nonBillable" name="Non-billable" stackId="h" fill="var(--chart-previous)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader icon={PieChart} title="Where the time went" actions={<Segmented aria-label="Group by" value={dim} onChange={setDim} options={dims} />} />
            {q.isLoading ? (
              <Skeleton className="m-5 h-40" />
            ) : !breakdown.length ? (
              <EmptyState title="Nothing to break down" />
            ) : (
              <div className="overflow-x-auto px-5 pb-4">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-ink-subtle">
                      <th className="py-2 font-medium">{dims.find((d) => d.value === dim)?.label.replace(/s$/, "")}</th>
                      <th className="w-1/3 py-2 font-medium">Share</th>
                      <th className="py-2 text-right font-medium">Hours</th>
                      <th className="py-2 text-right font-medium">Billable</th>
                      <th className="py-2 text-right font-medium">Entries</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.slice(0, 50).map((b) => (
                      <tr key={b.label} className="border-b border-line last:border-0">
                        <td className="max-w-xs truncate py-2.5 pr-3 text-ink">{b.label}</td>
                        <td className="py-2.5 pr-3">
                          <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                            <div className="h-full rounded-full bg-brand" style={{ width: `${(b.hours / totals.hours) * 100}%` }} />
                          </div>
                        </td>
                        <td className="py-2.5 text-right font-semibold tabular text-ink">{b.hours.toFixed(1)}</td>
                        <td className="py-2.5 text-right tabular text-ink-muted">{b.billable.toFixed(1)}</td>
                        <td className="py-2.5 text-right tabular text-ink-muted">{b.entries}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {breakdown.length > 50 && <p className="pt-3 text-xs text-ink-subtle">Showing the top 50 of {breakdown.length}. Export entries for the full list.</p>}
              </div>
            )}
          </Card>
        </>
      )}

      {showPeopleOps && (
        <div className="grid gap-6 lg:grid-cols-3">
          <BreakdownCard icon={Clock} title="Attendance days" hint="By status, in this period" loading={ov.isLoading} error={ov.isError} items={ov.data?.attendanceBreakdown} format={(v) => formatNumber(v)} />
          <BreakdownCard icon={Users} title="Leave days" hint="By status, for requests made in this period" loading={ov.isLoading} error={ov.isError} items={ov.data?.leaveBreakdown} format={(v) => formatNumber(v)} />
          <BreakdownCard icon={Receipt} title="Reimbursements" hint="Amount by status, claims made in this period" loading={ov.isLoading} error={ov.isError} items={ov.data?.reimbursementBreakdown} format={(v) => formatCurrency(v)} />
        </div>
      )}
    </div>
  );
}

function BreakdownCard({
  icon,
  title,
  hint,
  items,
  loading,
  error,
  format,
}: {
  icon: typeof Clock;
  title: string;
  hint: string;
  items?: { label: string; value: number }[];
  loading: boolean;
  error: boolean;
  format: (v: number) => string;
}) {
  const list = (items ?? []).filter((i) => i.value > 0);
  const max = Math.max(1, ...list.map((i) => i.value));
  return (
    <Card>
      <CardHeader icon={icon} title={title} description={hint} />
      {loading ? (
        <Skeleton className="m-5 h-28" />
      ) : error ? (
        <EmptyState title="Couldn’t load" className="py-8" />
      ) : !list.length ? (
        <EmptyState title="Nothing in this period" className="py-8" />
      ) : (
        <ul className="space-y-3 p-5">
          {list.map((i) => (
            <li key={i.label}>
              <div className="flex justify-between text-[13px]">
                <span className="capitalize text-ink">{i.label.replace(/_/g, " ").toLowerCase()}</span>
                <span className="font-semibold tabular text-ink">{format(i.value)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                <div className="h-full rounded-full bg-brand" style={{ width: `${(i.value / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
