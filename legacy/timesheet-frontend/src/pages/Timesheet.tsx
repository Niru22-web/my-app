import React, { useState, useEffect, useCallback, useMemo, Suspense, useRef } from 'react';
import API from '../api';
import { useAuth } from '../contexts/AuthContext';
import ASALoader from '../components/ui/ASALoader';
import { useConfirm } from '../contexts/ConfirmContext';
import {
  Calendar,
  Table,
  Plus,
  Filter as FilterIcon,
  RefreshCw,
  Search,
  Zap,
  FileSpreadsheet,
  Download,
  Upload,
  ChevronDown,
  FileUp,
  Loader2,
  AlertTriangle,
  CheckCircle,
  X
} from 'lucide-react';
import { Dialog, Transition } from '@headlessui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';

// UI Components
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import FAB from '../components/FAB';

// Refined Feature Components
import TimesheetListView from '../components/timesheet/TimesheetListView';
import TeamTimesheetListView from '../components/timesheet/TeamTimesheetListView';
import TimesheetDrawer from '../components/timesheet/TimesheetDrawer';
import FilterPanel from '../components/timesheet/FilterPanel';
import DailyEntriesModal from '../components/timesheet/DailyEntriesModal';

// Lazy loaded for optimization
const TimesheetCalendar = React.lazy(() => import('../components/timesheet/TimesheetCalendar'));

interface Timelog {
  id: string;
  hours: number;
  description: string;
  date: string;
  workItem?: string;
  billableStatus?: string;
  submissionStatus?: string;
  employeeId?: string;
  employee: {
     id: string;
     firstName: string;
     lastName: string;
     officeEmail: string;
  };
  job: {
    id: string;
    jobId: string;
    name: string;
    project: {
      id: string;
      name: string;
      clientId: string;
      client: { id: string, name: string };
    }
  };
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  officeEmail: string;
}

interface Project {
  id: string;
  name: string;
}

