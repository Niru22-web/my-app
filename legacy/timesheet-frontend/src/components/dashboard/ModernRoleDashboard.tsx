import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PieChart, Pie, Cell, ResponsiveContainer
} from 'recharts';
import {
  CheckCircle, Clock, Calendar,
  Target, FileText, Activity,
  Zap, ArrowRight,
  Monitor, DollarSign, Cake, BadgeIndianRupee,
  MapPin, RotateCcw, RefreshCcw, User, LifeBuoy, AlertTriangle,
  Send, MessageSquare
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import API from '../../api';
import { getDetailedLocation } from '../../utils/locationUtils';

import { HelpDeskCustomIcon } from '../Sidebar';

// UI Components
import Card from '../ui/Card';
import Button from '../ui/Button';
import Avatar from '../ui/Avatar';
import Badge from '../ui/Badge';
import DashboardSkeleton from '../ui/DashboardSkeleton';

interface ActivityItem {
  title: string;
  description: string;
  createdAt: string;
}

interface CalendarEvent {
  title: string;
  date: string;
  day?: string;
  time?: string;
  color?: string;
  type?: string;
}

interface AttendanceSession {
  check_in_time: string;
  check_out_time?: string;
  location_name?: string;
  check_in_location?: string;
  check_out_location?: string;
  duration?: number;
}

interface AttendanceRecord {
  checkInTime?: string;
  checkOutTime?: string;
  location_name?: string;
  checkInLocation?: string;
  checkOutLocation?: string;
  latitude?: number;
  longitude?: number;
}

interface AttendanceSummary {
  status: 'Active' | 'Offline' | string;
  activeSession?: AttendanceSession;
  todayRecord?: AttendanceRecord;
  location_name?: string;
}

interface DashboardData {
  attendance?: Array<{ day: string; hours: number }>;
  leaves?: {
    used: number;
    balance: number;
    total?: number;
  };
  expenses?: {
    total: number;
    breakdown: Array<{ category: string; amount: number }>;
  };
  activities?: ActivityItem[];
  birthdays?: Array<{ name: string; role: string; date: string }>;
  events?: CalendarEvent[];
  pendingApprovals?: {
    leaves?: number;
    assets?: number;
    reimbursements?: number;
    tickets?: number;
  };
  myAssetRequests?: number;
  myTickets?: number;
  stats?: {
    pendingInvoices?: number;
  };
}

const COLORS = {
  primary: '#6366f1', // Indigo 500
  secondary: '#a855f7', // Purple 500
  success: '#10b981', // Emerald 500
  warning: '#f59e0b', // Amber 500
  danger: '#ef4444', // Red 500
  info: '#3b82f6', // Blue 500
  muted: '#94a3b8', // Slate 400
};

const formatLocation = (loc: string | null | undefined) => {
  if (!loc) return '';
  if (loc.includes('GPS:')) return loc.replace('GPS:', '').trim();
  const parts = loc.split(',');
  if (parts.length > 2) return parts.slice(0, 2).join(',').trim();
  return loc.trim();
};

const HERO_THEMES: Record<string, string> = {
  cyberNight:
    'linear-gradient(135deg, #0f172a 0%, #1e293b 30%, #312e81 65%, #2563eb 100%)',
  graphitePurple:
    'linear-gradient(135deg, #1e293b 0%, #334155 30%, #4c1d95 70%, #7c3aed 100%)',
  aurora_img: "url('/images/bg_aurora_minimal.png') center/cover no-repeat",
  nebula_img: "url('/images/bg_midnight_nebula.png') center/cover no-repeat"
};

const PaletteIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 14.7255 3.09032 17.1962 4.85857 19C5.03456 19.176 5.12256 19.264 5.23432 19.3248C5.35266 19.3892 5.48312 19.4263 5.61746 19.434C5.74418 19.4412 5.86791 19.4093 6.11537 19.3654L6.44296 19.3072C7.29177 19.1563 7.71618 19.0809 8.08253 19.1678C8.4116 19.2458 8.70617 19.4239 8.92484 19.6766C9.1683 19.9579 9.27306 20.3703 9.48256 21.1951L9.62024 21.7371C9.72146 22.1356 9.77207 22.3349 9.89736 22.4835C10.0076 22.6144 10.1558 22.7126 10.3235 22.7656C10.514 22.8257 10.7188 22.7848 11.1284 22.7028C11.4172 22.6451 11.7118 22.6152 12.0086 22.0044C12 22 12 22 12 22Z" />
    <circle cx="7.5" cy="10.5" r="1.5" fill="currentColor" />
    <circle cx="11.5" cy="7.5" r="1.5" fill="currentColor" />
    <circle cx="16.5" cy="9.5" r="1.5" fill="currentColor" />
    <circle cx="15.5" cy="14.5" r="1.5" fill="currentColor" />
  </svg>
);

