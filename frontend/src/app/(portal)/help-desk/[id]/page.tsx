"use client";

import { use, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, CornerUpLeft, Flag, MessageSquare, Paperclip, Play, RotateCcw, Send, Trash2, UserCog } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { formatDate, formatTime } from "@/lib/format";
import { timeAgo } from "@/lib/notifications";
import { cn } from "@/lib/cn";
import { Card, CardHeader } from "@/components/ui/card";
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
  STATUS_TONE,
  statusKey,
  ticketCode,
  useTicket,
  useTicketMutations,
  type TicketAttachment,
  type TicketEvent,
} from "@/components/helpdesk/api";

function fmtDuration(ms: number) {
  const h = Math.floor(Math.abs(ms) / 3_600_000);
  const m = Math.floor((Math.abs(ms) % 3_600_000) / 60_000);
  return h >= 48 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}m`;
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
  const [dialog, setDialog] = useState<null | "return" | "escalate" | "reassign" | "delete">(null);

  const names = useMemo(() => new Map((people.data ?? []).map((p) => [p.id, fullName(p)])), [people.data]);
  const agents = (people.data ?? []).filter((p) => (p.status ?? "").toLowerCase() === "active" && ["it", "admin"].includes((p.role ?? "").toLowerCase()));

  if (q.isError)
    return (
      <Card>
        <ErrorState message={q.error instanceof ApiError && q.error.status === 404 ? "This ticket doesn’t exist or was deleted." : undefined} onRetry={() => q.refetch()} />
      </Card>
    );
  if (q.isLoading || !q.data) return <Skeleton className="h-[600px]" />;

  const t = q.data;
  const s = statusKey(t.status);
  const sla = slaState(t);
  const mine = t.createdById === user?.id;
  const assignedToMe = t.assignedTo === user?.id;
  const fail = (title: string) => (e: unknown) => toast.error(title, e instanceof ApiError ? e.message : undefined);
  const patch = (body: { status?: string; assignedTo?: string | null }, msg: string) =>
    m.update.mutate({ id: t.id, body }, { onSuccess: () => (toast.success(msg, ticketCode(t)), void q.refetch()), onError: fail("Couldn’t update the ticket") });

  const events = [...(t.history ?? [])].sort((a, b) => a.performedAt.localeCompare(b.performedAt));

  return (
    <div className="space-y-6">
      <Link href="/help-desk" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-brand">
        <ArrowLeft className="h-4 w-4" /> All tickets
      </Link>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-brand">{ticketCode(t)}</span>
            <Badge tone={STATUS_TONE[s]}>{t.status}</Badge>
            <Badge tone={PRIORITY_TONE[t.priority ?? "Low"] ?? "neutral"}>{t.priority ?? "Low"} priority</Badge>
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold text-ink">{t.title}</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {categoryLabel(t)} · raised by {raiserName(t)} {timeAgo(t.createdAt)}
          </p>
        </div>

        {agent && (
          <div className="flex flex-wrap gap-2">
            {s === "open" && (!t.assignedTo || assignedToMe) && (
              <Button onClick={() => patch({ status: "In Progress", assignedTo: user!.id }, "You’re working on this ticket")} loading={m.update.isPending}>
                <Play className="h-4 w-4" /> Start work
              </Button>
            )}
            {(s === "open" || s === "progress") && (
              <Button variant={s === "progress" ? "primary" : "secondary"} onClick={() => patch({ status: "Resolved" }, "Ticket resolved")} loading={m.update.isPending}>
                <CheckCircle2 className="h-4 w-4" /> Resolve
              </Button>
            )}
            {(s === "open" || s === "progress") && (
              <Button variant="secondary" onClick={() => setDialog("return")}>
                <CornerUpLeft className="h-4 w-4" /> Return to raiser
              </Button>
            )}
            {(s === "resolved" || s === "returned" || s === "closed") && (
              <Button variant="secondary" onClick={() => patch({ status: "In Progress", assignedTo: t.assignedTo ?? user!.id }, "Ticket reopened")} loading={m.update.isPending}>
                <RotateCcw className="h-4 w-4" /> Reopen
              </Button>
            )}
            {s !== "resolved" && (
              <Button variant="secondary" onClick={() => setDialog("reassign")}>
                <UserCog className="h-4 w-4" /> Reassign
              </Button>
            )}
            <Button variant="ghost" onClick={() => setDialog("escalate")}>
              <Flag className="h-4 w-4" /> Escalate
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card className="p-5">
            <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink">{t.description}</p>
            {(t.attachments?.length ?? 0) > 0 && <Attachments items={t.attachments!} className="mt-4" />}
          </Card>

          <Card>
            <CardHeader icon={MessageSquare} title="Activity" description="Updates and replies on this ticket" />
            <ol className="space-y-4 p-5">
              {events.map((e) => (
                <EventRow key={e.id} e={e} name={(id) => (id ? (names.get(id) ?? (id === t.assignedTo ? t.assigneeName : null) ?? "a support agent") : "nobody")} />
              ))}
            </ol>
            <Composer ticketId={t.id} onDone={() => void q.refetch()} />
          </Card>
        </div>

        <aside className="space-y-6">
          <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Response target</p>
            {sla.done ? (
              <p className="mt-1 flex items-center gap-2 font-display text-lg font-bold text-success">
                <CheckCircle2 className="h-5 w-5" /> Resolved
              </p>
            ) : (
              <p className={cn("mt-1 flex items-center gap-2 font-display text-lg font-bold", sla.overdue ? "text-danger" : "text-ink")}>
                {sla.overdue && <AlertTriangle className="h-5 w-5" />}
                {sla.overdue ? `Overdue by ${fmtDuration(sla.remainingMs)}` : `${fmtDuration(sla.remainingMs)} left`}
              </p>
            )}
            <p className="mt-1 text-xs text-ink-subtle">
              {slaHours(t)} h target · due {formatDate(sla.due.toISOString())} {formatTime(sla.due.toISOString())}
            </p>
          </Card>

          <Card className="p-5">
            <dl className="space-y-4 text-sm">
              <Meta label="Raised by" value={`${raiserName(t)}${t.createdBy?.employeeId ? ` · ${t.createdBy.employeeId}` : ""}`} sub={t.createdBy?.department} />
              <Meta label="Assigned to" value={t.assigneeName ?? "Unassigned"} muted={!t.assigneeName} />
              <Meta label="Team" value={t.subcategoryRel?.assigned_team ?? t.categoryRel?.assigned_team ?? "IT"} />
              <Meta label="Category" value={categoryLabel(t)} />
              <Meta label="Raised" value={`${formatDate(t.createdAt)} ${formatTime(t.createdAt)}`} />
              <Meta label="Last update" value={timeAgo(t.updatedAt)} />
            </dl>
          </Card>

          {(agent || (mine && s === "open" && !t.assignedTo)) && (
            <button onClick={() => setDialog("delete")} className="flex items-center gap-2 px-1 text-[13px] font-medium text-danger hover:underline">
              <Trash2 className="h-4 w-4" /> Delete ticket
            </button>
          )}
        </aside>
      </div>

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
            fd.append("toStatus", "Returned");
          } else fd.append("action", "Escalate");
          m.addEvent.mutate(
            { id: t.id, fd },
            {
              onSuccess: () => (toast.success(dialog === "return" ? "Returned to the raiser" : "Escalation recorded"), setDialog(null), void q.refetch()),
              onError: fail("Couldn’t update the ticket"),
            },
          );
        }}
      />

      <ReassignDialog
        open={dialog === "reassign"}
        current={t.assignedTo}
        agents={agents.map((a) => ({ id: a.id, name: fullName(a) }))}
        busy={m.update.isPending}
        onClose={() => setDialog(null)}
        onSubmit={(assignedTo) => (patch({ assignedTo }, assignedTo ? "Ticket reassigned" : "Ticket unassigned"), setDialog(null))}
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

function Meta({ label, value, sub, muted }: { label: string; value: string; sub?: string | null; muted?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-ink-subtle">{label}</dt>
      <dd className={cn("mt-0.5", muted ? "italic text-ink-subtle" : "text-ink")}>{value}</dd>
      {sub && <dd className="text-xs text-ink-subtle">{sub}</dd>}
    </div>
  );
}

function Attachments({ items, className }: { items: TicketAttachment[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-2", className)}>
      {items.map((a) => {
        const image = a.mimeType?.startsWith("image/");
        return (
          <li key={a.id}>
            <FileLink path={a.url} className="flex items-center gap-2 rounded-lg border border-line bg-surface-muted px-2.5 py-1.5 text-xs text-ink hover:border-brand/40">
              {image ? (
                <ProtectedImage path={a.url} className="h-8 w-8 rounded object-cover" />
              ) : (
                <Paperclip className="h-3.5 w-3.5 text-ink-subtle" aria-hidden />
              )}
              <span className="max-w-[180px] truncate">{a.filename}</span>
            </FileLink>
          </li>
        );
      })}
    </ul>
  );
}

function EventRow({ e, name }: { e: TicketEvent; name: (id: string | null) => string }) {
  const a = e.action.toLowerCase();
  // Routing at creation is recorded against the raiser; it was really the portal's automatic assignment.
  const auto = a === "assigned" && /^auto-assigned/i.test(e.remarks ?? "");
  const who = auto ? "ASA Portal" : e.performer ? `${e.performer.firstName} ${e.performer.lastName}`.trim() : "Someone";
  const comment = a === "comment";
  let text: string;
  if (a === "created") text = "raised the ticket";
  else if (auto) text = `routed it to ${name(e.toAssignee)}`;
  else if (a === "assigned") text = `assigned it to ${name(e.toAssignee)}`;
  else if (a === "returned") text = "returned the ticket to the raiser";
  else if (a === "escalate") text = "escalated the ticket";
  else if (comment) text = "replied";
  else if (e.fromStatus && e.toStatus && e.fromStatus !== e.toStatus) text = `changed status ${e.fromStatus} → ${e.toStatus}`;
  else if (e.fromAssignee !== e.toAssignee && e.toAssignee) text = `reassigned it to ${name(e.toAssignee)}`;
  else text = e.action.toLowerCase();

  return (
    <li className="flex gap-3">
      <Avatar name={who} size={30} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-ink">
          <span className="font-semibold">{who}</span> <span className="text-ink-muted">{text}</span>
          <span className="ml-2 text-xs text-ink-subtle">{timeAgo(e.performedAt)}</span>
        </p>
        {e.remarks && !auto && !(a === "created" && e.remarks === "Ticket initially raised") && (
          <p className={cn("mt-1.5 inline-block whitespace-pre-wrap break-words rounded-2xl rounded-tl-md px-3 py-2 text-[13px]", a === "escalate" ? "bg-warning-soft text-ink" : a === "returned" ? "bg-danger-soft text-ink" : "bg-surface-muted text-ink")}>
            {e.remarks}
          </p>
        )}
        {(e.attachments?.length ?? 0) > 0 && <Attachments items={e.attachments!} className="mt-2" />}
      </div>
    </li>
  );
}

function Composer({ ticketId, onDone }: { ticketId: string; onDone: () => void }) {
  const toast = useToast();
  const { addEvent } = useTicketMutations();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [attach, setAttach] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() && !files.length) return;
    const fd = new FormData();
    fd.append("action", "Comment");
    fd.append("remarks", text.trim());
    files.forEach((f) => fd.append("attachments", f));
    addEvent.mutate(
      { id: ticketId, fd },
      {
        onSuccess: () => (setText(""), setFiles([]), setAttach(false), onDone()),
        onError: (err) => toast.error("Couldn’t send your reply", err instanceof ApiError ? err.message : undefined),
      },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 border-t border-line p-4">
      <Textarea aria-label="Reply" rows={3} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a reply… (visible to the raiser and the support team)" />
      {attach && <FileDrop id="reply-files" files={files} onChange={setFiles} accept={ATTACH_ACCEPT} maxMb={50} hint="Up to 10 files, 50 MB each" />}
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setAttach((a) => !a)}>
          <Paperclip className="h-4 w-4" /> {attach ? "Hide attachments" : "Attach files"}
        </Button>
        <Button type="submit" size="sm" loading={addEvent.isPending} disabled={!text.trim() && !files.length}>
          <Send className="h-4 w-4" /> Send reply
        </Button>
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
          : "Records the escalation in the ticket’s history. Note: the current server doesn’t email the escalation contact — follow up directly if it’s urgent."
      }
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant={kind === "return" ? "danger" : "primary"} loading={busy} disabled={text.trim().length < 3} onClick={() => (onSubmit(text.trim()), setText(""))}>
            {kind === "return" ? "Return ticket" : "Record escalation"}
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

function ReassignDialog({ open, current, agents, busy, onClose, onSubmit }: { open: boolean; current: string | null; agents: { id: string; name: string }[]; busy: boolean; onClose: () => void; onSubmit: (id: string | null) => void }) {
  const [value, setValue] = useState(current ?? "");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Reassign ticket"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} disabled={value === (current ?? "")} onClick={() => onSubmit(value || null)}>
            Save
          </Button>
        </>
      }
    >
      <FormRow label="Support agent" htmlFor="hd-agent">
        <Select id="hd-agent" value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">Unassigned</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </FormRow>
    </Dialog>
  );
}
