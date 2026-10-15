import Link from "next/link";
import { SearchX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

/** Unknown address under Accounts. */
export default function AccountsNotFound() {
  return (
    <Card>
      <EmptyState
        icon={SearchX}
        title="This page doesn’t exist"
        description="The link may be old or mistyped."
        action={
          <Link href="/accounts/dashboard" className="text-sm font-semibold text-brand hover:underline">
            Go to the Accounts overview
          </Link>
        }
      />
    </Card>
  );
}
