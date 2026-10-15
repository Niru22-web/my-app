"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ImportButton } from "@/components/ui/import-dialog";
import { Pencil, Plus, Store, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, FormRow, Textarea } from "@/components/ui/inputs";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ErrorState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { RowMenu } from "@/components/management/row-menu";
import { canManageOps, useAssetMutations, useAssets, useVendors, type Vendor } from "@/components/assets/api";

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function VendorsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const ops = canManageOps(user?.role);
  const q = useVendors();
  const assets = useAssets();
  const m = useAssetMutations();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Vendor | null | undefined>(undefined);
  const [removing, setRemoving] = useState<Vendor | null>(null);

  const used = useMemo(() => {
    const c = new Map<string, number>();
    for (const a of assets.data ?? []) if (a.vendorId) c.set(a.vendorId, (c.get(a.vendorId) ?? 0) + 1);
    return c;
  }, [assets.data]);
  const rows = (q.data ?? []).filter((v) => !search.trim() || `${v.vendorName} ${v.company} ${v.contactPerson ?? ""} ${v.email ?? ""} ${v.gstNumber ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));

  const columns: Column<Vendor>[] = [
    { key: "name", header: "Vendor", sortValue: (v) => v.vendorName, cell: (v) => <div className="w-44 sm:w-56"><p className="truncate font-medium text-ink">{v.vendorName}</p><p className="truncate text-xs text-ink-subtle">{v.company}</p></div> },
    { key: "contact", header: "Contact", hideBelow: "md", cell: (v) => <div className="text-ink-muted"><p>{v.contactPerson || "—"}</p><p className="text-xs text-ink-subtle">{[v.phone, v.email].filter(Boolean).join(" · ")}</p></div> },
    { key: "gst", header: "GSTIN", hideBelow: "lg", cell: (v) => <span className="font-mono text-xs text-ink-muted">{v.gstNumber || "—"}</span> },
    { key: "assets", header: "Assets", align: "right", sortValue: (v) => used.get(v.id) ?? 0, cell: (v) => <span className="tabular text-ink">{used.get(v.id) ?? 0}</span> },
    ...(ops
      ? [
          {
            key: "act",
            header: "",
            align: "right" as const,
            cell: (v: Vendor) => (
              <RowMenu
                items={[
                  { label: "Edit", icon: <Pencil className="h-4 w-4" />, onClick: () => setEditing(v) },
                  used.get(v.id)
                    ? { label: "Delete", icon: <Trash2 className="h-4 w-4" />, onClick: () => undefined, disabledReason: "Assets are linked to this vendor" }
                    : { label: "Delete", icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => setRemoving(v) },
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
        <ErrorState message="Vendors couldn’t be loaded." onRetry={() => q.refetch()} />
      </Card>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendors"
        description="Suppliers the firm buys equipment and services from"
        actions={
          ops && (
            <>
              <ImportButton kind="vendors" label="Vendors" invalidate={[["assets"]]} />
              <Button onClick={() => setEditing(null)}>
                <Plus className="h-4 w-4" /> Add vendor
              </Button>
            </>
          )
        }
      />
      <DataTable
        exportName="vendors"
        itemsLabel="vendors"
        searchable
        searchPlaceholder="Search name, company, contact, email or GSTIN"
        searchValue={search}
        onSearchChange={setSearch}
        rows={rows}
        columns={columns}
        rowKey={(v) => v.id}
        loading={q.isLoading}
        initialSort={{ key: "name", dir: "asc" }}
        empty={{ icon: Store, title: q.data?.length ? "No vendors match" : "No vendors yet" }}
      />

      {editing !== undefined && <VendorDialog vendor={editing} onClose={() => setEditing(undefined)} />}
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        tone="danger"
        title={`Delete ${removing?.vendorName}?`}
        description="This can’t be undone."
        confirmLabel="Delete"
        busy={m.deleteVendor.isPending}
        onConfirm={() =>
          removing &&
          m.deleteVendor.mutate(removing.id, {
            onSuccess: () => (toast.success("Vendor deleted"), setRemoving(null)),
            onError: (e) => toast.error("Couldn’t delete", e instanceof ApiError ? e.message : undefined),
          })
        }
      />
    </div>
  );
}

function VendorDialog({ vendor, onClose }: { vendor: Vendor | null; onClose: () => void }) {
  const toast = useToast();
  const m = useAssetMutations();
  const [f, setF] = useState({
    vendorName: vendor?.vendorName ?? "",
    company: vendor?.company ?? "",
    contactPerson: vendor?.contactPerson ?? "",
    phone: vendor?.phone ?? "",
    email: vendor?.email ?? "",
    gstNumber: vendor?.gstNumber ?? "",
    address: vendor?.address ?? "",
  });
  const [tried, setTried] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const errors = {
    vendorName: !f.vendorName.trim() ? "Required." : "",
    company: !f.company.trim() ? "Required." : "",
    email: f.email.trim() && !EMAIL.test(f.email.trim()) ? "Enter a valid email." : "",
    gstNumber: f.gstNumber.trim() && !GSTIN.test(f.gstNumber.trim().toUpperCase()) ? "That doesn’t look like a GSTIN (15 characters)." : "",
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.values(errors).some(Boolean)) return;
    try {
      await m.saveVendor.mutateAsync({
        id: vendor?.id,
        vendorName: f.vendorName.trim(),
        company: f.company.trim(),
        contactPerson: f.contactPerson.trim() || null,
        phone: f.phone.trim() || null,
        email: f.email.trim() || null,
        gstNumber: f.gstNumber.trim().toUpperCase() || null,
        address: f.address.trim() || null,
      });
      toast.success(vendor ? "Vendor updated" : "Vendor added");
      onClose();
    } catch (err) {
      toast.error("Couldn’t save the vendor", err instanceof ApiError ? err.message : undefined);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={vendor ? `Edit ${vendor.vendorName}` : "Add a vendor"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="vendor-form" loading={m.saveVendor.isPending}>
            {vendor ? "Save" : "Add vendor"}
          </Button>
        </>
      }
    >
      <form id="vendor-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Vendor name" htmlFor="vd-name" required error={tried ? errors.vendorName : undefined}>
          <Input id="vd-name" value={f.vendorName} onChange={set("vendorName")} invalid={tried && !!errors.vendorName} />
        </FormRow>
        <FormRow label="Company" htmlFor="vd-company" required error={tried ? errors.company : undefined}>
          <Input id="vd-company" value={f.company} onChange={set("company")} invalid={tried && !!errors.company} />
        </FormRow>
        <FormRow label="Contact person" htmlFor="vd-contact">
          <Input id="vd-contact" value={f.contactPerson} onChange={set("contactPerson")} />
        </FormRow>
        <FormRow label="Phone" htmlFor="vd-phone">
          <Input id="vd-phone" type="tel" value={f.phone} onChange={set("phone")} />
        </FormRow>
        <FormRow label="Email" htmlFor="vd-email" error={tried ? errors.email : undefined}>
          <Input id="vd-email" type="email" value={f.email} onChange={set("email")} invalid={tried && !!errors.email} />
        </FormRow>
        <FormRow label="GSTIN" htmlFor="vd-gst" error={tried ? errors.gstNumber : undefined}>
          <Input id="vd-gst" value={f.gstNumber} maxLength={15} onChange={set("gstNumber")} className="uppercase" invalid={tried && !!errors.gstNumber} />
        </FormRow>
        <FormRow label="Address" htmlFor="vd-address" className="sm:col-span-2">
          <Textarea id="vd-address" rows={2} value={f.address} onChange={set("address")} />
        </FormRow>
      </form>
    </Dialog>
  );
}
