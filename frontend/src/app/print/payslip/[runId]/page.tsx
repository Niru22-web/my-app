"use client";

import { use } from "react";
import { Printer } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { amountInWords, canUseAccounts } from "@/components/accounts/api";
import { deductionsOf, monthLabel, usePayrollRun, type PayrollLine } from "@/components/accounts/payroll-api";

const fmt = (v: number) => Math.round(v).toLocaleString("en-IN");

/** Printable payslips (A4, one per page). ?line=<id> prints one person; otherwise the whole run. */
export default function PrintPayslips({ params, searchParams }: PageProps<"/print/payslip/[runId]">) {
  const { runId } = use(params);
  const sp = use(searchParams);
  const only = typeof sp.line === "string" ? sp.line : null;
  const { user, status } = useAuth();
  const allowed = canUseAccounts(user);
  const q = usePayrollRun(runId, allowed);

  if (status === "loading" || (allowed && q.isLoading)) return <Skeleton className="m-8 h-[80vh]" />;
  if (!allowed || q.isError || !q.data) return <p className="p-8 text-sm text-ink-muted">These payslips aren’t available. Sign in with an account that has Accounts access and try again.</p>;

  const { run, lines } = q.data;
  const shown = only ? lines.filter((l) => l.id === only) : lines;
  const draft = run.status === "Draft";

  return (
    <div className="min-h-screen bg-surface-muted py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-4 px-4 print:hidden">
        <p className="text-sm text-ink-muted">
          {shown.length} payslip{shown.length === 1 ? "" : "s"} · {run.entity.name} · {monthLabel(run.month, true)}
          {draft && " — draft run: figures may still change."}
        </p>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print / Save PDF
        </Button>
      </div>
      {shown.map((l, i) => (
        <Payslip key={l.id} line={l} entityName={run.entity.legalName || run.entity.name} address={run.entity.address} month={run.month} draft={draft} last={i === shown.length - 1} />
      ))}
    </div>
  );
}

function Payslip({ line: l, entityName, address, month, draft, last }: { line: PayrollLine; entityName: string; address: string | null; month: string; draft: boolean; last: boolean }) {
  const deductions = deductionsOf(l);
  const rows: [string, number, string, number | null][] = [
    ["Basic", l.basic, "Professional Tax", l.pt],
    ["HRA", l.hra, "Provident Fund", l.pfEmployee],
    ["Conveyance", l.conv, "ESIC", l.esicEmployee],
    ["Bonus", l.bonus, "", null],
  ];
  return (
    <article className={`relative mx-auto mb-6 max-w-[210mm] bg-white p-[16mm] text-[12px] leading-relaxed text-[#1c2433] shadow-sm print:mb-0 print:shadow-none ${last ? "" : "print:break-after-page"}`}>
      {draft && <p className="pointer-events-none absolute right-[16mm] top-[16mm] rotate-6 rounded border-2 border-[#8e8e93] px-3 py-1 text-lg font-bold tracking-widest text-[#8e8e93]">DRAFT</p>}
      <header className="border-b-2 border-[#1F3864] pb-4 text-center">
        <Logo className="mx-auto w-[130px]" />
        <p className="mt-3 text-[15px] font-bold">{entityName}</p>
        {address && <p className="whitespace-pre-line text-[#4a5262]">{address}</p>}
        <p className="mt-3 text-[14px] font-bold text-[#1F3864]">Payslip for {monthLabel(month, true)}</p>
      </header>

      <table className="mt-5 w-full border border-[#c8ccd4] text-left">
        <tbody>
          <tr className="border-b border-[#e3e6ea]">
            <th className="w-[22%] px-3 py-1.5">Employee</th>
            <td className="px-3 py-1.5">{l.structure.name}{l.structure.employee ? ` (${l.structure.employee.employeeId})` : ""}</td>
            <th className="w-[20%] px-3 py-1.5">Days in month</th>
            <td className="px-3 py-1.5 tabular">{l.totalDays}</td>
          </tr>
          <tr className="border-b border-[#e3e6ea]">
            <th className="px-3 py-1.5">PF</th>
            <td className="px-3 py-1.5">{l.pfApplicable ? "Yes" : "No"}</td>
            <th className="px-3 py-1.5">Paid days</th>
            <td className="px-3 py-1.5 tabular">{l.paidDays}</td>
          </tr>
          <tr>
            <th className="px-3 py-1.5">ESIC</th>
            <td className="px-3 py-1.5">{l.esicApplicable ? "Yes" : "No"}</td>
            <th className="px-3 py-1.5">LOP days</th>
            <td className="px-3 py-1.5 tabular">{l.lopDays}</td>
          </tr>
        </tbody>
      </table>

      <table className="mt-5 w-full border border-[#c8ccd4]">
        <thead>
          <tr className="bg-[#1F3864] text-left text-white">
            <th className="px-3 py-1.5">Earnings</th>
            <th className="px-3 py-1.5 text-right">Amount (Rs.)</th>
            <th className="px-3 py-1.5">Deductions</th>
            <th className="px-3 py-1.5 text-right">Amount (Rs.)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([e, ea, dd, da]) => (
            <tr key={e} className="border-b border-[#e3e6ea]">
              <td className="px-3 py-1.5">{e}</td>
              <td className="px-3 py-1.5 text-right tabular">{fmt(ea)}</td>
              <td className="px-3 py-1.5">{dd}</td>
              <td className="px-3 py-1.5 text-right tabular">{da === null ? "" : fmt(da)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-[#1c2433] font-bold">
            <td className="px-3 py-1.5">Gross Earnings</td>
            <td className="px-3 py-1.5 text-right tabular">{fmt(l.gross)}</td>
            <td className="px-3 py-1.5">Total Deductions</td>
            <td className="px-3 py-1.5 text-right tabular">{fmt(deductions)}</td>
          </tr>
        </tbody>
      </table>

      <table className="mt-5 w-full border border-[#c8ccd4]">
        <tbody>
          <tr className="bg-[#EEF3FB] text-[14px] font-bold">
            <td className="w-[28%] px-3 py-2">Net Pay</td>
            <td className="px-3 py-2">Rs. {fmt(l.netPay)}</td>
          </tr>
          <tr>
            <td className="px-3 py-1.5">In words</td>
            <td className="px-3 py-1.5">{amountInWords(Math.round(l.netPay))}</td>
          </tr>
        </tbody>
      </table>

      {(l.pfEmployer > 0 || l.esicEmployer > 0) && (
        <p className="mt-4">Employer contributions (not deducted from pay): PF Rs. {fmt(l.pfEmployer)}, ESIC Rs. {fmt(l.esicEmployer)}</p>
      )}
      <p className="mt-8 text-[10px] text-[#666]">This is a computer-generated payslip and does not require a signature.</p>
    </article>
  );
}
