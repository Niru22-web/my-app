// ============================================================
// Compliance Module — Type Definitions
// ============================================================

export type RiskLevel = 'healthy' | 'warning' | 'critical';
export type ReminderType =
  | 'daily_missing'
  | 'thursday_warning'
  | 'friday_critical'
  | 'monday_escalation'
  | 'manual';

export type ComplianceStatus =
  | 'compliant'
  | 'under_40_hours'
  | 'unsubmitted'
  | 'missing_daily'
  | 'pending';

export interface EmployeeComplianceRecord {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  department: string;
  role: string;
  managerName: string | null;
  managerEmail: string | null;
  partnerName: string | null;
  partnerEmail: string | null;

  // Hours
  weeklyHours: number;
  billableHours: number;
  targetHours: number; // 40

  // Compliance
  complianceStatus: ComplianceStatus;
  compliancePct: number; // 0-100
  missingDays: string[];
  yesterdaySubmitted: boolean;
  lastEntryDate: string | null;
  lateSubmissions: number;

  // Risk
  riskScore: number; // 0-100
  riskLevel: RiskLevel;

  // Reminders
  reminderCount: number;
  lastReminderAt: string | null;
  escalationLevel: number; // 0-4
  isRepeatedOffender: boolean;
}

export interface DashboardKPIs {
  weeklyCompliance: number;       // % of employees compliant
  missingYesterday: number;       // count
  below40Hours: number;           // count
  criticalRisk: number;           // count with risk > 60
  escalationsTriggered: number;   // count this week
  teamUtilization: number;        // billable / total %
  remindersSentToday: number;
  totalEmployees: number;
  compliantEmployees: number;
}

export interface DepartmentAnalytics {
  department: string;
  totalEmployees: number;
  compliantCount: number;
  compliancePct: number;
  avgHours: number;
  utilizationPct: number;
  criticalCount: number;
  warningCount: number;
  belowHoursCount: number;
}

export interface WeeklyTrend {
  weekLabel: string;      // e.g. "Jun 9"
  weekStart: string;      // ISO date
  compliancePct: number;
  avgHours: number;
  missingCount: number;
  totalEmployees: number;
}

export interface ActivityFeedItem {
  id: string;
  type:
    | 'reminder_sent'
    | 'escalation_triggered'
    | 'timesheet_completed'
    | 'exception_added'
    | 'manual_action';
  employeeName: string;
  employeeId: string;
  description: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface ComplianceDashboardResponse {
  kpis: DashboardKPIs;
  employees: EmployeeComplianceRecord[];
  departmentAnalytics: DepartmentAnalytics[];
  trends: WeeklyTrend[];
  recentActivity: ActivityFeedItem[];
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
}

export interface ComplianceFilters {
  department?: string;
  managerId?: string;
  employeeId?: string;
  riskLevel?: RiskLevel;
  status?: ComplianceStatus;
  missingDaysMin?: number;
  hoursMax?: number;
  weekStart?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface RiskScoreInput {
  missingYesterday: boolean;
  weeklyHours: number;
  missingDays: string[];
  isRepeatedOffender: boolean;
  escalationLevel: number;
}

export interface EmailTemplateData {
  employeeName: string;
  weeklyHours: number;
  targetHours: number;
  missingDays: string[];
  riskLevel: RiskLevel;
  frontendUrl: string;
  weekStart: string;
  reminderType: ReminderType;
  managerName?: string;
}
