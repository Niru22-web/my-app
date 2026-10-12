import ExcelJS from 'exceljs';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

type ReportRoleScope = 'all' | 'team' | 'self';

export interface ReportFilters {
  fromDate?: string;
  toDate?: string;
  granularity?: 'day' | 'week' | 'month';
  employeeIds?: string[];
  projectIds?: string[];
  departmentIds?: string[];
  statuses?: string[];
  tab?: string;
}

export interface ReportContext {
  user: any;
  roleScope: ReportRoleScope;
  employeeWhere: Prisma.EmployeeWhereInput;
  accessibleEmployeeIds: string[] | null;
  accessibleEmployeeCodes: string[] | null;
  dateFrom: Date;
  dateTo: Date;
  granularity: 'day' | 'week' | 'month';
}

export interface ReportOverview {
  summary: Array<{ label: string; value: string; trend: string; tone: 'brand' | 'success' | 'warning' | 'danger' | 'neutral' }>;
  trend: Array<{ label: string; hours: number; sessions: number; attendanceHours: number }>;
  topEmployees: Array<{ id: string; name: string; department: string; hours: number; sessions: number }>;
  topProjects: Array<{ id: string; name: string; client: string; hours: number; sessions: number }>;
  departmentBreakdown: Array<{ label: string; value: number }>;
  attendanceBreakdown: Array<{ label: string; value: number }>;
  leaveBreakdown: Array<{ label: string; value: number }>;
  reimbursementBreakdown: Array<{ label: string; value: number }>;
  recentActivity: Array<{
    label: string;
    detail: string;
    tone: 'brand' | 'success' | 'warning' | 'danger' | 'neutral';
    timestamp: string;
  }>;
  scope: {
    roleScope: ReportRoleScope;
    fromDate: string;
    toDate: string;
    granularity: 'day' | 'week' | 'month';
  };
}

const MANAGEMENT_ROLES = new Set([
  'admin',
  'hr',
  'manager',
  'partner',
  'accountant',
  'accounts',
  'accounts_admin',
  'accounts_manager',
  'accounts_executive',
  'finance_approver',
  'ar_manager',
  'ap_manager',
  'it',
  'owner'
]);

const TEAM_REPORT_ROLES = new Set(['manager', 'partner']);

const SELF_REPORT_ROLES = new Set(['employee', 'user']);

function normalizeRole(role?: string) {
  return String(role || '').toLowerCase();
}

function resolveDateRange(filters: ReportFilters) {
  const fromDate = filters.fromDate ? new Date(filters.fromDate) : subDays(new Date(), 29);
  const toDate = filters.toDate ? new Date(filters.toDate) : new Date();
  return {
    from: startOfDay(fromDate),
    to: endOfDay(toDate)
  };
}

function getUserIdentifiers(user: any) {
  return {
    employeeId: String(user?.id || ''),
    employeeCode: String(user?.employeeId || user?.employeeCode || user?.id || '')
  };
}

function buildEmployeeWhere(user: any): { scope: ReportRoleScope; where: Prisma.EmployeeWhereInput } {
  const role = normalizeRole(user?.role);
  const identifiers = getUserIdentifiers(user);

  if (MANAGEMENT_ROLES.has(role) || !role) {
    return { scope: 'all', where: {} };
  }

  const selfWhere: Prisma.EmployeeWhereInput = {
    OR: [
      { id: identifiers.employeeId },
      { employeeId: identifiers.employeeCode }
    ]
  };

  if (TEAM_REPORT_ROLES.has(role)) {
    const teamWhere: Prisma.EmployeeWhereInput = {
      OR: [
        selfWhere,
        { managerId: identifiers.employeeId },
        { partnerId: identifiers.employeeId },
        { subManagerId: identifiers.employeeId },
        { reportingManagerIds: { has: identifiers.employeeId } },
        { reportingPartnerIds: { has: identifiers.employeeId } },
        { subManagerIds: { has: identifiers.employeeId } }
      ]
    };

    return { scope: 'team', where: teamWhere };
  }

  if (SELF_REPORT_ROLES.has(role)) {
    return { scope: 'self', where: selfWhere };
  }

  return { scope: 'self', where: selfWhere };
}

