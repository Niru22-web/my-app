"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Coins, History, Percent, Trash2, TrendingUp, Upload, Users } from "lucide-react";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/inputs";
import { Segmented } from "@/components/ui/segmented";
import { StatCard } from "@/components/ui/stat";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useMisMutations, useMisSnapshot, useMisSnapshots, useVerticalMis, type CostSource } from "@/components/accounts/mis-api";
import { inr, monthsBetween, MonthRange, pct } from "@/components/accounts/mis-parts";

export default function VerticalMisPage() {
  const [mode, setMode] = useState<"live" | "history">("live");
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-[13px] text-ink-muted">
          {mode === "live"
            ? "Revenue (issued invoices, excluding GST) against people cost allocated by timesheet hours, by vertical head, client and service. Set vertical heads and services under Cost allocation → Client & project mapping."
            : "Earlier years from the ASA MIS workbooks: upload the mis_data.json written by the MIS vertical-MIS script to view it here (instead of the password-protected site)."}
        </p>
        <Segmented aria-label="Mode" value={mode} onChange={setMode} options={[{ value: "live", label: "Live" }, { value: "history", label: "Historical years" }]} />
      </div>
      {mode === "live" ? <Live /> : <Historical />}
    </div>
  );
}

const lastMonths = (n: number) => {
  const out: string[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(Date.UTC(d.getFullYear(), d.getMonth() - i, 1));
    out.push(x.toISOString().slice(0, 7));
  }
  return out;
};

type GroupBy = "verticalHead" | "reportingClient" | "serviceCategory";
const LABEL: Record<GroupBy, string> = { verticalHead: "Vertical head", reportingClient: "Client", serviceCategory: "Service category" };

function Live() {
  const months = useMemo(() => lastMonths(24), []);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const onRange = useCallback((f: string, t: string) => (setFrom(f), setTo(t)), []);
  const [source, setSource] = useState<CostSource>("payroll");
  const [by, setBy] = useState<GroupBy>("verticalHead");
  const [head, setHead] = useState<string | null>(null);
  const chosen = useMemo(() => (from && to ? monthsBetween(months, from, to) : []), [months, from, to]);
  const q = useVerticalMis(source, chosen);

  const rows = useMemo(() => (q.data?.rows ?? []).filter((r) => !head || r.verticalHead === head), [q.data, head]);
  const groups = useMemo(() => {
    const acc = new Map<string, { key: string; revenue: number; cost: number; hours: number; partner: string | null }>();
    for (const r of rows) {
      const key = r[by];
      const cur = acc.get(key) ?? { key, revenue: 0, cost: 0, hours: 0, partner: r.partner };
      cur.revenue += r.revenue;
      cur.cost += r.cost;
      cur.hours += r.hours;
      acc.set(key, cur);
    }
    return [...acc.values()];
  }, [rows, by]);
  const t = groups.reduce((a, g) => ({ revenue: a.revenue + g.revenue, cost: a.cost + g.cost }), { revenue: 0, cost: 0 });

  const columns: Column<(typeof groups)[number]>[] = [
    {
      key: "key",
      header: LABEL[by],
      sortValue: (g) => g.key,
      cell: (g) =>
        by === "verticalHead" && !head ? (
          <button className="font-medium text-brand hover:underline" onClick={() => (setHead(g.key), setBy("reportingClient"))}>{g.key}</button>
        ) : (
          <span className={g.key === "Unassigned" ? "text-ink-subtle" : "font-medium text-ink"}>{g.key}</span>
        ),
    },
    { key: "rev", header: "Revenue", align: "right", sortValue: (g) => g.revenue, cell: (g) => <span className="tabular text-ink">{inr(g.revenue)}</span> },
    { key: "cost", header: "People cost", align: "right", sortValue: (g) => g.cost, cell: (g) => <span className="tabular text-ink-muted">{inr(g.cost)}</span> },
    { key: "contrib", header: "Contribution", align: "right", sortValue: (g) => g.revenue - g.cost, cell: (g) => <span className={`font-semibold tabular ${g.revenue - g.cost < 0 ? "text-danger" : "text-ink"}`}>{inr(g.revenue - g.cost)}</span> },
    { key: "margin", header: "Margin", align: "right", hideBelow: "sm", sortValue: (g) => (g.revenue ? (g.revenue - g.cost) / g.revenue : -1), cell: (g) => <span className="tabular text-ink-muted">{pct(g.revenue - g.cost, g.revenue)}</span> },
    { key: "hours", header: "Hours", align: "right", hideBelow: "md", sortValue: (g) => g.hours, cell: (g) => <span className="tabular text-ink-subtle">{Math.round(g.hours).toLocaleString("en-IN")}</span> },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <MonthRange months={months} from={from} to={to} onChange={onRange} />
        <Segmented aria-label="Cost source" value={source} onChange={setSource} options={[{ value: "payroll", label: "Payroll cost" }, { value: "tally", label: "Tally cost" }]} />
        <Select aria-label="Group by" value={by} onChange={(e) => setBy(e.target.value as GroupBy)} className="ml-auto w-44">
          {(Object.keys(LABEL) as GroupBy[]).map((k) => (
            <option key={k} value={k}>By {LABEL[k].toLowerCase()}</option>
          ))}
        </Select>
        {head && <Button variant="secondary" size="sm" onClick={() => (setHead(null), setBy("verticalHead"))}>All heads ✕ {head}</Button>}
      </div>
      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Totals">
        <StatCard label="Revenue" icon={TrendingUp} tone="brand" loading={q.isLoading} value={inr(t.revenue)} hint={head ?? "All vertical heads"} />
        <StatCard label="People cost" icon={Users} loading={q.isLoading} value={inr(t.cost)} hint={q.data?.unallocatedCost ? `${inr(q.data.unallocatedCost)} not allocated` : undefined} />
        <StatCard label="Contribution" icon={Coins} tone={t.revenue - t.cost < 0 ? "danger" : "success"} loading={q.isLoading} value={inr(t.revenue - t.cost)} />
        <StatCard label="Margin" icon={Percent} loading={q.isLoading} value={pct(t.revenue - t.cost, t.revenue)} />
      </section>
      {q.isError ? (
        <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>
      ) : (
        <DataTable itemsLabel="rows" exportName={`vertical-mis-${by}`} rows={groups} columns={columns} rowKey={(g) => g.key} loading={q.isLoading} initialSort={{ key: "rev", dir: "desc" }} searchable empty={{ icon: TrendingUp, title: "No revenue or cost in this period" }} />
      )}
    </>
  );
}

