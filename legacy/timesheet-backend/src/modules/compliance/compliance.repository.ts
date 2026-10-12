// ============================================================
// Compliance Repository — Data Access Layer
// ============================================================

import { prisma } from '../../config/prisma';
import { ComplianceFilters } from './compliance.types';

export const getWeekMonday = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
};

export const getWeekFriday = (weekMonday: Date): Date => {
  const friday = new Date(weekMonday);
  friday.setDate(friday.getDate() + 4);
  friday.setHours(23, 59, 59, 999);
  return friday;
};

// ── Employees ──────────────────────────────────────────────

export const getActiveEmployees = async (
  user: { id: string; role: string; department?: string },
  filters: ComplianceFilters = {}
) => {
  const roleLower = user.role.toLowerCase();
  const isAdmin = ['admin', 'owner', 'it', 'hr'].some(r => roleLower.includes(r));
  const isPartner = roleLower.includes('partner');
  const isManager = roleLower.includes('manager');

  let where: any = { status: { in: ['active', 'Active'] } };

  // Role-based scoping
  if (!isAdmin) {
    if (isPartner) {
      where.OR = [
        { partners: { some: { partnerId: user.id } } },
        { reportingPartnerIds: { has: user.id } }
      ];
    } else if (isManager) {
      where.OR = [
        { managers: { some: { managerId: user.id } } },
        { reportingManagerIds: { has: user.id } },
        { subManagerIds: { has: user.id } }
      ];
    } else {
      // Employee sees only themselves
      where.id = user.id;
    }
  }

  // Additional filters
  if (filters.department) {
    where.department = { contains: filters.department, mode: 'insensitive' };
  }
  if (filters.employeeId) {
    where.id = filters.employeeId;
  }

  return prisma.employee.findMany({
    where,
    select: {
      id: true,
      employeeId: true,
      firstName: true,
      lastName: true,
      officeEmail: true,
      department: true,
      role: true,
      managers: {
        select: {
          manager: {
            select: { firstName: true, lastName: true, officeEmail: true }
          }
        }
      },
      partners: {
        select: {
          partner: {
            select: { firstName: true, lastName: true, officeEmail: true }
          }
        }
      }
    },
    orderBy: [{ department: 'asc' }, { firstName: 'asc' }]
  });
};

// ── Timelogs ────────────────────────────────────────────────

export const getWeekTimelogs = async (
  employeeIds: string[],
  weekStart: Date,
  weekEnd: Date
) => {
  return prisma.timelog.findMany({
    where: {
      employeeId: { in: employeeIds },
      date: { gte: weekStart, lte: weekEnd }
    },
    select: {
      id: true,
      employeeId: true,
      date: true,
      hours: true,
      submissionStatus: true,
      billableStatus: true,
      createdAt: true
    }
  });
};

