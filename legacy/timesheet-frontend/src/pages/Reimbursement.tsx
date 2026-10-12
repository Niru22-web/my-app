import React, { useState, useEffect, useMemo } from 'react';
import ChecklistDropdown from '../components/ui/ChecklistDropdown';
import { useLocation } from 'react-router-dom';
import API from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToastUtils } from '../utils/toastUtils';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import {
  CurrencyDollarIcon,
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
  DocumentArrowUpIcon,
  ArrowPathIcon,
  PaperClipIcon,
  XMarkIcon,
  EyeIcon,
  PencilSquareIcon,
  TrashIcon,
  ExclamationTriangleIcon,
  ChevronDownIcon
} from '@heroicons/react/24/outline';

// UI Components
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Avatar from '../components/ui/Avatar';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';

import ActionBar from '../components/ui/ActionBar';
import FAB from '../components/FAB';
import Badge from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';
import TableSkeleton from '../components/ui/TableSkeleton';
import CardSkeleton from '../components/ui/CardSkeleton';
import ASALoader from '../components/ui/ASALoader';

// Analytics
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';

const DetailItem: React.FC<{label: string, value: string}> = ({ label, value }) => (
  <div className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
    <span className="text-xs font-black text-slate-700">{value}</span>
  </div>
);

interface UploadResult {
  successCount: number;
  duplicateCount: number;
  errors: Array<{ error: string }>;
}

interface ChartData {
  trendData: Array<{ name: string; approved: number; pending: number }>;
  pieData: Array<{ name: string; value: number }>;
}

interface ClientMaster {
  id: string;
  name: string;
}

interface ProjectMaster {
  id: string;
  name: string;
  clientId: string;
}

interface JobMaster {
  id: string;
  name: string;
  projectId: string;
}

interface EmployeeOption {
  id: string;
  firstName: string;
  lastName: string;
  employeeId: string;
  department?: string;
}

interface AuditLog {
  id: string;
  performedAt: string;
  reimbursement?: {
    employee?: {
      firstName: string;
      lastName: string;
      employeeId: string;
    };
    claimId: string;
  };
  action: string;
  performedBy?: {
    firstName: string;
    lastName: string;
  };
  remarks?: string;
}

