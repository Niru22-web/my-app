"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, FileCheck2, FileWarning, Pencil, Plus, Settings2, Users } from "lucide-react";
import { ApiError, downloadFile } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { FormRow, Input, Textarea } from "@/components/ui/inputs";
import { StatCard } from "@/components/ui/stat";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/empty-state";
import { FileLink } from "@/components/ui/protected-file";
import { useToast } from "@/components/ui/toast";
import { CHECK_LABEL, checkTone, useChecklist, useChecklistSummary, useDocMutations, useRequirements, type ChecklistItem, type DocRequirement, type SummaryRow } from "@/components/hr/api";

type Tab = "missing" | "awaiting" | "complete" | "all";

export default function DocumentsPage() {
  const q = useChecklistSummary();
  const [tab, setTab] = useState<Tab>("missing");
  const [search, setSearch] = useState("");
  const [person, setPerson] = useState<SummaryRow | null>(null);
  const [setup, setSetup] = useState(false);

  const all = useMemo(() => q.data?.rows ?? [], [q.data]);
  const complete = (r: SummaryRow) => r.mandatoryMissing === 0 && r.awaiting === 0;
  const rows = all.filter((r) => {
    if (tab === "missing" && r.mandatoryMissing === 0) return false;
    if (tab === "awaiting" && r.awaiting === 0) return false;
    if (tab === "complete" && !complete(r)) return false;
    const s = search.trim().toLowerCase();
    return !s || `${r.employee.name} ${r.employee.code} ${r.employee.department} ${r.missingNames.join(" ")}`.toLowerCase().includes(s);
  });

  const columns: Column<SummaryRow>[] = [
    {
      key: "name",
      header: "Employee",
      sortValue: (r) => r.employee.name,
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{r.employee.name}</p>
          <p className="truncate text-xs text-ink-subtle">
            {r.employee.code} · {r.employee.department ?? "—"}
          </p>
        </div>
      ),
    },
    {
      key: "missing",
      header: "Required, not received",
      align: "right",
      sortValue: (r) => r.mandatoryMissing,
      cell: (r) => <span className={cn("font-semibold tabular", r.mandatoryMissing ? "text-danger" : "text-ink-subtle")}>{r.mandatoryMissing}</span>,
    },
    { key: "awaiting", header: "To check", align: "right", sortValue: (r) => r.awaiting, cell: (r) => <span className={cn("tabular", r.awaiting ? "font-semibold text-brand" : "text-ink-subtle")}>{r.awaiting}</span> },
    { key: "verified", header: "Verified", align: "right", hideBelow: "sm", sortValue: (r) => r.verified, cell: (r) => <span className="tabular text-ink-muted">{r.verified}</span> },
    {
      key: "names",
      header: "Still needed",
      hideBelow: "lg",
      exportValue: (r) => r.missingNames.join("; "),
      cell: (r) => <span className="line-clamp-1 text-xs text-ink-muted">{r.missingNames.join(", ") || "—"}</span>,
    },
  ];

  if (q.error instanceof ApiError && q.error.status === 403)
    return (
      <div className="rounded-[var(--radius-card)] border border-line bg-surface">
        <ErrorState error={q.error} />
      </div>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employee documents"
        description="What HR needs from each person (PAN, Aadhaar, certificates…), what has been received and what is verified."
        actions={
          <Button variant="secondary" onClick={() => setSetup(true)}>
            <Settings2 className="h-4 w-4" /> Required documents
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Summary">
        <StatCard label="People" icon={Users} loading={q.isLoading} value={all.length} />
        <StatCard label="Missing required documents" icon={FileWarning} tone="danger" loading={q.isLoading} value={all.filter((r) => r.mandatoryMissing > 0).length} hint="people" />
        <StatCard label="Waiting to be checked" icon={FileCheck2} tone="brand" loading={q.isLoading} value={all.reduce((s, r) => s + r.awaiting, 0)} hint="documents" />
        <StatCard label="Complete" icon={CheckCircle2} tone="success" loading={q.isLoading} value={all.filter(complete).length} hint="people" />
      </section>

      <DataTable
        exportName="employee-documents"
        itemsLabel="people"
        rows={rows}
        columns={columns}
        rowKey={(r) => r.employee.id}
        rowLabel={(r) => `Open ${r.employee.name}’s documents`}
        loading={q.isLoading}
        error={q.isError}
        onRetry={() => q.refetch()}
        onRowClick={setPerson}
        initialSort={{ key: "missing", dir: "desc" }}
        filterTabs={[
          { key: "missing", label: "Missing required", count: all.filter((r) => r.mandatoryMissing > 0).length },
          { key: "awaiting", label: "To check", count: all.filter((r) => r.awaiting > 0).length },
          { key: "complete", label: "Complete", count: all.filter(complete).length },
          { key: "all", label: "All", count: all.length },
        ]}
        activeFilterTab={tab}
        onFilterTabChange={(k) => setTab(k as Tab)}
        searchable
        searchPlaceholder="Search name, code, document…"
        searchValue={search}
        onSearchChange={setSearch}
        empty={{ icon: FileCheck2, title: tab === "missing" ? "Nobody is missing required documents" : "No one here" }}
      />

      {person && <ChecklistDialog row={person} onClose={() => setPerson(null)} />}
      {setup && <RequirementsDialog onClose={() => setSetup(false)} />}
    </div>
  );
}

