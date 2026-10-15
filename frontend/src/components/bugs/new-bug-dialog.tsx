"use client";

import { createContext, useCallback, useContext, useState, type ClipboardEvent, type FormEvent, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Link2, X } from "lucide-react";
import { ApiError } from "@/lib/api";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormRow, Input, Select, Textarea } from "@/components/ui/inputs";
import { Segmented } from "@/components/ui/segmented";
import { FileDrop } from "@/components/ui/file-drop";
import { useToast } from "@/components/ui/toast";
import { BUG_ATTACH_ACCEPT, BUG_ENVIRONMENTS, BUG_MODULES, BUG_PRIORITIES, BUG_TYPES, useBugMutations } from "./api";

/** Image files pasted from the clipboard, renamed so several screenshots don't collide. */
export function pastedImages(e: ClipboardEvent): File[] {
  const items = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
  return items.map((f, i) => new File([f], `screenshot-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}-${i + 1}.${f.type.split("/")[1] || "png"}`, { type: f.type }));
}

export function NewBugDialog({ open, onClose, pageUrl }: { open: boolean; onClose: () => void; pageUrl?: string | null }) {
  if (!open) return null;
  return <NewBugForm onClose={onClose} initialPage={pageUrl ?? ""} />;
}

function NewBugForm({ onClose, initialPage }: { onClose: () => void; initialPage: string }) {
  const toast = useToast();
  const router = useRouter();
  const { create } = useBugMutations();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<(typeof BUG_TYPES)[number]>("Bug");
  const [module, setModule] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [environment, setEnvironment] = useState<(typeof BUG_ENVIRONMENTS)[number]>("UAT");
  const [description, setDescription] = useState("");
  const [pageUrl, setPageUrl] = useState(initialPage);
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const errs: Record<string, string> = {};
    if (title.trim().length < 5) errs.title = "Give it a short title (at least 5 characters).";
    if (!description.trim()) errs.description = "Describe what happened, or what you need.";
    if (files.length > 10) errs.files = "Attach up to 10 files.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const fd = new FormData();
    fd.append("title", title.trim());
    fd.append("type", type);
    if (module) fd.append("module", module);
    fd.append("priority", priority);
    fd.append("environment", environment);
    fd.append("description", description.trim());
    if (pageUrl.trim()) fd.append("pageUrl", pageUrl.trim());
    files.forEach((f) => fd.append("files", f));
    create.mutate(fd, {
      onSuccess: (d) => {
        toast.success(`Ticket ${d.code} created`, "The IT team has been notified.");
        onClose();
        router.push(`/bugs/${d.id}`);
      },
      onError: (err) => toast.error("Couldn’t create the ticket", err instanceof ApiError ? err.message : undefined),
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="New ticket"
      description="Report a problem or suggest an improvement to the portal."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={() => submit()} loading={create.isPending}>
            Create ticket
          </Button>
        </>
      }
    >
      <form
        onSubmit={submit}
        className="space-y-4"
        onPaste={(e) => {
          const imgs = pastedImages(e);
          if (imgs.length) {
            e.preventDefault();
            setFiles((f) => [...f, ...imgs]);
          }
        }}
      >
        <FormRow label="Title" htmlFor="bug-title" required error={errors.title}>
          <Input id="bug-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} invalid={!!errors.title} placeholder="e.g. Timesheet weekly total shows 0 hours" />
        </FormRow>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-ink">Type</p>
            <Segmented aria-label="Type" options={BUG_TYPES.map((t) => ({ value: t, label: t }))} value={type} onChange={setType} />
          </div>
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-ink">Environment</p>
            <Segmented aria-label="Environment" options={BUG_ENVIRONMENTS.map((t) => ({ value: t, label: t === "Live" ? "Live" : "UAT (testing)" }))} value={environment} onChange={setEnvironment} />
          </div>
          <FormRow label="Module" htmlFor="bug-module">
            <Select id="bug-module" value={module} onChange={(e) => setModule(e.target.value)}>
              <option value="">Choose a module…</option>
              {BUG_MODULES.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          </FormRow>
          <FormRow label="Priority" htmlFor="bug-priority" hint={priority === "Critical" ? "Critical: work is blocked for many people. Due in 1 day." : undefined}>
            <Select id="bug-priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {BUG_PRIORITIES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          </FormRow>
        </div>
        <FormRow label="Description" htmlFor="bug-desc" required error={errors.description} hint="What did you do, what did you expect, and what happened instead?">
          <Textarea id="bug-desc" rows={5} maxLength={10000} value={description} onChange={(e) => setDescription(e.target.value)} invalid={!!errors.description} />
        </FormRow>
        {pageUrl ? (
          <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2 text-xs text-ink-muted">
            <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              Page: <span className="font-mono text-ink">{pageUrl}</span>
            </span>
            <button type="button" onClick={() => setPageUrl("")} className="grid h-6 w-6 place-items-center rounded hover:bg-surface hover:text-danger" aria-label="Remove page link">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-ink">Screenshots</p>
          <FileDrop id="bug-files" files={files} onChange={setFiles} accept={BUG_ATTACH_ACCEPT} maxMb={15} hint="Images, PDF or text, up to 15 MB each. You can also paste a screenshot (Ctrl + V)." invalid={!!errors.files} />
          {errors.files && <p className="mt-1.5 text-xs text-danger">{errors.files}</p>}
        </div>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}

// ---- "New ticket" from anywhere in the Bug Tracker -------------------------------------------

const NewBugCtx = createContext<(pageUrl?: string) => void>(() => {});
/** Opens the New ticket dialog (optionally with the page it's about). */
export const useNewBug = () => useContext(NewBugCtx);

/**
 * Hosts the New ticket dialog for the section. Opening /bugs?new=1 (or ?page=/timesheet) shows it straight
 * away with the page link filled in.
 */
export function NewBugProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<{ page: string } | null>(null);
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fromUrl = sp.get("new") === "1" || sp.has("page") ? { page: sp.get("page") ?? "" } : null;
  const current = open ?? fromUrl;
  const close = () => {
    setOpen(null);
    if (fromUrl) {
      const next = new URLSearchParams(sp.toString());
      next.delete("new");
      next.delete("page");
      router.replace(next.size ? `${pathname}?${next}` : pathname);
    }
  };
  const show = useCallback((pageUrl?: string) => setOpen({ page: pageUrl ?? "" }), []);
  return (
    <NewBugCtx.Provider value={show}>
      {children}
      <NewBugDialog open={!!current} onClose={close} pageUrl={current?.page} />
    </NewBugCtx.Provider>
  );
}
