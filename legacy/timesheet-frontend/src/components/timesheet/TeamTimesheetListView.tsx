import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import {
  User, CheckCircle, Clock3, AlertCircle, Check, X, Loader2,
  CheckSquare, Square, ChevronDown
} from 'lucide-react';
import Button from '../ui/Button';

interface Timelog {
  id: string;
  hours: number;
  description: string;
  date: string;
  workItem?: string;
  billableStatus?: string;
  submissionStatus?: string;
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
      managerId?: string;
      partnerId?: string;
      createdBy?: string;
      client: { id: string; name: string };
    };
  };
}

interface TeamTimesheetListViewProps {
  entries: Timelog[];
  loading: boolean;
  currentUser: any;
  onApprove: (id: string) => Promise<void> | void;
  onReject: (id: string) => Promise<void> | void;
  onRefresh?: () => void;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const TeamTimesheetListView: React.FC<TeamTimesheetListViewProps> = ({
  entries,
  loading,
  currentUser,
  onApprove,
  onReject,
  onRefresh,
}) => {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkLoading, setBulkLoading] = useState<'approve' | 'reject' | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSuccess, setBulkSuccess] = useState<string | null>(null);
  const [selectedDetailEntry, setSelectedDetailEntry] = useState<Timelog | null>(null);

  const handleRowClick = (e: React.MouseEvent, entry: Timelog) => {
    const target = e.target as HTMLElement;
    if (
      target.closest('input[type="checkbox"]') ||
      target.closest('button') ||
      target.closest('a')
    ) {
      return;
    }
    setSelectedDetailEntry(entry);
  };

  // Only rows that the current user can actually take action on
  const actionableEntries = entries.filter(canTakeAction);

  /* ─── Selection helpers ─────────────────────────────────── */
  const handleSelect = useCallback((id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  }, []);

  const handleSelectAll = useCallback(() => {
    const actionableIds = actionableEntries.map(e => e.id);
    if (selectedIds.length === actionableIds.length && actionableIds.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(actionableIds);
    }
  }, [selectedIds, actionableEntries]);

  const allActionableSelected =
    actionableEntries.length > 0 &&
    actionableEntries.every(e => selectedIds.includes(e.id));
  const someSelected = selectedIds.length > 0;

  /* ─── Bulk API calls ────────────────────────────────────── */
  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return;
    setBulkLoading('approve');
    setBulkError(null);
    setBulkSuccess(null);
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const res = await axios.post(
        `${API_BASE}/timelogs/bulk-approve`,
        { ids: selectedIds },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const approvedCount = res.data?.data?.count ?? selectedIds.length;
      setBulkSuccess(`✅ ${approvedCount} timesheet(s) approved successfully.`);
      setSelectedIds([]);
      onRefresh?.();
    } catch (err: any) {
      setBulkError(err?.response?.data?.error || 'Bulk approve failed. Please try again.');
    } finally {
      setBulkLoading(null);
    }
  };

  const handleBulkReject = async () => {
    if (selectedIds.length === 0) return;
    const reason = window.prompt('Enter rejection reason for the selected timesheets:');
    if (!reason || reason.trim() === '') return;

    setBulkLoading('reject');
    setBulkError(null);
    setBulkSuccess(null);
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const res = await axios.post(
        `${API_BASE}/timelogs/bulk-reject`,
        { ids: selectedIds, reason: reason.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const rejectedCount = res.data?.data?.count ?? selectedIds.length;
      setBulkSuccess(`❌ ${rejectedCount} timesheet(s) rejected successfully.`);
      setSelectedIds([]);
      onRefresh?.();
    } catch (err: any) {
      setBulkError(err?.response?.data?.error || 'Bulk reject failed. Please try again.');
    } finally {
      setBulkLoading(null);
    }
  };

  /* ─── Single row actions ────────────────────────────────── */
  const handleAction = async (action: 'approve' | 'reject', id: string) => {
    setActionLoading(id);
    try {
      if (action === 'approve') {
        await onApprove(id);
      } else {
        await onReject(id);
      }
    } finally {
      setActionLoading(null);
    }
  };

  /* ─── Status helpers ────────────────────────────────────── */
  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'approved': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'rejected': return 'bg-rose-50 text-rose-600 border-rose-100';
      case 'submitted': return 'bg-amber-50 text-amber-600 border-amber-100';
      default: return 'bg-slate-50 text-slate-500 border-slate-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'approved': return <CheckCircle className="w-3.5 h-3.5" />;
      case 'submitted': return <Clock3 className="w-3.5 h-3.5" />;
      case 'rejected': return <AlertCircle className="w-3.5 h-3.5" />;
      default: return <Clock3 className="w-3.5 h-3.5" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'approved': return 'Approved';
      case 'rejected': return 'Rejected';
      case 'submitted': return 'Pending';
      case 'not_submitted': return 'Draft';
      default: return 'Pending';
    }
  };

  function canTakeAction(entry: any): boolean {
    if (!currentUser) return false;
    const role = currentUser.role?.toUpperCase() || '';
    const status = entry.submissionStatus?.toUpperCase() || '';
    const employeeId = entry.employee?.id || entry.employeeId;

    // Check if current user is one of the managers or partners
    const isManager = entry.employee?.managers?.some((m: any) => m.managerId === currentUser.id || m.manager?.id === currentUser.id);
    const isPartner = entry.employee?.partners?.some((p: any) => p.partnerId === currentUser.id || p.partner?.id === currentUser.id);
    const isSubManager = entry.employee?.subManagerId === currentUser.id || 
                         (Array.isArray(entry.employee?.subManagerIds) && entry.employee?.subManagerIds.includes(currentUser.id));

    // Also check project-level permissions
    const isProjectManager = entry.job?.project?.managerId === currentUser.id;
    const isProjectPartner = entry.job?.project?.partnerId === currentUser.id;
    const isProjectCreator = entry.job?.project?.createdBy === currentUser.id;

    return (
      status === 'SUBMITTED' &&
      (role === 'ADMIN' ||
        role === 'OWNER' ||
        (['MANAGER', 'PARTNER', 'SUB MANAGER', 'SUB-MANAGER'].includes(role) &&
          (isManager || isPartner || isSubManager || isProjectManager || isProjectPartner || isProjectCreator) &&
          employeeId !== currentUser.id))
    );
  }

  /* ─── Bulk Action Bar ───────────────────────────────────── */
  const BulkActionBar = () => (
    <AnimatePresence>
      {(someSelected || bulkError || bulkSuccess) && (
        <motion.div
          key="bulk-bar"
          initial={{ opacity: 0, y: -12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.97 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="mx-0 mb-3 flex flex-col sm:flex-row items-start sm:items-center gap-3 px-5 py-3 rounded-2xl bg-indigo-950/90 backdrop-blur-md border border-indigo-800/60 shadow-xl shadow-indigo-900/30"
        >
          {/* Selection count pill */}
          <div className="flex items-center gap-2 flex-1">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/20 text-indigo-300 text-[11px] font-black uppercase tracking-widest border border-indigo-500/30">
              <CheckSquare className="w-3.5 h-3.5" />
              {selectedIds.length} selected
            </span>

            {bulkSuccess && (
              <span className="text-emerald-400 text-[11px] font-black uppercase tracking-widest animate-pulse">
                {bulkSuccess}
              </span>
            )}
            {bulkError && (
              <span className="text-rose-400 text-[11px] font-black uppercase tracking-widest">
                ⚠ {bulkError}
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              id="bulk-approve-btn"
              onClick={handleBulkApprove}
              disabled={!someSelected || bulkLoading !== null}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-900/40 hover:shadow-emerald-500/20"
            >
              {bulkLoading === 'approve' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              Approve Selected
            </button>

            <button
              id="bulk-reject-btn"
              onClick={handleBulkReject}
              disabled={!someSelected || bulkLoading !== null}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-black uppercase tracking-widest transition-all shadow-lg shadow-rose-900/40 hover:shadow-rose-500/20"
            >
              {bulkLoading === 'reject' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <X className="w-3.5 h-3.5" />
              )}
              Reject Selected
            </button>

            <button
              onClick={() => { setSelectedIds([]); setBulkError(null); setBulkSuccess(null); }}
              className="flex items-center justify-center w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-all"
              title="Clear selection"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  /* ─── Render ────────────────────────────────────────────── */
  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <BulkActionBar />

      {/* 📱 Mobile Team Log Cards (Visible < 1024px) */}
      <div className="lg:hidden flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 dark:bg-[#080F1D]/50">
        {loading && entries.length === 0 ? (
          <div className="space-y-4">
             {[...Array(3)].map((_, i) => (
                <div key={i} className="p-5 bg-white dark:bg-[#0E1626] rounded-[1.5rem] border border-slate-100 dark:border-slate-800/40 shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 shimmer-bg rounded-full" />
                      <div className="space-y-2">
                        <div className="h-4 shimmer-bg rounded w-28" />
                        <div className="h-3 shimmer-bg rounded w-20" />
                      </div>
                    </div>
                    <div className="h-5 shimmer-bg rounded w-12" />
                  </div>
                  <div className="h-16 shimmer-bg rounded-2xl mb-4" />
                  <div className="flex gap-2">
                     <div className="h-12 shimmer-bg rounded-xl flex-1" />
                     <div className="h-12 shimmer-bg rounded-xl w-20" />
                  </div>
                </div>
             ))}
          </div>
        ) : entries.length > 0 ? (
          entries.map(entry => {
            const dateObj = new Date(entry.date);
            const isActionable = canTakeAction(entry);
            const isSelected = selectedIds.includes(entry.id);

            return (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={(e) => handleRowClick(e, entry)}
                className={`p-5 bg-white dark:bg-[#0E1626] rounded-[1.5rem] border transition-all duration-200 shadow-sm cursor-pointer ${
                  isSelected
                    ? 'border-indigo-400 ring-2 ring-indigo-200'
                    : 'border-slate-100 dark:border-slate-800/40 hover:border-slate-200 dark:hover:border-slate-755'
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    {/* Mobile checkbox */}
                    {isActionable && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleSelect(entry.id)}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 accent-indigo-600 cursor-pointer"
                        aria-label={`Select ${entry.employee.firstName} ${entry.employee.lastName}`}
                      />
                    )}
                    <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 ring-1 ring-indigo-100">
                      <User size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900 leading-tight">
                        {entry.employee.firstName} {entry.employee.lastName}
                      </h3>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                        {dateObj.toLocaleDateString('en-GB')}
                      </p>
                    </div>
                  </div>
                  <div className={`px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-wider ${getStatusColor(entry.submissionStatus || 'submitted')}`}>
                    {getStatusLabel(entry.submissionStatus || 'submitted')}
                  </div>
                </div>

                <div className="py-3 px-4 bg-slate-50 rounded-2xl mb-4 border border-slate-100">
                  <div className="flex justify-between mb-1">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Engagement Matrix</span>
                    <span className="text-sm font-black text-indigo-600">{entry.hours.toFixed(2)}h</span>
                  </div>
                  <p className="text-xs font-bold text-slate-700 leading-tight truncate">
                    {entry.job.project.client.name} • {entry.job.project.name}
                  </p>
                  <p className="text-[10px] font-bold text-slate-500 mt-1 line-clamp-2 italic">"{entry.description}"</p>
                </div>

                <div className="flex items-center gap-2">
                  {isActionable ? (
                    <>
                      <Button
                        fullWidth
                        size="sm"
                        onClick={() => handleAction('approve', entry.id)}
                        disabled={actionLoading === entry.id}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest h-12 shadow-lg shadow-emerald-200 disabled:opacity-50"
                      >
                        {actionLoading === entry.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />} Approve
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAction('reject', entry.id)}
                        disabled={actionLoading === entry.id}
                        className="bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest h-12 w-20 disabled:opacity-50"
                        title="Reject Entry"
                      >
                        {actionLoading === entry.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                      </Button>
                    </>
                  ) : (
                    <div className="w-full text-center py-2 text-[10px] font-black uppercase tracking-widest italic" title="Already processed">
                      {entry.submissionStatus === 'approved' ? (
                        <span className="text-emerald-500">APPROVED ✔</span>
                      ) : entry.submissionStatus === 'rejected' ? (
                        <span className="text-rose-500">REJECTED ❌</span>
                      ) : (
                        <span className="text-slate-400">ACTION LOCKED</span>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })
        ) : (
          <div className="py-20 text-center opacity-30 italic font-black text-sm uppercase tracking-widest">No Action Items</div>
        )}
      </div>

      {/* 🖥️ Desktop Team Log Table (Visible > 1024px) */}
      <div className="hidden lg:block table-wrapper !max-h-[calc(100vh-280px)]">
        <table className="w-full text-left whitespace-nowrap">
          <thead className="bg-slate-50/50 backdrop-blur-md border-b border-slate-100">
            <tr>
              {/* Checkbox column header */}
              <th className="px-4 py-4 w-10">
                <div className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    id="select-all-checkbox"
                    checked={allActionableSelected}
                    onChange={handleSelectAll}
                    disabled={actionableEntries.length === 0}
                    className="w-4 h-4 rounded border-slate-300 accent-indigo-600 cursor-pointer disabled:opacity-30"
                    aria-label="Select all actionable rows"
                    title={allActionableSelected ? 'Deselect all' : 'Select all pending'}
                  />
                </div>
              </th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Employee Profile</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Timeline Index</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Client &amp; Logic Domain</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Hours</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Approval Protocol</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading && entries.length === 0 ? (
              [...Array(5)].map((_, idx) => (
                <tr key={idx}>
                  <td className="px-4 py-5">
                    <div className="w-4 h-4 shimmer-bg rounded mx-auto" />
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 shimmer-bg rounded-full" />
                      <div className="space-y-1.5">
                        <div className="h-3.5 shimmer-bg rounded w-28" />
                        <div className="h-2.5 shimmer-bg rounded w-20" />
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="w-10 h-10 shimmer-bg rounded-xl" />
                  </td>
                  <td className="px-6 py-5">
                    <div className="space-y-2">
                      <div className="h-4 shimmer-bg rounded w-32" />
                      <div className="h-3 shimmer-bg rounded w-24" />
                    </div>
                  </td>
                  <td className="px-6 py-5 text-center">
                    <div className="flex flex-col items-center space-y-1.5">
                      <div className="h-4 shimmer-bg rounded w-8" />
                      <div className="h-2.5 shimmer-bg rounded w-12" />
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="h-6 shimmer-bg rounded-full w-20" />
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex justify-end gap-2">
                      <div className="w-24 h-9 shimmer-bg rounded-xl" />
                      <div className="w-24 h-9 shimmer-bg rounded-xl" />
                    </div>
                  </td>
                </tr>
              ))
            ) : entries.length > 0 ? (
              entries.map(entry => {
                const dateObj = new Date(entry.date);
                const isActionable = canTakeAction(entry);
                const isSelected = selectedIds.includes(entry.id);

                return (
                  <tr
                    key={entry.id}
                    onClick={(e) => handleRowClick(e, entry)}
                    className={`group transition-all duration-200 cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50/60 dark:bg-indigo-950/20'
                        : 'hover:bg-indigo-50/30 dark:hover:bg-indigo-950/10'
                    }`}
                  >
                    {/* Row checkbox */}
                    <td className="px-4 py-5">
                      <div className="flex items-center justify-center">
                        {isActionable ? (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSelect(entry.id)}
                            className="w-4 h-4 rounded border-slate-300 accent-indigo-600 cursor-pointer"
                            aria-label={`Select ${entry.employee.firstName} ${entry.employee.lastName}`}
                          />
                        ) : (
                          <span className="w-4 h-4 block" />
                        )}
                      </div>
                    </td>

                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                          isSelected
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-500 group-hover:bg-indigo-600 group-hover:text-white'
                        }`}>
                          <User className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-900 leading-tight">
                            {entry.employee.firstName} {entry.employee.lastName}
                          </p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                            {entry.employee.officeEmail}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white border border-slate-100 rounded-xl flex flex-col items-center justify-center shadow-sm group-hover:border-indigo-100 transition-all">
                          <span className="text-[9px] font-black text-indigo-600 leading-none uppercase">
                            {dateObj.toLocaleString('default', { month: 'short' })}
                          </span>
                          <span className="text-sm font-black text-slate-900 leading-tight">{dateObj.getDate()}</span>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-5">
                      <div>
                        <p className="text-sm font-black text-slate-800">{entry.job.project.client.name}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                          <p className="text-xs font-bold text-slate-500">{entry.job.project.name}</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-5 text-center">
                      <div className="flex flex-col items-center">
                        <span className="text-sm font-black text-slate-900">{entry.hours.toFixed(2)}h</span>
                        <span
                          className="text-[9px] font-bold text-slate-400 mt-0.5 max-w-[120px] truncate uppercase tracking-tighter"
                          title={entry.description}
                        >
                          {entry.description}
                        </span>
                      </div>
                    </td>

                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-1 items-start">
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider ${getStatusColor(entry.submissionStatus || 'submitted')}`}>
                          {getStatusIcon(entry.submissionStatus || 'submitted')}
                          {getStatusLabel(entry.submissionStatus || 'submitted')}
                        </div>
                        {entry.submissionStatus === 'rejected' && (entry as any).rejectionReason && (
                          <p className="text-[9px] font-bold text-rose-400 mt-1 italic max-w-[150px] truncate" title={(entry as any).rejectionReason}>
                            Reason: {(entry as any).rejectionReason}
                          </p>
                        )}
                      </div>
                    </td>

                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {isActionable ? (
                          <>
                            <button
                              onClick={() => handleAction('approve', entry.id)}
                              disabled={actionLoading === entry.id}
                              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-xl transition-all font-black text-[10px] uppercase tracking-widest shadow-sm hover:shadow-emerald-200 disabled:opacity-50"
                            >
                              {actionLoading === entry.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve
                            </button>
                            <button
                              onClick={() => handleAction('reject', entry.id)}
                              disabled={actionLoading === entry.id}
                              className="flex items-center gap-1.5 px-4 py-2 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-xl transition-all font-black text-[10px] uppercase tracking-widest shadow-sm hover:shadow-rose-200 disabled:opacity-50"
                            >
                              {actionLoading === entry.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />} Reject
                            </button>
                          </>
                        ) : (
                          <span className="text-[10px] font-black uppercase tracking-widest italic" title="Already processed">
                            {entry.submissionStatus === 'approved' ? (
                              <span className="text-emerald-500">APPROVED ✔</span>
                            ) : entry.submissionStatus === 'rejected' ? (
                              <span className="text-rose-500">REJECTED ❌</span>
                            ) : (
                              <span className="text-slate-300">ACTION LOCKED</span>
                            )}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="py-32 text-center opacity-30 italic font-black text-sm uppercase tracking-[0.4em]">
                  Zero Feedback Required
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Drawer */}
      <AnimatePresence>
        {selectedDetailEntry && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedDetailEntry(null)}
              className="fixed inset-0 bg-slate-900 z-[9999] backdrop-blur-sm"
            />
            {/* Drawer Container */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed inset-y-0 right-0 w-full max-w-md bg-white dark:bg-[#0E1626] shadow-2xl z-[10000] flex flex-col border-l border-slate-105 dark:border-slate-800/60"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-100 dark:border-slate-800/40 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <User size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                      {selectedDetailEntry.employee.firstName} {selectedDetailEntry.employee.lastName}
                    </h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5 truncate max-w-[220px]">
                      {selectedDetailEntry.employee.officeEmail}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedDetailEntry(null)}
                  className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-450 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Status Block */}
                <div className="space-y-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Status</span>
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-black uppercase tracking-wider ${getStatusColor(selectedDetailEntry.submissionStatus || 'submitted')}`}>
                    {getStatusIcon(selectedDetailEntry.submissionStatus || 'submitted')}
                    {getStatusLabel(selectedDetailEntry.submissionStatus || 'submitted')}
                  </div>
                  {selectedDetailEntry.submissionStatus === 'rejected' && (selectedDetailEntry as any).rejectionReason && (
                    <div className="p-3 bg-rose-50 dark:bg-rose-950/25 border border-rose-100 dark:border-transparent rounded-xl text-xs text-rose-600 dark:text-rose-400 italic">
                      <strong>Reason for rejection:</strong> {(selectedDetailEntry as any).rejectionReason}
                    </div>
                  )}
                </div>

                {/* Date & Hours */}
                <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-900/30 p-4 rounded-2xl border border-slate-100 dark:border-slate-800/40">
                  <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Date</span>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {new Date(selectedDetailEntry.date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Logged Hours</span>
                    <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                      {selectedDetailEntry.hours.toFixed(2)}h
                    </span>
                  </div>
                </div>

                {/* Project & Client */}
                <div className="space-y-4">
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Client</span>
                    <p className="text-sm font-black text-slate-850 dark:text-slate-200">{selectedDetailEntry.job.project.client.name}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Project</span>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{selectedDetailEntry.job.project.name}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Job / Task</span>
                    <div className="flex items-start gap-2">
                      <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-black rounded uppercase tracking-wider">
                        {selectedDetailEntry.job.jobId}
                      </span>
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{selectedDetailEntry.job.name}</p>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Work Description</span>
                  <div className="p-4 bg-slate-55 dark:bg-slate-905/30 border border-slate-100 dark:border-slate-800/40 rounded-2xl max-h-48 overflow-y-auto custom-scrollbar">
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {selectedDetailEntry.description || 'No description provided.'}
                    </p>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-150 dark:border-slate-800/20">
                  <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Billing Type</span>
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                      {selectedDetailEntry.billableStatus === 'non_billable' ? 'Non-Billable (Internal)' : 'Billable'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Work Item ID</span>
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                      {selectedDetailEntry.workItem || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer Actions (Only if actionable) */}
              <div className="p-6 border-t border-slate-150 dark:border-slate-800/40 bg-slate-50/50 dark:bg-slate-950/20">
                {canTakeAction(selectedDetailEntry) ? (
                  <div className="flex gap-3">
                    <Button
                      fullWidth
                      onClick={() => {
                        handleAction('approve', selectedDetailEntry.id);
                        setSelectedDetailEntry(null);
                      }}
                      disabled={actionLoading === selectedDetailEntry.id}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest h-12 shadow-lg shadow-emerald-200 dark:shadow-none cursor-pointer"
                    >
                      {actionLoading === selectedDetailEntry.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />} Approve
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        handleAction('reject', selectedDetailEntry.id);
                        setSelectedDetailEntry(null);
                      }}
                      disabled={actionLoading === selectedDetailEntry.id}
                      className="border border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded-2xl text-xs font-black uppercase tracking-widest h-12 px-6 cursor-pointer"
                    >
                      Reject
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-2 text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 italic">
                    {selectedDetailEntry.submissionStatus === 'approved' ? (
                      <span className="text-emerald-500">Approved ✔</span>
                    ) : selectedDetailEntry.submissionStatus === 'rejected' ? (
                      <span className="text-rose-500">Rejected ❌</span>
                    ) : (
                      <span>Action Locked</span>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TeamTimesheetListView;
