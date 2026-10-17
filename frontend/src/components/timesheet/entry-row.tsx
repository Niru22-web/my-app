"use client";

import { MoreHorizontal, Pencil, Send, Trash2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useDismiss } from "@/lib/use-outside";
import { formatHours } from "@/lib/format";
import { statusOf, type Timelog } from "./api";
import { StatusBadge } from "./status-badge";

export interface RowActions {
  onEdit?: (t: Timelog) => void;
  onDelete?: (t: Timelog) => void;
  onSubmit?: (t: Timelog) => void;
}

/** What the owner of an entry may do with it, following the API's rules. */
export function ownerActions(t: Timelog, privileged: boolean) {
  const s = statusOf(t);
  return {
    edit: s === "draft" || s === "submitted" || (privileged && s !== "approved"),
    remove: s === "draft" || s === "rejected",
    submit: s === "draft" || s === "rejected",
  };
}

export function EntryRow({ entry, privileged, actions }: { entry: Timelog; privileged: boolean; actions: RowActions }) {
  const can = ownerActions(entry, privileged);
  const project = entry.job?.project;
  const client = project?.client;
  const s = statusOf(entry);

  return (
    <li className="group flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-start sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-semibold text-ink">{project?.name ?? "Unknown project"}</span>
          {client?.name && <span className="truncate text-xs text-ink-subtle">· {client.name}</span>}
        </div>
        <p className="mt-0.5 text-xs text-ink-muted">
          <span className="font-medium text-ink-muted">{entry.job?.jobId}</span>
          {entry.job?.name ? ` · ${entry.job.name}` : ""}
          {entry.workItem ? ` · ${entry.workItem}` : ""}
        </p>
        <p className="mt-1.5 line-clamp-2 text-[13px] text-ink">{entry.description}</p>
        {s === "rejected" && entry.rejectionReason && (
          <p className="mt-2 rounded-lg bg-danger-soft px-2.5 py-1.5 text-xs text-danger">
            <span className="font-semibold">Returned:</span> {entry.rejectionReason}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-start">
        <div className="flex items-center gap-2">
          <span className="font-display text-base font-bold text-ink tabular">{formatHours(entry.hours)}</span>
          <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase", entry.billableStatus === "non_billable" ? "bg-surface-muted text-ink-subtle" : "bg-brand-soft text-brand")}>
            {entry.billableStatus === "non_billable" ? "Non-bill" : "Billable"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusBadge entry={entry} />
          {(can.edit || can.remove || can.submit) && <RowMenu entry={entry} can={can} actions={actions} />}
        </div>
      </div>
    </li>
  );
}

function RowMenu({ entry, can, actions }: { entry: Timelog; can: ReturnType<typeof ownerActions>; actions: RowActions }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  const item = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-surface-muted";
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink"
        aria-label="Entry actions"
        aria-expanded={open}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-20 w-44 rounded-xl border border-line bg-surface p-1 shadow-pop">
          {can.submit && actions.onSubmit && (
            <button className={item} onClick={() => (close(), actions.onSubmit!(entry))}>
              <Send className="h-4 w-4 text-brand" /> {statusOf(entry) === "rejected" ? "Resubmit" : "Submit"}
            </button>
          )}
          {can.edit && actions.onEdit && (
            <button className={item} onClick={() => (close(), actions.onEdit!(entry))}>
              <Pencil className="h-4 w-4 text-ink-muted" /> Edit
            </button>
          )}
          {can.remove && actions.onDelete && (
            <button className={cn(item, "text-danger hover:bg-danger-soft")} onClick={() => (close(), actions.onDelete!(entry))}>
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
