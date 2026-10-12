"use client";

import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { fmtDay, today, workDate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormRow, Input, Select, Textarea } from "@/components/ui/inputs";
import { useToast } from "@/components/ui/toast";
import { useClients, useJobs, useProjects, useTimelogMutations, type Timelog } from "./api";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Entry being edited; omit to create. */
  entry?: Timelog | null;
  /** Prefilled date for new entries. */
  defaultDate?: string;
}

type Errors = Partial<Record<"client" | "project" | "job" | "date" | "hours" | "description", string>>;

const inactive = (s?: string) => (s ?? "").toLowerCase() === "inactive";

/** Accepts "7.5", "7,5" or "7:30". Returns NaN when unparseable. */
function parseHours(v: string): number {
  const s = v.trim();
  const hm = s.match(/^(\d{1,2}):([0-5]\d)$/);
  if (hm) return Number(hm[1]) + Number(hm[2]) / 60;
  return Number(s.replace(",", "."));
}

export function EntryDialog(props: Props) {
  // Remount the form whenever a different entry (or a new one) is opened so its state starts fresh.
  if (!props.open) return null;
  return <EntryForm key={props.entry?.id ?? `new-${props.defaultDate ?? ""}`} {...props} />;
}

function EntryForm({ onClose, entry, defaultDate }: Props) {
  const toast = useToast();
  const m = useTimelogMutations();
  const editing = !!entry;

  const [pickedClient, setClientId] = useState(entry?.job?.project?.client?.id ?? entry?.clientId ?? "");
  const [pickedProject, setProjectId] = useState(entry?.job?.project?.id ?? entry?.projectId ?? "");
  const [pickedJob, setJobId] = useState(entry?.jobId ?? "");
  const [date, setDate] = useState(entry ? workDate(entry.date) : (defaultDate ?? today()));
  const [hours, setHours] = useState(entry ? String(entry.hours) : "");
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
  const projectOptions = (projects.data ?? []).filter((p) => (!clientId || p.clientId === clientId) && (!inactive(p.status) || p.id === pickedProject));
  const projectId = pickedProject || (projectOptions.length === 1 ? projectOptions[0].id : "");
  const jobs = useJobs(projectId || undefined);
  const jobOptions = (jobs.data ?? []).filter((j) => !inactive(j.status) || j.id === pickedJob);
  const jobId = pickedJob || (jobOptions.length === 1 ? jobOptions[0].id : "");
  const project = projectOptions.find((p) => p.id === projectId);
  const billable = billableChoice ?? (typeof project?.billable === "boolean" ? project.billable : true);

  function validate(): Errors {
    const e: Errors = {};
    if (!clientId) e.client = "Choose a client.";
    if (!projectId) e.project = "Choose a project.";
    if (!jobId) e.job = "Choose a job.";
    if (!date) e.date = "Choose a date.";
    else if (date > today()) e.date = "You can’t log time for a future date.";
    const h = parseHours(hours);
    if (!hours.trim() || Number.isNaN(h)) e.hours = "Enter hours, e.g. 7.5 or 7:30.";
    else if (h <= 0 || h > 24) e.hours = "Hours must be more than 0 and at most 24.";
    if (description.trim().length < 10) e.description = "Describe the work in at least 10 characters.";
    return e;
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setServerError(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    const body = {
      jobId,
      hours: Math.round(parseHours(hours) * 100) / 100,
      description: description.trim(),
      date,
      workItem: workItem.trim(),
      isBillable: billable,
    };
    try {
      if (editing) await m.update.mutateAsync({ id: entry!.id, body });
      else await m.create.mutateAsync(body);
      toast.success(editing ? "Entry updated" : "Time logged", `${body.hours} h on ${fmtDay(date)}`);
      onClose();
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Couldn’t save this entry. Please try again.");
    }
  }

  const busy = m.create.isPending || m.update.isPending;

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? "Edit time entry" : "Log time"}
      description={editing ? "Changes are saved to the same entry." : "Record the hours you worked on a job."}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="timelog-form" loading={busy}>
            {editing ? "Save changes" : "Log time"}
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
            <option value="">{!projectId ? "Choose a project first" : jobs.isLoading ? "Loading…" : jobOptions.length ? "Select a job" : "No jobs assigned to you"}</option>
            {jobOptions.map((j) => (
              <option key={j.id} value={j.id}>
                {j.jobId} · {j.name}
              </option>
            ))}
          </Select>
        </FormRow>

        <FormRow label="Date" htmlFor="tl-date" required error={errors.date}>
          <Input id="tl-date" type="date" max={today()} value={date} invalid={!!errors.date} onChange={(e) => setDate(e.target.value)} />
        </FormRow>

        <FormRow label="Hours" htmlFor="tl-hours" required error={errors.hours} hint="Decimal (7.5) or hours:minutes (7:30)">
          <Input id="tl-hours" inputMode="decimal" placeholder="e.g. 7.5" value={hours} invalid={!!errors.hours} onChange={(e) => setHours(e.target.value)} />
        </FormRow>

        <FormRow label="Work description" htmlFor="tl-desc" required error={errors.description} className="sm:col-span-2">
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

        <FormRow label="Work item / reference" htmlFor="tl-item" hint="Optional — e.g. a document, ticket or deliverable reference">
          <Input id="tl-item" maxLength={200} value={workItem} onChange={(e) => setWorkItem(e.target.value)} />
        </FormRow>

        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-ink">Billing</span>
          <div role="radiogroup" aria-label="Billing" className="grid h-10 grid-cols-2 gap-1 rounded-xl border border-line-strong bg-surface-muted p-1">
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
