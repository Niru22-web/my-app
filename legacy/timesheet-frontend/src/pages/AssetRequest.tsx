import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Monitor, Plus, Search, Filter, Calendar, 
  Clock, CheckCircle, XCircle, ChevronRight, 
  MoreVertical, Edit2, Trash2, AlertCircle,
  Truck, Package, ArrowLeft, Info
} from 'lucide-react';
import API from '../api';
import { useToast } from '../contexts/ToastContext';
import Card from '../components/ui/Card';
import TableSkeleton from '../components/ui/TableSkeleton';
import ASALoader from '../components/ui/ASALoader';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getDashboardUrl } from '../utils/navigationUtils';
import SearchableSelect from '../components/ui/SearchableSelect';

const AssetRequest: React.FC = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const toast = useToast();
  const navigate = useNavigate();

  // Form State
  const [formData, setFormData] = useState({
    assetType: '',
    assetCategory: 'Hardware',
    title: '',
    description: '',
    priority: 'Medium',
    requiredDate: '',
    quantity: 1,
    deliveryLocation: ''
  });

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      const [reqRes, catRes] = await Promise.all([
        API.get('/asset-requests/my-requests'),
        API.get('/asset-requests/categories')
      ]);
      if (reqRes.data.success) {
        setRequests(reqRes.data.data);
      }
      if (catRes.data.success) {
        setCategories(catRes.data.data);
      }
    } catch (error) {
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    if (showForm) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showForm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await API.post('/asset-requests/requests', formData);
      if (res.data.success) {
        toast.success('Request submitted successfully');
        setShowForm(false);
        fetchRequests();
        setFormData({
          assetType: '',
          assetCategory: 'Hardware',
          title: '',
          description: '',
          priority: 'Medium',
          requiredDate: '',
          quantity: 1,
          deliveryLocation: ''
        });
      }
    } catch (error) {
      toast.error('Failed to submit request');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending': return 'warning';
      case 'hr review': return 'primary';
      case 'approved': return 'success';
      case 'rejected': return 'danger';
      case 'allocated': return 'primary';
      case 'delivered': return 'success';
      default: return 'secondary';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending': return <Clock size={14} />;
      case 'hr review': return <Search size={14} />;
      case 'approved': return <CheckCircle size={14} />;
      case 'rejected': return <XCircle size={14} />;
      case 'allocated': return <Package size={14} />;
      case 'delivered': return <Truck size={14} />;
      default: return <Info size={14} />;
    }
  };

  return (
    <div className="p-6 space-y-8 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <button 
            onClick={() => navigate(getDashboardUrl(user?.role))}
            className="group flex items-center text-sm font-bold text-gray-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-all mb-2"
            title="Return to Dashboard"
          >
            <div className="p-1.5 rounded-lg bg-gray-100 dark:bg-slate-800 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/30 mr-2 transition-colors">
              <ArrowLeft size={14} />
            </div>
            Back to Dashboard
          </button>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">My Asset Requests</h1>
          <p className="text-gray-500 dark:text-slate-400 font-medium">Track and manage your equipment requests</p>
        </div>
        <Button 
          onClick={() => setShowForm(true)}
          className="rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black shadow-xl shadow-indigo-100 dark:shadow-none py-4 px-8"
          title="Create New Asset Request"
        >
          <Plus className="w-5 h-5 mr-2" /> New Request
        </Button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Total Requests', value: requests.length, icon: Monitor, color: 'indigo' },
          { label: 'Pending', value: requests.filter(r => ['Pending', 'HR Review'].includes(r.status)).length, icon: Clock, color: 'amber' },
          { label: 'Approved', value: requests.filter(r => r.status === 'Approved').length, icon: CheckCircle, color: 'emerald' },
          { label: 'Delivered', value: requests.filter(r => r.status === 'Delivered').length, icon: Truck, color: 'blue' }
        ].map((stat, i) => (
          <Card key={i} className="p-6 border-none bg-white dark:bg-slate-800 rounded-3xl shadow-sm">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-2xl bg-${stat.color}-50 dark:bg-${stat.color}-900/20 text-${stat.color}-600 dark:text-${stat.color}-400`}>
                <stat.icon size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">{stat.label}</p>
                <p className="text-2xl font-black text-gray-900 dark:text-white">{stat.value}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Requests Table */}
      <Card className="border-none bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-xl shadow-gray-100/50 dark:shadow-none overflow-hidden">
        <div className="p-8 border-b border-gray-50 dark:border-slate-700 flex justify-between items-center">
           <h3 className="text-lg font-black text-gray-900 dark:text-white">Request History</h3>
           <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text" placeholder="Search requests..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 bg-gray-50 dark:bg-slate-900/50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 dark:text-white asset-request-search-input"
                aria-label="Search asset requests"
              />
           </div>
        </div>
        
        <div className="overflow-x-auto">
          {loading ? (
            <TableSkeleton columns={6} rows={6} className="border-none shadow-none rounded-none bg-transparent" />
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 dark:bg-slate-900/30">
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">Request ID</th>
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">Asset Details</th>
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">Request Date</th>
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">Priority</th>
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">Status</th>
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
                {requests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-40">
                       <Monitor size={48} className="text-gray-300" />
                       <p className="text-sm font-bold text-gray-500">No asset requests found</p>
                       <Button onClick={() => setShowForm(true)} variant="ghost" size="sm">Create First Request</Button>
                    </div>
                  </td>
                </tr>
              ) : requests.filter(r => 
                    (r.requestId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (r.assetType || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (r.assetCategory || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (r.status || '').toLowerCase().includes(searchQuery.toLowerCase())
                  ).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-40">
                       <Monitor size={48} className="text-gray-300" />
                       <p className="text-sm font-bold text-gray-500">No matching requests found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                requests
                  .filter(r => 
                    (r.requestId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (r.assetType || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (r.assetCategory || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (r.status || '').toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map((req) => (
                    <tr key={req.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-900/20 transition-colors group">
                      <td className="px-8 py-6">
                        <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">#{req.requestId}</span>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-3">
                           <div className="p-2.5 rounded-xl bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400">
                              <Monitor size={18} />
                           </div>
                           <div>
                              <p className="text-sm font-black text-gray-900 dark:text-white leading-tight">{req.assetType}</p>
                              <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 mt-1 uppercase tracking-wide">{req.assetCategory}</p>
                           </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-gray-900 dark:text-slate-200">{new Date(req.createdAt).toLocaleDateString()}</span>
                          <span className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">{new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <Badge 
                          variant={req.priority === 'High' ? 'danger' : req.priority === 'Medium' ? 'primary' : 'secondary'}
                          className="rounded-lg text-[10px] font-black px-2 py-0.5"
                        >
                          {req.priority}
                        </Badge>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant={getStatusColor(req.status)}
                            className="rounded-lg text-[10px] font-black px-2 py-0.5 flex items-center gap-1.5"
                          >
                            {getStatusIcon(req.status)}
                            {req.status}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <div className="flex justify-end gap-2">
                          {req.status === 'Pending' && (
                            <>
                              <button className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-xl transition-all" title="Edit Request">
                                <Edit2 size={16} />
                              </button>
                              <button className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-xl transition-all" title="Cancel Request">
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                          <button className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-xl transition-all" title="More Options">
                            <MoreVertical size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
          )}
        </div>
      </Card>

      {/* New Request Modal */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 md:p-6 overflow-y-auto">
             <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               onClick={() => setShowForm(false)}
               className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
             />
             <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 20 }} 
               animate={{ opacity: 1, scale: 1, y: 0 }} 
               exit={{ opacity: 0, scale: 0.95, y: 20 }}
               className="relative bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden max-h-[85vh] flex flex-col"
             >
               <div className="p-8 border-b border-gray-50 dark:border-slate-700 flex justify-between items-center bg-gray-50/50 dark:bg-slate-900/20 flex-shrink-0">
                  <div>
                    <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Request New Asset</h2>
                    <p className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mt-1">Equipment Procurement Form</p>
                  </div>
                  <button onClick={() => setShowForm(false)} className="p-3 bg-white dark:bg-slate-800 rounded-2xl text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors shadow-sm" title="Close Modal">
                    <Plus className="rotate-45" size={24} />
                  </button>
               </div>

               <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
                  <div className="p-8 space-y-6 overflow-y-auto no-scrollbar flex-1">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       <div className="space-y-0.5">
                         <SearchableSelect 
                           id="employeeAssetType"
                           label="Asset Type"
                           title="Search or request a new asset type"
                           options={categories.map(c => ({ label: c.name, value: c.name, category: c.category }))}
                           value={formData.assetType}
                           onChange={(val, cat) => setFormData({...formData, assetType: val, assetCategory: cat || 'Hardware'})}
                           placeholder="Search or request new..."
                         />
                       </div>

                       <div className="space-y-2">
                         <label htmlFor="assetCategory" className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1">Category</label>
                         <select 
                           id="assetCategory"
                           value={formData.assetCategory}
                           onChange={(e) => setFormData({...formData, assetCategory: e.target.value})}
                           className="w-full p-4 bg-gray-50 dark:bg-slate-900/50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 dark:text-white"
                           title="Select Asset Category"
                         >
                           <option value="Hardware">Hardware</option>
                           <option value="Software">Software</option>
                           <option value="Office Equipment">Office Equipment</option>
                           <option value="Furniture">Furniture</option>
                         </select>
                       </div>
                     </div>

                     <div className="space-y-2">
                       <label htmlFor="requestTitle" className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1">Request Title</label>
                       <input 
                         id="requestTitle"
                         type="text" required placeholder="e.g. Need high-res monitor for design work"
                         value={formData.title}
                         onChange={(e) => setFormData({...formData, title: e.target.value})}
                         className="w-full p-4 bg-gray-50 dark:bg-slate-900/50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 dark:text-white"
                         title="Enter Request Title"
                       />
                     </div>

                     <div className="space-y-2">
                       <label htmlFor="description" className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1">Reason / Description</label>
                       <textarea 
                         id="description"
                         placeholder="Explain why you need this asset..." rows={3}
                         value={formData.description}
                         onChange={(e) => setFormData({...formData, description: e.target.value})}
                         className="w-full p-4 bg-gray-50 dark:bg-slate-900/50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 dark:text-white resize-none"
                         title="Enter Reason for Request"
                       />
                     </div>

                     <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                       <div className="space-y-2">
                         <label htmlFor="priority" className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1">Priority</label>
                         <select 
                           id="priority"
                           value={formData.priority}
                           onChange={(e) => setFormData({...formData, priority: e.target.value})}
                           className="w-full p-4 bg-gray-50 dark:bg-slate-900/50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 dark:text-white"
                           title="Select Request Priority"
                         >
                           <option value="Low">Low</option>
                           <option value="Medium">Medium</option>
                           <option value="High">High</option>
                         </select>
                       </div>

                       <div className="space-y-2">
                         <label htmlFor="requiredDate" className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1">Required By</label>
                         <input 
                           id="requiredDate"
                           type="date" required
                           value={formData.requiredDate}
                           onChange={(e) => setFormData({...formData, requiredDate: e.target.value})}
                           className="w-full p-4 bg-gray-50 dark:bg-slate-900/50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 dark:text-white"
                           title="Select Required Date"
                         />
                       </div>

                       <div className="space-y-2">
                         <label htmlFor="quantity" className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1">Quantity</label>
                         <input 
                           id="quantity"
                           type="number" min={1} required
                           value={formData.quantity}
                           onChange={(e) => setFormData({...formData, quantity: parseInt(e.target.value)})}
                           className="w-full p-4 bg-gray-50 dark:bg-slate-900/50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 dark:text-white"
                           title="Enter Quantity"
                           placeholder="1"
                         />
                       </div>
                     </div>

                     <div className="space-y-2">
                       <label htmlFor="deliveryLocation" className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1">Delivery Location</label>
                       <input 
                         id="deliveryLocation"
                         type="text" placeholder="e.g. Office Desk 42 or Home Address"
                         value={formData.deliveryLocation}
                         onChange={(e) => setFormData({...formData, deliveryLocation: e.target.value})}
                         className="w-full p-4 bg-gray-50 dark:bg-slate-900/50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 dark:text-white"
                         title="Enter Delivery Location"
                       />
                     </div>
                  </div>

                  <div className="p-8 border-t border-gray-50 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-900/20 flex gap-4 flex-shrink-0">
                    <Button 
                      type="button" variant="ghost" onClick={() => setShowForm(false)}
                      className="flex-1 rounded-2xl py-4 font-black animate-scale-up"
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit" variant="primary"
                      className="flex-1 rounded-2xl py-4 font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-100 dark:shadow-none animate-scale-up"
                    >
                      Submit Request
                    </Button>
                  </div>
               </form>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AssetRequest;
