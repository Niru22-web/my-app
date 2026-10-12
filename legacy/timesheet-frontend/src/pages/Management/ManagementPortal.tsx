import React from 'react';
import { Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import ProtectedRoute from '../../components/ProtectedRoute';

import {
  UserGroupIcon,
  BuildingOfficeIcon,
  BriefcaseIcon,
  ClipboardDocumentIcon
} from '@heroicons/react/24/outline';

interface NavItem {
  name: string;
  path: string;
  icon: React.ComponentType<React.ComponentProps<'svg'>>;
}

const ManagementPortal: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { themeMode } = useTheme();
  const { user } = useAuth();
  const isDark = themeMode === 'dark';

  const userRole = user?.role?.toLowerCase();
  const isEmployee = userRole === 'user' || userRole === 'employee';

  const items: NavItem[] = [
    {
      name: 'Employees',
      path: '/management/employees',
      icon: UserGroupIcon,
      show: true
    },
    {
      name: 'Clients',
      path: '/management/clients',
      icon: BuildingOfficeIcon,
      show: !isEmployee
    },
    {
      name: 'Projects',
      path: '/management/projects',
      icon: BriefcaseIcon,
      show: true
    },
    {
      name: 'Jobs',
      path: '/management/jobs',
      icon: ClipboardDocumentIcon,
      show: true
    }
  ].filter(item => item.show) as NavItem[];

  const isTabActive = (item: NavItem) => {
    // Also cover nesting such as employee edits
    if (item.path === '/management/employees' && location.pathname.startsWith('/management/employees/edit/')) {
      return true;
    }
    return location.pathname === item.path;
  };

  const activeTabClass = isDark
    ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-semibold shadow-sm'
    : 'bg-[#1D54A6]/10 text-[#1D54A6] border border-[#1D54A6]/20 font-semibold shadow-sm';

  const inactiveTabClass = isDark
    ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white border border-transparent'
    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent';

  return (
    <div className="flex flex-col gap-5 w-full h-full min-h-0">
      {/* Modern Horizontal Navigation - Sticky & Glassmorphic */}
      <div 
        className={`-mx-4 sm:-mx-6 lg:-mx-10 px-4 sm:px-6 lg:px-10 py-3 border-b transition-all duration-200 ${
          isDark 
            ? 'bg-[#0F172A]/90 border-slate-800/60 text-white shadow-slate-950/20' 
            : 'bg-[#F8FAFC]/90 border-slate-200/40 text-slate-700'
        }`}
      >
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 py-0.5 max-w-full">
          {items.map((item) => {
            const isActive = isTabActive(item);
            return (
              <button
                key={item.name}
                onClick={() => navigate(item.path)}
                className={`
                  px-4 py-2 text-[13px] rounded-xl transition-all duration-200 whitespace-nowrap cursor-pointer select-none flex items-center gap-2
                  ${isActive ? activeTabClass : inactiveTabClass}
                `}
              >
                <item.icon className="w-4 h-4" />
                {item.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Dynamic Sub-Page Content Area */}
      <div className="w-full flex-1 min-h-0 flex flex-col">
        <Outlet />
      </div>
    </div>
  );
};

export default ManagementPortal;
