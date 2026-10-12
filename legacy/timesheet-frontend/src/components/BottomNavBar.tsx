import React, { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useNotifications } from '../contexts/NotificationContext';
import {
  HomeIcon,
  CalendarIcon,
  ClipboardDocumentListIcon,
  UserCircleIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline';
import {
  HomeIcon as HomeIconSolid,
  CalendarIcon as CalendarIconSolid,
  ClipboardDocumentListIcon as ClipboardDocumentListIconSolid,
  UserCircleIcon as UserCircleIconSolid,
  Squares2X2Icon as Squares2X2IconSolid,
} from '@heroicons/react/24/solid';

interface BottomNavBarProps {
  onMorePress?: () => void;
}

interface Tab {
  name: string;
  path: string;
  icon: React.ComponentType<React.ComponentProps<'svg'>>;
  activeIcon: React.ComponentType<React.ComponentProps<'svg'>>;
  matchPaths: string[];
  badge?: number;
  color: string;
  activeColor: string;
  activeBg: string;
}

const BottomNavBar: React.FC<BottomNavBarProps> = ({ onMorePress }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { themeMode } = useTheme();
  const isDark = themeMode === 'dark';
  const { state: { unreadCount } } = useNotifications();

  const userRole = user?.role?.toLowerCase();

  const dashboardPath = userRole === 'admin' ? '/admin'
    : userRole === 'manager' ? '/manager'
      : userRole === 'partner' ? '/partner'
        : '/employee';

  const tabs: Tab[] = [
    {
      name: 'Home',
      path: dashboardPath,
      icon: HomeIcon,
      activeIcon: HomeIconSolid,
      matchPaths: ['/admin', '/manager', '/partner', '/employee', '/hr'],
      color: 'text-slate-400',
      activeColor: 'text-blue-600',
      activeBg: 'bg-blue-500/10',
    },
    {
      name: 'Timesheet',
      path: '/timesheet',
      icon: CalendarIcon,
      activeIcon: CalendarIconSolid,
      matchPaths: ['/timesheet'],
      color: 'text-slate-400',
      activeColor: 'text-indigo-600',
      activeBg: 'bg-indigo-500/10',
    },
    {
      name: 'Leaves',
      path: '/portal/leaves',
      icon: ClipboardDocumentListIcon,
      activeIcon: ClipboardDocumentListIconSolid,
      matchPaths: ['/portal/leaves', '/leave-management'],
      color: 'text-slate-400',
      activeColor: 'text-emerald-600',
      activeBg: 'bg-emerald-500/10',
    },
    {
      name: 'Profile',
      path: '/portal/profile',
      icon: UserCircleIcon,
      activeIcon: UserCircleIconSolid,
      matchPaths: ['/portal/profile', '/profile'],
      color: 'text-slate-400',
      activeColor: 'text-violet-600',
      activeBg: 'bg-violet-500/10',
    },
    {
      name: 'More',
      path: '#more',
      icon: Squares2X2Icon,
      activeIcon: Squares2X2IconSolid,
      matchPaths: [],
      badge: unreadCount > 0 ? unreadCount : undefined,
      color: 'text-slate-400',
      activeColor: 'text-orange-600',
      activeBg: 'bg-orange-500/10',
    },
  ];

  const isActive = useCallback(
    (matchPaths: string[]) =>
      matchPaths.some(
        (p) => location.pathname === p || location.pathname.startsWith(p + '/')
      ),
    [location.pathname]
  );

  const handleTabPress = (tab: Tab) => {
    if (tab.path === '#more') {
      onMorePress?.();
      return;
    }
    navigate(tab.path);
  };

  return (
    <nav
      className={`
        lg:hidden fixed bottom-0 left-0 right-0 z-[1000]
        transition-colors duration-300 glass-blur-nav pb-safe
        ${isDark
          ? 'bg-[#0F172A]/95 border-t border-white/[0.06]'
          : 'bg-white/95 border-t border-slate-200/80'
        }
      `}
      aria-label="Main navigation"
    >
      <div className="flex items-stretch justify-around px-1 h-[62px]">
        {tabs.map((tab) => {
          const active = isActive(tab.matchPaths);
          const Icon = active ? tab.activeIcon : tab.icon;

          return (
            <button
              key={tab.name}
              type="button"
              aria-current={active ? 'page' : undefined}
              aria-label={tab.name}
              onClick={() => handleTabPress(tab)}
              className={`
                relative flex flex-col items-center justify-center gap-0.5
                flex-1 h-full px-1
                transition-all duration-200
                active:scale-90
                select-none outline-none
                ${active ? tab.activeColor : isDark ? 'text-slate-500' : 'text-slate-400'}
              `}
            >
              {/* Active top indicator pill */}
              {active && (
                <span
                  className={`
                    absolute top-0 left-1/2 -translate-x-1/2
                    w-8 h-[3px] rounded-full nav-pill-indicator
                    ${tab.activeColor.replace('text-', 'bg-')}
                  `}
                />
              )}

              {/* Icon container with active background */}
              <div className={`
                relative flex items-center justify-center
                w-[38px] h-[28px] rounded-xl
                transition-all duration-200
                ${active ? `${tab.activeBg} scale-105` : 'scale-100'}
              `}>
                <Icon className={`w-[22px] h-[22px] transition-transform duration-200 ${active ? 'scale-110' : ''}`} />

                {/* Notification badge */}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="badge-pulse absolute -top-1.5 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center text-[9px] font-black text-white bg-red-500 rounded-full ring-2 ring-white dark:ring-slate-900">
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                )}
              </div>

              {/* Label */}
              <span className={`
                text-[10px] leading-none tracking-tight transition-all duration-200
                ${active ? 'font-extrabold' : 'font-semibold'}
              `}>
                {tab.name}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNavBar;
