import React, { useState, useEffect, useCallback } from 'react';
import { 
  ClockIcon, 
  MapPinIcon, 
  ArrowRightOnRectangleIcon, 
  ArrowLeftOnRectangleIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  CheckBadgeIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';
import API from '../api';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Avatar from '../components/ui/Avatar';
import { resolveAssetUrl } from '../utils/assetUtils';
import { getDetailedLocation, formatLocation } from '../utils/locationUtils';

import { toast } from 'react-toastify';
import ASALoader from '../components/ui/ASALoader';

interface AttendanceSession {
  id: string;
  check_in_time: string;
  check_out_time: string | null;
  check_in_location?: string;
  check_out_location?: string;
  location_name?: string;
  latitude?: number;
  longitude?: number;
  duration?: number;
}

interface AttendanceRecord {
  id: string;
  date: string;
  status: string;
  checkInTime?: string;
  checkOutTime?: string;
  totalHours?: number | string;
  checkInLocation?: string;
  checkOutLocation?: string;
  location_name?: string;
  latitude?: number;
  longitude?: number;
  is_auto_checkout?: boolean;
  attendance_sessions?: AttendanceSession[];
}

interface AttendanceDashboardData {
  user: {
    id: string;
    employeeId: string;
    firstName: string;
    lastName: string;
    role?: string;
    profile?: {
      profileImage?: string;
    };
  };
  status: string;
  todayRecord: AttendanceRecord | null;
  checkInLocation?: string;
  checkOutLocation?: string;
  location?: string;
  location_name?: string;
  latitude?: number;
  longitude?: number;
  activeSession: AttendanceSession | null;
  activeSessions: AttendanceSession[];
  weeklyStats: {
    totalHours: string;
    presentDays: number;
    avgInTime: string;
  };
  workLog: {
    date: string;
    status: string;
    checkInTime?: string;
    checkOutTime?: string;
    totalHours?: string | number;
    is_auto_checkout?: boolean;
  }[];
}

// Format hours: show minutes for sub-hour values, decimal hours otherwise
const fmtHours = (h: number | string | undefined | null): string => {
  const val = typeof h === 'string' ? parseFloat(h) : (h ?? 0);
  if (!val || val <= 0) return '0h';
  if (val < 1) return `${Math.round(val * 60)}m`;
  return `${val.toFixed(1)}h`;
};

const Attendance: React.FC = () => {
  const [attendanceData, setAttendanceData] = useState<AttendanceDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [elapsedTime, setElapsedTime] = useState('00:00:00');

  
  const [comparisonData, setComparisonData] = useState<{
    thisWeekHours: number;
    prevWeekHours: number;
    percentDiff: number;
    hoursDiff: number;
    thisWeekDays: { [key: string]: number };
    prevWeekDays: { [key: string]: number };
    loading: boolean;
  }>({
    thisWeekHours: 0,
    prevWeekHours: 0,
    percentDiff: 0,
    hoursDiff: 0,
    thisWeekDays: { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 },
    prevWeekDays: { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 },
    loading: true
  });

  const fetchComparisonData = useCallback(async () => {
    try {
      // Use IST local date (en-CA gives YYYY-MM-DD format in the given timezone)
      const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const [yr, mo, dy] = todayStr.split('-').map(Number);
      const today = new Date(yr, mo - 1, dy); // local midnight

      // Monday of current week (IST-aware)
      const dow = today.getDay(); // 0=Sun, 1=Mon...
      const diffToMon = dow === 0 ? -6 : 1 - dow;
      const currentWeekMonday = new Date(today);
      currentWeekMonday.setDate(today.getDate() + diffToMon);

      const currentWeekSunday = new Date(currentWeekMonday);
      currentWeekSunday.setDate(currentWeekMonday.getDate() + 6);

      const prevWeekMonday = new Date(currentWeekMonday);
      prevWeekMonday.setDate(currentWeekMonday.getDate() - 7);

      // Format as YYYY-MM-DD (local, no UTC shift)
      const toLocalDateStr = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      const startStr = toLocalDateStr(prevWeekMonday);
      const endStr = toLocalDateStr(currentWeekSunday);

      const res = await API.get(`/attendance/weekly-pulse?startDate=${startStr}&endDate=${endStr}`);
      if (res.data?.success) {
        setComparisonData({
          ...res.data.data,
          loading: false
        });
      } else {
        setComparisonData(prev => ({ ...prev, loading: false }));
      }
    } catch (err) {
      console.error("Failed to fetch weekly comparison data:", err);
      setComparisonData(prev => ({ ...prev, loading: false }));
    }
  }, []);

  // Refresh comparison data every 30 seconds so live sessions update
  useEffect(() => {
    fetchComparisonData();
    const interval = setInterval(() => {
      if (!document.hidden) {
        fetchComparisonData();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchComparisonData]);

  const fetchAttendance = useCallback(async () => {
    try {
      setLoading(true);
      const res = await API.get('/attendance/my-attendance');
      setAttendanceData(res.data.data);
    } catch (error) {
      console.error('Failed to fetch attendance:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAttendance();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, [fetchAttendance]);

  // Handle live duration for active session
  useEffect(() => {
    const checkInTime = attendanceData?.activeSession?.check_in_time;
    if (checkInTime) {
      const interval = setInterval(() => {
        const checkIn = new Date(checkInTime).getTime();
        const now = new Date().getTime();
        const diff = now - checkIn;
        
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        
        setElapsedTime(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setElapsedTime('00:00:00');
    }
  }, [attendanceData?.activeSession]);

  const handleCheckIn = async () => {
    try {
      setActionLoading(true);
      const locData = await getDetailedLocation();
      const res = await API.post('/attendance/check-in', { 
        manualCheckIn: true,
        location: locData.address,
        latitude: locData.latitude,
        longitude: locData.longitude
      });
      if (res.data.success) {
        toast.success('Punched in successfully!');
        fetchAttendance();
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Check-in failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async () => {
    try {
      setActionLoading(true);
      const locData = await getDetailedLocation();
      const res = await API.post('/attendance/logout', { 
        location: locData.address,
        latitude: locData.latitude,
        longitude: locData.longitude
      });
      if (res.data.success) {
        toast.success('Punched out successfully!');
        fetchAttendance();
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Check-out failed');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <ASALoader size="lg" text="Loading attendance metrics..." />
      </div>
    );
  }

  const user = attendanceData?.user;
  const isCheckedIn = !!attendanceData?.activeSession;
  const todayRecord = attendanceData?.todayRecord;
  const workLog = attendanceData?.workLog || [];
  const activeSessions = attendanceData?.activeSessions || [];

  return (
    <div className="space-y-10 pb-20">
      {/* Top Section: Welcome & Stats */}
      <div className="flex flex-col lg:flex-row gap-8 items-start justify-between">
        <div className="flex items-center gap-6">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-[2rem] blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
            <Avatar 
              src={user?.profile?.profileImage ? resolveAssetUrl(user.profile.profileImage) : undefined} 
              name={`${user?.firstName} ${user?.lastName}`}
              size="xl"
              className="relative rounded-[1.8rem] bg-white ring-4 ring-white shadow-xl"
            />
            {isCheckedIn && (
              <span className="absolute bottom-1 right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-white"></span>
              </span>
            )}
            {!isCheckedIn && todayRecord?.status === 'Incomplete' && (
              <span className="absolute bottom-1 right-1 flex h-4 w-4">
                <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500 border-2 border-white"></span>
              </span>
            )}
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Good {currentTime.getHours() < 12 ? 'Morning' : currentTime.getHours() < 17 ? 'Afternoon' : 'Evening'}, <span className="text-indigo-600">{user?.firstName}</span></h1>
            <div className="flex items-center gap-3 mt-1.5 text-slate-500 font-bold text-sm">
              <CalendarDaysIcon className="w-4 h-4" />
              <span>{currentTime.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 w-full lg:w-auto">
          {[
            { label: 'Weekly Hours', value: fmtHours(attendanceData?.weeklyStats?.totalHours), icon: ChartBarIcon, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Present Days', value: attendanceData?.weeklyStats?.presentDays || 0, icon: CheckBadgeIcon, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Avg In-Time', value: attendanceData?.weeklyStats?.avgInTime || '--:--', icon: ClockIcon, color: 'text-amber-600', bg: 'bg-amber-50' },
          ].map((stat, i) => (
            <Card key={i} className="p-4 border-none shadow-lg bg-white rounded-2xl flex flex-col items-center justify-center gap-1 min-w-[120px]">
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
              <span className="text-xl font-black text-slate-900">{stat.value}</span>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</span>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Action Card: The "Wow" Factor */}
        <Card className="lg:col-span-1 p-8 border-none shadow-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-[2.5rem] relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mr-32 -mt-32 group-hover:bg-indigo-500/20 transition-all duration-700"></div>
          
          <div className="relative z-10 flex flex-col items-center text-center space-y-8">
            <div className="space-y-2">
              <h2 className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em]">Current Time</h2>
              <div className="text-4xl font-black text-white tabular-nums tracking-tighter">
                {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
            </div>

            <div className="w-full h-px bg-slate-700/50"></div>

            <div className="space-y-4 w-full">
              {isCheckedIn ? (
                <div className="space-y-6">
                  <div className="space-y-1">
                    <span className="text-emerald-400 text-[10px] font-black uppercase tracking-[0.3em]">Session Active</span>
                    <div className="text-5xl font-black text-white tabular-nums">{elapsedTime}</div>
                  </div>
                  <div className="flex flex-col gap-3">
                    <Button 
                      variant="primary" 
                      size="xl" 
                      fullWidth 
                      onClick={handleCheckOut} 
                      disabled={actionLoading}
                      className="rounded-2xl bg-rose-500 hover:bg-rose-600 border-none shadow-xl shadow-rose-500/20 group h-16"
                    >
                      <ArrowRightOnRectangleIcon className="w-6 h-6 mr-3 group-hover:translate-x-1 transition-transform" />
                      <span className="text-lg font-black uppercase tracking-widest">Punch Out</span>
                    </Button>
                    <div className="flex items-center justify-center gap-2 text-slate-500">
                      <MapPinIcon className="w-4 h-4" />
                      <span className="text-[10px] font-bold" title={attendanceData?.location_name || formatLocation(attendanceData?.checkInLocation) || formatLocation(attendanceData?.location)}>
                        📍 {attendanceData?.location_name || formatLocation(attendanceData?.checkInLocation) || 
                            (attendanceData?.latitude && attendanceData?.longitude ? `${attendanceData.latitude.toFixed(4)}, ${attendanceData.longitude.toFixed(4)}` : 'Location capture enabled')}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-8 py-4">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-20 h-20 bg-slate-700/30 rounded-3xl flex items-center justify-center">
                      <ClockIcon className="w-10 h-10 text-slate-500" />
                    </div>
                    <p className="text-slate-400 text-xs font-bold px-4">You are currently offline. Tap below to start your shift.</p>
                  </div>
                  <Button 
                    variant="primary" 
                    size="xl" 
                    fullWidth 
                    onClick={handleCheckIn} 
                    disabled={actionLoading}
                    className="rounded-2xl bg-indigo-600 hover:bg-indigo-700 border-none shadow-xl shadow-indigo-600/20 group h-16"
                  >
                    <ArrowLeftOnRectangleIcon className="w-6 h-6 mr-3 group-hover:-translate-x-1 transition-transform" />
                    <span className="text-lg font-black uppercase tracking-widest">Punch In</span>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Today's Log Card */}
        <Card className="lg:col-span-2 p-8 border-none shadow-2xl bg-white rounded-[2.5rem]">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Shift <span className="text-indigo-600">Details</span></h3>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1">Today's Timeline</p>
            </div>
            <div className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${todayRecord?.status === 'Present' ? 'bg-emerald-50 text-emerald-600' : todayRecord?.status === 'Incomplete' ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-400'}`}>
              {todayRecord?.status === 'Incomplete' && todayRecord?.is_auto_checkout ? 'Incomplete (Auto)' : (todayRecord?.status || 'Awaiting')}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
            <div className="flex items-center gap-4 p-5 bg-slate-50 rounded-3xl">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                <ArrowLeftOnRectangleIcon className="w-6 h-6 text-emerald-500" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">First In</p>
                <p className="text-lg font-black text-slate-900">
                  {todayRecord?.checkInTime ? new Date(todayRecord.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--'}
                </p>
                {todayRecord?.checkInLocation && (
                  <p className="text-[10px] text-slate-500 font-bold mt-1.5 leading-snug">
                    📍 In: {formatLocation(todayRecord.checkInLocation)}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4 p-5 bg-slate-50 rounded-3xl">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                <ArrowRightOnRectangleIcon className="w-6 h-6 text-rose-500" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Last Out</p>
                <p className="text-lg font-black text-slate-900">
                  {todayRecord?.checkOutTime ? new Date(todayRecord.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--'}
                </p>
                {todayRecord?.checkOutLocation && (
                  <p className="text-[10px] text-slate-500 font-bold mt-1.5 leading-snug">
                    📍 Out: {formatLocation(todayRecord.checkOutLocation)}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Pulse History</h4>
            <div className="max-h-[220px] overflow-y-auto pr-2 custom-scrollbar space-y-3">
              {activeSessions.length > 0 ? (
                activeSessions.map((session: AttendanceSession, i: number) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-transparent hover:border-slate-200 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-slate-900">Session #{activeSessions.length - i}</span>
                        <div className="flex flex-col gap-1 text-[10px] font-bold text-slate-400 mt-0.5">
                          <div className="flex items-center gap-1.5">
                            <span>In: {new Date(session.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                            {session.check_in_location && <span className="text-slate-500 truncate max-w-[180px]">📍 {formatLocation(session.check_in_location)}</span>}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span>Out: {session.check_out_time ? new Date(session.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Active'}</span>
                            {session.check_out_time && session.check_out_location && <span className="text-slate-500 truncate max-w-[180px]">📍 {formatLocation(session.check_out_location)}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {session.location_name || session.check_in_location ? (
                        <div title={`Captured at: ${session.location_name || session.check_in_location}`}>
                          <span className="text-[10px]">📍</span>
                        </div>
                      ) : null}
                      <span className="text-xs font-black text-slate-700">{session.duration || 0}m</span>
                    </div>
                  </div>
                )).reverse()
              ) : (
                <div className="text-center py-10">
                  <ExclamationCircleIcon className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No activity recorded for today</p>
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Weekly Pulse Comparison Section */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="my-8"
      >
        <Card className="p-8 border-none shadow-xl bg-white rounded-[2.5rem] relative overflow-hidden group hover:shadow-2xl transition-all duration-500">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:scale-110 transition-all duration-700"></div>
          
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-8 relative z-10">
            {/* Left: Overall comparative stats */}
            <div className="space-y-6 xl:max-w-md w-full flex-shrink-0">
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <ChartBarIcon className="w-5 h-5 text-indigo-600" />
                  Weekly Pulse Comparison
                </h3>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mt-1">
                  Your personal work hour comparison
                </p>
              </div>

              {comparisonData.loading ? (
                <div className="animate-pulse space-y-4">
                  <div className="h-10 bg-slate-100 rounded-xl w-3/4"></div>
                  <div className="h-6 bg-slate-100 rounded-xl w-1/2"></div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50/80 p-5 rounded-3xl border border-slate-100 hover:bg-white hover:shadow-md transition-all duration-300">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">This Week</p>
                      <h4 className="text-3xl font-black text-indigo-600 tracking-tight mt-1">{fmtHours(comparisonData.thisWeekHours)}</h4>
                    </div>
                    <div className="bg-slate-50/80 p-5 rounded-3xl border border-slate-100 hover:bg-white hover:shadow-md transition-all duration-300">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Previous Week</p>
                      <h4 className="text-3xl font-black text-slate-400 tracking-tight mt-1">{fmtHours(comparisonData.prevWeekHours)}</h4>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className={`px-4 py-2.5 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 ${
                      comparisonData.hoursDiff >= 0 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                        : 'bg-rose-50 text-rose-700 border border-rose-100'
                    }`}>
                      {comparisonData.hoursDiff >= 0 ? `+${fmtHours(comparisonData.hoursDiff)} (+${comparisonData.percentDiff}%)` : `${fmtHours(Math.abs(comparisonData.hoursDiff))} (${comparisonData.percentDiff}%)`}
                      {comparisonData.hoursDiff >= 0 ? '📈' : '📉'}
                    </div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                      Difference from last week
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Comparative bar graph day-by-day */}
            <div className="flex-1 w-full">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Daily Work Hour Split</h4>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
                <style dangerouslySetInnerHTML={{
                  __html: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => {
                    const thisWeekVal = comparisonData.thisWeekDays[day] || 0;
                    const prevWeekVal = comparisonData.prevWeekDays[day] || 0;
                    const maxVal = Math.max(
                      ...Object.values(comparisonData.thisWeekDays),
                      ...Object.values(comparisonData.prevWeekDays),
                      8
                    );
                    const thisPct = (thisWeekVal / maxVal) * 100;
                    const prevPct = (prevWeekVal / maxVal) * 100;
                    return `
                      .bar-prev-${day} { height: ${prevPct}% !important; }
                      .bar-this-${day} { height: ${thisPct}% !important; }
                    `;
                  }).join('\n')
                }} />
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => {
                  const thisWeekVal = comparisonData.thisWeekDays[day] || 0;
                  const prevWeekVal = comparisonData.prevWeekDays[day] || 0;

                  return (
                    <div key={day} className="bg-slate-50/50 hover:bg-slate-50/80 p-4 rounded-3xl border border-slate-100/50 flex flex-col items-center gap-3 transition-all duration-300">
                      <span className="text-xs font-black text-slate-600 uppercase tracking-tight">{day}</span>
                      
                      {/* Interactive dual bar container */}
                      <div className="h-32 w-12 flex justify-center items-end gap-1.5 relative group/day py-1">
                        {/* Last Week Bar */}
                        <div 
                          className={`w-4 bg-slate-300 rounded-t-lg transition-all duration-500 relative bar-prev-${day}`}
                          title={`Last Week: ${fmtHours(prevWeekVal)}`}
                        >
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover/day:block bg-slate-900 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap z-20">
                            Last: {fmtHours(prevWeekVal)}
                          </div>
                        </div>
                        
                        {/* This Week Bar */}
                        <div 
                          className={`w-4 bg-gradient-to-t from-indigo-500 to-indigo-600 rounded-t-lg transition-all duration-500 relative shadow-md shadow-indigo-100 bar-this-${day}`}
                          title={`This Week: ${fmtHours(thisWeekVal)}`}
                        >
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover/day:block bg-indigo-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap z-20">
                            This: {fmtHours(thisWeekVal)}
                          </div>
                        </div>
                      </div>

                      {/* Display small metrics */}
                      <div className="text-center">
                        <p className="text-[10px] font-black text-indigo-600">{fmtHours(thisWeekVal)}</p>
                        <p className="text-[8px] font-bold text-slate-400 mt-0.5">vs {fmtHours(prevWeekVal)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Monthly Work Log Table */}
      <Card className="p-8 border-none shadow-2xl bg-white rounded-[2.5rem] overflow-hidden">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">Work <span className="text-indigo-600">Archive</span></h3>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1">Previous Attendance Records</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-50">
                <th className="pb-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Date</th>
                <th className="pb-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Status</th>
                <th className="pb-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Punches</th>
                <th className="pb-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Work Hours</th>
                <th className="pb-5 text-right text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {workLog.length > 0 ? workLog.map((log: { date: string; status: string; checkInTime?: string; checkOutTime?: string; totalHours?: string | number; is_auto_checkout?: boolean }, i: number) => (
                <tr key={i} className="group hover:bg-slate-50/50 transition-colors">
                  <td className="py-5">
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-slate-900">{new Date(log.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">{new Date(log.date).toLocaleDateString(undefined, { weekday: 'short' })}</span>
                    </div>
                  </td>
                  <td className="py-5">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      log.status === 'Present' ? 'bg-emerald-100 text-emerald-700' : 
                      log.status === 'Incomplete' ? 'bg-amber-100 text-amber-700' : 
                      log.status === 'Late' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {log.status === 'Incomplete' && log.is_auto_checkout ? 'Incomplete (Auto)' : log.status}
                    </span>
                  </td>
                  <td className="py-5">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                      <span>{log.checkInTime ? new Date(log.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                      <span className="text-slate-300">-</span>
                      <span>{log.checkOutTime ? new Date(log.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                    </div>
                  </td>
                  <td className="py-5">
                    <span className="text-sm font-black text-slate-900">{fmtHours(log.totalHours as number)}</span>
                  </td>
                  <td className="py-5 text-right">
                    <button title="View Details" aria-label="View Details" className="p-2 hover:bg-white rounded-xl shadow-none hover:shadow-sm transition-all">
                      <ClockIcon className="w-5 h-5 text-slate-400 group-hover:text-indigo-500" />
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="py-10 text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">No archived pulses found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default Attendance;
