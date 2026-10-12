export type ReportsTab = 'executive' | 'workforce' | 'projects' | 'attendance' | 'finance' | 'leave';

export interface ReportSummaryItem {
  label: string;
  value: string;
  trend: string;
  tone: 'brand' | 'success' | 'warning' | 'danger' | 'neutral';
}

export interface ReportChartRow {
  label: string;
  value: number;
  count?: number;
  hours?: number;
  sessions?: number;
  attendanceHours?: number;
}

export interface ReportOverview {
  summary: ReportSummaryItem[];
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
    roleScope: 'all' | 'team' | 'self';
    fromDate: string;
    toDate: string;
    granularity: 'day' | 'week' | 'month';
  };
}

export interface ReportsFilterState {
  fromDate: string;
  toDate: string;
  granularity: 'day' | 'week' | 'month';
  employeeIds: string[];
  projectIds: string[];
  departmentIds: string[];
  statuses: string[];
}

export interface FilterOption {
  value: string;
  label: string;
  meta?: string;
}

export interface ReportsFilterOptions {
  employees: FilterOption[];
  projects: FilterOption[];
  departments: FilterOption[];
  clients: FilterOption[];
  statuses: {
    attendance: string[];
    leaves: string[];
    reimbursements: string[];
    timelogs: string[];
  };
}

