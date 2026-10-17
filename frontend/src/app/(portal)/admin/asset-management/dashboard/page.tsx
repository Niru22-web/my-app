"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Laptop, PackagePlus, ShieldAlert, UserCheck, Wrench } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { addDays, today, workDate } from "@/lib/dates";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { timeAgo } from "@/lib/notifications";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { assetStatus, canApproveRequests, personName, useAllRequests, useAllocations, useAssets, useMaintenance } from "@/components/assets/api";

export default function AssetOverview() {
  const { user } = useAuth();
  const approver = canApproveRequests(user?.role);
  const assets = useAssets();
  const allocs = useAllocations();
  const maint = useMaintenance();
  const reqs = useAllRequests(approver);
  const now = today();

  const s = useMemo(() => {
    const list = assets.data ?? [];
    const by = (st: string) => list.filter((a) => assetStatus(a.status) === st).length;
    const inUse = list.filter((a) => !["Retired", "Lost"].includes(assetStatus(a.status)));
    const horizon = addDays(now, 60);
    const expiring = inUse
      .filter((a) => a.warrantyExpiry && workDate(a.warrantyExpiry) >= now && workDate(a.warrantyExpiry) <= horizon)
      .sort((a, b) => (a.warrantyExpiry ?? "").localeCompare(b.warrantyExpiry ?? ""));
    const cats = new Map<string, number>();
    for (const a of inUse) cats.set(a.category, (cats.get(a.category) ?? 0) + 1);
    return {
      total: inUse.length,
      available: by("Available"),
      allocated: by("Allocated"),
      maintenance: by("Maintenance"),
      retired: by("Retired") + by("Lost"),
      value: inUse.reduce((t, a) => t + (a.purchaseCost ?? 0), 0),
      expiring,
      cats: [...cats.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [assets.data, now]);

  const pending = (reqs.data ?? []).filter((r) => r.status === "Pending" || r.status === "Approved");
  const recent = (allocs.data ?? []).slice(0, 6);
  const openMaint = (maint.data ?? []).filter((x) => x.status !== "Completed");
  const loading = assets.isLoading;

  if (assets.isError)
    return (
      <Card>
        <ErrorState error={assets.error} message="Asset data couldn’t be loaded." onRetry={() => assets.refetch()} />
      </Card>
    );

  return (
    <div className="space-y-6">
      <PageHeader title="Assets" description={s.value ? `${formatNumber(s.total)} assets in service · ${formatCurrency(s.value)} recorded purchase value` : "Equipment the firm owns and who has it"} />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Summary">
        <StatCard label="In service" icon={Laptop} tone="brand" loading={loading} value={formatNumber(s.total)} hint={s.retired ? `${s.retired} retired or lost` : undefined} />
        <StatCard label="With people" icon={UserCheck} loading={loading} value={formatNumber(s.allocated)} />
        <StatCard label="Available to assign" icon={CheckCircle2} loading={loading} value={formatNumber(s.available)} />
        <StatCard label="In maintenance" icon={Wrench} loading={loading} value={formatNumber(s.maintenance)} tone={s.maintenance ? "warning" : "neutral"} />
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader icon={ShieldAlert} title="Warranty ending soon" description="Within the next 60 days" />
          {loading ? (
            <Skeleton className="m-5 h-32" />
          ) : !s.expiring.length ? (
            <EmptyState icon={ShieldAlert} title="No warranties end in the next 60 days" className="py-8" />
          ) : (
            <ul className="divide-y divide-line px-5 pb-2">
              {s.expiring.slice(0, 8).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{a.assetName}</span>
                    <span className="block truncate text-xs text-ink-subtle">{a.serialNumber} · {assetStatus(a.status)}</span>
                  </span>
                  <span className="shrink-0 text-sm text-warning">{formatDate(a.warrantyExpiry!)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader icon={Laptop} title="By category" />
          {loading ? (
            <Skeleton className="m-5 h-32" />
          ) : !s.cats.length ? (
            <EmptyState title="No assets recorded yet" className="py-8" action={<Link href="/admin/asset-management/assets" className="text-sm font-semibold text-brand hover:underline">Go to inventory</Link>} />
          ) : (
            <ul className="space-y-3 p-5">
              {s.cats.slice(0, 8).map(([c, n]) => (
                <li key={c}>
                  <div className="flex justify-between text-[13px]">
                    <span className="truncate text-ink">{c}</span>
                    <span className="font-semibold tabular text-ink">{n}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(n / s.total) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {approver && (
          <Card>
            <CardHeader
              icon={PackagePlus}
              title="Requests to act on"
              actions={pending.length ? <Link href="/admin/asset-management/requests" className="text-[13px] font-semibold text-brand hover:underline">Review</Link> : undefined}
            />
            {reqs.isLoading ? (
              <Skeleton className="m-5 h-24" />
            ) : !pending.length ? (
              <EmptyState icon={PackagePlus} title="No open requests" className="py-8" />
            ) : (
              <ul className="divide-y divide-line px-5 pb-2">
                {pending.slice(0, 6).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-3 text-[13px]">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{r.title}</span>
                      <span className="block truncate text-xs text-ink-subtle">{personName(r.employee)} · {r.assetType}</span>
                    </span>
                    <span className="shrink-0 text-xs text-ink-subtle">{r.status === "Approved" ? "Approved — hand over" : timeAgo(r.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <Card>
          <CardHeader icon={UserCheck} title="Recent assignments" actions={recent.length ? <Link href="/admin/asset-management/assignment" className="text-[13px] font-semibold text-brand hover:underline">All</Link> : undefined} />
          {allocs.isLoading ? (
            <Skeleton className="m-5 h-24" />
          ) : !recent.length ? (
            <EmptyState icon={UserCheck} title="No assignments yet" className="py-8" />
          ) : (
            <ul className="divide-y divide-line px-5 pb-2">
              {recent.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-3 text-[13px]">
                  <span className="min-w-0">
                    <span className="block truncate text-ink">
                      <span className="font-medium">{a.inventory.assetName}</span> → {personName(a.employee)}
                    </span>
                    <span className="block text-xs text-ink-subtle">{a.status === "Returned" ? `Returned ${a.returnedAt ? formatDate(a.returnedAt) : ""}` : "With them"}</span>
                  </span>
                  <span className="shrink-0 text-xs text-ink-subtle">{timeAgo(a.allocatedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {!approver && (
          <Card>
            <CardHeader icon={AlertTriangle} title="Open maintenance" />
            {maint.isLoading ? (
              <Skeleton className="m-5 h-24" />
            ) : !openMaint.length ? (
              <EmptyState icon={Wrench} title="Nothing in maintenance" className="py-8" />
            ) : (
              <ul className="divide-y divide-line px-5 pb-2">
                {openMaint.slice(0, 6).map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-3 py-3 text-[13px]">
                    <span className="truncate text-ink">{x.inventory?.assetName} · {x.type}</span>
                    <span className="shrink-0 text-xs text-ink-subtle">{x.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
