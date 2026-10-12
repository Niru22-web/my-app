import React, { useState, useEffect, useCallback } from 'react';
import { 
  ArrowLeftRight, Search, Check, X,
  Calendar, AlertTriangle, Printer,
  FileSpreadsheet, Download, Upload, RotateCcw, Trash2, ChevronDown
} from 'lucide-react';
import API from '../../api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { useToast } from '../../contexts/ToastContext';
import { format } from 'date-fns';

interface Employee {
  id: string;
  firstName?: string;
  lastName?: string;
  employeeId?: string;
  role?: string;
  department?: string;
  [key: string]: unknown;
}

interface Inventory {
  id: string;
  assetName: string;
  serialNumber?: string;
  officeTagNo?: string;
  assetId?: string;
  status: string;
  isDeleted?: boolean;
  location?: string;
  [key: string]: unknown;
}

interface Allocation {
  id: string;
  employeeId: string;
  inventoryId: string;
  remarks?: string;
  status?: string;
  allocatedAt?: string;
  returnedAt?: string;
  employee?: Employee;
  inventory?: Inventory;
  [key: string]: unknown;
}

interface PrintLabelItem {
  assetName: string;
  assetTag?: string;
  employeeName: string;
  employeeCode?: string;
  location?: string;
  officeTagNo?: string;
  serialNumber?: string;
}

