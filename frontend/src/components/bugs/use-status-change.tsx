"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/ui/toast";
import { isTriage, useBugMutations, type Bug, type BugPatch } from "./api";
import { ReasonDialog } from "./reason-dialog";

/**
 * Status / assignee changes from lists and the board, with toasts. Reopening (by someone other than
 * Admin/Owner/IT) asks for a comment first, as the API requires.
 */
export function useBugActions() {
  const { user } = useAuth();
  const toast = useToast();
  const { update } = useBugMutations();
  const [reopen, setReopen] = useState<Bug | null>(null);

  const patch = (bug: Pick<Bug, "id" | "code">, body: BugPatch, done: string) =>
    update.mutate(
      { id: bug.id, body },
      {
        onSuccess: () => toast.success(done, bug.code),
        onError: (e) => toast.error(`Couldn’t update ${bug.code}`, e instanceof ApiError ? e.message : undefined),
      },
    );

  const setStatus = (bug: Bug, status: string) => {
    if (status === bug.status) return;
    if (status === "Reopened" && !isTriage(user?.role)) return setReopen(bug);
    patch(bug, { status }, `Moved to ${status}`);
  };
  const setAssignee = (bug: Bug, assigneeId: string | null, name?: string) => {
    if ((bug.assigneeId ?? null) === assigneeId) return;
    patch(bug, { assigneeId }, assigneeId ? `Assigned to ${name ?? "the selected person"}` : "Unassigned");
  };

  const dialog = (
    <ReasonDialog
      open={!!reopen}
      title={reopen ? `Reopen ${reopen.code}?` : "Reopen"}
      description="Say what is still wrong. The assignee and the IT team will see your comment."
      label="Why are you reopening it?"
      confirmLabel="Reopen ticket"
      busy={update.isPending}
      onClose={() => setReopen(null)}
      onSubmit={(comment) => {
        if (reopen) patch(reopen, { status: "Reopened", comment }, "Ticket reopened");
        setReopen(null);
      }}
    />
  );
  return { setStatus, setAssignee, dialog, busy: update.isPending };
}
