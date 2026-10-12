import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../contexts/PermissionsContext';
import { useNotifications } from '../contexts/NotificationContext';
import {
  Squares2X2Icon,
  ClipboardDocumentCheckIcon,
  CalendarDaysIcon,
  UsersIcon,
  BanknotesIcon,
  ComputerDesktopIcon,
  ClockIcon,
  IdentificationIcon,
  Cog6ToothIcon,
  EnvelopeIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/solid';

// UI Components
import Avatar from '../components/ui/Avatar';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

interface MenuItem {
  name: string;
  icon: React.ComponentType<React.ComponentProps<'svg'>>;
  show: boolean;
  href?: string;
  badge?: number;
  iconClass?: string;
  children?: {
    name: string;
    href: string;
    show: boolean;
  }[];
}

interface MenuGroup {
  title: string;
  items: MenuItem[];
}

export const HelpDeskCustomIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={props.className}
    {...props}
  >
    {/* Headband arch */}
    <path d="M12 2C6.48 2 2 6.48 2 12v3c0 .55.45 1 1 1h2c.55 0 1-.45 1-1v-4c0-.55-.45-1-1-1H4.07c.46-4.17 4.02-7.4 8.33-7.4s7.87 3.23 8.33 7.4H19c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1h2c.55 0 1-.45 1-1v-3c0-5.52-4.48-10-10-10z" />
    {/* Left and Right Ear Cups */}
    <rect x="3" y="10" width="3.5" height="6.5" rx="1.5" />
    <rect x="17.5" y="10" width="3.5" height="6.5" rx="1.5" />
    {/* Microphone arm curving forward */}
    <path d="M19 14.5c0 3.2-2 4.5-5 4.5h-1.5c-.55 0-1-.45-1-1s.45-1 1-1H14c1.8 0 3-1 3-2.5v-1c0-.55.45-1 1-1s1 .45 1 1v1z" />
    {/* Microphone tip */}
    <circle cx="10.5" cy="18" r="1.5" />
  </svg>
);

