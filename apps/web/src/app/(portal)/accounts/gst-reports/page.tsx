"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Download, Landmark, Pencil, Percent, Plus, Receipt, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { today, workDate } from "@/lib/dates";
import { formatCurrency, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { FormRow, Input, Select } from "@/components/ui/inputs";
import { Segmented } from "@/components/ui/segmented";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { downloadCsv } from "@/components/claims/claim-tabs";
import {
  isIssued,
  toInr,
  useAccountsMutations,
  useEntities,
  useInvoices,
  useTaxConfigs,
  type Invoice,
  type TaxConfig,
} from "@/components/accounts/api";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Indian financial year (April–March) periods: months and quarters for this FY and the last one. */
function periods(now: string) {
  const y = Number(now.slice(0, 4)), mo = Number(now.slice(5, 7));
  const fyStart = mo >= 4 ? y : y - 1;
  const out: { value: string; label: string; from: string; to: string }[] = [];
  for (const fy of [fyStart, fyStart - 1]) {
    const fyLabel = `FY ${fy}-${String(fy + 1).slice(2)}`;
    for (let q = 0; q < 4; q++) {
      const sm = 4 + q * 3, sy = sm > 12 ? fy + 1 : fy, s = ((sm - 1) % 12) + 1;
      const em = s + 2, ey = sy;
      out.push({ value: `q${fy}-${q}`, label: `Q${q + 1} ${fyLabel} (${MONTHS[s - 1]}–${MONTHS[em - 1]})`, from: `${sy}-${String(s).padStart(2, "0")}-01`, to: `${ey}-${String(em).padStart(2, "0")}-31` });
    }
    for (let i = 0; i < 12; i++) {
      const m = ((3 + i) % 12) + 1, yy = m >= 4 ? fy : fy + 1;
      out.push({ value: `m${yy}-${m}`, label: `${MONTHS[m - 1]} ${yy}`, from: `${yy}-${String(m).padStart(2, "0")}-01`, to: `${yy}-${String(m).padStart(2, "0")}-31` });
    }
    out.push({ value: `fy${fy}`, label: `Whole ${fyLabel}`, from: `${fy}-04-01`, to: `${fy + 1}-03-31` });
  }
  return out.filter((p) => p.from <= now);
}

interface Row {
  inv: Invoice;
  date: string;
  b2b: boolean;
  exportSupply: boolean;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export default function GstReport() {
  const q = useInvoices();
  const entities = useEntities();
  const taxes = useTaxConfigs();
  const m = useAccountsMutations();
  const toast = useToast();

  const now = today();
  const options = useMemo(() => periods(now), [now]);
  const currentMonth = `m${Number(now.slice(0, 4))}-${Number(now.slice(5, 7))}`;
  const [period, setPeriod] = useState(currentMonth);
  const [entity, setEntity] = useState("");
  const [kind, setKind] = useState<"all" | "b2b" | "b2c">("all");
  const [editingTax, setEditingTax] = useState<TaxConfig | null | undefined>(undefined);
  const [deletingTax, setDeletingTax] = useState<TaxConfig | null>(null);
  const p = options.find((o) => o.value === period) ?? options[0];

  const rows: Row[] = useMemo(
    () =>
      (q.data ?? [])
        .filter((i) => isIssued(i) && (!entity || i.entityId === entity))
        .map((i) => {
          const r = i.exchangeRate || 1;
          const t = i.items.reduce((a, it) => ({ c: a.c + (it.cgst ?? 0), s: a.s + (it.sgst ?? 0), g: a.g + (it.igst ?? 0) }), { c: 0, s: 0, g: 0 });
          return {
            inv: i,
            date: workDate(i.issueDate),
            b2b: !!i.client?.gstin,
            exportSupply: i.currency !== "INR" && i.taxAmount === 0,
            taxable: toInr(i.subTotal, r),
            cgst: toInr(t.c, r),
            sgst: toInr(t.s, r),
            igst: toInr(t.g, r),
            total: toInr(i.totalAmount, r),
          };
        })
        .filter((x) => x.date >= p.from && x.date <= p.to && (kind === "all" || (kind === "b2b") === x.b2b)),
    [q.data, entity, p, kind],
  );
  const sum = rows.reduce((a, x) => ({ taxable: a.taxable + x.taxable, cgst: a.cgst + x.cgst, sgst: a.sgst + x.sgst, igst: a.igst + x.igst }), { taxable: 0, cgst: 0, sgst: 0, igst: 0 });

  const columns: Column<Row>[] = [
    { key: "no", header: "Invoice", sortValue: (x) => x.inv.invoiceNumber, cell: (x) => <Link href={`/accounts/invoices/${x.inv.id}`} className="block w-40"><span className="block truncate font-medium text-ink hover:text-brand">{x.inv.invoiceNumber}</span><span className="block text-xs text-ink-subtle">{formatDate(x.date)}</span></Link> },
    { key: "client", header: "Client", sortValue: (x) => x.inv.client?.name ?? "", cell: (x) => <div className="w-44"><p className="truncate text-ink">{x.inv.client?.name}</p><p className="truncate font-mono text-[11px] text-ink-subtle">{x.inv.client?.gstin ?? (x.exportSupply ? "Export" : "Unregistered")}</p></div> },
    { key: "taxable", header: "Taxable", align: "right", sortValue: (x) => x.taxable, cell: (x) => <span className="tabular">{formatCurrency(x.taxable)}</span> },
    { key: "cgst", header: "CGST", align: "right", hideBelow: "md", sortValue: (x) => x.cgst, cell: (x) => <span className="tabular text-ink-muted">{x.cgst ? formatCurrency(x.cgst) : "—"}</span> },
    { key: "sgst", header: "SGST", align: "right", hideBelow: "md", sortValue: (x) => x.sgst, cell: (x) => <span className="tabular text-ink-muted">{x.sgst ? formatCurrency(x.sgst) : "—"}</span> },
    { key: "igst", header: "IGST", align: "right", hideBelow: "md", sortValue: (x) => x.igst, cell: (x) => <span className="tabular text-ink-muted">{x.igst ? formatCurrency(x.igst) : "—"}</span> },
    { key: "total", header: "Invoice value", align: "right", hideBelow: "lg", sortValue: (x) => x.total, cell: (x) => <span className="font-medium tabular">{formatCurrency(x.total)}</span> },
  ];

  if (q.isError)
    return (
      <Card>
        <ErrorState message="Invoices couldn’t be loaded." onRetry={() => q.refetch()} />
      </Card>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="GST & tax"
        description="Output tax on issued invoices, in ₹, plus configured GST & TDS tax slabs."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setEditingTax(null)}>
              <Plus className="h-4 w-4" /> Add tax rate
            </Button>
            <Button
              variant="secondary"
              disabled={!rows.length}
              onClick={() =>
                downloadCsv(
                  `gst-${p.value}${entity ? `-${entities.data?.find((e) => e.id === entity)?.name ?? ""}` : ""}.csv`,
                  ["Invoice", "Date", "Billed by (GSTIN)", "Client", "Client GSTIN", "Supply", "Taxable (₹)", "CGST (₹)", "SGST (₹)", "IGST (₹)", "Invoice value (₹)", "Currency", "Rate"],
                  rows.map((x) => [x.inv.invoiceNumber, x.date, x.inv.entity?.gstin ?? x.inv.entity?.name, x.inv.client?.name, x.inv.client?.gstin ?? "", x.exportSupply ? "Export" : x.b2b ? "B2B" : "B2C", x.taxable.toFixed(2), x.cgst.toFixed(2), x.sgst.toFixed(2), x.igst.toFixed(2), x.total.toFixed(2), x.inv.currency, x.inv.exchangeRate]),
                )
              }
            >
              <Download className="h-4 w-4" /> Export
            </Button>
          </div>
        }
      />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value)} className="sm:w-64">
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          {(entities.data?.length ?? 0) > 1 && (
            <Select aria-label="Billing entity" value={entity} onChange={(e) => setEntity(e.target.value)} className="sm:w-56">
              <option value="">All entities</option>
              {entities.data!.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                  {x.gstin ? ` · ${x.gstin}` : ""}
                </option>
              ))}
            </Select>
          )}
        </div>
        <Segmented
          aria-label="Supply type"
          value={kind}
          onChange={setKind}
          options={[
            { value: "all", label: "All" },
            { value: "b2b", label: "B2B" },
            { value: "b2c", label: "B2C / export" },
          ]}
        />
      </div>
      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Taxable value" icon={Receipt} tone="brand" loading={q.isLoading} value={formatCurrency(sum.taxable)} />
        <StatCard label="CGST" icon={Landmark} loading={q.isLoading} value={formatCurrency(sum.cgst)} />
        <StatCard label="SGST" icon={Landmark} loading={q.isLoading} value={formatCurrency(sum.sgst)} />
        <StatCard label="IGST" icon={Landmark} loading={q.isLoading} value={formatCurrency(sum.igst)} />
      </section>
      <DataTable rows={rows} columns={columns} rowKey={(x) => x.inv.id} loading={q.isLoading} initialSort={{ key: "no", dir: "asc" }} pageSize={25} empty={{ icon: Receipt, title: "No issued invoices in this period" }} />
      <p className="text-xs text-ink-subtle">CGST/SGST vs IGST is as stored on each invoice when it was raised. Input tax credit isn’t tracked in the portal.</p>

      <Card>
        <CardHeader
          icon={Percent}
          title="Configured GST & TDS tax slabs"
          description="Standard tax rates used across billing and compliance"
          actions={
            <Button variant="secondary" size="sm" onClick={() => setEditingTax(null)}>
              <Plus className="h-4 w-4" /> Add rate
            </Button>
          }
        />
        {!taxes.data?.length ? (
          <EmptyState icon={Percent} title="No custom tax slabs configured yet" description="Add GST slabs (e.g. GST 18%) or TDS sections (e.g. TDS 194J — 10%)." className="py-8" />
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {taxes.data.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3 text-[13px]">
                <div className="flex items-center gap-2.5">
                  <span className="font-semibold text-ink">{t.name}</span>
                  <Badge tone={t.type === "GST" ? "brand" : "warning"}>{t.type}</Badge>
                  {!t.isActive && <Badge tone="neutral">Inactive</Badge>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold tabular text-ink">{t.rate}%</span>
                  <Button variant="ghost" size="sm" onClick={() => setEditingTax(t)} aria-label="Edit tax rate">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeletingTax(t)} aria-label="Delete tax rate">
                    <Trash2 className="h-3.5 w-3.5 text-danger" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editingTax !== undefined && <TaxDialog tax={editingTax} onClose={() => setEditingTax(undefined)} />}
      <ConfirmDialog
        open={!!deletingTax}
        onClose={() => setDeletingTax(null)}
        tone="danger"
        title="Delete tax rate?"
        description={deletingTax ? `Remove "${deletingTax.name}" (${deletingTax.rate}%)?` : ""}
        confirmLabel="Delete"
        busy={m.deleteTaxConfig.isPending}
        onConfirm={() =>
          deletingTax &&
          m.deleteTaxConfig.mutate(deletingTax.id, {
            onSuccess: () => (toast.success("Tax rate removed"), setDeletingTax(null)),
            onError: (e) => (toast.error("Couldn’t delete", e instanceof ApiError ? e.message : undefined), setDeletingTax(null)),
          })
        }
      />
    </div>
  );
}

