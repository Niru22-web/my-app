"use client";

import { usePathname, useRouter } from "next/navigation";
import { Segmented } from "@/components/ui/segmented";
import { useClaimAccess } from "./api";

export function ClaimTabs() {
  const access = useClaimAccess();
  const pathname = usePathname();
  const router = useRouter();
  if (!access.data?.team) return null;
  return (
    <Segmented
      aria-label="Reimbursement view"
      value={pathname.endsWith("/team") ? "team" : "mine"}
      onChange={(v) => router.push(v === "team" ? "/portal/reimbursements/team" : "/portal/reimbursements")}
      options={[
        { value: "mine", label: "My claims" },
        { value: "team", label: "Team approvals" },
      ]}
    />
  );
}

/** Kept for existing imports; the helper lives in lib/csv. */
export { downloadCsv } from "@/lib/csv";
