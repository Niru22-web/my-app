import React, { useState, useEffect, useCallback } from 'react';
import API from '../api';
import * as XLSX from 'xlsx';
import { useAuth } from '../contexts/AuthContext';
import { useConfirm } from '../contexts/ConfirmContext';
import RegisterClientModal from '../components/RegisterClientModal';
import {
    UserGroupIcon,
    PencilSquareIcon,
    TrashIcon,
    ShieldCheckIcon,
    ClipboardDocumentCheckIcon,
    DocumentArrowUpIcon,
    DocumentArrowDownIcon,
    ExclamationTriangleIcon,
    CheckCircleIcon,
    EyeIcon
} from '@heroicons/react/24/outline';

// UI Components
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import StatusBadge from '../components/ui/StatusBadge';
import StatusToggle from '../components/ui/StatusToggle';
import Modal from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';
import TableSkeleton from '../components/ui/TableSkeleton';
import ASALoader from '../components/ui/ASALoader';
import TableToolbar from '../components/ui/TableToolbar';
import MultiSelect from '../components/ui/MultiSelect';
import ActionBar from '../components/ui/ActionBar';
import FAB from '../components/FAB';

interface Client {
    id: string;
    clientId: string;
    name: string;
    alias?: string;
    gstStatus?: string;
    gstin?: string;
    pan?: string;
    address?: string;
    pin?: string;
    state?: string;
    country?: string;
    phone?: string;
    status?: string;
    loggedHours?: number;
    _count?: {
        projects: number;
    };
}

interface BulkUploadResult {
    totalRows: number;
    successCount: number;
    errorCount: number;
    duplicateCount: number;
    success: Array<{ row: number; clientId: string; name: string }>;
    errors: Array<{ row: number; data: unknown; error: string }>;
}

