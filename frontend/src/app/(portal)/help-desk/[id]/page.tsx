"use client";

import { use, useMemo, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  CornerUpLeft,
  Flag,
  Lock,
  MessageSquare,
  Paperclip,
  RotateCcw,
  Send,
  Tag,
  Trash2,
  User,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { formatDate, formatTime } from "@/lib/format";
import { timeAgo } from "@/lib/notifications";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/empty-state";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm";
import { FormRow, Select, Textarea } from "@/components/ui/inputs";
import { FileDrop } from "@/components/ui/file-drop";
import { useToast } from "@/components/ui/toast";
import { fullName, usePeople } from "@/components/management/api";
import { FileLink, ProtectedImage } from "@/components/ui/protected-file";
import {
  ATTACH_ACCEPT,
  categoryLabel,
  isSupportAgent,
  PRIORITY_TONE,
  raiserName,
  slaHours,
  slaState,
  STATUSES,
  STATUS_TONE,
  statusKey,
  ticketCode,
  useTicket,
  useTicketMutations,
  type Ticket,
  type TicketAttachment,
  type TicketEvent,
} from "@/components/helpdesk/api";

const INTERNAL = "internal note";
/** Messages (shown in the conversation) vs. events (shown in the activity log). */
const isMessage = (e: TicketEvent) => ["comment", "comment added", "returned", "escalate", INTERNAL].includes(e.action.toLowerCase()) && !!e.remarks;

function fmtDuration(ms: number) {
  const h = Math.floor(Math.abs(ms) / 3_600_000);
  const m = Math.floor((Math.abs(ms) % 3_600_000) / 60_000);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}m`;
}

export default function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const agent = isSupportAgent(user?.role);
  const q = useTicket(id);
  const m = useTicketMutations();
  const people = usePeople(true);
  const [dialog, setDialog] = useState<null | "return" | "escalate" | "delete" | "close">(null);
  const [assignee, setAssignee] = useState<string | null>(null);
  const [nextStatus, setNextStatus] = useState("");

  const names = useMemo(() => new Map((people.data ?? []).map((p) => [p.id, fullName(p)])), [people.data]);
  const agents = (people.data ?? []).filter((p) => (p.status ?? "").toLowerCase() === "active" && (["it", "admin"].includes((p.role ?? "").toLowerCase()) || (p.role ?? "").toLowerCase().includes("support")));

  if (q.isError)
    return (
      <Card>
        <ErrorState message={q.error instanceof ApiError && q.error.status === 404 ? "This ticket doesn’t exist or was deleted." : undefined} onRetry={() => q.refetch()} />
      </Card>
    );
  if (q.isLoading || !q.data) return <Skeleton className="h-[600px]" />;

  const t = q.data as Ticket & { agentView?: boolean };
  const s = statusKey(t.status);
  const sla = slaState(t);
  const mine = t.createdById === user?.id;
  const canWork = agent || t.assignedTo === user?.id;
  const canReply = canWork || mine;
  const closed = s === "resolved" || s === "closed";
  const fail = (title: string) => (e: unknown) => toast.error(title, e instanceof ApiError ? e.message : undefined);
  const patch = (body: { status?: string; assignedTo?: string | null }, msg: string) =>
    m.update.mutate({ id: t.id, body }, { onSuccess: () => (toast.success(msg, ticketCode(t)), void q.refetch()), onError: fail("Couldn’t update the ticket") });
  const event = (fd: FormData, msg: string, after?: () => void) =>
    m.addEvent.mutate({ id: t.id, fd }, { onSuccess: () => (toast.success(msg), after?.(), void q.refetch()), onError: fail("Couldn’t update the ticket") });

  const events = [...(t.history ?? [])].sort((a, b) => a.performedAt.localeCompare(b.performedAt));
  const messages = events.filter(isMessage);
  const activity = events.filter((e) => !isMessage(e)).reverse();
  const nameOf = (pid: string | null) => (pid ? (names.get(pid) ?? (pid === t.assignedTo ? t.assigneeName : null) ?? "a support agent") : "nobody");
  const chosenAssignee = assignee ?? t.assignedTo ?? "";

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/help-desk" className="grid h-9 w-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink" aria-label="Back to all tickets">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="font-display text-xl font-bold text-ink">Ticket details</h1>
      </div>

      <Card className="grid overflow-hidden p-0 xl:grid-cols-[1fr_340px]">
        {/* ── Conversation ─────────────────────────────────────────────── */}
        <section className="flex min-h-[560px] flex-col border-line xl:border-r" aria-label="Conversation">
          <header className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="truncate font-display text-lg font-bold text-ink">{t.title}</h2>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-subtle">
                <span className="font-mono font-semibold text-ink-muted">{ticketCode(t)}</span>
                <span className="rounded-full bg-success-soft px-2 py-0.5 font-semibold text-success">Portal</span>
                <span>· {categoryLabel(t)}</span>
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {canWork && !closed && (
                <Button variant="secondary" size="sm" onClick={() => setDialog("escalate")} className="border-danger/40 text-danger hover:bg-danger-soft">
                  <AlertTriangle className="h-4 w-4" /> Escalate ticket
                </Button>
              )}
              <Badge tone={STATUS_TONE[s]}>{t.status}</Badge>
              <Badge tone={PRIORITY_TONE[t.priority ?? "Low"] ?? "neutral"}>{t.priority ?? "Low"}</Badge>
            </div>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
            <Message who={raiserName(t)} at={t.createdAt} body={t.description} attachments={t.attachments} />
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-ink-subtle">
                <Users className="h-9 w-9 text-ink-subtle/60" aria-hidden />
                No replies yet.
              </div>
            ) : (
              messages.map((e) => {
                const a = e.action.toLowerCase();
                return (
                  <Message
                    key={e.id}
                    who={e.performer ? `${e.performer.firstName} ${e.performer.lastName}`.trim() : "Someone"}
                    at={e.performedAt}
                    body={e.remarks ?? ""}
                    attachments={e.attachments}
                    tag={a === INTERNAL ? "Internal note" : a === "returned" ? "Returned to raiser" : a === "escalate" ? "Escalated" : undefined}
                    tone={a === INTERNAL ? "internal" : a === "escalate" ? "warning" : a === "returned" ? "danger" : "default"}
                  />
                );
              })
            )}
          </div>

          {canReply ? (
            <Composer
              ticketId={t.id}
              allowInternal={canWork}
              canClose={canWork && !closed}
              onClose={() => setDialog("close")}
              onDone={() => void q.refetch()}
            />
          ) : (
            <p className="border-t border-line px-5 py-4 text-sm text-ink-muted">Only the person who raised this ticket and the support team can reply.</p>
          )}
        </section>

        {/* ── Side panel ──────────────────────────────────────────────── */}
        <aside className="divide-y divide-line bg-surface-muted/30" aria-label="Ticket details">
          <Panel title="Details">
            <Row icon={Tag} label="Status">
              <Badge tone={STATUS_TONE[s]}>{t.status}</Badge>
            </Row>
            <Row icon={AlertTriangle} label="Priority">
              <Badge tone={PRIORITY_TONE[t.priority ?? "Low"] ?? "neutral"}>{t.priority ?? "Low"}</Badge>
            </Row>
            <Row icon={Users} label="Team">
              <span>{t.subcategoryRel?.assigned_team ?? t.categoryRel?.assigned_team ?? "IT"}</span>
            </Row>
            <Row icon={UserCheck} label="Assignee">
              {t.assigneeName ? <Person name={t.assigneeName} /> : <span className="italic text-ink-subtle">Unassigned</span>}
            </Row>
            <Row icon={User} label="Raised by">
              <Person name={raiserName(t)} sub={t.createdBy?.department ?? undefined} />
            </Row>
            <Row icon={Clock} label="Raised">
              <span className="text-right">
                {formatDate(t.createdAt)} · {formatTime(t.createdAt)}
              </span>
            </Row>
          </Panel>

          <Panel title="Response target">
            <Row icon={Clock} label="Due">
              <span className="text-right">
                {formatDate(sla.due.toISOString())} · {formatTime(sla.due.toISOString())}
                <span className="block text-[11px] text-ink-subtle">{slaHours(t)} h target</span>
                <span
                  className={cn(
                    "block text-xs font-semibold",
                    sla.done ? (sla.missed ? "text-warning" : "text-success") : sla.overdue ? "text-danger" : "text-success",
                  )}
                >
                  {sla.done
                    ? sla.met === true
                      ? "Resolved within target"
                      : sla.missed
                        ? "Resolved after target"
                        : "Resolved"
                    : sla.overdue
                      ? `Overdue by ${fmtDuration(sla.remainingMs)}`
                      : `due in ${fmtDuration(sla.remainingMs)}`}
                </span>
              </span>
            </Row>
          </Panel>

          {canWork && (
            <Panel title="Actions">
              {agent && (
                <div className="space-y-2">
                  <label htmlFor="hd-assignee" className="text-xs text-ink-subtle">
                    Change assignee
                  </label>
                  <div className="flex gap-2">
                    <div className="min-w-0 flex-1">
                      <Select id="hd-assignee" value={chosenAssignee} onChange={(e) => setAssignee(e.target.value)}>
                        <option value="">Unassigned</option>
                        {agents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {fullName(a)}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={chosenAssignee === (t.assignedTo ?? "")}
                      loading={m.update.isPending}
                      onClick={() => patch({ assignedTo: chosenAssignee || null }, chosenAssignee ? "Ticket reassigned" : "Ticket unassigned")}
                    >
                      Save
                    </Button>
                  </div>
                  {t.assignedTo !== user?.id && (
                    <Button size="sm" variant="secondary" className="w-full" onClick={() => patch({ assignedTo: user!.id, ...(s === "open" ? { status: "In Progress" } : {}) }, "Assigned to you")}>
                      <UserCheck className="h-4 w-4" /> Assign to me
                    </Button>
                  )}
                </div>
              )}
              {agent && (
                <div className="space-y-2 pt-2">
                  <label htmlFor="hd-status" className="text-xs text-ink-subtle">
                    Change status
                  </label>
                  <Select id="hd-status" value={nextStatus} onChange={(e) => setNextStatus(e.target.value)}>
                    <option value="">Select status…</option>
                    {[...STATUSES, "Closed"]
                      .filter((x) => x !== t.status)
                      .map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                  </Select>
                  <Button size="sm" className="w-full" disabled={!nextStatus} loading={m.update.isPending} onClick={() => (patch({ status: nextStatus }, `Status changed to ${nextStatus}`), setNextStatus(""))}>
                    Update status
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-2">
                {!closed && (
                  <Button size="sm" variant="ghost" onClick={() => setDialog("return")}>
                    <CornerUpLeft className="h-4 w-4" /> Return to raiser
                  </Button>
                )}
                {closed && (
                  <Button size="sm" variant="ghost" onClick={() => patch({ status: "In Progress", assignedTo: t.assignedTo ?? user!.id }, "Ticket reopened")}>
                    <RotateCcw className="h-4 w-4" /> Reopen
                  </Button>
                )}
              </div>
            </Panel>
          )}

          <Panel title="Activity">
            {activity.length === 0 ? (
              <p className="text-xs text-ink-subtle">No changes yet.</p>
            ) : (
              <ol className="max-h-72 space-y-3 overflow-y-auto pr-1">
                {activity.map((e) => (
                  <li key={e.id} className="flex gap-2 text-xs">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                    <span>
                      <span className="font-semibold text-ink">{e.performer ? `${e.performer.firstName} ${e.performer.lastName}`.trim() : "ASA Portal"}</span>{" "}
                      <span className="text-ink-muted">{activityText(e, nameOf)}</span>
                      <span className="block text-[11px] text-ink-subtle">
                        {formatDate(e.performedAt)} · {formatTime(e.performedAt)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          {(agent || (mine && s === "open" && !t.assignedTo)) && (
            <div className="px-5 py-4">
              <button onClick={() => setDialog("delete")} className="flex items-center gap-2 text-[13px] font-medium text-danger hover:underline">
                <Trash2 className="h-4 w-4" /> Delete ticket
              </button>
            </div>
          )}
        </aside>
      </Card>

      <RemarksDialog
        open={dialog === "return" || dialog === "escalate"}
        kind={dialog === "return" ? "return" : "escalate"}
        busy={m.addEvent.isPending}
        onClose={() => setDialog(null)}
        onSubmit={(remarks) => {
          const fd = new FormData();
          fd.append("remarks", remarks);
          if (dialog === "return") {
            fd.append("action", "Returned");
            fd.append("status", "Returned");
          } else fd.append("action", "Escalate");
          event(fd, dialog === "return" ? "Returned to the raiser" : "Escalated — the support team has been alerted", () => setDialog(null));
        }}
      />

      <ConfirmDialog
        open={dialog === "close"}
        onClose={() => setDialog(null)}
        title={`Close ${ticketCode(t)}?`}
        confirmLabel="Mark resolved"
        busy={m.update.isPending}
        description="The ticket is marked Resolved and the raiser is told. It can be reopened later if needed."
        onConfirm={() => (patch({ status: "Resolved" }, "Ticket resolved"), setDialog(null))}
      />

      <ConfirmDialog
        open={dialog === "delete"}
        onClose={() => setDialog(null)}
        tone="danger"
        title={`Delete ${ticketCode(t)}?`}
        confirmLabel="Delete ticket"
        busy={m.remove.isPending}
        description="The ticket and its full history will be removed permanently."
        onConfirm={() => m.remove.mutate(t.id, { onSuccess: () => (toast.success("Ticket deleted"), router.replace("/help-desk")), onError: fail("Couldn’t delete") })}
      />
    </div>
  );
}

function activityText(e: TicketEvent, name: (id: string | null) => string) {
  const a = e.action.toLowerCase();
  if (a === "ticket created" || a === "created") return e.toAssignee ? `raised the ticket → ${name(e.toAssignee)}` : "raised the ticket";
  if (e.fromStatus && e.toStatus && e.fromStatus !== e.toStatus) return `${e.fromStatus} → ${e.toStatus}`;
  if (e.fromAssignee !== e.toAssignee) return e.toAssignee ? `assigned it to ${name(e.toAssignee)}` : "unassigned it";
  return e.action.toLowerCase();
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">{title}</p>
      {children}
    </div>
  );
}

function Row({ icon: Icon, label, children }: { icon: typeof Tag; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="flex shrink-0 items-center gap-2 text-ink-muted">
        <Icon className="h-4 w-4 text-ink-subtle" aria-hidden /> {label}
      </span>
      <span className="min-w-0 text-right text-ink">{children}</span>
    </div>
  );
}

function Person({ name, sub }: { name: string; sub?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Avatar name={name} size={24} />
      <span className="text-left">
        <span className="block font-medium">{name}</span>
        {sub && <span className="block text-[11px] text-ink-subtle">{sub}</span>}
      </span>
    </span>
  );
}

function Message({
  who,
  at,
  body,
  attachments,
  tag,
  tone = "default",
}: {
  who: string;
  at: string;
  body: string;
  attachments?: TicketAttachment[];
  tag?: string;
  tone?: "default" | "internal" | "warning" | "danger";
}) {
  return (
    <article
      className={cn(
        "rounded-xl border px-4 py-3",
        tone === "internal" ? "border-warning/40 bg-warning-soft/50" : tone === "warning" ? "border-warning/40 bg-surface" : tone === "danger" ? "border-danger/30 bg-surface" : "border-line bg-surface-muted/40",
      )}
    >
      <header className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <Avatar name={who} size={28} />
          <span className="text-sm font-semibold text-ink">{who}</span>
          {tag && (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-ink-muted ring-1 ring-line">
              {tone === "internal" && <Lock className="h-3 w-3" aria-hidden />}
              {tag}
            </span>
          )}
        </span>
        <time className="shrink-0 text-xs text-ink-subtle" dateTime={at} title={timeAgo(at)}>
          {formatDate(at)} · {formatTime(at)}
        </time>
      </header>
      <p className="mt-2 whitespace-pre-wrap break-words pl-9 text-[14px] leading-relaxed text-ink">{body}</p>
      {(attachments?.length ?? 0) > 0 && <Attachments items={attachments!} className="mt-3 pl-9" />}
    </article>
  );
}

function Attachments({ items, className }: { items: TicketAttachment[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-2", className)}>
      {items.map((a) => {
        const image = a.mimeType?.startsWith("image/");
        return (
          <li key={a.id}>
            <FileLink path={a.url} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink hover:border-brand/40">
              {image ? <ProtectedImage path={a.url} className="h-8 w-8 rounded object-cover" /> : <Paperclip className="h-3.5 w-3.5 text-ink-subtle" aria-hidden />}
              <span className="max-w-[180px] truncate">{a.filename}</span>
            </FileLink>
          </li>
        );
      })}
    </ul>
  );
}

function Composer({ ticketId, allowInternal, canClose, onClose, onDone }: { ticketId: string; allowInternal: boolean; canClose: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { addEvent } = useTicketMutations();
  const [mode, setMode] = useState<"reply" | "internal">("reply");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [attach, setAttach] = useState(false);
  const internal = mode === "internal";

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!text.trim() && !files.length) return;
    const fd = new FormData();
    fd.append("action", "Comment");
    fd.append("remarks", text.trim());
    if (internal) fd.append("internal", "true");
    files.forEach((f) => fd.append("attachments", f));
    addEvent.mutate(
      { id: ticketId, fd },
      {
        onSuccess: () => (setText(""), setFiles([]), setAttach(false), onDone()),
        onError: (err) => toast.error(internal ? "Couldn’t add the note" : "Couldn’t send your reply", err instanceof ApiError ? err.message : undefined),
      },
    );
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form onSubmit={submit} className="border-t border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1" role="tablist" aria-label="Message type">
          <button
            type="button"
            role="tab"
            aria-selected={!internal}
            onClick={() => setMode("reply")}
            className={cn("rounded-full px-3 py-1 text-xs font-semibold", !internal ? "bg-brand text-brand-ink" : "text-ink-muted hover:bg-surface-muted")}
          >
            Reply
          </button>
          {allowInternal && (
            <button
              type="button"
              role="tab"
              aria-selected={internal}
              onClick={() => setMode("internal")}
              className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold", internal ? "bg-warning-soft text-ink" : "text-ink-muted hover:bg-surface-muted")}
            >
              <Lock className="h-3 w-3" aria-hidden /> Internal chat
            </button>
          )}
        </div>
        <span className="flex items-center gap-1 text-[11px] text-ink-subtle">
          <MessageSquare className="h-3 w-3" aria-hidden /> {internal ? "Only the support team sees this" : "Visible to the raiser"}
        </span>
      </div>
      <Textarea
        aria-label={internal ? "Internal note" : "Reply"}
        rows={3}
        maxLength={4000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        placeholder={internal ? "Write a note for the support team…" : "Type a reply… (attach files with the button below)"}
        className={cn(internal && "bg-warning-soft/30")}
      />
      {attach && <FileDrop id="reply-files" files={files} onChange={setFiles} accept={ATTACH_ACCEPT} maxMb={50} hint="Up to 10 files, 50 MB each" />}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="hidden text-[11px] text-ink-subtle sm:inline">Enter to send, Shift + Enter for a new line</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setAttach((a) => !a)}>
            <Paperclip className="h-4 w-4" /> {attach ? "Hide files" : "Attach"}
          </Button>
          {canClose && (
            <Button type="button" variant="secondary" size="sm" onClick={onClose} className="border-danger/40 text-danger hover:bg-danger-soft">
              <XCircle className="h-4 w-4" /> Close ticket
            </Button>
          )}
          <Button type="submit" size="sm" loading={addEvent.isPending} disabled={!text.trim() && !files.length}>
            <Send className="h-4 w-4" /> {internal ? "Add note" : "Send reply"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function RemarksDialog({ open, kind, busy, onClose, onSubmit }: { open: boolean; kind: "return" | "escalate"; busy: boolean; onClose: () => void; onSubmit: (r: string) => void }) {
  const [text, setText] = useState("");
  const close = () => (setText(""), onClose());
  return (
    <Dialog
      open={open}
      onClose={close}
      size="sm"
      title={kind === "return" ? "Return to the raiser" : "Escalate this ticket"}
      description={
        kind === "return"
          ? "Use this when you need more information or the request can’t be handled. The raiser is notified."
          : "Every support agent is alerted and the escalation is recorded in the ticket."
      }
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant={kind === "return" ? "danger" : "primary"} loading={busy} disabled={text.trim().length < 3} onClick={() => (onSubmit(text.trim()), setText(""))}>
            {kind === "return" ? (
              <>
                <CornerUpLeft className="h-4 w-4" /> Return ticket
              </>
            ) : (
              <>
                <Flag className="h-4 w-4" /> Escalate
              </>
            )}
          </Button>
        </>
      }
    >
      <FormRow label={kind === "return" ? "What’s needed from the raiser?" : "Reason for escalation"} htmlFor="hd-remarks" required>
        <Textarea id="hd-remarks" rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
      </FormRow>
    </Dialog>
  );
}

