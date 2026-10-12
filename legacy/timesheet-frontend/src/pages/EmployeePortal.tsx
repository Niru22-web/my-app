import React from 'react';
import { Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../contexts/PermissionsContext';
import {
  UserIcon,
  CalendarIcon,
  CreditCardIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';

interface NavCategory {
  title: string;
  type: 'link';
  path: string;
  icon: React.ComponentType<React.ComponentProps<'svg'>>;
}

const EmployeePortal: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { themeMode } = useTheme();
  const { user: currentUser } = useAuth();
  const { hasPermission } = usePermissions();
  const isDark = themeMode === 'dark';

  const userRole = currentUser?.role?.toUpperCase() || '';
  const canViewReports = ['ADMIN', 'OWNER', 'HR', 'IT', 'MANAGER', 'PARTNER'].includes(userRole) || hasPermission('reports', 'canView');

  console.log('DEBUG EmployeePortal:', { currentUser, userRole, canViewReports });

  const allCategories: NavCategory[] = [
    {
      title: 'Profile',
      type: 'link',
      path: '/portal/profile',
      icon: UserIcon
    },
    {
      title: 'Leave Management',
      type: 'link',
      path: '/portal/leaves',
      icon: CalendarIcon
    },
    {
      title: 'Reimbursement',
      type: 'link',
      path: '/portal/reimbursements',
      icon: CreditCardIcon
    },
    {
      title: 'Reports',
      type: 'link',
      path: '/portal/reports',
      icon: ChartBarIcon
    }
  ];

  // Hide Reports tab for plain employees
  const categories = allCategories.filter(
    (cat) => cat.path !== '/portal/reports' || canViewReports
  );

  const activeCategoryClass = isDark
    ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-semibold'
    : 'bg-[#1D54A6]/10 text-[#1D54A6] border border-[#1D54A6]/20 font-semibold';

  const inactiveCategoryClass = isDark
    ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white border border-transparent'
    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent';

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* Modern Horizontal Navigation - Sticky & Glassmorphic */}
      <div 
        className={`-mx-4 sm:-mx-6 lg:-mx-10 px-4 sm:px-6 lg:px-10 py-3 border-b transition-all duration-200 ${
          isDark 
            ? 'bg-[#0F172A]/90 border-slate-800/60 text-white shadow-slate-950/20' 
            : 'bg-[#F8FAFC]/90 border-slate-200/40 text-slate-700'
        }`}
      >
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 py-0.5 max-w-full">
          {categories.map((category) => {
            const isActive = location.pathname === category.path || (location.pathname === '/portal' && category.path === '/portal/profile');
            return (
              <button
                key={category.title}
                onClick={() => navigate(category.path)}
                className={`
                  px-4 py-2 text-[13px] rounded-xl transition-all duration-200 whitespace-nowrap cursor-pointer select-none flex items-center gap-2
                  ${isActive ? activeCategoryClass : inactiveCategoryClass}
                `}
              >
                <category.icon className="w-4 h-4" />
                {category.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* Dynamic Sub-Page Content Area */}
        <Outlet />
    </div>
  );
};

export default EmployeePortal;
