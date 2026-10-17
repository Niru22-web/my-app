"use client";

import { useState, type FormEvent } from "react";
import { Laptop, PackagePlus, Send } from "lucide-react";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { today } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { FormRow, Input, Select, Textarea } from "@/components/ui/inputs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { DataTable, type Column } from "@/components/ui/data-table";
import { useToast } from "@/components/ui/toast";
import { REQUEST_TONE, isRealRequest, requestStatus, useAssetMutations, useCategories, useLocations, useMyAllocations, useMyRequests, type AssetRequest } from "./api";

const KINDS = ["Hardware", "Software", "Office Equipment", "Furniture"];
const PRIORITIES = ["Low", "Medium", "High"];

/** Employee-facing view: what I hold, and what I've asked for. */
export function MyAssets() {
  const mine = useMyAllocations();
  const reqs = useMyRequests();
  const [open, setOpen] = useState(false);

  const columns: Column<AssetRequest>[] = [
    {
      key: "title",
      header: "Request",
      sortValue: (r) => r.title,
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{r.title}</p>
          <p className="truncate text-xs text-ink-subtle">
            {r.requestId} · {r.assetType}
            {r.quantity > 1 ? ` × ${r.quantity}` : ""}
          </p>
        </div>
      ),
    },
    { key: "priority", header: "Priority", hideBelow: "md", sortValue: (r) => r.priority, cell: (r) => <span className="text-ink-muted">{r.priority}</span> },
    { key: "needed", header: "Needed by", hideBelow: "lg", sortValue: (r) => r.requiredDate ?? "", cell: (r) => <span className="text-ink-muted">{r.requiredDate ? formatDate(r.requiredDate) : "—"}</span> },
    { key: "created", header: "Raised", hideBelow: "sm", sortValue: (r) => r.createdAt, cell: (r) => <span className="text-ink-muted">{formatDate(r.createdAt)}</span> },
    {
      key: "status",
      header: "Status",
      sortValue: (r) => r.status,
      cell: (r) => (
        <div>
          <Badge tone={REQUEST_TONE[requestStatus(r)] ?? "neutral"}>{requestStatus(r) === "Allocated" ? "Handed over" : requestStatus(r)}</Badge>
          {r.remarks && r.status === "Rejected" && <p className="mt-1 max-w-[16rem] truncate text-xs text-ink-subtle" title={r.remarks}>{r.remarks}</p>}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="My assets"
        description="Equipment assigned to you and the requests you’ve made"
        actions={
          <Button onClick={() => setOpen(true)}>
            <PackagePlus className="h-4 w-4" /> Request an asset
          </Button>
        }
      />

      <Card>
        <CardHeader icon={Laptop} title="Assigned to me" />
        {mine.isError ? (
          <ErrorState error={mine.error} message="Your assets couldn’t be loaded." onRetry={() => mine.refetch()} />
        ) : mine.isLoading ? (
          <Skeleton className="m-5 h-24" />
        ) : !mine.data?.length ? (
          <EmptyState icon={Laptop} title="No assets assigned to you" description="When IT or HR hands you equipment, it appears here." />
        ) : (
          <ul className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {mine.data.map((a) => (
              <li key={a.id} className="rounded-2xl border border-line p-4">
                <p className="font-semibold text-ink">{a.inventory.assetName}</p>
                <p className="mt-0.5 text-xs text-ink-subtle">
                  {[a.inventory.type, a.inventory.category].filter(Boolean).join(" · ")}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-y-1 text-xs">
                  <dt className="text-ink-subtle">Serial</dt>
                  <dd className="truncate text-ink">{a.inventory.serialNumber}</dd>
                  {a.inventory.officeTagNo && (
                    <>
                      <dt className="text-ink-subtle">Tag</dt>
                      <dd className="text-ink">{a.inventory.officeTagNo}</dd>
                    </>
                  )}
                  <dt className="text-ink-subtle">Since</dt>
                  <dd className="text-ink">{formatDate(a.allocatedAt)}</dd>
                  {a.inventory.warrantyExpiry && (
                    <>
                      <dt className="text-ink-subtle">Warranty till</dt>
                      <dd className="text-ink">{formatDate(a.inventory.warrantyExpiry)}</dd>
                    </>
                  )}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div>
        <h2 className="mb-3 text-base font-semibold text-ink">My requests</h2>
        {reqs.isError ? (
          <Card>
            <ErrorState error={reqs.error} message="Your requests couldn’t be loaded." onRetry={() => reqs.refetch()} />
          </Card>
        ) : (
          <DataTable
        exportName="my-assets"
            rows={(reqs.data ?? []).filter(isRealRequest)}
            columns={columns}
            rowKey={(r) => r.id}
            loading={reqs.isLoading}
            initialSort={{ key: "created", dir: "desc" }}
            empty={{ icon: PackagePlus, title: "No requests yet", description: "Need a laptop, monitor or software? Request it here." }}
          />
        )}
      </div>

      {open && <RequestDialog onClose={() => setOpen(false)} />}
    </div>
  );
}

function RequestDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const m = useAssetMutations();
  const cats = useCategories();
  const locs = useLocations();
  const [f, setF] = useState({ title: "", assetType: "", assetCategory: KINDS[0], priority: "Medium", requiredDate: "", quantity: "1", deliveryLocation: "", description: "" });
  const [tried, setTried] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const qty = Number(f.quantity);
  const errors = {
    title: f.title.trim().length < 3 ? "Give it a short title (at least 3 characters)." : "",
    assetType: !f.assetType.trim() ? "Choose what you need." : "",
    quantity: !Number.isInteger(qty) || qty < 1 || qty > 50 ? "Between 1 and 50." : "",
  };
  const invalid = Object.values(errors).some(Boolean);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (invalid) return;
    try {
      await m.request.mutateAsync({
        title: f.title.trim(),
        assetType: f.assetType.trim(),
        assetCategory: f.assetCategory,
        priority: f.priority,
        requiredDate: f.requiredDate || undefined,
        quantity: qty,
        deliveryLocation: f.deliveryLocation || undefined,
        description: f.description.trim() || undefined,
      });
      toast.success("Request sent", "IT and HR have been notified.");
      onClose();
    } catch (err) {
      toast.error("Couldn’t send the request", err instanceof ApiError ? err.message : undefined);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Request an asset"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="asset-request" loading={m.request.isPending}>
            <Send className="h-4 w-4" /> Send request
          </Button>
        </>
      }
    >
      <form id="asset-request" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <FormRow label="What do you need?" htmlFor="ar-type" required error={tried ? errors.assetType : undefined}>
          {cats.data?.length ? (
            <Select id="ar-type" value={f.assetType} onChange={set("assetType")} invalid={tried && !!errors.assetType}>
              <option value="">Choose…</option>
              {cats.data.map((c) => (
                <option key={c.id}>{c.name}</option>
              ))}
            </Select>
          ) : (
            <Input id="ar-type" value={f.assetType} onChange={set("assetType")} placeholder="e.g. Laptop" invalid={tried && !!errors.assetType} />
          )}
        </FormRow>
        <FormRow label="Kind" htmlFor="ar-kind">
          <Select id="ar-kind" value={f.assetCategory} onChange={set("assetCategory")}>
            {KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Title" htmlFor="ar-title" required error={tried ? errors.title : undefined} className="sm:col-span-2">
          <Input id="ar-title" value={f.title} maxLength={120} onChange={set("title")} placeholder="e.g. Second monitor for audit work" invalid={tried && !!errors.title} />
        </FormRow>
        <FormRow label="Priority" htmlFor="ar-priority">
          <Select id="ar-priority" value={f.priority} onChange={set("priority")}>
            {PRIORITIES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Quantity" htmlFor="ar-qty" error={tried ? errors.quantity : undefined}>
          <Input id="ar-qty" type="number" min={1} max={50} value={f.quantity} onChange={set("quantity")} invalid={tried && !!errors.quantity} />
        </FormRow>
        <FormRow label="Needed by" htmlFor="ar-date" hint="Optional">
          <Input id="ar-date" type="date" min={today()} value={f.requiredDate} onChange={set("requiredDate")} />
        </FormRow>
        <FormRow label="Deliver to" htmlFor="ar-loc" hint="Optional">
          {locs.data?.length ? (
            <Select id="ar-loc" value={f.deliveryLocation} onChange={set("deliveryLocation")}>
              <option value="">—</option>
              {locs.data.map((l) => (
                <option key={l.id}>{l.name}</option>
              ))}
            </Select>
          ) : (
            <Input id="ar-loc" value={f.deliveryLocation} onChange={set("deliveryLocation")} placeholder="Office or address" />
          )}
        </FormRow>
        <FormRow label="Why do you need it?" htmlFor="ar-desc" hint="Optional, but it helps approval" className="sm:col-span-2">
          <Textarea id="ar-desc" rows={3} value={f.description} maxLength={1000} onChange={set("description")} />
        </FormRow>
      </form>
    </Dialog>
  );
}