const Timesheet: React.FC = () => {
  const { user } = useAuth();
  const { confirm } = useConfirm();

  // UX State
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isDailyModalOpen, setIsDailyModalOpen] = useState(false);
  const [isExcelMenuOpen, setIsExcelMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'my' | 'team'>('my');
  const [importSummary, setImportSummary] = useState<{
    isOpen: boolean;
    totalRows: number;
    successfulImports: number;
    validationErrorsCount: number;
    errors: Array<{
      row: number;
      employee: string;
      project: string;
      job: string;
      error: string;
    }>;
  } | null>(null);

  // Data State
  const [entries, setEntries] = useState<Timelog[]>([]);
  const [editingEntry, setEditingEntry] = useState<Timelog | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  // Filter State
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    employeeId: '',
    projectId: '',
    status: ''
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Debounce search query
  useEffect(() => {
    const delay = setTimeout(() => {
      setSearchTerm(searchQuery);
    }, 300);
    return () => clearTimeout(delay);
  }, [searchQuery]);

  // Master Data
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const isManagerial = ['Admin', 'Manager', 'Partner', 'Owner'].includes(user?.role || '');


  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);

      // Clean up empty params
      const params: Record<string, string> = {};
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== '') {
          params[key] = value;
        }
      });

      const endpoint = activeTab === 'team' ? '/timelogs/team' : '/timelogs/my';
      const res = await API.get(endpoint, { params });
      console.log(`[Timesheet] Fetched ${activeTab} logs:`, res.data?.data);
      setEntries(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
      toast.error('Failed to sync timesheets');
    } finally {
      setLoading(false);
    }
  }, [filters, activeTab]);

  const [submittingAll, setSubmittingAll] = useState(false);

  const handleSubmitAll = async () => {
    const pendingEntries = entries.filter(t => 
      (t.submissionStatus === 'not_submitted' || t.submissionStatus === 'draft') && 
      (!t.employeeId || t.employeeId === user?.id)
    );

    if (pendingEntries.length === 0) {
      toast.info('No pending timesheets to submit');
      return;
    }

    const confirmed = await confirm({
      title: 'Submit All Timesheets',
      message: `Are you sure you want to submit all ${pendingEntries.length} pending timesheets?`,
      severity: 'info',
      confirmText: 'Submit All'
    });
    if (!confirmed) return;

    try {
      setSubmittingAll(true);
      const ids = pendingEntries.map(t => t.id);
      await API.post('/timelogs/submit-bulk', { ids });
      toast.success(`${pendingEntries.length} timesheets submitted successfully`);
      fetchLogs();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      console.error('Bulk submission failed:', error);
      toast.error(error.response?.data?.message || 'Failed to submit all timesheets');
    } finally {
      setSubmittingAll(false);
    }
  };

  const fetchFilterData = useCallback(async () => {
    try {
      const [empRes, projRes] = await Promise.all([
        API.get('/employees'),
        API.get('/projects')
      ]);
      setEmployees(empRes.data?.data || []);
      setProjects(projRes.data?.data || []);
    } catch (err) {
      console.error('Failed to fetch filter metadata:', err);
    }
  }, []);

  // Fetching logic
  useEffect(() => {
    fetchLogs();
    if (isManagerial) {
      fetchFilterData();
    }
  }, [fetchLogs, fetchFilterData, isManagerial]);

  // Excel Operations
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsExcelMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDownloadTemplate = async () => {
    try {
      setIsExcelMenuOpen(false);
      const response = await API.get('/timelogs/template', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Timesheet_Template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Template download triggered');
    } catch (err) {
      toast.error('Failed to download template');
    }
  };

  // Note: Relevant export function (analogous to exportEmployeesExcel in employee module)
  const handleExportExcel = async () => {
    try {
      setIsExcelMenuOpen(false);
      const params: Record<string, string> = {};
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== '') params[key] = value;
      });
      
      const response = await API.get('/timelogs/export', { params, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `timesheet-export-${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Export completed');
    } catch (err) {
      toast.error('Failed to export data');
    }
  };

  const downloadErrorReport = () => {
    if (!importSummary || !importSummary.errors || importSummary.errors.length === 0) return;
    
    const headers = ['Row Number', 'Employee Email', 'Project Name', 'Job Name', 'Error Message'];
    const rows = importSummary.errors.map(e => [
      e.row,
      `"${e.employee || ''}"`,
      `"${e.project || ''}"`,
      `"${e.job || ''}"`,
      `"${e.error || ''}"`
    ]);
    
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `timesheet-import-errors-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsExcelMenuOpen(false);
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const formData = new FormData();
      formData.append('file', file);
      
      toast.info('Validating and uploading...');
      const res = await API.post('/timelogs/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const { successfulImports, validationErrorsCount, importErrorsCount, validationErrors } = res.data;
      const totalFailed = (validationErrorsCount || 0) + (importErrorsCount || 0);

      if (validationErrors && validationErrors.length > 0) {
        setImportSummary({
          isOpen: true,
          totalRows: res.data.totalRows || 0,
          successfulImports: successfulImports || 0,
          validationErrorsCount: totalFailed,
          errors: validationErrors
        });
      } else if (successfulImports > 0) {
        toast.success(`✅ ${successfulImports} timesheet row(s) imported successfully!`);
      }

      if (successfulImports === 0 && totalFailed === 0 && res.data.totalRows === 0) {
        toast.warning('No data rows found in the uploaded file. Please fill in data below the header row.');
      } else if (successfulImports === 0 && totalFailed > 0 && (!validationErrors || validationErrors.length === 0)) {
        toast.error(`Import failed — all ${totalFailed} row(s) had errors. Please fix and re-upload.`);
      }

      if (successfulImports > 0) fetchLogs();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string; error?: string; totalRows?: number; successfulImports?: number; validationErrorsCount?: number; errors?: { row: number; employee: string; project: string; job: string; error: string; }[] } } };
      console.error('Import Error Details:', error.response?.data || error);
      
      const data = error.response?.data;
      if (data && data.errors && data.errors.length > 0) {
        setImportSummary({
          isOpen: true,
          totalRows: data.totalRows || 0,
          successfulImports: data.successfulImports || 0,
          validationErrorsCount: data.validationErrorsCount || data.errors.length,
          errors: data.errors
        });
      } else {
        const msg = data?.message || data?.error || 'Import failed. Please use the downloaded template.';
        toast.error(msg, { autoClose: 8000 });
      }
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };


  // Interactions
  const handleEdit = (entry: unknown) => {
    setEditingEntry(entry as Timelog);
    setSelectedDate(undefined);
    setIsDrawerOpen(true);
  };

  const handleCreate = () => {
    setEditingEntry(null);
    setSelectedDate(undefined);
    setIsDrawerOpen(true);
  };

  const handleSelectCalendarDate = (date: Date) => {
    setSelectedDate(date);
    setEditingEntry(null);
    setIsDailyModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: 'Delete Timesheet Record',
      message: 'Are you sure you want to permanently delete this timesheet record? This action cannot be undone.',
      isDelete: true
    });
    if (confirmed) {
      try {
        await API.delete(`/timelogs/${id}`);
        toast.info('Record eradicated');
        fetchLogs();
      } catch (err) {
        toast.error('Deletion failed');
      }
    }
  };

  const handleSubmitLog = async (id: string) => {
    try {
      await API.patch(`/timelogs/${id}/submit`);
      toast.success('Submitted for approval protocol');
      fetchLogs();
    } catch (err) {
      toast.error('Submission rejected by server');
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await API.post(`/timelogs/${id}/approve`);
      toast.success('Timesheet approved');
      fetchLogs();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error?.response?.data?.message || 'Approval failed');
    }
  };

  const handleReject = async (id: string) => {
    const reason = window.prompt('Please provide a reason for rejection:');
    if (reason === null) return; // User cancelled
    if (!reason.trim()) {
      toast.error('Rejection reason is mandatory');
      return;
    }
    
    try {
      await API.post(`/timelogs/${id}/reject`, { reason });
      toast.warning('Timesheet rejected and employee notified');
      fetchLogs();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error?.response?.data?.message || 'Rejection failed');
    }
  };

  // Derived Data with Universal Deep Search
  const filteredEntries = useMemo(() => {
    const result = entries;

    if (!searchTerm) return result;
    
    const q = searchTerm.toLowerCase();

    return result.filter(item => {
      // Specifically check these fields for better accuracy
      const searchFields = [
        item.description,
        item.workItem,
        item.employee?.firstName,
        item.employee?.lastName,
        item.employee?.officeEmail,
        item.job?.name,
        item.job?.jobId,
        item.job?.project?.name,
        item.job?.project?.client?.name,
        item.submissionStatus,
        item.date ? new Date(item.date).toLocaleDateString('en-GB') : ''
      ];

      return searchFields.some(field => String(field || '').toLowerCase().includes(q));
    });
  }, [entries, searchTerm]);

  const activeFilterCount = Object.values(filters).filter(v => v !== '').length;
  const totalHours = filteredEntries.reduce((acc, curr) => acc + curr.hours, 0);

  return (
    <div className="space-y-4 sm:space-y-6 md:space-y-8 pb-4 md:pb-12 h-full flex flex-col">
      {/* SaaS Premium Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col xl:flex-row xl:items-end justify-between gap-6 relative z-40 shrink-0"
      >
        <div className="flex flex-col gap-1 sm:gap-2">
          <div className="hidden sm:flex items-center gap-2 text-[10px] font-[1000] uppercase text-primary-500 tracking-[0.25em]">
            <Zap className="w-3.5 h-3.5 fill-primary-500" />
            Execution Engine
          </div>
          <h1 className="text-2xl sm:text-4xl md:text-5xl font-[1000] text-slate-900 tracking-tight leading-none bg-clip-text">Timesheet</h1>
          <p className="text-xs sm:text-sm font-bold text-slate-500 max-w-lg mt-0.5 sm:mt-1 tracking-wide hidden sm:block">
            Chronicle your productivity. Sync daily engagements to firm-wide projects.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* View Toggle */}
          <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-slate-200/60">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-2.5 rounded-xl transition-all duration-300 font-[1000] text-xs uppercase tracking-widest ${viewMode === 'list' ? 'bg-slate-900 text-white shadow-xl shadow-slate-900/10' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
            >
              <Table className="w-4 h-4" />
              <span className="hidden sm:inline">List</span>
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-2.5 rounded-xl transition-all duration-300 font-[1000] text-xs uppercase tracking-widest ${viewMode === 'calendar' ? 'bg-slate-900 text-white shadow-xl shadow-slate-900/10' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
            >
              <Calendar className="w-4 h-4" />
              <span className="hidden sm:inline">Calendar</span>
            </button>
          </div>

          {/* Excel Actions Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsExcelMenuOpen(!isExcelMenuOpen)}
              className="flex items-center gap-2 h-10 px-4 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900 text-sm font-semibold rounded-full shadow-sm ring-4 ring-slate-100 transition-all duration-200 cursor-pointer outline-none group"
            >
              <FileSpreadsheet className="w-4 h-4 text-green-600 transition-transform group-hover:scale-110" />
              <span>Excel Actions</span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-300 ${isExcelMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {isExcelMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 400 }}
                  className="absolute right-0 mt-3 w-64 origin-top-right rounded-2xl bg-white shadow-[0_20px_50px_rgba(0,0,0,0.15)] ring-1 ring-slate-200 focus:outline-none z-[9999] max-h-[250px] overflow-y-auto overflow-x-hidden custom-scrollbar"
                >
                  <div className="py-2 divide-y divide-slate-100/60">
                    <button
                      onClick={handleDownloadTemplate}
                      className="group flex w-full items-center px-5 py-3.5 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-primary-600 transition-all text-left"
                    >
                      <Download className="mr-3.5 h-4.5 w-4.5 text-slate-400 group-hover:text-primary-500 transition-colors" />
                      Download Template
                    </button>
                    <button
                      onClick={() => {
                        setIsExcelMenuOpen(false);
                        fileInputRef.current?.click();
                      }}
                      className="group flex w-full items-center px-5 py-3.5 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-primary-600 transition-all text-left"
                    >
                      <Upload className="mr-3.5 h-4.5 w-4.5 text-slate-400 group-hover:text-primary-500 transition-colors" />
                      Import Excel
                    </button>
                    <button
                      onClick={() => {
                        setIsExcelMenuOpen(false);
                        handleExportExcel(); // This calls the relevant export function
                      }}
                      className="group flex w-full items-center px-5 py-3.5 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-green-600 transition-all text-left"
                    >
                      <FileUp className="mr-3.5 h-4.5 w-4.5 text-slate-400 group-hover:text-green-600 transition-colors" />
                      Export Excel
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImportExcel}
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              aria-label="Upload excel file"
            />
          </div>
          
          {/* Submit All Button */}
          {activeTab === 'my' && entries.some(t => t.submissionStatus === 'not_submitted' || t.submissionStatus === 'draft') && (
            <Button
              variant="secondary"
              onClick={handleSubmitAll}
              disabled={submittingAll}
              className="h-[44px] px-6 rounded-2xl border-indigo-500 text-indigo-600 font-[1000] text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-indigo-50 active:scale-95 transition-all shadow-sm"
            >
              {submittingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Submit All
            </Button>
          )}
          
          {/* Desktop only - use FAB on mobile */}
          <Button
            variant="primary"
            onClick={handleCreate}
            className="hidden sm:flex h-[44px] px-8 rounded-2xl shadow-xl shadow-primary-500/25 font-[1000] text-xs uppercase tracking-widest items-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <Plus className="w-5 h-5" />
            Log Session
          </Button>
        </div>
      </motion.div>

      {/* Tabs for Managers */}
      {isManagerial && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex space-x-1 border-b border-slate-200"
        >
          <button
            onClick={() => setActiveTab('my')}
            className={`py-3 px-6 font-[1000] text-sm tracking-wider uppercase transition-colors relative ${activeTab === 'my' ? 'text-primary-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            My Timesheet
            {activeTab === 'my' && (
              <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-1 bg-primary-600 rounded-t-lg" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('team')}
            className={`py-3 px-6 font-[1000] text-sm tracking-wider uppercase transition-colors relative ${activeTab === 'team' ? 'text-primary-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Team Timesheets
            {activeTab === 'team' && (
              <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-1 bg-primary-600 rounded-t-lg" />
            )}
          </button>
        </motion.div>
      )}

      {/* Smart Control Bar - Aligned Single Row */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="sticky top-0 z-20 shrink-0"
      >
        <Card className="p-4 border-none shadow-2xl shadow-slate-200/40 bg-white/90 backdrop-blur-xl ring-1 ring-slate-100 flex items-center gap-3">
          <div className="relative flex-1 group min-w-0">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-primary-500 transition-colors duration-300" />
            <input
              type="text"
              placeholder="Search anything (employee, project, status, date...)"
              className="w-full bg-slate-50/50 hover:bg-slate-50 border-none rounded-2xl py-3.5 pl-12 pr-4 text-sm font-bold placeholder:text-slate-300 focus:ring-4 focus:ring-primary-500/10 outline-none transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <Button
            variant="secondary"
            onClick={() => setIsFilterOpen(true)}
            className={`h-[48px] px-6 rounded-2xl border flex items-center gap-2 font-black text-[11px] uppercase tracking-widest transition-all shrink-0 ${activeFilterCount > 0 ? 'bg-primary-50 text-primary-600 border-primary-200 hover:bg-primary-100 shadow-sm shadow-primary-500/10' : 'text-slate-500 border-slate-200 bg-white hover:bg-slate-50'}`}
          >
            <FilterIcon className="w-4 h-4" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-primary-600 text-white flex items-center justify-center text-[10px]">
                {activeFilterCount}
              </span>
            )}
          </Button>

          <div className="flex items-center gap-4 bg-slate-50 px-6 py-2 rounded-2xl border border-slate-100 h-[48px] shrink-0">
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Aggregate</span>
              <span className="text-sm font-black text-slate-900 leading-tight mt-0.5">{totalHours.toFixed(1)}h</span>
            </div>
            <button
              onClick={fetchLogs}
              className="p-1.5 hover:bg-slate-200 rounded-xl transition-colors text-slate-400 hover:text-slate-600"
              title="Force sync"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-primary-500' : ''}`} />
            </button>
          </div>
        </Card>
      </motion.div>

      {/* Main Orchestration Area */}
      <AnimatePresence mode="wait">
        <motion.div
          key={viewMode}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {viewMode === 'list' ? (
            <Card className="p-0 border-none shadow-2xl shadow-slate-200/50 bg-white overflow-hidden ring-1 ring-slate-100 min-h-[500px]">
              {activeTab === 'team' ? (
                <TeamTimesheetListView
                  entries={filteredEntries}
                  loading={loading}
                  currentUser={user}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onRefresh={fetchLogs}
                />
              ) : (
                <TimesheetListView
                  entries={filteredEntries}
                  loading={loading}
                  userRole={user?.role || 'Employee'}
                  currentUserId={user?.id || ''}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onSubmit={handleSubmitLog}
                />
              )}
            </Card>
          ) : (
            <Suspense fallback={
              <div className="h-[600px] flex flex-col items-center justify-center bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
                <ASALoader size="lg" text="Initializing Calendar Matrix..." />
              </div>
            }>
              <TimesheetCalendar
                entries={filteredEntries}
                onSelectDate={handleSelectCalendarDate}
                onSelectEvent={(_e) => {
                  // Find the corresponding entry logic if calendar groups them
                  // For MVP, if calendar returns raw event data:
                  // handleEdit(e.resource);
                }}
              />
            </Suspense>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Drawers and Panels */}
      <TimesheetDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onSuccess={fetchLogs}
        editingEntry={editingEntry}
        selectedDate={selectedDate}
      />

      <FilterPanel
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        filters={filters}
        setFilters={setFilters}
        employees={employees}
        projects={projects}
        isManagerial={isManagerial}
      />

      <DailyEntriesModal
        isOpen={isDailyModalOpen}
        onClose={() => setIsDailyModalOpen(false)}
        date={selectedDate || null}
        entries={filteredEntries}
        onAdd={(date) => {
          setSelectedDate(date);
          setEditingEntry(null);
          setIsDrawerOpen(true);
        }}
        onEdit={(entry) => {
          const fullEntry = entries.find(e => e.id === entry.id);
          if (fullEntry) {
            setEditingEntry(fullEntry);
          }
          setSelectedDate(undefined);
          setIsDrawerOpen(true);
        }}
        onDelete={handleDelete}
        onSubmit={handleSubmitLog}
      />

      {importSummary && (
        <Transition.Root show={importSummary.isOpen} as={React.Fragment}>
          <Dialog as="div" className="relative z-[9999]" onClose={() => setImportSummary(null)}>
            <Transition.Child
              as={React.Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" />
            </Transition.Child>

            <div className="fixed inset-0 z-10 overflow-y-auto">
              <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
                <Transition.Child
                  as={React.Fragment}
                  enter="ease-out duration-300"
                  enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                  enterTo="opacity-100 translate-y-0 sm:scale-100"
                  leave="ease-in duration-200"
                  leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                  leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                >
                  <Dialog.Panel className="relative transform overflow-hidden rounded-[2rem] bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-4xl border border-slate-100">
                    {/* Header */}
                    <div className="bg-slate-50 px-8 py-6 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-sm border border-slate-200 text-primary-600">
                          <FileSpreadsheet className="w-6 h-6" />
                        </div>
                        <div>
                          <Dialog.Title as="h3" className="text-xl font-[1000] text-slate-900 leading-none">
                            Timesheet Excel Import Audit
                          </Dialog.Title>
                          <p className="text-xs font-bold text-slate-400 mt-1.5 uppercase tracking-widest">
                            Registry ingestion & validation report
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="rounded-xl bg-white p-2.5 text-slate-400 hover:text-slate-500 hover:bg-slate-100 transition-colors shadow-sm border border-slate-200"
                        onClick={() => setImportSummary(null)}
                        aria-label="Close"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    {/* Stats Dashboard */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-8 bg-slate-50/50 border-b border-slate-100">
                      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
                          <Table className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Total Processed</p>
                          <p className="text-2xl font-[1000] text-slate-800 mt-1">{importSummary.totalRows} Row(s)</p>
                        </div>
                      </div>

                      <div className="bg-emerald-50/40 p-5 rounded-2xl border border-emerald-100 shadow-sm flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-emerald-100/50 flex items-center justify-center text-emerald-600">
                          <CheckCircle className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-emerald-600/70 uppercase tracking-widest leading-none">Successfully Imported</p>
                          <p className="text-2xl font-[1000] text-emerald-700 mt-1">{importSummary.successfulImports} Row(s)</p>
                        </div>
                      </div>

                      <div className="bg-rose-50/40 p-5 rounded-2xl border border-rose-100 shadow-sm flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-rose-100/50 flex items-center justify-center text-rose-600">
                          <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-rose-600/70 uppercase tracking-widest leading-none">Validation Issues</p>
                          <p className="text-2xl font-[1000] text-rose-700 mt-1">{importSummary.validationErrorsCount} Row(s)</p>
                        </div>
                      </div>
                    </div>

                    {/* Table body for errors */}
                    <div className="p-8">
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Ingestion Warnings & Failures</h4>
                      
                      <div className="table-wrapper rounded-2xl border border-slate-200 !max-h-[300px]">
                        <table className="w-full text-left whitespace-nowrap border-collapse">
                          <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                              <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-16">Row</th>
                              <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Employee Email</th>
                              <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Project Name</th>
                              <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Job Name</th>
                              <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Validation Error / Mismatch Details</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {importSummary.errors.map((err, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-5 py-3.5 text-xs font-black text-slate-500">#{err.row}</td>
                                <td className="px-5 py-3.5 text-xs font-bold text-slate-700 truncate max-w-[180px]" title={err.employee}>{err.employee}</td>
                                <td className="px-5 py-3.5 text-xs font-bold text-slate-700 truncate max-w-[180px]" title={err.project}>{err.project}</td>
                                <td className="px-5 py-3.5 text-xs font-bold text-slate-700 truncate max-w-[150px]" title={err.job}>{err.job}</td>
                                <td className="px-5 py-3.5 text-xs">
                                  <span className="inline-flex items-center gap-1 text-rose-600 font-bold bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-100/50 text-[11px] whitespace-normal max-w-md">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                    {err.error}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="bg-slate-50 px-8 py-5 border-t border-slate-100 flex items-center justify-between">
                      <Button
                        variant="secondary"
                        onClick={downloadErrorReport}
                        className="h-11 px-5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 border-slate-200 hover:bg-slate-100 text-slate-700 shadow-sm"
                      >
                        <Download className="w-4 h-4" />
                        Download Error Report (CSV)
                      </Button>
                      <Button
                        variant="primary"
                        onClick={() => setImportSummary(null)}
                        className="h-11 px-8 rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-primary-500/20"
                      >
                        Dismiss Review
                      </Button>
                    </div>
                  </Dialog.Panel>
                </Transition.Child>
              </div>
            </div>
          </Dialog>
        </Transition.Root>
      )}

      {/* Mobile FAB for creating new entry */}
      <FAB onClick={handleCreate} label="Log Timesheet" />
    </div>
  );
};

export default Timesheet;
