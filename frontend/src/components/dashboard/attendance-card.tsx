"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LogIn, LogOut, MapPin, Timer } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAttendanceToday } from "./queries";

function elapsed(fromIso: string, now: number) {
  const secs = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Best-effort device location. Coordinates are sent to our API, which resolves the place name itself. */
function getPosition(): Promise<{ latitude: number | null; longitude: number | null; location: string }> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve({ latitude: null, longitude: null, location: "Location unavailable" });
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, location: "" }),
      (e) =>
        resolve({
          latitude: null,
          longitude: null,
          location: e.code === e.PERMISSION_DENIED ? "Location permission denied" : "Location unavailable",
        }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

export function AttendanceCard() {
  const { data, isLoading } = useAttendanceToday();
  const { logout } = useAuth();
  const qc = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<{ text: string; stale?: boolean } | null>(null);

  const active = data?.status === "Active" && !!data.activeSession;

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  const punch = useMutation({
    mutationFn: async () => {
      const pos = await getPosition();
      if (active) return api("attendance/logout", { method: "POST", body: pos });
      return api("attendance/check-in", { method: "POST", body: { ...pos, manualCheckIn: true } });
    },
    onMutate: () => setError(null),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["attendance"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === "STALE_TOKEN")
        setError({ text: "For security, attendance can only be marked within an hour of signing in.", stale: true });
      else setError({ text: e instanceof Error ? e.message : "Couldn’t update attendance." });
    },
  });

  const rec = data?.todayRecord;
  // The daily record doesn't store check-out time; the latest closed session does.
  const lastOut =
    rec?.checkOutTime ??
    [...(data?.activeSessions ?? [])].reverse().find((s) => s.check_out_time)?.check_out_time ??
    null;
  const checkInPlace = data?.activeSession?.location_name || data?.activeSession?.check_in_location || data?.checkInLocation;

  return (
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
      <div className="flex flex-1 items-center gap-4">
        <span
          className={cn(
            "grid h-12 w-12 shrink-0 place-items-center rounded-2xl",
            active ? "bg-success-soft text-success" : "bg-brand-soft text-brand",
          )}
        >
          <Timer className="h-6 w-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-medium text-ink-muted">Today’s attendance</p>
            {!isLoading && (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  active ? "bg-success-soft text-success" : "bg-surface-muted text-ink-muted",
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-success animate-pulse" : "bg-neutral")} />
                {active ? "Checked in" : lastOut ? "Checked out" : "Not checked in"}
              </span>
            )}
          </div>
          {isLoading ? (
            <Skeleton className="mt-2 h-7 w-40" />
          ) : active ? (
            <p className="mt-0.5 font-display text-[26px] font-bold text-ink tabular" aria-live="off">
              {elapsed(data!.activeSession!.check_in_time, now)}
            </p>
          ) : (
            <p className="mt-0.5 font-display text-[26px] font-bold text-ink tabular">
              {rec?.checkInTime ? `${(rec.totalHours ?? 0).toFixed(2)} h` : "—"}
            </p>
          )}
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-subtle">
            {rec?.checkInTime && <span>In {formatTime(rec.checkInTime)}</span>}
            {lastOut && !active && <span>Out {formatTime(lastOut)}</span>}
            {checkInPlace && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{checkInPlace}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-stretch gap-2 sm:items-end">
        <Button
          onClick={() => punch.mutate()}
          loading={punch.isPending}
          disabled={isLoading}
          variant={active ? "secondary" : "primary"}
          className={cn("justify-center sm:min-w-[150px]", active && "border-danger/30 text-danger hover:bg-danger-soft")}
        >
          {!punch.isPending && (active ? <LogOut className="h-4 w-4" /> : <LogIn className="h-4 w-4" />)}
          {active ? "Check out" : "Check in"}
        </Button>
        {error && (
          <p role="alert" className="max-w-[280px] text-xs text-danger sm:text-right">
            {error.text}{" "}
            {error.stale && (
              <button onClick={() => logout()} className="font-semibold underline">
                Sign in again
              </button>
            )}
          </p>
        )}
      </div>
    </Card>
  );
}
