"use client";

import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { workDate, today } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormRow, Input, Select } from "@/components/ui/inputs";
import { PeoplePicker } from "@/components/ui/people-picker";
import { useToast } from "@/components/ui/toast";
import { fullName, isInactive, useClientOptions, useMgmtMutations, usePeople, WORK_STATUSES, type Project } from "./api";

export function ProjectDialog({ open, onClose, project }: { open: boolean; onClose: () => void; project?: Project | null }) {
  if (!open) return null;
  return <ProjectForm key={project?.id ?? "new"} onClose={onClose} project={project} />;
}

function ProjectForm({ onClose, project }: { onClose: () => void; project?: Project | null }) {
  const toast = useToast();
  const { user } = useAuth();
  const { saveProject } = useMgmtMutations();
  const clients = useClientOptions();
  const people = usePeople();
  const [f, setF] = useState({
    clientId: project?.clientId ?? "",
    name: project?.name ?? "",
    status: project?.status ?? "Started",
    startDate: project ? workDate(project.startDate) : today(),
    endDate: project?.endDate ? workDate(project.endDate) : "",
    billable: project ? project.billable : true,
    contactPerson: project?.contactPerson ?? "",
  });
  const [team, setTeam] = useState<string[]>(project?.users?.map((u) => u.employee.id) ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  // Keep the current client selectable even if it has since become inactive.
  const clientOptions = [...(clients.data ?? [])];
  if (project?.client && !clientOptions.some((c) => c.id === project.clientId)) clientOptions.push(project.client);
  const statuses = [...new Set([...WORK_STATUSES, ...(project ? [project.status] : [])])];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const errs: Record<string, string> = {};
    if (!f.clientId) errs.clientId = "Choose a client.";
    if (f.name.trim().length < 2) errs.name = "Enter a project name.";
    if (!f.startDate) errs.startDate = "Choose a start date.";
    if (f.endDate && f.endDate < f.startDate) errs.endDate = "The end date can’t be before the start date.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const body = {
      clientId: f.clientId,
      name: f.name.trim(),
      status: f.status,
      startDate: f.startDate,
      endDate: f.endDate || null,
      billable: f.billable,
      contactPerson: f.contactPerson.trim() || null,
      assignedEmployees: team,
    };
    try {
      await saveProject.mutateAsync({ id: project?.id, body });
      toast.success(project ? "Project updated" : "Project created", body.name);
      onClose();
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Couldn’t save the project.");
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={project ? `Edit ${project.name}` : "New project"}
      description={project ? `${project.projectId} · ${project.client?.name ?? ""}` : "A project code is assigned automatically when you save."}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saveProject.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="project-form" loading={saveProject.isPending}>
            {project ? "Save changes" : "Create project"}
          </Button>
        </>
      }
    >
      <form id="project-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Client" htmlFor="p-client" required error={errors.clientId} hint={project ? "A project can’t be moved to another client — its logged time belongs to this one." : undefined}>
          <Select id="p-client" value={f.clientId} disabled={!!project} invalid={!!errors.clientId} onChange={(e) => set("clientId", e.target.value)}>
            <option value="">{clients.isLoading ? "Loading…" : "Select a client"}</option>
            {clientOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {isInactive(c.status) ? " (inactive)" : ""}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Project name" htmlFor="p-name" required error={errors.name}>
          <Input id="p-name" value={f.name} maxLength={150} invalid={!!errors.name} onChange={(e) => set("name", e.target.value)} />
        </FormRow>
        <FormRow label="Status" htmlFor="p-status" required>
          <Select id="p-status" value={f.status} onChange={(e) => set("status", e.target.value)}>
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
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
        <FormRow label="Start date" htmlFor="p-start" required error={errors.startDate}>
          <Input id="p-start" type="date" value={f.startDate} invalid={!!errors.startDate} onChange={(e) => set("startDate", e.target.value)} />
        </FormRow>
        <FormRow label="End date" htmlFor="p-end" error={errors.endDate} hint="Optional">
          <Input id="p-end" type="date" value={f.endDate} min={f.startDate} invalid={!!errors.endDate} onChange={(e) => set("endDate", e.target.value)} />
        </FormRow>
        <FormRow label="Client contact person" htmlFor="p-contact">
          <Input id="p-contact" value={f.contactPerson} maxLength={100} onChange={(e) => set("contactPerson", e.target.value)} />
        </FormRow>
        <FormRow label="Delivery team" htmlFor="p-team" className="sm:col-span-2" hint="People on the team can see the project and log time to its jobs.">
          <PeoplePicker
            id="p-team"
            loading={people.isLoading}
            value={team}
            onChange={setTeam}
            options={(people.data ?? [])
              .filter((p) => (p.status ?? "active").toLowerCase() === "active" || team.includes(p.id))
              .map((p) => ({ id: p.id, label: fullName(p) || p.officeEmail, sub: [p.employeeId, p.designation].filter(Boolean).join(" · ") }))}
          />
        </FormRow>
        {!project && <p className="text-xs text-ink-subtle sm:col-span-2">You’ll be recorded as the project creator ({user?.name}).</p>}
        {serverError && <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger sm:col-span-2">{serverError}</p>}
      </form>
    </Dialog>
  );
}
