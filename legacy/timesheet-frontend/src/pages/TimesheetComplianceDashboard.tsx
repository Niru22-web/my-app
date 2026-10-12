import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTheme } from '../contexts/ThemeContext';
import API from '../api';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3,
  Calendar,
  Clock,
  AlertCircle,
  TrendingUp,
  Briefcase,
  Search,
  Mail,
  ArrowUp,
  CheckCircle2,
  X,
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
  AlertOctagon,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────

type RiskLevel = 'healthy' | 'warning' | 'critical';

interface EmployeeRecord {
  employeeId: string;
  name: string;
  email: string;
  department: string;
  role: string;
  managerName: string | null;
  weeklyHours: number;
  billableHours: number;
  targetHours: number;
  complianceStatus: string;
  compliancePct: number;
  missingDays: string[];
  yesterdaySubmitted: boolean;
  lastEntryDate: string | null;
  lateSubmissions: number;
  riskScore: number;
  riskLevel: RiskLevel;
  reminderCount: number;
  lastReminderAt: string | null;
  escalationLevel: number;
  isRepeatedOffender: boolean;
}

interface KPIs {
  weeklyCompliance: number;
  missingYesterday: number;
  below40Hours: number;
  criticalRisk: number;
  escalationsTriggered: number;
  teamUtilization: number;
  remindersSentToday: number;
  totalEmployees: number;
  compliantEmployees: number;
}

interface DeptAnalytics {
  department: string;
  totalEmployees: number;
  compliantCount: number;
  compliancePct: number;
  avgHours: number;
  utilizationPct: number;
  criticalCount: number;
  belowHoursCount: number;
}

interface Trend {
  weekLabel: string;
  compliancePct: number;
  avgHours: number;
  missingCount: number;
}

interface ActivityItem {
  id: string;
  type: string;
  employeeName: string;
  description: string;
  timestamp: string;
}

interface DashboardData {
  kpis: KPIs;
  employees: EmployeeRecord[];
  departmentAnalytics: DeptAnalytics[];
  trends: Trend[];
  recentActivity: ActivityItem[];
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const riskColors: Record<RiskLevel, { bg: string; text: string; dot: string }> = {
  healthy:  { bg: 'rgba(16,185,129,0.12)', text: '#10b981', dot: '#10b981' },
  warning:  { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b', dot: '#f59e0b' },
  critical: { bg: 'rgba(239,68,68,0.12)',  text: '#ef4444', dot: '#ef4444' }
};

const RiskBadge = ({ level }: { level: RiskLevel }) => {
  const c = riskColors[level];
  const labels = { healthy: '✅ Healthy', warning: '⚠️ Warning', critical: '🚨 Critical' };
  return (
    <span style={{
      background: c.bg, color: c.text,
      padding: '2px 10px', borderRadius: '999px',
      fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap'
    }}>
      {labels[level]}
    </span>
  );
};

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    compliant:      { bg: 'rgba(16,185,129,0.12)',  color: '#10b981', label: 'Compliant' },
    under_40_hours: { bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b', label: 'Under 40h' },
    missing_daily:  { bg: 'rgba(239,68,68,0.12)',   color: '#ef4444', label: 'Missing' },
    unsubmitted:    { bg: 'rgba(239,68,68,0.15)',   color: '#dc2626', label: 'Unsubmitted' },
    pending:        { bg: 'rgba(148,163,184,0.12)', color: '#94a3b8', label: 'Pending' }
  };
  const s = map[status] || map['pending'];
  return (
    <span style={{
      background: s.bg, color: s.color,
      padding: '2px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 700
    }}>
      {s.label}
    </span>
  );
};

const HoursBar = ({ hours, target }: { hours: number; target: number }) => {
  const pct = Math.min((hours / target) * 100, 100);
  const color = pct >= 100 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ minWidth: 80 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 3 }}>
        {hours.toFixed(1)} / {target}h
      </div>
      <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 999, height: 5, overflow: 'hidden' }}>
        <div style={{ background: color, width: `${pct}%`, height: '100%', borderRadius: 999, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
};

const Skeleton = ({ w = '100%', h = 16, r = 8 }: { w?: string | number; h?: number; r?: number }) => (
  <div style={{
    width: w, height: h, borderRadius: r,
    background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s infinite'
  }} />
);

// ─── Animated Counter ───────────────────────────────────────────────────────

const AnimatedNumber = ({ value, suffix = '' }: { value: number; suffix?: string }) => {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = 0;
    const end = value;
    if (end === 0) { setDisplay(0); return; }
    const duration = 800;
    const step = end / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= end) { setDisplay(end); clearInterval(timer); }
      else setDisplay(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [value]);
  return <>{display}{suffix}</>;
};

interface MultiSelectDropdownProps {
  label: string;
  options: string[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}

const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
  label,
  options,
  selectedValues,
  onChange,
  placeholder = 'Search...'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  const toggleOption = (opt: string) => {
    if (selectedValues.includes(opt)) {
      onChange(selectedValues.filter(v => v !== opt));
    } else {
      onChange([...selectedValues, opt]);
    }
  };

