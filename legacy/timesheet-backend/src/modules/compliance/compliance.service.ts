// ============================================================
// Compliance Service — Business Logic + Risk Engine
// ============================================================

import {
  EmployeeComplianceRecord,
  RiskLevel,
  RiskScoreInput,
  ComplianceDashboardResponse,
  DashboardKPIs,
  DepartmentAnalytics,
  ActivityFeedItem,
  ComplianceFilters,
  ComplianceStatus,
  WeeklyTrend
} from './compliance.types';
import * as Repo from './compliance.repository';
import * as Mailer from './compliance.mailer';

// ── Utilities ─────────────────────────────────────────────────

const getWeekDays = (weekStart: Date): Date[] => {
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
};

const dateLabel = (d: Date): string =>
  d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

const isOnLeave = (
  date: Date,
  leaves: Array<{ fromDate: Date | string; toDate: Date | string }>
): boolean => {
  const ts = date.getTime();
  return leaves.some(l => {
    const from = new Date(l.fromDate).setHours(0, 0, 0, 0);
    const to = new Date(l.toDate).setHours(23, 59, 59, 999);
    return ts >= from && ts <= to;
  });
};

// ── Risk Engine ───────────────────────────────────────────────

export const calculateRiskScore = (input: RiskScoreInput): { score: number; level: RiskLevel } => {
  let score = 0;
  if (input.missingYesterday) score += 20;
  if (input.weeklyHours < 40) score += 25;
  if (input.missingDays.length > 2) score += 30;
  if (input.isRepeatedOffender) score += 40;
  if (input.escalationLevel >= 3) score += 15;

  score = Math.min(score, 100);
  const level: RiskLevel = score <= 30 ? 'healthy' : score <= 60 ? 'warning' : 'critical';
  return { score, level };
};

// ── Per-Employee Evaluation ────────────────────────────────────

