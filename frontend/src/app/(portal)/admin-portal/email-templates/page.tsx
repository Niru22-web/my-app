"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, History, Link2, Mail, MailWarning, Pencil, Plus, RefreshCw, Search, Send, Unplug } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { FormRow, Input, Select, Textarea } from "@/components/ui/inputs";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import {
  canEmail,
  useAdminMutations,
  useEmailLogs,
  useEmailStatus,
  useEmailTemplates,
  type EmailTemplate,
} from "@/components/admin/api";

export default function EmailPage() {
  const { user } = useAuth();
  const on = canEmail(user?.role);
  const toast = useToast();
  const status = useEmailStatus(on);
  const q = useEmailTemplates(on);
  const logs = useEmailLogs(on);
  const m = useAdminMutations();

  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("");
  const [editing, setEditing] = useState<EmailTemplate | null | undefined>(undefined);
  const [connectOpen, setConnectOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [logStatus, setLogStatus] = useState<"all" | "sent" | "failed" | "pending">("all");
  const [logSearch, setLogSearch] = useState("");

  const cats = useMemo(() => [...new Set((q.data ?? []).map((t) => t.category))].sort(), [q.data]);
  const rows = (q.data ?? []).filter((t) => (!cat || t.category === cat) && (!search.trim() || `${t.name} ${t.subject}`.toLowerCase().includes(search.trim().toLowerCase())));
  const providers = Object.entries(status.data?.providers ?? {}).filter(([, p]) => p?.connected);

  const filteredLogs = useMemo(() => {
    const s = logSearch.trim().toLowerCase();
    return (logs.data ?? []).filter((l) => {
      if (logStatus !== "all" && l.status.toLowerCase() !== logStatus) return false;
      if (s && !`${l.recipient} ${l.subject} ${l.category}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [logs.data, logStatus, logSearch]);

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
        description="The mailbox the portal sends from, the templates it uses, and the delivery log"
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
            <div className="space-y-2 text-[13px]">
              {providers.length ? (
                providers.map(([name, p]) => (
                  <div key={name} className="flex flex-wrap items-center gap-2 text-ink">
                    <Badge tone="success">Connected</Badge>
                    <span className="font-medium capitalize">{name}</span>
                    {p.email && <span className="text-ink-muted">· {p.email}</span>}
                    <Button variant="ghost" size="sm" onClick={() => setDisconnecting(name)}>
                      <Unplug className="h-3.5 w-3.5 text-danger" /> Disconnect
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-ink">
                  <Badge tone="warning">Not connected</Badge> <span className="ml-1 text-ink-muted">Connect an Outlook or Gmail sender address so portal emails can be dispatched.</span>
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setConnectOpen(true)}>
                <Link2 className="h-4 w-4" /> {providers.length ? "Change mailbox" : "Connect mailbox"}
              </Button>
              <TestEmail to={user?.email ?? ""} />
            </div>
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

      <Card>
        <CardHeader
          icon={History}
          title="Delivery log"
          description="Recent invitations, reminders, and test emails recorded by the server"
          actions={
            <Button variant="secondary" size="sm" loading={logs.isFetching} onClick={() => logs.refetch()}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          }
        />
        <div className="flex flex-col gap-3 px-5 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <Segmented
            aria-label="Delivery status"
            value={logStatus}
            onChange={setLogStatus}
            options={[
              { value: "all", label: "All" },
              { value: "sent", label: "Sent" },
              { value: "pending", label: "Queued" },
              { value: "failed", label: "Failed" },
            ]}
          />
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
            <Input placeholder="Recipient or subject…" value={logSearch} onChange={(e) => setLogSearch(e.target.value)} className="pl-9" />
          </div>
        </div>
        {logs.isLoading ? (
          <Skeleton className="mx-5 mb-5 h-32" />
        ) : !filteredLogs.length ? (
          <EmptyState icon={Mail} title="No email logs found" className="py-8" />
        ) : (
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-muted/40 text-left text-xs text-ink-subtle">
                  <th className="px-5 py-2.5 font-medium">Sent</th>
                  <th className="px-4 py-2.5 font-medium">Recipient</th>
                  <th className="px-4 py-2.5 font-medium">Subject</th>
                  <th className="px-4 py-2.5 font-medium">Category</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-[13px]">
                {filteredLogs.slice(0, 50).map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap px-5 py-2.5 tabular text-ink-muted">
                      {formatDate(l.sentAt)}{" "}
                      <span className="text-xs text-ink-subtle">
                        {new Date(l.sentAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-ink">{l.recipient}</td>
                    <td className="max-w-xs truncate px-4 py-2.5 text-ink-muted">{l.subject}</td>
                    <td className="px-4 py-2.5 capitalize text-ink-subtle">{l.category}</td>
                    <td className="px-5 py-2.5">
                      <Badge tone={l.status === "sent" ? "success" : l.status === "failed" ? "danger" : "warning"}>{l.status}</Badge>
                      {l.errorMessage && <span className="mt-0.5 block max-w-xs truncate text-xs text-danger">{l.errorMessage}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing !== undefined && <TemplateDialog tpl={editing} categories={cats} onClose={() => setEditing(undefined)} />}
      {connectOpen && <ConnectMailboxDialog defaultEmail={providers[0]?.[1]?.email ?? user?.email ?? ""} onClose={() => setConnectOpen(false)} />}
      <ConfirmDialog
        open={!!disconnecting}
        onClose={() => setDisconnecting(null)}
        tone="danger"
        title={`Disconnect ${disconnecting} mailbox?`}
        description="Outbound portal emails will pause until a sender mailbox is connected again."
        confirmLabel="Disconnect"
        busy={m.disconnectMailbox.isPending}
        onConfirm={() =>
          disconnecting &&
          m.disconnectMailbox.mutate(disconnecting, {
            onSuccess: () => (toast.success("Mailbox disconnected"), setDisconnecting(null)),
            onError: (e) => (toast.error("Couldn’t disconnect", e instanceof ApiError ? e.message : undefined), setDisconnecting(null)),
          })
        }
      />
    </div>
  );
}

function ConnectMailboxDialog({ defaultEmail, onClose }: { defaultEmail: string; onClose: () => void }) {
  const toast = useToast();
  const m = useAdminMutations();
  const [provider, setProvider] = useState<"outlook" | "gmail">("outlook");
  const [email, setEmail] = useState(defaultEmail);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    try {
      const res = await m.connectMailbox.mutateAsync({ provider, email: email.trim() });
      toast.success(res.message || "Mailbox connected");
      onClose();
    } catch (err) {
      toast.error("Couldn’t connect mailbox", err instanceof ApiError ? err.message : undefined);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Connect sending mailbox"
      description="Configure the sender mailbox used for invitations, compliance reminders, and notifications."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="connect-mail-form" disabled={!email.trim()} loading={m.connectMailbox.isPending}>
            Save mailbox
          </Button>
        </>
      }
    >
      <form id="connect-mail-form" onSubmit={submit} className="space-y-4">
        <FormRow label="Provider" htmlFor="cm-prov" required>
          <Select id="cm-prov" value={provider} onChange={(e) => setProvider(e.target.value as "outlook" | "gmail")}>
            <option value="outlook">Microsoft 365 / Outlook</option>
            <option value="gmail">Google Workspace / Gmail</option>
          </Select>
        </FormRow>
        <FormRow label="Sender email address" htmlFor="cm-email" required>
          <Input id="cm-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="noreply@asaind.co.in" />
        </FormRow>
      </form>
    </Dialog>
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