  const clearAll = () => onChange([]);
  const selectAll = () => onChange([...options]);

  return (
    <div ref={containerRef} className="relative inline-block text-left w-full sm:w-auto">
      <div>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex justify-between items-center w-full sm:w-[170px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1626] px-4.5 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1E2C44] focus:outline-none focus:ring-2 focus:ring-[#5b5ffb] transition-all cursor-pointer"
        >
          <span className="truncate">
            {selectedValues.length === 0
              ? `All ${label}s`
              : `${label} (${selectedValues.length})`}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 text-slate-400" />
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="origin-top-right absolute right-0 mt-2 w-56 rounded-xl shadow-xl bg-white dark:bg-[#151F32] border border-slate-250 dark:border-slate-800 ring-1 ring-black ring-opacity-5 focus:outline-none z-[1050] overflow-hidden"
          >
            <div className="p-2 border-b border-slate-100 dark:border-slate-800">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder={placeholder}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-[#0E1626] border border-slate-100 dark:border-slate-800 rounded-lg text-[11px] font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#5b5ffb]"
                />
              </div>
            </div>
            
            <div className="max-h-48 overflow-y-auto p-1.5 space-y-0.5">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-slate-450 dark:text-slate-500 text-center">
                  No options found
                </div>
              ) : (
                filteredOptions.map(opt => {
                  const isChecked = selectedValues.includes(opt);
                  return (
                    <label
                      key={opt}
                      className="flex items-center px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1E2C44] cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleOption(opt)}
                        className="rounded border-slate-350 dark:border-slate-700 text-[#5b5ffb] focus:ring-[#5b5ffb] h-3.5 w-3.5 mr-2.5 cursor-pointer accent-[#5b5ffb]"
                      />
                      <span className="truncate">{opt}</span>
                    </label>
                  );
                })
              )}
            </div>

