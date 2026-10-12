import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import API from '../api';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../contexts/PermissionsContext';
import { useConfirm } from '../contexts/ConfirmContext';
import {
  BriefcaseIcon,
  PencilSquareIcon,
  TrashIcon,
  ShieldCheckIcon,
  UserGroupIcon,
  IdentificationIcon,
  ClockIcon
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
import FAB from '../components/FAB';
import { DocumentArrowUpIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface Project {
  id: string;
  projectId: string;
  name: string;
  status: string;
  startDate: string;
  billable: boolean;
  contactPerson: string;
  clientId: string;
  client: { name: string };
  loggedHours?: number;
  users: Array<{ employee: { id: string, firstName: string, lastName: string } }>;
}

const Projects: React.FC = () => {
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const { confirm } = useConfirm();
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const [allEmployees, setAllEmployees] = useState<Array<{ id: string; firstName: string; lastName: string; employeeId: string }>>([]); // For dropdown (all employees)
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [generatedProjectId, setGeneratedProjectId] = useState<string>('');
  
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  
  // Advanced Filter states
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [billableFilter, setBillableFilter] = useState<string[]>([]);
  const [clientFilter, setClientFilter] = useState<string[]>([]);
  
  // Bulk Upload states
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<{ successCount: number; duplicateCount: number; errors: Array<{ error: string }> } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    clientId: '',
    status: 'Started',
    startDate: new Date().toISOString().split('T')[0],
    billable: 'Billable',
    contactPerson: '',
    assignedEmployees: [] as string[]
  });

  const isManager = user?.role === 'Manager' || user?.role === 'Admin' || user?.role === 'manager' || user?.role === 'admin' || user?.role === 'IT' || user?.role === 'it';

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setSelectedProjectIds([]); // Clear selection when data is re-fetched/filtered
      
      const params: Record<string, string | undefined> = {
        q: searchTerm
      };

      const [projectsRes, clientsRes, allEmployeesRes] = await Promise.all([
        API.get('/projects', { params }),
        API.get('/clients?all=true'),
        API.get('/employees?all=true')
      ]);
      
      const projectsArr = projectsRes.data?.success ? projectsRes.data.data : projectsRes.data;
      const clientsArr = clientsRes.data?.success ? clientsRes.data.data : clientsRes.data;
      const allEmployeesArr = allEmployeesRes.data?.success ? allEmployeesRes.data.data : allEmployeesRes.data;

      setProjects(Array.isArray(projectsArr) ? projectsArr : []);
      setClients(Array.isArray(clientsArr) ? clientsArr : []);
      setAllEmployees(Array.isArray(allEmployeesArr) ? allEmployeesArr : []);
    } catch (err) {
      console.error('Failed to fetch project data:', err);
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const generateProjectId = async () => {
    try {
      const response = await API.get('/projects');
      const projectList = response.data?.success ? response.data.data : response.data;
      const projectCount = Array.isArray(projectList) ? projectList.length : 0;
      const newId = `PRJ${String(projectCount + 1).padStart(4, '0')}`;
      setGeneratedProjectId(newId);
    } catch (err) {
      console.error('Failed to generate project ID:', err);
      setGeneratedProjectId('PRJ0001');
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasPermission('projects', 'canCreate')) {
      alert('You do not have permission to initiate projects.');
      return;
    }

    // Validation
    if (!formData.name || !formData.clientId || !formData.startDate) {
      alert('Please fill all mandatory fields.');
      return;
    }

    try {
      const projectData = {
        ...formData,
        billable: formData.billable === 'Billable',
        projectId: generatedProjectId
      };
      const response = await API.post('/projects', projectData);
      console.log('Project creation response:', response.data);
      setShowAddModal(false);
      setFormData({
        name: '',
        clientId: '',
        status: 'Started',
        startDate: new Date().toISOString().split('T')[0],
        billable: 'Billable',
        contactPerson: '',
        assignedEmployees: []
      });
      setGeneratedProjectId(''); // Reset project ID
      fetchData(); // Refresh data immediately
    } catch (err) {
      console.error('Failed to create project:', err);
      alert('Error creating project. Ensure all mandatory fields are correctly filled.');
    }
  };

  const handleEditProject = (project: Project) => {
    if (!hasPermission('projects', 'canEdit')) {
      alert('You do not have permission to modify projects.');
      return;
    }
    setEditingProject(project);
    setFormData({
      name: project.name,
      clientId: project.clientId,
      status: project.status,
      startDate: project.startDate,
      billable: project.billable ? 'Billable' : 'Non-Billable',
      contactPerson: project.contactPerson,
      assignedEmployees: project.users?.map(u => u.employee.id) || []
    });
    setShowEditModal(true);
  };

  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasPermission('projects', 'canEdit') || !editingProject) {
      alert('You do not have permission to update projects.');
      return;
    }

    // Validation
    if (!formData.name || !formData.clientId || !formData.startDate) {
      alert('Please fill all mandatory fields.');
      return;
    }

    try {
      const projectData = {
        ...formData,
        billable: formData.billable === 'Billable',
        projectId: editingProject.projectId
      };
      await API.put(`/projects/${editingProject.id}`, projectData);
      setShowEditModal(false);
      setEditingProject(null);
      setFormData({
        name: '',
        clientId: '',
        status: 'Started',
        startDate: new Date().toISOString().split('T')[0],
        billable: 'Billable',
        contactPerson: '',
        assignedEmployees: []
      });
      fetchData(); // Refresh data immediately
    } catch (err) {
      console.error('Failed to update project:', err);
      alert('Error updating project. Please try again.');
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!hasPermission('projects', 'canDelete')) {
      alert('You do not have permission to delete projects.');
      return;
    }
    
    const confirmed = await confirm({
      title: 'Delete Project',
      message: 'Are you sure you want to delete this project? This action cannot be undone.',
      isDelete: true
    });
    if (confirmed) {
      try {
        await API.delete(`/projects/${id}`);
        fetchData(); // Refresh data immediately
      } catch (err) {
        console.error('Failed to delete project:', err);
        alert('Error deleting project. Please try again.');
      }
    }
  };

  const handleBulkDeleteProjects = async () => {
    if (!hasPermission('projects', 'canDelete')) {
      alert('You do not have permission to delete projects.');
      return;
    }

    const confirmMessage = `Are you sure you want to permanently delete the ${selectedProjectIds.length} selected project(s)? This action cannot be undone.`;
    const confirmed = await confirm({
      title: 'Bulk Delete Projects',
      message: confirmMessage,
      isDelete: true
    });
    if (confirmed) {
      setLoading(true);
      let successCount = 0;
      let failCount = 0;
      
      for (const id of selectedProjectIds) {
        try {
          await API.delete(`/projects/${id}`);
          successCount++;
        } catch (err) {
          console.error(`Failed to delete project ${id}:`, err);
          failCount++;
        }
      }
      
      setLoading(false);
      setSelectedProjectIds([]);
      fetchData(); // Refresh data

      if (failCount === 0) {
        alert(`Successfully deleted all ${successCount} selected project(s).`);
      } else {
        alert(`Completed bulk deletion: ${successCount} succeeded, ${failCount} failed. (Note: Projects with active deliverables or timesheets cannot be deleted).`);
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
      if (billableFilter.length === 1) params.billable = billableFilter[0] === 'true';

      const response = await API.get('/projects/export', {
        params,
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'projects_export.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  const downloadTemplate = async () => {
    try {
      const response = await API.get('/projects/template/download', {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'project_template.xlsx');
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
      const res = await API.post('/projects/bulk-upload', formData, {
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

  const filteredProjects = projects.filter(project => {
    // 1. Status Filter
    if (statusFilter.length > 0 && !statusFilter.includes(project.status)) {
      return false;
    }
    // 2. Billable Filter
    if (billableFilter.length > 0) {
      const isBillableStr = project.billable ? 'true' : 'false';
      if (!billableFilter.includes(isBillableStr)) {
        return false;
      }
    }
    // 3. Client Filter
    if (clientFilter.length > 0 && !clientFilter.includes(project.clientId)) {
      return false;
    }
    return true;
  });

  return (
    <div className="h-full flex flex-col space-y-6 animate-fade-in min-h-0 overflow-hidden">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 flex-none px-4 sm:px-0">
        <div>
          <h1 className="text-xl sm:text-3xl font-extrabold text-secondary-900 tracking-tight">Project Master</h1>
          <p className="text-xs sm:text-sm font-medium text-secondary-500 mt-1">Configure enterprise engagements and core delivery teams.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4 lg:gap-6 justify-between sm:justify-start">
          {/* Stats Summary on Top Right */}
          <div className="flex items-center gap-4 lg:gap-5 sm:border-r sm:pr-4 lg:pr-6 border-gray-200">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center shrink-0">
                <BriefcaseIcon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Active</p>
                <p className="text-sm font-extrabold text-gray-900 leading-none mt-0.5">{loading ? '-' : projects.length}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <UserGroupIcon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Billable</p>
                <p className="text-sm font-extrabold text-gray-900 leading-none mt-0.5">{loading ? '-' : projects.filter(p => p.billable).length}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <ClockIcon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Discussing</p>
                <p className="text-sm font-extrabold text-gray-900 leading-none mt-0.5">{loading ? '-' : projects.filter(p => p.status === 'In-Discussion').length}</p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <ShieldCheckIcon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Completed</p>
                <p className="text-sm font-extrabold text-gray-900 leading-none mt-0.5">{loading ? '-' : projects.filter(p => p.status === 'Completed').length}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block">
              <ActionBar
                onAdd={() => {
                  generateProjectId();
                  setShowAddModal(true);
                }}
                addLabel="Initiate Project"
                onUpload={isManager ? () => setShowBulkModal(true) : undefined}
                onDownload={handleExport}
                onDownloadTemplate={isManager ? downloadTemplate : undefined}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Search and Table */}
      <Card className="flex-1 flex flex-col overflow-hidden min-h-0 shadow-lg">
        <TableToolbar
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          alwaysShowFilters={true}
          placeholder="Search projects, client names or project IDs..."
          selectMode={selectMode}
          onSelectModeChange={setSelectMode}
          selectedCount={selectedProjectIds.length}
          onDeleteSelected={handleBulkDeleteProjects}
          showDeleteButton={hasPermission('projects', 'canDelete')}
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
                options={clients.map(c => ({ value: c.id, label: c.name }))}
                selectedValues={clientFilter}
                onChange={(selected) => setClientFilter(selected)}
                placeholder="Select client..."
              />
            </>
          }
        />

        <div className="table-wrapper flex-1 bg-slate-50/30">
          
          {/* 📱 Mobile Project Cards (Visible < 1024px) */}
          <div className="lg:hidden p-4 space-y-4">
            {loading && projects.length === 0 ? (
              [1, 2, 3].map(i => (
                <Card key={i} className="p-4 space-y-4 bg-white border-0 shadow-sm animate-pulse">
                   <div className="h-4 bg-slate-100 rounded-full w-2/3"></div>
                   <div className="h-3 bg-slate-50 rounded-full w-1/3"></div>
                   <div className="h-12 bg-slate-50 rounded-xl w-full"></div>
                </Card>
              ))
            ) : filteredProjects.length > 0 ? (
              filteredProjects.map((project) => (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-5 bg-white rounded-[1.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-all active:scale-[0.99]"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      {selectMode && (
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer mr-1 shrink-0 animate-in fade-in zoom-in-95 duration-150"
                          checked={selectedProjectIds.includes(project.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedProjectIds(prev => [...prev, project.id]);
                            } else {
                              setSelectedProjectIds(prev => prev.filter(id => id !== project.id));
                            }
                          }}
                          aria-label={`Select project ${project.name}`}
                        />
                      )}
                      <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ring-1 ring-indigo-100">
                        {project.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-black text-slate-900 truncate tracking-tight">{project.name}</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">{project.client.name}</p>
                      </div>
                    </div>
                    <StatusBadge status={project.status === 'Inactive' ? 'inactive' : 'active'} />
                  </div>

                  <div className="grid grid-cols-3 gap-4 py-4 border-y border-slate-50 mb-4 bg-slate-50/30 rounded-2xl px-4">
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">ID Code</p>
                      <p className="text-xs font-bold text-slate-700">{project.projectId}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Billing</p>
                      <p className="text-xs font-bold text-slate-700">{project.billable ? 'Billable' : 'Internal'}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Logged</p>
                      <p className="text-xs font-bold text-slate-700">{project.loggedHours ?? 0}h</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex -space-x-1.5 focus:z-10 group-hover:z-10">
                        {project.users?.slice(0, 4).map((u, i) => (
                        <Avatar key={i} name={`${u.employee.firstName} ${u.employee.lastName}`} size="xs" border className="ring-2 ring-white" />
                      ))}
                      {project.users?.length > 4 && (
                        <div className="w-6 h-6 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-[9px] font-black text-slate-600 shadow-sm">
                          +{project.users.length - 4}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                       {hasPermission('projects', 'canEdit') && (
                         <StatusToggle
                           id={project.id}
                           status={project.status}
                           onUpdate={fetchData}
                           type="project"
                         />
                       )}
                       {hasPermission('projects', 'canEdit') && (
                         <Button size="sm" variant="ghost" className="h-9 w-9 p-0 bg-slate-50 hover:bg-indigo-50 text-indigo-600 rounded-xl" onClick={() => handleEditProject(project)}>
                           <PencilSquareIcon className="w-4 h-4" />
                         </Button>
                       )}
                       {hasPermission('projects', 'canDelete') && (
                         <Button size="sm" variant="ghost" className="h-9 w-9 p-0 bg-slate-50 hover:bg-rose-50 text-rose-600 rounded-xl" onClick={() => handleDeleteProject(project.id)}>
                           <TrashIcon className="w-4 h-4" />
                         </Button>
                       )}
                    </div>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="py-20 text-center opacity-40 italic font-black text-sm">No project masters detected.</div>
            )}
          </div>

          {/* 🖥️ Desktop Project Table (Visible > 1024px) */}
          <div className="hidden lg:block">
            <table className="w-full text-left border-collapse">
              <thead style={{background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #1e40af 100%)'}}>
                <tr>
                  {selectMode && (
                    <th className="pl-4 py-2.5 w-10 animate-in fade-in slide-in-from-left-2 duration-150">
                      <input
                        type="checkbox"
                        className="rounded border-slate-500 text-blue-400 focus:ring-blue-400 w-4 h-4 cursor-pointer"
                        checked={filteredProjects.length > 0 && selectedProjectIds.length === filteredProjects.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedProjectIds(filteredProjects.map(p => p.id));
                          } else {
                            setSelectedProjectIds([]);
                          }
                        }}
                        aria-label="Select all projects"
                      />
                    </th>
                  )}
                  <th className="px-4 py-2.5"><span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.12em]">Project</span></th>
                  <th className="px-4 py-2.5"><span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.12em]">Status</span></th>
                  <th className="px-4 py-2.5"><span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.12em]">Team</span></th>
                  <th className="px-4 py-2.5"><span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.12em]">Logged Hours</span></th>
                  <th className="px-4 py-2.5"><span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.12em]">Timeline</span></th>
                  <th className="px-4 py-2.5 text-right"><span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.12em]">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading && projects.length === 0 ? (
                  <tr>
                    <td colSpan={selectMode ? 7 : 6} className="p-0">
                      <TableSkeleton rows={8} columns={selectMode ? 7 : 6} />
                    </td>
                  </tr>
                ) : filteredProjects.length > 0 ? (
                  filteredProjects.map((project) => (
                    <tr key={project.id} className="hover:bg-slate-50 group transition-all duration-150">
                      {selectMode && (
                        <td className="pl-4 py-2 w-10 whitespace-nowrap animate-in fade-in slide-in-from-left-2 duration-150">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                            checked={selectedProjectIds.includes(project.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedProjectIds(prev => [...prev, project.id]);
                              } else {
                                setSelectedProjectIds(prev => prev.filter(id => id !== project.id));
                              }
                            }}
                            aria-label={`Select project ${project.name}`}
                          />
                        </td>
                      )}
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-white shadow-sm border border-slate-100 text-indigo-600 rounded-xl flex items-center justify-center font-black text-xs shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                            {project.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-black text-slate-900 leading-tight truncate tracking-tight">{project.name}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{project.projectId} • {project.client.name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="space-y-1">
                          <StatusBadge status={project.status === 'Inactive' ? 'inactive' : 'active'} />
                          <div className="flex items-center gap-1">
                             <div className={`w-1.5 h-1.5 rounded-full ${project.billable ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                             <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter whitespace-nowrap">{project.billable ? 'Billable' : 'Internal'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="flex -space-x-2">
                          {project.users?.slice(0, 3).map((u, i) => (
                            <Avatar key={i} name={`${u.employee.firstName} ${u.employee.lastName}`} size="sm" border className="ring-2 ring-white" />
                          ))}
                          {project.users?.length > 3 && (
                            <div className="w-7 h-7 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[9px] font-black text-slate-500 shadow-sm">
                              +{project.users.length - 3}
                            </div>
                          )}
                          {(!project.users || project.users.length === 0) && (
                            <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest italic">None</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[13px] font-black text-blue-600">{project.loggedHours ?? 0}</p>
                          <span className="text-[10px] text-slate-400">hrs</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <p className="text-[11px] font-black text-slate-700">{new Date(project.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</p>
                          <div className="w-3 h-px bg-slate-200"></div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{project.contactPerson || 'N/A'}</p>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                          {hasPermission('projects', 'canEdit') && (
                            <StatusToggle
                              id={project.id}
                              status={project.status}
                              onUpdate={fetchData}
                              type="project"
                            />
                          )}
                          {hasPermission('projects', 'canEdit') && (
                            <button 
                              onClick={() => handleEditProject(project)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 rounded-lg shadow-sm transition-all" title="Edit Project" aria-label="Edit project details"
                            >
                              <PencilSquareIcon className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {hasPermission('projects', 'canDelete') && (
                            <button 
                              onClick={() => handleDeleteProject(project.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-red-50 border border-transparent hover:border-red-100 rounded-lg shadow-sm transition-all" title="Delete Project" aria-label="Delete project"
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
                    <td colSpan={selectMode ? 7 : 6} className="py-24 text-center">
                       <div className="inline-flex flex-col items-center">
                          <BriefcaseIcon className="w-12 h-12 text-slate-100 mb-4" />
                          <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em]">Grid Empty</p>
                       </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* Add Project Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Initiate Project Master"
        size="lg"
      >
        <form onSubmit={handleCreateProject} className="space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Select Client *"
              value={formData.clientId}
              onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
              required
            >
              <option value="">{loading ? "Loading clients..." : "Choose a Client Registry"}</option>
              {clients.length > 0 ? (
                clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)
              ) : !loading && (
                <option disabled>No clients found</option>
              )}
            </Select>
            <Input
              label="Project Title *"
              placeholder="e.g. Statutory Audit FY 2024-25"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Select
              label="Project Status *"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              required
            >
              <option value="Started">Started</option>
              <option value="In-Discussion">In-Discussion</option>
              <option value="Completed">Completed</option>
              <option value="Inactive">Inactive</option>
            </Select>
            <Input
              label="Start Date *"
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              required
            />
            <Select
              label="Billing Category *"
              value={formData.billable}
              onChange={(e) => setFormData({ ...formData, billable: e.target.value })}
              required
            >
              <option value="Billable">Billable</option>
              <option value="Non-Billable">Non-Billable</option>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Client Contact Person"
              placeholder="Primary Point of Contact"
              value={formData.contactPerson}
              onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
              leftIcon={<IdentificationIcon />}
            />
            <Input
              label="Commissioned By"
              value={user?.name || 'System User'}
              disabled
              placeholder="Captured from session"
              leftIcon={<ShieldCheckIcon />}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-secondary-700 block ml-0.5">Assign Delivery Team (Optional)</label>
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
              <option value="" disabled>Choose team members...</option>
              {allEmployees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName} ({emp.employeeId})
                </option>
              ))}
            </Select>
            
            {/* Show selected team members */}
            <div className="mt-2 flex flex-wrap gap-2">
              {formData.assignedEmployees.map((userId: string) => {
                const emp = allEmployees.find(e => e.id === userId);
                return emp ? (
                  <div key={userId} className="inline-flex items-center gap-1 px-2 py-1 bg-primary-100 text-primary-700 rounded-full text-xs font-medium">
                    {emp.firstName} {emp.lastName}
                    <button
                      type="button"
                      onClick={() => {
                        setFormData((prev) => ({
                          ...prev,
                          assignedEmployees: prev.assignedEmployees.filter((id: string) => id !== userId)
                        }));
                      }}
                      className="ml-1 text-primary-500 hover:text-primary-700"
                    >
                      ×
                    </button>
                  </div>
                ) : null;
              })}
            </div>
            <p className="text-[10px] font-bold text-secondary-400 uppercase tracking-widest pl-1">{formData.assignedEmployees.length} Resource(s) Allocated</p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <Input
              label="Unique Project ID"
              value={generatedProjectId || 'Click "Initiate Project" to generate ID'}
              disabled
              placeholder="PRJ-0001 format (auto-generated)"
            />
          </div>

          <div className="pt-3 flex gap-3">
            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={() => setShowAddModal(false)}
              className="h-9 border-secondary-200"
            >
              Cancel Setup
            </Button>
            <Button
              type="submit"
              variant="primary"
              fullWidth
              className="h-9 font-extrabold shadow-md shadow-primary-500/10"
            >
              Initiate Project Record
            </Button>
          </div>
        </form>
      </Modal>
      
      {/* Edit Project Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingProject(null);
          setFormData({
            name: '',
            clientId: '',
            status: 'Started',
            startDate: new Date().toISOString().split('T')[0],
            billable: 'Billable',
            contactPerson: '',
            assignedEmployees: []
          });
        }}
        title="Modify Project Master"
        size="lg"
      >
        <form onSubmit={handleUpdateProject} className="space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Select Client *"
              value={formData.clientId}
              onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
              required
            >
              <option value="">{loading ? "Loading clients..." : "Choose a Client Registry"}</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Input
              label="Project Title *"
              placeholder="e.g. Statutory Audit FY 2024-25"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Select
              label="Project Status *"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              required
            >
              <option value="Started">Started</option>
              <option value="In-Discussion">In-Discussion</option>
              <option value="Completed">Completed</option>
              <option value="Inactive">Inactive</option>
            </Select>
            <Input
              label="Start Date *"
              type="date"
              value={formData.startDate ? formData.startDate.split('T')[0] : ''}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              required
            />
            <Select
              label="Billing Category *"
              value={formData.billable}
              onChange={(e) => setFormData({ ...formData, billable: e.target.value })}
              required
            >
              <option value="Billable">Billable</option>
              <option value="Non-Billable">Non-Billable</option>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Client Contact Person"
              placeholder="Primary Point of Contact"
              value={formData.contactPerson}
              onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
              leftIcon={<IdentificationIcon />}
            />
            <Input
              label="Commissioned By"
              value={user?.name || 'System User'}
              disabled
              placeholder="Captured from session"
              leftIcon={<ShieldCheckIcon />}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-secondary-700 block ml-0.5">Assign Delivery Team (Optional)</label>
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
              <option value="" disabled>Choose team members...</option>
              {allEmployees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName} ({emp.employeeId})
                </option>
              ))}
            </Select>
            
            {/* Show selected team members */}
            <div className="mt-2 flex flex-wrap gap-2">
              {formData.assignedEmployees.map((userId: string) => {
                const emp = allEmployees.find(e => e.id === userId);
                return emp ? (
                  <div key={userId} className="inline-flex items-center gap-1 px-2 py-1 bg-primary-100 text-primary-700 rounded-full text-xs font-medium">
                    {emp.firstName} {emp.lastName}
                    <button
                      type="button"
                      onClick={() => {
                        setFormData((prev) => ({
                          ...prev,
                          assignedEmployees: prev.assignedEmployees.filter((id: string) => id !== userId)
                        }));
                      }}
                      className="ml-1 text-primary-500 hover:text-primary-700"
                    >
                      ×
                    </button>
                  </div>
                ) : null;
              })}
            </div>
            <p className="text-[10px] font-bold text-secondary-400 uppercase tracking-widest pl-1">{formData.assignedEmployees.length} Resource(s) Allocated</p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <Input
              label="Unique Project ID"
              value={editingProject?.projectId || ''}
              disabled
              placeholder="Auto-assigned ID"
            />
          </div>

          <div className="pt-3 flex gap-3">
            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={() => {
                setShowEditModal(false);
                setEditingProject(null);
              }}
              className="h-9 border-secondary-200"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              fullWidth
              className="h-9 font-extrabold shadow-md shadow-primary-500/10"
            >
              Update Project Record
            </Button>
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
        title="Bulk Project Import"
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
                    <li>Required columns: <strong>name, clientName</strong></li>
                    <li>Optional: status (Started/Completed/In-Discussion), billable (Yes/No), startDate, contactPerson</li>
                    <li>Download the template to see the correct format.</li>
                  </ul>
                </div>
              </div>
              <input
                type="file"
                accept=".xlsx"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="w-full p-3 border-2 border-dashed border-primary-200 rounded-xl"
                title="Select Project Excel File"
                aria-label="Upload Project Template"
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

      {/* Mobile FAB */}
      {hasPermission('projects', 'canCreate') && (
        <FAB
          onClick={() => {
            generateProjectId();
            setShowAddModal(true);
          }}
          label="Initiate Project"
        />
      )}
    </div>
  );
};

export default Projects;
