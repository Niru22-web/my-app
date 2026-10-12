"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useLocalValue, writeLocal } from "@/lib/local-store";
import { cn } from "@/lib/cn";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { Splash } from "@/components/shell/splash";

const COLLAPSE_KEY = "asa-sidebar-collapsed";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const collapsed = useLocalValue(COLLAPSE_KEY) === "1";
  // The drawer is tied to the page it was opened on, so navigating closes it.
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const mobileOpen = drawerPath === pathname;

  useEffect(() => {
    if (status === "anonymous") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  if (status !== "authenticated") return <Splash />;

  return (
    <div className="min-h-screen bg-bg">
      <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onCloseMobile={() => setDrawerPath(null)} />
      <div className={cn("flex min-h-screen flex-col transition-[padding] duration-200", collapsed ? "lg:pl-[84px]" : "lg:pl-[264px]")}>
        <Topbar onToggleSidebar={() => writeLocal(COLLAPSE_KEY, collapsed ? "0" : "1")} onOpenMobile={() => setDrawerPath(pathname)} />
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
