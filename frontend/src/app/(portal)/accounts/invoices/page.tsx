"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, FilePlus2, FileText, Search } from "lucide-react";
import { today, workDate } from "@/lib/dates";
import { formatCurrency, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/inputs";
import { Segmented } from "@/components/ui/segmented";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadCsv } from "@/components/claims/claim-tabs";
import { STATUS_LABEL, STATUS_TONE, daysOverdue, outstanding, useEntities, useInvoices, type Invoice } from "@/components/accounts/api";
import { InvoiceEditor } from "@/components/accounts/invoice-editor";

type View = "all" | "DRAFT" | "open" | "overdue" | "PAID" | "CANCELLED";

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
  const [view, setView] = useState<View>(params.get("status") === "DRAFT" ? "DRAFT" : "all");
  const [entity, setEntity] = useState("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(params.get("new") === "1");

  const all = useMemo(() => q.data ?? [], [q.data]);
  const isOpen = (i: Invoice) => outstanding(i) > 0;
  const match = (i: Invoice, v: View) =>
    v === "all" ? true : v === "open" ? isOpen(i) : v === "overdue" ? isOpen(i) && daysOverdue(i, now) > 0 : v === "PAID" ? i.status === "PAID" : i.status === v;
  const rows = all.filter(
    (i) =>
      match(i, view) &&
      (!entity || i.entityId === entity) &&
      (!search.trim() || `${i.invoiceNumber} ${i.client?.name ?? ""} ${i.project?.name ?? ""} ${i.udin ?? ""}`.toLowerCase().includes(search.trim().toLowerCase())),
  );
  const count = (v: View) => all.filter((i) => match(i, v)).length;

  const columns: Column<Invoice>[] = [
    {
      key: "no",
      header: "Invoice",
      sortValue: (i) => i.invoiceNumber,
      cell: (i) => (
        <Link href={`/accounts/invoices/${i.id}`} className="block w-44 sm:w-52">
          <span className="block truncate font-medium text-ink hover:text-brand">{i.invoiceNumber}</span>
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
          <>
            <Button
              variant="secondary"
              disabled={!rows.length}
              onClick={() =>
                downloadCsv(
                  `invoices-${now}.csv`,
                  ["Invoice", "Date", "Due", "Billed by", "Client", "Client GSTIN", "Currency", "Rate", "Taxable", "GST", "Total", "Outstanding", "Status"],
                  rows.map((i) => [i.invoiceNumber, workDate(i.issueDate), i.dueDate ? workDate(i.dueDate) : "", i.entity?.name, i.client?.name, i.client?.gstin, i.currency, i.exchangeRate, i.subTotal, i.taxAmount, i.totalAmount, outstanding(i), STATUS_LABEL[i.status] ?? i.status]),
                )
              }
            >
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button onClick={() => setCreating(true)}>
              <FilePlus2 className="h-4 w-4" /> New invoice
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <Segmented
          aria-label="Show"
          value={view}
          onChange={setView}
          options={[
            { value: "all", label: "All" },
            { value: "DRAFT", label: "Drafts", count: count("DRAFT") || undefined },
            { value: "open", label: "Unpaid", count: count("open") || undefined },
            { value: "overdue", label: "Overdue", count: count("overdue") || undefined },
            { value: "PAID", label: "Paid" },
            { value: "CANCELLED", label: "Cancelled" },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          {(entities.data?.length ?? 0) > 1 && (
            <Select aria-label="Billing entity" value={entity} onChange={(e) => setEntity(e.target.value)} className="sm:w-48">
              <option value="">All entities</option>
              {entities.data!.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          )}
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
            <Input placeholder="Number, client, project, UDIN" aria-label="Search invoices" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(i) => i.id}
        loading={q.isLoading}
        initialSort={{ key: "date", dir: "desc" }}
        pageSize={20}
        empty={{ icon: FileText, title: all.length ? "No invoices match" : "No invoices yet", description: all.length ? undefined : "Create the first invoice — it starts as a draft." }}
      />
      {creating && <InvoiceEditor onClose={() => setCreating(false)} onSaved={(id) => router.push(`/accounts/invoices/${id}`)} />}
    </div>
  );
}