async function resolveEmployeeScope(user: any) {
  const { scope, where } = buildEmployeeWhere(user);

  if (scope === 'all') {
    return {
      scope,
      employeeWhere: where,
      accessibleEmployeeIds: null as string[] | null,
      accessibleEmployeeCodes: null as string[] | null
    };
  }

  const employees = await prisma.employee.findMany({
    where,
    select: {
      id: true,
      employeeId: true
    }
  });

  return {
    scope,
    employeeWhere: where,
    accessibleEmployeeIds: employees.map(employee => employee.id),
    accessibleEmployeeCodes: employees.map(employee => employee.employeeId)
  };
}

async function buildContext(user: any, filters: ReportFilters): Promise<ReportContext> {
  const dateRange = resolveDateRange(filters);
  const scope = await resolveEmployeeScope(user);

  return {
    user,
    roleScope: scope.scope,
    employeeWhere: scope.employeeWhere,
    accessibleEmployeeIds: scope.accessibleEmployeeIds,
    accessibleEmployeeCodes: scope.accessibleEmployeeCodes,
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    granularity: filters.granularity || 'day'
  };
}

function bucketDate(input: Date, granularity: 'day' | 'week' | 'month') {
  if (granularity === 'month') {
    return format(input, 'MMM yyyy');
  }

  if (granularity === 'week') {
    const weekStart = new Date(input);
    const day = weekStart.getDay();
    const shift = (day + 6) % 7;
    weekStart.setDate(weekStart.getDate() - shift);
    return format(weekStart, 'dd MMM');
  }

  return format(input, 'dd MMM');
}

function bucketSortKey(input: Date, granularity: 'day' | 'week' | 'month') {
  if (granularity === 'month') {
    return format(input, 'yyyy-MM');
  }

  if (granularity === 'week') {
    const weekStart = new Date(input);
    const day = weekStart.getDay();
    const shift = (day + 6) % 7;
    weekStart.setDate(weekStart.getDate() - shift);
    return format(weekStart, 'yyyy-MM-dd');
  }

  return format(input, 'yyyy-MM-dd');
}

function normalizeSeries<T extends { label: string }>(rows: T[]) {
  return rows.filter(row => row.label && row.label !== 'N/A');
}

async function fetchAccessibleProjects(context: ReportContext, projectIds: string[] = []) {
  if (projectIds.length > 0) {
    return prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, name: true, clientId: true, client: { select: { name: true } } }
    });
  }

  if (!context.accessibleEmployeeIds) {
    return prisma.project.findMany({
      select: { id: true, name: true, clientId: true, client: { select: { name: true } } },
      take: 50,
      orderBy: { name: 'asc' }
    });
  }

  const projectUsage = await prisma.job.findMany({
    where: {
      timelogs: {
        some: {
          employeeId: { in: context.accessibleEmployeeIds },
          date: {
            gte: context.dateFrom,
            lte: context.dateTo
          }
        }
      }
    },
    select: {
      project: {
        select: {
          id: true,
          name: true,
          clientId: true,
          client: { select: { name: true } }
        }
      }
    },
    distinct: ['projectId']
  });

  return projectUsage.map(job => job.project).filter(Boolean) as Array<{
    id: string;
    name: string;
    clientId: string;
    client: { name: string } | null;
  }>;
}

