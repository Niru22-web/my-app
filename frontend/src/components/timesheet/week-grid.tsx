"use client";

import { useMemo, useState } from "react";
import { Lock, Plus, Save, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { fmtDay, today, type YMD } from "@/lib/dates";
import { isWeeklyOff, standardDayHours } from "@/lib/work-calendar";
import { formatHours } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { FormRow, Select } from "@/components/ui/inputs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { statusOf, useClients, useJobs, useProjects, useTimelogMutations, useTimesheetLock, type Timelog } from "./api";

interface Row {
  jobId: string;
  label: string;
  sub: string;
}

const isDraft = (t: Timelog) => ["draft", "rejected"].includes(statusOf(t));

/** Accepts "7.5", "7,5" or "7:30". Empty = 0. NaN when unreadable. */
function parseHours(v: string): number {
  const s = v.trim();
  if (!s) return 0;
  const hm = s.match(/^(\d{1,2}):([0-5]\d)$/);
  if (hm) return Number(hm[1]) + Number(hm[2]) / 60;
  return Number(s.replace(",", "."));
}

/**
 * Weekly timesheet: one row per job, one column per day. Typing changes your drafts; Save sends the whole week.
 * Submitted, approved and locked time is shown but can't be changed here.
 */
export function WeekGrid({ days, entries, loading }: { days: YMD[]; entries: Timelog[]; loading: boolean }) {
  const toast = useToast();
  const m = useTimelogMutations();
  const lock = useTimesheetLock();
  const lockedThrough = lock.data?.lockedThrough ?? null;
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [extraRows, setExtraRows] = useState<Row[]>([]);
  const [picker, setPicker] = useState(false);

  const rows = useMemo(() => {
    const map = new Map<string, Row>();
    for (const e of entries) {
      if (!map.has(e.jobId)) {
        map.set(e.jobId, {
          jobId: e.jobId,
          label: e.job ? `${e.job.jobId} · ${e.job.name}` : "Job",
          sub: [e.job?.project?.client?.alias || e.job?.project?.client?.name, e.job?.project?.name].filter(Boolean).join(" · "),
        });
      }
    }
    for (const r of extraRows) if (!map.has(r.jobId)) map.set(r.jobId, r);
    return [...map.values()];
  }, [entries, extraRows]);

  const draftHours = (jobId: string, day: YMD) =>
    entries.filter((e) => e.jobId === jobId && e.date.slice(0, 10) === day && isDraft(e)).reduce((s, e) => s + e.hours, 0);
  const fixedHours = (jobId: string, day: YMD) =>
    entries.filter((e) => e.jobId === jobId && e.date.slice(0, 10) === day && !isDraft(e)).reduce((s, e) => s + e.hours, 0);
  const key = (jobId: string, day: YMD) => `${jobId}|${day}`;
  const cellValue = (jobId: string, day: YMD) => edits[key(jobId, day)] ?? (draftHours(jobId, day) ? String(draftHours(jobId, day)) : "");
  const cellHours = (jobId: string, day: YMD) => parseHours(cellValue(jobId, day));
  const dayTotal = (day: YMD) => rows.reduce((s, r) => s + (cellHours(r.jobId, day) || 0) + fixedHours(r.jobId, day), 0);
  const rowTotal = (jobId: string) => days.reduce((s, d) => s + (cellHours(jobId, d) || 0) + fixedHours(jobId, d), 0);
  const locked = (day: YMD) => !!lockedThrough && day <= lockedThrough;
  const future = (day: YMD) => day > today();

  const dirty = Object.keys(edits).some((k) => {
    const [jobId, day] = k.split("|");
    return Math.abs(parseHours(edits[k]) - draftHours(jobId, day)) > 0.001;
  });
  const invalid = Object.entries(edits).find(([, v]) => {
    const h = parseHours(v);
    return Number.isNaN(h) || h < 0 || h > 24 || (h > 0 && h < 0.25);
  });
  const overDay = days.find((d) => dayTotal(d) > 24);

  async function save() {
    if (invalid) return toast.error("Check the hours", "Use numbers like 2, 1.5 or 1:30 (between 0.25 and 24).");
    if (overDay) return toast.error("Too many hours", `${fmtDay(overDay, { weekday: "long" })} adds up to more than 24 hours.`);
    const changedJobs = new Set(Object.keys(edits).map((k) => k.split("|")[0]));
    const body = {
      weekStart: days[0],
      rows: [...changedJobs].map((jobId) => ({
        jobId,
        hours: Object.fromEntries(days.map((d) => [d, cellHours(jobId, d) || 0])),
      })),
    };
    try {
      const res = await m.saveWeek.mutateAsync(body);
      toast.success("Week saved", `${res.data?.changed ?? 0} change${res.data?.changed === 1 ? "" : "s"} saved as drafts. Submit them when you're ready.`);
      setEdits({});
      setExtraRows([]);
    } catch (e) {
      toast.error("Couldn’t save the week", e instanceof ApiError ? e.message : undefined);
    }
  }

  if (loading) return <Skeleton className="h-64" />;
  const target = standardDayHours();

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-muted text-xs text-ink-subtle">
              <th scope="col" className="px-4 py-3 text-left font-semibold">
                Job
              </th>
              {days.map((d) => (
                <th
                  key={d}
                  scope="col"
                  className={cn("w-[84px] px-2 py-3 text-center font-semibold", isWeeklyOff(d) && "text-ink-subtle/70", d === today() && "text-brand")}
                >
                  <span className="block">{fmtDay(d, { weekday: "short" })}</span>
                  <span className="block font-normal tabular">{fmtDay(d, { day: "numeric", month: "short" })}</span>
                  {locked(d) && <Lock className="mx-auto mt-0.5 h-3 w-3" aria-label="Locked" />}
                </th>
              ))}
              <th scope="col" className="w-[72px] px-3 py-3 text-right font-semibold">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={days.length + 2} className="px-4 py-8 text-center text-ink-muted">
                  No time this week yet. Add a job to start filling in the week.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.jobId} className="border-b border-line last:border-0">
                <td className="max-w-[260px] px-4 py-2">
                  <p className="truncate font-medium text-ink">{r.label}</p>
                  {r.sub && <p className="truncate text-xs text-ink-subtle">{r.sub}</p>}
                </td>
                {days.map((d) => {
                  const fixed = fixedHours(r.jobId, d);
                  const disabled = locked(d) || future(d);
                  const v = cellValue(r.jobId, d);
                  const bad = (() => {
                    const h = parseHours(v);
                    return Number.isNaN(h) || h < 0 || h > 24 || (h > 0 && h < 0.25);
                  })();
                  return (
                    <td key={d} className={cn("px-1.5 py-2 text-center align-top", isWeeklyOff(d) && "bg-surface-muted/60")}>
                      <input
                        inputMode="decimal"
                        value={v}
                        disabled={disabled}
                        onChange={(e) =>
                          setEdits((x) => ({
                            ...x,
                            [key(r.jobId, d)]: e.target.value,
                          }))
                        }
                        aria-label={`${r.label}, ${fmtDay(d, { weekday: "long", day: "numeric", month: "short" })}, hours`}
                        aria-invalid={bad || undefined}
                        placeholder={disabled ? "" : "–"}
                        className={cn(
                          "h-9 w-full rounded-lg border bg-surface px-1 text-center tabular text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-subtle",
                          bad ? "border-danger" : "border-line",
                        )}
                      />
                      {fixed > 0 && (
                        <span className="mt-0.5 block text-[11px] text-ink-subtle" title="Already submitted or approved">
                          +{formatHours(fixed)} sent
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right font-semibold tabular text-ink">{formatHours(rowTotal(r.jobId))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line bg-surface-muted text-xs">
              <td className="px-4 py-2.5 font-semibold text-ink-muted">Day total</td>
              {days.map((d) => {
                const t = dayTotal(d);
                return (
                  <td
                    key={d}
                    className={cn(
                      "px-1.5 py-2.5 text-center font-semibold tabular",
                      t > 24 ? "text-danger" : !isWeeklyOff(d) && !future(d) && t < target ? "text-warning" : "text-ink",
                    )}
                  >
                    {formatHours(t)}
                  </td>
                );
              })}
              <td className="px-3 py-2.5 text-right font-bold tabular text-ink">{formatHours(days.reduce((s, d) => s + dayTotal(d), 0))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setPicker(true)}>
            <Plus className="h-4 w-4" /> Add a job
          </Button>
          {dirty && (
            <Button variant="ghost" size="sm" onClick={() => (setEdits({}), setExtraRows([]))}>
              <Trash2 className="h-4 w-4" /> Discard changes
            </Button>
          )}
        </div>
        <p className="text-xs text-ink-subtle">
          Expected {formatHours(target)} a working day
          {lockedThrough ? ` · Locked up to ${fmtDay(lockedThrough, { day: "numeric", month: "short", year: "numeric" })}` : ""}
        </p>
        <Button size="sm" onClick={save} loading={m.saveWeek.isPending} disabled={!dirty}>
          <Save className="h-4 w-4" /> Save week
        </Button>
      </div>
      <JobPicker
        open={picker}
        onClose={() => setPicker(false)}
        exclude={rows.map((r) => r.jobId)}
        onPick={(r) => {
          setExtraRows((x) => [...x, r]);
          setPicker(false);
        }}
      />
    </Card>
  );
}

const open = (s?: string | null) => ["active", "started"].includes((s ?? "").toLowerCase());

function JobPicker({ open: isOpen, onClose, exclude, onPick }: { open: boolean; onClose: () => void; exclude: string[]; onPick: (r: Row) => void }) {
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [jobId, setJobId] = useState("");
  const clients = useClients();
  const projects = useProjects(clientId || undefined);
  const jobs = useJobs(projectId || undefined);
  const projectOptions = (projects.data ?? []).filter((p) => (!clientId || p.clientId === clientId) && (p.status ?? "").toLowerCase() !== "inactive");
  const jobOptions = (jobs.data ?? []).filter((j) => open(j.status) && !exclude.includes(j.id));
  const client = (clients.data ?? []).find((c) => c.id === clientId);
  const project = projectOptions.find((p) => p.id === projectId);
  const job = jobOptions.find((j) => j.id === jobId);
  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title="Add a job to this week"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!job}
            onClick={() =>
              job &&
              onPick({
                jobId: job.id,
                label: `${job.jobId} · ${job.name}`,
                sub: [client?.alias || client?.name, project?.name].filter(Boolean).join(" · "),
              })
            }
          >
            Add row
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <FormRow label="Client" htmlFor="wg-client">
          <Select id="wg-client" value={clientId} onChange={(e) => (setClientId(e.target.value), setProjectId(""), setJobId(""))}>
            <option value="">{clients.isLoading ? "Loading…" : "Choose a client"}</option>
            {(clients.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Project" htmlFor="wg-project">
          <Select id="wg-project" value={projectId} disabled={!clientId} onChange={(e) => (setProjectId(e.target.value), setJobId(""))}>
            <option value="">{projects.isLoading ? "Loading…" : "Choose a project"}</option>
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Job" htmlFor="wg-job" hint={projectId && !jobs.isLoading && !jobOptions.length ? "No open jobs in this project." : undefined}>
          <Select id="wg-job" value={jobId} disabled={!projectId} onChange={(e) => setJobId(e.target.value)}>
            <option value="">{jobs.isLoading ? "Loading…" : "Choose a job"}</option>
            {jobOptions.map((j) => (
              <option key={j.id} value={j.id}>
                {j.jobId} · {j.name}
              </option>
            ))}
          </Select>
        </FormRow>
      </div>
    </Dialog>
  );
}
