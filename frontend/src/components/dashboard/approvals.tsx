"use client";

import Link from "next/link";
import { ArrowUpRight, CalendarCheck, Headset, Laptop, ReceiptText, type LucideIcon } from "lucide-react";
import type { CombinedDashboard } from "@/lib/types";
import type { RoleInfo } from "@/lib/roles";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Tile {
  label: string;
  value: number;
  href: string;
  icon: LucideIcon;
  hint: string;
}

/** Work waiting on the user: approvals for approvers, their own open requests for everyone else. */
export function ApprovalsPanel({ data, loading, r }: { data?: CombinedDashboard; loading: boolean; r: RoleInfo }) {
  const p = data?.pendingApprovals;
  const tiles: Tile[] = [];

  if (r.isApprover || (p?.leaves ?? 0) > 0 || (p?.reimbursements ?? 0) > 0) {
    tiles.push({ label: "Leave requests", value: p?.leaves ?? 0, href: "/leave/team", icon: CalendarCheck, hint: "waiting for you" });
    tiles.push({ label: "Reimbursements", value: p?.reimbursements ?? 0, href: "/portal/reimbursements/team", icon: ReceiptText, hint: "waiting for you" });
  }
  if ((r.isAdmin || r.isOwner || r.isHR || r.isIT) && !r.isPartner) {
    tiles.push({ label: "Asset approvals", value: p?.assets ?? 0, href: "/admin/asset-management/dashboard", icon: Laptop, hint: "pending review" });
  } else {
    tiles.push({ label: "My asset requests", value: data?.myAssetRequests ?? 0, href: "/admin/asset-management/dashboard", icon: Laptop, hint: "in progress" });
  }
  if (r.isAdmin || r.isOwner || r.isIT) {
    tiles.push({ label: "Open tickets", value: p?.tickets ?? 0, href: "/help-desk", icon: Headset, hint: "in the support queue" });
  } else {
    tiles.push({ label: "My tickets", value: data?.myTickets ?? 0, href: "/help-desk", icon: Headset, hint: "not yet resolved" });
  }

  return (
    <Card>
      <CardHeader title={r.isApprover ? "Needs your attention" : "Your requests"} description={r.isApprover ? "Items waiting for a decision" : "Requests you’ve raised that are still open"} />
      <div className={cn("grid gap-3 p-5", tiles.length > 3 ? "sm:grid-cols-2 xl:grid-cols-4" : tiles.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.label}
              href={t.href}
              className="group flex items-center gap-3 rounded-xl border border-line bg-surface-muted p-4 transition-colors hover:border-brand/40 hover:bg-brand-softer"
            >
              <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", t.value > 0 ? "bg-brand text-brand-ink" : "bg-surface text-ink-subtle border border-line")}>
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-ink-muted">{t.label}</span>
                {loading ? (
                  <Skeleton className="mt-1 h-6 w-10" />
                ) : (
                  <span className="flex items-baseline gap-1.5">
                    <span className="font-display text-xl font-bold text-ink tabular">{formatNumber(t.value)}</span>
                    <span className="truncate text-[11px] text-ink-subtle">{t.hint}</span>
                  </span>
                )}
              </span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand" aria-hidden />
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
