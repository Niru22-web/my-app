"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormRow, Textarea } from "@/components/ui/inputs";

/** Confirmation that needs a written reason (cancel, reverse, un-match). */
export function ReasonDialog({
  title,
  description,
  label = "Reason",
  placeholder,
  confirmLabel,
  tone = "danger",
  busy,
  onClose,
  onConfirm,
  children,
}: {
  title: string;
  description?: ReactNode;
  label?: string;
  placeholder?: string;
  confirmLabel: string;
  tone?: "primary" | "danger";
  busy?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  children?: ReactNode;
}) {
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const error = !reason.trim() ? "Please give a reason." : "";

  function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (error) return;
    onConfirm(reason.trim());
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Back
          </Button>
          <Button type="submit" form="reason-form" variant={tone === "danger" ? "danger" : "primary"} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form id="reason-form" onSubmit={submit} noValidate className="space-y-4">
        {description && <div className="text-sm text-ink-muted">{description}</div>}
        {children}
        <FormRow label={label} htmlFor="reason-text" required error={tried ? error || undefined : undefined}>
          <Textarea id="reason-text" rows={3} maxLength={300} value={reason} placeholder={placeholder} onChange={(e) => setReason(e.target.value)} invalid={tried && !!error} />
        </FormRow>
      </form>
    </Dialog>
  );
}
