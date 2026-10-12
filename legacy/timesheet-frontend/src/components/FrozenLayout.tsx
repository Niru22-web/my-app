import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bars3Icon, XMarkIcon, MagnifyingGlassIcon, BellIcon } from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';
import DashboardHeader from './DashboardHeader';
import Sidebar from './Sidebar';
import BottomNavBar from './BottomNavBar';
import Avatar from './ui/Avatar';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import { resolveAssetUrl } from '../utils/assetUtils';

interface FrozenLayoutProps {
  children: React.ReactNode;
}

// Map of route prefix → page title shown in mobile header
const PAGE_TITLES: { prefix: string; label: string }[] = [
  { prefix: '/timesheet',           label: 'Timesheet'       },
  { prefix: '/management/employees',label: 'Employees'       },
  { prefix: '/management/clients',   label: 'Clients'         },
  { prefix: '/management/projects',  label: 'Projects'        },
  { prefix: '/management/jobs',      label: 'Jobs'            },
  { prefix: '/management',           label: 'Management'      },
  { prefix: '/attendance',           label: 'Attendance'      },
  { prefix: '/portal/leaves',        label: 'Leave'           },
  { prefix: '/portal/reimbursements',label: 'Reimbursement'   },
  { prefix: '/portal/profile',       label: 'Profile'         },
  { prefix: '/portal/reports',       label: 'Reports'         },
  { prefix: '/portal',               label: 'My Portal'       },
  { prefix: '/admin/asset-management',label:'Assets'          },
  { prefix: '/admin-portal',         label: 'Administration'  },
  { prefix: '/accounts',             label: 'Finance'         },
  { prefix: '/help-desk',            label: 'Help Desk'       },
  { prefix: '/inbox',                label: 'Inbox'           },
  { prefix: '/calendar',             label: 'Calendar'        },
  { prefix: '/admin',                label: 'Dashboard'       },
  { prefix: '/manager',              label: 'Dashboard'       },
  { prefix: '/partner',              label: 'Dashboard'       },
  { prefix: '/employee',             label: 'Dashboard'       },
  { prefix: '/hr',                   label: 'Dashboard'       },
];