export const evaluateEmployeeCompliance = (
  employee: any,
  timelogs: any[],
  yesterday: Date,
  weekStart: Date,
  leaves: any[],
  reminderCount: number,
  isRepeatedOffender: boolean,
  existingLog?: any
): EmployeeComplianceRecord => {
  const weekDays = getWeekDays(weekStart);
  const today = new Date();
  const employeeLogs = timelogs.filter(t => t.employeeId === employee.id);

  // Total weekly hours
  const weeklyHours = parseFloat(
    employeeLogs.reduce((s: number, t: any) => s + (t.hours || 0), 0).toFixed(2)
  );

  // Yesterday submitted?
  const yDate = new Date(yesterday);
  yDate.setHours(0, 0, 0, 0);
  const yesterdaySubmitted = employeeLogs.some(t => {
    const d = new Date(t.date);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === yDate.getTime() && (t.hours || 0) > 0;
  });

  // Missing working days (excluding today, weekends, leaves)
  const submittedDays = new Set(
    employeeLogs
      .filter(t => (t.hours || 0) > 0)
      .map(t => {
        const d = new Date(t.date);
        d.setHours(0, 0, 0, 0);
        return d.toDateString();
      })
  );

  const employeeLeaves = leaves.filter(l => l.employeeId === employee.id);
  const missingDays: string[] = [];
  for (const day of weekDays) {
    const dayTime = new Date(day);
    dayTime.setHours(0, 0, 0, 0);
    if (dayTime.getTime() >= today.getTime()) continue; // Future days excluded
    if (isOnLeave(dayTime, employeeLeaves)) continue; // Leave days excluded
    if (!submittedDays.has(dayTime.toDateString())) {
      missingDays.push(dateLabel(dayTime));
    }
  }

  // Last entry date
  const sortedDates = employeeLogs
    .filter(t => (t.hours || 0) > 0)
    .map(t => new Date(t.date).getTime())
    .sort((a, b) => b - a);
  const lastEntryDate = sortedDates.length > 0
    ? new Date(sortedDates[0]).toISOString().split('T')[0]
    : null;

  // Late submissions (entries created after day + 1)
  const lateSubmissions = employeeLogs.filter(t => {
    if (!t.createdAt) return false;
    const entryDate = new Date(t.date);
    entryDate.setDate(entryDate.getDate() + 1);
    return new Date(t.createdAt) > entryDate;
  }).length;

  // Compliance status
  let complianceStatus: ComplianceStatus;
  if (weeklyHours >= 40 && missingDays.length === 0) {
    complianceStatus = 'compliant';
  } else if (missingDays.length > 0 && weeklyHours === 0) {
    complianceStatus = 'unsubmitted';
  } else if (!yesterdaySubmitted && missingDays.length > 0) {
    complianceStatus = 'missing_daily';
  } else if (weeklyHours < 40) {
    complianceStatus = 'under_40_hours';
  } else {
    complianceStatus = 'pending';
  }

  const compliancePct = Math.min(Math.round((weeklyHours / 40) * 100), 100);

  // Risk
  const { score: riskScore, level: riskLevel } = calculateRiskScore({
    missingYesterday: !yesterdaySubmitted,
    weeklyHours,
    missingDays,
    isRepeatedOffender,
    escalationLevel: existingLog?.escalationLevel || 0
  });

  // Manager / Partner
  const manager = employee.managers?.[0]?.manager || null;
  const partner = employee.partners?.[0]?.partner || null;

  return {
    id: existingLog?.id || employee.id,
    employeeId: employee.id,
    name: `${employee.firstName} ${employee.lastName || ''}`.trim(),
    email: employee.officeEmail,
    department: employee.department || 'General',
    role: employee.role || 'Employee',
    managerName: manager ? `${manager.firstName} ${manager.lastName || ''}`.trim() : null,
    managerEmail: manager?.officeEmail || null,
    partnerName: partner ? `${partner.firstName} ${partner.lastName || ''}`.trim() : null,
    partnerEmail: partner?.officeEmail || null,
    weeklyHours,
    billableHours: employeeLogs
      .filter(t => t.billableStatus?.toLowerCase() === 'billable')
      .reduce((s: number, t: any) => s + (t.hours || 0), 0),
    targetHours: 40,
    complianceStatus,
    compliancePct,
    missingDays,
    yesterdaySubmitted,
    lastEntryDate,
    lateSubmissions,
    riskScore,
    riskLevel,
    reminderCount,
    lastReminderAt: existingLog?.lastNotifiedTimestamp?.toISOString() || null,
    escalationLevel: existingLog?.escalationLevel || 0,
    isRepeatedOffender
  };
};

// ── Main Dashboard ─────────────────────────────────────────────

