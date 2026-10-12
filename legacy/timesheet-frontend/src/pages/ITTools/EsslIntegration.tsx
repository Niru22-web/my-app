import React, { useState, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import API from '../../api';
import { toast } from 'react-toastify';
import {
  Cpu,
  RefreshCw,
  Database,
  Layers,
  Activity,
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Play,
  Check,
  X,
  UserCheck,
  Zap,
  Info
} from 'lucide-react';

interface Machine {
  id: string;
  name: string;
  ipAddress: string;
  port: number;
  deviceKey: string;
  apiKey?: string;
  branch: string;
  syncInterval: number;
  isActive: boolean;
  status: string;
  lastSyncAt?: string;
}

interface Mapping {
  id: string;
  portalEmployeeId?: string;
  biometricEmployeeId: string;
  biometricName: string;
  machineId?: string;
  syncStatus: 'Mapped' | 'Pending' | 'Unmapped';
  lastPunch?: string;
  employee?: {
    firstName: string;
    lastName: string;
    employeeId: string;
    officeEmail: string;
    department: string;
  };
  machine?: {
    name: string;
  };
}

interface SyncLog {
  id: string;
  machineId?: string;
  syncTime: string;
  status: 'Success' | 'Failed';
  recordsSynced: number;
  errorMessage?: string;
  machine?: {
    name: string;
  };
}

interface LivePunch {
  id: string;
  employee_id: string;
  punchTime: string;
  type: string;
  source: string;
  Employee?: {
    firstName: string;
    lastName: string;
    officeEmail: string;
  };
}

interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  officeEmail: string;
  department: string;
}

