"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Play, Square, Timer as TimerIcon, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { fmtDay, toYMD, today } from "@/lib/dates";
import { readLocal, useLocalValue, writeLocal } from "@/lib/local-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { FormRow, Select, Textarea } from "@/components/ui/inputs";
import { useToast } from "@/components/ui/toast";
import { useClients, useJobs, useProjects, useTimelogMutations } from "./api";
import { clock, hhmm, roundUpQuarter } from "./hours";

// ---- Timer state (localStorage, survives navigation and reloads) -------------------

export interface TimerState {
  clientId: string;
  projectId: string;
  jobId: string;
  /** "Job name • Project (Client)" captured when the job was picked, for display anywhere. */
  jobLabel: string;
  description: string;
  /** null = follow the project's default */
  billable: boolean | null;
  /** epoch ms; null = not running */
  startedAt: number | null;
}

const KEY = "asa:timesheet-timer";
const EMPTY: TimerState = { clientId: "", projectId: "", jobId: "", jobLabel: "", description: "", billable: null, startedAt: null };

function parse(raw: string | null | undefined): TimerState {
  if (!raw) return EMPTY;
  try {
    const v = JSON.parse(raw) as Partial<TimerState>;
    return { ...EMPTY, ...v, startedAt: typeof v.startedAt === "number" ? v.startedAt : null };
  } catch {
    return EMPTY;
  }
}

export function useTimer() {
  const raw = useLocalValue(KEY);
  return parse(raw);
}

export function updateTimer(patch: Partial<TimerState>) {
  writeLocal(KEY, JSON.stringify({ ...parse(readLocal(KEY)), ...patch }));
}

export function clearTimer() {
  writeLocal(KEY, null);
}

/** Starts a timer for a job right away (used by the Log time dialog's "Timer" option). */
export function startTimer(s: Omit<TimerState, "startedAt">): string | null {
  const cur = parse(readLocal(KEY));
  if (cur.startedAt) return `A timer is already running for ${cur.jobLabel || "another job"}. Stop it first.`;
  writeLocal(KEY, JSON.stringify({ ...s, startedAt: Date.now() }));
  return null;
}

/** Current time, re-rendering every second while `active`. */
export function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

// ---- Header indicator ------------------------------------------------------------

/** Small "timer running" pill for page headers. Renders nothing when no timer runs. */
export function TimerIndicator({ href }: { href?: string }) {
  const t = useTimer();
  const now = useNow(!!t.startedAt);
  if (!t.startedAt) return null;
  const body = (
    <>
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
      </span>
      <span className="font-mono tabular">{clock(now - t.startedAt)}</span>
      <span className="hidden max-w-[180px] truncate text-ink-muted md:inline">{t.jobLabel}</span>
    </>
  );
  const cls = "inline-flex h-9 items-center gap-2 rounded-full border border-success/40 bg-success-soft px-3 text-[13px] font-semibold text-success";
  return href ? (
    <Link href={href} className={cls} title="Timer running — open Time logs">
      {body}
    </Link>
  ) : (
    <span className={cls} role="status" aria-label="Timer running">
      {body}
    </span>
  );
}

// ---- Timer bar ---------------------------------------------------------------------

const inactive = (s?: string) => !["active", "started"].includes((s ?? "").toLowerCase());

