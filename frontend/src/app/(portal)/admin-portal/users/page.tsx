"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Copy, Search, ShieldCheck, UserCog } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { roleLabel } from "@/lib/roles";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/inputs";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import {
  MODULES,
  UNREADABLE,
  canManageAccess,
  useAdminMutations,
  useAdminUsers,
  useRolePermissions,
  useUserPermissions,
  type AdminUser,
  type ModulePermission,
} from "@/components/admin/api";

/** Role names exactly as stored in role_permissions (the lookup is case-sensitive). */
const ROLES = ["Admin", "Owner", "Partner", "Manager", "HR", "IT", "ACCOUNTS", "Employee"];
const ACTIONS = [
  { key: "canView", label: "View" },
  { key: "canCreate", label: "Add" },
  { key: "canEdit", label: "Edit" },
  { key: "canDelete", label: "Delete" },
] as const;
type Action = (typeof ACTIONS)[number]["key"];
type Matrix = Record<string, Record<Action, boolean>>;

const empty = (): Matrix => Object.fromEntries(MODULES.map((m) => [m.key, { canView: false, canCreate: false, canEdit: false, canDelete: false }]));
function toMatrix(list: ModulePermission[]): Matrix {
  const m = empty();
  for (const p of list) if (m[p.moduleName]) m[p.moduleName] = { canView: !!p.canView, canCreate: !!p.canCreate, canEdit: !!p.canEdit, canDelete: !!p.canDelete };
  return m;
}

