import Link from "next/link";
import { SearchX } from "lucide-react";

// Any portal URL that has no page of its own lands here (a typo, or an old bookmark with no redirect).
// Every link inside the portal points at a real page, so this only ever means "not found".
export default async function UnknownPage({ params }: PageProps<"/[...module]">) {
  const { module } = await params;
  const path = "/" + module.join("/");
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="max-w-md text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-brand">
          <SearchX className="h-7 w-7" aria-hidden />
        </span>
        <h2 className="mt-4 font-display text-xl font-bold text-ink">Page not found</h2>
        <p className="mt-2 text-sm text-ink-muted">
          There’s no page at <code className="rounded bg-surface-muted px-1.5 py-0.5 text-[13px]">{path}</code>. Check the
          address, or use the menu to find what you need.
        </p>
        <Link href="/dashboard" className="mt-6 inline-flex rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink hover:bg-brand-hover">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
