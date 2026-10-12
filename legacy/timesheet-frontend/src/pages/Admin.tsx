import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell
} from 'recharts';
import {
  Users, Briefcase, FileText, CheckCircle, Clock, AlertCircle,
  TrendingUp, Activity, Shield, Database, Plus, Search, Filter,
  ArrowUpRight, Zap, Settings, Bell, Calendar, Layers, Monitor,
  HardDrive, RefreshCw, Download, ChevronLeft, ChevronRight,
  Eye, Trash2, Edit, UserCheck, Upload, Circle, X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import API from '../api';
import { useAuth } from '../contexts/AuthContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import DashboardSkeleton from '../components/ui/DashboardSkeleton';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string;
  portal: string;
  action: string;
  recordId: string;
  performedBy: string;
  performerName: string;
  description: string;
  icon: string;
  color: string;
  timestamp: string;
}

interface LiveUser {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  profileImage: string | null;
  lastSeen: string | null;
  online: boolean;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ACTION_STYLES: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
  CREATE:  { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', icon: Plus },
  UPDATE:  { bg: 'bg-blue-100 dark:bg-blue-900/30',       text: 'text-blue-700 dark:text-blue-300',       icon: Edit },
  DELETE:  { bg: 'bg-red-100 dark:bg-red-900/30',         text: 'text-red-700 dark:text-red-300',         icon: Trash2 },
  APPROVE: { bg: 'bg-violet-100 dark:bg-violet-900/30',   text: 'text-violet-700 dark:text-violet-300',   icon: UserCheck },
  IMPORT:  { bg: 'bg-amber-100 dark:bg-amber-900/30',     text: 'text-amber-700 dark:text-amber-300',     icon: Upload },
};

const fmtDate = (iso: string) => {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch { return iso; }
};

const timeAgo = (iso: string | null) => {
  if (!iso) return 'Unknown';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
};

// ─── Component ────────────────────────────────────────────────────────────────

const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Summary
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);
  const [selectedPeriod, setSelectedPeriod] = useState('This Week');

  // Audit log
  const [auditLogs, setAuditLogs]         = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading]   = useState(false);
  const [pagination, setPagination]       = useState<Pagination>({ page: 1, limit: 50, total: 0, pages: 1 });
  const [auditSearch, setAuditSearch]     = useState('');
  const [filterAction, setFilterAction]   = useState('');
  const [filterPortal, setFilterPortal]   = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo]   = useState('');
  const [activeTab, setActiveTab]         = useState<'overview' | 'audit' | 'live'>('overview');

  // Live users
  const [liveUsers, setLiveUsers]         = useState<LiveUser[]>([]);
  const [liveLoading, setLiveLoading]     = useState(false);
  const [liveRefreshKey, setLiveRefreshKey] = useState(0);

  const token = localStorage.getItem('token');
  const authHeader = { 'Authorization': `Bearer ${token}` };

  // ── Fetch summary ──────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchSummary = async () => {
      try {
        setLoading(true);
        const res = await API.get('/reports/summary');
        setSummary(res.data.data || res.data);
      } catch (err) {
        console.error('Dashboard summary failed:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSummary();
  }, []);

  // ── Fetch audit log ────────────────────────────────────────────────────────
  const fetchAuditLog = useCallback(async (page = 1) => {
    setAuditLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (auditSearch)    params.set('search', auditSearch);
      if (filterAction)   params.set('action', filterAction);
      if (filterPortal)   params.set('portal', filterPortal);
      if (filterDateFrom) params.set('dateFrom', filterDateFrom);
      if (filterDateTo)   params.set('dateTo', filterDateTo);

      const res = await fetch(`/api/accounts/audit-log?${params}`, { headers: authHeader });
      const data = await res.json();
      if (data.success) {
        setAuditLogs(data.data);
        setPagination(data.pagination);
      }
    } catch (err) {
      console.error('Audit log fetch failed:', err);
    } finally {
      setAuditLoading(false);
    }
  }, [auditSearch, filterAction, filterPortal, filterDateFrom, filterDateTo]);

  useEffect(() => {
    if (activeTab === 'audit') fetchAuditLog(1);
  }, [activeTab, fetchAuditLog]);

  // ── Fetch live users ───────────────────────────────────────────────────────
  const fetchLiveUsers = useCallback(async () => {
    setLiveLoading(true);
    try {
      const res = await fetch('/api/accounts/live-users', { headers: authHeader });
      const data = await res.json();
      if (data.success) setLiveUsers(data.data);
    } catch (err) {
      console.error('Live users fetch failed:', err);
    } finally {
      setLiveLoading(false);
    }
  }, [liveRefreshKey]);

  useEffect(() => {
    if (activeTab === 'live') fetchLiveUsers();
  }, [activeTab, fetchLiveUsers]);

  // Auto-refresh live users every 60s
  useEffect(() => {
    if (activeTab !== 'live') return;
    const interval = setInterval(() => setLiveRefreshKey(k => k + 1), 60000);
    return () => clearInterval(interval);
  }, [activeTab]);

  // ── CSV Export ─────────────────────────────────────────────────────────────
  const exportAuditCSV = () => {
    const headers = ['Timestamp', 'Portal', 'Action', 'Description', 'Performed By', 'Record ID'];
    const rows = auditLogs.map(l => [
      fmtDate(l.timestamp), l.portal, l.action, l.description, l.performerName, l.recordId
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `AuditLog_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  // ── Mock chart data ────────────────────────────────────────────────────────
  const activityData = [
    { name: 'Mon', hours: 45, items: 12 },
    { name: 'Tue', hours: 52, items: 15 },
    { name: 'Wed', hours: 48, items: 14 },
    { name: 'Thu', hours: 61, items: 22 },
    { name: 'Fri', hours: 55, items: 18 },
    { name: 'Sat', hours: 20, items: 5 },
    { name: 'Sun', hours: 15, items: 3 },
  ];

  const projectStatusData = [
    { name: 'Active',    value: 45, color: '#4F46E5' },
    { name: 'Pending',   value: 25, color: '#10B981' },
    { name: 'Completed', value: 30, color: '#F59E0B' },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.08 } }
  };
  const itemVariants = { hidden: { y: 16, opacity: 0 }, visible: { y: 0, opacity: 1 } };

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <motion.div initial="hidden" animate="visible" variants={containerVariants} className="space-y-8 pb-16">

      {/* ── Hero Header ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-3xl bg-indigo-950 p-8 md:p-12 shadow-2xl">
        <div className="absolute top-0 right-0 -m-20 w-80 h-80 bg-indigo-500/20 blur-[100px] rounded-full" />
        <div className="absolute bottom-0 left-0 -m-20 w-80 h-80 bg-purple-500/20 blur-[100px] rounded-full" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="bg-indigo-500/30 border border-white/20 px-3 py-1 rounded-full text-[10px] font-bold text-white uppercase tracking-widest">
                System Pulse: Stable
              </span>
              <span className="text-indigo-300 text-xs font-medium">Synced {new Date().toLocaleTimeString()}</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">
              Admin <span className="text-indigo-400">Control Panel</span>
            </h1>
            <p className="text-indigo-100/60 max-w-xl font-medium leading-relaxed">
              Real-time audit log, live user monitoring, and enterprise resource intelligence.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/admin-portal/system')}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white text-xs font-bold transition-all shadow-lg hover:shadow-indigo-500/30 cursor-pointer active:scale-95"
            >
              <HardDrive className="w-4 h-4" /> Server & Storage
            </button>
            <button
              onClick={() => { fetchAuditLog(1); fetchLiveUsers(); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-white text-xs font-bold transition-all active:scale-95 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        </div>

        {/* Quick KPIs */}
        <div className="relative z-10 grid grid-cols-2 md:grid-cols-4 gap-4 mt-10 bg-white/5 p-4 rounded-3xl backdrop-blur-md border border-white/10">
          {[
            { label: 'Uptime',   value: '99.98%',   icon: Activity },
            { label: 'Latency',  value: '42ms',     icon: Zap },
            { label: 'Requests', value: '14.2k',    icon: Layers },
            { label: 'Security', value: 'Grade A',  icon: Shield },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-2 border-r border-white/10 last:border-0">
              <div className="hidden sm:flex w-10 h-10 bg-white/10 rounded-xl items-center justify-center text-indigo-400">
                <item.icon className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-indigo-300 font-bold">{item.label}</span>
                <span className="text-white text-lg font-black">{item.value}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Primary Stats ──────────────────────────────────────────────────── */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { title: 'Total Workforce',  value: summary?.totalEmployees || 0, change: '+12%', icon: Users,    color: 'indigo' },
          { title: 'Active Projects',  value: summary?.activeProjects  || 0, change: '+5%',  icon: Briefcase, color: 'emerald' },
          { title: 'Global Clients',   value: summary?.totalClients    || 0, change: '+8%',  icon: Monitor,   color: 'amber' },
          { title: 'Live Users Now',   value: liveUsers.length,              change: 'Online',icon: UserCheck, color: 'purple' },
        ].map((stat, i) => (
          <Card key={i} className="group relative overflow-hidden p-6 hover:shadow-2xl transition-all duration-500 border-none bg-white dark:bg-secondary-900 rounded-[2rem]">
            <div className={`absolute top-0 right-0 w-24 h-24 bg-${stat.color}-500/5 -mr-8 -mt-8 rounded-full group-hover:scale-150 transition-transform duration-700`} />
            <div className="relative z-10 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between mb-4">
                <div className={`w-12 h-12 bg-${stat.color}-100 text-${stat.color}-600 rounded-2xl flex items-center justify-center group-hover:rotate-12 transition-transform`}>
                  <stat.icon size={24} />
                </div>
                <div className={`flex items-center gap-1 text-xs font-bold ${stat.change.startsWith('+') ? 'text-emerald-500' : 'text-indigo-500'}`}>
                  {stat.change} {stat.change.startsWith('+') && <TrendingUp size={12} />}
                </div>
              </div>
              <div>
                <p className="text-sm font-bold text-gray-500 dark:text-secondary-400 mb-1">{stat.title}</p>
                <h3 className="text-3xl font-black text-gray-900 dark:text-white">{stat.value}</h3>
              </div>
            </div>
          </Card>
        ))}
      </motion.div>

      {/* ── Tab Navigation ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 bg-white dark:bg-secondary-900 p-1.5 rounded-2xl shadow-sm border border-gray-100 dark:border-secondary-800 w-fit">
        {([
          { key: 'overview', label: 'Dashboard Overview', icon: Activity },
          { key: 'audit',    label: 'Full Audit Log',      icon: FileText },
          { key: 'live',     label: 'Live Users',           icon: Eye },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              activeTab === tab.key
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-gray-500 dark:text-secondary-400 hover:bg-gray-50 dark:hover:bg-secondary-800'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.key === 'live' && liveUsers.length > 0 && (
              <span className="ml-1 bg-emerald-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">
                {liveUsers.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: Overview ────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {activeTab === 'overview' && (
          <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Area chart */}
              <Card className="lg:col-span-2 p-8 border-none bg-white dark:bg-secondary-900 rounded-[2rem] shadow-xl">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-xl font-black text-gray-900 dark:text-white">Workforce Dynamics</h3>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Resource allocation by day</p>
                  </div>
                  <select
                    value={selectedPeriod}
                    onChange={e => setSelectedPeriod(e.target.value)}
                    title="Select period"
                    aria-label="Select reporting period"
                    className="bg-gray-50 dark:bg-secondary-800 border-none rounded-xl text-xs font-bold py-2 px-3 outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option>This Week</option>
                    <option>Last Week</option>
                    <option>Monthly</option>
                  </select>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={activityData}>
                      <defs>
                        <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#4F46E5" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 600 }} dy={10} />
                      <YAxis hide />
                      <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,.1)', fontWeight: 700 }} />
                      <Area type="monotone" dataKey="hours" stroke="#4F46E5" strokeWidth={4} fillOpacity={1} fill="url(#grad1)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Pie chart */}
              <Card className="p-8 border-none bg-white dark:bg-secondary-900 rounded-[2rem] shadow-xl">
                <h3 className="text-xl font-black text-gray-900 dark:text-white mb-1">Project Portfolio</h3>
                <p className="text-[10px] font-extrabold text-indigo-500 uppercase tracking-widest mb-6">Status Mix (%)</p>
                <div className="h-56 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={projectStatusData} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={8} dataKey="value" cornerRadius={10}>
                        {projectStatusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-3xl font-black text-gray-900 dark:text-white">{summary?.activeProjects || 0}</span>
                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Active</span>
                  </div>
                </div>
                <div className="space-y-3 mt-4">
                  {projectStatusData.map((item, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${
                          item.color === '#4F46E5' ? 'bg-[#4F46E5]' : 
                          item.color === '#10B981' ? 'bg-[#10B981]' : 
                          item.color === '#F59E0B' ? 'bg-[#F59E0B]' : 'bg-gray-400'
                        }`} />
                        <span className="text-sm font-bold text-gray-600 dark:text-secondary-300">{item.name}</span>
                      </div>
                      <span className="text-sm font-black text-gray-900 dark:text-white">{item.value}%</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* System Health */}
            <Card className="p-8 border-none bg-gradient-to-br from-indigo-600 to-purple-700 text-white rounded-[2rem] shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-black">System Health</h3>
                  <p className="text-xs font-bold text-indigo-200 uppercase tracking-widest mt-1">Heartbeat Monitoring</p>
                </div>
                <button
                  onClick={() => setActiveTab('audit')}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold text-white transition-all border border-white/10"
                >
                  View Audit Log →
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { label: 'DB Read/Write',     value: 85, icon: Database },
                  { label: 'Auth Middleware',    value: 100, icon: Shield },
                  { label: 'Memory Leak Check', value: 92, icon: HardDrive },
                ].map((item, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <div className="flex items-center gap-2">
                        <item.icon size={14} className="text-indigo-200" />
                        <span>{item.label}</span>
                      </div>
                      <span className="text-indigo-100">{item.value}%</span>
                    </div>
                    <div className="h-2 bg-black/20 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${item.value}%` }}
                        transition={{ duration: 1.5, delay: 0.5 }}
                        className="h-full bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        )}

        {/* ── Tab: Full Audit Log ──────────────────────────────────────────── */}
        {activeTab === 'audit' && (
          <motion.div key="audit" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">

            {/* Filter Bar */}
            <div className="bg-white dark:bg-secondary-900 rounded-2xl border border-gray-100 dark:border-secondary-800 p-4 shadow-sm">
              <div className="flex flex-wrap gap-3 items-center">
                <Filter className="w-4 h-4 text-gray-400 shrink-0" />

                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search user or record…"
                    value={auditSearch}
                    onChange={e => setAuditSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && fetchAuditLog(1)}
                    className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 dark:bg-secondary-800 border border-gray-200 dark:border-secondary-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                {/* Action filter */}
                <select
                  value={filterAction}
                  onChange={e => setFilterAction(e.target.value)}
                  title="Filter by Action"
                  aria-label="Filter by action"
                  className="text-sm py-2 px-3 bg-gray-50 dark:bg-secondary-800 border border-gray-200 dark:border-secondary-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">All Actions</option>
                  <option value="CREATE">Create</option>
                  <option value="UPDATE">Update</option>
                  <option value="DELETE">Delete</option>
                  <option value="APPROVE">Approve</option>
                  <option value="IMPORT">Import</option>
                </select>

                {/* Portal filter */}
                <select
                  value={filterPortal}
                  onChange={e => setFilterPortal(e.target.value)}
                  title="Filter by Portal"
                  aria-label="Filter by portal"
                  className="text-sm py-2 px-3 bg-gray-50 dark:bg-secondary-800 border border-gray-200 dark:border-secondary-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">All Portals</option>
                  {['Invoice', 'Receipt', 'Reimbursement', 'Entity', 'ExchangeRate', 'Transaction', 'Client', 'Employee', 'Project', 'Leave', 'Asset'].map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>

                {/* Date From */}
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={e => setFilterDateFrom(e.target.value)}
                  title="From date"
                  aria-label="Filter from date"
                  className="text-sm py-2 px-3 bg-gray-50 dark:bg-secondary-800 border border-gray-200 dark:border-secondary-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <span className="text-gray-400 text-xs font-bold">to</span>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={e => setFilterDateTo(e.target.value)}
                  title="To date"
                  aria-label="Filter to date"
                  className="text-sm py-2 px-3 bg-gray-50 dark:bg-secondary-800 border border-gray-200 dark:border-secondary-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                />

                <button
                  onClick={() => fetchAuditLog(1)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all active:scale-95"
                >
                  Apply
                </button>

                {(auditSearch || filterAction || filterPortal || filterDateFrom || filterDateTo) && (
                  <button
                    onClick={() => { setAuditSearch(''); setFilterAction(''); setFilterPortal(''); setFilterDateFrom(''); setFilterDateTo(''); }}
                    className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-secondary-800 text-gray-400 hover:text-red-500 transition-all"
                    title="Clear filters"
                    aria-label="Clear all filters"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}

                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-400">{pagination.total} entries</span>
                  <button
                    onClick={exportAuditCSV}
                    className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 dark:bg-secondary-800 hover:bg-gray-100 dark:hover:bg-secondary-700 border border-gray-200 dark:border-secondary-700 rounded-xl text-xs font-bold text-gray-600 dark:text-secondary-300 transition-all"
                  >
                    <Download className="w-3.5 h-3.5" /> CSV
                  </button>
                </div>
              </div>
            </div>

            {/* Audit Table */}
            <div className="bg-white dark:bg-secondary-900 rounded-[2rem] border border-gray-100 dark:border-secondary-800 shadow-xl overflow-hidden">
              <div className="p-5 border-b border-gray-100 dark:border-secondary-800 bg-gradient-to-r from-white to-indigo-50/30 dark:from-secondary-900 dark:to-indigo-900/10 flex items-center justify-between">
                <div>
                  <h3 className="font-black text-base text-gray-900 dark:text-white tracking-tight">Complete Audit Log</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Every action across all portals — who did what and when</p>
                </div>
                {auditLoading && <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin" />}
              </div>

              <div className="overflow-x-auto">
                {auditLogs.length === 0 && !auditLoading ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-3 text-gray-400">
                    <FileText className="w-10 h-10 opacity-30" />
                    <p className="font-semibold text-sm">No audit records found</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-secondary-800/60 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-secondary-400 border-b border-gray-100 dark:border-secondary-700">
                        <th className="px-5 py-3 text-left">Timestamp</th>
                        <th className="px-5 py-3 text-left">Portal</th>
                        <th className="px-5 py-3 text-left">Action</th>
                        <th className="px-5 py-3 text-left">Description</th>
                        <th className="px-5 py-3 text-left">Performed By</th>
                        <th className="px-5 py-3 text-left">Record ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-secondary-800/60">
                      {auditLoading
                        ? Array.from({ length: 8 }).map((_, i) => (
                          <tr key={i} className="animate-pulse">
                            {Array.from({ length: 6 }).map((_, j) => (
                              <td key={j} className="px-5 py-4">
                                <div className="h-3 bg-gray-100 dark:bg-secondary-800 rounded-full w-24" />
                              </td>
                            ))}
                          </tr>
                        ))
                        : auditLogs.map((log) => {
                          const style = ACTION_STYLES[log.action] || ACTION_STYLES.UPDATE;
                          const ActionIcon = style.icon;
                          return (
                            <tr key={log.id} className="hover:bg-indigo-50/20 dark:hover:bg-indigo-900/10 transition-colors group">
                              {/* Timestamp */}
                              <td className="px-5 py-3.5 text-xs text-gray-500 dark:text-secondary-400 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5 text-gray-300 dark:text-secondary-600" />
                                  {fmtDate(log.timestamp)}
                                </div>
                              </td>
                              {/* Portal */}
                              <td className="px-5 py-3.5">
                                <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-secondary-300">
                                  <span className="text-base leading-none">{log.icon}</span>
                                  {log.portal}
                                </span>
                              </td>
                              {/* Action badge */}
                              <td className="px-5 py-3.5">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${style.bg} ${style.text}`}>
                                  <ActionIcon className="w-3 h-3" />
                                  {log.action}
                                </span>
                              </td>
                              {/* Description */}
                              <td className="px-5 py-3.5 text-sm font-medium text-gray-800 dark:text-secondary-200 max-w-[220px]">
                                <span className="block truncate" title={log.description}>{log.description}</span>
                              </td>
                              {/* Performed By */}
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 bg-indigo-100 dark:bg-indigo-900/40 rounded-lg flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-[11px] font-black">
                                    {(log.performerName || log.performedBy || 'S').charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="text-xs font-bold text-gray-800 dark:text-secondary-200 leading-none">{log.performerName}</p>
                                    <p className="text-[10px] text-gray-400 mt-0.5 font-mono truncate max-w-[100px]">{log.performedBy}</p>
                                  </div>
                                </div>
                              </td>
                              {/* Record ID */}
                              <td className="px-5 py-3.5">
                                <span className="font-mono text-[10px] bg-gray-100 dark:bg-secondary-800 px-1.5 py-0.5 rounded text-gray-500 dark:text-secondary-400 truncate block max-w-[100px]" title={log.recordId}>
                                  {log.recordId?.slice(0, 12)}…
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      }
                    </tbody>
                  </table>
                )}
              </div>

              {/* Pagination */}
              {pagination.pages > 1 && (
                <div className="p-4 border-t border-gray-100 dark:border-secondary-800 flex items-center justify-between">
                  <span className="text-xs text-gray-400 font-semibold">
                    Page {pagination.page} of {pagination.pages} &bull; {pagination.total} total entries
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => fetchAuditLog(pagination.page - 1)}
                      disabled={pagination.page <= 1}
                      className="p-2 rounded-lg border border-gray-200 dark:border-secondary-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-secondary-800 transition-all"
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    {Array.from({ length: Math.min(pagination.pages, 7) }).map((_, i) => {
                      const p = i + 1;
                      return (
                        <button
                          key={p}
                          onClick={() => fetchAuditLog(p)}
                          className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                            p === pagination.page
                              ? 'bg-indigo-600 text-white'
                              : 'border border-gray-200 dark:border-secondary-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-secondary-800'
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => fetchAuditLog(pagination.page + 1)}
                      disabled={pagination.page >= pagination.pages}
                      className="p-2 rounded-lg border border-gray-200 dark:border-secondary-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-secondary-800 transition-all"
                      aria-label="Next page"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ── Tab: Live Users ──────────────────────────────────────────────── */}
        {activeTab === 'live' && (
          <motion.div key="live" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">

            {/* Header bar */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-gray-900 dark:text-white">
                  Live Portal Users
                  {liveUsers.length > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-black px-2.5 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse inline-block" />
                      {liveUsers.length} Online
                    </span>
                  )}
                </h2>
                <p className="text-sm text-gray-400 mt-1">Users who performed actions in the last 30 minutes</p>
              </div>
              <button
                onClick={() => setLiveRefreshKey(k => k + 1)}
                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-secondary-800 border border-gray-200 dark:border-secondary-700 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-50 dark:hover:bg-secondary-700 transition-all active:scale-95"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${liveLoading ? 'animate-spin text-indigo-500' : ''}`} />
                Refresh
              </button>
            </div>

            {liveLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-white dark:bg-secondary-900 rounded-2xl p-5 border border-gray-100 dark:border-secondary-800 animate-pulse">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gray-100 dark:bg-secondary-800 rounded-xl" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-gray-100 dark:bg-secondary-800 rounded-full w-2/3" />
                        <div className="h-2.5 bg-gray-100 dark:bg-secondary-800 rounded-full w-full" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : liveUsers.length === 0 ? (
              <div className="bg-white dark:bg-secondary-900 rounded-3xl border border-gray-100 dark:border-secondary-800 shadow-sm py-20 flex flex-col items-center justify-center gap-4">
                <div className="w-16 h-16 bg-gray-100 dark:bg-secondary-800 rounded-full flex items-center justify-center">
                  <Eye className="w-7 h-7 text-gray-300 dark:text-secondary-600" />
                </div>
                <p className="font-bold text-gray-400">No users active in the last 30 minutes</p>
                <p className="text-sm text-gray-300 dark:text-secondary-600">Live users appear here when they perform portal actions</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {liveUsers.map((u) => (
                  <motion.div
                    key={u.id}
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white dark:bg-secondary-900 rounded-2xl border border-gray-100 dark:border-secondary-800 shadow-sm hover:shadow-xl hover:border-indigo-100 dark:hover:border-indigo-800 transition-all duration-300 p-5"
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="relative shrink-0">
                        {u.profileImage ? (
                          <img src={u.profileImage} alt={u.name} className="w-12 h-12 rounded-xl object-cover" />
                        ) : (
                          <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-white font-black text-lg">
                            {u.name.charAt(0)}
                          </div>
                        )}
                        {/* Online dot */}
                        <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-white dark:border-secondary-900 rounded-full" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-sm text-gray-900 dark:text-white truncate">{u.name}</p>
                        <p className="text-[11px] text-gray-400 truncate">{u.email}</p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 rounded-full">
                            {u.role}
                          </span>
                          {u.department && (
                            <span className="text-[10px] font-bold px-2 py-0.5 bg-gray-100 dark:bg-secondary-800 text-gray-500 dark:text-secondary-400 rounded-full">
                              {u.department}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-gray-50 dark:border-secondary-800 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        <Circle className="w-2 h-2 fill-emerald-500 stroke-none animate-pulse" />
                        Active
                      </span>
                      <span className="text-[11px] text-gray-400">
                        Last action: {timeAgo(u.lastSeen)}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Quick actions grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              {[
                { label: 'Settings',      icon: Settings,     color: 'bg-white dark:bg-secondary-900 text-gray-400 dark:text-secondary-500' },
                { label: 'Notifications', icon: Bell,         color: 'bg-white dark:bg-secondary-900 text-gray-400 dark:text-secondary-500' },
                { label: 'Calendar',      icon: Calendar,     color: 'bg-white dark:bg-secondary-900 text-gray-400 dark:text-secondary-500' },
                { label: 'Support',       icon: AlertCircle,  color: 'bg-white dark:bg-secondary-900 text-gray-400 dark:text-secondary-500' },
              ].map((action, i) => (
                <button key={i} className={`${action.color} p-6 rounded-[2rem] flex flex-col items-center gap-3 active:scale-95 transition-all shadow-sm hover:shadow-xl hover:text-indigo-600 group border border-gray-100 dark:border-secondary-800`}>
                  <action.icon className="group-hover:scale-110 transition-transform w-5 h-5" />
                  <span className="text-xs font-black uppercase tracking-tighter">{action.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default AdminDashboard;
