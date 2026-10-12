import React from 'react';
import { Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import {
  ChartBarIcon,
  DocumentTextIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  BanknotesIcon,
  UserIcon,
  ClipboardDocumentIcon,
  ShieldCheckIcon,
  ChevronDownIcon,
  CurrencyDollarIcon,
  BriefcaseIcon,
  DocumentDuplicateIcon
} from '@heroicons/react/24/outline';

interface SubItem {
  name: string;
  path: string;
  description: string;
  icon: React.ComponentType<React.ComponentProps<'svg'>>;
}

interface NavCategory {
  title: string;
  type: 'link' | 'dropdown';
  path?: string;
  icon?: React.ComponentType<React.ComponentProps<'svg'>>;
  items?: SubItem[];
}

const AccountsPortal: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { themeMode } = useTheme();
  const isDark = themeMode === 'dark';

  const [activeDropdown, setActiveDropdown] = React.useState<number | null>(null);
  const navRef = React.useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const categories: NavCategory[] = [
    {
      title: 'Overview',
      type: 'link',
      path: '/accounts/dashboard',
      icon: ChartBarIcon
    },
    {
      title: 'Sales & Payments',
      type: 'dropdown',
      items: [
        {
          name: 'Invoices',
          path: '/accounts/invoices',
          description: 'Create, review, and track customer invoices',
          icon: DocumentTextIcon
        },
        {
          name: 'Accounts Receivable (AR)',
          path: '/accounts/ar-management',
          description: 'Manage outstanding balances and aging analysis',
          icon: BanknotesIcon
        },
        {
          name: 'Accounts Payable (AP)',
          path: '/accounts/ap-management',
          description: 'Manage supplier bills and procurement schedules',
          icon: CurrencyDollarIcon
        },
        {
          name: 'Receipts',
          path: '/accounts/receipts',
          description: 'Record cash receipts and inbound payments',
          icon: DocumentTextIcon
        },
        {
          name: 'Payments',
          path: '/accounts/payments',
          description: 'Disburse employee salaries and vendor payments',
          icon: CurrencyDollarIcon
        }
      ]
    },
    {
      title: 'Banking',
      type: 'dropdown',
      items: [
        {
          name: 'Bank Import',
          path: '/accounts/bank-import',
          description: 'Upload bank statement files and import data',
          icon: ArrowDownTrayIcon
        },
        {
          name: 'Bank Reconciliation',
          path: '/accounts/bank-reconciliation',
          description: 'Reconcile statements with ledger transactions',
          icon: ArrowPathIcon
        }
      ]
    },
    {
      title: 'Ledgers & Approvals',
      type: 'dropdown',
      items: [
        {
          name: 'Employee Ledger',
          path: '/accounts/employee-ledger',
          description: 'Audit employee claims, payroll, and dues',
          icon: UserIcon
        },
        {
          name: 'Client Ledger',
          path: '/accounts/client-ledger',
          description: 'Track client transactions and billings',
          icon: BriefcaseIcon
        },
        {
          name: 'Currency Management',
          path: '/accounts/currency-management',
          description: 'Manage exchange rates and multi-currency assets',
          icon: CurrencyDollarIcon
        },
        {
          name: 'Approval Queue',
          path: '/accounts/approval-queue',
          description: 'Approve or reject transactions, bills, and payroll',
          icon: ClipboardDocumentIcon
        }
      ]
    },
    {
      title: 'Reports',
      type: 'dropdown',
      items: [
        {
          name: 'GST Reports',
          path: '/accounts/gst-reports',
          description: 'Review GSTR return calculations and summaries',
          icon: DocumentDuplicateIcon
        },
        {
          name: 'Finance Reports',
          path: '/accounts/finance-reports',
          description: 'Analyze Balance Sheet, P&L, and Cash Flow',
          icon: ChartBarIcon
        }
      ]
    },
    {
      title: 'Settings',
      type: 'link',
      path: '/accounts/settings',
      icon: ShieldCheckIcon
    }
  ];

  const isCategoryActive = (category: NavCategory) => {
    if (category.type === 'link' && category.path) {
      return location.pathname === category.path || (location.pathname === '/accounts' && category.path === '/accounts/dashboard');
    }
    if (category.type === 'dropdown' && category.items) {
      return category.items.some(item => location.pathname === item.path);
    }
    return false;
  };

  const activeCategoryClass = isDark
    ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-semibold'
    : 'bg-[#1D54A6]/10 text-[#1D54A6] border border-[#1D54A6]/20 font-semibold';

  const inactiveCategoryClass = isDark
    ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white border border-transparent'
    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent';

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* Self-contained premium slide-down animation */}
      <style>{`
        @keyframes navSlideDown {
          from {
            opacity: 0;
            transform: translateY(-8px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-nav-slide-down {
          animation: navSlideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      {/* Modern Horizontal Navigation - Sticky & Glassmorphic */}
      <div 
        ref={navRef}
        className={`-mx-4 sm:-mx-6 lg:-mx-10 px-4 sm:px-6 lg:px-10 py-3 border-b transition-all duration-200 ${
          isDark 
            ? 'bg-[#0F172A]/90 border-slate-800/60 text-white shadow-slate-950/20' 
            : 'bg-[#F8FAFC]/90 border-slate-200/40 text-slate-700'
        }`}
      >
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 py-0.5 max-w-full">
          {categories.map((category, index) => {
            const isActive = isCategoryActive(category);
            const isDropdownOpen = activeDropdown === index;

            if (category.type === 'link' && category.path) {
              return (
                <button
                  key={category.title}
                  onClick={() => {
                    navigate(category.path!);
                    setActiveDropdown(null);
                  }}
                  className={`
                    px-4 py-2 text-[13px] rounded-xl transition-all duration-200 whitespace-nowrap cursor-pointer select-none flex items-center gap-2
                    ${isActive ? activeCategoryClass : inactiveCategoryClass}
                  `}
                >
                  {category.icon && <category.icon className="w-4 h-4" />}
                  {category.title}
                </button>
              );
            }

            return (
              <div key={category.title} className="relative">
                <button
                  onClick={() => setActiveDropdown(isDropdownOpen ? null : index)}
                  className={`
                    px-4 py-2 text-[13px] rounded-xl transition-all duration-200 whitespace-nowrap cursor-pointer select-none flex items-center gap-1.5
                    ${isActive || isDropdownOpen ? activeCategoryClass : inactiveCategoryClass}
                  `}
                >
                  {category.title}
                  <ChevronDownIcon 
                    className={`w-3.5 h-3.5 opacity-60 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} 
                  />
                </button>

                {/* Dropdown Menu Card */}
                {isDropdownOpen && category.items && (
                  <div 
                    className={`
                      absolute top-full mt-2 w-72 sm:w-80 rounded-2xl shadow-xl border p-2
                      transition-all duration-200 z-[100] origin-top flex flex-col gap-0.5
                      animate-nav-slide-down
                      ${isDark 
                        ? 'bg-[#0f172a]/95 backdrop-blur-md border-slate-800/80 text-white shadow-slate-950/50' 
                        : 'bg-white/95 backdrop-blur-md border-slate-200/60 text-slate-900 shadow-slate-200/50'}
                      left-0 sm:left-auto lg:left-0 lg:-translate-x-0
                    `}
                  >
                    {category.items.map((item) => {
                      const isSubActive = location.pathname === item.path;
                      return (
                        <button
                          key={item.name}
                          onClick={() => {
                            navigate(item.path);
                            setActiveDropdown(null);
                          }}
                          className={`
                            w-full p-2.5 rounded-xl flex items-start gap-3 text-left transition-all duration-150 group/item cursor-pointer
                            ${isSubActive 
                              ? (isDark 
                                  ? 'bg-indigo-600/20 border-l-[3px] border-indigo-400 font-semibold' 
                                  : 'bg-indigo-50 border-l-[3px] border-indigo-600 font-semibold')
                              : (isDark 
                                  ? 'hover:bg-slate-800/60' 
                                  : 'hover:bg-slate-50')}
                          `}
                        >
                          <item.icon className={`w-4.5 h-4.5 flex-shrink-0 mt-0.5 transition-transform group-hover/item:scale-105 ${isSubActive ? 'text-indigo-500' : 'text-slate-400 group-hover/item:text-indigo-500'}`} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-[12px] font-semibold ${isSubActive ? 'text-indigo-500' : 'text-slate-700 dark:text-slate-200'}`}>{item.name}</p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 font-medium leading-normal">{item.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="w-full">
        <Outlet />
      </div>
    </div>
  );
};

export default AccountsPortal;
