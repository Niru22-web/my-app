import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import API from '../api';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../contexts/PermissionsContext';
import {
    PencilSquareIcon,
    TrashIcon,
    ShieldCheckIcon,
    ClockIcon,
    CurrencyDollarIcon,
    ListBulletIcon
} from '@heroicons/react/24/outline';

// UI Components
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import StatusBadge from '../components/ui/StatusBadge';
import StatusToggle from '../components/ui/StatusToggle';
import Modal from '../components/ui/Modal';
import Select from '../components/ui/Select';
import Avatar from '../components/ui/Avatar';
import { Skeleton } from '../components/ui/Skeleton';
import TableSkeleton from '../components/ui/TableSkeleton';
import TableToolbar from '../components/ui/TableToolbar';
import MultiSelect from '../components/ui/MultiSelect';
import ActionBar from '../components/ui/ActionBar';
import { DocumentArrowUpIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface Job {
    id: string;
    jobId: string;
    name: string;
    description: string;
    status: string;
    startDate?: string;
    endDate?: string;
    billable: boolean;
    loggedHours?: number;
    project: {
        id: string;
        name: string;
        client: { id: string, name: string };
    };
    users: Array<{ employee: { id: string, firstName: string, lastName: string } }>;
}

const Jobs: React.FC = () => {
    const { user } = useAuth();
    const { hasPermission } = usePermissions();
    const [jobs, setJobs] = useState<Job[]>([]);
    const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
    const [projects, setProjects] = useState<Array<{ id: string; name: string; clientId: string }>>([]);
    const [allEmployees, setAllEmployees] = useState<Array<{ id: string; firstName: string; lastName: string; employeeId: string }>>([]);
    const [filteredProjects, setFilteredProjects] = useState<Array<{ id: string; name: string; clientId: string }>>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingJob, setEditingJob] = useState<Job | null>(null);
    const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
    const [selectMode, setSelectMode] = useState(false);

    // Advanced Filter states
    const [statusFilter, setStatusFilter] = useState<string[]>([]);
    const [billableFilter, setBillableFilter] = useState<string[]>([]);
    const [clientFilter, setClientFilter] = useState<string[]>([]);
    const [projectFilter, setProjectFilter] = useState<string[]>([]);

    // Bulk Upload states
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploadResult, setUploadResult] = useState<{ successCount: number; duplicateCount: number; errors: Array<{ error: string }> } | null>(null);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        status: 'Started',
        startDate: '',
        endDate: '',
        billable: 'Billable',
        projectId: '',
        clientId: '',
        assignedEmployees: [] as string[]
    });

    const isManager = user?.role === 'Manager' || user?.role === 'Admin' || user?.role === 'manager' || user?.role === 'admin' || user?.role === 'IT' || user?.role === 'it';

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            setSelectedJobIds([]); // Clear selection when data is re-fetched/filtered
            const params: Record<string, string | undefined> = {
                q: searchTerm || ""
            };

            const [jobsRes, clientsRes, projectsRes, employeesRes] = await Promise.all([
                API.get('/jobs', { params }),
                API.get('/clients?all=true'),
                API.get('/projects'),
                API.get('/employees?all=true')
            ]);

            const jobsArr = jobsRes.data?.data || jobsRes.data || [];
            const clientsArr = clientsRes.data?.data || clientsRes.data || [];
            const projectsArr = projectsRes.data?.data || projectsRes.data || [];
            const employeesArr = employeesRes.data?.data || employeesRes.data || [];

            setJobs(Array.isArray(jobsArr) ? jobsArr : []);
            setClients(Array.isArray(clientsArr) ? clientsArr : []);
            setProjects(Array.isArray(projectsArr) ? projectsArr : []);
            setAllEmployees(Array.isArray(employeesArr) ? employeesArr : []);
        } catch (err) {
            console.error('Failed to fetch jobs data:', err);
            const errorMsg = (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'System connectivity failure. Unable to retrieve job masters.';
            setError(errorMsg);
            setJobs([]);
        } finally {
            setLoading(false);
        }
    }, [searchTerm]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        if (formData.clientId) {
            setFilteredProjects(projects.filter(p => p.clientId === formData.clientId));
            setFormData(prev => ({ ...prev, projectId: '' }));
        } else {
            setFilteredProjects([]);
        }
    }, [formData.clientId, projects]);

    const handleCreateJob = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!hasPermission('jobs', 'canCreate')) {
            alert('You do not have permission to configure jobs.');
            return;
        }

        if (!formData.name || !formData.projectId || !formData.status) {
            alert('Job Name, Project, and Status are mandatory.');
            return;
        }

        try {
            const jobData = {
                ...formData,
                billable: formData.billable === 'Billable',
                startDate: formData.startDate || null,
                endDate: formData.endDate || null
            };
            await API.post('/jobs', jobData);
            setShowAddModal(false);
            setFormData({
                name: '',
                description: '',
                status: 'Started',
                startDate: '',
                endDate: '',
                billable: 'Billable',
                projectId: '',
                clientId: '',
                assignedEmployees: []
            });
            fetchData();
        } catch (err) {
            console.error('Failed to create job:', err);
            const errCast = err as { response?: { data?: { error?: string } }; message?: string };
            const errorMessage = errCast.response?.data?.error || errCast.message || 'Error creating job record.';
            alert(`Error: ${errorMessage}`);
        }
    };

    const handleEditJob = (job: Job) => {
        if (!hasPermission('jobs', 'canEdit')) {
            alert('You do not have permission to modify jobs.');
            return;
        }
        setEditingJob(job);
        setFormData({
            name: job.name,
            description: job.description,
            status: job.status,
            startDate: job.startDate || '',
            endDate: job.endDate || '',
            billable: job.billable ? 'Billable' : 'Non-Billable',
            projectId: job.project.id,
            clientId: job.project.client.id,
            assignedEmployees: job.users?.map(u => u.employee.id) || []
        });
        setShowEditModal(true);
    };

    const handleUpdateJob = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!hasPermission('jobs', 'canEdit') || !editingJob) {
            alert('You do not have permission to update jobs.');
            return;
        }

        if (!formData.name || !formData.projectId || !formData.status) {
            alert('Job Name, Project, and Status are mandatory.');
            return;
        }

        try {
            const jobData = {
                ...formData,
                billable: formData.billable === 'Billable',
                startDate: formData.startDate || null,
                endDate: formData.endDate || null
            };
            await API.put(`/jobs/${editingJob.id}`, jobData);
            setShowEditModal(false);
            setEditingJob(null);
            setFormData({
                name: '',
                description: '',
                status: 'Started',
                startDate: '',
                endDate: '',
                billable: 'Billable',
                projectId: '',
                clientId: '',
                assignedEmployees: []
            });
            fetchData();
        } catch (err) {
            console.error('Failed to update job:', err);
            alert('Error updating job record. Please try again.');
        }
    };

    const isAdmin = user?.role?.toLowerCase() === 'admin' || user?.role?.toLowerCase() === 'it';

    const handleDeleteJob = async (id: string) => {
        if (!isAdmin && !hasPermission('jobs', 'canDelete')) {
            alert('Security Restriction: Only administrators or authorized users can delete job masters.');
            return;
        }

        if (window.confirm('CRITICAL ACTION: Are you sure you want to permanently delete this job master and all associated timelogs? This action cannot be undone.')) {
            try {
                await API.delete(`/jobs/${id}`);
                fetchData();
            } catch (err) {
                console.error('Failed to delete job:', err);
                const errCast = err as { response?: { status?: number; data?: { error?: string } }; message?: string };
                const status = errCast.response?.status;
                const errorMsg = errCast.response?.data?.error || errCast.message;

                if (status === 403) {
                    alert(`Unauthorized (403): ${errorMsg || 'You do not have permission to delete this job.'}`);
                } else if (status === 404) {
                    alert(`Not Found (404): The job record may have already been deleted.`);
                } else if (status === 400) {
                    alert(`Invalid Request (400): ${errorMsg || 'The job ID provided is malformed or invalid.'}`);
                } else {
                    alert(`System Error: ${errorMsg || 'Failed to delete job record. Please contact support.'}`);
                }
            }
        }
    };

    const handleBulkDeleteJobs = async () => {
        if (!isAdmin && !hasPermission('jobs', 'canDelete')) {
            alert('Security Restriction: Only administrators or authorized users can delete job masters.');
            return;
        }

        const confirmMessage = `CRITICAL ACTION: Are you sure you want to permanently delete the ${selectedJobIds.length} selected job(s) and all associated timelogs? This action cannot be undone.`;
        if (window.confirm(confirmMessage)) {
            setLoading(true);
            let successCount = 0;
            let failCount = 0;

            for (const id of selectedJobIds) {
                try {
                    await API.delete(`/jobs/${id}`);
                    successCount++;
                } catch (err) {
                    console.error(`Failed to delete job ${id}:`, err);
                    failCount++;
                }
            }

            setLoading(false);
            setSelectedJobIds([]);
            fetchData();

            if (failCount === 0) {
                alert(`Successfully deleted all ${successCount} selected job(s).`);
            } else {
                alert(`Completed bulk deletion: ${successCount} succeeded, ${failCount} failed. (Note: Jobs with active timelogs or expenses cannot be deleted).`);
            }
        }
    };

    const handleExport = async () => {
        try {
            const params: Record<string, string | boolean | undefined> = {
                q: searchTerm,
            };
            if (statusFilter.length > 0) params.status = statusFilter.join(',');
            if (clientFilter.length > 0) params.clientId = clientFilter.join(',');
            if (projectFilter.length > 0) params.projectId = projectFilter.join(',');
            if (billableFilter.length === 1) params.billable = billableFilter[0] === 'true';

            const response = await API.get('/jobs/export', {
                params,
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'jobs_export.xlsx');
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) {
            console.error('Export failed:', err);
        }
    };

    const downloadTemplate = async () => {
        try {
            const response = await API.get('/jobs/template/download', {
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'job_template.xlsx');
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) {
            console.error('Template download failed:', err);
        }
    };

    const handleBulkUpload = async () => {
        if (!selectedFile) return;
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            const res = await API.post('/jobs/bulk-upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setUploadResult(res.data.data);
            fetchData();
        } catch (err) {
            console.error('Bulk upload failed:', err);
        } finally {
            setUploading(false);
        }
    };

    const filteredJobs = jobs.filter(job => {
        // 1. Status Filter
        if (statusFilter.length > 0 && !statusFilter.includes(job.status)) {
            return false;
        }
        // 2. Billable Filter
        if (billableFilter.length > 0) {
            const isBillableStr = job.billable ? 'true' : 'false';
            if (!billableFilter.includes(isBillableStr)) {
                return false;
            }
        }
        // 3. Client Filter
        if (clientFilter.length > 0 && !clientFilter.includes(job.project?.client?.id)) {
            return false;
        }
        // 4. Project Filter
        if (projectFilter.length > 0 && !projectFilter.includes(job.project?.id)) {
            return false;
        }
        return true;
    });

    return (
        <div className="h-full flex flex-col space-y-6 animate-fade-in min-h-0 overflow-hidden">
            {/* Page Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 flex-none px-4 sm:px-0">
                <div>
                    <h1 className="text-xl sm:text-3xl font-extrabold text-secondary-900 tracking-tight">Job Master</h1>
                    <p className="text-xs sm:text-sm font-medium text-secondary-500 mt-1">Define granular deliverables and cost centers for project execution.</p>
                </div>
                <div className="flex flex-wrap items-center gap-4 lg:gap-6 justify-between sm:justify-start">
                    {/* Stats Summary on Top Right */}
                    <div className="flex items-center gap-4 lg:gap-5 sm:border-r sm:pr-4 lg:pr-6 border-gray-200">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center shrink-0">
                                <ListBulletIcon className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Active</p>
                                <p className="text-sm font-extrabold text-gray-900 leading-none mt-0.5">{loading ? '-' : jobs.length}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                <CurrencyDollarIcon className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Billable</p>
                                <p className="text-sm font-extrabold text-gray-900 leading-none mt-0.5">{loading ? '-' : jobs.filter(j => j.billable).length}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                                <ClockIcon className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Discussing</p>
                                <p className="text-sm font-extrabold text-gray-900 leading-none mt-0.5">{loading ? '-' : jobs.filter(j => j.status === 'In-Discussion').length}</p>
                            </div>
                        </div>
                        <div className="hidden sm:flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                                <ShieldCheckIcon className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Status</p>
                                <p className="text-sm font-extrabold text-gray-900 leading-none mt-0.5">Stable</p>
                            </div>
                        </div>
                    </div>
                    <div className="hidden sm:block">
                        <ActionBar
                            onAdd={() => setShowAddModal(true)}
                            addLabel="Configure Job"
                            onUpload={isManager ? () => setShowBulkModal(true) : undefined}
                            onDownload={handleExport}
                            onDownloadTemplate={isManager ? downloadTemplate : undefined}
                        />
                    </div>
                </div>
            </div>

            <Card className="flex-1 flex flex-col overflow-hidden min-h-0 shadow-lg">
                <TableToolbar
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    alwaysShowFilters={true}
                    placeholder="Search by Job ID, name or project..."
                    selectMode={selectMode}
                    onSelectModeChange={setSelectMode}
                    selectedCount={selectedJobIds.length}
                    onDeleteSelected={handleBulkDeleteJobs}
                    showDeleteButton={isAdmin || isManager}
                    filters={
                        <>
                            <MultiSelect
                                label="Status"
                                options={[
                                    { value: 'Started', label: 'Started' },
                                    { value: 'In-Discussion', label: 'In-Discussion' },
                                    { value: 'Completed', label: 'Completed' },
                                    { value: 'Inactive', label: 'Inactive' }
                                ]}
                                selectedValues={statusFilter}
                                onChange={(selected) => setStatusFilter(selected)}
                                placeholder="Select status..."
                            />
                            <MultiSelect
                                label="Billable"
                                options={[
                                    { value: 'true', label: 'Billable' },
                                    { value: 'false', label: 'Non-Billable' }
                                ]}
                                selectedValues={billableFilter}
                                onChange={(selected) => setBillableFilter(selected)}
                                placeholder="Select billing..."
                            />
                            <MultiSelect
                                label="Client"
                                options={(clients || []).map(c => ({ value: c.id, label: c.name }))}
                                selectedValues={clientFilter}
                                onChange={(selected) => setClientFilter(selected)}
                                placeholder="Select client..."
                            />
                            <MultiSelect
                                label="Project"
                                options={(projects || []).map(p => ({ value: p.id, label: p.name }))}
                                selectedValues={projectFilter}
                                onChange={(selected) => setProjectFilter(selected)}
                                placeholder="Select project..."
                            />
                        </>
                    }
                />

                <div className="table-wrapper flex-1 bg-slate-50/20 px-1">
                    {error && (
                        <div className="m-4 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-600 animate-fade-in">
                            <ExclamationTriangleIcon className="w-5 h-5 flex-none" />
                            <div className="text-sm font-bold">{error}</div>
                            <Button variant="secondary" size="sm" onClick={fetchData} className="ml-auto bg-white">Retry Connection</Button>
                        </div>
                    )}

                    {/* 📱 Mobile Job Cards (Visible < 1024px) */}
                    <div className="lg:hidden p-4 space-y-4">
                        {loading && jobs.length === 0 ? (
                            [1, 2, 3].map(i => (
                                <Card key={i} className="p-4 space-y-4 bg-white border-0 shadow-sm animate-pulse">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-slate-100 rounded-xl"></div>
                                        <div className="flex-1 space-y-2">
                                            <div className="h-3 bg-slate-100 rounded-full w-2/3"></div>
                                            <div className="h-2 bg-slate-100 rounded-full w-1/3"></div>
                                        </div>
                                    </div>
                                </Card>
                            ))
                        ) : filteredJobs.length > 0 ? (
                            filteredJobs.map((job) => (
                                <motion.div
                                    key={job.id}
                                    initial={{ opacity: 0, scale: 0.98 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="p-5 bg-white rounded-[1.5rem] border border-slate-100 shadow-sm transition-all"
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center gap-3">
                                            {selectMode && (
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer mr-1 shrink-0 animate-in fade-in zoom-in-95 duration-150"
                                                    checked={selectedJobIds.includes(job.id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setSelectedJobIds(prev => [...prev, job.id]);
                                                        } else {
                                                            setSelectedJobIds(prev => prev.filter(id => id !== job.id));
                                                        }
                                                    }}
                                                    aria-label={`Select job ${job.name}`}
                                                />
                                            )}
                                            <div className="flex flex-col gap-1.5">
                                                <span className="text-[10px] font-black text-indigo-600 bg-indigo-50/50 px-3 py-1 rounded-lg border border-indigo-100/50 self-start uppercase tracking-widest">
                                                    {job.jobId}
                                                </span>
                                                <h3 className="text-sm font-black text-slate-900 leading-tight tracking-tight">{job.name}</h3>
                                            </div>
                                        </div>
                                        <StatusBadge status={job.status === 'Inactive' ? 'inactive' : 'active'} />
                                    </div>

                                    <div className="p-4 bg-slate-50 rounded-2xl mb-4 border border-slate-100/50">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="w-6 h-6 bg-white border border-slate-200 rounded flex items-center justify-center text-[9px] font-black text-slate-400">PR</div>
                                            <span className="text-[11px] font-black text-slate-700 uppercase tracking-tighter truncate">{job.project?.name || 'Unassigned'}</span>
                                        </div>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate">{job.project?.client?.name || 'Global Entity'}</p>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center gap-1.5">
                                                <span className={`w-2 h-2 rounded-full ${job.billable ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{job.billable ? 'Billable' : 'Internal'}</span>
                                            </div>
                                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                                Logged: <span className="font-bold text-slate-800">{job.loggedHours ?? 0}h</span>
                                            </div>
                                        </div>
                                        <div className="flex -space-x-1.5 overflow-hidden">
                                            {job.users?.slice(0, 3).map((u, i) => (
                                                <Avatar key={i} name={`${u.employee.firstName} ${u.employee.lastName}`} size="xs" border className="ring-2 ring-white" />
                                            ))}
                                            {job.users?.length > 3 && (
                                                <div className="w-6 h-6 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[8px] font-black text-slate-500 shadow-sm">
                                                    +{job.users.length - 3}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3">
                                            {isManager && (
                                                <StatusToggle
                                                    id={job.id}
                                                    status={job.status}
                                                    onUpdate={fetchData}
                                                    type="job"
                                                />
                                            )}
                                            {isManager && (
                                                <button
                                                    onClick={() => handleEditJob(job)}
                                                    className="p-2.5 text-slate-400 hover:text-indigo-600 bg-white border border-slate-100 rounded-xl shadow-sm"
                                                    title="Edit Job"
                                                    aria-label="Edit job details"
                                                >
                                                    <PencilSquareIcon className="w-4 h-4" />
                                                </button>
                                            )}
                                            {(isAdmin || isManager) && (
                                                <button
                                                    onClick={() => handleDeleteJob(job.id)}
                                                    className="p-2.5 text-slate-400 hover:text-rose-600 bg-white border border-slate-100 rounded-xl shadow-sm"
                                                    title="Delete Job"
                                                    aria-label="Delete job"
                                                >
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            ))
                        ) : (
                            <div className="py-20 text-center opacity-30 italic font-black text-sm uppercase tracking-widest">No Job Masters Found</div>
                        )}
                    </div>

                    {/* 📱 Desktop Job Table (Visible > 1024px) */}
                    <div className="hidden lg:block overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead style={{background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #1e40af 100%)'}}>
                                <tr>
                                    {selectMode && (
                                        <th className="pl-4 py-2.5 w-10 animate-in fade-in slide-in-from-left-2 duration-150">
                                            <input
                                                type="checkbox"
                                                className="rounded border-slate-500 text-blue-400 focus:ring-blue-400 w-4 h-4 cursor-pointer"
                                                checked={filteredJobs.length > 0 && selectedJobIds.length === filteredJobs.length}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedJobIds(filteredJobs.map(j => j.id));
                                                    } else {
                                                        setSelectedJobIds([]);
                                                    }
                                                }}
                                                aria-label="Select all jobs"
                                            />
                                        </th>
                                    )}
                                    <th className="px-4 py-2.5"><span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.12em]">Job ID</span></th>
                                    <th className="px-4 py-2.5"><span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.12em]">Job Name</span></th>
                                    <th className="px-4 py-2.5"><span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.12em]">Team</span></th>
                                    <th className="px-4 py-2.5"><span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.12em]">Project / Client</span></th>
                                    <th className="px-4 py-2.5"><span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.12em]">Logged Hours</span></th>
                                    <th className="px-4 py-2.5"><span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.12em]">Status</span></th>
                                    <th className="px-4 py-2.5 text-right"><span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.12em]">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 bg-white">
                                {loading && jobs.length === 0 ? (
                                    <tr>
                                        <td colSpan={selectMode ? 8 : 7} className="p-0">
                                            <TableSkeleton rows={8} columns={selectMode ? 8 : 7} />
                                        </td>
                                    </tr>
                                ) : filteredJobs.length > 0 ? (
                                    filteredJobs.map((job) => (
                                        <tr key={job.id} className="hover:bg-slate-50 group transition-all duration-150">
                                            {selectMode && (
                                                <td className="pl-4 py-2 w-10 animate-in fade-in slide-in-from-left-2 duration-150">
                                                    <input
                                                        type="checkbox"
                                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                                                        checked={selectedJobIds.includes(job.id)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setSelectedJobIds(prev => [...prev, job.id]);
                                                            } else {
                                                                setSelectedJobIds(prev => prev.filter(id => id !== job.id));
                                                            }
                                                        }}
                                                        aria-label={`Select job ${job.name}`}
                                                    />
                                                </td>
                                            )}
                                            <td className="px-4 py-2">
                                                <span className="text-[10px] font-black text-slate-900 bg-slate-100/50 px-2.5 py-1 rounded-lg border border-slate-200 group-hover:bg-slate-950 group-hover:text-white group-hover:border-slate-800 transition-all duration-500 uppercase tracking-widest leading-none">
                                                    {job.jobId}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2">
                                                <p className="text-[13px] font-black text-slate-900 leading-tight uppercase tracking-tight">{job.name}</p>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest truncate max-w-xs">{job.description || 'No description.'}</p>
                                            </td>
                                            <td className="px-4 py-2 whitespace-nowrap">
                                                <div className="flex -space-x-2">
                                                    {job.users?.slice(0, 3).map((u, i) => (
                                                        <Avatar key={i} name={`${u.employee.firstName} ${u.employee.lastName}`} size="sm" border className="ring-2 ring-white" />
                                                    ))}
                                                    {job.users?.length > 3 && (
                                                        <div className="w-7 h-7 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[9px] font-black text-slate-500 shadow-sm">
                                                            +{job.users.length - 3}
                                                        </div>
                                                    )}
                                                    {(!job.users || job.users.length === 0) && (
                                                        <span className="text-[10px] font-black text-slate-300 italic whitespace-nowrap">Unallocated</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-7 h-7 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center text-[9px] font-black border border-indigo-100/50">PR</div>
                                                    <div className="min-w-0">
                                                        <p className="text-[12px] font-black text-slate-800 truncate">{job.project?.name || 'Global Core'}</p>
                                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest truncate">{job.project?.client?.name || 'Internal'}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2 whitespace-nowrap">
                                                <div className="flex items-center gap-1.5">
                                                    <p className="text-[13px] font-black text-blue-600">{job.loggedHours ?? 0}</p>
                                                    <span className="text-[10px] text-slate-400">hrs</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2">
                                                <div className="inline-flex flex-col gap-1 align-top">
                                                    <StatusBadge status={job.status === 'Inactive' ? 'inactive' : 'active'} />
                                                    <div className="flex items-center gap-1">
                                                        <div className={`w-1.5 h-1.5 rounded-full ${job.billable ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{job.billable ? 'Billable' : 'Internal'}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2 text-right">
                                                <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200">
                                                    {isManager && (
                                                        <StatusToggle
                                                            id={job.id}
                                                            status={job.status}
                                                            onUpdate={fetchData}
                                                            type="job"
                                                        />
                                                    )}
                                                    {isManager && (
                                                        <button
                                                            onClick={() => handleEditJob(job)}
                                                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 rounded-lg shadow-sm transition-all"
                                                            title="Edit Job"
                                                        >
                                                            <PencilSquareIcon className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                    {isAdmin && (
                                                        <button
                                                            onClick={() => handleDeleteJob(job.id)}
                                                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-red-50 border border-transparent hover:border-red-100 rounded-lg shadow-sm transition-all"
                                                            title="Delete Job"
                                                        >
                                                            <TrashIcon className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={selectMode ? 8 : 7} className="py-24 text-center">
                                            <div className="inline-flex flex-col items-center">
                                                <ListBulletIcon className="w-12 h-12 text-slate-100 mb-4" />
                                                <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em]">Zero Job Load</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </Card>

            {/* Add Job Modal */}
            <Modal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                title="Create Job Master Record"
                size="lg"
            >
                <form onSubmit={handleCreateJob} className="space-y-5 pt-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <Select
                            label="Select Client Registry *"
                            value={formData.clientId}
                            onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                            required
                        >
                            <option value="">{loading ? "Loading clients..." : "Select a Client..."}</option>
                            {clients.length > 0 ? (
                                clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)
                            ) : !loading && (
                                <option disabled>No clients found</option>
                            )}
                        </Select>
                        <Select
                            label="Linked Project Master *"
                            value={formData.projectId}
                            onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                            required
                            disabled={!formData.clientId || loading}
                        >
                            <option value="">{loading ? "Loading projects..." : "Select a Project..."}</option>
                            {filteredProjects.length > 0 ? (
                                filteredProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)
                            ) : !loading && formData.clientId && (
                                <option disabled>No projects found</option>
                            )}
                        </Select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <Input
                            label="Job / Deliverable Name *"
                            placeholder="e.g. Documentation Review"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            required
                        />
                        <Select
                            label="Job Status *"
                            value={formData.status}
                            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                            required
                        >
                            <option value="Started">Started</option>
                            <option value="In-Discussion">In-Discussion</option>
                            <option value="Completed">Completed</option>
                            <option value="Inactive">Inactive</option>
                        </Select>
                    </div>

                    <Input
                        label="Detailed Job Description"
                        placeholder="Outline scope of work..."
                        multiline
                        rows={3}
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <Input
                            label="Start Date"
                            type="date"
                            value={formData.startDate}
                            onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                        />
                        <Input
                            label="End Date"
                            type="date"
                            value={formData.endDate}
                            onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                        />
                        <Select
                            label="Billing Type *"
                            value={formData.billable}
                            onChange={(e) => setFormData({ ...formData, billable: e.target.value })}
                            required
                        >
                            <option value="Billable">Billable</option>
                            <option value="Non-Billable">Non-Billable</option>
                        </Select>
                    </div>

                    <div className="space-y-3">
                        <label className="text-sm font-bold text-secondary-700 block">Assign Direct Team (Optional)</label>
                        <Select
                            value=""
                            onChange={(e) => {
                                if (e.target.value && !formData.assignedEmployees.includes(e.target.value)) {
                                    setFormData(prev => ({
                                        ...prev,
                                        assignedEmployees: [...prev.assignedEmployees, e.target.value]
                                    }));
                                }
                            }}
                        >
                            <option value="" disabled>Choose resources...</option>
                            {allEmployees.map(emp => (
                                <option key={emp.id} value={emp.id}>
                                    {emp.firstName} {emp.lastName} ({emp.employeeId})
                                </option>
                            ))}
                        </Select>

                        <div className="flex flex-wrap gap-2">
                            {formData.assignedEmployees.map(userId => {
                                const emp = allEmployees.find(e => e.id === userId);
                                return emp ? (
                                    <div key={userId} className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-black border border-indigo-100">
                                        {emp.firstName} {emp.lastName}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setFormData(prev => ({
                                                    ...prev,
                                                    assignedEmployees: prev.assignedEmployees.filter(id => id !== userId)
                                                }));
                                            }}
                                            className="ml-1 text-indigo-400 hover:text-indigo-600"
                                        >
                                            ×
                                        </button>
                                    </div>
                                ) : null;
                            })}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                        <Input
                            label="Unique Job ID / Cost Center"
                            value="SYSTEM-GENERATED"
                            disabled
                        />
                    </div>

                    <div className="pt-6 flex gap-4">
                        <Button
                            type="button"
                            variant="secondary"
                            fullWidth
                            onClick={() => setShowAddModal(false)}
                            className="h-12 border-secondary-200"
                        >
                            Cancel Entry
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            fullWidth
                            className="h-12 font-extrabold shadow-md shadow-primary-500/10"
                        >
                            Establish Job Master
                        </Button>
                    </div>
                </form>
            </Modal>
            {/* Edit Job Modal */}
            <Modal
                isOpen={showEditModal}
                onClose={() => {
                    setShowEditModal(false);
                    setEditingJob(null);
                    setFormData({
                        name: '',
                        description: '',
                        status: 'Started',
                        startDate: '',
                        endDate: '',
                        billable: 'Billable',
                        projectId: '',
                        clientId: '',
                        assignedEmployees: []
                    });
                }}
                title="Override Job Master Record"
                size="lg"
            >
                <form onSubmit={handleUpdateJob} className="space-y-5 pt-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <Select
                            label="Select Client Registry *"
                            value={formData.clientId}
                            onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                            required
                        >
                            <option value="">Choose Client...</option>
                            {(clients || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </Select>
                        <Select
                            label="Linked Project Master *"
                            value={formData.projectId}
                            onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                            required
                        >
                            <option value="">Choose Project...</option>
                            {(projects || []).filter(p => !formData.clientId || p.clientId === formData.clientId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </Select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <Input
                            label="Job / Deliverable Name *"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            required
                        />
                        <Select
                            label="Job Status *"
                            value={formData.status}
                            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                            required
                        >
                            <option value="Started">Started</option>
                            <option value="In-Discussion">In-Discussion</option>
                            <option value="Completed">Completed</option>
                            <option value="Inactive">Inactive</option>
                        </Select>
                    </div>

                    <Input
                        label="Detailed Job Description"
                        multiline
                        rows={3}
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <Input label="Start Date" type="date" value={formData.startDate ? formData.startDate.split('T')[0] : ''} onChange={(e) => setFormData({ ...formData, startDate: e.target.value })} />
                        <Input label="End Date" type="date" value={formData.endDate ? formData.endDate.split('T')[0] : ''} onChange={(e) => setFormData({ ...formData, endDate: e.target.value })} />
                        <Select
                            label="Billing Type *"
                            value={formData.billable}
                            onChange={(e) => setFormData({ ...formData, billable: e.target.value })}
                            required
                        >
                            <option value="Billable">Billable</option>
                            <option value="Non-Billable">Non-Billable</option>
                        </Select>
                    </div>

                    <div className="space-y-3">
                        <label className="text-sm font-bold text-secondary-700 block">Modify Allocation Matrix (Optional)</label>
                        <Select
                            value=""
                            onChange={(e) => {
                                if (e.target.value && !formData.assignedEmployees.includes(e.target.value)) {
                                    setFormData(prev => ({
                                        ...prev,
                                        assignedEmployees: [...prev.assignedEmployees, e.target.value]
                                    }));
                                }
                            }}
                        >
                            <option value="" disabled>Choose Resources...</option>
                            {allEmployees.map(emp => <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName} ({emp.employeeId})</option>)}
                        </Select>
                        <div className="flex flex-wrap gap-2">
                            {formData.assignedEmployees.map(id => {
                                const emp = allEmployees.find(e => e.id === id);
                                return emp ? (
                                    <div key={id} className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-black border border-indigo-100">
                                        {emp.firstName} {emp.lastName}
                                        <button type="button" onClick={() => setFormData(prev => ({ ...prev, assignedEmployees: prev.assignedEmployees.filter(eid => eid !== id) }))} className="ml-1 text-indigo-400 hover:text-indigo-600">×</button>
                                    </div>
                                ) : null;
                            })}
                        </div>
                    </div>

                    <div className="pt-6 flex gap-4">
                        <Button variant="secondary" fullWidth onClick={() => setShowEditModal(false)}>Cancel Override</Button>
                        <Button type="submit" variant="primary" fullWidth className="font-extrabold">Finalize Job Override</Button>
                    </div>
                </form>
            </Modal>

            {/* Bulk Upload Modal */}
            <Modal
                isOpen={showBulkModal}
                onClose={() => {
                    setShowBulkModal(false);
                    setUploadResult(null);
                    setSelectedFile(null);
                }}
                title="Bulk Job Import"
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
                                        <li>Required columns: <strong>name, projectName</strong></li>
                                        <li>Optional: status (Started/Completed/In-Discussion), billable (Yes/No), startDate, description</li>
                                        <li>Download the template to see the correct format.</li>
                                    </ul>
                                </div>
                            </div>
                            <input
                                type="file"
                                accept=".xlsx"
                                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                                className="w-full p-3 border-2 border-dashed border-primary-200 rounded-xl"
                                title="Select Job Excel File"
                                aria-label="Upload Job Template"
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
                                    {uploadResult && uploadResult.errors && (uploadResult.errors as Array<{ error: string }>).map((err, i: number) => (
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
        </div>
    );
};

export default Jobs;
