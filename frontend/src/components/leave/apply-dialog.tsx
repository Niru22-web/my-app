"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { ApiError } from "@/lib/api";
import { fmtDay, today, workDate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormRow, Input, Select, Textarea } from "@/components/ui/inputs";
import { useToast } from "@/components/ui/toast";
import { useLeaveMutations, type Leave } from "./api";
import { useLeavePolicy, useLeavePreview, useMyBalances } from "./policy-api";

/** Debounces a value so the server preview isn't called on every keystroke. */
function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function ApplyLeaveDialog({ open, onClose, entry }: { open: boolean; onClose: () => void; entry?: Leave | null }) {
  if (!open) return null;
  return <ApplyForm key={entry?.id ?? "new"} onClose={onClose} entry={entry} />;
}

function ApplyForm({ onClose, entry }: { onClose: () => void; entry?: Leave | null }) {
  const toast = useToast();
  const m = useLeaveMutations();
  const policy = useLeavePolicy();
  const balances = useMyBalances();
  const types = (policy.data?.types ?? []).filter((t) => t.active || t.name === entry?.type);

  const [type, setType] = useState(entry?.type ?? "");
  const current = types.find((t) => t.name === type) ?? types[0];
  const typeName = current?.name ?? type;
  const [half, setHalf] = useState((entry?.duration ?? "").toLowerCase().includes("half"));
  const [from, setFrom] = useState(entry ? workDate(entry.fromDate) : today());
  const [to, setTo] = useState(entry ? workDate(entry.toDate) : today());
  const [reason, setReason] = useState(entry?.reason ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const halfDay = half && current?.allowHalfDay !== false;

  // The server counts the days (weekly offs, firm holidays) and checks the rules.
  const query = useDebounced(
    typeName && from ? { type: typeName, fromDate: from, toDate: halfDay ? from : to || from, duration: halfDay ? "Half Day" : "Full Day", leaveId: entry?.id } : null,
  );
  const preview = useLeavePreview(query);
  const p = preview.data;
  const bal = balances.data?.balances.find((b) => b.leaveTypeId === current?.id);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const errs: Record<string, string> = {};
    if (!typeName) errs.type = "Choose a leave type.";
    if (!from) errs.from = "Choose a start date.";
    if (!halfDay && (!to || to < from)) errs.to = "The end date must be on or after the start date.";
    if (reason.trim().length < 5) errs.reason = "Add a short reason (at least 5 characters).";
    setErrors(errs);
    if (Object.keys(errs).length || p?.errors.length) return;

    const body = { type: typeName, reason: reason.trim(), duration: halfDay ? ("Half Day" as const) : ("Full Day" as const), fromDate: from, toDate: halfDay ? from : to };
    try {
      if (entry) await m.edit.mutateAsync({ id: entry.id, body });
      else await m.apply.mutateAsync(body);
      toast.success(entry ? "Leave request updated" : "Leave request submitted", p ? `${p.days} day${p.days === 1 ? "" : "s"} · ${typeName}` : typeName);
      onClose();
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Couldn’t submit the request. Please try again.");
    }
  }

  const busy = m.apply.isPending || m.edit.isPending;
  const blocked = !!p?.errors.length;
  return (
    <Dialog
      open
      onClose={onClose}
      title={entry ? "Edit leave request" : "Apply for leave"}
      description="Your reporting manager or partner will be notified to approve it."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="leave-form" loading={busy} disabled={blocked || preview.isFetching}>
            {entry ? "Save changes" : "Submit request"}
          </Button>
        </>
      }
    >
      <form id="leave-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Leave type" htmlFor="lv-type" required error={errors.type} hint={current?.description ?? undefined}>
          <Select id="lv-type" value={typeName} onChange={(e) => setType(e.target.value)}>
            {!types.length && <option value="">{policy.isLoading ? "Loading…" : "No leave types set up"}</option>}
            {types.map((t) => (
              <option key={t.id} value={t.name}>
                {t.name}
              </option>
            ))}
          </Select>
        </FormRow>
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-ink">Duration</span>
          <div role="radiogroup" aria-label="Duration" className="grid h-10 grid-cols-2 gap-1 rounded-xl border border-line-strong bg-surface-muted p-1">
            {[
              { v: false, l: "Full day(s)" },
              { v: true, l: "Half day" },
            ].map((o) => {
              const disabled = o.v && current?.allowHalfDay === false;
              return (
                <button
                  key={o.l}
                  type="button"
                  role="radio"
                  aria-checked={halfDay === o.v}
                  disabled={disabled}
                  title={disabled ? `${current?.name} can’t be taken as a half day` : undefined}
                  onClick={() => setHalf(o.v)}
                  className={cn(
                    "rounded-lg text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-40",
                    halfDay === o.v ? "bg-surface text-brand shadow-sm" : "text-ink-muted hover:text-ink",
                  )}
                >
                  {o.l}
                </button>
              );
            })}
          </div>
        </div>
        <FormRow label={halfDay ? "Date" : "From"} htmlFor="lv-from" required error={errors.from}>
          <Input id="lv-from" type="date" value={from} invalid={!!errors.from} onChange={(e) => (setFrom(e.target.value), to < e.target.value && setTo(e.target.value))} />
        </FormRow>
        {!halfDay && (
          <FormRow label="To" htmlFor="lv-to" required error={errors.to}>
            <Input id="lv-to" type="date" value={to} min={from} invalid={!!errors.to} onChange={(e) => setTo(e.target.value)} />
          </FormRow>
        )}
        <FormRow label="Reason" htmlFor="lv-reason" required error={errors.reason} className="sm:col-span-2">
          <Textarea id="lv-reason" rows={3} maxLength={500} value={reason} invalid={!!errors.reason} onChange={(e) => setReason(e.target.value)} />
        </FormRow>

        <div
          className={cn("space-y-1.5 rounded-xl px-3.5 py-3 text-[13px] sm:col-span-2", blocked ? "bg-danger-soft" : p?.warnings.length ? "bg-warning-soft" : "bg-brand-softer")}
          aria-live="polite"
        >
          <p className="text-ink">
            <span className="font-semibold tabular">{p ? `${p.days} day${p.days === 1 ? "" : "s"}` : preview.isFetching ? "Counting…" : "—"}</span>
            {from && <> · {halfDay ? fmtDay(from, { weekday: "short", day: "numeric", month: "short" }) : `${fmtDay(from, { day: "numeric", month: "short" })} – ${fmtDay(to || from, { day: "numeric", month: "short" })}`}</>}
            {bal && current?.paid && (
              <span className="text-ink-muted">
                {" "}
                · {bal.available} {current.name} available{bal.pending ? ` (${bal.pending} awaiting approval)` : ""}
              </span>
            )}
          </p>
          {p?.errors.map((x) => (
            <p key={x} className="flex gap-1.5 text-danger">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {x}
            </p>
          ))}
          {p?.warnings.map((x) => (
            <p key={x} className="flex gap-1.5 text-warning">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {x}
            </p>
          ))}
        </div>
        <p className="-mt-2 text-xs text-ink-subtle sm:col-span-2">
          Weekly offs ({policy.data?.calendar.summary.toLowerCase() ?? "per the firm calendar"}) and firm holidays aren’t deducted.
        </p>

        {serverError && <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger sm:col-span-2">{serverError}</p>}
      </form>
    </Dialog>
  );
}