const Clients: React.FC = () => {
    const { user } = useAuth();
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingClient, setEditingClient] = useState<Client | null>(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deletingClient, setDeletingClient] = useState<Client | null>(null);
    const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState<BulkUploadResult | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [showViewModal, setShowViewModal] = useState(false);
    const [viewingClient, setViewingClient] = useState<Client | null>(null);
    const [statusFilter, setStatusFilter] = useState<string[]>(['Active']);
    const { confirm } = useConfirm();
    const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
    const [selectMode, setSelectMode] = useState(false);

    const isManager = user?.role === 'Manager' || user?.role === 'Admin' || user?.role === 'Partner' || user?.role === 'manager' || user?.role === 'admin' || user?.role === 'partner' || user?.role === 'IT' || user?.role === 'it';

    const showMessage = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 5000);
    };

    const fetchClients = useCallback(async () => {
        try {
            setLoading(true);
            const response = await API.get('/clients', {
                params: {
                    q: searchTerm,
                    status: 'All Status'
                }
            });
            const clientData = response.data?.success ? response.data.data : response.data;
            setClients(Array.isArray(clientData) ? clientData : []);
        } catch (err) {
            console.error('Failed to fetch clients:', err);
            showMessage('Failed to fetch clients', 'error');
        } finally {
            setLoading(false);
        }
    }, [searchTerm]);

    useEffect(() => {
        fetchClients();
    }, [fetchClients]);

    const handleEditClient = async (client: Client) => {
        try {
            setLoading(true);
            const response = await API.get(`/clients/${client.id}`);
            const result = response.data;
            const fullClient = result.success ? result.data : result;
            
            setEditingClient(fullClient);
            setShowEditModal(true);
        } catch (err) {
            console.error('Failed to fetch client details:', err);
            showMessage('Error fetching client details.', 'error');
        } finally {
            setLoading(false);
        }
    };


    const handleViewClient = async (client: Client) => {
        try {
            setLoading(true);
            const response = await API.get(`/clients/${client.id}`);
            const result = response.data;
            const fullClient = result.success ? result.data : result;
            setViewingClient(fullClient);
            setShowViewModal(true);
        } catch (err) {
            console.error('Failed to fetch client details:', err);
            showMessage('Error fetching client details.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteClient = (client: Client) => {
        setDeletingClient(client);
        setShowDeleteModal(true);
    };

    const confirmDeleteClient = async () => {
        if (!isManager || !deletingClient) return;

        try {
            const response = await API.delete(`/clients/${deletingClient.id}`);
            if (response.data.success) {
                showMessage(response.data.message || 'Client deleted successfully');
                setShowDeleteModal(false);
                setDeletingClient(null);
                fetchClients();
            }
        } catch (err) {
            console.error('Failed to delete client:', err);
            const errorMsg = (err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Error deleting client.';
            showMessage(errorMsg, 'error');
        }
    };

    const handleBulkDeleteClients = async () => {
        if (!isManager) {
            showMessage('You do not have permission to delete clients.', 'error');
            return;
        }

        const confirmMessage = `Are you sure you want to permanently delete the ${selectedClientIds.length} selected client(s)? This action cannot be undone.`;
        const confirmed = await confirm({
            title: 'Bulk Delete Clients',
            message: confirmMessage,
            isDelete: true
        });
        if (confirmed) {
            setLoading(true);
            let successCount = 0;
            let failCount = 0;
            
            for (const id of selectedClientIds) {
                try {
                    await API.delete(`/clients/${id}`);
                    successCount++;
                } catch (err) {
                    console.error(`Failed to delete client ${id}:`, err);
                    failCount++;
                }
            }
            
            setLoading(false);
            setSelectedClientIds([]);
            fetchClients(); // Refresh data

            if (failCount === 0) {
                showMessage(`Successfully deleted all ${successCount} selected client(s).`);
            } else {
                showMessage(`Completed bulk deletion: ${successCount} succeeded, ${failCount} failed. (Note: Clients with active projects, timesheets, or dependencies cannot be deleted).`, 'error');
            }
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            // Validate file type
            const validTypes = [
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'application/vnd.ms-excel'
            ];
            
            if (!validTypes.includes(file.type)) {
                showMessage('Please select a valid Excel file (.xlsx or .xls)', 'error');
                return;
            }
            
            // Validate file size (5MB limit)
            if (file.size > 5 * 1024 * 1024) {
                showMessage('File size should not exceed 5MB', 'error');
                return;
            }
            
            setSelectedFile(file);
        }
    };

    const downloadFailedRows = () => {
        if (!uploadResult || uploadResult.errors.length === 0) return;

        const failedData = uploadResult.errors.map(err => ({
            'Row Number': err.row,
            'Error Reason': err.error,
            ...(err.data as Record<string, unknown>)
        }));

        const worksheet = XLSX.utils.json_to_sheet(failedData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Failed Rows');
        
        // Use xlsx to generate blob and download
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(data);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'failed_clients_report.xlsx');
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    };

    const handleBulkUpload = async () => {
        if (!selectedFile || !isManager) return;

        setUploading(true);
        setUploadResult(null);

        try {
            const uploadFormData = new FormData();
            uploadFormData.append('file', selectedFile);

            const response = await API.post('/clients/bulk-upload', uploadFormData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            if (response.data.success) {
                setUploadResult(response.data.data);
                showMessage(response.data.message || 'Bulk upload completed');
                fetchClients(); // Refresh client list
            }
        } catch (err) {
            console.error('Bulk upload failed:', err);
            const errorMsg = (err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Error during bulk upload.';
            showMessage(errorMsg, 'error');
        } finally {
            setUploading(false);
        }
    };

    const downloadTemplate = async () => {
        try {
            const response = await API.get('/clients/template/download', {
                responseType: 'blob',
            });

            // Create download link
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'client_upload_template.xlsx');
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Failed to download template:', err);
            alert('Failed to download template. Please try again.');
        }
    };

    const resetBulkUpload = () => {
        setSelectedFile(null);
        setUploadResult(null);
        setShowBulkUploadModal(false);
    };

    const handleExport = async () => {
        try {
            const response = await API.get('/clients/export', {
                params: { q: searchTerm, status: statusFilter },
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'clients_export.xlsx');
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) {
            console.error('Export failed:', err);
            showMessage('Export failed', 'error');
        }
    };


    const filteredClients = clients.filter(client => {
        if (statusFilter.length === 0) return true; // Show all if none checked
        return statusFilter.includes(client.status || 'Active');
    });

    // Memoized callbacks to prevent modal re-renders
    const handleModalClose = useCallback(() => {
        setShowAddModal(false);
    }, []);

    const handleModalSuccess = useCallback(() => {
        fetchClients();
    }, [fetchClients]);

    return (
        <div className="h-full flex flex-col space-y-6 animate-fade-in min-h-0 overflow-hidden">
            {/* Page Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 flex-none px-4 sm:px-0">
                <div>
                    <h1 className="text-xl sm:text-3xl font-extrabold text-secondary-900 tracking-tight">Client Directory</h1>
                    <p className="text-xs sm:text-sm font-medium text-secondary-500 mt-1">Manage global enterprise clients and fiscal registrations.</p>
                </div>
                <div className="flex flex-wrap items-center gap-4 lg:gap-6 justify-between sm:justify-start">
                    {/* Stats on Top Right */}
                    <div className="flex items-center gap-4 lg:gap-6 sm:border-r sm:pr-4 lg:pr-6 border-gray-200">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center shrink-0">
                                <UserGroupIcon className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Clients</p>
                                <p className="text-sm font-extrabold text-gray-900 leading-none mt-0.5">{loading ? '-' : clients.length}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                <ShieldCheckIcon className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">GST Reg.</p>
                                <p className="text-sm font-extrabold text-gray-900 leading-none mt-0.5">{loading ? '-' : clients.filter(c => c.gstStatus === 'Yes').length}</p>
                            </div>
                        </div>
                        <div className="hidden sm:flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                                <ClipboardDocumentCheckIcon className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Active Projects</p>
                                <p className="text-sm font-extrabold text-gray-900 leading-none mt-0.5">{loading ? '-' : clients.reduce((sum, client) => sum + (client._count?.projects || 0), 0)}</p>
                            </div>
                        </div>
                    </div>

                    <div className="hidden sm:block">
                        <ActionBar
                            onAdd={() => setShowAddModal(true)}
                            addLabel="Add New Client"
                            onUpload={isManager ? () => setShowBulkUploadModal(true) : undefined}
                            onDownload={handleExport}
                            onDownloadTemplate={isManager ? downloadTemplate : undefined}
                        />
                    </div>
                </div>
            </div>

            {/* Search and Table */}
            <Card className="flex-1 flex flex-col overflow-hidden min-h-0 shadow-lg">
                <TableToolbar
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    alwaysShowFilters={true}
                    placeholder="Search by name, ID, alias, PAN or GSTIN..."
                    selectMode={selectMode}
                    onSelectModeChange={setSelectMode}
                    selectedCount={selectedClientIds.length}
                    onDeleteSelected={handleBulkDeleteClients}
                    showDeleteButton={isManager}
                    filters={
                        <MultiSelect
                            label="Filter by Status"
                            options={[
                                { value: 'Active', label: 'Active' },
                                { value: 'Inactive', label: 'Inactive' }
                            ]}
                            selectedValues={statusFilter}
                            onChange={(selected) => setStatusFilter(selected)}
                            placeholder="Select status..."
                        />
                    }
                />

                {/* 📱 Mobile Client Cards (Visible < 1024px) */}
                <div className="lg:hidden flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                    {loading && clients.length === 0 ? (
                        [1, 2, 3].map(i => (
                            <div key={i} className="p-5 bg-white rounded-2xl border border-slate-100 shadow-sm space-y-4 animate-pulse">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-slate-100 rounded-xl"></div>
                                    <div className="flex-1 space-y-2">
                                        <div className="h-3.5 bg-slate-100 rounded-full w-2/3"></div>
                                        <div className="h-2.5 bg-slate-50 rounded-full w-1/3"></div>
                                    </div>
                                </div>
                                <div className="h-12 bg-slate-50 rounded-xl"></div>
                            </div>
                        ))
                    ) : filteredClients.length > 0 ? (
                        filteredClients.map((client) => (
                            <div
                                key={client.id}
                                className="p-5 bg-white rounded-2xl border border-slate-100 shadow-sm space-y-4"
                            >
                                {/* Header: identity + status */}
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        {selectMode && (
                                            <input
                                                type="checkbox"
                                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer shrink-0"
                                                checked={selectedClientIds.includes(client.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedClientIds(prev => [...prev, client.id]);
                                                    } else {
                                                        setSelectedClientIds(prev => prev.filter(id => id !== client.id));
                                                    }
                                                }}
                                            />
                                        )}
                                        <div className="w-10 h-10 bg-slate-100 text-slate-500 rounded-xl flex items-center justify-center font-bold text-xs uppercase shrink-0">
                                            {client.name.substring(0, 2)}
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="text-sm font-bold text-secondary-900 truncate leading-tight">{client.name}</h3>
                                            <p className="text-[10px] font-bold text-secondary-400 uppercase tracking-wider truncate">{client.clientId}</p>
                                        </div>
                                    </div>
                                    <StatusBadge status={client.status === 'Active' ? 'active' : 'inactive'} />
                                </div>

                                {/* Tax + location details */}
                                <div className="space-y-1.5">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${client.gstin ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                            {client.gstin ? 'GST REG' : 'NO GST'}
                                        </span>
                                        {client.alias && <span className="text-[10px] font-bold text-secondary-600 bg-secondary-100 px-2 py-0.5 rounded">{client.alias}</span>}
                                    </div>
                                    {client.gstin && <p className="text-[10px] font-bold text-secondary-400 tracking-wider">GST: {client.gstin}</p>}
                                    {client.pan && <p className="text-[10px] font-bold text-secondary-400">PAN: {client.pan}</p>}
                                    {(client.state || client.address) && (
                                        <p className="text-[11px] text-secondary-600">{client.address ? `${client.address}, ` : ''}{client.state}{client.country ? `, ${client.country}` : ''}</p>
                                    )}
                                </div>

                                {/* Stats + actions */}
                                <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                                    <div className="flex items-center gap-4">
                                        <div>
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Projects</p>
                                            <p className="text-xs font-black text-blue-600">{client._count?.projects || 0}</p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Logged</p>
                                            <p className="text-xs font-black text-slate-700">{client.loggedHours ?? 0} hrs</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            onClick={() => handleViewClient(client)}
                                            className="p-2 rounded-lg bg-slate-50 hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                                            title="View Client Details"
                                        >
                                            <EyeIcon className="w-4 h-4" />
                                        </button>
                                        {isManager && (
                                            <>
                                                <button
                                                    onClick={() => handleEditClient(client)}
                                                    className="p-2 rounded-lg bg-slate-50 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors"
                                                    title="Edit Client"
                                                >
                                                    <PencilSquareIcon className="w-4 h-4" />
                                                </button>
                                                <StatusToggle
                                                    id={client.id}
                                                    status={client.status || 'Active'}
                                                    onUpdate={fetchClients}
                                                    type="client"
                                                />
                                                <button
                                                    onClick={() => handleDeleteClient(client)}
                                                    className="p-2 rounded-lg bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-danger-600 transition-colors"
                                                    title="Delete Client"
                                                >
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="py-20 text-center opacity-40 italic font-bold text-secondary-400">
                            No clients discovered matching your query parameters.
                        </div>
                    )}
                </div>

                {/* 🖥️ Desktop Client Table (Visible ≥ 1024px) */}
                <div className="table-wrapper flex-1 hidden lg:block">
                    <table className="w-full text-left min-w-[900px]">
                        <thead>
                            <tr style={{background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #1e40af 100%)'}}>
                                {selectMode && (
                                    <th className="pl-4 py-2.5 w-10">
                                        <input
                                            type="checkbox"
                                            className="rounded border-slate-500 text-blue-400 focus:ring-blue-400 w-4 h-4 cursor-pointer"
                                            checked={filteredClients.length > 0 && selectedClientIds.length === filteredClients.length}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedClientIds(filteredClients.map(c => c.id));
                                                } else {
                                                    setSelectedClientIds([]);
                                                }
                                            }}
                                            aria-label="Select all clients"
                                        />
                                    </th>
                                )}
                                <th className="px-4 py-2.5"><span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.12em]">Client Identity</span></th>
                                <th className="px-4 py-2.5"><span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.12em]">Contact Details</span></th>
                                <th className="px-4 py-2.5"><span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.12em]">Tax Status</span></th>
                                <th className="px-4 py-2.5"><span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.12em]">Status</span></th>
                                <th className="px-4 py-2.5"><span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.12em]">Projects</span></th>
                                <th className="px-4 py-2.5"><span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.12em]">Logged Hours</span></th>
                                <th className="px-4 py-2.5 text-right"><span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.12em]">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-secondary-50 px-2 sm:bg-white text-sm">
                            {loading && clients.length === 0 ? (
                                <tr>
                                    <td colSpan={selectMode ? 8 : 7} className="p-0">
                                        <TableSkeleton rows={10} columns={selectMode ? 8 : 7} />
                                    </td>
                                </tr>
                            ) : filteredClients.length > 0 ? (
                                filteredClients.map((client) => (
                                    <tr key={client.id} className="hover:bg-blue-50/30 group transition-colors">
                                        {selectMode && (
                                            <td className="pl-4 py-2 w-10 whitespace-nowrap">
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                                                    checked={selectedClientIds.includes(client.id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setSelectedClientIds(prev => [...prev, client.id]);
                                                        } else {
                                                            setSelectedClientIds(prev => prev.filter(id => id !== client.id));
                                                        }
                                                    }}
                                                />
                                            </td>
                                        )}
                                        <td className="px-4 py-2" data-label="Client Identity">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-8 h-8 bg-slate-100 text-slate-500 rounded-lg flex items-center justify-center font-bold text-xs uppercase group-hover:bg-blue-100 group-hover:text-blue-700 transition-colors shrink-0">
                                                    {client.name.substring(0, 2)}
                                                </div>
                                                <div>
                                                    <p className="text-[13px] font-bold text-secondary-900 leading-tight">{client.name}</p>
                                                    <p className="text-[10px] font-bold text-secondary-400 uppercase tracking-wider">{client.clientId}</p>
                                                    {client.address && <p className="text-[11px] text-secondary-500 hidden sm:block">{client.address}</p>}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2" data-label="Contact Details">
                                            <div className="flex flex-col gap-0.5">
                                                {client.alias && <span className="text-[10px] font-bold text-secondary-600 bg-secondary-100 px-2 py-0.5 rounded-lg w-fit">{client.alias}</span>}
                                                {client.state && <p className="text-[11px] text-secondary-600">{client.state}, {client.country}</p>}
                                                {client.pin && <p className="text-[10px] text-secondary-400">PIN: {client.pin}</p>}
                                            </div>
                                        </td>
                                        <td className="px-4 py-2" data-label="Tax Status">
                                            <div className="flex flex-col gap-1">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded w-fit ${client.gstin ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                                    {client.gstin ? 'GST REG' : 'NO GST'}
                                                </span>
                                                {client.gstin && <span className="text-[10px] font-bold text-secondary-400 tracking-wider">GST: {client.gstin}</span>}
                                                {client.pan && <span className="text-[10px] font-bold text-secondary-400">PAN: {client.pan}</span>}
                                            </div>
                                        </td>
                                        <td className="px-4 py-2" data-label="Status">
                                            <StatusBadge status={client.status === 'Active' ? 'active' : 'inactive'} />
                                        </td>
                                        <td className="px-4 py-2" data-label="Projects">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[13px] font-black text-blue-600">{client._count?.projects || 0}</span>
                                                <span className="text-[10px] text-secondary-400">projects</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2" data-label="Logged Hours">
                                            <div className="flex items-center gap-1">
                                                <span className="text-[13px] font-black text-slate-700">{client.loggedHours ?? 0}</span>
                                                <span className="text-[10px] text-secondary-400">hrs</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2 text-right" data-label="Actions">
                                            <div className="flex items-center justify-end gap-1">
                                                <button 
                                                    onClick={() => handleViewClient(client)}
                                                    className="p-1.5 text-secondary-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all border border-transparent hover:border-blue-100 flex items-center justify-center"
                                                    title="View Client Details"
                                                >
                                                    <EyeIcon className="w-3.5 h-3.5" />
                                                </button>
                                                {isManager && (
                                                    <>
                                                        <button 
                                                            onClick={() => handleEditClient(client)}
                                                            className="p-1.5 text-secondary-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all border border-transparent hover:border-indigo-100 flex items-center justify-center"
                                                            title="Edit Client"
                                                        >
                                                            <PencilSquareIcon className="w-3.5 h-3.5" />
                                                        </button>
                                                        <StatusToggle
                                                            id={client.id}
                                                            status={client.status || 'Active'}
                                                            onUpdate={fetchClients}
                                                            type="client"
                                                        />
                                                        <button 
                                                            onClick={() => handleDeleteClient(client)}
                                                            className="p-1.5 text-secondary-400 hover:text-danger-600 hover:bg-red-50 rounded-lg transition-all border border-transparent hover:border-red-100 flex items-center justify-center"
                                                            title="Delete Client"
                                                        >
                                                            <TrashIcon className="w-3.5 h-3.5" />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={selectMode ? 8 : 7} className="py-20 text-center opacity-40 italic font-bold text-secondary-400">
                                        No clients discovered matching your query parameters.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Register Client Modal - State is now isolated inside modal */}
            <RegisterClientModal 
                isOpen={showAddModal}
                onClose={handleModalClose}
                onSuccess={handleModalSuccess}
            />

            {/* Edit Client Modal */}
            <RegisterClientModal 
                isOpen={showEditModal}
                onClose={() => {
                    setShowEditModal(false);
                    setEditingClient(null);
                }}
                onSuccess={() => {
                    setShowEditModal(false);
                    setEditingClient(null);
                    fetchClients();
                }}
                editData={editingClient}
                isEditMode={true}
            />

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={showDeleteModal}
                onClose={() => {
                    setShowDeleteModal(false);
                    setDeletingClient(null);
                }}
                title="Confirm Client Deletion"
                size="md"
            >
                <div className="space-y-4 pt-4">
                    <div className="flex items-center gap-3 p-4 bg-danger-50 rounded-lg border border-danger-200">
                        <TrashIcon className="w-6 h-6 text-danger-600" />
                        <div>
                            <p className="text-sm font-bold text-danger-900">Are you sure you want to delete this client?</p>
                            <p className="text-xs text-danger-700 mt-1">This action cannot be undone and will permanently remove all client data.</p>
                        </div>
                    </div>
                    
                    {deletingClient && (
                        <div className="bg-secondary-50 rounded-lg p-3 border border-secondary-200">
                            <p className="text-xs font-bold text-secondary-500 uppercase tracking-wider mb-2">Client to be deleted:</p>
                            <div className="space-y-1">
                                <p className="text-sm font-bold text-secondary-900">{deletingClient.name}</p>
                                <p className="text-xs text-secondary-600">ID: {deletingClient.clientId} • Alias: {deletingClient.alias}</p>
                            </div>
                        </div>
                    )}

                    <div className="pt-4 flex gap-4">
                        <Button
                            type="button"
                            variant="secondary"
                            fullWidth
                            onClick={() => {
                                setShowDeleteModal(false);
                                setDeletingClient(null);
                            }}
                            className="h-12 border-secondary-200"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="danger"
                            fullWidth
                            onClick={() => {
                                confirmDeleteClient();
                                setShowDeleteModal(false);
                                setDeletingClient(null);
                            }}
                            className="h-12 font-extrabold shadow-md shadow-danger-500/10"
                        >
                            Delete Client
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Bulk Upload Modal */}
            <Modal
                isOpen={showBulkUploadModal}
                onClose={resetBulkUpload}
                title="Bulk Upload Clients"
                size="lg"
            >
                <div className="space-y-6 pt-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                            <DocumentArrowUpIcon className="w-5 h-5 text-blue-600 mt-0.5" />
                            <div>
                                <h4 className="text-sm font-bold text-blue-900 mb-2">Upload Instructions</h4>
                                <ul className="text-xs text-blue-700 space-y-1">
                                    <li>• Download the template to understand the required format</li>
                                    <li>• Required fields: <strong>name</strong></li>
                                    <li>• Optional fields: alias, phone, address, pin, state, country, gstStatus, gstin, pan</li>
                                    <li>• <strong>Note: Client ID will be auto-generated by the system</strong></li>
                                    <li>• Duplicate clients (based on name, GSTIN, or PAN) will be skipped</li>
                                    <li>• File format: Excel (.xlsx or .xls) - Max 5MB</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <Button
                            variant="secondary"
                            onClick={downloadTemplate}
                            leftIcon={<DocumentArrowDownIcon className="w-4 h-4" />}
                        >
                            Download Template
                        </Button>
                    </div>

                    {!uploadResult ? (
                        <div className="space-y-4">
                            <div className={`relative border-2 border-dashed rounded-xl p-8 transition-all ${
                                selectedFile ? 'border-primary-500 bg-primary-50/30' : 'border-secondary-200 hover:border-primary-400 bg-secondary-50/50'
                            }`}>
                                <input
                                    type="file"
                                    aria-label="Upload Client Excel File"
                                    title="Upload Client Excel File"
                                    onChange={handleFileSelect}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    accept=".xlsx,.xls"
                                />
                                <div className="flex flex-col items-center text-center gap-3">
                                    <DocumentArrowUpIcon className={`w-12 h-12 ${selectedFile ? 'text-primary-600' : 'text-secondary-400'}`} />
                                    <div>
                                        <p className="text-sm font-bold text-secondary-700">
                                            {selectedFile ? selectedFile.name : 'Click to upload Excel file'}
                                        </p>
                                        <p className="text-xs text-secondary-400 mt-1">
                                            {selectedFile ? `Size: ${(selectedFile.size / 1024 / 1024).toFixed(2)} MB` : 'or drag and drop'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    fullWidth
                                    onClick={resetBulkUpload}
                                    className="h-12 border-secondary-200"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    variant="primary"
                                    fullWidth
                                    onClick={handleBulkUpload}
                                    disabled={!selectedFile || uploading}
                                    className="h-12 font-extrabold shadow-md shadow-primary-500/10"
                                >
                                    {uploading ? (
                                        <>
                                            <ASALoader size="xs" className="mr-2" />
                                            Uploading...
                                        </>
                                    ) : (
                                        'Upload Clients'
                                    )}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <CheckCircleIcon className="w-5 h-5 text-emerald-600" />
                                        <h4 className="text-sm font-bold text-emerald-900">Success</h4>
                                    </div>
                                    <p className="text-2xl font-bold text-emerald-700">{uploadResult.successCount}</p>
                                    <p className="text-xs text-emerald-600">clients added</p>
                                </div>
                                
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <ExclamationTriangleIcon className="w-5 h-5 text-amber-600" />
                                        <h4 className="text-sm font-bold text-amber-900">Duplicates</h4>
                                    </div>
                                    <p className="text-2xl font-bold text-amber-700">{uploadResult.duplicateCount}</p>
                                    <p className="text-xs text-amber-600">records skipped</p>
                                </div>

                                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <ExclamationTriangleIcon className="w-5 h-5 text-red-600" />
                                        <h4 className="text-sm font-bold text-red-900">Failed</h4>
                                    </div>
                                    <p className="text-2xl font-bold text-red-700">{uploadResult.errorCount - uploadResult.duplicateCount}</p>
                                    <p className="text-xs text-red-600">validation errors</p>
                                </div>
                            </div>

                            {uploadResult.errors.length > 0 && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-sm font-bold text-red-900">Error Summary</h4>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={downloadFailedRows}
                                            className="text-[10px] h-8 bg-white border-red-200 text-red-600 hover:bg-red-50"
                                            leftIcon={<DocumentArrowDownIcon className="w-3.4 h-3.4" />}
                                        >
                                            Download Failed Report
                                        </Button>
                                    </div>
                                    <div className="max-h-40 overflow-y-auto space-y-2 custom-scrollbar pr-2">
                                        {uploadResult.errors.map((error, index) => (
                                            <div key={index} className="text-xs text-red-700 p-2 bg-white/50 rounded border border-red-100 flex items-start gap-2">
                                                <span className="font-bold shrink-0">Row {error.row}:</span>
                                                <span>{error.error}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-4 pt-4">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    fullWidth
                                    onClick={resetBulkUpload}
                                    className="h-12 border-secondary-200"
                                >
                                    Close
                                </Button>
                                <Button
                                    type="button"
                                    variant="primary"
                                    fullWidth
                                    onClick={() => {
                                        resetBulkUpload();
                                        setShowBulkUploadModal(true);
                                    }}
                                    className="h-12 font-extrabold shadow-md shadow-primary-500/10"
                                >
                                    Upload Another File
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>

            {/* View Modal */}
            <Modal
                isOpen={showViewModal}
                onClose={() => {
                    setShowViewModal(false);
                    setViewingClient(null);
                }}
                title="Client Details"
                size="xl"
            >
                {viewingClient && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h4 className="text-sm font-medium text-gray-500">Legal Name</h4>
                                <p className="mt-1 text-base text-gray-900 font-semibold">{viewingClient.name}</p>
                            </div>
                            <div>
                                <h4 className="text-sm font-medium text-gray-500">Alias</h4>
                                <p className="mt-1 text-base text-gray-900">{viewingClient.alias || '-'}</p>
                            </div>
                            <div>
                                <h4 className="text-sm font-medium text-gray-500">Phone</h4>
                                <p className="mt-1 text-base text-gray-900">{viewingClient.phone || '-'}</p>
                            </div>
                            <div>
                                <h4 className="text-sm font-medium text-gray-500">Total Logged Hours</h4>
                                <p className="mt-1 text-base text-gray-900 font-bold text-primary-600">{viewingClient.loggedHours ?? 0} hours</p>
                            </div>
                            <div className="md:col-span-2">
                                <h4 className="text-sm font-medium text-gray-500">Address</h4>
                                <p className="mt-1 text-base text-gray-900">{viewingClient.address || '-'}</p>
                            </div>
                        </div>

                        <div className="border-t border-gray-200 pt-4">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">Tax & Location Info</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <h4 className="text-sm font-medium text-gray-500">GST Status</h4>
                                    <p className="mt-1 text-base text-gray-900">{viewingClient.gstStatus}</p>
                                </div>
                                {viewingClient.gstStatus === 'Yes' && (
                                    <div>
                                        <h4 className="text-sm font-medium text-gray-500">GSTIN</h4>
                                        <p className="mt-1 text-base text-gray-900 font-mono">{viewingClient.gstin}</p>
                                    </div>
                                )}
                                <div>
                                    <h4 className="text-sm font-medium text-gray-500">PAN</h4>
                                    <p className="mt-1 text-base text-gray-900 font-mono uppercase">{viewingClient.pan || '-'}</p>
                                </div>
                                <div>
                                    <h4 className="text-sm font-medium text-gray-500">Address</h4>
                                    <p className="mt-1 text-base text-gray-900">{viewingClient.address || '-'}</p>
                                </div>
                                <div>
                                    <h4 className="text-sm font-medium text-gray-500">Location</h4>
                                    <p className="mt-1 text-base text-gray-900">
                                        {[viewingClient.state, viewingClient.country].filter(Boolean).join(', ')} 
                                        {viewingClient.pin && ` - ${viewingClient.pin}`}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                <div className="mt-8 flex justify-end">
                    <Button onClick={() => setShowViewModal(false)}>Close</Button>
                </div>
            </Modal>

            {/* Notification Toast */}
            {notification && (
                <div className={`fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-2xl z-[100] flex items-center space-x-3 transition-all transform animate-slide-in ${
                    notification.type === 'error' ? 'bg-red-600' : 
                    notification.type === 'info' ? 'bg-blue-600' : 'bg-green-600'
                } text-white`}>
                    {notification.type === 'error' ? (
                        <ExclamationTriangleIcon className="h-6 w-6" />
                    ) : (
                        <CheckCircleIcon className="h-6 w-6" />
                    )}
                    <span className="font-medium">{notification.message}</span>
                </div>
            )}

            {/* Mobile FAB */}
            {isManager && (
                <FAB
                    onClick={() => setShowAddModal(true)}
                    label="Add New Client"
                />
            )}
        </div>
    );
};

export default Clients;
