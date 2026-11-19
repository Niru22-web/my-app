"use client";

import { use, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Download, FileText, Lock, Paperclip, Pencil, Printer, RotateCcw, Trash2, Undo2, UserPlus } from "lucide-react";
import { ApiError, downloadFile, openFile } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { FormRow, Input, Select } from "@/components/ui/inputs";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ErrorState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat";
import { useToast } from "@/components/ui/toast";
import { RowMenu } from "@/components/management/row-menu";
import {
  AMOUNT_FIELDS,
  AMOUNT_LABEL,
  deductionsOf,
  monthLabel,
  payrollExportPath,
  payrollFilePath,
  usePayrollMutations,
  usePayrollRun,
  type AmountField,
  type PayrollLine,
} from "@/components/accounts/payroll-api";

const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : undefined);

export default function PayrollRunPage({ params }: PageProps<"/accounts/payroll/[id]">) {
  const { id } = use(params);
  const q = usePayrollRun(id);
  const m = usePayrollMutations();
  const toast = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState<PayrollLine | null>(null);
  const [confirm, setConfirm] = useState<"finalise" | "reopen" | "delete" | null>(null);
  const [removing, setRemoving] = useState<PayrollLine | null>(null);
  const [adding, setAdding] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileFor, setFileFor] = useState<PayrollLine | null>(null);

  const d = q.data;
  const draft = d?.run.status === "Draft";
  const totals = useMemo(() => {
    const ls = d?.lines ?? [];
    return {
      gross: ls.reduce((a, l) => a + l.gross, 0),
      deductions: ls.reduce((a, l) => a + deductionsOf(l), 0),
      net: ls.reduce((a, l) => a + l.netPay, 0),
      employer: ls.reduce((a, l) => a + l.pfEmployer + l.esicEmployer, 0),
      approved: ls.filter((l) => l.approvalStatus === "Okay").length,
      missingSheet: ls.filter((l) => !l.timesheetOk).length,
    };
  }, [d]);

  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.isError || !d) return <Card><ErrorState error={q.error} message={msg(q.error) ?? "This payroll run couldn’t be loaded."} onRetry={() => q.refetch()} /></Card>;

  const { run, lines } = d;
  const runId = run.id;
  const lid = (l: PayrollLine) => ({ runId, lineId: l.id });
  const done = (text: string) => ({ onSuccess: () => toast.success(text), onError: (e: unknown) => toast.error("That didn’t work", msg(e)) });

  const columns: Column<PayrollLine>[] = [
    {
      key: "name",
      header: "Employee",
      sortValue: (l) => l.structure.name,
      cell: (l) => (
        <div className="w-44 sm:w-56">
          <p className="flex items-center gap-2 font-medium text-ink">
            <span className="truncate">{l.structure.name}</span>
            {l.structure.needsReview && <Badge tone="warning">Check</Badge>}
          </p>
          <p className="truncate text-xs text-ink-subtle">
            {[l.calcBasis, l.structure.employee ? l.structure.employee.employeeId : "no portal account", l.remarks].filter(Boolean).join(" · ")}
          </p>
        </div>
      ),
    },
    {
      key: "days",
      header: "Days",
      align: "right",
      hideBelow: "sm",
      sortValue: (l) => l.paidDays,
      cell: (l) => (
        <span className="tabular text-ink-muted" title={`${l.totalDays} days in month, ${l.lopDays} LOP`}>
          {l.paidDays}/{l.totalDays}
          {l.lopDays ? <span className="text-warning"> · LOP {l.lopDays}</span> : null}
        </span>
      ),
    },
    { key: "gross", header: "Gross", align: "right", sortValue: (l) => l.gross, cell: (l) => <span className="tabular text-ink">{formatCurrency(l.gross)}</span> },
    {
      key: "ded",
      header: "Deductions",
      align: "right",
      hideBelow: "md",
      sortValue: (l) => deductionsOf(l),
      cell: (l) => (
        <span className="tabular text-ink-muted" title={`PT ${l.pt} · PF ${l.pfEmployee} · ESIC ${l.esicEmployee}`}>
          {formatCurrency(deductionsOf(l))}
        </span>
      ),
    },
    { key: "net", header: "Net pay", align: "right", sortValue: (l) => l.netPay, cell: (l) => <span className="font-semibold tabular text-ink">{formatCurrency(l.netPay)}</span> },
    {
      key: "sheet",
      header: "Timesheet",
      hideBelow: "lg",
      sortValue: (l) => (l.timesheetOk ? 1 : 0),
      cell: (l) =>
        l.hasTimesheetFile ? (
          <button className="flex items-center gap-1 text-[13px] text-brand hover:underline" onClick={() => void openFile(`/api/${payrollFilePath(runId, l.id)}`).catch((e) => toast.error("Couldn’t open the file", msg(e)))}>
            <FileText className="h-3.5 w-3.5" /> {l.timesheetName}
          </button>
        ) : (l.portalHours ?? 0) > 0 ? (
          <span className="text-[13px] text-ink-muted">Portal: {l.portalHours} h</span>
        ) : (
          <Badge tone="danger">Missing</Badge>
        ),
    },
    {
      key: "ok",
      header: "Approval",
      sortValue: (l) => l.approvalStatus,
      cell: (l) => (l.approvalStatus === "Okay" ? <Badge tone="success">Okay</Badge> : <Badge tone="warning">Pending</Badge>),
    },
    {
      key: "act",
      header: "",
      align: "right",
      cell: (l) => (
        <RowMenu
          items={[
            { label: "Payslip", icon: <Printer className="h-4 w-4" />, onClick: () => window.open(`/print/payslip/${runId}?line=${l.id}`, "_blank") },
            ...(draft
              ? [
                  l.approvalStatus === "Okay"
                    ? { label: "Mark pending", icon: <Undo2 className="h-4 w-4" />, onClick: () => m.setApproval.mutate({ ...lid(l), status: "Pending" }, done("Marked pending")) }
                    : { label: "Approve (Okay)", icon: <CheckCircle2 className="h-4 w-4" />, onClick: () => m.setApproval.mutate({ ...lid(l), status: "Okay" }, done(`${l.structure.name} approved`)) },
                  { label: "Edit days & amounts", icon: <Pencil className="h-4 w-4" />, onClick: () => setEditing(l) },
                  { label: l.hasTimesheetFile ? "Replace timesheet file" : "Attach timesheet file", icon: <Paperclip className="h-4 w-4" />, onClick: () => (setFileFor(l), fileInput.current?.click()) },
                  { label: "Recalculate from structure", icon: <RotateCcw className="h-4 w-4" />, onClick: () => m.recalculate.mutate(lid(l), done("Recalculated from the salary structure")) },
                  { label: "Remove from run", icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => setRemoving(l) },
                ]
              : []),
          ]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/accounts/payroll" className="grid h-9 w-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink" aria-label="Back to payroll">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="mr-auto min-w-0">
          <h1 className="flex items-center gap-2 font-display text-xl font-bold text-ink">
            {run.entity.name} · {monthLabel(run.month, true)}
            {draft ? <Badge tone="warning">Draft</Badge> : <Badge tone="success">Finalised</Badge>}
          </h1>
          <p className="text-[13px] text-ink-muted">
            {draft
              ? "Every line needs a timesheet (portal time or an attached file) and an “Okay” before the month can be finalised. Editing a line puts it back to Pending."
              : "Finalised: payables were created for people with a portal account. Reopen to make changes (not possible once a salary is paid)."}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void downloadFile(payrollExportPath(runId), `${run.entity.name} Salary ${run.month}.xlsx`).catch((e) => toast.error("Couldn’t download", msg(e)))}>
          <Download className="h-4 w-4" /> Salary sheet
        </Button>
        <Button variant="secondary" size="sm" onClick={() => window.open(`/print/payslip/${runId}`, "_blank")}>
          <Printer className="h-4 w-4" /> Payslips
        </Button>
        {draft ? (
          <>
            <Button size="sm" onClick={() => setConfirm("finalise")}>
              <Lock className="h-4 w-4" /> Finalise
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirm("delete")} aria-label="Delete draft run">
              <Trash2 className="h-4 w-4 text-danger" />
            </Button>
          </>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setConfirm("reopen")}>
            <RotateCcw className="h-4 w-4" /> Reopen
          </Button>
        )}
      </div>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Totals">
        <StatCard label="Gross" icon={FileText} value={formatCurrency(totals.gross)} hint={`${lines.length} people`} />
        <StatCard label="Deductions" icon={FileText} value={formatCurrency(totals.deductions)} hint="PT + PF + ESIC (employee)" />
        <StatCard label="Net pay" icon={FileText} tone="brand" value={formatCurrency(totals.net)} hint={`Employer PF + ESIC ${formatCurrency(totals.employer)}`} />
        <StatCard label="Approved" icon={CheckCircle2} tone={totals.approved === lines.length && lines.length ? "success" : "warning"} value={`${totals.approved}/${lines.length}`} hint={totals.missingSheet ? `${totals.missingSheet} timesheet${totals.missingSheet === 1 ? "" : "s"} missing` : "All timesheets in"} />
      </section>

      <DataTable
        itemsLabel="people"
        exportName={`payroll-${run.month}`}
        rows={lines}
        columns={columns}
        rowKey={(l) => l.id}
        initialSort={{ key: "name", dir: "asc" }}
        searchable
        searchPlaceholder="Search name"
        toolbarActions={
          draft && d.notInRun.length > 0 ? (
            <div className="flex items-center gap-2">
              <Select aria-label="Add someone to this run" value={adding} onChange={(e) => setAdding(e.target.value)} className="w-52">
                <option value="">Add someone not in the run…</option>
                {d.notInRun.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{s.status === "Left" ? " (left)" : ""}</option>
                ))}
              </Select>
              <Button size="sm" variant="secondary" disabled={!adding} loading={m.addLine.isPending} onClick={() => m.addLine.mutate({ runId, structureId: adding }, { ...done("Added to the run"), onSettled: () => setAdding("") })}>
                <UserPlus className="h-4 w-4" /> Add
              </Button>
            </div>
          ) : undefined
        }
        empty={{ title: "No one in this run" }}
      />

      <input
        ref={fileInput}
        type="file"
        hidden
        accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.xlsm,.csv,.docx,.doc"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file && fileFor) m.attachTimesheet.mutate({ ...lid(fileFor), file }, done(`Timesheet attached for ${fileFor.structure.name}`));
        }}
      />

      {editing && <EditLine runId={runId} line={editing} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        tone="danger"
        title={`Remove ${removing?.structure.name} from this run?`}
        confirmLabel="Remove"
        busy={m.removeLine.isPending}
        description="Their line (and any attached timesheet file) is deleted. You can add them back while the run is a draft."
        onConfirm={() => removing && m.removeLine.mutate(lid(removing), { ...done("Removed from the run"), onSettled: () => setRemoving(null) })}
      />
      <ConfirmDialog
        open={confirm === "finalise"}
        onClose={() => setConfirm(null)}
        title={`Finalise ${monthLabel(run.month, true)}?`}
        confirmLabel="Finalise"
        busy={m.finalise.isPending}
        description="Locks the run and creates a payables entry (with its ledger accrual) for everyone linked to a portal account, ready for bank reconciliation."
        onConfirm={() =>
          m.finalise.mutate(runId, {
            onSuccess: (r) => {
              const x = (r as { data?: { payablesCreated: number; notLinked: number } }).data;
              toast.success("Run finalised", x ? `${x.payablesCreated} payables entr${x.payablesCreated === 1 ? "y" : "ies"} created${x.notLinked ? `; ${x.notLinked} without a portal account` : ""}.` : undefined);
              setConfirm(null);
            },
            onError: (e) => toast.error("Can’t finalise yet", msg(e)),
          })
        }
      />
      <ConfirmDialog
        open={confirm === "reopen"}
        onClose={() => setConfirm(null)}
        title="Reopen this run?"
        confirmLabel="Reopen"
        busy={m.reopen.isPending}
        description="The run goes back to Draft and its unpaid payables entries are removed. Not possible once any salary is marked paid."
        onConfirm={() => m.reopen.mutate(runId, { ...done("Run reopened"), onSettled: () => setConfirm(null) })}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onClose={() => setConfirm(null)}
        tone="danger"
        title="Delete this draft run?"
        confirmLabel="Delete"
        busy={m.deleteRun.isPending}
        description="All its lines and attached timesheet files are deleted. Salary structures are not affected."
        onConfirm={() =>
          m.deleteRun.mutate(runId, {
            onSuccess: () => {
              toast.success("Draft run deleted");
              router.push("/accounts/payroll");
            },
            onError: (e) => toast.error("Couldn’t delete", msg(e)),
          })
        }
      />
    </div>
  );
}

