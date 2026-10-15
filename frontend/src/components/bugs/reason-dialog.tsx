"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormRow, Textarea } from "@/components/ui/inputs";

/** Asks for a short note before a status change (required when the reporter reopens a ticket). */
export function ReasonDialog({
  open,
  title,
  description,
  label = "Comment",
  confirmLabel = "Save",
  required = true,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description?: string;
  label?: string;
  confirmLabel?: string;
  required?: boolean;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const close = () => (setText(""), onClose());
  return (
    <Dialog
      open={open}
      onClose={close}
      size="sm"
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} disabled={required && text.trim().length < 3} onClick={() => (onSubmit(text.trim()), setText(""))}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <FormRow label={label} htmlFor="bug-reason" required={required}>
        <Textarea id="bug-reason" rows={3} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} />
      </FormRow>
    </Dialog>
  );
}