export async function getReportOverview(user: any, filters: ReportFilters): Promise<ReportOverview> {
  const context = await buildContext(user, filters);
  const employeeFilter = context.accessibleEmployeeIds
    ? { in: context.accessibleEmployeeIds }
    : undefined;
  const employeeCodeFilter = context.accessibleEmployeeCodes
    ? { in: context.accessibleEmployeeCodes }
    : undefined;

  const timelogWhere: Prisma.TimelogWhereInput = {
    date: {
      gte: context.dateFrom,
      lte: context.dateTo
    }
  };

  if (employeeFilter) {
    timelogWhere.employeeId = employeeFilter;
  }

  if (filters.projectIds?.length) {
    timelogWhere.projectId = { in: filters.projectIds };
  }

  const attendanceWhere: Prisma.attendanceWhereInput = {
    date: {
      gte: context.dateFrom,
      lte: context.dateTo
    }
  };

  if (employeeCodeFilter) {
    attendanceWhere.employee_id = employeeCodeFilter;
  }

  const leaveWhere: Prisma.LeaveWhereInput = {
    appliedDate: {
      gte: context.dateFrom,
      lte: context.dateTo
    }
  };

  if (employeeFilter) {
    leaveWhere.employeeId = employeeFilter;
  }

  const reimbursementWhere: Prisma.ReimbursementWhereInput = {
    date: {
      gte: context.dateFrom,
      lte: context.dateTo
    }
  };

  if (employeeFilter) {
    reimbursementWhere.employeeId = employeeFilter;
  }

  const [employeesCount, projectsCount, timelogs, attendanceRows, leaveRows, reimbursements, leaveBalances, employeeHours, projectHours, attendanceStatus, leaveStatus, reimbursementStatus] = await Promise.all([
    prisma.employee.count({ where: context.employeeWhere }),
    prisma.project.count(),
    prisma.timelog.findMany({
      where: timelogWhere,
      select: {
        id: true,
        hours: true,
        date: true,
        submissionStatus: true,
        billableStatus: true,
        employeeId: true,
        projectId: true,
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            department: true,
            designation: true
          }
        },
        job: {
          select: {
            project: {
              select: {
                id: true,
                name: true,
                client: { select: { name: true } }
              }
            }
          }
        }
      },
      orderBy: { date: 'desc' },
      take: 500
    }),
    prisma.attendance.findMany({
      where: attendanceWhere,
      select: {
        id: true,
        employee_id: true,
        status: true,
        total_hours: true,
        date: true,
        location_name: true,
        Employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            department: true
          }
        }
      },
      orderBy: { date: 'desc' },
      take: 500
    }),
    prisma.leave.findMany({
      where: leaveWhere,
      select: {
        id: true,
        type: true,
        status: true,
        totalDays: true,
        appliedDate: true,
        employeeId: true,
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            department: true
          }
        }
      },
      orderBy: { appliedDate: 'desc' },
      take: 500
    }),
    prisma.reimbursement.findMany({
      where: reimbursementWhere,
      select: {
        id: true,
        category: true,
        status: true,
        amount: true,
        date: true,
        employeeId: true,
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            department: true
          }
        }
      },
      orderBy: { date: 'desc' },
      take: 500
    }),
    prisma.leaveBalance.findMany({
      where: context.accessibleEmployeeIds
        ? { employeeId: { in: context.accessibleEmployeeIds } }
        : undefined,
      select: {
        employeeId: true,
        remainingLeaves: true,
        usedLeaves: true,
        totalLeaves: true
      }
    }),
    prisma.timelog.groupBy({
      by: ['employeeId'],
      where: timelogWhere,
      _sum: { hours: true },
      _count: { _all: true },
      orderBy: { _sum: { hours: 'desc' } },
      take: 8
    }),
    prisma.timelog.groupBy({
      by: ['projectId'],
      where: timelogWhere,
      _sum: { hours: true },
      _count: { _all: true },
      orderBy: { _sum: { hours: 'desc' } },
      take: 8
    }),
    prisma.attendance.groupBy({
      by: ['status'],
      where: attendanceWhere,
      _count: { _all: true },
      _sum: { total_hours: true }
    }),
    prisma.leave.groupBy({
      by: ['status'],
      where: leaveWhere,
      _count: { _all: true },
      _sum: { totalDays: true }
    }),
    prisma.reimbursement.groupBy({
      by: ['status'],
      where: reimbursementWhere,
      _count: { _all: true },
      _sum: { amount: true }
    })
  ]);

  const employeeMap = new Map(
    timelogs.map(item => [item.employeeId, item.employee])
  );

  const projectMap = new Map(
    timelogs
      .filter(item => item.job?.project)
      .map(item => [item.projectId, item.job!.project])
  );

  const employeeHoursRows = employeeHours.map(row => {
    const employee = employeeMap.get(row.employeeId);
    return {
      label: employee ? `${employee.firstName} ${employee.lastName || ''}`.trim() : row.employeeId,
      value: Number(row._sum.hours || 0)
    };
  });

  const projectHoursRows = projectHours.map(row => {
    const project = projectMap.get(row.projectId);
    return {
      label: project?.name || row.projectId,
      value: Number(row._sum.hours || 0)
    };
  });

  const trendBucket = new Map<string, { label: string; sortKey: string; hours: number; sessions: number; attendanceHours: number }>();

  timelogs.forEach(item => {
    const label = bucketDate(new Date(item.date), context.granularity);
    const sortKey = bucketSortKey(new Date(item.date), context.granularity);
    const bucket = trendBucket.get(label) || { label, sortKey, hours: 0, sessions: 0, attendanceHours: 0 };
    bucket.hours += Number(item.hours || 0);
    bucket.sessions += 1;
    trendBucket.set(label, bucket);
  });

  attendanceRows.forEach(item => {
    const label = bucketDate(new Date(item.date), context.granularity);
    const sortKey = bucketSortKey(new Date(item.date), context.granularity);
    const bucket = trendBucket.get(label) || { label, sortKey, hours: 0, sessions: 0, attendanceHours: 0 };
    bucket.attendanceHours += Number(item.total_hours || 0);
    trendBucket.set(label, bucket);
  });

  const trend = Array.from(trendBucket.values())
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .map(({ sortKey, ...rest }) => rest);

  const departmentHours = new Map<string, number>();
  timelogs.forEach(item => {
    const department = item.employee?.department || 'General';
    departmentHours.set(department, (departmentHours.get(department) || 0) + Number(item.hours || 0));
  });

  const summaryHours = timelogs.reduce((total, item) => total + Number(item.hours || 0), 0);
  const billableHours = timelogs
    .filter(item => String(item.billableStatus || '').toLowerCase().includes('billable'))
    .reduce((total, item) => total + Number(item.hours || 0), 0);
  const attendanceHours = attendanceRows.reduce((total, item) => total + Number(item.total_hours || 0), 0);
  const approvedLeaves = leaveRows
    .filter(item => String(item.status || '').toLowerCase().includes('approved'))
    .reduce((total, item) => total + Number(item.totalDays || 0), 0);
  const pendingLeaves = leaveRows.filter(item => String(item.status || '').toLowerCase().includes('pending')).length;
  const reimbursementTotal = reimbursements
    .filter(item => String(item.status || '').toLowerCase().includes('approve') || String(item.status || '').toLowerCase().includes('paid'))
    .reduce((total, item) => total + Number(item.amount || 0), 0);

  const summary = [
    {
      label: 'Total Employees',
      value: employeesCount.toLocaleString(),
      trend: context.roleScope === 'all' ? 'Enterprise scope' : 'Scoped view',
      tone: 'brand' as const
    },
    {
      label: 'Logged Hours',
      value: summaryHours.toFixed(1),
      trend: `${timelogs.length} entries`,
      tone: 'success' as const
    },
    {
      label: 'Billable Hours',
      value: billableHours.toFixed(1),
      trend: `${summaryHours > 0 ? Math.round((billableHours / summaryHours) * 100) : 0}% of total`,
      tone: 'warning' as const
    },
    {
      label: 'Active Projects',
      value: projectsCount.toLocaleString(),
      trend: 'Current workspace',
      tone: 'neutral' as const
    },
    {
      label: 'Attendance Hours',
      value: attendanceHours.toFixed(1),
      trend: `${attendanceRows.length} attendance rows`,
      tone: 'brand' as const
    },
    {
      label: 'Leave Balance',
      value: leaveBalances.reduce((total, item) => total + Number(item.remainingLeaves || 0), 0).toFixed(0),
      trend: `${approvedLeaves.toFixed(1)} days approved`,
      tone: 'success' as const
    },
    {
      label: 'Pending Leaves',
      value: pendingLeaves.toLocaleString(),
      trend: 'Awaiting review',
      tone: 'danger' as const
    },
    {
      label: 'Reimbursements',
      value: reimbursementTotal.toFixed(2),
      trend: `${reimbursements.length} claim rows`,
      tone: 'neutral' as const
    }
  ];

  const attendanceBreakdown = attendanceStatus.map(row => ({
    label: row.status,
    value: Number(row._count._all || 0)
  }));

  const leaveBreakdown = leaveStatus.map(row => ({
    label: row.status,
    value: Number(row._sum.totalDays || 0)
  }));

  const reimbursementBreakdown = reimbursementStatus.map(row => ({
    label: row.status,
    value: Number(row._sum.amount || 0)
  }));

  const topEmployees = employeeHoursRows
    .map(row => {
      const source = employeeHours.find(item => {
        const employee = employeeMap.get(item.employeeId);
        return employee ? `${employee.firstName} ${employee.lastName || ''}`.trim() === row.label : false;
      });

      return {
        id: row.label,
        name: row.label,
        department: source ? employeeMap.get(source.employeeId)?.department || 'General' : 'General',
        hours: row.value,
        sessions: source?._count._all || 0
      };
    })
    .slice(0, 6);

  const topProjects = projectHoursRows
    .map(row => {
      const source = projectHours.find(item => projectMap.get(item.projectId)?.name === row.label);
      const project = source ? projectMap.get(source.projectId) : undefined;
      return {
        id: row.label,
        name: row.label,
        client: project?.client?.name || 'Client',
        hours: row.value,
        sessions: source?._count._all || 0
      };
    })
    .slice(0, 6);

  const recentActivity = [
    ...timelogs.slice(0, 3).map(item => ({
      label: `${item.employee.firstName} ${item.employee.lastName || ''}`.trim(),
      detail: `Logged ${Number(item.hours || 0).toFixed(1)}h on ${item.job?.project?.name || 'project work'}`,
      tone: 'brand' as const,
      timestamp: format(new Date(item.date), 'dd MMM, h:mm a')
    })),
    ...attendanceRows.slice(0, 2).map(item => ({
      label: `${item.Employee.firstName} ${item.Employee.lastName || ''}`.trim(),
      detail: `Attendance ${item.status} at ${item.location_name || 'workspace'}`,
      tone: item.status === 'Present' ? 'success' as const : item.status === 'Late' ? 'warning' as const : 'neutral' as const,
      timestamp: format(new Date(item.date), 'dd MMM')
    })),
    ...leaveRows.slice(0, 2).map(item => ({
      label: `${item.employee.firstName} ${item.employee.lastName || ''}`.trim(),
      detail: `${item.type} request marked ${item.status}`,
      tone: String(item.status || '').toLowerCase().includes('approve') ? 'success' as const : 'warning' as const,
      timestamp: format(new Date(item.appliedDate), 'dd MMM')
    }))
  ].slice(0, 7);

  return {
    summary,
    trend: trend.length > 0 ? trend : [{ label: format(context.dateFrom, 'dd MMM'), hours: 0, sessions: 0, attendanceHours: 0 }],
    topEmployees: topEmployees.filter(item => item.name),
    topProjects: topProjects.filter(item => item.name),
    departmentBreakdown: normalizeSeries(
      Array.from(departmentHours.entries()).map(([label, value]) => ({ label, value }))
    ).sort((a, b) => b.value - a.value),
    attendanceBreakdown,
    leaveBreakdown,
    reimbursementBreakdown,
    recentActivity,
    scope: {
      roleScope: context.roleScope,
      fromDate: format(context.dateFrom, 'yyyy-MM-dd'),
      toDate: format(context.dateTo, 'yyyy-MM-dd'),
      granularity: context.granularity
    }
  };
}

