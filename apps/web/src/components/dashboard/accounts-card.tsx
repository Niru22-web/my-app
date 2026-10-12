"use client";

import Link from "next/link";
import { Landmark } from "lucide-react";
import type { AccountsDashboard } from "@/lib/types";
import { formatCurrency, formatNumber } from "@/lib/format";
import { ModuleCard } from "@/components/ui/card";
import { MiniStat, StatRow } from "@/components/ui/stat";
import { ErrorState } from "@/components/ui/empty-state";
import { ApiError } from "@/lib/api";

export function AccountsCard({ data, loading, error, onRetry }: { data?: AccountsDashboard; loading: boolean; error: unknown; onRetry: () => void }) {
  const s = data?.summary;
  const w = data?.widgets;
  if (error instanceof ApiError && error.status === 403) return null;

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
      {error ? (
        <ErrorState onRetry={onRetry} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Receivables" value={formatCurrency(s?.arOutstanding)} loading={loading} />
            <MiniStat label="Payables" value={formatCurrency(s?.apOutstanding)} loading={loading} />
          </div>
          {!loading && s && w && (
            <div className="mt-3">
              <StatRow label="Revenue this month" value={formatCurrency(s.monthlyRevenue)} />
              <StatRow label="Collections this month" value={formatCurrency(s.monthlyCollections)} tone="success" />
              <StatRow label="Overdue 60+ days" value={formatCurrency(w.receivables.invoiceAging.overdueAbove60)} tone="danger" />
              <StatRow label="Pending reimbursements" value={formatCurrency(s.pendingReimbursements)} tone="warning" />
              <StatRow label="Invoices awaiting approval" value={formatNumber(w.operations.pendingInvoiceApprovals)} tone="muted" />
            </div>
          )}
        </>
      )}
    </ModuleCard>
  );
}
