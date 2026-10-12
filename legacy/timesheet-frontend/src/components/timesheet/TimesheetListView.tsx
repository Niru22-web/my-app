import React from 'react';
import { motion } from 'framer-motion';
import { Edit2, Trash2, User, Briefcase, Clock, CheckCircle, Clock3, AlertCircle } from 'lucide-react';
import StatusBadge from '../ui/StatusBadge';
import Button from '../ui/Button';

interface Timelog {
  id: string;
  hours: number;
  description: string;
  date: string;
  workItem?: string;
  billableStatus?: string;
  submissionStatus?: string;
  employee: {
     id: string;
     firstName: string;
     lastName: string;
     officeEmail: string;
  };
  job: {
    id: string;
    jobId: string;
    name: string;
    project: {
      id: string;
      name: string;
      client: { id: string, name: string };
    }
  };
}

interface TimesheetListViewProps {
  entries: Timelog[];
  loading: boolean;
  userRole: string;
  currentUserId: string;
  onEdit: (entry: Timelog) => void;
  onDelete: (id: string) => void;
  onSubmit: (id: string) => void;
}

const TimesheetListView: React.FC<TimesheetListViewProps> = ({ 
  entries, 
  loading, 
  userRole, 
  currentUserId,
  onEdit, 
  onDelete,
  onSubmit 
}) => {
  const isManagerialRole = ['Admin', 'Manager', 'Partner', 'Owner'].includes(userRole);

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'approved': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'rejected': return 'bg-rose-50 text-rose-600 border-rose-100';
      case 'submitted': return 'bg-sky-50 text-sky-600 border-sky-100';
      default: return 'bg-slate-50 text-slate-500 border-slate-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'approved': return <CheckCircle className="w-3.5 h-3.5" />;
      case 'submitted': return <Clock3 className="w-3.5 h-3.5" />;
      case 'rejected': return <AlertCircle className="w-3.5 h-3.5" />;
      default: return <Clock className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* 📱 Mobile Log Cards (Visible < 1024px) */}
      <div className="lg:hidden flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 dark:bg-[#080F1D]/50">
        {loading && entries.length === 0 ? (
          <div className="space-y-4">
             {[...Array(3)].map((_, i) => (
                <div key={i} className="p-5 bg-white dark:bg-[#0E1626] rounded-[1.5rem] border border-slate-100 dark:border-slate-800/40 shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 shimmer-bg rounded-xl" />
                      <div className="space-y-2">
                        <div className="h-4 shimmer-bg rounded w-28" />
                        <div className="h-3 shimmer-bg rounded w-20" />
                      </div>
                    </div>
                    <div className="h-5 shimmer-bg rounded w-12" />
                  </div>
                  <div className="h-12 shimmer-bg rounded-2xl mb-4" />
                  <div className="flex justify-between">
                     <div className="space-y-1.5">
                       <div className="h-2.5 shimmer-bg rounded w-10" />
                       <div className="h-4 shimmer-bg rounded w-14" />
                     </div>
                     <div className="h-8 shimmer-bg rounded-xl w-20" />
                  </div>
                </div>
             ))}
          </div>
        ) : entries.length > 0 ? (
          entries.map(entry => {
            const dateObj = new Date(entry.date);
            const isOwnEntry = entry.employee.id === currentUserId;
            return (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-5 bg-white rounded-[1.5rem] border border-slate-100 shadow-sm active:scale-[0.98] transition-all"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-900 rounded-xl flex flex-col items-center justify-center text-white shadow-lg">
                      <span className="text-[8px] font-black uppercase leading-none opacity-60">{dateObj.toLocaleString('default', { month: 'short' })}</span>
                      <span className="text-sm font-black leading-tight">{dateObj.getDate()}</span>
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900 leading-tight">{entry.job.project.client.name}</h3>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5 truncate max-w-[150px]">{entry.job.project.name}</p>
                    </div>
                  </div>
                  <div className={`px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-wider ${getStatusColor(entry.submissionStatus || 'not_submitted')}`}>
                    {entry.submissionStatus === 'not_submitted' ? 'Draft' : (entry.submissionStatus || 'Draft')}
                  </div>
                </div>

                <div className="py-3 px-4 bg-slate-50 rounded-2xl mb-4 border border-slate-100/50">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Engaged Task</p>
                   <p className="text-xs font-bold text-slate-700 leading-relaxed">{entry.workItem || entry.description}</p>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Duration</p>
                      <p className="text-sm font-black text-slate-900">{entry.hours.toFixed(2)}h</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Billing</p>
                      <p className="text-sm font-black text-slate-600">{entry.billableStatus === 'non_billable' ? 'Internal' : 'Billable'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                     {isOwnEntry && (entry.submissionStatus !== 'approved' && entry.submissionStatus !== 'submitted') && (
                       <Button 
                         size="sm"
                         variant="primary"
                         onClick={() => onSubmit(entry.id)}
                         className="h-10 rounded-xl text-[10px] font-black uppercase tracking-widest px-4 shadow-lg shadow-indigo-500/20"
                       >
                         Submit
                       </Button>
                     )}
                     {(isOwnEntry || userRole === 'Admin') && (
                       <div className="flex gap-1">
                          <button 
                            onClick={() => onEdit(entry)} 
                            className="p-2.5 text-slate-400 hover:text-indigo-600 bg-slate-50 rounded-xl"
                            title="Edit Log"
                            aria-label="Edit time log"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={() => onDelete(entry.id)} 
                            className="p-2.5 text-slate-400 hover:text-rose-600 bg-slate-50 rounded-xl"
                            title="Delete Log"
                            aria-label="Delete time log"
                          >
                            <Trash2 size={16} />
                          </button>
                       </div>
                     )}
                  </div>
                </div>
              </motion.div>
            );
          })
        ) : (
          <div className="py-20 text-center opacity-30 italic font-black text-sm uppercase tracking-widest">Records Empty</div>
        )}
      </div>

      {/* 🖥️ Desktop Log Table (Visible > 1024px) */}
      <div className="hidden lg:block table-wrapper !max-h-[calc(100vh-280px)]">
        <table className="w-full text-left whitespace-nowrap">
          <thead className="bg-slate-50/50 backdrop-blur-md border-b border-slate-100">
            <tr>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Entry Date</th>
              {isManagerialRole && (
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Employee</th>
              )}
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Client & Project</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Job / Task</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Hours</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading && entries.length === 0 ? (
              [...Array(5)].map((_, idx) => (
                <tr key={idx}>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 shimmer-bg rounded-xl" />
                      <div className="space-y-1.5">
                        <div className="h-3 shimmer-bg rounded w-10" />
                        <div className="h-3.5 shimmer-bg rounded w-16" />
                      </div>
                    </div>
                  </td>
                  {isManagerialRole && (
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 shimmer-bg rounded-full" />
                        <div className="space-y-1.5">
                          <div className="h-3.5 shimmer-bg rounded w-20" />
                          <div className="h-2.5 shimmer-bg rounded w-12" />
                        </div>
                      </div>
                    </td>
                  )}
                  <td className="px-6 py-5">
                    <div className="space-y-2">
                      <div className="h-4 shimmer-bg rounded w-32" />
                      <div className="h-3 shimmer-bg rounded w-24" />
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="space-y-2">
                      <div className="h-3 shimmer-bg rounded w-12" />
                      <div className="h-3 shimmer-bg rounded w-36" />
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex flex-col items-center space-y-1.5">
                      <div className="h-4 shimmer-bg rounded w-8" />
                      <div className="h-2.5 shimmer-bg rounded w-10" />
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="h-6 shimmer-bg rounded-full w-20" />
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex justify-end gap-2">
                      <div className="w-8 h-8 shimmer-bg rounded-lg" />
                      <div className="w-8 h-8 shimmer-bg rounded-lg" />
                    </div>
                  </td>
                </tr>
              ))
            ) : entries.length > 0 ? (
              entries.map(entry => {
                const dateObj = new Date(entry.date);
                const isOwnEntry = entry.employee.id === currentUserId;
                
                return (
                  <tr key={entry.id} className="hover:bg-slate-50 group transition-all duration-300">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white border border-slate-100 rounded-xl flex flex-col items-center justify-center shadow-sm group-hover:bg-slate-900 group-hover:text-white transition-all">
                          <span className="text-[9px] font-black leading-none uppercase">{dateObj.toLocaleString('default', { month: 'short' })}</span>
                          <span className="text-sm font-black leading-tight">{dateObj.getDate()}</span>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{dateObj.getFullYear()}</p>
                          <p className="text-xs font-black text-slate-600">{dateObj.toLocaleString('default', { weekday: 'long' })}</p>
                        </div>
                      </div>
                    </td>
                    
                    {isManagerialRole && (
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500">
                             <User className="w-4 h-4" />
                          </div>
                          <div>
                             <p className="text-sm font-black text-slate-900 leading-tight">{entry.employee.firstName} {entry.employee.lastName}</p>
                             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{entry.employee.officeEmail.split('@')[0]}</p>
                          </div>
                        </div>
                      </td>
                    )}
                    
                    <td className="px-6 py-5">
                      <div>
                        <p className="text-sm font-black text-slate-800">{entry.job.project.client.name}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                           <div className="w-1.5 h-1.5 rounded-full bg-primary-500" />
                           <p className="text-xs font-bold text-base-500 group-hover:text-primary-600 transition-colors">{entry.job.project.name}</p>
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-6 py-5">
                      <div>
                         <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-black rounded uppercase tracking-wider group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                           {entry.job.jobId}
                         </span>
                         <p className="text-xs font-bold text-slate-600 mt-1.5 max-w-[200px] truncate" title={entry.description}>
                           {entry.workItem || entry.description}
                         </p>
                      </div>
                    </td>
                    
                    <td className="px-6 py-5 text-center">
                      <div className="flex flex-col items-center">
                         <span className="text-sm font-black text-slate-900">{entry.hours.toFixed(2)}h</span>
                         <span className="text-[9px] font-bold text-slate-400 mt-0.5 uppercase tracking-tighter">{entry.billableStatus === 'non_billable' ? 'Internal' : 'Billable'}</span>
                      </div>
                    </td>
                    
                    <td className="px-6 py-5">
                       <div className="flex flex-col gap-1 items-start">
                         <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider ${getStatusColor(entry.submissionStatus || 'pending')}`}>
                            {getStatusIcon(entry.submissionStatus || 'pending')}
                            {entry.submissionStatus || 'Draft'}
                         </div>
                         {entry.submissionStatus === 'rejected' && (entry as any).rejectionReason && (
                           <p className="text-[9px] font-bold text-rose-400 mt-1 italic max-w-[150px] truncate" title={(entry as any).rejectionReason}>
                             Reason: {(entry as any).rejectionReason}
                           </p>
                         )}
                       </div>
                    </td>
                    
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         {(isOwnEntry || userRole === 'Admin') && (
                           <>
                             <button 
                               onClick={() => onEdit(entry)}
                               className="p-1.5 hover:bg-white hover:text-primary-600 border border-transparent hover:border-slate-200 rounded-lg transition-all shadow-sm bg-slate-50 text-slate-400"
                               title="Edit Log"
                             >
                               <Edit2 className="w-4 h-4" />
                             </button>
                             <button 
                               onClick={() => onDelete(entry.id)}
                               className="p-1.5 hover:bg-white hover:text-rose-600 border border-transparent hover:border-slate-200 rounded-lg transition-all shadow-sm bg-slate-50 text-slate-400"
                               title="Delete Log"
                             >
                               <Trash2 className="w-4 h-4" />
                             </button>
                           </>
                         )}
                         {isOwnEntry && (entry.submissionStatus === 'not_submitted' || entry.submissionStatus === 'pending' || entry.submissionStatus === 'rejected') && (
                            <button 
                             onClick={() => onSubmit(entry.id)}
                             className="ml-2 px-3 py-1.5 bg-slate-950 hover:bg-black text-white text-[10px] font-black rounded-lg shadow-xl shadow-slate-200 transition-all uppercase tracking-widest"
                            >
                              Submit
                            </button>
                         )}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={isManagerialRole ? 7 : 6} className="py-32 text-center text-slate-300 italic text-sm font-black uppercase tracking-[0.3em]">No Logic Detected</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TimesheetListView;
