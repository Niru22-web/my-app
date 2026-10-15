"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, FilePlus2, FileText } from "lucide-react";
import { today, workDate } from "@/lib/dates";
import { formatCurrency, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/inputs";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadCsv } from "@/components/claims/claim-tabs";
import { STATUS_LABEL, STATUS_TONE, daysOverdue, outstanding, useEntities, useInvoices, type Invoice } from "@/components/accounts/api";
import { InvoiceEditor } from "@/components/accounts/invoice-editor";

const VIEWS = ["all", "DRAFT", "SENT", "PARTIALLY_PAID", "OVERDUE", "PAID", "CANCELLED"] as const;
type View = (typeof VIEWS)[number];

export default function InvoicesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Invoices />
    </Suspense>
  );
}

function Invoices() {
  const router = useRouter();
  const params = useSearchParams();
  const q = useInvoices();
  const entities = useEntities();
  const now = today();
  const initial = params.get("status") as View | null;
  const [view, setView] = useState<View>(initial && VIEWS.includes(initial) ? initial : "all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [entity, setEntity] = useState("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(params.get("new") === "1");

  const all = useMemo(() => q.data ?? [], [q.data]);
  const isOpen = (i: Invoice) => outstanding(i) > 0;
  const match = (i: Invoice, v: View) => v === "all" || i.status === v;
  const inRange = (i: Invoice) => {
    const d = workDate(i.issueDate);
    return (!from || d >= from) && (!to || d <= to);
  };
  const rows = all.filter(
    (i) =>
      match(i, view) &&
      inRange(i) &&
      (!entity || i.entityId === entity) &&
      (!search.trim() || `${i.invoiceNumber} ${i.client?.name ?? ""} ${i.project?.name ?? ""} ${i.udin ?? ""}`.toLowerCase().includes(search.trim().toLowerCase())),
  );
  const count = (v: View) => all.filter((i) => match(i, v) && inRange(i)).length;
  const filtered = view !== "all" || !!entity || !!search.trim() || !!from || !!to;

  const columns: Column<Invoice>[] = [
    {
      key: "no",
      header: "Invoice",
      sortValue: (i) => i.invoiceNumber,
      cell: (i) => (
        <Link href={`/accounts/invoices/${i.id}`} className="block w-44 sm:w-52">
          <span className="block truncate font-medium text-ink hover:text-brand">{i.status === "DRAFT" ? "Draft (not numbered yet)" : i.invoiceNumber}</span>
          <span className="block truncate text-xs text-ink-subtle">{i.client?.name}</span>
        </Link>
      ),
    },
    { key: "date", header: "Date", hideBelow: "md", sortValue: (i) => i.issueDate, cell: (i) => <span className="text-ink-muted">{formatDate(i.issueDate)}</span> },
    {
      key: "due",
      header: "Due",
      hideBelow: "lg",
      sortValue: (i) => i.dueDate ?? "9",
      cell: (i) => {
        const late = isOpen(i) ? daysOverdue(i, now) : 0;
        return <span className={late ? "text-danger" : "text-ink-muted"}>{i.dueDate ? formatDate(i.dueDate) : "—"}{late ? ` · ${late}d late` : ""}</span>;
      },
    },
    { key: "entity", header: "Billed by", hideBelow: "lg", sortValue: (i) => i.entity?.name ?? "", cell: (i) => <span className="text-ink-muted">{i.entity?.name ?? "—"}</span> },
    { key: "total", header: "Total", align: "right", sortValue: (i) => i.totalAmount * (i.exchangeRate || 1), cell: (i) => <span className="font-semibold tabular text-ink">{formatCurrency(i.totalAmount, i.currency)}</span> },
    { key: "due_amt", header: "Outstanding", align: "right", hideBelow: "sm", sortValue: (i) => outstanding(i) * (i.exchangeRate || 1), cell: (i) => <span className="tabular text-ink-muted">{isOpen(i) ? formatCurrency(outstanding(i), i.currency) : "—"}</span> },
    { key: "status", header: "Status", sortValue: (i) => i.status, cell: (i) => <Badge tone={STATUS_TONE[i.status] ?? "neutral"}>{STATUS_LABEL[i.status] ?? i.status}</Badge> },
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
        title="Invoices"
        actions={
          <Button onClick={() => setCreating(true)}>
            <FilePlus2 className="h-4 w-4" /> New invoice
          </Button>
        }
      />
      <DataTable
        exportName={false}
        itemsLabel="invoices"
        filterTabs={[
          { key: "all", label: "All", count: count("all") },
          { key: "DRAFT", label: "Draft", count: count("DRAFT") },
          { key: "SENT", label: "Sent", count: count("SENT") },
          { key: "PARTIALLY_PAID", label: "Part paid", count: count("PARTIALLY_PAID") },
          { key: "OVERDUE", label: "Overdue", count: count("OVERDUE") },
          { key: "PAID", label: "Paid", count: count("PAID") },
          { key: "CANCELLED", label: "Cancelled", count: count("CANCELLED") },
        ]}
        activeFilterTab={view}
        onFilterTabChange={(k) => setView(k as View)}
        searchable
        searchPlaceholder="Number, client, project, UDIN"
        searchValue={search}
        onSearchChange={setSearch}
        toolbarActions={
          <>
            <Input type="date" aria-label="Invoice date from" title="From" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[150px]" />
            <Input type="date" aria-label="Invoice date to" title="To" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-9 w-[150px]" />
            {(entities.data?.length ?? 0) > 1 && (
              <Select aria-label="Billing entity" value={entity} onChange={(e) => setEntity(e.target.value)} className="w-44">
                <option value="">All entities</option>
                {entities.data!.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            )}
            <Button
              variant="secondary"
              size="sm"
              disabled={!rows.length}
              onClick={() =>
                downloadCsv(
                  `invoices-${now}.csv`,
                  ["Invoice", "Date", "Due", "Billed by", "Client", "Client GSTIN", "Currency", "Rate", "Taxable", "GST", "Total", "Received", "Credited", "Outstanding", "Status"],
                  rows.map((i) => [i.invoiceNumber, workDate(i.issueDate), i.dueDate ? workDate(i.dueDate) : "", i.entity?.name, i.client?.name, i.client?.gstin, i.currency, i.exchangeRate, i.subTotal, i.taxAmount, i.totalAmount, i.paidAmount ?? 0, i.creditedAmount ?? 0, outstanding(i), STATUS_LABEL[i.status] ?? i.status]),
                )
              }
            >
              <Download className="h-4 w-4" /> Export
            </Button>
          </>
        }
        rows={rows}
        columns={columns}
        rowKey={(i) => i.id}
        loading={q.isLoading}
        initialSort={{ key: "date", dir: "desc" }}
        pageSize={20}
        empty={{ icon: FileText, title: all.length && filtered ? "No invoices match these filters" : "No invoices yet", description: all.length && filtered ? undefined : "Create the first invoice — it starts as a draft." }}
      />
      {creating && <InvoiceEditor onClose={() => setCreating(false)} onSaved={(id) => router.push(`/accounts/invoices/${id}`)} />}
    </div>
  );
}
