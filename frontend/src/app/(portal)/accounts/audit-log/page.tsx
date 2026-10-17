"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
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
import { fetchAllAuditLog, useAccountsAuditLog, type AuditLogEntry } from "@/components/accounts/api";

const ACTIONS = ["CREATE", "UPDATE", "DELETE", "ISSUE", "CANCEL", "REVERSE", "RECONCILE", "UNRECONCILE", "IMPORT"];
const ACTION_LABEL: Record<string, string> = {
  CREATE: "Created",
  UPDATE: "Updated",
  DELETE: "Deleted",
  ISSUE: "Issued",
  CANCEL: "Cancelled",
  REVERSE: "Reversed",
  RECONCILE: "Matched",
  UNRECONCILE: "Un-matched",
  IMPORT: "Imported",
};
const ACTION_TONE: Record<string, "success" | "brand" | "danger" | "warning" | "neutral"> = {
  CREATE: "success",
  UPDATE: "brand",
  DELETE: "danger",
  ISSUE: "success",
  CANCEL: "danger",
  REVERSE: "warning",
  RECONCILE: "brand",
  UNRECONCILE: "warning",
  IMPORT: "neutral",
};
const RECORD_TYPES: [string, string][] = [
  ["Invoice", "Invoice"],
  ["CreditNote", "Credit note"],
  ["Receipt", "Receipt"],
  ["Transaction", "Bank line"],
  ["Payroll", "Payroll"],
  ["Entity", "Billing entity"],
  ["TaxConfiguration", "Tax rate"],
  ["Currency", "Currency"],
  ["ExchangeRate", "Exchange rate"],
  ["Ledger", "Ledger"],
];
const typeLabel = (t?: string) => RECORD_TYPES.find(([v]) => v.toLowerCase() === (t ?? "").toLowerCase())?.[1] ?? t ?? "—";

const asObj = (v: unknown): Record<string, unknown> | null => {
  if (v == null) return null;
  if (typeof v === "string") {
    try {
      return asObj(JSON.parse(v));
    } catch {
      return { value: v };
    }
  }
  return typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : { value: v };
};
const show = (v: unknown): string => {
  if (v == null || v === "") return "—";
  if (typeof v === "string") return /^\d{4}-\d{2}-\d{2}T/.test(v) ? v.slice(0, 10) : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
};
const words = (k: string) => k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase();

/** "key: old → new" pairs from the stored before/after values. */
function changes(log: AuditLogEntry): string[] {
  const o = asObj(log.oldValue) ?? {};
  const n = asObj(log.newValue) ?? {};
  const keys = [...new Set([...Object.keys(n), ...Object.keys(o)])];
  return keys
    .filter((k) => JSON.stringify(o[k]) !== JSON.stringify(n[k]))
    .map((k) => (k in o && k in n ? `${words(k)}: ${show(o[k])} → ${show(n[k])}` : k in n ? `${words(k)}: ${show(n[k])}` : `${words(k)} was ${show(o[k])}`));
}

function Summary({ log }: { log: AuditLogEntry }) {
  const [open, setOpen] = useState(false);
  const list = changes(log);
  if (!list.length) return <span className="text-ink-subtle">{ACTION_LABEL[log.action.toUpperCase()] ?? log.action} {typeLabel(log.tableName || log.portal).toLowerCase()}</span>;
  const visible = open ? list : list.slice(0, 3);
  return (
    <div className="max-w-md space-y-0.5">
      {visible.map((c, i) => (
        <p key={i} className={open ? "break-words" : "truncate"} title={open ? undefined : c}>
          {c}
        </p>
      ))}
      {(list.length > 3 || list.some((c) => c.length > 60)) && (
        <button type="button" onClick={() => setOpen((x) => !x)} className="text-xs font-semibold text-brand hover:underline">
          {open ? "Show less" : list.length > 3 ? `Show all ${list.length}` : "Show full"}
        </button>
      )}
    </div>
  );
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

  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const rows = q.data?.data ?? [];
  const filtered = !!(action || portal || search.trim() || dateFrom || dateTo);

  async function exportAll() {
    setExporting(true);
    try {
      const all = await fetchAllAuditLog({ action: action || undefined, portal: portal || undefined, search: search || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined });
      downloadCsv(
        `finance-audit-log-${today()}.csv`,
        ["Timestamp", "Action", "Record type", "Record ID", "Performed by", "What changed"],
        all.map((r) => [new Date(r.timestamp).toISOString(), r.action, typeLabel(r.tableName || r.portal), r.recordId, r.performerName, changes(r).join("; ")]),
      );
    } catch (e) {
      toast.error("Couldn’t export the audit log", e instanceof ApiError ? e.message : undefined);
    } finally {
      setExporting(false);
    }
  }
  const pagination = q.data?.pagination ?? { page: 1, limit: 50, total: rows.length, pages: 1 };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Every change to invoices, credit notes, receipts, bank matching, payroll, billing entities, tax rates and exchange rates"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" loading={q.isFetching} onClick={() => q.refetch()}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button variant="secondary" disabled={!rows.length} loading={exporting} onClick={exportAll}>
              <Download className="h-4 w-4" /> Export
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <FormRow label="Action" htmlFor="al-act">
          <Select id="al-act" value={action} onChange={(e) => (setAction(e.target.value), setPage(1))}>
            <option value="">All actions</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {ACTION_LABEL[a]}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Record type" htmlFor="al-type">
          <Select id="al-type" value={portal} onChange={(e) => (setPortal(e.target.value), setPage(1))}>
            <option value="">All records</option>
            {RECORD_TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
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
            <Input id="al-search" placeholder="Record ID" value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} className="pl-9" />
          </div>
        </FormRow>
      </div>

      <Card>
        {q.isError ? (
          <ErrorState error={q.error} message="Audit log couldn’t be loaded." onRetry={() => q.refetch()} />
        ) : q.isLoading ? (
          <Skeleton className="m-5 h-56" />
        ) : !rows.length ? (
          <EmptyState icon={ShieldCheck} title={filtered ? "No audit log entries match these filters" : "No changes recorded yet"} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface-muted/40 text-left text-xs text-ink-subtle">
                    <th className="px-5 py-3 font-medium">When</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Record</th>
                    <th className="px-4 py-3 font-medium">What changed</th>
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
                        <Badge tone={ACTION_TONE[r.action.toUpperCase()] ?? "neutral"}>{ACTION_LABEL[r.action.toUpperCase()] ?? r.action}</Badge>
                      </td>
                      <td className="px-4 py-3 font-medium text-ink">{typeLabel(r.tableName || r.portal)}</td>
                      <td className="px-4 py-3 align-top text-ink-muted">
                        <Summary log={r} />
                      </td>
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
