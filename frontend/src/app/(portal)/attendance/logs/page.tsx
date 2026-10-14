"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useScopes } from "@/lib/scopes";

// Old "Team logs" address → the Team or Organization view the person can open.
export default function LegacyLogs() {
  const router = useRouter();
  const scopes = useScopes();
  useEffect(() => {
    if (scopes.data) router.replace(scopes.data.team ? "/attendance/team" : scopes.data.org ? "/attendance/org" : "/attendance/dashboard");
  }, [scopes.data, router]);
  return null;
}