const FrozenLayout: React.FC<FrozenLayoutProps> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);
  const [showSearch, setShowSearch] = React.useState(false);
  const { themeMode } = useTheme();
  const { user } = useAuth();
  const { state: notifState } = useNotifications();
  const location = useLocation();
  const isDark = themeMode === 'dark';

  const pageTitle = React.useMemo(() => {
    const path = location.pathname.toLowerCase();
    const match = PAGE_TITLES.find(t => path.startsWith(t.prefix));
    return match?.label ?? 'Dashboard';
  }, [location.pathname]);

  // Detect mobile screen size
  React.useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024; // Updated breakpoint for better tablet support
      setIsMobile(mobile);
      if (!mobile) {
        setIsSidebarOpen(false); 
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Close sidebar on navigation and clean up stuck loading bars
  React.useEffect(() => {
    setIsSidebarOpen(false);
    // Fail-safe: Clean up and completely remove NProgress if it was left running or stuck
    import('nprogress').then((m) => {
      m.default.done();
      m.default.remove();
    });
  }, [location.pathname]);

  // Detect if current path belongs to one of the main table/list pages
  const isTablePage = React.useMemo(() => {
    const path = location.pathname.toLowerCase();
    
    // Exclude sub-pages like form editing, creation, or hierarchies which require natural scrolling
    if (
      path.includes('/edit') || 
      path.includes('/new') || 
      path.includes('/create') || 
      path.includes('/add') || 
      path.includes('/hierarchy') ||
      path.includes('/organizationhierarchy')
    ) {
      return false;
    }
    
    return (
      path.includes('/employees') ||
      path.includes('/clients') ||
      path.includes('/projects') ||
      path.includes('/jobs') ||
      path.includes('/leave-management') ||
      path.includes('/reimbursement') ||
      path.includes('/email-templates') ||
      path.includes('/inbox')
    );
  }, [location.pathname]);

  return (
    <div className={`h-screen w-screen overflow-hidden flex flex-col lg:flex-row bg-brand-royal dark:bg-[#080F1D]`}>
      
      {/* Search Modal Overlay */}
      {showSearch && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-start justify-center pt-20 px-4">
          <div className={`w-full max-w-lg rounded-2xl shadow-2xl p-4 animate-in fade-in slide-in-from-top-4 duration-300 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center gap-3 border-b pb-3 mb-2">
              <MagnifyingGlassIcon className={`w-5 h-5 ${isDark ? 'text-slate-400' : 'text-slate-400'}`} />
              <input 
                autoFocus
                type="text" 
                placeholder="Search logs, employees, tasks..." 
                className={`flex-1 bg-transparent border-none outline-none text-sm font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
              />
              <button onClick={() => setShowSearch(false)} className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-md">Esc</button>
            </div>
            <div className="py-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Recent Searches</p>
              <div className="space-y-1">
                <div className={`px-3 py-2 rounded-xl text-xs font-medium cursor-pointer ${isDark ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-50 text-slate-600'}`}>Timesheet - April 2024</div>
                <div className={`px-3 py-2 rounded-xl text-xs font-medium cursor-pointer ${isDark ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-50 text-slate-600'}`}>Employee: Rajesh Kumar</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Header - Premium SaaS */}
      <header className={`lg:hidden flex items-center justify-between px-4 h-16 border-b z-[1000] sticky top-0 flex-shrink-0 transition-all duration-300 glass-blur-header ${
        isDark
          ? 'bg-[#0E1626]/95 border-slate-800/50'
          : 'bg-white/95 border-slate-200/70'
      }`}
      >
        {/* Hamburger — animated */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className={`p-2 rounded-xl transition-all duration-200 active:scale-90 ${
            isDark ? 'text-slate-400 hover:bg-slate-700/60 hover:text-slate-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
          }`}
          aria-label="Toggle menu"
        >
          <span className={`block transition-all duration-200 ${isSidebarOpen ? 'rotate-90 opacity-80' : 'rotate-0 opacity-100'}`}>
            {isSidebarOpen ? <XMarkIcon className="w-6 h-6" /> : <Bars3Icon className="w-6 h-6" />}
          </span>
        </button>

        {/* Center — Page Title (replaces branding to show context) */}
        <div className="flex flex-col items-center">
          <span className={`text-[9px] font-bold uppercase tracking-[0.18em] leading-none mb-0.5 ${
            isDark ? 'text-slate-500' : 'text-slate-400'
          }`}>ASA Portal</span>
          <span className={`text-sm font-extrabold tracking-tight leading-none ${
            isDark ? 'text-slate-100' : 'text-slate-800'
          }`}>{pageTitle}</span>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-1.5">
          {/* Search */}
          <button 
            onClick={() => setShowSearch(true)}
            className={`p-2 rounded-xl transition-all active:scale-90 ${
              isDark ? 'text-slate-400 hover:bg-slate-700/60' : 'text-slate-500 hover:bg-slate-100'
            }`}
            aria-label="Search"
          >
            <MagnifyingGlassIcon className="w-5 h-5" />
          </button>

          {/* Notification Bell with badge */}
          <Link
            to="/inbox"
            className={`relative p-2 rounded-xl transition-all active:scale-90 ${
              isDark ? 'text-slate-400 hover:bg-slate-700/60' : 'text-slate-500 hover:bg-slate-100'
            }`}
            aria-label="Inbox"
          >
            <BellIcon className="w-5 h-5" />
            {notifState.unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 border-2 border-white dark:border-slate-900 badge-pulse" />
            )}
          </Link>

          {/* Avatar → Profile */}
          <Link 
            to="/portal/profile"
            className="p-0.5 rounded-full ring-2 ring-transparent hover:ring-blue-400/30 transition-all active:scale-95"
          >
            <Avatar 
                name={user?.name || 'User'} 
                size="sm" 
                src={user?.profile?.profileImage ? resolveAssetUrl(user.profile.profileImage) : undefined}
                className="shadow-sm"
            />
          </Link>
        </div>
      </header>

      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-[3px] z-[1001] lg:hidden transition-all duration-300 animate-in fade-in"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div className={`
        fixed inset-y-0 left-0 z-[1002]
        lg:relative lg:z-[1002] lg:translate-x-0 lg:h-full lg:flex-shrink-0
        ${isSidebarOpen ? 'translate-x-0 shadow-2xl w-[230px] transition-transform duration-300' : !isMobile ? 'translate-x-0 w-16' : '-translate-x-full w-[230px] transition-transform duration-300'}
      `}>
        <Sidebar 
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
      </div>

      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0 bg-brand-royal dark:bg-[#080F1D]">
        {/* Desktop Dynamic Header */}
        <div className="hidden lg:block flex-shrink-0 bg-brand-royal dark:bg-[#080F1D]">
          <DashboardHeader
            onMenuToggle={() => setIsSidebarOpen(!isSidebarOpen)}
          />
        </div>

        {/* Fluid Content Surface */}
        <main className={`frozen-main flex-1 overflow-x-hidden ${isTablePage ? 'overflow-y-hidden flex flex-col' : 'overflow-y-auto'} relative ${
          isDark ? 'bg-[#080F1D]' : 'bg-[#F8FAFC]'
        } lg:rounded-tl-[32px] lg:border-t lg:border-l lg:border-white/5 lg:shadow-[-8px_-8px_20px_rgba(0,0,0,0.15)]`}>
          {/* Gradient Top Fade */}
          <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-primary-500/5 to-transparent pointer-events-none opacity-50" />
          
          <div className={`max-w-full mx-auto w-full relative ${
            isTablePage
              ? 'h-full flex flex-col p-4 lg:p-6 min-h-0'
              : 'p-4 sm:p-6 lg:p-10 pb-[calc(76px+env(safe-area-inset-bottom,8px))] lg:pb-10'
          }`}>
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="w-full h-full flex flex-col"
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* Professional Mobile Nav (Modern SaaS Style) */}
      <BottomNavBar onMorePress={() => setIsSidebarOpen(!isSidebarOpen)} />
    </div>
  );
};

export default FrozenLayout;
