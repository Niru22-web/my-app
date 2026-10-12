import React, { useState, useEffect, useCallback } from 'react';
import { 
  Plus, 
  Search, 
  Download, 
  Upload, 
  Edit2,
  Trash2,
  Check,
  X,
  FileSpreadsheet,
  Monitor,
  HardDrive,
  User,
  Building2,
  Globe,
  ChevronDown
} from 'lucide-react';
import API from '../../api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { toast } from 'react-toastify';
import { format } from 'date-fns';

interface Asset {
  id: string;
  employee_id?: string | null;
  employeeId?: string | null;
  Employee?: {
    id: string;
    firstName?: string;
    lastName?: string;
    employeeId?: string;
    department?: string;
  } | null;
  employee?: {
    id: string;
    firstName?: string;
    lastName?: string;
    employeeId?: string;
    officeEmail?: string;
  } | null;
  assetType?: string;
  asset_type?: string;
  assetName?: string;
  asset_name?: string;
  serialNumber?: string;
  serial_number?: string;
  officeTagNo?: string;
  office_tag_no?: string;
  assetOwnerType?: string;
  asset_owner_type?: string;
  assignedDate?: string;
  assigned_date?: string;
  status: string;
  condition: string;
  charger: boolean;
  mouse: boolean;
  bag: boolean;
  others?: string;
  remarks?: string;
  [key: string]: string | boolean | number | null | undefined | object;
}

interface Employee {
  id: string;
  firstName?: string;
  lastName?: string;
  employeeId?: string;
  role?: string;
  department?: string;
}

interface User {
  id: string;
  role: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  employeeId?: string;
}

