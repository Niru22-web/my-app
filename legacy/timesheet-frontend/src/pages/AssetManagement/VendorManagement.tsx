import React, { useState, useEffect, useCallback } from 'react';
import { 
  Building2, Search, Plus, Edit2, Trash2, Phone, MapPin, 
  Contact, FileText, X, Package
} from 'lucide-react';
import API from '../../api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { useToast } from '../../contexts/ToastContext';
import CardSkeleton from '../../components/ui/CardSkeleton';
import ASALoader from '../../components/ui/ASALoader';

interface Vendor {
  id: string;
  vendorName: string;
  company: string;
  email?: string;
  phone?: string;
  address?: string;
  gstNumber?: string;
  contactPerson?: string;
}

interface VendorAsset {
  id: string;
  assetName: string;
  serialNumber?: string;
  purchaseCost?: number | string;
}

const VendorManagement: React.FC = () => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [vendorAssets, setVendorAssets] = useState<VendorAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  
  const toast = useToast();

  const [formData, setFormData] = useState({
    vendorName: '',
    company: '',
    email: '',
    phone: '',
    address: '',
    gstNumber: '',
    contactPerson: ''
  });

  const fetchVendors = useCallback(async () => {
    try {
      setLoading(true);
      const res = await API.get('/assets/vendors');
      if (res.data.success) {
        setVendors(res.data.data);
      }
    } catch (error) {
      toast.error('Failed to load vendors');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingVendor) {
        await API.put(`/assets/vendors/${editingVendor.id}`, formData);
        toast.success('Vendor details updated successfully');
      } else {
        await API.post('/assets/vendors', formData);
        toast.success('Vendor added successfully');
      }
      setIsFormOpen(false);
      setEditingVendor(null);
      fetchVendors();
    } catch (error) {
      toast.error('Failed to save vendor');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this vendor?')) return;
    try {
      await API.delete(`/assets/vendors/${id}`);
      toast.success('Vendor deleted');
      fetchVendors();
      if (selectedVendor?.id === id) setSelectedVendor(null);
    } catch (error) {
      toast.error('Failed to delete vendor');
    }
  };

  const handleSelectVendor = async (vendor: Vendor) => {
    try {
      setSelectedVendor(vendor);
      setLoadingAssets(true);
      const res = await API.get(`/assets/vendors/${vendor.id}/assets`);
      if (res.data.success) {
        setVendorAssets(res.data.data);
      }
    } catch (error) {
      toast.error('Failed to load vendor assets');
    } finally {
      setLoadingAssets(false);
    }
  };

  const filteredVendors = vendors.filter(v => 
    v.vendorName.toLowerCase().includes(search.toLowerCase()) || 
    v.company.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Vendor <span className="text-indigo-600">Management</span></h1>
          <p className="text-slate-500 text-sm">Create, edit, and audit supplier details, track hardware purchase costs, and check supply logs.</p>
        </div>
        <div>
          <Button variant="primary" size="sm" onClick={() => {
            setEditingVendor(null);
            setFormData({
              vendorName: '',
              company: '',
              email: '',
              phone: '',
              address: '',
              gstNumber: '',
              contactPerson: ''
            });
            setIsFormOpen(true);
          }}>
            <Plus className="w-4 h-4 mr-2" />
            Add Vendor
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative bg-white p-4 rounded-2xl shadow-sm">
        <Search className="absolute left-7 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input 
          type="text" 
          placeholder="Filter vendors by supplier name or company..." 
          className="w-full pl-12 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Columns: Vendor List & Vendor Supplied Assets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left: Vendor CRUD List */}
        <div className="lg:col-span-2 space-y-4 max-h-[70vh] overflow-y-auto pr-2">
          {loading ? (
            <div className="space-y-4">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>
          ) : filteredVendors.length === 0 ? (
            <div className="bg-white p-8 text-center text-slate-400 rounded-3xl shadow-sm">No vendors registered yet.</div>
          ) : filteredVendors.map((vendor) => (
            <div 
              key={vendor.id}
              onClick={() => handleSelectVendor(vendor)}
              className={`p-5 bg-white rounded-3xl border-2 transition-all cursor-pointer hover:scale-[1.01] hover:shadow-md flex items-center justify-between ${
                selectedVendor?.id === vendor.id ? 'border-indigo-500 shadow-sm' : 'border-transparent shadow-sm'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center font-bold text-lg">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 leading-snug">{vendor.vendorName}</h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{vendor.company}</p>
                  <p className="text-[10px] text-indigo-500 font-mono mt-0.5">{vendor.email || 'No email'}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button 
                  title="Edit Vendor"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingVendor(vendor);
                    setFormData({
                      vendorName: vendor.vendorName,
                      company: vendor.company,
                      email: vendor.email || '',
                      phone: vendor.phone || '',
                      address: vendor.address || '',
                      gstNumber: vendor.gstNumber || '',
                      contactPerson: vendor.contactPerson || ''
                    });
                    setIsFormOpen(true);
                  }}
                  className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button 
                  title="Delete Vendor"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(vendor.id);
                  }}
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Right: Vendor Supplied Assets Details */}
        <div className="sticky top-6">
          {selectedVendor ? (
            <Card className="p-8 border-none shadow-2xl bg-white rounded-[2rem] space-y-6 max-h-[75vh] overflow-y-auto">
              <div className="border-b border-slate-100 pb-4 space-y-2">
                <h2 className="text-xl font-black text-slate-900 leading-tight">{selectedVendor.vendorName}</h2>
                <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest">{selectedVendor.company}</p>
              </div>

              {/* Vendor Specs */}
              <div className="space-y-3 text-xs text-slate-500">
                <div className="flex gap-2.5 items-center">
                  <Contact className="w-4 h-4 text-slate-400" />
                  <span>Contact: <strong>{selectedVendor.contactPerson || 'N/A'}</strong></span>
                </div>
                <div className="flex gap-2.5 items-center">
                  <Phone className="w-4 h-4 text-slate-400" />
                  <span>Phone: <strong>{selectedVendor.phone || 'N/A'}</strong></span>
                </div>
                <div className="flex gap-2.5 items-center">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  <span className="truncate" title={selectedVendor.address}>Address: <strong>{selectedVendor.address || 'N/A'}</strong></span>
                </div>
                <div className="flex gap-2.5 items-center">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <span>GSTIN: <strong className="font-mono">{selectedVendor.gstNumber || 'N/A'}</strong></span>
                </div>
              </div>

              {/* Supplied Assets List */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                  <Package className="w-4 h-4 text-slate-400" /> Supplied Equipment List
                </h3>

                {loadingAssets ? (
                  <div className="text-center py-12">
                    <ASALoader size="sm" />
                  </div>
                ) : vendorAssets.length === 0 ? (
                  <div className="p-4 bg-slate-50 rounded-2xl text-center text-xs text-slate-400">
                    No hardware assets registered to this supplier.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {vendorAssets.map((asset) => (
                      <div key={asset.id} className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-slate-700">{asset.assetName}</p>
                          <p className="text-[9px] text-slate-400 font-mono">SN: {asset.serialNumber}</p>
                        </div>
                        <span className="text-xs font-bold text-slate-800">₹{asset.purchaseCost || '0'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <Card className="p-8 border-dashed border-2 border-slate-200 rounded-[2rem] text-center py-20 flex flex-col items-center justify-center gap-4 text-slate-400 bg-white">
              <Building2 className="w-12 h-12 text-slate-300" />
              <div>
                <p className="text-sm font-bold text-slate-900">Select Vendor</p>
                <p className="text-xs text-slate-500 mt-1 max-w-[200px]">Click any vendor on the left to see their profile and purchase logs.</p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Add/Edit Vendor Form Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900">{editingVendor ? 'Edit' : 'Add'} <span className="text-indigo-600">Vendor</span></h2>
                <p className="text-slate-500 text-xs mt-1">Configure company profiles, contacts, and tax IDs.</p>
              </div>
              <button title="Close" onClick={() => setIsFormOpen(false)} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            
            <form onSubmit={handleCreateOrUpdate} className="p-8 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Vendor Name</label>
                  <input type="text" placeholder="e.g. Dell India" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" value={formData.vendorName} onChange={(e) => setFormData({...formData, vendorName: e.target.value})} required />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Company Name</label>
                  <input type="text" placeholder="e.g. Dell Inc." className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" value={formData.company} onChange={(e) => setFormData({...formData, company: e.target.value})} required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Email Address</label>
                  <input type="email" placeholder="vendor@comp.com" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Phone Number</label>
                  <input type="text" placeholder="+91 99999 99999" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Contact Person</label>
                  <input type="text" placeholder="e.g. Ashish Shah" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" value={formData.contactPerson} onChange={(e) => setFormData({...formData, contactPerson: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">GST Number</label>
                  <input type="text" placeholder="Gst Number" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 font-mono" value={formData.gstNumber} onChange={(e) => setFormData({...formData, gstNumber: e.target.value})} />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Physical Address</label>
                <textarea rows={2} className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" placeholder="Street name, City, State..." value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="secondary" type="button" onClick={() => setIsFormOpen(false)}>Cancel</Button>
                <Button variant="primary" type="submit">Save Vendor</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorManagement;
