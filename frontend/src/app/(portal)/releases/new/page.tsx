"use client";

import { useAuth } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { canManageReleases, useReleases } from "@/components/releases/api";
import { nextVersion, ReleaseEditor } from "@/components/releases/release-editor";
import { NoAccess } from "@/components/releases/no-access";

export default function NewReleasePage() {
  const { user } = useAuth();
  const manager = canManageReleases(user?.role);
  const q = useReleases(manager);

  if (!manager) return <NoAccess />;
  if (q.isLoading) return <Skeleton className="h-96 w-full" />;
  return <ReleaseEditor suggestedVersion={nextVersion((q.data?.data ?? []).map((r) => r.version))} />;
}
