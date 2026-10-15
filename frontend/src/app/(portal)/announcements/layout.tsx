"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { TabNav } from "@/components/ui/tab-nav";
import { canManageAnnouncements } from "@/components/announcements/api";

export default function AnnouncementsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const manage = canManageAnnouncements(user?.role);
  return (
    <div className="space-y-6">
      {manage && (
        <TabNav
          label="Announcement sections"
          tabs={[
            { href: "/announcements", label: "Feed", active: pathname === "/announcements" },
            { href: "/announcements/manage", label: "Manage" },
            { href: "/announcements/wishes", label: "Wishes" },
          ]}
        />
      )}
      {children}
    </div>
  );
}
