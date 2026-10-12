import React from 'react';
import {
  Button,
  Card,
  Field,
  Combobox,
  Dropdown,
  Input,
  Option,
  Tab,
  TabList,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem
} from '@fluentui/react-components';
import { ArrowClockwiseRegular, ArrowDownloadRegular, CalendarRegular, FilterDismissRegular, SearchRegular } from '@fluentui/react-icons';
import type { ReportsFilterOptions, ReportsFilterState, ReportsTab } from './reports.types';

interface ReportsToolbarProps {
  tab: ReportsTab;
  onTabChange: (tab: ReportsTab) => void;
  filters: ReportsFilterState;
  onFiltersChange: (filters: ReportsFilterState) => void;
  options: ReportsFilterOptions | null;
  onRefresh: () => void;
  onReset: () => void;
  onExport: (format: 'xlsx' | 'csv') => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  loading: boolean;
}

const tabItems: Array<{ value: ReportsTab; label: string }> = [
  { value: 'executive', label: 'Executive' },
  { value: 'workforce', label: 'Workforce' },
  { value: 'projects', label: 'Projects' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'finance', label: 'Finance' },
  { value: 'leave', label: 'Leave' }
];

const statusFilterOptions = [
  'billable',
  'non_billable',
  'submitted',
  'approved',
  'rejected'
];

const renderValue = (selected: string[], fallback: string, options: Array<{ value: string; label: string }>) => {
  if (!selected.length) return fallback;
  const labels = selected
    .map(value => options.find(option => option.value === value)?.label || value)
    .filter(Boolean);
  return labels.length > 2 ? `${labels.slice(0, 2).join(', ')} +${labels.length - 2}` : labels.join(', ');
};