export class ComplianceService {
  static async getComplianceDashboardData(
    user: { id: string; role: string },
    filters: ComplianceFilters = {}
  ): Promise<ComplianceDashboardResponse> {
    const now = new Date();
    const weekStart = Repo.getWeekMonday(now);
    const weekEnd = Repo.getWeekFriday(weekStart);

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (yesterday.getDay() === 0) yesterday.setDate(yesterday.getDate() - 2); // Skip Sunday
    if (yesterday.getDay() === 6) yesterday.setDate(yesterday.getDate() - 1); // Skip Saturday

    // 1. Get employees (role-scoped)
    const employees = await Repo.getActiveEmployees(user, filters);
    const employeeIds = employees.map(e => e.id);

    if (employeeIds.length === 0) {
      return this._emptyDashboard(weekStart, weekEnd);
    }

    // 2. Batch fetch data
    const [timelogs, leaves, complianceLogs, repeatedOffenders, reminderCountMap, todayReminders] =
      await Promise.all([
        Repo.getWeekTimelogs(employeeIds, weekStart, weekEnd),
        Repo.getApprovedLeaves(employeeIds, weekStart, weekEnd),
        Repo.getComplianceLogs(employeeIds, weekStart),
        Repo.getRepeatedOffenders(employeeIds),
        Repo.getReminderCountThisWeek(employeeIds, weekStart),
        Repo.getTodayReminderCount()
      ]);

    const complianceLogMap = new Map(complianceLogs.map(l => [l.employeeId, l]));

    // 3. Evaluate each employee
    const records: EmployeeComplianceRecord[] = employees.map(emp =>
      evaluateEmployeeCompliance(
        emp,
        timelogs,
        yesterday,
        weekStart,
        leaves,
        reminderCountMap.get(emp.id) || 0,
        repeatedOffenders.has(emp.id),
        complianceLogMap.get(emp.id)
      )
    );

    // 4. Apply post-fetch filters
    let filtered = records;
    if (filters.riskLevel) filtered = filtered.filter(r => r.riskLevel === filters.riskLevel);
    if (filters.status) filtered = filtered.filter(r => r.complianceStatus === filters.status);
    if (filters.hoursMax !== undefined) filtered = filtered.filter(r => r.weeklyHours <= filters.hoursMax!);
    if (filters.missingDaysMin !== undefined) filtered = filtered.filter(r => r.missingDays.length >= filters.missingDaysMin!);

    // 5. Sorting
    const sortBy = (filters.sortBy || 'riskScore') as keyof EmployeeComplianceRecord;
    const sortOrder = filters.sortOrder || 'desc';
    filtered.sort((a, b) => {
      const av = a[sortBy] as any;
      const bv = b[sortBy] as any;
      return sortOrder === 'desc'
        ? typeof av === 'string' ? av.localeCompare(bv) * -1 : (bv - av)
        : typeof av === 'string' ? av.localeCompare(bv) : (av - bv);
    });

    // 6. KPIs
    const kpis: DashboardKPIs = {
      weeklyCompliance: Math.round(
        (records.filter(r => r.complianceStatus === 'compliant').length / records.length) * 100
      ),
      missingYesterday: records.filter(r => !r.yesterdaySubmitted).length,
      below40Hours: records.filter(r => r.weeklyHours < 40).length,
      criticalRisk: records.filter(r => r.riskLevel === 'critical').length,
      escalationsTriggered: records.filter(r => r.escalationLevel >= 3).length,
      teamUtilization: Math.round(
        (records.reduce((s, r) => s + r.billableHours, 0) /
          Math.max(records.reduce((s, r) => s + r.weeklyHours, 0), 1)) * 100
      ),
      remindersSentToday: todayReminders,
      totalEmployees: records.length,
      compliantEmployees: records.filter(r => r.complianceStatus === 'compliant').length
    };

    // 7. Department analytics
    const deptMap = new Map<string, EmployeeComplianceRecord[]>();
    for (const r of records) {
      if (!deptMap.has(r.department)) deptMap.set(r.department, []);
      deptMap.get(r.department)!.push(r);
    }
    const departmentAnalytics: DepartmentAnalytics[] = Array.from(deptMap.entries()).map(
      ([dept, emps]) => ({
        department: dept,
        totalEmployees: emps.length,
        compliantCount: emps.filter(e => e.complianceStatus === 'compliant').length,
        compliancePct: Math.round(
          (emps.filter(e => e.complianceStatus === 'compliant').length / emps.length) * 100
        ),
        avgHours: parseFloat(
          (emps.reduce((s, e) => s + e.weeklyHours, 0) / emps.length).toFixed(1)
        ),
        utilizationPct: Math.round(
          (emps.reduce((s, e) => s + e.billableHours, 0) /
            Math.max(emps.reduce((s, e) => s + e.weeklyHours, 0), 1)) * 100
        ),
        criticalCount: emps.filter(e => e.riskLevel === 'critical').length,
        warningCount: emps.filter(e => e.riskLevel === 'warning').length,
        belowHoursCount: emps.filter(e => e.weeklyHours < 40).length
      })
    );

    // 8. Weekly trends
    const trends: WeeklyTrend[] = await Repo.getWeeklyTrends(employeeIds);

    // 9. Recent activity feed
    const recentActivity = await this._buildActivityFeed();

    // 10. Persist compliance logs
    await this._persistComplianceLogs(records, weekStart);

    return {
      kpis,
      employees: filtered,
      departmentAnalytics,
      trends,
      recentActivity,
      weekStart: weekStart.toISOString().split('T')[0],
      weekEnd: weekEnd.toISOString().split('T')[0],
      generatedAt: new Date().toISOString()
    };
  }

