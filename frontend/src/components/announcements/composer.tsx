"use client";

import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, Building2, CalendarClock, MapPin, Megaphone, ShieldCheck, Users } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import type { Envelope } from "@/lib/types";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormRow, Input, Select, Textarea } from "@/components/ui/inputs";
import { PeoplePicker } from "@/components/ui/people-picker";
import { useToast } from "@/components/ui/toast";
import { AnnouncementCard } from "./announcement-card";
import { FilterChip, MultiSelectPanel } from "./filter-chip";
import { CATEGORIES, useAudienceOptions, type Announcement, type Audience, type AudiencePreview, type Category } from "./api";

type Dim = "departments" | "designations" | "roles" | "locations" | "employeeIds";

const DIMS: { key: Dim; label: string; icon: typeof Building2 }[] = [
  { key: "departments", label: "Departments", icon: Building2 },
  { key: "designations", label: "Designations", icon: Briefcase },
  { key: "roles", label: "Roles", icon: ShieldCheck },
  { key: "locations", label: "Locations", icon: MapPin },
  { key: "employeeIds", label: "People", icon: Users },
];

const pad = (n: number) => String(n).padStart(2, "0");
/** ISO → value for <input type="datetime-local"> in the viewer's time zone. */
const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** ISO → IST calendar date for the "Expires on" field. */
const toIstDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) : "");

export interface ComposerSeed {
  /** Set when editing an existing draft / scheduled announcement. */
  id?: string;
  title: string;
  message: string;
  category: Category;
  audience: Audience;
  pinned: boolean;
  expiresAt: string | null;
  scheduledAt: string | null;
}

export const emptySeed = (): ComposerSeed => ({ title: "", message: "", category: "Announcement", audience: {}, pinned: false, expiresAt: null, scheduledAt: null });

export function seedFrom(a: Announcement, duplicate: boolean): ComposerSeed {
  return {
    id: duplicate ? undefined : a.id,
    title: a.title,
    message: a.message,
    category: a.category,
    audience: a.audience ?? {},
    pinned: a.pinned,
    expiresAt: duplicate ? null : a.expiresAt,
    scheduledAt: duplicate ? null : a.scheduledAt,
  };
}

/** "Send Global Broadcast"-style composer: message, category, targeting filters, options, live preview. */
export function Composer({ open, seed, onClose }: { open: boolean; seed: ComposerSeed | null; onClose: () => void }) {
  return open && seed ? <ComposerBody seed={seed} onClose={onClose} /> : null;
}

