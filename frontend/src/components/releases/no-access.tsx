import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";

export function NoAccess() {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface">
      <EmptyState
        title="Only Admin, Owner and IT can write release notes"
        description="You can read every published release on the What’s new page."
        action={
          <Link href="/releases" className="text-[13px] font-semibold text-brand hover:underline">
            Go to What’s new
          </Link>
        }
      />
    </div>
  );
}
