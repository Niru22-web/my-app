import React from 'react';
import { 
  UserIcon, 
  EnvelopeIcon, 
  IdentificationIcon, 
  BriefcaseIcon,
  AcademicCapIcon,
  CreditCardIcon,
  BuildingOfficeIcon,
  ShieldCheckIcon,
  MapPinIcon
} from '@heroicons/react/24/outline';
import ProfileCard from './ProfileCard';

interface ProfileDetailsProps {
  details: any;
  loading?: boolean;
}

const ProfileDetails: React.FC<ProfileDetailsProps> = ({ details, loading }) => {
  if (loading || !details) return (
    <div className="space-y-6 flex-1">
      <div className="h-64 bg-secondary-50 animate-pulse rounded-2xl" />
      <div className="h-64 bg-secondary-50 animate-pulse rounded-2xl" />
    </div>
  );

  const profile = details.profile || {};

  const DetailItem = ({ label, value, icon: Icon, colorClass = 'text-blue-500', bgClass = 'bg-blue-50' }: any) => (
    <div className="flex items-start gap-4 p-4 rounded-2xl hover:bg-slate-50 transition-all group border border-transparent hover:border-slate-100">
      <div className={`p-2.5 ${bgClass} rounded-xl shadow-sm group-hover:scale-110 transition-transform ${colorClass}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="overflow-hidden">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.1em] leading-none mb-1.5">{label}</p>
        <p className="text-sm font-extrabold text-secondary-900 truncate tracking-tight">{value || 'Not Available'}</p>
      </div>
    </div>
  );

  return (
    <div className="flex-1 space-y-8 animate-fade-in custom-scrollbar overflow-y-auto px-1 pb-10">
      {/* Personal Information */}
      <ProfileCard title="Identity Registry" icon={<UserIcon className="w-5 h-5" />}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4 md:gap-6">
          <DetailItem label="Full Name" value={`${details.firstName} ${details.lastName}`} icon={UserIcon} colorClass="text-blue-500" bgClass="bg-blue-50" />
          <DetailItem label="Mobile Asset" value={profile.personalMobile} icon={IdentificationIcon} colorClass="text-indigo-500" bgClass="bg-indigo-50" />
          <DetailItem label="Private Mailbox" value={profile.personalEmail} icon={EnvelopeIcon} colorClass="text-purple-500" bgClass="bg-purple-50" />
          <DetailItem label="Gender Marker" value={profile.gender} icon={UserIcon} colorClass="text-emerald-500" bgClass="bg-emerald-50" />
          <DetailItem label="Origin (DOB)" value={profile.dob ? new Date(profile.dob).toLocaleDateString() : ''} icon={EnvelopeIcon} colorClass="text-orange-500" bgClass="bg-orange-50" />
          <DetailItem label="Civil Status" value={profile.maritalStatus} icon={UserIcon} colorClass="text-rose-500" bgClass="bg-rose-50" />
        </div>
      </ProfileCard>

      {/* Employment & Identification */}
      <ProfileCard title="Corporate Authority" icon={<BuildingOfficeIcon className="w-5 h-5" />}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <DetailItem label="Credential ID" value={details.employeeId} icon={IdentificationIcon} colorClass="text-sky-500" bgClass="bg-sky-50" />
          <DetailItem label="Official Status" value={details.designation} icon={BriefcaseIcon} colorClass="text-blue-600" bgClass="bg-blue-50" />
          <DetailItem label="Permission Tier" value={details.role} icon={ShieldCheckIcon} colorClass="text-indigo-600" bgClass="bg-indigo-50" />
          <DetailItem label="Secure Email" value={details.officeEmail} icon={EnvelopeIcon} colorClass="text-violet-600" bgClass="bg-violet-50" />
          <DetailItem label="Tax ID (PAN)" value={profile.pan} icon={CreditCardIcon} colorClass="text-fuchsia-600" bgClass="bg-fuchsia-50" />
          <DetailItem label="State ID (Aadhaar)" value={profile.aadhaar} icon={IdentificationIcon} colorClass="text-pink-600" bgClass="bg-pink-50" />
        </div>
      </ProfileCard>

      {/* Strategic Profile */}
      <ProfileCard title="Resource Valuation" icon={<BriefcaseIcon className="w-5 h-5" />}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <DetailItem label="Net Capital (LPA)" value={profile.salary?.toLocaleString()} icon={CreditCardIcon} colorClass="text-amber-600" bgClass="bg-amber-50" />
          <DetailItem label="Seniority Index" value={profile.seniorityLevel} icon={ShieldCheckIcon} colorClass="text-orange-600" bgClass="bg-orange-50" />
          <DetailItem label="Active Tenure" value={profile.experience} icon={BriefcaseIcon} colorClass="text-emerald-600" bgClass="bg-emerald-50" />
          <DetailItem label="Knowledge Base" value={profile.education} icon={AcademicCapIcon} colorClass="text-teal-600" bgClass="bg-teal-50" />
          <DetailItem label="Contract Modal" value={profile.employmentType} icon={BriefcaseIcon} colorClass="text-cyan-600" bgClass="bg-cyan-50" />
        </div>
      </ProfileCard>

      {/* Geographical Footprint */}
      <ProfileCard title="Geographical Grid" icon={<MapPinIcon className="w-5 h-5" />}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 divide-x divide-slate-100 lg:divide-x">
          <div className="space-y-3 px-2">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"></div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Primary Grid (Current)</p>
            </div>
            <div className="p-5 bg-slate-50/50 rounded-2xl border border-slate-100 font-bold text-sm text-secondary-800 leading-relaxed min-h-[90px] shadow-inner">
              {profile.currentAddress || 'Not Available'}
            </div>
          </div>
          <div className="space-y-3 px-6">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]"></div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Origin Point (Permanent)</p>
            </div>
            <div className="p-5 bg-slate-50/50 rounded-2xl border border-slate-100 font-bold text-sm text-secondary-800 leading-relaxed min-h-[90px] shadow-inner">
              {profile.permanentAddress || 'Not Available'}
            </div>
          </div>
        </div>
      </ProfileCard>
    </div>
  );
};

export default ProfileDetails;
