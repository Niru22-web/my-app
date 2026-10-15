"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { addDays, fmtDay, today } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormRow, Input, Textarea } from "@/components/ui/inputs";
import { useToast } from "@/components/ui/toast";
import { useSetTimesheetLock, useTimesheetLock } from "./api";

/** Admin: lock timesheets up to a date (after billing or month close), or reopen. */
export function LockDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const lock = useTimesheetLock();
  if (!open) return null;
  return <LockForm key={lock.data?.lockedThrough ?? "none"} onClose={onClose} current={lock.data?.lockedThrough ?? null} history={lock.data?.history ?? []} />;
}

function LockForm({
  onClose,
  current,
  history,
}: {
  onClose: () => void;
  current: string | null;
  history: {
    id: string;
    lockedThrough: string;
    note: string | null;
    by: string;
    at: string;
  }[];
}) {
  const toast = useToast();
  const set = useSetTimesheetLock();
  const yesterday = addDays(today(), -1);
  const [date, setDate] = useState(current ?? yesterday);
  const [note, setNote] = useState("");
  const reopening = !!current && date < current;

  async function save(value: string | null) {
    try {
      await set.mutateAsync({
        lockedThrough: value,
        note: note.trim() || undefined,
      });
      toast.success(value ? `Timesheets locked up to ${fmtDay(value, { day: "numeric", month: "short", year: "numeric" })}` : "All timesheets reopened");
      onClose();
    } catch (e) {
      toast.error("Couldn’t change the lock", e instanceof ApiError ? e.message : undefined);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Lock timesheets"
      description="Locked time can’t be added, edited, deleted or returned — use it after billing or closing a month."
      footer={
        <>
          {current && (
            <Button
              variant="ghost"
              onClick={() => save(null)}
              loading={set.isPending}
              disabled={!note.trim()}
              title={!note.trim() ? "Add a note saying why" : undefined}
            >
              Reopen everything
            </Button>
          )}
          <Button onClick={() => save(date)} loading={set.isPending} disabled={!date || date > yesterday || (reopening && !note.trim())}>
            {reopening ? "Reopen to this date" : "Lock"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="text-sm text-ink-muted">
          {current ? (
            <>
              Currently locked up to{" "}
              <span className="font-semibold text-ink">
                {fmtDay(current, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
              .
            </>
          ) : (
            "Nothing is locked at the moment."
          )}
        </p>
        <FormRow label="Lock everything up to and including" htmlFor="lock-date" hint="Only past days can be locked.">
          <Input id="lock-date" type="date" value={date} max={yesterday} onChange={(e) => setDate(e.target.value)} />
        </FormRow>
        <FormRow
          label="Note"
          htmlFor="lock-note"
          hint={reopening || current ? "Required when reopening a locked period." : "Optional, e.g. “September billed”."}
        >
          <Textarea id="lock-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </FormRow>
        {history.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-ink-subtle">History</p>
            <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-ink-muted">
              {history.slice(0, 10).map((h) => (
                <li key={h.id}>
                  {h.lockedThrough <= "2019-12-31"
                    ? "Reopened everything"
                    : `Locked to ${fmtDay(h.lockedThrough, { day: "numeric", month: "short", year: "numeric" })}`}{" "}
                  · {h.by} · {formatDate(h.at)}
                  {h.note ? ` — ${h.note}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Dialog>
  );
}
