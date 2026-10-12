"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, Pencil, Printer, Send, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { today } from "@/lib/dates";
import { formatCurrency, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm";
import { ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { STATUS_LABEL, STATUS_TONE, allocated, daysOverdue, outstanding, toInr, useAccountsMutations, useInvoice } from "@/components/accounts/api";
import { InvoiceEditor } from "@/components/accounts/invoice-editor";

type Pending = "send" | "cancel" | "delete" | null;

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
  const owed = outstanding(inv);
  const late = owed > 0 ? daysOverdue(inv, today()) : 0;
  const draft = inv.status === "DRAFT";
  const cancellable = ["SENT", "OVERDUE"].includes(inv.status) && paid === 0;
  const tax = inv.items.reduce((t, it) => ({ cgst: t.cgst + (it.cgst ?? 0), sgst: t.sgst + (it.sgst ?? 0), igst: t.igst + (it.igst ?? 0) }), { cgst: 0, sgst: 0, igst: 0 });
  const err = (t: string) => (e: unknown) => toast.error(t, e instanceof ApiError ? e.message : undefined);

  const act = () => {
    if (pending === "send") m.setStatus.mutate({ id, status: "SENT" }, { onSuccess: () => (toast.success("Marked as sent", "It now counts as billed and receivable."), setPending(null)), onError: err("Couldn’t update") });
    if (pending === "cancel") m.setStatus.mutate({ id, status: "CANCELLED" }, { onSuccess: () => (toast.success("Invoice cancelled"), setPending(null)), onError: err("Couldn’t cancel") });
    if (pending === "delete") m.deleteDraft.mutate(id, { onSuccess: () => (toast.success("Draft deleted"), router.replace("/accounts/invoices")), onError: (e) => (err("Couldn’t delete")(e), setPending(null)) });
  };

  return (
    <div className="space-y-6">
      <Link href="/accounts/invoices" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-brand">
        <ArrowLeft className="h-4 w-4" /> Invoices
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-ink">{inv.invoiceNumber}</h1>
            <Badge tone={STATUS_TONE[inv.status] ?? "neutral"}>{STATUS_LABEL[inv.status] ?? inv.status}</Badge>
            {late > 0 && <Badge tone="danger">{late} days late</Badge>}
          </div>
          <p className="mt-1 text-[15px] text-ink-muted">
            {inv.client?.name} · {formatDate(inv.issueDate)}
            {inv.dueDate && ` · due ${formatDate(inv.dueDate)}`}
          </p>
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
              <Button onClick={() => setPending("send")}>
                <Send className="h-4 w-4" /> Mark as sent
              </Button>
              <Button variant="ghost" className="text-danger" disabled={paid > 0} title={paid > 0 ? "A receipt was applied to this draft" : undefined} onClick={() => setPending("delete")}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            </>
          )}
          {cancellable && (
            <Button variant="ghost" className="text-danger" onClick={() => setPending("cancel")}>
              <Ban className="h-4 w-4" /> Cancel invoice
            </Button>
          )}
        </div>
      </div>

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
          </div>
          <div className="overflow-x-auto px-5 py-4">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-subtle">
                  <th className="py-2 font-medium">Description</th>
                  <th className="py-2 font-medium">SAC</th>
                  <th className="py-2 text-right font-medium">Qty</th>
                  <th className="py-2 text-right font-medium">Rate</th>
                  <th className="py-2 text-right font-medium">GST</th>
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
                    <td className="py-2.5 text-right tabular text-ink-muted">{it.gstRate ?? 0}%</td>
                    <td className="py-2.5 text-right font-medium tabular text-ink">{formatCurrency(it.total, inv.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="ml-auto mt-4 grid max-w-xs grid-cols-2 gap-y-1 text-sm">
              <dt className="text-ink-muted">Taxable value</dt>
              <dd className="text-right tabular">{formatCurrency(inv.subTotal, inv.currency)}</dd>
              {tax.igst > 0 ? (
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

        <Card className="self-start">
          <CardHeader title="Payment" />
          <div className="space-y-3 p-5 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-muted">Received</span>
              <span className="font-semibold tabular text-success">{formatCurrency(inv.status === "PAID" && paid === 0 ? inv.totalAmount : paid, inv.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">Outstanding</span>
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
            {inv.status === "PAID" && paid === 0 && <p className="text-xs text-ink-subtle">Marked paid by bank matching in the current portal — no receipt was recorded.</p>}
            {owed > 0 && (
              <Link href={`/accounts/receipts?client=${inv.clientId}`} className="block text-[13px] font-semibold text-brand hover:underline">
                Record a receipt
              </Link>
            )}
          </div>
        </Card>
      </div>

      {editing && <InvoiceEditor invoice={inv} onClose={() => setEditing(false)} />}
      <ConfirmDialog
        open={!!pending}
        onClose={() => setPending(null)}
        tone={pending === "send" ? "primary" : "danger"}
        title={pending === "send" ? `Mark ${inv.invoiceNumber} as sent?` : pending === "cancel" ? `Cancel ${inv.invoiceNumber}?` : `Delete draft ${inv.invoiceNumber}?`}
        description={
          pending === "send"
            ? "It will count as billed and receivable, and can no longer be edited. Email the PDF to the client yourself — the portal doesn’t send invoices by email yet."
            : pending === "cancel"
              ? "It stays on record as cancelled and drops out of receivables and GST. This can’t be undone."
              : "The draft is removed permanently."
        }
        confirmLabel={pending === "send" ? "Mark as sent" : pending === "cancel" ? "Cancel invoice" : "Delete"}
        busy={m.setStatus.isPending || m.deleteDraft.isPending}
        onConfirm={act}
      />
    </div>
  );
}
