import React, { useState, useEffect } from 'react';
import { useNotifications, Notification } from '../contexts/NotificationContext';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import API from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Inbox as InboxIcon,
  Archive,
  Star,
  Pin,
  Clock,
  Search,
  AlertTriangle,
  Info,
  Flame,
  SlidersHorizontal,
  ChevronRight,
  Trash2,
  ShieldAlert,
  Bell,
  Check,
  UserCheck,
  Eye,
  EyeOff,
  User,
  Building,
  CreditCard,
  Laptop,
  ShieldCheck,
  ArrowUpRight,
  ChevronLeft,
  X,
  RefreshCw,
} from 'lucide-react';
import { HelpDeskCustomIcon } from '../components/Sidebar';

const Inbox: React.FC = () => {
  const {
    state,
    fetchNotifications,
    markAsRead,
    markAsUnread,
    markAllAsRead,
    toggleArchive,
    togglePin,
    toggleStar,
    snooze,
    removeNotification,
    bulkDeleteNotifications,
    bulkMarkNotificationsAsRead
  } = useNotifications();

  const toast = useToast();
  const { user } = useAuth();

  // Component States
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedNotificationId, setSelectedNotificationId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterRead, setFilterRead] = useState<string>('all');
  const [showFiltersPopover, setShowFiltersPopover] = useState<boolean>(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [snoozeOpenId, setSnoozeOpenId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  // Bulk selection states & handlers
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleSelectId = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (window.confirm(`Are you sure you want to delete ${selectedIds.length} notification(s)?`)) {
      try {
        await bulkDeleteNotifications(selectedIds);
        toast.success(`${selectedIds.length} notification(s) deleted`);
        setSelectedIds([]);
        setSelectedNotificationId(null);
      } catch (error) {
        toast.error('Failed to delete notifications');
      }
    }
  };

  const handleBulkMarkRead = async () => {
    if (selectedIds.length === 0) return;
    try {
      await bulkMarkNotificationsAsRead(selectedIds);
      toast.success(`${selectedIds.length} notification(s) marked as read`);
      setSelectedIds([]);
    } catch (error) {
      toast.error('Failed to update notifications');
    }
  };

  // Initial Fetch on load (load both archived & regular)
  useEffect(() => {
    fetchNotifications(true); // Fetch all including archived
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Selected Notification details
  const notifications = state.notifications || [];
  const selectedNotification = notifications.find(n => n.id === selectedNotificationId);

  // Auto-select first notification in feed if none selected
  const filteredFeed = notifications.filter(n => {
    // 1. Sidebar Category filter
    if (selectedCategory === 'unread') {
      if (n.isRead || n.isArchived) return false;
    } else if (selectedCategory === 'archived') {
      if (!n.isArchived) return false;
    } else if (selectedCategory === 'starred') {
      if (!n.isStarred || n.isArchived) return false;
    } else if (selectedCategory === 'pinned') {
      if (!n.isPinned || n.isArchived) return false;
    } else if (selectedCategory === 'high-priority') {
      if ((n.priority !== 'High' && n.priority !== 'Critical') || n.isArchived) return false;
    } else if (selectedCategory === 'mentions') {
      const isMention = n.title?.includes('@') || n.message?.includes('@') || n.message?.includes(user?.name || '');
      if (!isMention || n.isArchived) return false;
    } else if (selectedCategory !== 'all') {
      // Module categories: HR, Finance, IT, HelpDesk, Admin, Employee
      const mappedCategory = selectedCategory.replace(' ', '').toLowerCase();
      const notificationModule = (n.module || 'Employee').replace(' ', '').toLowerCase();
      if (notificationModule !== mappedCategory || n.isArchived) return false;
    } else {
      // 'all' category: show everything that is NOT archived
      if (n.isArchived) return false;
    }

    // 2. Search filter
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        n.title?.toLowerCase().includes(q) ||
        n.message?.toLowerCase().includes(q) ||
        n.type?.toLowerCase().includes(q) ||
        n.module?.toLowerCase().includes(q);
      if (!matchSearch) return false;
    }

    // 3. Priority filter
    if (filterPriority !== 'all') {
      if (n.priority !== filterPriority) return false;
    }

    // 4. Read/Unread filter
    if (filterRead !== 'all') {
      const isReadFilter = filterRead === 'read';
      if (n.isRead !== isReadFilter) return false;
    }

    // 5. Snooze filter
    if (n.snoozedUntil) {
      const snoozeTime = new Date(n.snoozedUntil).getTime();
      if (snoozeTime > Date.now()) {
        return false; // Hide if snoozed
      }
    }

    return true;
  });

  // Auto-select first item when feed changes (desktop only)
  useEffect(() => {
    if (filteredFeed.length > 0 && !selectedNotificationId) {
      setSelectedNotificationId(filteredFeed[0].id);
    }
  }, [filteredFeed, selectedNotificationId]);

  // Category counts builder
  const counts = {
    all: notifications.filter(n => !n.isArchived).length,
    unread: notifications.filter(n => !n.isRead && !n.isArchived).length,
    starred: notifications.filter(n => n.isStarred && !n.isArchived).length,
    pinned: notifications.filter(n => n.isPinned && !n.isArchived).length,
    highPriority: notifications.filter(n => (n.priority === 'High' || n.priority === 'Critical') && !n.isArchived).length,
    archived: notifications.filter(n => n.isArchived).length,
    mentions: notifications.filter(n => (n.title?.includes('@') || n.message?.includes('@') || n.message?.includes(user?.name || '')) && !n.isArchived).length,
    hr: notifications.filter(n => n.module === 'HR' && !n.isArchived).length,
    finance: notifications.filter(n => n.module === 'Finance' && !n.isArchived).length,
    it: notifications.filter(n => n.module === 'IT' && !n.isArchived).length,
    helpdesk: notifications.filter(n => n.module === 'HelpDesk' && !n.isArchived).length,
    admin: notifications.filter(n => n.module === 'Admin' && !n.isArchived).length,
    employee: notifications.filter(n => n.module === 'Employee' && !n.isArchived).length,
  };

  const getPriorityStyle = (priority?: string) => {
    switch (priority) {
      case 'Critical':
        return {
          border: 'border-l-4 border-red-500',
          bg: 'bg-red-50 dark:bg-red-950/20',
          text: 'text-red-700 dark:text-red-400',
          label: 'Critical',
          icon: <Flame className="w-3.5 h-3.5 text-red-500" />
        };
      case 'High':
        return {
          border: 'border-l-4 border-orange-500',
          bg: 'bg-orange-50 dark:bg-orange-950/20',
          text: 'text-orange-700 dark:text-orange-400',
          label: 'High',
          icon: <ShieldAlert className="w-3.5 h-3.5 text-orange-500" />
        };
      case 'Warning':
        return {
          border: 'border-l-4 border-amber-500',
          bg: 'bg-amber-50 dark:bg-amber-950/20',
          text: 'text-amber-700 dark:text-amber-400',
          label: 'Warning',
          icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
        };
      default:
        return {
          border: 'border-l-4 border-blue-500',
          bg: 'bg-blue-50 dark:bg-blue-950/20',
          text: 'text-blue-700 dark:text-blue-400',
          label: 'Info',
          icon: <Info className="w-3.5 h-3.5 text-blue-500" />
        };
    }
  };

  const getModuleIcon = (moduleName?: string) => {
    switch (moduleName) {
      case 'HR':
        return <User className="w-4 h-4 text-pink-500" />;
      case 'Finance':
        return <CreditCard className="w-4 h-4 text-emerald-500" />;
      case 'IT':
        return <Laptop className="w-4 h-4 text-violet-500" />;
      case 'HelpDesk':
        return <HelpDeskCustomIcon className="w-4 h-4 text-blue-500" />;
      case 'Admin':
        return <Building className="w-4 h-4 text-amber-500" />;
      default:
        return <UserIcon className="w-4 h-4 text-indigo-500" />;
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const handleApproveEmployee = async (employeeId: string, notificationId: string) => {
    try {
      setApprovingId(employeeId);
      await API.post('/notifications/approve-employee', { employeeId });
      toast.success('Employee approved successfully');
      removeNotification(notificationId);
      setSelectedNotificationId(null);
      await fetchNotifications(true);
    } catch (error) {
      console.error('Error approving employee:', error);
      toast.error('Failed to approve employee');
    } finally {
      setApprovingId(null);
    }
  };

  const UserIcon = ({ className }: { className?: string }) => (
    <div className={`flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 ${className}`}>
      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">UN</span>
    </div>
  );

  /* ── All category + department filter items ── */
  const mainCategories = [
    { id: 'all', label: 'All', icon: InboxIcon, count: counts.all },
    { id: 'unread', label: 'Unread', icon: Bell, count: counts.unread, color: 'text-red-500' },
    { id: 'starred', label: 'Starred', icon: Star, count: counts.starred, color: 'text-yellow-500' },
    { id: 'pinned', label: 'Pinned', icon: Pin, count: counts.pinned, color: 'text-sky-500' },
    { id: 'high-priority', label: 'High', icon: Flame, count: counts.highPriority, color: 'text-orange-500' },
    { id: 'mentions', label: 'Mentions', icon: User, count: counts.mentions },
    { id: 'archived', label: 'Archived', icon: Archive, count: counts.archived },
  ];

  const deptCategories = [
    { id: 'hr', label: 'HR', icon: User, count: counts.hr },
    { id: 'finance', label: 'Finance', icon: CreditCard, count: counts.finance },
    { id: 'it', label: 'IT', icon: Laptop, count: counts.it },
    { id: 'helpdesk', label: 'Help Desk', icon: HelpDeskCustomIcon, count: counts.helpdesk },
    { id: 'admin', label: 'Admin', icon: Building, count: counts.admin },
    { id: 'employee', label: 'Employee', icon: ShieldCheck, count: counts.employee },
  ];

  const allChips = [...mainCategories, ...deptCategories];

  /* ── Mobile: open detail sheet ── */
  const openMobileDetail = (id: string) => {
    setSelectedNotificationId(id);
    setMobileDetailOpen(true);
    if (!notifications.find(n => n.id === id)?.isRead) {
      markAsRead(id);
    }
  };

  /* ── Detail panel content (shared desktop + mobile) ── */
  const DetailContent: React.FC<{ notif: Notification }> = ({ notif }) => {
    const pStyle = getPriorityStyle(notif.priority);
    return (
      <motion.div
        key={notif.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="flex-1 flex flex-col min-h-0"
      >
        {/* Header controls */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-[#0F1C3F]">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Notification details</span>

          <div className="flex items-center gap-1">
            {/* Star */}
            <button
              onClick={() => toggleStar(notif.id, !notif.isStarred)}
              className={`p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${notif.isStarred ? 'text-yellow-500' : 'text-slate-400'}`}
              title={notif.isStarred ? 'Remove star' : 'Star'}
            >
              <Star className={`w-4 h-4 ${notif.isStarred ? 'fill-yellow-500' : ''}`} />
            </button>
            {/* Pin */}
            <button
              onClick={() => togglePin(notif.id, !notif.isPinned)}
              className={`p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${notif.isPinned ? 'text-sky-500' : 'text-slate-400'}`}
              title={notif.isPinned ? 'Unpin' : 'Pin'}
            >
              <Pin className="w-4 h-4" />
            </button>
            {/* Snooze */}
            <div className="relative">
              <button
                onClick={() => setSnoozeOpenId(snoozeOpenId === notif.id ? null : notif.id)}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
                title="Snooze"
              >
                <Clock className="w-4 h-4" />
              </button>
              {snoozeOpenId === notif.id && (
                <div className="absolute right-0 mt-1 w-48 p-2 rounded-lg bg-white dark:bg-[#0F1C3F] border border-slate-200 dark:border-slate-800 shadow-elevated z-50">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest p-1 border-b border-slate-100 dark:border-slate-800/80 mb-1">Snooze until</p>
                  {[
                    { label: '1 Hour', hours: 1 },
                    { label: '4 Hours', hours: 4 },
                    { label: 'Tomorrow', hours: 24 },
                    { label: 'Next Week', hours: 168 }
                  ].map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        const date = new Date(Date.now() + item.hours * 60 * 60 * 1000).toISOString();
                        snooze(notif.id, date);
                        setSnoozeOpenId(null);
                        setSelectedNotificationId(null);
                        setMobileDetailOpen(false);
                        toast.info(`Notification snoozed for ${item.label}`);
                      }}
                      className="w-full text-left text-xs px-2.5 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded font-semibold text-slate-600 dark:text-slate-300 transition-colors"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Archive */}
            <button
              onClick={() => {
                toggleArchive(notif.id, !notif.isArchived);
                setSelectedNotificationId(null);
                setMobileDetailOpen(false);
                toast.success(notif.isArchived ? 'Un-archived' : 'Archived');
              }}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
              title={notif.isArchived ? 'Un-archive' : 'Archive'}
            >
              <Archive className="w-4 h-4" />
            </button>
            {/* Read/Unread */}
            <button
              onClick={() => { notif.isRead ? markAsUnread(notif.id) : markAsRead(notif.id); }}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
              title={notif.isRead ? 'Mark unread' : 'Mark read'}
            >
              {notif.isRead ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 flex-1 bg-white dark:bg-[#0A122C] overflow-y-auto no-scrollbar">
          {/* Module tag */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest">
              {getModuleIcon(notif.module)}{notif.module}
            </span>
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{notif.type}</span>
          </div>

          {/* Title & Timestamp */}
          <div className="space-y-1">
            <h2 className="text-base font-extrabold tracking-tight text-slate-900 dark:text-slate-100">{notif.title}</h2>
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{new Date(notif.createdAt).toLocaleString()}</p>
          </div>

          {/* Message */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            {notif.message}
          </div>

          {/* Priority */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800">
            <span className="text-xs font-semibold text-slate-500">Alert Priority</span>
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[9.5px] font-bold border uppercase tracking-wider ${pStyle.bg} ${pStyle.text} border-transparent`}>
              {pStyle.icon}{pStyle.label}
            </span>
          </div>

          {/* Approval action */}
          {notif.type === 'employee_approval' && notif.relatedId && (
            <div className="p-4 rounded-xl border border-green-200 dark:border-green-950/20 bg-green-50/50 dark:bg-green-950/5 space-y-3">
              <p className="text-xs font-semibold text-green-800 dark:text-green-400">Employee account approval requested.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleApproveEmployee(notif.relatedId!, notif.id)}
                  disabled={approvingId === notif.relatedId}
                  className="flex items-center justify-center gap-1.5 flex-1 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-black rounded-lg transition-colors shadow-sm"
                >
                  {approvingId === notif.relatedId ? (
                    <><div className="animate-spin rounded-full h-3.5 w-3.5 border border-white border-t-transparent" />Approving...</>
                  ) : (
                    <><UserCheck className="w-4 h-4" />Approve employee</>
                  )}
                </button>
                <button
                  onClick={() => { removeNotification(notif.id); setSelectedNotificationId(null); setMobileDetailOpen(false); }}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Action URL */}
          {notif.actionUrl && (
            <button
              onClick={() => { if (notif.actionUrl) window.location.href = notif.actionUrl; }}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black tracking-wide transition-all shadow-md hover:shadow-indigo-500/20"
            >
              <span>Open Linked Module</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Footer quick actions */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B132B] flex items-center justify-between gap-3 sticky bottom-0">
          <button
            onClick={() => {
              removeNotification(notif.id);
              setSelectedNotificationId(null);
              setMobileDetailOpen(false);
              toast.success('Notification cleared');
            }}
            className="flex items-center justify-center gap-1 px-3 py-2 border border-slate-200 dark:border-slate-800 hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-600 text-slate-500 dark:text-slate-400 rounded-lg text-xs font-bold transition-all flex-1"
          >
            <Trash2 className="w-3.5 h-3.5" /><span>Delete</span>
          </button>

          <button
            onClick={() => {
              toggleArchive(notif.id, !notif.isArchived);
              setSelectedNotificationId(null);
              setMobileDetailOpen(false);
              toast.success(notif.isArchived ? 'Un-archived' : 'Archived');
            }}
            className="flex items-center justify-center gap-1 px-3 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-bold transition-all flex-1"
          >
            <Archive className="w-3.5 h-3.5" /><span>{notif.isArchived ? 'Unarchive' : 'Archive'}</span>
          </button>
        </div>
      </motion.div>
    );
  };

  /* ── Notification Feed item (shared) ── */
  const FeedItem: React.FC<{ notification: Notification; onSelect: (id: string) => void }> = ({ notification, onSelect }) => {
    const pStyle = getPriorityStyle(notification.priority);
    const active = selectedNotificationId === notification.id;
    return (
      <motion.div
        layout="position"
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{
          opacity: 0,
          x: -24,
          height: 0,
          paddingTop: 0,
          paddingBottom: 0,
          marginTop: 0,
          marginBottom: 0,
          transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] }
        }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        onClick={() => onSelect(notification.id)}
        className={`flex items-start gap-3 p-4 transition-colors duration-150 cursor-pointer border-l-4 overflow-hidden ${active
            ? 'bg-indigo-50/45 dark:bg-indigo-950/20 border-l-indigo-600'
            : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/20 border-l-transparent'
          } ${!notification.isRead ? 'bg-white font-semibold dark:bg-[#0A122C]/80' : 'opacity-80'}`}
      >
        {/* Bulk select checkbox */}
        <div className="self-stretch flex items-center pr-0.5" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            title="Select notification"
            aria-label="Select notification"
            checked={selectedIds.includes(notification.id)}
            onChange={() => toggleSelectId(notification.id)}
            className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-550 cursor-pointer"
          />
        </div>

        {/* Unread dot */}
        <div className="w-2 flex-shrink-0 flex items-center justify-center self-stretch">
          {!notification.isRead && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 25 }}
              className="w-2 h-2 rounded-full bg-indigo-600 shadow-[0_0_8px_rgba(79,70,229,0.8)]"
            />
          )}
        </div>
        {/* Module icon */}
        <div className="w-9 h-9 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center border border-slate-100 dark:border-slate-700 flex-shrink-0 mt-0.5">
          {getModuleIcon(notification.module)}
        </div>
        {/* Content */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{notification.module || 'Employee'}</span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {notification.isPinned && <Pin className="w-3 h-3 text-sky-500" />}
              {notification.isStarred && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />}
              <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap">{formatTimeAgo(notification.createdAt)}</span>
            </div>
          </div>
          <h4 className={`text-xs tracking-tight truncate ${!notification.isRead ? 'font-bold text-slate-900 dark:text-slate-100' : 'font-medium text-slate-700 dark:text-slate-300'}`}>
            {notification.title}
          </h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">{notification.message}</p>
          <div className="flex items-center gap-2 pt-0.5">
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wider ${pStyle.bg} ${pStyle.text} border-transparent`}>
              {pStyle.icon}{pStyle.label}
            </span>
            {notification.type === 'employee_approval' && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 text-[9px] font-bold uppercase tracking-wider dark:bg-green-950/20 dark:text-green-400 dark:border-transparent">
                <UserCheck className="w-3 h-3" />Approval
              </span>
            )}
          </div>
        </div>
        {/* Mobile chevron */}
        <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 self-center flex-shrink-0 md:hidden" />
      </motion.div>
    );
  };

  return (
    <div className="flex h-full bg-[#F8FAFC] dark:bg-[#0B132B] text-slate-800 dark:text-slate-200 overflow-hidden">

      {/* ═══════════════════════════════════════════════════════
          DESKTOP SIDEBAR (hidden on mobile)
      ═══════════════════════════════════════════════════════ */}
      <div className="hidden md:flex w-[240px] lg:w-[260px] border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F1C3F] flex-col p-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md">
              <InboxIcon className="w-4 h-4" />
            </div>
            <h1 className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">Inbox</h1>
          </div>
          {counts.unread > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-xs font-black">
              {counts.unread} new
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto space-y-6 no-scrollbar pr-1">
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest px-3 mb-2">Filters</p>
            {mainCategories.map(cat => {
              const Icon = cat.icon;
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => { setSelectedCategory(cat.id); setSelectedNotificationId(null); }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs font-semibold transition-all ${active ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${(cat as typeof cat & { color?: string }).color || ''}`} />
                    <span>{cat.label}</span>
                  </div>
                  {cat.count > 0 && (
                    <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold ${active ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                      {cat.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="space-y-1">
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest px-3 mb-2">Departments</p>
            {deptCategories.map(cat => {
              const Icon = cat.icon;
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => { setSelectedCategory(cat.id); setSelectedNotificationId(null); }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs font-semibold transition-all ${active ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 text-slate-400" />
                    <span>{cat.label}</span>
                  </div>
                  {cat.count > 0 && (
                    <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold ${active ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                      {cat.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <span>As {user?.role}</span>
          <button onClick={() => fetchNotifications(true)} className="hover:text-indigo-500 font-bold uppercase tracking-wider flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Sync
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          CENTER PANEL (Feed + Mobile chip row)
      ═══════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col bg-white dark:bg-[#0A122C] border-r border-slate-200 dark:border-slate-800 overflow-hidden relative min-w-0">

        {/* Mobile: horizontal chip row for category selection */}
        <div className="md:hidden px-4 pt-3 pb-2 border-b border-slate-100 dark:border-slate-800/60 bg-white dark:bg-[#0A122C]">
          {/* Header row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-sm">
                <InboxIcon className="w-3.5 h-3.5" />
              </div>
              <span className="font-extrabold text-base tracking-tight bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">Inbox</span>
              {counts.unread > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-[10px] font-black">{counts.unread}</span>
              )}
            </div>
            <button
              onClick={() => fetchNotifications(true)}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-500 transition-colors"
              aria-label="Sync"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          {/* Scrollable chip row */}
          <div className="chip-scroll-row">
            {allChips.map(chip => {
              const Icon = chip.icon;
              const active = selectedCategory === chip.id;
              return (
                <button
                  key={chip.id}
                  onClick={() => { setSelectedCategory(chip.id); setSelectedNotificationId(null); }}
                  className={`
                    flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap
                    ${active
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/30'
                      : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }
                  `}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {chip.label}
                  {chip.count > 0 && (
                    <span className={`text-[9px] font-black px-1 rounded-full ${active ? 'bg-white/25 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                      {chip.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Top toolbar: search + filters (shared desktop/mobile) */}
        <div className="px-4 sm:px-6 py-3 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between bg-white/50 dark:bg-[#0A122C]/50 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Desktop section header */}
            <h2 className="hidden md:block text-sm font-bold text-slate-700 dark:text-slate-200 flex-shrink-0">
              {allChips.find(c => c.id === selectedCategory)?.label ?? 'All'}{' '}
              <span className="text-slate-400 font-normal">({filteredFeed.length})</span>
            </h2>
            {/* Search */}
            <div className="relative flex-1 max-w-xs">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search inbox..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Mark all read */}
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-all border border-slate-200 dark:border-slate-800"
            >
              <Check className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Mark all read</span>
            </button>

            {/* Filter popover */}
            <div className="relative">
              <button
                onClick={() => setShowFiltersPopover(!showFiltersPopover)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border border-slate-200 dark:border-slate-800 ${showFiltersPopover ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400'}`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Filters</span>
              </button>
              {showFiltersPopover && (
                <div className="absolute right-0 mt-2 w-56 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F1C3F] shadow-elevated z-50">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Priority</label>
                      <select
                        title="Priority"
                        value={filterPriority}
                        onChange={(e) => setFilterPriority(e.target.value)}
                        className="w-full p-1.5 border border-slate-200 dark:border-slate-800 rounded bg-slate-50 dark:bg-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="all">All Priorities</option>
                        <option value="Critical">Critical Only</option>
                        <option value="High">High Only</option>
                        <option value="Warning">Warning Only</option>
                        <option value="Info">Info Only</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Read State</label>
                      <select
                        title="Read State"
                        value={filterRead}
                        onChange={(e) => setFilterRead(e.target.value)}
                        className="w-full p-1.5 border border-slate-200 dark:border-slate-800 rounded bg-slate-50 dark:bg-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="all">All Items</option>
                        <option value="unread">Unread Only</option>
                        <option value="read">Read Only</option>
                      </select>
                    </div>
                    <button
                      onClick={() => { setFilterPriority('all'); setFilterRead('all'); setShowFiltersPopover(false); }}
                      className="w-full text-center text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-indigo-500 mt-2"
                    >
                      Reset Filters
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sliding Bulk Action Bar */}
        <AnimatePresence>
          {selectedIds.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="px-4 sm:px-6 py-2.5 bg-indigo-50/70 dark:bg-indigo-950/30 border-b border-indigo-100 dark:border-indigo-900/40 flex items-center justify-between gap-4 text-xs font-semibold overflow-hidden shrink-0"
            >
              <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
                <input
                  type="checkbox"
                  title="Select all notifications"
                  aria-label="Select all notifications"
                  checked={filteredFeed.length > 0 && selectedIds.length === filteredFeed.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds(filteredFeed.map(n => n.id));
                    } else {
                      setSelectedIds([]);
                    }
                  }}
                  className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-750 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span className="font-extrabold">{selectedIds.length} selected</span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleBulkMarkRead}
                  className="px-2.5 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 transition-all font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Mark Read</span>
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-sm transition-all font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
                <button
                  onClick={() => setSelectedIds([])}
                  className="px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-lg transition-all font-bold cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Feed */}
        <div className="flex-1 overflow-y-scroll divide-y divide-slate-100 dark:divide-slate-800/60 app-scrollbar">
          {state.isLoading && filteredFeed.length === 0 ? (
            <div className="p-4 space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex gap-3 p-4 bg-white dark:bg-[#0E1626] rounded-2xl border border-slate-100 dark:border-slate-800/40 shadow-sm">
                  <div className="w-3.5 h-3.5 shimmer-bg rounded self-center" />
                  <div className="w-9 h-9 shimmer-bg rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <div className="flex justify-between">
                      <div className="h-3 shimmer-bg rounded w-16" />
                      <div className="h-3.5 shimmer-bg rounded w-12" />
                    </div>
                    <div className="h-4 shimmer-bg rounded w-48" />
                    <div className="h-3.5 shimmer-bg rounded w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredFeed.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="flex flex-col items-center justify-center py-24 px-6 text-center"
            >
              <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800/40 rounded-full flex items-center justify-center mb-4 text-slate-300 dark:text-slate-600">
                <InboxIcon className="w-8 h-8" />
              </div>
              <h3 className="font-bold text-slate-700 dark:text-slate-300 text-sm">Your inbox is clear</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">No notifications matched this filter.</p>
            </motion.div>
          ) : (
            <AnimatePresence initial={false}>
              {filteredFeed.map(notification => (
                <FeedItem
                  key={notification.id}
                  notification={notification}
                  onSelect={(id) => {
                    // On mobile: open bottom-sheet. On desktop: select in panel.
                    if (window.innerWidth < 768) {
                      openMobileDetail(id);
                    } else {
                      setSelectedNotificationId(id);
                      if (!notifications.find(n => n.id === id)?.isRead) {
                        markAsRead(id);
                      }
                    }
                  }}
                />
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          DESKTOP: Right detail panel
      ═══════════════════════════════════════════════════════ */}
      <div className="hidden md:flex w-[340px] lg:w-[360px] bg-slate-50 dark:bg-[#0B132B] flex-col flex-shrink-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {selectedNotification ? (
            <DetailContent key={selectedNotification.id} notif={selectedNotification} />
          ) : (
            <motion.div
              key="empty-preview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 dark:bg-transparent"
            >
              <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800/40 rounded-full flex items-center justify-center mb-3 text-slate-400">
                <Eye className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-xs text-slate-500 uppercase tracking-widest">Select an item to preview</h4>
              <p className="text-[11px] text-slate-400 mt-1 max-w-[200px]">Click any notification in the feed to read details and take actions.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ═══════════════════════════════════════════════════════
          MOBILE: Full-screen bottom-sheet detail overlay
      ═══════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {mobileDetailOpen && selectedNotification && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[900]"
              onClick={() => setMobileDetailOpen(false)}
            />
            {/* Sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="md:hidden fixed bottom-0 left-0 right-0 z-[901] bg-white dark:bg-[#0F1C3F] rounded-t-[24px] shadow-2xl flex flex-col"
              style={{ maxHeight: '90vh' }}
            >
              {/* Drag handle + back button */}
              <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <button
                  onClick={() => setMobileDetailOpen(false)}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back to inbox
                </button>
                {/* Drag handle */}
                <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-slate-700 mx-auto absolute left-1/2 -translate-x-1/2 top-3" />
                <button
                  onClick={() => setMobileDetailOpen(false)}
                  title="Close panel"
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Detail content (scrollable) */}
              <div className="flex-1 overflow-y-auto min-h-0 no-scrollbar">
                <DetailContent notif={selectedNotification} />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Inbox;
