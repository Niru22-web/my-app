"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, Clock, Lock, Palmtree, Search, Star, Users, X, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { useLocalValue, writeLocal } from "@/lib/local-store";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/inputs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { TIER_META, favKey, useReportCatalog, type Category, type CatalogReport, type Tier } from "@/components/reports/api";

const ICONS: Record<Category, LucideIcon> = { employee: Users, leave: Palmtree, attendance: CalendarCheck, time: Clock };

export default function ReportCatalogPage({ params }: { params: Promise<{ tier: string }> }) {
  const { tier: raw } = use(params);
  const tier = raw as Tier;
  const { user } = useAuth();
  const cat = useReportCatalog();
  const [q, setQ] = useState("");
  const favRaw = useLocalValue(favKey(user?.id));
  const favs = useMemo(() => {
    try {
      return new Set<string>(favRaw ? (JSON.parse(favRaw) as string[]) : []);
    } catch {
      return new Set<string>();
    }
  }, [favRaw]);
  if (!(raw in TIER_META)) notFound();
  const toggleFav = (id: string) => {
    const next = new Set(favs);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    writeLocal(favKey(user?.id), JSON.stringify([...next]));
  };

  if (cat.isLoading) return <Skeleton className="h-[420px]" />;
  if (cat.isError || !cat.data) return <Card><ErrorState error={cat.error} onRetry={() => cat.refetch()} /></Card>;
  if (!cat.data.access[tier])
    return (
      <Card>
        <EmptyState icon={Lock} title={`${TIER_META[tier].label} aren’t available to you`} description="An administrator can grant access in Administration → Users & Access." />
      </Card>
    );

  const needle = q.trim().toLowerCase();
  const reports = cat.data.reports.filter((r) => r.tiers.includes(tier) && (!needle || `${r.title} ${r.description}`.toLowerCase().includes(needle)));
  const starred = reports.filter((r) => favs.has(`${tier}:${r.key}`));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-ink">{TIER_META[tier].label}</h1>
          <p className="mt-1 text-sm text-ink-muted">{TIER_META[tier].blurb}</p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reports" className="pl-9 pr-9" aria-label="Search reports" />
          {q && (
            <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-ink-subtle hover:text-ink" aria-label="Clear search">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {starred.length > 0 && !needle && (
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <Star className="h-4 w-4 fill-current text-warning" aria-hidden /> Favourites
          </h2>
          <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-4">
            {starred.map((r) => (
              <ReportLink key={r.key} tier={tier} r={r} fav onFav={() => toggleFav(`${tier}:${r.key}`)} />
            ))}
          </div>
        </Card>
      )}

      {!reports.length ? (
        <Card><EmptyState icon={Search} title="No reports match your search" /></Card>
      ) : (
        <Card className="p-5 sm:p-7">
          <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2 xl:grid-cols-4">
            {cat.data.categories.map((c) => {
              const list = reports.filter((r) => r.category === c.key);
              if (!list.length) return null;
              const Icon = ICONS[c.key];
              return (
                <section key={c.key} aria-labelledby={`cat-${c.key}`}>
                  <h2 id={`cat-${c.key}`} className="mb-2 flex items-center gap-2 font-display text-[15px] font-semibold text-ink">
                    <Icon className="h-[18px] w-[18px] text-brand" aria-hidden /> {c.title}
                  </h2>
                  <div>
                    {list.map((r) => (
                      <ReportLink key={r.key} tier={tier} r={r} fav={favs.has(`${tier}:${r.key}`)} onFav={() => toggleFav(`${tier}:${r.key}`)} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

function ReportLink({ tier, r, fav, onFav }: { tier: Tier; r: CatalogReport; fav: boolean; onFav: () => void }) {
  return (
    <div className="group flex items-start gap-2 border-b border-dashed border-line py-3 last:border-0">
      <button
        type="button"
        onClick={onFav}
        aria-pressed={fav}
        aria-label={fav ? `Remove ${r.title} from favourites` : `Add ${r.title} to favourites`}
        className="mt-0.5 rounded p-0.5 text-ink-subtle hover:text-warning"
      >
        <Star className={cn("h-4 w-4", fav && "fill-current text-warning")} />
      </button>
      <Link href={`/reports/${tier}/${r.key}`} className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink group-hover:text-brand">{r.title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{r.description}</span>
      </Link>
    </div>
  );
}
