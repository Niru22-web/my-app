"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Coins, Download, HandCoins, Plus, Receipt, Trash2, Wallet } from "lucide-react";
import { ApiError } from "@/lib/api";
import { today, workDate } from "@/lib/dates";
import { formatCurrency, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { FormRow, Input, Select } from "@/components/ui/inputs";
import { Segmented } from "@/components/ui/segmented";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ErrorState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { downloadCsv } from "@/components/claims/claim-tabs";
import { claimant, useClaimMutations, useTeamClaims, type Claim } from "@/components/claims/api";
import { fullName, usePeople } from "@/components/management/api";
import { useAccountsMutations, useEntities, usePayrolls, type PayrollEntry } from "@/components/accounts/api";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function PayablesPage() {
  const payrolls = usePayrolls();
  const entities = useEntities();
  const approvedClaims = useTeamClaims("APPROVED", true);
  const m = useAccountsMutations();
  const toast = useToast();

  const [section, setSection] = useState<"payroll" | "claims">("payroll");
  const [statusFilter, setStatusFilter] = useState<"all" | "PENDING" | "PAID">("all");
  const [entityFilter, setEntityFilter] = useState("");
  const [search, setSearch] = useState("");
  const [claimSearch, setClaimSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleting, setDeleting] = useState<PayrollEntry | null>(null);
  const [payingClaim, setPayingClaim] = useState<Claim | null>(null);

  const stats = useMemo(() => {
    let payrollPending = 0;
    let payrollPaid = 0;
    for (const p of payrolls.data ?? []) {
      if (p.status === "PAID") payrollPaid += p.netPayable;
      else payrollPending += p.netPayable;
    }
    const claimsDue = (approvedClaims.data ?? []).reduce((s, c) => s + c.amount, 0);
    return {
      payrollPending,
      payrollPaid,
      claimsDue,
      claimsCount: (approvedClaims.data ?? []).length,
      totalPayable: payrollPending + claimsDue,
    };
  }, [payrolls.data, approvedClaims.data]);

  const payrollRows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (payrolls.data ?? []).filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (entityFilter && p.entityId !== entityFilter) return false;
      if (s && !`${fullName(p.employee)} ${p.employee?.employeeId ?? ""} ${p.entity?.name ?? ""}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [payrolls.data, statusFilter, entityFilter, search]);
  const payrollAll = (payrolls.data ?? []).filter((p) => !entityFilter || p.entityId === entityFilter);
  const claimRows = useMemo(() => {
    const s = claimSearch.trim().toLowerCase();
    return (approvedClaims.data ?? []).filter(
      (c) => !s || `${c.claimId} ${claimant(c)} ${c.description ?? ""} ${c.category ?? ""} ${c.client?.name ?? ""} ${c.project?.name ?? ""}`.toLowerCase().includes(s),
    );
  }, [approvedClaims.data, claimSearch]);

  const payrollColumns: Column<PayrollEntry>[] = [
    {
      key: "emp",
      header: "Employee",
      sortValue: (p) => fullName(p.employee),
      cell: (p) => (
        <div>
          <p className="font-medium text-ink">{fullName(p.employee)}</p>
          <p className="text-xs text-ink-subtle">
            {[p.employee?.employeeId, p.employee?.department, p.entity?.name].filter(Boolean).join(" · ")}
          </p>
        </div>
      ),
    },
    {
      key: "period",
      header: "Period",
      sortValue: (p) => p.year * 100 + p.month,
      cell: (p) => (
        <span className="font-medium tabular text-ink">
          {MONTHS[(p.month - 1) % 12]} {p.year}
        </span>
      ),
    },
    {
      key: "basic",
      header: "Basic",
      align: "right",
      hideBelow: "md",
      sortValue: (p) => p.basicSalary,
      cell: (p) => <span className="tabular text-ink-muted">{formatCurrency(p.basicSalary)}</span>,
    },
    {
      key: "allow",
      header: "Allowances",
      align: "right",
      hideBelow: "md",
      sortValue: (p) => p.allowances,
      cell: (p) => <span className="tabular text-ink-muted">{p.allowances ? formatCurrency(p.allowances) : "—"}</span>,
    },
    {
      key: "ded",
      header: "Deductions",
      align: "right",
      hideBelow: "md",
      sortValue: (p) => p.deductions,
      cell: (p) => <span className="tabular text-ink-muted">{p.deductions ? formatCurrency(p.deductions) : "—"}</span>,
    },
    {
      key: "net",
      header: "Net payable",
      align: "right",
      sortValue: (p) => p.netPayable,
      cell: (p) => <span className="font-semibold tabular text-ink">{formatCurrency(p.netPayable)}</span>,
    },
    {
      key: "status",
      header: "Status",
      sortValue: (p) => p.status,
      cell: (p) =>
        p.status === "PAID" ? (
          <div>
            <Badge tone="success">Paid</Badge>
            {p.paymentDate && <span className="mt-0.5 block text-[11px] text-ink-subtle">{formatDate(p.paymentDate)}</span>}
          </div>
        ) : (
          <Badge tone="warning">Pending</Badge>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (p) =>
        p.status !== "PAID" ? (
          <div className="flex items-center justify-end gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              loading={m.markPayrollPaid.isPending}
              onClick={() =>
                m.markPayrollPaid.mutate(
                  { id: p.id, paymentDate: today() },
                  {
                    onSuccess: () => toast.success(`Marked ${fullName(p.employee)}’s salary paid`),
                    onError: (e) => toast.error("Couldn’t mark paid", e instanceof ApiError ? e.message : undefined),
                  },
                )
              }
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Mark paid
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDeleting(p)} aria-label="Delete payroll">
              <Trash2 className="h-3.5 w-3.5 text-danger" />
            </Button>
          </div>
        ) : null,
    },
  ];

  const claimColumns: Column<Claim>[] = [
    {
      key: "claim",
      header: "Claim",
      sortValue: (c) => c.claimId,
      cell: (c) => (
        <div>
          <p className="font-medium text-ink">{c.claimId}</p>
          <p className="text-xs text-ink-subtle">{formatDate(c.date)} · {c.category}</p>
        </div>
      ),
    },
    {
      key: "person",
      header: "Employee",
      sortValue: (c) => claimant(c),
      cell: (c) => (
        <div>
          <p className="font-medium text-ink">{claimant(c)}</p>
          <p className="text-xs text-ink-subtle">{c.client?.name ?? c.project?.name ?? "Internal"}</p>
        </div>
      ),
    },
    {
      key: "desc",
      header: "Description",
      cell: (c) => <span className="max-w-xs truncate text-ink-muted">{c.description || "—"}</span>,
    },
    {
      key: "amt",
      header: "Amount",
      align: "right",
      sortValue: (c) => c.amount,
      cell: (c) => <span className="font-semibold tabular text-ink">{formatCurrency(c.amount)}</span>,
    },
    {
      key: "act",
      header: "",
      align: "right",
      cell: (c) => (
        <Button variant="secondary" size="sm" onClick={() => setPayingClaim(c)}>
          <HandCoins className="h-3.5 w-3.5" /> Record payment
        </Button>
      ),
    },
  ];

  if (payrolls.isError) {
    return (
      <Card>
        <ErrorState error={payrolls.error} message="Payables couldn’t be loaded." onRetry={() => payrolls.refetch()} />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payables"
        description="Salaries waiting to be paid (finalised payroll runs create these automatically) and approved employee expense claims awaiting disbursement."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Record payroll
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Total payable" icon={Wallet} tone="brand" loading={payrolls.isLoading} value={formatCurrency(stats.totalPayable)} hint="Salaries + approved claims" />
        <StatCard label="Payroll pending" icon={Coins} tone={stats.payrollPending ? "warning" : "neutral"} loading={payrolls.isLoading} value={formatCurrency(stats.payrollPending)} />
        <StatCard label="Claims awaiting payout" icon={Receipt} tone={stats.claimsDue ? "warning" : "neutral"} loading={approvedClaims.isLoading} value={formatCurrency(stats.claimsDue)} hint={stats.claimsCount ? `${stats.claimsCount} approved claim(s)` : undefined} />
        <StatCard label="Payroll disbursed" icon={CheckCircle2} tone="success" loading={payrolls.isLoading} value={formatCurrency(stats.payrollPaid)} />
      </section>

      <Segmented
        aria-label="Payables view"
        value={section}
        onChange={setSection}
        options={[
          { value: "payroll", label: "Monthly payroll", count: (payrolls.data ?? []).length || undefined },
          { value: "claims", label: "Approved claims to pay", count: stats.claimsCount || undefined },
        ]}
      />

      {section === "payroll" ? (
        <DataTable
          exportName={false}
          itemsLabel="payroll entries"
          filterTabs={[
            { key: "all", label: "All", count: payrollAll.length },
            { key: "PENDING", label: "Pending", count: payrollAll.filter((p) => p.status === "PENDING").length },
            { key: "PAID", label: "Paid", count: payrollAll.filter((p) => p.status === "PAID").length },
          ]}
          activeFilterTab={statusFilter}
          onFilterTabChange={(k) => setStatusFilter(k as "all" | "PENDING" | "PAID")}
          searchable
          searchPlaceholder="Search employee…"
          searchValue={search}
          onSearchChange={setSearch}
          toolbarActions={
            <>
              {(entities.data?.length ?? 0) > 1 && (
                <Select aria-label="Billing entity" value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} className="w-44">
                  <option value="">All entities</option>
                  {entities.data!.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </Select>
              )}
              <Button
                variant="secondary"
                size="sm"
                disabled={!payrollRows.length}
                onClick={() =>
                  downloadCsv(
                    `payroll-${today()}.csv`,
                    ["Employee Code", "Employee", "Entity", "Month", "Year", "Basic (₹)", "Allowances (₹)", "Deductions (₹)", "Net Payable (₹)", "Status", "Paid Date"],
                    payrollRows.map((p) => [
                      p.employee?.employeeId ?? "",
                      fullName(p.employee),
                      p.entity?.name ?? "",
                      p.month,
                      p.year,
                      p.basicSalary.toFixed(2),
                      p.allowances.toFixed(2),
                      p.deductions.toFixed(2),
                      p.netPayable.toFixed(2),
                      p.status,
                      p.paymentDate ? workDate(p.paymentDate) : "",
                    ]),
                  )
                }
              >
                <Download className="h-4 w-4" /> Export
              </Button>
            </>
          }
          rows={payrollRows}
          columns={payrollColumns}
          rowKey={(p) => p.id}
          loading={payrolls.isLoading}
          initialSort={{ key: "period", dir: "desc" }}
          pageSize={25}
          empty={{ icon: Coins, title: "No payroll entries recorded", description: "Record monthly salary runs here to track payables and employee ledger balances." }}
        />
      ) : (
        <DataTable
          exportName="claims-to-pay"
          itemsLabel="claims"
          searchable
          searchPlaceholder="Search claim, employee, description…"
          searchValue={claimSearch}
          onSearchChange={setClaimSearch}
          rows={claimRows}
          columns={claimColumns}
          rowKey={(c) => c.id}
          loading={approvedClaims.isLoading}
          error={approvedClaims.isError}
          onRetry={() => approvedClaims.refetch()}
          initialSort={{ key: "claim", dir: "desc" }}
          pageSize={25}
          empty={{ icon: Receipt, title: claimSearch.trim() ? "No claims match this search" : "No approved claims waiting for payment" }}
        />
      )}

      {createOpen && <CreatePayrollDialog entities={entities.data ?? []} onClose={() => setCreateOpen(false)} />}
      {payingClaim && <PayClaimDialog claim={payingClaim} onClose={() => setPayingClaim(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        tone="danger"
        title="Delete payroll entry?"
        description={deleting ? `Remove ${fullName(deleting.employee)}’s ${MONTHS[(deleting.month - 1) % 12]} ${deleting.year} payroll entry?` : ""}
        confirmLabel="Delete"
        busy={m.deletePayroll.isPending}
        onConfirm={() =>
          deleting &&
          m.deletePayroll.mutate(deleting.id, {
            onSuccess: () => (toast.success("Payroll entry removed"), setDeleting(null)),
            onError: (e) => (toast.error("Couldn’t delete", e instanceof ApiError ? e.message : undefined), setDeleting(null)),
          })
        }
      />
    </div>
  );
}

function CreatePayrollDialog({ entities, onClose }: { entities: { id: string; name: string }[]; onClose: () => void }) {
  const toast = useToast();
  const m = useAccountsMutations();
  const people = usePeople();
  const now = today();
  const [employeeId, setEmployeeId] = useState("");
  const [entityId, setEntityId] = useState(entities[0]?.id ?? "");
  const [month, setMonth] = useState(Number(now.slice(5, 7)));
  const [year, setYear] = useState(Number(now.slice(0, 4)));
  const [basicSalary, setBasic] = useState("");
  const [allowances, setAllowances] = useState("0");
  const [deductions, setDeductions] = useState("0");

  const net = Math.max(0, (Number(basicSalary) || 0) + (Number(allowances) || 0) - (Number(deductions) || 0));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!employeeId || !entityId || !(Number(basicSalary) > 0)) return;
    try {
      await m.createPayroll.mutateAsync({
        employeeId,
        entityId,
        month,
        year,
        basicSalary: Number(basicSalary),
        allowances: Number(allowances) || 0,
        deductions: Number(deductions) || 0,
      });
      toast.success("Payroll entry recorded");
      onClose();
    } catch (err) {
      toast.error("Couldn’t save payroll", err instanceof ApiError ? err.message : undefined);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Record monthly payroll"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="payroll-form" disabled={!employeeId || !entityId || !(Number(basicSalary) > 0)} loading={m.createPayroll.isPending}>
            Save ({formatCurrency(net)})
          </Button>
        </>
      }
    >
      <form id="payroll-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Employee" htmlFor="py-emp" required>
          <Select id="py-emp" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Choose employee…</option>
            {(people.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {fullName(p)} ({p.employeeId})
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Billing entity" htmlFor="py-ent" required>
          <Select id="py-ent" value={entityId} onChange={(e) => setEntityId(e.target.value)}>
            <option value="">Choose entity…</option>
            {entities.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Month" htmlFor="py-mo" required>
          <Select id="py-mo" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((label, idx) => (
              <option key={label} value={idx + 1}>
                {label}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Year" htmlFor="py-yr" required>
          <Input id="py-yr" type="number" min="2020" max="2099" value={year} onChange={(e) => setYear(Number(e.target.value))} />
        </FormRow>
        <FormRow label="Basic salary (₹)" htmlFor="py-basic" required>
          <Input id="py-basic" type="number" min="1" step="0.01" value={basicSalary} onChange={(e) => setBasic(e.target.value)} />
        </FormRow>
        <FormRow label="Allowances (₹)" htmlFor="py-allow">
          <Input id="py-allow" type="number" min="0" step="0.01" value={allowances} onChange={(e) => setAllowances(e.target.value)} />
        </FormRow>
        <FormRow label="Deductions / TDS / PF (₹)" htmlFor="py-ded">
          <Input id="py-ded" type="number" min="0" step="0.01" value={deductions} onChange={(e) => setDeductions(e.target.value)} />
        </FormRow>
        <div className="flex flex-col justify-end rounded-xl bg-surface-muted px-3.5 py-2.5 text-[13px]">
          <span className="text-xs text-ink-subtle">Net payable</span>
          <span className="font-semibold tabular text-ink">{formatCurrency(net)}</span>
        </div>
      </form>
    </Dialog>
  );
}

function PayClaimDialog({ claim, onClose }: { claim: Claim; onClose: () => void }) {
  const toast = useToast();
  const cm = useClaimMutations();
  const [paymentMode, setMode] = useState("Bank Transfer");
  const [utrNumber, setUtr] = useState("");
  const [remarks, setRemarks] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await cm.pay.mutateAsync({
        id: claim.id,
        paymentMode,
        bankReference: utrNumber.trim(),
        utrNumber: utrNumber.trim(),
        remarks: remarks.trim(),
      });
      toast.success(`Claim ${claim.claimId} marked paid`);
      onClose();
    } catch (err) {
      toast.error("Couldn’t record payment", err instanceof ApiError ? err.message : undefined);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Pay claim ${claim.claimId}`}
      description={`${claimant(claim)} · ${formatCurrency(claim.amount)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="pay-claim-form" loading={cm.pay.isPending}>
            Mark paid
          </Button>
        </>
      }
    >
      <form id="pay-claim-form" onSubmit={submit} className="space-y-4">
        <FormRow label="Payment mode" htmlFor="pc-mode" required>
          <Select id="pc-mode" value={paymentMode} onChange={(e) => setMode(e.target.value)}>
            <option>Bank Transfer</option>
            <option>NEFT / RTGS</option>
            <option>UPI</option>
            <option>Cheque</option>
          </Select>
        </FormRow>
        <FormRow label="UTR / bank reference" htmlFor="pc-utr">
          <Input id="pc-utr" value={utrNumber} onChange={(e) => setUtr(e.target.value)} placeholder="Optional" />
        </FormRow>
        <FormRow label="Remarks" htmlFor="pc-rem">
          <Input id="pc-rem" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional" />
        </FormRow>
      </form>
    </Dialog>
  );
}
