"use client";

import { use, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  Bug as BugIcon,
  Calendar,
  Clock,
  ExternalLink,
  Globe,
  Link2,
  MessageSquare,
  Paperclip,
  Pencil,
  RotateCcw,
  Send,
  Tag,
  Trash2,
  User,
  UserCheck,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError, assetUrl } from "@/lib/api";
import { formatDate, formatTime } from "@/lib/format";
import { timeAgo } from "@/lib/notifications";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/empty-state";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm";
import { FormRow, Input, Select, Textarea } from "@/components/ui/inputs";
import { FileDrop } from "@/components/ui/file-drop";
import { useToast } from "@/components/ui/toast";
import { FileLink, ProtectedImage } from "@/components/ui/protected-file";
import {
  BUG_ATTACH_ACCEPT,
  BUG_ENVIRONMENTS,
  BUG_MODULES,
  BUG_PRIORITIES,
  BUG_TYPES,
  CLOSED_STATUSES,
  eventSentence,
  fmtDuration,
  useBug,
  useBugAssignees,
  useBugMutations,
  type BugDetail,
  type BugEvent,
  type BugFile,
  type BugPatch,
} from "@/components/bugs/api";
import { Chip, CopyCode, EnvChip, ExtRefChip, PersonChip, PriorityChip, StatusBadge, TypeChip } from "@/components/bugs/chips";
import { ReasonDialog } from "@/components/bugs/reason-dialog";
import { pastedImages } from "@/components/bugs/new-bug-dialog";

/** Comments, and status changes that carry a note (e.g. a reopen reason), appear in the conversation. */
const isMessage = (e: BugEvent) => e.kind === "comment" || (e.kind === "status" && !!e.body);

