"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { assetUrl } from "@/lib/api";
import { formatDate, formatNumber, formatTime } from "@/lib/format";
import { timeAgo } from "@/lib/notifications";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/inputs";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EnvChip } from "@/components/bugs/chips";
import { eventSentence, KIND_LABEL, useBugActivity, type BugEvent } from "@/components/bugs/api";

const LIMIT = 100;

export default function BugActivityPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState("");
  const [actor, setActor] = useState("");
  const q = useBugActivity({ page, limit: LIMIT, kind: kind || undefined, actor: actor || undefined });
  const rows = q.data?.data ?? [];
  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / LIMIT));

  const columns: Column<BugEvent>[] = [
    {
      key: "what",
      header: "What happened",
      cell: (e) => (
        <div className="flex min-w-0 items-start gap-3">
          <Avatar name={e.actor.name} src={assetUrl(e.actor.profileImage)} size={30} />
          <div className="min-w-0">
            <p className="text-sm text-ink">
              <span className="font-semibold">{e.actor.name}</span> <span className="text-ink-muted">{eventSentence(e, { withCode: true })}</span>
            </p>
            {e.bugTitle && <p className="truncate text-xs text-ink-subtle">{e.bugTitle}</p>}
          </div>
        </div>
      ),
    },
    { key: "kind", header: "Type", hideBelow: "md", sortValue: (e) => KIND_LABEL[e.kind] ?? e.kind, cell: (e) => <span className="whitespace-nowrap text-xs text-ink-muted">{KIND_LABEL[e.kind] ?? e.kind}</span> },
    { key: "env", header: "Environment", hideBelow: "lg", cell: (e) => (e.environment ? <EnvChip env={e.environment} /> : null) },
    {
      key: "when",
      header: "When",
      align: "right",
      sortValue: (e) => e.createdAt,
      cell: (e) => (
        <span className="whitespace-nowrap text-xs text-ink-muted" title={timeAgo(e.createdAt)}>
          {formatDate(e.createdAt)}
          <span className="block text-[11px] text-ink-subtle">{formatTime(e.createdAt)}</span>
        </span>
      ),
    },
  ];

  const filtered = !!kind || !!actor;
  return (
    <div className="space-y-3">
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(e) => e.id}
        loading={q.isLoading}
        error={q.isError}
        onRetry={() => q.refetch()}
        exportName={false}
        itemsLabel="changes on this page"
        pageSize={25}
        onRowClick={(e) => router.push(`/bugs/${e.bugId}`)}
        rowLabel={(e) => `Open ${e.bugCode ?? "ticket"}`}
        toolbarActions={
          <>
            <div className="w-48">
              <Select aria-label="Type of change" value={kind} onChange={(e) => (setKind(e.target.value), setPage(1))}>
                <option value="">Every change</option>
                {Object.entries(KIND_LABEL).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-52">
              <Select aria-label="Person" value={actor} onChange={(e) => (setActor(e.target.value), setPage(1))}>
                <option value="">Everyone</option>
                <option value="me">Me</option>
                {(q.data?.people ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          </>
        }
        empty={{ icon: History, title: filtered ? "No changes match these filters" : "No activity yet", description: filtered ? undefined : "Comments and changes on tickets appear here." }}
      />
      {total > LIMIT && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
          <span className="tabular">
            Showing {formatNumber((page - 1) * LIMIT + 1)}–{formatNumber(Math.min(page * LIMIT, total))} of {formatNumber(total)} changes
          </span>
          <span className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={page <= 1 || q.isFetching} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" /> Newer
            </Button>
            <Button size="sm" variant="secondary" disabled={page >= pages || q.isFetching} onClick={() => setPage((p) => p + 1)}>
              Older <ChevronRight className="h-4 w-4" />
            </Button>
          </span>
        </div>
      )}
    </div>
  );
}
