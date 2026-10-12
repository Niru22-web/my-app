import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { APP_CONFIG } from '../config/appConfig';
import { useNotifications, Notification } from '../contexts/NotificationContext';
import { useTheme } from '../contexts/ThemeContext';
import API from '../api';
import {
  BellIcon,
  MagnifyingGlassIcon,
  UserCircleIcon,
  ArrowRightOnRectangleIcon,
  ChevronDownIcon,
  CheckIcon
} from '@heroicons/react/24/outline';

// UI Components
import Avatar from '../components/ui/Avatar';

interface DashboardHeaderProps {
  title?: string;
  subtitle?: string;
  onMenuToggle?: () => void;
}

interface SearchEmployee {
  id: string | number;
  firstName: string;
  lastName: string;
  profileImage?: string;
  updatedAt?: string;
  designation?: string;
}

interface SearchProject {
  id: string | number;
  name: string;
  client?: {
    name: string;
  };
}

interface SearchJob {
  id: string | number;
  name: string;
  project?: {
    name: string;
  };
}

interface SearchResults {
  employees: SearchEmployee[];
  projects: SearchProject[];
  jobs: SearchJob[];
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({ 
  title = 'Overview'
}) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { themeMode, setThemeMode } = useTheme();
  const isDark = themeMode === 'dark';
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const { state: { notifications, unreadCount }, markAsRead, markAllAsRead } = useNotifications();

