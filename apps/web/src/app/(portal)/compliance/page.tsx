"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, BellRing, Building2, CheckCircle2, Clock3, Download, Flag, Gauge, History, Search, ShieldCheck, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/format";
import { timeAgo } from "@/lib/notifications";
import { normRole } from "@/lib/roles";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/inputs";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { downloadCsv } from "@/components/claims/claim-tabs";
import { RowMenu } from "@/components/management/row-menu";
import { useCompliance } from "@/components/dashboard/queries";
import type { ComplianceDashboard } from "@/lib/types";

type Row = ComplianceDashboard["employees"][number];

const STATUS_LABEL: Record<string, string> = {
  compliant: "Compliant",
  under_40_hours: "Under 40 h",
  missing_daily: "Missing days",
  unsubmitted: "Nothing logged",
  pending: "Pending",
};
const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = { compliant: "success", under_40_hours: "warning", missing_daily: "warning", unsubmitted: "danger", pending: "neutral" };
const RISK_TONE: Record<string, "success" | "warning" | "danger"> = { healthy: "success", warning: "warning", critical: "danger" };

export default function CompliancePage() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const r = normRole(user?.role);
  const firm = ["admin", "owner", "hr", "it"].includes(r);
  const canRemind = firm || ["manager", "partner"].includes(r);
  const canEscalate = firm;

  const q = useCompliance(true);
  const d = q.data;
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("");
  const [risk, setRisk] = useState<"all" | "critical" | "warning" | "healthy">("all");
  const [status, setStatus] = useState("");
  const [view, setView] = useState<"chart" | "table">("chart");
  const [escalate, setEscalate] = useState<Row | null>(null);

  const rows = useMemo(
    () =>
      (d?.employees ?? []).filter((e) => {
        if (dept && e.department !== dept) return false;
        if (risk !== "all" && e.riskLevel !== risk) return false;
        if (status && e.complianceStatus !== status) return false;
        const s = search.trim().toLowerCase();
        return !s || `${e.name} ${e.email ?? ""} ${e.department ?? ""} ${e.managerName ?? ""}`.toLowerCase().includes(s);
      }),
    [d, dept, risk, status, search],
  );
  const depts = useMemo(() => [...new Set((d?.employees ?? []).map((e) => e.department).filter(Boolean) as string[])].sort(), [d]);

  // The API answers 200 with {success:false} when an employee isn't found — treat that as an error.
  const action = useMutation({
    mutationFn: async ({ kind, id }: { kind: "trigger-reminder" | "escalate"; id: string }) => {
      const res = await api<{ success: boolean; message: string }>(`compliance/${kind}/${id}`, { method: "POST" });
      if (!res.success) throw new ApiError(404, res.message);
      return res;
    },
    onSuccess: (res) => {
      toast.success(res.message);
      void qc.invalidateQueries({ queryKey: ["compliance"] });
    },
    onError: (e) => toast.error("Couldn’t send", e instanceof ApiError ? e.message : undefined),
  });

  const k = d?.kpis;
  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Employee",
      sortValue: (e) => e.name,
      cell: (e) => (
        <div className="w-40 sm:w-56">
          <p className="flex items-center gap-2 font-medium text-ink">
            <span className="truncate">{e.name}</span> {e.isRepeatedOffender && <Badge tone="danger">Repeated</Badge>}
          </p>
          <p className="truncate text-xs text-ink-subtle">{[e.department, e.managerName && `reports to ${e.managerName}`].filter(Boolean).join(" · ")}</p>
        </div>
      ),
    },
    {
      key: "hours",
      header: "Hours",
      sortValue: (e) => e.weeklyHours,
      cell: (e) => {
        const pct = Math.min(100, Math.round((e.weeklyHours / (e.targetHours || 40)) * 100));
        return (
          <div className="w-28">
            <p className="text-sm font-semibold tabular text-ink">
              {e.weeklyHours.toFixed(1)}
              <span className="font-normal text-ink-subtle"> / {e.targetHours} h</span>
            </p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
              <div className={cn("h-full rounded-full", pct >= 100 ? "bg-success" : "bg-brand")} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      },
    },
    { key: "missing", header: "Missing days", hideBelow: "md", sortValue: (e) => e.missingDays.length, cell: (e) => (e.missingDays.length ? <span title={e.missingDays.join(", ")} className="text-ink">{e.missingDays.length}</span> : <span className="text-ink-subtle">—</span>) },
    { key: "status", header: "Status", sortValue: (e) => e.complianceStatus, cell: (e) => <Badge tone={STATUS_TONE[e.complianceStatus] ?? "neutral"}>{STATUS_LABEL[e.complianceStatus] ?? e.complianceStatus}</Badge> },
    { key: "risk", header: "Risk", hideBelow: "sm", sortValue: (e) => e.riskScore ?? 0, cell: (e) => <Badge tone={RISK_TONE[e.riskLevel] ?? "neutral"}>{e.riskLevel}{e.riskScore != null ? ` · ${e.riskScore}` : ""}</Badge> },
    { key: "rem", header: "Reminders", hideBelow: "lg", align: "right", sortValue: (e) => e.reminderCount ?? 0, cell: (e) => <span className="text-ink-muted">{e.reminderCount ?? 0}{e.lastReminderAt ? ` · ${timeAgo(e.lastReminderAt)}` : ""}</span> },
    ...(canRemind
      ? [
          {
            key: "act",
            header: "",
            align: "right" as const,
            cell: (e: Row) =>
              e.complianceStatus === "compliant" ? null : (
                <RowMenu
                  items={[
                    { label: "Send reminder email", icon: <BellRing className="h-4 w-4" />, onClick: () => action.mutate({ kind: "trigger-reminder", id: e.employeeId }) },
                    ...(canEscalate ? [{ label: "Escalate to manager & HR", icon: <Flag className="h-4 w-4" />, danger: true, onClick: () => setEscalate(e) }] : []),
                  ]}
                />
              ),
          },
        ]
      : []),
  ];

  if (q.isError)
    return (
      <Card>
        <ErrorState message="The compliance service didn’t respond." onRetry={() => q.refetch()} />
      </Card>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Timesheet compliance"
        description={d ? `Week of ${formatDate(d.weekStart, { day: "numeric", month: "short" })} – ${formatDate(d.weekEnd, { day: "numeric", month: "short", year: "numeric" })} · target 40 hours, Monday–Friday` : "This week’s timesheet completeness"}
        actions={
          <Button
            variant="secondary"
            disabled={!rows.length}
            onClick={() =>
              downloadCsv(
                `compliance-${d?.weekStart?.slice(0, 10)}.csv`,
                ["Employee", "Email", "Department", "Manager", "Hours", "Target", "Missing days", "Status", "Risk", "Risk score", "Reminders"],
                rows.map((e) => [e.name, e.email, e.department, e.managerName, e.weeklyHours, e.targetHours, e.missingDays.join("; "), STATUS_LABEL[e.complianceStatus] ?? e.complianceStatus, e.riskLevel, e.riskScore, e.reminderCount]),
              )
            }
          >
            <Download className="h-4 w-4" /> Export
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Summary">
        <StatCard label="Compliant this week" icon={ShieldCheck} tone="brand" loading={q.isLoading} value={k ? `${k.weeklyCompliance}%` : "—"} hint={k ? `${k.compliantEmployees} of ${k.totalEmployees} people` : undefined} />
        <StatCard label="Missed yesterday" icon={Clock3} loading={q.isLoading} value={formatNumber(k?.missingYesterday)} tone={k?.missingYesterday ? "warning" : "neutral"} />
        <StatCard label="Under 40 hours" icon={Gauge} loading={q.isLoading} value={formatNumber(k?.below40Hours)} />
        <StatCard label="Critical risk" icon={AlertTriangle} loading={q.isLoading} value={formatNumber(k?.criticalRisk)} tone={k?.criticalRisk ? "danger" : "neutral"} hint={k ? `${k.remindersSentToday} reminder${k.remindersSentToday === 1 ? "" : "s"} sent today` : undefined} />
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={CheckCircle2}
            title="Compliance trend"
            description="Share of people meeting the weekly target"
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
          <div className="px-3 pb-4 pt-3">
            {q.isLoading ? (
              <Skeleton className="mx-2 h-[220px]" />
            ) : !(d?.trends?.length) ? (
              <EmptyState title="No trend data yet" />
            ) : view === "chart" ? (
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={d.trends} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="cmpFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-current)" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="var(--chart-current)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                    <XAxis dataKey="weekLabel" tickLine={false} axisLine={false} tick={{ fill: "var(--text-subtle)", fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fill: "var(--text-subtle)", fontSize: 12 }} width={48} unit="%" ticks={[0, 25, 50, 75, 100]} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12 }} formatter={(v) => [`${v}%`, "Compliant"]} />
                    <Area type="monotone" dataKey="compliancePct" stroke="var(--chart-current)" strokeWidth={2} fill="url(#cmpFill)" dot={{ r: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <table className="mx-2 w-[calc(100%-1rem)] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink-subtle">
                    <th className="py-2 font-medium">Week</th>
                    <th className="py-2 text-right font-medium">Compliant</th>
                    <th className="py-2 text-right font-medium">Avg hours</th>
                    <th className="py-2 text-right font-medium">Missing entries</th>
                  </tr>
                </thead>
                <tbody>
                  {d.trends.map((t) => (
                    <tr key={t.weekStart} className="border-b border-line last:border-0">
                      <td className="py-2">{t.weekLabel}</td>
                      <td className="py-2 text-right tabular">{t.compliancePct}%</td>
                      <td className="py-2 text-right tabular">{t.avgHours.toFixed(1)}</td>
                      <td className="py-2 text-right tabular">{t.missingCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader icon={Building2} title="By department" />
          {q.isLoading ? (
            <Skeleton className="m-5 h-40" />
          ) : !(d?.departmentAnalytics?.length) ? (
            <EmptyState title="No department data" />
          ) : (
            <ul className="space-y-3 p-5">
              {[...d.departmentAnalytics].sort((a, b) => a.compliancePct - b.compliancePct).map((x) => (
                <li key={x.department}>
                  <div className="flex justify-between text-[13px]">
                    <span className="truncate text-ink">{x.department}</span>
                    <span className="font-semibold tabular text-ink">
                      {x.compliancePct}% <span className="font-normal text-ink-subtle">· {x.avgHours.toFixed(1)} h avg</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                    <div className={cn("h-full rounded-full", x.compliancePct >= 80 ? "bg-success" : x.compliancePct >= 50 ? "bg-brand" : "bg-danger")} style={{ width: `${x.compliancePct}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented
          aria-label="Risk"
          value={risk}
          onChange={setRisk}
          options={[
            { value: "all", label: "Everyone" },
            { value: "critical", label: "Critical" },
            { value: "warning", label: "Warning" },
            { value: "healthy", label: "Healthy" },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-44">
            <option value="">Any status</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          {depts.length > 1 && (
            <Select aria-label="Department" value={dept} onChange={(e) => setDept(e.target.value)} className="sm:w-48">
              <option value="">All departments</option>
              {depts.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
          )}
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
            <Input placeholder="Search people" aria-label="Search people" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(e) => e.id}
        loading={q.isLoading}
        initialSort={{ key: "risk", dir: "desc" }}
        pageSize={20}
        empty={{ icon: Users, title: "No one matches these filters" }}
      />

      {(d?.recentActivity?.length ?? 0) > 0 && firm && (
        <Card>
          <CardHeader icon={History} title="Recent reminders & escalations" />
          <ul className="divide-y divide-line px-5 pb-2">
            {d!.recentActivity!.slice(0, 8).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                <span className="min-w-0">
                  <span className="font-medium text-ink">{a.employeeName}</span> <span className="text-ink-muted">· {a.description}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {a.type === "escalation_triggered" && <Badge tone="danger">Escalated</Badge>}
                  <span className="text-xs text-ink-subtle">{timeAgo(a.timestamp)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ConfirmDialog
        open={!!escalate}
        onClose={() => setEscalate(null)}
        tone="danger"
        title={`Escalate ${escalate?.name}?`}
        confirmLabel="Escalate"
        busy={action.isPending}
        description="An escalation email goes to their manager (or HR), with HR and their partner in copy. This is recorded in their compliance history."
        onConfirm={() => escalate && action.mutate({ kind: "escalate", id: escalate.employeeId }, { onSuccess: () => setEscalate(null) })}
      />
    </div>
  );
}