            <div className="p-1.5 bg-slate-50 dark:bg-[#0E1626] border-t border-slate-100 dark:border-slate-800 flex justify-between text-[10px] font-bold">
              <button
                type="button"
                onClick={selectAll}
                className="px-2 py-1 text-[#5b5ffb] hover:bg-slate-100 dark:hover:bg-[#151F32] rounded transition cursor-pointer"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-[#151F32] rounded transition cursor-pointer"
              >
                Clear All
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Main Component ─────────────────────────────────────────────────────────

const TimesheetComplianceDashboard: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const { themeMode } = useTheme();
  const isDark = themeMode === 'dark';
  const hasFetched = useRef(false);
  const autoRefreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // State
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Filters
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [selectedRisks, setSelectedRisks] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [searchQ, setSearchQ] = useState('');
  const [sortBy, setSortBy] = useState<keyof EmployeeRecord>('riskScore');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  // Exception modal
  const [exceptionEmp, setExceptionEmp] = useState<EmployeeRecord | null>(null);
  const [exceptionReason, setExceptionReason] = useState('');

  const userRole = user?.role?.toLowerCase() || '';
  const isAdmin = ['admin', 'owner', 'it', 'hr'].some(r => userRole.includes(r));
  const isManager = userRole.includes('manager');
  const isPartner = userRole.includes('partner');
  const canManage = isAdmin || isManager || isPartner;

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await API.get('/compliance/dashboard');
      const payload = res.data?.data || res.data;
      setData(payload);
      setLastRefresh(new Date());
      setPage(1);
    } catch (err) {
      const axiosError = err as { response?: { data?: { message?: string } }; message?: string };
      const msg = axiosError?.response?.data?.message || axiosError.message || 'Failed to load compliance data';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 60s
  useEffect(() => {
    if (autoRefresh) {
      autoRefreshTimer.current = setInterval(() => fetchData(true), 60000);
    }
    return () => {
      if (autoRefreshTimer.current) clearInterval(autoRefreshTimer.current);
    };
  }, [autoRefresh, fetchData]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const sendReminder = async (emp: EmployeeRecord) => {
    setActionLoading(`reminder-${emp.employeeId}`);
    try {
      await API.post(`/compliance/trigger-reminder/${emp.employeeId}`);
      toast?.success?.(`Reminder sent to ${emp.name}`);
      fetchData(true);
    } catch {
      toast?.error?.('Failed to send reminder');
    } finally {
      setActionLoading(null);
    }
  };

  const escalate = async (emp: EmployeeRecord) => {
    setActionLoading(`escalate-${emp.employeeId}`);
    try {
      await API.post(`/compliance/escalate/${emp.employeeId}`);
      toast?.success?.(`Escalation triggered for ${emp.name}`);
      fetchData(true);
    } catch {
      toast?.error?.('Escalation failed');
    } finally {
      setActionLoading(null);
    }
  };

  const addException = async () => {
    if (!exceptionEmp || !data) return;
    setActionLoading(`exception-${exceptionEmp.employeeId}`);
    try {
      await API.post(`/compliance/add-exception/${exceptionEmp.employeeId}`, {
        reason: exceptionReason,
        weekStart: data.weekStart
      });
      toast?.success?.('Exception added successfully');
      setExceptionEmp(null);
      setExceptionReason('');
      fetchData(true);
    } catch {
      toast?.error?.('Failed to add exception');
    } finally {
      setActionLoading(null);
    }
  };

  // ── Export ────────────────────────────────────────────────────────────────

  const exportCSV = () => {
    if (!data) return;
    const headers = ['Name', 'Department', 'Manager', 'Weekly Hours', 'Missing Days', 'Compliance%', 'Risk Level', 'Status', 'Reminder Count'];
    const rows = data.employees.map(e => [
      e.name, e.department, e.managerName || '', e.weeklyHours,
      e.missingDays.join('; '), e.compliancePct, e.riskLevel, e.complianceStatus, e.reminderCount
    ]);
    const csvContent = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance-${data.weekStart}.csv`;
    a.click();
  };

  // ── Filtered / Sorted employees ───────────────────────────────────────────

  const filteredEmployees = data
    ? data.employees.filter(e => {
        const q = searchQ.toLowerCase();
        const matchesSearch = !q || e.name.toLowerCase().includes(q) || e.department.toLowerCase().includes(q) || e.role.toLowerCase().includes(q);
        
        const matchesDept = selectedDepts.length === 0 || selectedDepts.includes(e.department);
        const matchesRisk = selectedRisks.length === 0 || selectedRisks.includes(e.riskLevel);
        const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(e.complianceStatus);

        return matchesSearch && matchesDept && matchesRisk && matchesStatus;
      })
    : [];

  const sortedEmployees = [...filteredEmployees].sort((a, b) => {
    let av = a[sortBy];
    let bv = b[sortBy];

    if (typeof av === 'string' && typeof bv === 'string') {
      return sortOrder === 'desc' ? bv.localeCompare(av) : av.localeCompare(bv);
    }
    
    // Fallback for number / arrays
    if (Array.isArray(av)) av = av.length;
    if (Array.isArray(bv)) bv = bv.length;
    
    const nav = Number(av ?? 0);
    const nbv = Number(bv ?? 0);

    return sortOrder === 'desc' ? nbv - nav : nav - nbv;
  });

  const totalPages = Math.ceil(sortedEmployees.length / PAGE_SIZE);
  const pageEmployees = sortedEmployees.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const departments = data
    ? [...new Set(data.employees.map(e => e.department))].sort()
    : [];

  // Recalculated dynamic KPIs based on active client-side filters
  const dynamicKPIs = data && data.employees ? (() => {
    const emps = filteredEmployees;
    const total = emps.length;
    if (total === 0) {
      return {
        weeklyCompliance: 0,
        missingYesterday: 0,
        below40Hours: 0,
        criticalRisk: 0,
        escalationsTriggered: 0,
        teamUtilization: 0,
        remindersSentToday: data.kpis.remindersSentToday,
        totalEmployees: 0,
        compliantEmployees: 0
      };
    }

    const compliant = emps.filter(r => r.complianceStatus === 'compliant').length;
    const missingYesterday = emps.filter(r => !r.yesterdaySubmitted).length;
    const below40Hours = emps.filter(r => r.weeklyHours < 40).length;
    const criticalRisk = emps.filter(r => r.riskLevel === 'critical').length;
    const escalationsTriggered = emps.filter(r => r.escalationLevel >= 3).length;
    
    const totalHours = emps.reduce((s, r) => s + r.weeklyHours, 0);
    const billableHours = emps.reduce((s, r) => s + r.billableHours, 0);
    const teamUtilization = totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0;

    return {
      weeklyCompliance: Math.round((compliant / total) * 100),
      missingYesterday,
      below40Hours,
      criticalRisk,
      escalationsTriggered,
      teamUtilization,
      remindersSentToday: data.kpis.remindersSentToday,
      totalEmployees: total,
      compliantEmployees: compliant
    };
  })() : null;

  // Recalculated dynamic department analytics
  const dynamicDeptAnalytics = data && data.departmentAnalytics
    ? data.departmentAnalytics.filter(dept => selectedDepts.length === 0 || selectedDepts.includes(dept.department))
    : [];

  // Recalculated dynamic risk counts
  const dynamicRiskCounts = data && filteredEmployees ? (() => {
    const emps = filteredEmployees;
    return {
      healthy: emps.filter(e => e.riskLevel === 'healthy').length,
      warning: emps.filter(e => e.riskLevel === 'warning').length,
      critical: emps.filter(e => e.riskLevel === 'critical').length
    };
  })() : null;

  // ── Styles ─────────────────────────────────────────────────────────────────
  const s = {
    page: {
      minHeight: '100vh',
      background: 'transparent',
      color: isDark ? '#f8fafc' : '#1e293b',
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      padding: '24px'
    } as React.CSSProperties,
    card: {
      background: isDark ? 'rgba(255,255,255,0.03)' : '#ffffff',
      backdropFilter: isDark ? 'blur(12px)' : 'none',
      border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(15,23,42,0.06)',
      borderRadius: 16,
      padding: '20px',
      boxShadow: isDark ? '0 4px 20px rgba(0, 0, 0, 0.2)' : '0 4px 18px -4px rgba(0, 0, 0, 0.04), 0 2px 6px -2px rgba(0, 0, 0, 0.02)'
    } as React.CSSProperties,
    input: {
      background: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
      border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #cbd5e1',
      borderRadius: 10,
      color: isDark ? '#f8fafc' : '#1e293b',
      padding: '8px 12px',
      fontSize: 13,
      outline: 'none'
    } as React.CSSProperties,
    btn: (color = '#5b5ffb') => ({
      background: color === '#4f46e5' ? '#5b5ffb' : color,
      color: color === '#e2e8f0' || color === '#f1f5f9' ? '#1e293b' : '#fff',
      border: 'none',
      borderRadius: 8,
      padding: '7px 14px',
      fontSize: 12,
      fontWeight: 700,
      cursor: 'pointer',
      transition: 'opacity 0.2s',
      whiteSpace: 'nowrap'
    } as React.CSSProperties),
    th: {
      position: 'sticky',
      top: 0,
      zIndex: 10,
      padding: '10px 14px',
      fontSize: 10,
      fontWeight: 800,
      textTransform: 'uppercase' as const,
      letterSpacing: '1px',
      color: isDark ? '#cbd5e1' : '#64748b',
      textAlign: 'left' as const,
      background: isDark ? '#151F32' : '#f8fafc',
      borderBottom: isDark ? '1px solid rgba(255,255,255,0.04)' : '1px solid #e2e8f0',
      whiteSpace: 'nowrap' as const,
      cursor: 'pointer'
    } as React.CSSProperties,
    td: {
      padding: '12px 14px',
      fontSize: 13,
      borderTop: isDark ? '1px solid rgba(255,255,255,0.04)' : '1px solid #f1f5f9',
      color: isDark ? '#f8fafc' : '#334155',
      verticalAlign: 'middle'
    } as React.CSSProperties
  };

  // ── KPI Cards config ──────────────────────────────────────────────────────

  const kpiCards = dynamicKPIs ? [
    { label: 'Weekly Compliance', value: dynamicKPIs.weeklyCompliance, suffix: '%', icon: CheckCircle2, accent: '#5b5ffb', sub: `${dynamicKPIs.compliantEmployees}/${dynamicKPIs.totalEmployees} compliant`, isPercent: true },
    { label: 'Missing Yesterday', value: dynamicKPIs.missingYesterday, suffix: '', icon: Calendar, accent: '#ef4444', sub: 'Employees' },
    { label: 'Below 40 Hours', value: dynamicKPIs.below40Hours, suffix: '', icon: Clock, accent: '#f59e0b', sub: 'Employees' },
    { label: 'Critical Risk', value: dynamicKPIs.criticalRisk, suffix: '', icon: AlertOctagon, accent: '#dc2626', sub: 'Employees' },
    { label: 'Escalations', value: dynamicKPIs.escalationsTriggered, suffix: '', icon: TrendingUp, accent: '#ea580c', sub: 'This week' },
    { label: 'Team Utilization', value: dynamicKPIs.teamUtilization, suffix: '%', icon: Briefcase, accent: '#10b981', sub: 'Billable hours', isPercent: true }
  ] : [];

  // ── Error state ────────────────────────────────────────────────────────────

  if (!loading && error) {
    return (
      <div style={s.page}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
          @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        `}</style>
        <div style={{ maxWidth: 500, margin: '80px auto', textAlign: 'center' }}>
          <div style={{ ...s.card, padding: 48 }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800 }}>Compliance Service Unavailable</h2>
            <p style={{ color: '#64748b', margin: '0 0 24px' }}>{error}</p>
            <button style={s.btn()} onClick={() => { hasFetched.current = false; fetchData(); hasFetched.current = true; }}>
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── All compliant empty state ─────────────────────────────────────────────

  const allCompliant = dynamicKPIs && dynamicKPIs.totalEmployees > 0 &&
    dynamicKPIs.weeklyCompliance === 100 && dynamicKPIs.missingYesterday === 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  interface ChartTooltipProps {
    active?: boolean;
    payload?: Array<{
      name: string;
      value: number | string;
      color?: string;
      fill?: string;
      unit?: string;
    }>;
    label?: string;
  }

  const CustomChartTooltip = ({ active, payload, label }: ChartTooltipProps) => {
    if (active && payload && payload.length) {
      return (
        <div style={{
          background: isDark ? '#151F32' : '#ffffff',
          border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #cbd5e1',
          padding: '10px 14px',
          borderRadius: 10,
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          color: isDark ? '#f8fafc' : '#1e293b',
          fontSize: 11,
          fontFamily: "'Inter', sans-serif"
        }}>
          <p style={{ margin: '0 0 6px', fontWeight: 800, color: '#94a3b8' }}>{label}</p>
          {payload.map((p) => (
            <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '3px 0' }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: p.color || p.fill }} />
              <span style={{ fontWeight: 600 }}>{p.name}:</span>
              <span style={{ fontWeight: 800 }}>{p.value}{p.name.includes('%') || p.unit === '%' ? '%' : ''}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div style={s.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        @keyframes shimmer {
          0% { background-position: 200% 0 }
          100% { background-position: -200% 0 }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .compliance-row:hover { background: ${isDark ? 'rgba(91,95,251,0.05)' : 'rgba(91,95,251,0.02)'} !important; }
        .action-btn:hover { opacity: 0.9 !important; }
        .kpi-card { animation: fadeIn 0.4s ease forwards; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}; border-radius: 999px; }
        select option { background: ${isDark ? '#151F32' : '#ffffff'}; color: ${isDark ? '#e2e8f0' : '#1e293b'}; }
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, background: 'linear-gradient(135deg, #a78bfa, #60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Timesheet Compliance
          </h1>
          {data && (
            <p style={{ margin: '4px 0 0', fontSize: 13, color: isDark ? '#94a3b8' : '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>
                Week of {new Date(data.weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} —{' '}
                {new Date(data.weekEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <span>·</span>
              <span style={{ color: '#5b5ffb', fontWeight: 600 }}>
                Refreshed {lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh(v => !v)}
            style={{ ...s.btn(autoRefresh ? '#10b981' : '#475569'), display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#fff', animation: autoRefresh ? 'pulse 2s infinite' : 'none' }} />
            {autoRefresh ? 'Live' : 'Paused'}
          </button>
          <button 
            onClick={() => { hasFetched.current = false; fetchData(); hasFetched.current = true; }} 
            style={{ ...s.btn(isDark ? '#334155' : '#f1f5f9'), display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button 
            onClick={exportCSV} 
            style={{ ...s.btn(isDark ? '#334155' : '#f1f5f9'), display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* ── KPI Row ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ ...s.card, animationDelay: `${i * 0.08}s` }}>
                <Skeleton h={12} w="60%" />
                <Skeleton h={36} w="80%" r={6} />
                <Skeleton h={10} w="50%" />
              </div>
            ))
          : kpiCards.map((k, i) => (
              <div key={k.label} className="kpi-card" style={{
                ...s.card,
                animationDelay: `${i * 0.08}s`,
                transition: 'transform 0.2s, box-shadow 0.2s',
                cursor: 'default',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: 110
              }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <p style={{ margin: 0, fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                      {k.label}
                    </p>
                    <k.icon className="w-4 h-4" style={{ color: k.accent }} />
                  </div>
                  <p style={{ margin: '0 0 2px', fontSize: 26, fontWeight: 900, color: k.accent, lineHeight: 1.1 }}>
                    <AnimatedNumber value={k.value} suffix={k.suffix} />
                  </p>
                </div>
                <div>
                  {k.isPercent && (
                    <div style={{ background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', borderRadius: 999, height: 4, overflow: 'hidden', margin: '6px 0 8px' }}>
                      <div style={{ background: k.accent, width: `${k.value}%`, height: '100%', borderRadius: 999 }} />
                    </div>
                  )}
                  <p style={{ margin: 0, fontSize: 10.5, color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600 }}>{k.sub}</p>
                </div>
              </div>
            ))}
      </div>

      {/* ── All Compliant Banner ───────────────────────────────────────────── */}
      {!loading && allCompliant && (
        <div style={{
          ...s.card,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          padding: '36px 20px',
          marginBottom: 24,
          background: isDark ? 'rgba(16,185,129,0.06)' : 'rgba(16,185,129,0.03)',
          border: '1px solid rgba(16,185,129,0.18)',
          borderRadius: 16
        }}>
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-3" />
          <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 900, color: '#10b981' }}>All Employees are Compliant</h2>
          <p style={{ margin: 0, color: '#64748b', fontSize: 13, fontWeight: 500 }}>Every team member has submitted their timesheets for this week.</p>
        </div>
      )}

      {/* ── Main Grid ────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, marginBottom: 24 }} className="grid-cols-1 lg:grid-cols-[1fr_340px]">

        {/* LEFT: Employee Compliance Table ─────────────────────────────── */}
        <div style={{ ...s.card, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Table header + filters */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: '20px 20px 16px', borderBottom: isDark ? '1px solid rgba(255,255,255,0.04)' : '1px solid #f1f5f9', position: 'relative', zIndex: 1005 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: isDark ? '#e2e8f0' : '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Employee Compliance</span>
              {!loading && data && <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', background: isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9', padding: '2px 8px', borderRadius: 999 }}>{filteredEmployees.length}</span>}
            </h2>
            <div className="flex gap-2 flex-wrap w-full sm:w-auto justify-end">
              <div className="relative w-full sm:w-[160px]">
                <Search className="absolute left-3 top-3 h-3.5 w-3.5 text-slate-400" />
                <input
                  style={{ ...s.input, width: '100%', paddingLeft: 34, height: 35 }}
                  placeholder="Search employees..."
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                />
              </div>
              
              <MultiSelectDropdown
                label="Department"
                options={departments}
                selectedValues={selectedDepts}
                onChange={setSelectedDepts}
              />

              <MultiSelectDropdown
                label="Risk"
                options={['critical', 'warning', 'healthy']}
                selectedValues={selectedRisks}
                onChange={setSelectedRisks}
              />

              <MultiSelectDropdown
                label="Status"
                options={['compliant', 'under_40_hours', 'missing_daily', 'unsubmitted', 'pending']}
                selectedValues={selectedStatuses}
                onChange={setSelectedStatuses}
              />
            </div>
          </div>

          {/* Table wrapper */}
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '480px' }} className="no-scrollbar">
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr>
                  {[
                    ['Employee', 'name'],
                    ['Dept', 'department'],
                    ['Manager', 'managerName'],
                    ['Hours', 'weeklyHours'],
                    ['Missing', 'missingDays'],
                    ['Compliance', 'compliancePct'],
                    ['Risk', 'riskScore'],
                    ['Status', 'complianceStatus'],
                    ['Reminders', 'reminderCount']
                  ].map(([label, key]) => (
                    <th key={label} style={s.th} onClick={() => {
                      if (sortBy === key) setSortOrder(o => o === 'desc' ? 'asc' : 'desc');
                      else { setSortBy(key as keyof EmployeeRecord); setSortOrder('desc'); }
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span>{label}</span>
                        {sortBy === key ? (sortOrder === 'desc' ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />) : null}
                      </div>
                    </th>
                  ))}
                  {canManage && <th style={s.th}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: canManage ? 10 : 9 }).map((_, j) => (
                          <td key={j} style={s.td}><Skeleton h={14} /></td>
                        ))}
                      </tr>
                    ))
                  : pageEmployees.map(emp => (
                      <tr key={emp.employeeId} className="compliance-row" style={{ transition: 'background 0.15s' }}>
                        <td style={s.td}>
                          <div style={{ fontWeight: 800, fontSize: 13, color: isDark ? '#fff' : '#1e293b' }}>{emp.name}</div>
                          <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 500 }}>{emp.role}</div>
                          {emp.isRepeatedOffender && (
                            <span style={{ fontSize: 8.5, background: 'rgba(239,68,68,0.08)', color: '#ef4444', padding: '1px 6px', borderRadius: 4, fontWeight: 800, display: 'inline-block', marginTop: 3, letterSpacing: '0.5px' }}>
                              REPEATED
                            </span>
                          )}
                        </td>
                        <td style={s.td}><span style={{ color: isDark ? '#cbd5e1' : '#475569', fontSize: 12, fontWeight: 600 }}>{emp.department}</span></td>
                        <td style={s.td}><span style={{ color: isDark ? '#94a3b8' : '#64748b', fontSize: 12, fontWeight: 550 }}>{emp.managerName || '—'}</span></td>
                        <td style={s.td}><HoursBar hours={emp.weeklyHours} target={emp.targetHours} /></td>
                        <td style={s.td}>
                          {emp.missingDays.length > 0
                            ? <span style={{ color: '#ef4444', fontSize: 11, fontWeight: 700 }}>{emp.missingDays.length} day{emp.missingDays.length > 1 ? 's' : ''}</span>
                            : <span style={{ color: '#10b981', fontSize: 11, fontWeight: 600 }}>None</span>}
                        </td>
                        <td style={s.td}>
                          <span style={{ fontWeight: 800, color: emp.compliancePct >= 100 ? '#10b981' : emp.compliancePct >= 70 ? '#f59e0b' : '#ef4444' }}>
                            {emp.compliancePct}%
                          </span>
                        </td>
                        <td style={s.td}><RiskBadge level={emp.riskLevel} /></td>
                        <td style={s.td}><StatusBadge status={emp.complianceStatus} /></td>
                        <td style={s.td}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: emp.reminderCount > 0 ? '#f59e0b' : '#64748b' }}>
                            {emp.reminderCount}
                          </span>
                        </td>
                        {canManage && (
                          <td style={s.td}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                className="action-btn w-7 h-7 rounded-lg flex items-center justify-center text-white cursor-pointer transition-all hover:scale-105 active:scale-95"
                                onClick={() => sendReminder(emp)}
                                disabled={actionLoading === `reminder-${emp.employeeId}`}
                                style={{ background: '#5b5ffb' }}
                                title="Send Reminder"
                              >
                                {actionLoading === `reminder-${emp.employeeId}` ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                              </button>
                              {isAdmin && (
                                <>
                                  <button
                                    className="action-btn w-7 h-7 rounded-lg flex items-center justify-center text-white cursor-pointer transition-all hover:scale-105 active:scale-95"
                                    onClick={() => escalate(emp)}
                                    disabled={actionLoading === `escalate-${emp.employeeId}`}
                                    style={{ background: '#dc2626' }}
                                    title="Escalate"
                                  >
                                    {actionLoading === `escalate-${emp.employeeId}` ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ArrowUp className="w-3.5 h-3.5" />}
                                  </button>
                                  <button
                                    className="action-btn w-7 h-7 rounded-lg flex items-center justify-center text-white cursor-pointer transition-all hover:scale-105 active:scale-95"
                                    onClick={() => setExceptionEmp(emp)}
                                    style={{ background: '#059669' }}
                                    title="Add Exception"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, padding: 16, alignItems: 'center', borderTop: isDark ? '1px solid rgba(255,255,255,0.04)' : '1px solid #f1f5f9' }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} title="Previous Page" aria-label="Previous Page" style={{ ...s.btn(isDark ? '#334155' : '#f1f5f9'), minWidth: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: isDark ? '#cbd5e1' : '#475569' }}>Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} title="Next Page" aria-label="Next Page" style={{ ...s.btn(isDark ? '#334155' : '#f1f5f9'), minWidth: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* RIGHT: Sidebar ───────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Department Analytics */}
          <div style={s.card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
              <BarChart3 className="w-4 h-4 text-slate-400" />
              <h3 style={{ margin: 0, fontSize: 11.5, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Department Analytics
              </h3>
            </div>
            <div style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 4 }} className="no-scrollbar">
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} style={{ marginBottom: 12 }}>
                      <Skeleton h={11} w="60%" />
                      <Skeleton h={6} r={4} />
                    </div>
                  ))
                : dynamicDeptAnalytics.map(dept => (
                    <div key={dept.department} style={{ marginBottom: 2 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: isDark ? '#e2e8f0' : '#1e293b' }}>{dept.department}</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: dept.compliancePct >= 80 ? '#10b981' : dept.compliancePct >= 60 ? '#f59e0b' : '#ef4444' }}>
                          {dept.compliancePct}%
                        </span>
                      </div>
                      <div style={{ background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', borderRadius: 999, height: 6, overflow: 'hidden' }}>
                        <div style={{
                           background: dept.compliancePct >= 80 ? '#10b981' : dept.compliancePct >= 60 ? '#f59e0b' : '#ef4444',
                           width: `${dept.compliancePct}%`, height: '100%', borderRadius: 999,
                           transition: 'width 0.8s ease'
                        }} />
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{dept.avgHours}h avg</span>
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>·</span>
                        <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{dept.totalEmployees} people</span>
                      </div>
                    </div>
                  ))}
            </div>
          </div>

          {/* Risk Distribution */}
          <div style={s.card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
              <AlertCircle className="w-4 h-4 text-slate-400" />
              <h3 style={{ margin: 0, fontSize: 11.5, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Risk Distribution
              </h3>
            </div>
            {loading
              ? <Skeleton h={80} r={12} />
              : (() => {
                  const counts = dynamicRiskCounts || { healthy: 0, warning: 0, critical: 0 };
                  const total = filteredEmployees.length || 1;
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {(['healthy', 'warning', 'critical'] as RiskLevel[]).map(level => (
                        <div key={level} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: riskColors[level].dot, flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: isDark ? '#e2e8f0' : '#1e293b', textTransform: 'capitalize' }}>{level}</span>
                              <span style={{ fontSize: 12, fontWeight: 800, color: riskColors[level].text }}>{counts[level]}</span>
                            </div>
                            <div style={{ background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', borderRadius: 999, height: 4.5, overflow: 'hidden' }}>
                              <div style={{
                                background: riskColors[level].dot,
                                width: `${(counts[level] / total) * 100}%`,
                                height: '100%', borderRadius: 999, transition: 'width 0.8s ease'
                              }} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
          </div>

          {/* Live Activity Feed */}
          <div style={{ ...s.card, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
              <TrendingUp className="w-4 h-4 text-slate-400" />
              <h3 style={{ margin: 0, fontSize: 11.5, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Live Activity
              </h3>
            </div>
            <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 4 }} className="no-scrollbar">
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)', marginTop: 4, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <Skeleton h={11} w="80%" />
                        <Skeleton h={9} w="50%" />
                      </div>
                    </div>
                  ))
                : (data?.recentActivity || []).length === 0
                  ? <p style={{ color: '#64748b', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>No recent activity</p>
                  : data!.recentActivity.map((item, idx, arr) => (
                      <div key={item.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', position: 'relative' }}>
                        {/* Connecting Timeline Line */}
                        {idx !== arr.length - 1 && (
                          <div style={{
                            position: 'absolute',
                            left: 4,
                            top: 14,
                            bottom: -18,
                            width: 1.5,
                            background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'
                          }} />
                        )}
                        <div style={{
                          width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 5,
                          background: item.type === 'escalation_triggered' ? '#ef4444' : '#5b5ffb',
                          boxShadow: item.type === 'escalation_triggered' ? '0 0 6px rgba(239,68,68,0.4)' : '0 0 6px rgba(91,95,251,0.4)'
                        }} />
                        <div>
                          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: isDark ? '#e2e8f0' : '#1e293b' }}>{item.employeeName}</p>
                          <p style={{ margin: '1px 0', fontSize: 11.5, color: isDark ? '#cbd5e1' : '#475569', textTransform: 'capitalize', fontWeight: 500 }}>
                            {item.description}
                          </p>
                          <p style={{ margin: 0, fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>
                            {new Date(item.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Charts Section ─────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }} className="grid-cols-1 lg:grid-cols-2">

        {/* Compliance Trend */}
        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18 }}>
            <TrendingUp className="w-4 h-4 text-slate-400" />
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 900, color: isDark ? '#e2e8f0' : '#1e293b' }}>Weekly Compliance Trend</h3>
          </div>
          {loading ? <Skeleton h={200} r={12} /> : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={data?.trends || []}>
                <defs>
                  <linearGradient id="compGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#5b5ffb" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#5b5ffb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"} />
                <XAxis dataKey="weekLabel" tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }} domain={[0, 100]} />
                <Tooltip content={<CustomChartTooltip />} />
                <Area type="monotone" dataKey="compliancePct" stroke="#5b5ffb" fill="url(#compGrad)" strokeWidth={2} name="Compliance %" unit="%" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Department Comparison */}
        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18 }}>
            <BarChart3 className="w-4 h-4 text-slate-400" />
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 900, color: isDark ? '#e2e8f0' : '#1e293b' }}>Department Hours vs Target</h3>
          </div>
          {loading ? <Skeleton h={200} r={12} /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dynamicDeptAnalytics}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"} />
                <XAxis dataKey="department" tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 600 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }} />
                <Tooltip content={<CustomChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10.5, fontWeight: 700, paddingTop: 10, color: isDark ? '#94a3b8' : '#475569' }} />
                <Bar dataKey="avgHours" fill="#5b5ffb" name="Avg Hours" radius={[4, 4, 0, 0]} />
                <Bar dataKey="compliancePct" fill="#10b981" name="Compliance %" radius={[4, 4, 0, 0]} unit="%" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Avg Hours Trend */}
        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18 }}>
            <Clock className="w-4 h-4 text-slate-400" />
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 900, color: isDark ? '#e2e8f0' : '#1e293b' }}>Average Hours Trend</h3>
          </div>
          {loading ? <Skeleton h={200} r={12} /> : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data?.trends || []}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"} />
                <XAxis dataKey="weekLabel" tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }} />
                <Tooltip content={<CustomChartTooltip />} />
                <Line type="monotone" dataKey="avgHours" stroke="#f59e0b" strokeWidth={2.5} dot={{ fill: '#f59e0b', r: 4 }} name="Avg Hours" />
                <Line type="monotone" dataKey="missingCount" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" dot={{ fill: '#ef4444', r: 3 }} name="Missing Count" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Missing entries distribution */}
        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18 }}>
            <AlertOctagon className="w-4 h-4 text-slate-400" />
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 900, color: isDark ? '#e2e8f0' : '#1e293b' }}>Missing Entries by Department</h3>
          </div>
          {loading ? <Skeleton h={200} r={12} /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dynamicDeptAnalytics}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"} />
                <XAxis dataKey="department" tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 600 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }} />
                <Tooltip content={<CustomChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10.5, fontWeight: 700, paddingTop: 10, color: isDark ? '#94a3b8' : '#475569' }} />
                <Bar dataKey="belowHoursCount" fill="#ef4444" name="Below 40h" radius={[4, 4, 0, 0]} />
                <Bar dataKey="criticalCount" fill="#7c3aed" name="Critical Risk" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Exception Modal ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {exceptionEmp && (
          <div style={{
            position: 'fixed', inset: 0, background: isDark ? 'rgba(0,0,0,0.65)' : 'rgba(15,23,42,0.3)',
            backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
          }}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.18 }}
              style={{ ...s.card, maxWidth: 440, width: '90%', padding: 28 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: isDark ? '#ffffff' : '#1e293b' }}>Add Exception</h3>
                <button onClick={() => setExceptionEmp(null)} title="Close" aria-label="Close" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }} className="hover:text-slate-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p style={{ color: isDark ? '#94a3b8' : '#64748b', margin: '0 0 20px', fontSize: 13.5, fontWeight: 500, lineHeight: 1.4 }}>
                Add a compliance exception to mark <strong style={{ color: isDark ? '#e2e8f0' : '#1e293b' }}>{exceptionEmp.name}</strong> as compliant for this week.
              </p>
              
              <div style={{ marginBottom: 20 }}>
                <label htmlFor="exception-reason" style={{ display: 'block', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#94a3b8', marginBottom: 6 }}>
                  Exception Reason
                </label>
                <select
                  id="exception-reason"
                  title="Exception Reason"
                  style={{ ...s.input, width: '100%', height: 38 }}
                  value={exceptionReason}
                  onChange={e => setExceptionReason(e.target.value)}
                >
                  <option value="">Select reason...</option>
                  <option value="approved_leave">Approved Leave</option>
                  <option value="client_travel">Client Travel</option>
                  <option value="public_holiday">Public Holiday</option>
                  <option value="exempt">Exempt Employee</option>
                  <option value="training">Training</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setExceptionEmp(null)} style={{ ...s.btn(isDark ? '#334155' : '#f1f5f9'), height: 36, display: 'flex', alignItems: 'center' }}>Cancel</button>
                <button
                  onClick={addException}
                  disabled={!exceptionReason || actionLoading === `exception-${exceptionEmp.employeeId}`}
                  style={{ ...s.btn('#059669'), height: 36, display: 'flex', alignItems: 'center' }}
                >
                  {actionLoading === `exception-${exceptionEmp.employeeId}` ? 'Saving...' : 'Confirm Exception'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TimesheetComplianceDashboard;
