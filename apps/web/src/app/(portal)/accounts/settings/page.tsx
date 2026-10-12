"use client";

import { useState, type FormEvent } from "react";
import { Building2, Pencil, Plus, Power } from "lucide-react";
import { ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { FormRow, Input, Select, Textarea } from "@/components/ui/inputs";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { RowMenu } from "@/components/management/row-menu";
import { useAccountsMutations, useEntities, type Entity } from "@/components/accounts/api";

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const FORMATS = [
  { value: "{PREFIX}-{FY}-{NNNN}", label: "Prefix-FY-0001 (e.g. ASA-2026-27-0001)" },
  { value: "{PREFIX}/{FY_SHORT}/{NNN}", label: "Prefix/FY/001 (e.g. ASA/26-27/001)" },
  { value: "{PREFIX}-{YYYY}-{NNNN}", label: "Prefix-Year-0001 (e.g. ASA-2026-0001)" },
];

export default function EntitiesPage() {
  const q = useEntities();
  const toast = useToast();
  const m = useAccountsMutations();
  const [editing, setEditing] = useState<Entity | null | undefined>(undefined);

  if (q.isError)
    return (
      <Card>
        <ErrorState message="Billing entities couldn’t be loaded." onRetry={() => q.refetch()} />
      </Card>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing entities"
        description="The firms that raise invoices — their GST details, bank account and invoice numbering"
        actions={
          <Button onClick={() => setEditing(null)}>
            <Plus className="h-4 w-4" /> Add entity
          </Button>
        }
      />
      {q.isLoading ? (
        <Skeleton className="h-40" />
      ) : !q.data?.length ? (
        <Card>
          <EmptyState icon={Building2} title="No billing entities yet" description="Add the firm’s legal entity before raising the first invoice." action={<Button onClick={() => setEditing(null)}>Add entity</Button>} />
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {q.data.map((e) => (
            <li key={e.id}>
              <Card className="h-full p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold text-ink">
                      {e.name} {e.status === "INACTIVE" && <Badge>Inactive</Badge>}
                    </p>
                    {e.legalName && e.legalName !== e.name && <p className="text-[13px] text-ink-muted">{e.legalName}</p>}
                  </div>
                  <RowMenu
                    items={[
                      { label: "Edit", icon: <Pencil className="h-4 w-4" />, onClick: () => setEditing(e) },
                      {
                        label: e.status === "INACTIVE" ? "Activate" : "Deactivate (no new invoices)",
                        icon: <Power className="h-4 w-4" />,
                        onClick: () =>
                          m.saveEntity.mutate(
                            { id: e.id, name: e.name, status: e.status === "INACTIVE" ? "ACTIVE" : "INACTIVE" },
                            { onSuccess: () => toast.success(e.status === "INACTIVE" ? "Activated" : "Deactivated"), onError: (er) => toast.error("Couldn’t update", er instanceof ApiError ? er.message : undefined) },
                          ),
                      },
                    ]}
                  />
                </div>
                <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
                  <dt className="text-ink-subtle">GSTIN</dt>
                  <dd className="font-mono text-ink">{e.gstin || "—"}</dd>
                  <dt className="text-ink-subtle">PAN</dt>
                  <dd className="font-mono text-ink">{e.pan || "—"}</dd>
                  <dt className="text-ink-subtle">Bank</dt>
                  <dd className="text-ink">{e.bankDetails?.bankName ? `${e.bankDetails.bankName}${e.bankDetails.accountNo ? ` · ••${String(e.bankDetails.accountNo).slice(-4)}` : ""}` : "—"}</dd>
                  <dt className="text-ink-subtle">Numbering</dt>
                  <dd className={e.bankDetails?.invoicePrefix ? "text-ink" : "text-warning"}>{e.bankDetails?.invoicePrefix ? `${e.bankDetails.invoicePrefix} · ${e.bankDetails.customFormat ?? "{PREFIX}-{YYYY}-{NNNN}"}` : "No prefix set — numbers would start with “-”"}</dd>
                </dl>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {editing !== undefined && <EntityDialog entity={editing} onClose={() => setEditing(undefined)} />}
    </div>
  );
}

function EntityDialog({ entity, onClose }: { entity: Entity | null; onClose: () => void }) {
  const toast = useToast();
  const m = useAccountsMutations();
  const b = entity?.bankDetails ?? {};
  const [f, setF] = useState({
    name: entity?.name ?? "",
    legalName: entity?.legalName ?? "",
    gstin: entity?.gstin ?? "",
    pan: entity?.pan ?? "",
    msmeReg: entity?.msmeReg ?? "",
    address: entity?.address ?? "",
    bankName: String(b.bankName ?? ""),
    accountName: String(b.accountName ?? ""),
    accountNo: String(b.accountNo ?? ""),
    ifsc: String(b.ifsc ?? ""),
    swift: String(b.swift ?? ""),
    invoicePrefix: String(b.invoicePrefix ?? ""),
    customFormat: String(b.customFormat ?? FORMATS[0].value),
  });
  const [tried, setTried] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const up = (s: string) => s.trim().toUpperCase();
  const errors = {
    name: !f.name.trim() ? "Required." : "",
    gstin: f.gstin.trim() && !GSTIN.test(up(f.gstin)) ? "Not a valid GSTIN." : "",
    pan: f.pan.trim() && !PAN.test(up(f.pan)) ? "Format: ABCDE1234F." : "",
    gstinPan: f.gstin.trim() && f.pan.trim() && GSTIN.test(up(f.gstin)) && up(f.gstin).slice(2, 12) !== up(f.pan) ? "PAN doesn’t match the GSTIN." : "",
    ifsc: f.ifsc.trim() && !IFSC.test(up(f.ifsc)) ? "Format: HDFC0001234." : "",
    accountNo: f.accountNo.trim() && !/^[A-Za-z0-9]{6,34}$/.test(f.accountNo.trim()) ? "6–34 letters or digits." : "",
    invoicePrefix: !/^[A-Za-z0-9]{1,10}$/.test(f.invoicePrefix.trim()) ? "1–10 letters or digits, e.g. ASA." : "",
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.values(errors).some(Boolean)) return;
    try {
      await m.saveEntity.mutateAsync({
        id: entity?.id,
        name: f.name.trim(),
        legalName: f.legalName.trim() || f.name.trim(),
        gstin: up(f.gstin) || null,
        pan: up(f.pan) || null,
        msmeReg: f.msmeReg.trim() || null,
        address: f.address.trim() || null,
        status: entity?.status ?? "ACTIVE",
        // The API replaces bankDetails wholesale — keep keys this form doesn't edit (invoice template styling).
        bankDetails: { ...b, bankName: f.bankName.trim(), accountName: f.accountName.trim(), accountNo: f.accountNo.trim(), ifsc: up(f.ifsc), swift: up(f.swift), invoicePrefix: up(f.invoicePrefix), customFormat: f.customFormat, invoiceFormat: "custom" },
      });
      toast.success(entity ? "Entity saved" : "Entity added");
      onClose();
    } catch (err) {
      toast.error("Couldn’t save", err instanceof ApiError ? err.message : undefined);
    }
  }

  const show = (k: keyof typeof errors) => (tried ? errors[k] || undefined : undefined);
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={entity ? `Edit ${entity.name}` : "Add billing entity"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="entity-form" loading={m.saveEntity.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id="entity-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Short name" htmlFor="en-name" required error={show("name")}>
          <Input id="en-name" value={f.name} onChange={set("name")} placeholder="e.g. ASA Mumbai" invalid={!!show("name")} />
        </FormRow>
        <FormRow label="Legal name" htmlFor="en-legal" hint="As registered — printed on invoices">
          <Input id="en-legal" value={f.legalName} onChange={set("legalName")} />
        </FormRow>
        <FormRow label="GSTIN" htmlFor="en-gstin" error={show("gstin") ?? show("gstinPan")}>
          <Input id="en-gstin" value={f.gstin} maxLength={15} onChange={set("gstin")} className="uppercase font-mono" invalid={!!(show("gstin") ?? show("gstinPan"))} />
        </FormRow>
        <FormRow label="PAN" htmlFor="en-pan" error={show("pan")}>
          <Input id="en-pan" value={f.pan} maxLength={10} onChange={set("pan")} className="uppercase font-mono" invalid={!!show("pan")} />
        </FormRow>
        <FormRow label="Registered address" htmlFor="en-addr" className="sm:col-span-2">
          <Textarea id="en-addr" rows={2} value={f.address} onChange={set("address")} />
        </FormRow>
        <FormRow label="MSME / Udyam number" htmlFor="en-msme" hint="Optional">
          <Input id="en-msme" value={f.msmeReg} onChange={set("msmeReg")} />
        </FormRow>
        <span />
        <p className="pt-2 text-sm font-semibold text-ink sm:col-span-2">Bank account printed on invoices</p>
        <FormRow label="Bank" htmlFor="en-bank">
          <Input id="en-bank" value={f.bankName} onChange={set("bankName")} />
        </FormRow>
        <FormRow label="Account name" htmlFor="en-accname">
          <Input id="en-accname" value={f.accountName} onChange={set("accountName")} />
        </FormRow>
        <FormRow label="Account number" htmlFor="en-accno" error={show("accountNo")}>
          <Input id="en-accno" value={f.accountNo} onChange={set("accountNo")} className="font-mono" invalid={!!show("accountNo")} />
        </FormRow>
        <FormRow label="IFSC" htmlFor="en-ifsc" error={show("ifsc")}>
          <Input id="en-ifsc" value={f.ifsc} maxLength={11} onChange={set("ifsc")} className="uppercase font-mono" invalid={!!show("ifsc")} />
        </FormRow>
        <FormRow label="SWIFT" htmlFor="en-swift" hint="For foreign clients">
          <Input id="en-swift" value={f.swift} maxLength={11} onChange={set("swift")} className="uppercase font-mono" />
        </FormRow>
        <span />
        <p className="pt-2 text-sm font-semibold text-ink sm:col-span-2">Invoice numbering</p>
        <FormRow label="Prefix" htmlFor="en-prefix" required error={show("invoicePrefix")}>
          <Input id="en-prefix" value={f.invoicePrefix} maxLength={10} onChange={set("invoicePrefix")} className="uppercase" placeholder="ASA" invalid={!!show("invoicePrefix")} />
        </FormRow>
        <FormRow label="Format" htmlFor="en-format" hint="The counter continues across years (current server behaviour)">
          <Select id="en-format" value={f.customFormat} onChange={set("customFormat")}>
            {FORMATS.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
            {!FORMATS.some((x) => x.value === f.customFormat) && <option value={f.customFormat}>{f.customFormat}</option>}
          </Select>
        </FormRow>
      </form>
    </Dialog>
  );
}
