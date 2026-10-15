"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowUp, Eye, Plus, Rocket, Save, Trash2, X } from "lucide-react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { FormRow, Input, Select, Textarea } from "@/components/ui/inputs";
import { ConfirmDialog } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import {
  ITEM_TYPES,
  PORTAL_MODULES,
  TAG_STYLE,
  TAGS,
  useReleaseMutations,
  VERSION_RE,
  type ItemType,
  type Release,
  type ReleaseInput,
  type ReleaseSection,
} from "./api";
import { ReleaseCard } from "./release-card";

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

/** Suggests the next patch version after the newest one. */
export function nextVersion(versions: string[]): string {
  let best: number[] | null = null;
  for (const v of versions) {
    const m = v.match(/^v(\d+)\.(\d+)\.(\d+)$/);
    if (!m) continue;
    const n = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (!best || n[0] > best[0] || (n[0] === best[0] && (n[1] > best[1] || (n[1] === best[1] && n[2] > best[2])))) best = n;
  }
  return best ? `v${best[0]}.${best[1]}.${best[2] + 1}` : "v1.0.0";
}

export function ReleaseEditor({ release, suggestedVersion }: { release?: Release; suggestedVersion?: string }) {
  const router = useRouter();
  const toast = useToast();
  const m = useReleaseMutations();
  const uid = useId();
  const published = release?.status === "PUBLISHED";

  const [version, setVersion] = useState(release?.version ?? suggestedVersion ?? "v1.0.0");
  const [title, setTitle] = useState(release?.title ?? "");
  const [summary, setSummary] = useState(release?.summary ?? "");
  const [tags, setTags] = useState(release?.tags ?? []);
  const [sections, setSections] = useState<ReleaseSection[]>(release?.sections?.length ? release.sections : [{ module: "", items: [{ type: "New", text: "" }] }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const setSection = (i: number, patch: Partial<ReleaseSection>) => setSections((ss) => ss.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const setItem = (i: number, j: number, patch: Partial<{ type: ItemType; text: string }>) =>
    setSections((ss) => ss.map((s, k) => (k === i ? { ...s, items: s.items.map((it, n) => (n === j ? { ...it, ...patch } : it)) } : s)));
  const used = new Set(sections.map((s) => s.module.trim()));

  function validate(): ReleaseInput | null {
    const errs: Record<string, string> = {};
    if (!VERSION_RE.test(version.trim())) errs.version = "Use a “v” followed by major.minor.patch, e.g. v1.4.0.";
    if (!title.trim()) errs.title = "Add a title.";
    const clean = sections
      .map((s) => ({ module: s.module.trim(), items: s.items.map((it) => ({ type: it.type, text: it.text.trim() })).filter((it) => it.text) }))
      .filter((s) => s.module || s.items.length);
    if (!clean.length) errs.sections = "Add at least one module with a change.";
    clean.forEach((s, i) => {
      if (!s.module) errs[`m${i}`] = "Name the module.";
      else if (!s.items.length) errs[`m${i}`] = "Add at least one change.";
    });
    setErrors(errs);
    if (Object.keys(errs).length) return null;
    return { version: version.trim(), title: title.trim(), summary: summary.trim(), tags, sections: clean };
  }

  async function save(): Promise<Release | null> {
    setServerError(null);
    const body = validate();
    if (!body) {
      toast.error("Check the highlighted fields");
      return null;
    }
    try {
      const res = release ? await m.update.mutateAsync({ id: release.id, body }) : await m.create.mutateAsync(body);
      setSections(body.sections);
      return res.data;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Couldn’t save the release.";
      setServerError(msg);
      toast.error("Couldn’t save", msg);
      return null;
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const saved = await save();
    if (!saved) return;
    toast.success(published ? "Changes saved" : "Draft saved", saved.version);
    if (!release) router.replace(`/releases/${saved.id}/edit`);
  }

  async function publish() {
    const saved = await save();
    if (!saved) {
      setConfirmPublish(false);
      return;
    }
    try {
      const res = await m.publish.mutateAsync(saved.id);
      toast.success("Published", res.message);
      router.push(`/releases#${saved.version}`);
    } catch (e) {
      toast.error("Couldn’t publish", e instanceof ApiError ? e.message : undefined);
      setConfirmPublish(false);
    }
  }

  const busy = m.create.isPending || m.update.isPending || m.publish.isPending;
  const preview = (
    <ReleaseCard
      key={sections.length}
      release={{
        version: VERSION_RE.test(version.trim()) ? version.trim() : version.trim() || "v?.?.?",
        title: title.trim() || "Release title",
        summary: summary.trim() || null,
        tags,
        status: release?.status ?? "DRAFT",
        publishedAt: release?.publishedAt ?? null,
        createdAt: release?.createdAt ?? new Date().toISOString(),
        sections: sections.filter((s) => s.module.trim() || s.items.some((i) => i.text.trim())).map((s) => ({ module: s.module.trim() || "Module", items: s.items.filter((i) => i.text.trim()) })),
      }}
      defaultOpen={99}
    />
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/releases" className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-muted hover:text-brand">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Releases
          </Link>
          <h2 className="mt-1 font-display text-2xl font-bold text-ink">{release ? `Edit ${release.version}` : "New release"}</h2>
          {published && <p className="mt-1 text-sm text-ink-muted">This release is published. Changes show straight away; nobody is notified again.</p>}
        </div>
        <Button type="button" variant="secondary" className="xl:hidden" onClick={() => setShowPreview((v) => !v)} aria-expanded={showPreview}>
          <Eye className="h-4 w-4" aria-hidden /> {showPreview ? "Hide preview" : "Preview"}
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form onSubmit={onSubmit} className="space-y-5 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card" noValidate>
          <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
            <FormRow label="Version" htmlFor={`${uid}-version`} required error={errors.version}>
              <Input id={`${uid}-version`} value={version} onChange={(e) => setVersion(e.target.value)} invalid={!!errors.version} className="font-mono" placeholder="v1.4.0" />
            </FormRow>
            <FormRow label="Title" htmlFor={`${uid}-title`} required error={errors.title}>
              <Input id={`${uid}-title`} value={title} onChange={(e) => setTitle(e.target.value)} invalid={!!errors.title} maxLength={160} placeholder="e.g. Faster timesheets and credit notes" />
            </FormRow>
          </div>
          <FormRow label="Summary" htmlFor={`${uid}-summary`} hint="One or two sentences in plain words.">
            <Textarea id={`${uid}-summary`} value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} maxLength={2000} />
          </FormRow>

          <fieldset>
            <legend className="mb-1.5 text-[13px] font-medium text-ink">Tags</legend>
            <div className="flex flex-wrap gap-2">
              {TAGS.map((t) => {
                const on = tags.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setTags((cur) => (on ? cur.filter((x) => x !== t) : TAGS.filter((x) => x === t || cur.includes(x))))}
                    className={cn(
                      "rounded-full px-3 py-1 text-[11px] font-bold tracking-wider uppercase transition-opacity",
                      on ? TAG_STYLE[t] : "border border-dashed border-line-strong text-ink-subtle hover:text-ink",
                    )}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-medium text-ink">Changes by module</h3>
              {errors.sections && <p className="text-xs text-danger">{errors.sections}</p>}
            </div>
            <datalist id={`${uid}-modules`}>
              {PORTAL_MODULES.filter((x) => !used.has(x)).map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
            {sections.map((s, i) => (
              <div key={i} className="rounded-xl border border-line bg-surface-muted p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`${uid}-m${i}`} className="sr-only">
                      Module {i + 1}
                    </label>
                    <Input
                      id={`${uid}-m${i}`}
                      list={`${uid}-modules`}
                      value={s.module}
                      onChange={(e) => setSection(i, { module: e.target.value })}
                      invalid={!!errors[`m${i}`]}
                      placeholder="Module, e.g. Timesheets"
                      className="font-semibold"
                    />
                    {errors[`m${i}`] && <p className="mt-1 text-xs text-danger">{errors[`m${i}`]}</p>}
                  </div>
                  <Button type="button" size="icon" variant="ghost" aria-label={`Move ${s.module || "module"} up`} disabled={i === 0} onClick={() => setSections((ss) => move(ss, i, i - 1))}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" aria-label={`Move ${s.module || "module"} down`} disabled={i === sections.length - 1} onClick={() => setSections((ss) => move(ss, i, i + 1))}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${s.module || "module"}`} onClick={() => setSections((ss) => ss.filter((_, k) => k !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <ul className="mt-2 space-y-2">
                  {s.items.map((it, j) => (
                    <li key={j} className="flex items-start gap-2">
                      <Select aria-label="Change type" value={it.type} onChange={(e) => setItem(i, j, { type: e.target.value as ItemType })} className="w-32 shrink-0">
                        {ITEM_TYPES.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </Select>
                      <Input
                        aria-label={`Change ${j + 1} under ${s.module || "this module"}`}
                        value={it.text}
                        onChange={(e) => setItem(i, j, { text: e.target.value })}
                        maxLength={500}
                        placeholder="What changed, in plain words"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            setSection(i, { items: [...s.items.slice(0, j + 1), { type: it.type, text: "" }, ...s.items.slice(j + 1)] });
                            setTimeout(() => document.getElementById(`${uid}-i${i}-${j + 1}`)?.focus(), 0);
                          }
                        }}
                        id={`${uid}-i${i}-${j}`}
                      />
                      <div className="flex shrink-0">
                        <button type="button" className="grid h-10 w-7 place-items-center text-ink-subtle hover:text-ink disabled:opacity-30" aria-label="Move change up" disabled={j === 0} onClick={() => setSection(i, { items: move(s.items, j, j - 1) })}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" className="grid h-10 w-7 place-items-center text-ink-subtle hover:text-ink disabled:opacity-30" aria-label="Move change down" disabled={j === s.items.length - 1} onClick={() => setSection(i, { items: move(s.items, j, j + 1) })}>
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" className="grid h-10 w-7 place-items-center text-ink-subtle hover:text-danger" aria-label="Remove change" onClick={() => setSection(i, { items: s.items.filter((_, n) => n !== j) })}>
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => setSection(i, { items: [...s.items, { type: "New", text: "" }] })}
                  className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden /> Add change
                </button>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={() => setSections((ss) => [...ss, { module: "", items: [{ type: "New", text: "" }] }])}>
              <Plus className="h-4 w-4" aria-hidden /> Add module
            </Button>
          </div>

          {serverError && (
            <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
              {serverError}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            <Link href="/releases" className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-ink-muted hover:bg-surface-muted hover:text-ink">
              Cancel
            </Link>
            <Button type="submit" variant={published ? "primary" : "secondary"} loading={m.create.isPending || m.update.isPending} disabled={busy}>
              <Save className="h-4 w-4" aria-hidden /> {published ? "Save changes" : "Save draft"}
            </Button>
            {!published && (
              <Button type="button" disabled={busy} onClick={() => validate() && setConfirmPublish(true)}>
                <Rocket className="h-4 w-4" aria-hidden /> Publish
              </Button>
            )}
          </div>
        </form>

        <section aria-label="Preview" className={cn("space-y-2 xl:block", showPreview ? "block" : "hidden")}>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">Preview</p>
          <div className="xl:sticky xl:top-20">{preview}</div>
        </section>
      </div>

      <ConfirmDialog
        open={confirmPublish}
        onClose={() => setConfirmPublish(false)}
        onConfirm={publish}
        busy={busy}
        title={`Publish ${version.trim()}?`}
        confirmLabel="Publish and notify"
        description="The release is saved, then everyone with an active account gets a notification and sees a “What’s new” prompt."
      />
    </div>
  );
}
