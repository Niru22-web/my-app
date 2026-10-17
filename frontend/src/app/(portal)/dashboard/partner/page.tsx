"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, BarChart3, Briefcase, CalendarDays, FolderClock, IndianRupee, Percent, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { normRole } from "@/lib/roles";
import { fmtDay } from "@/lib/dates";
import { formatCurrency, formatHours, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat";
import { Select } from "@/components/ui/inputs";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { BarList, Panel, QueueTiles, StackedWeeks, TodayCard, WeekComplianceCard } from "@/components/dashboard/insight-parts";
import { PERIOD_OPTIONS, usePartnerInsights, usePartnerList, type Period } from "@/components/dashboard/insights-api";

export default function PartnerDashboardPage() {
  const { user } = useAuth();
  const r = normRole(user?.role);
  const canSwitch = r === "admin" || r === "owner";
  const [partnerId, setPartnerId] = useState<string | undefined>(undefined);
  const [period, setPeriod] = useState<Period>("month");
  const partners = usePartnerList(canSwitch);
  const q = usePartnerInsights(partnerId, period);
  const d = q.data;
  const viewingSelf = !partnerId || partnerId === user?.id;
  const isPartner = r === "partner" || r === "owner" || r === "admin";

  if (q.isError) {
    const msg = q.error instanceof ApiError ? q.error.message : undefined;
    return (
      <Card>
        <ErrorState error={q.error} message={msg} onRetry={() => q.refetch()} />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={viewingSelf ? (isPartner ? "Partner dashboard" : "Team dashboard") : `${d?.lead.name ?? "Partner"} — dashboard`}
        description={d ? `${d.team.size} people in ${viewingSelf ? "your" : "their"} reporting line · work figures for ${d.period.label}` : "Your team and your clients at a glance."}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canSwitch && (
              <Select aria-label="Partner" value={partnerId ?? ""} onChange={(e) => setPartnerId(e.target.value || undefined)} className="w-52">
                <option value="">My team</option>
                {(partners.data ?? [])
                  .filter((p) => p.id !== user?.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </Select>
            )}
            <Segmented aria-label="Period" value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />
          </div>
        }
      />

      {q.isLoading || !d ? (
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          {d.queue && <QueueTiles q={d.queue} />}

          <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Key figures">
            <StatCard label="Hours logged" icon={Briefcase} tone="brand" value={formatHours(d.work.hours)} hint={d.period.label} />
            <StatCard
              label="Billable"
              icon={Percent}
              tone={d.work.billablePct !== null && d.work.billablePct < 70 ? "warning" : "success"}
              value={d.work.billablePct === null ? "—" : `${d.work.billablePct}%`}
              hint={`${formatHours(d.work.billableHours)} billable`}
            />
            <StatCard label="Clients worked on" icon={Users} value={formatNumber(d.work.clients)} hint={`${formatNumber(d.work.activeProjects)} active projects`} />
            <StatCard
              label="Receivable from these clients"
              icon={IndianRupee}
              tone={d.receivables.overdue > 0 ? "danger" : "neutral"}
              value={formatCurrency(d.receivables.outstanding)}
              hint={d.receivables.overdue > 0 ? `${formatCurrency(d.receivables.overdue)} overdue` : `${d.receivables.invoices} open invoice${d.receivables.invoices === 1 ? "" : "s"}`}
            />
          </section>

          <div className="grid gap-6 xl:grid-cols-3">
            <div className="space-y-6 xl:col-span-2">
              <Panel icon={BarChart3} title="Team hours, last 8 weeks" description="Billable and non-billable time logged by your reporting line">
                {d.work.trend.every((w) => w.billable + w.nonBillable === 0) ? (
                  <EmptyState icon={BarChart3} title="No time logged in the last 8 weeks" className="py-10" />
                ) : (
                  <StackedWeeks
                    data={d.work.trend}
                    xKey="week"
                    a={{ key: "billable", label: "Billable" }}
                    b={{ key: "nonBillable", label: "Non-billable" }}
                    xFormat={(v) => fmtDay(v, { day: "numeric", month: "short" })}
                  />
                )}
              </Panel>

              <div className="grid gap-6 lg:grid-cols-2">
                <Panel icon={Users} title="Top clients by hours" description={`${d.period.label} · your team's time`}>
                  <BarList
                    rows={d.work.byClient.map((c) => ({ label: c.name, value: c.hours, sub: c.hours ? `${Math.round((c.billable / c.hours) * 100)}% billable` : undefined }))}
                    unit=" h"
                    empty="No client time in this period"
                  />
                </Panel>
                <Panel icon={Briefcase} title="Hours by person" description={`${d.period.label}`}>
                  <BarList
                    rows={d.work.byPerson.slice(0, 10).map((p) => ({ label: p.name, value: p.hours, sub: p.designation ?? undefined }))}
                    unit=" h"
                    empty="No time logged in this period"
                  />
                  {d.work.byPerson.length > 10 && (
                    <p className="-mt-2 px-5 pb-4 text-xs text-ink-subtle">
                      Top 10 of {d.work.byPerson.length}.{" "}
                      <Link href="/timesheet/team" className="font-semibold text-brand hover:underline">
                        See everyone
                      </Link>
                    </p>
                  )}
                </Panel>
              </div>

              <Panel icon={FolderClock} title="Projects past their end date" description="Still open on clients you're the engagement partner for">
                {d.work.overdueProjects.length === 0 ? (
                  <p className="px-5 pb-5 pt-2 text-sm text-ink-muted">
                    {d.work.engagedClients === 0 ? (
                      <>
                        No clients have you set as engagement partner yet. Set it on each client (Management → Clients → Edit) to track their projects and billing here.
                      </>
                    ) : (
                      "None — every open project is within its dates."
                    )}
                  </p>
                ) : (
                  <ul className="divide-y divide-line px-5 pb-3">
                    {d.work.overdueProjects.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink">{p.name}</span>
                          <span className="text-xs text-ink-subtle">
                            {p.code} · {p.client}
                          </span>
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-danger">
                          <AlertTriangle className="h-3.5 w-3.5" /> ended {p.endDate ? fmtDay(p.endDate, { day: "numeric", month: "short", year: "numeric" }) : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>

            <aside className="space-y-6">
              <TodayCard today={d.team.today} size={d.team.size} title="Team today" />
              <WeekComplianceCard c={d.team.compliance} href="/compliance" />
              <Panel icon={CalendarDays} title="Upcoming leave" description="Approved, next 14 days">
                {d.team.upcomingLeave.length === 0 ? (
                  <p className="px-5 pb-5 pt-2 text-sm text-ink-muted">Nobody is on leave in the next two weeks.</p>
                ) : (
                  <ul className="divide-y divide-line px-5 pb-3">
                    {d.team.upcomingLeave.map((l, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <span className="truncate text-ink">{l.name}</span>
                        <span className="shrink-0 text-xs text-ink-muted">
                          {fmtDay(l.from, { day: "numeric", month: "short" })}
                          {l.to !== l.from ? ` – ${fmtDay(l.to, { day: "numeric", month: "short" })}` : ""} · {l.type}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
