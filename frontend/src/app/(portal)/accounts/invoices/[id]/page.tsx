"use client";

import { use, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Ban, BadgeCheck, FileMinus2, HandCoins, Pencil, Printer, Send, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { today, workDate } from "@/lib/dates";
import { formatCurrency, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { FormRow, Input } from "@/components/ui/inputs";
import { ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { STATUS_LABEL, STATUS_TONE, allocated, daysOverdue, isPayable, outstanding, round2, toInr, useAccountsMutations, useInvoice, type Invoice } from "@/components/accounts/api";
import { InvoiceEditor } from "@/components/accounts/invoice-editor";
import { ReasonDialog } from "@/components/accounts/reason-dialog";

type Pending = "issue" | "cancel" | "delete" | "credit" | "udin" | null;
const UDIN = /^\d{8}[A-Z]{6}\d{4}$/;

export default function InvoiceDetail({ params }: PageProps<"/accounts/invoices/[id]">) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const q = useInvoice(id);
  const m = useAccountsMutations();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const inv = q.data;

  if (q.isError)
    return (
      <Card>
        <ErrorState message="This invoice couldn’t be loaded." onRetry={() => q.refetch()} />
      </Card>
    );
  if (q.isLoading || !inv) return <Skeleton className="h-96" />;

  const paid = allocated(inv);
  const credited = inv.creditedAmount ?? 0;
  const owed = outstanding(inv);
  const late = owed > 0 ? daysOverdue(inv, today()) : 0;
  const draft = inv.status === "DRAFT";
  const cancelled = inv.status === "CANCELLED";
  const issued = !draft && !cancelled;
  const creditable = round2(inv.totalAmount - credited);
  const cancelBlock = paid > 0 ? "Money has been received against this invoice — reverse the receipt first, or raise a credit note." : credited > 0 ? "A credit note exists on this invoice — raise a credit note for the rest instead." : "";
  const supply = inv.placeOfSupply;
  const noGst = supply?.supplyType === "NO_GST";
  const tax = inv.items.reduce((t, it) => ({ cgst: t.cgst + (it.cgst ?? 0), sgst: t.sgst + (it.sgst ?? 0), igst: t.igst + (it.igst ?? 0) }), { cgst: 0, sgst: 0, igst: 0 });
  const interState = supply ? supply.supplyType === "INTER" || supply.supplyType === "EXPORT" : tax.igst > 0;
  const err = (t: string) => (e: unknown) => toast.error(t, e instanceof ApiError ? e.message : undefined);
  const title = draft ? "Draft invoice" : inv.invoiceNumber;

  return (
    <div className="space-y-6">
      <Link href="/accounts/invoices" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-brand">
        <ArrowLeft className="h-4 w-4" /> Invoices
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
            <Badge tone={STATUS_TONE[inv.status] ?? "neutral"}>{STATUS_LABEL[inv.status] ?? inv.status}</Badge>
            {late > 0 && <Badge tone="danger">{late} days late</Badge>}
          </div>
          <p className="mt-1 text-[15px] text-ink-muted">
            {inv.client?.name} · {formatDate(inv.issueDate)}
            {inv.dueDate && ` · due ${formatDate(inv.dueDate)}`}
          </p>
          {draft && <p className="mt-0.5 text-xs text-ink-subtle">The invoice number is given when you issue it.</p>}
          {inv.issuedAt && <p className="mt-0.5 text-xs text-ink-subtle">Issued on {formatDate(inv.issuedAt)}</p>}
          {cancelled && inv.cancelReason && <p className="mt-0.5 text-xs text-ink-subtle">Cancelled: {inv.cancelReason}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/print/invoice/${id}`} target="_blank" rel="noreferrer">
            <Button variant="secondary">
              <Printer className="h-4 w-4" /> {draft ? "Preview" : "Print / PDF"}
            </Button>
          </a>
          {draft && (
            <>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
              <Button onClick={() => setPending("issue")}>
                <Send className="h-4 w-4" /> Issue
              </Button>
              <Button variant="ghost" className="text-danger" onClick={() => setPending("delete")}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            </>
          )}
          {issued && (
            <>
              {isPayable(inv) && owed > 0 && (
                <Link href={`/accounts/receipts?client=${inv.clientId}&invoice=${inv.id}`}>
                  <Button>
                    <HandCoins className="h-4 w-4" /> Record receipt
                  </Button>
                </Link>
              )}
              <Button variant="secondary" disabled={creditable <= 0} title={creditable <= 0 ? "Already fully credited" : undefined} onClick={() => setPending("credit")}>
                <FileMinus2 className="h-4 w-4" /> Credit note
              </Button>
              {!inv.udin && (
                <Button variant="secondary" onClick={() => setPending("udin")}>
                  <BadgeCheck className="h-4 w-4" /> Add UDIN
                </Button>
              )}
              <Button variant="ghost" className="text-danger" disabled={!!cancelBlock} title={cancelBlock || undefined} onClick={() => setPending("cancel")}>
                <Ban className="h-4 w-4" /> Cancel invoice
              </Button>
            </>
          )}
        </div>
      </div>
      {issued && cancelBlock && <p className="-mt-3 text-xs text-ink-subtle lg:text-right">Can’t cancel: {cancelBlock}</p>}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="grid gap-6 border-b border-line p-5 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Billed by</p>
              <p className="mt-1 font-semibold text-ink">{inv.entity?.legalName || inv.entity?.name}</p>
              {inv.entity?.gstin && <p className="text-[13px] text-ink-muted">GSTIN {inv.entity.gstin}</p>}
              {inv.entity?.address && <p className="whitespace-pre-line text-[13px] text-ink-muted">{inv.entity.address}</p>}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Billed to</p>
              <p className="mt-1 font-semibold text-ink">{inv.client?.name}</p>
              {inv.client?.gstin && <p className="text-[13px] text-ink-muted">GSTIN {inv.client.gstin}</p>}
              {inv.client?.address && <p className="whitespace-pre-line text-[13px] text-ink-muted">{inv.client.address}</p>}
              {inv.project && <p className="mt-1 text-[13px] text-ink-muted">Project: {inv.project.name}</p>}
              {inv.udin && <p className="text-[13px] text-ink-muted">UDIN {inv.udin}</p>}
            </div>
            {supply && (
              <div className="sm:col-span-2">
                <p className="text-[13px] text-ink-muted">
                  Place of supply: <span className="text-ink">{supply.label}</span>
                </p>
                {supply.problem && (
                  <p className="mt-1 flex items-start gap-2 text-[13px] text-warning">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {supply.problem}
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="overflow-x-auto px-5 py-4">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-subtle">
                  <th className="py-2 font-medium">Description</th>
                  <th className="py-2 font-medium">SAC</th>
                  <th className="py-2 text-right font-medium">Qty</th>
                  <th className="py-2 text-right font-medium">Rate</th>
                  {!noGst && <th className="py-2 text-right font-medium">GST</th>}
                  <th className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {inv.items.map((it, k) => (
                  <tr key={it.id ?? k} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-3 text-ink">{it.description}</td>
                    <td className="py-2.5 text-ink-muted">{it.sacCode}</td>
                    <td className="py-2.5 text-right tabular">{it.quantity}</td>
                    <td className="py-2.5 text-right tabular">{formatCurrency(it.unitPrice, inv.currency)}</td>
                    {!noGst && <td className="py-2.5 text-right tabular text-ink-muted">{it.gstRate ?? 0}%</td>}
                    <td className="py-2.5 text-right font-medium tabular text-ink">{formatCurrency(it.total, inv.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="ml-auto mt-4 grid max-w-xs grid-cols-2 gap-y-1 text-sm">
              <dt className="text-ink-muted">Taxable value</dt>
              <dd className="text-right tabular">{formatCurrency(inv.subTotal, inv.currency)}</dd>
              {noGst ? null : interState ? (
                <>
                  <dt className="text-ink-muted">IGST</dt>
                  <dd className="text-right tabular">{formatCurrency(tax.igst, inv.currency)}</dd>
                </>
              ) : (
                <>
                  <dt className="text-ink-muted">CGST</dt>
                  <dd className="text-right tabular">{formatCurrency(tax.cgst, inv.currency)}</dd>
                  <dt className="text-ink-muted">SGST</dt>
                  <dd className="text-right tabular">{formatCurrency(tax.sgst, inv.currency)}</dd>
                </>
              )}
              <dt className="border-t border-line pt-1 font-semibold text-ink">Total</dt>
              <dd className="border-t border-line pt-1 text-right font-semibold tabular text-ink">{formatCurrency(inv.totalAmount, inv.currency)}</dd>
              {inv.currency !== "INR" && (
                <>
                  <dt className="text-xs text-ink-subtle">In ₹ at {inv.exchangeRate}</dt>
                  <dd className="text-right text-xs tabular text-ink-subtle">{formatCurrency(toInr(inv.totalAmount, inv.exchangeRate))}</dd>
                </>
              )}
            </dl>
          </div>
        </Card>

        <div className="space-y-6 self-start">
          <Card>
            <CardHeader title="Payment" />
            <div className="space-y-3 p-5 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-muted">Received</span>
                <span className="font-semibold tabular text-success">{formatCurrency(paid, inv.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Credited</span>
                <span className="font-semibold tabular text-ink">{formatCurrency(credited, inv.currency)}</span>
              </div>
              <div className="flex justify-between border-t border-line pt-3">
                <span className="text-ink-muted">Balance due</span>
                <span className={`font-semibold tabular ${owed ? "text-ink" : "text-ink-subtle"}`}>{formatCurrency(owed, inv.currency)}</span>
              </div>
              {(inv.receiptAllocations ?? []).length > 0 && (
                <ul className="space-y-1.5 border-t border-line pt-3 text-[13px]">
                  {inv.receiptAllocations!.map((a) => (
                    <li key={a.id} className="flex justify-between gap-2">
                      <span className="text-ink-muted">
                        {a.receipt?.receiptNumber ?? "Receipt"}
                        {a.receipt?.receiptDate ? ` · ${formatDate(a.receipt.receiptDate)}` : ""}
                      </span>
                      <span className="tabular text-ink">{formatCurrency(a.amountAllocated, inv.currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {draft && <p className="text-xs text-ink-subtle">Issue the invoice before recording money against it.</p>}
              {issued && <p className="text-xs text-ink-subtle">Download the PDF and email it to the client.</p>}
            </div>
          </Card>

          {(inv.creditNotes ?? []).length > 0 && (
            <Card>
              <CardHeader title="Credit notes" />
              <ul className="divide-y divide-line text-[13px]">
                {inv.creditNotes!.map((c) => (
                  <li key={c.id} className="px-5 py-3">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium text-ink">{c.number}</span>
                      <span className="font-semibold tabular text-ink">{formatCurrency(c.total, inv.currency)}</span>
                    </div>
                    <p className="text-ink-muted">
                      {formatDate(c.date)} · {c.reason}
                      {c.status !== "ISSUED" ? ` · ${c.status.toLowerCase()}` : ""}
                    </p>
                    <p className="text-xs text-ink-subtle">
                      Taxable {formatCurrency(c.subTotal, inv.currency)} + GST {formatCurrency(c.taxAmount, inv.currency)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {editing && <InvoiceEditor invoice={inv} onClose={() => setEditing(false)} />}
      {pending === "issue" && <IssueDialog inv={inv} onClose={() => setPending(null)} />}
      {pending === "credit" && <CreditNoteDialog inv={inv} onClose={() => setPending(null)} />}
      {pending === "udin" && <UdinDialog inv={inv} onClose={() => setPending(null)} />}
      {pending === "cancel" && (
        <ReasonDialog
          title={`Cancel ${inv.invoiceNumber}?`}
          description="It stays on record as cancelled (the number stays used) and drops out of receivables and GST. This can’t be undone."
          placeholder="e.g. Raised in error"
          confirmLabel="Cancel invoice"
          busy={m.cancelInvoice.isPending}
          onClose={() => setPending(null)}
          onConfirm={(reason) =>
            m.cancelInvoice.mutate({ id, reason }, { onSuccess: () => (toast.success("Invoice cancelled"), setPending(null)), onError: err("Couldn’t cancel") })
          }
        />
      )}
      <ConfirmDialog
        open={pending === "delete"}
        onClose={() => setPending(null)}
        tone="danger"
        title="Delete this draft?"
        description="The draft is removed permanently. It was never numbered, so nothing else changes."
        confirmLabel="Delete"
        busy={m.deleteDraft.isPending}
        onConfirm={() => m.deleteDraft.mutate(id, { onSuccess: () => (toast.success("Draft deleted"), router.replace("/accounts/invoices")), onError: (e) => (err("Couldn’t delete")(e), setPending(null)) })}
      />
    </div>
  );
}

function IssueDialog({ inv, onClose }: { inv: Invoice; onClose: () => void }) {
  const toast = useToast();
  const m = useAccountsMutations();
  const now = today();
  const [date, setDate] = useState(now);
  const error = !date ? "Choose the invoice date." : date > now ? "Can’t be in the future." : "";

  function submit(e: FormEvent) {
    e.preventDefault();
    if (error) return;
    m.issueInvoice.mutate(
      { id: inv.id, issueDate: date },
      {
        onSuccess: (res) => (toast.success(res.data?.invoiceNumber ? `Invoice ${res.data.invoiceNumber} issued` : "Invoice issued","Download the PDF and email it to the client."), onClose()),
        onError: (e) => toast.error("Couldn’t issue the invoice", e instanceof ApiError ? e.message : undefined),
      },
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title="Issue this invoice?"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" form="issue-form" loading={m.issueInvoice.isPending}>
            Issue invoice
          </Button>
        </>
      }
    >
      <form id="issue-form" onSubmit={submit} noValidate className="space-y-4">
        <p className="text-sm text-ink-muted">
          It gets the next invoice number, is locked from editing, and counts as billed and receivable. Any advance the client has paid is applied to it.
        </p>
        <FormRow label="Invoice date" htmlFor="issue-date" required error={error || undefined} hint={workDate(inv.issueDate) !== date ? `The draft was dated ${formatDate(inv.issueDate)}.` : undefined}>
          <Input id="issue-date" type="date" max={now} value={date} onChange={(e) => setDate(e.target.value)} invalid={!!error} />
        </FormRow>
        {inv.placeOfSupply?.problem && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-[13px] text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {inv.placeOfSupply.problem}
          </p>
        )}
      </form>
    </Dialog>
  );
}

function CreditNoteDialog({ inv, onClose }: { inv: Invoice; onClose: () => void }) {
  const toast = useToast();
  const m = useAccountsMutations();
  const now = today();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(now);
  const [tried, setTried] = useState(false);

  const rate = inv.subTotal > 0 ? inv.taxAmount / inv.subTotal : 0;
  const maxTotal = round2(inv.totalAmount - (inv.creditedAmount ?? 0));
  const maxTaxable = round2(maxTotal / (1 + rate));
  const taxable = round2(Number(amount) || 0);
  const gst = round2(taxable * rate);
  const total = round2(taxable + gst);
  const supply = inv.placeOfSupply?.supplyType;
  const intra = supply ? supply === "INTRA" : !inv.items.some((i) => (i.igst ?? 0) > 0);
  const issueDay = workDate(inv.issueDate);
  const errors = {
    amount: !(taxable > 0) ? "Enter the taxable amount to credit." : total > maxTotal + 0.01 ? `At most ${formatCurrency(maxTaxable, inv.currency)} (before GST) can still be credited.` : "",
    reason: !reason.trim() ? "Give a reason." : "",
    date: !date ? "Choose a date." : date < issueDay ? "Can’t be before the invoice date." : date > now ? "Can’t be in the future." : "",
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.values(errors).some(Boolean)) return;
    m.createCreditNote.mutate(
      { id: inv.id, amount: taxable, reason: reason.trim(), date },
      {
        onSuccess: (res) => (toast.success(res.data?.number ? `Credit note ${res.data.number} raised` : "Credit note raised"), onClose()),
        onError: (e) => toast.error("Couldn’t raise the credit note", e instanceof ApiError ? e.message : undefined),
      },
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Credit note on ${inv.invoiceNumber}`}
      description="Reduces what the client owes. GST is reversed at this invoice’s own rate."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" form="cn-form" loading={m.createCreditNote.isPending}>
            Raise credit note
          </Button>
        </>
      }
    >
      <form id="cn-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <FormRow label={`Taxable amount (${inv.currency})`} htmlFor="cn-amt" required error={tried ? errors.amount || undefined : undefined} hint={`Before GST · up to ${formatCurrency(maxTaxable, inv.currency)}`}>
          <Input id="cn-amt" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} invalid={tried && !!errors.amount} />
        </FormRow>
        <FormRow label="Date" htmlFor="cn-date" required error={tried ? errors.date || undefined : undefined}>
          <Input id="cn-date" type="date" min={issueDay} max={now} value={date} onChange={(e) => setDate(e.target.value)} invalid={tried && !!errors.date} />
        </FormRow>
        <FormRow label="Reason" htmlFor="cn-reason" required error={tried ? errors.reason || undefined : undefined} className="sm:col-span-2">
          <Input id="cn-reason" maxLength={500} value={reason} placeholder="e.g. Fee reduced after discussion" onChange={(e) => setReason(e.target.value)} invalid={tried && !!errors.reason} />
        </FormRow>
        <dl className="grid grid-cols-2 gap-y-1 rounded-xl border border-line p-3 text-sm sm:col-span-2">
          <dt className="text-ink-muted">Taxable value</dt>
          <dd className="text-right tabular">{formatCurrency(taxable, inv.currency)}</dd>
          {rate > 0 &&
            (intra ? (
              <>
                <dt className="text-ink-muted">CGST</dt>
                <dd className="text-right tabular">{formatCurrency(round2(gst / 2), inv.currency)}</dd>
                <dt className="text-ink-muted">SGST</dt>
                <dd className="text-right tabular">{formatCurrency(round2(gst - round2(gst / 2)), inv.currency)}</dd>
              </>
            ) : (
              <>
                <dt className="text-ink-muted">IGST</dt>
                <dd className="text-right tabular">{formatCurrency(gst, inv.currency)}</dd>
              </>
            ))}
          <dt className="border-t border-line pt-1 font-semibold text-ink">Credit note total</dt>
          <dd className="border-t border-line pt-1 text-right font-semibold tabular text-ink">{formatCurrency(total, inv.currency)}</dd>
        </dl>
      </form>
    </Dialog>
  );
}

function UdinDialog({ inv, onClose }: { inv: Invoice; onClose: () => void }) {
  const toast = useToast();
  const m = useAccountsMutations();
  const [udin, setUdin] = useState("");
  const [tried, setTried] = useState(false);
  const v = udin.trim().toUpperCase();
  const error = !UDIN.test(v) ? "UDIN is 18 characters: 8 digits, 6 letters, 4 digits." : "";

  function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (error) return;
    m.setUdin.mutate(
      { id: inv.id, udin: v },
      { onSuccess: () => (toast.success("UDIN added"), onClose()), onError: (e) => toast.error("Couldn’t add the UDIN", e instanceof ApiError ? e.message : undefined) },
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title="Add UDIN"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" form="udin-form" loading={m.setUdin.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id="udin-form" onSubmit={submit} noValidate>
        <FormRow label="UDIN" htmlFor="udin-input" required error={tried ? error || undefined : undefined} hint="Printed on the invoice. Nothing else on the invoice changes.">
          <Input id="udin-input" value={udin} maxLength={18} onChange={(e) => setUdin(e.target.value)} className="uppercase font-mono" invalid={tried && !!error} />
        </FormRow>
      </form>
    </Dialog>
  );
}