export const getYesterdayTimelogs = async (
  employeeIds: string[],
  yesterday: Date
) => {
  const start = new Date(yesterday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(yesterday);
  end.setHours(23, 59, 59, 999);

  return prisma.timelog.findMany({
    where: {
      employeeId: { in: employeeIds },
      date: { gte: start, lte: end }
    },
    select: { employeeId: true, hours: true }
  });
};

// ── Leaves ──────────────────────────────────────────────────

export const getApprovedLeaves = async (
  employeeIds: string[],
  weekStart: Date,
  weekEnd: Date
) => {
  return prisma.leave.findMany({
    where: {
      employeeId: { in: employeeIds },
      status: { in: ['approved', 'APPROVED'] },
      fromDate: { lte: weekEnd },
      toDate: { gte: weekStart }
    },
    select: {
      employeeId: true,
      fromDate: true,
      toDate: true
    }
  });
};

// ── Compliance Logs ─────────────────────────────────────────

export const getComplianceLogs = async (
  employeeIds: string[],
  weekStart: Date
) => {
  return prisma.timesheetCompliance.findMany({
    where: {
      employeeId: { in: employeeIds },
      weekStart
    }
  });
};

export const upsertComplianceLog = async (
  employeeId: string,
  weekStart: Date,
  data: {
    complianceStatus: string;
    loggedHours: number;
    missingDays: string[];
    escalationLevel?: number;
    reminderSentDate?: Date;
    lastNotifiedTimestamp?: Date;
  }
) => {
  return prisma.timesheetCompliance.upsert({
    where: { employeeId_weekStart: { employeeId, weekStart } },
    update: {
      complianceStatus: data.complianceStatus,
      loggedHours: data.loggedHours,
      missingDays: data.missingDays,
      ...(data.escalationLevel !== undefined && { escalationLevel: data.escalationLevel }),
      ...(data.reminderSentDate && { reminderSentDate: data.reminderSentDate }),
      ...(data.lastNotifiedTimestamp && { lastNotifiedTimestamp: data.lastNotifiedTimestamp }),
      updatedAt: new Date()
    },
    create: {
      employeeId,
      weekStart,
      complianceStatus: data.complianceStatus,
      loggedHours: data.loggedHours,
      missingDays: data.missingDays,
      escalationLevel: data.escalationLevel || 0
    }
  });
};

// ── Reminder History ─────────────────────────────────────────

export const logReminderHistory = async (data: {
  employeeId: string;
  reminderType: string;
  weekStart: Date;
  hoursAtReminder: number;
  missingDaysAtReminder: string[];
  escalationLevel: number;
  ccEmails: string[];
}) => {
  return (prisma as any).reminderHistory.create({ data });
};

export const getReminderHistoryForEmployee = async (
  employeeId: string,
  weekStart: Date
) => {
  return (prisma as any).reminderHistory.findMany({
    where: { employeeId, weekStart },
    orderBy: { sentAt: 'desc' }
  });
};

export const getReminderCountThisWeek = async (
  employeeIds: string[],
  weekStart: Date
): Promise<Map<string, number>> => {
  const history = await (prisma as any).reminderHistory.findMany({
    where: {
      employeeId: { in: employeeIds },
      weekStart
    },
    select: { employeeId: true }
  });

  const countMap = new Map<string, number>();
  for (const item of history) {
    countMap.set(item.employeeId, (countMap.get(item.employeeId) || 0) + 1);
  }
  return countMap;
};

export const getTodayReminderCount = async (): Promise<number> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  return (prisma as any).reminderHistory.count({
    where: { sentAt: { gte: today, lte: todayEnd } }
  });
};

// ── Activity Feed ────────────────────────────────────────────

export const getRecentReminderActivity = async (limit = 20) => {
  const history = await (prisma as any).reminderHistory.findMany({
    take: limit,
    orderBy: { sentAt: 'desc' },
    include: {
      employee: {
        select: { firstName: true, lastName: true, employeeId: true }
      }
    }
  });
  return history;
};

// ── Historical Trends (last 4 weeks) ─────────────────────────

export const getWeeklyTrends = async (employeeIds: string[]) => {
  const trends = [];
  const now = new Date();

  for (let i = 3; i >= 0; i--) {
    const weekStart = getWeekMonday(new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000));
    const weekEnd = getWeekFriday(weekStart);

    const logs = await prisma.timesheetCompliance.findMany({
      where: {
        employeeId: { in: employeeIds },
        weekStart
      }
    });

    const total = employeeIds.length || 1;
    const compliant = logs.filter(l => l.complianceStatus === 'compliant').length;
    const avgHours =
      logs.reduce((sum, l) => sum + l.loggedHours, 0) / (logs.length || 1);

    trends.push({
      weekLabel: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      weekStart: weekStart.toISOString().split('T')[0],
      compliancePct: Math.round((compliant / total) * 100),
      avgHours: parseFloat(avgHours.toFixed(1)),
      missingCount: logs.filter(l => l.missingDays.length > 0).length,
      totalEmployees: total
    });
  }

  return trends;
};

// ── HR Emails ─────────────────────────────────────────────────

export const getHREmails = async (): Promise<string[]> => {
  const hrEmployees = await prisma.employee.findMany({
    where: { role: { equals: 'HR', mode: 'insensitive' }, status: { in: ['active', 'Active'] } },
    select: { officeEmail: true }
  });
  return hrEmployees.map(e => e.officeEmail).filter(Boolean) as string[];
};

// ── Repeated Offenders ────────────────────────────────────────

export const getRepeatedOffenders = async (
  employeeIds: string[]
): Promise<Set<string>> => {
  const now = new Date();
  const threeWeeksAgo = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);

  const logs = await prisma.timesheetCompliance.findMany({
    where: {
      employeeId: { in: employeeIds },
      weekStart: { gte: threeWeeksAgo },
      complianceStatus: { not: 'compliant' }
    },
    select: { employeeId: true }
  });

  const countMap = new Map<string, number>();
  for (const log of logs) {
    countMap.set(log.employeeId, (countMap.get(log.employeeId) || 0) + 1);
  }

  const offenders = new Set<string>();
  for (const [empId, count] of countMap.entries()) {
    if (count >= 2) offenders.add(empId); // Non-compliant 2+ weeks in last 3 = repeated
  }
  return offenders;
};
