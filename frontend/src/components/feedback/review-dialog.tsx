"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Bug, ExternalLink, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormRow, Select, Textarea } from "@/components/ui/inputs";
import { useToast } from "@/components/ui/toast";
import { STATUS_LABEL, STATUS_TONE, STATUSES, useFeedbackMutations, type Feedback, type FeedbackStatus } from "./api";
import { Stars } from "./my-feedback";

export function ReviewDialog({ feedback, onClose }: { feedback: Feedback | null; onClose: () => void }) {
  if (!feedback) return null;
  return <ReviewBody key={feedback.id} f={feedback} onClose={onClose} />;
}

function ReviewBody({ f, onClose }: { f: Feedback; onClose: () => void }) {
  const uid = useId();
  const toast = useToast();
  const { update, toBug, remove } = useFeedbackMutations();
  const [status, setStatus] = useState<FeedbackStatus>(f.status);
  const [response, setResponse] = useState(f.response ?? "");
  const [bug, setBug] = useState<{ id: string; code: string | null } | null>(f.bugId ? { id: f.bugId, code: null } : null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dirty = status !== f.status || response.trim() !== (f.response ?? "");

  async function save() {
    const body: { status?: FeedbackStatus; response?: string } = {};
    if (status !== f.status) body.status = status;
    if (response.trim() !== (f.response ?? "")) body.response = response.trim();
    try {
      const res = await update.mutateAsync({ id: f.id, body });
      toast.success(res.message ?? "Saved.");
      onClose();
    } catch (e) {
      toast.error("Couldn’t save", e instanceof ApiError ? e.message : undefined);
    }
  }

  async function createBug() {
    try {
      const res = await toBug.mutateAsync(f.id);
      setBug(res.bug);
      setStatus(res.data.status);
      toast.success(res.message ?? "Bug ticket created.");
    } catch (e) {
      toast.error("Couldn’t create the bug ticket", e instanceof ApiError ? e.message : undefined);
    }
  }

  async function del() {
    try {
      const res = await remove.mutateAsync(f.id);
      toast.success(res.message ?? "Feedback deleted.");
      onClose();
    } catch (e) {
      toast.error("Couldn’t delete", e instanceof ApiError ? e.message : undefined);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`${f.category} feedback`}
      description={`${f.anonymous ? "Anonymous" : (f.sender?.name ?? "Unknown")}${f.sender?.department ? ` · ${f.sender.department}` : ""} · ${formatDate(f.createdAt, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`}
      footer={
        confirmDelete ? (
          <>
            <span className="mr-auto self-center text-sm text-danger">Delete this feedback for good?</span>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Keep
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={del}>
              Delete
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" className="mr-auto" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" aria-hidden /> Delete
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button onClick={save} disabled={!dirty} loading={update.isPending}>
              {response.trim() && response.trim() !== (f.response ?? "") ? (f.anonymous ? "Save reply" : "Send reply") : "Save"}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[f.status]}>{STATUS_LABEL[f.status]}</Badge>
          {f.module && <Badge>{f.module}</Badge>}
          {f.rating ? <Stars value={f.rating} /> : <span className="text-xs text-ink-subtle">No rating</span>}
          {f.pageUrl && (
            <Link href={f.pageUrl} className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
              {f.pageUrl} <ExternalLink className="h-3 w-3" aria-hidden />
            </Link>
          )}
        </div>
        <blockquote className="whitespace-pre-wrap rounded-xl border border-line bg-surface-muted px-4 py-3 text-sm text-ink">{f.message}</blockquote>

        <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
          <FormRow label="Status" htmlFor={`${uid}-status`}>
            <Select id={`${uid}-status`} value={status} onChange={(e) => setStatus(e.target.value as FeedbackStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </FormRow>
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-ink">Bug tracker</p>
            {bug ? (
              <Link href={`/bugs/${bug.id}`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-brand hover:bg-surface-muted">
                <Bug className="h-4 w-4" aria-hidden /> {bug.code ?? "Open bug ticket"}
              </Link>
            ) : (
              <Button variant="secondary" onClick={createBug} loading={toBug.isPending}>
                <Bug className="h-4 w-4" aria-hidden /> Create bug ticket
              </Button>
            )}
          </div>
        </div>

        <FormRow
          label="Reply"
          htmlFor={`${uid}-reply`}
          hint={f.anonymous ? "Sent anonymously — they’ll see your reply in their feedback list but won’t get a notification." : "The sender gets a notification with your reply."}
        >
          <Textarea id={`${uid}-reply`} value={response} onChange={(e) => setResponse(e.target.value)} rows={4} maxLength={2000} placeholder="Thanks — here’s what we’ll do…" />
        </FormRow>
        {f.respondedBy && f.respondedAt && (
          <p className="text-xs text-ink-subtle">
            Last replied by {f.respondedBy} on {formatDate(f.respondedAt)}
          </p>
        )}
      </div>
    </Dialog>
  );
}
