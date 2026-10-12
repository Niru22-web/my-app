import React, { useState, useRef, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { MagnifyingGlassIcon, ChevronDownIcon } from '@heroicons/react/24/outline';

export interface ChecklistOption {
  value: string;
  label: string;
}

interface ChecklistDropdownProps {
  /** Display label shown on the trigger button */
  label: string;
  /** Full list of options (filtering is done internally using searchValue) */
  options: ChecklistOption[];
  /** Currently selected values */
  selectedValues: string[];
  /** Called when a checkbox is toggled */
  onToggle: (value: string) => void;
  /** Current search query (controlled externally so Clear Filters can reset it) */
  searchValue: string;
  /** Update the search query */
  onSearchChange: (val: string) => void;
  /** Minimum width of the dropdown trigger button (and menu) */
  minWidth?: number;
  /** Additional class on the trigger button */
  className?: string;
}

/**
 * Portal-based multi-select checklist dropdown.
 *
 * The menu is attached to `document.body` via ReactDOM.createPortal, so it is
 * never clipped by any parent overflow:hidden or stacking-context constraints.
 * Position is calculated from the trigger's getBoundingClientRect() and the
 * menu auto-flips upward when space below is insufficient.
 */
const ChecklistDropdown: React.FC<ChecklistDropdownProps> = ({
  label,
  options,
  selectedValues,
  onToggle,
  searchValue,
  onSearchChange,
  minWidth = 180,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (triggerRef.current) {
      triggerRef.current.style.minWidth = `${minWidth}px`;
    }
  }, [minWidth]);

  useEffect(() => {
    if (isOpen && menuRef.current) {
      const el = menuRef.current;
      // Reset placement styles to avoid layout conflicts
      el.style.top = '';
      el.style.bottom = '';
      el.style.left = '';
      el.style.right = '';
      el.style.maxHeight = '';
      el.style.minWidth = '';
      el.style.position = '';
      el.style.zIndex = '';
      
      Object.assign(el.style, menuStyle);
    }
  }, [isOpen, menuStyle]);

  /** Compute the portal menu style from the current trigger bounding rect. */
  const computeStyle = useCallback((): React.CSSProperties => {
    if (!triggerRef.current) return {};
    const rect = triggerRef.current.getBoundingClientRect();
    const menuW = Math.max(minWidth, rect.width);
    const estimatedMenuH = 320; // worst-case height
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    const style: React.CSSProperties = {
      position: 'fixed',
      zIndex: 9999,
      minWidth: `${menuW}px`,
    };

    // Horizontal: prefer left-aligned with trigger; shift left if it would overflow viewport
    const wouldOverflowRight = rect.left + menuW > window.innerWidth - 8;
    if (wouldOverflowRight) {
      style.right = `${window.innerWidth - rect.right}px`;
    } else {
      style.left = `${rect.left}px`;
    }

    // Vertical: open downward unless not enough space and more space above
    if (spaceBelow < estimatedMenuH && spaceAbove > spaceBelow) {
      style.bottom = `${window.innerHeight - rect.top + 4}px`;
      style.maxHeight = `${Math.min(spaceAbove - 12, estimatedMenuH)}px`;
    } else {
      style.top = `${rect.bottom + 4}px`;
      style.maxHeight = `${Math.min(spaceBelow - 12, estimatedMenuH)}px`;
    }

    return style;
  }, [minWidth]);

  const open = useCallback(() => {
    setMenuStyle(computeStyle());
    setIsOpen(true);
  }, [computeStyle]);

  const close = useCallback(() => setIsOpen(false), []);

  const toggle = () => (isOpen ? close() : open());

  const filteredOptions = options.filter(o =>
    o.label.toLowerCase().includes(searchValue.toLowerCase())
  );

  const countLabel =
    selectedValues.length === 0 ? ': All' : ` (${selectedValues.length})`;

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        className={`flex items-center justify-between gap-2 px-4 py-2.5 bg-white rounded-xl text-xs font-bold shadow-sm outline-none transition-all cursor-pointer whitespace-nowrap ${
          isOpen
            ? 'border-2 border-indigo-400 ring-2 ring-indigo-500/10 text-indigo-700'
            : 'border border-slate-200 hover:border-indigo-300 text-slate-700'
        } ${className}`}
      >
        <span className="truncate">
          {label}
          {countLabel}
        </span>
        <ChevronDownIcon
          className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-indigo-500' : 'text-slate-400'
          }`}
        />
      </button>

      {/* Portal-rendered dropdown menu */}
      {isOpen &&
        ReactDOM.createPortal(
          <>
            {/* Full-screen invisible backdrop to close on outside click */}
            <div
              className="fixed inset-0 z-[9998]"
              onClick={close}
            />

            {/* Dropdown menu */}
            <div
              ref={menuRef}
              className="bg-white border border-slate-200 rounded-2xl shadow-2xl shadow-slate-300/30 overflow-hidden flex flex-col"
            >
              {/* Search bar */}
              <div className="p-2.5 border-b border-slate-100 flex-shrink-0">
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search..."
                    autoFocus
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all font-semibold"
                    value={searchValue}
                    onChange={e => onSearchChange(e.target.value)}
                  />
                </div>
              </div>

              {/* Options list */}
              <div className="overflow-y-auto p-2 flex-1 custom-scrollbar">
                {filteredOptions.length > 0 ? (
                  <div className="space-y-0.5">
                    {filteredOptions.map(opt => {
                      const checked = selectedValues.includes(opt.value);
                      return (
                        <label
                          key={opt.value}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer select-none text-xs font-semibold transition-colors ${
                            checked
                              ? 'bg-indigo-50 text-indigo-700'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggle(opt.value)}
                            className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20 cursor-pointer flex-shrink-0"
                          />
                          <span className="truncate">{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 font-medium text-center py-4">
                    No options found
                  </p>
                )}
              </div>
            </div>
          </>,
          document.body
        )}
    </div>
  );
};

export default ChecklistDropdown;
