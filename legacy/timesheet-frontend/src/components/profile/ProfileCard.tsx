import React from 'react';

interface ProfileCardProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}

const ProfileCard: React.FC<ProfileCardProps> = ({ title, icon, children, className = '', actions }) => {
  return (
    <div className={`bg-white rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-slate-100 overflow-hidden transition-all duration-300 hover:shadow-xl hover:translate-y-[-4px] ${className}`}>
      <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
        <div className="flex items-center gap-3">
          {icon && <div className="text-primary-600 filter drop-shadow-sm">{icon}</div>}
          <h2 className="text-xs font-black text-secondary-900 uppercase tracking-[0.2em]">{title}</h2>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="p-6">
        {children}
      </div>
    </div>
  );
};

export default ProfileCard;
