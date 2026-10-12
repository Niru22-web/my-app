import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronDown, Plus, Check } from 'lucide-react';

interface Option {
  label: string;
  value: string;
  category?: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string, category?: string) => void;
  placeholder?: string;
  label?: string;
  allowCustom?: boolean;
  className?: string;
  id?: string;
  title?: string;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select option...',
  label,
  allowCustom = true,
  className = '',
  id,
  title
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const [openUpward, setOpenUpward] = useState(false);

  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      if (spaceBelow < 320 && spaceAbove > spaceBelow) {
        setOpenUpward(true);
      } else {
        setOpenUpward(false);
      }
    }
  }, [isOpen]);

  const filteredOptions = options.filter(opt =>
    opt.label.toLowerCase().includes(search.toLowerCase()) ||
    opt.value.toLowerCase().includes(search.toLowerCase())
  );

  const showCustomOption = allowCustom && search && !options.some(opt => opt.label.toLowerCase() === search.toLowerCase());

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className={`space-y-2 relative ${className}`} ref={containerRef}>
      {label && (
        <label htmlFor={id} className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1">
          {label}
        </label>
      )}

      {isOpen ? (
        <div
          id={id}
          title={title || label}
          role="combobox"
          aria-expanded="true"
          aria-haspopup="listbox"
          aria-controls={`${id}-listbox`}
          tabIndex={0}
          onClick={() => setIsOpen(false)}
          className={`
            w-full p-4 bg-gray-50 dark:bg-slate-900/50
            rounded-2xl text-sm font-bold
            flex justify-between items-center
            cursor-pointer transition-all border-2
            ring-2 ring-indigo-500 border-indigo-500
            dark:text-white
          `}
        >
          <span className={selectedOption ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-slate-600'}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronDown className="w-4 h-4 transition-transform rotate-180" />
        </div>
      ) : (
        <div
          id={id}
          title={title || label}
          role="combobox"
          aria-expanded="false"
          aria-haspopup="listbox"
          aria-controls={`${id}-listbox`}
          tabIndex={0}
          onClick={() => setIsOpen(true)}
          className={`
            w-full p-4 bg-gray-50 dark:bg-slate-900/50
            rounded-2xl text-sm font-bold
            flex justify-between items-center
            cursor-pointer transition-all border-2
            border-transparent
            dark:text-white
          `}
        >
          <span className={selectedOption ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-slate-600'}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronDown className="w-4 h-4 transition-transform" />
        </div>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: openUpward ? 10 : -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: openUpward ? 10 : -10 }}
            id={`${id}-listbox`}
            role="listbox"
            className={`absolute z-[9999] left-0 right-0 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-700 overflow-hidden ${openUpward ? 'bottom-full mb-2' : 'mt-2'
              }`}
          >
            <div className="p-3 border-b border-gray-50 dark:border-slate-700 flex items-center gap-2">
              <Search className="w-4 h-4 text-gray-400" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search or add new..."
                className="w-full bg-transparent border-none focus:ring-0 text-sm font-bold dark:text-white dark:placeholder-slate-600"
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            <div className="max-h-60 overflow-y-auto custom-scrollbar" role="presentation">
              {filteredOptions.length > 0 ? (
                filteredOptions.map(opt => (
                  <div
                    key={opt.value}
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange(opt.value, opt.category);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className={`
                      px-4 py-3 text-sm font-bold cursor-pointer flex justify-between items-center transition-colors
                      ${value === opt.value ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50'}
                    `}
                  >
                    <div className="flex flex-col">
                      <span>{opt.label}</span>
                      {opt.category && <span className="text-[10px] opacity-50 uppercase tracking-tighter">{opt.category}</span>}
                    </div>
                    {value === opt.value && <Check className="w-4 h-4" />}
                  </div>
                ))
              ) : !showCustomOption && (
                <div className="px-4 py-6 text-center text-gray-400 dark:text-slate-600 italic text-xs">
                  No matching options found
                </div>
              )}

              {showCustomOption && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(search, 'Hardware'); // Default to Hardware for new ones
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className="px-4 py-4 bg-indigo-50/50 dark:bg-indigo-900/10 text-indigo-600 dark:text-indigo-400 cursor-pointer flex items-center gap-3 border-t border-indigo-100 dark:border-indigo-900/20"
                >
                  <div className="p-1 bg-indigo-600 text-white rounded-lg">
                    <Plus className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-black uppercase tracking-widest">Add New Category</span>
                    <span className="text-sm font-black">"{search}"</span>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SearchableSelect;
