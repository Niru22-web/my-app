"use client";

import { Lock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { TabNav } from "@/components/ui/tab-nav";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { canUseAccounts } from "@/components/accounts/api";

const TABS = [
  { href: "/accounts/dashboard", label: "Overview" },
  { href: "/accounts/invoices", label: "Invoices" },
  { href: "/accounts/receipts", label: "Receipts" },
  { href: "/accounts/banking", label: "Bank & reconciliation" },
  { href: "/accounts/payroll", label: "Payroll" },
  { href: "/accounts/payables", label: "Payables" },
  { href: "/accounts/mis", label: "MIS" },
  { href: "/accounts/client-ledger", label: "Statements & ledgers" },
  { href: "/accounts/gst-reports", label: "GST & tax" },
  { href: "/accounts/finance-reports", label: "Revenue & expenses" },
  { href: "/accounts/currencies", label: "Currencies" },
  { href: "/accounts/audit-log", label: "Audit log" },
  { href: "/accounts/settings", label: "Billing entities" },
];

export default function AccountsLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!canUseAccounts(user))
    return (
      <Card>
        <EmptyState icon={Lock} title="Accounts & Finance is for the accounts team" description="Admins, owners, the accounts team and people given accounts access can open it. Ask an administrator if you need access." />
      </Card>
    );
  return (
    <div className="space-y-6">
      <TabNav label="Accounts sections" tabs={TABS} />
      {children}
    </div>
  );
}
