"use client";

import { useMemo, useState } from "react";
import { Archive, Download, Laptop, Pencil, Plus, RotateCcw, Search, UserPlus, Wrench, XCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError, downloadFile } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/inputs";
import { Segmented } from "@/components/ui/segmented";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/confirm";
import { ErrorState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { RowMenu, type MenuItem } from "@/components/management/row-menu";
import { ASSET_TONE, assetStatus, canManageAssets, canManageOps, useAssetMutations, useAssets, type Asset } from "@/components/assets/api";
import { AssetDialog, AssignDialog, MaintenanceDialog } from "@/components/assets/dialogs";

type Filter = "all" | "Available" | "Allocated" | "Maintenance" | "Retired" | "Lost";

export default function InventoryPage() {
  const { user } = useAuth();
  const toast = useToast();
  const manage = canManageAssets(user?.role);
  const ops = canManageOps(user?.role);
  const q = useAssets();
  const m = useAssetMutations();

  const [filter, setFilter] = useState<Filter>("all");
  const [cat, setCat] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Asset | null | undefined>(undefined);
  const [assigning, setAssigning] = useState<Asset | null>(null);
  const [servicing, setServicing] = useState<Asset | null>(null);
  const [statusChange, setStatusChange] = useState<{ asset: Asset; to: "Retired" | "Lost" | "Available" } | null>(null);

  const all = useMemo(() => q.data ?? [], [q.data]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of all) c[assetStatus(a.status)] = (c[assetStatus(a.status)] ?? 0) + 1;
    return c;
  }, [all]);
  const cats = useMemo(() => [...new Set(all.map((a) => a.category))].sort(), [all]);
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return all.filter(
      (a) =>
        (filter === "all" || assetStatus(a.status) === filter) &&
        (!cat || a.category === cat) &&
        (!s || `${a.assetName} ${a.serialNumber} ${a.assetId ?? ""} ${a.officeTagNo ?? ""} ${a.type} ${a.location ?? ""}`.toLowerCase().includes(s)),
    );
  }, [all, filter, cat, search]);

  const menu = (a: Asset): MenuItem[] => {
    const st = assetStatus(a.status);
    if (!manage) return [];
    const items: MenuItem[] = [{ label: "Edit details", icon: <Pencil className="h-4 w-4" />, onClick: () => setEditing(a) }];
    if (st === "Available") items.push({ label: "Assign to someone", icon: <UserPlus className="h-4 w-4" />, onClick: () => setAssigning(a) });
    if (ops && st !== "Maintenance" && st !== "Retired" && st !== "Lost") items.push({ label: "Send for maintenance", icon: <Wrench className="h-4 w-4" />, onClick: () => setServicing(a) });
    if (st === "Available") {
      items.push({ label: "Retire", icon: <Archive className="h-4 w-4" />, onClick: () => setStatusChange({ asset: a, to: "Retired" }) });
      items.push({ label: "Mark as lost", icon: <XCircle className="h-4 w-4" />, danger: true, onClick: () => setStatusChange({ asset: a, to: "Lost" }) });
    }
    if (st === "Allocated") items.push({ label: "Retire or mark lost", icon: <Archive className="h-4 w-4" />, onClick: () => undefined, disabledReason: "Take it back under Assignments first" });
    if (st === "Retired" || st === "Lost") items.push({ label: "Bring back into stock", icon: <RotateCcw className="h-4 w-4" />, onClick: () => setStatusChange({ asset: a, to: "Available" }) });
    return items;
  };

  const columns: Column<Asset>[] = [
    {
      key: "name",
      header: "Asset",
      sortValue: (a) => a.assetName,
      cell: (a) => (
        <div className="w-48 sm:w-64">
          <p className="truncate font-medium text-ink">{a.assetName}</p>
          <p className="truncate text-xs text-ink-subtle">{[a.assetId ?? a.officeTagNo, a.serialNumber].filter(Boolean).join(" · ")}</p>
        </div>
      ),
    },
    { key: "type", header: "Type", hideBelow: "md", sortValue: (a) => `${a.category} ${a.type}`, cell: (a) => <span className="text-ink-muted">{a.type}<span className="text-ink-subtle"> · {a.category}</span></span> },
    { key: "loc", header: "Location", hideBelow: "lg", sortValue: (a) => a.location ?? "", cell: (a) => <span className="text-ink-muted">{a.location || "—"}</span> },
    { key: "warranty", header: "Warranty", hideBelow: "lg", sortValue: (a) => a.warrantyExpiry ?? "", cell: (a) => <span className="text-ink-muted">{a.warrantyExpiry ? formatDate(a.warrantyExpiry) : "—"}</span> },
    { key: "cost", header: "Cost", hideBelow: "lg", align: "right", sortValue: (a) => a.purchaseCost ?? 0, cell: (a) => <span className="tabular text-ink-muted">{a.purchaseCost != null ? formatCurrency(a.purchaseCost) : "—"}</span> },
    { key: "status", header: "Status", sortValue: (a) => assetStatus(a.status), cell: (a) => <Badge tone={ASSET_TONE[assetStatus(a.status)] ?? "neutral"}>{assetStatus(a.status)}</Badge> },
    ...(manage ? [{ key: "act", header: "", align: "right" as const, cell: (a: Asset) => <RowMenu items={menu(a)} /> }] : []),
  ];

  const doStatus = async () => {
    if (!statusChange) return;
    try {
      await m.update.mutateAsync({ id: statusChange.asset.id, body: { status: statusChange.to } });
      toast.success(statusChange.to === "Available" ? "Back in stock" : `Marked as ${statusChange.to.toLowerCase()}`);
      setStatusChange(null);
    } catch (e) {
      toast.error("Couldn’t change the status", e instanceof ApiError ? e.message : undefined);
    }
  };

  if (q.isError)
    return (
      <Card>
        <ErrorState message="The inventory couldn’t be loaded." onRetry={() => q.refetch()} />
      </Card>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Every asset the firm owns, where it is and who has it"
        actions={
          <>
            <Button variant="secondary" disabled={!all.length} onClick={() => downloadFile("assets/export", `asset-inventory-${new Date().toISOString().slice(0, 10)}.xlsx`).catch(() => toast.error("Export failed"))}>
              <Download className="h-4 w-4" /> Export
            </Button>
            {manage && (
              <Button onClick={() => setEditing(null)}>
                <Plus className="h-4 w-4" /> Add asset
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented
          aria-label="Status"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: all.length || undefined },
            { value: "Available", label: "Available", count: counts.Available },
            { value: "Allocated", label: "Assigned", count: counts.Allocated },
            { value: "Maintenance", label: "Maintenance", count: counts.Maintenance },
            { value: "Retired", label: "Retired", count: counts.Retired },
            { value: "Lost", label: "Lost", count: counts.Lost },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          {cats.length > 1 && (
            <Select aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)} className="sm:w-44">
              <option value="">All categories</option>
              {cats.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          )}
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
            <Input placeholder="Name, serial, tag…" aria-label="Search assets" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(a) => a.id}
        loading={q.isLoading}
        initialSort={{ key: "name", dir: "asc" }}
        pageSize={20}
        empty={{ icon: Laptop, title: all.length ? "No assets match these filters" : "No assets recorded yet", description: all.length ? undefined : manage ? "Add the firm’s laptops, monitors and other equipment to start tracking them." : undefined }}
      />

      {editing !== undefined && <AssetDialog asset={editing} onClose={() => setEditing(undefined)} />}
      {servicing && <MaintenanceDialog asset={servicing} assets={all} onClose={() => setServicing(null)} />}
      {assigning && (
        <AssignDialog
          title={`Assign ${assigning.assetName}`}
          description={`${assigning.serialNumber} · the person will see it under My assets.`}
          confirmLabel="Assign"
          busy={m.assign.isPending}
          onClose={() => setAssigning(null)}
          onConfirm={(employeeId, remarks) =>
            m.assign.mutate(
              { employeeId, inventoryId: assigning.id, remarks: remarks || undefined },
              {
                onSuccess: () => (toast.success("Asset assigned"), setAssigning(null)),
                onError: (e) => toast.error("Couldn’t assign", e instanceof ApiError ? e.message : undefined),
              },
            )
          }
        />
      )}
      <ConfirmDialog
        open={!!statusChange}
        onClose={() => setStatusChange(null)}
        tone={statusChange?.to === "Lost" ? "danger" : "primary"}
        title={statusChange?.to === "Available" ? `Bring ${statusChange?.asset.assetName} back into stock?` : `Mark ${statusChange?.asset.assetName} as ${statusChange?.to.toLowerCase()}?`}
        description={statusChange?.to === "Available" ? "It becomes available to assign again." : "It stays on record with its full history but can’t be assigned. You can bring it back later."}
        confirmLabel={statusChange?.to === "Available" ? "Bring back" : `Mark ${statusChange?.to.toLowerCase()}`}
        busy={m.update.isPending}
        onConfirm={doStatus}
      />
    </div>
  );
}