/** ISO → value for <input type="datetime-local"> in the viewer's time. */
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function BugPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const q = useBug(id);
  const m = useBugMutations();
  const [dialog, setDialog] = useState<null | "reopen" | "delete" | "edit">(null);

  if (q.isError)
    return (
      <Card>
        <ErrorState message={q.error instanceof ApiError && q.error.status === 404 ? "This ticket doesn’t exist or was deleted." : undefined} onRetry={() => q.refetch()} />
        <p className="pb-6 text-center">
          <Link href="/bugs/list" className="text-[13px] font-semibold text-brand hover:underline">
            Back to all tickets
          </Link>
        </p>
      </Card>
    );
  if (q.isLoading || !q.data) return <Skeleton className="h-[600px]" />;

  const b = q.data;
  const p = b.permissions;
  const mine = b.reporterId === user?.id;
  const created = b.events.find((e) => e.kind === "created");
  const messages = b.events.filter(isMessage);
  const activity = b.events.filter((e) => !isMessage(e) || e.kind === "status").reverse();
  const fail = (title: string) => (e: unknown) => toast.error(title, e instanceof ApiError ? e.message : undefined);
  const patch = (body: BugPatch, msg: string, after?: () => void) =>
    m.update.mutate({ id: b.id, body }, { onSuccess: () => (toast.success(msg, b.code), after?.()), onError: fail("Couldn’t update the ticket") });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/bugs/list" className="grid h-9 w-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink" aria-label="Back to all tickets">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="font-display text-xl font-bold text-ink">Ticket details</h1>
      </div>

      <Card className="grid overflow-hidden p-0 xl:grid-cols-[1fr_360px]">
        {/* ── Conversation ─────────────────────────────────────────────── */}
        <section className="flex min-h-[560px] flex-col border-line xl:border-r" aria-label="Conversation">
          <header className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="break-words font-display text-lg font-bold text-ink">{b.title}</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <CopyCode code={b.code} />
                <PriorityChip priority={b.priority} />
                <TypeChip type={b.type} />
                {b.module && <Chip>{b.module}</Chip>}
                <EnvChip env={b.environment} />
                {b.externalRef && <ExtRefChip value={b.externalRef} />}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {p.canEdit && (
                <Button variant="secondary" size="sm" onClick={() => setDialog("edit")}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              )}
              <StatusBadge status={b.status} />
            </div>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
            <Message who={b.reporter?.name ?? "Someone"} photo={b.reporter?.profileImage} at={b.createdAt} body={b.description} files={created?.files} tag="Reported" />
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-ink-subtle">
                <MessageSquare className="h-9 w-9 text-ink-subtle/60" aria-hidden />
                No comments yet.
              </div>
            ) : (
              messages.map((e) => (
                <Message
                  key={e.id}
                  who={e.actor.name}
                  photo={e.actor.profileImage}
                  at={e.createdAt}
                  body={e.body ?? ""}
                  files={e.files}
                  tag={e.kind === "status" ? `Moved to ${e.toValue}` : undefined}
                  tone={e.kind === "status" && e.toValue === "Reopened" ? "warning" : "default"}
                />
              ))
            )}
          </div>

          <Composer bugId={b.id} />
        </section>

        {/* ── Side panel ──────────────────────────────────────────────── */}
        <aside className="divide-y divide-line bg-surface-muted/30" aria-label="Ticket details">
          <Panel title="Details">
            <Row icon={Tag} label="Status">
              <StatusBadge status={b.status} />
            </Row>
            <Row icon={AlertTriangle} label="Priority">
              <PriorityChip priority={b.priority} />
            </Row>
            <Row icon={BugIcon} label="Type">
              {b.type}
            </Row>
            <Row icon={Boxes} label="Module">
              {b.module ?? <span className="text-ink-subtle">—</span>}
            </Row>
            <Row icon={Globe} label="Environment">
              <EnvChip env={b.environment} />
            </Row>
            <Row icon={User} label="Reported by">
              <PersonChip person={b.reporter} />
            </Row>
            <Row icon={UserCheck} label="Assignee">
              <PersonChip person={b.assignee} />
            </Row>
            <Row icon={Clock} label="Created">
              {formatDate(b.createdAt)} · {formatTime(b.createdAt)}
            </Row>
            <Row icon={Calendar} label="Due">
              <DueText bug={b} />
            </Row>
            {b.pageUrl && (
              <Row icon={Link2} label="Page">
                {b.pageUrl.startsWith("/") ? (
                  <Link href={b.pageUrl} className="break-all font-mono text-xs text-brand hover:underline">
                    {b.pageUrl}
                  </Link>
                ) : (
                  <a href={b.pageUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 break-all font-mono text-xs text-brand hover:underline">
                    {b.pageUrl} <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                )}
              </Row>
            )}
          </Panel>

          {(p.canTriage || p.statuses.length > 0 || p.canReopen) && (
            <Panel title="Actions">
              <Actions bug={b} onReopen={() => setDialog("reopen")} patch={patch} busy={m.update.isPending} userId={user?.id} />
            </Panel>
          )}

          <Panel title="Activity">
            {activity.length === 0 ? (
              <p className="text-xs text-ink-subtle">No changes yet.</p>
            ) : (
              <ol className="max-h-80 space-y-3 overflow-y-auto pr-1">
                {activity.map((e) => (
                  <li key={e.id} className="flex gap-2 text-xs">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                    <span>
                      <span className="font-semibold text-ink">{e.actor.name}</span> <span className="text-ink-muted">{e.kind === "comment" ? "commented" : eventSentence(e)}</span>
                      <span className="block text-[11px] text-ink-subtle">
                        {formatDate(e.createdAt)} · {formatTime(e.createdAt)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          {p.canDelete && (
            <div className="px-5 py-4">
              <button onClick={() => setDialog("delete")} className="flex items-center gap-2 text-[13px] font-medium text-danger hover:underline">
                <Trash2 className="h-4 w-4" /> Delete ticket
              </button>
              {!p.canTriage && mine && <p className="mt-1 text-[11px] text-ink-subtle">You can delete it until someone is assigned.</p>}
            </div>
          )}
        </aside>
      </Card>

      <ReasonDialog
        open={dialog === "reopen"}
        title={`Reopen ${b.code}?`}
        description="Say what is still wrong. The assignee and the IT team will see your comment."
        label="Why are you reopening it?"
        confirmLabel="Reopen ticket"
        required={!p.canTriage}
        busy={m.update.isPending}
        onClose={() => setDialog(null)}
        onSubmit={(comment) => patch({ status: "Reopened", ...(comment ? { comment } : {}) }, "Ticket reopened", () => setDialog(null))}
      />

      {dialog === "edit" && <EditDialog bug={b} onClose={() => setDialog(null)} onSave={(body) => patch(body, "Ticket updated", () => setDialog(null))} busy={m.update.isPending} />}

      <ConfirmDialog
        open={dialog === "delete"}
        onClose={() => setDialog(null)}
        tone="danger"
        title={`Delete ${b.code}?`}
        confirmLabel="Delete ticket"
        busy={m.remove.isPending}
        description="The ticket, its comments and attachments will be removed permanently."
        onConfirm={() => m.remove.mutate(b.id, { onSuccess: () => (toast.success("Ticket deleted", b.code), router.replace("/bugs/list")), onError: fail("Couldn’t delete") })}
      />
    </div>
  );
}

function DueText({ bug }: { bug: BugDetail }) {
  if (!bug.dueDate) return <span className="text-ink-subtle">No due date</span>;
  const closed = CLOSED_STATUSES.has(bug.status);
  // eslint-disable-next-line react-hooks/purity -- relative "due in" text is meant to reflect the current time on each render
  const ms = new Date(bug.dueDate).getTime() - Date.now();
  return (
    <span className="text-right">
      {formatDate(bug.dueDate)} · {formatTime(bug.dueDate)}
      {!closed && <span className={cn("block text-xs font-semibold", ms < 0 ? "text-danger" : "text-success")}>{ms < 0 ? `overdue by ${fmtDuration(ms)}` : `due in ${fmtDuration(ms)}`}</span>}
      {closed && bug.resolvedAt && <span className="block text-[11px] text-ink-subtle">Closed {formatDate(bug.resolvedAt)}</span>}
    </span>
  );
}

function Actions({
  bug,
  onReopen,
  patch,
  busy,
  userId,
}: {
  bug: BugDetail;
  onReopen: () => void;
  patch: (body: BugPatch, msg: string, after?: () => void) => void;
  busy: boolean;
  userId?: string;
}) {
  const p = bug.permissions;
  const assignees = useBugAssignees(p.canTriage);
  const [status, setStatus] = useState("");
  const [assignee, setAssignee] = useState<string | null>(null);
  const [due, setDue] = useState<string | null>(null);
  const [ext, setExt] = useState<string | null>(null);
  const chosenAssignee = assignee ?? bug.assigneeId ?? "";
  const dueValue = due ?? toLocalInput(bug.dueDate);
  const extValue = ext ?? bug.externalRef ?? "";
  // Reopening has its own button (and needs a comment from the reporter).
  const statuses = p.statuses.filter((s) => s !== "Reopened" || p.canTriage);

  return (
    <div className="space-y-4">
      {statuses.length > 0 && (
        <div className="space-y-2">
          <label htmlFor="bug-status" className="text-xs text-ink-subtle">
            Change status
          </label>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <Select id="bug-status" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Select status…</option>
                {statuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </div>
            <Button size="sm" className="h-10" disabled={!status} loading={busy} onClick={() => patch({ status }, `Moved to ${status}`, () => setStatus(""))}>
              Update
            </Button>
          </div>
        </div>
      )}

      {p.canTriage && (
        <>
          <div className="space-y-2">
            <label htmlFor="bug-assignee" className="text-xs text-ink-subtle">
              Assignee
            </label>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <Select id="bug-assignee" value={chosenAssignee} onChange={(e) => setAssignee(e.target.value)}>
                  <option value="">Unassigned</option>
                  {(assignees.data ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="h-10"
                disabled={chosenAssignee === (bug.assigneeId ?? "")}
                onClick={() => patch({ assigneeId: chosenAssignee || null }, chosenAssignee ? "Ticket assigned" : "Ticket unassigned", () => setAssignee(null))}
              >
                Save
              </Button>
            </div>
            {userId && bug.assigneeId !== userId && (
              <Button size="sm" variant="ghost" onClick={() => patch({ assigneeId: userId, ...(bug.status === "Open" || bug.status === "Reopened" ? { status: "In Progress" } : {}) }, "Assigned to you")}>
                <UserCheck className="h-4 w-4" /> Assign to me
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label htmlFor="bug-priority" className="text-xs text-ink-subtle">
                Priority
              </label>
              <Select id="bug-priority" value={bug.priority} onChange={(e) => patch({ priority: e.target.value }, `Priority set to ${e.target.value}`)}>
                {BUG_PRIORITIES.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label htmlFor="bug-env" className="text-xs text-ink-subtle">
                Environment
              </label>
              <Select id="bug-env" value={bug.environment} onChange={(e) => patch({ environment: e.target.value }, `Environment set to ${e.target.value}`)}>
                {BUG_ENVIRONMENTS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="bug-due" className="text-xs text-ink-subtle">
              Due date
            </label>
            <div className="flex gap-2">
              <Input id="bug-due" type="datetime-local" value={dueValue} onChange={(e) => setDue(e.target.value)} />
              <Button
                size="sm"
                variant="secondary"
                className="h-10"
                disabled={due === null || dueValue === toLocalInput(bug.dueDate)}
                onClick={() => patch({ dueDate: dueValue ? new Date(dueValue).toISOString() : null }, dueValue ? "Due date changed" : "Due date cleared", () => setDue(null))}
              >
                Save
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="bug-ext" className="text-xs text-ink-subtle">
              External reference (e.g. GitHub issue)
            </label>
            <div className="flex gap-2">
              <Input id="bug-ext" value={extValue} maxLength={100} placeholder="#1095" onChange={(e) => setExt(e.target.value)} />
              <Button size="sm" variant="secondary" className="h-10" disabled={ext === null || extValue.trim() === (bug.externalRef ?? "")} onClick={() => patch({ externalRef: extValue.trim() || null }, "Reference saved", () => setExt(null))}>
                Save
              </Button>
            </div>
          </div>
        </>
      )}

      {p.canReopen && (
        <Button size="sm" variant="secondary" className="w-full" onClick={onReopen}>
          <RotateCcw className="h-4 w-4" /> Reopen ticket
        </Button>
      )}
    </div>
  );
}

function EditDialog({ bug, onClose, onSave, busy }: { bug: BugDetail; onClose: () => void; onSave: (b: BugPatch) => void; busy: boolean }) {
  const [title, setTitle] = useState(bug.title);
  const [description, setDescription] = useState(bug.description);
  const [module, setModule] = useState(bug.module ?? "");
  const [type, setType] = useState(bug.type);
  const err = title.trim().length < 5 ? "At least 5 characters." : !description.trim() ? "The description can’t be empty." : null;
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`Edit ${bug.code}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!!err} onClick={() => onSave({ title: title.trim(), description: description.trim(), module: module || null, type })}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormRow label="Title" htmlFor="edit-title" required error={title.trim().length < 5 ? "At least 5 characters." : undefined}>
          <Input id="edit-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        </FormRow>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormRow label="Type" htmlFor="edit-type">
            <Select id="edit-type" value={type} onChange={(e) => setType(e.target.value)}>
              {BUG_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </FormRow>
          <FormRow label="Module" htmlFor="edit-module">
            <Select id="edit-module" value={module} onChange={(e) => setModule(e.target.value)}>
              <option value="">Not set</option>
              {BUG_MODULES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </FormRow>
        </div>
        <FormRow label="Description" htmlFor="edit-desc" required>
          <Textarea id="edit-desc" rows={6} maxLength={10000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </FormRow>
      </div>
    </Dialog>
  );
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

function Message({ who, photo, at, body, files, tag, tone = "default" }: { who: string; photo?: string | null; at: string; body: string; files?: BugFile[]; tag?: string; tone?: "default" | "warning" }) {
  return (
    <article className={cn("rounded-xl border px-4 py-3", tone === "warning" ? "border-warning/40 bg-warning-soft/40" : "border-line bg-surface-muted/40")}>
      <header className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <Avatar name={who} src={assetUrl(photo)} size={28} />
          <span className="text-sm font-semibold text-ink">{who}</span>
          {tag && <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-ink-muted ring-1 ring-line">{tag}</span>}
        </span>
        <time className="shrink-0 text-xs text-ink-subtle" dateTime={at} title={timeAgo(at)}>
          {formatDate(at)} · {formatTime(at)}
        </time>
      </header>
      {body && <p className="mt-2 whitespace-pre-wrap break-words pl-9 text-[14px] leading-relaxed text-ink">{body}</p>}
      {(files?.length ?? 0) > 0 && <Attachments items={files!} className="mt-3 pl-9" />}
    </article>
  );
}

function Attachments({ items, className }: { items: BugFile[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-2", className)}>
      {items.map((a) => {
        const image = a.mimeType?.startsWith("image/");
        return (
          <li key={a.path}>
            <FileLink path={a.path} title={`Open ${a.name}`} className="flex items-center gap-2 rounded-lg border border-line bg-surface p-1.5 pr-2.5 text-xs text-ink hover:border-brand/40">
              {image ? <ProtectedImage path={a.path} className="h-14 w-20 rounded object-cover" /> : <Paperclip className="ml-1 h-3.5 w-3.5 text-ink-subtle" aria-hidden />}
              <span className="max-w-[160px] truncate">{a.name}</span>
            </FileLink>
          </li>
        );
      })}
    </ul>
  );
}

function Composer({ bugId }: { bugId: string }) {
  const toast = useToast();
  const { comment } = useBugMutations();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [attach, setAttach] = useState(false);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (comment.isPending || (!text.trim() && !files.length)) return;
    const fd = new FormData();
    fd.append("body", text.trim());
    files.forEach((f) => fd.append("files", f));
    comment.mutate(
      { id: bugId, fd },
      {
        onSuccess: () => (setText(""), setFiles([]), setAttach(false)),
        onError: (err) => toast.error("Couldn’t post your comment", err instanceof ApiError ? err.message : undefined),
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
    <form
      onSubmit={submit}
      className="border-t border-line bg-surface p-4"
      onPaste={(e) => {
        const imgs = pastedImages(e);
        if (imgs.length) {
          e.preventDefault();
          setFiles((f) => [...f, ...imgs]);
          setAttach(true);
        }
      }}
    >
      <Textarea
        aria-label="Comment"
        rows={3}
        maxLength={4000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        placeholder="Write a comment… (paste a screenshot with Ctrl + V)"
      />
      {attach && (
        <div className="mt-2">
          <FileDrop id="bug-comment-files" files={files} onChange={setFiles} accept={BUG_ATTACH_ACCEPT} maxMb={15} hint="Up to 10 files, 15 MB each" />
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="hidden text-[11px] text-ink-subtle sm:inline">Enter to send, Shift + Enter for a new line</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setAttach((a) => !a)} aria-expanded={attach}>
            <Paperclip className="h-4 w-4" /> {attach ? "Hide files" : files.length ? `Files (${files.length})` : "Attach"}
          </Button>
          <Button type="submit" size="sm" loading={comment.isPending} disabled={!text.trim() && !files.length}>
            <Send className="h-4 w-4" /> Send
          </Button>
        </div>
      </div>
    </form>
  );
}
