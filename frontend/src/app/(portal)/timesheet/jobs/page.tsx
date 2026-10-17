"use client";

import { useMemo, useState } from "react";
import { Briefcase, Plus } from "lucide-react";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { useMyJobs, type MyJob } from "@/components/timesheet/api";
import { EntryDialog } from "@/components/timesheet/entry-dialog";
import { hhmm } from "@/components/timesheet/hours";

/** Jobs I'm assigned to (job or project team) or have logged time on, with my hours and the team's. */
export default function MyJobsPage() {
  const q = useMyJobs();
  const [status, setStatus] = useState("all");
  const [logFor, setLogFor] = useState<MyJob | null>(null);

  const statuses = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of q.data ?? []) m.set(j.status || "—", (m.get(j.status || "—") ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [q.data]);
  const rows = (q.data ?? []).filter((j) => status === "all" || (j.status || "—") === status);

  const columns: Column<MyJob>[] = [
    {
      key: "job",
      header: "Job",
      cell: (j) => (
        <span className="block min-w-0 max-w-[300px]">
          <span className="block truncate font-medium text-ink">
            {j.name} <span className="font-normal text-ink-subtle">• {j.project.name} ({j.client.name})</span>
          </span>
          <span className="block text-xs text-ink-subtle">
            {j.jobId} · {j.billable ? "Billable" : "Non-billable"}
            {!j.assigned && " · not assigned to you"}
          </span>
        </span>
      ),
      sortValue: (j) => j.name,
      exportValue: (j) => `${j.name} • ${j.project.name} (${j.client.name})`,
      searchValue: (j) => `${j.name} ${j.jobId} ${j.project.name} ${j.client.name}`,
      exportHeader: "Job • Project (Client)",
    },
    { key: "start", header: "Start date", cell: (j) => formatDate(j.startDate), sortValue: (j) => j.startDate ?? "", exportValue: (j) => (j.startDate ?? "").slice(0, 10), className: "hidden 2xl:table-cell", headerClassName: "hidden 2xl:table-cell" },
    { key: "end", header: "End date", cell: (j) => formatDate(j.endDate), sortValue: (j) => j.endDate ?? "", exportValue: (j) => (j.endDate ?? "").slice(0, 10), className: "hidden 2xl:table-cell", headerClassName: "hidden 2xl:table-cell" },
    { key: "status", header: "Status", cell: (j) => <Badge tone={j.canLog ? "success" : statusTone(j.status)}>{j.status || "—"}</Badge>, sortValue: (j) => j.status },
    { key: "month", header: "My hours (month)", exportHeader: "My hours (this month)", align: "right", cell: (j) => <span className="font-mono">{hhmm(j.myHoursMonth)}</span>, sortValue: (j) => j.myHoursMonth },
    { key: "mine", header: "My hours (all time)", align: "right", cell: (j) => <span className="font-mono font-semibold">{hhmm(j.myHoursTotal)}</span>, sortValue: (j) => j.myHoursTotal },
    { key: "team", header: "Team hours", align: "right", cell: (j) => <span className="font-mono text-ink-muted">{hhmm(j.teamHours)}</span>, sortValue: (j) => j.teamHours, hideBelow: "md" },
    {
      key: "billable",
      header: "Billable",
      cell: (j) => (j.billable ? <Badge tone="brand">Billable</Badge> : <Badge>Non-billable</Badge>),
      sortValue: (j) => (j.billable ? "Billable" : "Non-billable"),
      className: "hidden 2xl:table-cell",
      headerClassName: "hidden 2xl:table-cell",
    },
    { key: "users", header: "Users", align: "right", cell: (j) => j.usersCount, sortValue: (j) => j.usersCount, className: "hidden 2xl:table-cell", headerClassName: "hidden 2xl:table-cell" },
    {
      key: "log",
      header: "",
      cell: (j) =>
        j.canLog ? (
          <Button size="sm" variant="secondary" className="whitespace-nowrap" onClick={(e) => (e.stopPropagation(), setLogFor(j))} aria-label={`Log time on ${j.name}`}>
            <Plus className="h-4 w-4" /> Log time
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="My jobs" description="Jobs you’re assigned to or have logged time on. Team hours are everyone’s time on the job." />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(j) => j.id}
        loading={q.isLoading}
        error={q.isError}
        onRetry={() => q.refetch()}
        searchable
        searchPlaceholder="Search jobs, projects or clients…"
        filterTabs={[{ key: "all", label: "All", count: q.data?.length ?? 0 }, ...statuses.map(([s, n]) => ({ key: s, label: s, count: n }))]}
        activeFilterTab={status}
        onFilterTabChange={setStatus}
        exportName="my-jobs"
        itemsLabel="jobs"
        initialSort={{ key: "mine", dir: "desc" }}
        empty={{ icon: Briefcase, title: "No jobs yet", description: "Jobs appear here once you’re added to a job or project team, or log time on one." }}
      />
      <EntryDialog
        open={!!logFor}
        onClose={() => setLogFor(null)}
        defaultJob={logFor ? { clientId: logFor.client.id, projectId: logFor.project.id, jobId: logFor.id } : null}
      />
    </div>
  );
}