const ModernRoleDashboard: React.FC<{ userRole: string }> = ({ userRole }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { themeMode } = useTheme();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);

  // Unified Attendance States
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummary | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(true);

  // Compliance States
  const [complianceData, setComplianceData] = useState<any>(null);

  const fetchComplianceData = useCallback(async () => {
    try {
      const res = await API.get('/compliance/dashboard');
      if (res.data && res.data.success) {
        setComplianceData(res.data.data);
      }
    } catch (error) {
      console.error('❌ Compliance data fetch error:', error);
    }
  }, []);

  // Dynamic banner theme selection
  const [heroTheme, setHeroTheme] = useState<string>(() => {
    const saved = localStorage.getItem('hero-bg-theme');
    return (saved && saved !== 'classic') ? saved : 'cyberNight';
  });
  const [showPalette, setShowPalette] = useState(false);

  const handleThemeChange = (themeName: string) => {
    localStorage.setItem('hero-bg-theme', themeName);
    setHeroTheme(themeName);
    window.dispatchEvent(new CustomEvent('hero-bg-theme-updated', { detail: themeName }));
  };

  useEffect(() => {
    const handleEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setHeroTheme(customEvent.detail);
      }
    };
    window.addEventListener('hero-bg-theme-updated', handleEvent);
    return () => {
      window.removeEventListener('hero-bg-theme-updated', handleEvent);
    };
  }, []);
  const [attendanceActionLoading, setAttendanceActionLoading] = useState(false);
  const [attendanceTimer, setAttendanceTimer] = useState('00:00:00');

  console.log("🛠️ ModernRoleDashboard rendering", { userRole, loading, hasData: !!dashboardData });

  const fetchDashboardData = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const res = await API.get('/dashboard/combined');
      console.log("📊 Dashboard Data Response:", res.data);
      if (res.data && res.data.success) {
        setDashboardData(res.data.data);
      }
    } catch (error) {
      console.error('❌ Dashboard data fetch error:', error);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  const fetchAttendanceStatus = useCallback(async () => {
    try {
      setAttendanceLoading(true);
      const res = await API.get('/attendance/today');
      if (res.data && res.data.success) {
        setAttendanceSummary(res.data.data);
      } else {
        setAttendanceSummary(null);
      }
    } catch (error) {
      console.error('Failed to fetch attendance status:', error);
      setAttendanceSummary(null);
    } finally {
      setAttendanceLoading(false);
    }
  }, []);

  const handleAttendanceAction = async () => {
    const isActive = attendanceSummary?.status === 'Active';
    const endpoint = isActive ? '/attendance/logout' : '/attendance/check-in';
    const successMsg = isActive ? 'Check-out recorded successfully' : 'Check-in confirmed';

    try {
      setAttendanceActionLoading(true);
      const locData = await getDetailedLocation();
      const location = locData.address;

      const payload: {
        location: string;
        latitude: number | null;
        longitude: number | null;
        manualCheckIn?: boolean;
      } = {
        location,
        latitude: locData.latitude,
        longitude: locData.longitude
      };
      if (!isActive) {
        payload.manualCheckIn = true;
      }

      await API.post(endpoint, payload);
      toast.success(successMsg);
      await fetchAttendanceStatus();
      await fetchDashboardData(false);
    } catch (error) {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError.response?.data?.message || 'Action failed');
      await fetchAttendanceStatus();
    } finally {
      setAttendanceActionLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchDashboardData();
      fetchAttendanceStatus();
      fetchComplianceData();
      const interval = setInterval(() => {
        if (!document.hidden) {
          fetchDashboardData(false);
          fetchAttendanceStatus();
          fetchComplianceData();
        }
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [user?.id, fetchDashboardData, fetchAttendanceStatus, fetchComplianceData]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const isActive = attendanceSummary?.status === 'Active' && attendanceSummary?.activeSession?.check_in_time;

    if (isActive && attendanceSummary?.activeSession?.check_in_time) {
      const startTime = new Date(attendanceSummary.activeSession.check_in_time).getTime();
      const updateTimer = () => {
        const now = new Date().getTime();
        const diff = Math.max(0, now - startTime);
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setAttendanceTimer(`${String(h || 0).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}:${String(s || 0).padStart(2, '0')}`);
      };
      updateTimer();
      interval = setInterval(updateTimer, 1000);
    } else {
      setAttendanceTimer('00:00:00');
    }
    return () => { if (interval) clearInterval(interval); };
  }, [attendanceSummary]);



  // Data Mapping
  const timesheetData = (() => {
    const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // Initialize the mapped week structure dynamically starting at 0 hours
    const mapped: Record<string, { day: string; 'This Week': number; 'Previous Week': number }> = {};
    DAYS.forEach(day => {
      mapped[day] = {
        day,
        'This Week': 0,
        'Previous Week': 0
      };
    });

    const rawAttendance = dashboardData?.attendance || [];

    // Get the start of this week's Monday in the user's local timezone (at 00:00:00)
    const today = new Date();
    const currentDay = today.getDay();
    const daysToSubtract = currentDay === 0 ? 6 : currentDay - 1;
    const thisWeekMonday = new Date(today);
    thisWeekMonday.setDate(today.getDate() - daysToSubtract);
    thisWeekMonday.setHours(0, 0, 0, 0);

    // Distribute database logs to This Week and Previous Week based on exact dates
    rawAttendance.forEach((entry: { date?: string; day?: string; hours: number }) => {
      if (!entry.date) return;
      const entryDate = new Date(entry.date);
      const dayName = entryDate.toLocaleDateString('en-US', { weekday: 'short' });
      
      if (mapped[dayName]) {
        if (entryDate >= thisWeekMonday) {
          mapped[dayName]['This Week'] = entry.hours || 0;
        } else {
          mapped[dayName]['Previous Week'] = entry.hours || 0;
        }
      }
    });

    // Add live running session hours to today's This Week column
    if (attendanceSummary?.status === 'Active' && attendanceSummary?.activeSession?.check_in_time) {
      const todayDayName = new Date().toLocaleDateString('en-US', { weekday: 'short' });
      const startTime = new Date(attendanceSummary.activeSession.check_in_time).getTime();
      const now = new Date().getTime();
      const diff = Math.max(0, now - startTime);
      const runningHours = diff / 3600000;
      
      if (mapped[todayDayName]) {
        mapped[todayDayName]['This Week'] = (mapped[todayDayName]['This Week'] || 0) + runningHours;
      }
    }

    return DAYS.map(day => mapped[day]);
  })();

  const thisWeekTotalHours = timesheetData.reduce((acc, curr) => acc + (curr['This Week'] || 0), 0);
  const prevWeekTotalHours = timesheetData.reduce((acc, curr) => acc + (curr['Previous Week'] || 0), 0);

  const expenseBreakdown = (dashboardData?.expenses?.breakdown && dashboardData.expenses.breakdown.length > 0)
    ? dashboardData.expenses.breakdown.map((item: { category: string; amount: number }, i: number) => ({
      name: item.category || 'Other',
      value: item.amount || 0,
      color: [COLORS.primary, COLORS.secondary, COLORS.warning, COLORS.success][i % 4],
      bgClass: ['bg-indigo-500', 'bg-pink-500', 'bg-amber-500', 'bg-emerald-500'][i % 4]
    }))
    : [
      { name: 'Travel', value: 0, color: COLORS.primary, bgClass: 'bg-indigo-500' },
      { name: 'Meals', value: 0, color: COLORS.warning, bgClass: 'bg-amber-500' }
    ];

  const isAdmin = ['admin', 'partner', 'owner'].some(r => userRole.toLowerCase().includes(r));
  const isManager = userRole.toLowerCase().includes('manager');
  const isPartner = userRole.toLowerCase().includes('partner');
  const isHR = userRole.toLowerCase().includes('hr');
  const isIT = userRole.toLowerCase().includes('it');
  const isAccountant = userRole.toLowerCase().includes('accountant');

  const showComplianceAndActivity = (
    userRole.toLowerCase().includes('admin') || 
    userRole.toLowerCase().includes('it') || 
    userRole.toLowerCase() === 'owner'
  ) && !userRole.toLowerCase().includes('partner');

  if (loading && !dashboardData) {
    return <DashboardSkeleton />;
  }

  if (!user) {
    console.warn("⚠️ No user in AuthContext, possibly session expired");
    console.log("Current User Role: undefined (No User)");
    console.log("Dashboard Loaded");
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] text-center p-6 bg-white dark:bg-slate-800 rounded-3xl shadow-xl">
        <Activity className="w-12 h-12 text-indigo-500 animate-bounce mb-4" />
        <h2 className="text-2xl font-black text-gray-900 dark:text-slate-100">Default Workspace Dashboard</h2>
        <p className="text-gray-500 dark:text-slate-400 mt-2 max-w-md">Your profile is loading. Please refresh if this takes longer than usual.</p>
      </div>
    );
  }

  // Temporary Console Logging
  console.log("Current User Role:", user.role);
  console.log("Dashboard Loaded");

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="space-y-8 pb-12 max-w-[1600px] mx-auto px-4 md:px-0"
    >
      {/* Dynamic CSS styles to avoid inline style warnings */}
      <style dangerouslySetInnerHTML={{
        __html: `
          .dynamic-hero-banner {
            background: ${HERO_THEMES[heroTheme] || HERO_THEMES.cyberNight} !important;
          }
          ${Object.entries(HERO_THEMES).map(([key, value]) => `
            .dashboard-theme-bubble-${key} {
              background: ${value} !important;
            }
          `).join('\n')}
        `
      }} />

      {/* 1. TOP HERO BANNER */}
      <motion.section
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className={`relative overflow-hidden ${isAccountant ? 'rounded-xl' : 'rounded-3xl'} py-5 md:py-6 px-6 md:px-8 shadow-2xl ring-1 ring-white/10 dynamic-hero-banner`}
      >
        {/* Theme picker widget */}
        <div className="absolute top-4 right-4 z-30 flex items-center gap-2 bg-black/25 backdrop-blur-md px-3 py-2 rounded-full border border-white/10 shadow-lg">
          <AnimatePresence>
            {showPalette && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 'auto', opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                className="flex items-center gap-2 overflow-hidden pr-2 border-r border-white/10 mr-1"
              >
                {Object.entries(HERO_THEMES).map(([key]) => (
                  <button
                    key={key}
                    onClick={() => handleThemeChange(key)}
                    className={`w-6 h-6 rounded-full border-2 transition-all hover:scale-125 focus:outline-none dashboard-theme-bubble-${key} ${heroTheme === key ? 'border-white scale-110 shadow-md' : 'border-transparent opacity-75 hover:opacity-100'}`}
                    title={key.charAt(0).toUpperCase() + key.slice(1)}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          <button
            onClick={() => setShowPalette(!showPalette)}
            className="text-white hover:text-indigo-200 transition-colors p-0.5 focus:outline-none"
            title="Change Header Background"
          >
            <PaletteIcon />
          </button>
        </div>
        <style dangerouslySetInnerHTML={{
          __html: `
          @keyframes float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-5px); }
          }
          @keyframes glow-pulse {
            0%, 100% { box-shadow: 0 0 10px rgba(99, 102, 241, 0.15); }
            50% { box-shadow: 0 0 20px rgba(99, 102, 241, 0.5); }
          }
          @keyframes badge-pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
          }

          .animate-float {
            animation: float 4s ease-in-out infinite;
          }
          .animate-glow-pulse {
            animation: glow-pulse 3s ease-in-out infinite;
          }
          .animate-badge-pulse {
            animation: badge-pulse 2.5s ease-in-out infinite;
          }
        `}} />

        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute top-0 right-0 -m-20 w-80 h-80 bg-indigo-500/20 blur-[120px] rounded-full"></div>
          <div className="absolute bottom-0 left-0 -m-20 w-64 h-64 bg-purple-500/20 blur-[100px] rounded-full opacity-50"></div>
        </div>

        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col md:flex-row items-center gap-5 text-center md:text-left">
            <div className="relative shrink-0 animate-float">
              <div className="relative flex justify-center rounded-full animate-glow-pulse">
                {user?.profileImage ? (
                  <Avatar
                    src={user?.profileImage}
                    name={user?.name || "UU"}
                    size="xl"
                    border
                    updatedAt={user?.updatedAt}
                    className="rounded-full shadow-2xl"
                  />
                ) : (
                  <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-white flex items-center justify-center border-4 border-white/20 shadow-2xl shrink-0">
                    <span className="text-2xl md:text-3xl font-black text-[#6366f1] tracking-tight">
                      {user?.name ? user.name.split(' ').filter(Boolean).map(p => p[0]).join('').toUpperCase().slice(0, 2) : 'UU'}
                    </span>
                  </div>
                )}
              </div>
              <div className="absolute bottom-0 right-0 w-6.5 h-6.5 bg-emerald-500 rounded-full border-2 border-indigo-950 flex items-center justify-center shadow-lg z-10 animate-badge-pulse">
                <CheckCircle size={11} className="text-white" />
              </div>
            </div>

            <div className="space-y-2 md:space-y-3">
              <div>
                <h1 className="text-2xl md:text-3xl font-black text-white tracking-tighter">
                  Hi, {user?.name?.split(' ')[0] || 'Niranjan'}!
                </h1>
                <p className="text-indigo-100/80 font-medium text-xs md:text-sm mt-1 max-w-xl leading-relaxed">
                  Your productivity is awesome. Let's keep it going! 🚀
                </p>
              </div>

              <div className="flex flex-wrap justify-center md:justify-start gap-2.5 pt-1">
                <button
                  onClick={() => navigate('/profile')}
                  className="dashboard-btn-primary"
                >
                  <User size={14} /> View Profile
                </button>
                <button
                  onClick={() => navigate('/timesheet')}
                  className="dashboard-btn-secondary"
                >
                  Let's do more today..
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sleek Integrated Attendance Bottom Bar */}
        <div className="relative z-10 bg-white/[0.03] backdrop-blur-md border-t border-white/10 p-4.5 -mx-6 -mb-5 md:-mx-8 md:-mb-6 mt-6 flex flex-col lg:flex-row items-center justify-between gap-5 text-left rounded-b-3xl">
          {/* Left Block: Pulsing session state badge and Live Timer */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 w-full lg:w-auto shrink-0">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm self-start sm:self-auto">
              <span className={`w-2 h-2 rounded-full ${attendanceSummary?.status === 'Active' ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-slate-400'}`}></span>
              <span className="text-[10px] font-black text-white uppercase tracking-widest">
                {attendanceSummary?.status === 'Active' ? 'Present / Checked-in' : 'Offline / Checked-out'}
              </span>
            </div>

            <div className="flex items-center gap-2.5 px-4 py-1.5 bg-white/5 rounded-2xl border border-white/5 self-start sm:self-auto">
              <Clock size={16} className={`w-4 h-4 ${attendanceSummary?.status === 'Active' ? 'text-indigo-400 animate-spin-slow' : 'text-slate-400'}`} />
              <div className="flex items-baseline gap-1.5">
                <span className={`text-xl font-black tabular-nums tracking-tight ${attendanceSummary?.status === 'Active' ? 'text-white' : 'text-slate-400'}`}>
                  {attendanceTimer}
                </span>
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Working Hours</span>
              </div>
            </div>
          </div>

          {/* Middle Block: Check-in / Check-out Location columns */}
          <div className="flex flex-col sm:flex-row flex-1 min-w-0 gap-4 sm:gap-8 w-full lg:w-auto lg:min-w-0 lg:px-6">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="p-2 rounded-xl bg-white/5 text-emerald-400 border border-white/5 shrink-0">
                <MapPin size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Check-in</p>
                <p
                  className="text-xs font-bold text-indigo-100 truncate mt-0.5 leading-tight"
                  title={attendanceSummary?.todayRecord?.checkInTime
                    ? `${attendanceSummary.todayRecord.location_name || attendanceSummary.todayRecord.checkInLocation || `${Number(attendanceSummary.todayRecord.latitude || 19.115).toFixed(4)}, ${Number(attendanceSummary.todayRecord.longitude || 72.849).toFixed(4)}`} (${new Date(attendanceSummary.todayRecord.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`
                    : ''
                  }
                >
                  {attendanceSummary?.todayRecord?.checkInTime
                    ? (formatLocation(attendanceSummary.todayRecord.location_name || attendanceSummary.todayRecord.checkInLocation) ||
                      `${Number(attendanceSummary.todayRecord.latitude || 19.115).toFixed(4)}, ${Number(attendanceSummary.todayRecord.longitude || 72.849).toFixed(4)}`)
                    : '—'}
                  {attendanceSummary?.todayRecord?.checkInTime && (
                    <span className="text-[10px] text-slate-400 font-medium ml-1">
                      ({new Date(attendanceSummary.todayRecord.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="p-2 rounded-xl bg-white/5 text-rose-400 border border-white/5 shrink-0">
                <MapPin size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Check-out</p>
                <p
                  className="text-xs font-bold text-indigo-100 truncate mt-0.5 leading-tight"
                  title={attendanceSummary?.todayRecord?.checkOutTime
                    ? `${attendanceSummary.location_name || attendanceSummary.todayRecord.checkOutLocation || 'Andheri East, Mumbai'} (${new Date(attendanceSummary.todayRecord.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`
                    : ''
                  }
                >
                  {attendanceSummary?.todayRecord?.checkOutTime
                    ? `${formatLocation(attendanceSummary.location_name || attendanceSummary.todayRecord.checkOutLocation || 'Andheri East, Mumbai')} (${new Date(attendanceSummary.todayRecord.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`
                    : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Right Block: Action Buttons */}
          <div className="flex items-center gap-2.5 w-full lg:w-auto justify-end shrink-0">
            <button
              type="button"
              onClick={handleAttendanceAction}
              disabled={attendanceActionLoading}
              className={attendanceSummary?.status === 'Active' ? 'dashboard-btn-primary-rose' : 'dashboard-btn-primary'}
            >
              {attendanceActionLoading ? (
                <RefreshCcw size={14} className="animate-spin" />
              ) : (
                attendanceSummary?.status === 'Active' ? 'Check-out' : 'Check-in'
              )}
            </button>

            <button
              type="button"
              onClick={fetchAttendanceStatus}
              aria-label="Refresh Status"
              title="Refresh Status"
              className="dashboard-btn-secondary"
            >
              <RotateCcw size={15} className={attendanceLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </motion.section>

      {/* 2.25 EMPLOYEE TIMESHEET COMPLIANCE BANNER */}
      {!isAdmin && !isManager && !isHR && !isIT && !isAccountant && complianceData && (
        (() => {
          const myCompliance = complianceData.employeesBelow40?.find((e: any) => e.id === user?.id);
          if (!myCompliance) return null;
          return (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 p-5 rounded-2xl flex items-start gap-4 shadow-sm"
            >
              <div className="p-3 bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400 rounded-xl shrink-0">
                <AlertTriangle size={24} className="animate-pulse" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-black text-rose-900 dark:text-rose-350 uppercase tracking-wide">⚠ Your timesheet is incomplete</h3>
                
                <div className="mt-3 max-w-md">
                  <div className="flex justify-between text-xs font-semibold text-rose-900 dark:text-rose-300 mb-1">
                    <span>Logged Hours</span>
                    <span>{myCompliance.loggedHours} / 40 hrs</span>
                  </div>
                  <div className="w-full bg-rose-200/50 dark:bg-rose-950/50 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-rose-600 h-full rounded-full transition-all duration-500" 
                      style={{ width: `${Math.min((myCompliance.loggedHours / 40) * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>

                {myCompliance.missingDays && myCompliance.missingDays.length > 0 && (
                  <p className="text-xs text-rose-700 dark:text-rose-400 mt-2 font-medium">
                    Missing Entries: <span className="font-extrabold">{myCompliance.missingDays.join(', ')}</span>
                  </p>
                )}

                <div className="mt-4">
                  <button
                    onClick={() => navigate('/timesheet')}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl shadow-md transition-all cursor-pointer"
                  >
                    Fill Timesheet
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })()
      )}

      {/* 2.5 ACCOUNTANT METRIC CARDS */}
      {isAccountant && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-8">
          {[
            { title: 'Pending Invoices', count: dashboardData?.stats?.pendingInvoices || 12, icon: FileText, color: 'blue', bgColor: 'bg-blue-50', textColor: 'text-blue-600', trend: '+3% this week' },
            { title: 'Total Expenses', count: `₹${(dashboardData?.expenses?.total || 0).toLocaleString()}`, icon: DollarSign, color: 'emerald', bgColor: 'bg-emerald-50', textColor: 'text-emerald-600', trend: 'Monthly spend' },
            { title: 'Reimbursements', count: dashboardData?.pendingApprovals?.reimbursements || 0, icon: BadgeIndianRupee, color: 'purple', bgColor: 'bg-purple-50', textColor: 'text-purple-600', trend: 'Pending review' },
            { title: 'Financial Tasks', count: 8, icon: Target, color: 'amber', bgColor: 'bg-amber-50', textColor: 'text-amber-600', trend: 'Due today' }
          ].map((stat, i) => (
            <Card key={i} className="p-6 border border-slate-100 bg-white rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 group">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-lg ${stat.bgColor} ${stat.textColor} group-hover:scale-110 transition-transform`}>
                  <stat.icon size={24} />
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{stat.trend}</span>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-500 uppercase tracking-tight">{stat.title}</p>
                <h3 className="text-3xl font-black text-slate-900 mt-1">{stat.count}</h3>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* 2.75 TIMESHEET COMPLIANCE SUMMARY (For Admins/IT/Owners only) */}
      {showComplianceAndActivity && complianceData && (
        <div className="mt-6">
          <Card 
            onClick={() => navigate('/compliance')}
            className="p-6 border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800 rounded-3xl shadow-xl hover:shadow-2xl transition-all cursor-pointer flex flex-col justify-between"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-black text-gray-900 dark:text-slate-100 uppercase tracking-tight">Team Compliance</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Timesheet status overview</p>
              </div>
              <span className="text-xs font-black px-2.5 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full">
                {complianceData.weeklyCompliancePct}% compliant
              </span>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">Total missing yesterday:</span>
                <span className="font-extrabold text-rose-600">{complianceData.missingTimesheetsCount} employees</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">Below 40 hrs this week:</span>
                <span className="font-extrabold text-amber-600">{complianceData.employeesBelow40Count} employees</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">Team utilization rate:</span>
                <span className="font-extrabold text-emerald-600">{complianceData.teamUtilization}%</span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex justify-end">
              <span className="text-xs font-bold text-indigo-650 dark:text-indigo-400 flex items-center hover:underline">
                View Compliance Center <ArrowRight size={14} className="ml-1" />
              </span>
            </div>
          </Card>
        </div>
      )}

      {/* 3. MAIN DASHBOARD CONTENT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* LEFT COLUMN (2/3) */}
        <div className="lg:col-span-8 space-y-8 h-full">

          {/* Middle Row: Activity & Timesheet */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {showComplianceAndActivity ? (
              <Card
                className={`p-6 ${isAccountant ? 'border border-slate-100 shadow-sm' : 'border-none shadow-xl shadow-gray-200/50'} bg-white dark:bg-slate-800 ${isAccountant ? 'rounded-xl' : 'rounded-[2rem]'} dark:shadow-none hover:shadow-2xl dark:hover:bg-slate-700/50 transition-all h-full flex flex-col`}
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-black text-gray-900 dark:text-slate-100 uppercase tracking-tight">Recent Activity</h3>
                </div>
                <div className="space-y-4 flex-1">
                  {dashboardData?.activities && dashboardData.activities.length > 0 ? (
                    dashboardData.activities.map((activity: ActivityItem, i: number) => (
                      <div key={i} className="flex gap-3 group">
                        <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">
                          <Zap size={14} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-900 dark:text-slate-200 leading-tight truncate">{activity.title}</p>
                          <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1 truncate">{activity.description}</p>
                        </div>
                        <span className="ml-auto text-[10px] text-gray-400 dark:text-slate-500 whitespace-nowrap">
                          {new Date(activity.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 text-center opacity-50 h-full">
                    <Activity size={24} className="text-gray-200 dark:text-slate-700 mb-2" />
                      <p className="text-[10px] text-gray-400 dark:text-slate-500">No activity recorded</p>
                    </div>
                  )}
                </div>
              </Card>
            ) : (
              <TeamChat />
            )}

            <Card
              onClick={() => navigate('/attendance')}
              className={`p-5 ${isAccountant ? 'border border-slate-100 shadow-sm' : 'border-none shadow-xl shadow-gray-200/50'} bg-white dark:bg-slate-800 ${isAccountant ? 'rounded-xl' : 'rounded-[2rem]'} dark:shadow-none hover:shadow-2xl dark:hover:bg-slate-700/50 transition-all h-full flex flex-col cursor-pointer`}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-black text-gray-900 dark:text-slate-100 uppercase tracking-tight">Timesheet Trend</h3>
                  <p className="text-[9px] font-bold text-slate-400 mt-0.5 uppercase tracking-wider">
                    This Week: <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">{thisWeekTotalHours.toFixed(1)} hrs</span> | Last Week: <span className="text-slate-600 dark:text-slate-400 font-extrabold">{prevWeekTotalHours.toFixed(1)} hrs</span>
                  </p>
                </div>
                <div className="px-2 py-1 bg-gray-50 dark:bg-slate-900/50 rounded-lg text-[10px] font-bold text-gray-400 dark:text-slate-500">
                  {isAdmin ? 'Firm-wide' : 'Weekly Log'}
                </div>
              </div>

              {/* Day Columns */}
              <div className="flex-1 flex gap-2.5 sm:gap-3 overflow-hidden min-w-0 items-stretch py-2">
                {(() => {
                  const maxVal = Math.max(
                    ...timesheetData.map(d => Math.max(d['This Week'], d['Previous Week'])),
                    1
                  );
                  const maxHours = maxVal * 1.15;

                  return timesheetData.map((entry) => {
                    const prevPct = maxHours > 0 ? (entry['Previous Week'] / maxHours) * 100 : 0;
                    const thisPct = maxHours > 0 ? (entry['This Week'] / maxHours) * 100 : 0;
                    const isToday = entry.day === new Date().toLocaleDateString('en-US', { weekday: 'short' });

                    return (
                      <div
                        key={entry.day}
                        className={`flex-1 min-w-0 flex flex-col items-center justify-between p-2.5 bg-slate-50/20 dark:bg-slate-800/10 rounded-2xl border border-slate-100/70 dark:border-slate-800/60 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all duration-300 group relative`}
                      >
                        {/* Tooltip on hover */}
                        <div className="absolute top-[28px] left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 flex items-center gap-0.5 z-20 pointer-events-none transition-all duration-200 transform translate-y-1 group-hover:translate-y-0 scale-95 group-hover:scale-100">
                          <span className="bg-slate-950 text-white text-[8px] font-black px-1.5 py-0.5 rounded-md shadow-lg whitespace-nowrap">
                            Last: {entry['Previous Week'].toFixed(1)}h
                          </span>
                          <span className="bg-indigo-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-md shadow-lg whitespace-nowrap">
                            This: {entry['This Week'].toFixed(1)}h
                          </span>
                        </div>

                        {/* Day name at top */}
                        <span className="text-[10px] sm:text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          {entry.day}
                        </span>

                        {/* Bar area in middle */}
                        <div className="w-full flex items-end justify-center gap-1 sm:gap-1.5 h-[90px] my-2">
                          {/* Prev week bar */}
                          <div className="w-2.5 sm:w-3 bg-slate-200 dark:bg-slate-700/60 rounded-full h-full flex items-end overflow-hidden">
                            <motion.div
                              initial={{ height: 0 }}
                              animate={{ height: `${prevPct}%` }}
                              transition={{ duration: 0.7, ease: 'easeOut' }}
                              className="w-full bg-slate-300 dark:bg-slate-600 rounded-full"
                            />
                          </div>
                          {/* This week bar */}
                          <div className={`w-2.5 sm:w-3 bg-slate-100 dark:bg-slate-800/40 rounded-full h-full flex items-end overflow-hidden ${isToday ? 'ring-1 ring-indigo-300/30' : ''}`}>
                            <motion.div
                              initial={{ height: 0 }}
                              animate={{ height: `${thisPct}%` }}
                              transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 }}
                              className="w-full bg-indigo-500 dark:bg-indigo-400 rounded-full shadow-sm shadow-indigo-500/10"
                            />
                          </div>
                        </div>

                        {/* Hours info stacked vertically */}
                        <div className="flex flex-col items-center gap-0.5 mt-1">
                          <span className="text-[11px] sm:text-xs font-black text-indigo-600 dark:text-indigo-400">
                            {entry['This Week'].toFixed(1)}h
                          </span>
                          <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 dark:text-slate-500">
                            vs {entry['Previous Week'].toFixed(1)}h
                          </span>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Legend */}
              <div className="flex items-center justify-center gap-4 mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/60">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2 rounded-sm bg-slate-200 dark:bg-slate-600" />
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Prev Week ({prevWeekTotalHours.toFixed(1)} hrs)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2 rounded-sm bg-indigo-500" />
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">This Week ({thisWeekTotalHours.toFixed(1)} hrs)</span>
                </div>
              </div>
            </Card>
          </div>

          {/* Bottom Row: Management Workflow Approvals (For Admins/HR/IT/Managers/Partners/Accountants) */}
          {(isAdmin || isHR || isIT || isManager || isAccountant) && (
            <Card className={`p-8 ${isAccountant ? 'border border-slate-100 shadow-sm' : 'border-none shadow-xl shadow-gray-200/50'} bg-white dark:bg-slate-800 ${isAccountant ? 'rounded-xl' : 'rounded-[2.5rem]'} dark:shadow-none`}>
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-lg font-black text-gray-900 dark:text-slate-100 tracking-tight">{isAccountant ? 'Financial Operations' : 'Workflow Approvals'}</h3>
                  <p className="text-xs font-bold text-gray-400 dark:text-slate-500 mt-1 uppercase tracking-widest">{isAccountant ? 'Accounts & Finance' : 'Action Required'}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 auto-rows-fr">
                {/* Leave Requests Card */}
                <div
                  onClick={() => navigate('/leave-management')}
                  className="flex flex-col gap-5 p-6 bg-indigo-50/50 dark:bg-indigo-900/20 rounded-[2rem] border border-indigo-100 dark:border-indigo-900/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all h-full cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <div className="p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-indigo-50 dark:border-indigo-900/30 group-hover:scale-110 transition-transform">
                      <Calendar size={24} className="text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <Badge variant="custom" className="px-3 py-1 bg-indigo-600 text-white font-black rounded-full shadow-lg shadow-indigo-100 dark:shadow-none border-transparent">
                      {dashboardData?.pendingApprovals?.leaves || 0}
                    </Badge>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-black text-gray-900 dark:text-slate-100">Leave Requests</p>
                    <p className="text-[10px] text-gray-500 dark:text-slate-400 mt-1 font-bold">Manage employee time-off requests</p>
                  </div>
                  <Button variant="custom" size="sm" className={`w-full bg-indigo-600 hover:bg-indigo-700 text-white ${isAccountant ? 'rounded-lg' : 'rounded-xl'} text-xs font-bold py-3 shadow-lg shadow-indigo-100 dark:shadow-none transition-all`}>Process Approvals</Button>
                </div>

                {/* Reimbursement Card */}
                <div
                  onClick={() => {
                    if (userRole.toLowerCase().includes('accountant')) {
                      navigate('/finance/reimbursement-processing');
                    } else {
                      navigate('/reimbursement');
                    }
                  }}
                  className="flex flex-col gap-5 p-6 bg-rose-50/50 dark:bg-rose-900/20 rounded-[2rem] border border-rose-100 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-all h-full cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <div className="p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-rose-50 dark:border-rose-900/30 group-hover:scale-110 transition-transform">
                      <BadgeIndianRupee size={24} className="text-rose-600 dark:text-rose-400" />
                    </div>
                    <Badge variant="custom" className="px-3 py-1 bg-rose-600 text-white font-black rounded-full shadow-lg shadow-rose-100 dark:shadow-none border-transparent">
                      {dashboardData?.pendingApprovals?.reimbursements || 0}
                    </Badge>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-black text-gray-900 dark:text-slate-100">Reimbursement Requests</p>
                    <p className="text-[10px] text-gray-500 dark:text-slate-400 mt-1 font-bold">Review employee expense claims</p>
                  </div>
                  <Button
                    variant="custom"
                    size="sm"
                    className={`w-full bg-rose-600 hover:bg-rose-700 text-white ${isAccountant ? 'rounded-lg' : 'rounded-xl'} text-xs font-bold py-3 shadow-lg shadow-rose-100 dark:shadow-none transition-all`}
                  >
                    Process Claims
                  </Button>
                </div>

                {/* Asset Box - Dynamic Content based on Role */}
                {(['admin', 'hr', 'it'].some(r => userRole.toLowerCase().includes(r)) && !userRole.toLowerCase().includes('partner')) ? (
                  /* Admin/HR/IT: Asset Management View */
                  <div
                    onClick={() => navigate('/admin/asset-management')}
                    className="flex flex-col gap-5 p-6 bg-rose-50/50 dark:bg-rose-900/20 rounded-[2rem] border border-rose-100 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-all h-full cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-rose-50 dark:border-rose-900/30 group-hover:scale-110 transition-transform">
                        <Monitor size={24} className="text-rose-600 dark:text-rose-400" />
                      </div>
                      <Badge variant="custom" className="px-3 py-1 bg-rose-600 text-white font-black rounded-full shadow-lg shadow-rose-100 dark:shadow-none border-transparent">
                        {dashboardData?.pendingApprovals?.assets || 0}
                      </Badge>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-black text-gray-900 dark:text-slate-100">Asset Approvals</p>
                      <p className="text-[10px] text-gray-500 dark:text-slate-400 mt-1 font-bold">Inventory & hardware allocation</p>
                    </div>
                    <Button variant="custom" size="sm" className={`w-full bg-rose-600 hover:bg-rose-700 text-white ${isAccountant ? 'rounded-lg' : 'rounded-xl'} text-xs font-bold py-3 shadow-lg shadow-rose-100 dark:shadow-none transition-all`}>Manage Fleet</Button>
                  </div>
                ) : (
                  /* Partner/Manager/Employee: Asset Request View */
                  <div
                    onClick={() => navigate('/employee/asset-requests')}
                    className="flex flex-col gap-5 p-6 bg-rose-50/50 dark:bg-rose-900/20 rounded-[2rem] border border-rose-100 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-all h-full cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-rose-50 dark:border-rose-900/30 group-hover:scale-110 transition-transform">
                        <Monitor size={24} className="text-rose-600 dark:text-rose-400" />
                      </div>
                      {dashboardData?.myAssetRequests !== undefined && dashboardData.myAssetRequests > 0 && (
                        <Badge variant="custom" className="px-3 py-1 bg-rose-600 text-white font-black rounded-full shadow-lg shadow-rose-100 dark:shadow-none border-transparent">
                          {dashboardData.myAssetRequests}
                        </Badge>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-black text-gray-900 dark:text-slate-100">Asset Request Center</p>
                      <p className="text-[10px] text-gray-500 dark:text-slate-400 mt-1 font-bold">Request hardware & equipment</p>
                    </div>
                    <Button variant="custom" size="sm" className={`w-full bg-rose-600 hover:bg-rose-700 text-white ${isAccountant ? 'rounded-lg' : 'rounded-xl'} text-xs font-bold py-3 shadow-lg shadow-rose-100 dark:shadow-none transition-all`}>Request Gear</Button>
                  </div>
                )}

                {/* Support Tickets Card (For IT & Admin to manage ticket queue) */}
                {(isIT || isAdmin) && (
                  <div
                    onClick={() => navigate('/help-desk')}
                    className="flex flex-col gap-5 p-6 bg-blue-50/50 dark:bg-blue-900/20 rounded-[2rem] border border-blue-100 dark:border-blue-900/50 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-all h-full cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-blue-50 dark:border-blue-900/30 group-hover:scale-110 transition-transform">
                        <HelpDeskCustomIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                      </div>
                      <Badge variant="custom" className="px-3 py-1 bg-blue-600 text-white font-black rounded-full shadow-lg shadow-blue-100 dark:shadow-none border-transparent">
                        {dashboardData?.pendingApprovals?.tickets || 0}
                      </Badge>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-black text-gray-900 dark:text-slate-100">Support Tickets</p>
                      <p className="text-[10px] text-gray-500 dark:text-slate-400 mt-1 font-bold">Manage system support requests</p>
                    </div>
                    <Button
                      variant="custom"
                      size="sm"
                      className={`w-full bg-blue-600 hover:bg-blue-700 text-white ${isAccountant ? 'rounded-lg' : 'rounded-xl'} text-xs font-bold py-3 shadow-lg shadow-blue-100 dark:shadow-none transition-all`}
                    >
                      View Support Queue
                    </Button>
                  </div>
                )}

                {/* Support Tickets Card (For managers/staff to track their requests) */}
                {(!isAdmin && !isIT) && (
                  <div
                    onClick={() => navigate('/help-desk')}
                    className="flex flex-col gap-5 p-6 bg-blue-50/50 dark:bg-blue-900/20 rounded-[2rem] border border-blue-100 dark:border-blue-900/50 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-all h-full cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-blue-50 dark:border-blue-900/30 group-hover:scale-110 transition-transform">
                        <HelpDeskCustomIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                      </div>
                      {dashboardData?.myTickets !== undefined && dashboardData.myTickets > 0 && (
                        <Badge variant="custom" className="px-3 py-1 bg-blue-600 text-white font-black rounded-full shadow-lg shadow-blue-100 dark:shadow-none border-transparent">
                          {dashboardData.myTickets}
                        </Badge>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-black text-gray-900 dark:text-slate-100">Support Tickets</p>
                      <p className="text-[10px] text-gray-500 dark:text-slate-400 mt-1 font-bold">Track raised help desk requests</p>
                    </div>
                    <Button
                      variant="custom"
                      size="sm"
                      className={`w-full bg-blue-600 hover:bg-blue-700 text-white ${isAccountant ? 'rounded-lg' : 'rounded-xl'} text-xs font-bold py-3 shadow-lg shadow-blue-100 dark:shadow-none transition-all`}
                    >
                      Track Tickets
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Bottom Row for standard employees: Birthdays & Calendar to balance height */}
          {!(isAdmin || isHR || isIT || isManager || isAccountant) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Upcoming Birthdays */}
              <Card
                onClick={() => navigate('/employees')}
                className={`p-8 ${isAccountant ? 'border border-slate-100 shadow-sm' : 'border-none shadow-xl shadow-gray-200/50'} bg-white dark:bg-slate-800 ${isAccountant ? 'rounded-xl' : 'rounded-[2.5rem]'} dark:shadow-none hover:shadow-2xl dark:hover:bg-slate-700/50 transition-all flex flex-col h-full`}
              >
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-sm font-black text-gray-900 dark:text-slate-100 uppercase tracking-tight">Upcoming Birthdays</h3>
                  <button className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 flex items-center hover:underline">Full List <ArrowRight size={12} className="ml-1" /></button>
                </div>
                <div className="space-y-6 flex-1">
                  {dashboardData?.birthdays && dashboardData.birthdays.length > 0 ? (
                    dashboardData.birthdays.map((person: { name: string; role: string; date: string }, i: number) => (
                      <div key={i} className="flex items-center gap-4 group">
                        <div className="w-12 h-12 rounded-[1.25rem] bg-indigo-50 dark:bg-indigo-900/30 overflow-hidden flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Cake size={20} className="text-indigo-400" />
                        </div>
                        <div>
                          <p className="text-sm font-black text-gray-900 dark:text-slate-200 leading-tight">{person.name}</p>
                          <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 mt-0.5 uppercase tracking-wide">{person.role}</p>
                        </div>
                        <span className="ml-auto text-[10px] font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/40 px-2 py-1 rounded-lg">{person.date}</span>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center opacity-40 h-full">
                      <Cake size={32} className="text-gray-200 dark:text-slate-700 mb-3" />
                      <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">No birthdays this month</p>
                    </div>
                  )}
                </div>
              </Card>

              {/* Corporate Calendar */}
              <Card
                onClick={() => navigate('/calendar')}
                className={`p-8 ${isAccountant ? 'border border-slate-100 shadow-sm' : 'border-none shadow-xl shadow-gray-200/50'} bg-white dark:bg-slate-800 ${isAccountant ? 'rounded-xl' : 'rounded-[2.5rem]'} dark:shadow-none hover:shadow-2xl dark:hover:bg-slate-700/50 transition-all flex flex-col h-full`}
              >
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-sm font-black text-gray-900 dark:text-slate-100 uppercase tracking-tight">Corporate Calendar</h3>
                  <button className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 flex items-center hover:underline">Calendar <ArrowRight size={12} className="ml-1" /></button>
                </div>
                <div className="space-y-6 flex-1">
                  {dashboardData?.events && dashboardData.events.length > 0 ? (
                    dashboardData.events.map((event: CalendarEvent, i: number) => (
                      <div key={i} className="flex gap-5 group">
                        <div className={`shrink-0 w-14 h-14 rounded-[1.5rem] bg-${event.color}-50 dark:bg-${event.color}-900/20 flex flex-col items-center justify-center border border-${event.color}-100 dark:border-${event.color}-900/50 group-hover:scale-105 transition-transform`}>
                          <span className={`text-[9px] font-black text-${event.color}-400 uppercase leading-none`}>{event.date.split(' ')[1]}</span>
                          <span className={`text-xl font-black text-${event.color}-600 dark:text-${event.color}-400 leading-none mt-1`}>{event.date.split(' ')[0]}</span>
                        </div>
                        <div className="min-w-0 pt-1">
                          <p className="text-sm font-black text-gray-900 dark:text-slate-200 truncate leading-tight">{event.title}</p>
                          <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 mt-1 uppercase tracking-wide">{event.time || 'All Day'}</p>
                          <div className="flex items-center gap-1.5 mt-2">
                            <span className={`w-1.5 h-1.5 rounded-full bg-${event.color}-500 shadow-[0_0_8px_rgba(var(--color-${event.color}-500),0.4)]`}></span>
                            <span className="text-[9px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">{event.type}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center opacity-40 h-full">
                      <Calendar size={32} className="text-gray-200 dark:text-slate-700 mb-3" />
                      <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">No upcoming events</p>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}

        </div>

        <div className="lg:col-span-4 space-y-8 h-full flex flex-col">

          {/* Personal Leave Summary */}
          <Card
            onClick={() => navigate('/leave-management')}
            className={`p-8 ${isAccountant ? 'border border-slate-100 shadow-sm' : 'border-none shadow-xl shadow-gray-200/50'} bg-white dark:bg-slate-800 ${isAccountant ? 'rounded-xl' : 'rounded-[2.5rem]'} dark:shadow-none hover:shadow-2xl dark:hover:bg-slate-700/50 transition-all flex flex-col`}
          >
            <h3 className="text-sm font-black text-gray-900 dark:text-slate-100 uppercase tracking-tight mb-6">Personal Leave Summary</h3>
            <div className="flex flex-1 items-center justify-center gap-6">
              <div className="relative w-28 h-28 shrink-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Used', value: dashboardData?.leaves?.used || 0, color: COLORS.primary },
                        { name: 'Remaining', value: dashboardData?.leaves?.balance || 0, color: themeMode === 'dark' ? '#334155' : '#F1F5F9' }
                      ]}
                      innerRadius={35} outerRadius={48} paddingAngle={5} dataKey="value"
                    >
                      <Cell fill={COLORS.primary} />
                      <Cell fill={themeMode === 'dark' ? '#334155' : '#F1F5F9'} />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-black text-gray-900 dark:text-slate-100 leading-none">{dashboardData?.leaves?.balance || 0}</span>
                  <span className="text-[7px] font-black text-gray-400 dark:text-slate-500 uppercase mt-1">Days Left</span>
                </div>
              </div>
              <div className="flex-1 space-y-3">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">Total Quota</span>
                  <span className="text-lg font-black text-gray-900 dark:text-slate-100">{dashboardData?.leaves?.total || 21} Days</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">Approved</span>
                  <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">{dashboardData?.leaves?.used || 0} Days</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Financial Overview */}
          <Card
            onClick={() => navigate('/reimbursement')}
            className={`p-8 ${isAccountant ? 'border border-slate-100 shadow-sm' : 'border-none shadow-xl shadow-gray-200/50'} bg-white dark:bg-slate-800 ${isAccountant ? 'rounded-xl' : 'rounded-[2.5rem]'} dark:shadow-none hover:shadow-2xl dark:hover:bg-slate-700/50 transition-all flex flex-col`}
          >
            <h3 className="text-sm font-black text-gray-900 dark:text-slate-100 uppercase tracking-tight mb-6">Financial Overview</h3>
            <div className="flex flex-1 items-center justify-center gap-6">
              <div className="relative w-28 h-28 shrink-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <PieChart>
                    <Pie data={expenseBreakdown} innerRadius={35} outerRadius={48} paddingAngle={5} dataKey="value">
                      {expenseBreakdown.map((entry: { name: string; value: number; color: string; bgClass: string }, index: number) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-1">
                  <span className="text-sm font-black text-gray-900 dark:text-slate-100 leading-none">₹{(dashboardData?.expenses?.total || 0).toLocaleString()}</span>
                  <span className="text-[7px] font-black text-gray-400 dark:text-slate-500 uppercase mt-1">Spend</span>
                </div>
              </div>
              <div className="flex-1 space-y-2 overflow-hidden">
                {expenseBreakdown.slice(0, 3).map((item: { name: string; value: number; color: string; bgClass: string }, i: number) => (
                  <div key={i} className="flex justify-between items-center text-[10px] font-bold">
                    <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400 truncate">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${item.bgClass}`}></span>
                      <span className="truncate">{item.name}</span>
                    </div>
                    <span className="text-gray-900 dark:text-slate-200 ml-2">₹{item.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Upcoming Birthdays */}
          {(isAdmin || isHR || isIT || isManager || isAccountant) && (
            <Card
              onClick={() => navigate('/employees')}
              className={`p-8 ${isAccountant ? 'border border-slate-100 shadow-sm' : 'border-none shadow-xl shadow-gray-200/50'} bg-white dark:bg-slate-800 ${isAccountant ? 'rounded-xl' : 'rounded-[2.5rem]'} dark:shadow-none hover:shadow-2xl dark:hover:bg-slate-700/50 transition-all flex flex-col`}
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-sm font-black text-gray-900 dark:text-slate-100 uppercase tracking-tight">Upcoming Birthdays</h3>
                <button className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 flex items-center hover:underline">Full List <ArrowRight size={12} className="ml-1" /></button>
              </div>
              <div className="space-y-6 flex-1">
                {dashboardData?.birthdays && dashboardData.birthdays.length > 0 ? (
                  dashboardData.birthdays.map((person: { name: string; role: string; date: string }, i: number) => (
                    <div key={i} className="flex items-center gap-4 group">
                      <div className="w-12 h-12 rounded-[1.25rem] bg-indigo-50 dark:bg-indigo-900/30 overflow-hidden flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Cake size={20} className="text-indigo-400" />
                      </div>
                      <div>
                        <p className="text-sm font-black text-gray-900 dark:text-slate-200 leading-tight">{person.name}</p>
                        <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 mt-0.5 uppercase tracking-wide">{person.role}</p>
                      </div>
                      <span className="ml-auto text-[10px] font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/40 px-2 py-1 rounded-lg">{person.date}</span>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center opacity-40 h-full">
                    <Cake size={32} className="text-gray-200 dark:text-slate-700 mb-3" />
                    <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">No birthdays this month</p>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Upcoming Events / Calendar */}
          {(isAdmin || isHR || isIT || isManager || isAccountant) && (
            <Card
              onClick={() => navigate('/calendar')}
              className={`p-8 ${isAccountant ? 'border border-slate-100 shadow-sm' : 'border-none shadow-xl shadow-gray-200/50'} bg-white dark:bg-slate-800 ${isAccountant ? 'rounded-xl' : 'rounded-[2.5rem]'} dark:shadow-none hover:shadow-2xl dark:hover:bg-slate-700/50 transition-all flex flex-col`}
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-sm font-black text-gray-900 dark:text-slate-100 uppercase tracking-tight">Corporate Calendar</h3>
                <button className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 flex items-center hover:underline">Calendar <ArrowRight size={12} className="ml-1" /></button>
              </div>
              <div className="space-y-6 flex-1">
                {dashboardData?.events && dashboardData.events.length > 0 ? (
                  dashboardData.events.map((event: CalendarEvent, i: number) => (
                    <div key={i} className="flex gap-5 group">
                      <div className={`shrink-0 w-14 h-14 rounded-[1.5rem] bg-${event.color}-50 dark:bg-${event.color}-900/20 flex flex-col items-center justify-center border border-${event.color}-100 dark:border-${event.color}-900/50 group-hover:scale-105 transition-transform`}>
                        <span className={`text-[9px] font-black text-${event.color}-400 uppercase leading-none`}>{event.date.split(' ')[1]}</span>
                        <span className={`text-xl font-black text-${event.color}-600 dark:text-${event.color}-400 leading-none mt-1`}>{event.date.split(' ')[0]}</span>
                      </div>
                      <div className="min-w-0 pt-1">
                        <p className="text-sm font-black text-gray-900 dark:text-slate-200 truncate leading-tight">{event.title}</p>
                        <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 mt-1 uppercase tracking-wide">{event.time || 'All Day'}</p>
                        <div className="flex items-center gap-1.5 mt-2">
                          <span className={`w-1.5 h-1.5 rounded-full bg-${event.color}-500 shadow-[0_0_8px_rgba(var(--color-${event.color}-500),0.4)]`}></span>
                          <span className="text-[9px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">{event.type}</span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center opacity-40 h-full">
                    <Calendar size={32} className="text-gray-200 dark:text-slate-700 mb-3" />
                    <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">No upcoming events</p>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

      </div>
    </motion.div>
  );
};

// ═════════════════════════════════════════════════════════════
// TEAM HUB CHAT COMPONENT (Real-Time Group Chat)
// ═════════════════════════════════════════════════════════════
interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  senderImage: string | null;
  content: string;
  createdAt: string;
}

function TeamChat() {
  const { user } = useAuth();
  const toast = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch initial messages
  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const res = await API.get('/chat');
        if (res.data.success) {
          setMessages(res.data.data);
        }
      } catch (err) {
        console.error('Failed to fetch chat messages:', err);
      }
    };
    fetchMessages();
  }, []);

  // Socket connection
  useEffect(() => {
    console.log('📡 Initializing Chat Socket connection to:', API_BASE_URL);
    const socket: Socket = io(API_BASE_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      secure: true,
      rejectUnauthorized: false
    });

    socket.on('new_team_message', (msg: Message) => {
      setMessages(prev => {
        // Prevent duplicate append
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    try {
      setSending(true);
      const payload = { content: newMessage };
      const res = await API.post('/chat', payload);
      if (res.data.success) {
        setNewMessage('');
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="p-6 border-none shadow-xl shadow-gray-200/50 bg-white dark:bg-slate-800 rounded-[2rem] dark:shadow-none hover:shadow-2xl dark:hover:bg-slate-700/50 transition-all h-full flex flex-col min-h-[360px]">
      {/* Header */}
      <div className="flex items-center gap-2 pb-4 border-b border-slate-100 dark:border-slate-700/50">
        <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-650 dark:text-indigo-400 rounded-xl">
          <MessageSquare size={16} />
        </div>
        <div>
          <h3 className="text-sm font-black text-gray-900 dark:text-slate-100 uppercase tracking-tight">Team Hub Chat</h3>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Real-time team messaging</p>
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto py-4 space-y-3 min-h-0 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-200 dark:[&::-webkit-scrollbar-thumb]:bg-slate-700 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
        {messages.length > 0 ? (
          messages.map((msg) => {
            const isMe = msg.senderId === user?.id;
            return (
              <div key={msg.id} className={`flex items-start gap-2.5 max-w-[85%] ${isMe ? 'ml-auto flex-row-reverse' : ''}`}>
                {/* Avatar */}
                {msg.senderImage ? (
                  <img
                    src={msg.senderImage}
                    alt={msg.senderName}
                    className="w-7 h-7 rounded-full border border-slate-100 dark:border-slate-700 object-cover shrink-0"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center shrink-0 text-[10px] font-black text-indigo-600 dark:text-indigo-400 border border-slate-100 dark:border-slate-700">
                    {msg.senderName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                )}

                {/* Message Body */}
                <div className="flex flex-col min-w-0">
                  {/* Sender Name & Role */}
                  <div className={`flex items-baseline gap-1.5 mb-1 ${isMe ? 'justify-end' : ''}`}>
                    <span className="text-[10px] font-black text-slate-800 dark:text-slate-200">{isMe ? 'You' : msg.senderName}</span>
                    <span className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">({msg.senderRole})</span>
                  </div>

                  {/* Bubble */}
                  <div className={`px-3.5 py-2.5 rounded-2xl text-[11.5px] leading-relaxed shadow-sm border break-words ${
                    isMe 
                      ? 'bg-indigo-600 border-indigo-600 text-white rounded-tr-none' 
                      : 'bg-slate-50 border-slate-100 dark:bg-slate-900/60 dark:border-slate-800 text-slate-700 dark:text-slate-200 rounded-tl-none'
                  }`}>
                    {msg.content}
                  </div>

                  {/* Timestamp */}
                  <span className={`text-[7.5px] font-semibold text-slate-400 mt-1 uppercase tracking-wider ${isMe ? 'text-right' : ''}`}>
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-40 py-8">
            <MessageSquare size={32} className="text-slate-300 mb-2 animate-pulse" />
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">No messages yet. Start the conversation!</p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <form onSubmit={handleSendMessage} className="flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-700/50 mt-auto">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Send a message to your team..."
          className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-900/65 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 dark:text-slate-200 transition-all font-semibold"
        />
        <button
          type="submit"
          title="Send Message"
          aria-label="Send Message"
          disabled={!newMessage.trim() || sending}
          className="p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 dark:disabled:bg-indigo-950 text-white rounded-xl shadow-md transition-all shrink-0 cursor-pointer"
        >
          <Send size={14} className="stroke-[2.5]" />
        </button>
      </form>
    </Card>
  );
}

export default ModernRoleDashboard;
