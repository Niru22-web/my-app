"use client";

import { useState, type DragEvent } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/cn";
import { assetUrl } from "@/lib/api";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { BUG_STATUSES, type Bug } from "./api";
import { InlineSelect, PriorityChip, StatusDot } from "./chips";

/**
 * Kanban view: one column per status. Cards can be dragged to a column the person may move them to
 * (the API decides, via allowedStatuses); each card also has a status menu for keyboard users.
 */
export function BugBoard({ rows, loading, onMove }: { rows: Bug[]; loading?: boolean; onMove: (bug: Bug, status: string) => void }) {
  const [dragging, setDragging] = useState<Bug | null>(null);
  const [over, setOver] = useState<string | null>(null);

  if (loading)
    return (
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
        {BUG_STATUSES.map((s) => (
          <Skeleton key={s} className="h-64" />
        ))}
      </div>
    );

  const canDrop = (status: string) => !!dragging && dragging.allowedStatuses.includes(status);
  const drop = (status: string) => (e: DragEvent) => {
    e.preventDefault();
    setOver(null);
    if (dragging && canDrop(status)) onMove(dragging, status);
    setDragging(null);
  };

  return (
    <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2" role="list" aria-label="Tickets by status">
      {BUG_STATUSES.map((status) => {
        const cards = rows.filter((r) => r.status === status);
        const droppable = canDrop(status);
        return (
          <section
            key={status}
            role="listitem"
            aria-label={`${status}, ${cards.length} tickets`}
            onDragOver={(e) => {
              if (!droppable) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setOver(status);
            }}
            onDragLeave={() => setOver((o) => (o === status ? null : o))}
            onDrop={drop(status)}
            className={cn(
              "flex w-72 shrink-0 snap-start flex-col rounded-xl border bg-surface-muted/50 transition-colors",
              over === status ? "border-brand bg-brand-softer" : droppable ? "border-dashed border-brand/50" : "border-line",
              dragging && !droppable && dragging.status !== status && "opacity-60",
            )}
          >
            <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
              <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                <StatusDot status={status} /> {status}
              </span>
              <span className="rounded-full bg-surface px-2 text-[11px] font-semibold text-ink-muted tabular">{cards.length}</span>
            </header>
            <ul className="flex max-h-[65vh] min-h-24 flex-col gap-2 overflow-y-auto p-2">
              {cards.length === 0 && <li className="px-2 py-6 text-center text-xs text-ink-subtle">No tickets</li>}
              {cards.map((b) => (
                <li
                  key={b.id}
                  draggable={b.allowedStatuses.length > 0}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", b.id);
                    setDragging(b);
                  }}
                  onDragEnd={() => (setDragging(null), setOver(null))}
                  className={cn(
                    "rounded-lg border border-line bg-surface p-3 shadow-sm",
                    b.allowedStatuses.length > 0 && "cursor-grab active:cursor-grabbing",
                    dragging?.id === b.id && "opacity-50",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/bugs/${b.id}`} className="font-mono text-[11px] font-semibold text-brand hover:underline">
                      {b.code}
                    </Link>
                    <PriorityChip priority={b.priority} />
                  </div>
                  <Link href={`/bugs/${b.id}`} className="mt-1.5 line-clamp-2 block text-[13px] font-medium text-ink hover:text-brand">
                    {b.title}
                  </Link>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className={cn("text-[11px]", b.isPastDue ? "font-semibold text-danger" : "text-ink-subtle")}>
                      {b.dueDate ? `${b.isPastDue ? "Overdue · " : "Due "}${new Date(b.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}` : "No due date"}
                    </span>
                    <span className="flex items-center gap-2">
                      {b.commentCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[11px] text-ink-subtle" title={`${b.commentCount} comments`}>
                          <MessageSquare className="h-3 w-3" aria-hidden /> {b.commentCount}
                        </span>
                      )}
                      {b.assignee ? (
                        <span title={`Assigned to ${b.assignee.name}`}>
                          <Avatar name={b.assignee.name} src={assetUrl(b.assignee.profileImage)} size={22} />
                        </span>
                      ) : (
                        <span className="text-[11px] italic text-ink-subtle">Unassigned</span>
                      )}
                    </span>
                  </div>
                  {b.allowedStatuses.length > 0 && (
                    <InlineSelect className="mt-2" label={`Move ${b.code}`} value="" onChange={(v) => v && onMove(b, v)}>
                      <option value="">Move to…</option>
                      {b.allowedStatuses.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </InlineSelect>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