  // Handled in combined useEffect below

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} mins ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hrs ago`;
    return `${Math.floor(diff / 86400000)} days ago`;
  };

  const handleNotificationClick = (notif: Notification) => {
    if (!notif.isRead) markAsRead(notif.id);
    setIsNotificationOpen(false);
    if (notif.actionUrl) {
      if (notif.actionUrl.startsWith('/')) {
         navigate(notif.actionUrl);
      } else {
         window.location.href = notif.actionUrl;
      }
    }
  };

  // --- NEW: Global Search State ---
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        performSearch(searchQuery);
      } else {
        setSearchResults(null);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotificationOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const performSearch = async (query: string) => {
    try {
      setIsSearching(true);
      setIsSearchOpen(true);
      const res = await API.get(`/search?q=${encodeURIComponent(query)}`);
      setSearchResults(res.data.data);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const hasResults = searchResults && (
    searchResults.employees.length > 0 || 
    searchResults.projects.length > 0 || 
    searchResults.jobs.length > 0
  );

  return (
    <header className="sticky top-0 z-[1000] select-none transition-all duration-300 bg-[#00419c] dark:bg-[#080F1D] hidden md:block">
      {/* Header is hidden on mobile since FrozenLayout renders a separate mobile header */}
      <div className="px-4 md:px-6 lg:px-8 h-[64px]">
        <div className="flex items-center justify-between h-full">
          
          {/* Left Section - Branding + Search */}
          <div className="flex items-center gap-4 md:gap-6 flex-1">
            {/* Breadcrumb / Title */}
            <div className="hidden md:flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-widest leading-none mb-1 text-blue-300">{APP_CONFIG.COMPANY_NAME}</span>
                <h2 className="text-lg font-bold tracking-tight leading-none text-white">{title}</h2>
            </div>

            {/* Global Search Bar */}
            <div className="hidden md:flex relative group max-w-sm w-full ml-4 flex items-center" ref={searchRef}>
                <MagnifyingGlassIcon className="absolute left-3.5 w-4 h-4 transition-colors group-focus-within:text-white text-slate-400 pointer-events-none" />
                <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => {
                        if (searchQuery.length >= 2) setIsSearchOpen(true);
                    }}
                    placeholder="Search employees, projects..." 
                    className="w-full border-0 rounded-full py-2 pl-10 pr-4 text-sm font-medium outline-none focus:ring-2 focus:ring-white/20 transition-all shadow-sm bg-white/10 placeholder:text-slate-400 text-white hover:bg-white/15 focus:bg-white/20 header-search-input"
                />
                
                {/* Search Results Dropdown */}
                {isSearchOpen && (searchQuery.length >= 2) && (
                    <div className={`absolute left-0 right-0 mt-2 rounded-2xl shadow-2xl border overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50 ${
                        isDark ? 'bg-[#151F32] border-white/5' : 'bg-white border-blue-100'
                    }`}>
                        <div className="max-h-[400px] overflow-y-auto custom-scrollbar p-2">
                            {isSearching ? (
                                <div className="p-8 text-center">
                                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent mx-auto mb-2"></div>
                                    <p className="text-xs text-slate-500 font-medium">Searching...</p>
                                </div>
                            ) : !hasResults ? (
                                <div className="p-8 text-center">
                                    <p className="text-sm font-bold text-slate-400">No matches found</p>
                                    <p className="text-xs text-slate-500 mt-1">Try a different keyword</p>
                                </div>
                            ) : (
                                <div className="space-y-4 p-1">
                                    {/* Employees Section */}
                                    {searchResults!.employees.length > 0 && (
                                        <div>
                                            <h4 className="text-[10px] font-bold uppercase tracking-widest text-blue-500 mb-2 px-2">Employees</h4>
                                            {searchResults!.employees.map(emp => (
                                                <div 
                                                    key={emp.id}
                                                    onClick={() => {
                                                        navigate(`/management/employees/edit/${emp.id}`);
                                                        setIsSearchOpen(false);
                                                        setSearchQuery('');
                                                    }}
                                                    className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-colors ${
                                                        isDark ? 'hover:bg-slate-700' : 'hover:bg-blue-50'
                                                    }`}
                                                >
                                                    <Avatar name={`${emp.firstName} ${emp.lastName}`} size="xs" src={emp.profileImage} updatedAt={emp.updatedAt} />
                                                    <div className="flex-1 min-w-0">
                                                        <p className={`text-xs font-bold truncate ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                                            {emp.firstName} {emp.lastName}
                                                        </p>
                                                        <p className="text-[10px] text-slate-500 truncate">{emp.designation || 'Team Member'}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Projects Section */}
                                    {searchResults!.projects.length > 0 && (
                                        <div>
                                            <h4 className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 mb-2 px-2">Projects</h4>
                                            {searchResults!.projects.map(project => (
                                                <div 
                                                    key={project.id}
                                                    onClick={() => {
                                                        navigate(`/management/projects`);
                                                        setIsSearchOpen(false);
                                                        setSearchQuery('');
                                                    }}
                                                    className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-colors ${
                                                        isDark ? 'hover:bg-slate-700' : 'hover:bg-blue-50'
                                                    }`}
                                                >
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[10px] ${
                                                        isDark ? 'bg-indigo-900/30 text-indigo-400' : 'bg-indigo-50 text-indigo-600'
                                                    }`}>
                                                        PJ
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className={`text-xs font-bold truncate ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                                            {project.name}
                                                        </p>
                                                        <p className="text-[10px] text-slate-500 truncate">{project.client?.name || 'Internal'}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Jobs Section */}
                                    {searchResults!.jobs.length > 0 && (
                                        <div>
                                            <h4 className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-2 px-2">Jobs / Tasks</h4>
                                            {searchResults!.jobs.map(job => (
                                                <div 
                                                    key={job.id}
                                                    onClick={() => {
                                                        navigate(`/management/jobs`);
                                                        setIsSearchOpen(false);
                                                        setSearchQuery('');
                                                    }}
                                                    className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-colors ${
                                                        isDark ? 'hover:bg-slate-700' : 'hover:bg-blue-50'
                                                    }`}
                                                >
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[10px] ${
                                                        isDark ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
                                                    }`}>
                                                        JB
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className={`text-xs font-bold truncate ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                                            {job.name}
                                                        </p>
                                                        <p className="text-[10px] text-slate-500 truncate">{job.project?.name || 'General'}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden lg:flex items-center gap-1 opacity-60">
                    <kbd className="px-1.5 py-0.5 text-[9px] font-bold rounded shadow-sm border text-slate-300 bg-white/10 border-white/10">⌘</kbd>
                    <kbd className="px-1.5 py-0.5 text-[9px] font-bold rounded shadow-sm border text-slate-300 bg-white/10 border-white/10">K</kbd>
                </div>
            </div>
          </div>



          {/* Right Section - User Profile / Notifications */}
          <div className="flex items-center gap-3 md:gap-5">
            
            {/* Notifications Button */}
            <div className="relative" ref={notifRef}>
              <button 
                onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                title="Notifications"
                aria-label="View notifications"
                className={`relative p-2 rounded-full transition-all duration-200 group active:scale-95 ${
                  isNotificationOpen
                    ? 'bg-white/20 text-white'
                    : 'hover:bg-white/10 text-slate-300 hover:text-white'
                }`}
              >
                <BellIcon className={`w-5 h-5 ${
                  isNotificationOpen
                    ? 'text-white'
                    : 'group-hover:text-white'
                }`} />
                {unreadCount > 0 && (
                  <span className={`absolute top-1 right-1 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 animate-pulse ${
                    isDark ? 'border-slate-800' : 'border-white'
                  }`}></span>
                )}
              </button>

              {/* Notifications Dropdown */}
              {isNotificationOpen && (
                  <div className={`absolute right-0 mt-3 w-[calc(100vw-2rem)] sm:w-96 rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] animate-in fade-in zoom-in-95 duration-200 origin-top-right z-50 overflow-hidden flex flex-col max-h-[70vh] border transition-colors max-w-[calc(100vw-1rem)] ${
                    isDark ? 'bg-[#151F32] border-white/5' : 'bg-white border-slate-100'
                  }`}>
                    <div className={`px-4 py-3 border-b flex items-center justify-between sticky top-0 backdrop-blur-sm z-10 ${
                       isDark ? 'border-white/5 bg-[#151F32]/90' : 'border-blue-50 bg-white/90'
                    }`}>
                       <h3 className={`font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Notifications</h3>
                       {unreadCount > 0 && (
                          <button 
                             onClick={() => markAllAsRead()}
                             className={`text-xs font-bold transition-colors flex items-center gap-1 ${
                               isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'
                             }`}
                          >
                             <CheckIcon className="w-3 h-3" /> Mark all read
                          </button>
                       )}
                    </div>

                    <div className={`overflow-y-auto custom-scrollbar flex-1 divide-y ${
                      isDark ? 'divide-slate-700/40' : 'divide-blue-50'
                    }`}>
                       {notifications.length > 0 ? (
                          notifications.slice(0, 10).map((notif) => (
                             <div 
                                key={notif.id}
                                onClick={() => handleNotificationClick(notif)}
                                className={`p-4 transition-colors cursor-pointer relative group ${
                                  !notif.isRead
                                    ? isDark ? 'bg-blue-900/10' : 'bg-blue-50/30'
                                    : ''
                                } ${isDark ? 'hover:bg-slate-700/40' : 'hover:bg-blue-50/50'}`}
                             >
                                {!notif.isRead && (
                                   <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-r shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                                )}
                                <div className="pr-4">
                                   <p className={`text-sm tracking-tight ${
                                     !notif.isRead
                                       ? isDark ? 'font-bold text-slate-100' : 'font-bold text-slate-900'
                                       : isDark ? 'font-medium text-slate-400' : 'font-medium text-slate-600'
                                   }`}>
                                      {notif.message}
                                   </p>
                                   <p className={`text-[10px] font-bold mt-1 uppercase tracking-widest leading-none ${
                                     isDark ? 'text-slate-600' : 'text-slate-400'
                                   }`}>
                                      {formatTimeAgo(notif.createdAt)}
                                   </p>
                                </div>
                             </div>
                          ))
                       ) : (
                          <div className="py-12 px-4 text-center">
                             <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${
                               isDark ? 'bg-slate-700/60' : 'bg-secondary-50'
                             }`}>
                                <BellIcon className={`w-6 h-6 ${isDark ? 'text-slate-500' : 'text-secondary-300'}`} />
                             </div>
                             <p className={`text-sm font-bold ${isDark ? 'text-slate-300' : 'text-secondary-900'}`}>All caught up!</p>
                             <p className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-secondary-500'}`}>Check back later for new notifications.</p>
                          </div>
                       )}
                    </div>
                    {notifications.length > 0 && (
                      <div className={`p-3 border-t ${
                        isDark ? 'border-slate-700/60 bg-slate-800/30' : 'border-secondary-50 bg-secondary-50/30'
                      }`}>
                        <button className={`w-full py-2 text-xs font-bold transition-colors text-center ${
                          isDark ? 'text-slate-400 hover:text-slate-200' : 'text-secondary-600 hover:text-secondary-900'
                        }`}>
                           View All Notifications
                        </button>
                      </div>
                    )}
                 </div>
              )}
            </div>

            {/* User Dropdown */}
            <div className="relative profile-dropdown-container" ref={dropdownRef}>
                <button 
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    title="User Profile"
                    aria-label="Open user menu"
                    className={`
                        flex items-center gap-2 pl-1.5 pr-2 md:pr-3 py-1.5 rounded-full transition-all duration-200 active:scale-[0.98]
                        ${isDropdownOpen
                          ? 'bg-white/20 ring-1 ring-white/30 shadow-sm'
                          : 'bg-white/10 border border-transparent shadow-sm hover:shadow hover:bg-white/15'
                        }
                    `}
                >
                    <div className="ring-2 ring-white rounded-full">
                       <Avatar 
                           name={user?.name || 'User'} 
                           size="sm" 
                           src={user?.profileImage}
                           updatedAt={user?.updatedAt}
                       />
                    </div>
                     <div className="hidden sm:flex flex-col items-start min-w-[70px]">
                         <span className="text-xs font-bold leading-none truncate max-w-[90px] text-left text-white">{user?.name || 'Guest'}</span>
                         <span className="text-[9px] font-bold text-blue-300 uppercase tracking-wider mt-1 leading-none">
                              {user?.role?.toUpperCase() === 'USER' ? 'EMPLOYEE' : (user?.role || 'Member')}
                         </span>
                     </div>
                     <ChevronDownIcon className={`w-3.5 h-3.5 text-blue-300 transition-transform duration-200 ml-0.5 hidden sm:block ${isDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                {isDropdownOpen && (
                    <div className={`absolute right-0 mt-3 w-64 rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] p-2 animate-in fade-in slide-in-from-top-2 duration-200 origin-top-right z-50 overflow-hidden border transition-colors ${
                      isDark ? 'bg-[#151F32] border-white/5' : 'bg-white border-slate-100'
                    }`}>
                        {/* User Info Header */}
                        <div className={`px-3 py-2.5 border-b mb-1 ${
                          isDark ? 'border-slate-700/60' : 'border-blue-50'
                        }`}>
                            <p className={`text-[10px] font-bold uppercase tracking-widest leading-none mb-1.5 ${
                              isDark ? 'text-slate-500' : 'text-slate-400'
                            }`}>Signed in as</p>
                            <p className={`text-xs font-bold truncate ${
                              isDark ? 'text-slate-200' : 'text-slate-800'
                            }`}>{user?.officeEmail || user?.email}</p>
                        </div>
                        
                        {/* Account Settings */}
                        <button 
                            onClick={() => {
                                setIsDropdownOpen(false);
                                navigate('/profile');
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all border border-transparent ${
                              isDark
                                ? 'text-slate-300 hover:bg-slate-700/60 hover:text-blue-400'
                                : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700'
                            }`}
                        >
                            <UserCircleIcon className={`w-[18px] h-[18px] ${
                              isDark ? 'text-slate-500' : 'text-slate-400'
                            }`} />
                            Account Settings
                        </button>

                        {/* Theme Selection (Light / Dark / System) */}
                        <div className={`px-3 py-2 border-t border-b my-1 ${
                          isDark ? 'border-slate-700/60' : 'border-blue-50'
                        }`}>
                          <p className={`text-[9px] font-extrabold uppercase tracking-wider leading-none mb-2 ${
                            isDark ? 'text-slate-500' : 'text-slate-400'
                          }`}>Theme Mode</p>
                          <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-900/60 p-1 rounded-xl">
                            {(['light', 'dark', 'system'] as const).map((mode) => {
                              const active = themeMode === mode;
                              return (
                                <button
                                  key={mode}
                                  onClick={() => setThemeMode(mode)}
                                  className={`py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                    active
                                      ? 'bg-blue-600 text-white shadow-sm'
                                      : isDark
                                        ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                                        : 'text-slate-500 hover:bg-white hover:text-slate-800'
                                  }`}
                                >
                                  {mode}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        
                        <div className={`my-1 ${
                          isDark ? 'border-slate-700/60' : 'border-blue-50'
                        }`} />
                        
                        {/* Sign Out */}
                        <button 
                            onClick={handleLogout}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-red-500 hover:bg-red-500/10 transition-all border border-transparent"
                        >
                            <ArrowRightOnRectangleIcon className="w-[18px] h-[18px]" />
                            Sign Out Securely
                        </button>
                    </div>
                )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default DashboardHeader;
