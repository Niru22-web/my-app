"use client";

import { useState, type FormEvent } from "react";
import { Info } from "lucide-react";
import { ApiError } from "@/lib/api";
import { today, workDate } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormRow, Input, Select, Textarea } from "@/components/ui/inputs";
import { useToast } from "@/components/ui/toast";
import { useClients, useJobs, useProjects } from "@/components/timesheet/api";
import { CATEGORIES, useClaimMutations, type Claim } from "./api";

export function ClaimDialog({ open, onClose, claim }: { open: boolean; onClose: () => void; claim?: Claim | null }) {
  if (!open) return null;
  return <ClaimForm key={claim?.id ?? "new"} onClose={onClose} claim={claim} />;
}

const inactive = (s?: string) => (s ?? "").toLowerCase() === "inactive";

function ClaimForm({ onClose, claim }: { onClose: () => void; claim?: Claim | null }) {
  const toast = useToast();
  const m = useClaimMutations();
  const [clientId, setClientId] = useState(claim?.clientId ?? "");
  const [projectId, setProjectId] = useState(claim?.projectId ?? "");
  const [jobId, setJobId] = useState(claim?.jobId ?? "");
  const [category, setCategory] = useState(claim?.category ?? CATEGORIES[0]);
  const [amount, setAmount] = useState(claim ? String(claim.amount) : "");
  const [date, setDate] = useState(claim ? workDate(claim.date) : today());
  const [description, setDescription] = useState(claim?.description ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const clients = useClients();
  const projects = useProjects(clientId || undefined);
  const jobs = useJobs(projectId || undefined);
  const projectOptions = (projects.data ?? []).filter((p) => (!clientId || p.clientId === clientId) && (!inactive(p.status) || p.id === projectId));
  const jobOptions = (jobs.data ?? []).filter((j) => !inactive(j.status) || j.id === jobId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const n = Number(amount.replace(/,/g, ""));
    const errs: Record<string, string> = {};
    if (!clientId) errs.client = "Choose the client this expense is for.";
    if (!projectId) errs.project = "Choose a project.";
    if (!jobId) errs.job = "Choose a job.";
    if (!amount.trim() || Number.isNaN(n) || n <= 0) errs.amount = "Enter an amount greater than zero.";
    else if (n > 10_00_000) errs.amount = "That amount looks too large — please check it.";
    if (!date) errs.date = "Choose the expense date.";
    else if (date > today()) errs.date = "The expense date can’t be in the future.";
    if (description.trim().length < 5) errs.description = "Describe the expense (at least 5 characters).";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const body = { category, amount: Math.round(n * 100) / 100, description: description.trim(), date, clientId, projectId, jobId };
    try {
      if (claim) await m.update.mutateAsync({ id: claim.id, body });
      else await m.create.mutateAsync(body);
      toast.success(claim ? "Claim updated" : "Claim submitted", `${formatCurrency(body.amount)} · ${category}`);
      onClose();
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Couldn’t save the claim. Please try again.");
    }
  }

  const busy = m.create.isPending || m.update.isPending;
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={claim ? "Edit claim" : "New reimbursement claim"}
      description="Claims go to your manager first, then for final approval and payment."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="claim-form" loading={busy}>
            {claim ? "Save changes" : "Submit claim"}
          </Button>
        </>
      }
    >
      <form id="claim-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Client" htmlFor="cl-client" required error={errors.client} className="sm:col-span-2">
          <Select id="cl-client" value={clientId} invalid={!!errors.client} onChange={(e) => (setClientId(e.target.value), setProjectId(""), setJobId(""))}>
            <option value="">{clients.isLoading ? "Loading clients…" : "Select a client"}</option>
            {(clients.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Project" htmlFor="cl-project" required error={errors.project}>
          <Select id="cl-project" value={projectId} disabled={!clientId} invalid={!!errors.project} onChange={(e) => (setProjectId(e.target.value), setJobId(""))}>
            <option value="">{!clientId ? "Choose a client first" : "Select a project"}</option>
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Job" htmlFor="cl-job" required error={errors.job}>
          <Select id="cl-job" value={jobId} disabled={!projectId} invalid={!!errors.job} onChange={(e) => setJobId(e.target.value)}>
            <option value="">{!projectId ? "Choose a project first" : "Select a job"}</option>
            {jobOptions.map((j) => (
              <option key={j.id} value={j.id}>
                {j.jobId} · {j.name}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Expense head" htmlFor="cl-cat" required>
          <Select id="cl-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            {[...CATEGORIES, ...(claim && !CATEGORIES.includes(claim.category as (typeof CATEGORIES)[number]) ? [claim.category] : [])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Amount (₹)" htmlFor="cl-amt" required error={errors.amount}>
          <Input id="cl-amt" inputMode="decimal" placeholder="0.00" value={amount} invalid={!!errors.amount} onChange={(e) => setAmount(e.target.value)} />
        </FormRow>
        <FormRow label="Expense date" htmlFor="cl-date" required error={errors.date}>
          <Input id="cl-date" type="date" max={today()} value={date} invalid={!!errors.date} onChange={(e) => setDate(e.target.value)} />
        </FormRow>
        <FormRow label="Description" htmlFor="cl-desc" required error={errors.description} className="sm:col-span-2">
          <Textarea id="cl-desc" rows={3} maxLength={1000} value={description} invalid={!!errors.description} onChange={(e) => setDescription(e.target.value)} placeholder="What was the expense for?" />
        </FormRow>
        <div className="flex gap-2.5 rounded-xl bg-brand-softer px-3.5 py-3 text-[13px] text-ink sm:col-span-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
          <p>
            Receipt upload will be switched on with the next system update — the current server doesn’t store attachments. Keep your receipts and share them with Accounts if asked.
          </p>
        </div>
        {serverError && <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger sm:col-span-2">{serverError}</p>}
      </form>
    </Dialog>
  );
}
