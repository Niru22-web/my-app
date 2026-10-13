"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { TabNav } from "@/components/ui/tab-nav";
import { isCategoryAdmin } from "@/components/helpdesk/api";

export default function HelpDeskLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  return (
    <div className="space-y-6">
      <TabNav
        label="Help desk sections"
        tabs={[
          { href: "/help-desk", label: "Tickets", active: pathname === "/help-desk" || /^\/help-desk\/(?!categories)/.test(pathname) },
          ...(isCategoryAdmin(user?.role) ? [{ href: "/help-desk/categories", label: "Categories & routing" }] : []),
        ]}
      />
      {children}
    </div>
  );
}