const AssetList: React.FC = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isExcelMenuOpen, setIsExcelMenuOpen] = useState(false);

  // Filter States
  const [filterOwnership, setFilterOwnership] = useState('');
  const [filterType, setFilterType] = useState('');
  
  const [formData, setFormData] = useState({
    employeeId: '',
    assetType: 'Laptop',
    assetName: '',
    serialNumber: '',
    officeTagNo: '',
    assetOwnerType: 'Company',
    assignedDate: format(new Date(), 'yyyy-MM-dd'),
    status: 'Assigned',
    condition: 'Good',
    charger: true,
    mouse: false,
    bag: false,
    others: '',
    remarks: ''
  });

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) setUser(JSON.parse(userData));
  }, []);

  const fetchAssets = useCallback(async () => {
    try {
      const res = await API.get('/assets', { 
        params: { 
          search,
          ownershipType: filterOwnership,
          assetType: filterType
        } 
      });
      if (res.data.success) {
        setAssets(res.data.data);
      }
    } catch (error) {
      toast.error('Failed to load assets');
    }
  }, [search, filterOwnership, filterType]);

  const fetchEmployees = async () => {
    try {
      const res = await API.get('/employees');
      if (res.data.success) {
        setEmployees(res.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch employees');
    }
  };

  useEffect(() => {
    fetchAssets();
    fetchEmployees();
  }, [fetchAssets]);

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingAsset) {
        await API.put(`/assets/${editingAsset.id}`, formData);
        toast.success('Asset updated successfully');
      } else {
        await API.post('/assets', formData);
        toast.success('Asset record added');
      }
      setIsFormOpen(false);
      setEditingAsset(null);
      fetchAssets();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Action failed');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this record?')) return;
    try {
      await API.delete(`/assets/${id}`);
      toast.success('Record deleted');
      fetchAssets();
    } catch (error) {
      toast.error('Delete failed');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    const formDataObj = new FormData();
    formDataObj.append('file', file);

    try {
      const res = await API.post('/assets/import', formDataObj, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data.success) {
        toast.success(res.data.message);
        if (res.data.errors) {
          console.error('Import Errors:', res.data.errors);
          toast.warning('Some rows had errors. Check console.');
        }
        fetchAssets();
        setIsImportOpen(false);
      }
    } catch (error) {
      toast.error('Import failed');
    }
  };

  const downloadTemplate = async () => {
    try {
      const response = await API.get('/assets/template', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'asset_import_template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Template downloaded successfully');
    } catch (error) {
      toast.error('Download failed');
    }
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

  const isAdminOrIT = user?.role === 'Admin' || user?.role === 'IT' || user?.role === 'Owner' || user?.role === 'Partner';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Asset <span className="text-indigo-600">Inventory</span></h1>
          <p className="text-slate-500 text-sm">Detailed list of assigned hardware and personal assets.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isAdminOrIT && (
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
                    <p className="px-3 pt-1 pb-0.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Excel Actions</p>
                    <button
                      onClick={() => { setIsExcelMenuOpen(false); exportAssets(); }}
                      className="flex items-center w-full px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 rounded-xl transition-colors text-left gap-2.5"
                    >
                      <span className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                        <Download className="w-3.5 h-3.5 text-emerald-600" />
                      </span>
                      Export to Excel
                    </button>
                    <button
                      onClick={() => { setIsExcelMenuOpen(false); setIsImportOpen(true); }}
                      className="flex items-center w-full px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-xl transition-colors text-left gap-2.5"
                    >
                      <span className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                        <Upload className="w-3.5 h-3.5 text-indigo-600" />
                      </span>
                      Import from Excel
                    </button>
                    <div className="h-px bg-slate-100 my-1" />
                    <button
                      onClick={() => { setIsExcelMenuOpen(false); downloadTemplate(); }}
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
          )}
          <Button variant="primary" size="sm" onClick={() => {
            setEditingAsset(null);
            setFormData({
              employeeId: isAdminOrIT ? '' : (user?.employeeId || ''),
              assetType: 'Laptop',
              assetName: '',
              serialNumber: '',
              officeTagNo: '',
              assetOwnerType: isAdminOrIT ? 'Company' : 'Employee Owned',
              assignedDate: format(new Date(), 'yyyy-MM-dd'),
              status: 'Assigned',
              condition: 'Good',
              charger: true,
              mouse: false,
              bag: false,
              others: '',
              remarks: ''
            });
            setIsFormOpen(true);
          }}>
            <Plus className="w-4 h-4 mr-2" />
            {isAdminOrIT ? 'Assign Asset' : 'Add My Asset'}
          </Button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-2xl shadow-sm">
        <div className="relative flex-1 min-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search serial number, tag, name, or employee..." 
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <select 
          title="Ownership Filter"
          className="px-4 py-2 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-600 focus:ring-2 focus:ring-indigo-500"
          value={filterOwnership}
          onChange={(e) => setFilterOwnership(e.target.value)}
        >
          <option value="">All Ownership</option>
          <option value="Company">Company Asset</option>
          <option value="Employee Owned">Employee Owned</option>
          <option value="Third Party">Third Party</option>
        </select>

        <select 
          title="Type Filter"
          className="px-4 py-2 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-600 focus:ring-2 focus:ring-indigo-500"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="">All Types</option>
          <option value="Laptop">Laptop</option>
          <option value="Desktop">Desktop</option>
          <option value="Mobile">Mobile</option>
          <option value="Tablet">Tablet</option>
          <option value="Monitor">Monitor</option>
          <option value="Printer">Printer</option>
        </select>

        <button 
          title="Reset Filters"
          onClick={() => {setSearch(''); setFilterOwnership(''); setFilterType('');}}
          className="p-2 bg-slate-50 rounded-xl text-slate-500 hover:text-indigo-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Asset Table */}
      <Card className="border-none shadow-xl bg-white rounded-[2rem] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Employee</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Asset Details</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Tracking</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Ownership</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Accessories</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {assets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-slate-400 text-sm">No assets found matching your criteria.</td>
                </tr>
              ) : assets.map((asset) => (
                <tr key={asset.id} className="group hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-5">
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-slate-900">{asset.Employee?.firstName} {asset.Employee?.lastName}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">{asset.Employee?.employeeId} • {asset.Employee?.department}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center">
                        {asset.asset_type === 'Laptop' ? <Monitor className="w-4 h-4" /> : <HardDrive className="w-4 h-4" />}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-700">{asset.asset_name}</span>
                        <span className="text-[10px] text-slate-400">{asset.asset_type}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Serial: <span className="text-slate-700 font-mono">{asset.serial_number}</span></span>
                      {asset.office_tag_no && (
                        <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-tighter">Tag: <span className="text-indigo-600 font-mono">{asset.office_tag_no}</span></span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center w-fit gap-1 ${
                      asset.asset_owner_type === 'Company' ? 'bg-blue-50 text-blue-600' : 
                      asset.asset_owner_type === 'Employee Owned' ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'
                    }`}>
                      {asset.asset_owner_type === 'Company' ? <Building2 className="w-2.5 h-2.5" /> : 
                       asset.asset_owner_type === 'Employee Owned' ? <User className="w-2.5 h-2.5" /> : <Globe className="w-2.5 h-2.5" />}
                      {asset.asset_owner_type}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-1.5">
                      {['charger', 'mouse', 'bag'].map(acc => (
                        <div 
                          key={acc}
                          title={acc.charAt(0).toUpperCase() + acc.slice(1)}
                          className={`w-6 h-6 rounded-md flex items-center justify-center ${asset[acc] ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-300'}`}
                        >
                          {asset[acc] ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      asset.status === 'Assigned' ? 'bg-emerald-50 text-emerald-600' : 
                      asset.status === 'Damaged' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {asset.status}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {(isAdminOrIT || asset.employee_id === user?.employeeId) && (
                        <>
                          <button 
                            title="Edit Asset"
                            onClick={() => {
                              setEditingAsset(asset);
                              setFormData({
                                employeeId: asset.employee_id || '',
                                assetType: asset.asset_type || '',
                                assetName: asset.asset_name || '',
                                serialNumber: asset.serial_number || '',
                                officeTagNo: asset.office_tag_no || '',
                                assetOwnerType: asset.asset_owner_type || '',
                                assignedDate: asset.assigned_date ? asset.assigned_date.split('T')[0] : format(new Date(), 'yyyy-MM-dd'),
                                status: asset.status,
                                condition: asset.condition,
                                charger: asset.charger,
                                mouse: asset.mouse,
                                bag: asset.bag,
                                others: asset.others || '',
                                remarks: asset.remarks || ''
                              });
                              setIsFormOpen(true);
                            }}
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            title="Delete Asset"
                            onClick={() => handleDelete(asset.id)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add/Edit Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900">{editingAsset ? 'Edit' : 'Add'} <span className="text-indigo-600">Asset</span></h2>
                <p className="text-slate-500 text-xs mt-1">Configure asset details and ownership.</p>
              </div>
              <button 
                title="Close Modal"
                onClick={() => setIsFormOpen(false)} 
                className="p-2 hover:bg-slate-50 rounded-xl text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleCreateOrUpdate} className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label htmlFor="employee-select" className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Employee</label>
                  <select 
                    id="employee-select"
                    title="Select Employee"
                    disabled={!isAdminOrIT}
                    className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    value={formData.employeeId}
                    onChange={(e) => setFormData({...formData, employeeId: e.target.value})}
                    required
                  >
                    <option value="">Select Employee</option>
                    {employees.map(emp => (
                      <option key={emp.employeeId} value={emp.employeeId}>{emp.firstName} {emp.lastName} ({emp.employeeId})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="asset-type-select" className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Asset Type</label>
                  <select 
                    id="asset-type-select"
                    title="Select Asset Type"
                    className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                    value={formData.assetType}
                    onChange={(e) => setFormData({...formData, assetType: e.target.value})}
                  >
                    <option value="Laptop">Laptop</option>
                    <option value="Desktop">Desktop</option>
                    <option value="Mobile">Mobile</option>
                    <option value="Tablet">Tablet</option>
                    <option value="Monitor">Monitor</option>
                    <option value="Printer">Printer</option>
                    <option value="Camera">Camera</option>
                    <option value="Network">Network Device</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="asset-name-input" className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Asset Name</label>
                  <input 
                    id="asset-name-input"
                    type="text" 
                    title="Asset Name"
                    placeholder="e.g. Dell Latitude 5420"
                    className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                    value={formData.assetName}
                    onChange={(e) => setFormData({...formData, assetName: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="serial-number-input" className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Serial Number</label>
                  <input 
                    id="serial-number-input"
                    type="text" 
                    title="Serial Number"
                    placeholder="e.g. SN123456789"
                    className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                    value={formData.serialNumber}
                    onChange={(e) => setFormData({...formData, serialNumber: e.target.value})}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="office-tag-input" className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Office Tag No (Optional)</label>
                  <input 
                    id="office-tag-input"
                    type="text" 
                    title="Office Tag Number"
                    placeholder="Enter office asset tag"
                    className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                    value={formData.officeTagNo}
                    onChange={(e) => setFormData({...formData, officeTagNo: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="ownership-select" className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Asset Ownership</label>
                  <select 
                    id="ownership-select"
                    title="Asset Ownership"
                    disabled={!isAdminOrIT}
                    className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    value={formData.assetOwnerType}
                    onChange={(e) => setFormData({...formData, assetOwnerType: e.target.value})}
                  >
                    <option value="Company">Company Asset</option>
                    <option value="Employee Owned">Employee Owned</option>
                    <option value="Third Party">Third Party</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="assigned-date-input" className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Assigned/Purchase Date</label>
                  <input 
                    id="assigned-date-input"
                    type="date" 
                    title="Assigned/Purchase Date"
                    className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                    value={formData.assignedDate}
                    onChange={(e) => setFormData({...formData, assignedDate: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="asset-status-select" className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</label>
                  <select 
                    id="asset-status-select"
                    title="Asset Status"
                    className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                    value={formData.status}
                    onChange={(e) => setFormData({...formData, status: e.target.value})}
                  >
                    <option value="Assigned">Assigned</option>
                    <option value="Returned">Returned</option>
                    <option value="Damaged">Damaged</option>
                    <option value="Lost">Lost</option>
                  </select>
                </div>
              </div>

              <div className="space-y-3 pt-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Accessories Included</label>
                <div className="flex gap-6">
                  {['charger', 'mouse', 'bag'].map(acc => (
                    <label key={acc} className="flex items-center gap-3 cursor-pointer group">
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${formData[acc as keyof typeof formData] ? 'bg-indigo-600 border-indigo-600' : 'border-slate-200 group-hover:border-indigo-300'}`}>
                        {formData[acc as keyof typeof formData] && <Check className="w-3 h-3 text-white" />}
                        <input 
                          type="checkbox" 
                          className="hidden" 
                          checked={!!formData[acc as keyof typeof formData]} 
                          onChange={(e) => setFormData({...formData, [acc]: e.target.checked})}
                        />
                      </div>
                      <span className="text-sm font-medium text-slate-600 capitalize">{acc}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Others / Remarks</label>
                <textarea 
                  rows={2}
                  className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                  placeholder="Additional accessories or special notes..."
                  value={formData.remarks}
                  onChange={(e) => setFormData({...formData, remarks: e.target.value})}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="secondary" type="button" onClick={() => setIsFormOpen(false)}>Cancel</Button>
                <Button variant="primary" type="submit">{editingAsset ? 'Update Changes' : 'Save Asset'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {isImportOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg p-8 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-black text-slate-900">Bulk <span className="text-indigo-600">Import</span></h2>
              <button 
                title="Close Import"
                onClick={() => setIsImportOpen(false)} 
                className="p-2 hover:bg-slate-50 rounded-xl text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-6">
              <div className="border-2 border-dashed border-slate-200 rounded-3xl p-10 flex flex-col items-center justify-center text-center space-y-4 hover:border-indigo-300 transition-colors">
                <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center">
                  <FileSpreadsheet className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Choose Excel File</p>
                  <p className="text-xs text-slate-500 mt-1">Upload your updated asset template here.</p>
                </div>
                <input 
                  type="file" 
                  title="Asset Import File"
                  accept=".xlsx, .xls"
                  onChange={handleImport}
                  className="hidden" 
                  id="asset-import-input" 
                />
                <Button variant="primary" size="sm" onClick={() => document.getElementById('asset-import-input')?.click()}>
                  Browse Files
                </Button>
              </div>
              
              <div className="bg-blue-50 p-4 rounded-2xl flex gap-3 items-start">
                <Check className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-blue-700 leading-relaxed font-medium">
                  Ensure all Employee IDs are correct. Use 'Company', 'Employee Owned', or 'Third Party' in the Ownership Type column. Empty values default to 'Company'.
                </p>
              </div>
              
              <Button variant="secondary" fullWidth onClick={downloadTemplate}>
                <Download className="w-4 h-4 mr-2" />
                Download Template
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetList;
