"use client";

import { useMemo, useState } from "react";
import { ImportButton } from "@/components/ui/import-dialog";
import { useRouter } from "next/navigation";
import { Download, Eye, Mail, MailCheck, Power, UserCheck, UserPlus, Users, UserX } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError, assetUrl } from "@/lib/api";
import { today } from "@/lib/dates";
import { formatDate, formatHours, formatNumber } from "@/lib/format";
import { roleLabel } from "@/lib/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat";
import { Badge, statusTone } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Select } from "@/components/ui/inputs";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { downloadCsv } from "@/components/claims/claim-tabs";
import { canApprovePeople, canManagePeople, fullName, isEmployeeRole, useMgmtMutations, usePeople, type Person } from "@/components/management/api";
import { AddPersonDialog, InviteLinkDialog, PendingDialog } from "@/components/management/person-dialogs";
import { RowMenu } from "@/components/management/row-menu";

type StatusF = "active" | "pending" | "inactive" | "all";
const st = (p: Person) => {
  const s = (p.status ?? "").toLowerCase();
  if (s === "active" || s === "on leave") return "active";
  // Invited (hasn't registered yet) and registered-awaiting-approval are both "pending".
  if (s.startsWith("pending") || s === "invited") return "pending";
  return "inactive";
};
const raw = (p: Person) => (p.status ?? "").toLowerCase();

