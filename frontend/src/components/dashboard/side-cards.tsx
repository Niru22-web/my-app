"use client";

import { Activity, CalendarDays, Cake } from "lucide-react";
import type { CombinedDashboard } from "@/lib/types";
import { timeAgo } from "@/lib/notifications";
import { cn } from "@/lib/cn";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar } from "@/components/ui/avatar";
import { splitShortDate } from "./queries";

function ListSkeleton() {
  return (
    <div className="space-y-3 p-5">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-12" />
      ))}
    </div>
  );
}

export function EventsCard({ data, loading }: { data?: CombinedDashboard; loading: boolean }) {
  const events = data?.events ?? [];
  return (
    <Card>
      <CardHeader icon={CalendarDays} title="Coming up" description="Holidays, meetings and firm events" />
      {loading ? (
        <ListSkeleton />
      ) : events.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No events this month" />
      ) : (
        <ul className="space-y-1 p-3">
          {events.slice(0, 6).map((e) => {
            const { day, month } = splitShortDate(e.date);
            const holiday = e.type?.toLowerCase() === "holiday";
            return (
              <li key={e.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-muted">
                <span className={cn("flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl", holiday ? "bg-brand text-brand-ink" : "bg-brand-soft text-brand")}>
                  <span className="text-[15px] font-bold leading-none tabular">{day}</span>
                  <span className="mt-0.5 text-[10px] font-semibold uppercase leading-none">{month}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{e.title}</span>
                  <span className="block text-xs text-ink-subtle">
                    {e.type}
                    {e.time ? ` · ${e.time}` : ""}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function BirthdaysCard({ data, loading }: { data?: CombinedDashboard; loading: boolean }) {
  const list = data?.birthdays ?? [];
  return (
    <Card>
      <CardHeader icon={Cake} title="Birthdays" description="Coming up this month" />
      {loading ? (
        <ListSkeleton />
      ) : list.length === 0 ? (
        <EmptyState icon={Cake} title="No more birthdays this month" />
      ) : (
        <ul className="space-y-1 p-3">
          {list.map((b, i) => {
            const { day, month } = splitShortDate(b.date);
            return (
              <li key={`${b.name}-${i}`} className="flex items-center gap-3 rounded-xl px-2 py-2">
                <Avatar name={b.name} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{b.name}</span>
                  {b.role && <span className="block truncate text-xs text-ink-subtle">{b.role}</span>}
                </span>
                <span className="shrink-0 text-xs font-semibold text-brand tabular">
                  {day} {month}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function ActivityCard({ data, loading, firmWide }: { data?: CombinedDashboard; loading: boolean; firmWide: boolean }) {
  const items = data?.activities ?? [];
  return (
    <Card>
      <CardHeader icon={Activity} title="Recent activity" description={firmWide ? "Across the firm" : "Your latest actions"} />
      {loading ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
        <EmptyState icon={Activity} title="No recent activity" />
      ) : (
        <ol tabIndex={0} aria-label="Recent activity" className="relative max-h-[420px] space-y-4 overflow-y-auto p-5 [scrollbar-gutter:stable] before:absolute before:bottom-6 before:left-[27px] before:top-6 before:w-px before:bg-line">
          {items.map((a, i) => (
            <li key={i} className="relative flex gap-3 pl-0">
              <span className="relative z-10 mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-[3px] border-surface bg-brand" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{a.title}</p>
                {a.who && <p className="text-xs font-medium text-ink-muted">{a.who}</p>}
                {a.description && <p className="line-clamp-2 text-xs text-ink-muted">{a.description}</p>}
                <p className="mt-0.5 text-[11px] text-ink-subtle">{timeAgo(a.createdAt)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
