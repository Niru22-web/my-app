"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Play, Plus, Wrench } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ErrorState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { RowMenu } from "@/components/management/row-menu";
import { canManageOps, useAssetMutations, useAssets, useMaintenance, type Maintenance } from "@/components/assets/api";
import { MaintenanceDialog } from "@/components/assets/dialogs";

const TONE: Record<string, "warning" | "brand" | "success"> = { Pending: "warning", "In Progress": "brand", Completed: "success" };

export default function MaintenancePage() {
  const { user } = useAuth();
  const toast = useToast();
  const ops = canManageOps(user?.role);
  const q = useMaintenance();
  const assets = useAssets(ops);
  const m = useAssetMutations();
  const [view, setView] = useState<"open" | "done">("open");
  const [adding, setAdding] = useState(false);

  const all = useMemo(() => q.data ?? [], [q.data]);
  const rows = all.filter((x) => (view === "open" ? x.status !== "Completed" : x.status === "Completed"));
  const spent = all.filter((x) => x.status === "Completed").reduce((s, x) => s + (x.cost ?? 0), 0);

  const setStatus = (x: Maintenance, status: string) =>
    m.setMaintenance.mutate(
      { id: x.id, status },
      {
        onSuccess: () => toast.success(status === "Completed" ? "Maintenance completed" : "Marked in progress", status === "Completed" ? "The asset is back to its previous status." : undefined),
        onError: (e) => toast.error("Couldn’t update", e instanceof ApiError ? e.message : undefined),
      },
    );

  const columns: Column<Maintenance>[] = [
    {
      key: "asset",
      header: "Asset",
      sortValue: (x) => x.inventory?.assetName ?? "",
      cell: (x) => (
        <div className="w-44 sm:w-56">
          <p className="truncate font-medium text-ink">{x.inventory?.assetName ?? "—"}</p>
          <p className="truncate text-xs text-ink-subtle">{x.inventory?.serialNumber}</p>
        </div>
      ),
    },
    { key: "type", header: "Work", sortValue: (x) => x.type, cell: (x) => <div><p className="text-ink">{x.type}</p>{x.description && <p className="line-clamp-1 max-w-[18rem] text-xs text-ink-subtle" title={x.description}>{x.description}</p>}</div> },
    { key: "date", header: "Date", hideBelow: "sm", sortValue: (x) => x.date, cell: (x) => <span className="text-ink-muted">{formatDate(x.date)}</span> },
    { key: "cost", header: "Cost", hideBelow: "md", align: "right", sortValue: (x) => x.cost ?? 0, cell: (x) => <span className="tabular text-ink-muted">{x.cost != null ? formatCurrency(x.cost) : "—"}</span> },
    { key: "status", header: "Status", sortValue: (x) => x.status, cell: (x) => <Badge tone={TONE[x.status] ?? "neutral"}>{x.status}</Badge> },
    ...(ops && view === "open"
      ? [
          {
            key: "act",
            header: "",
            align: "right" as const,
            cell: (x: Maintenance) => (
              <RowMenu
                items={[
                  ...(x.status === "Pending" ? [{ label: "Mark in progress", icon: <Play className="h-4 w-4" />, onClick: () => setStatus(x, "In Progress") }] : []),
                  { label: "Complete — return to service", icon: <CheckCircle2 className="h-4 w-4" />, onClick: () => setStatus(x, "Completed") },
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
        <ErrorState message="Maintenance records couldn’t be loaded." onRetry={() => q.refetch()} />
      </Card>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Maintenance"
        description={spent ? `${formatCurrency(spent)} spent on completed work` : "Repairs, servicing and upgrades"}
        actions={
          ops && (
            <Button onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Log maintenance
            </Button>
          )
        }
      />
      <Segmented
        aria-label="Show"
        value={view}
        onChange={setView}
        options={[
          { value: "open", label: "Open", count: all.filter((x) => x.status !== "Completed").length || undefined },
          { value: "done", label: "Completed" },
        ]}
      />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(x) => x.id}
        loading={q.isLoading}
        initialSort={{ key: "date", dir: "desc" }}
        pageSize={20}
        empty={{ icon: Wrench, title: view === "open" ? "No open maintenance" : "No completed maintenance yet" }}
      />
      {adding && <MaintenanceDialog assets={assets.data ?? []} onClose={() => setAdding(false)} />}
    </div>
  );
}
