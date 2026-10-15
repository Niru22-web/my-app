"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fullName } from "@/components/management/api";
import type { LedgerEntry, LedgerView } from "./api";

const STEP = 100;

const ACCOUNT_LABEL: Record<string, string> = { CLIENT: "Client", EMPLOYEE: "Employee", VENDOR: "Vendor", GENERAL: "General" };

/** Link to the document a posting came from, when there is a page for it. */
export function ledgerHref(r: LedgerEntry): string | undefined {
  if (!r.referenceId) return undefined;
  if (r.referenceType === "INVOICE" || r.referenceType === "INVOICE_CANCEL") return `/accounts/invoices/${r.referenceId}`;
  return undefined;
}

/**
 * Ledger with an opening-balance row, running balance, totals and a closing balance.
 * Long ledgers show 100 rows at a time.
 */
export function LedgerTable({
  view,
  from,
  mode,
  debitLabel = "Debit",
  creditLabel = "Credit",
  closingNote,
}: {
  view: LedgerView;
  from?: string;
  mode: "client" | "employee" | "general";
  debitLabel?: string;
  creditLabel?: string;
  closingNote?: (closing: number) => ReactNode;
}) {
  const [shown, setShown] = useState(STEP);
  const { rows, opening, closing, totals } = view;
  const extra = mode === "general" ? 2 : mode === "employee" ? 1 : 0;
  const span = 1 + extra + 1;

  return (
    <div className="overflow-x-auto p-5">
      <table className={`w-full text-sm ${mode === "general" ? "min-w-[760px]" : "min-w-[640px]"}`}>
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-subtle">
            <th className="py-2 font-medium">Date</th>
            {mode === "general" && <th className="py-2 font-medium">Account</th>}
            {mode === "general" && <th className="py-2 font-medium">Party</th>}
            {mode === "employee" && <th className="py-2 font-medium">Entity</th>}
            <th className="py-2 font-medium">Description</th>
            <th className="py-2 text-right font-medium">{debitLabel}</th>
            <th className="py-2 text-right font-medium">{creditLabel}</th>
            <th className="py-2 text-right font-medium">Balance</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-line bg-surface-muted/60">
            <td className="py-2 text-ink-muted">{from ? formatDate(from) : "—"}</td>
            <td className="py-2 font-medium text-ink" colSpan={span - 1 + 2}>
              Opening balance{!from && <span className="font-normal text-ink-subtle"> (from the first entry)</span>}
            </td>
            <td className="py-2 text-right font-semibold tabular">{formatCurrency(opening)}</td>
          </tr>
          {rows.slice(0, shown).map((r) => {
            const href = ledgerHref(r);
            return (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="whitespace-nowrap py-2 text-ink-muted">{formatDate(r.date)}</td>
                {mode === "general" && (
                  <td className="py-2">
                    <Badge>{ACCOUNT_LABEL[r.type] ?? r.type}</Badge>
                  </td>
                )}
                {mode === "general" && <td className="max-w-[12rem] truncate py-2 text-ink-muted">{r.client?.name ?? (r.employee ? fullName(r.employee) : r.entity?.name ?? "—")}</td>}
                {mode === "employee" && <td className="py-2 text-ink-muted">{r.entity?.name ?? "—"}</td>}
                <td className="max-w-sm py-2 text-ink">
                  {href ? (
                    <Link href={href} className="block truncate font-medium hover:text-brand">
                      {r.description}
                    </Link>
                  ) : (
                    <span className="block truncate">{r.description}</span>
                  )}
                </td>
                <td className="py-2 text-right tabular">{r.debit ? formatCurrency(r.debit) : ""}</td>
                <td className="py-2 text-right tabular text-success">{r.credit ? formatCurrency(r.credit) : ""}</td>
                <td className="py-2 text-right font-medium tabular">{formatCurrency(r.runningBalance ?? r.balance)}</td>
              </tr>
            );
          })}
          {!rows.length && (
            <tr>
              <td colSpan={span + 3} className="py-8 text-center text-ink-subtle">
                Nothing in this period
              </td>
            </tr>
          )}
          {rows.length > shown && (
            <tr>
              <td colSpan={span + 3} className="py-3 text-center">
                <Button variant="secondary" size="sm" onClick={() => setShown((s) => s + STEP)}>
                  Show {Math.min(STEP, rows.length - shown)} more
                </Button>
                <span className="ml-3 text-xs text-ink-subtle">
                  {shown} of {rows.length} entries shown
                </span>
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-line font-semibold">
            <td className="pt-2" colSpan={span}>
              Totals for the period
            </td>
            <td className="pt-2 text-right tabular">{formatCurrency(totals.debit)}</td>
            <td className="pt-2 text-right tabular">{formatCurrency(totals.credit)}</td>
            <td />
          </tr>
          <tr className="font-semibold">
            <td className="pt-1" colSpan={span + 2}>
              Closing balance {closingNote?.(closing)}
            </td>
            <td className="pt-1 text-right tabular">{formatCurrency(closing)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