  static async _buildActivityFeed(): Promise<ActivityFeedItem[]> {
    try {
      const history = await Repo.getRecentReminderActivity(20);
      return history.map((h: any) => ({
        id: h.id,
        type: h.reminderType.includes('escalation') ? 'escalation_triggered' : 'reminder_sent',
        employeeName: `${h.employee?.firstName || ''} ${h.employee?.lastName || ''}`.trim(),
        employeeId: h.employeeId,
        description: `${h.reminderType.replace(/_/g, ' ')} reminder sent`,
        timestamp: h.sentAt.toISOString()
      }));
    } catch {
      return [];
    }
  }

  static async _persistComplianceLogs(
    records: EmployeeComplianceRecord[],
    weekStart: Date
  ): Promise<void> {
    const updates = records.map(r =>
      Repo.upsertComplianceLog(r.employeeId, weekStart, {
        complianceStatus: r.complianceStatus,
        loggedHours: r.weeklyHours,
        missingDays: r.missingDays
      }).catch(() => null)
    );
    await Promise.all(updates);
  }

  static _emptyDashboard(weekStart: Date, weekEnd: Date): ComplianceDashboardResponse {
    return {
      kpis: {
        weeklyCompliance: 100,
        missingYesterday: 0,
        below40Hours: 0,
        criticalRisk: 0,
        escalationsTriggered: 0,
        teamUtilization: 0,
        remindersSentToday: 0,
        totalEmployees: 0,
        compliantEmployees: 0
      },
      employees: [],
      departmentAnalytics: [],
      trends: [],
      recentActivity: [],
      weekStart: weekStart.toISOString().split('T')[0],
      weekEnd: weekEnd.toISOString().split('T')[0],
      generatedAt: new Date().toISOString()
    };
  }

  // ── Cron: Daily 9 AM ────────────────────────────────────────

  static async runDailyComplianceCheck(): Promise<void> {
    console.log('⏰ [Compliance] Running daily 9 AM compliance check...');
    try {
      const now = new Date();
      const weekStart = Repo.getWeekMonday(now);
      const weekEnd = Repo.getWeekFriday(weekStart);

      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      if (yesterday.getDay() === 0) yesterday.setDate(yesterday.getDate() - 2);
      if (yesterday.getDay() === 6) yesterday.setDate(yesterday.getDate() - 1);

      const employees = await Repo.getActiveEmployees({ id: 'system', role: 'admin' });
      const employeeIds = employees.map(e => e.id);

      const [timelogs, leaves, repeatedOffenders] = await Promise.all([
        Repo.getWeekTimelogs(employeeIds, weekStart, weekEnd),
        Repo.getApprovedLeaves(employeeIds, weekStart, weekEnd),
        Repo.getRepeatedOffenders(employeeIds)
      ]);

      let sent = 0;
      for (const emp of employees) {
        const empTimelogs = timelogs.filter(t => t.employeeId === emp.id);
        const empLeaves = leaves.filter(l => l.employeeId === emp.id);

        // Check yesterday
        const yDate = new Date(yesterday);
        yDate.setHours(0, 0, 0, 0);
        const submittedYesterday = empTimelogs.some(t => {
          const d = new Date(t.date);
          d.setHours(0, 0, 0, 0);
          return d.getTime() === yDate.getTime() && (t.hours || 0) > 0;
        });

        if (!submittedYesterday && !isOnLeave(yDate, empLeaves)) {
          const weeklyHours = parseFloat(
            empTimelogs.reduce((s: number, t: any) => s + (t.hours || 0), 0).toFixed(2)
          );
          const riskResult = calculateRiskScore({
            missingYesterday: true,
            weeklyHours,
            missingDays: [],
            isRepeatedOffender: repeatedOffenders.has(emp.id),
            escalationLevel: 0
          });

          try {
            await Mailer.sendMissingYesterdayEmail(
              emp as any,
              {
                employeeName: `${emp.firstName} ${emp.lastName || ''}`.trim(),
                weeklyHours,
                targetHours: 40,
                missingDays: [],
                riskLevel: riskResult.level,
                frontendUrl: process.env.FRONTEND_URL || 'https://timesheet.asaind.co.in',
                weekStart: weekStart.toISOString().split('T')[0],
                reminderType: 'daily_missing'
              },
              []
            );
            await Repo.logReminderHistory({
              employeeId: emp.id,
              reminderType: 'daily_missing',
              weekStart,
              hoursAtReminder: weeklyHours,
              missingDaysAtReminder: [dateLabel(yDate)],
              escalationLevel: 0,
              ccEmails: []
            });
            sent++;
          } catch (err) {
            console.error(`❌ Failed to send daily reminder to ${emp.officeEmail}:`, err);
          }
        }
      }
      console.log(`✅ [Compliance] Daily check done. Reminders sent: ${sent}`);
    } catch (err) {
      console.error('❌ [Compliance] Daily check failed:', err);
    }
  }

