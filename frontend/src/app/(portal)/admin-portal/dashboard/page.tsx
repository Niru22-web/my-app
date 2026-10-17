"use client";

import Link from "next/link";
import { ArrowRight, Building2, Clock3, Database, FolderKanban, HardDrive, ListChecks, Server, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard, StatRow } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/empty-state";
import { canSystem, useSystemStatus } from "@/components/admin/api";
import { useAdminTabs } from "@/components/admin/tabs";

const ABOUT: Record<string, string> = {
  Masters: "Roles, designations, departments, employment types, shifts and locations used across the portal.",
  "Users & access": "Give a person or a role access to modules, beyond what their role allows by default.",
  Hierarchy: "Who reports to whom — managers, sub-managers and partners.",
  "Biometric devices": "ESSL attendance machines and how device IDs map to employees.",
  "Server & storage": "Server health, database and uploaded files.",
  Email: "Templates used for portal emails, and the sending mailbox.",
};

export default function AdminOverview() {
  const { user } = useAuth();
  const sys = canSystem(user?.role);
  const q = useSystemStatus(sys);
  const { tabs } = useAdminTabs();
  const d = q.data;
  const c = d?.database.counts ?? {};

  return (
    <div className="space-y-6">
      <PageHeader title="Administration" description="Settings and health of the ASA Portal" />

      {sys && (
        <>
          {q.isError ? (
            <Card>
              <ErrorState error={q.error} message="Server status couldn’t be loaded." onRetry={() => q.refetch()} />
            </Card>
          ) : (
            <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Firm records">
              <StatCard label="Employees" icon={Users} tone="brand" loading={q.isLoading} value={formatNumber(c.employees)} />
              <StatCard label="Clients" icon={Building2} loading={q.isLoading} value={formatNumber(c.clients)} />
              <StatCard label="Projects" icon={FolderKanban} loading={q.isLoading} value={formatNumber(c.projects)} />
              <StatCard label="Timesheet entries" icon={Clock3} loading={q.isLoading} value={formatNumber(c.timelogs)} />
            </section>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader icon={Server} title="Server" actions={d && <Badge tone={/^(online|healthy)$/i.test(d.server.status) ? "success" : "warning"}>{d.server.status}</Badge>} />
              {q.isLoading || !d ? (
                <Skeleton className="m-5 h-28" />
              ) : (
                <div className="space-y-2.5 p-5 text-[13px]">
                  <StatRow label="Environment" value={d.server.environment} tone="muted" />
                  <StatRow label="Running for" value={d.server.uptimeFormatted} tone="muted" />
                  <StatRow label="Node.js" value={d.server.nodeVersion} tone="muted" />
                  <StatRow label="CPU" value={`${d.cpu.cores} cores`} tone="muted" />
                </div>
              )}
            </Card>
            <Card>
              <CardHeader icon={Database} title="Database" actions={d && <Badge tone={/^(connected|healthy|online)$/i.test(d.database.status) ? "success" : "warning"}>{d.database.status}</Badge>} />
              {q.isLoading || !d ? (
                <Skeleton className="m-5 h-28" />
              ) : (
                <div className="space-y-2.5 p-5 text-[13px]">
                  <StatRow label="Response time" value={`${d.database.latencyMs} ms`} tone="muted" />
                  <StatRow label="Notifications" value={formatNumber(c.notifications)} tone="muted" />
                  <StatRow label="Attendance records" value={formatNumber(c.attendance)} tone="muted" />
                  <StatRow label="Leave requests" value={formatNumber(c.leaves)} tone="muted" />
                </div>
              )}
            </Card>
            <Card>
              <CardHeader icon={HardDrive} title="Storage & memory" />
              {q.isLoading || !d ? (
                <Skeleton className="m-5 h-28" />
              ) : (
                <div className="space-y-2.5 p-5 text-[13px]">
                  <StatRow label="Uploaded files" value={`${formatNumber(d.storage.totalFiles)} · ${d.storage.totalFormatted}`} tone="muted" />
                  {d.memory.systemUsedPercent != null && <StatRow label="System memory used" value={`${Math.round(d.memory.systemUsedPercent)}%`} tone="muted" />}
                  {d.memory.heapUsedFormatted && <StatRow label="App memory" value={String(d.memory.heapUsedFormatted)} tone="muted" />}
                  <StatRow label="Checked" value={new Date(d.server.serverTime).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })} tone="muted" />
                </div>
              )}
            </Card>
          </div>
        </>
      )}

      <Card>
        <CardHeader icon={ListChecks} title="Sections" description="What you can manage here" />
        <ul className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {tabs
            .filter((t) => ABOUT[t.label])
            .map((t) => (
              <li key={t.href}>
                <Link href={t.href} className="group flex h-full items-start justify-between gap-3 rounded-2xl border border-line p-4 transition-colors hover:border-brand/40 hover:bg-brand-softer">
                  <span>
                    <span className="block text-sm font-semibold text-ink">{t.label}</span>
                    <span className="mt-1 block text-[13px] text-ink-muted">{ABOUT[t.label]}</span>
                  </span>
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-brand" aria-hidden />
                </Link>
              </li>
            ))}
        </ul>
      </Card>
    </div>
  );
}