// ── Historical snapshots (ASA MIS mis_data.json) ────────────────────────────

const COST_LINES = ["consultants", "employee", "partner", "ope", "directOH", "occupancy", "corporate", "indirect", "mgmt", "provision"] as const;

interface SnapRow {
  y: number;
  h: string;
  c: string;
  g: string;
  s: string;
  ep: string;
  a: Record<string, number>;
}

function Historical() {
  const list = useMisSnapshots();
  const m = useMisMutations();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const id = chosen ?? list.data?.[0]?.id ?? null;
  const snap = useMisSnapshot(id);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        {(list.data ?? []).length > 0 && (
          <Select aria-label="Snapshot" value={id ?? ""} onChange={(e) => setChosen(e.target.value)} className="w-72">
            {(list.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.label} · {formatDate(s.uploadedAt)}</option>
            ))}
          </Select>
        )}
        <Button size="sm" variant="secondary" loading={m.uploadSnapshot.isPending} onClick={() => input.current?.click()}>
          <Upload className="h-4 w-4" /> Upload mis_data.json
        </Button>
        {id && (
          <Button size="sm" variant="ghost" onClick={() => setDeleting(id)} aria-label="Delete snapshot">
            <Trash2 className="h-4 w-4 text-danger" />
          </Button>
        )}
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file)
              m.uploadSnapshot.mutate(
                { file },
                { onSuccess: (s) => (toast.success("Snapshot uploaded"), setChosen((s as { id: string }).id)), onError: (err) => toast.error("Couldn’t upload", err instanceof Error ? err.message : undefined) },
              );
          }}
        />
      </div>
      {list.isLoading || (id && snap.isLoading) ? (
        <Skeleton className="h-72" />
      ) : !id ? (
        <Card><EmptyState icon={History} title="No historical data uploaded" description="Run the ASA MIS vertical-MIS script (etl/vertical_mis_etl.py) and upload the mis_data.json it writes." /></Card>
      ) : snap.isError || !snap.data ? (
        <Card><ErrorState error={snap.error} onRetry={() => snap.refetch()} /></Card>
      ) : (
        <SnapshotView data={snap.data.data} />
      )}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        tone="danger"
        title="Delete this snapshot?"
        confirmLabel="Delete"
        busy={m.deleteSnapshot.isPending}
        description="The uploaded historical data is removed from the portal. You can upload it again."
        onConfirm={() => deleting && m.deleteSnapshot.mutate(deleting, { onSuccess: () => (toast.success("Snapshot deleted"), setChosen(null), setDeleting(null)), onError: (e) => toast.error("Couldn’t delete", e instanceof ApiError ? e.message : undefined) })}
      />
    </>
  );
}

