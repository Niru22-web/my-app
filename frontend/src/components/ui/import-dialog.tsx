"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, MinusCircle, Upload } from "lucide-react";
import { api, ApiError, downloadFile } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { Dialog } from "./dialog";
import { FileDrop } from "./file-drop";
import { useToast } from "./toast";

export type ImportKind = "employees" | "clients" | "projects" | "jobs" | "assets" | "vendors" | "holidays";

interface ImportRow {
  line: number;
  status: "ok" | "skip" | "error" | "imported";
  message: string;
  label?: string;
}
interface ImportResponse {
  success: boolean;
  mode: "check" | "import";
  message: string;
  summary: { total: number; ready: number; skipped: number; errors: number; imported?: number; failed?: number };
  rows: ImportRow[];
}

/** "Import" button + dialog: download the template, check the file, then import. */
export function ImportButton({ kind, label, invalidate }: { kind: ImportKind; label: string; invalidate: unknown[][] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" /> Import
      </Button>
      {open && <ImportDialog kind={kind} label={label} invalidate={invalidate} onClose={() => setOpen(false)} />}
    </>
  );
}

function ImportDialog({ kind, label, invalidate, onClose }: { kind: ImportKind; label: string; invalidate: unknown[][]; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<"template" | "check" | "import" | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const file = files[0];

  async function template() {
    setBusy("template");
    try {
      await downloadFile(`imports/${kind}/template`, `${kind}-import-template.xlsx`);
    } catch (e) {
      toast.error("Couldn’t download the template", e instanceof ApiError ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  async function send(mode: "check" | "import") {
    if (!file) return;
    setBusy(mode);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await api<ImportResponse>(`imports/${kind}`, { method: "POST", body: fd, query: { mode } });
      setResult(res);
      if (mode === "import") {
        for (const key of invalidate) void qc.invalidateQueries({ queryKey: key });
        toast.success(`${label} imported`, res.message);
      }
    } catch (e) {
      const body = e instanceof ApiError ? (e.body as Partial<ImportResponse> | undefined) : undefined;
      if (body?.rows) setResult(body as ImportResponse);
      else setError(e instanceof ApiError ? e.message : "The file couldn’t be uploaded.");
    } finally {
      setBusy(null);
    }
  }

  const done = result?.mode === "import";
  const canImport = result?.mode === "check" && result.summary.errors === 0 && result.summary.ready > 0;

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`Import ${label.toLowerCase()}`}
      description="Fill in the template, check it, then import. Nothing is saved until every row is valid."
      footer={
        done ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            {canImport ? (
              <Button onClick={() => send("import")} loading={busy === "import"}>
                <Upload className="h-4 w-4" /> Import {result!.summary.ready} row{result!.summary.ready === 1 ? "" : "s"}
              </Button>
            ) : (
              <Button onClick={() => send("check")} loading={busy === "check"} disabled={!file}>
                Check file
              </Button>
            )}
          </>
        )
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface-muted/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-start gap-3">
            <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
            <span className="text-sm">
              <span className="block font-semibold text-ink">Step 1 · Sample template</span>
              <span className="text-ink-muted">Excel file with the right columns, a sample row and a “How to fill” sheet.</span>
            </span>
          </span>
          <Button variant="secondary" size="sm" onClick={template} loading={busy === "template"}>
            <Download className="h-4 w-4" /> Download template
          </Button>
        </div>

        {!done && (
          <div>
            <p className="mb-2 text-sm font-semibold text-ink">Step 2 · Upload the filled file</p>
            <FileDrop
              id={`import-${kind}`}
              files={files}
              onChange={(f) => (setFiles(f.slice(-1)), setResult(null), setError(null))}
              accept=".xlsx,.csv"
              maxMb={5}
              hint=".xlsx or .csv · up to 5 MB · 2,000 rows"
            />
          </div>
        )}

        {error && (
          <p className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}

        {result && (
          <div className="space-y-2">
            <p className={cn("text-sm font-semibold", result.summary.errors ? "text-danger" : "text-ink")}>{result.message}</p>
            <div className="flex flex-wrap gap-2 text-xs">
              <Chip tone="neutral">{result.summary.total} rows</Chip>
              {done ? <Chip tone="success">{result.summary.imported ?? 0} imported</Chip> : <Chip tone="success">{result.summary.ready} ready</Chip>}
              {result.summary.skipped > 0 && <Chip tone="neutral">{result.summary.skipped} already exist (skipped)</Chip>}
              {result.summary.errors > 0 && <Chip tone="danger">{result.summary.errors} to fix</Chip>}
              {!!result.summary.failed && <Chip tone="danger">{result.summary.failed} failed</Chip>}
            </div>
            <div className="max-h-72 overflow-y-auto rounded-xl border border-line">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-muted text-ink-subtle">
                  <tr>
                    <th className="w-16 px-3 py-2 text-left font-semibold">Row</th>
                    <th className="px-3 py-2 text-left font-semibold">Record</th>
                    <th className="px-3 py-2 text-left font-semibold">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[...result.rows]
                    .sort((a, b) => Number(b.status === "error") - Number(a.status === "error") || a.line - b.line)
                    .map((r) => (
                      <tr key={r.line} className={cn(r.status === "error" && "bg-danger-soft/40")}>
                        <td className="px-3 py-1.5 tabular text-ink-muted">{r.line}</td>
                        <td className="max-w-[220px] truncate px-3 py-1.5 text-ink">{r.label || "—"}</td>
                        <td className="px-3 py-1.5">
                          <span className={cn("inline-flex items-center gap-1", r.status === "error" ? "text-danger" : r.status === "skip" ? "text-ink-muted" : "text-success")}>
                            {r.status === "error" ? <AlertCircle className="h-3.5 w-3.5" /> : r.status === "skip" ? <MinusCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            {r.message}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function Chip({ tone, children }: { tone: "neutral" | "success" | "danger"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 font-semibold",
        tone === "success" ? "bg-success-soft text-success" : tone === "danger" ? "bg-danger-soft text-danger" : "bg-surface-muted text-ink-muted",
      )}
    >
      {children}
    </span>
  );
}
