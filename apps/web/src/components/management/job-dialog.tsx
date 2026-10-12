"use client";

import { useState, type FormEvent } from "react";
import { AlertTriangle } from "lucide-react";
import { ApiError } from "@/lib/api";
import { workDate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormRow, Input, Select, Textarea } from "@/components/ui/inputs";
import { PeoplePicker } from "@/components/ui/people-picker";
import { useToast } from "@/components/ui/toast";
import { fullName, isInactive, LOGGABLE, useMgmtMutations, usePeople, useProjectList, WORK_STATUSES, type Job } from "./api";

export function JobDialog({ open, onClose, job }: { open: boolean; onClose: () => void; job?: Job | null }) {
  if (!open) return null;
  return <JobForm key={job?.id ?? "new"} onClose={onClose} job={job} />;
}

function JobForm({ onClose, job }: { onClose: () => void; job?: Job | null }) {
  const toast = useToast();
  const { saveJob } = useMgmtMutations();
  const projects = useProjectList();
  const people = usePeople();
  const [clientId, setClientId] = useState(job?.project?.clientId ?? "");
  const [f, setF] = useState({
    projectId: job?.projectId ?? "",
    name: job?.name ?? "",
    status: job?.status ?? "Started",
    description: job?.description ?? "",
    startDate: job?.startDate ? workDate(job.startDate) : "",
    endDate: job?.endDate ? workDate(job.endDate) : "",
    billable: job ? job.billable : true,
  });
  const [team, setTeam] = useState<string[]>(job?.users?.map((u) => u.employee.id) ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  // Only projects the user can see (the API checks ownership when a job is created).
  const usable = (projects.data ?? []).filter((p) => !isInactive(p.status) || p.id === f.projectId);
  const clients = [...new Map(usable.filter((p) => p.client).map((p) => [p.clientId, p.client!.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const projectOptions = usable.filter((p) => !clientId || p.clientId === clientId);
  const statuses = [...new Set([...WORK_STATUSES, ...(job ? [job.status] : [])])];
  const blocksTime = !LOGGABLE.includes(f.status.toLowerCase());

  async function submit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const errs: Record<string, string> = {};
    if (!f.projectId) errs.projectId = "Choose the project this job belongs to.";
    if (f.name.trim().length < 2) errs.name = "Enter a job name.";
    if (f.startDate && f.endDate && f.endDate < f.startDate) errs.endDate = "The end date can’t be before the start date.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const body = {
      projectId: f.projectId,
      name: f.name.trim(),
      status: f.status,
      description: f.description.trim() || null,
      startDate: f.startDate || null,
      endDate: f.endDate || null,
      billable: f.billable,
      assignedEmployees: team,
    };
    try {
      await saveJob.mutateAsync({ id: job?.id, body });
      toast.success(job ? "Job updated" : "Job created", body.name);
      onClose();
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Couldn’t save the job.");
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={job ? `Edit ${job.name}` : "New job"}
      description={job ? `${job.jobId} · ${job.project?.name ?? ""}` : "A job code is assigned automatically when you save."}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saveJob.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="job-form" loading={saveJob.isPending}>
            {job ? "Save changes" : "Create job"}
          </Button>
        </>
      }
    >
      <form id="job-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        {!job && (
          <FormRow label="Client" htmlFor="j-client" hint="Narrows the project list">
            <Select id="j-client" value={clientId} onChange={(e) => (setClientId(e.target.value), set("projectId", ""))}>
              <option value="">All clients</option>
              {clients.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
          </FormRow>
        )}
        <FormRow
          label="Project"
          htmlFor="j-project"
          required
          error={errors.projectId}
          className={job ? "sm:col-span-2" : undefined}
          hint={job ? "A job can’t be moved to another project — its logged time and job code belong to this one." : undefined}
        >
          <Select id="j-project" value={f.projectId} disabled={!!job} invalid={!!errors.projectId} onChange={(e) => set("projectId", e.target.value)}>
            <option value="">{projects.isLoading ? "Loading…" : "Select a project"}</option>
            {(job && job.project && !projectOptions.some((p) => p.id === job.projectId) ? [job.project, ...projectOptions] : projectOptions).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.client ? ` · ${p.client.name}` : ""}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Job / deliverable name" htmlFor="j-name" required error={errors.name}>
          <Input id="j-name" value={f.name} maxLength={150} invalid={!!errors.name} onChange={(e) => set("name", e.target.value)} />
        </FormRow>
        <FormRow label="Status" htmlFor="j-status" required>
          <Select id="j-status" value={f.status} onChange={(e) => set("status", e.target.value)}>
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </FormRow>
        {blocksTime && (
          <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 text-[13px] text-ink sm:col-span-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
            People can’t log time to a job that is “{f.status}”. Use “Started” while work is in progress.
          </p>
        )}
        <FormRow label="Description" htmlFor="j-desc" className="sm:col-span-2">
          <Textarea id="j-desc" rows={2} maxLength={1000} value={f.description} onChange={(e) => set("description", e.target.value)} />
        </FormRow>
        <FormRow label="Start date" htmlFor="j-start">
          <Input id="j-start" type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} />
        </FormRow>
        <FormRow label="End date" htmlFor="j-end" error={errors.endDate}>
          <Input id="j-end" type="date" value={f.endDate} min={f.startDate || undefined} invalid={!!errors.endDate} onChange={(e) => set("endDate", e.target.value)} />
        </FormRow>
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-ink">Billing</span>
          <div role="radiogroup" aria-label="Billing" className="grid h-10 grid-cols-2 gap-1 rounded-xl border border-line-strong bg-surface-muted p-1">
            {[
              { v: true, l: "Billable" },
              { v: false, l: "Non-billable" },
            ].map((o) => (
              <button key={o.l} type="button" role="radio" aria-checked={f.billable === o.v} onClick={() => set("billable", o.v)} className={cn("rounded-lg text-[13px] font-medium", f.billable === o.v ? "bg-surface text-brand shadow-sm" : "text-ink-muted hover:text-ink")}>
                {o.l}
              </button>
            ))}
          </div>
        </div>
        <FormRow label="Assigned people" htmlFor="j-team" className="sm:col-span-2" hint="Only assigned people see this job in their timesheet.">
          <PeoplePicker
            id="j-team"
            loading={people.isLoading}
            value={team}
            onChange={setTeam}
            options={(people.data ?? [])
              .filter((p) => (p.status ?? "active").toLowerCase() === "active" || team.includes(p.id))
              .map((p) => ({ id: p.id, label: fullName(p) || p.officeEmail, sub: [p.employeeId, p.designation].filter(Boolean).join(" · ") }))}
          />
        </FormRow>
        {serverError && <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger sm:col-span-2">{serverError}</p>}
      </form>
    </Dialog>
  );
}
