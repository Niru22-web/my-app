/**
 * HierarchySelect — Custom multi-select with checkboxes, chips, and search.
 * Drop-in replacement for react-select (no external dependencies required).
 *
 * Props:
 *   options      { value: string, label: string }[]
 *   value        string[]          — array of selected IDs
 *   onChange     (ids: string[]) => void
 *   placeholder  string
 *   disabled     boolean
 *   isMulti      boolean           — default true
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X } from 'lucide-react';

interface EmployeeOption {
  value: string;
  label: string;
}

interface HierarchySelectProps {
  options: EmployeeOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  isMulti?: boolean;
}

const HierarchySelect: React.FC<HierarchySelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  disabled = false,
  isMulti = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const selectedOptions = options.filter(o => value.includes(o.value));
  const filteredOptions = options.filter(o =>
    o.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleOption = useCallback((id: string) => {
    if (!isMulti) {
      onChange([id]);
      setIsOpen(false);
      return;
    }
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);
  }, [value, onChange, isMulti]);

  const removeChip = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onChange(value.filter(v => v !== id));
  }, [value, onChange]);

  const clearAll = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  }, [onChange]);

  const openDropdown = () => {
    if (!disabled) setIsOpen(v => !v);
  };

  return (
    <div ref={containerRef} className="relative w-full font-sans">
      {/* ── Trigger ── */}
      <div
        onClick={openDropdown}
        title={placeholder}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') openDropdown(); }}
        className={`
          min-h-[44px] flex items-center flex-wrap gap-1.5 p-1.5 pl-2.5 pr-9
          border-[1.5px] rounded-lg transition-all duration-150 select-none relative
          ${isOpen ? 'border-blue-500 ring-4 ring-blue-500/10' : disabled ? 'border-slate-200 bg-slate-50 cursor-not-allowed' : 'border-slate-300 bg-white cursor-pointer hover:border-slate-400'}
        `}
      >
        {/* Chips / placeholder */}
        {selectedOptions.length === 0 ? (
          <span className="text-slate-400 text-sm pl-0.5">
            {placeholder}
          </span>
        ) : (
          selectedOptions.map(opt => (
            <span
              key={opt.value}
              className="inline-flex items-center gap-1 py-0.5 pl-2 pr-1.5 bg-blue-50 border border-blue-200 rounded-md text-blue-700 text-[12px] font-semibold whitespace-nowrap"
            >
              {opt.label}
              <button
                type="button"
                onClick={e => removeChip(e, opt.value)}
                aria-label={`Remove ${opt.label}`}
                title={`Remove ${opt.label}`}
                className="p-0.5 hover:text-red-500 transition-colors rounded-sm focus:outline-none focus:ring-1 focus:ring-red-400"
              >
                <X size={14} />
              </button>
            </span>
          ))
        )}

        {/* Chevron */}
        <span
          className={`
            absolute right-2.5 top-1/2 -translate-y-1/2 transition-transform duration-200 text-[12px] pointer-events-none
            ${isOpen ? 'rotate-180 text-blue-500' : 'text-slate-400'}
          `}
        >
          ▾
        </span>
      </div>

      {/* ── Dropdown ── */}
      {isOpen && (
        <div
          className="absolute top-[calc(100%+6px)] left-0 right-0 bg-white border-[1.5px] border-slate-200 rounded-xl shadow-2xl z-[9999] overflow-hidden max-h-[340px] flex flex-col"
        >
          {/* Search */}
          <div className="p-2.5 border-b border-slate-100 bg-slate-50/50">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input
                ref={searchRef}
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                onClick={e => e.stopPropagation()}
                placeholder="Search employees..."
                title="Search employees"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-[13px] outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5"
              />
            </div>
          </div>

          {/* Options list */}
          <div 
            className="overflow-y-auto flex-1 max-h-[240px]"
          >
            {filteredOptions.length === 0 ? (
              <div className="py-6 px-4 text-center text-slate-400 text-[13px]">
                No employees found
              </div>
            ) : (
              filteredOptions.map(opt => {
                const checked = value.includes(opt.value);
                return (
                  <div
                    key={opt.value}
                    onClick={() => toggleOption(opt.value)}
                    className={`
                      flex items-center gap-2.5 py-2.5 px-3.5 cursor-pointer transition-colors
                      ${checked ? 'bg-blue-50' : 'bg-transparent hover:bg-slate-50'}
                    `}
                  >
                    {/* Checkbox */}
                    <div
                      className={`
                        w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all duration-150
                        ${checked ? 'bg-blue-500 border-blue-500' : 'bg-white border-slate-300'}
                      `}
                    >
                      {checked && (
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>

                    {/* Label */}
                    <span className={`text-[13.5px] flex-1 ${checked ? 'text-blue-700 font-semibold' : 'text-slate-700 font-normal'}`}>
                      {opt.label}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {isMulti && value.length > 0 && (
            <div className="flex justify-between items-center py-2 px-3.5 border-t border-slate-100 bg-slate-50/50">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                {value.length} selected
              </span>
              <button
                type="button"
                onClick={clearAll}
                className="text-[10px] font-bold text-red-500 uppercase tracking-widest hover:text-red-600 transition-colors"
              >
                Clear All
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default HierarchySelect;
