"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormRow, Input, Select, Textarea } from "@/components/ui/inputs";
import { FileDrop } from "@/components/ui/file-drop";
import { useToast } from "@/components/ui/toast";
import { fullName, usePeople } from "@/components/management/api";
import { ATTACH_ACCEPT, isSupportAgent, PRIORITIES, useCategoryTree, useTicketMutations } from "./api";

export function RaiseTicketDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <RaiseForm onClose={onClose} />;
}

function RaiseForm({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const { user } = useAuth();
  const agent = isSupportAgent(user?.role);
  const tree = useCategoryTree();
  const people = usePeople(agent);
  const { create } = useTicketMutations();

  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<string>("Medium");
  const [assignedTo, setAssignedTo] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const parent = (tree.data ?? []).find((c) => String(c.id) === categoryId);
  const subs = (parent?.children ?? []).filter((c) => c.isActive);
  const target = subs.find((s) => String(s.id) === subcategoryId) ?? parent;
  const agents = (people.data ?? []).filter((p) => (p.status ?? "").toLowerCase() === "active" && ["it", "admin"].includes((p.role ?? "").toLowerCase()));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const errs: Record<string, string> = {};
    if (!categoryId) errs.category = "Choose what this is about.";
    if (subs.length > 0 && !subcategoryId) errs.subcategory = "Choose the specific issue.";
    if (title.trim().length < 5) errs.title = "Give the ticket a short subject (at least 5 characters).";
    if (description.trim().length < 10) errs.description = "Describe the problem (at least 10 characters).";
    if (files.length > 10) errs.files = "Attach up to 10 files.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const fd = new FormData();
    fd.append("title", title.trim());
    fd.append("description", description.trim());
    fd.append("priority", priority);
    fd.append("categoryId", categoryId);
    if (subcategoryId) fd.append("subcategoryId", subcategoryId);
    fd.append("category", [parent?.categoryName, target !== parent ? target?.categoryName : null].filter(Boolean).join(" - "));
    if (agent && assignedTo) fd.append("assignedTo", assignedTo);
    files.forEach((f) => fd.append("attachments", f));

    try {
      const res = await create.mutateAsync(fd);
      const t = res.data;
      toast.success(`Ticket ${t.ticketId ?? ""} raised`, `${t.assignedTeam ?? "Support"} team · response target ${t.slaHours ?? 24} h`);
      onClose();
      router.push(`/help-desk/${t.id}`);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Couldn’t raise the ticket. Please try again.");
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Raise a support ticket"
      description="It’s routed to the right team automatically based on the category."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="ticket-form" loading={create.isPending}>
            Raise ticket
          </Button>
        </>
      }
    >
      <form id="ticket-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Category" htmlFor="tk-cat" required error={errors.category}>
          <Select id="tk-cat" value={categoryId} invalid={!!errors.category} onChange={(e) => (setCategoryId(e.target.value), setSubcategoryId(""))}>
            <option value="">{tree.isLoading ? "Loading…" : (tree.data?.length ?? 0) ? "Select a category" : "No categories configured"}</option>
            {(tree.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.categoryName}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Issue" htmlFor="tk-sub" required={subs.length > 0} error={errors.subcategory}>
          <Select id="tk-sub" value={subcategoryId} disabled={!subs.length} invalid={!!errors.subcategory} onChange={(e) => setSubcategoryId(e.target.value)}>
            <option value="">{!categoryId ? "Choose a category first" : subs.length ? "Select the issue" : "Not needed for this category"}</option>
            {subs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.categoryName}
              </option>
            ))}
          </Select>
        </FormRow>
        {target && (
          <p className="rounded-xl bg-brand-softer px-3.5 py-2.5 text-[13px] text-ink sm:col-span-2">
            Goes to the <span className="font-semibold">{target.assignedTeam ?? parent?.assignedTeam ?? "IT"}</span> team · response target{" "}
            <span className="font-semibold">{target.slaHours ?? parent?.slaHours ?? 24} hours</span>
          </p>
        )}
        <FormRow label="Subject" htmlFor="tk-title" required error={errors.title} className="sm:col-span-2">
          <Input id="tk-title" maxLength={150} value={title} invalid={!!errors.title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Laptop won’t connect to office Wi-Fi" />
        </FormRow>
        <FormRow label="Description" htmlFor="tk-desc" required error={errors.description} className="sm:col-span-2">
          <Textarea id="tk-desc" rows={4} maxLength={4000} value={description} invalid={!!errors.description} onChange={(e) => setDescription(e.target.value)} placeholder="What happened, when it started, and anything you’ve already tried." />
        </FormRow>
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-ink">Priority</span>
          <div role="radiogroup" aria-label="Priority" className="grid h-10 grid-cols-3 gap-1 rounded-xl border border-line-strong bg-surface-muted p-1">
            {PRIORITIES.map((p) => (
              <button key={p} type="button" role="radio" aria-checked={priority === p} onClick={() => setPriority(p)} className={cn("rounded-lg text-[13px] font-medium", priority === p ? "bg-surface text-brand shadow-sm" : "text-ink-muted hover:text-ink")}>
                {p}
              </button>
            ))}
          </div>
        </div>
        {agent ? (
          <FormRow label="Assign to" htmlFor="tk-assign" hint="Leave on automatic to use the category’s routing.">
            <Select id="tk-assign" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              <option value="">Automatic</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {fullName(a)}
                </option>
              ))}
            </Select>
          </FormRow>
        ) : (
          <div />
        )}
        <FormRow label="Attachments" htmlFor="tk-files" error={errors.files} className="sm:col-span-2">
          <FileDrop id="tk-files" files={files} onChange={setFiles} accept={ATTACH_ACCEPT} maxMb={50} hint="Screenshots, PDFs, Office files · up to 10 files, 50 MB each" />
        </FormRow>
        {serverError && <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger sm:col-span-2">{serverError}</p>}
      </form>
    </Dialog>
  );
}
