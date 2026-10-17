"use client";

import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { addDays, fmtDay, today, workDate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormRow, Input, Select, Textarea } from "@/components/ui/inputs";
import { useToast } from "@/components/ui/toast";
import { useClients, useJobs, useProjects, useTimelogMutations, type Timelog } from "./api";
import { hhmm, hoursProblem, minutesOf, parseHours } from "./hours";
import { MAX_AHEAD_DAYS } from "./day-info";
import { startTimer } from "./timer";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Entry being edited; omit to create. */
  entry?: Timelog | null;
  /** Prefilled date for new entries. */
  defaultDate?: string;
  /** Prefilled job for new entries (e.g. from My jobs). */
  defaultJob?: { clientId: string; projectId: string; jobId: string } | null;
  /** Open with the "Timer" option chosen. */
  startWithTimer?: boolean;
}

type Errors = Partial<Record<"client" | "project" | "job" | "date" | "hours" | "start" | "end" | "description", string>>;
type HoursMode = "total" | "range" | "timer";

const inactiveProject = (s?: string) => (s ?? "").toLowerCase() === "inactive";
const openJob = (s?: string) => ["active", "started"].includes((s ?? "").toLowerCase());

export function EntryDialog(props: Props) {
  // Remount the form whenever a different entry (or a new one) is opened so its state starts fresh.
  if (!props.open) return null;
  return <EntryForm key={props.entry?.id ?? `new-${props.defaultDate ?? ""}-${props.defaultJob?.jobId ?? ""}`} {...props} />;
}

