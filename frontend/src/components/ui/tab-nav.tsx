"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export interface TabItem {
  href: string;
  label: string;
  /** Overrides the default "path equals or starts with href" match. */
  active?: boolean;
}

/** Section tabs under a page (My Portal, Management, Assets, Accounts…). Scrolls sideways on phones. */
export function TabNav({ label, tabs }: { label: string; tabs: TabItem[] }) {
  const pathname = usePathname();
  if (tabs.length < 2) return null;
  return (
    <nav aria-label={label} className="-mx-1 flex gap-6 overflow-x-auto overflow-y-hidden border-b border-line px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((t) => {
        const active = t.active ?? (pathname === t.href || pathname.startsWith(t.href + "/"));
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 pb-3 text-sm font-semibold transition-colors",
              active ? "border-brand text-brand" : "border-transparent text-ink-muted hover:border-line-strong hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
