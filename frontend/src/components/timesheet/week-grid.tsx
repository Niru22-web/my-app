"use client";

import { useMemo, useState } from "react";
import { Copy, Lock, Plus, RotateCcw, Save } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { fmtDay, fromYMD, today, workDate, type YMD } from "@/lib/dates";
import { standardDayHours } from "@/lib/work-calendar";
import type { Envelope } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { FormRow, Select } from "@/components/ui/inputs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { statusOf, useClients, useGridMutations, useJobs, useProjects, type Timelog } from "./api";
import { useDayInfo } from "./day-info";
import { hhmm, parseHours } from "./hours";

export interface GridJobRow {
  jobId: string;
  label: string;
  sub: string;
}

const isDraft = (t: Timelog) => ["draft", "rejected"].includes(statusOf(t));
const badCell = (v: string) => {
  const h = parseHours(v);
  return Number.isNaN(h) || h < 0 || h > 24 || (h > 0 && h < 0.25);
};
const dayIndex = (start: YMD, d: YMD) => Math.round((fromYMD(d).getTime() - fromYMD(start).getTime()) / 86_400_000);

/** The existing weekly grid, kept for callers that only know about weeks. */
export function WeekGrid({ days, entries, loading }: { days: YMD[]; entries: Timelog[]; loading: boolean }) {
  return <TimeGrid days={days} entries={entries} loading={loading} />;
}

/**
 * Time grid: one row per job, one column per day, for any period up to 31 days (weekly, semi-monthly, monthly logs).
 * Typing changes your drafts; Save sends the whole period. Submitted, approved, locked and far-future time is shown
 * but can't be changed here.
 */
