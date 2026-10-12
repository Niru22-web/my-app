import React from 'react';
import { FluentProvider, webDarkTheme, webLightTheme } from '@fluentui/react-components';
import { format, subDays } from 'date-fns';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import ReportsToolbar from '../components/reports-modern/ReportsToolbar';
import ReportsKpis from '../components/reports-modern/ReportsKpis';
import ReportsVisuals from '../components/reports-modern/ReportsVisuals';
import ReportsTables from '../components/reports-modern/ReportsTables';
import { downloadReportsExport, loadReportsChart, loadReportsOptions, loadReportsOverview } from '../components/reports-modern/reports.api';
import type { ReportChartRow, ReportOverview, ReportsFilterOptions, ReportsFilterState, ReportsTab } from '../components/reports-modern/reports.types';

const defaultFilters = (): ReportsFilterState => {
  const today = new Date();
  return {
    fromDate: format(subDays(today, 29), 'yyyy-MM-dd'),
    toDate: format(today, 'yyyy-MM-dd'),
    granularity: 'day',
    employeeIds: [],
    projectIds: [],
    departmentIds: [],
    statuses: []
  };
};

const Reports: React.FC = () => {
  const { themeMode } = useTheme();
  const { user } = useAuth();
  const [tab, setTab] = React.useState<ReportsTab>('executive');
  const [filters, setFilters] = React.useState<ReportsFilterState>(defaultFilters);
  const [overview, setOverview] = React.useState<ReportOverview | null>(null);
  const [chartData, setChartData] = React.useState<ReportChartRow[]>([]);
  const [options, setOptions] = React.useState<ReportsFilterOptions | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const isDark = themeMode === 'dark';

  const loadWorkspace = React.useCallback(async (nextFilters = filters, nextTab = tab) => {
    try {
      setRefreshing(true);
      const [overviewData, chartRows] = await Promise.all([
        loadReportsOverview(nextFilters),
        loadReportsChart(nextTab, nextFilters)
      ]);
      setOverview(overviewData);
      setChartData(chartRows);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filters, tab]);

  React.useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        const filterOptions = await loadReportsOptions();
        if (!active) return;
        setOptions(filterOptions);
      } catch (error) {
        console.error('Failed to load report filters', error);
      }
    };

    bootstrap();

    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      loadWorkspace(filters, tab).catch(error => console.error('Failed to refresh reports', error));
    }, 180);

    return () => window.clearTimeout(timer);
  }, [filters, tab, loadWorkspace]);

  const handleExport = React.useCallback(async (formatType: 'xlsx' | 'csv') => {
    await downloadReportsExport(filters, formatType);
  }, [filters]);

  const visibleChartData = React.useMemo(() => {
    if (!searchTerm) return chartData;
    const normalized = searchTerm.toLowerCase();
    return chartData.filter(row =>
      [row.label, row.value, row.count, row.hours, row.sessions, row.attendanceHours]
        .some(value => String(value ?? '').toLowerCase().includes(normalized))
    );
  }, [chartData, searchTerm]);

  const visibleOverview = React.useMemo(() => {
    if (!overview || !searchTerm) return overview;
    const normalized = searchTerm.toLowerCase();
    return {
      ...overview,
      recentActivity: overview.recentActivity.filter(item =>
        [item.label, item.detail, item.timestamp].some(value => String(value).toLowerCase().includes(normalized))
      )
    };
  }, [overview, searchTerm]);

  const heroTone = isDark
    ? 'from-slate-950 via-slate-900 to-slate-800'
    : 'from-[#F8FAFC] via-white to-[#EEF4FF]';

  return (
    <FluentProvider theme={isDark ? webDarkTheme : webLightTheme} className="h-full bg-transparent min-h-screen">
      <div className="space-y-5">
        <div className={`relative overflow-hidden rounded-[32px] border border-slate-200/70 bg-gradient-to-br ${heroTone} p-5 lg:p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]`}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.22),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(6,182,212,0.16),transparent_26%)]" />
          <div className="relative flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">Portal / Reports</p>
                <h1 className="mt-2 text-3xl lg:text-4xl font-black tracking-tight text-slate-950">
                  Executive Analytics Dashboard
                </h1>
                <p className="mt-2 max-w-3xl text-sm lg:text-base text-slate-600">
                  Interactive reporting metrics, visual trends, workforce KPIs, and timesheet performance insights.
                </p>
              </div>

              <div className="rounded-[24px] border border-white/70 bg-white/80 px-4 py-3 backdrop-blur-xl">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Signed in as</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{user?.name || user?.firstName || 'Current user'}</p>
                <p className="text-xs text-slate-500">{user?.role || 'Employee'}</p>
              </div>
            </div>
          </div>
        </div>

        <ReportsToolbar
          tab={tab}
          onTabChange={setTab}
          filters={filters}
          onFiltersChange={setFilters}
          options={options}
          onRefresh={() => loadWorkspace(filters, tab).catch(error => console.error(error))}
          onReset={() => {
            setTab('executive');
            setFilters(defaultFilters());
            setSearchTerm('');
          }}
          onExport={handleExport}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          loading={refreshing}
        />

        <ReportsKpis overview={overview} loading={loading} />

        <ReportsVisuals
          tab={tab}
          overview={visibleOverview}
          chartData={visibleChartData}
          loading={loading || refreshing}
        />

        <ReportsTables overview={visibleOverview} tab={tab} searchTerm={searchTerm} />
      </div>
    </FluentProvider>
  );
};

export default Reports;
