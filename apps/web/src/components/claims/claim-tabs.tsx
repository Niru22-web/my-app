"use client";

import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Segmented } from "@/components/ui/segmented";
import { canSeeTeamClaims } from "./api";

export function ClaimTabs() {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  if (!canSeeTeamClaims(user?.role)) return null;
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

export function downloadCsv(name: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob(["﻿" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
