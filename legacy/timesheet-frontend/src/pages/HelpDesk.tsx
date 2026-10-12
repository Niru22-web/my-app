import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import API from '../api';
import { resolveAssetUrl } from '../utils/assetUtils';
import HierarchicalDropdown from '../components/ui/HierarchicalDropdown';

// Unified UI Components
import AppModal from '../components/ui/AppModal';
import AppInput from '../components/ui/AppInput';
import AppDropdown from '../components/ui/AppDropdown';
import AppButton from '../components/ui/AppButton';

import {
  Ticket, MessageSquare, Clock, CheckCircle2, Plus, Users,
  RefreshCw, X, Search, History, ChevronDown, SlidersHorizontal,
  Upload, FileText, Download, Eye, Trash2,
  ChevronRight, Filter, ArrowUpDown, Tag,
  Paperclip, Send, AlertTriangle, BarChart3,
  Calendar, ChevronLeft, CheckCheck, RotateCcw, Play,
  Inbox, Check, Bell, UserPlus
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface TicketAttachment {
  id: string; url: string; filename: string; size: number; mimeType: string; createdAt: string;
}
interface TicketHistory {
  action: string; fromStatus?: string; toStatus?: string; fromAssignee?: string;
  toAssignee?: string; remarks?: string; performedAt: string;
  performer?: { firstName: string; lastName: string };
  attachments?: TicketAttachment[];
}
interface TicketItem {
  id: string; ticketId?: string; title: string; description: string;
  status: 'Open' | 'In Progress' | 'Resolved' | 'Returned' | string;
  priority: 'High' | 'Medium' | 'Low' | string;
  category?: string | null; assignedTo?: string | null; assigneeName?: string | null;
  createdById: string; createdAt: string; updatedAt: string;
  attachmentUrl?: string | null; attachments?: TicketAttachment[];
  history: TicketHistory[];
  employee?: { firstName: string; lastName: string; role: string };
  createdBy?: { firstName: string; lastName: string; employeeId?: string; department?: string };
  categoryRel?: { id: number; category_name: string };
  subcategoryRel?: { id: number; category_name: string };
}
interface Employee { id: string; firstName: string; lastName: string; employeeId?: string; department?: string; role?: string; status?: string; profileImage?: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const formatDateTime = (d: string) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const formatFileSize = (b: number) => { if (!b) return '0 B'; const k = 1024; const s = ['B','KB','MB','GB']; const i = Math.floor(Math.log(b)/Math.log(k)); return `${parseFloat((b/Math.pow(k,i)).toFixed(1))} ${s[i]}`; };
const getTicketAge = (createdAt: string) => {
  const d = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  if (d === 0) return 'Today'; if (d === 1) return '1 day'; return `${d} days`;
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  High:   { label:'High',   color:'text-rose-700 dark:text-rose-400',   bg:'bg-rose-50/55 dark:bg-rose-950/20',   border:'border-rose-100 dark:border-rose-900/30',   dot:'bg-rose-500 shadow-rose-500/50' },
  Medium: { label:'Medium', color:'text-amber-700 dark:text-amber-450', bg:'bg-amber-50/55 dark:bg-amber-950/20', border:'border-amber-100 dark:border-amber-900/30', dot:'bg-amber-500 shadow-amber-500/50' },
  Low:    { label:'Low',    color:'text-indigo-700 dark:text-indigo-400',   bg:'bg-indigo-50/55 dark:bg-indigo-950/20',   border:'border-indigo-100 dark:border-indigo-900/30',   dot:'bg-indigo-500 shadow-indigo-500/50' },
};
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; dot: string; icon: React.ReactNode }> = {
  Open:        { label:'Open',        color:'text-blue-700 dark:text-blue-400', bg:'bg-blue-50/55 dark:bg-blue-950/20', border:'border-blue-200 dark:border-blue-900/30', dot:'bg-blue-500 shadow-blue-500/50', icon:<Inbox className="w-3 h-3"/> },
  'In Progress':{ label:'In Progress', color:'text-amber-700 dark:text-amber-400',  bg:'bg-amber-50/55 dark:bg-amber-950/20',  border:'border-amber-200 dark:border-amber-900/30',  dot:'bg-amber-500 shadow-amber-500/50', icon:<Play className="w-3 h-3"/> },
  Resolved:    { label:'Resolved',    color:'text-emerald-700 dark:text-emerald-400', bg:'bg-emerald-50/55 dark:bg-emerald-950/20', border:'border-emerald-200 dark:border-emerald-900/30', dot:'bg-emerald-500 shadow-emerald-500/50', icon:<CheckCircle2 className="w-3 h-3"/> },
  Returned:    { label:'Returned',    color:'text-rose-700 dark:text-rose-400',    bg:'bg-rose-50/55 dark:bg-rose-950/20',    border:'border-rose-200 dark:border-rose-900/30',    dot:'bg-rose-500 shadow-rose-500/50', icon:<RotateCcw className="w-3 h-3"/> },
};

const PriorityBadge: React.FC<{ priority: string }> = ({ priority }) => {
  const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.Low;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wider border shadow-sm select-none ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.Open;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wider border shadow-sm select-none transition-all duration-200 ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} animate-pulse`} />
      <span>{cfg.label}</span>
    </span>
  );
};

// ─── Filter Dropdown Component ───────────────────────────────────────────────
interface FilterDropdownProps {
  label: string;
  icon?: React.ReactNode;
  options: { value: string; label: string; count?: number; dot?: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  showSearch?: boolean;
  searchPlaceholder?: string;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const FilterDropdown: React.FC<FilterDropdownProps> = ({
  label, icon, options, selected, onChange, showSearch = false, searchPlaceholder = "Search...", isOpen, setIsOpen
}) => {
  const [search, setSearch] = useState('');
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  // Compute fixed position from button
  useLayoutEffect(() => {
    if (isOpen && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: r.left, width: Math.max(r.width, 240) });
    }
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        panelRef.current && !panelRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen, setIsOpen]);

  const filteredOptions = options.filter(opt =>
    opt.label.toLowerCase().includes(search.toLowerCase())
  );

  const toggleOption = (val: string) => {
    if (selected.includes(val)) onChange(selected.filter(item => item !== val));
    else onChange([...selected, val]);
  };

  const panel = isOpen ? (
    <AnimatePresence>
      <motion.div
        ref={panelRef}
        key="fd-panel"
        initial={{ opacity: 0, scale: 0.96, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -4 }}
        transition={{ duration: 0.13, ease: 'easeOut' }}
        style={{ position: 'fixed', top: pos.top, left: pos.left, width: 240, zIndex: 99999 }}
        className="bg-white dark:bg-secondary-900 rounded-2xl border border-slate-200 dark:border-secondary-700 shadow-2xl overflow-hidden flex flex-col"
      >
        {showSearch && (
          <div className="p-3 border-b border-slate-100 dark:border-secondary-800 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                autoFocus
                type="text"
                placeholder={searchPlaceholder}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 dark:bg-secondary-800 border border-slate-200 dark:border-secondary-700 rounded-xl text-slate-800 dark:text-white outline-none placeholder:text-slate-400 focus:border-indigo-500 transition-all font-semibold"
              />
            </div>
          </div>
        )}
        <div className="px-3.5 py-2 border-b border-slate-100 dark:border-secondary-800 flex items-center justify-between text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-secondary-400 select-none shrink-0">
          <button type="button" onClick={() => onChange(options.map(o => o.value))} className="hover:text-indigo-600 transition-colors bg-transparent border-none cursor-pointer">Select All</button>
          <button type="button" onClick={() => onChange([])} className="hover:text-rose-600 transition-colors bg-transparent border-none cursor-pointer">Clear</button>
        </div>
        <div className="max-h-52 overflow-y-auto app-scrollbar p-1.5 space-y-0.5">
          {filteredOptions.length === 0 ? (
            <div className="py-6 text-center text-slate-400 text-[10px] font-bold">No items found</div>
          ) : (
            filteredOptions.map(opt => {
              const isChecked = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleOption(opt.value)}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl flex items-center justify-between hover:bg-slate-50 dark:hover:bg-secondary-800 text-slate-700 dark:text-secondary-300 transition-colors text-left border-none bg-transparent cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${isChecked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 dark:border-secondary-700 bg-white dark:bg-secondary-800'}`}>
                      {isChecked && <Check className="w-3 h-3 stroke-[3.5px]" />}
                    </div>
                    {opt.dot && <span className={`w-1.5 h-1.5 rounded-full ${opt.dot}`} />}
                    <span className="truncate">{opt.label}</span>
                  </div>
                  {opt.count !== undefined && (
                    <span className="text-[9px] text-slate-400 font-bold bg-slate-50 dark:bg-secondary-800 px-1.5 py-0.5 rounded-md">{opt.count}</span>
                  )}
                </button>
              );
            })
          )}
        </div>
        <div className="p-2.5 border-t border-slate-100 dark:border-secondary-800 flex items-center justify-between gap-2 shrink-0">
          <button type="button" onClick={() => onChange([])} className="px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors border-none bg-transparent cursor-pointer">Clear</button>
          <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-1.5 text-[9px] font-black uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-all border-none cursor-pointer">Apply</button>
        </div>
      </motion.div>
    </AnimatePresence>
  ) : null;

  return (
    <div className="inline-block text-left">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold border rounded-xl shadow-sm hover:bg-slate-100 dark:hover:bg-secondary-800 transition-all cursor-pointer ${
          selected.length > 0
            ? 'bg-indigo-50/60 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900 text-indigo-600 dark:text-indigo-400'
            : 'bg-white dark:bg-secondary-900 border-slate-200 dark:border-secondary-800 text-slate-600 dark:text-secondary-300'
        }`}
      >
        {icon}
        <span>{label}</span>
        {selected.length > 0 && (
          <span className="inline-flex items-center justify-center bg-indigo-600 text-white text-[9px] font-black w-4 h-4 rounded-full leading-none">
            {selected.length}
          </span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {typeof document !== 'undefined' && createPortal(panel, document.body)}
    </div>
  );
};

// ─── Date Range Filter Component ─────────────────────────────────────────────
interface DateRangeDropdownProps {
  value: string;
  customRange: { start: string; end: string };
  onChange: (val: string, custom?: { start: string; end: string }) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const DateRangeDropdown: React.FC<DateRangeDropdownProps> = ({
  value, customRange, onChange, isOpen, setIsOpen
}) => {
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (isOpen && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: r.left });
    }
  }, [isOpen]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        panelRef.current && !panelRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen, setIsOpen]);

  const getLabel = () => {
    if (value === 'today') return 'Today';
    if (value === 'week') return 'This Week';
    if (value === 'month') return 'This Month';
    if (value === 'custom') {
      if (customRange.start || customRange.end) {
        const s = customRange.start ? formatDate(customRange.start) : '...';
        const e = customRange.end ? formatDate(customRange.end) : '...';
        return `${s}–${e}`;
      }
      return 'Custom Range';
    }
    return 'Any Date';
  };

  const panel = isOpen ? (
    <AnimatePresence>
      <motion.div
        ref={panelRef}
        key="dr-panel"
        initial={{ opacity: 0, scale: 0.96, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -4 }}
        transition={{ duration: 0.13, ease: 'easeOut' }}
        style={{ position: 'fixed', top: pos.top, left: pos.left, width: 240, zIndex: 99999 }}
        className="bg-white dark:bg-secondary-900 rounded-2xl border border-slate-200 dark:border-secondary-700 shadow-2xl p-3 flex flex-col gap-3 overflow-y-auto app-scrollbar"
      >
        <div className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-secondary-400">
          Select Time Range
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { value: 'all', label: 'All Time' },
            { value: 'today', label: 'Today' },
            { value: 'week', label: 'This Week' },
            { value: 'month', label: 'This Month' },
            { value: 'custom', label: 'Custom Range' },
          ].map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value, customRange); if (opt.value !== 'custom') setIsOpen(false); }}
              className={`px-2 py-2 text-[10px] font-extrabold rounded-lg text-center border transition-colors cursor-pointer ${
                value === opt.value
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                  : 'bg-slate-50 dark:bg-secondary-800 border-transparent hover:bg-slate-100 dark:hover:bg-secondary-750 text-slate-600 dark:text-secondary-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {value === 'custom' && (
          <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-secondary-800">
            <div>
              <label className="block text-[8px] font-black text-slate-400 dark:text-secondary-500 uppercase tracking-wider mb-1">Start Date</label>
              <input type="date" title="Start Date" placeholder="YYYY-MM-DD" value={customRange.start} onChange={e => onChange('custom', { ...customRange, start: e.target.value })} className="w-full px-2.5 py-2 text-xs bg-slate-50 dark:bg-secondary-800 border border-slate-200 dark:border-secondary-700 rounded-lg text-slate-800 dark:text-white outline-none focus:border-indigo-500 font-semibold" />
            </div>
            <div>
              <label className="block text-[8px] font-black text-slate-400 dark:text-secondary-500 uppercase tracking-wider mb-1">End Date</label>
              <input type="date" title="End Date" placeholder="YYYY-MM-DD" value={customRange.end} onChange={e => onChange('custom', { ...customRange, end: e.target.value })} className="w-full px-2.5 py-2 text-xs bg-slate-50 dark:bg-secondary-800 border border-slate-200 dark:border-secondary-700 rounded-lg text-slate-800 dark:text-white outline-none focus:border-indigo-500 font-semibold" />
            </div>
            <button type="button" onClick={() => setIsOpen(false)} className="w-full py-2 text-[9px] font-black uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl border-none shadow-sm cursor-pointer">Apply Range</button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  ) : null;

  return (
    <div className="inline-block text-left">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold border rounded-xl shadow-sm hover:bg-slate-100 dark:hover:bg-secondary-800 transition-all cursor-pointer ${
          value !== 'all'
            ? 'bg-indigo-50/60 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900 text-indigo-600 dark:text-indigo-400'
            : 'bg-white dark:bg-secondary-900 border-slate-200 dark:border-secondary-800 text-slate-600 dark:text-secondary-300'
        }`}
      >
        <Calendar className="w-3.5 h-3.5 text-slate-400" />
        <span>Date: {getLabel()}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {typeof document !== 'undefined' && createPortal(panel, document.body)}
    </div>
  );
};
// ─── Agent Search Selector Component ─────────────────────────────────────────
interface AgentSelectDropdownProps {
  agents: Employee[];
  selectedId: string;
  onSelect: (agentId: string) => void;
  loading: boolean;
}

const AgentSelectDropdown: React.FC<AgentSelectDropdownProps> = ({
  agents, selectedId, onSelect, loading
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  const selectedAgent = agents.find(a => a.id === selectedId);
  const filteredAgents = agents.filter(a =>
    `${a.firstName} ${a.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
    (a.department || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 text-xs font-semibold border border-slate-200 dark:border-secondary-700 rounded-xl bg-slate-50 dark:bg-secondary-800 text-slate-800 dark:text-white outline-none flex items-center justify-between shadow-inner hover:bg-slate-100 dark:hover:bg-secondary-750 transition-colors text-left cursor-pointer"
      >
        {selectedAgent ? (
          <div className="flex items-center gap-2.5">
            <div className="w-6.5 h-6.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 overflow-hidden flex items-center justify-center font-bold text-[10px] shrink-0 border border-indigo-200/50">
              {selectedAgent.profileImage ? (
                <img src={resolveAssetUrl(selectedAgent.profileImage)} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                `${selectedAgent.firstName[0]}${selectedAgent.lastName[0]}`.toUpperCase()
              )}
            </div>
            <div>
              <span className="font-bold">{selectedAgent.firstName} {selectedAgent.lastName}</span>
              {selectedAgent.department && (
                <span className="text-[9px] text-slate-400 dark:text-secondary-500 font-extrabold uppercase ml-1.5 bg-slate-200/50 dark:bg-secondary-700 px-1 rounded leading-none">
                  {selectedAgent.department}
                </span>
              )}
            </div>
          </div>
        ) : (
          <span className="text-slate-400 font-medium italic">Select Agent (Unassigned)</span>
        )}
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 5 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 right-0 mt-2 bg-white dark:bg-secondary-900 border border-slate-200 dark:border-secondary-800 shadow-2xl rounded-2xl z-[2005] overflow-hidden flex flex-col max-h-72"
          >
            {/* Search Input */}
            <div className="p-3 border-b border-slate-200 dark:border-secondary-800 bg-slate-50/50 dark:bg-secondary-955/20">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search agents by name or department..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9.5 pr-3 py-2 text-xs bg-white dark:bg-secondary-800 border border-slate-200 dark:border-secondary-700 rounded-xl text-slate-800 dark:text-white outline-none placeholder:text-slate-400 focus:border-indigo-500 font-semibold"
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto app-scrollbar p-1.5 space-y-1">
              {loading ? (
                <div className="py-8 text-center text-xs text-slate-400 font-bold animate-pulse">Loading agents...</div>
              ) : filteredAgents.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 font-bold">No agents available</div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect('');
                      setIsOpen(false);
                    }}
                    className="w-full px-3 py-2 rounded-xl text-left text-xs font-bold hover:bg-slate-50 dark:hover:bg-secondary-800 text-rose-500 transition-colors flex items-center gap-2 border-none bg-transparent cursor-pointer"
                  >
                    <div className="w-6 h-6 rounded-full border border-rose-200/50 bg-rose-50 dark:bg-rose-950/20 flex items-center justify-center font-black text-[10px]">
                      <X className="w-3.5 h-3.5" />
                    </div>
                    <span>Unassigned</span>
                  </button>
                  {filteredAgents.map(agent => {
                    const isSel = agent.id === selectedId;
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => {
                          onSelect(agent.id);
                          setIsOpen(false);
                        }}
                        className={`w-full px-3 py-2.5 rounded-xl text-left text-xs font-semibold transition-colors flex items-center justify-between gap-3 border-none bg-transparent cursor-pointer ${
                          isSel
                            ? 'bg-indigo-50/60 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400'
                            : 'hover:bg-slate-50 dark:hover:bg-secondary-800 text-slate-700 dark:text-secondary-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-6.5 h-6.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 overflow-hidden flex items-center justify-center font-black text-[10px] shrink-0 border border-indigo-200/20">
                            {agent.profileImage ? (
                              <img src={resolveAssetUrl(agent.profileImage)} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                              `${agent.firstName[0]}${agent.lastName[0]}`.toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0 text-left">
                            <p className="font-bold truncate leading-tight">{agent.firstName} {agent.lastName}</p>
                            <p className="text-[9px] text-slate-400 dark:text-secondary-500 font-bold uppercase mt-0.5 leading-none">
                              {agent.department || 'Staff'} · {agent.role || 'Agent'}
                            </p>
                          </div>
                        </div>
                        {agent.status && (
                          <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded leading-none ${
                            agent.status.toLowerCase() === 'active'
                              ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-650 border border-emerald-100/50'
                              : 'bg-slate-100 dark:bg-secondary-800 text-slate-400'
                          }`}>
                            {agent.status}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface RawCategory {
  id: number;
  category_name?: string;
  categoryName?: string;
  description?: string | null;
  is_active?: boolean;
  isActive?: boolean;
  display_order?: number;
  displayOrder?: number;
  children?: RawCategory[];
  subcategories?: RawCategory[];
}

interface NormalizedCategory {
  id: string;
  categoryName: string;
  description?: string;
  isActive: boolean;
  displayOrder: number;
  subcategories: {
    id: string;
    categoryName: string;
    description?: string;
    isActive: boolean;
    displayOrder: number;
  }[];
}

interface CreatedTicketDetails {
  ticketId: string;
  assignedTeam: string;
  slaHours: number;
  title: string;
}

// ─── Main Component ───────────────────────────────────────────────────────────
const HelpDesk: React.FC = () => {
  const { user } = useAuth();
  const { success, error: showError } = useToast();
  const { confirm } = useConfirm();

  // Data state
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [categoriesList, setCategoriesList] = useState<NormalizedCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [employeesLoading, setEmployeesLoading] = useState(false);

  // UI state
  const [showForm, setShowForm] = useState(false);
  const [createdTicketDetails, setCreatedTicketDetails] = useState<CreatedTicketDetails | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);

  // Filters visibility state
  const [showFilters, setShowFilters] = useState(true);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Redesigned Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [priorityFilters, setPriorityFilters] = useState<string[]>([]);
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [assigneeFilters, setAssigneeFilters] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<string>('all'); // 'all', 'today', 'week', 'month', 'custom'
  const [customRange, setCustomRange] = useState<{ start: string; end: string }>({ start: '', end: '' });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  // Sort
  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Comment state
  const [commentText, setCommentText] = useState('');
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [commentLoading, setCommentLoading] = useState(false);

  // Attachments for new ticket
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const commentFileRef = useRef<HTMLInputElement>(null);

  // Form
  const [formData, setFormData] = useState({
    title: '', description: '', priority: 'Medium',
    category: 'IT Support', categoryId: '' as string | null,
    subcategoryId: '' as string | null, assignTo: ''
  });
  const [categoryError, setCategoryError] = useState('');

  // Focus search input on Ctrl+K / Cmd+K
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const userRole = user?.role?.toLowerCase() || '';
  const isSupport = userRole === 'admin' || userRole === 'it' || userRole.includes('it') || userRole.includes('support');

  const pageTitle = isSupport
    ? "Help Desk Dashboard"
    : (userRole === 'manager' || userRole === 'partner')
      ? "Team Support Tickets"
      : "My Support Tickets";

  const pageSubtitle = isSupport
    ? "Manage support requests, assign workflows, and resolve tickets"
    : "Raise support requests, track status, and view ticket history";

  // ── Fetch functions ─────────────────────────────────────────────────────────
  const fetchTickets = useCallback(async () => {
    try { setLoading(true);
      const r = await API.get('/tickets');
      setTickets(r.data?.success ? (r.data.data || []) : (Array.isArray(r.data) ? r.data : []));
    } catch { showError('Failed to fetch tickets'); setTickets([]);
    } finally { setLoading(false); }
  }, [showError]);

  const fetchCategoriesList = useCallback(async () => {
    try { setCategoriesLoading(true);
      const r = await API.get('/helpdesk/categories/tree');
      if (r.data?.success) {
        const normalized = (r.data.data || []).map((cat: RawCategory) => ({
          id: String(cat.id),
          categoryName: cat.category_name || cat.categoryName || '',
          description: cat.description || undefined,
          isActive: cat.is_active ?? cat.isActive ?? true,
          displayOrder: cat.display_order ?? cat.displayOrder ?? 0,
          subcategories: (cat.children || cat.subcategories || []).map((sub: RawCategory) => ({
            id: String(sub.id),
            categoryName: sub.category_name || sub.categoryName || '',
            description: sub.description || undefined,
            isActive: sub.is_active ?? sub.isActive ?? true,
            displayOrder: sub.display_order ?? sub.displayOrder ?? 0,
          }))
        }));
        setCategoriesList(normalized);
      }
    } catch { /* silent */ } finally { setCategoriesLoading(false); }
  }, []);

  const fetchEmployees = useCallback(async () => {
    try {
      setEmployeesLoading(true);
      const r = await API.get('/employees?all=true'); // Fetch all staff for dynamic reassign binding
      setEmployees(r.data?.success ? (r.data.data || []) : (Array.isArray(r.data) ? r.data : []));
    } catch { /* silent */ } finally { setEmployeesLoading(false); }
  }, []);

  useEffect(() => { fetchTickets(); fetchEmployees(); fetchCategoriesList(); }, [fetchTickets, fetchEmployees, fetchCategoriesList]);

  // ── Filtering + Sorting ─────────────────────────────────────────────────────
  const isWithinDateRange = (createdAt: string, range: string) => {
    const ticketDate = new Date(createdAt);
    const now = new Date();
    
    if (range === 'today') {
      return ticketDate.toDateString() === now.toDateString();
    }
    if (range === 'week') {
      const startOfWeek = new Date();
      startOfWeek.setDate(now.getDate() - 7);
      return ticketDate >= startOfWeek;
    }
    if (range === 'month') {
      const startOfMonth = new Date();
      startOfMonth.setDate(now.getDate() - 30);
      return ticketDate >= startOfMonth;
    }
    return true;
  };

  const filtered = tickets.filter(t => {
    if (!isSupport && userRole !== 'manager' && userRole !== 'partner' && t.createdById !== user?.id) return false;
    
    // Status filter (multi-select)
    if (statusFilters.length > 0 && !statusFilters.includes(t.status)) return false;
    
    // Priority filter (multi-select)
    if (priorityFilters.length > 0 && !priorityFilters.includes(t.priority)) return false;
    
    // Category filter (multi-select)
    const tCategory = t.categoryRel?.category_name || t.category || '';
    if (categoryFilters.length > 0 && !categoryFilters.includes(tCategory)) return false;
    
    // Assignee filter (multi-select)
    if (assigneeFilters.length > 0) {
      const assigneeId = t.assignedTo || '';
      if (!assigneeFilters.includes(assigneeId)) return false;
    }
    
    // Date filter
    if (dateFilter !== 'all') {
      if (dateFilter === 'custom') {
        if (customRange.start) {
          const start = new Date(customRange.start);
          start.setHours(0,0,0,0);
          if (new Date(t.createdAt) < start) return false;
        }
        if (customRange.end) {
          const end = new Date(customRange.end);
          end.setHours(23,59,59,999);
          if (new Date(t.createdAt) > end) return false;
        }
      } else {
        if (!isWithinDateRange(t.createdAt, dateFilter)) return false;
      }
    }
    
    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        t.ticketId?.toLowerCase().includes(q) ||
        t.title?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        `${t.createdBy?.firstName} ${t.createdBy?.lastName}`.toLowerCase().includes(q) ||
        t.createdBy?.employeeId?.toLowerCase().includes(q) ||
        t.category?.toLowerCase().includes(q) ||
        t.assigneeName?.toLowerCase().includes(q)
      );
    }
    return true;
  }).sort((a, b) => {
    const rawA = a[sortField as keyof TicketItem];
    const rawB = b[sortField as keyof TicketItem];
    let va: string | number | undefined = undefined;
    let vb: string | number | undefined = undefined;
    
    if (sortField === 'createdAt' || sortField === 'updatedAt') {
      va = rawA ? new Date(rawA as string).getTime() : 0;
      vb = rawB ? new Date(rawB as string).getTime() : 0;
    } else {
      if (typeof rawA === 'string' || typeof rawA === 'number') va = rawA;
      if (typeof rawB === 'string' || typeof rawB === 'number') vb = rawB;
    }
    
    const strA = typeof va === 'string' ? va.toLowerCase() : va;
    const strB = typeof vb === 'string' ? vb.toLowerCase() : vb;
    
    if (strA === undefined || strA === null) return 1;
    if (strB === undefined || strB === null) return -1;
    
    if (typeof strA === 'string' && typeof strB === 'string') {
      if (strA < strB) return sortDir === 'asc' ? -1 : 1;
      if (strA > strB) return sortDir === 'asc' ? 1 : -1;
    } else if (typeof strA === 'number' && typeof strB === 'number') {
      if (strA < strB) return sortDir === 'asc' ? -1 : 1;
      if (strA > strB) return sortDir === 'asc' ? 1 : -1;
    }
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  // Stats
  const showAllStats = isSupport || userRole === 'manager' || userRole === 'partner';
  const stats = {
    total: tickets.filter(t => showAllStats || t.createdById === user?.id).length,
    open: tickets.filter(t => t.status === 'Open' && (showAllStats || t.createdById === user?.id)).length,
    inProgress: tickets.filter(t => t.status === 'In Progress' && (showAllStats || t.createdById === user?.id)).length,
    resolved: tickets.filter(t => t.status === 'Resolved' && (showAllStats || t.createdById === user?.id)).length,
    high: tickets.filter(t => t.priority === 'High' && (showAllStats || t.createdById === user?.id)).length,
  };

  // IT department and role members are reassignable agents
  const reassignableAgents = employees.filter(e => {
    const r = (e.role || '').toLowerCase();
    const d = (e.department || '').toLowerCase();
    return r === 'it' || r.includes('it') || d === 'it' || d.includes('it');
  });

  // ── Actions ──────────────────────────────────────────────────────────────────
  const openDrawer = (ticket: TicketItem) => { setSelectedTicket(ticket); setDrawerOpen(true); };
  const closeDrawer = () => { setDrawerOpen(false); setTimeout(() => setSelectedTicket(null), 300); };

  const updateStatus = async (ticketId: string, status: string) => {
    try {
      await API.patch(`/tickets/${ticketId}`, { status });
      success(`Ticket marked as ${status}`);
      await fetchTickets();
      if (selectedTicket?.id === ticketId) {
        const r = await API.get(`/tickets/${ticketId}`);
        if (r.data?.success) setSelectedTicket(r.data.data);
      }
    } catch { showError('Failed to update status'); }
  };

  const handleDelete = async (ticketId: string) => {
    const confirmed = await confirm({
      title: 'Delete Ticket',
      message: 'Are you sure you want to permanently delete this ticket? This action cannot be undone.',
      isDelete: true
    });
    if (!confirmed) return;
    try {
      await API.delete(`/tickets/${ticketId}`);
      success('Ticket deleted');
      if (selectedTicket?.id === ticketId) closeDrawer();
      fetchTickets();
    } catch { showError('Failed to delete ticket'); }
  };

  const handleEscalate = async (ticketId: string) => {
    const remarks = window.prompt("Enter remarks for supervisor escalation:");
    if (remarks === null) return;
    try {
      // Dispatch an Escalate history action to the backend
      const r = await API.post(`/tickets/${ticketId}/history`, {
        action: 'Escalate',
        remarks: remarks || 'Ticket escalated by agent.'
      });
      if (r.data.success) {
        success('Ticket escalated successfully');
        await fetchTickets();
        const fresh = await API.get(`/tickets/${ticketId}`);
        if (fresh.data?.success) setSelectedTicket(fresh.data.data);
      }
    } catch { showError('Failed to escalate ticket'); }
  };

  const handleAddComment = async () => {
    if (!commentText.trim() && commentFiles.length === 0) return;
    if (!selectedTicket) return;
    try {
      setCommentLoading(true);
      const data = new FormData();
      data.append('remarks', commentText);
      data.append('action', 'Comment');
      commentFiles.forEach(f => data.append('attachments', f));
      const r = await API.post(`/tickets/${selectedTicket.id}/history`, data, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (r.data.success) {
        success('Comment added');
        setCommentText(''); setCommentFiles([]);
        const fresh = await API.get(`/tickets/${selectedTicket.id}`);
        if (fresh.data?.success) setSelectedTicket(fresh.data.data);
        fetchTickets();
      }
    } catch { showError('Failed to add comment'); } finally { setCommentLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.categoryId || !formData.subcategoryId) { setCategoryError('Please select a category and subcategory.'); return; }
    try {
      setLoading(true);
      const data = new FormData();
      data.append('title', formData.title);
      data.append('description', formData.description);
      data.append('priority', formData.priority);
      data.append('category', formData.category);
      data.append('categoryId', formData.categoryId!);
      data.append('subcategoryId', formData.subcategoryId!);
      if (formData.assignTo) data.append('assignedTo', formData.assignTo);
      attachments.forEach(f => data.append('attachments', f));
      const r = await API.post('/tickets', data, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (r.data.success) {
        setCreatedTicketDetails({
          ticketId: r.data.data?.ticketId || r.data.data?.id,
          assignedTeam: r.data.data?.assignedTeam || 'IT Support',
          slaHours: r.data.data?.slaHours || 24,
          title: r.data.data?.title
        });
        setFormData({ title:'', description:'', priority:'Medium', category:'IT Support', categoryId:null, subcategoryId:null, assignTo:'' });
        setCategoryError(''); setAttachments([]); setShowForm(false);
        fetchTickets();
      }
    } catch { showError('Failed to raise ticket'); } finally { setLoading(false); }
  };

  const handleFileDrop = (files: FileList) => {
    const valid: File[] = [];
    for (let i = 0; i < files.length; i++) {
      if (files[i].size > 50 * 1024 * 1024) { showError(`${files[i].name} exceeds 50MB`); continue; }
      valid.push(files[i]);
    }
    setAttachments(p => [...p, ...valid].slice(0, 10));
  };

  const exportTickets = () => {
    const rows = [['Ticket ID','Title','Status','Priority','Category','Raised By','Assigned To','Created','Department']];
    filtered.forEach(t => rows.push([
      t.ticketId || t.id, t.title, t.status, t.priority, t.category || '',
      `${t.createdBy?.firstName} ${t.createdBy?.lastName}`,
      t.assigneeName || 'Unassigned', formatDate(t.createdAt),
      t.createdBy?.department || ''
    ]));
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `helpdesk-tickets-${new Date().toISOString().slice(0,10)}.csv`; a.click();
  };

  // Compile active chips data
  const activeChips: { category: string; label: string; onClear: () => void }[] = [];
  if (statusFilters.length > 0) {
    statusFilters.forEach(val => {
      activeChips.push({ category: 'Status', label: val, onClear: () => setStatusFilters(p => p.filter(x => x !== val)) });
    });
  }
  if (priorityFilters.length > 0) {
    priorityFilters.forEach(val => {
      activeChips.push({ category: 'Priority', label: val, onClear: () => setPriorityFilters(p => p.filter(x => x !== val)) });
    });
  }
  if (categoryFilters.length > 0) {
    categoryFilters.forEach(val => {
      activeChips.push({ category: 'Category', label: val, onClear: () => setCategoryFilters(p => p.filter(x => x !== val)) });
    });
  }
  if (assigneeFilters.length > 0) {
    assigneeFilters.forEach(val => {
      const emp = employees.find(e => e.id === val);
      const ticketMatch = tickets.find(t => t.assignedTo === val);
      const name = emp ? `${emp.firstName} ${emp.lastName}` : (ticketMatch?.assigneeName || val);
      activeChips.push({ category: 'Assignee', label: name, onClear: () => setAssigneeFilters(p => p.filter(x => x !== val)) });
    });
  }
  if (dateFilter !== 'all') {
    const l = dateFilter === 'today' ? 'Today' : dateFilter === 'week' ? 'This Week' : dateFilter === 'month' ? 'This Month' : `${customRange.start || '...'} to ${customRange.end || '...'}`;
    activeChips.push({ category: 'Date', label: l, onClear: () => setDateFilter('all') });
  }

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 pb-12">
      {/* ── HEADER ── */}
      <div className="mx-6 mt-6 bg-white/75 dark:bg-secondary-900/75 backdrop-blur-md border border-slate-200 dark:border-secondary-800/80 px-6 py-4 rounded-2xl shadow-md sticky top-6 z-30 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/25 transform transition-transform hover:rotate-6 duration-250 select-none shrink-0">
            <Ticket className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-slate-900 dark:text-white leading-tight tracking-tight">
                {pageTitle}
              </h1>
              <span className="bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100/50 dark:border-indigo-900/30 text-[10px] font-black px-2 py-0.5 rounded-full select-none animate-pulse">
                {filtered.length} Live
              </span>
            </div>
            <p className="text-slate-500 dark:text-secondary-400 text-xs font-semibold mt-0.5">
              {pageSubtitle}
            </p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Search */}
          <div className="relative w-full sm:w-60 lg:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search tickets..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9.5 pr-14 py-2.5 text-xs font-semibold bg-slate-50 dark:bg-secondary-800 border border-slate-200 dark:border-secondary-700 rounded-xl text-slate-800 dark:text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-550 transition-all font-semibold shadow-inner"
            />
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[8.5px] font-extrabold bg-slate-200 dark:bg-secondary-705 text-slate-500 dark:text-secondary-400 rounded border border-slate-300 dark:border-secondary-600 pointer-events-none select-none">
              Ctrl K
            </kbd>
          </div>

          <button
            onClick={() => setShowFilters(p => !p)}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-extrabold uppercase tracking-wider border rounded-xl transition-all active:scale-[0.98] cursor-pointer shadow-sm ${
              showFilters
                ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900 text-indigo-600 dark:text-indigo-400'
                : 'text-slate-600 dark:text-secondary-300 bg-white dark:bg-secondary-805 border-slate-200 dark:border-secondary-750 hover:bg-slate-50 dark:hover:bg-secondary-750'
            }`}
          >
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span>Filters</span>
          </button>

          <button
            title="Notifications list"
            className="p-2.5 text-slate-500 dark:text-secondary-400 bg-white dark:bg-secondary-805 border border-slate-200/50 dark:border-secondary-750 rounded-xl hover:bg-slate-50 dark:hover:bg-secondary-750 transition-all active:scale-[0.98] cursor-pointer shadow-sm relative"
          >
            <Bell className="w-3.5 h-3.5" />
            <span className="absolute right-2.5 top-2.5 w-1.5 h-1.5 rounded-full bg-indigo-550 animate-ping" />
          </button>

          <button
            onClick={exportTickets}
            className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-secondary-300 bg-white dark:bg-secondary-805 border border-slate-200 dark:border-secondary-750 rounded-xl hover:bg-slate-50 dark:hover:bg-secondary-750 transition-all active:scale-[0.98] cursor-pointer shadow-sm"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" /> Export
          </button>
          
          <button
            onClick={fetchTickets}
            disabled={loading}
            title="Refresh tickets"
            className="p-2.5 text-slate-500 dark:text-secondary-400 bg-white dark:bg-secondary-805 border border-slate-200/50 dark:border-secondary-750 rounded-xl hover:bg-slate-50 dark:hover:bg-secondary-750 transition-all active:scale-[0.98] cursor-pointer shadow-sm shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-4.5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:shadow-lg hover:shadow-indigo-500/20 active:scale-[0.98] rounded-xl transition-all hover:-translate-y-[1px] cursor-pointer border-none relative overflow-hidden group shadow-md"
          >
            <Plus className="w-3.5 h-3.5 transition-transform group-hover:rotate-90 duration-200" />
            <span>Raise Ticket</span>
          </button>
        </div>
      </div>

      <div className="px-6 py-4 space-y-4 max-w-[1600px] mx-auto">
        {/* ── FILTER TOOLBAR ── */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="relative z-30"
            >
              <div className="bg-white/90 dark:bg-secondary-900/90 backdrop-blur-lg border border-slate-200/60 dark:border-secondary-800 px-5 py-3 rounded-2xl shadow-sm flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
                  <span className="text-[9px] font-black text-slate-400 dark:text-secondary-500 uppercase tracking-wider mr-1 select-none flex items-center gap-1">
                    <SlidersHorizontal className="w-3 h-3 text-indigo-500" /> Filters:
                  </span>
                  
                  <FilterDropdown
                    label="Status"
                    icon={<Inbox className="w-3.5 h-3.5 text-slate-400" />}
                    options={[
                      { value: 'Open', label: 'Open', dot: 'bg-blue-500' },
                      { value: 'In Progress', label: 'In Progress', dot: 'bg-amber-500' },
                      { value: 'Resolved', label: 'Resolved', dot: 'bg-emerald-500' },
                      { value: 'Returned', label: 'Returned', dot: 'bg-rose-500' }
                    ]}
                    selected={statusFilters}
                    onChange={setStatusFilters}
                    isOpen={activeDropdown === 'status'}
                    setIsOpen={(open) => setActiveDropdown(open ? 'status' : null)}
                  />

                  <FilterDropdown
                    label="Priority"
                    icon={<AlertTriangle className="w-3.5 h-3.5 text-slate-400" />}
                    options={[
                      { value: 'High', label: 'High', dot: 'bg-rose-500' },
                      { value: 'Medium', label: 'Medium', dot: 'bg-amber-500' },
                      { value: 'Low', label: 'Low', dot: 'bg-indigo-500' }
                    ]}
                    selected={priorityFilters}
                    onChange={setPriorityFilters}
                    isOpen={activeDropdown === 'priority'}
                    setIsOpen={(open) => setActiveDropdown(open ? 'priority' : null)}
                  />

                  <FilterDropdown
                    label="Category"
                    icon={<Tag className="w-3.5 h-3.5 text-slate-400" />}
                    options={categoriesList.map(c => ({ value: c.categoryName, label: c.categoryName }))}
                    selected={categoryFilters}
                    onChange={setCategoryFilters}
                    showSearch
                    searchPlaceholder="Search categories..."
                    isOpen={activeDropdown === 'category'}
                    setIsOpen={(open) => setActiveDropdown(open ? 'category' : null)}
                  />

                  {isSupport && (() => {
                    const assigneeFilterOptionsMap = new Map<string, string>();
                    
                    // 1. Add IT role/department members
                    employees.forEach(e => {
                      const r = (e.role || '').toLowerCase();
                      const d = (e.department || '').toLowerCase();
                      if (r === 'it' || r.includes('it') || d === 'it' || d.includes('it')) {
                        assigneeFilterOptionsMap.set(e.id, `${e.firstName} ${e.lastName}`);
                      }
                    });

                    // 2. Add anyone currently assigned to a ticket
                    tickets.forEach(t => {
                      if (t.assignedTo && t.assigneeName) {
                        assigneeFilterOptionsMap.set(t.assignedTo, t.assigneeName);
                      }
                    });

                    const assigneeFilterOptions = Array.from(assigneeFilterOptionsMap.entries()).map(([id, name]) => ({
                      value: id,
                      label: name
                    }));

                    return (
                      <FilterDropdown
                        label="Assignee"
                        icon={<Users className="w-3.5 h-3.5 text-slate-400" />}
                        options={assigneeFilterOptions}
                        selected={assigneeFilters}
                        onChange={setAssigneeFilters}
                        showSearch
                        searchPlaceholder="Search agents..."
                        isOpen={activeDropdown === 'assignee'}
                        setIsOpen={(open) => setActiveDropdown(open ? 'assignee' : null)}
                      />
                    );
                  })()}

                  <DateRangeDropdown
                    value={dateFilter}
                    customRange={customRange}
                    onChange={(val, custom) => {
                      setDateFilter(val);
                      if (custom) setCustomRange(custom);
                    }}
                    isOpen={activeDropdown === 'date'}
                    setIsOpen={(open) => setActiveDropdown(open ? 'date' : null)}
                  />
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {activeChips.length > 0 && (
                    <button
                      onClick={() => {
                        setStatusFilters([]);
                        setPriorityFilters([]);
                        setCategoryFilters([]);
                        setAssigneeFilters([]);
                        setDateFilter('all');
                        setSearchQuery('');
                        setCurrentPage(1);
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-extrabold uppercase tracking-wider text-rose-600 hover:text-rose-700 bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100/50 dark:hover:bg-rose-900/30 rounded-xl transition-all cursor-pointer border-none"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset</span>
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>


        {/* Active Chips List */}
        {activeChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-2">
            <span className="text-[10px] font-black text-slate-400 dark:text-secondary-500 uppercase tracking-wider mr-1 select-none">
              Active Parameters:
            </span>
            {activeChips.map((chip, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/40 dark:border-indigo-900 text-indigo-700 dark:text-indigo-400 px-2.5 py-1 rounded-lg text-[10px] font-bold shadow-sm"
              >
                <span className="text-slate-400 dark:text-secondary-500 font-medium">{chip.category}:</span>
                <span>{chip.label}</span>
                <button
                  type="button"
                  title="Clear filter"
                  onClick={chip.onClear}
                  className="hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-md p-0.5 transition-colors border-none bg-transparent cursor-pointer flex items-center justify-center text-indigo-400 hover:text-indigo-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <button
              onClick={() => {
                setStatusFilters([]);
                setPriorityFilters([]);
                setCategoryFilters([]);
                setAssigneeFilters([]);
                setDateFilter('all');
                setSearchQuery('');
                setCurrentPage(1);
              }}
              className="text-[10px] font-black text-rose-500 hover:text-rose-600 bg-transparent border-none cursor-pointer hover:underline transition-all"
            >
              Clear All
            </button>
          </div>
        )}

        {/* ── STATS CARDS ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            {
              label: 'Total Tickets',
              val: stats.total,
              icon: <BarChart3 className="w-5 h-5" />,
              color: 'from-indigo-500 to-indigo-650',
              borderColor: 'border-indigo-100 dark:border-indigo-900/30',
              iconBg: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400',
              pct: stats.total > 0 ? 100 : 0,
              click: () => { setStatusFilters([]); setPriorityFilters([]); setCategoryFilters([]); setAssigneeFilters([]); setDateFilter('all'); setCurrentPage(1); }
            },
            {
              label: isSupport ? 'Open Queue' : 'Open Tickets',
              val: stats.open,
              icon: <Inbox className="w-5 h-5" />,
              color: 'from-blue-500 to-indigo-550',
              borderColor: 'border-blue-100 dark:border-blue-900/30',
              iconBg: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400',
              pct: stats.total > 0 ? Math.round((stats.open / stats.total) * 100) : 0,
              click: () => { setStatusFilters(['Open']); setPriorityFilters([]); setCategoryFilters([]); setAssigneeFilters([]); setDateFilter('all'); setCurrentPage(1); }
            },
            {
              label: 'In Progress',
              val: stats.inProgress,
              icon: <Play className="w-5 h-5" />,
              color: 'from-amber-500 to-orange-500',
              borderColor: 'border-amber-100 dark:border-amber-900/30',
              iconBg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400',
              pct: stats.total > 0 ? Math.round((stats.inProgress / stats.total) * 100) : 0,
              click: () => { setStatusFilters(['In Progress']); setPriorityFilters([]); setCategoryFilters([]); setAssigneeFilters([]); setDateFilter('all'); setCurrentPage(1); }
            },
            {
              label: isSupport ? 'Resolved Tasks' : 'Resolved Tickets',
              val: stats.resolved,
              icon: <CheckCircle2 className="w-5 h-5" />,
              color: 'from-emerald-500 to-teal-500',
              borderColor: 'border-emerald-100 dark:border-emerald-900/30',
              iconBg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-650 dark:text-emerald-400',
              pct: stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0,
              click: () => { setStatusFilters(['Resolved']); setPriorityFilters([]); setCategoryFilters([]); setAssigneeFilters([]); setDateFilter('all'); setCurrentPage(1); }
            },
            {
              label: 'High Priority',
              val: stats.high,
              icon: <AlertTriangle className="w-5 h-5 animate-pulse" />,
              color: 'from-rose-500 to-pink-500',
              borderColor: 'border-rose-200 dark:border-rose-900/30',
              iconBg: 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400',
              pct: stats.total > 0 ? Math.round((stats.high / stats.total) * 100) : 0,
              click: () => { setPriorityFilters(['High']); setStatusFilters([]); setCategoryFilters([]); setAssigneeFilters([]); setDateFilter('all'); setCurrentPage(1); }
            },
          ].map((card, i) => (
            <button
              key={i}
              onClick={card.click}
              className={`bg-white dark:bg-secondary-900 rounded-2xl border ${card.borderColor} p-4 text-left hover:shadow-lg hover:-translate-y-[1px] transition-all duration-200 group relative overflow-hidden select-none cursor-pointer flex items-center justify-between gap-4 shadow-sm w-full`}
            >
              <div className={`absolute left-0 top-0 bottom-0 w-[4px] bg-gradient-to-b ${card.color}`} />
              
              <div className="flex items-center gap-3">
                <div className={`w-9.5 h-9.5 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 duration-205 shrink-0 ${card.iconBg}`}>
                  {card.icon}
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-secondary-400 tracking-wider uppercase">
                    {card.label}
                  </p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-xl font-black text-slate-900 dark:text-white tracking-tight leading-none">
                      {card.val}
                    </span>
                    {card.pct > 0 && card.label !== 'Total Tickets' && (
                      <span className="text-[9px] font-extrabold text-slate-400 dark:text-secondary-500 bg-slate-50 dark:bg-secondary-800/80 px-1 py-0.5 rounded leading-none">
                        {card.pct}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
              
              {card.label !== 'Total Tickets' && (
                <div className="w-12 h-1 bg-slate-100 dark:bg-secondary-800 rounded-full overflow-hidden shrink-0 hidden sm:block">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${card.color} kpi-progress-bar`}
                    {...{
                      style: {
                        '--bar-width': `${card.pct}%`
                      } as React.CSSProperties
                    }}
                  />
                </div>
              )}
            </button>
          ))}
        </div>

        {/* ── TABLE SECTION ── */}
        <div className="bg-white dark:bg-secondary-900 rounded-3xl border border-slate-200 dark:border-secondary-805 overflow-hidden shadow-sm flex flex-col">
          {/* Table Toolbar */}
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-secondary-800/80 bg-slate-50/20 dark:bg-secondary-955/5 select-none">
            <span className="text-[10px] font-black text-slate-500 dark:text-secondary-400 uppercase tracking-wider bg-slate-100 dark:bg-secondary-805 px-2.5 py-1 rounded-lg">
              Ticket Queue: {filtered.length} Record{filtered.length !== 1 ? 's' : ''} Matched
            </span>
          </div>

          {/* Table – Desktop */}
          <div className="hidden md:block overflow-x-auto app-scrollbar">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 dark:bg-secondary-850/20 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-secondary-400 border-b border-slate-100 dark:border-secondary-800 sticky top-0 z-5 select-none">
                  {[
                    { label:'Ticket ID', field:'ticketId' },
                    { label:'Subject', field:'title' },
                    { label:'Category', field:'category' },
                    { label:'Priority', field:'priority' },
                    { label:'Status', field:'status' },
                    ...((isSupport || userRole === 'manager' || userRole === 'partner') ? [{ label:'Raised By', field:'createdBy' }] : []),
                    { label:'Assigned To', field:'assigneeName' },
                    { label:'Age', field:'createdAt' },
                    { label:'Actions', field:'' }
                  ].map(col => (
                    <th
                      key={col.label}
                      onClick={() => col.field && handleSort(col.field)}
                      className={`px-5 py-4.5 ${col.field ? 'cursor-pointer hover:text-slate-800 dark:hover:text-white transition-colors' : ''}`}
                    >
                      <div className="flex items-center gap-1.5">
                        {col.label}
                        {col.field && sortField === col.field && (
                          <ArrowUpDown className={`w-3.5 h-3.5 text-indigo-500 transition-transform duration-205 ${sortDir === 'asc' ? 'rotate-0' : 'rotate-180'}`} />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/50 dark:divide-secondary-800/40">
                {loading ? (
                  // Custom Shimmer Loading State
                  Array.from({length:5}).map((_,i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-5 py-4.5"><div className="h-5 bg-slate-100 dark:bg-secondary-800 rounded-lg w-20" /></td>
                      <td className="px-5 py-4.5">
                        <div className="h-4.5 bg-slate-100 dark:bg-secondary-800 rounded-lg w-44" />
                        <div className="h-3.5 bg-slate-100 dark:bg-secondary-800 rounded-lg w-32 mt-1.5" />
                      </td>
                      <td className="px-5 py-4.5"><div className="h-5 bg-slate-100 dark:bg-secondary-800 rounded-lg w-28" /></td>
                      <td className="px-5 py-4.5"><div className="h-5 bg-slate-100 dark:bg-secondary-800 rounded-full w-16" /></td>
                      <td className="px-5 py-4.5"><div className="h-5 bg-slate-100 dark:bg-secondary-800 rounded-full w-20" /></td>
                      {isSupport && <td className="px-5 py-4.5"><div className="h-7 bg-slate-100 dark:bg-secondary-800 rounded-full w-24" /></td>}
                      <td className="px-5 py-4.5"><div className="h-5 bg-slate-100 dark:bg-secondary-800 rounded-lg w-24" /></td>
                      <td className="px-5 py-4.5"><div className="h-5 bg-slate-100 dark:bg-secondary-800 rounded-lg w-12" /></td>
                      <td className="px-5 py-4.5"><div className="h-8 bg-slate-100 dark:bg-secondary-800 rounded-lg w-10 ml-auto" /></td>
                    </tr>
                  ))
                ) : paginated.length === 0 ? (
                  // Custom SVG empty state
                  <tr>
                    <td colSpan={(isSupport || userRole === 'manager' || userRole === 'partner') ? 9 : 8} className="px-5 py-24 text-center">
                      <div className="flex flex-col items-center justify-center gap-3.5 text-slate-400 select-none">
                        <div className="w-16 h-16 rounded-full bg-slate-50 dark:bg-secondary-850 flex items-center justify-center border border-slate-200 dark:border-secondary-805 shadow-inner">
                          <Inbox className="w-8 h-8 text-indigo-500/70" />
                        </div>
                        <p className="font-bold text-slate-800 dark:text-white text-xs">No tickets match active parameters</p>
                        <p className="text-[10px] text-slate-400 dark:text-secondary-400">Clear filters or try adjusting your search parameters.</p>
                        <button
                          type="button"
                          onClick={() => {
                            setStatusFilters([]);
                            setPriorityFilters([]);
                            setCategoryFilters([]);
                            setAssigneeFilters([]);
                            setDateFilter('all');
                            setSearchQuery('');
                            setCurrentPage(1);
                          }}
                          className="mt-2.5 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl border-none shadow-sm cursor-pointer"
                        >
                          Clear Filters
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : paginated.map(ticket => {
                  return (
                    <tr
                      key={ticket.id}
                      onClick={() => openDrawer(ticket)}
                      className="even:bg-slate-50/10 dark:even:bg-secondary-850/5 hover:bg-slate-50/70 dark:hover:bg-secondary-800/15 cursor-pointer transition-colors duration-150 group border-b border-slate-100 dark:border-secondary-800/40"
                    >
                      {/* Ticket ID */}
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-xs font-extrabold text-indigo-600 dark:text-indigo-400 bg-indigo-50/70 dark:bg-indigo-950/20 px-2.5 py-1 rounded-lg border border-indigo-100/40 dark:border-indigo-900/40">
                          {ticket.ticketId || `TKT-${ticket.id.slice(0,6).toUpperCase()}`}
                        </span>
                      </td>
                      
                      {/* Subject */}
                      <td className="px-5 py-3.5 max-w-[280px]">
                        <p className="font-bold text-slate-900 dark:text-white truncate">{ticket.title}</p>
                        <p className="text-[10px] text-slate-400 dark:text-secondary-450 font-semibold truncate mt-0.5">{ticket.description}</p>
                      </td>
                      
                      {/* Category */}
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-700 dark:text-secondary-300 bg-slate-50 dark:bg-secondary-800 border border-slate-100 dark:border-slate-750 px-2.5 py-1 rounded-lg">
                          <Tag className="w-3.5 h-3.5 text-slate-400" />
                          {ticket.categoryRel?.category_name || ticket.category || '—'}
                        </span>
                      </td>
                      
                      {/* Priority */}
                      <td className="px-5 py-3.5">
                        <PriorityBadge priority={ticket.priority} />
                      </td>
                      
                      {/* Status */}
                      <td className="px-5 py-3.5">
                        <StatusBadge status={ticket.status} />
                      </td>
                      
                      {/* Raised By (IT/Admin view or Manager/Partner team view) */}
                      {(isSupport || userRole === 'manager' || userRole === 'partner') && (
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7.5 h-7.5 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-[10px] font-black text-white shrink-0 shadow-sm shadow-indigo-500/10">
                              {((ticket.createdBy?.firstName?.[0] || '') + (ticket.createdBy?.lastName?.[0] || '')).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate leading-tight">
                                {ticket.createdBy?.firstName} {ticket.createdBy?.lastName}
                              </p>
                              <p className="text-[9px] text-slate-400 dark:text-secondary-500 font-extrabold uppercase mt-0.5 leading-none">
                                {ticket.createdBy?.department || 'Staff'}
                              </p>
                            </div>
                          </div>
                        </td>
                      )}
                      
                      {/* Assigned To */}
                      <td className="px-5 py-3.5">
                        {ticket.assigneeName ? (
                          <div className="flex items-center gap-2.5">
                            <div className="w-6 h-6 rounded-full bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[9px] font-black shrink-0 uppercase">
                              {ticket.assigneeName.split(' ').map(n=>n[0]).join('').slice(0,2)}
                            </div>
                            <span className="font-bold text-slate-800 dark:text-slate-200">{ticket.assigneeName}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 dark:text-secondary-500 italic font-semibold">Unassigned</span>
                        )}
                      </td>
                      
                      {/* Age */}
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col text-left">
                          <span className="font-bold text-slate-700 dark:text-slate-300">{getTicketAge(ticket.createdAt)}</span>
                          <span className="text-[9px] text-slate-400 dark:text-secondary-500 font-semibold">{formatDate(ticket.createdAt)}</span>
                        </div>
                      </td>
                      
                      {/* Actions */}
                      <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-205">
                          <button
                            onClick={() => openDrawer(ticket)}
                            className="p-2 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 bg-slate-50 dark:bg-secondary-800 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/20 border border-slate-200/50 dark:border-secondary-750 rounded-xl cursor-pointer transition-all hover:scale-105 active:scale-95 shadow-sm hover:shadow"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {isSupport && ticket.status === 'Open' && (
                            <button
                              onClick={() => updateStatus(ticket.id, 'In Progress')}
                              className="p-2 text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 bg-slate-50 dark:bg-secondary-800 hover:bg-amber-50/60 dark:hover:bg-amber-950/20 border border-slate-200/50 dark:border-secondary-750 rounded-xl cursor-pointer transition-all hover:scale-105 active:scale-95 shadow-sm hover:shadow"
                              title="Start Progress"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                          )}
                          {isSupport && ticket.status !== 'Resolved' && (
                            <button
                              onClick={() => updateStatus(ticket.id, 'Resolved')}
                              className="p-2 text-slate-500 hover:text-emerald-650 dark:hover:text-emerald-400 bg-slate-50 dark:bg-secondary-800 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/20 border border-slate-200/50 dark:border-secondary-750 rounded-xl cursor-pointer transition-all hover:scale-105 active:scale-95 shadow-sm hover:shadow"
                              title="Mark Resolved"
                            >
                              <CheckCheck className="w-4 h-4" />
                            </button>
                          )}
                          {(isSupport || ticket.createdById === user?.id) && (
                            <button
                              onClick={() => handleDelete(ticket.id)}
                              className="p-2 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 bg-slate-50 dark:bg-secondary-800 hover:bg-rose-50/60 dark:hover:bg-rose-950/20 border border-slate-200/50 dark:border-secondary-750 rounded-xl cursor-pointer transition-all hover:scale-105 active:scale-95 shadow-sm hover:shadow"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden divide-y divide-slate-100 dark:divide-secondary-800/60">
            {loading ? (
              Array.from({length:3}).map((_,i)=>(
                <div key={i} className="p-4.5 animate-pulse space-y-2.5">
                  <div className="h-4.5 bg-slate-100 dark:bg-secondary-800 rounded w-1/3"/>
                  <div className="h-4 bg-slate-100 dark:bg-secondary-800 rounded w-3/4"/>
                  <div className="h-3 bg-slate-100 dark:bg-secondary-800 rounded w-1/2"/>
                </div>
              ))
            ) : paginated.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs font-semibold">No tickets found</div>
            ) : paginated.map(ticket => (
              <div
                key={ticket.id}
                onClick={() => openDrawer(ticket)}
                className="p-5 hover:bg-slate-50/50 dark:hover:bg-secondary-800/10 cursor-pointer transition-colors flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="font-mono text-[10px] font-extrabold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-md border border-indigo-100/30 dark:border-indigo-900/30">
                        {ticket.ticketId || `TKT-${ticket.id.slice(0,6).toUpperCase()}`}
                      </span>
                      <PriorityBadge priority={ticket.priority} />
                    </div>
                    <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{ticket.title}</p>
                  </div>
                  <StatusBadge status={ticket.status} />
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-secondary-400 mt-1">
                  <span className="flex items-center gap-1.5 font-bold"><Tag className="w-3.5 h-3.5 text-slate-400" />{ticket.category || '—'}</span>
                  <span className="flex items-center gap-1.5 font-semibold"><Clock className="w-3.5 h-3.5 text-slate-400" />{getTicketAge(ticket.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-5 py-4 border-t border-slate-100 dark:border-secondary-800 flex items-center justify-between bg-slate-50/20 dark:bg-secondary-955/5 select-none">
              <span className="text-[10px] text-slate-500 dark:text-secondary-400 font-bold uppercase tracking-wider">
                Showing {Math.min((currentPage-1)*PAGE_SIZE+1, filtered.length)}–{Math.min(currentPage*PAGE_SIZE, filtered.length)} of {filtered.length} entries
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage(p=>Math.max(1,p-1))}
                  disabled={currentPage===1}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-secondary-750 bg-white dark:bg-secondary-805 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-secondary-700 transition-colors cursor-pointer disabled:cursor-not-allowed text-slate-500"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                {Array.from({length: Math.min(5, totalPages)}, (_,i)=>{
                  let page = i+1;
                  if (totalPages > 5) {
                    if (currentPage <= 3) page = i+1;
                    else if (currentPage >= totalPages-2) page = totalPages-4+i;
                    else page = currentPage-2+i;
                  }
                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-7.5 h-7.5 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer border-none ${
                        currentPage===page
                          ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                          : 'bg-transparent text-slate-500 hover:bg-slate-100 dark:hover:bg-secondary-805'
                      }`}
                    >
                      {page}
                    </button>
                  );
                })}
                <button
                  onClick={() => setCurrentPage(p=>Math.min(totalPages,p+1))}
                  disabled={currentPage===totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-secondary-750 bg-white dark:bg-secondary-805 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-secondary-700 transition-colors cursor-pointer disabled:cursor-not-allowed text-slate-500"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── TICKET DETAILS DRAWER ── */}
      <AnimatePresence>
        {drawerOpen && selectedTicket && (
          <>
            <motion.div
              initial={{ opacity:0 }}
              animate={{ opacity:1 }}
              exit={{ opacity:0 }}
              onClick={closeDrawer}
              className="fixed inset-0 bg-slate-950/40 dark:bg-slate-950/70 backdrop-blur-sm z-[2000]"
            />
            <motion.div
              initial={{ x:'105%' }}
              animate={{ x:0 }}
              exit={{ x:'105%' }}
              transition={{ type:'spring', damping:30, stiffness:300 }}
              className="fixed right-0 top-0 h-full w-full max-w-xl bg-white dark:bg-secondary-900 shadow-2xl z-[2001] flex flex-col border-l border-slate-200 dark:border-secondary-800"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-secondary-800 shrink-0">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-sm font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 px-2.5 py-1 rounded-lg border border-indigo-100/30 dark:border-indigo-900/30">
                    {selectedTicket.ticketId || `TKT-${selectedTicket.id.slice(0,6).toUpperCase()}`}
                  </span>
                  <PriorityBadge priority={selectedTicket.priority} />
                  <StatusBadge status={selectedTicket.status} />
                </div>
                <button
                  title="Close"
                  onClick={closeDrawer}
                  className="p-1.5 rounded-lg border-none bg-transparent hover:bg-slate-50 dark:hover:bg-secondary-805 text-slate-400 hover:text-slate-600 cursor-pointer flex items-center justify-center transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Body */}
              <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 app-scrollbar">
                {/* Subject & Description Summary */}
                <div className="space-y-4 border-b border-slate-200 dark:border-secondary-800 pb-5">
                  <span className="text-[9px] text-slate-400 dark:text-secondary-500 font-black uppercase tracking-wider block mb-1">
                    Subject &amp; Issue Summary
                  </span>
                  <h2 className="text-base font-black text-slate-900 dark:text-white leading-tight">
                    {selectedTicket.title}
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-secondary-300 leading-relaxed font-semibold whitespace-pre-wrap bg-slate-50/20 dark:bg-secondary-855/10 p-4 rounded-2xl border border-slate-100/50 dark:border-secondary-800/40">
                    {selectedTicket.description}
                  </p>
                </div>

                {/* Structured Meta Info */}
                <div className="bg-slate-50/50 dark:bg-secondary-850/15 border border-slate-200 dark:border-secondary-800/60 rounded-2xl p-4.5 grid grid-cols-2 gap-4 text-xs font-semibold">
                  <div>
                    <span className="text-[9px] text-slate-400 dark:text-secondary-500 font-extrabold uppercase tracking-wider block mb-1 select-none">
                      Raised By Employee
                    </span>
                    <span className="text-slate-800 dark:text-slate-200 font-bold block leading-tight">
                      {selectedTicket.createdBy?.firstName} {selectedTicket.createdBy?.lastName}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-secondary-400 mt-1 block">
                      {selectedTicket.createdBy?.employeeId} · {selectedTicket.createdBy?.department}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 dark:text-secondary-500 font-extrabold uppercase tracking-wider block mb-1 select-none">
                      Assigned Agent
                    </span>
                    <span className="text-slate-800 dark:text-slate-200 font-bold block leading-tight">
                      {selectedTicket.assigneeName || (
                        <span className="text-slate-400 font-normal italic">Unassigned</span>
                      )}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 dark:text-secondary-500 font-extrabold uppercase tracking-wider block mb-1 select-none">
                      Category
                    </span>
                    <span className="text-slate-700 dark:text-slate-350 font-bold block leading-tight">
                      {selectedTicket.categoryRel?.category_name || selectedTicket.category || '—'}
                      {selectedTicket.subcategoryRel && ` › ${selectedTicket.subcategoryRel.category_name}`}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 dark:text-secondary-500 font-extrabold uppercase tracking-wider block mb-1 select-none">
                      Ticket Age
                    </span>
                    <span className="text-slate-700 dark:text-slate-300 font-bold block">
                      {getTicketAge(selectedTicket.createdAt)}
                      <span className="text-[10px] text-slate-400 dark:text-secondary-500 font-semibold block mt-0.5">
                        Created {formatDateTime(selectedTicket.createdAt)}
                      </span>
                    </span>
                  </div>
                </div>

                {/* Lifecycle Action Operations */}
                {(isSupport || selectedTicket.createdById === user?.id) && (
                  <div className="border-b border-slate-200 dark:border-secondary-800 pb-5">
                    <span className="text-[9px] text-slate-400 dark:text-secondary-400 font-extrabold uppercase tracking-wider block mb-3 select-none">
                      Lifecycle Operations
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {isSupport && selectedTicket.status === 'Open' && (
                        <button
                          onClick={() => updateStatus(selectedTicket.id, 'In Progress')}
                          className="flex items-center gap-1.5 px-3.5 py-2 text-[10px] font-extrabold uppercase tracking-wide text-amber-700 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 rounded-lg hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-all cursor-pointer font-semibold shadow-sm hover:shadow"
                        >
                          <Play className="w-3.5 h-3.5"/> Begin Progress
                        </button>
                      )}
                      {isSupport && selectedTicket.status !== 'Resolved' && (
                        <button
                          onClick={() => updateStatus(selectedTicket.id, 'Resolved')}
                          className="flex items-center gap-1.5 px-3.5 py-2 text-[10px] font-extrabold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 bg-emerald-50/55 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 rounded-lg hover:bg-emerald-100/50 dark:hover:bg-emerald-900/30 transition-all cursor-pointer font-semibold shadow-sm hover:shadow"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5"/> Mark Resolved
                        </button>
                      )}
                      {isSupport && selectedTicket.status !== 'Returned' && (
                        <button
                          onClick={() => updateStatus(selectedTicket.id, 'Returned')}
                          className="flex items-center gap-1.5 px-3.5 py-2 text-[10px] font-extrabold uppercase tracking-wide text-rose-700 dark:text-rose-400 bg-rose-50/55 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-lg hover:bg-rose-100/50 dark:hover:bg-rose-900/30 transition-all cursor-pointer font-semibold shadow-sm hover:shadow"
                        >
                          <RotateCcw className="w-3.5 h-3.5"/> Return Ticket
                        </button>
                      )}
                      {isSupport && (
                        <button
                          onClick={() => handleEscalate(selectedTicket.id)}
                          className="flex items-center gap-1.5 px-3.5 py-2 text-[10px] font-extrabold uppercase tracking-wide text-indigo-700 dark:text-indigo-400 bg-indigo-50/55 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/40 rounded-lg hover:bg-indigo-100/50 dark:hover:bg-indigo-900/30 transition-all cursor-pointer font-semibold shadow-sm hover:shadow"
                        >
                          <AlertTriangle className="w-3.5 h-3.5"/> Escalate
                        </button>
                      )}
                      {(isSupport || selectedTicket.createdById === user?.id) && (
                        <button
                          onClick={() => handleDelete(selectedTicket.id)}
                          className="flex items-center gap-1.5 px-3.5 py-2 text-[10px] font-extrabold uppercase tracking-wide text-red-600 dark:text-rose-400 bg-rose-50/55 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-lg hover:bg-rose-100/50 dark:hover:bg-rose-900/30 transition-all cursor-pointer font-semibold shadow-sm hover:shadow"
                        >
                          <Trash2 className="w-3.5 h-3.5"/> Delete
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Assignee Search Selector Update (Support only) */}
                {isSupport && selectedTicket.status !== 'Resolved' && (
                  <div className="border-b border-slate-200 dark:border-secondary-800 pb-5">
                    <label className="block text-[9px] text-slate-400 dark:text-secondary-400 font-extrabold uppercase tracking-wider mb-2.5 select-none">
                      Reassign Ticket Agent
                    </label>
                    <AgentSelectDropdown
                      agents={reassignableAgents}
                      selectedId={selectedTicket.assignedTo || ''}
                      loading={employeesLoading}
                      onSelect={async agentId => {
                        try {
                          await API.patch(`/tickets/${selectedTicket.id}`, { assignedTo: agentId || null });
                          success('Assignee updated');
                          await fetchTickets();
                          const fresh = await API.get(`/tickets/${selectedTicket.id}`);
                          if (fresh.data?.success) setSelectedTicket(fresh.data.data);
                        } catch {
                          showError('Failed to update assignee');
                        }
                      }}
                    />
                  </div>
                )}

                {/* Attachments list block */}
                {selectedTicket.attachments && selectedTicket.attachments.length > 0 && (
                  <div className="border-b border-slate-200 dark:border-secondary-800 pb-5">
                    <span className="text-[9px] text-slate-500 dark:text-secondary-400 font-extrabold uppercase tracking-wider block mb-3 flex items-center gap-1.5 select-none">
                      <Paperclip className="w-3.5 h-3.5 text-indigo-550"/> Associated Attachments
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {selectedTicket.attachments.map(att => {
                        const isImg = att.mimeType.startsWith('image/');
                        return (
                          <div
                            key={att.id}
                            className="border border-slate-200/60 dark:border-secondary-800 rounded-2xl p-2.5 flex items-center justify-between gap-3 bg-slate-50/30 dark:bg-secondary-855/10 hover:bg-slate-50/70 dark:hover:bg-secondary-800/20 transition-all"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {isImg ? (
                                <button
                                  onClick={() => setZoomImageUrl(resolveAssetUrl(att.url) || null)}
                                  className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-secondary-800 overflow-hidden flex-shrink-0 border border-slate-200/50 dark:border-secondary-750 cursor-zoom-in relative group shadow-sm"
                                >
                                  <img src={resolveAssetUrl(att.url)} alt="Attachment" className="w-full h-full object-cover"/>
                                </button>
                              ) : (
                                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center flex-shrink-0 border border-indigo-100/50 dark:border-indigo-900/30 shadow-sm">
                                  <FileText className="w-4 h-4"/>
                                </div>
                              )}
                              <div className="min-w-0 text-left">
                                <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate leading-tight" title={att.filename}>
                                  {att.filename}
                                </p>
                                <p className="text-[9px] text-slate-400 dark:text-secondary-400 font-extrabold mt-1">
                                  {formatFileSize(att.size)}
                                </p>
                              </div>
                            </div>
                            <a
                              href={resolveAssetUrl(att.url)}
                              download
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-secondary-800 rounded-xl transition-colors cursor-pointer border-none flex items-center justify-center shrink-0"
                              title="Download File"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Timeline History activities */}
                <div className="border-b border-slate-200 dark:border-secondary-800 pb-5">
                  <span className="text-[9px] text-slate-400 dark:text-secondary-450 font-extrabold uppercase tracking-wider block mb-4.5 flex items-center gap-1.5 select-none">
                    <History className="w-3.5 h-3.5 text-indigo-500"/> Live Activity Feed
                  </span>
                  <div className="space-y-4.5 relative before:absolute before:left-3.5 before:top-3.5 before:bottom-3.5 before:w-0.5 before:bg-slate-200 dark:before:bg-secondary-805">
                    {selectedTicket.history && selectedTicket.history.map((hist, i) => {
                      // Determine event-specific icons and colors
                      let icon = <History className="w-3.5 h-3.5" />;
                      let iconColor = 'bg-slate-100 text-slate-500 dark:bg-secondary-800 dark:text-secondary-400';
                      if (hist.action === 'Comment') {
                        icon = <MessageSquare className="w-3.5 h-3.5" />;
                        iconColor = 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400';
                      } else if (hist.action === 'Assigned') {
                        icon = <UserPlus className="w-3.5 h-3.5" />;
                        iconColor = 'bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400';
                      } else if (hist.action === 'Returned') {
                        icon = <RotateCcw className="w-3.5 h-3.5" />;
                        iconColor = 'bg-rose-50 text-rose-600 dark:bg-rose-950/20 dark:text-rose-400';
                      } else if (hist.action.toLowerCase().includes('resolved')) {
                        icon = <CheckCheck className="w-3.5 h-3.5" />;
                        iconColor = 'bg-emerald-50 text-emerald-605 dark:bg-emerald-950/20 dark:text-emerald-400';
                      } else if (hist.action === 'Escalate') {
                        icon = <AlertTriangle className="w-3.5 h-3.5" />;
                        iconColor = 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/20 dark:text-indigo-400';
                      } else if (hist.action === 'StatusUpdate') {
                        icon = <RefreshCw className="w-3.5 h-3.5" />;
                        iconColor = 'bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400';
                      }

                      return (
                        <div key={i} className="flex gap-4.5 relative z-10">
                          {/* Timeline icon bubble */}
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 border-white dark:border-secondary-900 flex-shrink-0 shadow-sm select-none ${iconColor}`}>
                            {icon}
                          </div>
                          
                          <div className="flex-1 min-w-0 text-left bg-slate-50/30 dark:bg-secondary-855/5 rounded-2xl p-3.5 border border-slate-100 dark:border-secondary-800/40">
                            {/* Header */}
                            <div className="flex items-center justify-between gap-2.5 mb-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-black text-slate-800 dark:text-white">
                                  {hist.performer ? `${hist.performer.firstName} ${hist.performer.lastName}` : 'System Agent'}
                                </span>
                                <span className="text-[8px] font-black uppercase tracking-wider bg-slate-100 dark:bg-secondary-800 px-1.5 py-0.5 rounded text-slate-400">
                                  {hist.action}
                                </span>
                              </div>
                              <span className="text-[9px] font-semibold text-slate-400 dark:text-secondary-500">
                                {formatDateTime(hist.performedAt)}
                              </span>
                            </div>

                            {/* Message / Remarks Bubble */}
                            {hist.remarks && (
                              <div className={`text-xs leading-relaxed font-semibold rounded-xl p-3 border whitespace-pre-wrap ${
                                hist.action === 'Comment'
                                  ? 'bg-white dark:bg-secondary-850 border-slate-200 dark:border-secondary-800 text-slate-750 dark:text-slate-300'
                                  : 'bg-indigo-50/30 dark:bg-indigo-950/10 border-indigo-100/30 text-indigo-900 dark:text-indigo-300'
                              }`}>
                                {hist.remarks}
                              </div>
                            )}

                            {/* Attachments */}
                            {hist.attachments && hist.attachments.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2.5">
                                {hist.attachments.map(att => (
                                  <a
                                    key={att.id}
                                    href={resolveAssetUrl(att.url)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-secondary-800 border border-slate-200 dark:border-secondary-750 rounded-lg text-[10px] text-indigo-600 dark:text-indigo-400 font-bold hover:bg-slate-50 dark:hover:bg-secondary-700/80 transition-colors no-underline"
                                  >
                                    <FileText className="w-3.5 h-3.5"/>
                                    <span className="truncate max-w-[120px]">{att.filename}</span>
                                    <span className="text-[8px] text-slate-400">({formatFileSize(att.size)})</span>
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Add Comment Section */}
                <div className="space-y-3">
                  <label className="block text-[9px] text-slate-400 dark:text-secondary-400 font-extrabold uppercase tracking-wider flex items-center gap-1.5 block ml-0.5 select-none">
                    <MessageSquare className="w-3.5 h-3.5 text-indigo-500"/> Compose Comment / Reply
                  </label>
                  <textarea
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    rows={3}
                    placeholder="Write a message, internal note or resolution update..."
                    className="w-full px-4 py-3 text-xs bg-slate-50 dark:bg-secondary-800 border border-slate-200 dark:border-secondary-700 rounded-2xl text-slate-800 dark:text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 resize-none font-semibold shadow-inner"
                  />
                  {commentFiles.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {commentFiles.map((f, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1.5 text-[10px] bg-slate-50 dark:bg-secondary-800 text-slate-700 dark:text-secondary-300 px-2.5 py-1 rounded-lg border border-slate-200/50 dark:border-secondary-700 font-bold"
                        >
                          <FileText className="w-3.5 h-3.5 text-indigo-550" />
                          <span className="truncate max-w-[150px]">{f.name}</span>
                          <button
                            title="Remove file"
                            onClick={() => setCommentFiles(p => p.filter((_,j)=>j!==i))}
                            className="text-slate-400 hover:text-rose-500 bg-transparent border-none cursor-pointer flex items-center p-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-2.5 pt-1">
                    <button
                      onClick={() => commentFileRef.current?.click()}
                      className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors border-none bg-transparent cursor-pointer"
                    >
                      <Paperclip className="w-3.5 h-3.5 text-slate-400"/> Attach files
                    </button>
                    <input
                      ref={commentFileRef}
                      type="file"
                      title="Attach files"
                      multiple
                      className="hidden"
                      onChange={e => setCommentFiles(p => [...p, ...Array.from(e.target.files||[])])}
                    />
                    <AppButton
                      onClick={handleAddComment}
                      disabled={commentLoading || (!commentText.trim() && commentFiles.length === 0)}
                      isLoading={commentLoading}
                      variant="primary"
                      leftIcon={<Send className="w-3.5 h-3.5" />}
                    >
                      Send Message
                    </AppButton>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── RAISE TICKET MODAL ── */}
      <AppModal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="Raise a Support Ticket"
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-2.5">
            <AppButton
              type="button"
              variant="secondary"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </AppButton>
            <AppButton
              type="submit"
              form="raise-ticket-form"
              disabled={loading}
              isLoading={loading}
              leftIcon={<Ticket className="w-3.5 h-3.5" />}
            >
              Raise Ticket
            </AppButton>
          </div>
        }
      >
        <form id="raise-ticket-form" onSubmit={handleSubmit} className="space-y-4.5">
          {/* Category Dropdown */}
          <HierarchicalDropdown
            categories={categoriesList}
            selectedCategoryId={formData.categoryId}
            selectedSubcategoryId={formData.subcategoryId}
            onChange={(catId, subId, text) => {
              setFormData(p => ({ ...p, categoryId: catId, subcategoryId: subId, category: text }));
              setCategoryError('');
            }}
            label="Need Help Regarding *"
            placeholder={categoriesLoading ? "Loading categories…" : "Select a category and subcategory…"}
            error={categoryError}
          />

          {/* Subject */}
          <AppInput
            required
            id="ticket-subject"
            label="Subject *"
            placeholder="Brief summary of your issue"
            value={formData.title}
            onChange={e => setFormData(p=>({...p,title:e.target.value}))}
          />

          {/* Description */}
          <AppInput
            required
            id="ticket-description"
            label="Description *"
            multiline
            rows={4}
            placeholder="Provide as much detail as possible about the issue…"
            value={formData.description}
            onChange={e => setFormData(p=>({...p,description:e.target.value}))}
          />

          {/* Priority + Assign Row */}
          <div className="grid grid-cols-2 gap-4">
            <AppDropdown
              id="ticket-priority"
              label="Priority"
              value={formData.priority}
              onChange={e => setFormData(p=>({...p,priority:e.target.value}))}
            >
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </AppDropdown>

            {isSupport && (
              <AppDropdown
                id="ticket-assignee"
                label="Assign To"
                value={formData.assignTo}
                onChange={e => setFormData(p=>({...p,assignTo:e.target.value}))}
              >
                <option value="">Auto-assign</option>
                {reassignableAgents.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
              </AppDropdown>
            )}
          </div>

          {/* Attachment Upload */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-450 dark:text-secondary-400 block ml-0.5 mb-1.5">
              Attachments <span className="text-gray-400 dark:text-secondary-500 font-bold lowercase">(optional, max 10 files, 50mb each)</span>
            </label>
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => { e.preventDefault(); setIsDragging(false); handleFileDrop(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20'
                  : 'border-slate-200 dark:border-secondary-700 hover:border-indigo-400 dark:hover:border-indigo-500 bg-slate-50/40 dark:bg-secondary-855/30 hover:bg-indigo-50/20 dark:hover:bg-indigo-950/10'
              }`}
            >
              <Upload className="w-7 h-7 text-slate-400 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-600 dark:text-secondary-300">
                Drop files here or <span className="text-indigo-600 dark:text-indigo-400">browse files</span>
              </p>
              <p className="text-[10px] text-slate-400 dark:text-secondary-550 mt-1">
                JPG, PNG, PDF, DOCX, XLSX, MP4 up to 50MB
              </p>
            </div>
            <input ref={fileInputRef} type="file" title="Choose files to upload" multiple className="hidden" onChange={e => handleFileDrop(e.target.files!)} />
            
            {attachments.length > 0 && (
              <div className="mt-3.5 space-y-2">
                {attachments.map((f, i) => (
                  <div key={i} className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50 dark:bg-secondary-800 rounded-xl border border-slate-200/50 dark:border-secondary-700">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                      <span className="text-xs text-slate-700 dark:text-secondary-300 truncate font-semibold">{f.name}</span>
                      <span className="text-[9px] text-slate-400 font-extrabold flex-shrink-0">{formatFileSize(f.size)}</span>
                    </div>
                    <button
                      type="button"
                      title="Remove attachment"
                      onClick={() => setAttachments(p=>p.filter((_,j)=>j!==i))}
                      className="text-slate-400 hover:text-rose-500 bg-transparent border-none cursor-pointer flex items-center justify-center p-1 rounded hover:bg-slate-200 dark:hover:bg-secondary-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </form>
      </AppModal>

      {/* ── SUCCESS CONFIRMATION DIALOG ── */}
      <AppModal
        isOpen={!!createdTicketDetails}
        onClose={() => setCreatedTicketDetails(null)}
        title="Ticket Raised"
        size="sm"
        footer={
          <div className="flex w-full gap-2.5">
            <AppButton
              variant="secondary"
              fullWidth
              onClick={() => setCreatedTicketDetails(null)}
            >
              Close
            </AppButton>
            <AppButton
              variant="primary"
              fullWidth
              onClick={() => setCreatedTicketDetails(null)}
            >
              View Tickets
            </AppButton>
          </div>
        }
      >
        {createdTicketDetails && (
          <div className="flex flex-col items-center text-center">
            {/* Success Icon */}
            <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500 flex items-center justify-center mb-4 border border-emerald-100 dark:border-emerald-900/30">
              <CheckCheck className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
            </div>

            <h3 className="text-base font-black text-slate-900 dark:text-white mb-1">Ticket Registered Successfully</h3>
            <p className="text-xs text-slate-500 dark:text-secondary-400 font-semibold mb-6 leading-relaxed">
              Your support request has been queued and routed to the corresponding department desk.
            </p>
            
            {/* Details Card */}
            <div className="w-full bg-slate-50 dark:bg-secondary-850/50 border border-slate-100 dark:border-secondary-800 rounded-2xl p-4 text-left space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 dark:text-secondary-400 font-bold uppercase tracking-wider text-[9px]">Ticket ID</span>
                <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded text-xs border border-indigo-100/20 dark:border-indigo-900/20">
                  {createdTicketDetails.ticketId}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 dark:text-secondary-400 font-bold uppercase tracking-wider text-[9px]">Assigned Team</span>
                <span className="font-extrabold text-slate-800 dark:text-slate-200">{createdTicketDetails.assignedTeam}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 dark:text-secondary-400 font-bold uppercase tracking-wider text-[9px]">Expected SLA</span>
                <span className="font-extrabold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> {createdTicketDetails.slaHours} Hours
                </span>
              </div>
            </div>
          </div>
        )}
      </AppModal>

      {/* ── IMAGE ZOOM LIGHTBOX ── */}
      <AnimatePresence>
        {zoomImageUrl && (
          <motion.div
            initial={{ opacity:0 }}
            animate={{ opacity:1 }}
            exit={{ opacity:0 }}
            onClick={() => setZoomImageUrl(null)}
            className="fixed inset-0 z-[9999] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out"
          >
            <button
              title="Close"
              onClick={() => setZoomImageUrl(null)}
              className="absolute top-5 right-5 p-2.5 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl border-none cursor-pointer flex items-center justify-center transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <motion.img
              initial={{ scale:0.95 }}
              animate={{ scale:1 }}
              exit={{ scale:0.95 }}
              transition={{ duration: 0.2 }}
              src={zoomImageUrl}
              alt="Preview attachment"
              className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl border border-white/10"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default HelpDesk;
