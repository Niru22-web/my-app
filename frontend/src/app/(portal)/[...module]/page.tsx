import Link from "next/link";
import { Construction } from "lucide-react";

// Modules not yet moved to the new portal land here during the local build-out.
// This route is removed before go-live once every module is migrated.
export default async function PendingModule({ params }: PageProps<"/[...module]">) {
  const { module } = await params;
  const path = "/" + module.join("/");
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="max-w-md text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-brand">
          <Construction className="h-7 w-7" aria-hidden />
        </span>
        <h2 className="mt-4 font-display text-xl font-bold text-ink">This module is being moved to the new portal</h2>
        <p className="mt-2 text-sm text-ink-muted">
          <code className="rounded bg-surface-muted px-1.5 py-0.5 text-[13px]">{path}</code> will be available here in an upcoming
          build. The data behind it is unchanged.
        </p>
        <Link href="/dashboard" className="mt-6 inline-flex rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink hover:bg-brand-hover">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
