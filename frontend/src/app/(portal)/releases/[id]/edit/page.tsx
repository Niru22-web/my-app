"use client";

import { use } from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/empty-state";
import { canManageReleases, useRelease } from "@/components/releases/api";
import { ReleaseEditor } from "@/components/releases/release-editor";
import { NoAccess } from "@/components/releases/no-access";

export default function EditReleasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const manager = canManageReleases(user?.role);
  const q = useRelease(manager ? id : undefined);

  if (!manager) return <NoAccess />;
  if (q.isLoading) return <Skeleton className="h-96 w-full" />;
  if (q.isError || !q.data)
    return (
      <div className="rounded-[var(--radius-card)] border border-line bg-surface">
        <ErrorState error={q.error} message={q.error instanceof ApiError ? q.error.message : "This release couldn’t be loaded."} onRetry={() => q.refetch()} />
      </div>
    );
  return <ReleaseEditor key={q.data.id} release={q.data} />;
}