function SnapshotView({ data }: { data: Record<string, unknown> }) {
  const years = (data.years as { fy: string; period?: string }[]) ?? [];
  const rows = (data.rows as SnapRow[]) ?? [];
  const [y, setY] = useState(years.length - 1);
  const [head, setHead] = useState<string | null>(null);
  const yearRows = rows.filter((r) => r.y === y && (!head || r.h === head));
  const groups = useMemo(() => {
    const acc = new Map<string, { key: string; revenue: number; employee: number; other: number; net: number }>();
    for (const r of yearRows) {
      const key = head ? `${r.c}${r.s ? ` · ${r.s}` : ""}` : r.h || "Unassigned";
      const cur = acc.get(key) ?? { key, revenue: 0, employee: 0, other: 0, net: 0 };
      const a = r.a ?? {};
      cur.revenue += a.revenue ?? 0;
      cur.employee += a.employee ?? 0;
      cur.other += COST_LINES.filter((l) => l !== "employee").reduce((s, l) => s + (a[l] ?? 0), 0);
      cur.net += a.netProfit ?? (a.revenue ?? 0) - COST_LINES.reduce((s, l) => s + (a[l] ?? 0), 0);
      acc.set(key, cur);
    }
    return [...acc.values()];
  }, [yearRows, head]);
  const t = groups.reduce((a, g) => ({ revenue: a.revenue + g.revenue, net: a.net + g.net }), { revenue: 0, net: 0 });

  const columns: Column<(typeof groups)[number]>[] = [
    {
      key: "key",
      header: head ? "Client · service" : "Vertical head",
      sortValue: (g) => g.key,
      cell: (g) => (head ? <span className="text-ink">{g.key}</span> : <button className="font-medium text-brand hover:underline" onClick={() => setHead(g.key)}>{g.key}</button>),
    },
    { key: "rev", header: "Revenue", align: "right", sortValue: (g) => g.revenue, cell: (g) => <span className="tabular text-ink">{inr(g.revenue)}</span> },
    { key: "emp", header: "Employee cost", align: "right", hideBelow: "sm", sortValue: (g) => g.employee, cell: (g) => <span className="tabular text-ink-muted">{inr(g.employee)}</span> },
    { key: "oth", header: "Other costs", align: "right", hideBelow: "md", sortValue: (g) => g.other, cell: (g) => <span className="tabular text-ink-muted">{inr(g.other)}</span> },
    { key: "net", header: "Net profit", align: "right", sortValue: (g) => g.net, cell: (g) => <span className={`font-semibold tabular ${g.net < 0 ? "text-danger" : "text-ink"}`}>{inr(g.net)}</span> },
    { key: "m", header: "Margin", align: "right", hideBelow: "sm", sortValue: (g) => (g.revenue ? g.net / g.revenue : -1), cell: (g) => <span className="tabular text-ink-subtle">{pct(g.net, g.revenue)}</span> },
  ];

  if (!years.length) return <Card><EmptyState title="This snapshot has no years" /></Card>;
  return (
    <Card>
      <CardHeader
        icon={History}
        title={`FY ${years[y]?.fy}${head ? ` · ${head}` : ""}`}
        description={years[y]?.period}
        actions={
          <div className="flex items-center gap-2">
            {head && <Button variant="secondary" size="sm" onClick={() => setHead(null)}>All heads</Button>}
            <Segmented aria-label="Year" value={String(y)} onChange={(v) => (setY(Number(v)), setHead(null))} options={years.map((yy, i) => ({ value: String(i), label: yy.fy }))} />
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-3 px-5 pt-4 sm:grid-cols-3">
        <StatCard label="Revenue" icon={TrendingUp} tone="brand" value={inr(t.revenue)} />
        <StatCard label="Net profit" icon={Coins} tone={t.net < 0 ? "danger" : "success"} value={inr(t.net)} />
        <StatCard label="Margin" icon={Percent} value={pct(t.net, t.revenue)} />
      </div>
      <div className="p-3">
        <DataTable itemsLabel="rows" exportName={`vertical-mis-${years[y]?.fy}`} rows={groups} columns={columns} rowKey={(g) => g.key} initialSort={{ key: "rev", dir: "desc" }} searchable />
      </div>
    </Card>
  );
}