  // ── Cron: Thursday 2 PM ──────────────────────────────────────

  static async runThursdayCheck(): Promise<void> {
    console.log('⏰ [Compliance] Running Thursday warning check...');
    try {
      const now = new Date();
      const weekStart = Repo.getWeekMonday(now);
      const weekEnd = Repo.getWeekFriday(weekStart);

      const employees = await Repo.getActiveEmployees({ id: 'system', role: 'admin' });
      const employeeIds = employees.map(e => e.id);
      const timelogs = await Repo.getWeekTimelogs(employeeIds, weekStart, weekEnd);
      const repeatedOffenders = await Repo.getRepeatedOffenders(employeeIds);

      let sent = 0;
      for (const emp of employees) {
        const empTimelogs = timelogs.filter(t => t.employeeId === emp.id);
        const weeklyHours = parseFloat(
          empTimelogs.reduce((s: number, t: any) => s + (t.hours || 0), 0).toFixed(2)
        );

        if (weeklyHours < 32) {
          const riskResult = calculateRiskScore({
            missingYesterday: false,
            weeklyHours,
            missingDays: [],
            isRepeatedOffender: repeatedOffenders.has(emp.id),
            escalationLevel: 0
          });

          try {
            await Mailer.sendThursdayWarningEmail(
              emp as any,
              {
                employeeName: `${emp.firstName} ${emp.lastName || ''}`.trim(),
                weeklyHours,
                targetHours: 40,
                missingDays: [],
                riskLevel: riskResult.level,
                frontendUrl: process.env.FRONTEND_URL || 'https://timesheet.asaind.co.in',
                weekStart: weekStart.toISOString().split('T')[0],
                reminderType: 'thursday_warning'
              }
            );
            await Repo.logReminderHistory({
              employeeId: emp.id,
              reminderType: 'thursday_warning',
              weekStart,
              hoursAtReminder: weeklyHours,
              missingDaysAtReminder: [],
              escalationLevel: 0,
              ccEmails: []
            });
            sent++;
          } catch (err) {
            console.error(`❌ Thursday reminder failed for ${emp.officeEmail}:`, err);
          }
        }
      }
      console.log(`✅ [Compliance] Thursday check done. Sent: ${sent}`);
    } catch (err) {
      console.error('❌ [Compliance] Thursday check failed:', err);
    }
  }

  // ── Cron: Friday 6 PM ────────────────────────────────────────