const Sidebar: React.FC<SidebarProps> = ({
  isOpen = false,
  onClose
}) => {
  const { user, logout } = useAuth();
  const { hasPermission } = usePermissions();
  const { state: notificationState } = useNotifications();
  const unreadNotificationsCount = notificationState.unreadCount;
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);

  // Sync expanded section with active route
  React.useEffect(() => {
    // Left empty or removed expandedSection state since it is not used
  }, [location.pathname]);


  // Detect mobile screen size
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024); // Matches Layout breakpoint
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const userRole = user?.role?.toLowerCase();
  const isAdmin = userRole === 'admin';
  const isHR = userRole === 'hr';
  const isIT = userRole === 'it';

  const accountsRoles = ['accounts', 'accounts_admin', 'accounts_manager', 'accounts_executive', 'finance_approver', 'ar_manager', 'ap_manager', 'accountant'];
  const isAccountsUser = accountsRoles.includes(userRole || '');
  const isEmployee = userRole === 'user' || userRole === 'employee';
  const isAssetPortalRole = ['employee', 'user', 'manager', 'partner', 'accountant'].includes(userRole || '');

  const assetManagementItems = [
    {
      name: isAssetPortalRole ? 'Asset Requests' : 'Asset Management',
      href: '/admin/asset-management/dashboard',
      icon: ComputerDesktopIcon,
      iconClass: 'sidebar-icon-assets',
      show: hasPermission('asset_management', 'canView')
    }
  ];

  // Group navigation items into logical sections
  const menuGroups: MenuGroup[] = [
    {
      title: 'MAIN',
      items: [
        {
          name: 'Dashboard',
          href: (user?.role === 'ACCOUNTS' || isAccountsUser) ? '/employee' : '/dashboard',
          icon: Squares2X2Icon,
          iconClass: 'sidebar-icon-dashboard',
          show: true
        },
        {
          name: 'Inbox',
          href: '/inbox',
          icon: EnvelopeIcon,
          iconClass: 'sidebar-icon-inbox',
          show: hasPermission('inbox', 'canView'),
          badge: unreadNotificationsCount
        },
        {
          name: 'Timesheet',
          href: '/timesheet',
          icon: ClipboardDocumentCheckIcon,
          iconClass: 'sidebar-icon-timesheet',
          show: true
        },
        {
          name: 'Calendar',
          href: '/calendar',
          icon: CalendarDaysIcon,
          iconClass: 'sidebar-icon-calendar',
          show: hasPermission('calendar', 'canView')
        },
        {
          name: 'Compliance',
          href: '/compliance',
          icon: ShieldCheckIcon,
          iconClass: 'sidebar-icon-compliance',
          show: hasPermission('compliance', 'canView')
        }
      ]
    },
    {
      title: 'MANAGEMENT',
      items: [
        {
          name: 'Management',
          href: isEmployee ? '/management/projects' : '/management/employees',
          icon: UsersIcon,
          iconClass: 'sidebar-icon-management',
          show: hasPermission('employees', 'canView') || hasPermission('clients', 'canView') || hasPermission('projects', 'canView') || hasPermission('jobs', 'canView') || isAdmin || isHR || isAccountsUser || isIT
        }
      ]
    },
    {
      title: 'ACCOUNTS & FINANCE',
      items: [
        {
          name: 'Accounts & Finance',
          href: '/accounts/dashboard',
          icon: BanknotesIcon,
          iconClass: 'sidebar-icon-accounts',
          show: hasPermission('accounts', 'canView')
        }
      ]
    },
    {
      title: 'ASSET MANAGEMENT',
      items: assetManagementItems
    },
    {
      title: 'SUPPORT',
      items: [
        {
          name: 'Help Desk',
          href: '/help-desk',
          icon: HelpDeskCustomIcon,
          iconClass: 'sidebar-icon-support',
          show: hasPermission('help_desk', 'canView')
        }
      ]
    },
    {
      title: 'ATTENDANCE',
      items: [
        {
          name: 'Attendance',
          href: '/attendance/dashboard',
          icon: ClockIcon,
          iconClass: 'sidebar-icon-attendance',
          show: true
        }
      ]
    },
    {
      title: 'MY PORTAL',
      items: [
        {
          name: 'My Portal',
          href: '/portal/profile',
          icon: IdentificationIcon,
          iconClass: 'sidebar-icon-portal',
          show: true
        }
      ]
    },
    {
      title: 'ADMINISTRATION',
      items: [
        {
          name: 'Administration',
          href: '/admin-portal/dashboard',
          icon: Cog6ToothIcon,
          iconClass: 'sidebar-icon-admin',
          show: isAdmin || isIT || isHR || hasPermission('admin_panel', 'canView') || hasPermission('employees', 'canView') || hasPermission('email_templates', 'canView')
        }
      ]
    }
  ];

  const filteredGroups = menuGroups
    .map(group => ({
      ...group,
      items: group.items.filter(item => item.show)
    }))
    .filter(group => group.items.length > 0);

  const isExpanded = isMobile ? isOpen : isHovered;

  const isActiveRoute = (path: string) => {
    if (path === '/accounts/dashboard' && location.pathname.startsWith('/accounts/')) {
      return true;
    }
    if (path === '/attendance/dashboard' && location.pathname.startsWith('/attendance')) {
      return true;
    }
    if (path === '/portal/profile' && location.pathname.startsWith('/portal')) {
      return true;
    }
    if (path === '/admin-portal/dashboard' && location.pathname.startsWith('/admin-portal')) {
      return true;
    }
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  // Removed unused functions: isParentActive, isGroupActive

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside
      onMouseEnter={() => !isMobile && setIsHovered(true)}
      onMouseLeave={() => !isMobile && setIsHovered(false)}
      className={`
        h-full flex flex-col select-none
        bg-[#00419c] dark:bg-[#0E1626] text-slate-100 overflow-hidden
        ${!isMobile ? (isExpanded ? 'w-[230px] absolute inset-y-0 left-0 z-[1002] shadow-2xl' : 'w-16 relative z-[1002]') : 'w-full relative z-[1002]'}
      `}
    >
      {/* Sidebar Header */}
      <div className="h-[64px] flex-shrink-0 w-full relative overflow-hidden flex items-center justify-between px-4">
        {isExpanded ? (
          <div
            className="flex flex-col items-start cursor-pointer group transition-all"
            onClick={() => navigate('/')}
          >
            <span className="text-lg font-black leading-none tracking-tight text-blue-300">ASA</span>
            <span className="text-[7.5px] font-bold uppercase tracking-[0.12em] whitespace-nowrap leading-none mt-1 text-slate-300">Ashish Shah &amp; Associates</span>
            <div className="flex items-center gap-1.5 w-full mt-1">
              <div className="h-[1px] w-4 bg-blue-400/50"></div>
              <span className="text-[7px] font-bold uppercase tracking-[0.1em] leading-none whitespace-nowrap text-blue-300">Delivering Value</span>
            </div>
          </div>
        ) : (
          <div className="w-full flex items-center justify-center cursor-pointer" onClick={() => navigate('/')}>
            <span className="text-base font-black tracking-tighter text-blue-300">ASA</span>
          </div>
        )}
      </div>

      {/* Navigation Area */}
      <div className="flex-1 overflow-y-auto no-scrollbar py-2.5">
        {isExpanded ? (
          <nav className="px-2 space-y-1.5">
            {filteredGroups.flatMap(group => group.items).map((item) => {
              const active = isActiveRoute(item.href || '');
              return (
                <button
                  key={item.name}
                  title={item.name}
                  aria-label={item.name}
                  onClick={() => {
                    if (item.href) {
                      navigate(item.href);
                      if (isMobile && onClose) onClose();
                    }
                  }}
                  className={`
                    w-full h-9 px-2.5 rounded-lg flex flex-row items-center gap-2.5 text-left group relative overflow-hidden
                    ${active
                      ? 'bg-blue-500 text-white font-semibold shadow-md dark:bg-primary-500 dark:text-white'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white dark:text-[#CBD5E1] dark:hover:bg-[#1E2C44]/60 dark:hover:text-white'}
                  `}
                >
                  {/* Left edge active indicator */}
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r bg-blue-300 dark:bg-primary-400 shadow-[0_0_8px_rgba(91,95,251,0.6)]" />
                  )}
                  {/* Icon container */}
                  <div className={`w-[22px] h-[22px] rounded-md flex items-center justify-center ${active
                    ? 'bg-white/20 text-white'
                    : 'bg-white/5 dark:bg-[#1E2C44]/40 text-slate-300 group-hover:bg-white/10 group-hover:text-white dark:text-[#CBD5E1] dark:group-hover:text-white'
                    }`}>
                    <item.icon className={`w-[13.5px] h-[13.5px] flex-shrink-0 ${item.iconClass || ''}`} />
                  </div>
                  <span className="text-[12.5px] font-medium truncate leading-none">{item.name}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="ml-auto flex items-center justify-center bg-red-500 text-white text-[9px] font-black rounded-full h-4 min-w-[16px] px-1 ring-1 ring-white/10">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        ) : (
          // Collapsed state: vertical parent parent icons with tooltip & floating submenus
          <nav className="flex flex-col items-center gap-3 px-1.5 py-1">
            {filteredGroups.flatMap(group => group.items).map((item) => {
              const active = isActiveRoute(item.href || '');

              return (
                <div
                  key={item.name}
                  className="group/collapsed-item relative flex justify-center w-full"
                >
                  {/* Primary Icon Button */}
                  <button
                    title={item.name}
                    aria-label={item.name}
                    onClick={() => {
                      if (item.href) {
                        navigate(item.href);
                        if (isMobile && onClose) onClose();
                      }
                    }}
                    className={`
                      w-10 h-10 flex items-center justify-center rounded-xl cursor-pointer relative group/btn
                      ${active
                        ? 'bg-blue-500 text-white shadow-md dark:bg-primary-500 dark:text-white'
                        : 'text-slate-300 hover:bg-white/10 hover:text-white dark:text-[#CBD5E1] dark:hover:bg-[#1E2C44] dark:hover:text-white'}
                    `}
                  >
                    {/* Left edge active indicator */}
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r bg-blue-300 dark:bg-primary-300 shadow-[0_0_8px_rgba(91,95,251,0.6)]" />
                    )}
                    <item.icon className={`w-5 h-5 flex-shrink-0 ${item.iconClass || ''} ${active ? 'dark:text-white' : 'dark:text-[#CBD5E1]'}`} />
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[8.5px] font-black text-white shadow-sm ring-1 ring-white/15">
                        {item.badge}
                      </span>
                    )}
                  </button>

                  {/* 1. On Hover Tooltip showing item name */}
                  <div className="absolute left-14 top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700/50 text-[11px] font-bold text-white tracking-wider shadow-2xl pointer-events-none opacity-0 group-hover/collapsed-item:opacity-100 whitespace-nowrap z-[100]">
                    {item.name}
                  </div>
                </div>
              );
            })}
          </nav>
        )}
      </div>

      {/* Footer Area */}
      <div className="flex-shrink-0 border-t border-white/10 p-2">
        {isExpanded ? (
          <div className="space-y-2">
            {/* Expanded profile card */}
            <div
              onClick={() => {
                navigate('/profile');
                if (isMobile && onClose) onClose();
              }}
              className="flex items-center gap-2 p-1.5 rounded-xl bg-white/5 hover:bg-white/10 dark:bg-[#151F32] dark:hover:bg-[#1E2C44] dark:border dark:border-white/5 transition-all duration-200 cursor-pointer"
            >
              <Avatar
                name={user?.name || 'User'}
                size="sm"
                src={user?.profileImage}
                updatedAt={user?.updatedAt}
                className="w-8 h-8 rounded-lg shadow-inner ring-1 ring-white/20 dark:ring-white/10"
              />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-white truncate leading-none">{user?.name || 'Guest User'}</p>
                <p className="text-[9px] font-bold text-blue-300 truncate uppercase tracking-widest leading-none mt-1">
                  {user?.role?.toUpperCase() === 'USER' ? 'EMPLOYEE' : (user?.role || 'Guest')}
                </p>
              </div>
            </div>

            {/* Logout button */}
            <button
              onClick={handleLogout}
              className="w-full h-8 rounded-lg flex items-center justify-center gap-2 text-[12px] font-semibold text-slate-300 bg-white/5 hover:bg-red-600/80 hover:text-white dark:bg-[#151F32] dark:hover:bg-red-600/80 dark:text-[#CBD5E1] transition-all duration-200 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 16l4-4m0 0l-4 4m0 0H9a2 2 0 00-2 2v6a2 2 0 002 2h6a2 2 0 002-2V8a2 2 0 00-2-2H9a2 2 0 00-2-2z" />
              </svg>
              Sign Out
            </button>
          </div>
        ) : (
          // Collapsed profile card (just standard centered profile image click)
          <div className="flex items-center justify-center w-full py-1">
            <button
              onClick={() => {
                navigate('/profile');
                if (isMobile && onClose) onClose();
              }}
              title="Profile"
              className="w-[38px] h-[38px] flex items-center justify-center rounded-xl overflow-hidden hover:ring-2 hover:ring-blue-400 transition-all cursor-pointer"
            >
              <Avatar
                name={user?.name || 'User'}
                size="sm"
                src={user?.profileImage}
                updatedAt={user?.updatedAt}
                className="w-8 h-8 rounded-lg"
              />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