const EsslIntegration: React.FC = () => {
  const { themeMode } = useTheme();
  const isDark = themeMode === 'dark';

  // State Management
  const [activeTab, setActiveTab] = useState<'machines' | 'mappings' | 'logs' | 'activity'>('machines');
  const [machines, setMachines] = useState<Machine[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [livePunches, setLivePunches] = useState<LivePunch[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  // Loading States
  const [loadingMachines, setLoadingMachines] = useState(false);
  const [loadingMappings, setLoadingMappings] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [syncingMachine, setSyncingMachine] = useState<string | null>(null);
  const [autoMatching, setAutoMatching] = useState(false);
  const [submittingMachine, setSubmittingMachine] = useState(false);

  // Modals
  const [machineModalOpen, setMachineModalOpen] = useState(false);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [selectedMapping, setSelectedMapping] = useState<Mapping | null>(null);
  const [selectedPortalEmpId, setSelectedPortalEmpId] = useState('');

  // Form States
  const [formName, setFormName] = useState('');
  const [formIp, setFormIp] = useState('');
  const [formPort, setFormPort] = useState(4370);
  const [formDeviceKey, setFormDeviceKey] = useState('1');
  const [formApiKey, setFormApiKey] = useState('');
  const [formBranch, setFormBranch] = useState('');
  const [formSyncInterval, setFormSyncInterval] = useState(5);
  const [formIsActive, setFormIsActive] = useState(true);

  // Search/Filters
  const [mappingSearch, setMappingSearch] = useState('');
  const [mappingFilterStatus, setMappingFilterStatus] = useState<'All' | 'Mapped' | 'Pending'>('All');

  // Initial Fetches
  useEffect(() => {
    fetchMachines();
    fetchEmployees();
  }, []);

  useEffect(() => {
    if (activeTab === 'mappings') fetchMappings();
    if (activeTab === 'logs') fetchLogs();
    if (activeTab === 'activity') fetchLivePunches();
  }, [activeTab]);

  // API Call Helpers
  const fetchMachines = async () => {
    setLoadingMachines(true);
    try {
      const res = await API.get('/essl/machines');
      setMachines(res.data?.data || res.data || []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load machines');
    } finally {
      setLoadingMachines(false);
    }
  };

  const fetchMappings = async () => {
    setLoadingMappings(true);
    try {
      const res = await API.get('/essl/mappings');
      setMappings(res.data?.data || res.data || []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load mappings');
    } finally {
      setLoadingMappings(false);
    }
  };

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await API.get('/essl/logs');
      setLogs(res.data?.data || res.data || []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load sync logs');
    } finally {
      setLoadingLogs(false);
    }
  };

  const fetchLivePunches = async () => {
    setLoadingActivity(true);
    try {
      const res = await API.get('/essl/live-punch-activity');
      setLivePunches(res.data?.data || res.data || []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load live activity');
    } finally {
      setLoadingActivity(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      const res = await API.get('/employees');
      setEmployees(res.data?.data || res.data || []);
    } catch (err: any) {
      console.error('Failed to fetch employees list:', err);
    }
  };

  // Machine Actions
  const handleTestConnection = async (machine: Machine) => {
    setTestingConnection(machine.id);
    try {
      const res = await API.post(`/essl/machines/${machine.id}/test-connection`);
      const testResult = res.data?.data || res.data;
      if (testResult?.success) {
        toast.success(`Online! Ping response in ${testResult.latency}ms`);
      } else {
        toast.error(`Offline: ${testResult.message}`);
      }
      fetchMachines();
    } catch (err: any) {
      toast.error(err.message || 'Connection test failed');
    } finally {
      setTestingConnection(null);
    }
  };

  const handleSyncNow = async (machine: Machine) => {
    setSyncingMachine(machine.id);
    try {
      const res = await API.post(`/essl/machines/${machine.id}/sync`);
      const syncResult = res.data?.data || res.data;
      if (syncResult?.success) {
        toast.success(`Sync finished: ${syncResult.recordsSynced} punches synced successfully!`);
      } else {
        toast.warning(`Sync completed with issues. Check logs.`);
      }
      fetchMachines();
    } catch (err: any) {
      toast.error(err.message || 'Sync failed');
    } finally {
      setSyncingMachine(null);
    }
  };

  const handleOpenAddMachine = () => {
    setEditingMachine(null);
    setFormName('');
    setFormIp('');
    setFormPort(4370);
    setFormDeviceKey('1');
    setFormApiKey('');
    setFormBranch('');
    setFormSyncInterval(5);
    setFormIsActive(true);
    setMachineModalOpen(true);
  };

  const handleOpenEditMachine = (machine: Machine) => {
    setEditingMachine(machine);
    setFormName(machine.name);
    setFormIp(machine.ipAddress);
    setFormPort(machine.port);
    setFormDeviceKey(machine.deviceKey);
    setFormApiKey(machine.apiKey || '');
    setFormBranch(machine.branch);
    setFormSyncInterval(machine.syncInterval);
    setFormIsActive(machine.isActive);
    setMachineModalOpen(true);
  };

  const handleSaveMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingMachine(true);
    const payload = {
      name: formName,
      ipAddress: formIp,
      port: formPort,
      deviceKey: formDeviceKey,
      apiKey: formApiKey || null,
      branch: formBranch,
      syncInterval: formSyncInterval,
      isActive: formIsActive
    };

    try {
      if (editingMachine) {
        await API.put(`/essl/machines/${editingMachine.id}`, payload);
        toast.success('Machine configuration updated successfully.');
      } else {
        await API.post('/essl/machines', payload);
        toast.success('Machine configuration created successfully.');
      }
      setMachineModalOpen(false);
      fetchMachines();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save machine config');
    } finally {
      setSubmittingMachine(false);
    }
  };

  const handleDeleteMachine = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this machine? Mappings will not be lost, but automatic syncing will stop.')) {
      return;
    }
    try {
      await API.delete(`/essl/machines/${id}`);
      toast.success('Machine deleted.');
      fetchMachines();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete machine');
    }
  };

  const handleToggleMachineActive = async (machine: Machine) => {
    try {
      await API.put(`/essl/machines/${machine.id}`, { isActive: !machine.isActive });
      toast.success(`Machine ${machine.isActive ? 'disabled' : 'enabled'} successfully.`);
      fetchMachines();
    } catch (err: any) {
      toast.error(err.message || 'Failed to toggle status');
    }
  };

  // Mapping Actions
  const handleOpenMappingModal = (mapping: Mapping) => {
    setSelectedMapping(mapping);
    setSelectedPortalEmpId(mapping.portalEmployeeId || '');
    setMappingModalOpen(true);
  };

  const handleSaveMapping = async () => {
    if (!selectedMapping) return;
    try {
      await API.put(`/essl/mappings/${selectedMapping.id}`, {
        portalEmployeeId: selectedPortalEmpId || null,
        syncStatus: selectedPortalEmpId ? 'Mapped' : 'Pending'
      });
      toast.success('Employee biometric mapping updated.');
      setMappingModalOpen(false);
      fetchMappings();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update mapping');
    }
  };

  const handleAutoMatch = async () => {
    setAutoMatching(true);
    try {
      const res = await API.post('/essl/mappings/auto-match');
      const data = res.data?.data || res.data;
      toast.success(res.data?.message || `Auto-match complete: linked ${data.matchedCount} employees!`);
      fetchMappings();
    } catch (err: any) {
      toast.error(err.message || 'Auto-matching failed');
    } finally {
      setAutoMatching(false);
    }
  };

  // Filters & Calculations
  const filteredMappings = mappings.filter(m => {
    const matchesSearch = 
      m.biometricName.toLowerCase().includes(mappingSearch.toLowerCase()) ||
      m.biometricEmployeeId.toLowerCase().includes(mappingSearch.toLowerCase()) ||
      (m.employee && `${m.employee.firstName} ${m.employee.lastName}`.toLowerCase().includes(mappingSearch.toLowerCase()));

    const matchesStatus = 
      mappingFilterStatus === 'All' ? true : 
      mappingFilterStatus === 'Mapped' ? m.syncStatus === 'Mapped' : m.syncStatus === 'Pending';

    return matchesSearch && matchesStatus;
  });

  const activeMachineCount = machines.filter(m => m.isActive).length;
  const onlineMachineCount = machines.filter(m => m.isActive && m.status === 'Online').length;
  const pendingMappingsCount = mappings.filter(m => m.syncStatus === 'Pending').length;

  return (
    <div className={`p-1 w-full flex flex-col gap-6 text-sm ${isDark ? 'text-slate-100' : 'text-slate-700'}`}>
      
      {/* Overview Analytics Header */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        {/* Active Machines */}
        <div className={`p-4 rounded-2xl border flex items-center justify-between shadow-sm ${
          isDark ? 'bg-slate-900/60 border-slate-800/80' : 'bg-white border-slate-100'
        }`}>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Active Machines</span>
            <span className="text-2xl font-black">{activeMachineCount} / {machines.length}</span>
          </div>
          <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-xl">
            <Cpu className="w-5 h-5" />
          </div>
        </div>

        {/* Live Network Status */}
        <div className={`p-4 rounded-2xl border flex items-center justify-between shadow-sm ${
          isDark ? 'bg-slate-900/60 border-slate-800/80' : 'bg-white border-slate-100'
        }`}>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Online Status</span>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black">{onlineMachineCount}</span>
              <span className="text-xs font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">Online</span>
            </div>
          </div>
          <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl">
            <Zap className="w-5 h-5" />
          </div>
        </div>

        {/* Pending Mappings */}
        <div className={`p-4 rounded-2xl border flex items-center justify-between shadow-sm ${
          isDark ? 'bg-slate-900/60 border-slate-800/80' : 'bg-white border-slate-100'
        }`}>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Pending Mappings</span>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black">{pendingMappingsCount}</span>
              {pendingMappingsCount > 0 && (
                <span className="text-xs font-semibold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">Requires Attention</span>
              )}
            </div>
          </div>
          <div className="p-3 bg-amber-500/10 text-amber-500 rounded-xl">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        {/* Sync Frequency */}
        <div className={`p-4 rounded-2xl border flex items-center justify-between shadow-sm ${
          isDark ? 'bg-slate-900/60 border-slate-800/80' : 'bg-white border-slate-100'
        }`}>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Auto Sync Cron</span>
            <span className="text-2xl font-black">Every 5m</span>
          </div>
          <div className="p-3 bg-blue-500/10 text-blue-500 rounded-xl">
            <RefreshCw className="w-5 h-5" />
          </div>
        </div>

      </div>

      {/* Tabs Horizontal Selector */}
      <div className={`border-b flex items-center justify-between flex-wrap gap-4 ${isDark ? 'border-slate-850' : 'border-slate-200'}`}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('machines')}
            className={`px-4 py-2.5 font-bold text-[13px] border-b-2 flex items-center gap-2 cursor-pointer transition-all ${
              activeTab === 'machines' 
                ? 'border-indigo-500 text-indigo-500' 
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-4 h-4" />
            Machines Definition
          </button>
          
          <button
            onClick={() => setActiveTab('mappings')}
            className={`px-4 py-2.5 font-bold text-[13px] border-b-2 flex items-center gap-2 cursor-pointer transition-all ${
              activeTab === 'mappings' 
                ? 'border-indigo-500 text-indigo-500' 
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            Biometric Mappings
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2.5 font-bold text-[13px] border-b-2 flex items-center gap-2 cursor-pointer transition-all ${
              activeTab === 'logs' 
                ? 'border-indigo-500 text-indigo-500' 
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-4 h-4" />
            Sync Logs
          </button>

          <button
            onClick={() => setActiveTab('activity')}
            className={`px-4 py-2.5 font-bold text-[13px] border-b-2 flex items-center gap-2 cursor-pointer transition-all ${
              activeTab === 'activity' 
                ? 'border-indigo-500 text-indigo-500' 
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-4 h-4" />
            Live Activity
          </button>
        </div>

        {/* Dynamic Action Button in tab headers */}
        {activeTab === 'machines' && (
          <button
            onClick={handleOpenAddMachine}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Machine
          </button>
        )}

        {activeTab === 'mappings' && (
          <button
            onClick={handleAutoMatch}
            disabled={autoMatching}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${autoMatching ? 'animate-spin' : ''}`} />
            {autoMatching ? 'Matching...' : 'Auto Match Mappings'}
          </button>
        )}
      </div>

      {/* Main Tab Content */}
      <div className="w-full min-h-[300px]">

        {/* 1. MACHINES TAB */}
        {activeTab === 'machines' && (
          <div className="w-full">
            {loadingMachines ? (
              <div className="py-20 text-center text-slate-400 flex flex-col items-center gap-3">
                <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
                <p className="font-bold">Loading machine list...</p>
              </div>
            ) : machines.length === 0 ? (
              <div className={`py-16 text-center border-2 border-dashed rounded-2xl flex flex-col items-center gap-4 ${
                isDark ? 'border-slate-850 bg-slate-900/10' : 'border-slate-200 bg-slate-50/10'
              }`}>
                <Cpu className="w-12 h-12 text-slate-500" />
                <div>
                  <h3 className="font-black text-base">No Biometric Machines</h3>
                  <p className="text-slate-400 mt-1 max-w-sm mx-auto">No ESSL biometric machines configured yet. Add your first machine to begin syncing logs.</p>
                </div>
                <button
                  onClick={handleOpenAddMachine}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add First Machine
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {machines.map((m) => (
                  <div key={m.id} className={`rounded-2xl border p-5 flex flex-col gap-4 shadow-sm relative overflow-hidden transition-all hover:scale-[1.01] ${
                    isDark ? 'bg-slate-900/40 border-slate-800/80 shadow-slate-950/20' : 'bg-white border-slate-100 shadow-slate-200/50'
                  }`}>
                    {/* Header: Name and Active status */}
                    <div className="flex items-center justify-between border-b pb-3 border-slate-800/10 dark:border-slate-800/60">
                      <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-xl ${
                          m.isActive 
                            ? 'bg-indigo-500/10 text-indigo-500' 
                            : 'bg-slate-500/10 text-slate-500'
                        }`}>
                          <Cpu className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm leading-tight">{m.name}</h3>
                          <span className="text-[10.5px] font-semibold text-slate-400 block mt-0.5">{m.branch} Branch</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                          !m.isActive 
                            ? 'bg-slate-500/10 text-slate-500' 
                            : m.status === 'Online'
                            ? 'bg-emerald-500/10 text-emerald-500'
                            : 'bg-rose-500/10 text-rose-500'
                        }`}>
                          {!m.isActive ? 'Inactive' : m.status}
                        </span>
                        
                        {/* Toggle active switch */}
                        <button
                          onClick={() => handleToggleMachineActive(m)}
                          title={m.isActive ? 'Disable machine' : 'Enable machine'}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            m.isActive ? 'bg-indigo-600' : 'bg-slate-700'
                          }`}
                        >
                          <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                            m.isActive ? 'translate-x-4' : 'translate-x-0'
                          }`} />
                        </button>
                      </div>
                    </div>

                    {/* Middle: Specs */}
                    <div className="grid grid-cols-2 gap-x-2 gap-y-3 text-xs border-b pb-3 border-slate-800/10 dark:border-slate-800/60">
                      <div>
                        <span className="text-slate-400 font-semibold block text-[10.5px]">IP Address</span>
                        <span className="font-bold">{m.ipAddress}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold block text-[10.5px]">TCP Port</span>
                        <span className="font-bold">{m.port}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold block text-[10.5px]">Device Key</span>
                        <span className="font-bold">{m.deviceKey}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold block text-[10.5px]">Sync Interval</span>
                        <span className="font-bold">Every {m.syncInterval} mins</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-400 font-semibold block text-[10.5px]">Last Synchronized</span>
                        <span className="font-bold text-[11px] text-slate-300">
                          {m.lastSyncAt ? new Date(m.lastSyncAt).toLocaleString() : 'Never Synced'}
                        </span>
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenEditMachine(m)}
                          className={`p-1.5 rounded-lg border transition-colors hover:text-indigo-500 cursor-pointer ${
                            isDark ? 'border-slate-800 hover:bg-slate-850' : 'border-slate-100 hover:bg-slate-50'
                          }`}
                          title="Edit Settings"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteMachine(m.id)}
                          className={`p-1.5 rounded-lg border transition-colors hover:text-rose-500 cursor-pointer ${
                            isDark ? 'border-slate-800 hover:bg-slate-850' : 'border-slate-100 hover:bg-slate-50'
                          }`}
                          title="Delete Machine"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          disabled={testingConnection === m.id || !m.isActive}
                          onClick={() => handleTestConnection(m)}
                          className="px-2.5 py-1.5 border border-indigo-500/20 hover:border-indigo-500 text-indigo-500 hover:bg-indigo-500/5 text-xs font-bold rounded-lg cursor-pointer transition-all disabled:opacity-40"
                        >
                          {testingConnection === m.id ? 'Pinging...' : 'Test Ping'}
                        </button>
                        <button
                          disabled={syncingMachine === m.id || !m.isActive}
                          onClick={() => handleSyncNow(m)}
                          className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg cursor-pointer transition-all disabled:opacity-40 flex items-center gap-1"
                        >
                          <RefreshCw className={`w-3 h-3 ${syncingMachine === m.id ? 'animate-spin' : ''}`} />
                          {syncingMachine === m.id ? 'Syncing...' : 'Sync Now'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 2. BIOMETRIC MAPPINGS TAB */}
        {activeTab === 'mappings' && (
          <div className={`rounded-2xl border shadow-sm ${
            isDark ? 'bg-slate-900/40 border-slate-800/80 shadow-slate-950/20' : 'bg-white border-slate-100 shadow-slate-200/50'
          }`}>
            
            {/* Search and Filters Header */}
            <div className="p-4 border-b border-slate-800/10 dark:border-slate-800/60 flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  type="text"
                  placeholder="Search by name or ID..."
                  value={mappingSearch}
                  onChange={(e) => setMappingSearch(e.target.value)}
                  className={`px-3 py-1.5 rounded-xl border text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none w-64 ${
                    isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200'
                  }`}
                />
                <select
                  value={mappingFilterStatus}
                  onChange={(e) => setMappingFilterStatus(e.target.value as any)}
                  className={`px-3 py-1.5 rounded-xl border text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none ${
                    isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200'
                  }`}
                >
                  <option value="All">All Mappings</option>
                  <option value="Mapped">Mapped Only</option>
                  <option value="Pending">Pending Action</option>
                </select>
              </div>
              
              <div className="text-xs text-slate-400 font-semibold">
                Showing {filteredMappings.length} of {mappings.length} mapping entries
              </div>
            </div>

            {/* Mappings Table */}
            {loadingMappings ? (
              <div className="py-20 text-center text-slate-400 flex flex-col items-center gap-3">
                <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
                <p className="font-bold">Loading mappings...</p>
              </div>
            ) : filteredMappings.length === 0 ? (
              <div className="py-20 text-center text-slate-400 flex flex-col items-center gap-2">
                <Layers className="w-10 h-10 text-slate-500" />
                <p className="font-bold">No mapping records match the criteria.</p>
              </div>
            ) : (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className={`border-b text-slate-400 text-[11px] uppercase tracking-wider font-extrabold ${
                      isDark ? 'border-slate-850' : 'border-slate-100'
                    }`}>
                      <th className="py-3 px-5">Biometric User Details</th>
                      <th className="py-3 px-5">Portal Employee Mapping</th>
                      <th className="py-3 px-5">Machine Branch</th>
                      <th className="py-3 px-5">Sync Status</th>
                      <th className="py-3 px-5">Last Punch Log</th>
                      <th className="py-3 px-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/10 dark:divide-slate-800/60">
                    {filteredMappings.map((map) => (
                      <tr key={map.id} className="hover:bg-slate-500/5 transition-colors">
                        
                        {/* Biometric Name + ID */}
                        <td className="py-3.5 px-5">
                          <div className="font-bold text-slate-800 dark:text-slate-100">{map.biometricName}</div>
                          <span className="text-[10px] font-bold text-indigo-400 block mt-0.5">Biometric ID: {map.biometricEmployeeId}</span>
                        </td>

                        {/* Portal Employee Map */}
                        <td className="py-3.5 px-5">
                          {map.employee ? (
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-800 dark:text-slate-200">
                                {map.employee.firstName} {map.employee.lastName}
                              </span>
                              <span className="text-[10.5px] text-slate-400 font-medium">{map.employee.officeEmail} ({map.employee.employeeId})</span>
                            </div>
                          ) : (
                            <span className="text-xs text-rose-500 bg-rose-500/10 px-2.5 py-1 rounded-full font-bold inline-block border border-rose-500/15">
                              Unmapped / Missing
                            </span>
                          )}
                        </td>

                        {/* Machine Name */}
                        <td className="py-3.5 px-5 font-semibold text-xs">
                          {map.machine?.name || 'Unknown Device'}
                        </td>

                        {/* Status badge */}
                        <td className="py-3.5 px-5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block ${
                            map.syncStatus === 'Mapped' 
                              ? 'bg-emerald-500/10 text-emerald-500' 
                              : 'bg-amber-500/10 text-amber-500'
                          }`}>
                            {map.syncStatus === 'Mapped' ? 'Linked' : 'Pending Link'}
                          </span>
                        </td>

                        {/* Last Punch */}
                        <td className="py-3.5 px-5 text-xs text-slate-400 font-semibold">
                          {map.lastPunch ? new Date(map.lastPunch).toLocaleString() : 'No Logs'}
                        </td>

                        {/* Action buttons */}
                        <td className="py-3.5 px-5 text-right">
                          <button
                            onClick={() => handleOpenMappingModal(map)}
                            className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center gap-1 ml-auto"
                          >
                            <UserCheck className="w-3 h-3" />
                            {map.syncStatus === 'Mapped' ? 'Remap' : 'Map User'}
                          </button>
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        )}

        {/* 3. SYNC LOGS TAB */}
        {activeTab === 'logs' && (
          <div className={`rounded-2xl border shadow-sm ${
            isDark ? 'bg-slate-900/40 border-slate-800/80 shadow-slate-950/20' : 'bg-white border-slate-100 shadow-slate-200/50'
          }`}>
            
            {/* Logs Table */}
            {loadingLogs ? (
              <div className="py-20 text-center text-slate-400 flex flex-col items-center gap-3">
                <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
                <p className="font-bold">Loading sync logs...</p>
              </div>
            ) : logs.length === 0 ? (
              <div className="py-20 text-center text-slate-400 flex flex-col items-center gap-2">
                <Database className="w-10 h-10 text-slate-500" />
                <p className="font-bold">No synchronization logs available.</p>
              </div>
            ) : (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className={`border-b text-slate-400 text-[11px] uppercase tracking-wider font-extrabold ${
                      isDark ? 'border-slate-850' : 'border-slate-100'
                    }`}>
                      <th className="py-3 px-5">Machine</th>
                      <th className="py-3 px-5">Sync Time</th>
                      <th className="py-3 px-5">Status</th>
                      <th className="py-3 px-5">Punches Synced</th>
                      <th className="py-3 px-5">Messages / Errors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/10 dark:divide-slate-800/60">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-500/5 transition-colors">
                        <td className="py-3 px-5 font-bold">{log.machine?.name || 'Unknown Device'}</td>
                        <td className="py-3 px-5 text-xs font-semibold text-slate-400">
                          {new Date(log.syncTime).toLocaleString()}
                        </td>
                        <td className="py-3 px-5">
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                            log.status === 'Success' 
                              ? 'bg-emerald-500/10 text-emerald-500' 
                              : 'bg-rose-500/10 text-rose-500'
                          }`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="py-3 px-5 font-black text-xs">{log.recordsSynced} records</td>
                        <td className="py-3 px-5 text-xs text-slate-300 max-w-sm truncate font-medium">
                          {log.errorMessage ? (
                            <span className="text-rose-400 flex items-center gap-1" title={log.errorMessage}>
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              {log.errorMessage}
                            </span>
                          ) : (
                            <span className="text-slate-450">
                              Synced successfully without issues.
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        )}

        {/* 4. LIVE ACTIVITY TAB */}
        {activeTab === 'activity' && (
          <div className="w-full">
            {loadingActivity ? (
              <div className="py-20 text-center text-slate-400 flex flex-col items-center gap-3">
                <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
                <p className="font-bold">Loading live feed...</p>
              </div>
            ) : livePunches.length === 0 ? (
              <div className={`py-16 text-center border rounded-2xl flex flex-col items-center gap-4 ${
                isDark ? 'bg-slate-900/40 border-slate-800/80 shadow-slate-950/20' : 'bg-white border-slate-100'
              }`}>
                <Activity className="w-12 h-12 text-slate-500" />
                <p className="font-bold text-slate-400">No recent activity detected. Synced punch logs will appear here.</p>
              </div>
            ) : (
              <div className={`rounded-2xl border p-6 flex flex-col gap-6 shadow-sm ${
                isDark ? 'bg-slate-900/40 border-slate-800/80 shadow-slate-950/20' : 'bg-white border-slate-100 shadow-slate-200/50'
              }`}>
                <div className="flex items-center justify-between border-b pb-3 border-slate-800/10 dark:border-slate-800/60">
                  <h3 className="font-bold text-sm flex items-center gap-2">
                    <Activity className="w-4 h-4 text-indigo-500" />
                    Biometric Punch Activity Timeline
                  </h3>
                  <button
                    onClick={fetchLivePunches}
                    className="p-1.5 rounded-lg border border-slate-800/10 dark:border-slate-800/60 hover:text-indigo-500 hover:bg-slate-500/5 transition-all cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="relative pl-6 border-l border-slate-850 flex flex-col gap-6">
                  {livePunches.map((punch, idx) => (
                    <div key={punch.id || idx} className="relative">
                      {/* Timeline dot */}
                      <span className="absolute -left-[30px] top-1.5 w-3 h-3 rounded-full bg-indigo-500 border border-slate-950 ring-4 ring-indigo-500/10" />
                      
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          {punch.Employee ? (
                            <span className="font-bold text-slate-800 dark:text-slate-100">
                              {punch.Employee.firstName} {punch.Employee.lastName}
                            </span>
                          ) : (
                            <span className="font-bold text-amber-500">Unmapped Biometric User ({punch.employee_id})</span>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.2 bg-indigo-500/10 text-indigo-400 rounded">
                              {punch.type === 'CheckIn' ? 'Check-In' : punch.type === 'CheckOut' ? 'Check-Out' : 'Punch'}
                            </span>
                            <span className="text-[10px] text-slate-400 font-semibold">{punch.source} Device Sync</span>
                          </div>
                        </div>
                        <span className="text-xs text-slate-400 font-semibold">
                          {new Date(punch.punchTime).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ────────────────── MODALS ────────────────── */}

      {/* A. MACHINE ADD/EDIT MODAL */}
      {machineModalOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`rounded-2xl border w-full max-w-md p-6 shadow-2xl relative ${
            isDark ? 'bg-[#151F32] border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between border-b pb-3 border-slate-800/10 dark:border-slate-800/60 mb-4">
              <h3 className="font-black text-base flex items-center gap-2 text-slate-800 dark:text-slate-100">
                <Cpu className="w-5 h-5 text-indigo-500" />
                {editingMachine ? 'Edit Machine Details' : 'Add Biometric Machine'}
              </h3>
              <button
                onClick={() => setMachineModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMachine} className="flex flex-col gap-4">
              
              <div>
                <label className="text-xs font-bold text-slate-400 block mb-1">Machine Name *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Headquarters Entrance"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none ${
                    isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 block mb-1">IP Address *</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. 192.168.1.20"
                    value={formIp}
                    onChange={(e) => setFormIp(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none ${
                      isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200'
                    }`}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 block mb-1">Port *</label>
                  <input
                    required
                    type="number"
                    value={formPort}
                    onChange={(e) => setFormPort(Number(e.target.value))}
                    className={`w-full px-3 py-2 rounded-xl border text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none ${
                      isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 block mb-1">Device Key (ID) *</label>
                  <input
                    required
                    type="text"
                    value={formDeviceKey}
                    onChange={(e) => setFormDeviceKey(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none ${
                      isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200'
                    }`}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 block mb-1">Office Branch *</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. Mumbai, Pune"
                    value={formBranch}
                    onChange={(e) => setFormBranch(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none ${
                      isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 block mb-1">Sync Interval (Minutes) *</label>
                <input
                  required
                  type="number"
                  min="1"
                  value={formSyncInterval}
                  onChange={(e) => setFormSyncInterval(Number(e.target.value))}
                  className={`w-full px-3 py-2 rounded-xl border text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none ${
                    isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200'
                  }`}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 block mb-1">API Key (Optional)</label>
                <input
                  type="password"
                  placeholder="e.g. device_secret_hash"
                  value={formApiKey}
                  onChange={(e) => setFormApiKey(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none ${
                    isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200'
                  }`}
                />
              </div>

              <div className="flex items-center gap-3 py-1">
                <input
                  id="isActive"
                  type="checkbox"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="w-4 h-4 accent-indigo-600 focus:ring-0 focus:outline-none"
                />
                <label htmlFor="isActive" className="text-xs font-bold text-slate-300 select-none cursor-pointer">
                  Activate Machine for Background Syncing
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 border-t pt-4 border-slate-800/10 dark:border-slate-800/60 mt-2">
                <button
                  type="button"
                  onClick={() => setMachineModalOpen(false)}
                  className={`px-4 py-2 border text-xs font-bold rounded-xl cursor-pointer ${
                    isDark ? 'border-slate-800 hover:bg-slate-850' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingMachine}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl cursor-pointer shadow-sm transition-all"
                >
                  {submittingMachine ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* B. MAPPING OVERRIDE MODAL */}
      {mappingModalOpen && selectedMapping && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`rounded-2xl border w-full max-w-md p-6 shadow-2xl relative ${
            isDark ? 'bg-[#151F32] border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between border-b pb-3 border-slate-800/10 dark:border-slate-800/60 mb-4">
              <h3 className="font-black text-base flex items-center gap-2 text-slate-800 dark:text-slate-100">
                <UserCheck className="w-5 h-5 text-indigo-500" />
                Map Biometric User
              </h3>
              <button
                onClick={() => setMappingModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              
              {/* Biometric User Details Box */}
              <div className={`p-4 rounded-xl border ${
                isDark ? 'bg-slate-950/40 border-slate-850' : 'bg-slate-50 border-slate-100'
              }`}>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Biometric Record Info</span>
                <span className="font-black text-slate-200 text-sm block mt-1">{selectedMapping.biometricName}</span>
                <span className="text-xs text-indigo-400 font-semibold mt-0.5 block">ID: {selectedMapping.biometricEmployeeId}</span>
              </div>

              {/* Portal Employee Dropdown */}
              <div>
                <label className="text-xs font-bold text-slate-400 block mb-1.5">Select Portal Employee Mapping</label>
                <select
                  value={selectedPortalEmpId}
                  onChange={(e) => setSelectedPortalEmpId(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none ${
                    isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200'
                  }`}
                >
                  <option value="">-- Unmapped (Delete Association) --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName} ({emp.employeeId} - {emp.officeEmail})
                    </option>
                  ))}
                </select>
                <span className="text-[10.5px] text-slate-400 mt-1.5 block">
                  Select the database employee to link with this biometric device ID. Punch logs for this ID will automatically update this employee's attendance.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 border-t pt-4 border-slate-800/10 dark:border-slate-800/60 mt-2">
                <button
                  onClick={() => setMappingModalOpen(false)}
                  className={`px-4 py-2 border text-xs font-bold rounded-xl cursor-pointer ${
                    isDark ? 'border-slate-800 hover:bg-slate-850' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveMapping}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl cursor-pointer shadow-sm transition-all"
                >
                  Save Mapping
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default EsslIntegration;