function EntryForm({ onClose, entry, defaultDate, defaultJob, startWithTimer }: Props) {
  const toast = useToast();
  const m = useTimelogMutations();
  const editing = !!entry;
  const maxDate = addDays(today(), MAX_AHEAD_DAYS);

  const [pickedClient, setClientId] = useState(entry?.job?.project?.client?.id ?? entry?.clientId ?? defaultJob?.clientId ?? "");
  const [pickedProject, setProjectId] = useState(entry?.job?.project?.id ?? entry?.projectId ?? defaultJob?.projectId ?? "");
  const [pickedJob, setJobId] = useState(entry?.jobId ?? defaultJob?.jobId ?? "");
  const [date, setDate] = useState(entry ? workDate(entry.date) : (defaultDate ?? today()));
  const [mode, setMode] = useState<HoursMode>(startWithTimer && !entry ? "timer" : "total");
  const [hours, setHours] = useState(entry ? hhmm(entry.hours) : "");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [workItem, setWorkItem] = useState(entry?.workItem ?? "");
  // null = follow the project's default until the person chooses.
  const [billableChoice, setBillable] = useState<boolean | null>(entry ? entry.billableStatus !== "non_billable" : null);
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  // When there's exactly one choice it is picked automatically (saves a click at each level).
  const clients = useClients();
  const clientId = pickedClient || (clients.data?.length === 1 ? clients.data[0].id : "");
  const projects = useProjects(clientId || undefined);
  // Inactive items are hidden, except the one an existing entry already uses.
  const projectOptions = (projects.data ?? []).filter((p) => (!clientId || p.clientId === clientId) && (!inactiveProject(p.status) || p.id === pickedProject));
  const projectId = pickedProject || (projectOptions.length === 1 ? projectOptions[0].id : "");
  const jobs = useJobs(projectId || undefined);
  // Only Active / Started jobs take time (server rule); an existing entry keeps showing its own job.
  const jobOptions = (jobs.data ?? []).filter((j) => openJob(j.status) || j.id === pickedJob);
  const jobId = pickedJob || (jobOptions.length === 1 ? jobOptions[0].id : "");
  const project = projectOptions.find((p) => p.id === projectId);
  const job = jobOptions.find((j) => j.id === jobId);
  const client = (clients.data ?? []).find((c) => c.id === clientId);
  const billable = billableChoice ?? (typeof project?.billable === "boolean" ? project.billable : true);

  const rangeHours = (() => {
    const a = minutesOf(startTime);
    const b = minutesOf(endTime);
    return Number.isNaN(a) || Number.isNaN(b) || b <= a ? NaN : (b - a) / 60;
  })();
  const finalHours = mode === "range" ? rangeHours : parseHours(hours);

  function validate(): Errors {
    const e: Errors = {};
    if (!clientId) e.client = "Choose a client.";
    if (!projectId) e.project = "Choose a project.";
    if (!jobId) e.job = "Choose a job.";
    if (mode !== "timer") {
      if (!date) e.date = "Choose a date.";
      else if (date > maxDate) e.date = `Time can be logged at most ${MAX_AHEAD_DAYS} days ahead.`;
    }
    if (mode === "total") {
      const h = parseHours(hours);
      e.hours = !hours.trim() ? "Enter hours, e.g. 7:30 or 7.5." : (hoursProblem(h) ?? undefined);
    } else if (mode === "range") {
      if (!startTime) e.start = "Enter the start time.";
      if (!endTime) e.end = "Enter the end time.";
      else if (startTime && minutesOf(endTime) <= minutesOf(startTime)) e.end = "The end time must be after the start time.";
      else if (!Number.isNaN(rangeHours) && rangeHours < 0.25) e.end = "The minimum is 15 minutes.";
    }
    if (mode !== "timer" && description.trim().length < 10) e.description = "Describe the work in at least 10 characters.";
    for (const k of Object.keys(e) as (keyof Errors)[]) if (!e[k]) delete e[k];
    return e;
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setServerError(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    if (mode === "timer") {
      const problem = startTimer({
        clientId,
        projectId,
        jobId,
        jobLabel: `${job?.name ?? "Job"} • ${project?.name ?? ""}${client ? ` (${client.name})` : ""}`,
        description: description.trim(),
        billable,
      });
      if (problem) return setServerError(problem);
      toast.success("Timer started", "Stop it from the timer bar on Time logs when you finish.");
      onClose();
      return;
    }

    const body = {
      jobId,
      hours: Math.round(finalHours * 100) / 100,
      description: description.trim(),
      date,
      workItem: workItem.trim(),
      isBillable: billable,
    };
    try {
      if (editing) await m.update.mutateAsync({ id: entry!.id, body });
      else await m.create.mutateAsync(body);
      toast.success(editing ? "Time log updated" : "Time logged", `${hhmm(body.hours)} on ${fmtDay(date)}`);
      onClose();
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Couldn’t save this entry. Please try again.");
    }
  }

  const busy = m.create.isPending || m.update.isPending;
  const modes: { v: HoursMode; label: string }[] = [
    { v: "total", label: "Total hours" },
    { v: "range", label: "Start and end time" },
    ...(editing ? [] : [{ v: "timer" as const, label: "Timer" }]),
  ];

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? "Edit time log" : "Log time"}
      description={
        editing
          ? entry && entry.submissionStatus === "submitted"
            ? "This entry is awaiting approval. Saving a change sends it back to draft."
            : "Changes are saved to the same entry."
          : "Record the hours you worked on a job."
      }
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="timelog-form" loading={busy}>
            {editing ? "Save changes" : mode === "timer" ? "Start timer" : "Log time"}
          </Button>
        </>
      }
    >
      <form id="timelog-form" onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Client" htmlFor="tl-client" required error={errors.client} className="sm:col-span-2">
          <Select
            id="tl-client"
            value={clientId}
            invalid={!!errors.client}
            onChange={(e) => {
              setClientId(e.target.value);
              setProjectId("");
              setJobId("");
            }}
          >
            <option value="">{clients.isLoading ? "Loading clients…" : "Select a client"}</option>
            {(clients.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.clientId ? ` (${c.clientId})` : ""}
              </option>
            ))}
          </Select>
        </FormRow>

        <FormRow label="Project" htmlFor="tl-project" required error={errors.project}>
          <Select
            id="tl-project"
            value={projectId}
            disabled={!clientId}
            invalid={!!errors.project}
            onChange={(e) => {
              setProjectId(e.target.value);
              setJobId("");
              if (!editing) setBillable(null);
            }}
          >
            <option value="">{!clientId ? "Choose a client first" : projects.isLoading ? "Loading…" : projectOptions.length ? "Select a project" : "No active projects"}</option>
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </FormRow>

        <FormRow label="Job" htmlFor="tl-job" required error={errors.job}>
          <Select id="tl-job" value={jobId} disabled={!projectId} invalid={!!errors.job} onChange={(e) => setJobId(e.target.value)}>
            <option value="">{!projectId ? "Choose a project first" : jobs.isLoading ? "Loading…" : jobOptions.length ? "Select a job" : "No open jobs in this project"}</option>
            {jobOptions.map((j) => (
              <option key={j.id} value={j.id}>
                {j.jobId} · {j.name}
              </option>
            ))}
          </Select>
        </FormRow>

        <FormRow label="Work item" htmlFor="tl-item" hint="Optional — e.g. a document, return or deliverable reference">
          <Input id="tl-item" maxLength={200} value={workItem} onChange={(e) => setWorkItem(e.target.value)} />
        </FormRow>

        {mode !== "timer" ? (
          <FormRow label="Date" htmlFor="tl-date" required error={errors.date}>
            <Input id="tl-date" type="date" max={maxDate} value={date} invalid={!!errors.date} onChange={(e) => setDate(e.target.value)} />
          </FormRow>
        ) : (
          <div className="self-end rounded-xl bg-brand-softer px-3 py-2.5 text-[13px] text-ink-muted">The timer starts now and logs the time for today when you stop it.</div>
        )}

        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 block text-[13px] font-medium text-ink">
            Hours<span className="ml-0.5 text-danger" aria-hidden>*</span>
          </legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {modes.map((o) => (
              <label key={o.v} className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-ink">
                <input type="radio" name="tl-hours-mode" value={o.v} checked={mode === o.v} onChange={() => setMode(o.v)} className="h-4 w-4 accent-[var(--brand)]" />
                {o.label}
              </label>
            ))}
          </div>
          {mode === "total" && (
            <div className="mt-2 max-w-[220px]">
              <Input
                id="tl-hours"
                aria-label="Total hours"
                inputMode="decimal"
                placeholder="hh:mm, e.g. 07:30"
                value={hours}
                invalid={!!errors.hours}
                onChange={(e) => setHours(e.target.value)}
                aria-describedby="tl-hours-help"
              />
              <p id="tl-hours-help" className={cn("mt-1.5 text-xs", errors.hours ? "text-danger" : "text-ink-subtle")}>
                {errors.hours ?? "hh:mm (07:30) or decimal (7.5)"}
              </p>
            </div>
          )}
          {mode === "range" && (
            <div className="mt-2 flex flex-wrap items-start gap-3">
              <div>
                <Input type="time" aria-label="Start time" value={startTime} invalid={!!errors.start} onChange={(e) => setStartTime(e.target.value)} className="w-[140px]" />
                {errors.start && <p className="mt-1.5 text-xs text-danger">{errors.start}</p>}
              </div>
              <span className="pt-2.5 text-ink-subtle">to</span>
              <div>
                <Input type="time" aria-label="End time" value={endTime} invalid={!!errors.end} onChange={(e) => setEndTime(e.target.value)} className="w-[140px]" />
                {errors.end && <p className="mt-1.5 text-xs text-danger">{errors.end}</p>}
              </div>
              <p className="pt-2.5 text-sm text-ink-muted">
                = <span className="font-semibold tabular text-ink">{Number.isNaN(rangeHours) ? "--:--" : hhmm(rangeHours)}</span>
              </p>
            </div>
          )}
          {mode === "timer" && <p className="mt-2 text-xs text-ink-subtle">Starts a running timer for this job instead of saving hours now. The timer bar on Time logs shows it.</p>}
        </fieldset>

        <FormRow label="Work description" htmlFor="tl-desc" required={mode !== "timer"} error={errors.description} className="sm:col-span-2">
          <Textarea
            id="tl-desc"
            rows={3}
            maxLength={1000}
            placeholder="What did you work on?"
            value={description}
            invalid={!!errors.description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormRow>

        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-ink">Billable status</span>
          <div role="radiogroup" aria-label="Billable status" className="grid h-10 grid-cols-2 gap-1 rounded-xl border border-line-strong bg-surface-muted p-1">
            {[
              { v: true, label: "Billable" },
              { v: false, label: "Non-billable" },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                role="radio"
                aria-checked={billable === o.v}
                onClick={() => setBillable(o.v)}
                className={cn("rounded-lg text-[13px] font-medium", billable === o.v ? "bg-surface text-brand shadow-sm" : "text-ink-muted hover:text-ink")}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {serverError && (
          <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger sm:col-span-2">
            {serverError}
          </p>
        )}
      </form>
    </Dialog>
  );
}
