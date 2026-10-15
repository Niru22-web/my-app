"use client";

import { useEffect, useMemo, useState } from "react";
import { normRole } from "@/lib/roles";
import { PolicyCard } from "@/components/claims/policy-card";
import { useRouter } from "next/navigation";
import { CheckCheck, Download, Inbox } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError, api } from "@/lib/api";
import { fmtDay, today, workDate } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { StatCard } from "@/components/ui/stat";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  claimant,
  reviewerActions,
  stageOf,
  STAGE_LABEL,
  STAGE_TONE,
  useTeamClaims,
  useClaimAccess,
  type Claim,
  type TeamTab,
} from "@/components/claims/api";
import { ClaimDetail } from "@/components/claims/claim-detail";
import { ClaimTabs, downloadCsv } from "@/components/claims/claim-tabs";

const STAGES: { key: TeamTab; label: string }[] = [
  { key: "pending", label: "Needs approval" },
  { key: "APPROVED", label: "Awaiting payment" },
  { key: "PAID", label: "Paid" },
  { key: "REJECTED", label: "Rejected" },
  { key: "SENT_BACK", label: "Returned" },
];

export default function TeamClaimsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const access = useClaimAccess();
  const allowed = !!access.data?.team;
  const orgView = !!access.data?.org;

  const [tab, setTab] = useState<TeamTab>("pending");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Claim | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    if (access.isSuccess && !allowed) router.replace("/portal/reimbursements");
  }, [access.isSuccess, allowed, router]);

  const q = useTeamClaims(tab, orgView, allowed);
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data ?? []).filter((c) => !s || `${c.claimId} ${claimant(c)} ${c.category} ${c.client?.name ?? ""} ${c.project?.name ?? ""} ${c.description ?? ""}`.toLowerCase().includes(s));
  }, [q.data, search]);

  if (!allowed) return null;

  const approvable = rows.filter((c) => reviewerActions(c, user?.role, user?.id).approve);
  const selectedIds = [...selected].filter((id) => approvable.some((c) => c.id === id));
  const total = rows.reduce((a, c) => a + c.amount, 0);

  // Approve one at a time through the stage-checked endpoint (the bulk endpoint skips those checks).
  async function bulkApprove() {
    setBulkBusy(true);
    let ok = 0;
    const failed: string[] = [];
    for (const id of selectedIds) {
      try {
        await api(`reimbursements/${id}/approve`, { method: "PATCH", body: {} });
        ok++;
      } catch (e) {
        failed.push(e instanceof ApiError ? e.message : "failed");
      }
    }
    setBulkBusy(false);
    setBulkOpen(false);
    setSelected(new Set());
    void qc.invalidateQueries({ queryKey: ["claims"] });
    if (ok) toast.success(`${ok} claim${ok === 1 ? "" : "s"} approved`, failed.length ? `${failed.length} could not be approved: ${failed[0]}` : undefined);
    else toast.error("No claims were approved", failed[0]);
  }

  const columns: Column<Claim>[] = [
    {
      key: "emp",
      header: "Employee",
      sortValue: (c) => claimant(c),
      cell: (c) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={claimant(c)} size={30} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{claimant(c)}</p>
            <p className="truncate text-xs text-ink-subtle">{c.claimId}</p>
          </div>
        </div>
      ),
    },
    { key: "date", header: "Date", hideBelow: "md", sortValue: (c) => workDate(c.date), cell: (c) => <span className="whitespace-nowrap">{fmtDay(workDate(c.date), { day: "numeric", month: "short" })}</span> },
    { key: "cat", header: "Expense", hideBelow: "sm", sortValue: (c) => c.category, cell: (c) => <span>{c.category}<span className="block max-w-[220px] truncate text-xs text-ink-subtle">{c.project?.name}</span></span> },
    { key: "amt", header: "Amount", align: "right", sortValue: (c) => c.amount, cell: (c) => <span className="font-semibold">{formatCurrency(c.amount)}</span> },
    { key: "stage", header: "Stage", hideBelow: "sm", sortValue: (c) => stageOf(c), cell: (c) => <Badge tone={STAGE_TONE[stageOf(c)]}>{STAGE_LABEL[stageOf(c)].replace("Returned to you", "Returned")}</Badge> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team reimbursements"
        description={orgView ? "Claims across the firm, by stage." : "Claims from the people who report to you."}
        actions={
          <ClaimTabs />
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3" aria-label="Summary">
        <StatCard label="Claims in this view" value={rows.length} tone="brand" loading={q.isLoading} />
        <StatCard label="Total amount" value={formatCurrency(total)} loading={q.isLoading} />
        {tab === "pending" && <StatCard label="You can act on" value={approvable.length} loading={q.isLoading} tone={approvable.length ? "warning" : "neutral"} className="col-span-2 xl:col-span-1" />}
      </section>

      <PolicyCard canEdit={!!access.data?.pay || ["admin", "owner", "hr"].includes(normRole(user?.role))} />

      {tab === "pending" && approvable.length > 0 && (
        <div className={cn("flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3", selectedIds.length ? "border-brand/30 bg-brand-softer" : "border-line bg-surface")}>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--brand)]"
              checked={selectedIds.length === approvable.length}
              onChange={(e) => setSelected(e.target.checked ? new Set(approvable.map((c) => c.id)) : new Set())}
            />
            {selectedIds.length ? `${selectedIds.length} selected · ${formatCurrency(approvable.filter((c) => selected.has(c.id)).reduce((a, c) => a + c.amount, 0))}` : `Select all ${approvable.length} you can approve`}
          </label>
          {selectedIds.length > 0 && (
            <Button size="sm" className="ml-auto" onClick={() => setBulkOpen(true)}>
              <CheckCheck className="h-4 w-4" /> Approve {selectedIds.length}
            </Button>
          )}
        </div>
      )}

      <DataTable
        exportName={false}
        itemsLabel="claims"
        filterTabs={STAGES.map((s) => ({ ...s, count: s.key === tab && !q.isLoading && !q.isError ? (q.data ?? []).length : undefined }))}
        activeFilterTab={tab}
        onFilterTabChange={(k) => (setTab(k as TeamTab), setSelected(new Set()))}
        searchable
        searchPlaceholder="Search claims"
        searchValue={search}
        onSearchChange={setSearch}
        toolbarActions={
          <Button
            variant="secondary"
            size="sm"
            disabled={!rows.length}
            onClick={() =>
              downloadCsv(
                `team-claims-${tab.toLowerCase()}-${today()}.csv`,
                ["Claim ID", "Employee", "Employee ID", "Date", "Expense head", "Client", "Project", "Amount (INR)", "Stage", "Description"],
                rows.map((c) => [c.claimId, claimant(c), c.employee?.employeeId, workDate(c.date), c.category, c.client?.name, c.project?.name, c.amount, STAGE_LABEL[stageOf(c)], c.description]),
              )
            }
          >
            <Download className="h-4 w-4" /> Export
          </Button>
        }
        selectable={tab === "pending" && approvable.length > 0}
        selectedKeys={selected}
        onSelectionChange={(s) => setSelected(new Set([...s].filter((id) => approvable.some((c) => c.id === id))))}
        rows={rows}
        columns={columns}
        rowKey={(c) => c.id}
        loading={q.isLoading}
        error={q.isError}
        onRetry={() => q.refetch()}
        onRowClick={setDetail}
        initialSort={{ key: "date", dir: "desc" }}
        empty={{ icon: Inbox, title: tab === "pending" ? "Nothing waiting for approval" : "No claims in this stage" }}
      />

      <ClaimDetail claim={detail} onClose={() => setDetail(null)} reviewer />

      <ConfirmDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title={`Approve ${selectedIds.length} claim${selectedIds.length === 1 ? "" : "s"}?`}
        confirmLabel="Approve"
        busy={bulkBusy}
        description="Each claim moves to its next stage. Employees and the next approver are notified."
        onConfirm={bulkApprove}
      />
    </div>
  );
}
