"use client";

import type { ReactNode } from "react";
import { Pencil, Send, Trash2 } from "lucide-react";
import { fmtDay, workDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { statusOf, type Timelog } from "./api";
import { ownerActions } from "./entry-row";
import { StatusBadge } from "./status-badge";
import { hhmm } from "./hours";

/** Read-only view of one time log, opened from a calendar chip or a list row. */
export function EntryDetailDialog({
  entry,
  privileged,
  onClose,
  onEdit,
  onDelete,
  onSubmit,
}: {
  entry: Timelog | null;
  privileged: boolean;
  onClose: () => void;
  onEdit: (t: Timelog) => void;
  onDelete?: (t: Timelog) => void;
  onSubmit?: (t: Timelog) => void;
}) {
  if (!entry) return null;
  const can = ownerActions(entry, privileged);
  const project = entry.job?.project;
  const client = project?.client;
  const s = statusOf(entry);

  return (
    <Dialog
      open
      onClose={onClose}
      title="Time log"
      description={fmtDay(workDate(entry.date), { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
      footer={
        <>
          {can.remove && onDelete && (
            <Button variant="ghost" className="mr-auto text-danger hover:bg-danger-soft hover:text-danger" onClick={() => onDelete(entry)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
          {can.submit && onSubmit && (
            <Button variant="secondary" onClick={() => onSubmit(entry)}>
              <Send className="h-4 w-4" /> {s === "rejected" ? "Resubmit" : "Submit"}
            </Button>
          )}
          {can.edit && (
            <Button variant="secondary" onClick={() => onEdit(entry)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          )}
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <Item label="Client">{client ? `${client.name}${client.clientId ? ` (${client.clientId})` : ""}` : "—"}</Item>
        <Item label="Project">{project?.name ?? "—"}</Item>
        <Item label="Job">{entry.job ? `${entry.job.jobId} · ${entry.job.name}` : "—"}</Item>
        <Item label="Work item">{entry.workItem || "—"}</Item>
        <Item label="Hours">
          <span className="font-mono text-base font-bold tabular">{hhmm(entry.hours)}</span>
        </Item>
        <Item label="Billable status">{entry.billableStatus === "non_billable" ? "Non-billable" : "Billable"}</Item>
        <Item label="Status">
          <StatusBadge entry={entry} />
        </Item>
        <Item label="Logged on">{formatDate(entry.createdAt, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</Item>
        <div className="sm:col-span-2">
          <dt className="text-xs text-ink-subtle">Description</dt>
          <dd className="mt-0.5 whitespace-pre-wrap text-ink">{entry.description || "—"}</dd>
        </div>
        {s === "rejected" && (
          <div className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger sm:col-span-2">
            <span className="font-semibold">Returned:</span> {entry.rejectionReason || "No reason given."} Edit and resubmit it.
          </div>
        )}
        {s === "approved" && <p className="text-xs text-ink-subtle sm:col-span-2">Approved time is final and can’t be changed.</p>}
      </dl>
    </Dialog>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 break-words text-ink">{children}</dd>
    </div>
  );
}
