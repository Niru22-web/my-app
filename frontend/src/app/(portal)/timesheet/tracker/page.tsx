"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock4,
  Download,
  Filter,
  Users,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import { today } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { DataTable, type Column } from "@/components/ui/data-table";
import { useToast } from "@/components/ui/toast";
import { downloadCsv } from "@/components/claims/claim-tabs";
import {
  useMonthlyTracker,
  type MonthlyTrackerEmployee,
} from "@/components/timesheet/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";

type FilterTab = "all" | "not_filled" | "incomplete" | "compliant";

export default function MonthlyTimesheetTrackerPage() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [department, setDepartment] = useState("");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const q = useMonthlyTracker({
    year,
    month,
    department: department || undefined,
  });

  const data = q.data;
  const kpis = data?.kpis;
  const weeks = data?.weeks ?? [];
  const allEmployees = data?.employees ?? [];

  // Filter employees
  const filteredEmployees = useMemo(() => {
    return allEmployees.filter((emp) => {
      if (filterTab === "not_filled" && emp.monthStatus !== "not_filled") return false;
      if (filterTab === "incomplete" && emp.monthStatus !== "incomplete") return false;
      if (filterTab === "compliant" && emp.monthStatus !== "compliant") return false;

      const s = search.trim().toLowerCase();
      if (!s) return true;
      return (
        emp.name.toLowerCase().includes(s) ||
        emp.employeeId.toLowerCase().includes(s) ||
        emp.email.toLowerCase().includes(s) ||
        emp.department.toLowerCase().includes(s) ||
        (emp.managerName ?? "").toLowerCase().includes(s)
      );
    });
  }, [allEmployees, filterTab, search]);

  // Departments list for dropdown
  const departments = useMemo(() => {
    return [...new Set(allEmployees.map((e) => e.department).filter(Boolean))].sort();
  }, [allEmployees]);

  // Previous / Next Month navigation
  const prevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  // Nudge / Send Reminder Mutation
  const remind = useMutation({
    mutationFn: async (empId: string) => {
      const res = await api<{ success: boolean; message: string }>(
        `compliance/trigger-reminder/${empId}`,
        { method: "POST" }
      );
      if (!res.success) throw new ApiError(404, res.message);
      return res;
    },
    onSuccess: (res) => {
      toast.success(res.message);
      void qc.invalidateQueries({ queryKey: ["monthly-tracker"] });
    },
    onError: (e) =>
      toast.error("Couldn’t send reminder", e instanceof ApiError ? e.message : undefined),
  });

  // Export Pivot Matrix to CSV
  const handleExport = () => {
    const headers = [
      "Employee ID",
      "Name",
      "Email",
      "Department",
      "Reporting Manager",
      ...weeks.map((w) => `${w.label} (Hours)`),
      ...weeks.map((w) => `${w.label} (Status)`),
      "Total Logged (Hrs)",
      "Target (Hrs)",
      "Compliance %",
      "Month Status",
    ];

    const rows = filteredEmployees.map((emp) => {
      const weekHours = weeks.map((w) => {
        const empW = emp.weeks.find((ew) => ew.weekIndex === w.weekIndex);
        return empW ? `${empW.loggedHours}h` : "0h";
      });

      const weekStatuses = weeks.map((w) => {
        const empW = emp.weeks.find((ew) => ew.weekIndex === w.weekIndex);
        return empW ? empW.status : "not_filled";
      });

      return [
        emp.employeeId,
        emp.name,
        emp.email,
        emp.department,
        emp.managerName ?? "—",
        ...weekHours,
        ...weekStatuses,
        `${emp.totalLoggedHours}h`,
        `${emp.totalTargetHours}h`,
        `${emp.compliancePct}%`,
        emp.monthStatus,
      ];
    });

    downloadCsv(`timesheet-pivot-${data?.monthName || "month"}-${year}.csv`, headers, rows);
  };

  // Build Dynamic Pivot Columns
  const columns: Column<MonthlyTrackerEmployee>[] = useMemo(() => {
    const cols: Column<MonthlyTrackerEmployee>[] = [
      {
        key: "employee",
        header: "Employee",
        sortValue: (e) => e.name,
        cell: (e) => (
          <div className="flex items-center gap-3">
            <Avatar name={e.name} size={32} />
            <div className="min-w-0 max-w-[200px]">
              <p className="truncate font-medium text-ink">{e.name}</p>
              <p className="truncate text-xs text-ink-subtle">
                {e.employeeId} · {e.department}
              </p>
              {e.managerName && (
                <p className="truncate text-[11px] text-ink-subtle">
                  Reports to: {e.managerName}
                </p>
              )}
            </div>
          </div>
        ),
      },
    ];

    // Add a column for each week of the month
    weeks.forEach((w) => {
      cols.push({
        key: `week_${w.weekIndex}`,
        header: (
          <div className="text-center">
            <span className="block font-semibold text-ink text-xs">{w.label}</span>
            <span className="block text-[10px] text-ink-subtle font-normal">
              Target: {w.expectedHours}h
            </span>
          </div>
        ),
        align: "center",
        cell: (e) => {
          const empW = e.weeks.find((ew) => ew.weekIndex === w.weekIndex);
          if (!empW) return <span className="text-xs text-ink-subtle">—</span>;

          if (empW.status === "on_leave") {
            return (
              <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border border-sky-200/80">
                On Leave
              </span>
            );
          }

          if (empW.status === "not_filled") {
            return (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-600 animate-pulse" />
                0h / {empW.targetHours}h
              </span>
            );
          }

          if (empW.status === "partial") {
            return (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200">
                {empW.loggedHours}h / {empW.targetHours}h
              </span>
            );
          }

          if (empW.status === "compliant") {
            return (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200">
                {empW.loggedHours}h
              </span>
            );
          }

          return <span className="text-xs text-ink-subtle">—</span>;
        },
      });
    });

    // Month Total Logged
    cols.push({
      key: "totalHours",
      header: "Month Total",
      align: "center",
      sortValue: (e) => e.totalLoggedHours,
      cell: (e) => (
        <div className="text-center">
          <p className="font-semibold text-xs text-ink">
            {e.totalLoggedHours}h{" "}
            <span className="text-ink-subtle font-normal">/ {e.totalTargetHours}h</span>
          </p>
          <div className="w-20 bg-line/60 rounded-full h-1.5 mx-auto mt-1 overflow-hidden">
            <div
              className={`h-full rounded-full ${
                e.compliancePct >= 100
                  ? "bg-emerald-500"
                  : e.compliancePct >= 50
                  ? "bg-amber-500"
                  : "bg-rose-500"
              }`}
              style={{ width: `${Math.min(100, e.compliancePct)}%` }}
            />
          </div>
          <span className="text-[10px] text-ink-subtle">{e.compliancePct}%</span>
        </div>
      ),
    });

    // Month Status
    cols.push({
      key: "status",
      header: "Status",
      align: "center",
      sortValue: (e) => e.monthStatus,
      cell: (e) => {
        if (e.monthStatus === "not_filled") {
          return <Badge tone="danger">Not Filled</Badge>;
        }
        if (e.monthStatus === "incomplete") {
          return <Badge tone="warning">Missing Weeks</Badge>;
        }
        return <Badge tone="success">Compliant</Badge>;
      },
    });

    // Actions (Nudge/Remind)
    cols.push({
      key: "actions",
      header: "Action",
      align: "right",
      cell: (e) => {
        if (e.monthStatus === "compliant") return null;
        return (
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              remind.mutate(e.id);
            }}
            disabled={remind.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-surface-muted hover:border-brand disabled:opacity-40"
            title={`Send timesheet reminder to ${e.name}`}
          >
            <BellRing className="h-3 w-3 text-amber-500" />
            <span>Nudge</span>
          </button>
        );
      },
    });

    return cols;
  }, [weeks, remind]);

  const filterTabs = [
    { key: "all", label: "All Employees", count: kpis?.totalEmployees },
    { key: "not_filled", label: "Not Filled / Defaulters", count: kpis?.notFilledCount },
    { key: "incomplete", label: "Missing Weeks", count: kpis?.incompleteCount },
    { key: "compliant", label: "Fully Compliant", count: kpis?.compliantCount },
  ];

  const monthLabel = data?.monthName ? `${data.monthName} ${year}` : `${year}-${month}`;

  return (
    <div className="space-y-5">
      {/* ── Page Header & Month Selector ─────────────────────────────────────── */}
      <PageHeader
        title="Monthly Timesheet Tracker (Pivot)"
        description="Comprehensive monthly pivot tracking employees who have filled or missed their timesheets across each week."
        actions={
          <div className="flex items-center gap-2">
            {/* Month Navigation */}
            <div className="flex items-center rounded-lg border border-line bg-surface p-1 shadow-sm">
              <button
                type="button"
                onClick={prevMonth}
                aria-label="Previous Month"
                className="grid h-7 w-7 place-items-center rounded text-ink-muted hover:bg-surface-muted hover:text-ink"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-1.5 px-3">
                <Calendar className="h-3.5 w-3.5 text-brand" />
                <span className="text-xs font-semibold text-ink min-w-[110px] text-center">
                  {monthLabel}
                </span>
              </div>
              <button
                type="button"
                onClick={nextMonth}
                aria-label="Next Month"
                className="grid h-7 w-7 place-items-center rounded text-ink-muted hover:bg-surface-muted hover:text-ink"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Export CSV */}
            <Button
              variant="secondary"
              onClick={handleExport}
              disabled={!filteredEmployees.length}
            >
              <Download className="h-4 w-4" /> Export Pivot
            </Button>
          </div>
        }
      />

      {/* ── Summary KPI Cards ─────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="KPIs">
        <StatCard
          label="Total Employees"
          icon={Users}
          tone="brand"
          loading={q.isLoading}
          value={formatNumber(kpis?.totalEmployees ?? 0)}
        />
        <StatCard
          label="Not Filled (0 hrs)"
          icon={XCircle}
          tone="danger"
          loading={q.isLoading}
          value={formatNumber(kpis?.notFilledCount ?? 0)}
          hint={`${formatNumber(kpis?.notFilledCount ?? 0)} employees haven't filled this month`}
        />
        <StatCard
          label="Missing Weeks"
          icon={AlertTriangle}
          tone="warning"
          loading={q.isLoading}
          value={formatNumber(kpis?.incompleteCount ?? 0)}
          hint="Logged some time but missed weeks"
        />
        <StatCard
          label="Fully Compliant"
          icon={CheckCircle2}
          tone="success"
          loading={q.isLoading}
          value={formatNumber(kpis?.compliantCount ?? 0)}
          hint={`${kpis?.compliancePercentage ?? 0}% firm compliance`}
        />
      </section>

      {/* ── Filter & Search Toolbar ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Department Filter */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-ink-subtle">
            <Filter className="h-3.5 w-3.5" />
            <span>Department:</span>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink focus:border-brand focus:outline-none"
            >
              <option value="">All Departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* ── Main Pivot Table ────────────────────────────────────────────────── */}
      <DataTable
        rows={filteredEmployees}
        columns={columns}
        rowKey={(e) => e.id}
        loading={q.isLoading}
        error={q.isError}
        onRetry={() => q.refetch()}
        pageSize={10}
        pageSizeOptions={[10, 25, 50, 100]}
        selectable
        selectedKeys={selectedIds}
        onSelectionChange={setSelectedIds}
        searchable
        searchPlaceholder="Search employee by name, ID, or department..."
        searchValue={search}
        onSearchChange={setSearch}
        filterTabs={filterTabs}
        activeFilterTab={filterTab}
        onFilterTabChange={(key) => setFilterTab(key as FilterTab)}
        itemsLabel="employees"
        empty={{
          icon: Clock4,
          title:
            filterTab === "not_filled"
              ? "Great news! No complete defaulters found for this month."
              : "No employees match your filters",
          description: "All employees have logged their expected timesheet hours.",
        }}
      />
    </div>
  );
}
