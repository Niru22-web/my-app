"use client";

import { History, MapPin } from "lucide-react";
import { formatHours, formatTime } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { useAttendanceToday } from "@/components/dashboard/queries";

/** Every check-in/check-out pair recorded today. */
export function TodaySessions() {
  const { data, isLoading } = useAttendanceToday();
  const sessions = data?.activeSessions ?? [];

  return (
    <Card>
      <CardHeader icon={History} title="Today’s sessions" description="Each check-in and check-out recorded today" />
      {isLoading ? (
        <div className="space-y-2 p-5">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState icon={History} title="No sessions yet today" description="Check in to start recording your day." />
      ) : (
        <ol className="space-y-2 p-4">
          {sessions.map((s, i) => {
            const open = !s.check_out_time;
            return (
              <li key={s.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-xs font-bold text-brand tabular">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink tabular">
                    {formatTime(s.check_in_time)} – {open ? "now" : formatTime(s.check_out_time)}
                  </p>
                  {(s.location_name || s.check_in_location) && (
                    <p className="flex items-center gap-1 truncate text-xs text-ink-subtle">
                      <MapPin className="h-3 w-3 shrink-0" aria-hidden /> {s.location_name || s.check_in_location}
                    </p>
                  )}
                </div>
                {open ? <Badge tone="success">In progress</Badge> : <span className="text-sm font-semibold text-ink tabular">{formatHours((s.duration ?? 0) / 60)}</span>}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