  static async runWeeklyComplianceCheck(): Promise<void> {
    console.log('⏰ [Compliance] Running Friday critical check...');
    try {
      const now = new Date();
      const weekStart = Repo.getWeekMonday(now);
      const weekEnd = Repo.getWeekFriday(weekStart);

      const employees = await Repo.getActiveEmployees({ id: 'system', role: 'admin' });
      const employeeIds = employees.map(e => e.id);
      const [timelogs, leaves, repeatedOffenders] = await Promise.all([
        Repo.getWeekTimelogs(employeeIds, weekStart, weekEnd),
        Repo.getApprovedLeaves(employeeIds, weekStart, weekEnd),
        Repo.getRepeatedOffenders(employeeIds)
      ]);

      let sent = 0;
      for (const emp of employees) {
        const empTimelogs = timelogs.filter(t => t.employeeId === emp.id);
        const weeklyHours = parseFloat(
          empTimelogs.reduce((s: number, t: any) => s + (t.hours || 0), 0).toFixed(2)
        );

        if (weeklyHours < 40) {
          const empLeaves = leaves.filter(l => l.employeeId === emp.id);
          const weekDays = getWeekDays(weekStart);
          const submittedDays = new Set(
            empTimelogs.filter(t => (t.hours || 0) > 0).map(t => new Date(t.date).toDateString())
          );
          const missingDays = weekDays
            .filter(d => {
              const dd = new Date(d);
              dd.setHours(0, 0, 0, 0);
              return !submittedDays.has(dd.toDateString()) && !isOnLeave(dd, empLeaves);
            })
            .map(d => dateLabel(d));

          const riskResult = calculateRiskScore({
            missingYesterday: false,
            weeklyHours,
            missingDays,
            isRepeatedOffender: repeatedOffenders.has(emp.id),
            escalationLevel: 0
          });

          const manager = (emp as any).managers?.[0]?.manager;
          const ccEmails = manager ? [manager.officeEmail] : [];

          try {
            await Mailer.sendFridayCriticalEmail(
              emp as any,
              {
                employeeName: `${emp.firstName} ${emp.lastName || ''}`.trim(),
                weeklyHours,
                targetHours: 40,
                missingDays,
                riskLevel: riskResult.level,
                frontendUrl: process.env.FRONTEND_URL || 'https://timesheet.asaind.co.in',
                weekStart: weekStart.toISOString().split('T')[0],
                reminderType: 'friday_critical'
              },
              ccEmails
            );
            await Repo.logReminderHistory({
              employeeId: emp.id,
              reminderType: 'friday_critical',
              weekStart,
              hoursAtReminder: weeklyHours,
              missingDaysAtReminder: missingDays,
              escalationLevel: 1,
              ccEmails
            });

            // Update compliance log
            await Repo.upsertComplianceLog(emp.id, weekStart, {
              complianceStatus: 'under_40_hours',
              loggedHours: weeklyHours,
              missingDays,
              escalationLevel: 1,
              reminderSentDate: new Date(),
              lastNotifiedTimestamp: new Date()
            });
            sent++;
          } catch (err) {
            console.error(`❌ Friday reminder failed for ${emp.officeEmail}:`, err);
          }
        }
      }
      console.log(`✅ [Compliance] Friday check done. Sent: ${sent}`);
    } catch (err) {
      console.error('❌ [Compliance] Friday check failed:', err);
    }
  }

  // ── Cron: Monday Escalation ───────────────────────────────────

