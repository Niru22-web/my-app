import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

// UI Components
import Button from './ui/Button';
import Input from './ui/Input';
import Select from './ui/Select';

interface FilterPanelProps {
  onFiltersChange: (filters: any) => void;
  showEmployeeFilter?: boolean;
  loading?: boolean;
}

const FilterPanel: React.FC<FilterPanelProps> = ({ 
  onFiltersChange, 
  showEmployeeFilter = false,
  loading = false 
}) => {
  const [filters, setFilters] = useState({
    dateRange: 'thisMonth',
    client: '',
    project: '',
    job: '',
    employee: '',
    search: ''
  });

  const [isExpanded, setIsExpanded] = useState(false);

  const handleFilterChange = (key: string, value: string) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const clearFilters = () => {
    const clearedFilters = {
      dateRange: 'thisMonth',
      client: '',
      project: '',
      job: '',
      employee: '',
      search: ''
    };
    setFilters(clearedFilters);
    onFiltersChange(clearedFilters);
  };

  const hasActiveFilters = filters.client || filters.project || filters.job || 
    (showEmployeeFilter && filters.employee) || filters.search || 
    filters.dateRange !== 'thisMonth';

  return (
    <div className="bg-white dark:bg-[#0E1626] rounded-2xl border border-slate-150 dark:border-slate-800/40 shadow-sm overflow-hidden transition-colors">
      {/* Filter Toggle */}
      <div className="flex items-center justify-between p-4 border-b border-slate-150 dark:border-slate-800/40">
        <div className="flex items-center gap-3">
          <FunnelIcon className="w-5 h-5 text-slate-400" />
          <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">Filters</h3>
          {hasActiveFilters && (
            <span className="px-2.5 py-1 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-[10px] font-black rounded-full border border-blue-100 dark:border-transparent uppercase tracking-wider">
              Active
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              leftIcon={<XMarkIcon className="w-4 h-4" />}
              className="rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Clear
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            rightIcon={
              <CalendarIcon className={`w-4 h-4 transition-transform duration-250 ${isExpanded ? 'rotate-180' : ''}`} />
            }
            className="rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </Button>
        </div>
      </div>

      {/* Filter Content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden bg-slate-50/50 dark:bg-slate-900/10"
          >
            <div className="p-4 space-y-4 border-b border-slate-150 dark:border-slate-800/40">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Date Range Filter */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                    Date Range
                  </label>
                  <Select
                    value={filters.dateRange}
                    onChange={(e) => handleFilterChange('dateRange', e.target.value)}
                    className="w-full rounded-xl"
                  >
                    <option value="today">Today</option>
                    <option value="thisWeek">This Week</option>
                    <option value="thisMonth">This Month</option>
                    <option value="lastMonth">Last Month</option>
                    <option value="thisQuarter">This Quarter</option>
                    <option value="thisYear">This Year</option>
                    <option value="custom">Custom Range</option>
                  </Select>
                </div>

                {/* Client Filter */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                    Client
                  </label>
                  <Input
                    type="text"
                    placeholder="All Clients"
                    value={filters.client}
                    onChange={(e) => handleFilterChange('client', e.target.value)}
                    className="w-full rounded-xl"
                  />
                </div>

                {/* Project Filter */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                    Project
                  </label>
                  <Input
                    type="text"
                    placeholder="All Projects"
                    value={filters.project}
                    onChange={(e) => handleFilterChange('project', e.target.value)}
                    className="w-full rounded-xl"
                  />
                </div>

                {/* Job Filter */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                    Job
                  </label>
                  <Input
                    type="text"
                    placeholder="All Jobs"
                    value={filters.job}
                    onChange={(e) => handleFilterChange('job', e.target.value)}
                    className="w-full rounded-xl"
                  />
                </div>

                {/* Employee Filter (conditional) */}
                {showEmployeeFilter && (
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                      Employee
                    </label>
                    <Input
                      type="text"
                      placeholder="All Employees"
                      value={filters.employee}
                      onChange={(e) => handleFilterChange('employee', e.target.value)}
                      className="w-full rounded-xl"
                    />
                  </div>
                )}

                {/* Search Filter */}
                <div className={showEmployeeFilter ? 'md:col-span-2' : 'lg:col-span-4'}>
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                    Search
                  </label>
                  <div className="relative">
                    <Input
                      type="text"
                      placeholder="Search timelogs..."
                      value={filters.search}
                      onChange={(e) => handleFilterChange('search', e.target.value)}
                      leftIcon={<MagnifyingGlassIcon className="w-5 h-5 text-slate-400" />}
                      className="w-full rounded-xl"
                    />
                  </div>
                </div>
              </div>

              {/* Filter Actions */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-4 border-t border-slate-100 dark:border-slate-800/20">
                <p className="text-xs text-slate-400 font-semibold italic">
                  {hasActiveFilters 
                    ? 'Filters are applied to the results below' 
                    : 'No filters applied - showing all results'
                  }
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={clearFilters}
                    disabled={!hasActiveFilters}
                    className="rounded-xl font-bold"
                  >
                    Reset Filters
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={loading}
                    className="rounded-xl font-bold"
                  >
                    {loading ? 'Applying...' : 'Apply Filters'}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FilterPanel;
