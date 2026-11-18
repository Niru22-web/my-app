"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eraser, Cpu, Database, FileText, HardDrive, RefreshCw, Search, Server, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import { useDebounced } from "@/lib/use-debounced";
import { formatDate, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { StatRow } from "@/components/ui/stat";
import { Input } from "@/components/ui/inputs";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { FileLink } from "@/components/ui/protected-file";
import { canSystem, useAdminMutations, useSystemStatus } from "@/components/admin/api";

/** Whitelisted storage folders. */
const CATEGORIES = [
  { value: "all", label: "All" },
  { value: "profile", label: "Profile photos" },
  { value: "documents", label: "Documents" },
  { value: "tickets", label: "Ticket files" },
  { value: "temp", label: "Temporary" },
  { value: "logs", label: "Logs" },
] as const;
type Cat = (typeof CATEGORIES)[number]["value"];

interface StoredFile {
  name: string;
  relativePath: string;
  category: string;
  sizeFormatted: string;
  modifiedAt: string;
  url: string;
}

export default function SystemPage() {
  const { user } = useAuth();
  const on = canSystem(user?.role);
  const toast = useToast();
  const q = useSystemStatus(on);
  const m = useAdminMutations();
  const [cat, setCat] = useState<Cat>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [cleaning, setCleaning] = useState<"clean_temp" | "clean_logs" | null>(null);
  const [deletingFile, setDeletingFile] = useState<StoredFile | null>(null);

  // Typing in the file search only asks the server once the person pauses.
  const searchTerm = useDebounced(search.trim(), 300);
  const files = useQuery({
    queryKey: ["admin", "files", cat, searchTerm, page],
    queryFn: () => api<{ data: StoredFile[]; pagination: { page: number; pages: number; total: number } }>("system/storage/files", { query: { category: cat, search: searchTerm || undefined, page: String(page), limit: "25" } }),
    enabled: on,
    placeholderData: (p) => p,
  });

  if (!on)
    return (
      <Card>
        <EmptyState title="Only Admin, Owner and IT can see server details" />
      </Card>
    );
  const d = q.data;
  const b = d?.storage.breakdown ?? {};

  return (
    <div className="space-y-6">
      <PageHeader
        title="Server & storage"
        description={d ? `Checked ${new Date(d.server.serverTime).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })} · refreshes every minute` : "Health of the server, database and uploaded files"}
        actions={
          <Button variant="secondary" loading={q.isFetching} onClick={() => q.refetch()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />
      {q.isError ? (
        <Card>
          <ErrorState error={q.error} message="Server status couldn’t be loaded." onRetry={() => q.refetch()} />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader icon={Server} title="Server" />
            {!d ? (
              <Skeleton className="m-5 h-32" />
            ) : (
              <div className="space-y-2.5 p-5 text-[13px]">
                <StatRow label="Status" value={d.server.status} tone="muted" />
                <StatRow label="Environment" value={d.server.environment} tone="muted" />
                <StatRow label="Running for" value={d.server.uptimeFormatted} tone="muted" />
                <StatRow label="Node.js" value={d.server.nodeVersion} tone="muted" />
              </div>
            )}
          </Card>
          <Card>
            <CardHeader icon={Cpu} title="Capacity" />
            {!d ? (
              <Skeleton className="m-5 h-32" />
            ) : (
              <div className="space-y-2.5 p-5 text-[13px]">
                <StatRow label="CPU" value={`${d.cpu.cores} cores`} tone="muted" />
                <StatRow label="Load (1 / 5 / 15 min)" value={d.cpu.loadAverage.map((x) => x.toFixed(2)).join(" / ")} tone="muted" />
                {d.memory.systemUsedPercent != null && <StatRow label="System memory used" value={`${Math.round(d.memory.systemUsedPercent)}%`} tone="muted" />}
                {d.memory.rssFormatted && <StatRow label="Portal process memory" value={String(d.memory.rssFormatted)} tone="muted" />}
              </div>
            )}
          </Card>
          <Card>
            <CardHeader icon={Database} title="Database" />
            {!d ? (
              <Skeleton className="m-5 h-32" />
            ) : (
              <div className="space-y-2.5 p-5 text-[13px]">
                <StatRow label="Status" value={d.database.status} tone="muted" />
                <StatRow label="Response time" value={`${d.database.latencyMs} ms`} tone="muted" />
                {Object.entries(d.database.counts)
                  .slice(0, 5)
                  .map(([k, v]) => (
                    <StatRow key={k} label={k[0].toUpperCase() + k.slice(1)} value={formatNumber(v)} tone="muted" />
                  ))}
              </div>
            )}
          </Card>
        </div>
      )}

      <Card>
        <CardHeader
          icon={HardDrive}
          title="Uploaded files"
          description={d ? `${formatNumber(d.storage.totalFiles)} files · ${d.storage.totalFormatted}` : undefined}
          actions={
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setCleaning("clean_temp")} disabled={!b.temp?.count}>
                <Eraser className="h-4 w-4" /> Clear temporary{b.temp?.count ? ` (${b.temp.formatted})` : ""}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setCleaning("clean_logs")} disabled={!b.logs?.count}>
                <Eraser className="h-4 w-4" /> Old logs
              </Button>
            </div>
          }
        />
        <div className="flex flex-col gap-3 px-5 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <Segmented
            aria-label="Folder"
            value={cat}
            onChange={(v) => (setCat(v), setPage(1))}
            options={CATEGORIES.map((c) => ({ value: c.value, label: c.label, count: c.value !== "all" ? b[c.value]?.count || undefined : undefined }))}
          />
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
            <Input placeholder="File name" aria-label="Search files" value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} className="pl-9" />
          </div>
        </div>
        {files.isError ? (
          <ErrorState error={files.error} message="Files couldn’t be listed." onRetry={() => files.refetch()} />
        ) : files.isLoading ? (
          <Skeleton className="mx-5 mb-5 h-40" />
        ) : !files.data?.data.length ? (
          <EmptyState icon={FileText} title="No files here" className="py-8" />
        ) : (
          <>
            <ul className="divide-y divide-line border-t border-line">
              {files.data.data.map((f) => (
                <li key={f.relativePath} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px]">
                  <span className="min-w-0">
                    <FileLink path={f.url} className="block max-w-full truncate text-left font-medium text-ink hover:text-brand hover:underline">
                      {f.name}
                    </FileLink>
                    <span className="block truncate text-xs text-ink-subtle">{f.relativePath}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-right text-xs text-ink-subtle">
                      {f.sizeFormatted}
                      <br />
                      {formatDate(f.modifiedAt)}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setDeletingFile(f)} aria-label={`Delete ${f.name}`}>
                      <Trash2 className="h-3.5 w-3.5 text-danger" />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
            {files.data.pagination.pages > 1 && (
              <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[13px] text-ink-muted">
                <span>
                  Page {files.data.pagination.page} of {files.data.pagination.pages} · {formatNumber(files.data.pagination.total)} files
                </span>
                <span className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <Button variant="secondary" size="sm" disabled={page >= files.data.pagination.pages} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </Button>
                </span>
              </div>
            )}
          </>
        )}
      </Card>

      <ConfirmDialog
        open={!!cleaning}
        onClose={() => setCleaning(null)}
        tone="danger"
        title={cleaning === "clean_temp" ? "Clear temporary files?" : "Delete logs older than 30 days?"}
        description="Files are permanently removed from the server."
        confirmLabel="Clear"
        busy={m.cleanup.isPending}
        onConfirm={() =>
          cleaning &&
          m.cleanup.mutate(cleaning, {
            onSuccess: (r) => (toast.success(r.message || "Done"), setCleaning(null), void files.refetch()),
            onError: (e) => (toast.error("Clean-up failed", e instanceof ApiError ? e.message : undefined), setCleaning(null)),
          })
        }
      />

      <ConfirmDialog
        open={!!deletingFile}
        onClose={() => setDeletingFile(null)}
        tone="danger"
        title="Delete uploaded file?"
        description={deletingFile ? `Permanently delete "${deletingFile.name}" (${deletingFile.sizeFormatted}) from the server?` : ""}
        confirmLabel="Delete file"
        busy={m.deleteStorageFile.isPending}
        onConfirm={() =>
          deletingFile &&
          m.deleteStorageFile.mutate(
            { relativePath: deletingFile.relativePath, category: deletingFile.category },
            {
              onSuccess: () => (toast.success("File deleted"), setDeletingFile(null)),
              onError: (e) => (toast.error("Couldn’t delete file", e instanceof ApiError ? e.message : undefined), setDeletingFile(null)),
            },
          )
        }
      />
    </div>
  );
}
