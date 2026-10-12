import React, { useState, useEffect } from 'react';
import {
  FunnelIcon,
  CalendarIcon,
  UserIcon,
  BriefcaseIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

interface FilterOption {
  value: string;
  label: string;
}

interface DashboardFiltersProps {
  onFiltersChange: (filters: FilterState) => void;
  loading?: boolean;
  employees?: FilterOption[];
  projects?: FilterOption[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onReset: () => void;
}

export interface FilterState {
  dateRange: {
    from: string;
    to: string;
  };
  employeeIds: string[];
  projectIds: string[];
  status: string;
  granularity: 'daily' | 'weekly' | 'monthly';
}

const DashboardFilters: React.FC<DashboardFiltersProps> = ({
  onFiltersChange,
  loading = false,
  employees = [],
  projects = [],
  searchQuery,
  onSearchChange,
  onReset
}) => {
  const [filters, setFilters] = useState<FilterState>({
    dateRange: {
      from: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
      to: new Date().toISOString().split('T')[0]
    },
    employeeIds: [],
    projectIds: [],
    status: 'all',
    granularity: 'daily'
  });

  const updateFilters = (newFilters: Partial<FilterState>) => {
    const updatedFilters = { ...filters, ...newFilters };
    setFilters(updatedFilters);
    onFiltersChange(updatedFilters);
  };

  return (
    <div className="bg-white p-3 rounded-2xl shadow-sm border border-secondary-100 flex flex-wrap items-center gap-3">
      {/* Search Bar */}
      <div className="relative flex-1 min-w-[240px]">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400" />
        <input
          type="text"
          placeholder="Search anything (employee, client, project...)"
          className="w-full pl-10 pr-4 py-2 bg-secondary-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-primary-500 transition-all"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {/* Date Range Group */}
      <div className="flex items-center gap-2 bg-secondary-50 p-1 rounded-xl border border-secondary-100">
        <div className="flex items-center gap-2 px-2">
          <CalendarIcon className="w-4 h-4 text-secondary-400" />
          <input
            type="date"
            value={filters.dateRange.from}
            onChange={(e) => updateFilters({ dateRange: { ...filters.dateRange, from: e.target.value } })}
            className="bg-transparent border-none p-1 text-xs font-bold text-secondary-700 focus:ring-0 w-32"
            title="From Date"
          />
        </div>
        <div className="w-px h-4 bg-secondary-200" />
        <div className="flex items-center gap-2 px-2">
          <input
            type="date"
            value={filters.dateRange.to}
            onChange={(e) => updateFilters({ dateRange: { ...filters.dateRange, to: e.target.value } })}
            className="bg-transparent border-none p-1 text-xs font-bold text-secondary-700 focus:ring-0 w-32"
            title="To Date"
          />
        </div>
      </div>

      {/* Selects Group */}
      <div className="flex items-center gap-2">
        <select
          value={filters.employeeIds[0] || ''}
          onChange={(e) => updateFilters({ employeeIds: e.target.value ? [e.target.value] : [] })}
          className="bg-white border border-secondary-200 rounded-xl px-3 py-2 text-xs font-bold text-secondary-700 focus:ring-2 focus:ring-primary-500 transition-all outline-none"
          title="Filter by Employee"
        >
          <option value="">All Employees</option>
          {employees.map(emp => <option key={emp.value} value={emp.value}>{emp.label}</option>)}
        </select>

        <select
          value={filters.projectIds[0] || ''}
          onChange={(e) => updateFilters({ projectIds: e.target.value ? [e.target.value] : [] })}
          className="bg-white border border-secondary-200 rounded-xl px-3 py-2 text-xs font-bold text-secondary-700 focus:ring-2 focus:ring-primary-500 transition-all outline-none"
          title="Filter by Project"
        >
          <option value="">All Projects</option>
          {projects.map(proj => <option key={proj.value} value={proj.value}>{proj.label}</option>)}
        </select>
      </div>

      {/* Reset Button */}
      <button
        onClick={onReset}
        className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-secondary-500 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all"
        title="Reset all filters"
      >
        <ArrowPathIcon className="w-3.5 h-3.5" />
        Reset
      </button>
    </div>
  );
};

export default DashboardFilters;
