import React, { useState, useEffect, useCallback } from 'react';
import { 
  Plus, Trash2, ShieldAlert, Folder, Tag, MapPin, 
  Users, CheckCircle
} from 'lucide-react';
import API from '../../api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { useToast } from '../../contexts/ToastContext';

interface MasterItem {
  id: string;
  name: string;
  assetCategoryId?: string;
  category?: string | {
    id: string;
    name: string;
    category?: string;
  };
}

const MastersConfig: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'categories' | 'types' | 'locations' | 'departments' | 'statuses'>('categories');
  const [list, setList] = useState<(MasterItem | string)[]>([]);
  const [categories, setCategories] = useState<MasterItem[]>([]); // categories list needed for Asset Types parent dropdown
  const [loading, setLoading] = useState(true);
  const [newItemName, setNewItemName] = useState('');
  const [parentCategory, setParentCategory] = useState('');
  
  const toast = useToast();

  const fetchTabList = useCallback(async () => {
    try {
      setLoading(true);
      let endpoint = '';
      if (activeTab === 'categories') endpoint = '/assets/masters/categories';
      else if (activeTab === 'types') endpoint = '/assets/masters/types';
      else if (activeTab === 'locations') endpoint = '/assets/masters/locations';
      else if (activeTab === 'statuses') endpoint = '/assets/masters/statuses';
      else if (activeTab === 'departments') endpoint = '/assets/masters/departments';

      const res = await API.get(endpoint);
      if (res.data.success) {
        setList(res.data.data);
      }

      // If we are on Types, also fetch Categories for the parent dropdown selection
      if (activeTab === 'types') {
        const catRes = await API.get('/assets/masters/categories');
        if (catRes.data.success) {
          setCategories(catRes.data.data);
          if (catRes.data.data.length > 0) {
            setParentCategory(catRes.data.data[0].id);
          }
        }
      }
    } catch (error) {
      toast.error('Failed to load masters config list');
    } finally {
      setLoading(false);
    }
  }, [activeTab, toast]);

  useEffect(() => {
    setList([]);
    fetchTabList();
  }, [activeTab, fetchTabList]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    try {
      let endpoint = '';
      const payload: { name: string; category?: string; categoryId?: string } = { name: newItemName.trim() };

      if (activeTab === 'categories') {
        endpoint = '/assets/masters/categories';
        payload.category = 'Hardware'; // default
      }
      else if (activeTab === 'types') {
        endpoint = '/assets/masters/types';
        payload.categoryId = parentCategory;
      }
      else if (activeTab === 'locations') {
        endpoint = '/assets/masters/locations';
      }
      else if (activeTab === 'statuses') {
        endpoint = '/assets/masters/statuses';
      }

      const res = await API.post(endpoint, payload);
      if (res.data.success) {
        toast.success('Configuration added successfully');
        setNewItemName('');
        fetchTabList();
      }
    } catch (error) {
      toast.error('Failed to add master parameter');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this configuration? Devices mapped to this may show errors.')) return;
    try {
      let endpoint = '';
      if (activeTab === 'categories') endpoint = `/assets/masters/categories/${id}`;
      else if (activeTab === 'types') endpoint = `/assets/masters/types/${id}`;
      else if (activeTab === 'locations') endpoint = `/assets/masters/locations/${id}`;
      else if (activeTab === 'statuses') endpoint = `/assets/masters/statuses/${id}`;

      const res = await API.delete(endpoint);
      if (res.data.success) {
        toast.success('Configuration deleted successfully');
        fetchTabList();
      }
    } catch (error) {
      toast.error('Failed to delete master parameter');
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Setup <span className="text-indigo-600">Masters</span></h1>
          <p className="text-slate-500 text-sm">Configure asset categories, hardware device types, physical locations, status parameters, and dynamic company departments.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1.5 bg-gray-100 dark:bg-slate-900/50 rounded-[2rem] w-full md:w-fit overflow-x-auto no-scrollbar">
        {([
          { id: 'categories', label: 'Categories', icon: Folder },
          { id: 'types', label: 'Asset Types', icon: Tag },
          { id: 'locations', label: 'Locations', icon: MapPin },
          { id: 'statuses', label: 'Statuses', icon: CheckCircle },
          { id: 'departments', label: 'Departments', icon: Users }
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-6 md:px-8 py-3.5 rounded-[1.5rem] text-sm font-black transition-all whitespace-nowrap ${activeTab === tab.id
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-lg'
              : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Grid Split: Add & Current Parameters list */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left: Add Config Form (Disabled for Departments as they are dynamically compiled) */}
        <div>
          {activeTab !== 'departments' ? (
            <Card className="p-8 border-none shadow-md bg-white rounded-[2rem] space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-md font-black text-slate-900">Add Parameter</h3>
                <p className="text-[11px] text-slate-400 font-semibold uppercase mt-0.5">{activeTab} Setup</p>
              </div>

              <form onSubmit={handleAdd} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="parameter-name" className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Parameter Name</label>
                  <input 
                    id="parameter-name"
                    type="text" 
                    placeholder="Enter name..." 
                    className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 font-bold"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    required
                  />
                </div>

                {activeTab === 'types' && (
                  <div className="space-y-1.5">
                    <label htmlFor="parent-category" className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Parent Category</label>
                    <select 
                      id="parent-category"
                      title="Parent Category"
                      className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700"
                      value={parentCategory}
                      onChange={(e) => setParentCategory(e.target.value)}
                      required
                    >
                      {categories.map((c, idx) => (
                        <option key={c.id || idx} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <Button variant="primary" fullWidth type="submit">
                  <Plus className="w-4 h-4 mr-2" /> Save Parameter
                </Button>
              </form>
            </Card>
          ) : (
            <Card className="p-6 border-none shadow-sm bg-blue-50 text-blue-700 rounded-3xl flex gap-3 items-start">
              <ShieldAlert className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider">Dynamic Departments</h4>
                <p className="text-[11px] mt-1.5 leading-relaxed font-semibold">
                  Departments are loaded dynamically from employee profile designations. To add a new department, edit an employee profile or onboard a new employee under the desired department.
                </p>
              </div>
            </Card>
          )}
        </div>

        {/* Right: Master list grid */}
        <div className="lg:col-span-2">
          <Card className="border-none shadow-xl bg-white rounded-[2rem] overflow-hidden">
            <div className="p-6 border-b border-slate-50">
              <h3 className="text-md font-black text-slate-900">Current active listings</h3>
            </div>
            
            <div className="divide-y divide-slate-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, rowIndex) => (
                  <div key={rowIndex} className="p-5 flex items-center justify-between animate-pulse">
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-lg w-1/3" />
                      {activeTab === 'types' && (
                        <div className="h-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg w-1/4" />
                      )}
                    </div>
                    {activeTab !== 'departments' && (
                      <div className="w-8 h-8 bg-slate-100 dark:bg-slate-800 rounded-lg" />
                    )}
                  </div>
                ))
              ) : list.length === 0 ? (
                <div className="p-10 text-center text-slate-400 text-sm font-semibold">No active masters listings configured yet.</div>
              ) : activeTab === 'departments' ? (
                // Departments dynamic strings list
                (list as string[]).map((deptName, idx) => (
                  <div key={idx} className="p-5 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                    <span className="font-bold text-slate-700 text-sm uppercase">{deptName}</span>
                    <Badge variant="primary" className="text-[8px] font-black rounded-md">DYNAMIC</Badge>
                  </div>
                ))
              ) : (
                // Categories, Types, Locations, Statuses database records list
                (list as MasterItem[]).map((item, idx) => (
                  <div key={item.id || idx} className="p-5 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                    <div>
                      <span className="font-bold text-slate-700 text-sm">{item.name}</span>
                      {activeTab === 'types' && item.category && (
                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                          Category: {typeof item.category === 'object' && item.category !== null ? (item.category.name || item.category.category || 'N/A') : String(item.category)}
                        </p>
                      )}
                    </div>
                    <button 
                      title="Delete parameter"
                      onClick={() => handleDelete(item.id)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default MastersConfig;
