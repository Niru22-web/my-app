import React, { useState, useEffect, useRef, useCallback } from 'react';
import API from '../api';
import { useToast } from '../contexts/ToastContext';
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import {
  MagnifyingGlassIcon,
  PlusIcon,
  PencilSquareIcon,
  ArrowPathIcon,
  BuildingOfficeIcon
} from '@heroicons/react/24/outline';
import ASALoader from '../components/ui/ASALoader';

interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  officeEmail: string;
  designation: string;
  department: string;
  role: string;
  status: string;
  profileImage?: string;
  reportingPartnerIds?: string[];
  reportingManagerIds?: string[];
  subManagerIds?: string[];
  partnerId?: string | null;
  managerId?: string | null;
  subManagerId?: string | null;
}

export default function OrganizationHierarchy() {
  const toast = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  
  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    officeEmail: '',
    role: 'Employee',
    designation: '',
    department: 'Accounting',
    partnerIds: [] as string[],
    managerIds: [] as string[],
    subManagerIds: [] as string[]
  });

  const roles = ['Partner', 'Manager', 'Sub Manager', 'Employee'];
  const departments = ['Accounting', 'Taxation', 'Audit', 'Advisory', 'Human Resources', 'IT Support', 'General'];

  const treeViewportRef = useRef<HTMLDivElement>(null);

  // Fetch employees
  const fetchEmployees = useCallback(async () => {
    try {
      setLoading(true);
      const response = await API.get('/employees?all=true');
      let data: Employee[] = [];
      if (response.data?.success && Array.isArray(response.data.data)) {
        data = response.data.data;
      } else if (Array.isArray(response.data)) {
        data = response.data;
      }
      setEmployees(data);

      // Auto-expand first partner by default
      const partnersList = data.filter(emp => emp.role === 'Partner');
      if (partnersList.length > 0) {
        setExpandedNodes(new Set([partnersList[0].id]));
      }
    } catch (err) {
      console.error('Error fetching employees:', err);
      toast.error('Failed to load hierarchy data');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Collapsing / Expanding logic
  const toggleNode = (id: string, parentId: string | null = null) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        // Collapsing
        next.delete(id);
      } else {
        // Expanding
        next.add(id);
        // Auto-collapse siblings
        if (parentId) {
          const siblings = getDirectChildren(parentId);
          siblings.forEach(sib => {
            if (sib.id !== id) next.delete(sib.id);
          });
        } else {
          // Root level (Partner), collapse other partners
          const partners = employees.filter(e => e.role === 'Partner');
          partners.forEach(p => {
            if (p.id !== id) next.delete(p.id);
          });
        }
      }
      return next;
    });
  };

  // Helper: Get direct descendants to prevent loops
  const getDescendantIds = (rootId: string): Set<string> => {
    const descendants = new Set<string>();
    const queue = [rootId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const children = employees.filter(emp => 
        emp.reportingPartnerIds?.includes(current) ||
        emp.reportingManagerIds?.includes(current) ||
        emp.subManagerIds?.includes(current) ||
        emp.partnerId === current ||
        emp.managerId === current ||
        emp.subManagerId === current
      );
      children.forEach(c => {
        if (!descendants.has(c.id)) {
          descendants.add(c.id);
          queue.push(c.id);
        }
      });
    }
    return descendants;
  };

  // Open modals
  const openAddModal = () => {
    setFormData({
      firstName: '',
      lastName: '',
      officeEmail: '',
      role: 'Employee',
      designation: '',
      department: 'Accounting',
      partnerIds: [],
      managerIds: [],
      subManagerIds: []
    });
    setShowAddModal(true);
  };

  const openEditModal = (emp: Employee) => {
    setSelectedEmpId(emp.id);
    setFormData({
      firstName: emp.firstName || '',
      lastName: emp.lastName || '',
      officeEmail: emp.officeEmail || '',
      role: emp.role || 'Employee',
      designation: emp.designation || '',
      department: emp.department || 'Accounting',
      partnerIds: emp.reportingPartnerIds || (emp.partnerId ? [emp.partnerId] : []),
      managerIds: emp.reportingManagerIds || (emp.managerId ? [emp.managerId] : []),
      subManagerIds: emp.subManagerIds || (emp.subManagerId ? [emp.subManagerId] : [])
    });
    setShowEditModal(true);
  };

  const openDeleteConfirm = (id: string) => {
    setSelectedEmpId(id);
    setShowDeleteConfirm(true);
  };

  // Submissions
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.firstName || !formData.lastName || !formData.officeEmail || !formData.designation) {
      toast.error('All standard fields are required');
      return;
    }

    try {
      const payload = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        officeEmail: formData.officeEmail,
        role: formData.role,
        designation: formData.designation,
        department: formData.department,
        status: 'active',
        reportingPartnerIds: formData.partnerIds,
        reportingManagerIds: formData.managerIds,
        subManagerIds: formData.subManagerIds,
        partnerId: formData.partnerIds[0] || null,
        managerId: formData.managerIds[0] || null,
        subManagerId: formData.subManagerIds[0] || null
      };

      await API.post('/employees', payload);
      toast.success('Employee added successfully');
      setShowAddModal(false);
      fetchEmployees();
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error || 'Failed to create employee');
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpId) return;

    // Check loops
    const descendants = getDescendantIds(selectedEmpId);
    const hasLoop = formData.partnerIds.includes(selectedEmpId) || 
                    formData.managerIds.includes(selectedEmpId) ||
                    formData.subManagerIds.includes(selectedEmpId) ||
                    formData.partnerIds.some(id => descendants.has(id)) ||
                    formData.managerIds.some(id => descendants.has(id)) ||
                    formData.subManagerIds.some(id => descendants.has(id));

    if (hasLoop) {
      toast.error('Circular reporting loop detected. An employee cannot report to themselves or their descendants.');
      return;
    }

    try {
      const payload = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        officeEmail: formData.officeEmail,
        role: formData.role,
        designation: formData.designation,
        department: formData.department,
        status: 'active',
        reportingPartnerIds: formData.partnerIds,
        reportingManagerIds: formData.managerIds,
        subManagerIds: formData.subManagerIds,
        partnerId: formData.partnerIds[0] || null,
        managerId: formData.managerIds[0] || null,
        subManagerId: formData.subManagerIds[0] || null
      };

      await API.put(`/employees/${selectedEmpId}`, payload);
      toast.success('Reporting connections updated successfully');
      setShowEditModal(false);
      fetchEmployees();
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error || 'Failed to update employee');
    }
  };

  const handleDeleteSubmit = async () => {
    if (!selectedEmpId) return;
    try {
      await API.delete(`/employees/${selectedEmpId}`);
      toast.success('Employee deleted successfully');
      setShowDeleteConfirm(false);
      fetchEmployees();
    } catch (err) {
      toast.error('Failed to delete employee');
    }
  };

  // Search filtering
  const matchesSearch = (emp: Employee) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      emp.firstName.toLowerCase().includes(query) ||
      emp.lastName.toLowerCase().includes(query) ||
      emp.designation.toLowerCase().includes(query) ||
      emp.employeeId.toLowerCase().includes(query) ||
      `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(query)
    );
  };

  // Exclude current employee and descendants from dropdown choices
  const availablePartners = employees.filter(emp => emp.role === 'Partner' && emp.id !== selectedEmpId && !(selectedEmpId && getDescendantIds(selectedEmpId).has(emp.id)));
  const availableManagers = employees.filter(emp => emp.role === 'Manager' && emp.id !== selectedEmpId && !(selectedEmpId && getDescendantIds(selectedEmpId).has(emp.id)));
  const availableSubManagers = employees.filter(emp => emp.role === 'Sub Manager' && emp.id !== selectedEmpId && !(selectedEmpId && getDescendantIds(selectedEmpId).has(emp.id)));

  // Core helper declarations for multi-column layout



  // Helper: Get direct descendants of a given parent employee using proper bottom-up priority
  const getDirectChildren = (parentId: string): Employee[] => {
    return employees.filter(emp => {
      // Determine the most direct manager to avoid duplicates
      if (emp.subManagerIds?.length || emp.subManagerId) {
        return emp.subManagerIds?.includes(parentId) || emp.subManagerId === parentId;
      }
      if (emp.reportingManagerIds?.length || emp.managerId) {
        return emp.reportingManagerIds?.includes(parentId) || emp.managerId === parentId;
      }
      if (emp.reportingPartnerIds?.length || emp.partnerId) {
        return emp.reportingPartnerIds?.includes(parentId) || emp.partnerId === parentId;
      }
      return false; // No direct reporting manager identified
    });
  };

  // Helper to count recursive descendants under a node for the count badge
  const getSubtreeCount = (empId: string): number => {
    let count = 0;
    const queue = [empId];
    const visited = new Set<string>();
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      
      const children = getDirectChildren(current);
      count += children.length;
      children.forEach(c => {
        if (!visited.has(c.id)) {
          queue.push(c.id);
        }
      });
    }
    return count;
  };

  const hasMatchingDescendant = (emp: Employee): boolean => {
    if (matchesSearch(emp)) return true;
    const directKids = getDirectChildren(emp.id);
    return directKids.some(k => hasMatchingDescendant(k));
  };

  return (
    <div className="h-[calc(100vh-180px)] sm:h-[calc(100vh-188px)] lg:h-[calc(100vh-152px)] bg-slate-50 flex flex-col font-sans antialiased selection:bg-indigo-500 selection:text-white overflow-auto rounded-2xl border border-slate-200 shadow-sm relative">
      {/* Top Header Controls */}
      <div className="bg-white border-b border-slate-200/80 px-6 py-2.5 flex flex-col md:flex-row items-center justify-between gap-4 shrink-0 shadow-sm sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600 shrink-0">
            <BuildingOfficeIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-black text-slate-800 tracking-tight leading-none">
              Organization Hierarchy Explorer
            </h1>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative w-full max-w-xs shrink-0">
          <MagnifyingGlassIcon className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search employee or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
          />
        </div>

        {/* Compact Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={fetchEmployees}
            title="Refresh"
            className="p-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-500 transition-colors shadow-sm"
          >
            <ArrowPathIcon className="w-3.5 h-3.5" />
          </button>

          <Button
            onClick={openAddModal}
            size="sm"
            className="rounded-lg flex items-center gap-1 text-[10px] py-1.5 px-3 shadow bg-indigo-600 hover:bg-indigo-700 text-white font-bold border-none"
          >
            <PlusIcon className="w-3.5 h-3.5 stroke-[3]" />
            Add Employee
          </Button>
        </div>
      </div>

      {/* Dynamic Branching tree viewport */}
      <div 
        ref={treeViewportRef}
        className="flex-1 overflow-auto relative bg-slate-50/40 flex flex-col h-full"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full w-full gap-3 mx-auto">
            <ASALoader size="md" text="Building Hierarchy..." />
          </div>
        ) : (
          (() => {
            // Column 1: Partners (always visible)
            const partners = employees.filter(emp => emp.role === 'Partner' && hasMatchingDescendant(emp));

            // Find active Partner (expanded)
            const activePartner = partners.find(p => expandedNodes.has(p.id));

            // Column 2: Managers under active Partner
            const managers = activePartner ? getDirectChildren(activePartner.id).filter(hasMatchingDescendant) : [];

            // Find active Manager (expanded)
            const activeManager = managers.find(m => expandedNodes.has(m.id));

            // Column 3: Sub Managers under active Manager
            const subManagers = activeManager ? getDirectChildren(activeManager.id).filter(hasMatchingDescendant) : [];

            // Find active Sub Manager (expanded)
            const activeSubManager = subManagers.find(sm => expandedNodes.has(sm.id));

            // Column 4: Employees under active Sub Manager
            const employeesList = activeSubManager ? getDirectChildren(activeSubManager.id).filter(hasMatchingDescendant) : [];

            return (
              <div className="flex h-full w-full gap-16 p-8 overflow-x-auto overflow-y-auto custom-scrollbar bg-slate-50/40">
                {/* Column 1: Partners */}
                <div className="flex-shrink-0 w-[272px] h-full overflow-y-auto space-y-4 py-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  {partners.map(partner => (
                    <NodeCard
                      key={partner.id}
                      employee={partner}
                      hasChildren={getDirectChildren(partner.id).length > 0}
                      childCount={getSubtreeCount(partner.id)}
                      isExpanded={expandedNodes.has(partner.id)}
                      onToggle={() => toggleNode(partner.id, null)}
                      onEdit={() => openEditModal(partner)}
                      onDelete={() => openDeleteConfirm(partner.id)}
                      hoveredCardId={hoveredCardId}
                      setHoveredCardId={setHoveredCardId}
                    />
                  ))}
                </div>

                {/* Column 2: Managers */}
                {activePartner && (
                  <div className="flex-shrink-0 w-[272px] h-full overflow-y-auto space-y-4 py-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] animate-in slide-in-from-right-4 duration-200">
                    {managers.map(manager => (
                      <NodeCard
                        key={manager.id}
                        employee={manager}
                        hasChildren={getDirectChildren(manager.id).length > 0}
                        childCount={getSubtreeCount(manager.id)}
                        isExpanded={expandedNodes.has(manager.id)}
                        onToggle={() => toggleNode(manager.id, activePartner.id)}
                        onEdit={() => openEditModal(manager)}
                        onDelete={() => openDeleteConfirm(manager.id)}
                        hoveredCardId={hoveredCardId}
                        setHoveredCardId={setHoveredCardId}
                      />
                    ))}
                  </div>
                )}

                {/* Column 3: Sub Managers */}
                {activeManager && (
                  <div className="flex-shrink-0 w-[272px] h-full overflow-y-auto space-y-4 py-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] animate-in slide-in-from-right-4 duration-200">
                    {subManagers.map(subManager => (
                      <NodeCard
                        key={subManager.id}
                        employee={subManager}
                        hasChildren={getDirectChildren(subManager.id).length > 0}
                        childCount={getSubtreeCount(subManager.id)}
                        isExpanded={expandedNodes.has(subManager.id)}
                        onToggle={() => toggleNode(subManager.id, activeManager.id)}
                        onEdit={() => openEditModal(subManager)}
                        onDelete={() => openDeleteConfirm(subManager.id)}
                        hoveredCardId={hoveredCardId}
                        setHoveredCardId={setHoveredCardId}
                      />
                    ))}
                  </div>
                )}

                {/* Column 4: Employees */}
                {activeSubManager && (
                  <div className="flex-shrink-0 w-[272px] h-full overflow-y-auto space-y-4 py-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] animate-in slide-in-from-right-4 duration-200">
                    {employeesList.map(emp => (
                      <NodeCard
                        key={emp.id}
                        employee={emp}
                        hasChildren={getDirectChildren(emp.id).length > 0}
                        childCount={getSubtreeCount(emp.id)}
                        isExpanded={expandedNodes.has(emp.id)}
                        onToggle={() => toggleNode(emp.id, activeSubManager.id)}
                        onEdit={() => openEditModal(emp)}
                        onDelete={() => openDeleteConfirm(emp.id)}
                        hoveredCardId={hoveredCardId}
                        setHoveredCardId={setHoveredCardId}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })()
        )}
      </div>

      {/* CRUD Modals */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add New Employee to Hierarchy">
        <form onSubmit={handleAddSubmit} className="space-y-4 p-2">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="First Name *"
              value={formData.firstName}
              onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
              placeholder="e.g. John"
              required
            />
            <Input
              label="Last Name *"
              value={formData.lastName}
              onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
              placeholder="e.g. Doe"
              required
            />
          </div>

          <Input
            label="Office Email *"
            type="email"
            value={formData.officeEmail}
            onChange={(e) => setFormData(prev => ({ ...prev, officeEmail: e.target.value }))}
            placeholder="e.g. john.doe@asaind.co.in"
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Role *</label>
              <select
                value={formData.role}
                title="Role Selection"
                onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value, partnerIds: [], managerIds: [], subManagerIds: [] }))}
                className="w-full p-4 bg-gray-50 border-none rounded-2xl text-sm font-bold text-gray-800"
              >
                {roles.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Department *</label>
              <select
                value={formData.department}
                title="Department Selection"
                onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
                className="w-full p-4 bg-gray-50 border-none rounded-2xl text-sm font-bold text-gray-800"
              >
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <Input
            label="Designation *"
            value={formData.designation}
            onChange={(e) => setFormData(prev => ({ ...prev, designation: e.target.value }))}
            placeholder="e.g. Senior Manager"
            required
          />

          {formData.role !== 'Partner' && (
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Configure Reporting Connections</p>
              
              {/* Reporting Partners */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Reporting Partner(s)</label>
                <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto bg-slate-50 p-2 rounded-xl border border-slate-100">
                  {availablePartners.map(p => {
                    const isChecked = formData.partnerIds.includes(p.id);
                    return (
                      <label key={p.id} className="flex items-center gap-1.5 bg-white border border-slate-100 px-2 py-1 rounded-lg text-xs font-bold cursor-pointer hover:bg-slate-100 transition-colors">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setFormData(prev => {
                              const ids = isChecked 
                                ? prev.partnerIds.filter(id => id !== p.id)
                                : [...prev.partnerIds, p.id];
                              return { ...prev, partnerIds: ids };
                            });
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        {p.firstName} {p.lastName}
                      </label>
                    );
                  })}
                  {availablePartners.length === 0 && <span className="text-[11px] italic text-slate-400">No partners available</span>}
                </div>
              </div>

              {/* Reporting Managers */}
              {(formData.role === 'Sub Manager' || formData.role === 'Employee') && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Reporting Manager(s)</label>
                  <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto bg-slate-50 p-2 rounded-xl border border-slate-100">
                    {availableManagers.map(m => {
                      const isChecked = formData.managerIds.includes(m.id);
                      return (
                        <label key={m.id} className="flex items-center gap-1.5 bg-white border border-slate-100 px-2 py-1 rounded-lg text-xs font-bold cursor-pointer hover:bg-slate-100 transition-colors">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setFormData(prev => {
                                const ids = isChecked 
                                  ? prev.managerIds.filter(id => id !== m.id)
                                  : [...prev.managerIds, m.id];
                                return { ...prev, managerIds: ids };
                              });
                            }}
                            className="rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          {m.firstName} {m.lastName}
                        </label>
                      );
                    })}
                    {availableManagers.length === 0 && <span className="text-[11px] italic text-slate-400">No managers available</span>}
                  </div>
                </div>
              )}

              {/* Reporting Sub Managers */}
              {formData.role === 'Employee' && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Reporting Sub-Manager(s)</label>
                  <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto bg-slate-50 p-2 rounded-xl border border-slate-100">
                    {availableSubManagers.map(sm => {
                      const isChecked = formData.subManagerIds.includes(sm.id);
                      return (
                        <label key={sm.id} className="flex items-center gap-1.5 bg-white border border-slate-100 px-2 py-1 rounded-lg text-xs font-bold cursor-pointer hover:bg-slate-100 transition-colors">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setFormData(prev => {
                                const ids = isChecked 
                                  ? prev.subManagerIds.filter(id => id !== sm.id)
                                  : [...prev.subManagerIds, sm.id];
                                return { ...prev, subManagerIds: ids };
                              });
                            }}
                            className="rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          {sm.firstName} {sm.lastName}
                        </label>
                      );
                    })}
                    {availableSubManagers.length === 0 && <span className="text-[11px] italic text-slate-400">No sub-managers available</span>}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setShowAddModal(false)} type="button" className="text-xs">Cancel</Button>
            <Button type="submit" className="text-xs bg-indigo-600 text-white font-bold">Add Employee</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Employee Reporting Connections">
        <form onSubmit={handleEditSubmit} className="space-y-4 p-2">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="First Name *"
              value={formData.firstName}
              onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
              placeholder="e.g. John"
              required
            />
            <Input
              label="Last Name *"
              value={formData.lastName}
              onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
              placeholder="e.g. Doe"
              required
            />
          </div>

          <Input
            label="Office Email *"
            type="email"
            value={formData.officeEmail}
            onChange={(e) => setFormData(prev => ({ ...prev, officeEmail: e.target.value }))}
            placeholder="e.g. john.doe@asaind.co.in"
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Role *</label>
              <select
                value={formData.role}
                title="Role Selection"
                onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value, partnerIds: [], managerIds: [], subManagerIds: [] }))}
                className="w-full p-4 bg-gray-50 border-none rounded-2xl text-sm font-bold text-gray-800"
              >
                {roles.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Department *</label>
              <select
                value={formData.department}
                title="Department Selection"
                onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
                className="w-full p-4 bg-gray-50 border-none rounded-2xl text-sm font-bold text-gray-800"
              >
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <Input
            label="Designation *"
            value={formData.designation}
            onChange={(e) => setFormData(prev => ({ ...prev, designation: e.target.value }))}
            placeholder="e.g. Senior Manager"
            required
          />

          {formData.role !== 'Partner' && (
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Reassign Reporting Connections</p>
              
              {/* Reporting Partners */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Reporting Partner(s)</label>
                <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto bg-slate-50 p-2 rounded-xl border border-slate-100">
                  {availablePartners.map(p => {
                    const isChecked = formData.partnerIds.includes(p.id);
                    return (
                      <label key={p.id} className="flex items-center gap-1.5 bg-white border border-slate-100 px-2 py-1 rounded-lg text-xs font-bold cursor-pointer hover:bg-slate-100 transition-colors">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setFormData(prev => {
                              const ids = isChecked 
                                ? prev.partnerIds.filter(id => id !== p.id)
                                : [...prev.partnerIds, p.id];
                              return { ...prev, partnerIds: ids };
                            });
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        {p.firstName} {p.lastName}
                      </label>
                    );
                  })}
                  {availablePartners.length === 0 && <span className="text-[11px] italic text-slate-400">No partners available</span>}
                </div>
              </div>

              {/* Reporting Managers */}
              {(formData.role === 'Sub Manager' || formData.role === 'Employee') && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Reporting Manager(s)</label>
                  <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto bg-slate-50 p-2 rounded-xl border border-slate-100">
                    {availableManagers.map(m => {
                      const isChecked = formData.managerIds.includes(m.id);
                      return (
                        <label key={m.id} className="flex items-center gap-1.5 bg-white border border-slate-100 px-2 py-1 rounded-lg text-xs font-bold cursor-pointer hover:bg-slate-100 transition-colors">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setFormData(prev => {
                                const ids = isChecked 
                                  ? prev.managerIds.filter(id => id !== m.id)
                                  : [...prev.managerIds, m.id];
                                return { ...prev, managerIds: ids };
                              });
                            }}
                            className="rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          {m.firstName} {m.lastName}
                        </label>
                      );
                    })}
                    {availableManagers.length === 0 && <span className="text-[11px] italic text-slate-400">No managers available</span>}
                  </div>
                </div>
              )}

              {/* Reporting Sub Managers */}
              {formData.role === 'Employee' && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Reporting Sub-Manager(s)</label>
                  <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto bg-slate-50 p-2 rounded-xl border border-slate-100">
                    {availableSubManagers.map(sm => {
                      const isChecked = formData.subManagerIds.includes(sm.id);
                      return (
                        <label key={sm.id} className="flex items-center gap-1.5 bg-white border border-slate-100 px-2 py-1 rounded-lg text-xs font-bold cursor-pointer hover:bg-slate-100 transition-colors">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setFormData(prev => {
                                const ids = isChecked 
                                  ? prev.subManagerIds.filter(id => id !== sm.id)
                                  : [...prev.subManagerIds, sm.id];
                                return { ...prev, subManagerIds: ids };
                              });
                            }}
                            className="rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          {sm.firstName} {sm.lastName}
                        </label>
                      );
                    })}
                    {availableSubManagers.length === 0 && <span className="text-[11px] italic text-slate-400">No sub-managers available</span>}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setShowEditModal(false)} type="button" className="text-xs">Cancel</Button>
            <Button type="submit" className="text-xs bg-indigo-600 text-white font-bold">Save Changes</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title="Delete Employee Confirmation">
        <div className="p-2 space-y-4">
          <p className="text-xs font-semibold text-slate-600 leading-relaxed">
            Are you sure you want to delete this employee? This will permanently delete their profile and remove them from all reporting structures recursively.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)} className="text-xs">Cancel</Button>
            <Button onClick={handleDeleteSubmit} className="text-xs bg-red-600 text-white hover:bg-red-700 font-bold">Delete Permanently</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}



// -------------------------------------------------------------
// COMPACT NODE CARD COMPONENT
// -------------------------------------------------------------
interface NodeCardProps {
  employee: Employee;
  hasChildren: boolean;
  childCount: number;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  hoveredCardId: string | null;
  setHoveredCardId: (id: string | null) => void;
}

function NodeCard({
  employee,
  hasChildren,
  childCount,
  isExpanded,
  onToggle,
  onEdit,
  onDelete: _onDelete,
  hoveredCardId: _hoveredCardId,
  setHoveredCardId
}: NodeCardProps) {
  const isSelected = isExpanded && hasChildren;

  return (
    <div 
      onMouseEnter={() => setHoveredCardId(employee.id)}
      onMouseLeave={() => setHoveredCardId(null)}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={`group w-[272px] shrink-0 relative bg-white rounded-xl p-3 pr-10 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer flex items-center justify-between border ${
        isSelected ? 'border-blue-500 bg-blue-50/20' : 'border-slate-200 hover:border-blue-300'
      }`}
    >
      {/* Floating Hover Actions */}
      <div className="absolute right-8 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          title="Edit"
          className="p-1.5 bg-white shadow-sm border border-slate-200 rounded text-slate-500 hover:text-blue-600 transition-colors"
        >
          <PencilSquareIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Main Details */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Avatar
          src={employee.profileImage}
          name={`${employee.firstName} ${employee.lastName}`}
          size="md"
        />
        <div className="flex flex-col min-w-0 flex-1 pr-6">
          <span className={`text-sm font-semibold truncate ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>
            {employee.firstName} {employee.lastName}
          </span>
          <span className={`text-xs truncate mt-0.5 ${isSelected ? 'text-blue-600' : 'text-slate-500'}`}>
            {employee.designation || 'Specialist'}
          </span>
        </div>
      </div>
      
      {/* Edge Count Badge */}
      {hasChildren && (
        <div 
          className={`absolute right-1.5 top-1/2 -translate-y-1/2 px-2 py-0.5 text-xs font-bold rounded shadow-sm border z-10 transition-colors ${
            isSelected 
              ? 'bg-blue-500 text-white border-blue-500' 
              : 'bg-white text-slate-600 border-slate-200 group-hover:border-blue-300'
          }`}
        >
          {childCount}
        </div>
      )}
    </div>
  );
}
