"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { canUseAccounts } from "@/components/accounts/api";

const TABS = [
  { href: "/accounts/dashboard", label: "Overview" },
  { href: "/accounts/invoices", label: "Invoices" },
  { href: "/accounts/receipts", label: "Receipts" },
  { href: "/accounts/client-ledger", label: "Client statements" },
  { href: "/accounts/gst-reports", label: "GST" },
  { href: "/accounts/finance-reports", label: "Revenue & expenses" },
  { href: "/accounts/settings", label: "Billing entities" },
];

export default function AccountsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  if (!canUseAccounts(user?.role))
    return (
      <Card>
        <EmptyState icon={Lock} title="Accounts & Finance is for the accounts team" description="Admin and accounts roles can open it. Ask an administrator if you need access." />
      </Card>
    );
  return (
    <div className="space-y-6">
      <nav aria-label="Accounts sections" className="-mx-1 flex gap-6 overflow-x-auto overflow-y-hidden border-b border-line px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn("-mb-px shrink-0 border-b-2 pb-3 text-sm font-semibold transition-colors", active ? "border-brand text-brand" : "border-transparent text-ink-muted hover:text-ink")}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