  static async runMondayEscalation(): Promise<void> {
    console.log('⏰ [Compliance] Running Monday escalation...');
    try {
      const now = new Date();
      // Last week
      const lastWeekStart = Repo.getWeekMonday(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
      const lastWeekEnd = Repo.getWeekFriday(lastWeekStart);

      const employees = await Repo.getActiveEmployees({ id: 'system', role: 'admin' });
      const employeeIds = employees.map(e => e.id);
      const [timelogs, complianceLogs, hrEmails] = await Promise.all([
        Repo.getWeekTimelogs(employeeIds, lastWeekStart, lastWeekEnd),
        Repo.getComplianceLogs(employeeIds, lastWeekStart),
        Repo.getHREmails()
      ]);

      const complianceLogMap = new Map(complianceLogs.map(l => [l.employeeId, l]));

      // Manager summary map
      const managerSummaryMap = new Map<string, {
        email: string; name: string;
        employees: Array<{ name: string; hours: number; missingDays: string[] }>;
      }>();

      let escalated = 0;
      for (const emp of employees) {
        const empTimelogs = timelogs.filter(t => t.employeeId === emp.id);
        const weeklyHours = parseFloat(
          empTimelogs.reduce((s: number, t: any) => s + (t.hours || 0), 0).toFixed(2)
        );
        const existingLog = complianceLogMap.get(emp.id);

        if (weeklyHours < 40 || (existingLog && existingLog.complianceStatus !== 'compliant')) {
          const missingDays = existingLog?.missingDays || [];
          const riskResult = calculateRiskScore({
            missingYesterday: false,
            weeklyHours,
            missingDays,
            isRepeatedOffender: false,
            escalationLevel: existingLog?.escalationLevel || 0
          });

          const manager = (emp as any).managers?.[0]?.manager;
          const partner = (emp as any).partners?.[0]?.partner;
          const ccEmails: string[] = [...hrEmails];
          if (partner?.officeEmail) ccEmails.push(partner.officeEmail);

          // Notify manager
          if (manager?.officeEmail) {
            try {
              await Mailer.sendMondayEscalationEmail(
                manager.officeEmail,
                emp,
                {
                  employeeName: `${emp.firstName} ${emp.lastName || ''}`.trim(),
                  weeklyHours,
                  targetHours: 40,
                  missingDays,
                  riskLevel: riskResult.level,
                  frontendUrl: process.env.FRONTEND_URL || 'https://timesheet.asaind.co.in',
                  weekStart: lastWeekStart.toISOString().split('T')[0],
                  reminderType: 'monday_escalation',
                  managerName: `${manager.firstName} ${manager.lastName || ''}`.trim()
                },
                ccEmails
              );
            } catch (err) {
              console.error(`❌ Escalation email to manager failed:`, err);
            }

            // Accumulate for manager digest
            const mKey = manager.officeEmail;
            if (!managerSummaryMap.has(mKey)) {
              managerSummaryMap.set(mKey, {
                email: manager.officeEmail,
                name: `${manager.firstName} ${manager.lastName || ''}`.trim(),
                employees: []
              });
            }
            managerSummaryMap.get(mKey)!.employees.push({
              name: `${emp.firstName} ${emp.lastName || ''}`.trim(),
              hours: weeklyHours,
              missingDays
            });
          }

          // Notify partner separately
          if (partner?.officeEmail) {
            try {
              await Mailer.sendMondayEscalationEmail(
                partner.officeEmail,
                emp,
                {
                  employeeName: `${emp.firstName} ${emp.lastName || ''}`.trim(),
                  weeklyHours,
                  targetHours: 40,
                  missingDays,
                  riskLevel: riskResult.level,
                  frontendUrl: process.env.FRONTEND_URL || 'https://timesheet.asaind.co.in',
                  weekStart: lastWeekStart.toISOString().split('T')[0],
                  reminderType: 'monday_escalation'
                },
                []
              );
            } catch (err) {
              console.error(`❌ Escalation email to partner failed:`, err);
            }
          }

          await Repo.logReminderHistory({
            employeeId: emp.id,
            reminderType: 'monday_escalation',
            weekStart: lastWeekStart,
            hoursAtReminder: weeklyHours,
            missingDaysAtReminder: missingDays,
            escalationLevel: existingLog?.escalationLevel ?? 0 + 1,
            ccEmails
          });

          await Repo.upsertComplianceLog(emp.id, lastWeekStart, {
            complianceStatus: existingLog?.complianceStatus || 'under_40_hours',
            loggedHours: weeklyHours,
            missingDays,
            escalationLevel: (existingLog?.escalationLevel || 0) + 1,
            lastNotifiedTimestamp: new Date()
          });

          escalated++;
        }
      }

      // Send manager digest summaries
      for (const [, summary] of managerSummaryMap.entries()) {
        try {
          await Mailer.sendManagerSummaryEmail(
            summary.email,
            summary.name,
            {
              totalEmployees: employees.length,
              compliantCount: employees.length - summary.employees.length,
              belowHours: summary.employees,
              weekStart: lastWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            }
          );
        } catch (err) {
          console.error(`❌ Manager summary email failed:`, err);
        }
      }

      console.log(`✅ [Compliance] Monday escalation done. Escalated: ${escalated}`);
    } catch (err) {
      console.error('❌ [Compliance] Monday escalation failed:', err);
    }
  }

  // ── Manual Reminder ───────────────────────────────────────────

  static async sendManualReminder(
    targetEmployeeId: string,
    triggeredByUser: { id: string; role: string }
  ): Promise<{ success: boolean; message: string }> {
    const employees = await Repo.getActiveEmployees({ id: 'system', role: 'admin' });
    const emp = employees.find(e => e.id === targetEmployeeId);
    if (!emp) return { success: false, message: 'Employee not found' };

    const now = new Date();
    const weekStart = Repo.getWeekMonday(now);
    const weekEnd = Repo.getWeekFriday(weekStart);
    const timelogs = await Repo.getWeekTimelogs([emp.id], weekStart, weekEnd);
    const weeklyHours = parseFloat(
      timelogs.reduce((s: number, t: any) => s + (t.hours || 0), 0).toFixed(2)
    );

    await Mailer.sendMissingYesterdayEmail(
      emp as any,
      {
        employeeName: `${emp.firstName} ${emp.lastName || ''}`.trim(),
        weeklyHours,
        targetHours: 40,
        missingDays: [],
        riskLevel: weeklyHours < 20 ? 'critical' : weeklyHours < 35 ? 'warning' : 'healthy',
        frontendUrl: process.env.FRONTEND_URL || 'https://timesheet.asaind.co.in',
        weekStart: weekStart.toISOString().split('T')[0],
        reminderType: 'manual'
      }
    );

    await Repo.logReminderHistory({
      employeeId: emp.id,
      reminderType: 'manual',
      weekStart,
      hoursAtReminder: weeklyHours,
      missingDaysAtReminder: [],
      escalationLevel: 0,
      ccEmails: []
    });

    return { success: true, message: `Reminder sent to ${emp.officeEmail}` };
  }

  // ── Manual Escalation ─────────────────────────────────────────

  static async triggerEscalation(
    targetEmployeeId: string
  ): Promise<{ success: boolean; message: string }> {
    const employees = await Repo.getActiveEmployees({ id: 'system', role: 'admin' });
    const emp = employees.find(e => e.id === targetEmployeeId);
    if (!emp) return { success: false, message: 'Employee not found' };

    const now = new Date();
    const weekStart = Repo.getWeekMonday(now);
    const weekEnd = Repo.getWeekFriday(weekStart);
    const timelogs = await Repo.getWeekTimelogs([emp.id], weekStart, weekEnd);
    const weeklyHours = parseFloat(
      timelogs.reduce((s: number, t: any) => s + (t.hours || 0), 0).toFixed(2)
    );

    const hrEmails = await Repo.getHREmails();
    const manager = (emp as any).managers?.[0]?.manager;
    const partner = (emp as any).partners?.[0]?.partner;
    const ccEmails = [...hrEmails, partner?.officeEmail].filter(Boolean) as string[];

    const toEmail = manager?.officeEmail || hrEmails[0] || emp.officeEmail;

    await Mailer.sendMondayEscalationEmail(toEmail, emp, {
      employeeName: `${emp.firstName} ${emp.lastName || ''}`.trim(),
      weeklyHours,
      targetHours: 40,
      missingDays: [],
      riskLevel: 'critical',
      frontendUrl: process.env.FRONTEND_URL || 'https://timesheet.asaind.co.in',
      weekStart: weekStart.toISOString().split('T')[0],
      reminderType: 'monday_escalation'
    }, ccEmails);

    const existingLog = (await Repo.getComplianceLogs([emp.id], weekStart))[0];
    await Repo.upsertComplianceLog(emp.id, weekStart, {
      complianceStatus: existingLog?.complianceStatus || 'under_40_hours',
      loggedHours: weeklyHours,
      missingDays: existingLog?.missingDays || [],
      escalationLevel: (existingLog?.escalationLevel || 0) + 1,
      lastNotifiedTimestamp: new Date()
    });

    await Repo.logReminderHistory({
      employeeId: emp.id,
      reminderType: 'monday_escalation',
      weekStart,
      hoursAtReminder: weeklyHours,
      missingDaysAtReminder: [],
      escalationLevel: (existingLog?.escalationLevel || 0) + 1,
      ccEmails
    });

    return { success: true, message: `Escalation triggered for ${emp.firstName}` };
  }
}