export default function EmployeesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const employee = isEmployeeRole(user?.role);
  const manage = canManagePeople(user?.role);
  const approver = canApprovePeople(user?.role);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusF>("active");
  const [role, setRole] = useState("");
  const [dept, setDept] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [toggle, setToggle] = useState<Person | null>(null);
  const [invite, setInvite] = useState<{ name: string; link: string } | null>(null);

  const q = usePeople();
  const m = useMgmtMutations();
  const all = useMemo(() => q.data ?? [], [q.data]);
  const roles = useMemo(() => [...new Set(all.map((p) => p.role).filter(Boolean) as string[])].sort(), [all]);
  const depts = useMemo(() => [...new Set(all.map((p) => p.department).filter(Boolean) as string[])].sort(), [all]);
  const rows = all.filter((p) => {
    if (status !== "all" && st(p) !== status) return false;
    if (role && p.role !== role) return false;
    if (dept && p.department !== dept) return false;
    const t = search.trim().toLowerCase();
    return !t || `${fullName(p)} ${p.officeEmail} ${p.employeeId} ${p.designation ?? ""}`.toLowerCase().includes(t);
  });
  const showHours = all.some((p) => p.loggedHours != null);

  const columns: Column<Person>[] = [
    {
      key: "name",
      header: employee ? "Team member" : "Employee",
      sortValue: (p) => fullName(p),
      cell: (p) => (
        <div className="flex items-center gap-3">
          <Avatar name={fullName(p)} src={assetUrl(p.profileImage)} size={34} />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{fullName(p)}</p>
            <p className="truncate text-xs text-ink-subtle">{p.officeEmail}</p>
          </div>
        </div>
      ),
    },
    { key: "code", header: "Code", hideBelow: "md", sortValue: (p) => p.employeeId, cell: (p) => <span className="text-ink-muted">{p.employeeId}</span> },
    {
      key: "role",
      header: "Role",
      sortValue: (p) => p.designation ?? "",
      cell: (p) => (
        <div className="min-w-0">
          <p className="truncate text-ink">{p.designation ?? roleLabel(p.role)}</p>
          <p className="truncate text-xs text-ink-subtle">
            {[p.department, roleLabel(p.role)].filter(Boolean).join(" · ")}
          </p>
        </div>
      ),
    },
    { key: "status", header: "Status", hideBelow: "sm", sortValue: (p) => p.status ?? "", cell: (p) => <Badge tone={statusTone(p.status)}>{(p.status ?? "—").replace(/_/g, " ")}</Badge> },
    { key: "joined", header: "Added", hideBelow: "lg", sortValue: (p) => p.createdAt ?? "", cell: (p) => <span className="text-ink-muted">{formatDate(p.createdAt)}</span> },
    ...(showHours ? [{ key: "hours", header: "Hours", align: "right" as const, hideBelow: "lg" as const, sortValue: (p: Person) => p.loggedHours ?? 0, cell: (p: Person) => (p.loggedHours != null ? formatHours(p.loggedHours) : "—") }] : []),
    {
      key: "act",
      header: "",
      align: "right",
      cell: (p) =>
        employee ? (
          <a href={`mailto:${p.officeEmail}`} onClick={(e) => e.stopPropagation()} className="inline-grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-brand" aria-label={`Email ${fullName(p)}`}>
            <Mail className="h-4 w-4" />
          </a>
        ) : (
          <RowMenu
            items={[
              { label: "View details", icon: <Eye className="h-4 w-4" />, onClick: () => router.push(`/management/employees/edit/${p.id}`) },
              ...(manage && ["active", "inactive"].includes(raw(p)) && p.id !== user?.id
                ? [{ label: raw(p) === "active" ? "Mark inactive" : "Reactivate", icon: <Power className="h-4 w-4" />, danger: raw(p) === "active", onClick: () => setToggle(p) }]
                : []),
              ...(approver && ["invited", "rejected"].includes(raw(p))
                ? [
                    {
                      label: raw(p) === "rejected" ? "Invite again" : "New invitation link",
                      icon: <MailCheck className="h-4 w-4" />,
                      onClick: () =>
                        m.resendInvite.mutate(p.id, {
                          onSuccess: (r) => (r?.inviteLink ? setInvite({ name: fullName(p), link: r.inviteLink }) : toast.success("Invitation renewed", p.officeEmail), void q.refetch()),
                          onError: (e) => toast.error("Couldn’t create the invitation", e instanceof ApiError ? e.message : undefined),
                        }),
                    },
                  ]
                : []),
            ]}
          />
        ),
    },
  ];

  const pending = all.filter((p) => st(p) === "pending").length;
  return (
    <div className="space-y-6">
      <PageHeader
        title={employee ? "My team" : "Employees"}
        description={employee ? "People who share your reporting manager or partner." : "Everyone you manage or can see in the firm."}
        actions={
          employee ? undefined : (
            <>
              {manage && <ImportButton kind="employees" label="Employees" invalidate={[["mgmt"], ["lookup"]]} />}
              {approver && (
                <Button variant="secondary" onClick={() => setPendingOpen(true)}>
                  <UserCheck className="h-4 w-4" /> Pending approvals
                </Button>
              )}
              {manage && (
                <Button onClick={() => setAddOpen(true)}>
                  <UserPlus className="h-4 w-4" /> Invite employee
                </Button>
              )}
            </>
          )
        }
      />

      {!employee && (
        <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Summary">
          <StatCard label="Active" icon={Users} tone="brand" loading={q.isLoading} value={formatNumber(all.filter((p) => st(p) === "active").length)} hint={`of ${formatNumber(all.length)}`} />
          <StatCard label="Pending" icon={UserCheck} loading={q.isLoading} value={formatNumber(pending)} hint="invited or awaiting approval" tone={pending ? "warning" : "neutral"} />
          <StatCard label="Inactive" icon={UserX} loading={q.isLoading} value={formatNumber(all.filter((p) => st(p) === "inactive").length)} />
          <StatCard label="Departments" icon={Users} loading={q.isLoading} value={formatNumber(depts.length)} />
        </section>
      )}

      <DataTable
        exportName={false}
        itemsLabel={employee ? "team members" : "employees"}
        filterTabs={[
          { key: "active", label: "Active", count: all.filter((p) => st(p) === "active").length },
          ...(employee
            ? []
            : [
                { key: "pending", label: "Pending", count: pending },
                { key: "inactive", label: "Inactive", count: all.filter((p) => st(p) === "inactive").length },
              ]),
          { key: "all", label: "All", count: all.length },
        ]}
        activeFilterTab={status}
        onFilterTabChange={(k) => setStatus(k as StatusF)}
        searchable
        searchPlaceholder="Search name, email or code"
        searchValue={search}
        onSearchChange={setSearch}
        toolbarActions={
          employee ? undefined : (
            <>
              <Select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)} className="w-44">
                <option value="">All roles</option>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </Select>
              <Select aria-label="Department" value={dept} onChange={(e) => setDept(e.target.value)} className="w-48">
                <option value="">All departments</option>
                {depts.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </Select>
              <Button
                variant="secondary"
                size="sm"
                disabled={!rows.length}
                onClick={() =>
                  downloadCsv(
                    `employees-${today()}.csv`,
                    ["Employee code", "First name", "Last name", "Office email", "Role", "Designation", "Department", "Status", "Added"],
                    rows.map((p) => [p.employeeId, p.firstName, p.lastName, p.officeEmail, p.role, p.designation, p.department, p.status, p.createdAt?.slice(0, 10)]),
                  )
                }
              >
                <Download className="h-4 w-4" /> Export
              </Button>
            </>
          )
        }
        rows={rows}
        rowLabel={employee ? undefined : (p) => `Open ${fullName(p)}`}
        columns={columns}
        rowKey={(p) => p.id}
        loading={q.isLoading}
        error={q.isError}
        onRetry={() => q.refetch()}
        onRowClick={employee ? undefined : (p) => router.push(`/management/employees/edit/${p.id}`)}
        initialSort={{ key: "name", dir: "asc" }}
        pageSize={20}
        empty={{ icon: Users, title: search || role || dept ? "No one matches these filters" : "No employees in this view" }}
      />

      <AddPersonDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <PendingDialog open={pendingOpen} onClose={() => setPendingOpen(false)} />

      <ConfirmDialog
        open={!!toggle}
        onClose={() => setToggle(null)}
        tone={toggle && st(toggle) === "active" ? "danger" : "primary"}
        title={toggle && st(toggle) === "active" ? `Mark ${fullName(toggle)} inactive?` : `Reactivate ${toggle ? fullName(toggle) : ""}?`}
        confirmLabel={toggle && st(toggle) === "active" ? "Mark inactive" : "Reactivate"}
        busy={m.togglePerson.isPending}
        description={toggle && st(toggle) === "active" ? "They won’t be able to sign in. Their timesheets, leave and claims are kept." : "They’ll be able to sign in again."}
        onConfirm={() =>
          toggle &&
          m.togglePerson.mutate(toggle.id, {
            onSuccess: () => (toast.success(st(toggle) === "active" ? "Marked inactive" : "Reactivated", fullName(toggle)), setToggle(null)),
            onError: (e) => toast.error("Couldn’t change status", e instanceof ApiError ? e.message : undefined),
          })
        }
      />
      {invite && <InviteLinkDialog name={invite.name} link={invite.link} onClose={() => setInvite(null)} />}
    </div>
  );
}