export default function AccessPage() {
  const { user } = useAuth();
  const allowed = canManageAccess(user?.role);
  const [mode, setMode] = useState<"person" | "role">("person");
  const users = useAdminUsers(allowed);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<AdminUser | null>(null);
  const [role, setRole] = useState("Employee");

  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (users.data ?? [])
      .filter((u) => !s || `${u.firstName} ${u.lastName ?? ""} ${u.employeeId} ${u.officeEmail} ${u.role ?? ""}`.toLowerCase().includes(s))
      .sort((a, b) => a.firstName.localeCompare(b.firstName));
  }, [users.data, search]);

  if (!allowed)
    return (
      <Card>
        <EmptyState title="Only Admin and Owner can change access" />
      </Card>
    );

  return (
    <div className="space-y-6">
      <PageHeader title="Users & access" description="Grant access to modules beyond what someone’s role gives by default" />
      <Segmented
        aria-label="Edit access for"
        value={mode}
        onChange={setMode}
        options={[
          { value: "person", label: "A person" },
          { value: "role", label: "A whole role" },
        ]}
      />

      {mode === "role" ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label htmlFor="role-pick" className="text-sm font-medium text-ink">
              Role
            </label>
            <Select id="role-pick" value={role} onChange={(e) => setRole(e.target.value)} className="w-48">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </Select>
          </div>
          <RoleEditor role={role} />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="overflow-hidden">
            <div className="border-b border-line p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
                <Input placeholder="Search people" aria-label="Search people" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
            </div>
            {users.isError ? (
              <ErrorState message="People couldn’t be loaded." onRetry={() => users.refetch()} />
            ) : users.isLoading ? (
              <Skeleton className="m-3 h-64" />
            ) : (
              <ul className="max-h-[60vh] overflow-y-auto p-1.5">
                {list.map((u) => (
                  <li key={u.id}>
                    <button
                      onClick={() => setPicked(u)}
                      className={cn("flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left", picked?.id === u.id ? "bg-brand-softer" : "hover:bg-surface-muted")}
                    >
                      <Avatar name={`${u.firstName} ${u.lastName ?? ""}`} size={32} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">
                          {u.firstName} {u.lastName}
                        </span>
                        <span className="block truncate text-xs text-ink-subtle">
                          {roleLabel(u.role)} · {u.employeeId}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
                {!list.length && <li className="p-4 text-center text-sm text-ink-subtle">No one matches</li>}
              </ul>
            )}
          </Card>
          {picked ? (
            picked.id === user?.id ? (
              <Card>
                <EmptyState icon={ShieldCheck} title="You can’t change your own access" description="Ask another administrator." />
              </Card>
            ) : (
              <PersonEditor key={picked.id} person={picked} />
            )
          ) : (
            <Card>
              <EmptyState icon={UserCog} title="Choose a person" description="Their module access appears here." className="py-20" />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function PersonEditor({ person }: { person: AdminUser }) {
  const q = useUserPermissions(person.id);
  if (q.isError) return <Card><ErrorState message="Access couldn’t be loaded." onRetry={() => q.refetch()} /></Card>;
  if (q.isLoading || !q.data) return <Skeleton className="h-96" />;
  return <Editor key={q.dataUpdatedAt} initial={toMatrix(q.data)} title={`${person.firstName} ${person.lastName ?? ""}`.trim()} subtitle={`${roleLabel(person.role)} · ${person.officeEmail}`} target={{ kind: "person", id: person.id, role: person.role ?? "" }} />;
}

function RoleEditor({ role }: { role: string }) {
  const q = useRolePermissions(role);
  if (q.isError) return <Card><ErrorState message="Access couldn’t be loaded." onRetry={() => q.refetch()} /></Card>;
  if (q.isLoading || !q.data) return <Skeleton className="h-96" />;
  return <Editor key={`${role}-${q.dataUpdatedAt}`} initial={toMatrix(q.data)} title={`Everyone with the ${roleLabel(role)} role`} subtitle="Applies unless a person has their own access set" target={{ kind: "role", id: role, role }} />;
}

function Editor({ initial, title, subtitle, target }: { initial: Matrix; title: string; subtitle: string; target: { kind: "person" | "role"; id: string; role: string } }) {
  const toast = useToast();
  const m = useAdminMutations();
  const [matrix, setMatrix] = useState<Matrix>(initial);
  const [unknown, setUnknown] = useState<Set<string>>(() => new Set(UNREADABLE));
  const [copying, setCopying] = useState(false);
  const dirty = JSON.stringify(matrix) !== JSON.stringify(initial) || unknown.size < UNREADABLE.size;

  const set = (mod: string, a: Action, v: boolean) => {
    setMatrix((p) => {
      const next = { ...p, [mod]: { ...p[mod], [a]: v } };
      // Anything beyond View needs View; removing View removes the rest.
      if (a !== "canView" && v) next[mod].canView = true;
      if (a === "canView" && !v) next[mod] = { canView: false, canCreate: false, canEdit: false, canDelete: false };
      return next;
    });
    setUnknown((p) => {
      const n = new Set(p);
      n.delete(`${mod}:${a}`);
      if (a !== "canView" && v) n.delete(`${mod}:canView`);
      if (a === "canView" && !v) ["canCreate", "canEdit"].forEach((x) => n.delete(`${mod}:${x}`));
      return n;
    });
  };

  async function copyFromRole() {
    setCopying(true);
    try {
      const res = await api<{ permissions: ModulePermission[] }>(`admin/role-permissions/${encodeURIComponent(target.role)}`);
      setMatrix(toMatrix(res.permissions ?? []));
      toast.success(`Copied from the ${roleLabel(target.role)} role`, "Review and save to apply.");
    } catch (e) {
      toast.error("Couldn’t copy", e instanceof ApiError ? e.message : undefined);
    } finally {
      setCopying(false);
    }
  }

  async function save() {
    if (unknown.size) return toast.error("Set the Jobs View, Add and Edit boxes first", "The server doesn’t report their current value, so they must be chosen before saving.");
    const permissions: ModulePermission[] = MODULES.map((mod) => {
      const v = matrix[mod.key];
      // Analytics has a single stored flag — send the same value for all four.
      return mod.viewOnly ? { moduleName: mod.key, canView: v.canView, canCreate: v.canView, canEdit: v.canView, canDelete: v.canView } : { moduleName: mod.key, ...v };
    });
    try {
      if (target.kind === "person") await m.saveUserPerms.mutateAsync({ userId: target.id, permissions });
      else await m.saveRolePerms.mutateAsync({ role: target.id, permissions });
      toast.success("Access saved", target.kind === "person" ? "It applies the next time they open a page." : undefined);
    } catch (e) {
      toast.error("Couldn’t save access", e instanceof ApiError ? e.message : undefined);
    }
  }

  const groups = [...new Set(MODULES.map((x) => x.group))];
  return (
    <Card>
      <CardHeader
        icon={ShieldCheck}
        title={title}
        description={subtitle}
        actions={
          target.kind === "person" && target.role ? (
            <Button variant="ghost" size="sm" loading={copying} onClick={copyFromRole}>
              <Copy className="h-4 w-4" /> Copy from role
            </Button>
          ) : undefined
        }
      />
      <div className="mx-5 mb-2 flex items-start gap-2 rounded-xl bg-surface-muted px-3.5 py-2.5 text-[13px] text-ink-muted">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
        <span>
          {target.kind === "person"
            ? "Saving gives this person their own access list, which replaces their role’s list for them. Admin, Owner and IT always have full access."
            : "This changes access for everyone with the role who doesn’t have their own list."}{" "}
          Jobs View/Add/Edit show as <strong>?</strong> because the server doesn’t report them — set them before saving.
        </span>
      </div>
      <div className="overflow-x-auto px-5 pb-5">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-subtle">
              <th className="py-2 font-medium">Module</th>
              {ACTIONS.map((a) => (
                <th key={a.key} className="w-20 py-2 text-center font-medium">
                  {a.label}
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g}>
              <tr>
                <td colSpan={5} className="pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                  {g}
                </td>
              </tr>
              {MODULES.filter((x) => x.group === g).map((mod) => (
                <tr key={mod.key} className="border-b border-line last:border-0">
                  <td className="py-2 text-ink">{mod.label}</td>
                  {ACTIONS.map((a) =>
                    mod.viewOnly && a.key !== "canView" ? (
                      <td key={a.key} className="py-2 text-center text-xs text-ink-subtle">—</td>
                    ) : (
                      <td key={a.key} className="py-2 text-center">
                        {unknown.has(`${mod.key}:${a.key}`) ? (
                          <button
                            onClick={() => set(mod.key, a.key, true)}
                            onContextMenu={(e) => (e.preventDefault(), set(mod.key, a.key, false))}
                            className="inline-grid h-5 w-5 place-items-center rounded border border-dashed border-warning text-[11px] font-bold text-warning"
                            aria-label={`${mod.label} ${a.label}: unknown — click to allow`}
                            title="Current value unknown. Click to allow; right-click to deny."
                          >
                            ?
                          </button>
                        ) : (
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[var(--brand)]"
                            checked={matrix[mod.key][a.key]}
                            onChange={(e) => set(mod.key, a.key, e.target.checked)}
                            aria-label={`${mod.label} ${a.label}`}
                          />
                        )}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
        <div className="mt-5 flex items-center justify-end gap-2">
          {unknown.size > 0 && (
            <Button variant="ghost" onClick={() => setUnknown(new Set())}>
              Treat unknown as off
            </Button>
          )}
          <Button disabled={!dirty} loading={m.saveUserPerms.isPending || m.saveRolePerms.isPending} onClick={save}>
            Save access
          </Button>
        </div>
      </div>
    </Card>
  );
}
