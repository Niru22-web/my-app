import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Laptop, Plus, Search, ShieldAlert, Monitor, 
  Calendar, Layers, Tag, ClipboardList
} from 'lucide-react';
import API from '../../api';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { useToast } from '../../contexts/ToastContext';
import CardSkeleton from '../../components/ui/CardSkeleton';

interface Allocation {
  id: string;
  requestId: string;
  inventoryId: string;
  employeeId: string;
  allocatedAt: string;
  deliveredAt: string | null;
  status: string;
  remarks: string | null;
  returnedAt: string | null;
  inventory: {
    id: string;
    assetId: string;
    assetName: string;
    category: string;
    type: string;
    serialNumber: string;
    status: string;
    officeTagNo: string | null;
    condition: string;
    description: string | null;
    remarks: string | null;
    isDeleted?: boolean;
  };
}

interface Category {
  id: string;
  name: string;
  category: string;
}

interface AssetType {
  id: string;
  name: string;
  assetCategoryId: string;
}

const PersonalAssetPortal: React.FC = () => {
  const navigate = useNavigate();
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [types, setTypes] = useState<AssetType[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Registration Form State
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    assetName: '',
    categoryId: '',
    typeId: '',
    serialNumber: '',
    officeTagNo: '',
    condition: 'Good',
    remarks: '',
    description: ''
  });

  const toast = useToast();

  // Fetch all user's assets and master config options
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [allocRes, catRes, typeRes] = await Promise.all([
        API.get('/assets/my-allocations'),
        API.get('/assets/masters/categories'),
        API.get('/assets/masters/types')
      ]);

      if (allocRes.data.success) {
        setAllocations(allocRes.data.data);
      }
      if (catRes.data.success) {
        setCategories(catRes.data.data);
      }
      if (typeRes.data.success) {
        setTypes(typeRes.data.data);
      }
    } catch (error) {
      toast.error('Failed to load asset information.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenModal = () => {
    setFormData({
      assetName: '',
      categoryId: categories.length > 0 ? categories[0].id : '',
      typeId: '',
      serialNumber: '',
      officeTagNo: '',
      condition: 'Good',
      remarks: '',
      description: ''
    });
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    if (!submitting) setModalOpen(false);
  };

  // Submit registration form to backend
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const selectedCategory = categories.find(c => c.id === formData.categoryId);
    const selectedType = types.find(t => t.id === formData.typeId);

    if (!formData.assetName.trim() || !formData.categoryId || !formData.typeId || !formData.serialNumber.trim()) {
      toast.error('Please fill in all required fields.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        assetName: formData.assetName.trim(),
        category: selectedCategory ? selectedCategory.name : 'Hardware',
        type: selectedType ? selectedType.name : 'Unknown',
        serialNumber: formData.serialNumber.trim(),
        officeTagNo: formData.officeTagNo.trim() || undefined,
        condition: formData.condition,
        remarks: formData.remarks.trim() || undefined,
        description: formData.description.trim() || undefined
      };

      const res = await API.post('/assets/self-register', payload);
      if (res.data.success) {
        toast.success('Asset successfully registered and added to inventory.');
        setModalOpen(false);
        fetchData();
      }
    } catch (error) {
      const err = error as { message?: string };
      const msg = err?.message || 'Failed to register asset. Check duplicate serial number.';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Filter types based on active category in modal form
  const filteredTypes = types.filter(t => t.assetCategoryId === formData.categoryId);

  // Filter allocations shown in grid based on search bar
  const filteredAllocations = allocations.filter(a => {
    if (!a.inventory || a.inventory.isDeleted === true) return false;

    const name = a.inventory.assetName.toLowerCase();
    const serial = a.inventory.serialNumber.toLowerCase();
    const category = a.inventory.category.toLowerCase();
    const type = a.inventory.type.toLowerCase();
    const tag = (a.inventory.officeTagNo || '').toLowerCase();
    const query = searchQuery.toLowerCase();

    return name.includes(query) || serial.includes(query) || category.includes(query) || type.includes(query) || tag.includes(query);
  });

  return (
    <div className="p-6 space-y-6">
      {/* Premium Header Banner */}
      <div className="bg-gradient-to-r from-indigo-900 to-slate-900 p-8 rounded-3xl text-white shadow-xl relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border border-indigo-950/20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,0.15),transparent_60%)] pointer-events-none" />
        <div className="space-y-2 relative z-10">
          <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
            Employee Workspace
          </span>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-none">
            Asset <span className="text-indigo-400">Portal</span>
          </h1>
          <p className="text-indigo-200 text-xs sm:text-sm max-w-xl font-medium">
            Manage your hardware fleet custody, review active serial numbers, and self-register assets currently in your possession.
          </p>
        </div>
        
        <div className="flex flex-wrap gap-3 relative z-10">
          <Button 
            variant="secondary" 
            onClick={() => navigate('/employee/asset-requests')}
            className="bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl px-6 py-3 border border-white/20 flex items-center gap-2 active:scale-[0.98] transition-all"
          >
            <ClipboardList size={16} className="text-white" />
            My Asset Requests
          </Button>

          <Button 
            variant="primary" 
            onClick={handleOpenModal}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl px-6 py-3 shadow-lg shadow-indigo-600/30 active:scale-[0.98] border-none flex items-center gap-2 transition-all"
          >
            <Plus size={16} />
            Register Asset in Possession
          </Button>
        </div>
      </div>

      {/* Main Container */}
      <div className="space-y-4">
        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row items-center gap-4 bg-white dark:bg-slate-900/50 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
          <div className="relative w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search assets by name, serial number, brand, category..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500 transition-all dark:text-white"
            />
          </div>
        </div>

        {/* Loading Spinner */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : filteredAllocations.length === 0 ? (
          /* Empty State */
          <Card className="border-dashed border-2 border-slate-200 dark:border-slate-800 rounded-[2.5rem] text-center py-20 bg-white dark:bg-slate-900/10 flex flex-col items-center justify-center p-6 gap-4">
            <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-400">
              <Laptop size={32} />
            </div>
            <div className="space-y-1.5 max-w-sm">
              <h3 className="text-lg font-black text-slate-900 dark:text-white">No Assigned Assets Found</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                You don't have any company hardware mapped under your profile. If you have active devices (e.g. laptop, phone), click the button below to self-register them in the custody inventory.
              </p>
            </div>
            <Button 
              variant="action" 
              onClick={handleOpenModal}
              className="rounded-xl px-5 py-2.5 font-bold mt-2"
            >
              Register Asset Now
            </Button>
          </Card>
        ) : (
          /* Assets Custody Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAllocations.map((alloc) => {
              const device = alloc.inventory;
              const dateStr = alloc.allocatedAt ? new Date(alloc.allocatedAt).toLocaleDateString(undefined, {
                year: 'numeric', month: 'short', day: 'numeric'
              }) : 'N/A';

              return (
                <Card 
                  key={alloc.id} 
                  className="bg-white dark:bg-slate-900 border-none shadow-md rounded-[2rem] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 p-6 flex flex-col justify-between h-full border border-slate-100 dark:border-slate-800"
                >
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-2xl">
                        <Monitor size={22} />
                      </div>
                      <Badge variant="success" className="text-[10px] font-black rounded-lg uppercase">
                        Active Custody
                      </Badge>
                    </div>

                    {/* Meta info */}
                    <div className="space-y-1">
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider">
                        {device.category} • {device.type}
                      </p>
                      <h3 className="text-lg font-black text-slate-900 dark:text-white leading-tight">
                        {device.assetName}
                      </h3>
                    </div>

                    {/* Detail items */}
                    <div className="space-y-2.5 py-4 border-t border-b border-slate-50 dark:border-slate-800 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 font-bold flex items-center gap-1.5">
                          <Tag size={13} /> Serial Number:
                        </span>
                        <span className="font-mono font-black text-slate-700 dark:text-slate-300">
                          {device.serialNumber}
                        </span>
                      </div>
                      
                      {device.assetId && (
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 font-bold flex items-center gap-1.5">
                            <Tag size={13} /> Asset ID:
                          </span>
                          <span className="font-mono font-black text-amber-600 dark:text-amber-400">
                            {device.assetId}
                          </span>
                        </div>
                      )}

                      {device.officeTagNo && (
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 font-bold flex items-center gap-1.5">
                            <Layers size={13} /> Office Tag:
                          </span>
                          <span className="font-mono font-black text-indigo-600 dark:text-indigo-400">
                            {device.officeTagNo}
                          </span>
                        </div>
                      )}

                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 font-bold flex items-center gap-1.5">
                          <Calendar size={13} /> Assigned Date:
                        </span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          {dateStr}
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 font-bold flex items-center gap-1.5">
                          <ClipboardList size={13} /> Condition:
                        </span>
                        <Badge variant={device.condition === 'New' || device.condition === 'Good' ? 'success' : 'warning'} className="text-[9px] font-black rounded-md py-0 px-2 uppercase">
                          {device.condition}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {device.description && (
                    <div className="mt-4 pt-3 bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800/60">
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-wide mb-1">Remarks</p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed font-semibold italic">
                        "{device.description}"
                      </p>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Asset Self-Registration Wizard Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={handleCloseModal}
        title="Register Possession Hardware"
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-5 py-2">
          {/* Header Warning */}
          <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-300 rounded-2xl border border-indigo-100/50 dark:border-indigo-900/30 flex gap-3 items-start">
            <ShieldAlert className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <h4 className="text-xs font-black uppercase tracking-wider">Self-Registration Guidelines</h4>
              <p className="text-[10.5px] leading-relaxed font-semibold">
                Please enter accurate information. Registered hardware is instantly added to active company assets list and mapped under your personal custody profile.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Asset Name */}
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                Asset Name <span className="text-rose-500">*</span>
              </label>
              <input 
                type="text" 
                placeholder="e.g. MacBook Pro 16 Inch (M3)"
                value={formData.assetName}
                onChange={(e) => setFormData({...formData, assetName: e.target.value})}
                required
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500 transition-all dark:text-white"
              />
            </div>

            {/* Category selection */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                Category <span className="text-rose-500">*</span>
              </label>
              <select
                title="Category"
                value={formData.categoryId}
                onChange={(e) => setFormData({...formData, categoryId: e.target.value, typeId: ''})}
                required
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-sm font-bold text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select Category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Asset Type selection */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                Asset Type <span className="text-rose-500">*</span>
              </label>
              <select
                title="Asset Type"
                value={formData.typeId}
                onChange={(e) => setFormData({...formData, typeId: e.target.value})}
                required
                disabled={!formData.categoryId}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-sm font-bold text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">Select Asset Type</option>
                {filteredTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            {/* Serial Number */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                Serial Number <span className="text-rose-500">*</span>
              </label>
              <input 
                type="text" 
                placeholder="Check device back panel/settings"
                value={formData.serialNumber}
                onChange={(e) => setFormData({...formData, serialNumber: e.target.value})}
                required
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500 transition-all dark:text-white font-mono"
              />
            </div>

            {/* Condition selection */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                Hardware Condition <span className="text-rose-500">*</span>
              </label>
              <select
                title="Hardware Condition"
                value={formData.condition}
                onChange={(e) => setFormData({...formData, condition: e.target.value})}
                required
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-sm font-bold text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500"
              >
                <option value="New">New</option>
                <option value="Good">Good</option>
                <option value="Fair">Fair</option>
                <option value="Poor">Poor</option>
              </select>
            </div>

            {/* Office Tag number (Optional) */}
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                Office Tag Number (Optional)
              </label>
              <input 
                type="text" 
                placeholder="e.g. ASA/IT/2026/089"
                value={formData.officeTagNo}
                onChange={(e) => setFormData({...formData, officeTagNo: e.target.value})}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500 transition-all dark:text-white"
              />
            </div>

            {/* Description/Remarks */}
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                Device Description & Specifications
              </label>
              <textarea 
                rows={3}
                placeholder="e.g. Intel Core i7, 16GB RAM, 512GB SSD, Silver color."
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500 transition-all dark:text-white resize-none"
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button 
              type="button" 
              variant="ghost" 
              onClick={handleCloseModal}
              disabled={submitting}
              className="font-bold"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              variant="premium"
              isLoading={submitting}
              className="px-6 py-2.5 font-bold"
            >
              Confirm Self-Registration
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default PersonalAssetPortal;
