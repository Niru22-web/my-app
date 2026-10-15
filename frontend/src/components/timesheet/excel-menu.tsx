"use client";

import { useCallback, useRef, useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, FileUp, Upload } from "lucide-react";
import { ApiError, downloadFile } from "@/lib/api";
import { useDismiss } from "@/lib/use-outside";
import { today } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { useTimelogMutations, type ImportResult } from "./api";

/** Template / Import / Export actions backed by the existing Excel endpoints. */
export function ExcelMenu({ exportQuery }: { exportQuery: Record<string, string | undefined> }) {
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const toast = useToast();

  async function run(kind: "template" | "export") {
    close();
    setBusy(kind);
    try {
      if (kind === "template") await downloadFile("timelogs/template", "timesheet-import-template.xlsx");
      else await downloadFile("timelogs/export", `timesheet-export-${today()}.xlsx`, exportQuery);
    } catch (e) {
      toast.error(kind === "template" ? "Couldn’t download the template" : "Couldn’t export", e instanceof ApiError ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  const item = "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-surface-muted";
  return (
    <>
      <div ref={ref} className="relative">
        <Button variant="secondary" onClick={() => setOpen((o) => !o)} loading={!!busy} aria-expanded={open}>
          {!busy && <FileSpreadsheet className="h-4 w-4" />} Excel <ChevronDown className="h-4 w-4 text-ink-subtle" />
        </Button>
        {open && (
          <div className="absolute right-0 top-12 z-30 w-72 rounded-2xl border border-line bg-surface p-1.5 shadow-pop">
            <button className={item} onClick={() => run("export")}>
              <Download className="mt-0.5 h-4 w-4 text-brand" />
              <span>
                <span className="block text-sm font-medium text-ink">Export entries</span>
                <span className="block text-xs text-ink-subtle">Download the entries in the current date range</span>
              </span>
            </button>
            <button className={item} onClick={() => run("template")}>
              <FileSpreadsheet className="mt-0.5 h-4 w-4 text-brand" />
              <span>
                <span className="block text-sm font-medium text-ink">Download import template</span>
                <span className="block text-xs text-ink-subtle">Excel sheet with the columns and a how-to tab (job codes are on the Jobs page)</span>
              </span>
            </button>
            <button className={item} onClick={() => (close(), setImportOpen(true))}>
              <Upload className="mt-0.5 h-4 w-4 text-brand" />
              <span>
                <span className="block text-sm font-medium text-ink">Import from Excel</span>
                <span className="block text-xs text-ink-subtle">Upload a completed template (.xlsx or .csv)</span>
              </span>
            </button>
          </div>
        )}
      </div>
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  );
}

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { importFile } = useTimelogMutations();

  const reset = () => {
    setFile(null);
    setResult(null);
    setError(null);
  };
  const handleClose = () => {
    reset();
    onClose();
  };

  async function upload() {
    if (!file) return;
    setError(null);
    try {
      setResult(await importFile.mutateAsync(file));
    } catch (e) {
      // When every row fails the API answers 400 with the row errors in the body — show them.
      if (e instanceof ApiError && e.body && typeof e.body === "object" && ("errors" in e.body || "validationErrors" in e.body)) {
        setResult(e.body as ImportResult);
      } else setError(e instanceof ApiError ? e.message : "Import failed. Please try again.");
    }
  }

  const rowErrors = [...(result?.validationErrors ?? []), ...(result?.importErrors ?? []), ...(result?.errors ?? [])];

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Import time entries"
      description="Use the import template. Each row becomes a draft entry you can review before submitting."
      size="lg"
      footer={
        result ? (
          <Button onClick={handleClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={upload} disabled={!file} loading={importFile.isPending}>
              <FileUp className="h-4 w-4" /> Import
            </Button>
          </>
        )
      }
    >
      {!result ? (
        <div className="space-y-3">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line-strong bg-surface-muted px-6 py-10 text-center hover:border-brand/50">
            <Upload className="h-6 w-6 text-brand" aria-hidden />
            <span className="mt-2 text-sm font-semibold text-ink">{file ? file.name : "Choose a file"}</span>
            <span className="mt-1 text-xs text-ink-subtle">.xlsx or .csv · up to 5 MB · a file with mistakes imports nothing, so fix and re-upload</span>
            <input
              type="file"
              accept=".xlsx,.csv"
              className="sr-only"
              onChange={(e) => {
                setError(null);
                setFile(e.target.files?.[0] ?? null);
              }}
            />
          </label>
          {error && <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">{error}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Tile label="Rows read" value={result.totalRows ?? 0} />
            <Tile label="Imported" value={result.successfulImports ?? 0} tone="success" />
            <Tile label="Failed" value={rowErrors.length} tone={rowErrors.length ? "danger" : undefined} />
          </div>
          {result.message && <p className="text-sm text-ink-muted">{result.message}</p>}
          {rowErrors.length > 0 && (
            <div className="max-h-72 overflow-auto rounded-xl border border-line">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-surface-muted text-left text-xs text-ink-subtle">
                  <tr>
                    <th className="px-3 py-2 font-medium">Row</th>
                    <th className="px-3 py-2 font-medium">Project / Job</th>
                    <th className="px-3 py-2 font-medium">Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {rowErrors.map((r, i) => (
                    <tr key={i} className="border-t border-line align-top">
                      <td className="px-3 py-2 tabular text-ink-muted">{r.row ?? "—"}</td>
                      <td className="px-3 py-2 text-ink">{[r.project, r.job].filter(Boolean).join(" / ") || "—"}</td>
                      <td className="px-3 py-2 text-danger">{r.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: "success" | "danger" }) {
  return (
    <div className="rounded-xl bg-surface-muted px-3 py-2.5">
      <p className="text-[11px] text-ink-subtle">{label}</p>
      <p className={`font-display text-xl font-bold tabular ${tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-ink"}`}>{value}</p>
    </div>
  );
}
