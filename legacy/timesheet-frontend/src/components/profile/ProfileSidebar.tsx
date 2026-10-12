import React from 'react';
import Avatar from '../ui/Avatar';
import Button from '../ui/Button';
import { 
  CameraIcon, 
  PencilSquareIcon, 
  KeyIcon,
  AcademicCapIcon,
  CheckBadgeIcon,
  ShieldCheckIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';
import TreeView from './TreeView';
import { motion } from 'framer-motion';

interface ProfileSidebarProps {
  details: any;
  stats: any;
  photoUrl: string;
  onPhotoClick: () => void;
  onEditClick: () => void;
  onPasswordClick: () => void;
  onStatusToggle: () => void;
}

const ProfileSidebar: React.FC<ProfileSidebarProps> = ({ 
  details, 
  stats,
  photoUrl, 
  onPhotoClick, 
  onEditClick, 
  onPasswordClick
}) => {
  if (!details) return (
    <div className="w-[340px] h-full bg-secondary-50 animate-pulse rounded-2xl" />
  );

  // Corporate structure data
  const treeData = [
    {
      id: 'dep-1',
      name: details.department || 'Not Assigned',
      type: 'department' as const,
      children: [
        {
          id: 'team-1',
          name: (details.managers?.length > 0) ? 'Team Unit' : 'General Unit',
          type: 'team' as const,
          children: [
            { id: 'emp-curr', name: `${details.firstName} ${details.lastName}`, type: 'employee' as const, role: details.role, isCurrentUser: true }
          ]
        }
      ]
    }
  ];

  const profileStats = [
    { label: 'Projects', value: stats?.myProjects || '0', color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Hours', value: stats?.hoursLogged || '0', color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Tasks', value: stats?.totalTasks || '0', color: 'text-purple-600', bg: 'bg-purple-50' }
  ];

  return (
    <div className="w-[340px] flex flex-col gap-6 animate-fade-in custom-scrollbar overflow-y-auto px-1 pb-10">
      {/* Profile summary card */}
      <div className="bg-white rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-secondary-100 overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
        <div className="h-28 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700" />
        <div className="px-6 pb-8 -mt-14 text-center">
          <div className="relative inline-block group">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative">
              <Avatar 
                name={`${details.firstName} ${details.lastName}`} 
                size="2xl" 
                src={photoUrl}
                border
                className="ring-4 ring-white shadow-xl transform group-hover:scale-105 transition-transform duration-300"
              />
              <button
                onClick={onPhotoClick}
                title="Update profile photo"
                className="absolute bottom-1 right-1 bg-white p-2.5 rounded-full shadow-lg text-primary-600 hover:text-white hover:bg-primary-600 transition-all active:scale-90 border border-slate-100"
              >
                <CameraIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <div className="mt-4">
            <h1 className="text-2xl font-black text-secondary-900 tracking-tight leading-tight">{details.firstName} {details.lastName}</h1>
            <p className="text-sm font-semibold text-secondary-500 mt-1 uppercase tracking-wider">{details.designation}</p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-[0.15em] border border-emerald-100 shadow-sm">
                ● {details.status}
              </span>
              <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-[10px] font-black uppercase tracking-[0.15em] border border-blue-100 shadow-sm">
                ID: {details.employeeId}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-8">
            {profileStats.map((stat, i) => (
              <div key={i} className={`${stat.bg} p-2 rounded-xl border border-white/50 backdrop-blur-sm`}>
                <p className={`text-lg font-black ${stat.color} leading-none`}>{stat.value}</p>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter mt-1">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 space-y-3">
            <Button 
              variant="primary" 
              fullWidth 
              onClick={onEditClick}
              className="shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all"
              leftIcon={<PencilSquareIcon className="w-4 h-4" />}
            >
              Edit Management Profile
            </Button>
            <Button 
              variant="secondary" 
              fullWidth 
              onClick={onPasswordClick}
              className="bg-white border-slate-200 hover:bg-slate-50 transition-all"
              leftIcon={<KeyIcon className="w-4 h-4" />}
            >
              Update Security
            </Button>
          </div>
        </div>
      </div>

      {/* Corporate Hierarchy Tree View */}
      <div className="bg-white rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-secondary-100 p-6 hover:shadow-xl transition-all duration-300">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-blue-50 rounded-xl text-blue-600 shadow-sm">
            <ShieldCheckIcon className="w-5 h-5" />
          </div>
          <h2 className="text-xs font-black text-secondary-900 uppercase tracking-[0.2em]">Organizational Matrix</h2>
        </div>
        <TreeView data={treeData} />
      </div>

      {/* Performance Index */}
      <div className="bg-white rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-secondary-100 p-6 hover:shadow-xl transition-all duration-300">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 bg-purple-50 rounded-xl text-purple-600 shadow-sm">
            <ChartBarIcon className="w-5 h-5" />
          </div>
          <h2 className="text-xs font-black text-secondary-900 uppercase tracking-[0.2em]">Efficiency Metric</h2>
        </div>
        <div className="space-y-5 pt-1">
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-black text-secondary-400 uppercase tracking-widest">Efficiency Index</span>
              <span className="text-xs font-black text-emerald-600">{stats?.hoursLogged > 0 ? 'Optimal' : 'N/A'}</span>
            </div>
            <div className="w-full h-2 bg-secondary-100/50 rounded-full p-0.5">
              <motion.div 
                className="h-full bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                initial={{ width: 0 }}
                animate={{ width: stats?.hoursLogged > 0 ? '100%' : '0%' }}
                transition={{ duration: 1.5, ease: "easeOut" }}
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-black text-secondary-400 uppercase tracking-widest">Task Throughput</span>
              <span className="text-xs font-black text-blue-600">{stats?.totalTasks || '0'} Units</span>
            </div>
            <div className="w-full h-2 bg-secondary-100/50 rounded-full p-0.5">
              <motion.div 
                className="h-full bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.3)]"
                initial={{ width: 0 }}
                animate={{ width: stats?.totalTasks > 0 ? '100%' : '0%' }}
                transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileSidebar;
