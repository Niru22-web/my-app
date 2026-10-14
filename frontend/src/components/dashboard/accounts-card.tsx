"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Landmark } from "lucide-react";
import { today } from "@/lib/dates";
import { formatCurrency, plural } from "@/lib/format";
import { ModuleCard } from "@/components/ui/card";
import { MiniStat, StatRow } from "@/components/ui/stat";
import { ErrorState } from "@/components/ui/empty-state";
import { summarise, useInvoices, useReceipts } from "@/components/accounts/api";

/**
 * Accounts snapshot computed from invoices and receipts — not GET /accounts/dashboard, whose totals
 * count drafts, mix currencies and age by issue date (BACKEND_FINDINGS AC8).
 */
export function AccountsCard() {
  const inv = useInvoices();
  const rec = useReceipts();
  const now = today();
  const s = useMemo(() => summarise(inv.data ?? [], rec.data ?? [], now), [inv.data, rec.data, now]);
  const loading = inv.isLoading || rec.isLoading;
  const late = s.buckets.slice(3).reduce((t, b) => t + b.value, 0);

  return (
    <ModuleCard
      title="Accounts & Finance"
      icon={Landmark}
      actions={
        <Link href="/accounts/dashboard" className="text-[13px] font-semibold text-white/85 hover:text-white dark:text-brand">
          Open
        </Link>
      }
    >
      {inv.isError || rec.isError ? (
        <ErrorState onRetry={() => (inv.refetch(), rec.refetch())} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="To be collected" value={formatCurrency(s.receivable)} loading={loading} />
            <MiniStat label="Overdue" value={formatCurrency(s.overdue)} loading={loading} />
          </div>
          {!loading && (
            <div className="mt-3">
              <StatRow label="Billed this month" value={formatCurrency(s.revenueMonth)} />
              <StatRow label="Collected this month" value={formatCurrency(s.collectedMonth)} tone="success" />
              <StatRow label="More than 60 days late" value={formatCurrency(late)} tone={late ? "danger" : "muted"} />
              <StatRow label="Drafts not yet sent" value={s.drafts ? plural(s.drafts, "invoice") : "None"} tone="muted" />
            </div>
          )}
        </>
      )}
    </ModuleCard>
  );
}
