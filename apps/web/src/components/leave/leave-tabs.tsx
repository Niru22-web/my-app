"use client";

import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Segmented } from "@/components/ui/segmented";
import { canApproveLeave } from "./api";

/** "My leave" / "Team approvals" switch, shown only to approvers. */
export function LeaveTabs({ pending }: { pending?: number }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  if (!canApproveLeave(user?.role)) return null;
  return (
    <Segmented
      aria-label="Leave view"
      value={pathname.endsWith("/team") ? "team" : "mine"}
      onChange={(v) => router.push(v === "team" ? "/portal/leaves/team" : "/portal/leaves")}
      options={[
        { value: "mine", label: "My leave" },
        { value: "team", label: "Team approvals", count: pending || undefined },
      ]}
    />
  );
}
