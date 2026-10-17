"use client";

import { useMemo, useState } from "react";
import { ImportButton } from "@/components/ui/import-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cake, CalendarDays, ChevronLeft, ChevronRight, Clock, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import { addDays, endOfMonth, fmtDay, startOfMonth, today, workDate, type YMD } from "@/lib/dates";
import { normRole } from "@/lib/roles";
import { cn } from "@/lib/cn";
import type { Envelope } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MonthGrid } from "@/components/ui/month-grid";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm";
import { FormRow, Input } from "@/components/ui/inputs";
import { useToast } from "@/components/ui/toast";
import { useCombinedDashboard, splitShortDate } from "@/components/dashboard/queries";

interface CalEvent {
  id: string;
  title: string;
  date: string;
  time: string | null;
  type: string;
  createdBy?: { firstName: string; lastName: string } | null;
}
type Item = { key: string; kind: "event" | "birthday"; title: string; type: string; time?: string | null; ev?: CalEvent };

const TYPES = ["Event", "Meeting", "Holiday"] as const;
const DOT: Record<string, string> = { Holiday: "bg-danger", Meeting: "bg-brand", Event: "bg-success", Birthday: "bg-warning" };
const TONE: Record<string, "danger" | "brand" | "success" | "warning" | "neutral"> = { Holiday: "danger", Meeting: "brand", Event: "success", Birthday: "warning" };

/** Matches the backend's role check for creating/deleting events. */
function canManageEvents(role?: string) {
  const r = normRole(role);
  return ["admin", "hr", "partner", "manager", "owner"].includes(r);
}

