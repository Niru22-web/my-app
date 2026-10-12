"use client";

import { Suspense, useMemo, useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ListTree, Pencil, Plus, Power, Search, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm";
import { FormRow, Input, Textarea } from "@/components/ui/inputs";
import { Segmented } from "@/components/ui/segmented";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { RowMenu } from "@/components/management/row-menu";
import { MASTERS, canEditMasters, useAdminMutations, useMasterList, type MasterItem, type MasterKind } from "@/components/admin/api";

export default function MastersPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Masters />
    </Suspense>
  );
}

function Masters() {
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const kind = (MASTERS.find((m) => m.kind === params.get("type"))?.kind ?? "roles") as MasterKind;
  const meta = MASTERS.find((m) => m.kind === kind)!;
  const edit = canEditMasters(user?.role);
  const q = useMasterList(kind);
  const m = useAdminMutations();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [editing, setEditing] = useState<MasterItem | null | undefined>(undefined);
  const [removing, setRemoving] = useState<MasterItem | null>(null);

  const rows = useMemo(
    () =>
      (q.data ?? []).filter(
        (x) =>
          (status === "all" || (status === "active") === x.isActive) &&
          (!search.trim() || `${x.name} ${x.code ?? ""} ${x.description ?? ""}`.toLowerCase().includes(search.trim().toLowerCase())),
      ),
    [q.data, status, search],
  );
  const err = (t: string) => (e: unknown) => toast.error(t, e instanceof ApiError ? e.message : undefined);

  const columns: Column<MasterItem>[] = [
    {
      key: "name",
      header: "Name",
      sortValue: (x) => x.name,
      cell: (x) => (
        <div className="min-w-0">
          <p className="font-medium text-ink">
            {x.name}
            {x.code && <span className="ml-2 rounded-md bg-surface-muted px-1.5 py-0.5 font-mono text-[11px] text-ink-muted">{x.code}</span>}
          </p>
          {x.description && <p className="line-clamp-1 max-w-md text-xs text-ink-subtle">{x.description}</p>}
        </div>
      ),
    },
    ...(kind === "shifts" ? [{ key: "hours", header: "Hours", cell: (x: MasterItem) => <span className="tabular text-ink-muted">{x.startTime} – {x.endTime}</span> }] : []),
    { key: "status", header: "Status", sortValue: (x) => (x.isActive ? 0 : 1), cell: (x) => <Badge tone={x.isActive ? "success" : "neutral"}>{x.isActive ? "Active" : "Inactive"}</Badge> },
    ...(edit
      ? [
          {
            key: "act",
            header: "",
            align: "right" as const,
            cell: (x: MasterItem) => (
              <RowMenu
                items={[
                  { label: "Edit", icon: <Pencil className="h-4 w-4" />, onClick: () => setEditing(x) },
                  {
                    label: x.isActive ? "Deactivate (hide from forms)" : "Activate",
                    icon: <Power className="h-4 w-4" />,
                    onClick: () => m.toggleMaster.mutate({ kind, id: x.id }, { onSuccess: () => toast.success(x.isActive ? "Deactivated" : "Activated"), onError: err("Couldn’t change status") }),
                  },
                  { label: "Delete", icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => setRemoving(x) },
                ]}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Masters"
        description={edit ? "Lists people pick from across the portal. Deactivate instead of deleting when something is no longer used." : "Lists used across the portal. Only Admin and IT can change them."}
        actions={
          edit && (
            <Button onClick={() => setEditing(null)}>
              <Plus className="h-4 w-4" /> Add {meta.singular}
            </Button>
          )
        }
      />
      <Segmented
        aria-label="Master list"
        value={kind}
        onChange={(v) => {
          setSearch("");
          router.replace(`${pathname}?type=${v}`, { scroll: false });
        }}
        options={MASTERS.map((x) => ({ value: x.kind, label: x.label }))}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-ink-muted">{meta.hint}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Segmented
            aria-label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "All" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
          <div className="relative sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
            <Input placeholder={`Search ${meta.label.toLowerCase()}`} aria-label="Search" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>
      </div>
      {q.isError ? (
        <Card>
          <ErrorState message={`${meta.label} couldn’t be loaded.`} onRetry={() => q.refetch()} />
        </Card>
      ) : (
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(x) => x.id}
          loading={q.isLoading}
          initialSort={{ key: "name", dir: "asc" }}
          pageSize={25}
          empty={{ icon: ListTree, title: q.data?.length ? "Nothing matches" : `No ${meta.label.toLowerCase()} yet`, description: !q.data?.length && edit ? `Add the firm’s ${meta.label.toLowerCase()} so forms can use them.` : undefined }}
        />
      )}

      {editing !== undefined && <MasterDialog kind={kind} item={editing} onClose={() => setEditing(undefined)} />}
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        tone="danger"
        title={`Delete “${removing?.name}”?`}
        description="The server refuses if any employee still uses it — deactivate it instead in that case."
        confirmLabel="Delete"
        busy={m.deleteMaster.isPending}
        onConfirm={() =>
          removing &&
          m.deleteMaster.mutate(
            { kind, id: removing.id },
            { onSuccess: () => (toast.success("Deleted"), setRemoving(null)), onError: (e) => (err("Couldn’t delete")(e), setRemoving(null)) },
          )
        }
      />
    </div>
  );
}

function MasterDialog({ kind, item, onClose }: { kind: MasterKind; item: MasterItem | null; onClose: () => void }) {
  const toast = useToast();
  const m = useAdminMutations();
  const meta = MASTERS.find((x) => x.kind === kind)!;
  const [name, setName] = useState(item?.name ?? "");
  const [code, setCode] = useState(item?.code ?? "");
  const [startTime, setStart] = useState(item?.startTime ?? "09:30");
  const [endTime, setEnd] = useState(item?.endTime ?? "18:30");
  const [description, setDescription] = useState(item?.description ?? "");
  const [tried, setTried] = useState(false);
  const errors = {
    name: name.trim().length < 2 ? "Enter a name." : "",
    code: kind === "roles" && !/^[A-Za-z0-9_-]{1,12}$/.test(code.trim()) ? "1–12 letters or numbers." : "",
    time: kind === "shifts" && (!startTime || !endTime || startTime === endTime) ? "Set different start and end times." : "",
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.values(errors).some(Boolean)) return;
    const body: Record<string, unknown> = { name: name.trim(), description: description.trim() || null };
    if (kind === "roles") body.code = code.trim().toUpperCase();
    if (kind === "shifts") Object.assign(body, { startTime, endTime });
    try {
      await m.saveMaster.mutateAsync({ kind, id: item?.id, body });
      toast.success(item ? "Saved" : `${meta.singular[0].toUpperCase()}${meta.singular.slice(1)} added`);
      onClose();
    } catch (err) {
      toast.error("Couldn’t save", err instanceof ApiError ? err.message : undefined);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={item ? `Edit ${item.name}` : `Add ${meta.singular}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="master-form" loading={m.saveMaster.isPending}>
            {item ? "Save" : "Add"}
          </Button>
        </>
      }
    >
      <form id="master-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Name" htmlFor="ms-name" required error={tried ? errors.name : undefined} className={kind === "roles" ? "" : "sm:col-span-2"}>
          <Input id="ms-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} invalid={tried && !!errors.name} />
        </FormRow>
        {kind === "roles" && (
          <FormRow label="Code" htmlFor="ms-code" required error={tried ? errors.code : undefined} hint="Short and unique, e.g. AA">
            <Input id="ms-code" value={code} maxLength={12} onChange={(e) => setCode(e.target.value)} className="uppercase" invalid={tried && !!errors.code} />
          </FormRow>
        )}
        {kind === "shifts" && (
          <>
            <FormRow label="Starts" htmlFor="ms-start" required error={tried ? errors.time : undefined}>
              <Input id="ms-start" type="time" value={startTime} onChange={(e) => setStart(e.target.value)} />
            </FormRow>
            <FormRow label="Ends" htmlFor="ms-end" required>
              <Input id="ms-end" type="time" value={endTime} onChange={(e) => setEnd(e.target.value)} />
            </FormRow>
          </>
        )}
        <FormRow label="Description" htmlFor="ms-desc" hint="Optional" className="sm:col-span-2">
          <Textarea id="ms-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </FormRow>
      </form>
    </Dialog>
  );
}
