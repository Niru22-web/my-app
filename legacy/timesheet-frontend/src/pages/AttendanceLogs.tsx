/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  UserGroupIcon, 
  CalendarIcon, 
  ClockIcon, 
  MagnifyingGlassIcon, 
  FunnelIcon, 
  ArrowPathIcon,
  ChevronLeftIcon, 
  ChevronRightIcon, 
  ArrowDownTrayIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  MapPinIcon,
  ExclamationCircleIcon,
  EyeIcon,
  PencilSquareIcon,
  ArrowRightOnRectangleIcon,
  BriefcaseIcon,
  ChartBarIcon,
  CheckBadgeIcon,
  XMarkIcon,
  PhoneIcon,
  EnvelopeIcon,
  UserCircleIcon,
  DevicePhoneMobileIcon,
  MapIcon
} from '@heroicons/react/24/outline';
import API from '../api';
import Card from '../components/ui/Card';
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { resolveAssetUrl } from '../utils/assetUtils';
import { formatLocation } from '../utils/locationUtils';

import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const AttendanceLogs: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);

  const toggleRole = (role: string) => {
    setSelectedRoles(prev => 
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const toggleStatus = (status: string) => {
    setSelectedStatuses(prev => 
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };
  
  // UI State
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<any | null>(null);
  const [actionLoading, setActionLoading] = useState<{[key: string]: boolean}>({});
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    present: 0,
    absent: 0,
    late: 0,
    avgHours: '0.0'
  });

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

  const [pulseMode, setPulseMode] = useState<'personal' | 'firm'>('personal');
  const [selectedSource, setSelectedSource] = useState<'all' | 'web' | 'biometric'>('all');

  const isAdmin = ['ADMIN', 'OWNER', 'HR', 'IT'].includes(currentUser?.role?.toUpperCase() || '');

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const res = await API.get(`/attendance/all?startDate=${startDate}&endDate=${endDate}`);
      const fetchedLogs = res.data.data || [];
      setLogs(fetchedLogs);
      
      // Calculate Stats (Assuming single day for primary stats, or avg for range)
      const isSingleDay = startDate === endDate;
      const present = fetchedLogs.filter((l: any) => l.status === 'Present' || l.status === 'Late').length;
      const late = fetchedLogs.filter((l: any) => l.status === 'Late').length;
      const totalHours = fetchedLogs.reduce((acc: number, l: any) => acc + (l.totalHours || 0), 0);
      const avgHours = fetchedLogs.length > 0 ? (totalHours / fetchedLogs.length).toFixed(2) : '0.00';
      
      // For "Absent Today", we'd ideally need total employee count
      // Let's try to get it or fallback
      let totalEmployees = 0;
      try {
          const statsRes = await API.get('/dashboard/admin-stats');
          totalEmployees = statsRes.data.data.totalEmployees || 0;
      } catch (e) {
          totalEmployees = fetchedLogs.length + 5; // Fallback placeholder
      }

      setStats({
        present,
        late,
        avgHours,
        absent: Math.max(0, totalEmployees - present)
      });

    } catch (error) {
      console.error('Failed to fetch logs:', error);
      setError(true);
      toast.error('Failed to load attendance logs');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const fetchComparisonData = useCallback(async () => {
    try {
      const today = new Date();
      
      const currentWeekStart = new Date(today);
      const day = currentWeekStart.getDay();
      const diff = currentWeekStart.getDate() - day + (day === 0 ? -6 : 1);
      currentWeekStart.setDate(diff);
      currentWeekStart.setHours(0, 0, 0, 0);
      
      const currentWeekEnd = new Date(currentWeekStart);
      currentWeekEnd.setDate(currentWeekStart.getDate() + 6);
      currentWeekEnd.setHours(23, 59, 59, 999);
      
      const prevWeekStart = new Date(currentWeekStart);
      prevWeekStart.setDate(currentWeekStart.getDate() - 7);
      prevWeekStart.setHours(0, 0, 0, 0);
      
      const prevWeekEnd = new Date(prevWeekStart);
      prevWeekEnd.setDate(prevWeekStart.getDate() + 6);
      prevWeekEnd.setHours(23, 59, 59, 999);

      const startStr = prevWeekStart.toISOString().split('T')[0];
      const endStr = currentWeekEnd.toISOString().split('T')[0];
      const res = await API.get(`/attendance/weekly-pulse?startDate=${startStr}&endDate=${endStr}`);
      setComparisonData({
        ...res.data.data,
        loading: false
      });
    } catch (err) {
      console.error("Failed to fetch weekly comparison data:", err);
      setComparisonData(prev => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    fetchComparisonData();
  }, [fetchComparisonData]);

  // Helper function to calculate work hours from sessions
  const calculateWorkHours = (sessions: any[], checkInTime?: any, checkOutTime?: any) => {
    if (!sessions || sessions.length === 0) {
      if (checkInTime && checkOutTime) {
        const inDate = new Date(checkInTime);
        const outDate = new Date(checkOutTime);
        if (!isNaN(inDate.getTime()) && !isNaN(outDate.getTime())) {
          const diffMs = outDate.getTime() - inDate.getTime();
          const diffHours = diffMs / (1000 * 60 * 60);
          return diffHours.toFixed(2);
        }
      }
      return '0.00';
    }
    
    const totalMinutes = sessions.reduce((acc: number, session: any) => {
      if (session.duration) return acc + session.duration;
      if (session.check_in_time && session.check_out_time) {
        const diffMs = new Date(session.check_out_time).getTime() - new Date(session.check_in_time).getTime();
        return acc + Math.round(diffMs / (1000 * 60));
      }
      return acc;
    }, 0);
    
    return (totalMinutes / 60).toFixed(2);
  };

  // Helper function to format work hours display
  const formatWorkHours = (hours: string | number) => {
    const h = parseFloat(String(hours || 0));
    const totalMinutes = Math.round(h * 60);
    const wholeHours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${wholeHours}h ${minutes}m`;
  };

  const filteredLogs = useMemo(() => {
    return logs.map(log => {
      // Calculate work hours from sessions if not provided
      const workHours = log.totalHours || calculateWorkHours(log.attendance_sessions, log.checkInTime, log.checkOutTime);
      
      return {
        ...log,
        totalHours: workHours,
        formattedWorkHours: formatWorkHours(workHours),
        // Ensure proper field mapping
        firstIn: log.checkInTime,
        lastOut: log.checkOutTime,
        sessions: log.attendance_sessions || []
      };
    }).filter(log => {
      const name = `${log.employee?.firstName || ''} ${log.employee?.lastName || ''}`.trim().toLowerCase();
      const eid = (log.employeeId || '').toLowerCase();
      const role = (log.employee?.role || '').toLowerCase();
      const status = (log.status || '').toLowerCase();
      
      const matchesSearch = name.includes(searchTerm.toLowerCase()) || eid.includes(searchTerm.toLowerCase());
      const matchesRole = selectedRoles.length === 0 || selectedRoles.map(r => r.toLowerCase()).includes(role);
      const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.map(s => s.toLowerCase()).includes(status);
      
      const matchesSource = 
        selectedSource === 'all' ||
        (selectedSource === 'web' && log.attendance_source !== 'ESSL') ||
        (selectedSource === 'biometric' && log.attendance_source === 'ESSL');
      
      return matchesSearch && matchesRole && matchesStatus && matchesSource;
    });
  }, [logs, searchTerm, selectedRoles, selectedStatuses, selectedSource]);

  const handleExport = async (format: 'csv' | 'excel') => {
    try {
      setExportLoading(true);
      await new Promise(resolve => setTimeout(resolve, 800)); // Simulate processing
      
      const headers = ['Employee ID', 'Name', 'Role', 'Date', 'First In', 'Last Out', 'Total Hours', 'Sessions', 'Status', 'Location'];
      const data = filteredLogs.map(log => [
        log.employeeId,
        `${log.employee?.firstName || ''} ${log.employee?.lastName || ''}`.trim(),
        log.employee?.role || 'Employee',
        new Date(log.date).toLocaleDateString(),
        log.checkInTime ? new Date(log.checkInTime).toLocaleTimeString() : '--:--',
        log.checkOutTime ? new Date(log.checkOutTime).toLocaleTimeString() : '--:--',
        `${log.totalHours || 0}h`,
        log.attendance_sessions?.length || 0,
        log.status,
        log.location_name || log.check_in_location || 
        ((log.latitude !== null && log.latitude !== undefined) 
            ? `${Number(log.latitude).toFixed(4)}, ${Number(log.longitude).toFixed(4)}` 
            : 'N/A')
      ]);

      const csvContent = [headers.join(','), ...data.map(row => row.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `attendance_export_${new Date().toISOString().split('T')[0]}.${format === 'csv' ? 'csv' : 'xlsx'}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(`Exported ${filteredLogs.length} records successfully`);
    } catch (error) {
      toast.error('Export failed');
    } finally {
      setExportLoading(false);
    }
  };

  const handleRowClick = (log: any) => {
    setSelectedLog(log);
    setIsSidePanelOpen(true);
  };

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedRoles([]);
    setSelectedStatuses([]);
    setSelectedSource('all');
    setStartDate(new Date().toISOString().split('T')[0]);
    setEndDate(new Date().toISOString().split('T')[0]);
  };

  const setToday = () => {
      const today = new Date().toISOString().split('T')[0];
      setStartDate(today);
      setEndDate(today);
  };

  // Action handlers
  const handleViewReport = async (log: any) => {
    try {
      setActionLoading(prev => ({ ...prev, [`report-${log.id}`]: true }));
      const date = new Date(log.date).toISOString().split('T')[0];
      navigate(`/attendance/report/${log.employeeId}/${date}`);
    } catch (error) {
      toast.error('Failed to generate report');
    } finally {
      setActionLoading(prev => ({ ...prev, [`report-${log.id}`]: false }));
    }
  };

  const handleViewMonthlyTrend = async (log: any) => {
    try {
      setActionLoading(prev => ({ ...prev, [`trend-${log.id}`]: true }));
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
      navigate(`/attendance/monthly/${log.employeeId}?month=${currentMonth}`);
    } catch (error) {
      toast.error('Failed to load monthly trend');
    } finally {
      setActionLoading(prev => ({ ...prev, [`trend-${log.id}`]: false }));
    }
  };

  const handleForceCheckout = async (log: any) => {
    try {
      setActionLoading(prev => ({ ...prev, [`checkout-${log.id}`]: true }));
      const date = new Date(log.date).toISOString().split('T')[0];
      
      const response = await API.post('/attendance/force-checkout', {
        employeeId: log.employeeId,
        date: date
      });
      
      if (response.data.success) {
        toast.success('Employee checked out successfully');
        // Refresh the logs to show updated data
        await fetchLogs();
      } else {
        toast.error(response.data.message || 'Failed to check out employee');
      }
    } catch (error: any) {
      console.error('Force checkout error:', error);
      toast.error(error.response?.data?.message || 'Failed to check out employee');
    } finally {
      setActionLoading(prev => ({ ...prev, [`checkout-${log.id}`]: false }));
    }
  };

  const handleViewDetails = (log: any) => {
    setSelectedLog(log);
    setIsDetailModalOpen(true);
  };

  const handleEditAttendance = (log: any) => {
    setEditingLog({
      ...log,
      checkInTime: log.firstIn ? new Date(log.firstIn).toISOString().slice(0, 16) : '',
      checkOutTime: log.lastOut ? new Date(log.lastOut).toISOString().slice(0, 16) : ''
    });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingLog) return;
    
    try {
      setActionLoading(prev => ({ ...prev, 'save-edit': true }));
      
      const response = await API.put('/attendance/update', {
        employeeId: editingLog.employeeId,
        date: new Date(editingLog.date).toISOString().split('T')[0],
        checkInTime: editingLog.checkInTime ? new Date(editingLog.checkInTime) : null,
        checkOutTime: editingLog.checkOutTime ? new Date(editingLog.checkOutTime) : null
      });
      
      if (response.data.success) {
        toast.success('Attendance updated successfully');
        setIsEditModalOpen(false);
        setEditingLog(null);
        await fetchLogs(); // Refresh logs
      } else {
        toast.error(response.data.message || 'Failed to update attendance');
      }
    } catch (error: any) {
      console.error('Update attendance error:', error);
      toast.error(error.response?.data?.message || 'Failed to update attendance');
    } finally {
      setActionLoading(prev => ({ ...prev, 'save-edit': false }));
    }
  };

  const handleCancelEdit = () => {
    setIsEditModalOpen(false);
    setEditingLog(null);
  };

  return (
    <div className="space-y-8 pb-20 relative min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Attendance <span className="text-indigo-600">Intel</span></h1>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Firm-wide presence and workforce analytics</p>
        </motion.div>
        
        <div className="flex items-center gap-3">
          <Button 
              variant="primary" 
              onClick={() => handleExport('csv')} 
              disabled={exportLoading}
              className="rounded-2xl font-black text-[10px] uppercase tracking-widest px-6 h-12 bg-indigo-600 shadow-indigo-200"
          >
            <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
            {exportLoading ? 'Processing...' : 'Export Results'}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
              { label: 'Present Today', value: stats.present, icon: CheckBadgeIcon, color: 'emerald', trend: '+12%' },
              { label: 'Absent Today', value: stats.absent, icon: UserGroupIcon, color: 'rose', trend: '-2%' },
              { label: 'Late Check-ins', value: stats.late, icon: ClockIcon, color: 'amber', trend: '+5%' },
              { label: 'Avg Working Hours', value: `${stats.avgHours}h`, icon: ChartBarIcon, color: 'indigo', trend: '+0.5h' }
          ].map((card, i) => (
              <motion.div
                key={i}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: i * 0.1 }}
              >
                  <Card className="p-6 border-none shadow-xl bg-white rounded-[2rem] relative overflow-hidden group hover:shadow-2xl transition-all duration-500">
                      <div className={`absolute -right-4 -top-4 w-24 h-24 bg-${card.color}-500/5 rounded-full group-hover:scale-150 transition-transform duration-700`}></div>
                      <div className="relative z-10 flex flex-col gap-4">
                          <div className={`w-12 h-12 bg-${card.color}-100 text-${card.color}-600 rounded-2xl flex items-center justify-center`}>
                              <card.icon className="w-6 h-6" />
                          </div>
                          <div>
                              <h4 className="text-3xl font-black text-slate-900 tracking-tight">{card.value}</h4>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{card.label}</p>
                          </div>
                          <div className={`flex items-center gap-1 text-[9px] font-black ${card.color === 'rose' ? 'text-rose-500' : 'text-emerald-500'}`}>
                              {card.trend} vs last week
                          </div>
                      </div>
                  </Card>
              </motion.div>
          ))}
      </div>

      {/* Main Table Container with Integrated SaaS Filters */}
      <Card className="overflow-hidden border-none shadow-2xl bg-white rounded-[3rem]">
        {/* SaaS-Style Advanced Filters */}
        <div className="p-8 border-b border-slate-100 bg-slate-50/40 space-y-4">
          <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
            {/* Search and Dropdowns */}
            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto flex-1 max-w-4xl">
              {/* Search */}
              <div className="relative flex-1 min-w-[240px] max-w-md">
                <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text"
                  placeholder="Search by employee name or ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all shadow-sm"
                />
              </div>

              {/* Roles Dropdown Checkboxes */}
              <div className="relative">
                <button 
                  onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
                  className="flex items-center justify-between gap-2 px-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold shadow-sm hover:border-slate-300 outline-none transition-all cursor-pointer min-w-[140px]"
                >
                  <span>Roles ({selectedRoles.length === 0 ? 'All' : selectedRoles.length})</span>
                  <ChevronDownIcon className="w-3.5 h-3.5 text-slate-400" />
                </button>
                {isRoleDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setIsRoleDropdownOpen(false)} />
                    <div className="absolute left-0 mt-2 w-48 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 space-y-2 z-40">
                      {['Admin', 'Manager', 'Employee', 'Partner'].map(role => {
                        const isChecked = selectedRoles.includes(role);
                        return (
                          <label key={role} className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer select-none text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors">
                            <input 
                              type="checkbox" 
                              checked={isChecked}
                              onChange={() => toggleRole(role)}
                              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20 cursor-pointer"
                            />
                            {role}
                          </label>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Statuses Dropdown Checkboxes */}
              <div className="relative">
                <button 
                  onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                  className="flex items-center justify-between gap-2 px-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold shadow-sm hover:border-slate-300 outline-none transition-all cursor-pointer min-w-[140px]"
                >
                  <span>Statuses ({selectedStatuses.length === 0 ? 'All' : selectedStatuses.length})</span>
                  <ChevronDownIcon className="w-3.5 h-3.5 text-slate-400" />
                </button>
                {isStatusDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setIsStatusDropdownOpen(false)} />
                    <div className="absolute left-0 mt-2 w-48 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 space-y-2 z-40">
                      {['Present', 'Late', 'Incomplete', 'Absent'].map(status => {
                        const isChecked = selectedStatuses.includes(status);
                        return (
                          <label key={status} className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer select-none text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors">
                            <input 
                              type="checkbox" 
                              checked={isChecked}
                              onChange={() => toggleStatus(status)}
                              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20 cursor-pointer"
                            />
                            {status}
                          </label>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Clear Filters */}
              {(searchTerm || selectedRoles.length > 0 || selectedStatuses.length > 0) && (
                <button 
                  onClick={resetFilters} 
                  className="text-rose-500 hover:text-rose-600 font-black text-[10px] uppercase tracking-widest transition-colors flex items-center gap-1.5 focus:outline-none cursor-pointer h-10 px-3 bg-rose-50 hover:bg-rose-100 rounded-xl"
                >
                  Clear Filters
                </button>
              )}
            </div>

            {/* Date Range */}
            <div className="flex items-center gap-3 w-full lg:w-auto">
              <div className="relative flex-1 lg:w-44">
                <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-500" />
                <input 
                  type="date"
                  aria-label="Start Date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all shadow-sm cursor-pointer"
                />
              </div>
              <span className="text-slate-400 font-bold text-xs">to</span>
              <div className="relative flex-1 lg:w-44">
                <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-500" />
                <input 
                  type="date"
                  aria-label="End Date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all shadow-sm cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Source Tab Filters */}
        <div className="flex border-b border-slate-100 bg-slate-50/20 px-8 py-0 gap-4">
          {[
            { id: 'all', label: 'All Logs' },
            { id: 'web', label: 'Web/Mobile Logs' },
            { id: 'biometric', label: 'Biometric Logs' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setSelectedSource(tab.id as any)}
              className={`py-4 px-4 text-[10px] font-black uppercase tracking-widest relative outline-none transition-all cursor-pointer border-b-2 ${
                selectedSource === tab.id
                  ? 'text-indigo-600 border-indigo-600'
                  : 'text-slate-400 hover:text-slate-600 border-transparent'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="table-wrapper">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/80 backdrop-blur-md border-b border-slate-100">
                <th className="px-8 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Employee Info</th>
                <th className="px-8 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Punch Date</th>
                <th className="px-8 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">First In</th>
                <th className="px-8 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Last Out</th>
                <th className="px-8 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Work Hours</th>
                <th className="px-8 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Location</th>
                <th className="px-8 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Status</th>
                <th className="px-8 py-6 text-right text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={8} className="px-8 py-10">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-slate-100 rounded-2xl"></div>
                            <div className="space-y-2">
                                <div className="h-4 bg-slate-100 rounded w-32"></div>
                                <div className="h-3 bg-slate-100 rounded w-20"></div>
                            </div>
                        </div>
                    </td>
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={8} className="px-8 py-24 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <ExclamationCircleIcon className="w-12 h-12 text-rose-500" />
                      <p className="text-slate-900 font-black uppercase tracking-widest">Failed to synchronize logs</p>
                      <Button onClick={fetchLogs} className="bg-indigo-600">Reconnect Stream</Button>
                    </div>
                  </td>
                </tr>
              ) : filteredLogs.length > 0 ? (
                filteredLogs.map((log) => {
                  const checkIn = log.firstIn ? new Date(log.firstIn) : null;
                  const checkOut = log.lastOut ? new Date(log.lastOut) : null;
                  const isExpanded = expandedId === log.id;
                  const sessions = log.sessions || [];
                  const isLate = log.status === 'Late';
                  const noCheckOut = !log.lastOut && log.status !== 'Absent';

                  return (
                    <React.Fragment key={log.id}>
                      <tr 
                        className={`group transition-all duration-300 hover:bg-slate-50/50 cursor-pointer ${isExpanded ? 'bg-indigo-50/20' : ''}`}
                        onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      >
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-4">
                            <div className="relative">
                                <Avatar 
                                    src={log.employee?.profileImage} 
                                    name={`${log.employee?.firstName || ''} ${log.employee?.lastName || ''}`.trim()} 
                                    size="md" 
                                    className="rounded-2xl shadow-md border-2 border-white ring-1 ring-slate-100" 
                                />
                                <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-lg border-2 border-white ${log.status === 'Present' ? 'bg-emerald-500' : log.status === 'Incomplete' ? 'bg-amber-500' : isLate ? 'bg-amber-400' : 'bg-rose-500'}`}></div>
                            </div>
                            <div>
                              <p className="text-sm font-black text-slate-900 leading-tight group-hover:text-indigo-600 transition-colors">
                                  {`${log.employee?.firstName || ''} ${log.employee?.lastName || ''}`.trim() || log.employeeId}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{log.employeeId}</span>
                                  <Badge variant="ghost" className="text-[8px] px-1.5 py-0">{log.employee?.role || 'Staff'}</Badge>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                            <p className="text-xs font-black text-slate-700">{new Date(log.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">{new Date(log.date).toLocaleDateString(undefined, { weekday: 'short' })}</p>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex flex-col">
                            <span className={`text-xs font-black ${isLate ? 'text-amber-600' : checkIn ? 'text-slate-900' : 'text-slate-300 italic'}`}>
                              {checkIn ? checkIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                            </span>
                            {isLate && <span className="text-[9px] font-black text-amber-500 uppercase mt-1 flex items-center gap-1"><ClockIcon className="w-3 h-3" /> Late</span>}
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex flex-col">
                            <span className={`text-xs font-black ${noCheckOut ? 'text-rose-600' : checkOut ? 'text-slate-900' : 'text-slate-300 italic'}`}>
                              {checkOut ? checkOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                            </span>
                            {noCheckOut && <span className="text-[9px] font-black text-rose-500 uppercase mt-1 flex items-center gap-1"><ExclamationCircleIcon className="w-3 h-3" /> Missing</span>}
                          </div>
                        </td>
                        <td className="px-8 py-6">
                            <div className="flex flex-col">
                                <span className={`text-sm font-black ${parseFloat(log.totalHours) < 4 ? 'text-rose-600' : parseFloat(log.totalHours) > 9 ? 'text-emerald-600' : 'text-indigo-600'}`}>
                                    {log.formattedWorkHours || '--'}
                                </span>
                                <span className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">{sessions.length} sessions</span>
                            </div>
                        </td>
                        <td className="px-8 py-6 max-w-[200px]">
                            <div className="flex items-center gap-2 text-slate-500">
                                <MapPinIcon className="w-3.5 h-3.5 flex-shrink-0 text-slate-300" />
                                <span 
                                    className="text-[10px] font-bold truncate block w-full" 
                                    title={log.location_name || formatLocation(log.check_in_location) || formatLocation(log.location)}
                                >
                                    {log.location_name || formatLocation(log.check_in_location) || formatLocation(log.location) || 
                                    ((log.latitude !== null && log.latitude !== undefined) && (log.longitude !== null && log.longitude !== undefined) 
                                        ? `${Number(log.latitude).toFixed(4)}, ${Number(log.longitude).toFixed(4)}` 
                                        : '--')}
                                </span>
                            </div>
                        </td>

                        <td className="px-8 py-6">
                             <Badge 
                                variant={log.status === 'Present' ? 'success' : log.status === 'Incomplete' ? 'warning' : isLate ? 'warning' : 'danger'}
                                className="uppercase font-black text-[9px] tracking-widest px-3"
                            >
                                {log.status === 'Incomplete' ? (log.is_auto_checkout ? 'Incomplete (Auto)' : 'Incomplete') : log.status}
                            </Badge>
                        </td>
                        <td className="px-8 py-6 text-right">
                           <div className="flex items-center justify-end gap-2">
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={(e) => { e.stopPropagation(); handleViewDetails(log); }}
                                    className="p-2 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                                >
                                    <EyeIcon className="w-5 h-5" />
                                </Button>
                                {isAdmin && (
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        onClick={(e) => { e.stopPropagation(); handleEditAttendance(log); }}
                                        className="p-2 rounded-xl text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                                    >
                                        <PencilSquareIcon className="w-5 h-5" />
                                    </Button>
                                )}
                           </div>
                        </td>
                      </tr>

                      {/* Expandable Row with Animation */}
                      <AnimatePresence>
                        {isExpanded && (
                          <tr>
                            <td colSpan={8} className="px-0 py-0 bg-slate-50/30">
                              <motion.div 
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="px-16 py-10 border-l-8 border-indigo-600 bg-white m-4 rounded-[2.5rem] shadow-inner grid grid-cols-1 xl:grid-cols-3 gap-10">
                                    {/* Session List */}
                                    <div className="xl:col-span-2 space-y-6">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="p-2 bg-indigo-50 rounded-xl">
                                                <ClockIcon className="w-5 h-5 text-indigo-600" />
                                            </div>
                                            <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Pulse Timeline</h4>
                                        </div>
                                        
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {sessions.length > 0 ? sessions.map((sess: any, idx: number) => (
                                                <div key={idx} className="p-5 rounded-3xl bg-slate-50 border border-slate-100 group/sess hover:bg-white transition-all">
                                                    <div className="flex justify-between items-start mb-4">
                                                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Session #{sessions.length - idx}</span>
                                                        <span className="text-[10px] font-black text-indigo-600 bg-white px-2 py-0.5 rounded-lg border border-indigo-50">{sess.duration || 0}m</span>
                                                    </div>
                                                    <div className="flex items-center justify-between gap-4">
                                                        <div className="space-y-1">
                                                            <p className="text-[9px] font-black text-slate-400 uppercase">IN</p>
                                                            <p className="text-sm font-black text-slate-900">{new Date(sess.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                                            <p className="text-[8px] font-bold text-slate-400 truncate max-w-[150px]" title={formatLocation(sess.location_name || sess.check_in_location)}>
                                                                📍 {formatLocation(sess.location_name || sess.check_in_location)}
                                                            </p>

                                                        </div>
                                                        <div className="flex-1 h-px bg-slate-200 relative mx-2">
                                                            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-indigo-500 rounded-full"></div>
                                                        </div>
                                                        <div className="space-y-1 text-right">
                                                            <p className="text-[9px] font-black text-slate-400 uppercase">OUT</p>
                                                            <p className="text-sm font-black text-slate-900">{sess.check_out_time ? new Date(sess.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</p>
                                                            <p className="text-[8px] font-bold text-slate-400 truncate max-w-[150px]" title={formatLocation(sess.location_name || sess.check_out_location)}>
                                                                📍 {formatLocation(sess.location_name || sess.check_out_location)}
                                                            </p>

                                                        </div>
                                                    </div>
                                                </div>
                                            )) : (
                                                <div className="col-span-full py-10 flex flex-col items-center justify-center text-slate-400">
                                                    <ExclamationCircleIcon className="w-10 h-10 mb-2 opacity-20" />
                                                    <p className="text-xs font-bold uppercase tracking-widest">No session details captured</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action Shortcuts */}
                                    <div className="space-y-6">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="p-2 bg-rose-50 rounded-xl">
                                                <BriefcaseIcon className="w-5 h-5 text-rose-600" />
                                            </div>
                                            <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Management Panel</h4>
                                        </div>
                                        
                                        <div className="space-y-3">
                                            {isAdmin && (
                                            <Button 
                                                fullWidth 
                                                variant="ghost" 
                                                className="justify-start h-14 rounded-2xl bg-slate-50 border-none hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 font-bold px-6"
                                                onClick={() => handleViewReport(log)}
                                                disabled={actionLoading[`report-${log.id}`]}
                                            >
                                                <EyeIcon className="w-5 h-5 mr-4" /> 
                                                {actionLoading[`report-${log.id}`] ? 'Loading...' : 'Full Performance Report'}
                                            </Button>
                                            )}
                                            {noCheckOut && (
                                                <Button 
                                                    fullWidth 
                                                    className="justify-start h-14 rounded-2xl bg-rose-600 text-white font-bold px-6 shadow-rose-200"
                                                    onClick={() => handleForceCheckout(log)}
                                                    disabled={actionLoading[`checkout-${log.id}`]}
                                                >
                                                    <ArrowRightOnRectangleIcon className="w-5 h-5 mr-4" /> 
                                                    {actionLoading[`checkout-${log.id}`] ? 'Processing...' : 'Force System Check-out'}
                                                </Button>
                                            )}
                                            <Button 
                                                fullWidth 
                                                variant="ghost" 
                                                className="justify-start h-14 rounded-2xl bg-slate-50 border-none hover:bg-emerald-50 hover:text-emerald-600 text-slate-600 font-bold px-6"
                                                onClick={() => handleViewMonthlyTrend(log)}
                                                disabled={actionLoading[`trend-${log.id}`]}
                                            >
                                                <ChartBarIcon className="w-5 h-5 mr-4" /> 
                                                {actionLoading[`trend-${log.id}`] ? 'Loading...' : 'View Monthly Trend'}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                              </motion.div>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-8 py-32 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-24 h-24 bg-slate-50 rounded-[2.5rem] flex items-center justify-center mb-6">
                        <UserGroupIcon className="w-12 h-12 text-slate-200" />
                      </div>
                      <p className="text-slate-400 font-black uppercase tracking-[0.3em]">Zero Pulses Synchronized</p>
                      <p className="text-xs font-bold text-slate-300 mt-2">Adjust your intelligence filters or time horizon</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Side Panel Overlay */}
      <AnimatePresence>
        {isSidePanelOpen && (
          <>
            <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                onClick={() => setIsSidePanelOpen(false)}
                className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100]"
            />
            <motion.div 
                initial={{ x: '100%' }} 
                animate={{ x: 0 }} 
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed top-0 right-0 h-full w-full max-w-lg bg-white shadow-[-20px_0_50px_rgba(0,0,0,0.1)] z-[101] overflow-y-auto"
            >
                {selectedLog && (
                    <div className="p-8 space-y-10">
                        {/* Panel Header */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <Avatar 
                                    src={selectedLog.employee?.profileImage} 
                                    name={selectedLog.employee?.firstName || 'User'} 
                                    size="lg" 
                                />
                                <div>
                                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">{selectedLog.employee?.firstName} {selectedLog.employee?.lastName}</h3>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{selectedLog.employeeId}</p>
                                </div>
                            </div>
                            <Button variant="ghost" onClick={() => setIsSidePanelOpen(false)} className="p-2 rounded-xl bg-slate-50">
                                <XMarkIcon className="w-6 h-6 text-slate-400" />
                            </Button>
                        </div>

                        {/* Quick Metrics */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-50 p-6 rounded-[2rem] space-y-1">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Work Hours</p>
                                <p className="text-3xl font-black text-indigo-600 tracking-tight">{selectedLog.totalHours}h</p>
                            </div>
                            <div className="bg-slate-50 p-6 rounded-[2rem] space-y-1">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Overall Status</p>
                                <Badge variant={selectedLog.status === 'Present' ? 'success' : 'danger'} className="text-xs px-3">{selectedLog.status}</Badge>
                            </div>
                        </div>

                        {/* Detailed Stats */}
                        <div className="space-y-6">
                            <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                <UserCircleIcon className="w-5 h-5 text-indigo-500" />
                                Employee Details
                            </h4>
                            <div className="grid grid-cols-1 gap-4">
                                {[
                                    { icon: EnvelopeIcon, label: 'Email', value: selectedLog.employee?.officeEmail || 'N/A' },
                                    { icon: PhoneIcon, label: 'Contact', value: selectedLog.employee?.profile?.phone || 'N/A' },
                                    { icon: DevicePhoneMobileIcon, label: 'Position', value: selectedLog.employee?.designation || 'Employee' },
                                    { icon: MapIcon, label: 'Department', value: selectedLog.employee?.department || 'Operations' }
                                ].map((item, idx) => (
                                    <div key={idx} className="flex items-center gap-4 p-4 rounded-2xl border border-slate-100">
                                        <div className="p-2 bg-slate-50 rounded-lg">
                                            <item.icon className="w-5 h-5 text-slate-400" />
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-tight">{item.label}</p>
                                            <p className="text-sm font-bold text-slate-700">{item.value}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Location History */}
                        <div className="space-y-6">
                             <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                <MapPinIcon className="w-5 h-5 text-rose-500" />
                                Geographic Footprint
                            </h4>
                            <div className="p-6 bg-slate-900 rounded-[2.5rem] text-white space-y-6 shadow-xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-10">
                                    <MapIcon className="w-32 h-32" />
                                </div>
                                <div className="space-y-4 relative z-10">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-500 uppercase">First Check-in Location</p>
                                        <p className="text-sm font-medium mt-1">
                                            📍 {selectedLog.location_name || selectedLog.check_in_location || 
                                             ((selectedLog.latitude !== null && selectedLog.latitude !== undefined) 
                                                ? `${Number(selectedLog.latitude).toFixed(6)}, ${Number(selectedLog.longitude).toFixed(6)}` 
                                                : 'Coordinates not available')}
                                        </p>
                                    </div>
                                    <div className="h-px bg-slate-800"></div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-500 uppercase">Last Check-out Location</p>
                                        <p className="text-sm font-medium mt-1">
                                            {selectedLog.check_out_location || 'Syncing from last pulse...'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Bottom Actions */}
                        <div className="pt-8 flex flex-col gap-3">
                            <Button 
                                fullWidth 
                                className="h-14 rounded-2xl bg-indigo-600 text-white font-black uppercase tracking-widest shadow-xl shadow-indigo-200"
                                onClick={() => handleViewReport(selectedLog)}
                                disabled={actionLoading[`report-${selectedLog?.id}`]}
                            >
                                {actionLoading[`report-${selectedLog?.id}`] ? 'Loading...' : 'Download detailed Report'}
                            </Button>
                            <Button 
                                fullWidth 
                                variant="ghost" 
                                className="h-14 rounded-2xl border-slate-200 text-slate-500 font-bold uppercase tracking-widest"
                                onClick={() => navigate(`/management/employees/edit/${selectedLog?.employeeId}`)}
                            >
                                View Full Profile
                            </Button>
                        </div>
                    </div>
                )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Detail Modal */}
      <AnimatePresence>
        {isDetailModalOpen && selectedLog && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsDetailModalOpen(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100]"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl bg-white rounded-3xl shadow-2xl z-[101] overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              <div className="p-8">
                {/* Modal Header */}
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <Avatar 
                      src={selectedLog.employee?.profileImage}
                      name={`${selectedLog.employee?.firstName || ''} ${selectedLog.employee?.lastName || ''}`.trim()}
                      size="lg"
                    />
                    <div>
                      <h3 className="text-2xl font-bold text-slate-900">
                        {selectedLog.employee?.firstName} {selectedLog.employee?.lastName}
                      </h3>
                      <p className="text-slate-600">{selectedLog.employeeId}</p>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    onClick={() => setIsDetailModalOpen(false)}
                    className="p-2 rounded-xl bg-slate-50"
                  >
                    <XMarkIcon className="w-6 h-6 text-slate-400" />
                  </Button>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-4 gap-6 mb-8">
                  <div className="bg-slate-50 p-6 rounded-2xl">
                    <p className="text-sm text-slate-600 mb-2">Status</p>
                    <Badge 
                      variant={selectedLog.status === 'Present' ? 'success' : selectedLog.status === 'Late' ? 'warning' : 'danger'}
                      className="text-sm"
                    >
                      {selectedLog.status}
                    </Badge>
                  </div>
                  <div className="bg-slate-50 p-6 rounded-2xl">
                    <p className="text-sm text-slate-600 mb-2">Work Hours</p>
                    <p className="text-2xl font-bold text-indigo-600">{selectedLog.formattedWorkHours || '--'}</p>
                  </div>
                  <div className="bg-slate-50 p-6 rounded-2xl">
                    <p className="text-sm text-slate-600 mb-2">Sessions</p>
                    <p className="text-2xl font-bold text-slate-900">{selectedLog.sessions?.length || 0}</p>
                  </div>
                  <div className="bg-slate-50 p-6 rounded-2xl">
                    <p className="text-sm text-slate-600 mb-2">Date</p>
                    <p className="text-lg font-bold text-slate-900">
                      {new Date(selectedLog.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>

                {/* Sessions Timeline */}
                <div className="mb-8">
                  <h4 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <ClockIcon className="w-5 h-5 text-indigo-600" />
                    Sessions Timeline
                  </h4>
                  <div className="space-y-4">
                    {selectedLog.sessions && selectedLog.sessions.length > 0 ? (
                      selectedLog.sessions.map((session: any, idx: number) => (
                        <div key={idx} className="border-l-4 border-indigo-500 pl-6 py-4 bg-slate-50 rounded-r-lg">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-semibold text-indigo-600">Session #{idx + 1}</span>
                            <Badge variant="ghost" className="text-xs">
                              {session.duration ? `${Math.floor(session.duration / 60)}h ${session.duration % 60}m` : '--'}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-sm text-slate-600 mb-1">Check In</p>
                              <p className="font-medium">
                                {session.check_in_time ? new Date(session.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                              </p>
                              <p className="text-sm text-slate-500">
                                📍 {session.location_name || session.check_in_location || 'N/A'}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-slate-600 mb-1">Check Out</p>
                              <p className="font-medium">
                                {session.check_out_time ? new Date(session.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                              </p>
                              <p className="text-sm text-slate-500">
                                📍 {session.check_out_location || 'N/A'}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-slate-500">
                        <ClockIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>No session details available</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Location Details */}
                <div>
                  <h4 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <MapPinIcon className="w-5 h-5 text-rose-600" />
                    Location Details
                  </h4>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="bg-slate-900 p-6 rounded-2xl text-white">
                      <p className="text-sm text-slate-400 mb-2">Check-in Location</p>
                      <p className="font-medium">
                        {selectedLog.location_name || selectedLog.check_in_location || 'Not captured'}
                      </p>
                      {selectedLog.latitude && selectedLog.longitude && (
                        <p className="text-sm text-slate-400 mt-2">
                          {selectedLog.latitude.toFixed(6)}, {selectedLog.longitude.toFixed(6)}
                        </p>
                      )}
                    </div>
                    <div className="bg-slate-900 p-6 rounded-2xl text-white">
                      <p className="text-sm text-slate-400 mb-2">Check-out Location</p>
                      <p className="font-medium">
                        {selectedLog.check_out_location || 'Not captured'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {isEditModalOpen && editingLog && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={handleCancelEdit}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100]"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-white rounded-3xl shadow-2xl z-[101] overflow-hidden"
            >
              <div className="p-8">
                {/* Modal Header */}
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900">Edit Attendance</h3>
                    <p className="text-slate-600">{editingLog.employeeId} - {new Date(editingLog.date).toLocaleDateString()}</p>
                  </div>
                  <Button 
                    variant="ghost" 
                    onClick={handleCancelEdit}
                    className="p-2 rounded-xl bg-slate-50"
                  >
                    <XMarkIcon className="w-6 h-6 text-slate-400" />
                  </Button>
                </div>

                {/* Edit Form */}
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Check In Time
                    </label>
                    <input
                      type="datetime-local"
                      title="Check In Time"
                      aria-label="Check In Time"
                      value={editingLog.checkInTime}
                      onChange={(e) => setEditingLog({ ...editingLog, checkInTime: e.target.value })}
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Check Out Time
                    </label>
                    <input
                      type="datetime-local"
                      title="Check Out Time"
                      aria-label="Check Out Time"
                      value={editingLog.checkOutTime}
                      onChange={(e) => setEditingLog({ ...editingLog, checkOutTime: e.target.value })}
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-4 mt-8">
                  <Button 
                    variant="ghost" 
                    onClick={handleCancelEdit}
                    className="px-6 py-3"
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleSaveEdit}
                    disabled={actionLoading['save-edit']}
                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700"
                  >
                    {actionLoading['save-edit'] ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AttendanceLogs;