function ChecklistDialog({ row, onClose }: { row: SummaryRow; onClose: () => void }) {
  const toast = useToast();
  const q = useChecklist(row.employee.id);
  const m = useDocMutations();
  const [rejecting, setRejecting] = useState<ChecklistItem | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const set = (it: ChecklistItem, status: "VERIFIED" | "WAIVED" | "REJECTED" | null, n?: string) => {
    setBusy(it.requirement.id);
    m.setCheck.mutate(
      { employeeId: row.employee.id, requirementId: it.requirement.id, status, note: n },
      {
        onSuccess: () => (setRejecting(null), setNote("")),
        onError: (e) => toast.error("Couldn’t update", e instanceof ApiError ? e.message : undefined),
        onSettled: () => setBusy(null),
      },
    );
  };

  return (
    <Dialog open onClose={onClose} size="lg" title={`${row.employee.name} · documents`} description={`${row.employee.code} · ${row.employee.designation ?? ""}`} footer={<Button onClick={onClose}>Done</Button>}>
      {q.isLoading ? (
        <Skeleton className="h-48" />
      ) : q.isError || !q.data ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <ul className="divide-y divide-line">
          {q.data.items.map((it) => (
            <li key={it.requirement.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {it.requirement.name}
                  {it.requirement.mandatory && <span className="ml-1 text-danger">*</span>}
                </p>
                <p className="text-xs text-ink-subtle">
                  {it.document ? (
                    <button type="button" className="text-brand hover:underline" onClick={() => downloadFile(`employees/documents/${it.document!.id}/download`, it.document!.title).catch(() => toast.error("Couldn’t open the file"))}>
                      {it.document.title}
                    </button>
                  ) : it.profileFile ? (
                    <FileLink path={it.profileFile} className="text-brand hover:underline">
                      File on profile
                    </FileLink>
                  ) : (
                    "Not uploaded yet"
                  )}
                  {it.document?.uploadedAt ? ` · ${formatDate(it.document.uploadedAt)}` : ""}
                  {it.note ? ` · “${it.note}”` : ""}
                  {it.checkedBy ? ` · ${it.checkedBy}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Badge tone={checkTone(it.status)}>{CHECK_LABEL[it.status]}</Badge>
                {q.data.canVerify && (
                  <>
                    {it.status !== "VERIFIED" && (it.document || it.profileFile) && (
                      <Button size="sm" variant="secondary" loading={busy === it.requirement.id} onClick={() => set(it, "VERIFIED")}>
                        Verify
                      </Button>
                    )}
                    {it.status !== "WAIVED" && !it.requirement.mandatory && (
                      <Button size="sm" variant="ghost" onClick={() => set(it, "WAIVED")}>
                        Not needed
                      </Button>
                    )}
                    {(it.document || it.profileFile) && it.status !== "REJECTED" && (
                      <Button size="sm" variant="ghost" className="text-danger" onClick={() => setRejecting(it)}>
                        Send back
                      </Button>
                    )}
                    {["VERIFIED", "WAIVED", "REJECTED"].includes(it.status) && (
                      <Button size="sm" variant="ghost" onClick={() => set(it, null)}>
                        Undo
                      </Button>
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {rejecting && (
        <div className="mt-3 space-y-2 rounded-xl border border-line p-3">
          <FormRow label={`What’s wrong with the ${rejecting.requirement.name}? (they will be told)`} htmlFor="doc-note" required>
            <Textarea id="doc-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          </FormRow>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button size="sm" variant="danger" disabled={!note.trim()} loading={busy === rejecting.requirement.id} onClick={() => set(rejecting, "REJECTED", note.trim())}>
              Send back
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function RequirementsDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const q = useRequirements(true);
  const m = useDocMutations();
  const [editing, setEditing] = useState<Partial<DocRequirement> | null>(null);

  async function save() {
    if (!editing?.name?.trim() || !editing.category?.trim()) return toast.error("Name and category are required");
    try {
      await m.saveReq.mutateAsync({ id: editing.id, body: { name: editing.name.trim(), category: editing.category.trim(), description: editing.description ?? null, mandatory: editing.mandatory ?? true, isActive: editing.isActive ?? true } });
      setEditing(null);
      toast.success("Saved");
    } catch (e) {
      toast.error("Couldn’t save", e instanceof ApiError ? e.message : undefined);
    }
  }

  return (
    <Dialog open onClose={onClose} size="lg" title="Required documents" description="The checklist every employee is measured against. The category must match the category used when the document is uploaded." footer={<Button onClick={onClose}>Done</Button>}>
      {q.isLoading ? (
        <Skeleton className="h-40" />
      ) : (
        <ul className="divide-y divide-line">
          {(q.data ?? []).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className={cn(!r.isActive && "opacity-50")}>
                <span className="font-medium text-ink">{r.name}</span>
                <span className="ml-2 text-xs text-ink-subtle">
                  {r.category} · {r.mandatory ? "required" : "optional"}
                  {!r.isActive ? " · switched off" : ""}
                </span>
              </span>
              <span className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing(r)} aria-label={`Edit ${r.name}`}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <div className="mt-3 grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2">
          <FormRow label="Document" htmlFor="rq-name" required>
            <Input id="rq-name" value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </FormRow>
          <FormRow label="Category (as uploaded)" htmlFor="rq-cat" required>
            <Input id="rq-cat" value={editing.category ?? ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} />
          </FormRow>
          <FormRow label="Note" htmlFor="rq-desc" className="sm:col-span-2">
            <Textarea id="rq-desc" rows={2} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
          </FormRow>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[#003887]" checked={editing.mandatory ?? true} onChange={(e) => setEditing({ ...editing, mandatory: e.target.checked })} /> Required
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[#003887]" checked={editing.isActive ?? true} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} /> In use
          </label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} loading={m.saveReq.isPending}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => setEditing({ mandatory: true, isActive: true })}>
          <Plus className="h-4 w-4" /> Add a document
        </Button>
      )}
    </Dialog>
  );
}
