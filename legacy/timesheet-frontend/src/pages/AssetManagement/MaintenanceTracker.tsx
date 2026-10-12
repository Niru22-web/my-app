import React, { useState, useEffect, useCallback } from 'react';
import { 
  Settings, Search, Plus, Wrench, Calendar, DollarSign, X, Check,
  AlertTriangle, Hammer, User, CheckCircle
} from 'lucide-react';
import API from '../../api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { useToast } from '../../contexts/ToastContext';
import { format } from 'date-fns';

const MaintenanceTracker: React.FC = () => {
  const [maintenances, setMaintenances] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  
  const toast = useToast();

  const [formData, setFormData] = useState({
    inventoryId: '',
    type: 'Repair',
    date: format(new Date(), 'yyyy-MM-dd'),
    cost: '',
    description: '',
    status: 'Pending'
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [mRes, aRes, rRes] = await Promise.all([
        API.get('/assets/maintenance'),
        API.get('/assets'),
        API.get('/assets/maintenance/reminders')
      ]);
      if (mRes.data.success) setMaintenances(mRes.data.data);
      if (aRes.data.success) setAssets(aRes.data.data);
      if (rRes.data.success) setReminders(rRes.data.data);
    } catch (error) {
      toast.error('Failed to load maintenance records');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.inventoryId || !formData.date || !formData.type) {
      toast.error('Please fill in all required fields');
      return;
    }
    try {
      const res = await API.post('/assets/maintenance', formData);
      if (res.data.success) {
        toast.success('Maintenance ticket created successfully');
        setIsFormOpen(false);
        setFormData({ inventoryId: '', type: 'Repair', date: format(new Date(), 'yyyy-MM-dd'), cost: '', description: '', status: 'Pending' });
        fetchData();
      }
    } catch (error) {
      toast.error('Failed to schedule maintenance');
    }
  };

  const handleStatusUpdate = async (id: string, status: string) => {
    try {
      const res = await API.put(`/assets/maintenance/${id}`, { status });
      if (res.data.success) {
        toast.success(`Maintenance status updated to ${status}`);
        fetchData();
      }
    } catch (error) {
      toast.error('Failed to update maintenance status');
    }
  };

  const getStatusColor = (status: string = '') => {
    const safeStatus = status || '';
    switch (safeStatus.toLowerCase()) {
      case 'pending': return 'warning';
      case 'in progress': return 'primary';
      case 'completed': return 'success';
      case 'cancelled': return 'danger';
      default: return 'secondary';
    }
  };

  const filteredMaintenances = maintenances.filter(m => 
    m.inventory?.assetName?.toLowerCase().includes(search.toLowerCase()) ||
    m.inventory?.serialNumber?.toLowerCase().includes(search.toLowerCase()) ||
    m.type?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Fleet <span className="text-indigo-600">Maintenance</span></h1>
          <p className="text-slate-500 text-sm">Schedule repairs, track servicing status, audit technician costs, and review servicing due dates.</p>
        </div>
        <div>
          <Button variant="primary" size="sm" onClick={() => setIsFormOpen(true)}>
            <Wrench className="w-4 h-4 mr-2" />
            Schedule Service
          </Button>
        </div>
      </div>

      {/* Reminders Alerts Panel */}
      {reminders.length > 0 && (
        <div className="p-5 bg-amber-50 rounded-3xl border border-amber-200/50 space-y-3">
          <div className="flex items-center gap-2 text-amber-800 font-black text-sm">
            <AlertTriangle className="w-5 h-5 text-amber-600 animate-pulse" />
            Upcoming Scheduled Servicing Due This Week
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reminders.map((r, idx) => (
              <div key={idx} className="p-4 bg-white rounded-2xl shadow-sm border border-amber-100 flex justify-between items-center">
                <div>
                  <p className="text-xs font-bold text-slate-700">{r.inventory.assetName}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Due: {format(new Date(r.date), 'dd MMM yyyy')}</p>
                </div>
                <Badge variant="warning" className="text-[8px] font-black rounded-md">{r.type}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative bg-white p-4 rounded-2xl shadow-sm">
        <Search className="absolute left-7 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input 
          type="text" 
          id="search-maintenance-input"
          title="Filter Maintenance Tickets"
          placeholder="Filter maintenance tickets by asset name, serial, or servicing type..." 
          className="w-full pl-12 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* servicing Records list */}
      <Card className="border-none shadow-xl bg-white rounded-[2rem] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Asset</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Servicing Type</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Scheduled Date</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Cost (₹)</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Description</th>
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
                      <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-lg w-20" />
                    </td>
                    <td className="px-6 py-5">
                      <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-lg w-24" />
                    </td>
                    <td className="px-6 py-5">
                      <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-lg w-16" />
                    </td>
                    <td className="px-6 py-5">
                      <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-lg w-32" />
                    </td>
                    <td className="px-6 py-5">
                      <div className="h-6 bg-slate-100 dark:bg-slate-800 rounded-lg w-16" />
                    </td>
                    <td className="px-6 py-5">
                      <div className="h-8 bg-slate-100 dark:bg-slate-800 rounded-xl w-20 ml-auto" />
                    </td>
                  </tr>
                ))
              ) : filteredMaintenances.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-slate-400 text-sm">No maintenance records active at this time.</td>
                </tr>
              ) : filteredMaintenances.map((m) => (
                <tr key={m.id} className="group hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-5">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-700">{m.inventory?.assetName}</span>
                      <span className="text-[9px] text-slate-400 font-mono">SN: {m.inventory?.serialNumber}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-xs text-slate-500 font-semibold">{m.type}</td>
                  <td className="px-6 py-5 text-xs text-slate-500">
                    {m.date ? format(new Date(m.date), 'dd MMM yyyy') : 'N/A'}
                  </td>
                  <td className="px-6 py-5 text-xs font-black text-slate-800">
                    ₹{m.cost || '0.0'}
                  </td>
                  <td className="px-6 py-5 text-xs text-slate-400 truncate max-w-[200px]" title={m.description}>
                    {m.description || 'N/A'}
                  </td>
                  <td className="px-6 py-5">
                    <Badge variant={getStatusColor(m.status)} className="rounded-lg text-[9px] font-black uppercase tracking-widest">{m.status}</Badge>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {m.status === 'Pending' && (
                        <Button size="sm" variant="secondary" onClick={() => handleStatusUpdate(m.id, 'In Progress')}>
                          Servicing
                        </Button>
                      )}
                      {m.status === 'In Progress' && (
                        <Button size="sm" variant="primary" onClick={() => handleStatusUpdate(m.id, 'Completed')}>
                          Completed
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Schedule Service Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900">Schedule <span className="text-indigo-600">Servicing</span></h2>
                <p className="text-slate-500 text-xs mt-1">Select an active asset to submit for repair, cost audits, or scheduling updates.</p>
              </div>
              <button title="Close" onClick={() => setIsFormOpen(false)} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            
            <form onSubmit={handleCreate} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Select Asset</label>
                <select 
                  title="Select Asset"
                  className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                  value={formData.inventoryId}
                  onChange={(e) => setFormData({...formData, inventoryId: e.target.value})}
                  required
                >
                  <option value="">Choose Asset</option>
                  {assets.filter(a => a.status === 'Available' || a.status === 'Allocated').map(a => (
                    <option key={a.id} value={a.id}>
                      {a.assetName} [SN: {a.serialNumber}] ({a.status})
                    </option>
                  ))}
                  {assets.filter(a => a.status === 'Available' || a.status === 'Allocated').length === 0 && (
                    <option value="" disabled>No available or allocated assets for maintenance</option>
                  )}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Servicing Type</label>
                  <select 
                    title="Service Type"
                    className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value})}
                  >
                    <option value="Repair">Hardware Repair</option>
                    <option value="Servicing">General Servicing</option>
                    <option value="Upgrade">OS Upgrade/Install</option>
                    <option value="Inspection">Routine Audit</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block" htmlFor="maintenance-date-form">Schedule Date</label>
                  <input 
                    type="date" 
                    id="maintenance-date-form"
                    title="Schedule Date"
                    placeholder="Schedule Date"
                    className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                    value={formData.date}
                    onChange={(e) => setFormData({...formData, date: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Estimated Cost (₹)</label>
                <input 
                  type="number" 
                  className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                  placeholder="0.00"
                  value={formData.cost}
                  onChange={(e) => setFormData({...formData, cost: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Service Issue Description</label>
                <textarea 
                  rows={2}
                  className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                  placeholder="Explain device problems or diagnostics requirements..."
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="secondary" type="button" onClick={() => setIsFormOpen(false)}>Cancel</Button>
                <Button variant="primary" type="submit">Schedule Service</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MaintenanceTracker;
