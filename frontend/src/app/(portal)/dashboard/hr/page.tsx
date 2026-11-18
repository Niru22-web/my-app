"use client";

import Link from "next/link";
import { CalendarOff, Cake, ClipboardCheck, DoorOpen, FileWarning, LineChart, Lock, UserPlus, Users } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { normRole } from "@/lib/roles";
import { fmtDay } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { BarList, PairedMonths, Panel, TodayCard, WeekComplianceCard } from "@/components/dashboard/insight-parts";
import { useHrInsights } from "@/components/dashboard/insights-api";

export default function HrDashboardPage() {
  const { user } = useAuth();
  const allowed = ["admin", "owner", "hr"].includes(normRole(user?.role));
  const q = useHrInsights(allowed);
  const d = q.data;

  // Same rule as the API: answer "no access" here instead of sending a request that can only be refused.
  if (user && !allowed)
    return (
      <Card>
        <EmptyState icon={Lock} title="You don’t have access to this page" description="The HR dashboard is for HR, Admin and Owner." />
      </Card>
    );

  if (q.isError)
    return (
      <Card>
        <ErrorState error={q.error} message={q.error instanceof ApiError ? q.error.message : undefined} onRetry={() => q.refetch()} />
      </Card>
    );

  if (q.isLoading || !d)
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-72" />
      </div>
    );

  // Departments only help when they're actually filled in; otherwise show designations.
  const groups = d.headcount.byDepartment.length > 1 ? { title: "Headcount by department", rows: d.headcount.byDepartment } : { title: "Headcount by designation", rows: d.headcount.byDesignation };
  const actions = [
    { label: "Leave requests waiting", value: d.leave.pending, href: "/leave/org" },
    { label: "Attendance corrections waiting", value: d.corrections, href: "/attendance/requests" },
    { label: "Joiners to approve", value: d.headcount.pendingApproval, href: "/management/employees" },
    { label: "Invites not yet accepted", value: d.headcount.invited, href: "/management/employees" },
    { label: "Documents to check", value: d.documents?.awaiting ?? 0, href: "/management/documents" },
    { label: "People missing required documents", value: d.documents?.missingPeople ?? 0, href: "/management/documents" },
    { label: "Profiles without date of birth / joining", value: d.headcount.missingProfile, href: "/management/employees" },
    { label: "People with a negative leave balance", value: d.leave.negative, href: "/leave/org" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="HR dashboard" description="People, attendance, leave and paperwork across the firm." />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Key figures">
        <StatCard label="Active employees" icon={Users} tone="brand" value={d.headcount.active} hint={`${d.headcount.joinedLast30} joined in the last 30 days`} />
        <StatCard label="Exits in progress" icon={DoorOpen} tone={d.movement.leavingIn30 ? "warning" : "neutral"} value={d.movement.exitsInProgress} hint={`${d.movement.leavingIn30} leaving within 30 days`} />
        <StatCard label="On leave today" icon={CalendarOff} value={d.today.onLeave} hint={`${d.leave.upcoming7} more leave starts this week`} />
        <StatCard label="Left this financial year" icon={UserPlus} value={d.movement.leftThisFy} hint="completed exits" />
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel icon={ClipboardCheck} title="Needs HR’s attention" description="Click a line to open it">
            <ul className="grid gap-x-6 px-5 pb-4 pt-2 sm:grid-cols-2">
              {actions.map((a) => (
                <li key={a.label}>
                  <Link href={a.href} className="flex items-center justify-between gap-3 border-b border-line py-2.5 text-sm hover:text-brand">
                    <span className="text-ink-muted">{a.label}</span>
                    <span className={cn("font-display text-lg font-bold tabular", a.value ? "text-ink" : "text-ink-subtle")}>{a.value}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel icon={LineChart} title="Joiners and leavers" description="Last 12 months (date of joining / last working day of completed exits)">
            <PairedMonths data={d.movement.months} a={{ key: "joiners", label: "Joined" }} b={{ key: "leavers", label: "Left" }} />
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel icon={Users} title={groups.title} description={`${d.headcount.active} active`}>
              <BarList rows={groups.rows.slice(0, 10).map((g) => ({ label: g.name, value: g.count }))} empty="No active employees" />
            </Panel>
            <Panel icon={DoorOpen} title="People leaving" description="Exits in progress">
              {d.movement.exits.length === 0 ? (
                <p className="px-5 pb-5 pt-2 text-sm text-ink-muted">No exits in progress.</p>
              ) : (
                <ul className="divide-y divide-line px-5 pb-3">
                  {d.movement.exits.map((x, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate text-ink">{x.name}</span>
                        <span className="text-xs text-ink-subtle">{x.type}</span>
                      </span>
                      <span className={cn("shrink-0 text-xs", x.inDays < 0 ? "text-danger" : x.inDays <= 7 ? "text-warning" : "text-ink-muted")}>
                        {fmtDay(x.lastDay, { day: "numeric", month: "short" })} · {x.inDays < 0 ? `${-x.inDays} days ago` : x.inDays === 0 ? "today" : `in ${x.inDays} days`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="px-5 pb-4 text-xs">
                <Link href="/management/exits" className="font-semibold text-brand hover:underline">
                  Open exits
                </Link>
              </p>
            </Panel>
          </div>
        </div>

        <aside className="space-y-6">
          <TodayCard today={d.today} size={d.headcount.active} title="Attendance today" />
          <WeekComplianceCard c={d.compliance} href="/compliance" />
          {d.documents && (
            <Panel icon={FileWarning} title="Employee documents" description={`${d.documents.requirements} required documents per person`}>
              <div className="grid grid-cols-3 divide-x divide-line px-2 pb-4 pt-3 text-center">
                <div className="px-2">
                  <p className="font-display text-2xl font-bold tabular text-danger">{d.documents.missingPeople}</p>
                  <p className="text-xs text-ink-subtle">people missing some</p>
                </div>
                <div className="px-2">
                  <p className="font-display text-2xl font-bold tabular text-brand">{d.documents.awaiting}</p>
                  <p className="text-xs text-ink-subtle">to check</p>
                </div>
                <div className="px-2">
                  <p className="font-display text-2xl font-bold tabular text-success">{d.documents.complete}</p>
                  <p className="text-xs text-ink-subtle">complete</p>
                </div>
              </div>
            </Panel>
          )}
          <Panel icon={Cake} title="Birthdays & work anniversaries" description="Next 30 days">
            {d.celebrations.length === 0 ? (
              <p className="px-5 pb-5 pt-2 text-sm text-ink-muted">Nothing in the next 30 days.</p>
            ) : (
              <ul className="divide-y divide-line px-5 pb-3">
                {d.celebrations.map((c, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate text-ink">{c.name}</span>
                      <span className="text-xs text-ink-subtle">{c.kind === "Birthday" ? "Birthday" : `${c.years} year${c.years === 1 ? "" : "s"} at ASA`}</span>
                    </span>
                    <span className={cn("shrink-0 text-xs", c.inDays === 0 ? "font-semibold text-brand" : "text-ink-muted")}>
                      {c.inDays === 0 ? "Today" : c.inDays === 1 ? "Tomorrow" : fmtDay(c.date, { day: "numeric", month: "short" })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}
