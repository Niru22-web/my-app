"use client";

import { Suspense, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { TabNav } from "@/components/ui/tab-nav";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { NewBugProvider, useNewBug } from "@/components/bugs/new-bug-dialog";

const SECTIONS = new Set(["/bugs", "/bugs/list", "/bugs/activity"]);

export default function BugsLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <NewBugProvider>
        <Shell>{children}</Shell>
      </NewBugProvider>
    </Suspense>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const openNew = useNewBug();
  // A ticket's own page has its own header and back link.
  if (!SECTIONS.has(pathname)) return <>{children}</>;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Bug tracker"
        description="Report problems with the portal, suggest improvements and follow them to a fix."
        actions={
          <Button onClick={() => openNew()}>
            <Plus className="h-4 w-4" /> New ticket
          </Button>
        }
      />
      <TabNav
        label="Bug tracker sections"
        tabs={[
          { href: "/bugs", label: "Dashboard", active: pathname === "/bugs" },
          { href: "/bugs/list", label: "Tickets" },
          { href: "/bugs/activity", label: "Activity" },
        ]}
      />
      {children}
    </div>
  );
}
