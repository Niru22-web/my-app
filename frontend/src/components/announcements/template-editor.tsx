"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { Envelope } from "@/lib/types";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormRow, Input, Select, Textarea } from "@/components/ui/inputs";
import { useToast } from "@/components/ui/toast";
import { AnnouncementCard } from "./announcement-card";
import { fillPlaceholders, KEYS, KIND_LABEL, PLACEHOLDERS, THEME_META, THEMES, type Theme, type WishKind, type WishTemplate } from "./api";

const SAMPLE = { name: "Priya Sharma", firstName: "Priya", years: 5 };
const KIND_CATEGORY: Record<WishKind, string> = { BIRTHDAY: "Birthday", ANNIVERSARY: "Anniversary", FESTIVAL: "Festival" };

export function previewVars(kind: WishKind, festival: string) {
  return kind === "FESTIVAL" ? { festival } : { ...SAMPLE, festival };
}

/** Create / edit a wish template with clickable placeholders and a live preview. */
export function TemplateEditor({ template, kind: newKind, onClose }: { template: WishTemplate | null; kind: WishKind; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [kind, setKind] = useState<WishKind>(template?.kind ?? newKind);
  const [name, setName] = useState(template?.name ?? "");
  const [title, setTitle] = useState(template?.title ?? "");
  const [message, setMessage] = useState(template?.message ?? "");
  const [festivalOn, setFestivalOn] = useState(template?.festivalOn ?? "");
  const [theme, setTheme] = useState<Theme>(template?.theme ?? "classic");
  const [autoSend, setAutoSend] = useState(template?.autoSend ?? false);
  const [isActive, setIsActive] = useState(template?.isActive ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const titleRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<"title" | "message">("message");

  const insert = (token: string) => {
    const field = lastField.current;
    const el = field === "title" ? titleRef.current : messageRef.current;
    const value = field === "title" ? title : message;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    (field === "title" ? setTitle : setMessage)(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = useMutation({
    mutationFn: () => {
      const body = { kind, name, title, message, festivalOn: kind === "FESTIVAL" ? festivalOn || null : null, theme, autoSend, isActive };
      return template
        ? api<Envelope<WishTemplate> & { message: string }>(`announcements/templates/${template.id}`, { method: "PUT", body })
        : api<Envelope<WishTemplate> & { message: string }>("announcements/templates", { method: "POST", body });
    },
    onSuccess: (r) => {
      toast.success(r.message ?? "Template saved.");
      qc.invalidateQueries({ queryKey: KEYS.templates });
      qc.invalidateQueries({ queryKey: KEYS.wishes });
      onClose();
    },
    onError: (e) => toast.error("Couldn’t save the template", e instanceof ApiError ? e.message : undefined),
  });

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Enter a name.";
    if (!title.trim()) errs.title = "Enter a title.";
    if (!message.trim()) errs.message = "Enter a message.";
    setErrors(errs);
    if (!Object.keys(errs).length) save.mutate();
  };

  const vars = previewVars(kind, name || "Festival");
  const relevant = PLACEHOLDERS.filter((p) => (kind === "FESTIVAL" ? !["{name}", "{firstName}", "{years}"].includes(p.token) : kind === "BIRTHDAY" ? p.token !== "{years}" : true));

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={template ? `Edit template — ${template.name}` : "New wish template"}
      description="Placeholders are filled in when the wish is sent."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Save template
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormRow label="Kind" htmlFor="tpl-kind">
            <Select id="tpl-kind" value={kind} disabled={!!template} onChange={(e) => setKind(e.target.value as WishKind)}>
              {(Object.keys(KIND_LABEL) as WishKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </FormRow>
          <FormRow label={kind === "FESTIVAL" ? "Festival name" : "Template name"} htmlFor="tpl-name" required error={errors.name}>
            <Input id="tpl-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} invalid={!!errors.name} placeholder={kind === "FESTIVAL" ? "e.g. Diwali" : "e.g. Birthday — formal"} />
          </FormRow>
        </div>

        <FormRow label="Title" htmlFor="tpl-title" required error={errors.title}>
          <Input ref={titleRef} id="tpl-title" value={title} maxLength={200} onFocus={() => (lastField.current = "title")} onChange={(e) => setTitle(e.target.value)} invalid={!!errors.title} />
        </FormRow>
        <FormRow label="Message" htmlFor="tpl-message" required error={errors.message}>
          <Textarea ref={messageRef} id="tpl-message" rows={4} value={message} maxLength={2000} onFocus={() => (lastField.current = "message")} onChange={(e) => setMessage(e.target.value)} invalid={!!errors.message} />
        </FormRow>
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Insert placeholder</p>
          <div className="flex flex-wrap gap-1.5">
            {relevant.map((p) => (
              <button
                key={p.token}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insert(p.token)}
                title={p.hint}
                className="rounded-lg border border-line bg-surface-muted px-2 py-1 font-mono text-xs text-ink hover:border-brand hover:text-brand"
              >
                {p.token}
              </button>
            ))}
          </div>
        </div>

        {kind === "FESTIVAL" && (
          <FormRow label="Festival date (this year)" htmlFor="tpl-date" hint="Set the date each year — festival dates move. Leave empty if not decided.">
            <Input id="tpl-date" type="date" value={festivalOn} onChange={(e) => setFestivalOn(e.target.value)} />
          </FormRow>
        )}

        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-ink">Card style</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup">
            {THEMES.map((t) => (
              <label key={t} className={cn("flex cursor-pointer flex-col items-center gap-1 rounded-xl border p-3 text-xs font-medium focus-within:ring-2 focus-within:ring-brand", THEME_META[t].card, theme === t ? "ring-2 ring-brand" : "")}>
                <input type="radio" name="tpl-theme" value={t} checked={theme === t} onChange={() => setTheme(t)} className="sr-only" />
                <span className="text-2xl" aria-hidden>
                  {THEME_META[t].emoji}
                </span>
                <span className="text-ink">{THEME_META[t].label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3">
            <input type="checkbox" role="switch" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--brand)]" />
            <span>
              <span className="block text-sm font-medium text-ink">Send automatically</span>
              <span className="block text-xs text-ink-muted">{kind === "FESTIVAL" ? "Goes to all staff after 9:00 am on the festival date." : "Goes out after 9:00 am on the day for everyone whose date it is."}</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3">
            <input type="checkbox" role="switch" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--brand)]" />
            <span>
              <span className="block text-sm font-medium text-ink">Active</span>
              <span className="block text-xs text-ink-muted">Inactive templates can’t be used for sending.</span>
            </span>
          </label>
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Preview{kind !== "FESTIVAL" && ` (sample: ${SAMPLE.name})`}</p>
          <AnnouncementCard
            preview
            data={{ title: fillPlaceholders(title, vars), message: fillPlaceholders(message, vars), category: KIND_CATEGORY[kind], pinned: true, theme, sender: { name: "ASA Portal" } }}
          />
        </div>
      </div>
    </Dialog>
  );
}
