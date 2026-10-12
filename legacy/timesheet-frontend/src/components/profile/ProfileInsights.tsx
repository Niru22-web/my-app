import React from 'react';
import { 
  ChartBarIcon, 
  SparklesIcon, 
  PlusIcon,
  AcademicCapIcon,
  CheckBadgeIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';
import ProfileCard from './ProfileCard';
import Button from '../ui/Button';
import { motion } from 'framer-motion';

interface ProfileInsightsProps {
  details: any;
  documents: any[];
  completeness: number;
  onUpdateClick: () => void;
}

const ProfileInsights: React.FC<ProfileInsightsProps> = ({ details, documents, completeness, onUpdateClick }) => {
  if (!details) return (
    <div className="w-[340px] h-full bg-secondary-50 animate-pulse rounded-2xl" />
  );

  const profile = details.profile || {};
  const skills = profile.skills || [];

  return (
    <div className="w-[340px] flex flex-col gap-6 animate-fade-in custom-scrollbar overflow-y-auto px-1 pb-10">
      {/* Profile Completion */}
      <ProfileCard 
        title="Registry Integrity" 
        icon={<CheckBadgeIcon className="w-5 h-5 text-emerald-500" />}
        actions={
          <div className="flex items-center gap-2">
            <div className={`text-xs font-black ${completeness === 100 ? 'text-emerald-600' : 'text-blue-600'}`}>
              {completeness}%
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="relative pt-1">
            <div className="flex mb-2 items-center justify-between">
              <div>
                <span className="text-[9px] font-black inline-block py-1 px-2 uppercase rounded-full text-blue-600 bg-blue-100 tracking-widest">
                  Synchronization
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs font-black inline-block text-blue-600">
                  {completeness}%
                </span>
              </div>
            </div>
            <div className="overflow-hidden h-2.5 mb-2 text-xs flex rounded-full bg-slate-100 shadow-inner">
              <motion.div 
                className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${completeness}%` }}
                transition={{ duration: 1.5, ease: "circOut" }}
              />
            </div>
          </div>
          
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <p className="text-xs font-bold text-slate-600 leading-relaxed">
              {completeness < 100 
                ? `Core identity data is ${completeness}% synchronized. Complete high-priority fields to reach Tier-1 verification.` 
                : 'Neural profile fully operational. Identity verified across all corporate sectors.'
              }
            </p>
          </div>

          {completeness < 100 && (
            <Button 
              variant="premium" 
              fullWidth 
              size="sm" 
              onClick={onUpdateClick}
              className="mt-2 shadow-md shadow-indigo-500/10 active:scale-95 transition-all py-2.5 text-xs uppercase font-black tracking-widest border-none
                !bg-gradient-to-r !from-indigo-600 !to-purple-600 !text-white
                hover:scale-105 active:scale-95"
              title="Sync Missing Data"
            >
              Sync Missing Data
            </Button>
          )}
        </div>
      </ProfileCard>

      {/* Profile Completion Tips */}
      <ProfileCard title="Registry Tips" icon={<PlusIcon className="w-5 h-5 text-amber-500" />}>
        <div className="space-y-4">
          <div className="flex gap-4 items-start pb-4 border-b border-slate-50">
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
              <AcademicCapIcon className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-black text-slate-800 tracking-tight">Add Skills</p>
              <p className="text-[10px] font-bold text-slate-400 mt-0.5">Boost your score by 15 points</p>
            </div>
          </div>
          <div className="flex gap-4 items-start">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
              <ShieldCheckIcon className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <p className="text-xs font-black text-slate-800 tracking-tight">Identity Verification</p>
              <p className="text-[10px] font-bold text-slate-400 mt-0.5">Upload Aadhaar/PAN for badge</p>
            </div>
          </div>
        </div>
      </ProfileCard>

      {/* Skills & proficiencies */}
      <ProfileCard title="Core Proficiencies" icon={<SparklesIcon className="w-5 h-5" />}>
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {skills.length > 0 ? (
              skills.map((skill: string, idx: number) => (
                <span 
                  key={idx} 
                  className="px-3 py-1.5 rounded-xl bg-white border border-secondary-100 shadow-soft text-xs font-bold text-secondary-700 hover:border-primary-200 hover:text-primary-600 transition-all cursor-default"
                >
                  {skill}
                </span>
              ))
            ) : (
              <div className="w-full py-6 flex flex-col items-center justify-center border-2 border-dashed border-secondary-100 rounded-2xl bg-secondary-50/30">
                <SparklesIcon className="w-8 h-8 text-secondary-200 mb-2" />
                <p className="text-xs text-secondary-400 font-medium">No skills mapped yet</p>
              </div>
            )}
            <button 
              onClick={onUpdateClick}
              className="p-1.5 rounded-xl border border-dashed border-secondary-300 text-secondary-400 hover:border-primary-400 hover:text-primary-600 transition-all"
              title="Add Skill"
              aria-label="Add Skill"
            >
              <PlusIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </ProfileCard>

      {/* Documents / Achievements */}
      <ProfileCard title="Credential Library" icon={<AcademicCapIcon className="w-5 h-5" />}>
        <div className="space-y-4">
          {documents && documents.length > 0 ? (
            documents.map((doc, idx) => (
              <div 
                key={doc.id || idx}
                className="p-3 rounded-xl bg-secondary-50 border border-secondary-100 flex items-center gap-3 group cursor-pointer hover:bg-white hover:shadow-soft transition-all"
                onClick={() => {
                  const token = localStorage.getItem('token');
                  window.open(`${import.meta.env.VITE_API_BASE_URL}/employees/documents/${doc.id}/download?view=true${token ? `&token=${token}` : ''}`, '_blank');
                }}
              >
                <div className="p-2 bg-white rounded-lg border border-secondary-100 text-secondary-400 group-hover:text-primary-600 transition-colors">
                  {doc.category === 'Academic' ? <AcademicCapIcon className="w-4 h-4" /> : <ChartBarIcon className="w-4 h-4" />}
                </div>
                <div className="overflow-hidden">
                  <p className="text-[10px] font-bold text-secondary-400 uppercase tracking-widest truncate">{doc.category || 'General'}</p>
                  <p className="text-xs font-bold text-secondary-700 mt-0.5 truncate">{doc.title}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="w-full py-8 flex flex-col items-center justify-center border-2 border-dashed border-secondary-100 rounded-2xl bg-secondary-50/30">
              <AcademicCapIcon className="w-8 h-8 text-secondary-200 mb-2" />
              <p className="text-xs text-secondary-400 font-medium text-center px-4">Registry currently empty. Upload verified credentials via administration.</p>
            </div>
          )}
        </div>
      </ProfileCard>
    </div>
  );
};

export default ProfileInsights;
