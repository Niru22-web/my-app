"use client";

import { useMemo, useRef, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Link2, Tags, Trash2, Upload, XCircle } from "lucide-react";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/inputs";
import { Segmented } from "@/components/ui/segmented";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ErrorState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { fullName, usePeople } from "@/components/management/api";
import { useEntities } from "@/components/accounts/api";
import { HEADS, PARTY_CATEGORIES, useGroupHeads, useMisMutations, useTallyParties, useTallyStatus, type GroupHead, type RegisterResult, type TallyLoadLog, type TallyParty } from "@/components/accounts/mis-api";
import { inr } from "@/components/accounts/mis-parts";

const errMsg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : undefined);

export default function TallyImportPage() {
  const [view, setView] = useState<"import" | "heads" | "parties">("import");
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-[13px] text-ink-muted">
          Upload each firm’s Tally voucher registers (columnar exports, .xlsx) and its Ledger Masters. Every register is checked against Tally’s own Grand Total; re-uploading a register replaces it.
        </p>
        <Segmented aria-label="Section" value={view} onChange={setView} options={[{ value: "import", label: "Imports" }, { value: "heads", label: "Group heads" }, { value: "parties", label: "Parties" }]} />
      </div>
      {view === "import" ? <Imports /> : view === "heads" ? <Heads /> : <Parties />}
    </div>
  );
}