function EditLine({ runId, line, onClose }: { runId: string; line: PayrollLine; onClose: () => void }) {
  const m = usePayrollMutations();
  const toast = useToast();
  const [total, setTotal] = useState(String(line.totalDays));
  const [lop, setLop] = useState(String(line.lopDays));
  const [remarks, setRemarks] = useState(line.remarks ?? "");
  const [amounts, setAmounts] = useState<Record<AmountField, string>>(() => Object.fromEntries(AMOUNT_FIELDS.map((k) => [k, String(line[k])])) as Record<AmountField, string>);

  const daysChanged = Number(total) !== line.totalDays || Number(lop) !== line.lopDays;
  const changedAmounts = Object.fromEntries(AMOUNT_FIELDS.filter((k) => Number(amounts[k]) !== line[k]).map((k) => [k, Number(amounts[k])])) as Partial<Record<AmountField, number>>;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body: Parameters<typeof m.updateLine.mutate>[0] = { runId, lineId: line.id };
    if (daysChanged) Object.assign(body, { totalDays: Number(total), lopDays: Number(lop) });
    if (Object.keys(changedAmounts).length) body.amounts = changedAmounts;
    if (remarks !== (line.remarks ?? "")) body.remarks = remarks;
    if (Object.keys(body).length === 2) return onClose();
    m.updateLine.mutate(body, {
      onSuccess: () => {
        toast.success("Line updated", "It’s back to Pending until approved again.");
        onClose();
      },
      onError: (err) => toast.error("Couldn’t save", msg(err)),
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`Edit ${line.structure.name}`}
      description="Changing the days recalculates the line from the salary structure; changed amounts are then applied on top. Saving puts the line back to Pending."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="edit-line" loading={m.updateLine.isPending}>Save</Button>
        </>
      }
    >
      <form id="edit-line" onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <FormRow label="Days in month" htmlFor="el-total">
            <Input id="el-total" type="number" min={1} step="0.5" value={total} onChange={(e) => setTotal(e.target.value)} />
          </FormRow>
          <FormRow label="LOP days" htmlFor="el-lop" hint={`Paid days: ${Math.max(Number(total) - Number(lop), 0)}`}>
            <Input id="el-lop" type="number" min={0} step="0.5" value={lop} onChange={(e) => setLop(e.target.value)} />
          </FormRow>
          <FormRow label="Remarks" htmlFor="el-rem">
            <Input id="el-rem" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </FormRow>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {AMOUNT_FIELDS.map((k) => (
            <FormRow key={k} label={AMOUNT_LABEL[k]} htmlFor={`el-${k}`}>
              <Input id={`el-${k}`} type="number" min={0} step="0.01" value={amounts[k]} onChange={(e) => setAmounts((p) => ({ ...p, [k]: e.target.value }))} />
            </FormRow>
          ))}
        </div>
      </form>
    </Dialog>
  );
}
