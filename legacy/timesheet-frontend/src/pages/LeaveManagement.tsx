import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import API from '../api';
import { useAuth } from '../contexts/AuthContext';
import {
  CalendarIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  EyeIcon,
  PencilSquareIcon,
  TrashIcon,
  BanknotesIcon,
  ArrowTrendingDownIcon,
  AdjustmentsVerticalIcon,
  ChartPieIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';


// UI Components
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Avatar from '../components/ui/Avatar';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import FAB from '../components/FAB';
import TableSkeleton from '../components/ui/TableSkeleton';
import CardSkeleton from '../components/ui/CardSkeleton';
import ASALoader from '../components/ui/ASALoader';

interface LeaveRecord {
  id: string;
  leaveId: string;
  type: 'Paid Leave' | 'Sick Leave' | 'Casual Leave' | 'Unpaid Leave';
  fromDate: string;
  toDate: string;
  duration: 'Full Day' | 'Half Day';
  totalDays: number;
  reason: string;
  status: 'pending' | 'manager_approved' | 'partner_approved' | 'auto_approved' | 'approved' | 'rejected';
  appliedDate: string;
  approvedBy?: string;
  approvedRole?: string;
  approvedDate?: string;
  approver?: {
    firstName: string;
    lastName: string;
  };


  employee: {
    id: string;
    firstName: string;
    lastName: string;
    officeEmail: string;
  };
}

interface LeaveBalance {
  accrued: number;
  used: number;
  adjustment: number;
  available: number;
  kpiScore: number;
  financialYearStart?: string;
  financialYearEnd?: string;
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  officeEmail: string;
}

interface NegativeBalanceEmployee {
  id: string;
  firstName: string;
  lastName: string;
  employeeId: string;
  department: string;
  accrued: number;
  used: number;
  balance: number;
}

interface AxiosErrorLike {
  response?: {
    data?: {
      error?: string;
    };
  };
}

interface TeamApprovalCardProps {
  record: LeaveRecord;
  canApprove: (record: LeaveRecord) => boolean;
  canReject: (record: LeaveRecord) => boolean;
  handleUpdateLeave: (id: string, action: 'approved' | 'rejected') => void;
  setSelectedRecord: (record: LeaveRecord) => void;
  setShowViewModal: (show: boolean) => void;
  renderStatusBadge: (status: string) => React.ReactNode;
  userRoleNormalized: string;
  handleEditLeave: (record: LeaveRecord) => void;
  handleCancelLeave: (id: string) => void;
}

const TeamApprovalCard: React.FC<TeamApprovalCardProps> = ({
  record,
  canApprove,
  canReject,
  handleUpdateLeave,
  setSelectedRecord,
  setShowViewModal,
  renderStatusBadge,
  userRoleNormalized,
  handleEditLeave,
  handleCancelLeave
}) => {
  const typeColors: Record<string, { bg: string, text: string, border: string, iconColor: string }> = {
    'Paid Leave': { bg: 'bg-indigo-50 dark:bg-indigo-950/30', text: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-100 dark:border-indigo-900/50', iconColor: 'text-indigo-500' },
    'Sick Leave': { bg: 'bg-rose-50 dark:bg-rose-950/30', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-100 dark:border-rose-900/50', iconColor: 'text-rose-500' },
    'Casual Leave': { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-100 dark:border-emerald-900/50', iconColor: 'text-emerald-500' },
    'Unpaid Leave': { bg: 'bg-slate-50 dark:bg-slate-800/50', text: 'text-slate-700 dark:text-slate-300', border: 'border-slate-200 dark:border-slate-700/50', iconColor: 'text-slate-500' },
  };

  const colors = typeColors[record.type] || typeColors['Paid Leave'];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      whileHover={{ y: -3, boxShadow: '0 12px 20px -8px rgba(99, 102, 241, 0.15)' }}
      transition={{ duration: 0.2 }}
      className="bg-white dark:bg-slate-850 rounded-[2rem] border border-slate-100 dark:border-slate-850 p-5 flex flex-col justify-between shadow-sm hover:shadow-xl transition-all duration-300 relative group overflow-hidden"
    >
      {/* Accent strip */}
      <div className={`absolute top-0 left-0 right-0 h-1 ${record.type === 'Sick Leave' ? 'bg-rose-500' : record.type === 'Casual Leave' ? 'bg-emerald-500' : record.type === 'Unpaid Leave' ? 'bg-slate-500' : 'bg-indigo-500'}`} />

      <div>
        {/* Employee Info Header */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar name={record.employee.firstName} size="sm" className="ring-2 ring-slate-100 dark:ring-slate-700 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-xs font-black text-slate-900 dark:text-slate-100 truncate group-hover:text-primary-600 transition-colors leading-tight">
                {record.employee.firstName} {record.employee.lastName}
              </h3>
              <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 truncate mt-0.5">{record.employee.officeEmail}</p>
            </div>
          </div>
          <span className="text-[9px] font-black font-mono text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 px-2 py-0.5 rounded-lg shrink-0">
            {record.leaveId}
          </span>
        </div>

        {/* Leave Type and Days */}
        <div className="flex items-center justify-between gap-2 mb-4 bg-slate-50/50 dark:bg-slate-900/20 p-2.5 rounded-2xl border border-slate-100/50 dark:border-slate-800/40">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-xl ${colors.bg} ${colors.text} flex items-center justify-center border ${colors.border}`}>
              <CalendarIcon className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                {record.type}
              </span>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{record.duration}</p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">
              {record.totalDays}
            </span>
            <span className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block leading-none">Days</span>
          </div>
        </div>

        {/* Date Period */}
        <div className="space-y-1 mb-3">
          <p className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Period</p>
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
            <span>{new Date(record.fromDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            <span className="text-slate-400">→</span>
            <span>{new Date(record.toDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
        </div>

        {/* Reason */}
        <div className="space-y-1 mb-4">
          <p className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Reason</p>
          <div className="p-3 bg-slate-50/30 dark:bg-slate-900/10 rounded-2xl border border-slate-100/50 dark:border-slate-800/40 italic text-[11px] text-slate-650 dark:text-slate-400 line-clamp-2 min-h-[3rem] leading-relaxed">
            "{record.reason || 'No reason provided.'}"
          </div>
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="border-t border-slate-100 dark:border-slate-700/50 pt-4 mt-auto">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col">
            <p className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none">Status</p>
            <div className="mt-1">{renderStatusBadge(record.status)}</div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => { setSelectedRecord(record); setShowViewModal(true); }}
              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 rounded-xl transition-all"
              title="View Details"
            >
              <EyeIcon className="w-4.5 h-4.5" />
            </button>

            <button
              type="button"
              onClick={() => handleEditLeave(record)}
              className="p-2 text-slate-400 hover:text-warning-600 hover:bg-amber-50 dark:hover:bg-amber-950/20 rounded-xl transition-all"
              title="Edit Leave Request"
            >
              <PencilSquareIcon className="w-4.5 h-4.5" />
            </button>

            <button
              type="button"
              onClick={() => handleCancelLeave(record.id)}
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-xl transition-all"
              title="Cancel Leave Request"
            >
              <TrashIcon className="w-4.5 h-4.5" />
            </button>

            {canApprove(record) && (
              <button
                type="button"
                onClick={() => handleUpdateLeave(record.id, 'approved')}
                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-md shadow-emerald-500/10 transition-all flex items-center gap-1 active:scale-95"
                title={['partner', 'admin', 'owner'].includes(userRoleNormalized) ? "Final Approve" : "Manager Approve"}
              >
                <CheckCircleIcon className="w-4 h-4" />
                <span>Approve</span>
              </button>
            )}

            {canReject(record) && (
              <button
                type="button"
                onClick={() => handleUpdateLeave(record.id, 'rejected')}
                className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-xl transition-all active:scale-95"
                title="Reject Request"
              >
                <XCircleIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const LeaveManagement: React.FC = () => {
  const { user } = useAuth();
  const userRoleNormalized = user?.role?.toLowerCase() || '';
  const [leaveRecords, setLeaveRecords] = useState<LeaveRecord[]>([]);
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalance>({
    accrued: 0,
    used: 0,
    adjustment: 0,
    available: 0,
    kpiScore: 100
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('All Types');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<LeaveRecord | null>(null);

  // Master data for employee filter
  const [employees, setEmployees] = useState<Employee[]>([]);

  // Form state for leave application
  const [formData, setFormData] = useState({
    id: '',
    type: 'Paid Leave',
    reason: '',
    duration: 'Full Day',
    fromDate: new Date().toISOString().split('T')[0],
    toDate: new Date().toISOString().split('T')[0],
    leaveHoursPerDay: 'Full Day'
  });

  const [employeeFilter, setEmployeeFilter] = useState('All Employees');

  // Adjust form state
  const [adjustData, setAdjustData] = useState({
    employeeId: '',
    amount: '',
    reason: ''
  });

  // Calculated total days
  const [totalDays, setTotalDays] = useState(1);

  const [negativeBalances, setNegativeBalances] = useState<NegativeBalanceEmployee[]>([]);
  const [showNegativeModal, setShowNegativeModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'my' | 'approvals'>('my');
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);

  const fetchNegativeBalances = useCallback(async () => {
    try {
      const res = await API.get('/leaves/negative-balances');
      if (res.data?.success) {
        setNegativeBalances(res.data.data);
      }
    } catch (err: unknown) {
      console.error('Failed to fetch negative balances:', err);
    }
  }, []);

  const fetchEmployees = useCallback(async () => {
    try {
      // Only fetch employees if user is Admin, Manager, Sub Manager, or Partner
      if (user && ['admin', 'manager', 'sub manager', 'sub-manager', 'partner'].includes(userRoleNormalized)) {
        const res = await API.get('/employees');
        
        // Handle standardized response format { success, data, message }
        setEmployees(res.data?.success ? res.data.data : res.data);
      }
    } catch (err: unknown) {
      console.error('Failed to fetch employees:', err);
      // Set empty array on error
      setEmployees([]);
    }
  }, [user, userRoleNormalized]);

  const fetchLeaveRecords = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string | number | undefined> = {};
      if (leaveTypeFilter !== 'All Types') params.type = leaveTypeFilter;
      if (statusFilter !== 'All Status') params.status = statusFilter;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      
      if (activeTab === 'my') {
        params.employeeId = user?.id;
      } else if (employeeFilter !== 'All Employees') {
        params.employeeId = employeeFilter;
      }

      const res = await API.get('/leaves', { params });
      
      const records: LeaveRecord[] = res.data?.success ? res.data.data : res.data;
      setLeaveRecords(records);

      // Update pending count for the badge (count pending requests that are NOT the user's own)
      const pendingCount = records.filter((r: LeaveRecord) => 
        r.status === 'pending' && r.employee.id !== user?.id
      ).length;
      setPendingApprovalsCount(pendingCount);
    } catch (err: unknown) {
      console.error('Failed to fetch leave records:', err);
      // Set empty array on error to show no records
      setLeaveRecords([]);
    } finally {
      setLoading(false);
    }
  }, [
    leaveTypeFilter,
    statusFilter,
    dateFrom,
    dateTo,
    activeTab,
    user?.id,
    employeeFilter
  ]);

  const fetchLeaveBalance = useCallback(async () => {
    try {
      console.log('Fetching leave balance...');
      const employeeId = employeeFilter !== 'All Employees' ? employeeFilter : user?.id;
      const res = await API.get('/leaves/balance', { params: { employeeId } });
      console.log('Leave balance response:', res.data);
      
      // Handle standardized response format { success, data, message }
      setLeaveBalance(res.data?.success ? res.data.data : res.data);
    } catch (err: unknown) {
      console.error('Failed to fetch leave balance:', err);
      // Set default balance if API fails
      setLeaveBalance({
        accrued: 0,
        used: 0,
        adjustment: 0,
        available: 0,
        kpiScore: 100
      });
    }
  }, [employeeFilter, user?.id]);

  const calculateTotalDays = useCallback(() => {
    if (!formData.fromDate || !formData.toDate) {
      setTotalDays(1);
      return;
    }

    const from = new Date(formData.fromDate);
    const to = new Date(formData.toDate);
    
    if (from > to) {
      setTotalDays(0);
      return;
    }

    const dayCount = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const calculatedDays = formData.duration === 'Half Day' ? dayCount * 0.5 : dayCount;
    setTotalDays(calculatedDays);
  }, [formData.fromDate, formData.toDate, formData.duration]);

  useEffect(() => {
    fetchLeaveBalance();
    fetchEmployees();
    if (user && ['admin', 'partner', 'owner', 'hr'].includes(userRoleNormalized)) {
      fetchNegativeBalances();
    }
  }, [
    fetchLeaveBalance,
    fetchEmployees,
    fetchNegativeBalances,
    user,
    userRoleNormalized
  ]);

  useEffect(() => {
    calculateTotalDays();
  }, [calculateTotalDays]);

  useEffect(() => {
    if (activeTab === 'approvals') {
      setStatusFilter('pending');
    } else {
      setStatusFilter('All Status');
    }
  }, [activeTab]);

  const handleEditLeave = (record: LeaveRecord) => {
    setFormData({
      id: record.id,
      type: record.type,
      reason: record.reason,
      duration: record.duration,
      fromDate: record.fromDate.split('T')[0],
      toDate: record.toDate.split('T')[0],
      leaveHoursPerDay: record.duration === 'Half Day' ? 'First Half' : 'Full Day'
    });
    setShowApplyModal(true);
  };

  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.reason.trim()) {
      alert('Please provide a reason for leave.');
      return;
    }

    if (totalDays <= 0) {
      alert('Invalid date range selected.');
      return;
    }

    const isEdit = !!formData.id;
    try {
      const leaveData = {
        ...formData,
        totalDays,
        appliedDate: new Date().toISOString().split('T')[0]
      };
      console.log("Payload:", leaveData);

      if (isEdit) {
        await API.patch(`/leaves/${formData.id}`, leaveData);
      } else {
        await API.post('/leaves', leaveData);
      }
      setShowApplyModal(false);
      setFormData({
        id: '',
        type: 'Paid Leave',
        reason: '',
        duration: 'Full Day',
        fromDate: new Date().toISOString().split('T')[0],
        toDate: new Date().toISOString().split('T')[0],
        leaveHoursPerDay: 'Full Day'
      });
      fetchLeaveRecords();
      fetchLeaveBalance();
    } catch (err: unknown) {
      console.error('Failed to apply/update leave:', err);
      // Cast err for alert message if it's an axios error
      const errorMsg = (err as AxiosErrorLike)?.response?.data?.error || 'Failed to submit leave request. Please try again.';
      alert(errorMsg);
    }
  };

  const handleAdjustLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustData.employeeId || !adjustData.amount || !adjustData.reason) {
       alert('Please fill all fields');
       return;
    }
    try {
      await API.post('/leaves/adjust', {
         employeeId: adjustData.employeeId,
         amount: parseFloat(adjustData.amount),
         reason: adjustData.reason
      });
      setShowAdjustModal(false);
      setAdjustData({ employeeId: '', amount: '', reason: '' });
      fetchLeaveRecords();
      fetchLeaveBalance();
      alert('Leave balance adjusted successfully');
    } catch (err: unknown) {
      console.error('Failed to adjust leave:', err);
      const errorMsg = (err as AxiosErrorLike)?.response?.data?.error || 'Failed to adjust leave';
      alert(errorMsg);
    }
  };

  const handleUpdateLeave = async (leaveId: string, status: 'approved' | 'rejected') => {
    // Check if user has permission to approve/reject
    const canApproveReject = user && ['admin', 'manager', 'sub manager', 'sub-manager', 'partner'].includes(userRoleNormalized);
    if (!canApproveReject) {
      alert('You do not have permission to approve or reject leave requests.');
      return;
    }

    try {
      await API.put(`/leaves/${leaveId}`, { status });
      fetchLeaveRecords();
      fetchLeaveBalance();
    } catch (err: unknown) {
      console.error('Failed to update leave status:', err);
      alert('Failed to update leave status.');
    }
  };

  const handleCancelLeave = async (leaveId: string) => {
    if (!window.confirm('Are you sure you want to cancel this leave request?')) {
      return;
    }

    try {
      await API.delete(`/leaves/${leaveId}`);
      fetchLeaveRecords();
      fetchLeaveBalance();
    } catch (err: unknown) {
      console.error('Failed to cancel leave:', err);
      alert('Failed to cancel leave request.');
    }
  };

  const handleDownload = (record: LeaveRecord) => {
    // Generate a simple text file or CSV for now as a "functional" download
    const content = `
      Leave Request Details
      ---------------------
      Leave ID: ${record.leaveId}
      Employee: ${record.employee.firstName} ${record.employee.lastName}
      Type: ${record.type}
      From: ${new Date(record.fromDate).toLocaleDateString()}
      To: ${new Date(record.toDate).toLocaleDateString()}
      Duration: ${record.duration} (${record.totalDays} days)
      Reason: ${record.reason}
      Status: ${record.status}
      Applied Date: ${new Date(record.appliedDate).toLocaleDateString()}
    `;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Leave_${record.leaveId}.txt`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Check if user can perform actions based on role and leave status
  const canEditCancel = (record: LeaveRecord) => {
    if (!user) return false;
    
    // Users can edit/cancel their own pending requests
    if (record.employee.id === user.id && record.status === 'pending') {
      return true;
    }
    
    // Admins can edit/cancel any pending request
    if (userRoleNormalized === 'admin' && record.status === 'pending') {
      return true;
    }
    
    // Managers/Sub Managers can edit/cancel pending requests of their team members
    if (['manager', 'sub manager', 'sub-manager'].includes(userRoleNormalized) && record.status === 'pending') {
      // This would need to check if the employee reports to this manager
      // For now, we'll allow it for all pending requests
      return true;
    }
    
    return false;
  };

  const canApprove = (record: LeaveRecord) => {
    if (!user) return false;
    if (record.status !== 'pending') return false; // Only pending can be approved
    
    // Admin, Manager, Partner, HR, Sub Manager can approve
    const isApprover = ['admin', 'manager', 'sub manager', 'sub-manager', 'partner', 'owner', 'hr'].includes(userRoleNormalized);
    if (isApprover) {
      return record.employee.id !== user.id; // Can't approve own requests
    }
    
    return false;
  };

  const canReject = (record: LeaveRecord) => {
    return canApprove(record); // Same logic as approve
  };

  const renderStatusBadge = (status: string) => {
     switch (status) {
        case 'pending':
           return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-full text-[10px] font-black uppercase tracking-wider">🟡 Pending</span>;
        case 'approved':
           return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[10px] font-black uppercase tracking-wider">🟢 Approved</span>;
        case 'rejected':
           return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-full text-[10px] font-black uppercase tracking-wider">🔴 Rejected</span>;
        case 'auto_approved':
           return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full text-[10px] font-black uppercase tracking-wider">⚡ Auto Approved</span>;
        default:
           return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 text-slate-700 border border-slate-200 rounded-full text-[10px] font-black uppercase tracking-wider">{status.replace('_', ' ')}</span>;
     }
  };

  const ViewLeaveModal = () => (
    <Modal isOpen={showViewModal} onClose={() => setShowViewModal(false)} title="Leave Request Details" size="md">
      {selectedRecord && (
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-secondary-100">
            <div className="flex items-center gap-3">
              <Avatar name={selectedRecord.employee.firstName} size="lg" />
              <div>
                <h3 className="text-lg font-extrabold text-secondary-900">{selectedRecord.employee.firstName} {selectedRecord.employee.lastName}</h3>
                <p className="text-xs font-bold text-secondary-400 uppercase tracking-widest">{selectedRecord.leaveId}</p>
              </div>
            </div>
            {renderStatusBadge(selectedRecord.status)}
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-secondary-400 uppercase tracking-widest">Leave Type</p>
              <p className="text-sm font-black text-secondary-900">{selectedRecord.type}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-secondary-400 uppercase tracking-widest">Duration</p>
              <p className="text-sm font-black text-secondary-900">{selectedRecord.duration} ({selectedRecord.totalDays} Days)</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-secondary-400 uppercase tracking-widest">From Date</p>
              <p className="text-sm font-bold text-secondary-900">{new Date(selectedRecord.fromDate).toLocaleDateString()}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-secondary-400 uppercase tracking-widest">To Date</p>
              <p className="text-sm font-bold text-secondary-900">{new Date(selectedRecord.toDate).toLocaleDateString()}</p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-bold text-secondary-400 uppercase tracking-widest">Reason for Leave</p>
            <div className="p-4 bg-secondary-50/50 rounded-2xl border border-secondary-100 italic text-sm text-secondary-700 leading-relaxed">
              "{selectedRecord.reason}"
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <Button variant="primary" fullWidth onClick={() => handleDownload(selectedRecord)}>Download Copy</Button>
            <Button variant="secondary" fullWidth onClick={() => setShowViewModal(false)}>Close</Button>
          </div>
        </div>
      )}
    </Modal>
  );


  const filteredRecords = leaveRecords.filter(record => {
    const matchesSearch = record.reason.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         record.leaveId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = leaveTypeFilter === 'All Types' || record.type === leaveTypeFilter;
    const matchesStatus = statusFilter === 'All Status' || record.status === statusFilter;
    const matchesDateRange = (!dateFrom || record.fromDate >= dateFrom) &&
                           (!dateTo || record.toDate <= dateTo);
    const matchesEmployee = employeeFilter === 'All Employees' || record.employee.id === employeeFilter;
    
    return matchesSearch && matchesType && matchesStatus && matchesDateRange && matchesEmployee;
  });

  const pendingApprovals = filteredRecords.filter(record => record.status === 'pending');
  const historyApprovals = filteredRecords.filter(record => record.status !== 'pending');

  useEffect(() => {
    fetchLeaveRecords();
  }, [fetchLeaveRecords]);


  const balanceStats = [
    {
      label: 'Accrued (YTD)',
      value: leaveBalance.accrued.toString(),
      icon: BanknotesIcon,
      color: 'text-blue-600',
      bg: 'bg-blue-50'
    },
    {
      label: 'Discipline KPI Score',
      value: `${leaveBalance.kpiScore}%`,
      icon: ChartPieIcon,
      color: 'text-rose-600',
      bg: 'bg-rose-50'
    },
    {
      label: 'Used Leave',
      value: leaveBalance.used.toString(),
      icon: ArrowTrendingDownIcon,
      color: 'text-orange-600',
      bg: 'bg-orange-50'
    },
    {
      label: 'Adjustments',
      value: leaveBalance.adjustment > 0 ? `+${leaveBalance.adjustment}` : leaveBalance.adjustment.toString(),
      icon: AdjustmentsVerticalIcon,
      color: 'text-purple-600',
      bg: 'bg-purple-50'
    },
    {
      label: 'Available Balance',
      value: leaveBalance.available < 0 
        ? `${leaveBalance.available} (Overused)` 
        : leaveBalance.available.toString(),
      icon: leaveBalance.available < 0 ? XCircleIcon : CheckCircleIcon,
      color: leaveBalance.available < 0 ? 'text-rose-600' : 'text-green-600',
      bg: leaveBalance.available < 0 ? 'bg-rose-50' : 'bg-green-50'
    }
  ];


  return (
    <div className="h-full flex flex-col space-y-4 sm:space-y-6 animate-fade-in max-h-[calc(100vh-120px)] overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4 flex-none">
        <div className="space-y-3">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-secondary-900 tracking-tight">Leave Management</h1>
          
          {user && ['admin', 'partner', 'manager', 'sub manager', 'sub-manager', 'owner', 'hr'].includes(userRoleNormalized) && (
            <div className="flex gap-1 p-1 bg-secondary-100/50 backdrop-blur-sm rounded-xl w-fit border border-secondary-100">
              <button 
                onClick={() => setActiveTab('my')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 flex items-center gap-2 ${
                  activeTab === 'my' 
                    ? 'bg-white shadow-sm text-primary-600 ring-1 ring-black/5' 
                    : 'text-secondary-500 hover:text-secondary-700 hover:bg-white/50'
                }`}
              >
                <span>My Requests</span>
              </button>
              <button 
                onClick={() => setActiveTab('approvals')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 flex items-center gap-2 ${
                  activeTab === 'approvals' 
                    ? 'bg-white shadow-sm text-primary-600 ring-1 ring-black/5' 
                    : 'text-secondary-500 hover:text-secondary-700 hover:bg-white/50'
                }`}
              >
                <span>Team Approvals</span>
                {pendingApprovalsCount > 0 && (
                  <span className="flex items-center justify-center w-5 h-5 bg-rose-500 text-white text-[10px] font-black rounded-full animate-pulse shadow-sm shadow-rose-200">
                    {pendingApprovalsCount}
                  </span>
                )}
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 mt-0.5 sm:mt-1">
            <p className="text-xs sm:text-sm font-medium text-secondary-500 hidden sm:block">
              {activeTab === 'my' ? 'Manage your leave requests and track leave balance.' : 'Review and approve leave requests from your team.'}
            </p>
            {leaveBalance.financialYearStart && (
              <span className="px-2 py-0.5 bg-primary-50 text-primary-700 border border-primary-100 rounded-full text-[10px] font-bold uppercase tracking-wider">
                FY {new Date(leaveBalance.financialYearStart).getFullYear()}-{new Date(leaveBalance.financialYearEnd || '').getFullYear().toString().slice(-2)}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Button 
            variant="secondary" 
            size="sm" 
            className="h-10" 
            onClick={fetchLeaveRecords}
            title="Refresh Records"
            aria-label="Refresh Records"
          >
            <ArrowPathIcon className="w-4 h-4" />
          </Button>
          {user && ['admin', 'manager', 'sub manager', 'sub-manager', 'partner', 'owner', 'hr'].includes(userRoleNormalized) && (
            <Button
              variant="secondary"
              size="sm"
              className="h-10 px-3 sm:px-4 font-bold whitespace-nowrap text-xs sm:text-sm"
              onClick={() => setShowAdjustModal(true)}
              leftIcon={<AdjustmentsVerticalIcon className="w-4 h-4" />}
            >
              <span className="hidden sm:inline">Adjust Balance</span>
              <span className="sm:hidden">Adjust</span>
            </Button>
          )}
          {user && ['admin', 'partner', 'owner', 'hr'].includes(userRoleNormalized) && negativeBalances.length > 0 && (
            <Button
              variant="danger"
              size="sm"
              className="h-10 px-3 sm:px-4 font-bold whitespace-nowrap text-xs sm:text-sm bg-rose-600 hover:bg-rose-700 shadow-rose-100 shadow-lg border-none"
              onClick={() => setShowNegativeModal(true)}
              leftIcon={<ExclamationTriangleIcon className="w-4 h-4" />}
            >
              <span>{negativeBalances.length} Negative Balances</span>
            </Button>
          )}

          <Button
            variant="primary"
            size="sm"
            className="hidden sm:flex h-10 px-6 font-bold whitespace-nowrap"
            onClick={() => setShowApplyModal(true)}
            leftIcon={<PlusIcon className="w-4 h-4" />}
          >
            Apply Leave
          </Button>
        </div>
      </div>

      {/* Leave Balance Summary */}
      {activeTab === 'my' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3 md:gap-4 flex-none">
          {balanceStats.map((stat, i) => (
            <Card key={i} className="px-5 py-4 transition-all hover:-translate-y-1">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg ${stat.bg} ${stat.color} flex items-center justify-center shadow-sm`}>
                  <stat.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-secondary-500 uppercase tracking-widest leading-none">{stat.label}</p>
                  <p className="text-xl font-bold text-secondary-900 leading-none mt-1.5">{stat.value}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Filters - Scrollable on mobile */}
      <Card className="p-3 sm:p-4 flex-none overflow-visible">
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
          <div className="flex-1 relative group">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400 group-focus-within:text-primary-500 transition-colors" />
            <input
              type="text"
              placeholder="Search by reason or leave ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-secondary-50/50 border border-secondary-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none"
            />
          </div>
          
          {/* Filter controls - horizontal scroll on mobile */}
          <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide -mx-1 px-1">
            {user && ['admin', 'manager', 'sub manager', 'sub-manager', 'partner', 'owner', 'hr'].includes(userRoleNormalized) && activeTab === 'approvals' && (

              <Select
                value={employeeFilter}
                onChange={(e) => setEmployeeFilter(e.target.value)}
                className="min-w-[140px] sm:w-48 flex-shrink-0"
              >
                <option>All Employees</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName}
                  </option>
                ))}
              </Select>
            )}

            <Select
              value={leaveTypeFilter}
              onChange={(e) => setLeaveTypeFilter(e.target.value)}
              className="min-w-[120px] sm:w-48 flex-shrink-0"
            >
              <option>All Types</option>
              <option>Paid Leave</option>
              <option>Sick Leave</option>
              <option>Casual Leave</option>
              <option>Unpaid Leave</option>
            </Select>

            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="min-w-[120px] sm:w-48 flex-shrink-0"
            >
              <option>All Status</option>
              <option value="pending">Pending</option>
              <option value="manager_approved">Manager Approved</option>
              <option value="partner_approved">Fully Approved</option>
              <option value="auto_approved">Auto Approved</option>
              <option value="rejected">Rejected</option>
            </Select>

            <div className="flex gap-2 flex-shrink-0">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                placeholder="From Date"
                className="min-w-[130px] sm:w-40"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                placeholder="To Date"
                className="min-w-[130px] sm:w-40"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Leave Records - Desktop Table + Mobile Cards */}
      {activeTab === 'my' ? (
        <Card className="flex-1 flex flex-col overflow-hidden shadow-lg bg-white dark:bg-slate-850">
          {/* Desktop Table - Hidden on mobile */}
          <div className="hidden md:flex flex-1 flex-col overflow-hidden">
            <div className="table-wrapper flex-1">
              <table className="w-full text-left">
                <thead className="bg-secondary-50/50">
                  <tr>
                    {(user && ['admin', 'manager', 'sub manager', 'sub-manager', 'partner'].includes(userRoleNormalized)) && (
                      <th className="px-6 py-4 text-[10px] font-bold text-secondary-500 uppercase tracking-widest">Employee</th>
                    )}
                    <th className="px-6 py-4 text-[10px] font-bold text-secondary-500 uppercase tracking-widest">Leave ID</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-secondary-500 uppercase tracking-widest">Type</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-secondary-500 uppercase tracking-widest">From Date</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-secondary-500 uppercase tracking-widest">To Date</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-secondary-500 uppercase tracking-widest">Duration</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-secondary-500 uppercase tracking-widest">Total Days</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-secondary-500 uppercase tracking-widest">Reason</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-secondary-500 uppercase tracking-widest">Status</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-secondary-500 uppercase tracking-widest">Applied Date</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-secondary-500 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-secondary-50">
                  {loading ? (
                    Array.from({ length: 6 }).map((_, rowIndex) => (
                      <tr key={rowIndex} className="animate-pulse">
                        {Array.from({ length: user && ['admin', 'manager', 'sub manager', 'sub-manager', 'partner'].includes(userRoleNormalized) ? 11 : 10 }).map((_, colIndex) => (
                          <td key={colIndex} className="px-6 py-4">
                            <div className="h-4 bg-slate-200/60 dark:bg-slate-700/50 rounded-lg w-full" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : filteredRecords.length > 0 ? (
                    filteredRecords.map(record => (
                      <tr key={record.id} className="hover:bg-primary-50/20 group transition-colors">
                        {(user && ['admin', 'manager', 'sub manager', 'sub-manager', 'partner'].includes(userRoleNormalized)) && (
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <Avatar name={record.employee.firstName} size="sm" />
                              <div>
                                <p className="text-sm font-bold text-secondary-900 group-hover:text-primary-600 transition-colors">
                                  {record.employee.firstName} {record.employee.lastName}
                                </p>
                                <p className="text-[10px] font-bold text-secondary-400 mt-0.5">{record.employee.officeEmail}</p>
                              </div>
                            </div>
                          </td>
                        )}
                        <td className="px-6 py-4">
                          <span className="text-sm font-mono font-bold text-secondary-900">{record.leaveId}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-[10px] font-black text-secondary-500 bg-secondary-100 px-2 py-0.5 rounded uppercase tracking-tighter">{record.type}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-secondary-600">{new Date(record.fromDate).toLocaleDateString()}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-secondary-600">{new Date(record.toDate).toLocaleDateString()}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-secondary-600">{record.duration}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-bold text-secondary-900">{record.totalDays}</span>
                        </td>
                        <td className="px-6 py-4 max-w-xs">
                          <p className="text-sm text-secondary-600 truncate">{record.reason}</p>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            {renderStatusBadge(record.status)}
                            {record.status === 'approved' && record.approvedRole && (
                              <span className="text-[9px] text-secondary-400 font-medium">
                                By {record.approvedRole} {record.approver ? `(${record.approver.firstName})` : ''}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <span className="text-sm text-secondary-600">{new Date(record.appliedDate).toLocaleDateString()}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              type="button"
                              onClick={() => { setSelectedRecord(record); setShowViewModal(true); }}
                              className="p-1.5 text-secondary-400 hover:text-primary-600 rounded border border-transparent hover:border-secondary-100 hover:bg-white transition-all"
                              title="View Details"
                              aria-label="View Details"
                            >
                              <EyeIcon className="w-4 h-4" />
                            </button>
                            
                            {canEditCancel(record) && (
                              <>
                                <button 
                                  type="button"
                                  onClick={() => handleEditLeave(record)}
                                  className="p-1.5 text-secondary-400 hover:text-warning-600 rounded border border-transparent hover:border-secondary-100 hover:bg-white transition-all"
                                  title="Edit Leave Request"
                                  aria-label="Edit Leave"
                                >
                                  <PencilSquareIcon className="w-4 h-4" />
                                </button>
                                <button 
                                  type="button"
                                  onClick={() => handleCancelLeave(record.id)}
                                  className="p-1.5 text-secondary-400 hover:text-danger-600 rounded border border-transparent hover:border-secondary-100 hover:bg-white transition-all"
                                  title="Cancel Leave Request"
                                  aria-label="Cancel Leave"
                                >
                                  <TrashIcon className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            
                            {canApprove(record) && (
                              <button 
                                type="button"
                                onClick={() => handleUpdateLeave(record.id, 'approved')}
                                className="p-1.5 text-secondary-400 hover:text-success-600 rounded border border-transparent hover:border-secondary-100 hover:bg-white transition-all flex items-center gap-1"
                                title={['partner', 'admin', 'owner'].includes(userRoleNormalized) ? "Final Approve" : "Manager Approve"}
                                aria-label="Approve Leave"
                              >
                                <CheckCircleIcon className="w-4 h-4" />
                                <span className="hidden xl:inline text-[10px] font-bold uppercase tracking-widest">{['partner', 'admin', 'owner'].includes(userRoleNormalized) ? "Final Approve" : "Approve"}</span>
                              </button>
                            )}
                            
                            {canReject(record) && (
                              <button 
                                type="button"
                                onClick={() => handleUpdateLeave(record.id, 'rejected')}
                                className="p-1.5 text-secondary-400 hover:text-danger-600 rounded border border-transparent hover:border-secondary-100 hover:bg-white transition-all flex items-center gap-1"
                                title="Reject Leave Request"
                                aria-label="Reject Leave"
                              >
                                <XCircleIcon className="w-4 h-4" />
                                <span className="hidden xl:inline text-[10px] font-bold uppercase tracking-widest">Reject</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={user && ['Admin', 'Manager', 'Partner'].includes(user.role) ? 11 : 10} className="py-20 text-center text-secondary-400 font-bold uppercase text-[10px] tracking-widest">No leave records found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <CardSkeleton key={i} />
                ))}
              </div>
            ) : filteredRecords.length > 0 ? (
              filteredRecords.map(record => (
                <div key={record.id} className="mobile-card">
                  <div className="mobile-card-header">
                    <div className="flex items-center gap-2">
                      {(user && ['admin', 'manager', 'sub manager', 'sub-manager', 'partner'].includes(userRoleNormalized)) && (
                        <Avatar name={record.employee.firstName} size="sm" />
                      )}
                      <div>
                        {(user && ['admin', 'manager', 'sub manager', 'sub-manager', 'partner'].includes(userRoleNormalized)) && (
                          <p className="text-sm font-bold text-secondary-900">
                            {record.employee.firstName} {record.employee.lastName}
                          </p>
                        )}
                        <p className="text-[10px] font-mono text-secondary-500">{record.leaveId}</p>
                      </div>
                    </div>
                    {renderStatusBadge(record.status)}
                  </div>
                  <div className="mobile-card-content">
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Type</span>
                      <span className="mobile-card-value">{record.type}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Duration</span>
                      <span className="mobile-card-value">{record.totalDays} day(s) · {record.duration}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Period</span>
                      <span className="mobile-card-value text-xs">
                        {new Date(record.fromDate).toLocaleDateString()} — {new Date(record.toDate).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Reason</span>
                      <span className="mobile-card-value text-xs">{record.reason}</span>
                    </div>
                  </div>
                  {/* Actions */}
                  <div className="mobile-card-actions">
                    {canApprove(record) && (
                      <button 
                        type="button"
                        onClick={() => handleUpdateLeave(record.id, 'approved')}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-success-600 bg-success-50 rounded-lg active:scale-95 transition-all"
                      >
                        <CheckCircleIcon className="w-4 h-4" />
                        Approve
                      </button>
                    )}
                    {canReject(record) && (
                      <button 
                        type="button"
                        onClick={() => handleUpdateLeave(record.id, 'rejected')}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-danger-600 bg-danger-50 rounded-lg active:scale-95 transition-all"
                      >
                        <XCircleIcon className="w-4 h-4" />
                        Reject
                      </button>
                    )}
                    {canEditCancel(record) && (
                      <>
                        <button 
                          type="button"
                          onClick={() => handleEditLeave(record)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-warning-600 bg-amber-50 rounded-lg active:scale-95 transition-all"
                          title="Edit Leave"
                          aria-label="Edit Leave"
                        >
                          <PencilSquareIcon className="w-4 h-4" />
                          Edit
                        </button>
                        <button 
                          type="button"
                          onClick={() => handleCancelLeave(record.id)}
                          className="flex items-center justify-center gap-1.5 p-2 text-xs font-bold text-danger-600 rounded-lg active:scale-95 transition-all"
                          title="Cancel Leave"
                          aria-label="Cancel Leave"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-secondary-400">
                <p className="font-bold uppercase text-[10px] tracking-widest">No leave records found</p>
              </div>
            )}
          </div>
        </Card>
      ) : (
        <div className="flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-1 pb-6">
          {/* Pending Requests Section */}
          <div className="flex-none">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">Pending Requests Queue</h2>
                {pendingApprovals.length > 0 && (
                  <span className="px-2.5 py-0.5 bg-indigo-105 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-xs font-black rounded-full">
                    {pendingApprovals.length}
                  </span>
                )}
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <CardSkeleton key={i} />
                ))}
              </div>
            ) : pendingApprovals.length > 0 ? (
              <motion.div 
                layout
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
              >
                {pendingApprovals.map(record => (
                  <TeamApprovalCard
                    key={record.id}
                    record={record}
                    canApprove={canApprove}
                    canReject={canReject}
                    handleUpdateLeave={handleUpdateLeave}
                    setSelectedRecord={setSelectedRecord}
                    setShowViewModal={setShowViewModal}
                    renderStatusBadge={renderStatusBadge}
                    userRoleNormalized={userRoleNormalized}
                    handleEditLeave={handleEditLeave}
                    handleCancelLeave={handleCancelLeave}
                  />
                ))}
              </motion.div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white dark:bg-slate-850 rounded-[2rem] border border-slate-100 dark:border-slate-800/80 p-8 text-center shadow-sm flex flex-col items-center justify-center min-h-[200px]"
              >
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 dark:text-indigo-400 flex items-center justify-center mb-3">
                  <CheckCircleIcon className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-1">All Caught Up!</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 max-w-xs leading-relaxed">There are no pending leave requests to review right now.</p>
              </motion.div>
            )}
          </div>

          {/* Processed History Section */}
          <div className="flex-1 flex flex-col min-h-[300px]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">Approval History</h2>
                {historyApprovals.length > 0 && (
                  <span className="px-2.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-450 text-xs font-black rounded-full">
                    {historyApprovals.length}
                  </span>
                )}
              </div>
            </div>

            <Card className="flex-1 flex flex-col overflow-hidden shadow-sm border border-slate-100 dark:border-slate-800/60 rounded-[2rem] bg-white dark:bg-slate-850">
              {/* Desktop Table - Hidden on mobile */}
              <div className="hidden md:flex flex-1 flex-col overflow-hidden">
                <div className="table-wrapper flex-1">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-100 dark:border-slate-800/60">
                      <tr>
                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Employee</th>
                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Leave ID</th>
                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Type</th>
                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Period</th>
                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Days</th>
                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Reason</th>
                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Status</th>
                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Processed Date</th>
                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                      {loading ? (
                        Array.from({ length: 6 }).map((_, rowIndex) => (
                          <tr key={rowIndex} className="animate-pulse">
                            {Array.from({ length: 9 }).map((_, colIndex) => (
                              <td key={colIndex} className="px-6 py-4">
                                <div className="h-4 bg-slate-200/60 dark:bg-slate-700/50 rounded-lg w-full" />
                              </td>
                            ))}
                          </tr>
                        ))
                      ) : historyApprovals.length > 0 ? (
                        historyApprovals.map(record => (
                          <tr key={record.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 group transition-colors">
                            <td className="px-6 py-3.5">
                              <div className="flex items-center gap-3">
                                <Avatar name={record.employee.firstName} size="sm" />
                                <div>
                                  <p className="text-xs font-black text-slate-800 dark:text-slate-200">
                                    {record.employee.firstName} {record.employee.lastName}
                                  </p>
                                  <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">{record.employee.officeEmail}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-3.5">
                              <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-350">{record.leaveId}</span>
                            </td>
                            <td className="px-6 py-3.5">
                              <span className="text-[9px] font-extrabold text-slate-600 dark:text-slate-300 bg-slate-500/10 dark:bg-slate-800/50 px-2 py-0.5 rounded-lg border border-slate-100 dark:border-slate-800 uppercase tracking-wider">{record.type}</span>
                            </td>
                            <td className="px-6 py-3.5 text-xs text-slate-600 dark:text-slate-350 font-medium">
                              {new Date(record.fromDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - {new Date(record.toDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </td>
                            <td className="px-6 py-3.5">
                              <span className="text-xs font-black text-slate-800 dark:text-slate-200">{record.totalDays}</span>
                              <span className="text-[9px] font-bold text-slate-450 dark:text-slate-500 ml-1 uppercase">{record.duration === 'Half Day' ? 'Half' : 'Days'}</span>
                            </td>
                            <td className="px-6 py-3.5 max-w-xs">
                              <p className="text-xs text-slate-600 dark:text-slate-400 truncate italic">"{record.reason || 'No reason'}"</p>
                            </td>
                            <td className="px-6 py-3.5">
                              <div className="flex flex-col gap-1">
                                {renderStatusBadge(record.status)}
                                {record.approvedBy && (
                                  <span className="text-[8px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
                                    By {record.approvedRole || 'Approver'} {record.approver ? `(${record.approver.firstName})` : ''}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-3.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
                              {record.approvedDate ? new Date(record.approvedDate).toLocaleDateString() : 'N/A'}
                            </td>
                            <td className="px-6 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                  type="button"
                                  onClick={() => { setSelectedRecord(record); setShowViewModal(true); }}
                                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 rounded-xl transition-all"
                                  title="View Details"
                                >
                                  <EyeIcon className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={9} className="py-16 text-center text-slate-400 dark:text-slate-500 font-black uppercase text-[10px] tracking-widest">No history records found</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Card View for History */}
              <div className="md:hidden flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
                {loading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <CardSkeleton key={i} />
                    ))}
                  </div>
                ) : historyApprovals.length > 0 ? (
                  historyApprovals.map(record => (
                    <div key={record.id} className="bg-slate-50/50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 flex flex-col gap-3">
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-2">
                        <div className="flex items-center gap-2">
                          <Avatar name={record.employee.firstName} size="sm" />
                          <div>
                            <p className="text-xs font-black text-slate-800 dark:text-slate-200">
                              {record.employee.firstName} {record.employee.lastName}
                            </p>
                            <p className="text-[9px] text-slate-400 dark:text-slate-500 font-mono">{record.leaveId}</p>
                          </div>
                        </div>
                        {renderStatusBadge(record.status)}
                      </div>
                      <div className="text-[11px] space-y-1 text-slate-600 dark:text-slate-350">
                        <div className="flex justify-between">
                          <span className="font-bold text-slate-400 uppercase tracking-wide text-[9px]">Type</span>
                          <span>{record.type}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-bold text-slate-400 uppercase tracking-wide text-[9px]">Duration</span>
                          <span>{record.totalDays} Days ({record.duration})</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-bold text-slate-400 uppercase tracking-wide text-[9px]">Period</span>
                          <span>
                            {new Date(record.fromDate).toLocaleDateString()} - {new Date(record.toDate).toLocaleDateString()}
                          </span>
                        </div>
                        {record.reason && (
                          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/40 italic">
                            "{record.reason}"
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 text-slate-400 dark:text-slate-500">
                    <p className="font-bold uppercase text-[10px] tracking-widest">No history records found</p>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Apply Leave Modal */}
      <Modal
        isOpen={showApplyModal}
        onClose={() => {
          setShowApplyModal(false);
          setFormData({
            id: '',
            type: 'Paid Leave',
            reason: '',
            duration: 'Full Day',
            fromDate: new Date().toISOString().split('T')[0],
            toDate: new Date().toISOString().split('T')[0],
            leaveHoursPerDay: 'Full Day'
          });
        }}
        title={formData.id ? "Edit Leave Request" : "Apply for Leave"}
        size="md"
      >
        <form onSubmit={handleApplyLeave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <Input
                type="date"
                value={new Date().toISOString().split('T')[0]}
                disabled
                className="rounded-lg border-gray-200 bg-gray-50"
              />
            </div>
            <Select
              label="Type of Leave"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              required
              className="rounded-lg border-gray-200"
            >
              <option value="Paid Leave">Paid Leave</option>
              <option value="Sick Leave">Sick Leave</option>
              <option value="Casual Leave">Casual Leave</option>
              <option value="Unpaid Leave">Unpaid Leave</option>
            </Select>
          </div>

          <Input
            label="Reason for Leave"
            placeholder="Please provide a reason for your leave request..."
            multiline
            rows={3}
            value={formData.reason}
            onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
            required
            className="rounded-lg border-gray-200"
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Leave Duration"
              value={formData.duration}
              onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
              required
              className="rounded-lg border-gray-200"
            >
              <option value="Full Day">Full Day</option>
              <option value="Half Day">Half Day</option>
            </Select>

            <Select
              label="Leave Hours Per Day"
              value={formData.leaveHoursPerDay}
              onChange={(e) => setFormData({ ...formData, leaveHoursPerDay: e.target.value })}
              required
              className="rounded-lg border-gray-200"
            >
              <option value="Full Day">Full Day</option>
              <option value="First Half">First Half</option>
              <option value="Second Half">Second Half</option>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="From Date"
              type="date"
              value={formData.fromDate}
              onChange={(e) => setFormData({ ...formData, fromDate: e.target.value })}
              required
              className="rounded-lg border-gray-200"
            />
            <Input
              label="To Date"
              type="date"
              value={formData.toDate}
              onChange={(e) => setFormData({ ...formData, toDate: e.target.value })}
              required
              min={formData.fromDate}
              className="rounded-lg border-gray-200"
            />
          </div>

          <div className="bg-secondary-50 border border-secondary-200 rounded-lg p-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-secondary-700">Total Leave Days:</span>
              <span className="text-lg font-bold text-primary-600">{totalDays}</span>
            </div>
          </div>

          {totalDays > leaveBalance.available && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <ExclamationTriangleIcon className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <p className="text-xs font-bold text-rose-700">
                  Warning: This request will put your leave balance into negative ({ (leaveBalance.available - totalDays).toFixed(2) } days).
                </p>
              </div>
            </div>
          )}


          <div className="pt-4 flex gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowApplyModal(false)}
              className="px-6 py-2"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="px-6 py-2"
            >
              Submit Request
            </Button>
          </div>
        </form>
      </Modal>

      {/* Adjust Leave Balance Modal (Admin/Manager/Partner) */}
      <Modal
        isOpen={showAdjustModal}
        onClose={() => setShowAdjustModal(false)}
        title="Adjust Leave Balance"
        size="sm"
      >
        <form onSubmit={handleAdjustLeave} className="space-y-4">
          <Select
            label="Employee"
            value={adjustData.employeeId}
            onChange={(e) => setAdjustData({ ...adjustData, employeeId: e.target.value })}
            required
            className="rounded-lg border-gray-200"
          >
            <option value="" disabled>Select Employee</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.firstName} {emp.lastName} ({emp.officeEmail})
              </option>
            ))}
          </Select>

          <Input
            label="Adjustment Amount (Points/Days)"
            type="number"
            step="0.5"
            placeholder="e.g. 2 for bonus, -1 for deduction"
            value={adjustData.amount}
            onChange={(e) => setAdjustData({ ...adjustData, amount: e.target.value })}
            required
            className="rounded-lg border-gray-200"
          />

          <Input
            label="Reason for Adjustment"
            placeholder="e.g. Extra worked weekend, manual correction..."
            value={adjustData.reason}
            onChange={(e) => setAdjustData({ ...adjustData, reason: e.target.value })}
            required
            className="rounded-lg border-gray-200"
          />

          <div className="pt-4 flex gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowAdjustModal(false)}
              className="px-6 py-2"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="px-6 py-2"
            >
              Adjust Balance
            </Button>
          </div>
        </form>
      </Modal>

      {/* Negative Balance Report Modal */}
      <Modal
        isOpen={showNegativeModal}
        onClose={() => setShowNegativeModal(false)}
        title="Negative Leave Balance Report"
        size="lg"
      >
        <div className="overflow-hidden rounded-xl border border-rose-100">
          <table className="w-full text-left">
            <thead className="bg-rose-50/50">
              <tr>
                <th className="px-4 py-3 text-[10px] font-bold text-rose-700 uppercase tracking-widest">Employee</th>
                <th className="px-4 py-3 text-[10px] font-bold text-rose-700 uppercase tracking-widest">Department</th>
                <th className="px-4 py-3 text-[10px] font-bold text-rose-700 uppercase tracking-widest text-center">Accrued</th>
                <th className="px-4 py-3 text-[10px] font-bold text-rose-700 uppercase tracking-widest text-center">Used</th>
                <th className="px-4 py-3 text-[10px] font-bold text-rose-700 uppercase tracking-widest text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rose-50">
              {negativeBalances.map((emp) => (
                <tr key={emp.id} className="hover:bg-rose-50/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={emp.firstName} size="xs" />
                      <div>
                        <p className="text-xs font-bold text-secondary-900">{emp.firstName} {emp.lastName}</p>
                        <p className="text-[10px] text-secondary-400 uppercase font-bold tracking-tighter">{emp.employeeId}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-secondary-600">{emp.department}</td>
                  <td className="px-4 py-3 text-xs font-bold text-secondary-900 text-center">{emp.accrued}</td>
                  <td className="px-4 py-3 text-xs font-bold text-secondary-900 text-center">{emp.used}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-black uppercase tracking-wider shadow-sm">
                      {emp.balance.toFixed(2)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-6 flex justify-end">
          <Button variant="secondary" onClick={() => setShowNegativeModal(false)}>Close Report</Button>
        </div>
      </Modal>

      {/* Mobile FAB for Apply Leave */}
      <FAB onClick={() => setShowApplyModal(true)} label="Apply Leave" />

      <ViewLeaveModal />
    </div>
  );
};

export default LeaveManagement;
