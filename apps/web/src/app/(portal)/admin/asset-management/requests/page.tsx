"use client";

import { useMemo, useState } from "react";
import { Check, PackageCheck, PackagePlus, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { FormRow, Select, Textarea } from "@/components/ui/inputs";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { RowMenu } from "@/components/management/row-menu";
import { REQUEST_TONE, isRealRequest, requestStatus, assetStatus, canApproveRequests, personName, useAllRequests, useAssetMutations, useAssets, type AssetRequest } from "@/components/assets/api";

type View = "Pending" | "Approved" | "done";

export default function RequestsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const allowed = canApproveRequests(user?.role);
  const q = useAllRequests(allowed);
  const m = useAssetMutations();
  const [view, setView] = useState<View>("Pending");
  const [deciding, setDeciding] = useState<{ r: AssetRequest; to: "Approved" | "Rejected" } | null>(null);
  const [fulfilling, setFulfilling] = useState<AssetRequest | null>(null);

  const all = useMemo(() => (q.data ?? []).filter(isRealRequest), [q.data]);
  const count = (s: string) => all.filter((r) => r.status === s).length;
  const rows = all.filter((r) => (view === "done" ? !["Pending", "Approved"].includes(r.status) : r.status === view));

  if (!allowed)
    return (
      <Card>
        <EmptyState title="Only Admin and HR can review asset requests" />
      </Card>
    );

  const columns: Column<AssetRequest>[] = [
    {
      key: "req",
      header: "Request",
      sortValue: (r) => r.title,
      cell: (r) => (
        <div className="w-48 sm:w-64">
          <p className="truncate font-medium text-ink">{r.title}</p>
          <p className="truncate text-xs text-ink-subtle">
            {r.requestId} · {r.assetType}
            {r.quantity > 1 ? ` × ${r.quantity}` : ""}
          </p>
          {r.description && <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{r.description}</p>}
        </div>
      ),
    },
    {
      key: "who",
      header: "Requested by",
      sortValue: (r) => personName(r.employee),
      cell: (r) => (
        <div>
          <p className="text-ink">{personName(r.employee) || "—"}</p>
          <p className="text-xs text-ink-subtle">{[r.employee?.employeeId, r.employee?.department].filter(Boolean).join(" · ")}</p>
        </div>
      ),
    },
    { key: "priority", header: "Priority", hideBelow: "md", sortValue: (r) => ["Low", "Medium", "High"].indexOf(r.priority), cell: (r) => <Badge tone={r.priority === "High" ? "danger" : "neutral"}>{r.priority}</Badge> },
    { key: "needed", header: "Needed by", hideBelow: "lg", sortValue: (r) => r.requiredDate ?? "9", cell: (r) => <span className="text-ink-muted">{r.requiredDate ? formatDate(r.requiredDate) : "—"}</span> },
    { key: "raised", header: "Raised", hideBelow: "sm", sortValue: (r) => r.createdAt, cell: (r) => <span className="text-ink-muted">{formatDate(r.createdAt)}</span> },
    ...(view === "done" ? [{ key: "status", header: "Outcome", cell: (r: AssetRequest) => <Badge tone={REQUEST_TONE[requestStatus(r)] ?? "neutral"}>{requestStatus(r) === "Allocated" ? "Handed over" : requestStatus(r)}</Badge> }] : []),
    ...(view !== "done"
      ? [
          {
            key: "act",
            header: "",
            align: "right" as const,
            cell: (r: AssetRequest) => (
              <RowMenu
                items={[
                  ...(r.status === "Pending" ? [{ label: "Approve", icon: <Check className="h-4 w-4" />, onClick: () => setDeciding({ r, to: "Approved" }) }] : []),
                  { label: "Hand over an asset", icon: <PackageCheck className="h-4 w-4" />, onClick: () => setFulfilling(r) },
                  { label: "Reject", icon: <X className="h-4 w-4" />, danger: true, onClick: () => setDeciding({ r, to: "Rejected" }) },
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
        <ErrorState message="Requests couldn’t be loaded." onRetry={() => q.refetch()} />
      </Card>
    );

  return (
    <div className="space-y-6">
      <PageHeader title="Asset requests" description="Approve what people ask for, then hand over an available asset" />
      <Segmented
        aria-label="Show"
        value={view}
        onChange={setView}
        options={[
          { value: "Pending", label: "To review", count: count("Pending") || undefined },
          { value: "Approved", label: "Approved, to hand over", count: count("Approved") || undefined },
          { value: "done", label: "Closed" },
        ]}
      />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        loading={q.isLoading}
        initialSort={{ key: "raised", dir: view === "done" ? "desc" : "asc" }}
        pageSize={20}
        empty={{ icon: PackagePlus, title: view === "Pending" ? "Nothing waiting for review" : view === "Approved" ? "Nothing waiting to be handed over" : "No closed requests yet" }}
      />

      {deciding && (
        <DecideDialog
          r={deciding.r}
          to={deciding.to}
          busy={m.decide.isPending}
          onClose={() => setDeciding(null)}
          onConfirm={(remarks) =>
            m.decide.mutate(
              { id: deciding.r.id, status: deciding.to, remarks: remarks || undefined },
              {
                onSuccess: () => (toast.success(deciding.to === "Approved" ? "Request approved" : "Request rejected"), setDeciding(null)),
                onError: (e) => toast.error("Couldn’t update the request", e instanceof ApiError ? e.message : undefined),
              },
            )
          }
        />
      )}
      {fulfilling && <FulfilDialog r={fulfilling} onClose={() => setFulfilling(null)} />}
    </div>
  );
}

function DecideDialog({ r, to, busy, onClose, onConfirm }: { r: AssetRequest; to: "Approved" | "Rejected"; busy: boolean; onClose: () => void; onConfirm: (remarks: string) => void }) {
  const [remarks, setRemarks] = useState("");
  const reject = to === "Rejected";
  return (
    <Dialog
      open
      onClose={onClose}
      title={`${reject ? "Reject" : "Approve"} “${r.title}”?`}
      description={`${personName(r.employee)} sees this on their My assets page.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={reject ? "danger" : "primary"} disabled={reject && remarks.trim().length < 3} loading={busy} onClick={() => onConfirm(remarks.trim())}>
            {reject ? "Reject" : "Approve"}
          </Button>
        </>
      }
    >
      <FormRow label={reject ? "Reason" : "Note"} htmlFor="dc-remarks" required={reject} hint={reject ? "Shown to the person" : "Optional"}>
        <Textarea id="dc-remarks" rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </FormRow>
    </Dialog>
  );
}

function FulfilDialog({ r, onClose }: { r: AssetRequest; onClose: () => void }) {
  const toast = useToast();
  const m = useAssetMutations();
  const assets = useAssets();
  const free = (assets.data ?? []).filter((a) => assetStatus(a.status) === "Available");
  const matching = free.filter((a) => `${a.type} ${a.category} ${a.assetName}`.toLowerCase().includes(r.assetType.toLowerCase()));
  const options = matching.length ? [...matching, ...free.filter((a) => !matching.includes(a))] : free;
  const [inventoryId, setInventoryId] = useState("");
  const [remarks, setRemarks] = useState("");

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Hand over for “${r.title}”`}
      description={`${personName(r.employee)} asked for ${r.quantity > 1 ? `${r.quantity} × ` : ""}${r.assetType}. Choosing an asset assigns it to them and closes the request.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!inventoryId}
            loading={m.fulfil.isPending}
            onClick={() =>
              m.fulfil.mutate(
                { requestId: r.id, inventoryId, remarks: remarks.trim() || undefined },
                {
                  onSuccess: () => (toast.success("Asset handed over", "The request is closed."), onClose()),
                  onError: (e) => toast.error("Couldn’t hand it over", e instanceof ApiError ? e.message : undefined),
                },
              )
            }
          >
            Assign & close request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormRow label="Available asset" htmlFor="ff-asset" required hint={!assets.isLoading && !free.length ? "Nothing is available — add or take back an asset first." : matching.length ? `${matching.length} match “${r.assetType}”` : undefined}>
          <Select id="ff-asset" value={inventoryId} onChange={(e) => setInventoryId(e.target.value)} disabled={!free.length}>
            <option value="">Choose…</option>
            {options.map((a) => (
              <option key={a.id} value={a.id}>
                {a.assetName} · {a.serialNumber} ({a.type})
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Remarks" htmlFor="ff-remarks" hint="Optional">
          <Textarea id="ff-remarks" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </FormRow>
        {r.quantity > 1 && <p className="text-xs text-ink-subtle">This hands over one asset. For the rest, use Inventory → Assign.</p>}
      </div>
    </Dialog>
  );
}