export function TimeGrid({
  days,
  entries,
  loading,
  previous,
  periodName = "week",
}: {
  days: YMD[];
  entries: Timelog[];
  loading: boolean;
  /** The period before this one, for "Copy last week / previous period". */
  previous?: { from: YMD; to: YMD };
  periodName?: string;
}) {
  const toast = useToast();
  const { saveGrid } = useGridMutations();
  const info = useDayInfo();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [extraRows, setExtraRows] = useState<GridJobRow[]>([]);
  const [picker, setPicker] = useState(false);
  const [withHours, setWithHours] = useState(false);
  const [cloning, setCloning] = useState(false);

  const rows = useMemo(() => {
    const map = new Map<string, GridJobRow>();
    for (const e of entries) {
      if (!map.has(e.jobId)) map.set(e.jobId, rowFor(e));
    }
    for (const r of extraRows) if (!map.has(r.jobId)) map.set(r.jobId, r);
    return [...map.values()];
  }, [entries, extraRows]);

  const sum = (jobId: string, day: YMD, draft: boolean) =>
    entries.filter((e) => e.jobId === jobId && workDate(e.date) === day && isDraft(e) === draft).reduce((s, e) => s + e.hours, 0);
  const key = (jobId: string, day: YMD) => `${jobId}|${day}`;
  const draftHours = (jobId: string, day: YMD) => sum(jobId, day, true);
  const fixedHours = (jobId: string, day: YMD) => sum(jobId, day, false);
  const cellValue = (jobId: string, day: YMD) => edits[key(jobId, day)] ?? (draftHours(jobId, day) ? hhmm(draftHours(jobId, day)) : "");
  const cellHours = (jobId: string, day: YMD) => parseHours(cellValue(jobId, day));
  // Other jobs' time on the day (outside the grid rows) also counts toward 24 h.
  const dayTotal = (day: YMD) => rows.reduce((s, r) => s + (cellHours(r.jobId, day) || 0) + fixedHours(r.jobId, day), 0);
  const rowTotal = (jobId: string) => days.reduce((s, d) => s + (cellHours(jobId, d) || 0) + fixedHours(jobId, d), 0);

  const changedKeys = Object.keys(edits).filter((k) => {
    const [jobId, day] = k.split("|");
    return Math.abs((parseHours(edits[k]) || 0) - draftHours(jobId, day)) > 0.001 || Number.isNaN(parseHours(edits[k]));
  });
  const dirty = changedKeys.length > 0 || extraRows.length > 0;
  const invalid = Object.values(edits).some(badCell);
  const overDay = days.find((d) => dayTotal(d) > 24);

  async function save() {
    if (invalid) return toast.error("Check the hours", "Use hh:mm or decimals, e.g. 2:30 or 2.5 (between 0:15 and 24:00).");
    if (overDay) return toast.error("Too many hours", `${fmtDay(overDay, { weekday: "long", day: "numeric", month: "short" })} adds up to more than 24 hours.`);
    const changedJobs = new Set(changedKeys.map((k) => k.split("|")[0]));
    if (!changedJobs.size) return toast.error("Nothing to save", "Type hours into the grid first.");
    const body = {
      from: days[0],
      to: days[days.length - 1],
      rows: [...changedJobs].map((jobId) => ({
        jobId,
        ...(notes[jobId]?.trim() ? { description: notes[jobId].trim() } : {}),
        hours: Object.fromEntries(days.map((d) => [d, edits[key(jobId, d)] === undefined ? draftHours(jobId, d) : Math.round((cellHours(jobId, d) || 0) * 100) / 100])),
      })),
    };
    try {
      const res = await saveGrid.mutateAsync(body);
      toast.success("Saved", `${res.data?.changed ?? 0} change${res.data?.changed === 1 ? "" : "s"} saved as drafts. Submit them when you're ready.`);
      setEdits({});
      setNotes({});
      setExtraRows([]);
    } catch (e) {
      toast.error("Couldn’t save", e instanceof ApiError ? e.message : undefined);
    }
  }

  async function clonePrevious() {
    if (!previous) return;
    setCloning(true);
    try {
      const prev = (await api<Envelope<Timelog[]>>("timelogs/my", { query: { dateFrom: previous.from, dateTo: previous.to } })).data ?? [];
      if (!prev.length) {
        toast.error(`Nothing to copy`, `No time was logged in the previous ${periodName}.`);
        return;
      }
      const have = new Set(rows.map((r) => r.jobId));
      const added = new Map<string, GridJobRow>();
      for (const e of prev) if (!have.has(e.jobId) && !added.has(e.jobId)) added.set(e.jobId, rowFor(e));
      setExtraRows((x) => [...x, ...added.values()]);
      let copied = 0;
      if (withHours) {
        const next: Record<string, string> = {};
        const byCell = new Map<string, number>();
        for (const e of prev) {
          const d = days[dayIndex(previous.from, workDate(e.date))];
          if (!d || !info.canLog(d)) continue;
          byCell.set(key(e.jobId, d), (byCell.get(key(e.jobId, d)) ?? 0) + e.hours);
        }
        for (const [k, h] of byCell) {
          const [jobId, d] = k.split("|");
          // Never overwrite something already in the cell.
          if (edits[k] !== undefined || draftHours(jobId, d) || fixedHours(jobId, d)) continue;
          next[k] = hhmm(h);
          copied++;
        }
        setEdits((x) => ({ ...x, ...next }));
      }
      toast.success(
        "Copied",
        `${added.size} job row${added.size === 1 ? "" : "s"} added${withHours ? `, ${copied} day${copied === 1 ? "" : "s"} of hours filled in` : ""}. Review and save.`,
      );
    } catch (e) {
      toast.error("Couldn’t copy", e instanceof ApiError ? e.message : undefined);
    } finally {
      setCloning(false);
    }
  }

  if (loading) return <Skeleton className="h-64" />;
  const target = standardDayHours();
  const now = today();

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm" style={{ minWidth: 300 + days.length * 76 }}>
          <thead>
            <tr className="text-xs text-ink-subtle">
              <th scope="col" className="sticky left-0 z-10 min-w-[240px] border-b border-r border-line bg-surface-muted px-4 py-3 text-left font-semibold">
                Job
              </th>
              {days.map((d) => {
                const holiday = info.holidays.get(d);
                const leave = info.leave.get(d);
                const off = info.isOff(d);
                const reason = info.readOnlyReason(d);
                return (
                  <th
                    key={d}
                    scope="col"
                    title={[holiday && `Holiday: ${holiday}`, leave && `On leave: ${leave}`, off && "Weekly off", reason].filter(Boolean).join(" · ") || undefined}
                    className={cn(
                      "w-[76px] min-w-[76px] border-b border-line px-1 py-2 text-center font-semibold",
                      off && "bg-surface-muted",
                      holiday && "bg-danger-soft/60",
                      leave && "bg-brand-soft/60",
                      !off && !holiday && !leave && "bg-surface-muted/50",
                      d === now && "text-brand",
                    )}
                  >
                    <span className="block">{fmtDay(d, { weekday: "short" })}</span>
                    <span className="block font-normal tabular">{fmtDay(d, { day: "numeric", month: "short" })}</span>
                    <span className="mt-0.5 block h-3.5 text-[10px] font-medium leading-3.5">
                      {reason?.includes("locked") ? (
                        <Lock className="mx-auto h-3 w-3" aria-label="Locked" />
                      ) : holiday ? (
                        <span className="text-danger">Holiday</span>
                      ) : leave ? (
                        <span className="text-brand">Leave</span>
                      ) : off ? (
                        <span>Off</span>
                      ) : null}
                    </span>
                  </th>
                );
              })}
              <th scope="col" className="sticky right-0 z-10 w-[76px] border-b border-l border-line bg-surface-muted px-3 py-3 text-right font-semibold">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={days.length + 2} className="px-4 py-8 text-center text-ink-muted">
                  No time in this {periodName} yet. Add a job{previous ? ` or copy last ${periodName}'s jobs` : ""} to start.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.jobId}>
                <td className="sticky left-0 z-10 max-w-[280px] border-b border-r border-line bg-surface px-4 py-2 align-top">
                  <p className="truncate font-medium text-ink" title={r.label}>
                    {r.label}
                  </p>
                  {r.sub && <p className="truncate text-xs text-ink-subtle">{r.sub}</p>}
                  <input
                    value={notes[r.jobId] ?? ""}
                    onChange={(e) => setNotes((x) => ({ ...x, [r.jobId]: e.target.value }))}
                    maxLength={1000}
                    placeholder="Description for new hours (optional)"
                    aria-label={`Description for ${r.label}`}
                    className="mt-1 h-7 w-full rounded-md border border-transparent bg-transparent px-1.5 text-xs text-ink outline-none placeholder:text-ink-subtle hover:border-line focus:border-brand"
                  />
                </td>
                {days.map((d) => {
                  const fixed = fixedHours(r.jobId, d);
                  const reason = info.readOnlyReason(d);
                  const v = cellValue(r.jobId, d);
                  const bad = badCell(v);
                  return (
                    <td
                      key={d}
                      className={cn(
                        "border-b border-line px-1 py-2 text-center align-top",
                        info.isOff(d) && "bg-surface-muted/70",
                        info.holidays.has(d) && "bg-danger-soft/30",
                        info.leave.has(d) && "bg-brand-soft/40",
                      )}
                    >
                      <input
                        inputMode="decimal"
                        value={v}
                        disabled={!!reason}
                        title={reason ?? undefined}
                        onChange={(e) => setEdits((x) => ({ ...x, [key(r.jobId, d)]: e.target.value }))}
                        aria-label={`${r.label}, ${fmtDay(d, { weekday: "long", day: "numeric", month: "short" })}, hours`}
                        aria-invalid={bad || undefined}
                        placeholder={reason ? "" : "–"}
                        className={cn(
                          "h-9 w-full rounded-lg border bg-surface px-1 text-center font-mono text-[13px] tabular text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-subtle",
                          bad ? "border-danger" : "border-line",
                        )}
                      />
                      {fixed > 0 && (
                        <span className="mt-0.5 block text-[10px] text-ink-subtle" title="Already submitted or approved">
                          +{hhmm(fixed)} sent
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="sticky right-0 z-10 border-b border-l border-line bg-surface px-3 py-2 text-right align-top font-mono font-semibold tabular text-ink">
                  <span className="inline-block pt-2">{hhmm(rowTotal(r.jobId))}</span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="text-xs">
              <td className="sticky left-0 z-10 border-r border-line bg-surface-muted px-4 py-2.5 font-semibold text-ink-muted">Day total</td>
              {days.map((d) => {
                const t = dayTotal(d);
                const expected = info.expected(d);
                return (
                  <td
                    key={d}
                    className={cn(
                      "bg-surface-muted px-1 py-2.5 text-center font-mono font-semibold tabular",
                      t > 24 ? "text-danger" : expected && d <= now && t < expected ? "text-warning" : expected && t >= expected ? "text-success" : "text-ink",
                    )}
                  >
                    {hhmm(t)}
                  </td>
                );
              })}
              <td className="sticky right-0 z-10 border-l border-line bg-surface-muted px-3 py-2.5 text-right font-mono font-bold tabular text-ink">{hhmm(days.reduce((s, d) => s + dayTotal(d), 0))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-[11px] text-ink-muted">
        <LegendSwatch className="bg-surface-muted" label="Weekly off" />
        <LegendSwatch className="bg-danger-soft" label="Holiday" />
        <LegendSwatch className="bg-brand-soft" label="Leave" />
        <span className="inline-flex items-center gap-1">
          <Lock className="h-3 w-3" aria-hidden /> Locked / too far ahead — read-only
        </span>
        <span className="ml-auto">
          Expected {hhmm(target)} a working day
          {info.lockedThrough ? ` · Locked up to ${fmtDay(info.lockedThrough, { day: "numeric", month: "short", year: "numeric" })}` : ""}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setPicker(true)}>
            <Plus className="h-4 w-4" /> Add a job
          </Button>
          {previous && (
            <span className="inline-flex items-center gap-2 rounded-lg border border-line px-2 py-1">
              <Button variant="ghost" size="sm" onClick={clonePrevious} loading={cloning} className="h-7 px-2">
                {!cloning && <Copy className="h-4 w-4" />} Copy last {periodName}
              </Button>
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-ink-muted">
                <input type="checkbox" className="h-3.5 w-3.5 accent-[var(--brand)]" checked={withHours} onChange={(e) => setWithHours(e.target.checked)} /> with hours
              </label>
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={() => (setEdits({}), setNotes({}), setExtraRows([]))} disabled={!dirty}>
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
        </div>
        <Button size="sm" onClick={save} loading={saveGrid.isPending} disabled={!dirty}>
          <Save className="h-4 w-4" /> Save {periodName}
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

function rowFor(e: Timelog): GridJobRow {
  return {
    jobId: e.jobId,
    label: e.job ? `${e.job.jobId} · ${e.job.name}` : "Job",
    sub: [e.job?.project?.client?.name || e.job?.project?.client?.alias, e.job?.project?.name].filter(Boolean).join(" · "),
  };
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-3 w-3 rounded-sm border border-line", className)} aria-hidden /> {label}
    </span>
  );
}

const openStatus = (s?: string | null) => ["active", "started"].includes((s ?? "").toLowerCase());

/** Client → Project → Job picker (open jobs only). */
export function JobPicker({
  open: isOpen,
  onClose,
  exclude,
  onPick,
  title = "Add a job",
}: {
  open: boolean;
  onClose: () => void;
  exclude: string[];
  onPick: (r: GridJobRow) => void;
  title?: string;
}) {
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [jobId, setJobId] = useState("");
  const clients = useClients();
  const projects = useProjects(clientId || undefined);
  const jobs = useJobs(projectId || undefined);
  const projectOptions = (projects.data ?? []).filter((p) => (!clientId || p.clientId === clientId) && (p.status ?? "").toLowerCase() !== "inactive");
  const jobOptions = (jobs.data ?? []).filter((j) => openStatus(j.status) && !exclude.includes(j.id));
  const client = (clients.data ?? []).find((c) => c.id === clientId);
  const project = projectOptions.find((p) => p.id === projectId);
  const job = jobOptions.find((j) => j.id === jobId);
  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!job}
            onClick={() => {
              if (!job) return;
              onPick({
                jobId: job.id,
                label: `${job.jobId} · ${job.name}`,
                sub: [client?.name || client?.alias, project?.name].filter(Boolean).join(" · "),
              });
              setJobId("");
            }}
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