/** Zoho-style running timer: pick the job, say what you're doing, start; stop logs the time for the start day. */
export function TimerBar() {
  const t = useTimer();
  const running = !!t.startedAt;
  const now = useNow(running);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clients = useClients();
  const projects = useProjects(t.clientId || undefined);
  const projectOptions = (projects.data ?? []).filter((p) => p.clientId === t.clientId && (p.status ?? "").toLowerCase() !== "inactive");
  const jobs = useJobs(t.projectId || undefined);
  const jobOptions = (jobs.data ?? []).filter((j) => !inactive(j.status) || j.id === t.jobId);
  const project = projectOptions.find((p) => p.id === t.projectId);
  const billable = t.billable ?? (typeof project?.billable === "boolean" ? project.billable : true);

  function pickJob(jobId: string) {
    const j = jobOptions.find((x) => x.id === jobId);
    const c = (clients.data ?? []).find((x) => x.id === t.clientId);
    updateTimer({ jobId, jobLabel: j ? `${j.name} • ${project?.name ?? ""}${c ? ` (${c.name})` : ""}` : "" });
  }

  function start() {
    setError(null);
    if (!t.jobId) return setError("Choose a client, project and job first.");
    updateTimer({ startedAt: Date.now(), billable });
  }

  return (
    <Card className="p-3">
      <div className="flex flex-col gap-2 2xl:flex-row 2xl:items-center">
        <div className="grid gap-2 sm:grid-cols-3 2xl:w-[560px] 2xl:flex-none">
          <Select
            aria-label="Client"
            value={t.clientId}
            disabled={running}
            onChange={(e) => updateTimer({ clientId: e.target.value, projectId: "", jobId: "", jobLabel: "", billable: null })}
          >
            <option value="">{clients.isLoading ? "Loading…" : "Client"}</option>
            {(clients.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Project"
            value={t.projectId}
            disabled={running || !t.clientId}
            onChange={(e) => updateTimer({ projectId: e.target.value, jobId: "", jobLabel: "", billable: null })}
          >
            <option value="">{t.clientId && projects.isLoading ? "Loading…" : "Project"}</option>
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select aria-label="Job" value={t.jobId} disabled={running || !t.projectId} onChange={(e) => pickJob(e.target.value)}>
            <option value="">{t.projectId && jobs.isLoading ? "Loading…" : "Job"}</option>
            {jobOptions.map((j) => (
              <option key={j.id} value={j.id}>
                {j.jobId} · {j.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        <input
          aria-label="What are you working on?"
          placeholder="What are you working on?"
          value={t.description}
          maxLength={1000}
          onChange={(e) => updateTimer({ description: e.target.value })}
          className="h-10 w-full min-w-0 shrink-0 rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-subtle focus:border-brand focus:ring-4 focus:ring-brand/10 sm:w-auto sm:flex-1"
        />
        <div className="flex items-center gap-2">
          <Select aria-label="Billable status" value={billable ? "billable" : "non_billable"} disabled={running} onChange={(e) => updateTimer({ billable: e.target.value === "billable" })} className="w-[150px] flex-1 sm:flex-none">
            <option value="billable">Billable</option>
            <option value="non_billable">Non-billable</option>
          </Select>
          {running ? (
            <button
              type="button"
              onClick={() => setStopping(true)}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-danger px-4 font-mono text-sm font-semibold text-white tabular shadow-sm hover:opacity-90"
              aria-label="Stop timer"
            >
              {clock(now - t.startedAt!)} <Square className="h-4 w-4 fill-current" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              onClick={start}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-success px-4 font-mono text-sm font-semibold text-white tabular shadow-sm hover:opacity-90"
              aria-label="Start timer"
            >
              00:00:00 <Play className="h-4 w-4 fill-current" aria-hidden />
            </button>
          )}
        </div>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
      {running && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-subtle">
          <TimerIcon className="h-3.5 w-3.5" aria-hidden /> Started {new Date(t.startedAt!).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          {toYMD(new Date(t.startedAt!)) !== today() ? ` on ${fmtDay(toYMD(new Date(t.startedAt!)))}` : ""} · {t.jobLabel}. The timer keeps running if you leave this page.
        </p>
      )}
      {stopping && running && <StopTimerDialog timer={t} onClose={() => setStopping(false)} />}
    </Card>
  );
}

function StopTimerDialog({ timer, onClose }: { timer: TimerState; onClose: () => void }) {
  const toast = useToast();
  const m = useTimelogMutations();
  const [stoppedAt] = useState(() => Date.now());
  const [description, setDescription] = useState(timer.description);
  const [error, setError] = useState<string | null>(null);
  const elapsedH = (stoppedAt - timer.startedAt!) / 3_600_000;
  const hours = roundUpQuarter(elapsedH);
  const startDay = toYMD(new Date(timer.startedAt!));
  const crossedMidnight = startDay !== toYMD(new Date(stoppedAt));
  const tooLong = hours > 24;

  async function save() {
    setError(null);
    if (description.trim().length < 10) return setError("desc");
    try {
      await m.create.mutateAsync({ jobId: timer.jobId, hours, description: description.trim(), date: startDay, workItem: "", isBillable: timer.billable ?? true });
      clearTimer();
      toast.success("Time logged", `${hhmm(hours)} on ${fmtDay(startDay)}`);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn’t save the time. Please try again.");
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Stop timer"
      description={timer.jobLabel}
      footer={
        <>
          <Button
            variant="ghost"
            className="mr-auto text-danger hover:bg-danger-soft hover:text-danger"
            onClick={() => {
              clearTimer();
              toast.success("Timer discarded");
              onClose();
            }}
          >
            <Trash2 className="h-4 w-4" /> Discard
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Keep running
          </Button>
          <Button onClick={save} loading={m.create.isPending} disabled={tooLong}>
            Log {hhmm(hours)}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-surface-muted px-3 py-2.5">
            <p className="text-[11px] text-ink-subtle">Timer</p>
            <p className="font-mono text-lg font-bold tabular text-ink">{clock(stoppedAt - timer.startedAt!)}</p>
          </div>
          <div className="rounded-xl bg-brand-softer px-3 py-2.5">
            <p className="text-[11px] text-ink-subtle">Will be logged</p>
            <p className="font-mono text-lg font-bold tabular text-brand">{hhmm(hours)}</p>
          </div>
          <div className="rounded-xl bg-surface-muted px-3 py-2.5">
            <p className="text-[11px] text-ink-subtle">On</p>
            <p className="text-sm font-semibold text-ink">{fmtDay(startDay)}</p>
          </div>
        </div>
        <p className="text-xs text-ink-subtle">Time is rounded up to the next 15 minutes.</p>
        {crossedMidnight && !tooLong && (
          <p className="rounded-xl bg-warning-soft px-3 py-2 text-[13px] text-ink">
            The timer ran past midnight. All of it will be logged on {fmtDay(startDay, { weekday: "long", day: "numeric", month: "short" })}, the day it started. Edit the entry
            afterwards if you need to split it across days.
          </p>
        )}
        {tooLong && (
          <p className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">
            The timer ran for more than 24 hours, which can’t be logged as one entry. Discard it and use “Log time” to enter the hours yourself.
          </p>
        )}
        <FormRow label="Work description" htmlFor="tm-desc" required error={error === "desc" ? "Describe the work in at least 10 characters." : undefined}>
          <Textarea id="tm-desc" rows={3} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What did you work on?" />
        </FormRow>
        {error && error !== "desc" && (
          <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
