"use client";

import { useState } from "react";
import { Banknote, Clock3, Download, Pencil, Plus, ReceiptText, Trash2, Wallet } from "lucide-react";
import { ApiError } from "@/lib/api";
import { fmtDay, today, workDate } from "@/lib/dates";
import { formatCurrency, plural } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ConfirmDialog, useDialogState } from "@/components/ui/confirm";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { stageOf, STAGE_LABEL, STAGE_TONE, useClaimMutations, useMyClaims, type Claim } from "@/components/claims/api";
import { ClaimDialog } from "@/components/claims/claim-dialog";
import { ClaimDetail } from "@/components/claims/claim-detail";
import { ClaimTabs, downloadCsv } from "@/components/claims/claim-tabs";

type Filter = "all" | "open" | "payment" | "paid" | "closed";

export default function MyClaimsPage() {
  const toast = useToast();
  const q = useMyClaims();
  const m = useClaimMutations();
  const [filter, setFilter] = useState<Filter>("all");
  const [editor, setEditor] = useState<{ claim?: Claim | null } | null>(null);
  const [detail, setDetail] = useState<Claim | null>(null);
  const del = useDialogState<Claim>();

  const all = q.data ?? [];
  const inStage = (c: Claim, f: Filter) => {
    const s = stageOf(c);
    if (f === "open") return s === "manager" || s === "final" || s === "finance";
    if (f === "payment") return s === "payment";
    if (f === "paid") return s === "paid";
    if (f === "closed") return s === "rejected" || s === "returned";
    return true;
  };
  const rows = all.filter((c) => inStage(c, filter));
  const sum = (f: Filter) => all.filter((c) => inStage(c, f)).reduce((a, c) => a + c.amount, 0);

  const columns: Column<Claim>[] = [
    { key: "id", header: "Claim", sortValue: (c) => c.claimId, cell: (c) => <span className="font-medium">{c.claimId}</span> },
    { key: "date", header: "Date", sortValue: (c) => workDate(c.date), cell: (c) => <span className="whitespace-nowrap">{fmtDay(workDate(c.date), { day: "numeric", month: "short", year: "numeric" })}</span> },
    { key: "cat", header: "Expense head", hideBelow: "sm", sortValue: (c) => c.category, cell: (c) => c.category },
    {
      key: "proj",
      header: "Client / project",
      hideBelow: "lg",
      cell: (c) => (
        <span className="block max-w-[240px] truncate text-ink-muted">
          {[c.client?.name, c.project?.name].filter(Boolean).join(" Â· ") || "â€”"}
        </span>
      ),
    },
    { key: "amt", header: "Amount", align: "right", sortValue: (c) => c.amount, cell: (c) => <span className="font-semibold">{formatCurrency(c.amount)}</span> },
    { key: "status", header: "Status", sortValue: (c) => stageOf(c), cell: (c) => <Badge tone={STAGE_TONE[stageOf(c)]}>{STAGE_LABEL[stageOf(c)]}</Badge> },
    {
      key: "act",
      header: "",
      align: "right",
      cell: (c) => {
        const s = stageOf(c);
        return (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {s === "manager" && (
              <button onClick={() => setEditor({ claim: c })} className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink" aria-label="Edit claim" title="Edit">
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {(s === "manager" || s === "rejected" || s === "returned") && (
              <button onClick={() => del.show(c)} className="grid h-8 w-8 place-items-center rounded-lg text-danger hover:bg-danger-soft" aria-label="Delete claim" title="Delete">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reimbursements"
        description="Claim back business expenses and follow them through approval and payment."
        actions={
          <>
            <ClaimTabs />
            <Button
              variant="secondary"
              disabled={!rows.length}
              onClick={() =>
                downloadCsv(
                  `my-claims-${today()}.csv`,
                  ["Claim ID", "Date", "Expense head", "Client", "Project", "Job", "Amount (INR)", "Status", "Description"],
                  rows.map((c) => [c.claimId, workDate(c.date), c.category, c.client?.name, c.project?.name, c.job?.name, c.amount, STAGE_LABEL[stageOf(c)], c.description]),
                )
              }
            >
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button onClick={() => setEditor({})}>
              <Plus className="h-4 w-4" /> New claim
            </Button>
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Summary">
        <StatCard label="In approval" icon={Clock3} tone="warning" loading={q.isLoading} value={formatCurrency(sum("open"))} hint={plural(all.filter((c) => inStage(c, "open")).length, "claim")} />
        <StatCard label="Approved, awaiting payment" icon={Wallet} tone="brand" loading={q.isLoading} value={formatCurrency(sum("payment"))} />
        <StatCard label="Paid" icon={Banknote} tone="success" loading={q.isLoading} value={formatCurrency(sum("paid"))} />
        <StatCard label="Total claimed" icon={ReceiptText} loading={q.isLoading} value={formatCurrency(sum("all"))} hint={plural(all.length, "claim")} />
      </section>

      {all.some((c) => stageOf(c) === "returned") && (
        <p className="rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-[13px] text-ink">
          <span className="font-semibold text-danger">You have claims returned for changes.</span> Open the claim to see what your reviewer asked for, then submit a new claim with the corrections and delete the returned one.
        </p>
      )}

      <Segmented
        aria-label="Status"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All" },
          { value: "open", label: "In approval" },
          { value: "payment", label: "Awaiting payment" },
          { value: "paid", label: "Paid" },
          { value: "closed", label: "Rejected / returned" },
        ]}
      />

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(c) => c.id}
        loading={q.isLoading}
        error={q.isError}
        onRetry={() => q.refetch()}
        onRowClick={setDetail}
        initialSort={{ key: "date", dir: "desc" }}
        empty={{
          icon: ReceiptText,
          title: filter === "all" ? "No claims yet" : "No claims in this status",
          action:
            filter === "all" ? (
              <Button size="sm" onClick={() => setEditor({})}>
                <Plus className="h-4 w-4" /> New claim
              </Button>
            ) : undefined,
        }}
      />

      <ClaimDialog open={!!editor} onClose={() => setEditor(null)} claim={editor?.claim} />
      <ClaimDetail claim={detail} onClose={() => setDetail(null)} />

      <ConfirmDialog
        open={del.open}
        onClose={del.close}
        tone="danger"
        title="Delete this claim?"
        confirmLabel="Delete claim"
        busy={m.remove.isPending}
        description={del.value ? `${del.value.claimId} Â· ${formatCurrency(del.value.amount)} will be removed permanently.` : undefined}
        onConfirm={() =>
          del.value &&
          m.remove.mutate(del.value.id, {
            onSuccess: () => (toast.success("Claim deleted"), del.close()),
            onError: (e) => toast.error("Couldnâ€™t delete", e instanceof ApiError ? e.message : undefined),
          })
        }
      />
    </div>
  );
}
