import React, { useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { format } from 'date-fns';
import { X, Clock, Briefcase, Zap, Save, ChevronRight, Hash, FileText, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import API from '../../api';
import { toast } from 'react-toastify';

interface Timelog {
  id: string;
  hours: number;
  description: string;
  date: string;
  workItem?: string;
  billableStatus?: string;
  job: {
    id: string;
    jobId: string;
    name: string;
    project: {
      id: string;
      name: string;
      clientId: string;
      client: { id: string, name: string };
    }
  };
}

interface TimesheetDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editingEntry: Timelog | null;
  selectedDate?: Date;
}

const TimesheetDrawer: React.FC<TimesheetDrawerProps> = ({ 
  isOpen, 
  onClose, 
  onSuccess, 
  editingEntry,
  selectedDate 
}) => {
  const [clientsLoading, setClientsLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  const [clients, setClients] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    clientId: '',
    projectId: '',
    jobId: '',
    workItem: '',
    hours: '',
    description: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    isBillable: true
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      fetchClients();
      if (editingEntry) {
        setFormData({
          clientId: editingEntry.job.project.client.id,
          projectId: editingEntry.job.project.id,
          jobId: editingEntry.job.id,
          workItem: editingEntry.workItem || '',
          hours: editingEntry.hours.toString(),
          description: editingEntry.description,
          date: editingEntry.date.split('T')[0],
          isBillable: editingEntry.billableStatus !== 'non_billable'
        });
        fetchProjects(editingEntry.job.project.client.id);
        fetchJobs(editingEntry.job.project.id);
      } else {
        setFormData({
          clientId: '',
          projectId: '',
          jobId: '',
          workItem: '',
          hours: '',
          description: '',
          date: format(selectedDate || new Date(), 'yyyy-MM-dd'),
          isBillable: true
        });
      }
      setErrors({});
    }
  }, [isOpen, editingEntry, selectedDate]);

  const fetchClients = async () => {
    try {
      setClientsLoading(true);
      const res = await API.get('/clients');
      setClients(res.data?.data || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load clients');
    } finally {
      setClientsLoading(false);
    }
  };

  const fetchProjects = async (clientId: string) => {
    if (!clientId) {
      setProjects([]);
      return;
    }
    try {
      setProjectsLoading(true);
      const res = await API.get('/projects', { params: { clientId } });
      setProjects((res.data?.data || []).filter((p: any) => p.status !== 'Inactive' || (editingEntry && p.id === editingEntry.job.project.id)));
    } catch (err) {
      console.error(err);
      toast.error('Failed to load projects');
    } finally {
      setProjectsLoading(false);
    }
  };

  const fetchJobs = async (projectId: string) => {
    if (!projectId) {
      setJobs([]);
      return;
    }
    try {
      setJobsLoading(true);
      const res = await API.get('/jobs', { params: { projectId } });
      setJobs((res.data?.data || []).filter((j: any) => j.status !== 'Inactive' || (editingEntry && j.id === editingEntry.job.id)));
    } catch (err) {
      console.error(err);
      toast.error('Failed to load jobs');
    } finally {
      setJobsLoading(false);
    }
  };

  const validateForm = () => {
    const nextErrors: Record<string, string> = {};
    if (!formData.clientId) nextErrors.clientId = 'Client is required';
    if (!formData.projectId) nextErrors.projectId = 'Project is required';
    if (!formData.jobId) nextErrors.jobId = 'Job is required';
    
    const hours = parseFloat(formData.hours);
    if (!formData.hours || isNaN(hours)) {
      nextErrors.hours = 'Valid hours required';
    } else if (hours <= 0) {
      nextErrors.hours = 'Hours must be greater than 0';
    } else if (hours > 24) {
      nextErrors.hours = 'Max 24 hours allowed';
    }

    if (!formData.description || formData.description.trim().length < 10) {
      nextErrors.description = 'Description must be at least 10 characters';
    }

    const selectedDateObj = new Date(formData.date);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (selectedDateObj > today) {
      nextErrors.date = 'Future dates are not allowed';
    }
    
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      setLoading(true);
      const payload = {
        ...formData,
        hours: parseFloat(formData.hours),
        billableStatus: formData.isBillable ? 'billable' : 'non_billable'
      };

      if (editingEntry) {
        await API.put(`/timelogs/${editingEntry.id}`, payload);
        toast.success('Timelog updated');
      } else {
        await API.post('/timelogs', payload);
        toast.success('Time logged successfully');
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save timelog');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Transition.Root show={isOpen} as={React.Fragment}>
      <Dialog as="div" className="relative z-[999]" onClose={onClose}>
        <Transition.Child
          as={React.Fragment}
          enter="ease-in-out duration-500"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in-out duration-500"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <Transition.Child
                as={React.Fragment}
                enter="transform transition ease-in-out duration-500"
                enterFrom="translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-500"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full"
              >
                <Dialog.Panel className="pointer-events-auto w-screen max-w-xl">
                   <div className="flex h-full flex-col overflow-y-auto bg-white shadow-2xl">
                      {/* Premium Header */}
                      <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <div>
                          <Dialog.Title className="text-2xl font-[1000] text-slate-900 tracking-tight">
                            {editingEntry ? 'Edit Engagement' : 'Log New Session'}
                          </Dialog.Title>
                          <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest flex items-center gap-2">
                            <Clock className="w-3 h-3" />
                            Chronicle Your Productivity
                          </p>
                        </div>
                        <button 
                          onClick={onClose} 
                          className="p-2.5 rounded-xl hover:bg-white hover:shadow-lg transition-all text-slate-400 hover:text-slate-900 group"
                          aria-label="Close"
                          title="Close"
                        >
                          <X className="h-5 w-5 transition-transform group-hover:rotate-90" />
                        </button>
                      </div>
                      
                      <div className="flex-1 p-8 space-y-8">
                        <form onSubmit={handleSave} className="space-y-6">
                           {/* Step 1: Selection Flow */}
                           <div className="grid grid-cols-1 gap-6">
                             <div className="space-y-2">
                               <label className="text-[11px] font-[1000] uppercase tracking-[0.15em] text-slate-500 flex items-center gap-2">
                                 <Briefcase className="w-3.5 h-3.5" />
                                 Client Relationship
                               </label>
                               <div className="relative group">
                                 <select 
                                   id="client-select"
                                   aria-label="Select Corporate Client"
                                   className={`w-full h-[52px] px-4 rounded-2xl border-2 transition-all outline-none appearance-none font-bold text-sm ${formData.clientId ? 'border-primary-100 bg-primary-50/10 text-slate-900' : 'border-slate-100 bg-slate-50/50 text-slate-400'} focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/5`}
                                   value={formData.clientId}
                                   onChange={(e) => {
                                     const cid = e.target.value;
                                     setFormData({...formData, clientId: cid, projectId: '', jobId: ''});
                                     fetchProjects(cid);
                                   }}
                                 >
                                    <option value="">Select Corporate Client</option>
                                    {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                 </select>
                                 <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                   {clientsLoading ? <RefreshCw className="w-4 h-4 animate-spin text-primary-500" /> : <ChevronRight className="w-4 h-4 rotate-90" />}
                                 </div>
                               </div>
                               {errors.clientId && <p className="text-[10px] font-bold text-red-500 px-2 uppercase tracking-wider">{errors.clientId}</p>}
                             </div>

                             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                               <div className="space-y-2">
                                 <label className="text-[11px] font-[1000] uppercase tracking-[0.15em] text-slate-500 flex items-center gap-2">
                                   <Zap className="w-3.5 h-3.5" />
                                   Assigned Project
                                 </label>
                                 <div className="relative group">
                                   <select 
                                     id="project-select"
                                     aria-label="Select Active Project"
                                     className={`w-full h-[52px] px-4 rounded-2xl border-2 transition-all outline-none appearance-none font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed ${formData.projectId ? 'border-primary-100 bg-primary-50/10 text-slate-900' : 'border-slate-100 bg-slate-50/50 text-slate-400'} focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/5`}
                                     value={formData.projectId}
                                     disabled={!formData.clientId || projectsLoading}
                                     onChange={(e) => {
                                       const pid = e.target.value;
                                       setFormData({...formData, projectId: pid, jobId: ''});
                                       fetchJobs(pid);
                                     }}
                                   >
                                      <option value="">{projectsLoading ? 'Loading Assets...' : 'Select Active Project'}</option>
                                      {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                      {formData.clientId && projects.length === 0 && !projectsLoading && <option disabled>No Projects Found</option>}
                                   </select>
                                   <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                     {projectsLoading ? <RefreshCw className="w-4 h-4 animate-spin text-primary-500" /> : <ChevronRight className="w-4 h-4 rotate-90" />}
                                   </div>
                                 </div>
                                 {errors.projectId && <p className="text-[10px] font-bold text-red-500 px-2 uppercase tracking-wider">{errors.projectId}</p>}
                               </div>

                               <div className="space-y-2">
                                 <label className="text-[11px] font-[1000] uppercase tracking-[0.15em] text-slate-500 flex items-center gap-2">
                                   <Hash className="w-3.5 h-3.5" />
                                   Specific Job/Task
                                 </label>
                                 <div className="relative group">
                                   <select 
                                     id="job-select"
                                     aria-label="Select Specific Job"
                                     className={`w-full h-[52px] px-4 rounded-2xl border-2 transition-all outline-none appearance-none font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed ${formData.jobId ? 'border-primary-100 bg-primary-50/10 text-slate-900' : 'border-slate-100 bg-slate-50/50 text-slate-400'} focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/5`}
                                     value={formData.jobId}
                                     disabled={!formData.projectId || jobsLoading}
                                     onChange={(e) => setFormData({...formData, jobId: e.target.value})}
                                   >
                                      <option value="">{jobsLoading ? 'Synchronizing...' : 'Select Specific Job'}</option>
                                      {jobs.map((j: any) => <option key={j.id} value={j.id}>{j.name}</option>)}
                                      {formData.projectId && jobs.length === 0 && !jobsLoading && <option disabled>No Jobs Found</option>}
                                   </select>
                                   <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                     {jobsLoading ? <RefreshCw className="w-4 h-4 animate-spin text-primary-500" /> : <ChevronRight className="w-4 h-4 rotate-90" />}
                                   </div>
                                 </div>
                                 {errors.jobId && <p className="text-[10px] font-bold text-red-500 px-2 uppercase tracking-wider">{errors.jobId}</p>}
                               </div>
                             </div>
                           </div>

                           {/* Step 2: Date and Hours */}
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                             <div className="space-y-2">
                               <label className="text-[11px] font-[1000] uppercase tracking-[0.15em] text-slate-500">Service Date</label>
                               <input 
                                 id="date-input"
                                 type="date"
                                 aria-label="Service Date"
                                 className="w-full h-[52px] px-4 rounded-2xl border-2 border-slate-100 bg-slate-50/50 focus:bg-white focus:border-primary-500 outline-none font-bold text-sm transition-all"
                                 value={formData.date}
                                 max={format(new Date(), 'yyyy-MM-dd')}
                                 onChange={(e) => setFormData({...formData, date: e.target.value})}
                               />
                               {errors.date && <p className="text-[10px] font-bold text-red-500 px-2 uppercase tracking-wider">{errors.date}</p>}
                             </div>
                             
                             <div className="space-y-2">
                               <label className="text-[11px] font-[1000] uppercase tracking-[0.15em] text-slate-500">Duration (Hours)</label>
                               <div className="relative">
                                 <input 
                                   id="hours-input"
                                   type="number" 
                                   step="0.25"
                                   aria-label="Duration in Hours"
                                   placeholder="e.g. 8.00"
                                   className={`w-full h-[52px] px-4 pr-12 rounded-2xl border-2 transition-all outline-none font-[1000] text-lg ${errors.hours ? 'border-red-100 bg-red-50/30' : 'border-slate-100 bg-slate-50/50 focus:bg-white focus:border-primary-500'}`}
                                   value={formData.hours}
                                   onChange={(e) => {
                                      const val = e.target.value;
                                      if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                        setFormData({...formData, hours: val});
                                      }
                                   }}
                                 />
                                 <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-[1000] uppercase">Hrs</div>
                               </div>
                               {errors.hours && <p className="text-[10px] font-bold text-red-500 px-2 uppercase tracking-wider">{errors.hours}</p>}
                             </div>
                           </div>

                           {/* Step 3: Description */}
                           <div className="space-y-2">
                             <label className="text-[11px] font-[1000] uppercase tracking-[0.15em] text-slate-500 flex items-center gap-2">
                               <FileText className="w-3.5 h-3.5" />
                               Engagement Narrative
                             </label>
                             <textarea 
                               id="description-textarea"
                               aria-label="Engagement Narrative"
                               placeholder="Detail the value provided during this session..."
                               className={`w-full p-5 rounded-2xl border-2 transition-all outline-none font-bold text-sm min-h-[140px] leading-relaxed ${errors.description ? 'border-red-100 bg-red-50/30' : 'border-slate-100 bg-slate-50/50 focus:bg-white focus:border-primary-500'}`}
                               value={formData.description}
                               onChange={(e) => setFormData({...formData, description: e.target.value})}
                             />
                             <div className="flex justify-between items-center px-1">
                               {errors.description ? (
                                 <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">{errors.description}</p>
                               ) : (
                                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Minimum 10 characters required</p>
                               )}
                               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{formData.description.length} chars</p>
                             </div>
                           </div>

                           {/* Billable Toggle */}
                           <div 
                             onClick={() => setFormData({...formData, isBillable: !formData.isBillable})}
                             className={`flex items-center justify-between p-4 rounded-2xl border-2 cursor-pointer transition-all ${formData.isBillable ? 'border-primary-200 bg-primary-50/30' : 'border-slate-100 bg-slate-50/50'}`}
                           >
                             <div className="flex items-center gap-3">
                               <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${formData.isBillable ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20' : 'bg-slate-200 text-slate-500'}`}>
                                 <Zap className="w-5 h-5" />
                               </div>
                               <div>
                                 <p className="text-sm font-[1000] text-slate-900">Revenue Generating</p>
                                 <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">This session is billable to client</p>
                               </div>
                             </div>
                             <div className={`w-12 h-6 rounded-full relative transition-all duration-300 ${formData.isBillable ? 'bg-primary-500' : 'bg-slate-300'}`}>
                               <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300 ${formData.isBillable ? 'left-7' : 'left-1'}`} />
                             </div>
                           </div>
                        </form>
                      </div>

                      {/* Premium Footer */}
                      <div className="p-8 border-t border-slate-100 flex items-center justify-between bg-slate-50/30">
                        <Button
                          variant="secondary"
                          className="h-[52px] px-8 rounded-2xl font-[1000] text-xs uppercase tracking-widest border-2 border-slate-200 hover:bg-white transition-all"
                          onClick={onClose}
                        >
                          Cancel
                        </Button>
                        <Button 
                          variant="primary"
                          onClick={handleSave} 
                          className="h-[52px] px-10 rounded-2xl font-[1000] text-xs uppercase tracking-widest flex items-center gap-3 shadow-xl shadow-primary-500/25 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100"
                          disabled={loading}
                        >
                          {loading ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <Save className="w-4 h-4" />
                              {editingEntry ? 'Update Protocol' : 'Execute Log'}
                            </>
                          )}
                        </Button>
                      </div>
                   </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
};

export default TimesheetDrawer;

