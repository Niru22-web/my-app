"use client";

import { useMemo, useState } from "react";
import { ClipboardList, Pencil, Plus, Send, Trash2, X } from "lucide-react";
import { fmtDay, today, workDate, type YMD } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { statusOf, type Timelog } from "./api";
import { ownerActions } from "./entry-row";
import { StatusBadge } from "./status-badge";
import { hhmm, jobLine } from "./hours";
import { useDayInfo } from "./day-info";

interface Props {
  entries: Timelog[];
  loading: boolean;
  privileged: boolean;
  filtered: boolean;
  onOpen: (t: Timelog) => void;
  onEdit: (t: Timelog) => void;
  onDelete: (t: Timelog) => void;
  onSubmit: (t: Timelog) => void;
  onLog: (d?: YMD) => void;
  onBulkSubmit: (rows: Timelog[]) => void;
  onBulkDelete: (rows: Timelog[]) => void;
}

const editable = (t: Timelog) => ["draft", "rejected"].includes(statusOf(t));

/** Time logs grouped by day (newest first), with selection for bulk submit / delete. */
export function ListView({ entries, loading, privileged, filtered, onOpen, onEdit, onDelete, onSubmit, onLog, onBulkSubmit, onBulkDelete }: Props) {
  const info = useDayInfo();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // Only keep selections that are still on screen.
  const selected = useMemo(() => entries.filter((e) => picked.has(e.id)), [entries, picked]);
  const selectedDrafts = selected.filter(editable);

  const groups = useMemo(() => {
    const map = new Map<YMD, Timelog[]>();
    for (const e of entries) {
      const d = workDate(e.date);
      map.set(d, [...(map.get(d) ?? []), e]);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);

  const toggle = (ids: string[], on: boolean) =>
    setPicked((s) => {
      const n = new Set(s);
      for (const id of ids) {
        if (on) n.add(id);
        else n.delete(id);
      }
      return n;
    });

  if (loading)
    return (
      <Card className="space-y-3 p-5">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </Card>
    );

  if (!groups.length)
    return (
      <Card>
        <EmptyState
          icon={ClipboardList}
          title={filtered ? "No time logs match these filters" : "No time logged for this period"}
          description={filtered ? "Change or reset the filters to see more." : "Use “Log time” or the timer to add your first entry."}
          action={
            !filtered ? (
              <Button size="sm" onClick={() => onLog()}>
                <Plus className="h-4 w-4" /> Log time
              </Button>
            ) : undefined
          }
        />
      </Card>
    );

  return (
    <div className="space-y-3">
      {selected.length > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand-softer px-3 py-2 shadow-card" role="toolbar" aria-label="Bulk actions">
          <span className="text-[13px] font-semibold text-ink">{selected.length} selected</span>
          <span className="text-xs text-ink-subtle">· {hhmm(selected.reduce((s, e) => s + e.hours, 0))}</span>
          <span className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onBulkSubmit(selectedDrafts)} disabled={!selectedDrafts.length}>
              <Send className="h-4 w-4" /> Submit selected{selectedDrafts.length !== selected.length && selectedDrafts.length ? ` (${selectedDrafts.length})` : ""}
            </Button>
            <Button size="sm" variant="danger" onClick={() => onBulkDelete(selectedDrafts)} disabled={!selectedDrafts.length} title="Only drafts and returned entries can be deleted">
              <Trash2 className="h-4 w-4" /> Delete selected
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
              <X className="h-4 w-4" /> Clear
            </Button>
          </span>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="hidden grid-cols-[36px_minmax(0,2.2fr)_minmax(0,2fr)_110px_72px_150px_104px] items-center gap-3 border-b border-line bg-surface-muted px-3 py-2 text-xs font-semibold text-ink-subtle lg:grid">
          <span />
          <span>Job • Project (Client)</span>
          <span>Work item / description</span>
          <span>Billable</span>
          <span className="text-right">Hours</span>
          <span>Status</span>
          <span className="sr-only">Actions</span>
        </div>
        {groups.map(([day, items]) => {
          const total = items.reduce((a, e) => a + e.hours, 0);
          const ids = items.map((e) => e.id);
          const allOn = ids.every((id) => picked.has(id));
          const someOn = !allOn && ids.some((id) => picked.has(id));
          const holiday = info.holidays.get(day);
          const leave = info.leave.get(day);
          return (
            <section key={day} aria-label={fmtDay(day, { weekday: "long", day: "numeric", month: "long" })}>
              <div className="flex items-center gap-3 border-b border-line bg-surface-muted/60 px-3 py-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--brand)]"
                  checked={allOn}
                  ref={(el) => {
                    if (el) el.indeterminate = someOn;
                  }}
                  onChange={() => toggle(ids, !allOn)}
                  aria-label={`Select all entries on ${fmtDay(day)}`}
                />
                <p className="min-w-0 flex-1 text-[13px] font-semibold text-ink">
                  {fmtDay(day, { weekday: "long", day: "numeric", month: "short", year: "numeric" })}
                  {day === today() && <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold uppercase text-brand-ink">Today</span>}
                  {holiday && <span className="ml-2 rounded bg-danger-soft px-1.5 py-0.5 text-[11px] font-medium text-danger">{holiday}</span>}
                  {leave && <span className="ml-2 rounded bg-brand-soft px-1.5 py-0.5 text-[11px] font-medium text-brand">On leave · {leave}</span>}
                </p>
                <span className="font-mono text-[13px] font-bold tabular text-ink">{hhmm(total)}</span>
                {info.canLog(day) && (
                  <button type="button" onClick={() => onLog(day)} className="grid h-7 w-7 place-items-center rounded-lg text-brand hover:bg-brand-soft" aria-label={`Log time on ${fmtDay(day)}`}>
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </div>
              <ul className="divide-y divide-line border-b border-line last:border-b-0">
                {items.map((e) => (
                  <Row key={e.id} entry={e} privileged={privileged} checked={picked.has(e.id)} onCheck={(on) => toggle([e.id], on)} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} onSubmit={onSubmit} />
                ))}
              </ul>
            </section>
          );
        })}
      </Card>
    </div>
  );
}

function Row({
  entry,
  privileged,
  checked,
  onCheck,
  onOpen,
  onEdit,
  onDelete,
  onSubmit,
}: {
  entry: Timelog;
  privileged: boolean;
  checked: boolean;
  onCheck: (on: boolean) => void;
  onOpen: (t: Timelog) => void;
  onEdit: (t: Timelog) => void;
  onDelete: (t: Timelog) => void;
  onSubmit: (t: Timelog) => void;
}) {
  const can = ownerActions(entry, privileged);
  const s = statusOf(entry);
  const iconBtn = "grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink";
  return (
    <li
      className={cn(
        "group grid cursor-pointer grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 px-3 py-2.5 hover:bg-surface-muted/50 lg:grid-cols-[36px_minmax(0,2.2fr)_minmax(0,2fr)_110px_72px_150px_104px] lg:items-center",
        checked && "bg-brand-softer/60",
      )}
      onClick={() => onOpen(entry)}
    >
      <span onClick={(ev) => ev.stopPropagation()} className="pt-0.5 lg:pt-0">
        <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={checked} onChange={(e) => onCheck(e.target.checked)} aria-label={`Select ${entry.job?.name ?? "entry"}`} />
      </span>
      <button type="button" className="min-w-0 text-left" onClick={(ev) => (ev.stopPropagation(), onOpen(entry))}>
        <span className="block truncate text-[13px] font-semibold text-ink">{jobLine(entry.job)}</span>
        <span className="block truncate text-xs text-ink-subtle lg:hidden">{[entry.workItem, entry.description].filter(Boolean).join(" — ") || "No description"}</span>
      </button>
      <span className="font-mono text-sm font-bold tabular text-ink lg:hidden">{hhmm(entry.hours)}</span>
      <span className="hidden min-w-0 text-xs text-ink-muted lg:block">
        {entry.workItem && <span className="block truncate font-medium text-ink">{entry.workItem}</span>}
        <span className="block truncate">{entry.description || "—"}</span>
      </span>
      <span className="col-start-2 flex flex-wrap items-center gap-2 lg:contents">
        <span className={cn("inline-flex w-fit rounded-md px-1.5 py-0.5 text-[11px] font-semibold", entry.billableStatus === "non_billable" ? "bg-surface-muted text-ink-subtle" : "bg-brand-soft text-brand")}>
          {entry.billableStatus === "non_billable" ? "Non-billable" : "Billable"}
        </span>
        <span className="hidden text-right font-mono text-sm font-bold tabular text-ink lg:block">{hhmm(entry.hours)}</span>
        <span>
          <StatusBadge entry={entry} />
        </span>
      </span>
      <span className="col-start-3 row-start-2 flex justify-end gap-0.5 lg:col-start-auto lg:row-start-auto lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100" onClick={(ev) => ev.stopPropagation()}>
        {can.submit && (
          <button type="button" className={cn(iconBtn, "text-brand")} onClick={() => onSubmit(entry)} aria-label={s === "rejected" ? "Resubmit" : "Submit"} title={s === "rejected" ? "Resubmit" : "Submit for approval"}>
            <Send className="h-4 w-4" />
          </button>
        )}
        {can.edit && (
          <button type="button" className={iconBtn} onClick={() => onEdit(entry)} aria-label="Edit" title="Edit">
            <Pencil className="h-4 w-4" />
          </button>
        )}
        {can.remove && (
          <button type="button" className={cn(iconBtn, "hover:bg-danger-soft hover:text-danger")} onClick={() => onDelete(entry)} aria-label="Delete" title="Delete">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </span>
    </li>
  );
}
