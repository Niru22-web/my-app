"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Fingerprint, Info, Link2, Pencil, Plus, Power, Search, Trash2, Wand2, Wifi } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { timeAgo } from "@/lib/notifications";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm";
import { FormRow, Input } from "@/components/ui/inputs";
import { Segmented } from "@/components/ui/segmented";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PeoplePicker } from "@/components/ui/people-picker";
import { useToast } from "@/components/ui/toast";
import { RowMenu } from "@/components/management/row-menu";
import { usePeople } from "@/components/management/api";
import { canEssl, useAdminMutations, useEsslLogs, useEsslMachines, useEsslMappings, type EsslMachine, type EsslMapping } from "@/components/admin/api";

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const HOST = /^[a-zA-Z0-9.-]{1,253}$/;

export default function EsslPage() {
  const { user } = useAuth();
  const on = canEssl(user?.role);
  const toast = useToast();
  const machines = useEsslMachines(on);
  const maps = useEsslMappings(on);
  const logs = useEsslLogs(on);
  const m = useAdminMutations();
  const [editing, setEditing] = useState<EsslMachine | null | undefined>(undefined);
  const [removing, setRemoving] = useState<EsslMachine | null>(null);
  const [mapping, setMapping] = useState<EsslMapping | null>(null);
  const [mapView, setMapView] = useState<"todo" | "all">("todo");
  const [search, setSearch] = useState("");
  const err = (t: string) => (e: unknown) => toast.error(t, e instanceof ApiError ? e.message : undefined);

  const mapRows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (maps.data ?? []).filter(
      (x) => (mapView === "all" || x.syncStatus !== "Mapped") && (!s || `${x.biometricEmployeeId} ${x.biometricName} ${x.employee?.firstName ?? ""} ${x.employee?.lastName ?? ""}`.toLowerCase().includes(s)),
    );
  }, [maps.data, mapView, search]);
  const unmapped = (maps.data ?? []).filter((x) => x.syncStatus !== "Mapped").length;

  if (!on)
    return (
      <Card>
        <EmptyState title="Only Admin and IT can manage biometric devices" />
      </Card>
    );

  const test = (x: EsslMachine) =>
    m.testMachine.mutate(x.id, {
      onSuccess: (res) => {
        const r = res.data;
        if (r?.success) toast.success(`${x.name} is reachable`, r.latency != null ? `${r.latency} ms` : r.message);
        else toast.error(`${x.name} didn’t respond`, r?.message);
      },
      onError: err("Connection test failed"),
    });

  const mapColumns: Column<EsslMapping>[] = [
    { key: "bio", header: "Device ID", sortValue: (x) => x.biometricEmployeeId, cell: (x) => <span className="font-mono text-xs text-ink">{x.biometricEmployeeId}</span> },
    { key: "name", header: "Name on device", sortValue: (x) => x.biometricName, cell: (x) => <span className="text-ink">{x.biometricName}</span> },
    { key: "machine", header: "Device", hideBelow: "lg", cell: (x) => <span className="text-ink-muted">{x.machine?.name ?? "—"}</span> },
    {
      key: "emp",
      header: "Portal employee",
      sortValue: (x) => x.employee?.firstName ?? "",
      cell: (x) =>
        x.employee ? (
          <span className="text-ink">
            {x.employee.firstName} {x.employee.lastName} <span className="text-xs text-ink-subtle">· {x.employee.employeeId}</span>
          </span>
        ) : (
          <span className="text-ink-subtle">Not linked</span>
        ),
    },
    { key: "punch", header: "Last punch", hideBelow: "md", sortValue: (x) => x.lastPunch ?? "", cell: (x) => <span className="text-ink-muted">{x.lastPunch ? timeAgo(x.lastPunch) : "—"}</span> },
    { key: "status", header: "Status", cell: (x) => <Badge tone={x.syncStatus === "Mapped" ? "success" : x.syncStatus === "Pending" ? "warning" : "neutral"}>{x.syncStatus}</Badge> },
    { key: "act", header: "", align: "right", cell: (x) => <Button variant="ghost" size="sm" onClick={() => setMapping(x)}><Link2 className="h-4 w-4" /> {x.employee ? "Change" : "Link"}</Button> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Biometric devices"
        description="ESSL attendance machines and which portal employee each device ID belongs to"
        actions={
          <Button onClick={() => setEditing(null)}>
            <Plus className="h-4 w-4" /> Add device
          </Button>
        }
      />
      <div className="flex items-start gap-2 rounded-2xl bg-surface-muted px-4 py-3 text-[13px] text-ink-muted">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>Pulling punches from the devices isn’t implemented by the current server (its “sync” only simulates data), so it isn’t offered here. Device setup, connection tests and ID mapping are real and carry over to the new server.</span>
      </div>

      <Card>
        <CardHeader icon={Fingerprint} title="Devices" />
        {machines.isError ? (
          <ErrorState message="Devices couldn’t be loaded." onRetry={() => machines.refetch()} />
        ) : machines.isLoading ? (
          <Skeleton className="m-5 h-24" />
        ) : !machines.data?.length ? (
          <EmptyState icon={Fingerprint} title="No devices added" description="Add each ESSL machine with its network address and device key." className="py-8" />
        ) : (
          <ul className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
            {machines.data.map((x) => (
              <li key={x.id} className="rounded-2xl border border-line p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{x.name}</p>
                    <p className="truncate text-xs text-ink-subtle">
                      {x.branch} · <span className="font-mono">{x.ipAddress}:{x.port}</span>
                    </p>
                  </div>
                  <RowMenu
                    items={[
                      { label: "Test connection", icon: <Wifi className="h-4 w-4" />, onClick: () => test(x) },
                      { label: "Edit", icon: <Pencil className="h-4 w-4" />, onClick: () => setEditing(x) },
                      {
                        label: x.isActive ? "Disable" : "Enable",
                        icon: <Power className="h-4 w-4" />,
                        onClick: () => m.saveMachine.mutate({ id: x.id, isActive: !x.isActive }, { onSuccess: () => toast.success(x.isActive ? "Device disabled" : "Device enabled"), onError: err("Couldn’t update") }),
                      },
                      { label: "Remove", icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => setRemoving(x) },
                    ]}
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <Badge tone={!x.isActive ? "neutral" : /online/i.test(x.status) ? "success" : "warning"}>{x.isActive ? x.status : "Disabled"}</Badge>
                  <span className="text-ink-subtle">{x.lastSyncAt ? `Last sync ${formatDate(x.lastSyncAt)}` : "Never synced"}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">Device ID mapping</h2>
            <p className="text-[13px] text-ink-muted">Each person’s ID on the device must be linked to their portal record for punches to count.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Segmented
              aria-label="Show"
              value={mapView}
              onChange={setMapView}
              options={[
                { value: "todo", label: "Needs linking", count: unmapped || undefined },
                { value: "all", label: "All" },
              ]}
            />
            <div className="relative sm:w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
              <Input placeholder="ID or name" aria-label="Search mappings" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Button
              variant="secondary"
              disabled={!unmapped}
              loading={m.autoMatch.isPending}
              onClick={() => m.autoMatch.mutate(undefined, { onSuccess: (r) => toast.success(r.message || `${r.data?.matchedCount ?? 0} matched`), onError: err("Auto-match failed") })}
            >
              <Wand2 className="h-4 w-4" /> Auto-match by name
            </Button>
          </div>
        </div>
        {maps.isError ? (
          <Card>
            <ErrorState message="Mappings couldn’t be loaded." onRetry={() => maps.refetch()} />
          </Card>
        ) : (
          <DataTable
        exportName="essl" rows={mapRows} columns={mapColumns} rowKey={(x) => x.id} loading={maps.isLoading} initialSort={{ key: "bio", dir: "asc" }} pageSize={20} empty={{ icon: Link2, title: mapView === "todo" ? "Everyone on the devices is linked" : "No device IDs recorded yet" }} />
        )}
      </div>

      <Card>
        <CardHeader icon={Fingerprint} title="Sync history" description="Latest 50 attempts recorded by the server" />
        {logs.isLoading ? (
          <Skeleton className="m-5 h-20" />
        ) : !logs.data?.length ? (
          <EmptyState title="No sync attempts recorded" className="py-8" />
        ) : (
          <ul className="divide-y divide-line px-5 pb-2">
            {logs.data.slice(0, 15).map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                <span className="min-w-0 truncate text-ink">
                  {l.machine?.name ?? "Device"} · {l.recordsSynced} record{l.recordsSynced === 1 ? "" : "s"}
                  {l.errorMessage && <span className="text-danger"> · {l.errorMessage}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge tone={/success/i.test(l.status) ? "success" : "danger"}>{l.status}</Badge>
                  <span className="text-xs text-ink-subtle">{timeAgo(l.syncTime)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing !== undefined && <MachineDialog machine={editing} onClose={() => setEditing(undefined)} />}
      {mapping && <MapDialog row={mapping} onClose={() => setMapping(null)} />}
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        tone="danger"
        title={`Remove ${removing?.name}?`}
        description="Its ID mappings stay, but are no longer tied to this device. This can’t be undone."
        confirmLabel="Remove"
        busy={m.deleteMachine.isPending}
        onConfirm={() => removing && m.deleteMachine.mutate(removing.id, { onSuccess: () => (toast.success("Device removed"), setRemoving(null)), onError: err("Couldn’t remove") })}
      />
    </div>
  );
}

function MachineDialog({ machine, onClose }: { machine: EsslMachine | null; onClose: () => void }) {
  const toast = useToast();
  const m = useAdminMutations();
  const [f, setF] = useState({ name: machine?.name ?? "", branch: machine?.branch ?? "", ipAddress: machine?.ipAddress ?? "", port: String(machine?.port ?? 4370), syncInterval: String(machine?.syncInterval ?? 5), deviceKey: "", apiKey: "" });
  const [tried, setTried] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const port = Number(f.port);
  const every = Number(f.syncInterval);
  const errors = {
    name: !f.name.trim() ? "Required." : "",
    branch: !f.branch.trim() ? "Required." : "",
    ipAddress: !(IPV4.test(f.ipAddress.trim()) || HOST.test(f.ipAddress.trim())) ? "Enter an IP address or host name." : "",
    port: !Number.isInteger(port) || port < 1 || port > 65535 ? "1–65535." : "",
    syncInterval: !Number.isInteger(every) || every < 1 || every > 1440 ? "1–1440 minutes." : "",
    deviceKey: !machine && !f.deviceKey.trim() ? "Required for a new device." : "",
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.values(errors).some(Boolean)) return;
    try {
      await m.saveMachine.mutateAsync({
        id: machine?.id,
        name: f.name.trim(),
        branch: f.branch.trim(),
        ipAddress: f.ipAddress.trim(),
        port,
        syncInterval: every,
        // Keys are only sent when typed, so editing never blanks a stored key.
        ...(f.deviceKey.trim() ? { deviceKey: f.deviceKey.trim() } : {}),
        ...(f.apiKey.trim() ? { apiKey: f.apiKey.trim() } : {}),
      });
      toast.success(machine ? "Device updated" : "Device added", "Run a connection test to check it.");
      onClose();
    } catch (err) {
      toast.error("Couldn’t save the device", err instanceof ApiError ? err.message : undefined);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={machine ? `Edit ${machine.name}` : "Add a biometric device"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="essl-form" loading={m.saveMachine.isPending}>
            {machine ? "Save" : "Add device"}
          </Button>
        </>
      }
    >
      <form id="essl-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Name" htmlFor="es-name" required error={tried ? errors.name : undefined}>
          <Input id="es-name" value={f.name} onChange={set("name")} placeholder="e.g. Mumbai HO – entrance" invalid={tried && !!errors.name} />
        </FormRow>
        <FormRow label="Branch" htmlFor="es-branch" required error={tried ? errors.branch : undefined}>
          <Input id="es-branch" value={f.branch} onChange={set("branch")} invalid={tried && !!errors.branch} />
        </FormRow>
        <FormRow label="IP address or host" htmlFor="es-ip" required error={tried ? errors.ipAddress : undefined}>
          <Input id="es-ip" value={f.ipAddress} onChange={set("ipAddress")} placeholder="192.168.1.201" className="font-mono" invalid={tried && !!errors.ipAddress} />
        </FormRow>
        <FormRow label="Port" htmlFor="es-port" required error={tried ? errors.port : undefined}>
          <Input id="es-port" type="number" value={f.port} onChange={set("port")} invalid={tried && !!errors.port} />
        </FormRow>
        <FormRow label="Device key" htmlFor="es-key" required={!machine} error={tried ? errors.deviceKey : undefined} hint={machine ? "Leave blank to keep the current key" : undefined}>
          <Input id="es-key" type="password" autoComplete="off" value={f.deviceKey} onChange={set("deviceKey")} invalid={tried && !!errors.deviceKey} />
        </FormRow>
        <FormRow label="API key" htmlFor="es-api" hint={machine ? "Leave blank to keep" : "Optional"}>
          <Input id="es-api" type="password" autoComplete="off" value={f.apiKey} onChange={set("apiKey")} />
        </FormRow>
        <FormRow label="Check every (minutes)" htmlFor="es-int" error={tried ? errors.syncInterval : undefined}>
          <Input id="es-int" type="number" value={f.syncInterval} onChange={set("syncInterval")} invalid={tried && !!errors.syncInterval} />
        </FormRow>
      </form>
    </Dialog>
  );
}

function MapDialog({ row, onClose }: { row: EsslMapping; onClose: () => void }) {
  const toast = useToast();
  const m = useAdminMutations();
  const people = usePeople();
  const [who, setWho] = useState<string[]>(row.portalEmployeeId ? [row.portalEmployeeId] : []);
  const options = useMemo(
    () => (people.data ?? []).filter((p) => (p.status ?? "active").toLowerCase() === "active").map((p) => ({ id: p.id, label: `${p.firstName} ${p.lastName ?? ""}`.trim(), sub: [p.employeeId, p.department].filter(Boolean).join(" · ") })),
    [people.data],
  );
  const save = (id: string | null) =>
    m.mapEmployee.mutate(
      { id: row.id, portalEmployeeId: id },
      { onSuccess: () => (toast.success(id ? "Linked" : "Unlinked"), onClose()), onError: (e) => toast.error("Couldn’t save", e instanceof ApiError ? e.message : undefined) },
    );
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Link device ID ${row.biometricEmployeeId}`}
      description={`Name on the device: ${row.biometricName}`}
      footer={
        <>
          {row.portalEmployeeId && (
            <Button variant="ghost" className="mr-auto text-danger" onClick={() => save(null)}>
              Unlink
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!who.length} loading={m.mapEmployee.isPending} onClick={() => save(who[0])}>
            Link
          </Button>
        </>
      }
    >
      <FormRow label="Portal employee" htmlFor="map-who" required>
        <PeoplePicker id="map-who" options={options} value={who} onChange={(ids) => setWho(ids.slice(-1))} loading={people.isLoading} placeholder="Search by name or code" />
      </FormRow>
    </Dialog>
  );
}