function ComposerBody({ seed, onClose }: { seed: ComposerSeed; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const opts = useAudienceOptions();
  const [title, setTitle] = useState(seed.title);
  const [message, setMessage] = useState(seed.message);
  const [category, setCategory] = useState<Category>(seed.category);
  const [audience, setAudience] = useState<Audience>(seed.audience);
  const [pinned, setPinned] = useState(seed.pinned);
  const [expiresOn, setExpiresOn] = useState(toIstDate(seed.expiresAt));
  const [later, setLater] = useState(!!seed.scheduledAt);
  const [scheduledAt, setScheduledAt] = useState(toLocalInput(seed.scheduledAt));
  const [panel, setPanel] = useState<Dim | null>(null);
  const [errors, setErrors] = useState<{ title?: string; message?: string; scheduledAt?: string }>({});
  // Set when the server kept a draft after a failed send, so a retry updates it instead of making another.
  const [savedId, setSavedId] = useState<string | undefined>(seed.id);

  // Debounced audience for the live count.
  const audienceKey = JSON.stringify(audience);
  const [debounced, setDebounced] = useState(audienceKey);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(audienceKey), 250);
    return () => clearTimeout(t);
  }, [audienceKey]);
  const preview = useQuery({
    queryKey: ["announcements", "audience-preview", debounced],
    placeholderData: keepPreviousData,
    queryFn: async () => (await api<Envelope<AudiencePreview>>("announcements/audience-preview", { method: "POST", body: { audience: JSON.parse(debounced) } })).data,
  });

  const peopleOptions = useMemo(() => (opts.data?.people ?? []).map((p) => ({ id: p.id, label: p.name, sub: p.sub })), [opts.data]);
  const setDim = (k: Dim, v: string[]) => setAudience((a) => ({ ...a, [k]: v.length ? v : undefined }));
  const anyFilter = DIMS.some((d) => (audience[d.key]?.length ?? 0) > 0);

  const save = useMutation({
    mutationFn: async (action: "draft" | "send" | "schedule") => {
      const body = {
        title,
        message,
        category,
        audience,
        pinned,
        expiresAt: expiresOn || null,
        scheduledAt: later && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        action,
      };
      return savedId
        ? api<Envelope<Announcement> & { message: string }>(`announcements/${savedId}`, { method: "PUT", body })
        : api<Envelope<Announcement> & { message: string }>("announcements", { method: "POST", body });
    },
    onSuccess: (r) => {
      toast.success(r.message ?? "Saved.");
      qc.invalidateQueries({ queryKey: ["announcements"] });
      onClose();
    },
    onError: (e) => {
      const kept = e instanceof ApiError ? (e.body as { data?: { id?: string } } | null)?.data?.id : undefined;
      if (kept) setSavedId(kept);
      toast.error("Couldn’t save the announcement", e instanceof ApiError ? e.message : undefined);
      qc.invalidateQueries({ queryKey: ["announcements"] });
    },
  });

  const submit = (action: "draft" | "send") => {
    const errs: typeof errors = {};
    if (!title.trim()) errs.title = "Enter a title.";
    if (!message.trim()) errs.message = "Enter a message.";
    if (action === "send" && later) {
      if (!scheduledAt) errs.scheduledAt = "Choose when to send it.";
      else if (new Date(scheduledAt).getTime() <= Date.now()) errs.scheduledAt = "Choose a time in the future.";
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    save.mutate(action === "send" && later ? "schedule" : action);
  };

  const p = preview.data;
  const summary = !p
    ? "Counting recipients…"
    : p.everyone
      ? `No filter selected → sent to all active staff (${p.count}).`
      : p.count === 0
        ? "No active staff match these filters."
        : `Sends to ${p.count} ${p.count === 1 ? "person" : "people"}: ${p.names.slice(0, 6).join(", ")}${p.count > 6 ? ` and ${p.count - 6} more` : ""}.`;

  const options = { departments: opts.data?.departments ?? [], designations: opts.data?.designations ?? [], roles: opts.data?.roles ?? [], locations: opts.data?.locations ?? [] };
  const sendLabel = later ? "Schedule" : p && !p.everyone ? `Send to ${p.count}` : "Send to everyone";

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={seed.id ? "Edit announcement" : "Send announcement"}
      description={
        <span className="inline-flex items-center gap-1.5">
          <Megaphone className="h-3.5 w-3.5 text-brand" aria-hidden />
          Reaches everyone you target in their feed and notifications.
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => submit("draft")} loading={save.isPending && save.variables === "draft"} disabled={save.isPending}>
            Save draft
          </Button>
          <Button onClick={() => submit("send")} loading={save.isPending && save.variables !== "draft"} disabled={save.isPending || (!later && p?.count === 0)}>
            {later ? <CalendarClock className="h-4 w-4" aria-hidden /> : <Megaphone className="h-4 w-4" aria-hidden />}
            {sendLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormRow label="Title" htmlFor="ann-title" required error={errors.title}>
          <Input id="ann-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} invalid={!!errors.title} placeholder="e.g. Office closed on Friday for Diwali" />
        </FormRow>
        <FormRow label="Message" htmlFor="ann-message" required error={errors.message} hint={`${message.length}/5000 · line breaks are kept`}>
          <Textarea id="ann-message" rows={5} value={message} maxLength={5000} onChange={(e) => setMessage(e.target.value)} invalid={!!errors.message} placeholder="Write the announcement…" />
        </FormRow>
        <FormRow label="Category" htmlFor="ann-category">
          <Select id="ann-category" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </FormRow>

        <fieldset>
          <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Targeting filters</legend>
          <div className="flex flex-wrap gap-2">
            {DIMS.map((d) => {
              const Icon = d.icon;
              return (
                <FilterChip
                  key={d.key}
                  label={d.label}
                  icon={<Icon className="h-3.5 w-3.5" aria-hidden />}
                  count={audience[d.key]?.length ?? 0}
                  open={panel === d.key}
                  onToggle={() => setPanel((x) => (x === d.key ? null : d.key))}
                  onClear={() => setDim(d.key, [])}
                />
              );
            })}
            {anyFilter && (
              <button type="button" onClick={() => setAudience({})} className="h-8 px-2 text-xs font-semibold text-brand hover:underline">
                Clear all
              </button>
            )}
          </div>
          {panel && panel !== "employeeIds" && (
            <MultiSelectPanel
              label={DIMS.find((d) => d.key === panel)!.label}
              options={options[panel]}
              value={audience[panel] ?? []}
              onChange={(v) => setDim(panel, v)}
              onClose={() => setPanel(null)}
            />
          )}
          {panel === "employeeIds" && (
            <div className="mt-2">
              <PeoplePicker id="ann-people" options={peopleOptions} value={audience.employeeIds ?? []} onChange={(v) => setDim("employeeIds", v)} loading={opts.isLoading} placeholder="Add people by name" />
            </div>
          )}
          <p className={cn("mt-2 rounded-lg px-3 py-2 text-[13px]", p?.count === 0 && !p.everyone ? "bg-danger-soft text-danger" : "bg-surface-muted text-ink-muted")} aria-live="polite">
            {summary}
          </p>
          <p className="mt-1 text-[11px] text-ink-subtle">Within one filter people match any choice; across filters they must match all. People picked by name are always included.</p>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 sm:col-span-2">
            <input type="checkbox" role="switch" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--brand)]" />
            <span>
              <span className="block text-sm font-medium text-ink">Pin as banner</span>
              <span className="block text-xs text-ink-muted">Shows at the top of the portal for each recipient until they dismiss it or it expires.</span>
            </span>
          </label>
          <FormRow label="Expires on" htmlFor="ann-expires" hint="Optional — hidden from the banner after this day.">
            <Input id="ann-expires" type="date" value={expiresOn} min={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })} onChange={(e) => setExpiresOn(e.target.value)} />
          </FormRow>
          <div>
            <label className="mb-1.5 flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink">
              <input type="checkbox" checked={later} onChange={(e) => setLater(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
              Schedule for later
            </label>
            <Input id="ann-schedule" type="datetime-local" aria-label="Send at" disabled={!later} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} invalid={!!errors.scheduledAt} />
            {errors.scheduledAt && <p className="mt-1.5 text-xs text-danger">{errors.scheduledAt}</p>}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Preview</p>
          <AnnouncementCard preview data={{ title, message, category, pinned, read: false, sender: { name: user?.name ?? "You", designation: user?.position ?? null, profileImage: user?.profileImage ?? null } }} />
        </div>
      </div>
    </Dialog>
  );
}