const ApprovalsMetricCard: React.FC<{ title: string; value: string | number; icon: React.ComponentType<{ className?: string }>; color: string }> = ({ title, value, icon: Icon, color }) => {
  const colors: Record<string, string> = {
    yellow: 'bg-amber-50 text-amber-600',
    green: 'bg-emerald-50 text-emerald-600',
    red: 'bg-rose-50 text-rose-600',
    blue: 'bg-blue-50 text-blue-600',
    gray: 'bg-slate-50 text-slate-600'
  };
  return (
    <Card className="p-4 border-none shadow-sm transition-all hover:shadow-md">
      <div className="flex flex-col gap-3">
        <div className={`w-10 h-10 rounded-xl ${colors[color]} flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-2xl font-black text-slate-900 tracking-tight tabular-nums">{value}</p>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{title}</p>
        </div>
      </div>
    </Card>
  );
};

interface ReimbursementClaim {
  id: string;
  claimId: string;
  category: string;
  amount: number;
  date: string;
  status: 'PENDING_MANAGER' | 'MANAGER_APPROVED' | 'APPROVED' | 'REJECTED' | 'SENT_BACK' | 'PAID' | 'CANCELLED' | 'ESCALATED' | 'pending' | 'approved' | 'rejected' | 'send_back';
  paymentStatus?: string;
  paymentDate?: string;
  paidAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedAt?: string;
  updatedAt?: string;
  paymentMode?: string;
  description: string;
  clientId?: string;
  projectId?: string;
  jobId?: string;
  attachments?: string[];
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeId: string;
    department: string;
  };
  client?: {
    id: string;
    name: string;
  };
  project?: {
    id: string;
    name: string;
  };
  job?: {
    id: string;
    name: string;
  };
  partnerApprover?: {
    firstName: string;
    lastName: string;
  };
  partnerApprovedAt?: string;
  utrNumber?: string;
  logs?: Array<{
    action: string;
    performedBy?: {
      firstName: string;
      lastName: string;
    };
    performedAt: string;
    remarks?: string;
  }>;
}

const Reimbursement: React.FC = () => {
  const { user } = useAuth();
  const toast = useToastUtils();
  const [claims, setClaims] = useState<ReimbursementClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  console.log("Current User:", user);
  console.log("User Role:", user?.role);

  // Bulk Upload states
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  
  // KPI state
  const [kpis, setKpis] = useState({
    totalSubmitted: 0,
    approvalRate: 0,
    rejectedVsApproved: 0,
    approvedCount: 0,
    rejectedCount: 0,
    totalPending: 0,
    pendingAmount: 0,
    approvedAmount: 0,
    paidAmount: 0,
    thisMonthSpend: 0
  });

  // Filter states
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);

  // Form state
  const [formData, setFormData] = useState({
    clientId: '',
    projectId: '',
    jobId: '',
    category: 'Travel',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    attachments: [] as File[],
    id: '' // Added for editing
  });

  // Master data for hierarchy
  const [clients, setClients] = useState<ClientMaster[]>([]);
  const [projects, setProjects] = useState<ProjectMaster[]>([]);
  const [jobs, setJobs] = useState<JobMaster[]>([]);

  // Attachment management
  const [attachmentPreviews, setAttachmentPreviews] = useState<{file: File, preview: string}[]>([]);
  
  // Tabs
  const location = useLocation();
  const userRoleNormalized = user?.role?.toLowerCase() || '';
  const isPowerUser = ['admin', 'partner', 'owner', 'hr', 'accountant', 'finance manager', 'accounts'].includes(userRoleNormalized);
  
  const [activeTab, setActiveTab] = useState<'dashboard' | 'my' | 'approvals'>(
    new URLSearchParams(location.search).get('tab') === 'approvals' ? 'approvals' : 
    new URLSearchParams(location.search).get('tab') === 'my' ? 'my' : 'dashboard'
  );

  useEffect(() => {
    const tab = new URLSearchParams(location.search).get('tab');
    if (tab === 'approvals') setActiveTab('approvals');
    else if (tab === 'my') setActiveTab('my');
    else if (tab === 'dashboard') setActiveTab('dashboard');
  }, [location.search]);

  const [approvalsData, setApprovalsData] = useState<ReimbursementClaim[]>([]);
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [selectedApprovals, setSelectedApprovals] = useState<string[]>([]);
  
  // Modals for Approvals
  const [viewModal, setViewModal] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<ReimbursementClaim | null>(null);
  const [actionModal, setActionModal] = useState<{ open: boolean; type: 'approve' | 'reject' | 'send-back'; id?: string }>({ open: false, type: 'approve' });
  const [remarks, setRemarks] = useState('');

  // Payment Processing state
  const [showPayModal, setShowPayModal] = useState(false);
  const [payData, setPayData] = useState({
    paymentMode: 'Bank Transfer',
    bankReference: '',
    utrNumber: '',
    remarks: ''
  });

  const [selectedStatusesMy, setSelectedStatusesMy] = useState<string[]>([]);
  const [selectedEmployeesMy, setSelectedEmployeesMy] = useState<string[]>([]);

  const toggleStatusMy = (status: string) => {
    setSelectedStatusesMy(prev => 
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  const toggleEmployeeMy = (empId: string) => {
    setSelectedEmployeesMy(prev => 
      prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]
    );
  };

  const [selectedCategoriesTeam, setSelectedCategoriesTeam] = useState<string[]>([]);
  const [selectedEmployeesTeam, setSelectedEmployeesTeam] = useState<string[]>([]);
  const [selectedDepartmentsTeam, setSelectedDepartmentsTeam] = useState<string[]>([]);

  const [empSearchMy, setEmpSearchMy] = useState('');
  const [empSearchTeam, setEmpSearchTeam] = useState('');
  const [deptSearchTeam, setDeptSearchTeam] = useState('');
  const [statusSearchMy, setStatusSearchMy] = useState('');
  const [catSearchTeam, setCatSearchTeam] = useState('');

  const toggleCategoryTeam = (cat: string) => {
    setSelectedCategoriesTeam(prev => 
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const toggleEmployeeTeam = (empId: string) => {
    setSelectedEmployeesTeam(prev => 
      prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]
    );
  };

  const toggleDepartmentTeam = (dept: string) => {
    setSelectedDepartmentsTeam(prev => 
      prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]
    );
  };

  const [approvalFilters, setApprovalFilters] = useState({
    q: '',
    status: 'all',
    category: 'All Categories',
    startDate: '',
    endDate: '',
    orgView: isPowerUser ? 'true' : 'false',
    department: '',
    employeeId: ''
  });

  const [subTab, setSubTab] = useState<'pending' | 'approved' | 'rejected' | 'paid' | 'all' | 'logs'>('pending');
  const [logsData, setLogsData] = useState<AuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    if (activeTab === 'my') {
      fetchClaims();
      fetchKPIs();
    } else if (activeTab === 'dashboard') {
      fetchKPIs();
      fetchApprovalCharts();
    } else if (activeTab === 'approvals') {
      fetchTeamApprovals();
      fetchKPIs();
      fetchApprovalCharts();
    }
    if (!clients.length) fetchMasterData();
    if (['admin', 'partner', 'owner', 'manager', 'hr', 'accountant', 'accounts'].includes(userRoleNormalized) && !employeeOptions.length) fetchEmployees();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, selectedMonth, selectedYear, activeTab, subTab, approvalFilters.category, approvalFilters.q, approvalFilters.department]);

  const fetchEmployees = async () => {
    try {
      const res = await API.get('/employees');
      setEmployeeOptions(res.data?.success ? res.data.data : res.data);
    } catch (err) {
      console.error('Failed to fetch employees:', err);
    }
  };

  const fetchKPIs = async () => {
    try {
      const isOrg = (activeTab === 'dashboard' && isPowerUser) || activeTab === 'approvals';
      const res = await API.get('/reimbursements/stats', {
        params: {
          month: selectedMonth,
          year: selectedYear,
          orgView: isOrg ? 'true' : 'false'
        }
      });
      if (res.data?.success) {
        const data = res.data.data;
        setKpis({
          ...data,
          totalSubmitted: (data.totalPending || 0) + (data.approvedCount || 0) + (data.rejectedCount || 0),
          thisMonthSpend: data.approvedAmount || 0
        });
      }
    } catch (err) {
      console.error('Failed to fetch KPIs:', err);
    }
  };

  const fetchMasterData = async () => {
    try {
      const [clientsRes, projectsRes, jobsRes] = await Promise.all([
        API.get('/clients'),
        API.get('/projects'),
        API.get('/jobs')
      ]);
      
      // Handle standardized response format { success, data, message }
      setClients(clientsRes.data?.success ? clientsRes.data.data : clientsRes.data);
      setProjects(projectsRes.data?.success ? projectsRes.data.data : projectsRes.data);
      setJobs(jobsRes.data?.success ? jobsRes.data.data : jobsRes.data);
    } catch (err) {
      console.error('Failed to fetch master data:', err);
      // Fallback to empty arrays
      setClients([]);
      setProjects([]);
      setJobs([]);
    }
  };

  const fetchClaims = async () => {
    try {
      setLoading(true);
      
      const monthStart = startOfMonth(new Date(selectedYear, selectedMonth - 1));
      const monthEnd = endOfMonth(monthStart);

      // Validate dates
      if (isNaN(monthStart.getTime()) || isNaN(monthEnd.getTime())) {
        console.error('Invalid date selection:', { selectedMonth, selectedYear });
        setClaims([]);
        return;
      }

      const res = await API.get('/reimbursements', {
        params: { 
          q: searchTerm,
          startDate: monthStart.toISOString(),
          endDate: monthEnd.toISOString(),
          orgView: 'false'
        }
      });
      
      if (res.data?.success) {
        setClaims(res.data.data || []);
      } else {
        setClaims(Array.isArray(res.data) ? res.data : []);
      }
    } catch (err) {
      console.error('Failed to fetch claims:', err);
      setClaims([]); // Safe fallback
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamApprovals = async () => {
    try {
      if (subTab === 'logs') {
        fetchLogs();
        return;
      }
      setApprovalsLoading(true);
      const res = await API.get('/reimbursements/team-approvals', { 
        params: {
          ...approvalFilters,
          category: 'All Categories',
          employeeId: '',
          department: '',
          status: subTab,
          orgView: 'true'
        } 
      });
      console.log("Approvals API Response:", res.data);
      if (res.data?.success) {
        setApprovalsData(res.data.data || []);
      } else {
        setApprovalsData(Array.isArray(res.data) ? res.data : []);
      }
    } catch (err) {
      console.error('Failed to fetch approvals:', err);
      setApprovalsData([]);
    } finally {
      setApprovalsLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      setLogsLoading(true);
      const res = await API.get('/reimbursements/logs');
      if (res.data?.success) setLogsData(res.data.data);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  const fetchApprovalCharts = async () => {
    try {
      const res = await API.get('/reimbursements/charts');
      if (res.data?.success) setChartData(res.data.data);
    } catch (err) {
      console.error('Failed to fetch charts:', err);
    }
  };

  const handleApprovalAction = async (id: string, type: string) => {
    try {
      await API.patch(`/reimbursements/${id}/${type}`, { remarks });
      toast.success(`action-${id}`, `Request ${type} successfully`);
      setActionModal({ open: false, type: 'approve' });
      setRemarks('');
      if (activeTab === 'my') fetchClaims();
      else fetchTeamApprovals();
      fetchKPIs();
      fetchApprovalCharts();
    } catch (err) {
      toast.error(`action-${id}`, 'Operation failed');
    }
  };

  const handleMarkAsPaid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClaim) return;
    
    const tid = toast.loading('Processing payment...');
    try {
      await API.patch(`/reimbursements/${selectedClaim.id}/mark-as-paid`, payData);
      toast.success(tid, 'Reimbursement marked as paid');
      setShowPayModal(false);
      setPayData({ paymentMode: 'Bank Transfer', bankReference: '', utrNumber: '', remarks: '' });
      fetchTeamApprovals();
      fetchKPIs();
    } catch (err) {
      const error = err as Error;
      toast.error(tid, error.message || 'Payment update failed');
    }
  };

  const handleBulkApproval = async (type: string) => {
    try {
      await API.post(`/reimbursements/bulk-${type}`, { ids: selectedApprovals, remarks: 'Bulk action' });
      toast.success('bulk', `Bulk ${type} successful`);
      setSelectedApprovals([]);
      fetchTeamApprovals();
    } catch (err) {
      toast.error('bulk', 'Bulk operation failed');
    }
  };

  const handleExport = async () => {
    try {
      const params = activeTab === 'my' 
        ? { q: searchTerm, orgView: 'false' }
        : { ...approvalFilters, orgView: 'true' };

      const response = await API.get('/reimbursements/export', {
        params,
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `reimbursements_${activeTab}_export.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  const handleBulkUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      const res = await API.post('/reimbursements/bulk-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setUploadResult(res.data.data);
      fetchClaims();
    } catch (err) {
      console.error('Bulk upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleEditClaim = (claim: ReimbursementClaim) => {
    setFormData({
      id: claim.id,
      clientId: claim.clientId || '',
      projectId: claim.projectId || '',
      jobId: claim.jobId || '',
      category: claim.category,
      amount: claim.amount.toString(),
      date: new Date(claim.date).toISOString().split('T')[0],
      description: claim.description,
      attachments: [] // We don't populate existing files into the file input
    });
    setShowSubmitModal(true);
  };

  const handleDeleteClaim = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this claim?')) return;
    const toastId = toast.loading('Deleting claim...');
    try {
      await API.delete(`/reimbursements/${id}`);
      toast.success(toastId, 'Claim deleted successfully');
      if (activeTab === 'my') {
        fetchClaims();
      } else {
        fetchTeamApprovals();
      }
      fetchKPIs();
      fetchApprovalCharts();
    } catch (err) {
      const error = err as Error;
      toast.error(toastId, error.message || 'Failed to delete claim');
    }
  };

  const handleCreateClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Sanitize and validate amount
    const amount = Number(
      String(formData.amount)
        .replace(/[₹,]/g, "")
        .trim()
    );

    if (isNaN(amount) || amount <= 0) {
      const errorId = `error-${Date.now()}`;
      toast.error(errorId, "Please enter a valid amount greater than zero");
      return;
    }

    const isEdit = !!formData.id;
    const toastId = toast.loading(`${isEdit ? 'Updating' : 'Submitting'} reimbursement claim...`);

    try {
      // Create FormData for file upload
      const submitData = new FormData();
      submitData.append('clientId', formData.clientId);
      submitData.append('projectId', formData.projectId);
      submitData.append('jobId', formData.jobId);
      submitData.append('category', formData.category);
      submitData.append('amount', amount.toString());
      submitData.append('date', formData.date);
      submitData.append('description', formData.description);
      
      // Append attachments
      formData.attachments.forEach((file) => {
        submitData.append(`attachments`, file);
      });

      if (isEdit) {
        await API.patch(`/reimbursements/${formData.id}`, submitData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        await API.post('/reimbursements', submitData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      
      toast.success(toastId, `Reimbursement claim ${isEdit ? 'updated' : 'submitted'} successfully!`);
      setShowSubmitModal(false);
      setFormData({
        clientId: '',
        projectId: '',
        jobId: '',
        category: 'Travel',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        description: '',
        attachments: [],
        id: ''
      });
      setAttachmentPreviews([]);
      if (activeTab === 'my') {
        fetchClaims();
      } else {
        fetchTeamApprovals();
      }
      fetchKPIs();
      fetchApprovalCharts();
    } catch (err) {
      console.error('Failed to submit claim:', err);
      const error = err as { message?: string; response?: { data?: { message?: string } } };
      const errorMessage = error.message || error.response?.data?.message || 'Operation failed.';
      toast.error(toastId, errorMessage);
    }
  };

  // Attachment handling functions
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(file => {
      const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      return validTypes.includes(file.type);
    });

    if (validFiles.length !== files.length) {
      alert('Only PDF, JPG, PNG, and DOC files are allowed.');
    }

    const newAttachments = [...formData.attachments, ...validFiles];
    setFormData({ ...formData, attachments: newAttachments });

    // Create previews for images
    const newPreviews = validFiles.map(file => {
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
      return { file, preview };
    });
    setAttachmentPreviews([...attachmentPreviews, ...newPreviews]);
  };

  const removeAttachment = (index: number) => {
    const newAttachments = formData.attachments.filter((_, i) => i !== index);
    const newPreviews = attachmentPreviews.filter((_, i) => i !== index);
    
    // Revoke object URL for image previews
    if (attachmentPreviews[index]?.preview) {
      URL.revokeObjectURL(attachmentPreviews[index].preview);
    }
    
    setFormData({ ...formData, attachments: newAttachments });
    setAttachmentPreviews(newPreviews);
  };

  // Filter functions for hierarchy
  const filteredProjects = projects.filter(p => p.clientId === formData.clientId);
  const filteredJobs = jobs.filter(j => j.projectId === formData.projectId);



  const filteredApprovalsData = useMemo(() => {
    return approvalsData.filter(item => {
      // 1. Search term match
      const q = approvalFilters.q.trim().toLowerCase();
      const matchesSearch = !q || 
        item.claimId.toLowerCase().includes(q) ||
        item.employee.firstName.toLowerCase().includes(q) ||
        item.employee.lastName.toLowerCase().includes(q) ||
        item.employee.employeeId.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q));

      // 2. Category checklist match
      const matchesCategory = selectedCategoriesTeam.length === 0 || 
        selectedCategoriesTeam.map(c => c.toLowerCase()).includes(item.category.toLowerCase());

      // 3. Employee checklist match
      const matchesEmployee = selectedEmployeesTeam.length === 0 || 
        selectedEmployeesTeam.includes(item.employee.id);

      // 4. Department checklist match
      const matchesDepartment = selectedDepartmentsTeam.length === 0 || 
        (item.employee.department && selectedDepartmentsTeam.includes(item.employee.department));

      return matchesSearch && matchesCategory && matchesEmployee && matchesDepartment;
    });
  }, [approvalsData, approvalFilters.q, selectedCategoriesTeam, selectedEmployeesTeam, selectedDepartmentsTeam]);

  const filteredClaims = useMemo(() => {
    return claims.filter(claim => {
      // Status filter — compare against exact enum values (PENDING_MANAGER, APPROVED, etc.)
      const matchesStatus = selectedStatusesMy.length === 0 || 
        selectedStatusesMy.includes(claim.status);
      
      // Employee filter (if power user)
      const matchesEmployee = !['admin', 'partner', 'owner', 'hr', 'accountant', 'accounts'].includes(userRoleNormalized) ||
        selectedEmployeesMy.length === 0 ||
        selectedEmployeesMy.includes(claim.employee.id);
        
      return matchesStatus && matchesEmployee;
    });
  }, [claims, selectedStatusesMy, selectedEmployeesMy, userRoleNormalized]);

  return (
    <div className="h-full flex flex-col space-y-6 animate-fade-in max-h-[calc(100vh-120px)] overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 flex-none px-4 sm:px-0">
        <div>
          <h1 className="text-xl sm:text-3xl font-extrabold text-secondary-900 tracking-tight">Expense Registry</h1>
          <div className="flex gap-1 p-1 bg-secondary-100/50 backdrop-blur-sm rounded-xl w-fit border border-secondary-100 mt-4">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 flex items-center gap-2 ${
                activeTab === 'dashboard' 
                  ? 'bg-white shadow-sm text-primary-600 ring-1 ring-black/5' 
                  : 'text-secondary-500 hover:text-secondary-700 hover:bg-white/50'
              }`}
            >
              <span>Dashboard</span>
            </button>
            <button 
              onClick={() => setActiveTab('my')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 flex items-center gap-2 ${
                activeTab === 'my' 
                  ? 'bg-white shadow-sm text-primary-600 ring-1 ring-black/5' 
                  : 'text-secondary-500 hover:text-secondary-700 hover:bg-white/50'
              }`}
            >
              <span>My Reimbursements</span>
            </button>
            {['admin', 'partner', 'manager', 'accountant', 'owner', 'hr', 'finance manager', 'accounts'].includes(userRoleNormalized) && (
              <button 
                onClick={() => setActiveTab('approvals')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 flex items-center gap-2 ${
                  activeTab === 'approvals' 
                    ? 'bg-white shadow-sm text-primary-600 ring-1 ring-black/5' 
                    : 'text-secondary-500 hover:text-secondary-700 hover:bg-white/50'
                }`}
              >
                <span>Team Approvals</span>
                {activeTab !== 'approvals' && kpis.totalPending > 0 && (
                  <span className="flex items-center justify-center w-5 h-5 bg-rose-500 text-white text-[10px] font-black rounded-full animate-pulse shadow-sm shadow-rose-200">
                    {kpis.totalPending}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
        {activeTab !== 'dashboard' && (
          <div className="hidden sm:block">
            <ActionBar
              onAdd={activeTab === 'my' ? () => setShowSubmitModal(true) : undefined}
              addLabel="New Requisition"
              onUpload={isPowerUser ? () => setShowBulkModal(true) : undefined}
              onDownload={handleExport}
              showTemplate={false}
            />
          </div>
        )}
      </div>

      {activeTab === 'dashboard' ? (
        /* Dynamic Financial Analytics Dashboard */
        <div className="space-y-6 overflow-y-auto px-4 sm:px-0 custom-scrollbar pb-10 flex-1">

          {/* Metric Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <ApprovalsMetricCard 
              title="Pending Claims" 
              value={kpis?.totalPending || 0} 
              icon={ClockIcon} 
              color="yellow"
            />
            <ApprovalsMetricCard 
              title="Approved Count" 
              value={kpis?.approvedCount || 0} 
              icon={CheckCircleIcon} 
              color="green"
            />
            <ApprovalsMetricCard 
              title="Rejected Count" 
              value={kpis?.rejectedCount || 0} 
              icon={XCircleIcon} 
              color="red"
            />
            <ApprovalsMetricCard 
              title="Pending Amount" 
              value={`₹${(kpis?.pendingAmount || 0).toLocaleString()}`} 
              icon={CurrencyDollarIcon} 
              color="blue"
            />
            <ApprovalsMetricCard 
              title="Approved Amount" 
              value={`₹${(kpis?.approvedAmount || 0).toLocaleString()}`} 
              icon={CurrencyDollarIcon} 
              color="green"
            />
            <ApprovalsMetricCard 
              title="Paid Amount" 
              value={`₹${(kpis?.paidAmount || 0).toLocaleString()}`} 
              icon={CheckCircleIcon} 
              color="blue"
            />
          </div>

          {/* Interactive Trends Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 p-6 border-none shadow-md bg-white rounded-[2rem]">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6">Reimbursement Velocity Trends</h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData?.trendData || []}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#94a3b8'}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#94a3b8'}} />
                    <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                    <Bar dataKey="approved" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={30} name="Approved" />
                    <Bar dataKey="pending" fill="#e2e8f0" radius={[4, 4, 0, 0]} barSize={30} name="Pending" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-6 border-none shadow-md bg-white rounded-[2rem]">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6">Claim Category Split</h3>
              <div className="h-[300px] flex items-center justify-center">
                {chartData?.pieData && chartData.pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData.pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {chartData.pieData.map((_entry: { name: string; value: number }, index: number) => (
                          <Cell key={`cell-${index}`} fill={['#4f46e5', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6'][index % 5]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{borderRadius: '12px', border: 'none'}} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-slate-400 text-xs font-bold uppercase tracking-wider">No claims recorded yet</div>
                )}
              </div>
              {chartData?.pieData && chartData.pieData.length > 0 && (
                <div className="flex flex-wrap justify-center gap-4 mt-4">
                  {chartData.pieData.map((d: { name: string; value: number }, i: number) => (
                    <div key={d.name} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
                      <div 
                        className={`w-2.5 h-2.5 rounded-full ${['bg-indigo-600', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-violet-500'][i % 5]}`} 
                      ></div>
                      {d.name}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      ) : activeTab === 'my' ? (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 flex-none px-4 sm:px-0">
            <Card className="px-3 py-3 sm:px-5 sm:py-4 transition-all hover:-translate-y-1 hover:shadow-md">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center shadow-sm">
                  <ClockIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] sm:text-[10px] font-bold text-secondary-500 uppercase tracking-widest leading-none truncate">Total Submitted</p>
                  <p className="text-lg sm:text-xl font-bold text-secondary-900 leading-none mt-1 sm:mt-1.5 truncate">{kpis.totalSubmitted}</p>
                </div>
              </div>
            </Card>
            <Card className="px-3 py-3 sm:px-5 sm:py-4 transition-all hover:-translate-y-1 hover:shadow-md">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-success-50 text-success-600 flex items-center justify-center shadow-sm">
                  <CheckCircleIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] sm:text-[10px] font-bold text-secondary-500 uppercase tracking-widest leading-none truncate">Approved Value</p>
                  <p className="text-lg sm:text-xl font-bold text-secondary-900 leading-none mt-1 sm:mt-1.5 truncate">₹{kpis.approvedAmount.toLocaleString()}</p>
                </div>
              </div>
            </Card>
            <Card className="px-3 py-3 sm:px-5 sm:py-4 transition-all hover:-translate-y-1 hover:shadow-md">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shadow-sm">
                  <ClockIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] sm:text-[10px] font-bold text-secondary-500 uppercase tracking-widest leading-none truncate">Pending Value</p>
                  <p className="text-lg sm:text-xl font-bold text-secondary-900 leading-none mt-1 sm:mt-1.5 truncate">₹{kpis.pendingAmount.toLocaleString()}</p>
                </div>
              </div>
            </Card>
            <Card className="px-3 py-3 sm:px-5 sm:py-4 transition-all hover:-translate-y-1 hover:shadow-md">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shadow-sm">
                  <XCircleIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] sm:text-[10px] font-bold text-secondary-500 uppercase tracking-widest leading-none truncate">Approval Rate</p>
                  <p className="text-lg sm:text-xl font-bold text-secondary-900 leading-none mt-1 sm:mt-1.5 truncate">{kpis.approvalRate}%</p>
                </div>
              </div>
            </Card>
          </div>

          {/* SaaS-Style Unified Filters and Search Bar */}
          <Card className="flex-1 flex flex-col overflow-hidden shadow-lg border-none bg-white rounded-[2.5rem]">
            <div className="p-4 sm:p-6 border-b border-slate-100 bg-slate-50/20 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
                {/* Search Bar */}
                <div className="relative flex-1 max-w-xs min-w-[200px]">
                  <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Search by ID or employee name..." 
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all shadow-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                {/* Month Selector */}
                <div className="relative flex-shrink-0 group">
                  <select
                    title="Filter by Month"
                    className="appearance-none text-xs min-w-[170px] bg-white border border-slate-200 rounded-xl py-2.5 pl-4 pr-10 outline-none hover:border-indigo-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 transition-all font-bold text-slate-700 shadow-sm cursor-pointer"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                  >
                    {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((name, i) => (
                      <option key={name} value={i + 1}>{name}</option>
                    ))}
                  </select>
                  <ChevronDownIcon className="absolute right-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none transition-colors group-hover:text-indigo-500" />
                </div>

                {/* Year Selector */}
                <div className="relative flex-shrink-0 group">
                  <select
                    title="Filter by Year"
                    className="appearance-none text-xs min-w-[115px] bg-white border border-slate-200 rounded-xl py-2.5 pl-4 pr-10 outline-none hover:border-indigo-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 transition-all font-bold text-slate-700 shadow-sm cursor-pointer"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  >
                    {[2023, 2024, 2025, 2026].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                  <ChevronDownIcon className="absolute right-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none transition-colors group-hover:text-indigo-500" />
                </div>

                {/* Status Dropdown Checklist - uses portal, immune to overflow:hidden */}
                <ChecklistDropdown
                  label="Status"
                  options={[
                    { value: 'PENDING_MANAGER', label: 'Pending (Manager)' },
                    { value: 'MANAGER_APPROVED', label: 'Manager Approved' },
                    { value: 'APPROVED', label: 'Approved' },
                    { value: 'REJECTED', label: 'Rejected' },
                    { value: 'SENT_BACK', label: 'Sent Back' },
                    { value: 'PAID', label: 'Paid' },
                  ]}
                  selectedValues={selectedStatusesMy}
                  onToggle={toggleStatusMy}
                  searchValue={statusSearchMy}
                  onSearchChange={setStatusSearchMy}
                  minWidth={160}
                />

                {/* Employee Dropdown Checklist (Admins/Owners/Partners) - portal */}
                {['admin', 'partner', 'owner', 'hr', 'accountant', 'accounts'].includes(userRoleNormalized) && (
                  <ChecklistDropdown
                    label="Employee"
                    options={employeeOptions.map(emp => ({ value: emp.id, label: `${emp.firstName} ${emp.lastName}` }))}
                    selectedValues={selectedEmployeesMy}
                    onToggle={toggleEmployeeMy}
                    searchValue={empSearchMy}
                    onSearchChange={setEmpSearchMy}
                    minWidth={200}
                  />
                )}

                {/* Clear My Filters */}
                {(searchTerm || selectedStatusesMy.length > 0 || selectedEmployeesMy.length > 0) && (
                  <button 
                    onClick={() => {
                      setSearchTerm('');
                      setSelectedStatusesMy([]);
                      setSelectedEmployeesMy([]);
                      setEmpSearchMy('');
                      setStatusSearchMy('');
                    }} 
                    className="text-rose-500 hover:text-rose-600 font-black text-[10px] uppercase tracking-widest transition-colors flex items-center gap-1.5 focus:outline-none cursor-pointer h-9 px-3 bg-rose-50 hover:bg-rose-100 rounded-xl"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            </div>

            <div className="table-wrapper flex-1">
              <table className="w-full text-left">
                <thead className="bg-secondary-50/50 hidden sm:table-header-group">
                  <tr>
                    <th className="px-6 py-4 text-[10px] font-bold text-secondary-500 uppercase tracking-widest">Requester / ID</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-secondary-500 uppercase tracking-widest">Client</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-secondary-500 uppercase tracking-widest">Project</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-secondary-500 uppercase tracking-widest">Job</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-secondary-500 uppercase tracking-widest">Expense Head</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-secondary-500 uppercase tracking-widest">Amount</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-secondary-500 uppercase tracking-widest">Submission Date</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-secondary-500 uppercase tracking-widest">Status</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-secondary-500 uppercase tracking-widest">Attachments</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-secondary-500 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-secondary-50 sm:bg-white text-sm">
                  {loading ? (
                    Array.from({ length: 6 }).map((_, rowIndex) => (
                      <tr key={rowIndex} className="animate-pulse">
                        {Array.from({ length: 10 }).map((_, colIndex) => (
                          <td key={colIndex} className="px-6 py-4">
                            <div className="h-4 bg-slate-200/60 dark:bg-slate-700/50 rounded-lg w-full" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : filteredClaims.length > 0 ? (
                    filteredClaims.map(claim => (
                      <tr key={claim.id} className="hover:bg-primary-50/20 group transition-colors">
                        <td className="px-6 py-4" data-label="Requester / ID">
                          <div className="flex items-center gap-3">
                            <Avatar name={claim.employee.firstName} size="sm" />
                            <div className="text-left sm:text-left">
                              <p className="text-sm font-bold text-secondary-900 group-hover:text-primary-600 transition-colors uppercase sm:normal-case">{claim.employee.firstName} {claim.employee.lastName}</p>
                              <p className="text-[10px] font-bold text-secondary-400 mt-0.5">{claim.claimId}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right sm:text-left" data-label="Client">
                          <span className="text-sm font-medium text-secondary-700">{claim.client?.name || 'N/A'}</span>
                        </td>
                        <td className="px-6 py-4 text-right sm:text-left" data-label="Project">
                          <span className="text-sm font-medium text-secondary-700">{claim.project?.name || 'N/A'}</span>
                        </td>
                        <td className="px-6 py-4 text-right sm:text-left" data-label="Job">
                          <span className="text-sm font-medium text-secondary-700">{claim.job?.name || 'N/A'}</span>
                        </td>
                        <td className="px-6 py-4 text-right sm:text-left" data-label="Expense Head">
                          <span className="text-[10px] font-black text-secondary-500 bg-secondary-100 px-2 py-0.5 rounded uppercase tracking-tighter">{claim.category}</span>
                        </td>
                        <td className="px-6 py-4 text-right sm:text-left" data-label="Amount">
                          <span className="text-sm font-black text-secondary-900">₹{Number(claim.amount || 0).toLocaleString()}</span>
                        </td>
                        <td className="px-6 py-4 text-right sm:text-left" data-label="Submission Date">
                          <span className="text-sm text-secondary-600">{new Date(claim.date).toLocaleDateString()}</span>
                        </td>
                        <td className="px-6 py-4 justify-end sm:justify-start" data-label="Status">
                          <div className="flex justify-end sm:justify-start">
                            <Badge variant={
                              claim.status === 'APPROVED' ? 'success' : 
                              claim.status === 'REJECTED' ? 'danger' : 
                              claim.status === 'MANAGER_APPROVED' ? 'nitro' : 
                              'warning'
                            }>
                              {claim.status.replace('_', ' ').toUpperCase()}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right sm:text-left" data-label="Attachments">
                          <div className="flex items-center justify-end sm:justify-start gap-1">
                            {claim.attachments && claim.attachments.length > 0 ? (
                              <>
                                <PaperClipIcon className="w-4 h-4 text-secondary-400" />
                                <span className="text-xs text-secondary-600">{claim.attachments.length}</span>
                              </>
                            ) : (
                              <span className="text-xs text-secondary-400">None</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right" data-label="Actions">
                          <div className="flex items-center justify-end gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => { setSelectedClaim(claim); setViewModal(true); }}
                              className="p-1.5 text-secondary-400 hover:text-primary-600 rounded border border-transparent hover:border-secondary-100 hover:bg-white transition-all min-w-[36px] min-h-[36px] flex items-center justify-center"
                              title="View Claim Details"
                              aria-label="View Details"
                            >
                              <EyeIcon className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleEditClaim(claim)}
                              className="p-1.5 text-secondary-400 hover:text-warning-600 rounded border border-transparent hover:border-secondary-100 hover:bg-white transition-all min-w-[36px] min-h-[36px] flex items-center justify-center"
                              title="Edit Claim"
                              aria-label="Edit Claim"
                            >
                              <PencilSquareIcon className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleDeleteClaim(claim.id)}
                              className="p-1.5 text-secondary-400 hover:text-danger-600 rounded border border-transparent hover:border-secondary-100 hover:bg-white transition-all min-w-[36px] min-h-[36px] flex items-center justify-center"
                              title="Delete Claim"
                              aria-label="Delete Claim"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={10} className="py-20 text-center text-secondary-400 font-bold uppercase text-[10px] tracking-widest">Zero reimbursement records found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : activeTab === 'approvals' ? (
        /* Team Approvals View - Clean SaaS-Style Approvals Grid */
        <div className="flex-1 flex flex-col space-y-6 overflow-hidden px-4 sm:px-0">
          <Card className="flex-1 flex flex-col overflow-hidden border-none shadow-xl bg-white rounded-[2.5rem]">
            {/* SaaS Table Headers & Sub Tabs */}
            <div className="border-b border-slate-100">
              <div className="flex flex-wrap border-b border-slate-100 px-6 pt-4 bg-slate-50/20">
                {[
                  { id: 'pending', label: 'Pending Approvals' },
                  { id: 'approved', label: 'Approved Requests' },
                  { id: 'rejected', label: 'Rejected Requests' },
                  { id: 'paid', label: 'Payment Completed' },
                  { id: 'all', label: 'All Requests' },
                  { id: 'logs', label: 'Audit Logs' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => { setSubTab(tab.id as 'pending' | 'approved' | 'rejected' | 'paid' | 'all' | 'logs'); setSelectedApprovals([]); }}
                    className={`px-5 py-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 outline-none cursor-pointer ${
                      subTab === tab.id
                        ? 'border-indigo-600 text-indigo-600 font-black'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* SaaS Table Toolbar & Filter Panel */}
              <div className="p-4 sm:p-6 bg-slate-50/40 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 flex-1">
                  <div className="relative flex-1 max-w-xs min-w-[200px]">
                    <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Search requests..." 
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all shadow-sm"
                      value={approvalFilters.q}
                      onChange={(e) => setApprovalFilters({...approvalFilters, q: e.target.value})}
                    />
                  </div>
                  {/* Category Dropdown Checklist - portal */}
                  <ChecklistDropdown
                    label="Category"
                    options={[
                      { value: 'Travel', label: 'Travel' },
                      { value: 'Food', label: 'Food' },
                      { value: 'Meals', label: 'Meals' },
                      { value: 'Accommodation', label: 'Accommodation' },
                      { value: 'Office Supplies', label: 'Office Supplies' },
                      { value: 'Other', label: 'Other' },
                    ]}
                    selectedValues={selectedCategoriesTeam}
                    onToggle={toggleCategoryTeam}
                    searchValue={catSearchTeam}
                    onSearchChange={setCatSearchTeam}
                    minWidth={160}
                  />

                  {/* Employee Dropdown Checklist - portal */}
                  <ChecklistDropdown
                    label="Employee"
                    options={employeeOptions.map(emp => ({ value: emp.id, label: `${emp.firstName} ${emp.lastName}` }))}
                    selectedValues={selectedEmployeesTeam}
                    onToggle={toggleEmployeeTeam}
                    searchValue={empSearchTeam}
                    onSearchChange={setEmpSearchTeam}
                    minWidth={200}
                  />

                  {/* Department Dropdown Checklist - portal */}
                  <ChecklistDropdown
                    label="Department"
                    options={Array.from(new Set(employeeOptions.map(e => e.department).filter(Boolean))).map(d => ({ value: d as string, label: d as string }))}
                    selectedValues={selectedDepartmentsTeam}
                    onToggle={toggleDepartmentTeam}
                    searchValue={deptSearchTeam}
                    onSearchChange={setDeptSearchTeam}
                    minWidth={180}
                  />

                  {/* Clear Team Filters */}
                  {(approvalFilters.q || selectedCategoriesTeam.length > 0 || selectedEmployeesTeam.length > 0 || selectedDepartmentsTeam.length > 0) && (
                    <button 
                      onClick={() => {
                        setApprovalFilters({ ...approvalFilters, q: '' });
                        setSelectedCategoriesTeam([]);
                        setSelectedEmployeesTeam([]);
                        setSelectedDepartmentsTeam([]);
                        setEmpSearchTeam('');
                        setDeptSearchTeam('');
                        setCatSearchTeam('');
                      }} 
                      className="text-rose-500 hover:text-rose-600 font-black text-[10px] uppercase tracking-widest transition-colors flex items-center gap-1.5 focus:outline-none cursor-pointer h-9 px-3 bg-rose-50 hover:bg-rose-100 rounded-xl"
                    >
                      Clear Filters
                    </button>
                  )}
                </div>

                {selectedApprovals.length > 0 && subTab === 'pending' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-500 mr-2">{selectedApprovals.length} Selected</span>
                    <Button variant="primary" className="rounded-xl px-4 text-[10px] font-black tracking-widest uppercase bg-indigo-600 h-10" onClick={() => handleBulkApproval('approve')}>Bulk Approve</Button>
                    <Button variant="danger" className="rounded-xl px-4 text-[10px] font-black tracking-widest uppercase bg-rose-600 h-10" onClick={() => handleBulkApproval('reject')}>Bulk Reject</Button>
                  </div>
                )}
              </div>
            </div>

            {/* SaaS Data Table Wrapper */}
            <div className="table-wrapper flex-1">
              {subTab === 'logs' ? (
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Time</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Employee</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Claim ID</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Action</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Performed By</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm">
                    {logsLoading ? (
                      Array.from({ length: 5 }).map((_, rowIndex) => (
                        <tr key={rowIndex} className="animate-pulse">
                          {Array.from({ length: 6 }).map((_, colIndex) => (
                            <td key={colIndex} className="px-6 py-4">
                              <div className="h-4 bg-slate-200/60 dark:bg-slate-700/50 rounded-lg w-full" />
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : logsData.length === 0 ? (
                      <tr><td colSpan={6} className="px-6 py-16 text-center text-slate-400 font-black uppercase text-[10px] tracking-widest">No audit logs found</td></tr>
                    ) : (
                      logsData.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 text-xs text-slate-500 font-bold">
                            {format(new Date(log.performedAt), 'MMM dd, HH:mm:ss')}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-700">{log.reimbursement?.employee?.firstName} {log.reimbursement?.employee?.lastName}</span>
                              <span className="text-[10px] text-slate-400 font-bold">({log.reimbursement?.employee?.employeeId})</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 font-black text-xs text-indigo-600">
                            {log.reimbursement?.claimId}
                          </td>
                          <td className="px-6 py-4">
                            <Badge variant={
                              log.action === 'approved' ? 'success' : 
                              log.action === 'rejected' ? 'danger' : 
                              log.action === 'paid' ? 'nitro' : 
                              'primary'
                            }>
                              {log.action.toUpperCase()}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-xs font-black text-slate-700">
                            {log.performedBy?.firstName} {log.performedBy?.lastName}
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-500 font-medium italic">
                            {log.remarks || '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="px-6 py-4 w-10">
                        <input 
                          type="checkbox" 
                          title="Select All"
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" 
                          checked={selectedApprovals.length === filteredApprovalsData.length && filteredApprovalsData.length > 0}
                          onChange={() => setSelectedApprovals(selectedApprovals.length === filteredApprovalsData.length ? [] : filteredApprovalsData.map(d => d.id))}
                        />
                      </th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Employee</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Claim Details</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount</th>
                      {subTab === 'pending' && <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Level</th>}
                      {subTab === 'approved' && <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Approved By</th>}
                      {subTab === 'approved' && <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Approved At</th>}
                      {subTab === 'rejected' && <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Rejected At</th>}
                      {subTab === 'paid' && <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Paid At</th>}
                      {subTab === 'paid' && <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">UTR Number</th>}
                      {subTab === 'all' && <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>}
                      {subTab === 'all' && <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Last Updated</th>}
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm">
                    {approvalsLoading ? (
                      Array.from({ length: 5 }).map((_, rowIndex) => (
                        <tr key={rowIndex} className="animate-pulse">
                          {Array.from({ length: 8 }).map((_, colIndex) => (
                            <td key={colIndex} className="px-6 py-4">
                              <div className="h-4 bg-slate-200/60 dark:bg-slate-700/50 rounded-lg w-full" />
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : filteredApprovalsData.length === 0 ? (
                      <tr><td colSpan={8} className="px-6 py-20 text-center text-slate-400 font-black uppercase text-[10px] tracking-widest">No pending approvals found</td></tr>
                    ) : (
                      filteredApprovalsData.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-6 py-4">
                            <input 
                              type="checkbox" 
                              title="Select Row"
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" 
                              checked={selectedApprovals.includes(item.id)}
                              onChange={() => setSelectedApprovals(prev => prev.includes(item.id) ? prev.filter(i => i !== item.id) : [...prev, item.id])}
                            />
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-black text-xs">
                                {item.employee.firstName[0]}{item.employee.lastName[0]}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-slate-700">{item.employee.firstName} {item.employee.lastName}</p>
                                <p className="text-[10px] font-bold text-slate-400">{item.employee.employeeId}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col text-left">
                              <span className="font-black text-slate-900 text-xs">{item.claimId}</span>
                              <span className="text-[9px] text-slate-400 font-black uppercase mt-0.5">{item.category} • {format(new Date(item.date), 'MMM dd')}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm font-black text-slate-900">₹{(item.amount || 0).toLocaleString()}</span>
                          </td>
                          {subTab === 'pending' && (
                            <td className="px-6 py-4">
                              <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded uppercase tracking-wider">
                                {item.status === 'PENDING_MANAGER' ? 'L1: Manager' : item.status === 'MANAGER_APPROVED' ? 'L2: Partner' : 'Finalized'}
                              </span>
                            </td>
                          )}
                          {subTab === 'approved' && (
                            <td className="px-6 py-4">
                              <span className="text-xs font-bold text-slate-700">
                                {item.partnerApprover ? `${item.partnerApprover.firstName} ${item.partnerApprover.lastName}` : 'N/A'}
                              </span>
                            </td>
                          )}
                          {subTab === 'approved' && (
                            <td className="px-6 py-4">
                              <span className="text-xs text-slate-500 font-bold">
                                {item.partnerApprovedAt ? format(new Date(item.partnerApprovedAt), 'MMM dd, yyyy') : 'N/A'}
                              </span>
                            </td>
                          )}
                          {subTab === 'rejected' && (
                            <td className="px-6 py-4">
                              <span className="text-xs text-slate-500 font-bold">
                                {item.rejectedAt ? format(new Date(item.rejectedAt), 'MMM dd, yyyy') : 'N/A'}
                              </span>
                            </td>
                          )}
                          {subTab === 'paid' && (
                            <td className="px-6 py-4">
                              <span className="text-xs text-slate-500 font-bold">
                                {item.paidAt ? format(new Date(item.paidAt), 'MMM dd, yyyy') : 'N/A'}
                              </span>
                            </td>
                          )}
                          {subTab === 'paid' && (
                            <td className="px-6 py-4">
                              <span className="text-xs font-mono font-bold text-slate-700">
                                {item.utrNumber || 'N/A'}
                              </span>
                            </td>
                          )}
                          {subTab === 'all' && (
                            <td className="px-6 py-4">
                              <Badge variant={
                                item.status === 'APPROVED' ? 'success' : 
                                item.status === 'REJECTED' ? 'danger' : 
                                item.status === 'MANAGER_APPROVED' ? 'nitro' : 
                                'warning'
                              }>
                                {item.status.replace('_', ' ').toUpperCase()}
                              </Badge>
                            </td>
                          )}
                          {subTab === 'all' && (
                            <td className="px-6 py-4">
                              <span className="text-xs text-slate-500 font-bold">
                                {item.updatedAt ? format(new Date(item.updatedAt), 'MMM dd HH:mm') : 'N/A'}
                              </span>
                            </td>
                          )}
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => { setSelectedClaim(item); setViewModal(true); }}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-xl hover:bg-indigo-50 transition-colors"
                                title="View Details"
                              >
                                <EyeIcon className="w-5 h-5" />
                              </button>
                              {['PENDING_MANAGER', 'MANAGER_APPROVED'].includes(item.status) && (
                                <>
                                  <button 
                                    onClick={() => setActionModal({ open: true, type: 'approve', id: item.id })}
                                    className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-xl hover:bg-emerald-50 transition-colors"
                                    title="Approve"
                                  >
                                    <CheckCircleIcon className="w-5 h-5" />
                                  </button>
                                  <button 
                                    onClick={() => setActionModal({ open: true, type: 'reject', id: item.id })}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 transition-colors"
                                    title="Reject"
                                  >
                                    <XCircleIcon className="w-5 h-5" />
                                  </button>
                                  <button 
                                    onClick={() => setActionModal({ open: true, type: 'send-back', id: item.id })}
                                    className="p-1.5 text-slate-400 hover:text-amber-600 rounded-xl hover:bg-amber-50 transition-colors"
                                    title="Send Back for Correction"
                                  >
                                    <ArrowPathIcon className="w-5 h-5" />
                                  </button>
                                </>
                              )}
                              {item.status === 'APPROVED' && item.paymentStatus !== 'Paid' && isPowerUser && (
                                <button 
                                  onClick={() => { setSelectedClaim(item); setShowPayModal(true); }}
                                  className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-xl hover:bg-indigo-50 transition-colors"
                                  title="Mark as Paid"
                                >
                                  <CurrencyDollarIcon className="w-5 h-5" />
                                </button>
                              )}
                              <button 
                                onClick={() => handleEditClaim(item)}
                                className="p-1.5 text-slate-400 hover:text-warning-600 rounded-xl hover:bg-amber-50 transition-colors"
                                title="Edit Claim"
                              >
                                <PencilSquareIcon className="w-5 h-5" />
                              </button>
                              <button 
                                onClick={() => handleDeleteClaim(item.id)}
                                className="p-1.5 text-slate-400 hover:text-danger-600 rounded-xl hover:bg-rose-50 transition-colors"
                                title="Delete Claim"
                              >
                                <TrashIcon className="w-5 h-5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </div>
      ) : null}

      {/* Modals ... existing modals */}
      <Modal
        isOpen={showPayModal}
        onClose={() => setShowPayModal(false)}
        title="Mark as Paid"
        size="sm"
      >
        <form onSubmit={handleMarkAsPaid} className="space-y-4">
          <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 mb-4">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Payable Amount</span>
              <span className="text-xl font-black text-emerald-700">₹{selectedClaim?.amount?.toLocaleString()}</span>
            </div>
            <p className="text-[10px] font-medium text-emerald-600 truncate">Employee: {selectedClaim?.employee?.firstName} {selectedClaim?.employee?.lastName}</p>
          </div>
          
          <Select
            label="Payment Mode"
            value={payData.paymentMode}
            onChange={(e) => setPayData({...payData, paymentMode: e.target.value})}
            required
          >
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="Cash">Cash</option>
            <option value="Cheque">Cheque</option>
            <option value="UPI">UPI</option>
          </Select>

          <Input 
            label="Reference / Bank Ref"
            placeholder="e.g. HDFC-12345"
            value={payData.bankReference}
            onChange={(e) => setPayData({...payData, bankReference: e.target.value})}
          />

          <Input 
            label="UTR Number"
            placeholder="e.g. UTR987654321"
            value={payData.utrNumber}
            onChange={(e) => setPayData({...payData, utrNumber: e.target.value})}
          />

          <Input 
            label="Accountant Remarks"
            multiline
            rows={2}
            placeholder="Optional notes for accounting..."
            value={payData.remarks}
            onChange={(e) => setPayData({...payData, remarks: e.target.value})}
          />

          <div className="flex gap-3 pt-4">
            <Button variant="secondary" fullWidth onClick={() => setShowPayModal(false)}>Cancel</Button>
            <Button variant="primary" fullWidth type="submit">Mark as Paid</Button>
          </div>
        </form>
      </Modal>

      {/* Rest of modals (Submit, Bulk, View, Decision) */}
      <Modal
        isOpen={showSubmitModal}
        onClose={() => {
          setShowSubmitModal(false);
          // Clear attachment previews
          attachmentPreviews.forEach(preview => {
            if (preview.preview) {
              URL.revokeObjectURL(preview.preview);
            }
          });
          setAttachmentPreviews([]);
          setFormData({
            clientId: '',
            projectId: '',
            jobId: '',
            category: 'Travel',
            amount: '',
            date: new Date().toISOString().split('T')[0],
            description: '',
            attachments: [],
            id: ''
          });
        }}
        title={formData.id ? "Edit Reimbursement Request" : "Submit Reimbursement Request"}
        size="lg"
      >
        <form onSubmit={handleCreateClaim} className="space-y-6">
          {/* Client, Project, Job Fields */}
          <div className="space-y-4">
            <Select
              label="Client Name"
              value={formData.clientId}
              onChange={(e) => setFormData({ ...formData, clientId: e.target.value, projectId: '', jobId: '' })}
              required
              className="rounded-lg border-gray-200"
            >
              <option value="">Select client...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            
            <Select
              label="Project Name"
              value={formData.projectId}
              onChange={(e) => setFormData({ ...formData, projectId: e.target.value, jobId: '' })}
              required
              disabled={!formData.clientId}
              className="rounded-lg border-gray-200"
            >
              <option value="">Select project...</option>
              {filteredProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            
            <Select
              label="Job Name"
              value={formData.jobId}
              onChange={(e) => setFormData({ ...formData, jobId: e.target.value })}
              required
              disabled={!formData.projectId}
              className="rounded-lg border-gray-200"
            >
              <option value="">Select job...</option>
              {filteredJobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
            </Select>
          </div>

          {/* Expense Head and Amount */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Expense Head"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              required
              className="rounded-lg border-gray-200"
            >
              <option value="Travel">Travel</option>
              <option value="Food">Food</option>
              <option value="Accommodation">Accommodation</option>
              <option value="Office Supplies">Office Supplies</option>
              <option value="Other">Other</option>
            </Select>
            
            <Input
              label="Amount (₹)"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              required
              className="rounded-lg border-gray-200"
            />
          </div>

          {/* Description */}
          <div>
            <Input
              label="Description"
              placeholder="Describe the expense details..."
              multiline
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
              className="rounded-lg border-gray-200"
            />
          </div>

          {/* Attachments */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Attachments</label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
              <input
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <DocumentArrowUpIcon className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-2 text-sm text-gray-600">
                  Click to upload or drag and drop
                </p>
                <p className="text-xs text-gray-500">
                  PDF, JPG, PNG, DOC up to 10MB each
                </p>
              </label>
            </div>

            {/* Attachment Previews */}
            {attachmentPreviews.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium text-gray-700">Uploaded Files:</p>
                {attachmentPreviews.map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      {item.preview ? (
                        <img src={item.preview} alt={item.file.name} className="w-10 h-10 object-cover rounded" />
                      ) : (
                        <PaperClipIcon className="w-10 h-10 text-gray-400" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-gray-900">{item.file.name}</p>
                        <p className="text-xs text-gray-500">{(item.file.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(index)}
                      className="p-1 text-red-500 hover:text-red-700 transition-colors"
                      title="Remove Attachment"
                      aria-label="Remove Attachment"
                    >
                      <XMarkIcon className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowSubmitModal(false);
                // Clear attachment previews
                attachmentPreviews.forEach(preview => {
                  if (preview.preview) {
                    URL.revokeObjectURL(preview.preview);
                  }
                });
                setAttachmentPreviews([]);
              }}
              className="px-6 py-2"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="px-6 py-2"
            >
              Submit
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={showBulkModal}
        onClose={() => {
          setShowBulkModal(false);
          setUploadResult(null);
          setSelectedFile(null);
        }}
        title="Bulk Reimbursement Import"
        size="lg"
      >
        <div className="space-y-4 pt-4">
          {!uploadResult ? (
            <div className="space-y-4">
              <div className="p-4 bg-primary-50 rounded-lg flex items-start gap-3">
                <DocumentArrowUpIcon className="w-5 h-5 text-primary-600 mt-0.5" />
                <div className="text-sm text-primary-800">
                  <p className="font-bold mb-1">Import Guidelines:</p>
                  <ul className="list-disc ml-4 space-y-1">
                    <li>Required columns: <strong>employeeName, clientName, projectName, jobName, Amount, Date</strong></li>
                    <li>Optional: category, description</li>
                    <li>Ensure Master data exists before importing.</li>
                  </ul>
                </div>
              </div>
              <input
                type="file"
                accept=".xlsx"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="w-full p-3 border-2 border-dashed border-primary-200 rounded-xl"
                title="Select Reimbursement Excel File"
                aria-label="Upload Reimbursement Template"
              />
              <div className="flex gap-4">
                <Button variant="secondary" fullWidth onClick={() => setShowBulkModal(false)}>Cancel</Button>
                <Button 
                  variant="primary" 
                  fullWidth 
                  onClick={handleBulkUpload}
                  disabled={!selectedFile || uploading}
                >
                  {uploading ? 'Processing...' : 'Start Import'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircleIcon className="w-5 h-5 text-emerald-600" />
                    <span className="text-xs font-bold text-emerald-800 uppercase">Success</span>
                  </div>
                  <p className="text-2xl font-bold text-emerald-700">{uploadResult.successCount}</p>
                </div>
                <div className="p-4 bg-rose-50 rounded-xl border border-rose-100">
                  <div className="flex items-center gap-2 mb-1">
                    <ExclamationTriangleIcon className="w-5 h-5 text-rose-600" />
                    <span className="text-xs font-bold text-rose-800 uppercase">Errors</span>
                  </div>
                  <p className="text-2xl font-bold text-rose-700">{uploadResult.errors.length}</p>
                </div>
              </div>

              {uploadResult.errors.length > 0 && (
                <div className="max-h-40 overflow-y-auto p-3 bg-secondary-50 rounded-lg border border-secondary-200">
                  {uploadResult.errors.map((err: { error: string }, i: number) => (
                    <p key={i} className="text-xs text-rose-600 mb-1 leading-tight">
                      <strong>Row {i + 1}:</strong> {err.error}
                    </p>
                  ))}
                </div>
              )}

              <Button variant="primary" fullWidth onClick={() => {
                setShowBulkModal(false);
                setUploadResult(null);
                setSelectedFile(null);
              }}>Done</Button>
            </div>
          )}
        </div>
      </Modal>

      <FAB
        onClick={() => setShowSubmitModal(true)}
        label="New Requisition"
      />
      <Modal 
        isOpen={viewModal} 
        onClose={() => setViewModal(false)}
        title="Reimbursement Details"
        size="lg"
      >
        {selectedClaim && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-sm text-blue-600">
                    <CurrencyDollarIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Amount</p>
                    <p className="text-2xl font-black text-slate-900 mt-1">₹{(selectedClaim.amount || 0).toLocaleString()}</p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <DetailItem label="Claim ID" value={selectedClaim.claimId} />
                  <DetailItem label="Category" value={selectedClaim.category} />
                  <DetailItem label="Date" value={format(new Date(selectedClaim.date), 'MMMM dd, yyyy')} />
                  <DetailItem label="Client" value={selectedClaim.client?.name || 'N/A'} />
                  <DetailItem label="Project" value={selectedClaim.project?.name || 'N/A'} />
                </div>

                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Description</p>
                  <p className="text-sm text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-100 italic">"{selectedClaim.description || 'No description'}"</p>
                </div>

                {selectedClaim.attachments && selectedClaim.attachments.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Attachments ({selectedClaim.attachments.length})</p>
                    <div className="space-y-2">
                      {selectedClaim.attachments.map((file: string, i: number) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-blue-50/50 rounded-xl border border-blue-100/50">
                          <div className="flex items-center gap-3">
                            <PaperClipIcon className="w-4 h-4 text-blue-500" />
                            <span className="text-xs font-bold text-slate-700 truncate max-w-[150px]">{file}</span>
                          </div>
                          <button 
                            className="p-1 text-blue-600 hover:text-blue-800 transition-colors"
                            onClick={() => window.open(`${import.meta.env.VITE_API_URL}/uploads/${file}`, '_blank')}
                            title="Download Attachment"
                            aria-label="Download Attachment"
                          >
                            <ArrowDownTrayIcon className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Approval History</p>
                <div className="space-y-4 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                  {selectedClaim.logs?.map((log, idx: number) => (
                    <div key={idx} className="relative pl-8">
                      <div className={`absolute left-0 top-1 w-4 h-4 rounded-full border-2 border-white shadow-sm ${log.action === 'approved' ? 'bg-emerald-500' : log.action === 'rejected' ? 'bg-rose-500' : log.action === 'paid' ? 'bg-indigo-500' : 'bg-blue-500'}`}></div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-800 capitalize">{log.action.replace('_', ' ')}</span>
                        <span className="text-[10px] text-slate-400 font-medium">by {log.performedBy?.firstName} • {format(new Date(log.performedAt), 'MMM dd, HH:mm')}</span>
                        {log.remarks && <p className="text-xs text-slate-500 mt-1 bg-slate-50/50 p-2 rounded-lg italic">"{log.remarks}"</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-6 border-t flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setViewModal(false)}>Close</Button>
              {(selectedClaim.status.includes('PENDING') || selectedClaim.status.includes('MANAGER_APPROVED')) && (activeTab !== 'my') ? (
                <>
                  <Button variant="premium" onClick={() => { setViewModal(false); setActionModal({ open: true, type: 'send-back', id: selectedClaim.id }); }}>Send Back</Button>
                  <Button variant="danger" onClick={() => { setViewModal(false); setActionModal({ open: true, type: 'reject', id: selectedClaim.id }); }}>Reject</Button>
                  <Button variant="primary" onClick={() => { setViewModal(false); setActionModal({ open: true, type: 'approve', id: selectedClaim.id }); }}>
                    {selectedClaim.status === 'PENDING_MANAGER' ? 'Manager Approve' : 'Final Approve'}
                  </Button>
                </>
              ) : null}
              {selectedClaim.status === 'APPROVED' && selectedClaim.paymentStatus !== 'Paid' && isPowerUser && (
                <Button variant="primary" onClick={() => { setViewModal(false); setShowPayModal(true); }}>Mark as Paid</Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={actionModal.open}
        onClose={() => setActionModal({ ...actionModal, open: false })}
        title={actionModal.type === 'approve' ? 'Approve Request' : 'Reject Request'}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Please provide optional remarks for this {actionModal.type} action.</p>
          <textarea 
            className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-4 focus:ring-blue-500/10 outline-none h-32 font-medium"
            placeholder="Enter remarks here..."
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setActionModal({ ...actionModal, open: false })}>Cancel</Button>
            <Button 
              variant={actionModal.type === 'approve' ? 'primary' : 'danger'} 
              onClick={() => handleApprovalAction(actionModal.id!, actionModal.type)}
            >
              Confirm {actionModal.type}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Reimbursement;
