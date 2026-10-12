"use client";

import { useState, type ReactNode } from "react";
import { Dialog } from "./dialog";
import { Button } from "./button";

/** Confirmation dialog for destructive or irreversible actions. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "primary",
  busy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: "primary" | "danger";
  busy?: boolean;
  children?: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description && <p className="text-sm text-ink-muted">{description}</p>}
      {children}
    </Dialog>
  );
}

/** Small helper for "open with a payload" dialogs. */
export function useDialogState<T>() {
  const [value, setValue] = useState<T | null>(null);
  return { value, open: value !== null, show: (v: T) => setValue(v), close: () => setValue(null) };
}