function Imports() {
  const status = useTallyStatus();
  const entities = useEntities();
  const m = useMisMutations();
  const toast = useToast();
  const [entityId, setEntityId] = useState("");
  const [results, setResults] = useState<RegisterResult[] | null>(null);
  const [removing, setRemoving] = useState<TallyLoadLog | null>(null);
  const regInput = useRef<HTMLInputElement>(null);
  const ledInput = useRef<HTMLInputElement>(null);

  const columns: Column<TallyLoadLog>[] = [
    { key: "firm", header: "Firm", sortValue: (l) => l.entity.name, cell: (l) => <span className="text-ink">{l.entity.name}</span> },
    { key: "reg", header: "Register", sortValue: (l) => l.register, cell: (l) => <span className="font-medium text-ink">{l.register}</span> },
    { key: "rows", header: "Rows", align: "right", sortValue: (l) => l.rows, cell: (l) => <span className="tabular text-ink-muted">{l.rows.toLocaleString("en-IN")}{l.vouchers ? ` · ${l.vouchers} vouchers` : ""}</span> },
    {
      key: "check",
      header: "Grand Total check",
      sortValue: (l) => Math.abs(l.difference),
      cell: (l) =>
        l.register === "Ledger Masters" ? (
          <span className="text-ink-subtle">—</span>
        ) : Math.abs(l.difference) < 0.01 ? (
          <Badge tone="success">Ties</Badge>
        ) : (
          <span title={`Tally ${l.tallyGrandTotal} · imported ${l.outputTotal}`}><Badge tone="danger">Off by {inr(l.difference)}</Badge></span>
        ),
    },
    { key: "when", header: "Loaded", hideBelow: "md", sortValue: (l) => l.loadedAt, cell: (l) => <span className="text-ink-subtle">{formatDate(l.loadedAt)}</span> },
    { key: "act", header: "", align: "right", cell: (l) => <Button variant="ghost" size="sm" onClick={() => setRemoving(l)} aria-label={`Remove ${l.register}`}><Trash2 className="h-3.5 w-3.5 text-danger" /></Button> },
  ];

  const loaded = (status.data?.entities ?? []).filter((e) => e.voucherRows || e.ledgers);

  return (
    <>
      <Card>
        <CardHeader icon={Upload} title="Upload" description="Choose the firm, then the files. Several registers can go in one upload." />
        <div className="flex flex-wrap items-center gap-3 px-5 pb-5">
          <Select aria-label="Firm" value={entityId} onChange={(e) => setEntityId(e.target.value)} className="w-56">
            <option value="">Choose a firm…</option>
            {(entities.data ?? []).map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </Select>
          <Button size="sm" disabled={!entityId} loading={m.importRegisters.isPending} onClick={() => regInput.current?.click()}>
            <FileSpreadsheet className="h-4 w-4" /> Voucher registers
          </Button>
          <Button size="sm" variant="secondary" loading={m.importLedgers.isPending} onClick={() => ledInput.current?.click()}>
            <FileSpreadsheet className="h-4 w-4" /> Ledger Masters
          </Button>
          <span className="text-xs text-ink-subtle">Ledger Masters with a “Firm Name” column can cover all firms at once.</span>
          <input
            ref={regInput}
            type="file"
            multiple
            accept=".xlsx,.xlsm,.xls"
            hidden
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              if (files.length)
                m.importRegisters.mutate(
                  { entityId, files },
                  {
                    onSuccess: (r) => {
                      const res = r as RegisterResult[];
                      setResults(res);
                      const bad = res.filter((x) => x.error || !x.ok).length;
                      if (bad) toast.info("Imported with problems", `${bad} of ${res.length} file${res.length === 1 ? "" : "s"} need a look.`);
                      else toast.success(`${res.length} register${res.length === 1 ? "" : "s"} imported`, "All tie to Tally’s Grand Total.");
                    },
                    onError: (err) => toast.error("Import failed", errMsg(err)),
                  },
                );
            }}
          />
          <input
            ref={ledInput}
            type="file"
            accept=".xlsx,.xlsm,.xls"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file)
                m.importLedgers.mutate(
                  { file, entityId: entityId || undefined },
                  {
                    onSuccess: (r) => {
                      const x = r as { summary: { entity: string; ledgers: number }[]; unmappedGroups: string[] };
                      toast.success("Ledger Masters imported", x.summary.map((s) => `${s.entity}: ${s.ledgers}`).join(" · ") + (x.unmappedGroups.length ? ` — ${x.unmappedGroups.length} new group(s) need a head.` : ""));
                    },
                    onError: (err) => toast.error("Import failed", errMsg(err)),
                  },
                );
            }}
          />
        </div>
        {results && (
          <ul className="divide-y divide-line border-t border-line px-5 py-1">
            {results.map((r) => (
              <li key={r.file} className="flex items-center gap-3 py-2 text-[13px]">
                {r.error || !r.ok ? <XCircle className="h-4 w-4 shrink-0 text-danger" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />}
                <span className="font-medium text-ink">{r.file}</span>
                <span className="text-ink-muted">
                  {r.error ?? `${r.vouchers} vouchers → ${r.rows} rows · ${r.ok ? "ties to Grand Total" : `differs from Tally’s Grand Total by ${inr(r.difference ?? 0)}`}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {loaded.length > 0 && (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Loaded per firm">
          {loaded.map((e) => (
            <Card key={e.id} className="p-4">
              <p className="font-semibold text-ink">{e.name}</p>
              <p className="mt-1 text-[13px] text-ink-muted">
                {e.voucherRows.toLocaleString("en-IN")} voucher rows · {e.ledgers.toLocaleString("en-IN")} ledgers
              </p>
              {e.from && <p className="text-xs text-ink-subtle">{formatDate(e.from)} – {e.to ? formatDate(e.to) : ""}</p>}
            </Card>
          ))}
        </section>
      )}

      {status.isError ? (
        <Card><ErrorState error={status.error} onRetry={() => status.refetch()} /></Card>
      ) : (
        <DataTable itemsLabel="imports" exportName="tally-imports" rows={status.data?.logs ?? []} columns={columns} rowKey={(l) => l.id} loading={status.isLoading} initialSort={{ key: "firm", dir: "asc" }} searchable empty={{ icon: FileSpreadsheet, title: "Nothing imported yet" }} />
      )}

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        tone="danger"
        title={`Remove ${removing?.register}?`}
        confirmLabel="Remove"
        busy={m.removeRegister.isPending}
        description={`Deletes the imported ${removing?.register === "Ledger Masters" ? "ledger list" : "voucher rows"} for ${removing?.entity.name}. Nothing in Tally changes; upload the file again to restore it.`}
        onConfirm={() => removing && m.removeRegister.mutate({ entityId: removing.entityId, register: removing.register }, { onSuccess: () => (toast.success("Removed"), setRemoving(null)), onError: (e) => toast.error("Couldn’t remove", errMsg(e)) })}
      />
    </>
  );
}

function Heads() {
  const q = useGroupHeads();
  const m = useMisMutations();
  const toast = useToast();
  const columns: Column<GroupHead>[] = [
    { key: "g", header: "Tally primary group", sortValue: (g) => g.primaryGroup, cell: (g) => <span className="font-medium text-ink">{g.primaryGroup}</span> },
    { key: "n", header: "Ledgers", align: "right", sortValue: (g) => g.ledgers, cell: (g) => <span className="tabular text-ink-muted">{g.ledgers}</span> },
    {
      key: "h",
      header: "P&L head",
      sortValue: (g) => g.head ?? "",
      cell: (g) => (
        <Select
          aria-label={`Head for ${g.primaryGroup}`}
          value={g.head ?? ""}
          onChange={(e) => m.setGroupHead.mutate({ primaryGroup: g.primaryGroup, head: e.target.value }, { onSuccess: () => toast.success(`${g.primaryGroup} → ${e.target.value}`), onError: (err) => toast.error("Couldn’t save", errMsg(err)) })}
          className="w-44"
        >
          <option value="" disabled>Not mapped</option>
          {HEADS.map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </Select>
      ),
    },
  ];
  if (q.isError) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  return (
    <DataTable
      itemsLabel="groups"
      exportName="tally-group-heads"
      rows={q.data ?? []}
      columns={columns}
      rowKey={(g) => g.primaryGroup}
      loading={q.isLoading}
      searchable
      filterTabs={[{ key: "all", label: "All groups", count: (q.data ?? []).length }]}
      empty={{ icon: Tags, title: "No groups yet" }}
    />
  );
}

function Parties() {
  const q = useTallyParties();
  const people = usePeople();
  const m = useMisMutations();
  const toast = useToast();
  const [filter, setFilter] = useState<"unlinked" | "all">("unlinked");
  const list = (people.data ?? []) as { id: string; firstName?: string; lastName?: string; employeeId?: string }[];
  const rows = useMemo(() => (q.data ?? []).filter((p) => filter === "all" || !p.link), [q.data, filter]);
  const save = (p: TallyParty, patch: { employeeId?: string | null; category?: string }) =>
    m.linkParty.mutate(
      { tallyName: p.tallyName, employeeId: patch.employeeId !== undefined ? patch.employeeId : p.link?.employeeId ?? null, category: patch.category ?? p.link?.category ?? "Employee" },
      { onSuccess: () => toast.success(`Saved ${p.tallyName}`), onError: (e) => toast.error("Couldn’t save", errMsg(e)) },
    );

  const columns: Column<TallyParty>[] = [
    { key: "n", header: "Tally party", sortValue: (p) => p.tallyName, cell: (p) => <span className="font-medium text-ink">{p.tallyName}</span> },
    { key: "e", header: "Expense", align: "right", sortValue: (p) => p.expense, cell: (p) => <span className="tabular text-ink-muted">{inr(p.expense)}</span> },
    {
      key: "c",
      header: "Category",
      sortValue: (p) => p.link?.category ?? "",
      cell: (p) => (
        <Select aria-label={`Category for ${p.tallyName}`} value={p.link?.category ?? ""} onChange={(e) => save(p, { category: e.target.value })} className="w-36">
          <option value="" disabled>Choose…</option>
          {PARTY_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
      ),
    },
    {
      key: "p",
      header: "Portal account",
      cell: (p) => (
        <Select aria-label={`Portal account for ${p.tallyName}`} value={p.link?.employeeId ?? ""} onChange={(e) => save(p, { employeeId: e.target.value || null })} className="w-56">
          <option value="">Not linked</option>
          {list.map((x) => (
            <option key={x.id} value={x.id}>{`${fullName(x)}${x.employeeId ? ` (${x.employeeId})` : ""}`}</option>
          ))}
        </Select>
      ),
    },
  ];
  if (q.isError) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  return (
    <>
      <p className="text-[13px] text-ink-muted">
        Parties on expense ledgers in Tally. Mark people and consultants and link them to their portal account so their Tally cost can be allocated by timesheet hours (Cost allocation → Tally).
      </p>
      <DataTable
        itemsLabel="parties"
        exportName="tally-parties"
        rows={rows}
        columns={columns}
        rowKey={(p) => p.tallyName}
        loading={q.isLoading}
        searchable
        searchPlaceholder="Search party"
        initialSort={{ key: "e", dir: "desc" }}
        filterTabs={[{ key: "unlinked", label: "Not categorised", count: (q.data ?? []).filter((p) => !p.link).length }, { key: "all", label: "All", count: (q.data ?? []).length }]}
        activeFilterTab={filter}
        onFilterTabChange={(v) => setFilter(v as typeof filter)}
        empty={{ icon: Link2, title: filter === "unlinked" ? "Every party is categorised" : "No expense parties yet" }}
      />
    </>
  );
}
