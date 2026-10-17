"use client";

import { useState, type FormEvent } from "react";
import { FolderTree, MapPin, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/inputs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { canManageOps, useAssetMutations, useAssets, useCategories, useLocations, useTypes } from "@/components/assets/api";

type Kind = "categories" | "types" | "locations";

export default function SetupPage() {
  const { user } = useAuth();
  const toast = useToast();
  const ops = canManageOps(user?.role);
  const cats = useCategories();
  const types = useTypes();
  const locs = useLocations();
  const assets = useAssets();
  const m = useAssetMutations();
  const [removing, setRemoving] = useState<{ kind: Kind; id: string; name: string } | null>(null);

  const inUse = (field: "category" | "type" | "location", name: string) => (assets.data ?? []).some((a) => a[field] === name);
  const err = (t: string) => (e: unknown) => toast.error(t, e instanceof ApiError ? e.message : undefined);
  const add = (kind: Kind, body: Record<string, string>, label: string) => m.addMaster.mutateAsync({ kind, body }).then(
      () => (toast.success(`${label} added`), true),
      (e: unknown) => (err(`Couldn’t add the ${label.toLowerCase()}`)(e), false),
    );

  if (!ops)
    return (
      <Card>
        <EmptyState title="Only Admin, Owner, HR and IT can change asset setup" />
      </Card>
    );

  return (
    <div className="space-y-6">
      <PageHeader title="Setup" description="The lists people choose from when adding assets and requesting equipment" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader icon={FolderTree} title="Categories & types" description="e.g. Laptop → Dell Latitude, MacBook Pro" />
          {cats.isError || types.isError ? (
            <ErrorState message="Couldn’t load categories." onRetry={() => (cats.refetch(), types.refetch())} />
          ) : cats.isLoading || types.isLoading ? (
            <Skeleton className="m-5 h-40" />
          ) : (
            <div className="space-y-4 p-5">
              <AddRow placeholder="New category, e.g. Laptop" busy={m.addMaster.isPending} onAdd={(name) => add("categories", { name, category: "Hardware" }, "Category")} />
              {!cats.data?.length ? (
                <EmptyState title="No categories yet" className="py-6" />
              ) : (
                <ul className="divide-y divide-line rounded-2xl border border-line">
                  {cats.data.map((c) => {
                    const children = (types.data ?? []).filter((t) => t.assetCategoryId === c.id);
                    const blocked = children.length > 0 || inUse("category", c.name);
                    return (
                      <li key={c.id} className="p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-ink">{c.name}</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={blocked}
                            title={blocked ? "Remove its types and assets first" : undefined}
                            aria-label={`Delete ${c.name}`}
                            onClick={() => setRemoving({ kind: "categories", id: c.id, name: c.name })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {children.map((t) => (
                            <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-surface-muted py-1 pl-3 pr-1 text-xs text-ink">
                              {t.name}
                              <button
                                className="grid h-5 w-5 place-items-center rounded-full text-ink-subtle hover:bg-line hover:text-danger disabled:opacity-40 disabled:hover:bg-transparent"
                                disabled={inUse("type", t.name)}
                                title={inUse("type", t.name) ? "Assets use this type" : `Delete ${t.name}`}
                                aria-label={`Delete ${t.name}`}
                                onClick={() => setRemoving({ kind: "types", id: t.id, name: t.name })}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                          <AddType categoryId={c.id} busy={m.addMaster.isPending} onAdd={(name) => add("types", { name, categoryId: c.id }, "Type")} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader icon={MapPin} title="Locations" description="Offices and sites. Shared with employee records." />
          {locs.isError ? (
            <ErrorState error={locs.error} message="Couldn’t load locations." onRetry={() => locs.refetch()} />
          ) : locs.isLoading ? (
            <Skeleton className="m-5 h-32" />
          ) : (
            <div className="space-y-4 p-5">
              <AddRow placeholder="New location, e.g. Mumbai HO" busy={m.addMaster.isPending} onAdd={(name) => add("locations", { name }, "Location")} />
              {!locs.data?.length ? (
                <EmptyState title="No locations yet" className="py-6" />
              ) : (
                <ul className="divide-y divide-line rounded-2xl border border-line">
                  {locs.data.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <span className="text-sm text-ink">{l.name}</span>
                      <Button variant="ghost" size="sm" disabled={inUse("location", l.name)} title={inUse("location", l.name) ? "Assets are at this location" : undefined} aria-label={`Delete ${l.name}`} onClick={() => setRemoving({ kind: "locations", id: l.id, name: l.name })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        tone="danger"
        title={`Delete “${removing?.name}”?`}
        description={removing?.kind === "locations" ? "If employees are linked to this location, the server will refuse." : "It disappears from the lists. Existing records keep the text they were saved with."}
        confirmLabel="Delete"
        busy={m.deleteMaster.isPending}
        onConfirm={() =>
          removing &&
          m.deleteMaster.mutate(
            { kind: removing.kind, id: removing.id },
            { onSuccess: () => (toast.success("Deleted"), setRemoving(null)), onError: (e) => (err("Couldn’t delete")(e), setRemoving(null)) },
          )
        }
      />
    </div>
  );
}

function AddRow({ placeholder, onAdd, busy }: { placeholder: string; onAdd: (name: string) => Promise<boolean>; busy: boolean }) {
  const [name, setName] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) void onAdd(name.trim()).then((ok) => ok && setName(""));
  };
  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} aria-label={placeholder} maxLength={60} />
      <Button type="submit" variant="secondary" disabled={!name.trim()} loading={busy}>
        <Plus className="h-4 w-4" /> Add
      </Button>
    </form>
  );
}

function AddType({ categoryId, onAdd, busy }: { categoryId: string; onAdd: (name: string) => Promise<boolean>; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-3 py-1 text-xs font-medium text-brand hover:bg-brand-softer">
        <Plus className="h-3 w-3" /> Type
      </button>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) void onAdd(name.trim()).then((ok) => ok && (setName(""), setOpen(false)));
      }}
      className="flex items-center gap-1.5"
      data-category={categoryId}
    >
      <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Type name" aria-label="New type name" className="h-8 w-40 text-xs" maxLength={60} onKeyDown={(e) => e.key === "Escape" && setOpen(false)} />
      <Button type="submit" size="sm" disabled={!name.trim()} loading={busy}>
        Add
      </Button>
    </form>
  );
}
