import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Server,
  HardDrive,
  Cpu,
  Database,
  Activity,
  Trash2,
  RefreshCw,
  Search,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  FileText,
  Image as ImageIcon,
  FolderArchive,
  Layers,
  Sparkles,
  CheckCircle2,
  Clock,
  Terminal,
  Zap,
  ArrowDownToLine,
  Filter
} from 'lucide-react';
import API from '../api';
import { useToast } from '../contexts/ToastContext';
import { useTheme } from '../contexts/ThemeContext';

interface SystemStatusData {
  server: {
    status: string;
    environment: string;
    nodeVersion: string;
    platform: string;
    hostname: string;
    pid: number;
    uptimeSeconds: number;
    uptimeFormatted: string;
    port: number | string;
    serverTime: string;
  };
  memory: {
    heapUsedBytes: number;
    heapUsedFormatted: string;
    heapTotalBytes: number;
    heapTotalFormatted: string;
    rssBytes: number;
    rssFormatted: string;
    systemTotalBytes: number;
    systemTotalFormatted: string;
    systemFreeBytes: number;
    systemFreeFormatted: string;
    systemUsedBytes: number;
    systemUsedFormatted: string;
    systemUsedPercent: number;
  };
  cpu: {
    cores: number;
    model: string;
    loadAverage: number[];
  };
  database: {
    status: string;
    latencyMs: number;
    counts: Record<string, number>;
  };
  storage: {
    totalBytes: number;
    totalFormatted: string;
    totalFiles: number;
    uploadsPath: string;
    breakdown: Record<string, { bytes: number; formatted: string; count: number }>;
  };
}

interface FileItem {
  name: string;
  relativePath: string;
  category: string;
  sizeBytes: number;
  sizeFormatted: string;
  createdAt: string;
  modifiedAt: string;
  url: string;
}

