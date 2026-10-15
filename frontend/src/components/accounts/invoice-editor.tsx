"use client";

import { useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { addDays, today, workDate } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormRow, Input, Select } from "@/components/ui/inputs";
import { useToast } from "@/components/ui/toast";
import { useClientOptions, useProjectList, type Client } from "@/components/management/api";
import { round2, useAccountsMutations, useCurrencies, useEntities, usePlaceOfSupply, type Invoice, type InvoiceInput } from "./api";

const FALLBACK_CURRENCIES = ["INR", "USD", "AED", "EUR", "GBP"];
const GST_RATES = [0, 5, 12, 18, 28];
const UDIN = /^\d{8}[A-Z]{6}\d{4}$/;

const SUPPLY_TAX: Record<string, string> = { INTRA: "CGST + SGST", INTER: "IGST", EXPORT: "IGST (0% if exported under LUT)", NO_GST: "No GST" };

interface Line {
  key: number;
  description: string;
  sacCode: string;
  quantity: string;
  unitPrice: string;
  gstRate: string;
}

export function InvoiceEditor({ invoice, onClose, onSaved }: { invoice?: Invoice | null; onClose: () => void; onSaved?: (id: string) => void }) {
  const toast = useToast();
  const m = useAccountsMutations();
  const entities = useEntities();
  const clients = useClientOptions();
  const projects = useProjectList();
  const now = today();
  const [entityId, setEntity] = useState(invoice?.entityId ?? "");
  const [clientId, setClient] = useState(invoice?.clientId ?? "");
  const [projectId, setProject] = useState(invoice?.projectId ?? "");
  const [issueDate, setIssue] = useState(invoice ? workDate(invoice.issueDate) : now);
  const [dueDate, setDue] = useState(invoice?.dueDate ? workDate(invoice.dueDate) : addDays(now, 30));
  const [currency, setCurrency] = useState(invoice?.currency ?? "INR");
  const [rate, setRate] = useState(String(invoice?.exchangeRate ?? 1));
  const [udin, setUdin] = useState(invoice?.udin ?? "");
  const [lines, setLines] = useState<Line[]>(
    invoice?.items.length
      ? invoice.items.map((it, k) => ({ key: k, description: it.description, sacCode: it.sacCode ?? "998311", quantity: String(it.quantity), unitPrice: String(it.unitPrice), gstRate: String(it.gstRate ?? 0) }))
      : [{ key: 0, description: "", sacCode: "998311", quantity: "1", unitPrice: "", gstRate: "18" }],
  );
  const [tried, setTried] = useState(false);

  const activeEntities = (entities.data ?? []).filter((e) => e.status !== "INACTIVE" || e.id === entityId);
  const clientList = useMemo(() => {
    const l = clients.data ?? [];
    return invoice?.client && !l.some((c) => c.id === invoice.clientId) ? [...l, invoice.client as unknown as Client] : l;
  }, [clients.data, invoice]);
  const client = clientList.find((c) => c.id === clientId);
  const pos = usePlaceOfSupply(entityId, clientId);
  const supply = pos.data?.supplyType;
  const noGst = supply === "NO_GST";
  const local = supply !== "INTER" && supply !== "EXPORT";
  const currencyRows = useCurrencies();
  const currencies = useMemo(() => {
    const codes = (currencyRows.data ?? []).map((c) => c.code.toUpperCase());
    const base = codes.length ? ["INR", ...codes.filter((c) => c !== "INR")] : FALLBACK_CURRENCIES;
    return base.includes(currency) ? base : [...base, currency];
  }, [currencyRows.data, currency]);
  const clientProjects = (projects.data ?? []).filter((p) => p.clientId === clientId);

  const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
  const totals = lines.reduce(
    (t, l) => {
      const q = num(l.quantity), p = num(l.unitPrice), g = num(l.gstRate);
      const base = Number.isFinite(q) && Number.isFinite(p) ? q * p : 0;
      return { sub: t.sub + base, tax: t.tax + (noGst ? 0 : base * ((Number.isFinite(g) ? g : 0) / 100)) };
    },
    { sub: 0, tax: 0 },
  );
  const fx = num(rate);
  const lineErr = (l: Line) => (!l.description.trim() ? "Describe the work." : !(num(l.quantity) > 0) ? "Quantity must be above 0." : !(num(l.unitPrice) >= 0) ? "Enter a rate." : "");
  const errors = {
    entityId: !entityId ? (activeEntities.length ? "Choose who is billing." : "Add a billing entity first (Billing entities tab).") : "",
    clientId: !clientId ? "Choose a client." : "",
    dueDate: dueDate && dueDate < issueDate ? "Due date can’t be before the invoice date." : "",
    rate: currency !== "INR" && !(fx > 0) ? "Enter the ₹ rate for 1 " + currency + "." : "",
    udin: udin.trim() && !UDIN.test(udin.trim().toUpperCase()) ? "UDIN is 18 characters (8 digits, 6 letters, 4 digits)." : "",
    lines: lines.some(lineErr) ? "Complete every line." : totals.sub <= 0 ? "The invoice total must be above 0." : "",
  };
  const invalid = Object.values(errors).some(Boolean);
  const setLine = (key: number, k: keyof Line) => (e: { target: { value: string } }) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [k]: e.target.value } : l)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (invalid) return;
    const body: InvoiceInput = {
      entityId,
      clientId,
      projectId: projectId || undefined,
      udin: udin.trim().toUpperCase() || undefined,
      issueDate,
      dueDate: dueDate || undefined,
      currency,
      exchangeRate: currency === "INR" ? 1 : fx,
      items: lines.map((l) => ({ description: l.description.trim(), sacCode: l.sacCode.trim() || "998311", quantity: num(l.quantity), unitPrice: round2(num(l.unitPrice)), gstRate: num(l.gstRate) || 0 })),
    };
    try {
      if (invoice) {
        const { entityId: _omit, ...rest } = body;
        void _omit;
        await m.updateDraft.mutateAsync({ id: invoice.id, body: rest });
        toast.success("Draft saved");
        onSaved?.(invoice.id);
      } else {
        const res = await m.createInvoice.mutateAsync(body);
        toast.success("Draft saved", "Review it, then issue it — the invoice number is given when you issue.");
        onSaved?.(res.data.id);
      }
      onClose();
    } catch (err) {
      toast.error("Couldn’t save the invoice", err instanceof ApiError ? err.message : undefined);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={invoice ? "Edit draft invoice" : "New invoice"}
      description="Saved as a draft. Drafts aren’t counted as billed, and get their invoice number only when you issue them."
      footer={
        <>
          <span className="mr-auto text-sm text-ink-muted">
            Total <strong className="tabular text-ink">{formatCurrency(round2(totals.sub + totals.tax), currency)}</strong>
          </span>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="invoice-form" loading={m.createInvoice.isPending || m.updateDraft.isPending}>
            Save draft
          </Button>
        </>
      }
    >
      <form id="invoice-form" onSubmit={submit} noValidate className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormRow label="Billing entity" htmlFor="iv-entity" required error={tried ? errors.entityId : undefined}>
            <Select id="iv-entity" value={entityId} onChange={(e) => setEntity(e.target.value)} disabled={!!invoice} invalid={tried && !!errors.entityId}>
              <option value="">Choose…</option>
              {activeEntities.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </FormRow>
          <FormRow label="Client" htmlFor="iv-client" required error={tried ? errors.clientId : undefined} hint={client ? (client.gstin ? `GSTIN ${client.gstin}` : "No GSTIN") : undefined}>
            <Select id="iv-client" value={clientId} onChange={(e) => (setClient(e.target.value), setProject(""))} invalid={tried && !!errors.clientId}>
              <option value="">Choose…</option>
              {clientList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FormRow>
          <FormRow label="Project" htmlFor="iv-project" hint="Optional">
            <Select id="iv-project" value={projectId} onChange={(e) => setProject(e.target.value)} disabled={!clientProjects.length}>
              <option value="">{clientProjects.length ? "—" : "No projects for this client"}</option>
              {clientProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FormRow>
          <FormRow label="UDIN" htmlFor="iv-udin" hint="Optional — for attest engagements" error={tried ? errors.udin : undefined}>
            <Input id="iv-udin" value={udin} maxLength={18} onChange={(e) => setUdin(e.target.value)} className="uppercase" invalid={tried && !!errors.udin} />
          </FormRow>
          <FormRow label="Invoice date" htmlFor="iv-date" required>
            <Input id="iv-date" type="date" value={issueDate} onChange={(e) => setIssue(e.target.value)} />
          </FormRow>
          <FormRow label="Due date" htmlFor="iv-due" error={tried ? errors.dueDate : undefined} hint={<span className="space-x-2">{[15, 30, 45].map((d) => <button key={d} type="button" className="font-semibold text-brand hover:underline" onClick={() => setDue(addDays(issueDate, d))}>{d} days</button>)}</span>}>
            <Input id="iv-due" type="date" min={issueDate} value={dueDate} onChange={(e) => setDue(e.target.value)} invalid={tried && !!errors.dueDate} />
          </FormRow>
          <FormRow label="Currency" htmlFor="iv-cur">
            <Select id="iv-cur" value={currency} onChange={(e) => (setCurrency(e.target.value), e.target.value === "INR" && setRate("1"))}>
              {currencies.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </FormRow>
          {currency !== "INR" && (
            <FormRow label={`₹ per 1 ${currency}`} htmlFor="iv-rate" required error={tried ? errors.rate : undefined} hint="Used to show this invoice in ₹ in reports">
              <Input id="iv-rate" type="number" step="0.0001" min={0} value={rate} onChange={(e) => setRate(e.target.value)} invalid={tried && !!errors.rate} />
            </FormRow>
          )}
        </div>

        {entityId && clientId && (
          <div className="rounded-xl border border-line px-3.5 py-2.5 text-[13px]">
            {pos.isLoading ? (
              <span className="text-ink-muted">Checking place of supply…</span>
            ) : pos.isError ? (
              <span className="text-ink-muted">Place of supply couldn’t be checked. It is worked out again when you issue the invoice.</span>
            ) : pos.data ? (
              <>
                <p className="text-ink">
                  <span className="text-ink-muted">Place of supply:</span> {pos.data.label} · <strong>{SUPPLY_TAX[pos.data.supplyType] ?? pos.data.supplyType}</strong>
                </p>
                {noGst && <p className="mt-1 text-ink-muted">This entity has no GSTIN, so no GST is charged on this invoice.</p>}
                {pos.data.problem && (
                  <p role="alert" className="mt-1.5 flex items-start gap-2 text-warning">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {pos.data.problem}
                  </p>
                )}
              </>
            ) : null}
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">Line items</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, { key: Math.max(...ls.map((l) => l.key)) + 1, description: "", sacCode: "998311", quantity: "1", unitPrice: "", gstRate: currency === "INR" ? "18" : "0" }])}>
              <Plus className="h-4 w-4" /> Add line
            </Button>
          </div>
          <div className="space-y-3">
            {lines.map((l, idx) => {
              const base = (num(l.quantity) || 0) * (num(l.unitPrice) || 0);
              return (
                <div key={l.key} className="grid grid-cols-6 gap-2 rounded-2xl border border-line p-3 sm:grid-cols-12">
                  <Input aria-label={`Line ${idx + 1} description`} placeholder="Description of service" value={l.description} onChange={setLine(l.key, "description")} className="col-span-6 sm:col-span-5" invalid={tried && !l.description.trim()} />
                  <Input aria-label={`Line ${idx + 1} SAC`} placeholder="SAC" value={l.sacCode} onChange={setLine(l.key, "sacCode")} className="col-span-2 sm:col-span-2" />
                  <Input aria-label={`Line ${idx + 1} quantity`} type="number" min={0} step="0.01" placeholder="Qty" value={l.quantity} onChange={setLine(l.key, "quantity")} className="col-span-1 sm:col-span-1" invalid={tried && !(num(l.quantity) > 0)} />
                  <Input aria-label={`Line ${idx + 1} rate`} type="number" min={0} step="0.01" placeholder="Rate" value={l.unitPrice} onChange={setLine(l.key, "unitPrice")} className="col-span-3 sm:col-span-2" invalid={tried && !(num(l.unitPrice) >= 0)} />
                  <Select aria-label={`Line ${idx + 1} GST rate`} value={l.gstRate} onChange={setLine(l.key, "gstRate")} className="col-span-3 sm:col-span-1">
                    {GST_RATES.map((g) => (
                      <option key={g} value={g}>
                        {g}%
                      </option>
                    ))}
                  </Select>
                  <div className="col-span-3 flex items-center justify-end gap-1 sm:col-span-1">
                    <span className="truncate text-xs tabular text-ink-muted" title={formatCurrency(base, currency)}>
                      {base ? formatCurrency(base, currency) : ""}
                    </span>
                    {lines.length > 1 && (
                      <button type="button" aria-label={`Remove line ${idx + 1}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-subtle hover:bg-surface-muted hover:text-danger">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {tried && errors.lines && <p className="mt-2 text-xs text-danger">{errors.lines}</p>}
        </div>

        <dl className="ml-auto grid max-w-xs grid-cols-2 gap-y-1 text-sm">
          <dt className="text-ink-muted">Taxable value</dt>
          <dd className="text-right tabular text-ink">{formatCurrency(round2(totals.sub), currency)}</dd>
          {noGst ? null : local ? (
            <>
              <dt className="text-ink-muted">CGST</dt>
              <dd className="text-right tabular text-ink">{formatCurrency(round2(totals.tax / 2), currency)}</dd>
              <dt className="text-ink-muted">SGST</dt>
              <dd className="text-right tabular text-ink">{formatCurrency(round2(totals.tax / 2), currency)}</dd>
            </>
          ) : (
            <>
              <dt className="text-ink-muted">IGST</dt>
              <dd className="text-right tabular text-ink">{formatCurrency(round2(totals.tax), currency)}</dd>
            </>
          )}
          <dt className="border-t border-line pt-1 font-semibold text-ink">Total</dt>
          <dd className="border-t border-line pt-1 text-right font-semibold tabular text-ink">{formatCurrency(round2(totals.sub + totals.tax), currency)}</dd>
        </dl>
      </form>
    </Dialog>
  );
}