export async function getReportOptions(user: any) {
  const scope = await resolveEmployeeScope(user);

  const [employees, projects, clients] = await Promise.all([
    prisma.employee.findMany({
      where: scope.employeeWhere,
      select: {
        id: true,
        employeeId: true,
        firstName: true,
        lastName: true,
        department: true,
        designation: true,
        role: true
      },
      orderBy: { firstName: 'asc' },
      take: 100
    }),
    fetchAccessibleProjects({
      user,
      roleScope: scope.scope,
      employeeWhere: scope.employeeWhere,
      accessibleEmployeeIds: scope.accessibleEmployeeIds,
      accessibleEmployeeCodes: scope.accessibleEmployeeCodes,
      dateFrom: subDays(new Date(), 3650),
      dateTo: new Date(),
      granularity: 'day'
    } as ReportContext),
    prisma.client.findMany({
      select: { id: true, name: true, alias: true },
      orderBy: { name: 'asc' },
      take: 100
    })
  ]);

  return {
    employees: employees.map(employee => ({
      value: employee.id,
      label: `${employee.firstName} ${employee.lastName || ''}`.trim(),
      meta: `${employee.department} · ${employee.designation}`
    })),
    departments: Array.from(new Set(employees.map(employee => employee.department).filter(Boolean))).map(value => ({
      value,
      label: value
    })),
    projects: projects.map(project => ({
      value: project.id,
      label: project.name,
      meta: project.client?.name || 'No client'
    })),
    clients: clients.map(client => ({
      value: client.id,
      label: client.name,
      meta: client.alias || client.name
    })),
    statuses: {
      attendance: ['Present', 'Late', 'Absent', 'Half Day', 'WFH'],
      leaves: ['pending', 'approved', 'rejected', 'cancelled'],
      reimbursements: ['PENDING_MANAGER', 'PENDING_PARTNER', 'APPROVED', 'PAID', 'REJECTED'],
      timelogs: ['billable', 'non_billable', 'submitted', 'approved', 'rejected']
    }
  };
}

