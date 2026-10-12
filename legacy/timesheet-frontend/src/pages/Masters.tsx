import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Shield,
  Layers,
  Award,
  Clock,
  MapPin,
  Briefcase,
  Plus,
  Search,
  Edit2,
  Trash2,
  Check,
  ToggleLeft,
  ToggleRight,
  HelpCircle,
  Building,
  DollarSign,
  Truck
} from 'lucide-react';
import API from '../api';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import CategoryMaster from './CategoryMaster';

// Unified UI Components
import AppModal from '../components/ui/AppModal';
import AppTable, { AppTableColumn } from '../components/ui/AppTable';
import AppInput from '../components/ui/AppInput';
import AppDropdown from '../components/ui/AppDropdown';
import AppToggle from '../components/ui/AppToggle';
import AppButton from '../components/ui/AppButton';

// Tab configuration
type MasterType = 'roles' | 'designations' | 'departments' | 'employment-types' | 'shifts' | 'locations' | 'entities' | 'currencies' | 'vendors' | 'helpdesk-categories';

interface TabItem {
  key: MasterType;
  label: string;
  icon: React.ElementType;
}

const TABS: TabItem[] = [
  { key: 'roles', label: 'Roles Master', icon: Shield },
  { key: 'designations', label: 'Designations', icon: Award },
  { key: 'departments', label: 'Departments', icon: Layers },
  { key: 'employment-types', label: 'Employment Types', icon: Briefcase },
  { key: 'shifts', label: 'Shifts', icon: Clock },
  { key: 'locations', label: 'Locations', icon: MapPin },
  { key: 'entities', label: 'Entities', icon: Building },
  { key: 'currencies', label: 'Currencies', icon: DollarSign },
  { key: 'vendors', label: 'Vendors', icon: Truck },
  { key: 'helpdesk-categories', label: 'Help Desk Categories', icon: HelpCircle }
];

interface MasterItem {
  id: string;
  name: string;
  code?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  isActive: boolean;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const Masters: React.FC = () => {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { confirm } = useConfirm();
  
  const [activeTab, setActiveTab] = useState<MasterType>('roles');
  
  // Sync activeTab with tab param from URL
  useEffect(() => {
    if (tab && TABS.some(t => t.key === tab)) {
      setActiveTab(tab as MasterType);
    } else if (!tab) {
      // Default to /admin-portal/masters/roles if no tab specified
      navigate('/admin-portal/masters/roles', { replace: true });
    }
  }, [tab, navigate]);

  const handleTabChange = (tabKey: MasterType) => {
    setActiveTab(tabKey);
    navigate(`/admin-portal/masters/${tabKey}`);
  };
  const [items, setItems] = useState<MasterItem[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Search & Filter
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 10, total: 0, pages: 1 });

  // Modals state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MasterItem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form Fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Additional fields for new masters
  const [legalName, setLegalName] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [address, setAddress] = useState('');
  const [msmeReg, setMsmeReg] = useState('');
  const [symbol, setSymbol] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [contactPerson, setContactPerson] = useState('');

