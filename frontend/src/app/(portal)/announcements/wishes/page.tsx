"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Cake, CalendarHeart, CheckCircle2, Gift, Pencil, PartyPopper, Plus, Send, Sparkles, Trash2 } from "lucide-react";
import { api, ApiError, assetUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Select } from "@/components/ui/inputs";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { AnnouncementCard } from "@/components/announcements/announcement-card";
import { TemplateEditor } from "@/components/announcements/template-editor";
import {
  canManageAnnouncements,
  fillPlaceholders,
  KEYS,
  KIND_LABEL,
  THEME_META,
  useTemplates,
  useWishesToday,
  type WishKind,
  type WishPerson,
  type WishTemplate,
} from "@/components/announcements/api";

const KIND_ICON = { BIRTHDAY: Cake, ANNIVERSARY: Gift, FESTIVAL: PartyPopper } as const;
const KIND_CATEGORY: Record<WishKind, string> = { BIRTHDAY: "Birthday", ANNIVERSARY: "Anniversary", FESTIVAL: "Festival" };

interface SendTarget {
  kind: WishKind;
  person?: WishPerson;
  years?: number;
  /** Festival: the template is fixed. */
  template?: WishTemplate;
}

const fmtYmd = (ymd: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-IN", { ...opts, timeZone: "UTC" });

export default function WishesPage() {
  const { user } = useAuth();
  const allowed = canManageAnnouncements(user?.role);
  const today = useWishesToday(allowed);
  const templates = useTemplates(allowed);
  const [target, setTarget] = useState<SendTarget | null>(null);
  const [editing, setEditing] = useState<{ template: WishTemplate | null; kind: WishKind } | null>(null);
  const [removing, setRemoving] = useState<WishTemplate | null>(null);
  const toast = useToast();
  const qc = useQueryClient();
  const closeEditor = useCallback(() => setEditing(null), []);

  const remove = useMutation({
    mutationFn: (id: string) => api<{ message: string }>(`announcements/templates/${id}`, { method: "DELETE" }),
    onSuccess: (r) => {
      toast.success(r.message ?? "Template deleted.");
      setRemoving(null);
    },
    onError: (e) => toast.error("Couldn’t delete the template", e instanceof ApiError ? e.message : undefined),
    onSettled: () => qc.invalidateQueries({ queryKey: KEYS.templates }),
  });

  const grouped = useMemo(() => {
    const g: Record<WishKind, WishTemplate[]> = { BIRTHDAY: [], ANNIVERSARY: [], FESTIVAL: [] };
    for (const t of templates.data ?? []) g[t.kind]?.push(t);
    g.FESTIVAL.sort((a, b) => (a.festivalOn ?? "9999").localeCompare(b.festivalOn ?? "9999") || a.name.localeCompare(b.name));
    return g;
  }, [templates.data]);

  if (!allowed) return <EmptyState icon={CalendarHeart} title="Not available" description="Only Admin, Owner and HR can send wishes." />;

  const d = today.data;
  const todayCount = d ? d.birthdays.length + d.anniversaries.length + d.festivals.length : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Wishes" description="Birthdays, work anniversaries and festivals — send wishes to the whole firm." />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* Today */}
        <Card>
          <CardHeader icon={Sparkles} title="Today" description={d ? fmtYmd(d.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : undefined} />
          <div className="p-5 pt-4">
            {today.isLoading ? (
              <div className="space-y-3">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            ) : today.isError ? (
              <ErrorState onRetry={() => today.refetch()} />
            ) : !d || todayCount === 0 ? (
              <EmptyState icon={CalendarHeart} title="Nothing to celebrate today" description="No birthdays, work anniversaries or festivals dated today." className="py-6" />
            ) : (
              <ul className="divide-y divide-line">
                {d.birthdays.map((b) => (
                  <TodayRow key={`b-${b.person.id}`} kind="BIRTHDAY" title={b.person.name} sub={`Birthday · ${[b.person.designation, b.person.department].filter(Boolean).join(", ")}`} person={b.person} sent={b.sent} auto={b.auto} announcementId={b.announcementId} onSend={() => setTarget({ kind: "BIRTHDAY", person: b.person })} />
                ))}
                {d.anniversaries.map((a) => (
                  <TodayRow key={`a-${a.person.id}`} kind="ANNIVERSARY" title={a.person.name} sub={`${a.years} ${a.years === 1 ? "year" : "years"} at ASA · ${a.person.department}`} person={a.person} sent={a.sent} auto={a.auto} announcementId={a.announcementId} onSend={() => setTarget({ kind: "ANNIVERSARY", person: a.person, years: a.years })} />
                ))}
                {d.festivals.map((f) => (
                  <TodayRow key={`f-${f.template.id}`} kind="FESTIVAL" title={f.template.name} sub="Festival · firm-wide wishes" sent={f.sent} auto={f.auto} announcementId={f.announcementId} onSend={() => setTarget({ kind: "FESTIVAL", template: f.template })} sendLabel="Send festival wishes" />
                ))}
              </ul>
            )}
            {d && d.missingDates > 0 && <p className="mt-3 text-xs text-ink-subtle">{d.missingDates} active staff have no birth or joining date on record, so they can’t appear here.</p>}
          </div>
        </Card>

        {/* Coming up */}
        <Card>
          <CardHeader icon={CalendarHeart} title="Coming up" description="Next 30 days" />
          <div className="p-5 pt-4">
            {today.isLoading ? (
              <Skeleton className="h-40" />
            ) : !d?.upcoming.length ? (
              <p className="py-6 text-center text-sm text-ink-subtle">Nothing in the next 30 days.</p>
            ) : (
              <ul className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
                {d.upcoming.map((u, i) => {
                  const Icon = KIND_ICON[u.kind];
                  return (
                    <li key={`${u.date}-${u.kind}-${u.person?.id ?? u.festival?.id}-${i}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                      <span className="w-20 shrink-0 text-xs font-medium text-ink-muted">{fmtYmd(u.date)}</span>
                      <Icon className="h-4 w-4 shrink-0 text-ink-subtle" aria-label={KIND_LABEL[u.kind]} />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">
                        {u.person?.name ?? u.festival?.name}
                        {u.kind === "ANNIVERSARY" && <span className="text-ink-subtle"> · {u.years} yrs</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>
      </div>

      {/* Templates */}
      <Card>
        <CardHeader
          title="Templates"
          description="Use {name}, {firstName}, {years}, {festival} and {firm}. Nothing is sent automatically unless you switch it on."
          actions={
            <Button size="sm" onClick={() => setEditing({ template: null, kind: "FESTIVAL" })}>
              <Plus className="h-4 w-4" aria-hidden /> New template
            </Button>
          }
        />
        <div className="p-5 pt-4">
          {templates.isLoading ? (
            <Skeleton className="h-40" />
          ) : templates.isError ? (
            <ErrorState onRetry={() => templates.refetch()} />
          ) : (
            <div className="grid gap-6 lg:grid-cols-3">
              {(Object.keys(grouped) as WishKind[]).map((k) => {
                const Icon = KIND_ICON[k];
                return (
                  <section key={k} aria-labelledby={`tpl-${k}`}>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 id={`tpl-${k}`} className="flex items-center gap-2 text-sm font-semibold text-ink">
                        <Icon className="h-4 w-4 text-brand" aria-hidden /> {KIND_LABEL[k]}
                        <span className="text-xs font-normal text-ink-subtle">({grouped[k].length})</span>
                      </h3>
                      <button type="button" onClick={() => setEditing({ template: null, kind: k })} className="text-xs font-semibold text-brand hover:underline">
                        Add
                      </button>
                    </div>
                    {grouped[k].length === 0 ? (
                      <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-xs text-ink-subtle">No templates yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {grouped[k].map((t) => (
                          <li key={t.id} className={cn("flex items-start gap-3 rounded-xl border border-line p-3", !t.isActive && "opacity-60")}>
                            <span className="text-xl leading-none" aria-hidden title={THEME_META[t.theme]?.label}>
                              {THEME_META[t.theme]?.emoji ?? "✨"}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-ink">{t.name}</p>
                              <p className="truncate text-xs text-ink-subtle">{t.title}</p>
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {k === "FESTIVAL" && <Badge tone={t.festivalOn ? "brand" : "neutral"}>{t.festivalOn ? fmtYmd(t.festivalOn, { day: "numeric", month: "short", year: "numeric" }) : "No date set"}</Badge>}
                                {t.autoSend && <Badge tone="success">Auto-send</Badge>}
                                {!t.isActive && <Badge tone="neutral">Inactive</Badge>}
                              </div>
                            </div>
                            <div className="flex shrink-0 gap-0.5">
                              <button type="button" onClick={() => setEditing({ template: t, kind: t.kind })} aria-label={`Edit ${t.name}`} className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink">
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button type="button" onClick={() => setRemoving(t)} aria-label={`Delete ${t.name}`} className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-danger">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {target && <SendWishDialog target={target} templates={templates.data ?? []} onClose={() => setTarget(null)} />}
      {editing && <TemplateEditor template={editing.template} kind={editing.kind} onClose={closeEditor} />}
      {removing && (
        <ConfirmDialog
          open
          onClose={() => setRemoving(null)}
          onConfirm={() => remove.mutate(removing.id)}
          busy={remove.isPending}
          tone="danger"
          title="Delete template?"
          confirmLabel="Delete"
          description={`“${removing.name}” will be removed. Wishes already sent stay as they are.`}
        />
      )}
    </div>
  );
}

function TodayRow({
  kind,
  title,
  sub,
  person,
  sent,
  auto,
  announcementId,
  onSend,
  sendLabel = "Send wish",
}: {
  kind: WishKind;
  title: string;
  sub: string;
  person?: WishPerson;
  sent: boolean;
  auto: boolean;
  announcementId: string | null;
  onSend: () => void;
  sendLabel?: string;
}) {
  const Icon = KIND_ICON[kind];
  return (
    <li className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
      {person ? (
        <Avatar name={person.name} src={assetUrl(person.profileImage)} size={40} />
      ) : (
        <span className="grid h-10 w-10 place-items-center rounded-full bg-warning-soft text-warning">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
          {person && <Icon className="h-3.5 w-3.5 text-ink-subtle" aria-hidden />}
          {title}
        </p>
        <p className="truncate text-xs text-ink-muted">{sub}</p>
      </div>
      {sent ? (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          {auto ? "Sent automatically" : "Sent"}
          {announcementId && (
            <Link href={`/announcements?open=${announcementId}`} className="ml-1 font-semibold text-brand hover:underline">
              View
            </Link>
          )}
        </span>
      ) : (
        <Button size="sm" onClick={onSend}>
          <Send className="h-3.5 w-3.5" aria-hidden /> {sendLabel}
        </Button>
      )}
    </li>
  );
}

function SendWishDialog({ target, templates, onClose }: { target: SendTarget; templates: WishTemplate[]; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const options = target.template ? [target.template] : templates.filter((t) => t.kind === target.kind && t.isActive);
  const [templateId, setTemplateId] = useState(options[0]?.id ?? "");
  const tpl = options.find((t) => t.id === templateId);
  const vars = target.person ? { name: target.person.name, firstName: target.person.firstName, years: target.years, festival: tpl?.name } : { festival: tpl?.name };

  const send = useMutation({
    mutationFn: () => api<{ message: string }>("announcements/wishes/send", { method: "POST", body: { kind: target.kind, employeeId: target.person?.id, templateId } }),
    onSuccess: (r) => {
      toast.success(r.message ?? "Wishes sent.");
      onClose();
    },
    onError: (e) => toast.error("Couldn’t send the wish", e instanceof ApiError ? e.message : undefined),
    onSettled: () => qc.invalidateQueries({ queryKey: ["announcements"] }),
  });

  const who = target.person ? (target.kind === "BIRTHDAY" ? `${target.person.name}'s birthday` : `${target.person.name}'s work anniversary`) : target.template?.name;

  return (
    <ConfirmDialog
      open
      onClose={onClose}
      onConfirm={() => (tpl ? send.mutate() : undefined)}
      busy={send.isPending}
      title={`Send wishes for ${who}?`}
      confirmLabel="Send to all staff"
      description={`It appears in everyone’s feed and as a banner until the end of today${target.person ? `; ${target.person.firstName} also gets a personal notification` : ""}.`}
    >
      <div className="mt-4 space-y-3">
        {!target.template && (
          <div>
            <label htmlFor="wish-template" className="mb-1.5 block text-[13px] font-medium text-ink">
              Template
            </label>
            {options.length ? (
              <Select id="wish-template" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                {options.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            ) : (
              <p className="text-sm text-danger">No active {KIND_LABEL[target.kind].toLowerCase()} template. Add one below first.</p>
            )}
          </div>
        )}
        {tpl && <AnnouncementCard preview data={{ title: fillPlaceholders(tpl.title, vars), message: fillPlaceholders(tpl.message, vars), category: KIND_CATEGORY[target.kind], pinned: true, theme: tpl.theme }} />}
      </div>
    </ConfirmDialog>
  );
}
