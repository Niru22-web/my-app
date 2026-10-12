import React, { useState, useRef, useEffect } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';

interface MultiSelectProps {
  options: Array<{ value: string; label: string }>;
  selectedValues: string[];
  onChange: (selectedIds: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  label?: string;
  compact?: boolean;
}

const MultiSelect: React.FC<MultiSelectProps> = ({
  options,
  selectedValues,
  onChange,
  placeholder = 'Select options...',
  className = '',
  disabled = false,
  label,
  compact = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [openUpward, setOpenUpward] = useState(false);

  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      if (spaceBelow < 320 && spaceAbove > spaceBelow) {
        setOpenUpward(true);
      } else {
        setOpenUpward(false);
      }
    }
  }, [isOpen]);

  // Filter options based on search term
  const filteredOptions = options.filter(option =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get selected option labels
  const selectedLabels = selectedValues.map(value =>
    options.find(option => option.value === value)?.label || value
  );

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Toggle option selection
  const toggleOption = (value: string) => {
    const newSelectedValues = selectedValues.includes(value)
      ? selectedValues.filter(v => v !== value)
      : [...selectedValues, value];
    
    onChange(newSelectedValues);
  };


  // Clear all selections
  const clearAll = () => {
    onChange([]);
    setSearchTerm('');
  };

  const getTriggerText = () => {
    if (selectedValues.length === 0) {
      return 'All';
    }
    if (selectedValues.length <= 2) {
      return selectedLabels.join(', ');
    }
    return `${selectedValues.length} Selected`;
  };

  return (
    <div
      className={`relative w-full sm:w-auto ${compact ? 'sm:min-w-[110px]' : 'sm:min-w-[160px]'} ${className}`}
      ref={dropdownRef}
    >
      {/* Selected Items Display */}
      <div
        className={`
          ${compact ? 'h-9 px-2.5' : 'h-11 px-4'} bg-white border border-secondary-200 rounded-xl
          flex items-center gap-2 cursor-pointer select-none
          hover:border-secondary-300 hover:bg-secondary-50/30 transition-all
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${isOpen ? 'ring-4 ring-primary-500/10 border-primary-500 bg-secondary-50/20' : ''}
        `}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <div className={`${compact ? 'text-xs gap-1' : 'text-sm gap-1.5'} flex items-center truncate pr-1.5`}>
          {label && <span className="font-semibold text-secondary-400 whitespace-nowrap">{label}:</span>}
          <span className="font-bold text-secondary-900 truncate">
            {getTriggerText()}
          </span>
        </div>

        {/* Dropdown Arrow */}
        <div className="ml-auto flex-shrink-0">
          <ChevronDownIcon className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-secondary-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-primary-500' : ''
          }`} />
        </div>
      </div>

      {/* Dropdown Options */}
      {isOpen && (
        <div className={`absolute z-[9999] w-full ${compact ? 'sm:w-52' : 'sm:w-64'} bg-white border border-secondary-100 rounded-xl shadow-xl max-h-72 overflow-hidden animate-in fade-in duration-150 ${
          openUpward ? 'bottom-full mb-2 slide-in-from-bottom-2' : 'mt-2 slide-in-from-top-2'
        }`}>
          {/* Search Input */}
          <div className="p-2.5 border-b border-secondary-50 bg-secondary-50/20">
            <input
              type="text"
              placeholder={placeholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-secondary-200 rounded-lg text-xs outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-500/5 transition-all"
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* Options List */}
          <div className="max-h-44 overflow-y-auto custom-scrollbar p-1 space-y-0.5">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-secondary-400 text-xs italic">
                No options found
              </div>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = selectedValues.includes(option.value);
                return (
                  <div
                    key={option.value}
                    className={`
                      px-3 py-2 cursor-pointer rounded-lg transition-colors
                      flex items-center gap-2 text-xs font-semibold
                      ${isSelected ? 'bg-primary-50/80 text-primary-700' : 'text-secondary-600 hover:bg-secondary-50/50 hover:text-secondary-800'}
                    `}
                    onClick={() => toggleOption(option.value)}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="rounded border-secondary-300 text-primary-600 focus:ring-primary-500 w-3.5 h-3.5"
                      onClick={(e) => e.stopPropagation()}
                      title={`Select ${option.label}`}
                      aria-label={`Select ${option.label}`}
                    />
                    <span className="flex-1 truncate">{option.label}</span>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Actions */}
          {selectedValues.length > 0 && (
            <div className="p-2 border-t border-secondary-50 bg-secondary-50/10 flex justify-between items-center px-3">
              <span className="text-[10px] font-bold text-secondary-400 uppercase tracking-wider">
                {selectedValues.length} selected
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  clearAll();
                }}
                className="text-[10px] font-black text-rose-600 hover:text-rose-700 hover:underline uppercase tracking-wider transition-colors"
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

export default MultiSelect;
