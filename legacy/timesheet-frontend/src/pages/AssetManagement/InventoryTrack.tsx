import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Search, CheckCircle, Wrench, Clock, Printer, Monitor, X
} from 'lucide-react';
import API from '../../api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { useToast } from '../../contexts/ToastContext';
import { useTheme } from '../../contexts/ThemeContext';

interface Employee {
  id: string;
  firstName?: string;
  lastName?: string;
  employeeId?: string;
  [key: string]: unknown;
}

interface Inventory {
  id: string;
  assetName: string;
  category?: string;
  type?: string;
  serialNumber?: string;
  officeTagNo?: string;
  assetId?: string;
  status?: string;
  location?: string;
  isDeleted?: boolean;
  [key: string]: unknown;
}

interface AllocatedItem {
  id: string;
  assetName?: string;
  serialNumber?: string;
  assetTag?: string;
  officeTagNo?: string;
  employeeName?: string;
  employeeCode?: string;
  departmentName?: string;
  allocatedAt?: string;
  status?: string;
  condition?: string;
  remarks?: string;
  employee?: Employee;
  inventory?: Inventory;
  [key: string]: unknown;
}

const AssetsHub: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const initialTab = (tabParam && ['assigned', 'maintenance', 'available', 'retired'].includes(tabParam) 
    ? tabParam 
    : 'assigned') as 'assigned' | 'maintenance' | 'available' | 'retired';

  const [allocations, setAllocations] = useState<AllocatedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'assigned' | 'maintenance' | 'available' | 'retired'>(initialTab);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBatchMode, setIsBatchMode] = useState(false);
  
  // Sync state with search params changes
  useEffect(() => {
    if (tabParam && ['assigned', 'maintenance', 'available', 'retired'].includes(tabParam)) {
      setActiveTab(tabParam as 'assigned' | 'maintenance' | 'available' | 'retired');
    }
  }, [tabParam]);

  useEffect(() => {
    setSelectedIds([]);
    setIsBatchMode(false);
  }, [activeTab]);
  
  const toast = useToast();
  const { themeMode } = useTheme();
  const isDark = themeMode === 'dark';


  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await API.get('/assets/allocations').catch(() => ({ data: { success: false, data: [] } }));
      if (res.data.success) {
        setAllocations(res.data.data);
      }
    } catch (error) {
      console.warn('⚠️ Could not load active allocations list. Using high-fidelity fallback assignments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Convert real database allocations dynamically into simple list structures
  const dynamicItems = (allocations || [])
    .filter(alloc => alloc.inventory && alloc.inventory.isDeleted !== true)
    .map((alloc, index) => {
    const employeeName = alloc.employee ? `${alloc.employee.firstName || ''} ${alloc.employee.lastName || ''}`.trim() : 'Unassigned';
    const employeeCode = alloc.employee?.employeeId || 'EMP-XXXX';
    const assetName = alloc.inventory?.assetName || 'Asset Item';
    const brandModel = `${alloc.inventory?.category || 'Hardware'} • ${alloc.inventory?.type || 'Device'}`;
    const assetTag = alloc.inventory?.officeTagNo || alloc.inventory?.serialNumber || 'N/A';
    const serialNumber = alloc.inventory?.serialNumber || 'SN-UNKNOWN';
    const location = alloc.inventory?.location || 'N/A';
    
    let tab = 'assigned';
    if (alloc.inventory?.status?.toLowerCase() === 'maintenance') tab = 'maintenance';
    else if (alloc.inventory?.status?.toLowerCase() === 'retired' || alloc.inventory?.status?.toLowerCase() === 'lost') tab = 'retired';
    else if (alloc.inventory?.status?.toLowerCase() === 'available' || alloc.status?.toLowerCase() === 'returned') tab = 'available';

    return {
      id: alloc.id || `dynamic-${index}`,
      assetTag,
      assetName,
      brandModel,
      status: alloc.inventory?.status || alloc.status || 'Assigned',
      employeeName,
      employeeCode,
      location,
      serialNumber,
      assetId: alloc.inventory?.assetId || '',
      tab
    };
  });

  // Display only the original database allocations data
  const allItems = dynamicItems;

  // Filter counters based on the merged dynamic + mock dataset
  const inUseCount = allItems.filter(a => a.tab === 'assigned').length;
  const repairCount = allItems.filter(a => a.tab === 'maintenance').length;
  const availableCount = allItems.filter(a => a.tab === 'available').length;
  const vendorCount = allItems.filter(a => a.tab === 'retired').length;

  // Filter items matching active tab and search query
  const getFilteredItems = () => {
    return allItems.filter(a => {
      // Tab filter
      if (a.tab !== activeTab) return false;

      // Search filter
      if (search === '') return true;

      const term = search.toLowerCase();
      return (
        a.assetName?.toLowerCase().includes(term) ||
        a.serialNumber?.toLowerCase().includes(term) ||
        a.assetTag?.toLowerCase().includes(term) ||
        a.employeeName?.toLowerCase().includes(term) ||
        a.employeeCode?.toLowerCase().includes(term)
      );
    });
  };

  // Dynamic isolated label printer for browser
  const handlePrintLabel = (item: AllocatedItem) => {
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

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = (items: AllocatedItem[]) => {
    const allFilteredIds = items.map(item => item.id);
    const allSelected = allFilteredIds.every(id => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !allFilteredIds.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...allFilteredIds])));
    }
  };

  const handlePrintLabelsByIds = (ids: string[]) => {
    const itemsToPrint = allItems.filter(item => ids.includes(item.id));
    if (itemsToPrint.length === 0) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Popup blocked! Please allow popups to print asset labels.');
      return;
    }

    const htmlContent = `
      <html>
        <head>
          <title>Print Labels (${itemsToPrint.length})</title>
          <style>
            body {
              background: white !important;
              color: black !important;
              margin: 0 !important;
              padding: 0 !important;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }
            .print-container {
              display: flex !important;
              flex-direction: column !important;
              align-items: center !important;
              gap: 20px !important;
              padding: 20px !important;
            }
            .label-card {
              border: 2px solid #000000 !important;
              border-radius: 8px !important;
              padding: 15px !important;
              width: 320px !important;
              text-align: center !important;
              box-sizing: border-box !important;
              background: white !important;
              page-break-after: always !important;
              break-after: page !important;
            }
            .label-card:last-child {
              page-break-after: avoid !important;
              break-after: avoid !important;
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
            @media print {
              .label-card {
                margin: 0 auto !important;
                page-break-after: always !important;
                break-after: page !important;
              }
              .label-card:last-child {
                page-break-after: avoid !important;
                break-after: avoid !important;
              }
            }
          </style>
        </head>
        <body>
          <div class="print-container">
            ${itemsToPrint.map(item => {
              const assetTag = item.assetTag || item.serialNumber || 'N/A';
              const qrDataText = `Asset: ${item.assetName} | Code: ${assetTag} | Custodian: ${item.employeeName}`;
              const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(qrDataText)}`;
              const barcodeUrl = `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(assetTag)}&scale=2&height=12`;
              return `
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
              `;
            }).join('')}
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

  const filteredItems = getFilteredItems();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Assets Hub</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm italic font-medium mt-1">
            Centralized barcode and tracking hub categorized by asset status
          </p>
        </div>
        <div>
          <Button
            variant={isBatchMode ? "secondary" : "primary"}
            size="sm"
            onClick={() => {
              setIsBatchMode(!isBatchMode);
              setSelectedIds([]);
            }}
            leftIcon={isBatchMode ? <X className="w-4 h-4" /> : <Printer className="w-4 h-4" />}
            className="h-9 shadow-sm"
          >
            {isBatchMode ? "Exit Batch Print" : "Multiple Print"}
          </Button>
        </div>
      </div>

      {/* Filter Sub-Navbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-3 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800/40">
        <div className="flex flex-wrap items-center gap-1.5 py-0.5">
          {[
            { id: 'assigned', label: 'In Use', count: inUseCount, icon: Monitor },
            { id: 'maintenance', label: 'Sent for Repair', count: repairCount, icon: Wrench },
            { id: 'available', label: 'Available On Site', count: availableCount, icon: CheckCircle },
            { id: 'retired', label: 'To Be Returned to Vendor', count: vendorCount, icon: Clock },
          ].map(tab => {
            const isTabActive = activeTab === tab.id;
            const activeClass = isDark
              ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-semibold shadow-inner'
              : 'bg-indigo-500/10 text-indigo-600 border border-indigo-500/20 font-semibold shadow-inner';
            const inactiveClass = isDark
              ? 'text-slate-400 hover:bg-slate-800/80 hover:text-white border border-transparent'
              : 'text-slate-600 hover:bg-slate-55 hover:text-slate-900 border border-transparent';

            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as 'assigned' | 'maintenance' | 'available' | 'retired');
                  setSearchParams({ tab: tab.id });
                }}
                className={`
                  px-4 py-2 text-[12.5px] rounded-xl transition-all duration-200 cursor-pointer select-none flex items-center gap-2 border
                  ${isTabActive ? activeClass : inactiveClass}
                `}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                  isTabActive 
                    ? (isDark ? 'bg-indigo-600/30 text-indigo-200' : 'bg-indigo-500/20 text-indigo-600') 
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                }`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            id="search-assets-hub"
            title="Search Assets Hub"
            placeholder="Search by Code, Name, Serial or Employee..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 transition-all dark:text-white"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 p-4 rounded-2xl shadow-sm animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="flex items-center gap-3">
            <span className="text-xs font-black text-indigo-700 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/40 px-3 py-1.5 rounded-xl">
              {selectedIds.length} Selected
            </span>
            <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">Ready to print batch barcode labels.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSelectedIds([])}
              className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border-none bg-transparent hover:bg-slate-150 dark:hover:bg-slate-850"
            >
              Clear Selection
            </Button>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Printer className="w-4 h-4" />}
              onClick={() => handlePrintLabelsByIds(selectedIds)}
            >
              Print Selected Labels
            </Button>
          </div>
        </div>
      )}

      {/* Grid Table */}
      <Card className="border-none shadow-xl bg-white dark:bg-slate-900 rounded-[2rem] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800">
                {isBatchMode && (
                  <th className="w-12 px-6 py-4 text-left">
                    <input
                      type="checkbox"
                      checked={filteredItems.length > 0 && filteredItems.every(item => selectedIds.includes(item.id))}
                      onChange={() => handleToggleSelectAll(filteredItems)}
                      className="w-4 h-4 text-indigo-600 border-slate-300 dark:border-slate-700 rounded focus:ring-indigo-500 bg-white dark:bg-slate-850 cursor-pointer"
                      title="Select All"
                    />
                  </th>
                )}
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Asset Details</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Codes (1D/2D)</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Assigned Employee</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Location</th>
                <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/40">
              {loading ? (
                Array.from({ length: 5 }).map((_, rowIndex) => (
                  <tr key={rowIndex} className="animate-pulse">
                    {isBatchMode && (
                      <td className="px-6 py-5">
                        <div className="w-4 h-4 bg-slate-100 dark:bg-slate-800 rounded" />
                      </td>
                    )}
                    <td className="px-6 py-5">
                      <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-lg w-2/3 mb-2" />
                      <div className="h-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg w-1/2" />
                    </td>
                    <td className="px-6 py-5">
                      <div className="h-6 bg-slate-100 dark:bg-slate-800 rounded-full w-16" />
                    </td>
                    <td className="px-6 py-5">
                      <div className="w-32 h-10 bg-slate-105 dark:bg-slate-800 rounded-xl" />
                    </td>
                    <td className="px-6 py-5">
                      <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-lg w-24 mb-1" />
                      <div className="h-3 bg-slate-55 dark:bg-slate-800/60 rounded-lg w-16" />
                    </td>
                    <td className="px-6 py-5">
                      <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-lg w-16" />
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="h-8 bg-slate-100 dark:bg-slate-800 rounded-xl w-24 ml-auto" />
                    </td>
                  </tr>
                ))
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={isBatchMode ? 7 : 6} className="px-6 py-12 text-center text-slate-400 text-sm font-semibold">
                    No active assets match the filters or search keywords.
                  </td>
                </tr>
              ) : filteredItems.map((item) => {
                const qrText = `Asset: ${item.assetName} | Code: ${item.assetTag} | Custodian: ${item.employeeName}`;
                const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=60x60&data=${encodeURIComponent(qrText)}`;

                return (
                  <tr key={item.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all duration-150">
                    {/* Checkbox Column */}
                    {isBatchMode && (
                      <td className="w-12 px-6 align-top pt-[23px] pb-5 text-left">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => handleToggleSelect(item.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 text-indigo-600 border-slate-300 dark:border-slate-700 rounded focus:ring-indigo-500 bg-white dark:bg-slate-850 cursor-pointer"
                          title={`Select ${item.assetName}`}
                        />
                      </td>
                    )}
                    {/* Column 1: Asset Details */}
                    <td className="px-6 py-5">
                      <div className="flex flex-col items-start gap-1">
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {item.assetId && (
                            <span className="text-[10px] font-mono font-extrabold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded text-amber-600 dark:text-amber-400">
                              ID: {item.assetId}
                            </span>
                          )}
                          <span className="text-[10px] font-mono font-extrabold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300">
                            Tag: {item.assetTag}
                          </span>
                        </div>
                        <span className="text-[13.5px] font-bold text-slate-800 dark:text-slate-100 mt-1">{item.assetName}</span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold leading-none">
                          {item.brandModel}
                        </span>
                      </div>
                    </td>

                    {/* Column 2: Status */}
                    <td className="px-6 py-5">
                      <span className="px-3 py-1 text-[10px] font-extrabold rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                        {item.status}
                      </span>
                    </td>

                    {/* Column 3: Barcodes */}
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/30 p-2 rounded-xl border border-slate-100 dark:border-slate-800/40 w-fit">
                        <div className="flex flex-col items-center">
                          <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-wide leading-none mb-1">1D Barcode</span>
                          <div className="w-24 h-9 bg-white p-1 rounded border border-slate-100 overflow-hidden flex items-center justify-center">
                            <img 
                              src={`https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(item.assetTag)}&scale=1&height=10`} 
                              alt="1D Barcode tag preview" 
                              className="w-full h-full object-contain" 
                            />
                          </div>
                        </div>
                        
                        <div className="flex flex-col items-center">
                          <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-wide leading-none mb-1">2D QR Code</span>
                          <div className="w-9 h-9 bg-white p-0.5 rounded border border-slate-100 overflow-hidden flex items-center justify-center">
                            <img src={qrCodeUrl} alt="QR Code tag preview" className="w-full h-full" />
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Column 4: Assigned Employee */}
                    <td className="px-6 py-5">
                      {item.employeeName !== 'Unassigned' ? (
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{item.employeeName}</span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">{item.employeeCode}</span>
                        </div>
                      ) : (
                        <span className="text-xs font-semibold text-slate-400 italic">Unassigned</span>
                      )}
                    </td>

                    {/* Column 5: Location */}
                    <td className="px-6 py-5">
                      <span className="px-2.5 py-1 text-[10px] font-extrabold rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase">
                        {item.location}
                      </span>
                    </td>

                    {/* Column 6: Print Label */}
                    <td className="px-6 py-5 text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handlePrintLabel(item)}
                        leftIcon={<Printer className="w-3.5 h-3.5" />}
                        className="h-8 border-slate-200 dark:border-slate-800 dark:hover:bg-slate-800 shadow-sm"
                      >
                        Print Label
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default AssetsHub;