export default function CalendarPage() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const manage = canManageEvents(user?.role);
  const now = today();
  const [month, setMonth] = useState<YMD>(startOfMonth(now));
  const [selected, setSelected] = useState<YMD>(now);
  const [filter, setFilter] = useState<"all" | "Holiday" | "Meeting" | "Event">("all");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<CalEvent | null>(null);

  const q = useQuery({
    queryKey: ["events"],
    queryFn: async () => (await api<Envelope<CalEvent[]>>("events")).data ?? [],
  });
  // Birthdays come from the dashboard feed (current month, today onward) — never from the employee directory.
  const dash = useCombinedDashboard();

  const byDay = useMemo(() => {
    const m = new Map<YMD, Item[]>();
    const push = (d: YMD, it: Item) => m.set(d, [...(m.get(d) ?? []), it]);
    for (const e of q.data ?? []) {
      if (filter !== "all" && e.type !== filter) continue;
      push(workDate(e.date), { key: e.id, kind: "event", title: e.title, type: e.type, time: e.time, ev: e });
    }
    if (filter === "all") {
      const cur = startOfMonth(now);
      for (const b of dash.data?.birthdays ?? []) {
        const { day } = splitShortDate(b.date);
        const n = Number(day);
        if (!n) continue;
        push(`${cur.slice(0, 8)}${String(n).padStart(2, "0")}`, { key: `b-${b.name}-${n}`, kind: "birthday", title: `${b.name}’s birthday`, type: "Birthday" });
      }
    }
    for (const list of m.values()) list.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
    return m;
  }, [q.data, dash.data, filter, now]);

  const upcoming = useMemo(() => {
    const out: { day: YMD; it: Item }[] = [];
    for (let d = now; d <= addDays(now, 60) && out.length < 8; d = addDays(d, 1)) for (const it of byDay.get(d) ?? []) out.push({ day: d, it });
    return out.slice(0, 8);
  }, [byDay, now]);

  const holidaysThisMonth = useMemo(
    () => (q.data ?? []).filter((e) => e.type === "Holiday" && workDate(e.date) >= month && workDate(e.date) <= endOfMonth(month)).length,
    [q.data, month],
  );

  const del = useMutation({
    mutationFn: (id: string) => api(`events/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Event removed");
      setRemoving(null);
      void qc.invalidateQueries({ queryKey: ["events"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error("Couldn’t remove the event", e instanceof ApiError ? e.message : undefined),
  });

  const shift = (n: number) => {
    const d = new Date(`${month}T00:00:00`);
    d.setMonth(d.getMonth() + n);
    setMonth(startOfMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`));
  };
  const dayItems = byDay.get(selected) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        description="Firm holidays, meetings and events"
        actions={
          manage && (
            <>
              {["admin", "owner", "hr"].includes(normRole(user?.role)) && <ImportButton kind="holidays" label="Holidays" invalidate={[["events"], ["dashboard"]]} />}
              <Button onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" /> Add event
              </Button>
            </>
          )
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="icon" aria-label="Previous month" onClick={() => shift(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h2 className="min-w-40 text-center text-base font-semibold text-ink">{fmtDay(month, { month: "long", year: "numeric" })}</h2>
              <Button variant="secondary" size="icon" aria-label="Next month" onClick={() => shift(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              {month !== startOfMonth(now) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setMonth(startOfMonth(now));
                    setSelected(now);
                  }}
                >
                  Today
                </Button>
              )}
            </div>
            <Segmented
              aria-label="Show"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "Holiday", label: "Holidays" },
                { value: "Meeting", label: "Meetings" },
                { value: "Event", label: "Events" },
              ]}
            />
          </div>
          {q.isError ? (
            <Card>
              <ErrorState error={q.error} message="Events couldn’t be loaded." onRetry={() => q.refetch()} />
            </Card>
          ) : q.isLoading ? (
            <Skeleton className="h-[560px]" />
          ) : (
            <MonthGrid
              month={month}
              selected={selected}
              onSelect={setSelected}
              renderDay={(d, inMonth) => {
                const items = inMonth ? (byDay.get(d) ?? []) : [];
                return (
                  <>
                    <ul className="hidden space-y-0.5 sm:block">
                      {items.slice(0, 2).map((it) => (
                        <li key={it.key} className={cn("truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium", it.type === "Holiday" ? "bg-danger/10 text-danger" : it.type === "Birthday" ? "bg-warning/15 text-ink" : "bg-brand-softer text-brand")}>
                          {it.title}
                        </li>
                      ))}
                      {items.length > 2 && <li className="px-1.5 text-[11px] text-ink-subtle">+{items.length - 2} more</li>}
                    </ul>
                    {items.length > 0 && (
                      <span className="flex gap-0.5 sm:hidden">
                        {items.slice(0, 3).map((it) => (
                          <span key={it.key} className={cn("h-1.5 w-1.5 rounded-full", DOT[it.type] ?? "bg-neutral")} />
                        ))}
                      </span>
                    )}
                  </>
                );
              }}
            />
          )}
          <p className="text-xs text-ink-subtle">
            {holidaysThisMonth ? `${holidaysThisMonth} holiday${holidaysThisMonth === 1 ? "" : "s"} this month. ` : ""}Birthdays appear for the current month only.
          </p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader icon={CalendarDays} title={fmtDay(selected, { weekday: "long", day: "numeric", month: "long" })} />
            {dayItems.length === 0 ? (
              <EmptyState title="Nothing scheduled" className="py-8" />
            ) : (
              <ul className="divide-y divide-line px-5 pb-2">
                {dayItems.map((it) => (
                  <li key={it.key} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium text-ink">
                        {it.kind === "birthday" && <Cake className="h-4 w-4 text-warning" aria-hidden />}
                        <span className="truncate">{it.title}</span>
                      </p>
                      <p className="mt-0.5 flex items-center gap-2 text-xs text-ink-subtle">
                        <Badge tone={TONE[it.type] ?? "neutral"}>{it.type}</Badge>
                        {it.time && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" aria-hidden /> {it.time}
                          </span>
                        )}
                        {it.ev?.createdBy && <span className="truncate">by {it.ev.createdBy.firstName} {it.ev.createdBy.lastName}</span>}
                      </p>
                    </div>
                    {manage && it.ev && (
                      <Button variant="ghost" size="icon" aria-label={`Remove ${it.title}`} onClick={() => setRemoving(it.ev!)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader icon={Clock} title="Coming up" description="Next 60 days" />
            {q.isLoading ? (
              <Skeleton className="m-5 h-32" />
            ) : upcoming.length === 0 ? (
              <EmptyState title="Nothing coming up" className="py-8" />
            ) : (
              <ul className="space-y-1 px-3 pb-3">
                {upcoming.map(({ day, it }) => (
                  <li key={`${day}-${it.key}`}>
                    <button
                      className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-muted"
                      onClick={() => {
                        setMonth(startOfMonth(day));
                        setSelected(day);
                      }}
                    >
                      <span className="grid w-11 shrink-0 place-items-center rounded-lg bg-brand-softer py-1 text-brand">
                        <span className="text-[10px] font-semibold uppercase">{fmtDay(day, { month: "short" })}</span>
                        <span className="text-base font-bold leading-none tabular">{Number(day.slice(8))}</span>
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">{it.title}</span>
                        <span className="block text-xs text-ink-subtle">{[it.type, it.time].filter(Boolean).join(" · ")}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {adding && <AddEventDialog initialDate={selected} onClose={() => setAdding(false)} onSaved={(d) => (setMonth(startOfMonth(d)), setSelected(d))} />}

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        tone="danger"
        title={`Remove “${removing?.title}”?`}
        confirmLabel="Remove"
        busy={del.isPending}
        description="It disappears from everyone’s calendar and dashboard. Events can’t be edited, so to change one, remove it and add it again."
        onConfirm={() => removing && del.mutate(removing.id)}
      />
    </div>
  );
}

function AddEventDialog({ initialDate, onClose, onSaved }: { initialDate: YMD; onClose: () => void; onSaved: (d: YMD) => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<YMD>(initialDate);
  const [time, setTime] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]>("Event");
  const [tried, setTried] = useState(false);

  const save = useMutation({
    mutationFn: () => api("events", { method: "POST", body: { title: title.trim(), date, time: type === "Holiday" ? undefined : time || undefined, type } }),
    onSuccess: () => {
      toast.success("Event added");
      void qc.invalidateQueries({ queryKey: ["events"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      onSaved(date);
      onClose();
    },
    onError: (e) => toast.error("Couldn’t add the event", e instanceof ApiError ? e.message : undefined),
  });
  const err = tried && !title.trim() ? "Give the event a title" : tried && !date ? "Pick a date" : undefined;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add to the firm calendar"
      description="Everyone in the firm sees this on their calendar and dashboard."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={save.isPending}
            onClick={() => {
              setTried(true);
              if (title.trim() && date) save.mutate();
            }}
          >
            Add event
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormRow label="Type" htmlFor="ev-type">
          <Segmented aria-label="Type" value={type} onChange={setType} options={TYPES.map((t) => ({ value: t, label: t }))} />
        </FormRow>
        <FormRow label="Title" htmlFor="ev-title" required error={tried && !title.trim() ? err : undefined}>
          <Input id="ev-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={type === "Holiday" ? "e.g. Diwali" : "e.g. Quarterly partners’ meeting"} invalid={tried && !title.trim()} />
        </FormRow>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormRow label="Date" htmlFor="ev-date" required>
            <Input id="ev-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </FormRow>
          {type !== "Holiday" && (
            <FormRow label="Time" htmlFor="ev-time" hint="Optional">
              <Input id="ev-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </FormRow>
          )}
        </div>
        {type === "Holiday" && <p className="text-xs text-ink-subtle">Holidays are shown to everyone and aren’t deducted when someone applies for leave over them.</p>}
      </div>
    </Dialog>
  );
}
