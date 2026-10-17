"use client";

import { useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { fmtDay, workDate, type YMD } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/inputs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useGridMutations, useMyJobs, type Timelog } from "./api";
import { useDayInfo } from "./day-info";
import { hhmm, hoursProblem, jobLine, parseHours } from "./hours";
import { StatusBadge } from "./status-badge";
import { JobPicker, type GridJobRow } from "./week-grid";

interface Line {
  key: number;
  jobId: string;
  hours: string;
  billable: "" | "billable" | "non_billable";
  workItem: string;
  description: string;
}

let seq = 0;
const blank = (): Line => ({ key: ++seq, jobId: "", hours: "", billable: "", workItem: "", description: "" });
const PICK_OTHER = "__other__";

/** Daily log: several new entries for one day (job + hours + description per row), saved together. */
export function DailyLog({ day, entries, loading }: { day: YMD; entries: Timelog[]; loading: boolean }) {
  const toast = useToast();
  const info = useDayInfo();
  const { saveGrid } = useGridMutations();
  const myJobs = useMyJobs();
  const [lines, setLines] = useState<Line[]>(() => [blank(), blank(), blank()]);
  const [extraJobs, setExtraJobs] = useState<GridJobRow[]>([]);
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<number, string>>({});

  const existing = entries.filter((e) => workDate(e.date) === day);
  const existingTotal = existing.reduce((s, e) => s + e.hours, 0);
  const used = lines.filter((l) => l.jobId || l.hours.trim() || l.description.trim());
  const newTotal = used.reduce((s, l) => s + (parseHours(l.hours) || 0), 0);
  const reason = info.readOnlyReason(day);

  const jobOptions = [
    ...(myJobs.data ?? []).filter((j) => j.canLog).map((j) => ({ id: j.id, label: `${j.jobId} · ${j.name} — ${j.project.name} (${j.client.name})` })),
    ...extraJobs.filter((x) => !(myJobs.data ?? []).some((j) => j.id === x.jobId)).map((x) => ({ id: x.jobId, label: `${x.label} — ${x.sub}` })),
  ];

  const set = (k: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));

  async function save() {
    const errs: Record<number, string> = {};
    for (const l of used) {
      if (!l.jobId) errs[l.key] = "Choose a job.";
      else if (!l.hours.trim()) errs[l.key] = "Enter the hours.";
      else if (hoursProblem(parseHours(l.hours))) errs[l.key] = hoursProblem(parseHours(l.hours))!;
      else if (l.description.trim().length < 10) errs[l.key] = "Describe the work in at least 10 characters.";
    }
    setErrors(errs);
    if (!used.length) return toast.error("Nothing to save", "Fill in at least one row.");
    if (Object.keys(errs).length) return;
    if (existingTotal + newTotal > 24) return toast.error("Too many hours", `${fmtDay(day)} would add up to ${hhmm(existingTotal + newTotal)} — a day can’t exceed 24 hours.`);
    try {
      const res = await saveGrid.mutateAsync({
        from: day,
        to: day,
        mode: "append",
        rows: used.map((l) => ({
          jobId: l.jobId,
          description: l.description.trim(),
          workItem: l.workItem.trim() || undefined,
          ...(l.billable ? { billable: l.billable === "billable" } : {}),
          hours: { [day]: Math.round(parseHours(l.hours) * 100) / 100 },
        })),
      });
      toast.success("Day logged", `${res.data?.changed ?? used.length} entr${used.length === 1 ? "y" : "ies"} saved as drafts for ${fmtDay(day)}.`);
      setLines([blank(), blank(), blank()]);
    } catch (e) {
      toast.error("Couldn’t save", e instanceof ApiError ? e.message : undefined);
    }
  }

  if (loading) return <Skeleton className="h-64" />;

  return (
    <Card className="overflow-hidden">
      {existing.length > 0 && (
        <div className="border-b border-line bg-surface-muted/60 px-4 py-3">
          <p className="mb-1.5 text-xs font-semibold text-ink-subtle">
            Already logged on {fmtDay(day)} · <span className="font-mono tabular">{hhmm(existingTotal)}</span>
          </p>
          <ul className="space-y-1">
            {existing.map((e) => (
              <li key={e.id} className="flex items-center gap-3 text-[13px]">
                <span className="min-w-0 flex-1 truncate text-ink">{jobLine(e.job)}</span>
                <span className="font-mono tabular text-ink">{hhmm(e.hours)}</span>
                <StatusBadge entry={e} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {reason ? (
        <p className="px-4 py-6 text-center text-sm text-ink-muted">{reason} Time can’t be added for this day.</p>
      ) : (
        <>
          <div className="divide-y divide-line">
            {lines.map((l, i) => (
              <div key={l.key} className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,2.2fr)_110px_140px_minmax(0,1fr)_minmax(0,2fr)_40px] md:items-start">
                <Select
                  aria-label={`Row ${i + 1} job`}
                  value={l.jobId}
                  invalid={!!errors[l.key] && !l.jobId}
                  onChange={(e) => (e.target.value === PICK_OTHER ? setPickerFor(l.key) : set(l.key, { jobId: e.target.value }))}
                >
                  <option value="">{myJobs.isLoading ? "Loading jobs…" : "Select a job"}</option>
                  {jobOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                  <option value={PICK_OTHER}>Another job…</option>
                </Select>
                <input
                  aria-label={`Row ${i + 1} hours`}
                  inputMode="decimal"
                  placeholder="hh:mm"
                  value={l.hours}
                  onChange={(e) => set(l.key, { hours: e.target.value })}
                  className="h-10 rounded-xl border border-line-strong bg-surface px-3 text-center font-mono text-sm tabular text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
                />
                <Select aria-label={`Row ${i + 1} billable status`} value={l.billable} onChange={(e) => set(l.key, { billable: e.target.value as Line["billable"] })}>
                  <option value="">Job default</option>
                  <option value="billable">Billable</option>
                  <option value="non_billable">Non-billable</option>
                </Select>
                <input
                  aria-label={`Row ${i + 1} work item`}
                  placeholder="Work item"
                  maxLength={200}
                  value={l.workItem}
                  onChange={(e) => set(l.key, { workItem: e.target.value })}
                  className="h-10 min-w-0 rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-subtle focus:border-brand focus:ring-4 focus:ring-brand/10"
                />
                <input
                  aria-label={`Row ${i + 1} description`}
                  placeholder="What did you work on?"
                  maxLength={1000}
                  value={l.description}
                  onChange={(e) => set(l.key, { description: e.target.value })}
                  className="h-10 min-w-0 rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-subtle focus:border-brand focus:ring-4 focus:ring-brand/10"
                />
                <button
                  type="button"
                  onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [blank()]))}
                  className="grid h-10 w-10 place-items-center rounded-xl text-ink-muted hover:bg-danger-soft hover:text-danger"
                  aria-label={`Remove row ${i + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                {errors[l.key] && <p className="text-xs text-danger md:col-span-6">{errors[l.key]}</p>}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
            <Button variant="secondary" size="sm" onClick={() => setLines((ls) => [...ls, blank()])} disabled={lines.length >= 20}>
              <Plus className="h-4 w-4" /> Add row
            </Button>
            <p className={cn("text-[13px]", existingTotal + newTotal > 24 ? "text-danger" : "text-ink-muted")}>
              New <span className="font-mono font-semibold tabular text-ink">{hhmm(newTotal)}</span> · Day total{" "}
              <span className="font-mono font-semibold tabular text-ink">{hhmm(existingTotal + newTotal)}</span>
            </p>
            <Button size="sm" onClick={save} loading={saveGrid.isPending}>
              <Save className="h-4 w-4" /> Save day
            </Button>
          </div>
        </>
      )}
      <JobPicker
        open={pickerFor !== null}
        onClose={() => setPickerFor(null)}
        exclude={[]}
        title="Choose another job"
        onPick={(r) => {
          setExtraJobs((x) => (x.some((y) => y.jobId === r.jobId) ? x : [...x, r]));
          if (pickerFor !== null) set(pickerFor, { jobId: r.jobId });
          setPickerFor(null);
        }}
      />
    </Card>
  );
}
