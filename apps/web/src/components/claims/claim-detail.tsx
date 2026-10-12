"use client";

import { useState } from "react";
import { Banknote, Check, RotateCcw, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { fmtDay, workDate } from "@/lib/dates";
import { formatCurrency, formatDate } from "@/lib/format";
import { timeAgo } from "@/lib/notifications";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Stepper } from "@/components/ui/stepper";
import { FormRow, Input, Select, Textarea } from "@/components/ui/inputs";
import { useToast } from "@/components/ui/toast";
import { claimant, claimSteps, reviewerActions, stageOf, STAGE_LABEL, STAGE_TONE, useClaimMutations, type Claim } from "./api";

type Mode = "view" | "reject" | "sendBack" | "pay";

/** Claim details with progress, history and — for reviewers — the actions allowed at this stage. */
export function ClaimDetail({ claim, onClose, reviewer }: { claim: Claim | null; onClose: () => void; reviewer?: boolean }) {
  if (!claim) return null;
  return <Detail key={claim.id} claim={claim} onClose={onClose} reviewer={reviewer} />;
}

function Detail({ claim: c, onClose, reviewer }: { claim: Claim; onClose: () => void; reviewer?: boolean }) {
  const { user } = useAuth();
  const toast = useToast();
  const m = useClaimMutations();
  const [mode, setMode] = useState<Mode>("view");
  const [remarks, setRemarks] = useState("");
  const [pay, setPay] = useState({ paymentMode: "Bank Transfer", bankReference: "", utrNumber: "" });
  const [error, setError] = useState<string | null>(null);
  const can = reviewer ? reviewerActions(c, user?.role, user?.id) : null;
  const st = stageOf(c);

  const fail = (title: string) => (e: unknown) => setError(e instanceof ApiError ? e.message : title);
  const done = (title: string) => () => (toast.success(title, `${c.claimId} · ${claimant(c)}`), onClose());

  function confirm() {
    setError(null);
    if (mode === "reject" || mode === "sendBack") {
      if (remarks.trim().length < 3) return setError("Please give a reason — the employee will see it.");
      const fn = mode === "reject" ? m.reject : m.sendBack;
      fn.mutate({ id: c.id, remarks: remarks.trim() }, { onSuccess: done(mode === "reject" ? "Claim rejected" : "Claim returned"), onError: fail("Couldn’t update the claim.") });
    }
    if (mode === "pay") {
      if (pay.paymentMode !== "Cash" && !pay.utrNumber.trim() && !pay.bankReference.trim()) return setError("Add a UTR or bank reference for non-cash payments.");
      m.pay.mutate({ id: c.id, ...pay, remarks: remarks.trim() }, { onSuccess: done("Marked as paid"), onError: fail("Couldn’t mark as paid.") });
    }
  }

  const busy = m.approve.isPending || m.reject.isPending || m.sendBack.isPending || m.pay.isPending;

  const footer =
    mode === "view" ? (
      can && (can.approve || can.pay) ? (
        <>
          {can.sendBack && (
            <Button variant="secondary" onClick={() => setMode("sendBack")}>
              <RotateCcw className="h-4 w-4" /> Return
            </Button>
          )}
          {can.reject && (
            <Button variant="secondary" className="text-danger" onClick={() => setMode("reject")}>
              <X className="h-4 w-4" /> Reject
            </Button>
          )}
          {can.approve && (
            <Button loading={m.approve.isPending} onClick={() => m.approve.mutate({ id: c.id }, { onSuccess: done("Claim approved"), onError: fail("Couldn’t approve.") })}>
              <Check className="h-4 w-4" /> {can.approveLabel}
            </Button>
          )}
          {can.pay && (
            <Button onClick={() => setMode("pay")}>
              <Banknote className="h-4 w-4" /> Mark as paid
            </Button>
          )}
        </>
      ) : undefined
    ) : (
      <>
        <Button variant="secondary" onClick={() => (setMode("view"), setError(null))} disabled={busy}>
          Back
        </Button>
        <Button variant={mode === "reject" ? "danger" : "primary"} loading={busy} onClick={confirm}>
          {mode === "reject" ? "Reject claim" : mode === "sendBack" ? "Return to employee" : "Confirm payment"}
        </Button>
      </>
    );

  return (
    <Dialog open onClose={onClose} size="lg" title={`${c.claimId} · ${formatCurrency(c.amount)}`} description={`${claimant(c)} · ${c.category} · ${fmtDay(workDate(c.date), { day: "numeric", month: "short", year: "numeric" })}`} footer={footer}>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <Badge tone={STAGE_TONE[st]}>{STAGE_LABEL[st]}</Badge>
          {c.submittedAt && <span className="text-xs text-ink-subtle">Submitted {timeAgo(c.submittedAt)}</span>}
        </div>
        <Stepper steps={claimSteps(c)} />

        {(st === "rejected" || st === "returned") && c.rejectionReason && (
          <p className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">
            <span className="font-semibold">{st === "returned" ? "Returned" : "Rejected"}:</span> {c.rejectionReason}
          </p>
        )}

        {mode === "view" && (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
              <Item label="Client" value={c.client?.name} />
              <Item label="Project" value={c.project?.name} />
              <Item label="Job" value={c.job?.name} />
              <Item label="Expense head" value={c.category} />
              <Item label="Amount" value={formatCurrency(c.amount)} />
              <Item label="Expense date" value={formatDate(c.date)} />
              {st === "paid" && <Item label="Paid via" value={[c.paymentMode, c.utrNumber || c.bankReference].filter(Boolean).join(" · ")} />}
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-xs text-ink-subtle">Description</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-ink">{c.description || "—"}</dd>
              </div>
            </dl>
            {(c.logs?.length ?? 0) > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">History</p>
                <ol className="space-y-2">
                  {[...c.logs!].sort((a, b) => b.performedAt.localeCompare(a.performedAt)).map((l) => (
                    <li key={l.id} className="flex gap-3 text-[13px]">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden />
                      <span className="flex-1">
                        <span className="font-medium capitalize text-ink">{l.action.replace(/_/g, " ")}</span>
                        {l.performedBy && <span className="text-ink-muted"> by {l.performedBy.firstName} {l.performedBy.lastName}</span>}
                        {l.remarks && <span className="block text-ink-muted">“{l.remarks}”</span>}
                      </span>
                      <span className="shrink-0 text-xs text-ink-subtle">{formatDate(l.performedAt)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </>
        )}

        {(mode === "reject" || mode === "sendBack") && (
          <FormRow label={mode === "reject" ? "Reason for rejection" : "What needs to change?"} htmlFor="cl-remarks" required>
            <Textarea id="cl-remarks" rows={3} maxLength={500} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </FormRow>
        )}

        {mode === "pay" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormRow label="Payment mode" htmlFor="pay-mode" required>
              <Select id="pay-mode" value={pay.paymentMode} onChange={(e) => setPay({ ...pay, paymentMode: e.target.value })}>
                {["Bank Transfer", "UPI", "Cheque", "Cash"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </Select>
            </FormRow>
            <FormRow label="UTR number" htmlFor="pay-utr">
              <Input id="pay-utr" value={pay.utrNumber} onChange={(e) => setPay({ ...pay, utrNumber: e.target.value })} />
            </FormRow>
            <FormRow label="Bank / cheque reference" htmlFor="pay-ref">
              <Input id="pay-ref" value={pay.bankReference} onChange={(e) => setPay({ ...pay, bankReference: e.target.value })} />
            </FormRow>
            <FormRow label="Remarks" htmlFor="pay-rem">
              <Input id="pay-rem" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </FormRow>
          </div>
        )}

        {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}

function Item({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 text-ink">{value || "—"}</dd>
    </div>
  );
}
