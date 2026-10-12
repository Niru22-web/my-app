import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FolderOpen, Folder, CornerDownRight, ChevronDown, ChevronRight,
  Plus, Search, Edit2, Trash2, Check, AlertCircle,
  ToggleLeft, ToggleRight, RefreshCw, Download,
  Upload, Clock, Network, Info
} from 'lucide-react';
import API from '../api';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import ASALoader from '../components/ui/ASALoader';

// Unified UI Components
import AppModal from '../components/ui/AppModal';
import AppAccordion from '../components/ui/AppAccordion';
import AppInput from '../components/ui/AppInput';
import AppDropdown from '../components/ui/AppDropdown';
import AppToggle from '../components/ui/AppToggle';
import AppButton from '../components/ui/AppButton';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Category {
  id: number;
  parentId: number | null;
  categoryName: string;
  description?: string | null;
  isActive: boolean;
  displayOrder: number;
  assignedTeam: string;
  slaHours: number;
  createdAt?: string;
  subcategories: Category[];
  supportEmail?: string | null;
  ccEmail?: string | null;
  escalationEmail?: string | null;
  autoAssignUserId?: string | null;
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  employeeId?: string | null;
}

interface CategoryMasterProps {
  isEmbedded?: boolean;
}

const CategoryMaster: React.FC<CategoryMasterProps> = ({ isEmbedded = false }) => {
  const toast = useToast();
  const { confirm } = useConfirm();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  
  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [slaFilter, setSlaFilter] = useState<'all' | 'standard' | 'extended'>('all');
  
  // Expanded Nodes
  const [expandedCategories, setExpandedCategories] = useState<Record<number, boolean>>({});

  // Form States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Category | null>(null);
  const [parentCategoryForSub, setParentCategoryForSub] = useState<Category | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  // Form Fields
  const [categoryName, setCategoryName] = useState('');
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState<number | null>(null);
  const [displayOrder, setDisplayOrder] = useState<number>(0);
  const [isActive, setIsActive] = useState(true);
  const [assignedTeam, setAssignedTeam] = useState('IT');
  const [slaHours, setSlaHours] = useState<number>(24);
  const [supportEmail, setSupportEmail] = useState('');
  const [ccEmail, setCcEmail] = useState('');
  const [escalationEmail, setEscalationEmail] = useState('');
  const [autoAssignUserId, setAutoAssignUserId] = useState('');

  // View Details Modal State
  const [viewingItem, setViewingItem] = useState<Category | null>(null);

  // Fetch helpdesk categories tree
  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      
      // We pass filters as query parameters
      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim());
      }
      
      const response = await API.get(`/helpdesk/categories?${params}`);
      if (response.data?.success) {
        setCategories(response.data.data || []);
      }
    } catch (err: unknown) {
      console.error('Failed to fetch helpdesk categories:', err);
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to fetch categories');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery, toast]);

  const fetchEmployees = useCallback(async () => {
    try {
      const response = await API.get('/employees');
      if (response.data?.success) {
        setEmployees(response.data.data || []);
      } else if (Array.isArray(response.data)) {
        setEmployees(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch employees:', err);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
    fetchEmployees();
  }, [fetchCategories, fetchEmployees]);

  // Expand / Collapse All
  const handleExpandAll = () => {
    const newExpanded: Record<number, boolean> = {};
    categories.forEach(cat => {
      newExpanded[cat.id] = true;
    });
    setExpandedCategories(newExpanded);
  };

  const handleCollapseAll = () => {
    setExpandedCategories({});
  };

  // Open create form for a parent category
  const handleAddParent = () => {
    setEditingItem(null);
    setParentCategoryForSub(null);
    setCategoryName('');
    setDescription('');
    setParentId(null);
    setDisplayOrder(categories.length + 1);
    setAssignedTeam('IT');
    setSlaHours(24);
    setSupportEmail('');
    setCcEmail('');
    setEscalationEmail('');
    setAutoAssignUserId('');
    setIsActive(true);
    setIsAdvancedOpen(false);
    setIsFormOpen(true);
  };

  // Open create form for a subcategory under a parent
  const handleAddSubcategory = (parent: Category) => {
    setEditingItem(null);
    setParentCategoryForSub(parent);
    setCategoryName('');
    setDescription('');
    setParentId(parent.id);
    setDisplayOrder(parent.subcategories ? parent.subcategories.length + 1 : 1);
    setAssignedTeam(parent.assignedTeam || 'IT');
    setSlaHours(parent.slaHours || 24);
    setSupportEmail(parent.supportEmail || '');
    setCcEmail(parent.ccEmail || '');
    setEscalationEmail(parent.escalationEmail || '');
    setAutoAssignUserId(parent.autoAssignUserId || '');
    setIsActive(true);
    setIsAdvancedOpen(false);
    setIsFormOpen(true);
  };

  // Open edit form for an existing category or subcategory
  const handleEditOpen = (item: Category) => {
    setEditingItem(item);
    
    // Find parent category to determine inheritance context
    const parent = item.parentId ? categories.find(c => c.id === item.parentId) : null;
    setParentCategoryForSub(parent || null);
    
    setCategoryName(item.categoryName);
    setDescription(item.description || '');
    setParentId(item.parentId);
    setDisplayOrder(item.displayOrder);
    setAssignedTeam(item.assignedTeam);
    setSlaHours(item.slaHours);
    setSupportEmail(item.supportEmail || '');
    setCcEmail(item.ccEmail || '');
    setEscalationEmail(item.escalationEmail || '');
    setAutoAssignUserId(item.autoAssignUserId || '');
    setIsActive(item.isActive);
    setIsAdvancedOpen(false);
    setIsFormOpen(true);
  };

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryName.trim()) {
      toast.error('Category name is required');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        categoryName: categoryName.trim(),
        description: description.trim() || null,
        parentId: parentId,
        displayOrder: displayOrder,
        isActive: isActive,
        assignedTeam: assignedTeam,
        slaHours: Number(slaHours),
        supportEmail: (supportEmail.trim() === '' || (parentCategoryForSub && supportEmail.trim() === parentCategoryForSub.supportEmail)) ? null : supportEmail.trim(),
        ccEmail: (ccEmail.trim() === '' || (parentCategoryForSub && ccEmail.trim() === parentCategoryForSub.ccEmail)) ? null : ccEmail.trim(),
        escalationEmail: (escalationEmail.trim() === '' || (parentCategoryForSub && escalationEmail.trim() === parentCategoryForSub.escalationEmail)) ? null : escalationEmail.trim(),
        autoAssignUserId: (autoAssignUserId === '' || (parentCategoryForSub && autoAssignUserId === parentCategoryForSub.autoAssignUserId)) ? null : autoAssignUserId
      };

      console.log('[CategoryMaster] Saving category payload:', JSON.stringify(payload, null, 2));

      if (editingItem) {
        const response = await API.put(`/helpdesk/categories/${editingItem.id}`, payload);
        console.log('[CategoryMaster] Update response:', JSON.stringify(response.data, null, 2));
        if (response.data?.success) {
          toast.success('Category updated successfully');
          setIsFormOpen(false);
          // Update viewingItem if currently viewing this item
          if (viewingItem && viewingItem.id === editingItem.id) {
            setViewingItem({ ...viewingItem, ...response.data.data });
          }
          await fetchCategories();
        } else {
          toast.error(response.data?.message || 'Update failed — please try again');
        }
      } else {
        const response = await API.post('/helpdesk/categories', payload);
        console.log('[CategoryMaster] Create response:', JSON.stringify(response.data, null, 2));
        if (response.data?.success) {
          toast.success('Category created successfully');
          setIsFormOpen(false);
          await fetchCategories();
        } else {
          toast.error(response.data?.message || 'Create failed — please try again');
        }
      }
    } catch (err: unknown) {
      console.error('[CategoryMaster] Failed to save category:', err);
      const error = err as { response?: { data?: { message?: string } }; message?: string };
      const errMsg = error.response?.data?.message || error.message || 'Failed to save category';
      toast.error(errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  // Quick toggle status
  const handleToggleStatus = async (item: Category) => {
    try {
      const payload = {
        isActive: !item.isActive
      };
      const response = await API.put(`/helpdesk/categories/${item.id}`, payload);
      if (response.data?.success) {
        toast.success(`"${item.categoryName}" is now ${!item.isActive ? 'Active' : 'Inactive'}`);
        fetchCategories();
      }
    } catch (err: unknown) {
      console.error('Failed to toggle status:', err);
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to toggle status');
    }
  };

  // Delete category
  const handleDelete = async (item: Category) => {
    const isParent = item.parentId === null;
    const confirmMessage = isParent
      ? `Are you sure you want to delete "${item.categoryName}"? This will delete all its subcategories and cannot be undone.`
      : `Are you sure you want to delete subcategory "${item.categoryName}"?`;

    const confirmed = await confirm({
      title: isParent ? 'Delete Category' : 'Delete Subcategory',
      message: confirmMessage,
      isDelete: true
    });
    if (!confirmed) return;

    try {
      const response = await API.delete(`/helpdesk/categories/${item.id}`);
      if (response.data?.success) {
        toast.success('Category deleted successfully');
        fetchCategories();
      }
    } catch (err: unknown) {
      console.error('Failed to delete category:', err);
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to delete category');
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedCategories(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Export categories to JSON file
  const handleExport = () => {
    try {
      const jsonStr = JSON.stringify(categories, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `HelpDesk_Categories_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      toast.success('Categories exported successfully!');
    } catch (err) {
      console.error('Export failed:', err);
      toast.error('Failed to export categories');
    }
  };

  // Mock Import function triggers seed restoration or prompts user
  const handleImportClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event: ProgressEvent<FileReader>) => {
        try {
          const result = event.target?.result;
          if (typeof result !== 'string') return;
          const parsed = JSON.parse(result);
          if (Array.isArray(parsed)) {
            // Import batch
            let importedCount = 0;
            for (const item of parsed) {
              const payload = {
                categoryName: item.categoryName || item.category_name,
                description: item.description,
                parentId: null,
                displayOrder: item.displayOrder || item.display_order || 0,
                isActive: item.isActive !== undefined ? item.isActive : (item.is_active !== undefined ? item.is_active : true),
                assignedTeam: item.assignedTeam || item.assigned_team || 'IT',
                slaHours: item.slaHours || item.sla_hours || 24
              };
              
              // Post parent category
              const res = await API.post('/helpdesk/categories', payload);
              if (res.data?.success && item.subcategories?.length > 0) {
                const parentId = res.data.data.id;
                for (const sub of item.subcategories) {
                  await API.post('/helpdesk/categories', {
                    categoryName: sub.categoryName || sub.category_name,
                    description: sub.description,
                    parentId: parentId,
                    displayOrder: sub.displayOrder || sub.display_order || 0,
                    isActive: sub.isActive !== undefined ? sub.isActive : (sub.is_active !== undefined ? sub.is_active : true),
                    assignedTeam: sub.assignedTeam || sub.assigned_team || payload.assignedTeam,
                    slaHours: sub.slaHours || sub.sla_hours || payload.slaHours
                  });
                }
              }
              importedCount++;
            }
            toast.success(`Successfully imported ${importedCount} categories!`);
            fetchCategories();
          } else {
            toast.error('Invalid JSON structure. Root must be an array of categories.');
          }
        } catch (err) {
          toast.error('Failed to parse category file.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // Filter Categories locally based on Team and SLA filters to maintain advanced tree filtering
  const getFilteredCategories = () => {
    return categories.map(cat => {
      // Filter subcategories first
      const filteredSubs = (cat.subcategories || []).filter(sub => {
        // Team filter
        if (teamFilter !== 'all' && sub.assignedTeam !== teamFilter) return false;
        
        // SLA filter
        if (slaFilter === 'standard' && sub.slaHours > 24) return false;
        if (slaFilter === 'extended' && sub.slaHours <= 24) return false;
        
        return true;
      });

      // If parent matches the filters or has matching subcategories, we keep it
      const matchesTeam = teamFilter === 'all' || cat.assignedTeam === teamFilter;
      const matchesSla = slaFilter === 'all' ||
        (slaFilter === 'standard' && cat.slaHours <= 24) ||
        (slaFilter === 'extended' && cat.slaHours > 24);

      if (matchesTeam && matchesSla) {
        return { ...cat, subcategories: filteredSubs };
      } else if (filteredSubs.length > 0) {
        // Parent does not match filter, but has matching children
        return { ...cat, subcategories: filteredSubs };
      }

      return null;
    }).filter(Boolean) as Category[];
  };

  const filteredTree = getFilteredCategories();

  // Statistics Calculation
  const totalCategories = categories.length;
  const activeCategories = categories.filter(c => c.isActive).length;
  const totalSubcategories = categories.reduce((sum, c) => sum + (c.subcategories ? c.subcategories.length : 0), 0);
  const activeSlaPolicies = categories.filter(c => c.slaHours > 0).length + 
    categories.reduce((sum, c) => sum + (c.subcategories ? c.subcategories.filter(s => s.slaHours > 0).length : 0), 0);

  // Styling helper for assigned teams
  const getTeamBadgeStyle = (team: string) => {
    switch (team?.toUpperCase()) {
      case 'IT':
        return 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-100/60 dark:border-blue-900/30';
      case 'HR':
        return 'bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border-purple-100/60 dark:border-purple-900/30';
      case 'FINANCE':
        return 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-100/60 dark:border-emerald-900/30';
      case 'ADMIN':
        return 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-100/60 dark:border-amber-900/30';
      case 'ACCOUNTS':
        return 'bg-fuchsia-50 dark:bg-fuchsia-950/40 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-100/60 dark:border-fuchsia-900/30';
      default:
        return 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800';
    }
  };

  return (
    <div className={`space-y-6 ${isEmbedded ? '' : 'pb-12'}`}>
      
      {/* ─── TOP HEADER SECTION ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-1.5">
        <div>
          <h1 className="text-lg font-black text-slate-900 dark:text-white leading-tight">
            Help Desk Categories
          </h1>
          <p className="text-slate-500 dark:text-secondary-400 text-xs mt-0.5 font-medium">
            Manage ticket routing categories, routing teams, and SLA guidelines.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleImportClick}
            className="px-3.5 py-2 bg-slate-50 dark:bg-secondary-800 hover:bg-slate-100 dark:hover:bg-secondary-750 text-slate-700 dark:text-secondary-300 border border-slate-200 dark:border-slate-750 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" /> Import
          </button>
          <button
            onClick={handleExport}
            className="px-3.5 py-2 bg-slate-50 dark:bg-secondary-800 hover:bg-slate-100 dark:hover:bg-secondary-750 text-slate-700 dark:text-secondary-300 border border-slate-200 dark:border-slate-750 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Export
          </button>
          <Button
            onClick={handleAddParent}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-2.5 px-4 text-xs font-bold shadow-md transition-all hover:scale-102 active:scale-98 border-none cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add Category
          </Button>
        </div>
      </div>

      {/* ─── MINI STATS CARDS ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
        {[
          { label: 'Total Categories', value: totalCategories, icon: FolderOpen, color: 'text-indigo-500 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20' },
          { label: 'Active Categories', value: activeCategories, icon: Folder, color: 'text-emerald-500 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20' },
          { label: 'Total Subcategories', value: totalSubcategories, icon: Network, color: 'text-amber-500 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20' },
          { label: 'SLA Policies Active', value: activeSlaPolicies, icon: Clock, color: 'text-purple-500 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-950/20' },
        ].map((item, i) => {
          const IconComponent = item.icon;
          return (
            <div
              key={i}
              className="bg-white dark:bg-secondary-900 border border-slate-100 dark:border-secondary-800 p-4 rounded-2xl flex items-center gap-3.5 shadow-sm"
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${item.color}`}>
                <IconComponent className="w-4.5 h-4.5" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-secondary-400 font-extrabold">{item.label}</span>
                <span className="text-slate-900 dark:text-white text-base font-black leading-tight mt-0.5">{item.value}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── SEARCH & STICKY FILTER BAR ─── */}
      <div className="bg-white dark:bg-secondary-900 rounded-2xl border border-gray-100 dark:border-secondary-800 p-4 shadow-sm">
        <div className="flex flex-col xl:flex-row gap-3 items-center justify-between">
          <div className="flex flex-wrap gap-2 items-center w-full xl:w-auto">
            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search category/desc..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-xs bg-gray-50 dark:bg-secondary-800 border border-gray-200 dark:border-secondary-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-white font-semibold"
              />
            </div>

            {/* Team Filter */}
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              aria-label="Filter by support team"
              className="text-xs py-2.5 px-3 bg-gray-50 dark:bg-secondary-800 border border-gray-200 dark:border-secondary-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white font-semibold"
            >
              <option value="all">All Teams</option>
              <option value="IT">IT Support</option>
              <option value="HR">HR Team</option>
              <option value="Finance">Finance Team</option>
              <option value="Admin">Admin Team</option>
              <option value="Accounts">Accounts Team</option>
            </select>

            {/* SLA Filter */}
            <select
              value={slaFilter}
              onChange={(e) => setSlaFilter(e.target.value as 'all' | 'standard' | 'extended')}
              aria-label="Filter by SLA response time"
              className="text-xs py-2.5 px-3 bg-gray-50 dark:bg-secondary-800 border border-gray-200 dark:border-secondary-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white font-semibold"
            >
              <option value="all">All SLAs</option>
              <option value="standard">Standard SLA (≤ 24h)</option>
              <option value="extended">Extended SLA (&gt; 24h)</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
              aria-label="Filter by active status"
              className="text-xs py-2.5 px-3 bg-gray-50 dark:bg-secondary-800 border border-gray-200 dark:border-secondary-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white font-semibold"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 items-center justify-end w-full xl:w-auto border-t xl:border-t-0 pt-3 xl:pt-0">
            <Button
              variant="secondary"
              onClick={handleExpandAll}
              className="px-3 py-2 bg-slate-50 dark:bg-secondary-800 hover:bg-slate-100 dark:hover:bg-secondary-750 text-slate-700 dark:text-secondary-300 border border-slate-200 dark:border-slate-750 rounded-xl text-xs font-bold transition-all"
            >
              Expand All
            </Button>
            <Button
              variant="secondary"
              onClick={handleCollapseAll}
              className="px-3 py-2 bg-slate-50 dark:bg-secondary-800 hover:bg-slate-100 dark:hover:bg-secondary-750 text-slate-700 dark:text-secondary-300 border border-slate-200 dark:border-slate-750 rounded-xl text-xs font-bold transition-all"
            >
              Collapse All
            </Button>
            <Button
              variant="secondary"
              onClick={fetchCategories}
              disabled={loading}
              className="px-3.5 py-2 bg-slate-50 dark:bg-secondary-800 hover:bg-slate-100 dark:hover:bg-secondary-750 text-slate-700 dark:text-secondary-300 border border-slate-200 dark:border-slate-750 rounded-xl text-xs font-bold flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Sync
            </Button>
          </div>
        </div>
      </div>

      {/* ─── MAIN SAAS CATEGORY ACCORDION TREE ─── */}
      <Card className="bg-white dark:bg-secondary-900 rounded-[2rem] border border-gray-100 dark:border-secondary-800 shadow-lg overflow-hidden p-5">
        <div className="table-wrapper min-h-[300px] relative">
          {loading && categories.length === 0 ? (
            <div className="p-16 flex flex-col items-center justify-center space-y-4">
              <ASALoader size="md" />
              <p className="text-xs text-gray-500 dark:text-secondary-400 font-bold">Syncing category definitions...</p>
            </div>
          ) : filteredTree.length === 0 ? (
            <div className="py-24 flex flex-col items-center justify-center gap-3 text-gray-400">
              <AlertCircle className="w-12 h-12 opacity-30 text-indigo-500 animate-bounce" />
              <p className="font-black text-sm text-gray-700 dark:text-white">No categories found matching criteria</p>
              <p className="text-xs text-gray-400">Try adjusting your filters or click Add Category to create a new entry.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredTree.map((cat) => {
                const hasSubs = cat.subcategories && cat.subcategories.length > 0;
                const isExpanded = !!expandedCategories[cat.id];
                
                return (
                  <div 
                    key={cat.id} 
                    className="border border-slate-100 dark:border-secondary-800 rounded-2xl overflow-hidden shadow-sm bg-white dark:bg-secondary-900"
                  >
                    {/* Parent Row Card */}
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 gap-4 hover:bg-slate-50/50 dark:hover:bg-secondary-800/20 transition-all duration-150">
                      
                      {/* Left: Info */}
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <button
                          onClick={() => toggleExpand(cat.id)}
                          className={`p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-secondary-800 text-gray-450 border-none bg-transparent cursor-pointer self-center ${
                            hasSubs ? 'visible' : 'invisible'
                          }`}
                          aria-label={isExpanded ? 'Collapse' : 'Expand'}
                        >
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                        
                        <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center shrink-0 self-center border border-indigo-100/50 dark:border-indigo-900/20">
                          <FolderOpen className="w-5 h-5" />
                        </div>

                        <div className="min-w-0 self-center">
                          <span className="text-sm font-black tracking-tight text-gray-900 dark:text-white block hover:text-indigo-600 transition-colors">
                            {cat.categoryName}
                          </span>
                          {cat.description && (
                            <span className="text-xs text-gray-400 dark:text-secondary-400 block mt-0.5 max-w-xl truncate" title={cat.description}>
                              {cat.description}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Center details */}
                      <div className="flex flex-wrap items-center gap-3 shrink-0 self-center w-full md:w-auto">
                        {/* Display Order */}
                        <div className="flex flex-col items-center">
                          <span className="text-[8px] uppercase tracking-wider text-gray-400 font-extrabold">Order</span>
                          <span className="font-mono text-xs font-bold text-gray-600 dark:text-slate-400 mt-0.5">
                            #{cat.displayOrder}
                          </span>
                        </div>

                        {/* Assigned Team */}
                        <div className="flex flex-col items-center">
                          <span className="text-[8px] uppercase tracking-wider text-gray-400 font-extrabold">Routing Team</span>
                          <span className={`inline-flex items-center border px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider mt-0.5 ${getTeamBadgeStyle(cat.assignedTeam)}`}>
                            {cat.assignedTeam || 'IT'}
                          </span>
                        </div>

                        {/* SLA hours */}
                        <div className="flex flex-col items-center">
                          <span className="text-[8px] uppercase tracking-wider text-gray-400 font-extrabold">SLA Policy</span>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 border border-purple-100/50 dark:border-purple-900/30 px-2 py-0.5 rounded-full mt-0.5">
                            <Clock className="w-3 h-3" /> {cat.slaHours || 24}h
                          </span>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center justify-end gap-2.5 shrink-0 w-full md:w-auto border-t md:border-t-0 pt-2.5 md:pt-0">
                        {/* Status Toggle Switch */}
                        <button
                          onClick={() => handleToggleStatus(cat)}
                          title={cat.isActive ? 'Deactivate Category' : 'Activate Category'}
                          className="bg-transparent border-none cursor-pointer flex items-center"
                        >
                          {cat.isActive ? (
                            <ToggleRight className="w-8 h-8 text-emerald-500 hover:scale-105 transition-transform" />
                          ) : (
                            <ToggleLeft className="w-8 h-8 text-slate-350 dark:text-slate-650 hover:scale-105 transition-transform" />
                          )}
                        </button>

                        <div className="h-4 w-[1px] bg-slate-200 dark:bg-secondary-800" />

                        {/* Action buttons group */}
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleAddSubcategory(cat)}
                            title="Add Subcategory"
                            className="p-2 rounded-full text-indigo-600 bg-slate-50 hover:bg-indigo-100/50 dark:bg-secondary-800 dark:hover:bg-indigo-950/30 border-none cursor-pointer transition-all duration-200 flex items-center justify-center"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setViewingItem(cat)}
                            title="View Info"
                            className="p-2 rounded-full text-slate-500 bg-slate-50 hover:bg-slate-100 dark:bg-secondary-800 dark:hover:bg-secondary-750 border-none cursor-pointer transition-all duration-200 flex items-center justify-center"
                          >
                            <Info className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEditOpen(cat)}
                            title="Edit Category & Routing"
                            className="p-2 rounded-full text-blue-600 bg-slate-50 hover:bg-blue-105/50 dark:bg-secondary-800 dark:hover:bg-blue-950/30 border-none cursor-pointer transition-all duration-200 flex items-center justify-center"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(cat)}
                            title="Delete Category"
                            className="p-2 rounded-full text-red-600 bg-slate-50 hover:bg-red-100/50 dark:bg-secondary-800 dark:hover:bg-red-950/30 border-none cursor-pointer transition-all duration-200 flex items-center justify-center"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Subcategories Children (Animate expansion) */}
                    <AnimatePresence initial={false}>
                      {isExpanded && cat.subcategories && cat.subcategories.length > 0 && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: 'easeInOut' }}
                          className="bg-slate-50/30 dark:bg-secondary-950/20 border-t border-slate-100 dark:border-secondary-850 divide-y divide-slate-100/50 dark:divide-secondary-800/40"
                        >
                          {cat.subcategories.map((sub) => (
                            <div 
                              key={sub.id} 
                              className="flex flex-col md:flex-row items-start md:items-center justify-between p-3.5 pl-10 md:pl-12 gap-3 hover:bg-slate-50 dark:hover:bg-secondary-800/10 transition-all duration-150"
                            >
                              {/* Left details */}
                              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                <CornerDownRight className="w-4 h-4 text-slate-350 dark:text-slate-650 shrink-0 self-center" />
                                <div className="w-8 h-8 bg-amber-50 dark:bg-amber-950/30 text-amber-500 dark:text-amber-400 rounded-lg flex items-center justify-center shrink-0 self-center border border-amber-100/30 dark:border-amber-900/10">
                                  <Folder className="w-4.5 h-4.5" />
                                </div>
                                <div className="min-w-0 self-center">
                                  <span className="text-xs font-bold text-gray-800 dark:text-secondary-105 block">
                                    {sub.categoryName}
                                  </span>
                                  {sub.description && (
                                    <span className="text-[11px] text-gray-400 dark:text-secondary-500 block truncate max-w-xl" title={sub.description}>
                                      {sub.description}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Center details */}
                              <div className="flex flex-wrap items-center gap-3 shrink-0 self-center w-full md:w-auto pl-6 md:pl-0">
                                <span className="font-mono text-[10px] text-gray-500 bg-slate-100 dark:bg-secondary-800 px-2 py-0.5 rounded">
                                  Order #{sub.displayOrder}
                                </span>
                                <span className={`inline-flex items-center border px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${getTeamBadgeStyle(sub.assignedTeam)}`}>
                                  {sub.assignedTeam || cat.assignedTeam}
                                </span>
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/20 border border-purple-100/30 dark:border-purple-900/10 px-2 py-0.5 rounded-full">
                                  <Clock className="w-2.5 h-2.5" /> {sub.slaHours || cat.slaHours}h
                                </span>
                              </div>

                              {/* Right details */}
                              <div className="flex items-center justify-end gap-2 shrink-0 w-full md:w-auto border-t md:border-t-0 pt-2 md:pt-0 pl-6 md:pl-0">
                                {/* Toggle switch */}
                                <button
                                  onClick={() => handleToggleStatus(sub)}
                                  title={sub.isActive ? 'Deactivate Subcategory' : 'Activate Subcategory'}
                                  className="bg-transparent border-none cursor-pointer flex items-center"
                                >
                                  {sub.isActive ? (
                                    <ToggleRight className="w-7 h-7 text-emerald-500 hover:scale-105 transition-transform" />
                                  ) : (
                                    <ToggleLeft className="w-7 h-7 text-slate-350 dark:text-slate-650 hover:scale-105 transition-transform" />
                                  )}
                                </button>
                                
                                <div className="h-4 w-[1px] bg-slate-100 dark:bg-secondary-800" />
                                
                                <button
                                  onClick={() => setViewingItem(sub)}
                                  title="View Info"
                                  className="p-1.5 rounded-full text-slate-500 bg-slate-50 hover:bg-slate-100 dark:bg-secondary-800 dark:hover:bg-secondary-750 border-none cursor-pointer transition-all duration-200 flex items-center justify-center"
                                >
                                  <Info className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleEditOpen(sub)}
                                  title="Edit Subcategory"
                                  className="p-1.5 rounded-full text-blue-600 bg-slate-50 hover:bg-blue-105/50 dark:bg-secondary-800 dark:hover:bg-blue-950/30 border-none cursor-pointer transition-all duration-200 flex items-center justify-center"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDelete(sub)}
                                  title="Delete Subcategory"
                                  className="p-1.5 rounded-full text-red-600 bg-slate-50 hover:bg-red-100/50 dark:bg-secondary-800 dark:hover:bg-red-950/30 border-none cursor-pointer transition-all duration-200 flex items-center justify-center"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* ─── ADD / EDIT CATEGORY MODAL DIALOG ─── */}
      <AppModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingItem ? 'Edit Category Config' : parentCategoryForSub ? 'Add Subcategory' : 'Add Category'}
        footer={
          <div className="flex items-center justify-end gap-2.5">
            <AppButton
              type="button"
              variant="secondary"
              onClick={() => setIsFormOpen(false)}
            >
              Cancel
            </AppButton>
            <AppButton
              type="submit"
              form="category-master-form"
              disabled={submitting}
              isLoading={submitting}
              leftIcon={<Check className="w-3.5 h-3.5" />}
            >
              Save Config
            </AppButton>
          </div>
        }
      >
        <form id="category-master-form" onSubmit={handleSubmit} className="space-y-4.5">
          {parentCategoryForSub && (
            <div className="space-y-2">
              <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100/50 dark:border-indigo-900/30 rounded-xl text-xs text-indigo-700 dark:text-indigo-400 font-bold flex items-center gap-2">
                <Network className="w-4 h-4 shrink-0" />
                Adding subcategory under: <span className="font-black text-indigo-900 dark:text-white">"{parentCategoryForSub.categoryName}"</span>
              </div>
              {(parentCategoryForSub.supportEmail || parentCategoryForSub.ccEmail || parentCategoryForSub.escalationEmail) && (
                <div className="p-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/30 rounded-xl text-[10px] text-amber-700 dark:text-amber-400 font-semibold flex items-center gap-2">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  Email routing is pre-filled from parent. You can customize it for this subcategory.
                </div>
              )}
            </div>
          )}

          {/* Parent Edit: Propagation Notice */}
          {editingItem && editingItem.parentId === null && editingItem.subcategories && editingItem.subcategories.length > 0 && (
            <div className="p-2.5 bg-blue-50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/30 rounded-xl text-[10px] text-blue-700 dark:text-blue-400 font-semibold flex items-center gap-2">
              <Info className="w-3.5 h-3.5 shrink-0" />
              Email changes will auto-apply to subcategories that don't have a custom email set.
            </div>
          )}

          {/* Basic Configuration */}
          <div className="space-y-4">
            <AppInput
              required
              id="modalCategoryName"
              label="Category Name"
              type="text"
              placeholder="e.g. Printer & Peripheral Support"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-4">
              <AppInput
                required
                id="modalDisplayOrder"
                label="Display Order"
                type="number"
                min="1"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(parseInt(e.target.value, 10) || 1)}
              />

              <AppInput
                required
                id="modalSlaHours"
                label="SLA Hours"
                type="number"
                min="1"
                placeholder="24"
                value={slaHours}
                onChange={(e) => setSlaHours(parseInt(e.target.value, 10) || 24)}
              />
            </div>

            <AppDropdown
              id="modalAssignedTeam"
              label="Assigned Routing Team"
              value={assignedTeam}
              onChange={(e) => setAssignedTeam(e.target.value)}
            >
              <option value="IT">IT Support</option>
              <option value="HR">HR Team</option>
              <option value="Finance">Finance Team</option>
              <option value="Admin">Admin Team</option>
              <option value="Accounts">Accounts Team</option>
            </AppDropdown>

            <AppInput
              id="modalDescription"
              label="Description"
              multiline
              rows={3}
              placeholder="Support details/troubleshoot guidelines for tickets raised under this category..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Advanced Routing Section in Accordion */}
          <AppAccordion
            title="Advanced Routing & Owner Settings"
            isOpen={isAdvancedOpen}
            onToggle={() => setIsAdvancedOpen(!isAdvancedOpen)}
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <AppInput
                  id="modalSupportEmail"
                  label="Support Email"
                  type="email"
                  placeholder={parentCategoryForSub ? parentCategoryForSub.supportEmail || 'itsupport@company.com' : 'itsupport@company.com'}
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                />
                {parentCategoryForSub && parentCategoryForSub.supportEmail && (!supportEmail || supportEmail === parentCategoryForSub.supportEmail) && (
                  <span className="text-[9px] bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-bold inline-block mt-1">Inherited</span>
                )}
              </div>

              <div className="space-y-1">
                <AppInput
                  id="modalCcEmail"
                  label="CC Email (Lead)"
                  type="email"
                  placeholder={parentCategoryForSub ? parentCategoryForSub.ccEmail || 'lead-it@company.com' : 'lead-it@company.com'}
                  value={ccEmail}
                  onChange={(e) => setCcEmail(e.target.value)}
                />
                {parentCategoryForSub && parentCategoryForSub.ccEmail && (!ccEmail || ccEmail === parentCategoryForSub.ccEmail) && (
                  <span className="text-[9px] bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-bold inline-block mt-1">Inherited</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <AppInput
                  id="modalEscalationEmail"
                  label="Escalation Email"
                  type="email"
                  placeholder={parentCategoryForSub ? parentCategoryForSub.escalationEmail || 'mgr-it@company.com' : 'mgr-it@company.com'}
                  value={escalationEmail}
                  onChange={(e) => setEscalationEmail(e.target.value)}
                />
                {parentCategoryForSub && parentCategoryForSub.escalationEmail && (!escalationEmail || escalationEmail === parentCategoryForSub.escalationEmail) && (
                  <span className="text-[9px] bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-bold inline-block mt-1">Inherited</span>
                )}
              </div>

              <div className="space-y-1">
                <AppDropdown
                  id="modalAutoAssignUserId"
                  label="Auto Assign User"
                  value={autoAssignUserId}
                  onChange={(e) => setAutoAssignUserId(e.target.value)}
                >
                  <option value="">
                    {parentCategoryForSub && parentCategoryForSub.autoAssignUserId
                      ? `Inherit: ${(() => {
                          const emp = employees.find(e => e.id === parentCategoryForSub.autoAssignUserId);
                          return emp ? `${emp.firstName} ${emp.lastName}` : "Parent's Owner";
                        })()}`
                      : "No auto-assignment (Team Queue)"}
                  </option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName} ({emp.employeeId || 'No ID'})</option>
                  ))}
                </AppDropdown>
                {parentCategoryForSub && parentCategoryForSub.autoAssignUserId && (!autoAssignUserId || autoAssignUserId === parentCategoryForSub.autoAssignUserId) && (
                  <span className="text-[9px] bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-bold inline-block mt-1">Inherited</span>
                )}
              </div>
            </div>

            <AppToggle
              label="Active Config Status"
              subLabel="Turn off to temporarily hide this category from ticket forms"
              checked={isActive}
              onChange={setIsActive}
            />
          </AppAccordion>
        </form>
      </AppModal>

      {/* ─── VIEW DETAILS READ-ONLY MODAL ─── */}
      <AppModal
        isOpen={!!viewingItem}
        onClose={() => setViewingItem(null)}
        title="Category Details"
        size="md"
        footer={
          <AppButton
            onClick={() => setViewingItem(null)}
          >
            Close Details
          </AppButton>
        }
      >
        {viewingItem && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold block">Name</span>
                <span className="text-slate-800 dark:text-slate-100 font-black mt-0.5 block">{viewingItem.categoryName}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold block">Hierarchy Role</span>
                <span className="text-slate-700 dark:text-slate-350 font-bold mt-0.5 block">
                  {viewingItem.parentId ? 'Subcategory (Child)' : 'Root Category (Parent)'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold block">Routing Team</span>
                <span className={`inline-flex border px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider mt-1 ${getTeamBadgeStyle(viewingItem.assignedTeam)}`}>
                  {viewingItem.assignedTeam || 'IT'}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold block">SLA Limit</span>
                <span className="text-slate-750 dark:text-slate-300 font-bold block mt-1">{viewingItem.slaHours || 24} hours</span>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold block">Sort Order</span>
                <span className="font-mono font-bold block mt-1">#{viewingItem.displayOrder}</span>
              </div>
            </div>

            <div className="border-t border-slate-100 dark:border-secondary-800 pt-3 space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold block">Support Email</span>
                  <span className="text-slate-700 dark:text-slate-300 font-semibold block mt-0.5 truncate flex items-center gap-1.5" title={viewingItem.supportEmail || 'None'}>
                    {viewingItem.supportEmail ? (
                      <>
                        <span className="truncate">{viewingItem.supportEmail}</span>
                        {viewingItem.parentId && categories.find(c => c.id === viewingItem.parentId)?.supportEmail === viewingItem.supportEmail && (
                          <span className="text-[8px] bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-bold uppercase shrink-0">Inherited</span>
                        )}
                      </>
                    ) : (
                      <span className="text-slate-400 font-normal italic">None configured</span>
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold block">CC Email</span>
                  <span className="text-slate-700 dark:text-slate-300 font-semibold block mt-0.5 truncate flex items-center gap-1.5" title={viewingItem.ccEmail || 'None'}>
                    {viewingItem.ccEmail ? (
                      <>
                        <span className="truncate">{viewingItem.ccEmail}</span>
                        {viewingItem.parentId && categories.find(c => c.id === viewingItem.parentId)?.ccEmail === viewingItem.ccEmail && (
                          <span className="text-[8px] bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-bold uppercase shrink-0">Inherited</span>
                        )}
                      </>
                    ) : (
                      <span className="text-slate-400 font-normal italic">None configured</span>
                    )}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold block">Escalation Email</span>
                  <span className="text-slate-700 dark:text-slate-300 font-semibold block mt-0.5 truncate flex items-center gap-1.5" title={viewingItem.escalationEmail || 'None'}>
                    {viewingItem.escalationEmail ? (
                      <>
                        <span className="truncate">{viewingItem.escalationEmail}</span>
                        {viewingItem.parentId && categories.find(c => c.id === viewingItem.parentId)?.escalationEmail === viewingItem.escalationEmail && (
                          <span className="text-[8px] bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-bold uppercase shrink-0">Inherited</span>
                        )}
                      </>
                    ) : (
                      <span className="text-slate-400 font-normal italic">None configured</span>
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold block">Auto Assigned User</span>
                  <span className="text-slate-700 dark:text-slate-300 font-semibold block mt-0.5 truncate flex items-center gap-1.5">
                    {(() => {
                      const emp = employees.find(e => e.id === viewingItem.autoAssignUserId);
                      const isInherited = viewingItem.parentId && categories.find(c => c.id === viewingItem.parentId)?.autoAssignUserId === viewingItem.autoAssignUserId;
                      return emp ? (
                        <>
                          <span className="truncate">{emp.firstName} {emp.lastName}</span>
                          {isInherited && (
                            <span className="text-[8px] bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-bold uppercase shrink-0">Inherited</span>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-400 font-normal italic">None (Team Queue)</span>
                      );
                    })()}
                  </span>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 dark:border-secondary-800 pt-3">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold block">Description</span>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed font-semibold mt-1 p-2.5 bg-slate-50 dark:bg-secondary-800/40 rounded-xl border border-slate-100 dark:border-secondary-800/60 max-h-32 overflow-y-auto app-scrollbar">
                {viewingItem.description || 'No description provided.'}
              </p>
            </div>
          </div>
        )}
      </AppModal>
    </div>
  );
};

export default CategoryMaster;