"use client";

import { useEffect, useMemo, useState } from "react";
import { ImportButton } from "@/components/ui/import-dialog";
import { useRouter } from "next/navigation";
import { Building2, Download, Pencil, Plus, Power, Receipt, Timer, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { today } from "@/lib/dates";
import { formatHours, formatNumber, plural } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { downloadCsv } from "@/components/claims/claim-tabs";
import { canDeleteClient, canManageWork, clientBody, isEmployeeRole, isInactive, useClientList, useMgmtMutations, type Client } from "@/components/management/api";
import { ClientDialog } from "@/components/management/client-dialog";
import { RowMenu } from "@/components/management/row-menu";

type StatusF = "active" | "inactive" | "all";

export default function ClientsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const manage = canManageWork(user?.role);
  const blocked = isEmployeeRole(user?.role);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusF>("active");
  const [editor, setEditor] = useState<{ client?: Client | null } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "toggle" | "delete"; client: Client } | null>(null);

  useEffect(() => {
    if (blocked) router.replace("/management/projects");
  }, [blocked, router]);

  const q = useClientList(!blocked);
  const m = useMgmtMutations();
  const all = useMemo(() => q.data ?? [], [q.data]);
  const rows = all.filter((c) => {
    if (status === "active" && isInactive(c.status)) return false;
    if (status === "inactive" && !isInactive(c.status)) return false;
    const s = search.trim().toLowerCase();
    return !s || `${c.name} ${c.clientId} ${c.alias ?? ""} ${c.pan ?? ""} ${c.gstin ?? ""}`.toLowerCase().includes(s);
  });

  if (blocked) return null;

  const columns: Column<Client>[] = [
    {
      key: "name",
      header: "Client",
      sortValue: (c) => c.name,
      cell: (c) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{c.name}</p>
          <p className="truncate text-xs text-ink-subtle">
            {c.clientId}
            {c.alias ? ` · ${c.alias}` : ""}
          </p>
        </div>
      ),
    },
    { key: "loc", header: "Location", hideBelow: "md", sortValue: (c) => `${c.country} ${c.state}`, cell: (c) => <span className="text-ink-muted">{[c.state, c.country].filter(Boolean).join(", ") || "—"}</span> },
    {
      key: "tax",
      header: "Tax",
      hideBelow: "lg",
      cell: (c) => (
        <div className="text-xs">
          {c.gstStatus === "Yes" && c.gstin ? <p className="font-medium text-ink">GSTIN {c.gstin}</p> : <p className="text-ink-subtle">Not GST registered</p>}
          {c.pan && <p className="text-ink-subtle">PAN {c.pan}</p>}
        </div>
      ),
    },
    { key: "projects", header: "Projects", align: "right", hideBelow: "sm", sortValue: (c) => c._count?.projects ?? 0, cell: (c) => formatNumber(c._count?.projects ?? 0) },
    { key: "hours", header: "Hours", align: "right", sortValue: (c) => c.loggedHours ?? 0, cell: (c) => formatHours(c.loggedHours ?? 0) },
    { key: "status", header: "Status", sortValue: (c) => c.status, cell: (c) => <Badge tone={isInactive(c.status) ? "neutral" : "success"}>{isInactive(c.status) ? "Inactive" : "Active"}</Badge> },
    {
      key: "act",
      header: "",
      align: "right",
      cell: (c) =>
        manage ? (
          <RowMenu
            items={[
              { label: "Edit details", icon: <Pencil className="h-4 w-4" />, onClick: () => setEditor({ client: c }) },
              { label: isInactive(c.status) ? "Mark active" : "Mark inactive", icon: <Power className="h-4 w-4" />, onClick: () => setConfirm({ kind: "toggle", client: c }) },
              ...(canDeleteClient(user?.role)
                ? [
                    {
                      label: "Delete client",
                      icon: <Trash2 className="h-4 w-4" />,
                      danger: true,
                      onClick: () => setConfirm({ kind: "delete", client: c }),
                      disabledReason: (c._count?.projects ?? 0) > 0 ? "Has projects — mark inactive instead" : undefined,
                    },
                  ]
                : []),
            ]}
          />
        ) : null,
    },
  ];

  const active = all.filter((c) => !isInactive(c.status));
  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients"
        description="Organisations you work for. Projects and jobs sit under a client."
        actions={
          <>
            {manage && <ImportButton kind="clients" label="Clients" invalidate={[["mgmt"], ["lookup"]]} />}
            {manage && (
              <Button onClick={() => setEditor({})}>
                <Plus className="h-4 w-4" /> Add client
              </Button>
            )}
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Summary">
        <StatCard label="Active clients" icon={Building2} tone="brand" loading={q.isLoading} value={formatNumber(active.length)} hint={`of ${formatNumber(all.length)}`} />
        <StatCard label="GST registered" icon={Receipt} loading={q.isLoading} value={formatNumber(active.filter((c) => c.gstStatus === "Yes").length)} />
        <StatCard label="Projects" icon={Building2} loading={q.isLoading} value={formatNumber(active.reduce((a, c) => a + (c._count?.projects ?? 0), 0))} hint="under active clients" />
        <StatCard label="Hours logged" icon={Timer} loading={q.isLoading} value={formatHours(all.reduce((a, c) => a + (c.loggedHours ?? 0), 0))} hint="all time" />
      </section>

      <DataTable
        exportName={false}
        itemsLabel="clients"
        filterTabs={[
          { key: "active", label: "Active", count: active.length },
          { key: "inactive", label: "Inactive", count: all.length - active.length },
          { key: "all", label: "All", count: all.length },
        ]}
        activeFilterTab={status}
        onFilterTabChange={(k) => setStatus(k as StatusF)}
        searchable
        searchPlaceholder="Search name, code, alias, PAN or GSTIN"
        searchValue={search}
        onSearchChange={setSearch}
        toolbarActions={
          <Button
            variant="secondary"
            size="sm"
            disabled={!rows.length}
            onClick={() =>
              downloadCsv(
                `clients-${today()}.csv`,
                ["Client code", "Name", "Alias", "Status", "GST registered", "GSTIN", "PAN", "Country", "State", "PIN", "Address", "Projects", "Logged hours"],
                rows.map((c) => [c.clientId, c.name, c.alias, c.status, c.gstStatus, c.gstin, c.pan, c.country, c.state, c.pin, c.address, c._count?.projects ?? 0, c.loggedHours ?? 0]),
              )
            }
          >
            <Download className="h-4 w-4" /> Export
          </Button>
        }
        rows={rows}
        rowLabel={manage ? (c) => `Edit ${c.name}` : undefined}
        columns={columns}
        rowKey={(c) => c.id}
        loading={q.isLoading}
        error={q.isError}
        onRetry={() => q.refetch()}
        onRowClick={manage ? (c) => setEditor({ client: c }) : undefined}
        initialSort={{ key: "name", dir: "asc" }}
        pageSize={20}
        empty={{ icon: Building2, title: search ? "No clients match your search" : "No clients yet", action: manage && !search ? <Button size="sm" onClick={() => setEditor({})}><Plus className="h-4 w-4" /> Add client</Button> : undefined }}
      />

      <ClientDialog open={!!editor} onClose={() => setEditor(null)} client={editor?.client} />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        tone={confirm?.kind === "delete" || (confirm && !isInactive(confirm.client.status)) ? "danger" : "primary"}
        title={confirm?.kind === "delete" ? `Delete ${confirm.client.name}?` : confirm && isInactive(confirm.client.status) ? `Reactivate ${confirm.client.name}?` : `Mark ${confirm?.client.name} inactive?`}
        confirmLabel={confirm?.kind === "delete" ? "Delete permanently" : confirm && isInactive(confirm.client.status) ? "Mark active" : "Mark inactive"}
        busy={m.saveClient.isPending || m.deleteClient.isPending}
        description={
          confirm?.kind === "delete"
            ? "This client has no projects. It will be removed permanently."
            : confirm && isInactive(confirm.client.status)
              ? "The client will appear in lists and pickers again."
              : (confirm?.client._count?.projects ?? 0) > 0
                ? `Inactive clients are hidden from pickers. Its ${plural(confirm!.client._count!.projects, "project")} and all logged time are kept.`
                : "Inactive clients are hidden from pickers. All of its details are kept, and you can reactivate it at any time."
        }
        onConfirm={() => {
          if (!confirm) return;
          const c = confirm.client;
          const done = (t: string) => () => (toast.success(t, c.name), setConfirm(null));
          const fail = (e: unknown) => toast.error("Couldn’t update the client", e instanceof ApiError ? e.message : undefined);
          if (confirm.kind === "delete") m.deleteClient.mutate(c.id, { onSuccess: done("Client deleted"), onError: fail });
          else m.saveClient.mutate({ id: c.id, body: clientBody(c, { status: isInactive(c.status) ? "Active" : "Inactive" }) }, { onSuccess: done(isInactive(c.status) ? "Client reactivated" : "Client marked inactive"), onError: fail });
        }}
      />
    </div>
  );
}
