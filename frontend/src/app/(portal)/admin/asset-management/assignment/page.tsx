"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, Download, Search, Undo2, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError, downloadFile } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/inputs";
import { Segmented } from "@/components/ui/segmented";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ErrorState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { RowMenu } from "@/components/management/row-menu";
import { canManageAssets, personName, useAllocations, useAssetMutations, type Allocation } from "@/components/assets/api";
import { AssignDialog, ReturnDialog } from "@/components/assets/dialogs";

export default function AssignmentsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const manage = canManageAssets(user?.role);
  const q = useAllocations();
  const m = useAssetMutations();
  const [view, setView] = useState<"current" | "returned">("current");
  const [search, setSearch] = useState("");
  const [giving, setGiving] = useState<Allocation | null>(null);
  const [moving, setMoving] = useState<Allocation | null>(null);

  const all = useMemo(() => q.data ?? [], [q.data]);
  const isCurrent = (a: Allocation) => a.status === "Allocated" || a.status === "Assigned";
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return all.filter(
      (a) =>
        (view === "current" ? isCurrent(a) : !isCurrent(a)) &&
        (!s || `${personName(a.employee)} ${a.employee?.employeeId ?? ""} ${a.inventory.assetName} ${a.inventory.serialNumber} ${a.inventory.officeTagNo ?? ""}`.toLowerCase().includes(s)),
    );
  }, [all, view, search]);
  const current = all.filter(isCurrent).length;

  const err = (title: string) => (e: unknown) => toast.error(title, e instanceof ApiError ? e.message : undefined);

  const columns: Column<Allocation>[] = [
    {
      key: "person",
      header: "Person",
      sortValue: (a) => personName(a.employee),
      cell: (a) => (
        <div className="w-40 sm:w-52">
          <p className="truncate font-medium text-ink">{personName(a.employee) || "—"}</p>
          <p className="truncate text-xs text-ink-subtle">{[a.employee?.employeeId, a.employee?.department].filter(Boolean).join(" · ")}</p>
        </div>
      ),
    },
    {
      key: "asset",
      header: "Asset",
      sortValue: (a) => a.inventory.assetName,
      cell: (a) => (
        <div className="w-44 sm:w-56">
          <p className="truncate text-ink">{a.inventory.assetName}</p>
          <p className="truncate text-xs text-ink-subtle">{a.inventory.serialNumber}</p>
        </div>
      ),
    },
    { key: "since", header: "Assigned", hideBelow: "md", sortValue: (a) => a.allocatedAt, cell: (a) => <span className="text-ink-muted">{formatDate(a.allocatedAt)}</span> },
    ...(view === "returned"
      ? [{ key: "back", header: "Returned", hideBelow: "sm" as const, sortValue: (a: Allocation) => a.returnedAt ?? "", cell: (a: Allocation) => <span className="text-ink-muted">{a.returnedAt ? formatDate(a.returnedAt) : "—"}</span> }]
      : []),
    { key: "remarks", header: "Remarks", hideBelow: "lg", cell: (a) => <span className="line-clamp-1 max-w-[16rem] text-ink-muted" title={a.remarks ?? ""}>{a.remarks || "—"}</span> },
    { key: "status", header: "Status", hideBelow: "sm", cell: (a) => <Badge tone={isCurrent(a) ? "brand" : "neutral"}>{isCurrent(a) ? "With them" : "Returned"}</Badge> },
    ...(manage && view === "current"
      ? [
          {
            key: "act",
            header: "",
            align: "right" as const,
            cell: (a: Allocation) => (
              <RowMenu
                items={[
                  { label: "Take back", icon: <Undo2 className="h-4 w-4" />, onClick: () => setGiving(a) },
                  { label: "Transfer to someone else", icon: <ArrowLeftRight className="h-4 w-4" />, onClick: () => setMoving(a) },
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
        <ErrorState message="Assignments couldn’t be loaded." onRetry={() => q.refetch()} />
      </Card>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assignments"
        description={q.isLoading ? "Who has which asset" : `${current} asset${current === 1 ? "" : "s"} currently with people`}
        actions={
          <Button variant="secondary" disabled={!all.length} onClick={() => downloadFile("assets/allocations/export", `asset-assignments-${new Date().toISOString().slice(0, 10)}.xlsx`).catch(() => toast.error("Export failed"))}>
            <Download className="h-4 w-4" /> Export
          </Button>
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          aria-label="Show"
          value={view}
          onChange={setView}
          options={[
            { value: "current", label: "With people now" },
            { value: "returned", label: "History" },
          ]}
        />
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
          <Input placeholder="Person, asset or serial" aria-label="Search assignments" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(a) => a.id}
        loading={q.isLoading}
        initialSort={{ key: view === "current" ? "since" : "back", dir: "desc" }}
        pageSize={20}
        empty={{ icon: Users, title: view === "current" ? "No assets are with anyone right now" : "No returned assets yet", description: view === "current" && manage ? "Assign an available asset from the Inventory tab." : undefined }}
      />

      {giving && (
        <ReturnDialog
          name={giving.inventory.assetName}
          busy={m.giveBack.isPending}
          onClose={() => setGiving(null)}
          onConfirm={(condition, remarks) =>
            m.giveBack.mutate({ id: giving.id, condition, remarks: remarks || undefined }, { onSuccess: () => (toast.success("Marked as returned"), setGiving(null)), onError: err("Couldn’t mark it returned") })
          }
        />
      )}
      {moving && (
        <AssignDialog
          title={`Transfer ${moving.inventory.assetName}`}
          description={`From ${personName(moving.employee)}. Their assignment is closed and a new one starts for the new person.`}
          confirmLabel="Transfer"
          excludeId={moving.employeeId}
          busy={m.transfer.isPending}
          onClose={() => setMoving(null)}
          onConfirm={(employeeId, remarks) =>
            m.transfer.mutate({ id: moving.id, employeeId, remarks: remarks || undefined }, { onSuccess: () => (toast.success("Asset transferred"), setMoving(null)), onError: err("Couldn’t transfer") })
          }
        />
      )}
    </div>
  );
}
