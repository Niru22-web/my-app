import React, { useState, useEffect, useCallback } from 'react';
import { 
   Plus, Search, Download, Upload, Edit2, Trash2, Check, X,
   Monitor, HardDrive, Globe, AlertTriangle,
   FileSpreadsheet, ChevronDown
} from 'lucide-react';
import API from '../../api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { useToast } from '../../contexts/ToastContext';
import { format } from 'date-fns';
import TableSkeleton from '../../components/ui/TableSkeleton';

interface Category {
  id: string;
  name: string;
}

interface Type {
  id: string;
  name: string;
  category: { name: string };
}

interface Location {
  id: string;
  name: string;
}

interface Vendor {
  id: string;
  name: string;
  vendorName?: string;
  company?: string;
  [key: string]: unknown;
}

interface Asset {
  id: string;
  assetId?: string;
  assetName: string;
  category: string;
  type: string;
  serialNumber?: string;
  officeTagNo?: string;
  status: string;
  cost?: number;
  purchaseCost?: number;
  purchaseDate?: string;
  warrantyExpiry?: string;
  vendorId?: string;
  vendor?: Vendor;
  location?: string;
  remarks?: string;
  condition?: string;
  description?: string;
  isDeleted?: boolean;
  [key: string]: unknown;
}

const AssetCRUD: React.FC = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<Category[]>([
    { id: '1', name: 'Hardware' },
    { id: '2', name: 'Software' },
    { id: '3', name: 'Infrastructure' }
  ]);
  const [types, setTypes] = useState<Type[]>([
    { id: '1', name: 'Laptop', category: { name: 'Hardware' } },
    { id: '2', name: 'Monitor', category: { name: 'Hardware' } },
    { id: '3', name: 'Keyboard', category: { name: 'Hardware' } },
    { id: '4', name: 'Mouse', category: { name: 'Hardware' } },
    { id: '5', name: 'Mobile', category: { name: 'Hardware' } },
    { id: '6', name: 'License', category: { name: 'Software' } },
    { id: '7', name: 'Cloud Subscription', category: { name: 'Software' } }
  ]);
  const [locations, setLocations] = useState<Location[]>([
    { id: '1', name: 'Headquarters' },
    { id: '2', name: 'Mumbai Office' },
    { id: '3', name: 'Bangalore Tech Hub' }
  ]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);

  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [isExcelMenuOpen, setIsExcelMenuOpen] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importSuccess, setImportSuccess] = useState<string>('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Filter States
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const toast = useToast();

  const [formData, setFormData] = useState({
    assetId: '',
    assetName: '',
    category: 'Hardware',
    type: 'Laptop',
    serialNumber: '',
    officeTagNo: '',
    purchaseDate: format(new Date(), 'yyyy-MM-dd'),
    purchaseCost: '',
    vendorId: '',
    warrantyExpiry: format(new Date(), 'yyyy-MM-dd'),
    status: 'Available',
    location: 'Headquarters',
    description: '',
    condition: 'New'
  });

  const fetchAssets = useCallback(async () => {
    try {
      setLoading(true);
      const res = await API.get('/assets', {
        params: {
          search,
          status: filterStatus,
          assetType: filterCategory
        }
      });
      if (res.data.success) {
        setAssets(res.data.data);
      }
    } catch (error) {
      toast.error('Failed to load assets');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, filterCategory, toast]);

  const fetchDropdowns = async () => {
    try {
      const [catRes, typeRes, locRes, venRes] = await Promise.allSettled([
        API.get('/assets/masters/categories'),
        API.get('/assets/masters/types'),
        API.get('/assets/masters/locations'),
        API.get('/assets/vendors')
      ]);
      if (catRes.status === 'fulfilled' && catRes.value.data.success && catRes.value.data.data?.length > 0) {
        setCategories(catRes.value.data.data);
      }
      if (typeRes.status === 'fulfilled' && typeRes.value.data.success && typeRes.value.data.data?.length > 0) {
        setTypes(typeRes.value.data.data);
      }
      if (locRes.status === 'fulfilled' && locRes.value.data.success && locRes.value.data.data?.length > 0) {
        setLocations(locRes.value.data.data);
      }
      if (venRes.status === 'fulfilled' && venRes.value.data.success && venRes.value.data.data?.length > 0) {
        setVendors(venRes.value.data.data);
      }
    } catch (error) {
      console.error('Failed to load masters lists', error);
    }
  };

  useEffect(() => {
    fetchAssets();
    fetchDropdowns();
  }, [fetchAssets]);

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        purchaseCost: formData.purchaseCost ? parseFloat(formData.purchaseCost) : undefined
      };
      
      if (editingAsset) {
        await API.put(`/assets/${editingAsset.id}`, payload);
        toast.success('Asset updated successfully');
      } else {
        await API.post('/assets', payload);
        toast.success('Asset added successfully');
      }
      setIsFormOpen(false);
      setEditingAsset(null);
      fetchAssets();
    } catch (error) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Action failed');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to retire/delete this asset?')) return;
    try {
      await API.delete(`/assets/${id}`);
      toast.success('Asset retired successfully');
      fetchAssets();
    } catch (error) {
      toast.error('Delete failed');
    }
  };

  const generateQRCode = (asset: Asset) => {
    // Generates a mock QR code via text / public QR API for representation
    const text = `Asset: ${asset.assetName} | SN: ${asset.serialNumber} | Status: ${asset.status}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(text)}`;
    setQrCodeData(qrUrl);
  };

  const exportAssets = async () => {
    try {
      const response = await API.get('/assets/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'asset_inventory_export.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Export downloaded successfully');
    } catch (error) {
      toast.error('Failed to export assets');
    }
  };

  const downloadTemplate = async () => {
    try {
      const response = await API.get('/assets/template', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'asset_inventory_template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Template downloaded successfully');
    } catch (error) {
      toast.error('Failed to download template');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    const formDataObj = new FormData();
    formDataObj.append('file', file);
    setImportErrors([]);
    setImportSuccess('');

    try {
      const res = await API.post('/assets/import', formDataObj, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data.success) {
        setImportSuccess(res.data.message);
        if (res.data.errors && res.data.errors.length > 0) {
          setImportErrors(res.data.errors);
        } else {
          // All clean — close the modal after a short pause
          setTimeout(() => {
            setIsImportOpen(false);
            setImportErrors([]);
            setImportSuccess('');
          }, 1200);
        }
        fetchAssets();
      }
    } catch (error) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Import failed');
    }
    // Reset file input so same file can be re-selected after fixes
    e.target.value = '';
  };

  // Filtered lists
  const filteredAssets = assets.filter(a => {
    const matchesSearch = search === '' || 
      a.assetName?.toLowerCase().includes(search.toLowerCase()) || 
      a.serialNumber?.toLowerCase().includes(search.toLowerCase()) ||
      a.assetId?.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  // Pagination Logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredAssets.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredAssets.length / itemsPerPage);

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'available': return 'success';
      case 'assigned': return 'primary';
      case 'maintenance': return 'warning';
      case 'retired': return 'danger';
      case 'lost': return 'danger';
      default: return 'secondary';
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Asset <span className="text-indigo-600">Inventory</span></h1>
          <p className="text-slate-500 text-sm">Add, update, search, and manage your complete company hardware & fleets.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <button
              onClick={() => setIsExcelMenuOpen(!isExcelMenuOpen)}
              className="flex items-center gap-2 h-10 px-4 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900 text-sm font-semibold rounded-full shadow-sm ring-4 ring-slate-100 transition-all duration-200 cursor-pointer outline-none group"
            >
              <FileSpreadsheet className="w-4 h-4 text-green-600 transition-transform group-hover:scale-110" />
              <span>Excel Actions</span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isExcelMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {isExcelMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIsExcelMenuOpen(false)} />
                <div className="absolute right-0 mt-2 w-52 rounded-2xl bg-white shadow-xl border border-slate-100 p-2 z-20 space-y-1 animate-in fade-in slide-in-from-top-2 duration-200">
                  {/* Section label */}
                  <p className="px-3 pt-1 pb-0.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Excel Actions</p>
                  <button
                    onClick={() => {
                      setIsExcelMenuOpen(false);
                      exportAssets();
                    }}
                    className="flex items-center w-full px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 rounded-xl transition-colors text-left gap-2.5"
                  >
                    <span className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                      <Download className="w-3.5 h-3.5 text-emerald-600" />
                    </span>
                    Export to Excel
                  </button>
                  <button
                    onClick={() => {
                      setIsExcelMenuOpen(false);
                      setIsImportOpen(true);
                    }}
                    className="flex items-center w-full px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-xl transition-colors text-left gap-2.5"
                  >
                    <span className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                      <Upload className="w-3.5 h-3.5 text-indigo-600" />
                    </span>
                    Import from Excel
                  </button>
                  <div className="h-px bg-slate-100 my-1" />
                  <button
                    onClick={() => {
                      setIsExcelMenuOpen(false);
                      downloadTemplate();
                    }}
                    className="flex items-center w-full px-3 py-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-700 rounded-xl transition-colors text-left gap-2.5"
                  >
                    <span className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500" />
                    </span>
                    Download Template
                  </button>
                </div>
              </>
            )}
          </div>
          <Button variant="primary" size="sm" onClick={() => {
            setEditingAsset(null);
            setFormData({
              assetId: '',
              assetName: '',
              category: 'Hardware',
              type: 'Laptop',
              serialNumber: '',
              officeTagNo: '',
              purchaseDate: format(new Date(), 'yyyy-MM-dd'),
              purchaseCost: '',
              vendorId: '',
              warrantyExpiry: format(new Date(), 'yyyy-MM-dd'),
              status: 'Available',
              location: 'Headquarters',
              description: '',
              condition: 'New'
            });
            setIsFormOpen(true);
          }}>
            <Plus className="w-4 h-4 mr-2" />
            Add Asset
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-2xl shadow-sm">
        <div className="relative flex-1 min-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            id="search-assets-input"
            title="Search Assets"
            placeholder="Search by ID, Serial Number, Asset Name..." 
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <select 
          title="Status Filter"
          className="px-4 py-2 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-600 focus:ring-2 focus:ring-indigo-500"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="Available">Available</option>
          <option value="Assigned">Assigned</option>
          <option value="Maintenance">Maintenance</option>
          <option value="Retired">Retired</option>
          <option value="Lost">Lost</option>
        </select>

        <select 
          title="Category Filter"
          className="px-4 py-2 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-600 focus:ring-2 focus:ring-indigo-500"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
        >
          <option value="">All Categories</option>
          <option value="Hardware">Hardware</option>
          <option value="Software">Software</option>
          <option value="Infrastructure">Infrastructure</option>
        </select>
      </div>

      {/* Main Table */}
      {loading ? (
        <TableSkeleton columns={6} rows={8} />
      ) : (
        <Card className="border-none shadow-xl bg-white rounded-[2rem] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-55/50">
                  <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Asset Details</th>
                  <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Tracking (Serial/Tag)</th>
                  <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Purchase Info</th>
                  <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Location</th>
                  <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {currentItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-slate-400 text-sm">No assets registered yet.</td>
                  </tr>
                ) : currentItems.map((asset) => (
                  <tr key={asset.id} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center">
                          {asset.category === 'Hardware' ? <Monitor className="w-4 h-4" /> : <HardDrive className="w-4 h-4" />}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-700">{asset.assetName}</span>
                          <span className="text-[10px] text-slate-400">{asset.category} • {asset.type}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-0.5">
                        {asset.assetId && (
                          <span className="text-[10px] text-amber-550 font-bold uppercase tracking-tighter">ID: <span className="text-amber-700 font-mono">{asset.assetId}</span></span>
                        )}
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Serial: <span className="text-slate-700 font-mono">{asset.serialNumber}</span></span>
                        {asset.officeTagNo && (
                          <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-tighter">Tag: <span className="text-indigo-600 font-mono">{asset.officeTagNo}</span></span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-xs text-slate-500 font-medium">
                      <div className="flex flex-col">
                        <span>Cost: ₹{asset.purchaseCost || '0'}</span>
                        <span>Date: {asset.purchaseDate ? format(new Date(asset.purchaseDate), 'dd MMM yyyy') : 'N/A'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-xs text-slate-500 font-semibold">{asset.location || 'Headquarters'}</td>
                    <td className="px-6 py-5">
                      <Badge variant={getStatusColor(asset.status)} className="rounded-lg text-[9px] font-black uppercase tracking-widest">{asset.status}</Badge>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-2 transition-all">
                        <button 
                          title="Generate QR Code"
                          onClick={() => generateQRCode(asset)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        >
                          <Globe className="w-4 h-4" />
                        </button>
                        <button 
                          title="Edit Asset"
                          onClick={() => {
                            setEditingAsset(asset);
                            setFormData({
                              assetId: asset.assetId || '',
                              assetName: asset.assetName,
                              category: asset.category,
                              type: asset.type,
                              serialNumber: asset.serialNumber || '',
                              officeTagNo: asset.officeTagNo || '',
                              purchaseDate: asset.purchaseDate ? asset.purchaseDate.split('T')[0] : format(new Date(), 'yyyy-MM-dd'),
                              purchaseCost: asset.purchaseCost ? asset.purchaseCost.toString() : '',
                              vendorId: asset.vendorId || '',
                              warrantyExpiry: asset.warrantyExpiry ? asset.warrantyExpiry.split('T')[0] : format(new Date(), 'yyyy-MM-dd'),
                              status: asset.status,
                              location: asset.location || '',
                              description: asset.description || '',
                              condition: asset.condition || 'New'
                            });
                            setIsFormOpen(true);
                          }}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          title="Retire Asset"
                          onClick={() => handleDelete(asset.id)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-bold">Showing {indexOfFirstItem + 1} - {Math.min(indexOfLastItem, filteredAssets.length)} of {filteredAssets.length} Assets</span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={currentPage === 1} onClick={() => setCurrentPage(c => c - 1)}>Previous</Button>
                <Button size="sm" variant="secondary" disabled={currentPage === totalPages} onClick={() => setCurrentPage(c => c + 1)}>Next</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Import Modal */}
      {isImportOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg p-8 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-black text-slate-900">Bulk <span className="text-indigo-600">Import Assets</span></h2>
                <p className="text-slate-500 text-xs mt-1">Upload company hardware and fleet assets using Excel sheet.</p>
              </div>
              <button 
                title="Close Import"
                onClick={() => { setIsImportOpen(false); setImportErrors([]); setImportSuccess(''); }} 
                className="p-2 hover:bg-slate-50 rounded-xl text-slate-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Drop Zone */}
              <div
                className="border-2 border-dashed border-slate-200 rounded-3xl p-8 flex flex-col items-center justify-center text-center space-y-3 hover:border-indigo-300 transition-colors cursor-pointer group"
                onClick={() => document.getElementById('asset-import-input')?.click()}
              >
                <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                  <FileSpreadsheet className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Choose Excel File</p>
                  <p className="text-xs text-slate-500 mt-0.5">Upload your populated asset template here (.xlsx, .xls).</p>
                </div>
                <input 
                  type="file" 
                  title="Asset Import File"
                  accept=".xlsx, .xls"
                  onChange={handleImport}
                  className="hidden" 
                  id="asset-import-input" 
                />
                <Button variant="primary" size="sm">Browse Files</Button>
              </div>

              {/* Success Banner */}
              {importSuccess && (
                <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3">
                  <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <p className="text-xs font-bold text-emerald-700">{importSuccess}</p>
                </div>
              )}

              {/* Error List */}
              {importErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                    <p className="text-xs font-black text-red-700 uppercase tracking-wide">
                      {importErrors.length} row{importErrors.length > 1 ? 's' : ''} had errors — please fix and re-upload
                    </p>
                  </div>
                  <ul className="space-y-1 max-h-40 overflow-y-auto pr-1">
                    {importErrors.map((err, i) => (
                      <li key={i} className="text-[11px] text-red-600 font-medium leading-relaxed flex items-start gap-1.5">
                        <span className="mt-0.5 flex-shrink-0">•</span>
                        {err}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Info tip */}
              {importErrors.length === 0 && !importSuccess && (
                <div className="bg-indigo-50/50 border border-indigo-100/40 p-4 rounded-2xl flex gap-3 items-start">
                  <Check className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-indigo-800/80 leading-relaxed font-medium">
                    Ensure <strong>Asset Name</strong>, <strong>Category</strong>, <strong>Type</strong>, and <strong>Serial Number</strong> are specified. Serial numbers must be unique across the entire inventory.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* QR Code Viewer Modal */}
      {qrCodeData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] shadow-2xl p-8 max-w-sm text-center space-y-6">
            <h3 className="text-lg font-black text-slate-900">Asset <span className="text-indigo-600">Tag QR Code</span></h3>
            <div className="bg-slate-50 p-6 rounded-2xl inline-block border border-slate-100">
              <img src={qrCodeData} alt="Asset QR Code" className="w-[180px] h-[180px]" />
            </div>
            <p className="text-xs text-slate-500 leading-relaxed font-medium">Scan this QR Code using any handheld scanner or camera to read inventory parameters dynamically.</p>
            <Button variant="secondary" fullWidth onClick={() => setQrCodeData(null)}>Close</Button>
          </div>
        </div>
      )}

      {/* Asset Setup / Edit Form */}
      {isFormOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-3xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-2xl font-black text-slate-900">{editingAsset ? 'Edit' : 'Register'} <span className="text-indigo-600">Asset Fleet</span></h2>
                <p className="text-slate-500 text-xs mt-1">Populate general tracking parameters, warranty expiry, locations, and costs.</p>
              </div>
              <button title="Close" onClick={() => setIsFormOpen(false)} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            
            <form onSubmit={handleCreateOrUpdate} className="p-8 overflow-y-auto space-y-6 flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block" htmlFor="assetId-form">Asset ID (Optional)</label>
                  <input type="text" id="assetId-form" title="Asset ID" placeholder="e.g. AST-10024" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" value={formData.assetId} onChange={(e) => setFormData({...formData, assetId: e.target.value})} />
                </div>
                
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block" htmlFor="assetName-form">Asset Name</label>
                  <input type="text" id="assetName-form" title="Asset Name" placeholder="e.g. Lenovo ThinkPad T14" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" value={formData.assetName} onChange={(e) => setFormData({...formData, assetName: e.target.value})} required />
                </div>
                
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block" htmlFor="category-form">Category</label>
                  <select id="category-form" title="Category" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})}>
                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block" htmlFor="type-form">Type</label>
                  <select id="type-form" title="Type" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" value={formData.type} onChange={(e) => setFormData({...formData, type: e.target.value})}>
                    {types.filter(t => t.category?.name === formData.category || true).map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block" htmlFor="serialNumber-form">Serial Number</label>
                  <input type="text" id="serialNumber-form" title="Serial Number" placeholder="Enter hardware serial number" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" value={formData.serialNumber} onChange={(e) => setFormData({...formData, serialNumber: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block" htmlFor="officeTagNo-form">Office Tag Number</label>
                  <input type="text" id="officeTagNo-form" title="Office Tag Number" placeholder="e.g. ASA-2026-IT091" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" value={formData.officeTagNo} onChange={(e) => setFormData({...formData, officeTagNo: e.target.value})} />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block" htmlFor="purchaseDate-form">Purchase Date</label>
                  <input type="date" id="purchaseDate-form" title="Purchase Date" placeholder="Purchase Date" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" value={formData.purchaseDate} onChange={(e) => setFormData({...formData, purchaseDate: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block" htmlFor="purchaseCost-form">Purchase Cost (₹)</label>
                  <input type="number" id="purchaseCost-form" title="Purchase Cost" placeholder="0.00" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" value={formData.purchaseCost} onChange={(e) => setFormData({...formData, purchaseCost: e.target.value})} />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block" htmlFor="warrantyExpiry-form">Warranty Expiry</label>
                  <input type="date" id="warrantyExpiry-form" title="Warranty Expiry" placeholder="Warranty Expiry" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" value={formData.warrantyExpiry} onChange={(e) => setFormData({...formData, warrantyExpiry: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block" htmlFor="vendorId-form">Vendor</label>
                  <select id="vendorId-form" title="Vendor" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" value={formData.vendorId} onChange={(e) => setFormData({...formData, vendorId: e.target.value})}>
                    <option value="">Select Vendor</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.vendorName} ({v.company})</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block" htmlFor="location-form">Location</label>
                  <select id="location-form" title="Location" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" value={formData.location} onChange={(e) => setFormData({...formData, location: e.target.value})}>
                    {locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block" htmlFor="status-form">Status</label>
                  <select id="status-form" title="Status" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" value={formData.status} onChange={(e) => setFormData({...formData, status: e.target.value})}>
                    <option value="Available">Available</option>
                    <option value="Assigned">Assigned</option>
                    <option value="Maintenance">Maintenance</option>
                    <option value="Retired">Retired</option>
                    <option value="Lost">Lost</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Asset Description</label>
                <textarea rows={3} className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" placeholder="Type specifications like CPU, RAM, OS, or notes here..." value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} />
              </div>

              <div className="flex justify-end gap-3 pt-4 flex-shrink-0">
                <Button variant="secondary" type="button" onClick={() => setIsFormOpen(false)}>Cancel</Button>
                <Button variant="primary" type="submit">Save Record</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetCRUD;