const AdminStorageServer: React.FC = () => {
  const toast = useToast();
  const { themeMode } = useTheme();
  const isDark = themeMode === 'dark';

  // Active sub-tab
  const [activeTab, setActiveTab] = useState<'overview' | 'storage' | 'cleanup'>('overview');

  // Status state
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusData, setStatusData] = useState<SystemStatusData | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);

  // Files state
  const [filesLoading, setFilesLoading] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });

  // Cleanup action state
  const [cleaningAction, setCleaningAction] = useState<string | null>(null);
  const [fileToDelete, setFileToDelete] = useState<FileItem | null>(null);
  const [isDeletingFile, setIsDeletingFile] = useState(false);

  // ── 1. Fetch System Status ──────────────────────────────────────────────
  const fetchStatus = useCallback(async (silent = false) => {
    if (!silent) setStatusLoading(true);
    try {
      const res = await API.get('/system/status');
      if (res.data.success) {
        setStatusData(res.data.data);
        setLastRefreshed(new Date());
      }
    } catch (err: any) {
      console.error('Failed to fetch system status:', err);
      if (!silent) toast.error('Failed to load server & storage status');
    } finally {
      if (!silent) setStatusLoading(false);
    }
  }, [toast]);

  // ── 2. Fetch Storage Files ──────────────────────────────────────────────
  const fetchFiles = useCallback(async (p = 1) => {
    setFilesLoading(true);
    try {
      const params = new URLSearchParams({
        category: selectedCategory,
        search: searchQuery,
        page: String(p),
        limit: '50'
      });
      const res = await API.get(`/system/storage/files?${params.toString()}`);
      if (res.data.success) {
        setFiles(res.data.data);
        setPagination(res.data.pagination);
        setPage(p);
      }
    } catch (err: any) {
      console.error('Failed to fetch storage files:', err);
      toast.error('Failed to load storage files');
    } finally {
      setFilesLoading(false);
    }
  }, [selectedCategory, searchQuery, toast]);

  // Initial load
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Load files when tab changes to storage
  useEffect(() => {
    if (activeTab === 'storage') {
      fetchFiles(1);
    }
  }, [activeTab, fetchFiles]);

  // Auto-refresh timer
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchStatus(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchStatus]);

  // ── 3. Handle File Delete ──────────────────────────────────────────────
  const handleDeleteFile = async () => {
    if (!fileToDelete) return;
    setIsDeletingFile(true);
    try {
      const res = await API.delete('/system/storage/file', {
        data: {
          relativePath: fileToDelete.relativePath,
          category: fileToDelete.category
        }
      });
      if (res.data.success) {
        toast.success(res.data.message || 'File deleted successfully');
        setFileToDelete(null);
        fetchFiles(page);
        fetchStatus(true);
      }
    } catch (err: any) {
      console.error('Delete file error:', err);
      toast.error(err.response?.data?.message || 'Failed to delete file');
    } finally {
      setIsDeletingFile(false);
    }
  };

  // ── 4. Handle Storage Cleanup ──────────────────────────────────────────
  const handleCleanup = async (action: 'clean_temp' | 'clean_logs') => {
    const actionLabel = action === 'clean_temp' ? 'Temporary & Cache files' : 'Old System Logs (> 30 days)';
    if (!window.confirm(`Are you sure you want to clean up ${actionLabel}?`)) return;

    setCleaningAction(action);
    try {
      const res = await API.post('/system/storage/cleanup', { action });
      if (res.data.success) {
        toast.success(res.data.message);
        fetchStatus(true);
        if (activeTab === 'storage') fetchFiles(1);
      }
    } catch (err: any) {
      console.error('Cleanup error:', err);
      toast.error(err.response?.data?.message || 'Storage cleanup failed');
    } finally {
      setCleaningAction(null);
    }
  };

  const getCategoryBadge = (cat: string) => {
    switch (cat.toLowerCase()) {
      case 'profile':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-pink-50 dark:bg-pink-950/30 text-pink-600 dark:text-pink-400 border border-pink-200 dark:border-pink-800/40"><ImageIcon className="w-3 h-3" /> Profile</span>;
      case 'documents':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/40"><FileText className="w-3 h-3" /> Documents</span>;
      case 'tickets':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/40"><FolderArchive className="w-3 h-3" /> Tickets</span>;
      case 'logs':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40"><Terminal className="w-3 h-3" /> Logs</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">{cat}</span>;
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto pb-12">
      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl text-white shadow-xl border border-indigo-900/30 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        
        <div className="relative z-10 space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shadow-inner">
              <Server className="w-5 h-5" />
            </div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-white flex items-center gap-2">
              Server & Storage Administration
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Live Engine
              </span>
            </h1>
          </div>
          <p className="text-xs text-slate-300 max-w-2xl pl-12 font-medium">
            Monitor real-time server health, memory allocation, database throughput, disk usage breakdown, and manage active storage archives.
          </p>
        </div>

        {/* Action Controls */}
        <div className="relative z-10 flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer ${
              autoRefresh
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
            }`}
            title="Toggle 10s auto refresh"
          >
            <Zap className={`w-3.5 h-3.5 ${autoRefresh ? 'text-emerald-400 fill-emerald-400' : ''}`} />
            Auto-Sync {autoRefresh ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={() => {
              fetchStatus();
              if (activeTab === 'storage') fetchFiles(page);
              toast.info('Refreshed server telemetry');
            }}
            disabled={statusLoading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-lg hover:shadow-indigo-500/30 flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${statusLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ── Sub Navigation Tabs ── */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        {[
          { id: 'overview', label: 'Telemetry & Health', icon: Activity },
          { id: 'storage', label: 'Storage Explorer', icon: HardDrive },
          { id: 'cleanup', label: 'Maintenance & Cleanup', icon: Sparkles },
        ].map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                active
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'bg-white dark:bg-[#0F1C3F] text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}

        <div className="ml-auto hidden sm:flex items-center gap-1.5 text-[11px] text-slate-400 font-semibold">
          <Clock className="w-3.5 h-3.5" />
          <span>Synced: {lastRefreshed.toLocaleTimeString()}</span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 1: TELEMETRY & HEALTH OVERVIEW
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Top Quick Status Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Server Status */}
            <div className="p-5 rounded-2xl bg-white dark:bg-[#0F1C3F] border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Server Core</span>
                <span className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/30">
                  <Server className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-3">
                <h3 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                  {statusData?.server.status || 'Active'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-semibold">
                  Uptime: <span className="font-bold text-indigo-600 dark:text-indigo-400">{statusData?.server.uptimeFormatted || '0s'}</span>
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex justify-between text-[11px] text-slate-400">
                <span>Node: {statusData?.server.nodeVersion || 'v20.x'}</span>
                <span>PID: {statusData?.server.pid || '—'}</span>
              </div>
            </div>

            {/* Total Storage Used */}
            <div className="p-5 rounded-2xl bg-white dark:bg-[#0F1C3F] border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Storage</span>
                <span className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/30">
                  <HardDrive className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-3">
                <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                  {statusData?.storage.totalFormatted || '0 MB'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-semibold">
                  {statusData?.storage.totalFiles || 0} active upload files
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex justify-between text-[11px] text-slate-400">
                <span>Documents & Media</span>
                <button onClick={() => setActiveTab('storage')} className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer">
                  Manage →
                </button>
              </div>
            </div>

            {/* Database Health */}
            <div className="p-5 rounded-2xl bg-white dark:bg-[#0F1C3F] border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Database (PostgreSQL)</span>
                <span className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/30">
                  <Database className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-3">
                <h3 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                  {statusData?.database.status || 'Connected'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-semibold">
                  Ping Latency: <span className="font-bold text-blue-600 dark:text-blue-400">{statusData?.database.latencyMs || 1} ms</span>
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex justify-between text-[11px] text-slate-400">
                <span>Employees: {statusData?.database.counts.employees || 0}</span>
                <span>Timelogs: {statusData?.database.counts.timelogs || 0}</span>
              </div>
            </div>

            {/* Memory Usage */}
            <div className="p-5 rounded-2xl bg-white dark:bg-[#0F1C3F] border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Memory (RAM)</span>
                <span className="p-2 rounded-xl bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800/30">
                  <Cpu className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-3">
                <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                  {statusData?.memory.heapUsedFormatted || '0 MB'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-semibold">
                  Heap: {statusData?.memory.heapUsedFormatted} / {statusData?.memory.heapTotalFormatted}
                </p>
              </div>
              {/* RAM Usage bar */}
              <div className="mt-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-violet-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.round(((statusData?.memory.heapUsedBytes || 0) / (statusData?.memory.heapTotalBytes || 1)) * 100))}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-slate-400">
                <span>RSS: {statusData?.memory.rssFormatted}</span>
                <span>System RAM: {statusData?.memory.systemUsedPercent || 0}% used</span>
              </div>
            </div>
          </div>

          {/* Detailed Telemetry Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Storage Distribution Breakdown */}
            <div className="p-6 rounded-3xl bg-white dark:bg-[#0F1C3F] border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-indigo-500" />
                    Storage Allocation Breakdown
                  </h3>
                  <p className="text-xs text-slate-400">Disk capacity utilization per system module</p>
                </div>
                <button
                  onClick={() => setActiveTab('storage')}
                  className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  View Files →
                </button>
              </div>

              <div className="space-y-4">
                {[
                  { key: 'documents', label: 'Employee KYC & Documents', icon: FileText, color: 'bg-indigo-500' },
                  { key: 'profile', label: 'User Profile Images', icon: ImageIcon, color: 'bg-pink-500' },
                  { key: 'tickets', label: 'Help Desk Attachments', icon: FolderArchive, color: 'bg-blue-500' },
                  { key: 'logs', label: 'System Execution Logs', icon: Terminal, color: 'bg-amber-500' },
                ].map(item => {
                  const data = statusData?.storage.breakdown[item.key] || { bytes: 0, formatted: '0 B', count: 0 };
                  const percent = statusData?.storage.totalBytes && statusData.storage.totalBytes > 0
                    ? Math.round((data.bytes / statusData.storage.totalBytes) * 100)
                    : 0;

                  return (
                    <div key={item.key} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800/80 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                          {item.label}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] text-slate-400 font-semibold">{data.count} file(s)</span>
                          <span className="font-black text-slate-900 dark:text-white">{data.formatted}</span>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`${item.color} h-full rounded-full transition-all duration-500`}
                          style={{ width: `${Math.max(percent, data.bytes > 0 ? 3 : 0)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Uploads location path */}
              <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 text-[11px] text-slate-500 dark:text-slate-400 font-mono break-all flex items-center gap-2">
                <Terminal className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                <span>Uploads Path: {statusData?.storage.uploadsPath || 'uploads/'}</span>
              </div>
            </div>

            {/* Database & System Specifications */}
            <div className="p-6 rounded-3xl bg-white dark:bg-[#0F1C3F] border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Database className="w-4 h-4 text-blue-500" />
                  Database Records & Infrastructure
                </h3>
                <p className="text-xs text-slate-400">Live row counts in primary PostgreSQL tables</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Employees', count: statusData?.database.counts.employees || 0, color: 'text-indigo-600 dark:text-indigo-400' },
                  { label: 'Timesheets', count: statusData?.database.counts.timelogs || 0, color: 'text-blue-600 dark:text-blue-400' },
                  { label: 'Attendance', count: statusData?.database.counts.attendance || 0, color: 'text-emerald-600 dark:text-emerald-400' },
                  { label: 'Leave Records', count: statusData?.database.counts.leaves || 0, color: 'text-purple-600 dark:text-purple-400' },
                  { label: 'Clients', count: statusData?.database.counts.clients || 0, color: 'text-amber-600 dark:text-amber-400' },
                  { label: 'Projects', count: statusData?.database.counts.projects || 0, color: 'text-rose-600 dark:text-rose-400' },
                ].map((stat, idx) => (
                  <div key={idx} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800/80 text-center space-y-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{stat.label}</span>
                    <h4 className={`text-xl font-black ${stat.color}`}>{stat.count.toLocaleString()}</h4>
                  </div>
                ))}
              </div>

              {/* Hardware specifications */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800/40">
                  <span className="font-semibold text-slate-500">Host Platform</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{statusData?.server.platform}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800/40">
                  <span className="font-semibold text-slate-500">CPU Architecture</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{statusData?.cpu.cores} Cores ({statusData?.cpu.model})</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800/40">
                  <span className="font-semibold text-slate-500">Environment Mode</span>
                  <span className="font-bold uppercase tracking-wider px-2 py-0.5 rounded text-[10px] bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                    {statusData?.server.environment}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="font-semibold text-slate-500">Active Port</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">:{statusData?.server.port}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 2: STORAGE FILE EXPLORER
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'storage' && (
        <div className="space-y-4">
          {/* Filters and Search Bar */}
          <div className="p-4 bg-white dark:bg-[#0F1C3F] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Category Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 no-scrollbar">
              {[
                { id: 'all', label: 'All Files' },
                { id: 'documents', label: 'Documents' },
                { id: 'profile', label: 'Profile Photos' },
                { id: 'tickets', label: 'Tickets' },
                { id: 'logs', label: 'Logs' },
                { id: 'temp', label: 'Temp Cache' },
              ].map(cat => (
                <button
                  key={cat.id}
                  onClick={() => { setSelectedCategory(cat.id); setPage(1); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    selectedCategory === cat.id
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Search Box */}
            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search file name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') fetchFiles(1); }}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
              />
            </div>
          </div>

          {/* Files Table Card */}
          <div className="bg-white dark:bg-[#0F1C3F] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-bold text-slate-500">
              <span>Found {pagination.total} storage file(s)</span>
              <span>Page {pagination.page} of {pagination.pages || 1}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/40 text-[11px] font-black uppercase tracking-wider text-slate-400">
                    <th className="p-4">File Name</th>
                    <th className="p-4">Category</th>
                    <th className="p-4">Size</th>
                    <th className="p-4">Last Modified</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {filesLoading ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-400">
                        <div className="flex items-center justify-center gap-2">
                          <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                          <span>Scanning storage files...</span>
                        </div>
                      </td>
                    </tr>
                  ) : files.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-12 text-center text-slate-400">
                        <HardDrive className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                        <p className="font-bold text-slate-700 dark:text-slate-300">No storage files found</p>
                        <p className="text-[11px] text-slate-400 mt-1">No uploads match the selected category or search filter.</p>
                      </td>
                    </tr>
                  ) : (
                    files.map((file, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="p-4 font-semibold text-slate-900 dark:text-slate-100 max-w-xs truncate" title={file.relativePath}>
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            <span className="truncate">{file.name}</span>
                          </div>
                        </td>
                        <td className="p-4">{getCategoryBadge(file.category)}</td>
                        <td className="p-4 font-mono font-bold text-slate-700 dark:text-slate-300">{file.sizeFormatted}</td>
                        <td className="p-4 text-slate-500 dark:text-slate-400 text-[11px]">
                          {new Date(file.modifiedAt).toLocaleString()}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* View / Download */}
                            <a
                              href={file.url}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-indigo-600 transition-colors"
                              title="Open / Download File"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>

                            {/* Delete File */}
                            <button
                              onClick={() => setFileToDelete(file)}
                              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                              title="Delete File from Storage"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {pagination.pages > 1 && (
              <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <button
                  disabled={page <= 1}
                  onClick={() => fetchFiles(page - 1)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 disabled:opacity-40 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Previous
                </button>
                <span className="text-xs text-slate-500 font-bold">
                  {page} / {pagination.pages}
                </span>
                <button
                  disabled={page >= pagination.pages}
                  onClick={() => fetchFiles(page + 1)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 disabled:opacity-40 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 3: STORAGE MAINTENANCE & CLEANUP
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'cleanup' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Clean Temp & Cache */}
          <div className="p-6 rounded-3xl bg-white dark:bg-[#0F1C3F] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-200 dark:border-amber-800/30">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Clean Temporary & Cache Uploads</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                Removes orphan temporary files and cached import uploads stored in <code className="text-indigo-600 dark:text-indigo-400 font-mono">/uploads/temp</code>. This safely frees disk space without impacting active employee files.
              </p>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">
                Current Temp: {statusData?.storage.breakdown.temp?.formatted || '0 B'}
              </span>
              <button
                onClick={() => handleCleanup('clean_temp')}
                disabled={cleaningAction === 'clean_temp'}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {cleaningAction === 'clean_temp' ? (
                  <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Purging...</>
                ) : (
                  <><Sparkles className="w-3.5 h-3.5" /> Clean Temp Files</>
                )}
              </button>
            </div>
          </div>

          {/* Card 2: Clean Old System Logs */}
          <div className="p-6 rounded-3xl bg-white dark:bg-[#0F1C3F] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200 dark:border-blue-800/30">
                <Terminal className="w-5 h-5" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Purge Archived Server Logs</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                Cleans server logs older than 30 days stored in the log directory to prevent unbounded disk growth. Active and recent error logs are preserved.
              </p>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">
                Log Archives: {statusData?.storage.breakdown.logs?.formatted || '0 B'}
              </span>
              <button
                onClick={() => handleCleanup('clean_logs')}
                disabled={cleaningAction === 'clean_logs'}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {cleaningAction === 'clean_logs' ? (
                  <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Purging...</>
                ) : (
                  <><Terminal className="w-3.5 h-3.5" /> Purge Old Logs</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      <AnimatePresence>
        {fileToDelete && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setFileToDelete(null)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[990]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md p-6 bg-white dark:bg-[#0F1C3F] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl z-[991] space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-600 flex items-center justify-center border border-red-200 dark:border-red-800/30">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Delete Storage File?</h3>
                  <p className="text-xs text-slate-400">This action will permanently delete this file from the disk.</p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-xs space-y-1 font-medium">
                <p className="text-slate-800 dark:text-slate-200 truncate"><span className="text-slate-400 font-bold">File:</span> {fileToDelete.name}</p>
                <p className="text-slate-500"><span className="text-slate-400 font-bold">Size:</span> {fileToDelete.sizeFormatted}</p>
                <p className="text-slate-500"><span className="text-slate-400 font-bold">Location:</span> {fileToDelete.relativePath}</p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setFileToDelete(null)}
                  disabled={isDeletingFile}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteFile}
                  disabled={isDeletingFile}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  {isDeletingFile ? (
                    <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Deleting...</>
                  ) : (
                    <><Trash2 className="w-3.5 h-3.5" /> Confirm Delete</>
                  )}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminStorageServer;