export async function queryReportData(user: any, payload: any) {
  const filters: ReportFilters = {
    fromDate: payload.fromDate,
    toDate: payload.toDate,
    granularity: payload.granularity,
    employeeIds: Array.isArray(payload.employeeIds) ? payload.employeeIds : [],
    projectIds: Array.isArray(payload.projectIds) ? payload.projectIds : [],
    departmentIds: Array.isArray(payload.departmentIds) ? payload.departmentIds : [],
    statuses: Array.isArray(payload.statuses) ? payload.statuses : [],
    tab: payload.tab
  };

  const context = await buildContext(user, filters);
  const groupBy = String(payload.groupBy || 'date');
  const dataset = String(payload.dataset || 'timesheet');
  const limit = Math.min(Number(payload.limit || 10), 20);

  const employeeFilter = context.accessibleEmployeeIds
    ? { in: context.accessibleEmployeeIds }
    : undefined;
  const employeeCodeFilter = context.accessibleEmployeeCodes
    ? { in: context.accessibleEmployeeCodes }
    : undefined;

  if (dataset === 'attendance') {
    const where: Prisma.attendanceWhereInput = {
      date: { gte: context.dateFrom, lte: context.dateTo }
    };
    if (employeeCodeFilter) where.employee_id = employeeCodeFilter;
    if (filters.statuses?.length) where.status = { in: filters.statuses };

    const rows = await prisma.attendance.findMany({
      where,
      select: {
        employee_id: true,
        status: true,
        total_hours: true,
        date: true,
        Employee: { select: { firstName: true, lastName: true, department: true } }
      },
      orderBy: { date: 'desc' },
      take: 500
    });

    const grouped = new Map<string, { label: string; value: number; count: number }>();
    rows.forEach(row => {
      const label = groupBy === 'status'
        ? row.status
        : groupBy === 'department'
          ? row.Employee.department || 'General'
          : bucketDate(new Date(row.date), context.granularity);
      const bucket = grouped.get(label) || { label, value: 0, count: 0 };
      bucket.value += Number(row.total_hours || 0);
      bucket.count += 1;
      grouped.set(label, bucket);
    });

    return Array.from(grouped.values())
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);
  }

  if (dataset === 'leaves') {
    const where: Prisma.LeaveWhereInput = {
      appliedDate: { gte: context.dateFrom, lte: context.dateTo }
    };
    if (employeeFilter) where.employeeId = employeeFilter;
    if (filters.statuses?.length) where.status = { in: filters.statuses };

    const rows = await prisma.leave.findMany({
      where,
      select: {
        type: true,
        status: true,
        totalDays: true,
        appliedDate: true,
        employee: { select: { firstName: true, lastName: true, department: true } }
      },
      orderBy: { appliedDate: 'desc' },
      take: 500
    });

    const grouped = new Map<string, { label: string; value: number; count: number }>();
    rows.forEach(row => {
      const label = groupBy === 'type'
        ? row.type
        : groupBy === 'department'
          ? row.employee.department || 'General'
          : groupBy === 'status'
            ? row.status
            : bucketDate(new Date(row.appliedDate), context.granularity);
      const bucket = grouped.get(label) || { label, value: 0, count: 0 };
      bucket.value += Number(row.totalDays || 0);
      bucket.count += 1;
      grouped.set(label, bucket);
    });

    return Array.from(grouped.values())
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);
  }

  if (dataset === 'reimbursement') {
    const where: Prisma.ReimbursementWhereInput = {
      date: { gte: context.dateFrom, lte: context.dateTo }
    };
    if (employeeFilter) where.employeeId = employeeFilter;
    if (filters.statuses?.length) where.status = { in: filters.statuses };

    const rows = await prisma.reimbursement.findMany({
      where,
      select: {
        category: true,
        status: true,
        amount: true,
        date: true,
        employee: { select: { firstName: true, lastName: true, department: true } }
      },
      orderBy: { date: 'desc' },
      take: 500
    });

    const grouped = new Map<string, { label: string; value: number; count: number }>();
    rows.forEach(row => {
      const label = groupBy === 'category'
        ? row.category
        : groupBy === 'department'
          ? row.employee.department || 'General'
          : groupBy === 'status'
            ? row.status
            : bucketDate(new Date(row.date), context.granularity);
      const bucket = grouped.get(label) || { label, value: 0, count: 0 };
      bucket.value += Number(row.amount || 0);
      bucket.count += 1;
      grouped.set(label, bucket);
    });

    return Array.from(grouped.values())
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);
  }

  const where: Prisma.TimelogWhereInput = {
    date: { gte: context.dateFrom, lte: context.dateTo }
  };
  if (employeeFilter) where.employeeId = employeeFilter;
  if (filters.projectIds?.length) where.projectId = { in: filters.projectIds };
  if (filters.statuses?.length) where.submissionStatus = { in: filters.statuses };

  const rows = await prisma.timelog.findMany({
    where,
    select: {
      hours: true,
      date: true,
      submissionStatus: true,
      billableStatus: true,
      employee: {
        select: {
          firstName: true,
          lastName: true,
          department: true
        }
      },
      job: {
        select: {
          project: {
            select: {
              name: true,
              client: { select: { name: true } }
            }
          }
        }
      }
    },
    orderBy: { date: 'desc' },
    take: 500
  });

  const grouped = new Map<string, { label: string; value: number; count: number }>();
  rows.forEach(row => {
    const label = groupBy === 'employee'
      ? `${row.employee.firstName} ${row.employee.lastName || ''}`.trim()
      : groupBy === 'project'
        ? row.job?.project?.name || 'Unassigned'
        : groupBy === 'department'
          ? row.employee.department || 'General'
          : groupBy === 'status'
            ? row.submissionStatus || 'unknown'
            : bucketDate(new Date(row.date), context.granularity);
    const bucket = grouped.get(label) || { label, value: 0, count: 0 };
    bucket.value += Number(row.hours || 0);
    bucket.count += 1;
    grouped.set(label, bucket);
  });

  return Array.from(grouped.values())
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export async function exportReportWorkbook(user: any, filters: ReportFilters, formatType: 'xlsx' | 'csv') {
  const overview = await getReportOverview(user, filters);
  const workbook = new ExcelJS.Workbook();

  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Label', key: 'label', width: 24 },
    { header: 'Value', key: 'value', width: 16 },
    { header: 'Trend', key: 'trend', width: 24 },
    { header: 'Tone', key: 'tone', width: 14 }
  ];
  summarySheet.addRows(overview.summary);

  const trendSheet = workbook.addWorksheet('Trend');
  trendSheet.columns = [
    { header: 'Label', key: 'label', width: 18 },
    { header: 'Hours', key: 'hours', width: 12 },
    { header: 'Sessions', key: 'sessions', width: 12 },
    { header: 'Attendance Hours', key: 'attendanceHours', width: 18 }
  ];
  trendSheet.addRows(overview.trend);

  const employeesSheet = workbook.addWorksheet('Top Employees');
  employeesSheet.columns = [
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Department', key: 'department', width: 18 },
    { header: 'Hours', key: 'hours', width: 12 },
    { header: 'Sessions', key: 'sessions', width: 12 }
  ];
  employeesSheet.addRows(overview.topEmployees);

  const projectsSheet = workbook.addWorksheet('Top Projects');
  projectsSheet.columns = [
    { header: 'Project', key: 'name', width: 28 },
    { header: 'Client', key: 'client', width: 22 },
    { header: 'Hours', key: 'hours', width: 12 },
    { header: 'Sessions', key: 'sessions', width: 12 }
  ];
  projectsSheet.addRows(overview.topProjects);

  if (formatType === 'csv') {
    const summaryRows = [
      ['Label', 'Value', 'Trend', 'Tone'],
      ...overview.summary.map(item => [item.label, item.value, item.trend, item.tone])
    ];
    return Buffer.from(summaryRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n'));
  }

  return workbook.xlsx.writeBuffer();
}
