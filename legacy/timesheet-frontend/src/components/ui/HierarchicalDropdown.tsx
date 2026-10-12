import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronRight, Check } from 'lucide-react';

export interface Subcategory {
  id: string;
  categoryName: string;
  description?: string;
  isActive: boolean;
  displayOrder: number;
}

export interface Category {
  id: string;
  categoryName: string;
  description?: string;
  isActive: boolean;
  displayOrder: number;
  subcategories: Subcategory[];
}

interface HierarchicalDropdownProps {
  categories: Category[];
  selectedCategoryId: string | null;
  selectedSubcategoryId: string | null;
  onChange: (categoryId: string | null, subcategoryId: string | null, categoryText: string) => void;
  label?: string;
  placeholder?: string;
  error?: string;
}

const HierarchicalDropdown: React.FC<HierarchicalDropdownProps> = ({
  categories,
  selectedCategoryId,
  selectedSubcategoryId,
  onChange,
  label = 'Need help regarding',
  placeholder = 'Select a category...',
  error
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredCategory, setHoveredCategory] = useState<Category | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset hovered category on close
  useEffect(() => {
    if (!isOpen) {
      setHoveredCategory(null);
    }
  }, [isOpen]);

  const activeCategories = categories.filter(c => c.isActive);

  // Find currently selected names for label display
  const selectedParent = categories.find(c => c.id === selectedCategoryId);
  const selectedSub = selectedParent?.subcategories.find(s => s.id === selectedSubcategoryId);

  const displayValue = selectedSub
    ? `${selectedParent?.categoryName} ➔ ${selectedSub.categoryName}`
    : selectedParent
    ? selectedParent.categoryName
    : '';

  // Handle category/subcategory selection
  const handleSelect = (category: Category, subcategory: Subcategory) => {
    onChange(category.id, subcategory.id, `${category.categoryName} - ${subcategory.categoryName}`);
    setIsOpen(false);
    setSearchQuery('');
  };

  // Instant filter search logic
  const getFilteredData = () => {
    if (!searchQuery.trim()) return null;

    const query = searchQuery.toLowerCase();
    const results: { category: Category; subcategory: Subcategory; path: string }[] = [];

    activeCategories.forEach(cat => {
      cat.subcategories.forEach(sub => {
        if (
          sub.categoryName.toLowerCase().includes(query) ||
          cat.categoryName.toLowerCase().includes(query)
        ) {
          results.push({
            category: cat,
            subcategory: sub,
            path: `${cat.categoryName} ➔ ${sub.categoryName}`
          });
        }
      });
    });

    return results;
  };

  const filteredResults = getFilteredData();

  return (
    <div className="space-y-2 relative" ref={containerRef}>
      {label && (
        <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 block">
          {label}
        </label>
      )}

      {/* Main trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full p-4 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100/30 dark:hover:bg-slate-800 border text-left text-xs font-bold rounded-2xl transition-all focus:ring-2 focus:ring-indigo-500/20 outline-none flex items-center justify-between ${
          error
            ? 'border-rose-500 ring-2 ring-rose-550/10'
            : isOpen
            ? 'border-indigo-500/50 ring-2 ring-indigo-500/20 bg-white dark:bg-slate-950'
            : 'border-transparent'
        }`}
      >
        <span className={displayValue ? 'text-slate-800 dark:text-white' : 'text-slate-400 dark:text-slate-500'}>
          {displayValue || placeholder}
        </span>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {error && (
        <p className="text-[10px] font-bold text-rose-500 ml-1">{error}</p>
      )}

      {/* Dropdown list panel */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute z-[1050] left-0 mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl overflow-hidden flex flex-col md:flex-row min-h-[260px] max-h-[380px]"
        >
          {/* Main Menu Panel / Search list */}
          <div className="flex-1 flex flex-col border-r border-slate-100 dark:border-slate-800 min-w-[200px]">
            {/* Search Input bar */}
            <div className="p-3 border-b border-slate-100 dark:border-slate-800 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-6 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search queries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-850 border border-slate-100 dark:border-slate-800 focus:border-indigo-500/50 focus:bg-white dark:focus:bg-slate-950 text-xs font-bold text-slate-800 dark:text-white rounded-xl transition-all outline-none"
              />
            </div>

            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto no-scrollbar py-2">
              {filteredResults !== null ? (
                // Search list view
                filteredResults.length === 0 ? (
                  <div className="p-6 text-center text-[11px] font-bold text-slate-400 dark:text-slate-500">
                    No matching categories found
                  </div>
                ) : (
                  filteredResults.map(({ category, subcategory, path }) => {
                    const isSelected = selectedSubcategoryId === subcategory.id;
                    return (
                      <button
                        key={subcategory.id}
                        type="button"
                        onClick={() => handleSelect(category, subcategory)}
                        className={`w-full px-4 py-2.5 text-left text-xs font-bold transition-colors flex items-center justify-between ${
                          isSelected
                            ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <span>{path}</span>
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </button>
                    );
                  })
                )
              ) : (
                // Main categories list
                activeCategories.map((cat) => {
                  const isHovered = hoveredCategory?.id === cat.id;
                  const hasSelectedSub = selectedCategoryId === cat.id;
                  return (
                    <div
                      key={cat.id}
                      onMouseEnter={() => setHoveredCategory(cat)}
                      className={`relative group`}
                    >
                      <button
                        type="button"
                        onClick={() => setHoveredCategory(cat)}
                        className={`w-full px-4 py-3 text-left text-xs font-black transition-all flex items-center justify-between outline-none ${
                          isHovered || hasSelectedSub
                            ? 'bg-indigo-50/70 dark:bg-indigo-950/30 text-indigo-650 dark:text-indigo-400 font-extrabold'
                            : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/30 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        <span className="truncate">{cat.categoryName}</span>
                        <ChevronRight className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isHovered ? 'translate-x-0.5' : ''}`} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Nested Subcategories Sub-menu Panel */}
          {filteredResults === null && (
            <div className="flex-1 bg-slate-50/50 dark:bg-slate-950/10 min-w-[200px] flex flex-col max-h-[380px] overflow-y-auto border-t md:border-t-0 border-slate-100 dark:border-slate-800">
              {hoveredCategory ? (
                <>
                  <div className="px-4 py-3.5 border-b border-slate-100 dark:border-slate-800/60 bg-white/20 dark:bg-slate-900/10 flex-shrink-0">
                    <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">
                      {hoveredCategory.categoryName} Issues
                    </span>
                    {hoveredCategory.description && (
                      <p className="text-[9px] text-slate-400 dark:text-slate-500 font-semibold mt-0.5 leading-snug">
                        {hoveredCategory.description}
                      </p>
                    )}
                  </div>
                  <div className="flex-1 py-2 overflow-y-auto no-scrollbar">
                    {hoveredCategory.subcategories.filter(s => s.isActive).length === 0 ? (
                      <div className="p-6 text-center text-[10px] font-bold text-slate-400">
                        No active subcategories
                      </div>
                    ) : (
                      hoveredCategory.subcategories
                        .filter(s => s.isActive)
                        .map((sub) => {
                          const isSelected = selectedSubcategoryId === sub.id;
                          return (
                            <button
                              key={sub.id}
                              type="button"
                              onClick={() => handleSelect(hoveredCategory, sub)}
                              className={`w-full px-5 py-2.5 text-left text-xs font-bold transition-all flex items-center justify-between ${
                                isSelected
                                  ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-extrabold'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              <span>{sub.categoryName}</span>
                              {isSelected && <Check className="w-3.5 h-3.5 text-indigo-500" />}
                            </button>
                          );
                        })
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center p-6 text-center text-[11px] font-bold text-slate-400 dark:text-slate-500">
                  Hover or select a category to view items
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default HierarchicalDropdown;