function TaxDialog({ tax, onClose }: { tax: TaxConfig | null; onClose: () => void }) {
  const toast = useToast();
  const m = useAccountsMutations();
  const [name, setName] = useState(tax?.name ?? "");
  const [type, setType] = useState(tax?.type ?? "GST");
  const [rate, setRate] = useState(String(tax?.rate ?? "18"));
  const [isActive, setIsActive] = useState(tax?.isActive ?? true);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = Number(rate);
    if (!name.trim() || !Number.isFinite(r) || r < 0 || r > 100) return;
    try {
      await m.saveTaxConfig.mutateAsync({ id: tax?.id, name: name.trim(), type, rate: r, isActive });
      toast.success(tax ? "Tax rate updated" : "Tax rate added");
      onClose();
    } catch (err) {
      toast.error("Couldn’t save", err instanceof ApiError ? err.message : undefined);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={tax ? `Edit ${tax.name}` : "Add tax rate"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="tax-form" loading={m.saveTaxConfig.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id="tax-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Name" htmlFor="tx-name" required>
          <Input id="tx-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Professional Services GST 18%" />
        </FormRow>
        <FormRow label="Type" htmlFor="tx-type" required>
          <Select id="tx-type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="GST">GST</option>
            <option value="TDS">TDS</option>
            <option value="IGST">IGST</option>
            <option value="OTHER">Other</option>
          </Select>
        </FormRow>
        <FormRow label="Rate (%)" htmlFor="tx-rate" required>
          <Input id="tx-rate" type="number" min="0" max="100" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
        </FormRow>
        <FormRow label="Status" htmlFor="tx-status">
          <Select id="tx-status" value={isActive ? "active" : "inactive"} onChange={(e) => setIsActive(e.target.value === "active")}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </FormRow>
      </form>
    </Dialog>
  );
}
