import React from 'react';
import { Bars3Icon, BellIcon } from '@heroicons/react/24/outline';
import NotificationBell from './ui/NotificationBell';
import { APP_CONFIG } from '../config/appConfig';

interface MobileHeaderProps {
  isSidebarOpen: boolean;
  onMenuToggle: () => void;
}

const MobileHeader: React.FC<MobileHeaderProps> = ({ onMenuToggle }) => {
  return (
    <header className="md:hidden flex items-center justify-between px-4 h-16 bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
          aria-label="Open menu"
        >
          <Bars3Icon className="w-6 h-6" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            {APP_CONFIG.COMPANY_NAME.charAt(0)}
          </div>
          <span className="font-bold text-slate-800 text-sm truncate max-w-[120px]">
            {APP_CONFIG.COMPANY_NAME}
          </span>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <NotificationBell />
      </div>
    </header>
  );
};

export default MobileHeader;
