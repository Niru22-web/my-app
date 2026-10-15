"use client";

import { use } from "react";
import { Printer } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { amountInWords, canUseAccounts, useInvoice, type BankDetails } from "@/components/accounts/api";

/** Printable invoice (A4). Use the browser's Print → Save as PDF. */
export default function PrintInvoice({ params }: PageProps<"/print/invoice/[id]">) {
  const { id } = use(params);
  const { user, status } = useAuth();
  const allowed = canUseAccounts(user);
  const q = useInvoice(id);
  const inv = q.data;

  if (status === "loading" || (allowed && q.isLoading)) return <Skeleton className="m-8 h-[80vh]" />;
  if (!allowed || q.isError || !inv) return <p className="p-8 text-sm text-ink-muted">This invoice isn’t available. Sign in with an account that has Accounts access and try again.</p>;

  const bank = (inv.entity?.bankDetails ?? {}) as BankDetails;
  const tax = inv.items.reduce((t, it) => ({ cgst: t.cgst + (it.cgst ?? 0), sgst: t.sgst + (it.sgst ?? 0), igst: t.igst + (it.igst ?? 0) }), { cgst: 0, sgst: 0, igst: 0 });
  const pos = inv.placeOfSupply;
  const noGst = pos?.supplyType === "NO_GST";
  const local = pos ? pos.supplyType === "INTRA" : tax.igst === 0;
  const draft = inv.status === "DRAFT";
  const cur = inv.currency;

  return (
    <div className="min-h-screen bg-surface-muted py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-4 print:hidden">
        <p className="text-sm text-ink-muted">{draft ? "Draft preview — issue it before sharing." : "Use Print → Save as PDF, then email the PDF to the client."}</p>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print / Save PDF
        </Button>
      </div>

      <article className="relative mx-auto max-w-[210mm] bg-white p-[14mm] text-[12px] leading-relaxed text-[#1c2433] shadow-sm print:shadow-none">
        {draft && <p className="pointer-events-none absolute right-[14mm] top-[14mm] rotate-6 rounded border-2 border-[#8e8e93] px-3 py-1 text-lg font-bold tracking-widest text-[#8e8e93]">DRAFT</p>}
        {inv.status === "CANCELLED" && <p className="pointer-events-none absolute right-[14mm] top-[14mm] rotate-6 rounded border-2 border-red-600 px-3 py-1 text-lg font-bold tracking-widest text-red-600">CANCELLED</p>}

        <header className="flex items-start justify-between gap-6 border-b-2 border-[#003887] pb-4">
          <div>
            <Logo className="w-[150px]" />
            <p className="mt-3 text-[14px] font-bold">{inv.entity?.legalName || inv.entity?.name}</p>
            {inv.entity?.address && <p className="whitespace-pre-line text-[#4a5262]">{inv.entity.address}</p>}
            <p className="text-[#4a5262]">
              {[inv.entity?.gstin && `GSTIN ${inv.entity.gstin}`, inv.entity?.pan && `PAN ${inv.entity.pan}`, inv.entity?.msmeReg && `MSME ${inv.entity.msmeReg}`].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[20px] font-bold tracking-wide text-[#003887]">{noGst ? "INVOICE" : "TAX INVOICE"}</p>
            <table className="ml-auto mt-2 text-left">
              <tbody>
                <tr><td className="pr-3 text-[#4a5262]">Invoice no.</td><td className="font-semibold">{draft ? "Draft — not numbered yet" : inv.invoiceNumber}</td></tr>
                <tr><td className="pr-3 text-[#4a5262]">Date</td><td>{formatDate(inv.issueDate)}</td></tr>
                {inv.dueDate && <tr><td className="pr-3 text-[#4a5262]">Due date</td><td>{formatDate(inv.dueDate)}</td></tr>}
                {inv.udin && <tr><td className="pr-3 text-[#4a5262]">UDIN</td><td>{inv.udin}</td></tr>}
              </tbody>
            </table>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-6 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8e8e93]">Bill to</p>
            <p className="mt-1 text-[13px] font-bold">{inv.client?.name}</p>
            {inv.client?.address && <p className="whitespace-pre-line text-[#4a5262]">{inv.client.address}</p>}
            {inv.client?.gstin && <p className="text-[#4a5262]">GSTIN {inv.client.gstin}</p>}
          </div>
          <div className="text-right">
            {inv.project && (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8e8e93]">Engagement</p>
                <p className="mt-1 font-semibold">{inv.project.name}</p>
              </>
            )}
            {pos && !noGst && <p className="mt-1 text-[#4a5262]">Place of supply: {pos.label}</p>}
          </div>
        </section>

        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#003887] text-left text-white">
              <th className="px-2 py-1.5 font-semibold">#</th>
              <th className="px-2 py-1.5 font-semibold">Description</th>
              <th className="px-2 py-1.5 font-semibold">SAC</th>
              <th className="px-2 py-1.5 text-right font-semibold">Qty</th>
              <th className="px-2 py-1.5 text-right font-semibold">Rate</th>
              {!noGst && <th className="px-2 py-1.5 text-right font-semibold">GST %</th>}
              <th className="px-2 py-1.5 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((it, k) => (
              <tr key={it.id ?? k} className="border-b border-[#e3e6ec] align-top">
                <td className="px-2 py-2">{k + 1}</td>
                <td className="px-2 py-2">{it.description}</td>
                <td className="px-2 py-2">{it.sacCode}</td>
                <td className="px-2 py-2 text-right">{it.quantity}</td>
                <td className="px-2 py-2 text-right">{formatCurrency(it.unitPrice, cur)}</td>
                {!noGst && <td className="px-2 py-2 text-right">{it.gstRate ?? 0}</td>}
                <td className="px-2 py-2 text-right">{formatCurrency(it.total, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="mt-4 flex justify-between gap-8">
          <div className="max-w-[55%]">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8e8e93]">Amount in words</p>
            <p className="mt-1 font-medium">{cur === "INR" ? amountInWords(inv.totalAmount) : `${cur} ${formatCurrency(inv.totalAmount, cur)}`}</p>
            {(bank.bankName || bank.accountNo) && (
              <div className="mt-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8e8e93]">Bank details</p>
                <p className="mt-1 text-[#4a5262]">
                  {[bank.accountName && `A/c name: ${bank.accountName}`, bank.bankName && `Bank: ${bank.bankName}`, bank.accountNo && `A/c no: ${bank.accountNo}`, bank.ifsc && `IFSC: ${bank.ifsc}`, bank.swift && `SWIFT: ${bank.swift}`]
                    .filter(Boolean)
                    .map((x) => (
                      <span key={x as string} className="block">
                        {x}
                      </span>
                    ))}
                </p>
              </div>
            )}
          </div>
          <table className="min-w-[45%] self-start">
            <tbody>
              <tr><td className="py-0.5 text-[#4a5262]">Taxable value</td><td className="text-right">{formatCurrency(inv.subTotal, cur)}</td></tr>
              {noGst ? null : local ? (
                <>
                  <tr><td className="py-0.5 text-[#4a5262]">CGST</td><td className="text-right">{formatCurrency(tax.cgst, cur)}</td></tr>
                  <tr><td className="py-0.5 text-[#4a5262]">SGST</td><td className="text-right">{formatCurrency(tax.sgst, cur)}</td></tr>
                </>
              ) : (
                <tr><td className="py-0.5 text-[#4a5262]">IGST</td><td className="text-right">{formatCurrency(tax.igst, cur)}</td></tr>
              )}
              <tr className="border-t-2 border-[#003887] text-[14px] font-bold"><td className="pt-1">Total</td><td className="pt-1 text-right">{formatCurrency(inv.totalAmount, cur)}</td></tr>
            </tbody>
          </table>
        </section>

        <footer className="mt-12 flex items-end justify-between">
          <p className="text-[10px] text-[#8e8e93]">This is a computer-generated invoice.</p>
          <div className="text-right">
            <p className="font-semibold">For {inv.entity?.legalName || inv.entity?.name}</p>
            <p className="mt-10 border-t border-[#8e8e93] pt-1 text-[#4a5262]">Authorised signatory</p>
          </div>
        </footer>
      </article>
    </div>
  );
}
