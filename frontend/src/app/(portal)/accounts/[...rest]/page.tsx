import Link from "next/link";
import { Construction } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

const LATER = [
  ["Bank import & reconciliation", "the current server ignores the uploaded statement and posts sample rows"],
  ["Payables & payments", "there is no payables model yet — “payments” were re-labelled expense claims"],
  ["Claims approval queue", "approving there fails part-way and leaves claims in a broken state"],
  ["Employee ledger & currency rates", "ledger balances mix currencies, and rates aren’t used by invoices"],
];

/** Accounts screens deliberately left in the current portal until the new server (Phase 3). */
export default function AccountsLater() {
  return (
    <Card>
      <EmptyState
        icon={Construction}
        title="This part of Accounts stays in the current portal for now"
        description={
          <span className="block text-left">
            These come with the new server, because the current one can’t do them correctly:
            <ul className="mt-3 list-disc space-y-1 pl-5">
              {LATER.map(([what, why]) => (
                <li key={what}>
                  <strong className="text-ink">{what}</strong> — {why}.
                </li>
              ))}
            </ul>
            <span className="mt-3 block">
              Expense claims are approved and paid from <Link href="/portal/reimbursements/team" className="font-semibold text-brand hover:underline">Reimbursements</Link>.
            </span>
          </span>
        }
      />
    </Card>
  );
}
