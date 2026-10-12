"use client";

import { useRef, useState, type DragEvent } from "react";
import { FileText, Upload, X } from "lucide-react";
import { cn } from "@/lib/cn";

interface FileDropProps {
  id: string;
  files: File[];
  onChange: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  /** Max size per file in MB. */
  maxMb?: number;
  hint?: string;
  invalid?: boolean;
}

function fmtSize(b: number) {
  return b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
}

/** Drag-and-drop / click-to-browse file picker with per-file validation and removal. */
export function FileDrop({ id, files, onChange, accept, multiple = true, maxMb = 5, hint, invalid }: FileDropProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function add(list: FileList | null) {
    if (!list?.length) return;
    const allowed = accept?.split(",").map((s) => s.trim().toLowerCase());
    const next: File[] = [];
    for (const f of Array.from(list)) {
      const ext = "." + (f.name.split(".").pop() ?? "").toLowerCase();
      if (allowed && !allowed.some((a) => a === ext || (a.endsWith("/*") ? f.type.startsWith(a.slice(0, -1)) : a === f.type))) {
        setError(`${f.name}: this file type isn’t allowed.`);
        continue;
      }
      if (f.size > maxMb * 1024 * 1024) {
        setError(`${f.name} is larger than ${maxMb} MB.`);
        continue;
      }
      next.push(f);
    }
    if (next.length) setError(null);
    onChange(multiple ? [...files, ...next].filter((f, i, a) => a.findIndex((x) => x.name === f.name && x.size === f.size) === i) : next.slice(0, 1));
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    add(e.dataTransfer.files);
  };

  return (
    <div>
      <label
        htmlFor={id}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
          over ? "border-brand bg-brand-softer" : invalid ? "border-danger bg-danger-soft/40" : "border-line-strong bg-surface-muted hover:border-brand/50",
        )}
      >
        <Upload className="h-5 w-5 text-brand" aria-hidden />
        <span className="mt-1.5 text-sm font-medium text-ink">Drop files here or browse</span>
        {hint && <span className="mt-0.5 text-xs text-ink-subtle">{hint}</span>}
        <input
          ref={input}
          id={id}
          type="file"
          accept={accept}
          multiple={multiple}
          className="sr-only"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
      {files.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {files.map((f) => (
            <li key={f.name + f.size} className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2">
              <FileText className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{f.name}</span>
              <span className="shrink-0 text-xs text-ink-subtle tabular">{fmtSize(f.size)}</span>
              <button
                type="button"
                onClick={() => onChange(files.filter((x) => x !== f))}
                className="grid h-6 w-6 place-items-center rounded-md text-ink-subtle hover:bg-surface-muted hover:text-danger"
                aria-label={`Remove ${f.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
