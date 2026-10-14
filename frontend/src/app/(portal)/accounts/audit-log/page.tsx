"use client";

import { useState } from "react";
import { Download, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { today } from "@/lib/dates";
import { formatDate, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormRow, Input, Select } from "@/components/ui/inputs";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadCsv } from "@/components/claims/claim-tabs";
import { useAccountsAuditLog, type AuditLogEntry } from "@/components/accounts/api";

const ACTION_TONE: Record<string, "success" | "brand" | "danger" | "warning" | "neutral"> = {
  CREATE: "success",
  UPDATE: "brand",
  DELETE: "danger",
  APPROVE: "success",
  IMPORT: "warning",
};

function describeAudit(log: AuditLogEntry): string {
  if (log.description) return log.description;
  const tbl = log.portal || log.tableName || "Record";
  const act = (log.action || "").toUpperCase();
  if (act === "CREATE") return `Created ${tbl.toLowerCase()} record`;
  if (act === "UPDATE") return `Updated ${tbl.toLowerCase()} record`;
  if (act === "DELETE") return `Deleted ${tbl.toLowerCase()} record`;
  if (act === "APPROVE") return `Approved ${tbl.toLowerCase()} record`;
  if (act === "IMPORT") return `Imported ${tbl.toLowerCase()} batch`;
  return `${tbl} ${act.toLowerCase()}`;
}

export default function AccountsAuditLogPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [portal, setPortal] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const q = useAccountsAuditLog({
    page,
    limit: 50,
    action: action || undefined,
    portal: portal || undefined,
    search: search || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const rows = q.data?.data ?? [];
  const pagination = q.data?.pagination ?? { page: 1, limit: 50, total: rows.length, pages: 1 };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Immutable trail of changes to invoices, receipts, bank reconciliations, payroll, entities, and exchange rates"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" loading={q.isFetching} onClick={() => q.refetch()}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button
              variant="secondary"
              disabled={!rows.length}
              onClick={() =>
                downloadCsv(
                  `finance-audit-log-${today()}.csv`,
                  ["Timestamp", "Action", "Record Type", "Record ID", "Performed By", "Summary"],
                  rows.map((r) => [new Date(r.timestamp).toISOString(), r.action, r.portal || r.tableName || "", r.recordId, r.performerName, describeAudit(r)]),
                )
              }
            >
              <Download className="h-4 w-4" /> Export
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <FormRow label="Action" htmlFor="al-act">
          <Select id="al-act" value={action} onChange={(e) => (setAction(e.target.value), setPage(1))}>
            <option value="">All actions</option>
            <option value="CREATE">Create</option>
            <option value="UPDATE">Update</option>
            <option value="DELETE">Delete</option>
            <option value="APPROVE">Approve</option>
            <option value="IMPORT">Import</option>
          </Select>
        </FormRow>
        <FormRow label="Record type" htmlFor="al-type">
          <Select id="al-type" value={portal} onChange={(e) => (setPortal(e.target.value), setPage(1))}>
            <option value="">All records</option>
            <option value="Invoice">Invoice</option>
            <option value="Receipt">Receipt</option>
            <option value="Transaction">Bank transaction</option>
            <option value="Payroll">Payroll</option>
            <option value="Ledger">Ledger</option>
            <option value="Entity">Billing entity</option>
            <option value="ExchangeRate">Exchange rate</option>
            <option value="Reimbursement">Reimbursement</option>
          </Select>
        </FormRow>
        <FormRow label="From" htmlFor="al-from">
          <Input id="al-from" type="date" value={dateFrom} onChange={(e) => (setDateFrom(e.target.value), setPage(1))} />
        </FormRow>
        <FormRow label="To" htmlFor="al-to">
          <Input id="al-to" type="date" value={dateTo} onChange={(e) => (setDateTo(e.target.value), setPage(1))} />
        </FormRow>
        <FormRow label="Search" htmlFor="al-search">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
            <Input id="al-search" placeholder="Record ID or user…" value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} className="pl-9" />
          </div>
        </FormRow>
      </div>

      <Card>
        {q.isError ? (
          <ErrorState message="Audit log couldn’t be loaded." onRetry={() => q.refetch()} />
        ) : q.isLoading ? (
          <Skeleton className="m-5 h-56" />
        ) : !rows.length ? (
          <EmptyState icon={ShieldCheck} title="No audit log entries match these filters" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface-muted/40 text-left text-xs text-ink-subtle">
                    <th className="px-5 py-3 font-medium">When</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Section</th>
                    <th className="px-4 py-3 font-medium">Summary</th>
                    <th className="px-4 py-3 font-medium">Record ID</th>
                    <th className="px-5 py-3 font-medium">Performed by</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.id} className="text-[13px]">
                      <td className="whitespace-nowrap px-5 py-3 tabular text-ink-muted">
                        {formatDate(r.timestamp)}{" "}
                        <span className="text-xs text-ink-subtle">
                          {new Date(r.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={ACTION_TONE[r.action.toUpperCase()] ?? "neutral"}>{r.action}</Badge>
                      </td>
                      <td className="px-4 py-3 font-medium text-ink">{r.portal || r.tableName || "—"}</td>
                      <td className="px-4 py-3 text-ink-muted">{describeAudit(r)}</td>
                      <td className="max-w-[10rem] truncate px-4 py-3 font-mono text-xs text-ink-subtle">{r.recordId}</td>
                      <td className="px-5 py-3 font-medium text-ink">{r.performerName || r.performedBy || "System"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pagination.pages > 1 && (
              <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[13px] text-ink-muted">
                <span>
                  Page {pagination.page} of {pagination.pages} · {formatNumber(pagination.total)} entries
                </span>
                <span className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <Button variant="secondary" size="sm" disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </Button>
                </span>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
