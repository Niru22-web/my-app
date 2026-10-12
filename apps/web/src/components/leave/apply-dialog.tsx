"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { Envelope } from "@/lib/types";
import { addDays, fmtDay, isWeekend, today, workDate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormRow, Input, Select, Textarea } from "@/components/ui/inputs";
import { useToast } from "@/components/ui/toast";
import { LEAVE_TYPES, useLeaveMutations, type Leave } from "./api";

/** Firm policy: leave counts working days only (Monday–Friday, excluding firm holidays), inclusive of both ends. */
export function countDays(from: string, to: string, half: boolean, holidays: ReadonlySet<string> = new Set()): number {
  if (!from || !to || to < from) return 0;
  const off = (d: string) => isWeekend(d) || holidays.has(d);
  if (half) return off(from) ? 0 : 0.5;
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (!off(d)) n++;
  return n;
}

/** Holiday dates from the firm calendar. */
function useHolidays() {
  const q = useQuery({ queryKey: ["events"], queryFn: async () => (await api<Envelope<{ date: string; type: string }[]>>("events")).data ?? [], staleTime: 5 * 60_000 });
  return useMemo(() => new Set((q.data ?? []).filter((e) => e.type === "Holiday").map((e) => workDate(e.date))), [q.data]);
}

export function ApplyLeaveDialog({ open, onClose, entry, available }: { open: boolean; onClose: () => void; entry?: Leave | null; available?: number }) {
  if (!open) return null;
  return <ApplyForm key={entry?.id ?? "new"} onClose={onClose} entry={entry} available={available} />;
}

function ApplyForm({ onClose, entry, available }: { onClose: () => void; entry?: Leave | null; available?: number }) {
  const toast = useToast();
  const m = useLeaveMutations();
  const [type, setType] = useState(entry?.type ?? LEAVE_TYPES[0]);
  const [half, setHalf] = useState((entry?.duration ?? "").toLowerCase().includes("half"));
  const [from, setFrom] = useState(entry ? workDate(entry.fromDate) : today());
  const [to, setTo] = useState(entry ? workDate(entry.toDate) : today());
  const [reason, setReason] = useState(entry?.reason ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const holidays = useHolidays();
  const days = countDays(from, half ? from : to, half, holidays);
  const over = available != null && days > available;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const errs: Record<string, string> = {};
    if (!from) errs.from = "Choose a start date.";
    if (!half && (!to || to < from)) errs.to = "The end date must be on or after the start date.";
    else if (days === 0)
      errs[half ? "from" : "to"] = half ? "A half day must fall on a working day (Mon–Fri, not a holiday)." : "This range has no working days — weekends and firm holidays aren’t counted as leave.";
    if (reason.trim().length < 5) errs.reason = "Add a short reason (at least 5 characters).";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const body = { type, reason: reason.trim(), duration: half ? ("Half Day" as const) : ("Full Day" as const), fromDate: from, toDate: half ? from : to, totalDays: days };
    try {
      if (entry) await m.edit.mutateAsync({ id: entry.id, body });
      else await m.apply.mutateAsync(body);
      toast.success(entry ? "Leave request updated" : "Leave request submitted", `${days} day${days === 1 ? "" : "s"} · ${type}`);
      onClose();
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Couldn’t submit the request. Please try again.");
    }
  }

  const busy = m.apply.isPending || m.edit.isPending;
  return (
    <Dialog
      open
      onClose={onClose}
      title={entry ? "Edit leave request" : "Apply for leave"}
      description="Your reporting manager will be notified."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="leave-form" loading={busy}>
            {entry ? "Save changes" : "Submit request"}
          </Button>
        </>
      }
    >
      <form id="leave-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Leave type" htmlFor="lv-type" required>
          <Select id="lv-type" value={type} onChange={(e) => setType(e.target.value)}>
            {LEAVE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </FormRow>
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-ink">Duration</span>
          <div role="radiogroup" aria-label="Duration" className="grid h-10 grid-cols-2 gap-1 rounded-xl border border-line-strong bg-surface-muted p-1">
            {[
              { v: false, l: "Full day(s)" },
              { v: true, l: "Half day" },
            ].map((o) => (
              <button
                key={o.l}
                type="button"
                role="radio"
                aria-checked={half === o.v}
                onClick={() => setHalf(o.v)}
                className={cn("rounded-lg text-[13px] font-medium", half === o.v ? "bg-surface text-brand shadow-sm" : "text-ink-muted hover:text-ink")}
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>
        <FormRow label={half ? "Date" : "From"} htmlFor="lv-from" required error={errors.from}>
          <Input id="lv-from" type="date" value={from} invalid={!!errors.from} onChange={(e) => (setFrom(e.target.value), to < e.target.value && setTo(e.target.value))} />
        </FormRow>
        {!half && (
          <FormRow label="To" htmlFor="lv-to" required error={errors.to}>
            <Input id="lv-to" type="date" value={to} min={from} invalid={!!errors.to} onChange={(e) => setTo(e.target.value)} />
          </FormRow>
        )}
        <FormRow label="Reason" htmlFor="lv-reason" required error={errors.reason} className="sm:col-span-2">
          <Textarea id="lv-reason" rows={3} maxLength={500} value={reason} invalid={!!errors.reason} onChange={(e) => setReason(e.target.value)} />
        </FormRow>

        <div className={cn("flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[13px] sm:col-span-2", over ? "bg-warning-soft" : "bg-brand-softer")}>
          {over && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />}
          <p className="text-ink">
            <span className="font-semibold tabular">
              {days} day{days === 1 ? "" : "s"}
            </span>
            {from && <> · {half ? fmtDay(from, { weekday: "short", day: "numeric", month: "short" }) : `${fmtDay(from, { day: "numeric", month: "short" })} – ${fmtDay(to || from, { day: "numeric", month: "short" })}`}</>}
            {available != null && (
              <span className="text-ink-muted">
                {" "}
                · {available.toFixed(1)} available{over ? " — this will take your balance below zero" : ""}
              </span>
            )}
          </p>
        </div>
        <p className="-mt-2 text-xs text-ink-subtle sm:col-span-2">Only working days (Monday–Friday) are counted. Weekends and holidays on the firm calendar are not deducted.</p>

        {serverError && <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger sm:col-span-2">{serverError}</p>}
      </form>
    </Dialog>
  );
}
