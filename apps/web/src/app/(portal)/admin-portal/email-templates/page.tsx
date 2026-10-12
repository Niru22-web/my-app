"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Mail, MailWarning, Pencil, Plus, Search, Send, Info } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { FormRow, Input, Select, Textarea } from "@/components/ui/inputs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { canEmail, useAdminMutations, useEmailStatus, useEmailTemplates, type EmailTemplate } from "@/components/admin/api";

export default function EmailPage() {
  const { user } = useAuth();
  const on = canEmail(user?.role);
  const status = useEmailStatus(on);
  const q = useEmailTemplates(on);
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("");
  const [editing, setEditing] = useState<EmailTemplate | null | undefined>(undefined);

  const cats = useMemo(() => [...new Set((q.data ?? []).map((t) => t.category))].sort(), [q.data]);
  const rows = (q.data ?? []).filter((t) => (!cat || t.category === cat) && (!search.trim() || `${t.name} ${t.subject}`.toLowerCase().includes(search.trim().toLowerCase())));
  const providers = Object.entries(status.data?.providers ?? {}).filter(([, p]) => p?.connected);

  if (!on)
    return (
      <Card>
        <EmptyState title="Only Admin can manage email" />
      </Card>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email"
        description="The mailbox the portal sends from, and the templates it uses"
        actions={
          <Button onClick={() => setEditing(null)}>
            <Plus className="h-4 w-4" /> New template
          </Button>
        }
      />

      <Card>
        <CardHeader icon={status.data?.connected ? CheckCircle2 : MailWarning} title="Sending mailbox" />
        {status.isLoading ? (
          <Skeleton className="m-5 h-16" />
        ) : status.isError ? (
          <ErrorState message="Mailbox status couldn’t be loaded." onRetry={() => status.refetch()} />
        ) : (
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-[13px]">
              {providers.length ? (
                providers.map(([name, p]) => (
                  <p key={name} className="text-ink">
                    <Badge tone="success">Connected</Badge> <span className="ml-1 capitalize">{name}</span>
                    {p.email && <span className="text-ink-muted"> · {p.email}</span>}
                  </p>
                ))
              ) : (
                <p className="text-ink">
                  <Badge tone="warning">Not connected</Badge> <span className="ml-1 text-ink-muted">Portal emails (approvals, reminders, invitations) won’t be delivered.</span>
                </p>
              )}
              <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-subtle">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Connecting or replacing the mailbox stays in the current portal for now — its sign-in flow puts your session token in the web address, which the new server will fix.
              </p>
            </div>
            <TestEmail to={user?.email ?? ""} />
          </div>
        )}
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold text-ink">Templates</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          {cats.length > 1 && (
            <Select aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)} className="sm:w-44">
              <option value="">All categories</option>
              {cats.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          )}
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
            <Input placeholder="Search templates" aria-label="Search templates" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>
      </div>
      {q.isError ? (
        <Card>
          <ErrorState message="Templates couldn’t be loaded." onRetry={() => q.refetch()} />
        </Card>
      ) : q.isLoading ? (
        <Skeleton className="h-48" />
      ) : !rows.length ? (
        <Card>
          <EmptyState icon={Mail} title={q.data?.length ? "No templates match" : "No templates yet"} />
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((t) => (
            <li key={t.id}>
              <button onClick={() => setEditing(t)} className="group flex h-full w-full flex-col rounded-2xl border border-line bg-surface p-4 text-left transition-colors hover:border-brand/40">
                <span className="flex w-full items-start justify-between gap-2">
                  <span className="font-semibold text-ink">{t.name}</span>
                  <Pencil className="h-4 w-4 shrink-0 text-ink-subtle group-hover:text-brand" aria-hidden />
                </span>
                <span className="mt-1 line-clamp-1 text-[13px] text-ink-muted">{t.subject}</span>
                <span className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-ink-subtle">
                  <Badge>{t.category}</Badge>
                  {t.variables?.length > 0 && <span>{t.variables.length} placeholders</span>}
                  <span className="ml-auto">{formatDate(t.updatedAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing !== undefined && <TemplateDialog tpl={editing} categories={cats} onClose={() => setEditing(undefined)} />}
    </div>
  );
}

function TestEmail({ to }: { to: string }) {
  const toast = useToast();
  const m = useAdminMutations();
  return (
    <Button
      variant="secondary"
      disabled={!to}
      loading={m.testEmail.isPending}
      onClick={() =>
        m.testEmail.mutate(
          { to, subject: "ASA Portal test email", text: "This is a test email from the ASA Portal. If you can read it, sending works.", html: "<p>This is a test email from the <strong>ASA Portal</strong>. If you can read it, sending works.</p>" },
          { onSuccess: () => toast.success("Test email sent", `Check ${to}.`), onError: (e) => toast.error("Sending failed", e instanceof ApiError ? e.message : undefined) },
        )
      }
    >
      <Send className="h-4 w-4" /> Send me a test
    </Button>
  );
}

function TemplateDialog({ tpl, categories, onClose }: { tpl: EmailTemplate | null; categories: string[]; onClose: () => void }) {
  const toast = useToast();
  const m = useAdminMutations();
  const [name, setName] = useState(tpl?.name ?? "");
  const [category, setCategory] = useState(tpl?.category ?? categories[0] ?? "General");
  const [subject, setSubject] = useState(tpl?.subject ?? "");
  const [body, setBody] = useState(tpl?.body ?? "");
  const [tried, setTried] = useState(false);
  const used = useMemo(() => [...new Set([...`${subject} ${body}`.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((x) => x[1]))], [subject, body]);
  const known = new Set(tpl?.variables ?? []);
  const unknown = tpl?.variables?.length ? used.filter((v) => !known.has(v)) : [];
  const errors = { name: !name.trim() ? "Required." : "", category: !category.trim() ? "Required." : "", subject: !subject.trim() ? "Required." : "", body: body.trim().length < 10 ? "Write the email body." : "" };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.values(errors).some(Boolean)) return;
    try {
      await m.saveTemplate.mutateAsync({ id: tpl?.id, name: name.trim(), category: category.trim(), subject: subject.trim(), body, ...(tpl ? {} : { variables: used }) });
      toast.success(tpl ? "Template saved" : "Template created");
      onClose();
    } catch (err) {
      toast.error("Couldn’t save the template", err instanceof ApiError ? err.message : undefined);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={tpl ? `Edit “${tpl.name}”` : "New email template"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="tpl-form" loading={m.saveTemplate.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id="tpl-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Name" htmlFor="tp-name" required error={tried ? errors.name : undefined}>
          <Input id="tp-name" value={name} onChange={(e) => setName(e.target.value)} invalid={tried && !!errors.name} />
        </FormRow>
        <FormRow label="Category" htmlFor="tp-cat" required error={tried ? errors.category : undefined}>
          <Input id="tp-cat" list="tp-cats" value={category} onChange={(e) => setCategory(e.target.value)} invalid={tried && !!errors.category} />
          <datalist id="tp-cats">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </FormRow>
        <FormRow label="Subject" htmlFor="tp-subject" required error={tried ? errors.subject : undefined} className="sm:col-span-2">
          <Input id="tp-subject" value={subject} onChange={(e) => setSubject(e.target.value)} invalid={tried && !!errors.subject} />
        </FormRow>
        <FormRow
          label="Body"
          htmlFor="tp-body"
          required
          className="sm:col-span-2"
          error={tried ? errors.body : undefined}
          hint={tpl?.variables?.length ? `Placeholders: ${tpl.variables.map((v) => `{{${v}}}`).join(", ")}` : "Use {{placeholders}} for details filled in when sending."}
        >
          <Textarea id="tp-body" rows={12} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-[13px]" invalid={tried && !!errors.body} />
        </FormRow>
        {unknown.length > 0 && (
          <p className="rounded-xl bg-warning/10 px-3.5 py-2.5 text-[13px] text-ink sm:col-span-2">
            {unknown.map((v) => `{{${v}}}`).join(", ")} {unknown.length === 1 ? "isn’t a placeholder" : "aren’t placeholders"} this template is sent with — {unknown.length === 1 ? "it" : "they"} would appear as-is in the email.
          </p>
        )}
      </form>
    </Dialog>
  );
}