const AssetAssignment: React.FC = () => {
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [availableAssets, setAvailableAssets] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isReturnOpen, setIsReturnOpen] = useState(false);
  const [selectedAlloc, setSelectedAlloc] = useState<Allocation | null>(null);
  const [allocatedItem, setAllocatedItem] = useState<{
    assetName: string;
    assetTag: string;
    employeeName: string;
    employeeCode: string;
    location: string;
  } | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isExcelMenuOpen, setIsExcelMenuOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importSuccess, setImportSuccess] = useState<string>('');
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [transferData, setTransferData] = useState({
    employeeId: '',
    remarks: ''
  });
  
  const toast = useToast();

  const [formData, setFormData] = useState({
    employeeId: '',
    inventoryId: '',
    remarks: ''
  });

  const [returnData, setReturnData] = useState({
    condition: 'Good',
    remarks: ''
  });

  const fetchAllocations = useCallback(async () => {
    try {
      setLoading(true);
      const res = await API.get('/assets/allocations');
      if (res.data.success) {
        setAllocations(res.data.data);
      }
    } catch (error) {
      toast.error('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchDropdowns = async () => {
    try {
      const [empRes, assetRes] = await Promise.all([
        API.get('/employees'),
        API.get('/assets')
      ]);
      if (empRes.data.success) {
        setEmployees(empRes.data.data);
      }
      if (assetRes.data.success) {
        const available = assetRes.data.data.filter((a: Inventory) => a.status === 'Available');
        setAvailableAssets(available);
      }
    } catch (error) {
      console.error('Failed to load employees or assets');
    }
  };

  useEffect(() => {
    fetchAllocations();
    fetchDropdowns();
  }, [fetchAllocations]);

  const handlePrintLabel = (item: PrintLabelItem) => {
    const assetTag = item.assetTag || item.officeTagNo || item.serialNumber || 'N/A';
    const qrDataText = `Asset: ${item.assetName} | Code: ${assetTag} | Custodian: ${item.employeeName}`;

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(qrDataText)}`;
    const barcodeUrl = `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(assetTag)}&scale=2&height=12`;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Popup blocked! Please allow popups to print asset labels.');
      return;
    }

    const htmlContent = `
      <html>
        <head>
          <title>Print Label - ${assetTag}</title>
          <style>
            body {
              background: white !important;
              color: black !important;
              margin: 0 !important;
              padding: 15px !important;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: flex !important;
              justify-content: center !important;
              align-items: center !important;
              height: 100vh !important;
            }
            .label-card {
              border: 2px solid #000000 !important;
              border-radius: 8px !important;
              padding: 15px !important;
              width: 320px !important;
              text-align: center !important;
              box-sizing: border-box !important;
              background: white !important;
            }
            .company {
              font-size: 8px !important;
              font-weight: 800 !important;
              letter-spacing: 0.1em !important;
              text-transform: uppercase !important;
              color: #555555 !important;
              margin-bottom: 3px !important;
            }
            .asset-id {
              font-size: 11px !important;
              font-weight: 900 !important;
              background: #f1f5f9 !important;
              border: 1px solid #e2e8f0 !important;
              padding: 2px 8px !important;
              border-radius: 4px !important;
              display: inline-block !important;
              margin-bottom: 6px !important;
            }
            .asset-name {
              font-size: 13px !important;
              font-weight: 800 !important;
              margin-bottom: 8px !important;
            }
            .codes-row {
              display: flex !important;
              justify-content: space-between !important;
              align-items: center !important;
              margin: 8px 0 !important;
              border-top: 1px dashed #cccccc !important;
              border-bottom: 1px dashed #cccccc !important;
              padding: 8px 0 !important;
            }
            .barcode-column {
              flex: 1 !important;
              display: flex !important;
              flex-direction: column !important;
              align-items: center !important;
            }
            .qr-column {
              width: 50px !important;
              height: 50px !important;
              margin-left: 10px !important;
            }
            .qr-image {
              width: 50px !important;
              height: 50px !important;
            }
            .custodian-row {
              text-align: left !important;
              font-size: 8px !important;
              color: #333333 !important;
              margin-top: 6px !important;
              line-height: 1.3 !important;
            }
          </style>
        </head>
        <body>
          <div class="label-card">
            <div class="company">ASA - Ashish Shah & Associates</div>
            <div class="asset-id">${assetTag}</div>
            <div class="asset-name">${item.assetName}</div>
            
            <div class="codes-row">
              <div class="barcode-column">
                <img src="${barcodeUrl}" alt="Barcode" style="height: 35px !important; object-fit: contain;" />
                <div style="font-family: monospace; font-size: 7px; margin-top: 3px; font-weight: 600;">
                  *${assetTag}*
                </div>
              </div>
              <div class="qr-column">
                <img class="qr-image" src="${qrUrl}" alt="QR Code" />
              </div>
            </div>

            <div class="custodian-row">
              <div><strong>Custodian:</strong> ${item.employeeName} (${item.employeeCode})</div>
              <div><strong>Location:</strong> ${item.location || 'Headquarters'}</div>
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              window.close();
            }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.employeeId || !formData.inventoryId) {
      toast.error('Please select both employee and asset');
      return;
    }

    // Check duplicate assignment locally
    const asset = availableAssets.find(a => a.id === formData.inventoryId);
    const employee = employees.find(e => e.id === formData.employeeId);
    if (!asset) {
      toast.error('The selected asset is not available for assignment');
      return;
    }

    try {
      const res = await API.post('/assets/allocations/assign', formData);
      if (res.data.success) {
        toast.success('Asset allocated successfully');
        setIsAssignOpen(false);
        
        // Save the details of allocated item for label printing
        const employeeName = employee ? `${employee.firstName} ${employee.lastName}` : 'Unassigned';
        const employeeCode = employee?.employeeId || 'EMP-XXXX';
        const assetName = asset?.assetName || 'Asset Item';
        const assetTag = asset?.officeTagNo || asset?.serialNumber || 'N/A';
        const location = asset?.location || 'Headquarters';

        setAllocatedItem({
          assetName,
          assetTag,
          employeeName,
          employeeCode,
          location
        });
        setIsPrintModalOpen(true);

        setFormData({ employeeId: '', inventoryId: '', remarks: '' });
        fetchAllocations();
        fetchDropdowns(); // Refresh available assets
      }
    } catch (error) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Assignment failed');
    }
  };

  const handleReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAlloc) return;
    try {
      const res = await API.patch(`/assets/allocations/${selectedAlloc.id}/return`, returnData);
      if (res.data.success) {
        toast.success('Asset marked as returned successfully');
        setIsReturnOpen(false);
        setSelectedAlloc(null);
        setReturnData({ condition: 'Good', remarks: '' });
        fetchAllocations();
        fetchDropdowns();
      }
    } catch (error) {
      toast.error('Failed to process return');
    }
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAlloc || !transferData.employeeId) {
      toast.error('Please select an employee');
      return;
    }

    try {
      const res = await API.post(`/assets/allocations/${selectedAlloc.id}/transfer`, transferData);
      if (res.data.success) {
        toast.success('Asset transferred successfully');
        setIsTransferOpen(false);
        setSelectedAlloc(null);
        setTransferData({ employeeId: '', remarks: '' });
        fetchAllocations();
        fetchDropdowns();
      }
    } catch (error) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Transfer failed');
    }
  };

  const handleDelete = async (allocationId: string) => {
    if (!window.confirm('Are you sure you want to delete this allocation record?')) return;
    try {
      const res = await API.delete(`/assets/allocations/${allocationId}`);
      if (res.data.success) {
        toast.success('Allocation record deleted successfully');
        fetchAllocations();
        fetchDropdowns();
      }
    } catch (error) {
      toast.error('Failed to delete allocation record');
    }
  };

  const exportAllocations = async () => {
    try {
      const response = await API.get('/assets/allocations/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'asset_allocations_export.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Export downloaded successfully');
    } catch (error) {
      toast.error('Failed to export allocations');
    }
  };

  const downloadTemplate = async () => {
    try {
      const response = await API.get('/assets/allocations/template', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'asset_assignment_template.xlsx');
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
      const res = await API.post('/assets/allocations/import', formDataObj, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data.success) {
        setImportSuccess(res.data.message);
        if (res.data.errors && res.data.errors.length > 0) {
          setImportErrors(res.data.errors);
        } else {
          setTimeout(() => {
            setIsImportOpen(false);
            setImportErrors([]);
            setImportSuccess('');
          }, 1200);
        }
        fetchAllocations();
        fetchDropdowns();
      }
    } catch (error) {
      const err = error as { response?: { data?: { message?: string; errors?: string[] } } };
      toast.error(err.response?.data?.message || 'Import failed');
      if (err.response?.data?.errors && Array.isArray(err.response.data.errors)) {
        setImportErrors(err.response.data.errors);
      }
    }
    e.target.value = '';
  };

  const filteredAllocations = allocations.filter(a => {
    if (!a.inventory || a.inventory.isDeleted === true) return false;

    const term = search.toLowerCase();
    return (
      a.employee?.firstName?.toLowerCase().includes(term) ||
      a.employee?.lastName?.toLowerCase().includes(term) ||
      a.inventory?.assetName?.toLowerCase().includes(term) ||
      a.inventory?.serialNumber?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Asset <span className="text-indigo-600">Assignment</span></h1>
          <p className="text-slate-500 text-sm">Allocate available equipment to employees, check department allocations, and receive returns.</p>
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
                  <p className="px-3 pt-1 pb-0.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Excel Actions</p>
                  <button
                    onClick={() => {
                      setIsExcelMenuOpen(false);
                      exportAllocations();
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
          <Button variant="primary" size="sm" onClick={() => setIsAssignOpen(true)}>
            <ArrowLeftRight className="w-4 h-4 mr-2" />
            Assign Asset
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative bg-white p-4 rounded-2xl shadow-sm">
        <Search className="absolute left-7 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input 
          type="text" 
          placeholder="Search by Employee, Asset Name, Serial..." 
          className="w-full pl-12 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Main Allocations List */}
      <Card className="border-none shadow-xl bg-white rounded-[2rem] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Asset Specs</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Employee Name</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Assigned Date</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, rowIndex) => (
                  <tr key={rowIndex} className="animate-pulse">
                    <td className="px-6 py-5">
                      <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-lg w-2/3 mb-2" />
                      <div className="h-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg w-1/2" />
                    </td>
                    <td className="px-6 py-5">
                      <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-lg w-1/2 mb-2" />
                      <div className="h-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg w-1/3" />
                    </td>
                    <td className="px-6 py-5">
                      <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-lg w-24" />
                    </td>
                    <td className="px-6 py-5">
                      <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-lg w-16" />
                    </td>
                    <td className="px-6 py-5">
                      <div className="h-8 bg-slate-100 dark:bg-slate-800 rounded-xl w-20 ml-auto" />
                    </td>
                  </tr>
                ))
              ) : filteredAllocations.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-slate-400 text-sm">No assignments active at the moment.</td>
                </tr>
              ) : filteredAllocations.map((alloc) => (
                <tr key={alloc.id} className="group hover:bg-slate-50/50 transition-colors">
                  {/* Column 1: ASSET SPECS */}
                  <td className="px-6 py-5">
                    <div className="flex flex-col items-start gap-1">
                      <span className="text-sm font-black text-slate-900 leading-none">{alloc.inventory?.assetName || 'Asset'}</span>
                      <div className="flex flex-wrap gap-1.5 items-center mt-1">
                        {alloc.inventory?.assetId && (
                          <span className="text-[9px] font-mono font-extrabold bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded text-amber-600 dark:text-amber-400">
                            ID: {alloc.inventory.assetId}
                          </span>
                        )}
                        <span className="text-[9px] font-mono font-extrabold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300">
                          Tag/SN: {alloc.inventory?.officeTagNo || alloc.inventory?.serialNumber || 'N/A'}
                        </span>
                      </div>
                    </div>
                  </td>
                  
                  {/* Column 2: EMPLOYEE NAME */}
                  <td className="px-6 py-5">
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-slate-900 leading-none">
                        {alloc.employee ? `${alloc.employee.firstName} ${alloc.employee.lastName}` : 'Unassigned'}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 mt-1">
                        {alloc.employee?.employeeId || 'EMP-XXXX'} •
                      </span>
                    </div>
                  </td>

                  {/* Column 3: ASSIGNED DATE */}
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>{alloc.allocatedAt ? format(new Date(alloc.allocatedAt), 'd/M/yyyy') : 'N/A'}</span>
                    </div>
                  </td>

                  {/* Column 4: STATUS */}
                  <td className="px-6 py-5">
                    <span className="text-xs font-black text-slate-700 uppercase tracking-wide leading-none">
                      {alloc.status === 'Allocated' ? 'Active' : alloc.status}
                    </span>
                  </td>

                  {/* Column 5: ACTIONS */}
                  <td className="px-6 py-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          setSelectedAlloc(alloc);
                          setTransferData({ employeeId: '', remarks: '' });
                          setIsTransferOpen(true);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-indigo-650 bg-white border border-slate-200 hover:border-indigo-300 rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                        Transfer
                      </button>

                      {alloc.status !== 'Returned' ? (
                        <button
                          onClick={() => {
                            setSelectedAlloc(alloc);
                            setIsReturnOpen(true);
                          }}
                          className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-indigo-655 bg-white border border-slate-200 hover:border-indigo-300 rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Return
                        </button>
                      ) : null}

                      <button
                        onClick={() => handleDelete(alloc.id)}
                        className="p-2 text-slate-400 hover:text-red-650 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
                        title="Delete Assignment"
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
      </Card>

      {/* Assign Asset Modal */}
      {isAssignOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900">Assign <span className="text-indigo-600">Equipment</span></h2>
                <p className="text-slate-500 text-xs mt-1">Select an employee and choose an available asset to allocate.</p>
              </div>
              <button title="Close" onClick={() => setIsAssignOpen(false)} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            
            <form onSubmit={handleAssign} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Select Employee</label>
                <select 
                  title="Select Employee"
                  className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                  value={formData.employeeId}
                  onChange={(e) => setFormData({...formData, employeeId: e.target.value})}
                  required
                >
                  <option value="">Choose Employee</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName} ({emp.department})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Select Asset (Only Available)</label>
                <select 
                  title="Select Asset"
                  className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                  value={formData.inventoryId}
                  onChange={(e) => setFormData({...formData, inventoryId: e.target.value})}
                  required
                >
                  <option value="">Choose Available Asset</option>
                  {availableAssets.map(a => (
                    <option key={a.id} value={a.id}>{a.assetName} [SN: {a.serialNumber}]</option>
                  ))}
                </select>
                {availableAssets.length === 0 && (
                  <p className="text-[11px] text-amber-600 flex items-center gap-1.5 font-semibold mt-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> No assets are currently available. Check stock inventory first.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Remarks / Notes</label>
                <textarea 
                  rows={2}
                  className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Assigned for remote work operations"
                  value={formData.remarks}
                  onChange={(e) => setFormData({...formData, remarks: e.target.value})}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="secondary" type="button" onClick={() => setIsAssignOpen(false)}>Cancel</Button>
                <Button variant="primary" type="submit" disabled={availableAssets.length === 0}>Assign Equipment</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transfer Asset Modal */}
      {isTransferOpen && selectedAlloc && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900">Transfer <span className="text-indigo-600">Equipment</span></h2>
                <p className="text-slate-500 text-xs mt-1">
                  Transfer custody of <strong>{selectedAlloc.inventory?.assetName}</strong> to another employee.
                </p>
              </div>
              <button title="Close" onClick={() => setIsTransferOpen(false)} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleTransferSubmit} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Select New Custodian</label>
                <select 
                  title="Select Employee"
                  className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                  value={transferData.employeeId}
                  onChange={(e) => setTransferData({...transferData, employeeId: e.target.value})}
                  required
                >
                  <option value="">Choose Employee</option>
                  {employees
                    .filter(emp => emp.id !== selectedAlloc.employeeId)
                    .map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName} ({emp.department})</option>
                    ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Remarks / Transfer Notes</label>
                <textarea 
                  rows={2}
                  className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Custody transferred for temporary project handover"
                  value={transferData.remarks}
                  onChange={(e) => setTransferData({...transferData, remarks: e.target.value})}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="secondary" type="button" onClick={() => setIsTransferOpen(false)}>Cancel</Button>
                <Button variant="primary" type="submit">Transfer Custody</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Return Asset Modal */}
      {isReturnOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-slate-900">Return <span className="text-rose-600">Asset</span></h2>
              <button title="Close" onClick={() => setIsReturnOpen(false)} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            
            <form onSubmit={handleReturn} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Device Return Condition</label>
                <select 
                  title="Return Condition"
                  className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 font-bold"
                  value={returnData.condition}
                  onChange={(e) => setReturnData({...returnData, condition: e.target.value})}
                >
                  <option value="Good">Good (Working fine)</option>
                  <option value="Damaged">Damaged (Needs repair)</option>
                  <option value="Scrapped">Retired/Scrapped (Not usable)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Remarks on return</label>
                <textarea 
                  rows={2}
                  className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                  placeholder="Notes on return status..."
                  value={returnData.remarks}
                  onChange={(e) => setReturnData({...returnData, remarks: e.target.value})}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="secondary" type="button" onClick={() => setIsReturnOpen(false)}>Cancel</Button>
                <Button variant="primary" className="bg-rose-600 hover:bg-rose-700" type="submit">Process Return</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print Label Modal */}
      {isPrintModalOpen && allocatedItem && (
        <Modal
          isOpen={isPrintModalOpen}
          onClose={() => {
            setIsPrintModalOpen(false);
            setAllocatedItem(null);
          }}
          title="Print Asset Label"
          size="md"
        >
          <div className="flex flex-col items-center justify-center p-6 space-y-6">
            <p className="text-slate-500 text-sm text-center">
              Asset allocated successfully! You can print the barcode tag for the device now.
            </p>
            
            {/* Label Preview Card */}
            <div className="border border-dashed border-slate-350 dark:border-slate-800 p-6 text-center rounded-2xl bg-white text-black shadow-lg w-[260px] h-[160px] flex flex-col justify-between select-none">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-850 leading-none">ASA INVENTORY</p>
              <div className="text-[10px] font-black bg-slate-100 border border-slate-200 px-2 py-0.5 rounded inline-block self-center my-0.5 font-mono">
                {allocatedItem.assetTag}
              </div>
              <p className="text-xs font-black text-slate-800 truncate w-full px-2 leading-tight">{allocatedItem.assetName}</p>
              
              <div className="flex gap-4 items-center justify-between border-t border-b border-dashed border-slate-200 py-3 my-1">
                {/* 1D Barcode Image from Asset Tag */}
                <div className="flex flex-col items-center justify-center flex-1">
                  <img 
                    src={`https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(allocatedItem.assetTag)}&scale=2&height=12`} 
                    alt="1D Barcode" 
                    className="h-9 w-full object-contain" 
                  />
                  <p className="text-[7.5px] font-mono font-bold tracking-wider text-slate-900 mt-1 leading-none">
                    *{allocatedItem.assetTag}*
                  </p>
                </div>
                
                {/* 2D QR Code */}
                <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center border border-slate-100 p-0.5 rounded bg-white">
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(`Asset: ${allocatedItem.assetName} | Code: ${allocatedItem.assetTag} | Custodian: ${allocatedItem.employeeName}`)}`} 
                    alt="QR Code" 
                    className="w-full h-full" 
                  />
                </div>
              </div>

              <div className="text-left text-[8.5px] text-slate-700 leading-normal">
                <div><strong>Custodian:</strong> {allocatedItem.employeeName} ({allocatedItem.employeeCode})</div>
                <div><strong>Location:</strong> {allocatedItem.location}</div>
              </div>
            </div>

            <div className="flex justify-end gap-3 w-full pt-4 border-t border-slate-100 dark:border-slate-800">
              <Button 
                variant="secondary" 
                onClick={() => {
                  setIsPrintModalOpen(false);
                  setAllocatedItem(null);
                }}
              >
                Close
              </Button>
              <Button
                variant="primary"
                onClick={() => handlePrintLabel(allocatedItem)}
                leftIcon={<Printer className="w-4 h-4" />}
              >
                Print Label
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Import Modal */}
      {isImportOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg p-8 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-black text-slate-900">Bulk <span className="text-indigo-600">Import Assignments</span></h2>
                <p className="text-slate-500 text-xs mt-1">Upload asset allocations to employees using Excel sheet.</p>
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
              <div
                className="border-2 border-dashed border-slate-200 rounded-3xl p-8 flex flex-col items-center justify-center text-center space-y-3 hover:border-indigo-300 transition-colors cursor-pointer group"
                onClick={() => document.getElementById('assignment-import-input')?.click()}
              >
                <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                  <FileSpreadsheet className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Choose Excel File</p>
                  <p className="text-xs text-slate-500 mt-0.5">Upload your populated assignment template here (.xlsx, .xls).</p>
                </div>
                <input 
                  type="file" 
                  title="Assignment Import File"
                  accept=".xlsx, .xls"
                  onChange={handleImport}
                  className="hidden" 
                  id="assignment-import-input" 
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
                    Ensure <strong>Employee Email</strong> and <strong>Asset ID</strong> are specified. The selected assets must currently be marked as <strong>Available</strong> in the inventory.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetAssignment;
