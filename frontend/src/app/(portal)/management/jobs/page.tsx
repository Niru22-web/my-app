"use client";

import { useMemo, useState } from "react";
import { ImportButton } from "@/components/ui/import-dialog";
import { BriefcaseBusiness, CircleSlash, Download, ListChecks, Pencil, Plus, Power, Timer, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { today, workDate } from "@/lib/dates";
import { formatHours, formatNumber } from "@/lib/format";
import { normRole } from "@/lib/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/inputs";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { downloadCsv } from "@/components/claims/claim-tabs";
import { canManageWork, isInactive, jobBody, LOGGABLE, useJobList, useMgmtMutations, workTone, type Job } from "@/components/management/api";
import { JobDialog } from "@/components/management/job-dialog";
import { RowMenu } from "@/components/management/row-menu";
import { TeamStack } from "@/components/management/team-stack";

type StatusF = "open" | "closed" | "all";

export default function JobsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const manage = canManageWork(user?.role);
  // The API lets admins, or the job's creator (manager/partner), delete; IT is refused there.
  const mayDelete = ["admin", "owner", "manager", "partner"].includes(normRole(user?.role));
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusF>("open");
  const [project, setProject] = useState("");
  const [editor, setEditor] = useState<{ job?: Job | null } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "toggle" | "delete"; job: Job } | null>(null);

  const q = useJobList();
  const m = useMgmtMutations();
  const all = useMemo(() => q.data ?? [], [q.data]);
  const projects = useMemo(() => [...new Map(all.filter((j) => j.project).map((j) => [j.projectId, `${j.project!.name}${j.project!.client ? ` · ${j.project!.client.name}` : ""}`])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [all]);
  const open = (j: Job) => LOGGABLE.includes(j.status.toLowerCase()) || j.status === "In-Discussion";

  const rows = all.filter((j) => {
    if (status === "open" && !open(j)) return false;
    if (status === "closed" && open(j)) return false;
    if (project && j.projectId !== project) return false;
    const t = search.trim().toLowerCase();
    return !t || `${j.name} ${j.jobId} ${j.description ?? ""} ${j.project?.name ?? ""} ${j.project?.client?.name ?? ""}`.toLowerCase().includes(t);
  });

  const columns: Column<Job>[] = [
    {
      key: "name",
      header: "Job",
      sortValue: (j) => j.name,
      cell: (j) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{j.name}</p>
          <p className="truncate text-xs text-ink-subtle">{j.jobId}</p>
        </div>
      ),
    },
    {
      key: "project",
      header: "Project / client",
      hideBelow: "md",
      sortValue: (j) => j.project?.name ?? "",
      cell: (j) => (
        <div className="min-w-0 max-w-[260px]">
          <p className="truncate text-ink">{j.project?.name ?? "—"}</p>
          <p className="truncate text-xs text-ink-subtle">{j.project?.client?.name}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (j) => j.status,
      cell: (j) => (
        <div className="flex flex-col items-start gap-1">
          <Badge tone={workTone(j.status)}>{j.status}</Badge>
          <span className="text-[11px] text-ink-subtle">{LOGGABLE.includes(j.status.toLowerCase()) ? "Open for time" : "Closed for time"}</span>
        </div>
      ),
    },
    { key: "team", header: "Assigned", hideBelow: "lg", cell: (j) => <TeamStack users={j.users} /> },
    { key: "entries", header: "Entries", align: "right", hideBelow: "sm", sortValue: (j) => j._count?.timelogs ?? 0, cell: (j) => formatNumber(j._count?.timelogs ?? 0) },
    { key: "hours", header: "Hours", align: "right", sortValue: (j) => j.loggedHours ?? 0, cell: (j) => formatHours(j.loggedHours ?? 0) },
    {
      key: "act",
      header: "",
      align: "right",
      cell: (j) =>
        manage ? (
          <RowMenu
            items={[
              { label: "Edit job", icon: <Pencil className="h-4 w-4" />, onClick: () => setEditor({ job: j }) },
              { label: isInactive(j.status) ? "Reopen (Started)" : "Mark inactive", icon: <Power className="h-4 w-4" />, onClick: () => setConfirm({ kind: "toggle", job: j }) },
              ...(mayDelete
                ? [
                    {
                      label: "Delete job",
                      icon: <Trash2 className="h-4 w-4" />,
                      danger: true,
                      onClick: () => setConfirm({ kind: "delete", job: j }),
                      disabledReason: (j._count?.timelogs ?? 0) > 0 ? "Has time entries — mark inactive instead" : undefined,
                    },
                  ]
                : []),
            ]}
          />
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jobs"
        description="Deliverables within a project. People log time to the jobs they’re assigned."
        actions={
          <>
            {manage && <ImportButton kind="jobs" label="Jobs" invalidate={[["mgmt"], ["lookup"]]} />}
            {manage && (
              <Button onClick={() => setEditor({})}>
                <Plus className="h-4 w-4" /> New job
              </Button>
            )}
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Summary">
        <StatCard label="Open for time" icon={ListChecks} tone="brand" loading={q.isLoading} value={formatNumber(all.filter((j) => LOGGABLE.includes(j.status.toLowerCase())).length)} hint={`of ${formatNumber(all.length)}`} />
        <StatCard label="Billable (open)" icon={BriefcaseBusiness} loading={q.isLoading} value={formatNumber(all.filter((j) => j.billable && LOGGABLE.includes(j.status.toLowerCase())).length)} />
        <StatCard label="Unassigned" icon={CircleSlash} loading={q.isLoading} value={formatNumber(all.filter((j) => !(j.users?.length) && LOGGABLE.includes(j.status.toLowerCase())).length)} hint="open jobs with nobody assigned" tone={all.some((j) => !(j.users?.length) && LOGGABLE.includes(j.status.toLowerCase())) ? "warning" : "neutral"} />
        <StatCard label="Hours logged" icon={Timer} loading={q.isLoading} value={formatHours(all.reduce((a, j) => a + (j.loggedHours ?? 0), 0))} hint="all time" />
      </section>

      <DataTable
        exportName={false}
        itemsLabel="jobs"
        filterTabs={[
          { key: "open", label: "Open", count: all.filter(open).length },
          { key: "closed", label: "Completed / inactive", count: all.filter((j) => !open(j)).length },
          { key: "all", label: "All", count: all.length },
        ]}
        activeFilterTab={status}
        onFilterTabChange={(k) => setStatus(k as StatusF)}
        searchable
        searchPlaceholder="Search jobs"
        searchValue={search}
        onSearchChange={setSearch}
        toolbarActions={
          <>
            <Select aria-label="Project" value={project} onChange={(e) => setProject(e.target.value)} className="w-64">
              <option value="">All projects</option>
              {projects.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
            <Button
              variant="secondary"
              size="sm"
              disabled={!rows.length}
              onClick={() =>
                downloadCsv(
                  `jobs-${today()}.csv`,
                  ["Job code", "Name", "Project", "Client", "Status", "Billable", "Start date", "End date", "Assigned", "Entries", "Logged hours"],
                  rows.map((j) => [j.jobId, j.name, j.project?.name, j.project?.client?.name, j.status, j.billable ? "Yes" : "No", j.startDate ? workDate(j.startDate) : "", j.endDate ? workDate(j.endDate) : "", j.users?.length ?? 0, j._count?.timelogs ?? 0, j.loggedHours ?? 0]),
                )
              }
            >
              <Download className="h-4 w-4" /> Export
            </Button>
          </>
        }
        rows={rows}
        rowLabel={manage ? (j) => `Edit ${j.name}` : undefined}
        columns={columns}
        rowKey={(j) => j.id}
        loading={q.isLoading}
        error={q.isError}
        onRetry={() => q.refetch()}
        onRowClick={manage ? (j) => setEditor({ job: j }) : undefined}
        initialSort={{ key: "name", dir: "asc" }}
        pageSize={20}
        empty={{ icon: ListChecks, title: search || project ? "No jobs match these filters" : "No jobs here yet" }}
      />

      <JobDialog open={!!editor} onClose={() => setEditor(null)} job={editor?.job} />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        tone={confirm?.kind === "delete" ? "danger" : "primary"}
        title={confirm?.kind === "delete" ? `Delete ${confirm.job.name}?` : confirm && isInactive(confirm.job.status) ? `Reopen ${confirm.job.name}?` : `Mark ${confirm?.job.name} inactive?`}
        confirmLabel={confirm?.kind === "delete" ? "Delete permanently" : confirm && isInactive(confirm.job.status) ? "Reopen" : "Mark inactive"}
        busy={m.saveJob.isPending || m.deleteJob.isPending}
        description={
          confirm?.kind === "delete"
            ? "No time has been logged to this job. It will be removed permanently."
            : confirm && isInactive(confirm.job.status)
              ? "The job goes back to Started and assigned people can log time again."
              : "People will no longer be able to log time to this job. Existing time entries are kept."
        }
        onConfirm={() => {
          if (!confirm) return;
          const j = confirm.job;
          const done = (t: string) => () => (toast.success(t, j.name), setConfirm(null));
          const fail = (e: unknown) => toast.error("Couldn’t update the job", e instanceof ApiError ? e.message : undefined);
          if (confirm.kind === "delete") m.deleteJob.mutate(j.id, { onSuccess: done("Job deleted"), onError: fail });
          else m.saveJob.mutate({ id: j.id, body: jobBody(j, { status: isInactive(j.status) ? "Started" : "Inactive" }) }, { onSuccess: done(isInactive(j.status) ? "Job reopened" : "Job marked inactive"), onError: fail });
        }}
      />
    </div>
  );
}