  // Fetch Master Data
  const fetchMasters = useCallback(async (page = 1) => {
    if (activeTab === 'helpdesk-categories') return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '10',
        search: search.trim(),
        status
      });
      const response = await API.get(`/masters/${activeTab}?${params}`);
      if (response.data.success) {
        setItems(response.data.data);
        setPagination(response.data.pagination);
      }
    } catch (err) {
      const error = err as Error;
      console.error(`Failed to fetch ${activeTab}:`, error);
      toast.error(error.message || `Failed to fetch ${activeTab} data`);
    } finally {
      setLoading(false);
    }
  }, [activeTab, search, status, toast]);

  useEffect(() => {
    fetchMasters(1);
  }, [activeTab, status, fetchMasters]);

  // Open Add Form
  const handleAddOpen = () => {
    setEditingItem(null);
    setName('');
    setDescription('');
    setCode('');
    setStartTime('09:30');
    setEndTime('18:30');
    setIsActive(true);
    // Reset new master fields
    setLegalName('');
    setGstin('');
    setPan('');
    setAddress('');
    setMsmeReg('');
    setSymbol('');
    setCompany('');
    setEmail('');
    setPhone('');
    setGstNumber('');
    setContactPerson('');
    setIsFormOpen(true);
  };

  // Open Edit Form
  const handleEditOpen = (item: any) => {
    setEditingItem(item);
    setName(item.name || item.vendorName || '');
    setDescription(item.description || '');
    setCode(item.code || '');
    setStartTime(item.startTime || '09:30');
    setEndTime(item.endTime || '18:30');
    setIsActive(item.isActive);
    
    // Set new master fields
    setLegalName(item.legalName || '');
    setGstin(item.gstin || '');
    setPan(item.pan || '');
    setAddress(item.address || '');
    setMsmeReg(item.msmeReg || '');
    setSymbol(item.symbol || '');
    setCompany(item.company || '');
    setEmail(item.email || '');
    setPhone(item.phone || '');
    setGstNumber(item.gstNumber || '');
    setContactPerson(item.contactPerson || '');
    setIsFormOpen(true);
  };

  // Submit Form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        name: name.trim(),
        description: description.trim(),
        isActive
      };

      if (activeTab === 'roles') {
        payload.code = code.trim().toUpperCase();
      } else if (activeTab === 'shifts') {
        payload.startTime = startTime;
        payload.endTime = endTime;
      } else if (activeTab === 'entities') {
        payload.legalName = legalName.trim();
        payload.gstin = gstin.trim();
        payload.pan = pan.trim();
        payload.address = address.trim();
        payload.msmeReg = msmeReg.trim();
      } else if (activeTab === 'currencies') {
        payload.code = code.trim().toUpperCase();
        payload.symbol = symbol.trim();
      } else if (activeTab === 'vendors') {
        payload.vendorName = name.trim();
        payload.company = company.trim();
        payload.email = email.trim();
        payload.phone = phone.trim();
        payload.address = address.trim();
        payload.gstNumber = gstNumber.trim();
        payload.contactPerson = contactPerson.trim();
      }

      if (editingItem) {
        // Edit record
        const response = await API.put(`/masters/${activeTab}/${editingItem.id}`, payload);
        if (response.data.success) {
          toast.success('Record updated successfully');
          setIsFormOpen(false);
          fetchMasters(pagination.page);
        }
      } else {
        // Add record
        const response = await API.post(`/masters/${activeTab}`, payload);
        if (response.data.success) {
          toast.success('Record created successfully');
          setIsFormOpen(false);
          fetchMasters(1);
        }
      }
    } catch (err) {
      const error = err as Error;
      console.error(`Error saving ${activeTab}:`, error);
      toast.error(error.message || 'Failed to save master record');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete master
  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: 'Delete Master Record',
      message: 'Are you sure you want to delete this master record? This action cannot be undone.',
      isDelete: true
    });
    if (!confirmed) {
      return;
    }

    try {
      const response = await API.delete(`/masters/${activeTab}/${id}`);
      if (response.data.success) {
        toast.success('Record deleted successfully');
        fetchMasters(items.length === 1 && pagination.page > 1 ? pagination.page - 1 : pagination.page);
      }
    } catch (err) {
      const error = err as Error;
      console.error(`Error deleting from ${activeTab}:`, error);
      toast.error(error.message || 'Failed to delete record. It may be in use by an employee.');
    }
  };

  // Toggle master status
  const handleToggleStatus = async (item: MasterItem) => {
    try {
      const response = await API.patch(`/masters/${activeTab}/${item.id}/toggle-status`);
      if (response.data.success) {
        toast.success(`Record marked as ${!item.isActive ? 'Active' : 'Inactive'}`);
        fetchMasters(pagination.page);
      }
    } catch (err) {
      const error = err as Error;
      console.error(`Error toggling status of ${activeTab}:`, error);
      toast.error(error.message || 'Failed to toggle status');
    }
  };

  const handleSearchKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      fetchMasters(1);
    }
  };

  const columns: AppTableColumn<MasterItem>[] = [
    {
      key: 'name',
      title: 'Name',
      render: (item) => (
        <span className="font-bold text-slate-900 dark:text-white">
          {item.name}
        </span>
      ),
    },
    ...(activeTab === 'roles'
      ? [
          {
            key: 'code',
            title: 'Role Code',
            render: (item: MasterItem) => (
              <span className="font-mono text-xs font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 px-2.5 py-1 rounded-lg">
                {item.code}
              </span>
            ),
          },
        ]
      : []),
    ...(activeTab === 'shifts'
      ? [
          {
            key: 'timing',
            title: 'Timing',
            render: (item: MasterItem) => (
              <span className="font-semibold text-slate-600 dark:text-secondary-300">
                {item.startTime} - {item.endTime}
              </span>
            ),
          },
        ]
      : []),
    ...(activeTab === 'entities'
      ? [
          {
            key: 'legalName',
            title: 'Legal Name',
            render: (item: any) => <span className="font-semibold text-slate-700 dark:text-slate-350">{item.legalName || '—'}</span>
          },
          {
            key: 'gstin',
            title: 'GSTIN',
            render: (item: any) => <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-700 dark:text-slate-350">{item.gstin || '—'}</span>
          }
        ]
      : []),
    ...(activeTab === 'currencies'
      ? [
          {
            key: 'code',
            title: 'Currency Code',
            render: (item: any) => <span className="font-mono text-xs font-bold bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded">{item.code}</span>
          },
          {
            key: 'symbol',
            title: 'Symbol',
            render: (item: any) => <span className="font-bold text-slate-700 dark:text-slate-350">{item.symbol || '—'}</span>
          }
        ]
      : []),
    ...(activeTab === 'vendors'
      ? [
          {
            key: 'company',
            title: 'Company',
            render: (item: any) => <span className="font-semibold text-slate-700 dark:text-slate-350">{item.company}</span>
          },
          {
            key: 'contact',
            title: 'Contact',
            render: (item: any) => (
              <div className="text-xs space-y-0.5 font-semibold text-slate-500">
                <p className="text-slate-700 dark:text-slate-350">{item.contactPerson || '—'}</p>
                <p className="text-[10px]">{item.email} {item.phone ? `| ${item.phone}` : ''}</p>
              </div>
            )
          }
        ]
      : []),
    {
      key: 'description',
      title: 'Description',
      render: (item) => (
        <span className="text-slate-500 dark:text-secondary-400 max-w-xs truncate block font-semibold" title={item.description || ''}>
          {item.description || '—'}
        </span>
      ),
    },
    {
      key: 'isActive',
      title: 'Status',
      render: (item) => (
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
            item.isActive
              ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
              : 'bg-slate-100 dark:bg-slate-800/60 text-slate-500 dark:text-secondary-400'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${item.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          {item.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'actions',
      title: 'Actions',
      align: 'right',
      render: (item) => (
        <div className="flex items-center justify-end gap-1.5">
          {/* Toggle Status Button */}
          <button
            onClick={() => handleToggleStatus(item)}
            title={item.isActive ? 'Deactivate' : 'Activate'}
            className={`p-1.5 rounded-lg border-none bg-transparent cursor-pointer transition-colors ${
              item.isActive
                ? 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/20'
                : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-secondary-800'
            }`}
          >
            {item.isActive ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
          </button>

          {/* Edit Button */}
          <button
            onClick={() => handleEditOpen(item)}
            title="Edit"
            className="p-1.5 rounded-lg border-none bg-transparent cursor-pointer text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 transition-colors"
          >
            <Edit2 className="w-4.5 h-4.5" />
          </button>

          {/* Delete Button */}
          <button
            onClick={() => handleDelete(item.id)}
            title="Delete"
            className="p-1.5 rounded-lg border-none bg-transparent cursor-pointer text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors"
          >
            <Trash2 className="w-4.5 h-4.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5 pb-12">
      {/* Modern Compact Tabs navigation at the top */}
      <div className="flex flex-wrap gap-1.5 p-1 bg-slate-100/60 dark:bg-secondary-950/40 rounded-xl overflow-x-auto w-fit">
        {TABS.map((tabItem) => {
          const IconComponent = tabItem.icon;
          const isActiveTab = activeTab === tabItem.key;
          return (
            <button
              key={tabItem.key}
              onClick={() => {
                handleTabChange(tabItem.key);
                setSearch('');
                setStatus('all');
              }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 whitespace-nowrap cursor-pointer border-none ${
                isActiveTab
                  ? 'bg-white dark:bg-secondary-800 text-slate-800 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-850 dark:text-secondary-400 dark:hover:text-white bg-transparent'
              }`}
            >
              <IconComponent className="w-3.5 h-3.5" />
              {tabItem.label}
            </button>
          );
        })}
      </div>

      {/* Header Row for other config tabs (Category Config handles its own) */}
      {activeTab !== 'helpdesk-categories' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-1.5">
          <div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white leading-tight">
              {TABS.find(t => t.key === activeTab)?.label} Configuration
            </h1>
            <p className="text-slate-500 dark:text-secondary-400 text-xs mt-0.5 font-medium">
              Manage configuration entries, sorting orders, and status settings.
            </p>
          </div>
          <div>
            <AppButton
              onClick={handleAddOpen}
              variant="primary"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
            >
              Add Master
            </AppButton>
          </div>
        </div>
      )}

      {/* Content depending on active tab */}
      {activeTab === 'helpdesk-categories' ? (
        <CategoryMaster isEmbedded={true} />
      ) : (
        <>
          {/* Filter Bar */}
          <div className="bg-white dark:bg-secondary-900 rounded-2xl border border-slate-100 dark:border-secondary-800 p-4 shadow-sm">
            <div className="flex flex-col md:flex-row gap-3 items-center">
              {/* Search Box */}
              <AppInput
                id="master-search"
                type="text"
                placeholder={`Search in ${TABS.find(t => t.key === activeTab)?.label || 'Masters'}...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyPress}
                leftIcon={<Search className="w-4 h-4 text-slate-400" />}
                containerClassName="w-full md:flex-1"
              />

              {/* Status filter */}
              <div className="flex w-full md:w-auto items-center gap-3">
                <AppDropdown
                  id="master-status-filter"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  containerClassName="w-full md:w-44"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                </AppDropdown>

                <AppButton
                  onClick={() => fetchMasters(1)}
                  variant="primary"
                >
                  Apply
                </AppButton>
              </div>
            </div>
          </div>

          {/* Main SaaS Table Component */}
          <AppTable
            columns={columns}
            data={items}
            loading={loading}
            emptyMessage={`No ${TABS.find(t => t.key === activeTab)?.label.toLowerCase() || 'records'} found`}
            pagination={{
              page: pagination.page,
              pages: pagination.pages,
              total: pagination.total,
              onPageChange: fetchMasters,
            }}
          />
        </>
      )}

      {/* Dialog Modal Form */}
      <AppModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={`${editingItem ? 'Edit' : 'Add New'} ${TABS.find(t => t.key === activeTab)?.label.slice(0, -7) || 'Record'}`}
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
              form="master-record-form"
              disabled={submitting}
              isLoading={submitting}
              leftIcon={<Check className="w-3.5 h-3.5" />}
            >
              Save Record
            </AppButton>
          </div>
        }
      >
        <form id="master-record-form" onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <AppInput
            required
            id="master-record-name"
            label="Name"
            type="text"
            placeholder="e.g. Senior Associate, Taxation"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          {/* Role Code (Roles only) */}
          {activeTab === 'roles' && (
            <AppInput
              required
              id="role-code-input"
              label="Role Code"
              type="text"
              placeholder="e.g. TAXATION_SENIOR"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={!!editingItem} // Code should be immutable once created to avoid logic breaks
              className="uppercase font-mono font-semibold"
            />
          )}

          {/* Shift Timings (Shifts only) */}
          {activeTab === 'shifts' && (
            <div className="grid grid-cols-2 gap-4">
              <AppInput
                required
                id="shift-start-time"
                label="Start Time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
              <AppInput
                required
                id="shift-end-time"
                label="End Time"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          )}

          {/* Entity Specific Fields */}
          {activeTab === 'entities' && (
            <div className="space-y-4">
              <AppInput
                id="entity-legal-name"
                label="Legal Name"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="e.g. Ashish Shah & Associates Private Limited"
              />
              <div className="grid grid-cols-2 gap-4">
                <AppInput
                  id="entity-gstin"
                  label="GSTIN"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value)}
                  placeholder="e.g. 27AAAAA0000A1Z5"
                />
                <AppInput
                  id="entity-pan"
                  label="PAN"
                  value={pan}
                  onChange={(e) => setPan(e.target.value)}
                  placeholder="e.g. ABCDE1234F"
                />
              </div>
              <AppInput
                id="entity-msme"
                label="MSME Registration"
                value={msmeReg}
                onChange={(e) => setMsmeReg(e.target.value)}
                placeholder="e.g. UDYAM-MH-00-0000000"
              />
              <AppInput
                id="entity-address"
                label="Registered Address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                multiline
                rows={2}
                placeholder="Full office address..."
              />
            </div>
          )}

          {/* Currency Specific Fields */}
          {activeTab === 'currencies' && (
            <div className="grid grid-cols-2 gap-4">
              <AppInput
                required
                id="currency-code"
                label="Currency Code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. USD"
                className="uppercase font-mono"
              />
              <AppInput
                id="currency-symbol"
                label="Symbol"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="e.g. $"
              />
            </div>
          )}

          {/* Vendor Specific Fields */}
          {activeTab === 'vendors' && (
            <div className="space-y-4">
              <AppInput
                required
                id="vendor-company"
                label="Company Name"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Dell India Pvt Ltd"
              />
              <div className="grid grid-cols-2 gap-4">
                <AppInput
                  id="vendor-email"
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. sales@vendor.com"
                />
                <AppInput
                  id="vendor-phone"
                  label="Phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <AppInput
                  id="vendor-contact-person"
                  label="Contact Person"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  placeholder="e.g. John Doe"
                />
                <AppInput
                  id="vendor-gst"
                  label="GST Number"
                  value={gstNumber}
                  onChange={(e) => setGstNumber(e.target.value)}
                  placeholder="e.g. 27BBBBB0000B1Z5"
                />
              </div>
              <AppInput
                id="vendor-address"
                label="Address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                multiline
                rows={2}
                placeholder="Vendor office address..."
              />
            </div>
          )}

          {/* Description */}
          {activeTab !== 'currencies' && activeTab !== 'vendors' && (
            <AppInput
              id="master-record-description"
              label="Description"
              multiline
              rows={3}
              placeholder="Brief description about this master configuration..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}

          {/* Status Toggle */}
          {activeTab !== 'currencies' && activeTab !== 'vendors' && (
            <AppToggle
              label="Active Status"
              subLabel="If inactive, this record won't appear in employee option fields"
              checked={isActive}
              onChange={setIsActive}
            />
          )}
        </form>
      </AppModal>
    </div>
  );
};

export default Masters;