const ReportsToolbar: React.FC<ReportsToolbarProps> = ({
  tab,
  onTabChange,
  filters,
  onFiltersChange,
  options,
  onRefresh,
  onReset,
  onExport,
  searchTerm,
  onSearchChange,
  loading
}) => {
  const updateFilters = (partial: Partial<ReportsFilterState>) => {
    onFiltersChange({ ...filters, ...partial });
  };

  const clearEmployeeIds = () => updateFilters({ employeeIds: [] });
  const clearProjectIds = () => updateFilters({ projectIds: [] });
  const clearDepartmentIds = () => updateFilters({ departmentIds: [] });

  const employeeOptions = options?.employees || [];
  const projectOptions = options?.projects || [];
  const departmentOptions = options?.departments || [];
  const statusOptions = options?.statuses || { attendance: [], leaves: [], reimbursements: [], timelogs: [] };

  const activeStatuses = tab === 'attendance'
    ? statusOptions.attendance
    : tab === 'finance'
      ? statusOptions.reimbursements
      : tab === 'leave'
        ? statusOptions.leaves
        : statusOptions.timelogs;

  return (
    <Card className="border border-slate-200/60 bg-white/90 backdrop-blur-xl shadow-[0_18px_60px_rgba(15,23,42,0.08)] rounded-[28px]">
      <div className="p-4 lg:p-5 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center gap-4 justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
              <span>Reports</span>
              <span className="text-slate-300">/</span>
              <span className="text-[#1D4ED8]">Analytics Workspace</span>
            </div>
            <h2 className="text-xl md:text-2xl font-black tracking-tight text-slate-900">
              Analytics canvas
            </h2>
            <p className="text-xs text-slate-500 max-w-3xl">
              Consolidate workforce, financial, and operational efforts in a unified SaaS reporting workspace.
            </p>
          </div>
 
          <div className="flex items-center gap-3 flex-wrap">
            <div className="min-w-[240px]">
              <Field label="Search">
                <Input
                  contentBefore={<SearchRegular />}
                  value={searchTerm}
                  onChange={(_, data) => onSearchChange(data.value)}
                  placeholder="Search rows, labels, metrics"
                />
              </Field>
            </div>
 
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <Button appearance="primary" icon={<ArrowDownloadRegular />}>
                  Export
                </Button>
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  <MenuItem onClick={() => onExport('xlsx')}>Excel workbook</MenuItem>
                  <MenuItem onClick={() => onExport('csv')}>CSV snapshot</MenuItem>
                </MenuList>
              </MenuPopover>
            </Menu>
 
            <Button appearance="secondary" icon={<ArrowClockwiseRegular />} onClick={onRefresh} disabled={loading}>
              Refresh
            </Button>
            <Button appearance="subtle" icon={<FilterDismissRegular />} onClick={onReset}>
              Reset
            </Button>
          </div>
        </div>
 
        {/* Rearranged Tabs & Filters Section */}
        <div className="space-y-4">
          <div className="border-b border-slate-100 pb-0.5">
            <TabList selectedValue={tab} onTabSelect={(_, data) => onTabChange(data.value as ReportsTab)}>
              {tabItems.map(item => (
                <Tab key={item.value} value={item.value}>
                  {item.label}
                </Tab>
              ))}
            </TabList>
          </div>
 
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 pt-1">
            <Field label="From">
              <Input
                type="date"
                value={filters.fromDate}
                contentBefore={<CalendarRegular />}
                onChange={(_, data) => updateFilters({ fromDate: data.value })}
                className="w-full"
              />
            </Field>
            <Field label="To">
              <Input
                type="date"
                value={filters.toDate}
                contentBefore={<CalendarRegular />}
                onChange={(_, data) => updateFilters({ toDate: data.value })}
                className="w-full"
              />
            </Field>
            <Field label="Granularity">
              <Dropdown
                selectedOptions={[filters.granularity]}
                value={filters.granularity.charAt(0).toUpperCase() + filters.granularity.slice(1)}
                onOptionSelect={(_, data) => {
                  const nextValue = data.optionValue as ReportsFilterState['granularity'] | undefined;
                  if (nextValue) {
                    updateFilters({ granularity: nextValue });
                  }
                }}
                className="w-full"
              >
                <Option value="day">Day</Option>
                <Option value="week">Week</Option>
                <Option value="month">Month</Option>
              </Dropdown>
            </Field>
            <Field label="Employees">
              <div className="flex items-center gap-2">
                <Combobox
                  multiselect
                  placeholder="All employees"
                  value={renderValue(filters.employeeIds, 'All employees', employeeOptions)}
                  selectedOptions={filters.employeeIds}
                  onOptionSelect={(_, data) => updateFilters({ employeeIds: data.selectedOptions })}
                  className="flex-1"
                >
                  {employeeOptions.map(option => (
                    <Option key={option.value} value={option.value}>
                      {option.label}
                    </Option>
                  ))}
                </Combobox>
                <Button appearance="subtle" size="small" onClick={clearEmployeeIds} disabled={!filters.employeeIds.length}>
                  Clear
                </Button>
              </div>
            </Field>
            <Field label="Projects">
              <div className="flex items-center gap-2">
                <Combobox
                  multiselect
                  placeholder="All projects"
                  value={renderValue(filters.projectIds, 'All projects', projectOptions)}
                  selectedOptions={filters.projectIds}
                  onOptionSelect={(_, data) => updateFilters({ projectIds: data.selectedOptions })}
                  className="flex-1"
                >
                  {projectOptions.map(option => (
                    <Option key={option.value} value={option.value}>
                      {option.label}
                    </Option>
                  ))}
                </Combobox>
                <Button appearance="subtle" size="small" onClick={clearProjectIds} disabled={!filters.projectIds.length}>
                  Clear
                </Button>
              </div>
            </Field>
            <Field label="Departments">
              <div className="flex items-center gap-2">
                <Combobox
                  multiselect
                  placeholder="All departments"
                  value={renderValue(filters.departmentIds, 'All departments', departmentOptions)}
                  selectedOptions={filters.departmentIds}
                  onOptionSelect={(_, data) => updateFilters({ departmentIds: data.selectedOptions })}
                  className="flex-1"
                >
                  {departmentOptions.map(option => (
                    <Option key={option.value} value={option.value}>
                      {option.label}
                    </Option>
                  ))}
                </Combobox>
                <Button appearance="subtle" size="small" onClick={clearDepartmentIds} disabled={!filters.departmentIds.length}>
                  Clear
                </Button>
              </div>
            </Field>
          </div>
        </div>
 
        <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-slate-100/60">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">STATUS FILTERS:</span>
          <div className="flex flex-wrap items-center gap-2">
            {statusFilterOptions.map(status => {
              const active = filters.statuses.includes(status);
              return (
                <button
                  key={status}
                  onClick={() => {
                    const exists = filters.statuses.includes(status);
                    updateFilters({
                      statuses: exists
                        ? filters.statuses.filter(item => item !== status)
                        : [...filters.statuses, status]
                    });
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all duration-200 ${
                    active
                      ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200/60'
                  }`}
                >
                  {status.replace('_', ' ')}
                </button>
              );
            })}
            {filters.statuses.length > 0 && (
              <button
                onClick={() => updateFilters({ statuses: [] })}
                className="text-xs font-bold text-slate-400 hover:text-red-500 transition-colors ml-1"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};

export default ReportsToolbar;
