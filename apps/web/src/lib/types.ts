// Response shapes of the existing ASA API (see legacy/timesheet-backend).

export interface AuthUser {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  role: string;
  status?: string;
  profileImage?: string | null;
  position?: string | null;
  department?: string | null;
}

export interface LoginResponse {
  success: boolean;
  token: string;
  user: AuthUser;
}

export type PermissionFlags = { canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean };
export interface PermissionsResponse {
  success: boolean;
  permissions: Record<string, PermissionFlags>;
  hasCustomAccess: boolean;
}

export interface Envelope<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface CombinedDashboard {
  stats: { totalProjects: number; totalTasks: number; hoursLogged: number };
  attendance: { date: string; day: string; hours: number }[];
  /** Paid leave this leave year (rules engine); configured = at least one paid type with an entitlement */
  leaves: { balance: number; used: number; total: number; configured?: boolean };
  expenses: { total: number; breakdown: { category: string; amount: number }[] };
  birthdays: { name: string; role: string | null; date: string }[];
  events: { id: string; title: string; date: string; time: string | null; type: string; color: string }[];
  activities: { title: string; description: string | null; type: string; createdAt: string }[];
  pendingApprovals: { leaves: number; assets: number; reimbursements: number; tickets: number };
  myAssetRequests: number;
  myTickets: number;
}

export interface AttendanceSession {
  id: string;
  check_in_time: string;
  check_out_time: string | null;
  duration: number | null;
  location_name: string | null;
  check_in_location: string | null;
}

export interface AttendanceToday {
  status: "Active" | "Inactive";
  todayRecord: {
    checkInTime: string | null;
    checkOutTime: string | null;
    status: string;
    totalHours: number;
    checkInLocation: string | null;
    checkOutLocation: string | null;
    location_name: string | null;
  } | null;
  checkInLocation: string | null;
  checkOutLocation: string | null;
  activeSession: AttendanceSession | null;
  activeSessions: AttendanceSession[];
  weeklyStats: { totalHours: string; presentDays: number; avgInTime: string };
  workLog: { date: string; status: string; checkInTime: string | null; checkOutTime: string | null; totalHours: number }[];
}

export interface ComplianceDashboard {
  kpis: {
    weeklyCompliance: number;
    missingYesterday: number;
    below40Hours: number;
    criticalRisk: number;
    escalationsTriggered: number;
    teamUtilization: number;
    remindersSentToday: number;
    totalEmployees: number;
    compliantEmployees: number;
  };
  employees: {
    id: string;
    employeeId: string;
    name: string;
    email?: string;
    role?: string;
    department: string | null;
    managerName?: string | null;
    weeklyHours: number;
    billableHours?: number;
    targetHours: number;
    complianceStatus: string;
    compliancePct: number;
    missingDays: string[];
    riskScore?: number;
    riskLevel: string;
    reminderCount?: number;
    lastReminderAt?: string | null;
    escalationLevel?: number;
    isRepeatedOffender?: boolean;
  }[];
  departmentAnalytics?: {
    department: string;
    totalEmployees: number;
    compliantCount: number;
    compliancePct: number;
    avgHours: number;
    utilizationPct: number;
    criticalCount: number;
    belowHoursCount: number;
  }[];
  trends?: { weekLabel: string; weekStart: string; compliancePct: number; avgHours: number; missingCount: number; totalEmployees: number }[];
  recentActivity?: { id: string; type: string; employeeName: string; description: string; timestamp: string }[];
  weekStart: string;
  weekEnd: string;
  generatedAt?: string;
}

export interface AppNotification {
  id?: string;
  title?: string;
  message: string;
  type?: string;
  isRead?: boolean;
  isArchived?: boolean;
  createdAt: string;
  actionUrl?: string | null;
  module?: string | null;
  priority?: string | null;
  isStarred?: boolean;
  isPinned?: boolean;
  snoozedUntil?: string | null;
  relatedId?: string | null;
}

export interface SearchResults {
  employees: { id: string; employeeId: string; firstName: string; lastName: string; officeEmail: string; designation: string | null; profileImage: string | null }[];
  projects: { id: string; projectId: string; name: string; client: { name: string } | null }[];
  jobs: { id: string; jobId: string; name: string; project: { name: string } | null }[];
}
