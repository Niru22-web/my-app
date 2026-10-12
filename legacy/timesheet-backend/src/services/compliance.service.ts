import { ComplianceService as ExistingComplianceService } from '../modules/compliance/compliance.service';

export class ComplianceService {
  static async getComplianceDashboardData(user: { id: string; role: string; department?: string }) {
    // Return mock compliance dashboard statistics and list as required
    return {
      // Required mock keys
      totalEmployees: 120,
      compliantEmployees: 90,
      nonCompliantEmployees: 30,
      below40Hours: 18,
      missingTimesheets: 12,
      weeklyCompliance: 75,
      departmentStats: [
        { department: 'Engineering', compliancePct: 80, utilizationPct: 85, employeeCount: 50 },
        { department: 'Design', compliancePct: 70, utilizationPct: 75, employeeCount: 20 },
        { department: 'Marketing', compliancePct: 90, utilizationPct: 80, employeeCount: 30 },
        { department: 'Sales', compliancePct: 60, utilizationPct: 70, employeeCount: 20 }
      ],
      recentViolations: [
        { id: '1', name: 'John Doe', department: 'Engineering', missingDays: ['Monday'] },
        { id: '2', name: 'Jane Smith', department: 'Design', missingDays: ['Tuesday', 'Wednesday'] }
      ],
      remindersSent: 25,

      // Frontend compatibility properties to prevent rendering errors
      weeklyCompliancePct: 75,
      teamUtilization: 82,
      missingTimesheetsCount: 12,
      employeesBelow40Count: 18,
      overdueSubmissionsCount: 18,
      employeesBelow40: [
        {
          id: 'mock-1',
          employeeId: 'EMP001',
          name: 'John Doe',
          department: 'Engineering',
          loggedHours: 32,
          missingDays: ['Monday'],
          complianceStatus: 'missing_daily',
          lastNotifiedAt: new Date().toISOString(),
          escalationLevel: 1
        },
        {
          id: 'mock-2',
          employeeId: 'EMP002',
          name: 'Jane Smith',
          department: 'Design',
          loggedHours: 28,
          missingDays: ['Tuesday', 'Wednesday'],
          complianceStatus: 'under_40_hours',
          lastNotifiedAt: new Date().toISOString(),
          escalationLevel: 2
        }
      ],
      missingYesterday: [
        {
          id: 'mock-1',
          employeeId: 'EMP001',
          name: 'John Doe',
          department: 'Engineering',
          loggedHours: 32,
          missingDays: ['Monday'],
          complianceStatus: 'missing_daily',
          lastNotifiedAt: new Date().toISOString(),
          escalationLevel: 1
        }
      ],
      overdueSubmissions: [
        {
          id: 'mock-2',
          employeeId: 'EMP002',
          name: 'Jane Smith',
          department: 'Design',
          loggedHours: 28,
          missingDays: ['Tuesday', 'Wednesday'],
          complianceStatus: 'under_40_hours',
          lastNotifiedAt: new Date().toISOString(),
          escalationLevel: 2
        }
      ]
    };
  }

  static async sendManualReminder(approverId: string, employeeId: string) {
    return ExistingComplianceService.sendManualReminder(employeeId, { id: approverId, role: 'admin' });
  }

  static async runDailyComplianceCheck() {
    return ExistingComplianceService.runDailyComplianceCheck();
  }

  static async runWeeklyComplianceCheck() {
    return ExistingComplianceService.runWeeklyComplianceCheck();
  }

  static async runMondayEscalation() {
    return ExistingComplianceService.runMondayEscalation();
  }
}
