import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import API from '../api';
import PremiumKPIGrid from '../components/analytics/PremiumKPIGrid';
import PremiumFilters, { FilterState } from '../components/analytics/PremiumFilters';
import InteractiveBarChart from '../components/analytics/InteractiveBarChart';
import TrendLineChart from '../components/analytics/TrendLineChart';
import InteractivePieChart from '../components/analytics/InteractivePieChart';
import DrillDownTable from '../components/analytics/DrillDownTable';
import { 
  ArrowPathIcon, 
  DocumentArrowDownIcon, 
  FunnelIcon,
  ChartBarIcon,
  UserGroupIcon,
  BriefcaseIcon,
  ClockIcon,
  CalendarIcon
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';

interface DashboardData {
  totalHours: number;
  totalEmployees: number;
  totalProjects: number;
  pendingTimesheets: number;
  averageHoursPerEmployee: number;
  utilizationRate: number;
  employeeHours: Record<string, number>;
  projectHours: Record<string, number>;
  trends: {
    totalHours: number;
    totalEmployees: number;
    totalProjects: number;
    pendingTimesheets: number;
  };
}

interface EmployeeHoursData {
  employeeId: string;
  employeeName: string;
  email: string;
  totalHours: number;
  projects: Record<string, number>;
  dailyHours: Array<{
    date: string;
    hours: number;
    project: string;
    status: string;
  }>;
}

interface ProjectDistributionData {
  projectId: string;
  projectName: string;
  clientName: string;
  totalHours: number;
  employeeCount: number;
}

interface TrendData {
  date: string;
  totalHours: number;
  employeeCount: number;
  projectCount: number;
}

interface DrillDownRecord {
  id: string;
  employee: string;
  project: string;
  date: string;
  hours: number;
  status: string;
}

const Analytics: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
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

  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [employeeHours, setEmployeeHours] = useState<EmployeeHoursData[]>([]);
  const [projectDistribution, setProjectDistribution] = useState<ProjectDistributionData[]>([]);
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [drillDownData, setDrillDownData] = useState<DrillDownRecord[]>([]);
  const [employees, setEmployees] = useState<Array<{ value: string; label: string; avatar?: string }>>([]);
  const [projects, setProjects] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedDrillDown, setSelectedDrillDown] = useState<{
    type: string | null;
    data: any;
  }>({ type: null, data: null });

  // Check if user has access to dashboard
  const hasAccess = useMemo(() => {
    if (!user?.role) return false;
    const adminRoles = ['Admin', 'Owner', 'Partner', 'Manager'];
    return adminRoles.some(role => 
      user.role.toLowerCase().includes(role.toLowerCase())
    );
  }, [user?.role]);

  // Get user-specific filter restrictions
  const getUserFilterRestrictions = useCallback(() => {
    if (!user?.role) return { canViewAllEmployees: false, canViewAllProjects: false };
    
    const isAdmin = ['Admin', 'Owner'].some(role => 
      user.role.toLowerCase().includes(role.toLowerCase())
    );
    const isManager = ['Manager', 'Partner'].some(role => 
      user.role.toLowerCase().includes(role.toLowerCase())
    );
    
    return {
      canViewAllEmployees: isAdmin || isManager,
      canViewAllProjects: isAdmin || isManager
    };
  }, [user?.role]);

  // Fetch dashboard data with debouncing
  const fetchDashboardData = useCallback(async () => {
    if (!hasAccess) return;

    try {
      setLoading(true);
      
      // For now, use mock data to show the UI
      const mockData: DashboardData = {
        totalHours: 1247.5,
        totalEmployees: 12,
        totalProjects: 8,
        pendingTimesheets: 3,
        averageHoursPerEmployee: 104.0,
        utilizationRate: 85.2,
        employeeHours: {},
        projectHours: {},
        trends: {
          totalHours: 12.5,
          totalEmployees: 8.3,
          totalProjects: 0,
          pendingTimesheets: -25.0
        }
      };

      const mockEmployeeHours: EmployeeHoursData[] = [
        { employeeId: '1', employeeName: 'John Doe', email: 'john@example.com', totalHours: 156.5, projects: {}, dailyHours: [] },
        { employeeId: '2', employeeName: 'Jane Smith', email: 'jane@example.com', totalHours: 142.3, projects: {}, dailyHours: [] },
        { employeeId: '3', employeeName: 'Mike Johnson', email: 'mike@example.com', totalHours: 138.7, projects: {}, dailyHours: [] },
      ];

      const mockProjectDistribution: ProjectDistributionData[] = [
        { projectId: '1', projectName: 'Website Redesign', clientName: 'Client A', totalHours: 456.8, employeeCount: 5 },
        { projectId: '2', projectName: 'Mobile App', clientName: 'Client B', totalHours: 342.1, employeeCount: 4 },
        { projectId: '3', projectName: 'API Development', clientName: 'Client C', totalHours: 289.4, employeeCount: 3 },
      ];

      const mockTrendData: TrendData[] = [
        { date: '2024-01-01', totalHours: 145.2, employeeCount: 10, projectCount: 6 },
        { date: '2024-01-02', totalHours: 167.8, employeeCount: 11, projectCount: 7 },
        { date: '2024-01-03', totalHours: 189.3, employeeCount: 12, projectCount: 8 },
      ];

      const mockDrillDownData: DrillDownRecord[] = [
        { id: '1', employee: 'John Doe', project: 'Website Redesign', date: '2024-01-15', hours: 8.5, status: 'approved' },
        { id: '2', employee: 'Jane Smith', project: 'Mobile App', date: '2024-01-15', hours: 7.5, status: 'pending' },
        { id: '3', employee: 'Mike Johnson', project: 'API Development', date: '2024-01-15', hours: 6.0, status: 'approved' },
      ];

      // Set mock data
      setDashboardData(mockData);
      setEmployeeHours(mockEmployeeHours);
      setProjectDistribution(mockProjectDistribution);
      setTrendData(mockTrendData);
      setDrillDownData(mockDrillDownData);

      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, [hasAccess]);

  // Fetch employees and projects for filters
  const fetchFilterOptions = useCallback(async () => {
    if (!hasAccess) return;

    try {
      const restrictions = getUserFilterRestrictions();
      const [employeesRes, projectsRes] = await Promise.all([
        API.get('/employees').catch(() => ({ data: { data: [] } })),
        API.get('/projects').catch(() => ({ data: { data: [] } }))
      ]);

      const employeeOptions = employeesRes.data?.data?.length
        ? employeesRes.data.data.map((emp: any) => ({
            value: emp.id,
            label: `${emp.firstName} ${emp.lastName || ''}`.trim(),
            avatar: emp.profileImage || undefined
          }))
        : [];

      const projectOptions = projectsRes.data?.data?.length
        ? projectsRes.data.data.map((project: any) => ({
            value: project.id,
            label: project.name
          }))
        : [];

      // Apply role-based restrictions
      if (!restrictions.canViewAllEmployees && user?.id) {
        const userEmployee = employeeOptions.find((emp: any) => emp.value === user.id);
        setEmployees(userEmployee ? [userEmployee] : []);
      } else {
        setEmployees(employeeOptions);
      }

      setProjects(projectOptions);
    } catch (error) {
      console.error('Failed to fetch filter options:', error);
      setEmployees([]);
      setProjects([]);
    }
  }, [hasAccess, getUserFilterRestrictions, user?.id]);

  // Initial data fetch
  useEffect(() => {
    if (hasAccess) {
      fetchFilterOptions();
      fetchDashboardData();
    }
  }, [hasAccess]);

  // Handle filter changes with debouncing
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (hasAccess) {
        fetchDashboardData();
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [filters, hasAccess, fetchDashboardData]);

  // Handle filter changes
  const handleFiltersChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    setSelectedDrillDown({ type: null, data: null });
  };

  // Handle drill-down clicks
  const handleEmployeeClick = (employeeData: any) => {
    setSelectedDrillDown({
      type: 'employee',
      data: employeeData
    });
    
    // Filter drill-down table for this employee
    const filteredData = drillDownData.filter(record => 
      record.employee.toLowerCase().includes(employeeData.name.toLowerCase())
    );
    setDrillDownData(filteredData);
  };

  const handleProjectClick = (projectData: any) => {
    setSelectedDrillDown({
      type: 'project',
      data: projectData
    });
    
    // Filter drill-down table for this project
    const filteredData = drillDownData.filter(record => 
      record.project.toLowerCase().includes(projectData.name.toLowerCase())
    );
    setDrillDownData(filteredData);
  };

  const clearDrillDown = () => {
    setSelectedDrillDown({ type: null, data: null });
    fetchDashboardData(); // Refresh drill-down data
  };

  // Export functionality
  const handleExport = async (format: 'excel' | 'pdf') => {
    try {
      const params = new URLSearchParams();
      params.append('format', format);
      if (filters.dateRange.from) params.append('fromDate', filters.dateRange.from);
      if (filters.dateRange.to) params.append('toDate', filters.dateRange.to);

      const response = await API.get(`/dashboard/export?${params.toString()}`);
      
      // Create download link
      const blob = new Blob([JSON.stringify(response.data.data, null, 2)], {
        type: 'application/json'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `analytics-export-${new Date().toISOString().split('T')[0]}.${format === 'excel' ? 'json' : 'json'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-xl border border-gray-200 p-8 text-center max-w-md">
          <ChartBarIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Restricted</h2>
          <p className="text-sm text-gray-600">
            Analytics Dashboard access is restricted to Administrators, Managers, and Partners.
          </p>
        </div>
      </div>
    );
  }

  // Prepare chart data
  const employeeChartData = useMemo(() => 
    employeeHours.map((emp: any) => ({
      name: emp.employeeName,
      hours: emp.totalHours,
      employeeId: emp.employeeId
    })), [employeeHours]
  );

  const projectChartData = useMemo(() => 
    projectDistribution.map(project => ({
      name: project.projectName,
      value: project.totalHours,
      projectId: project.projectId,
      clientName: project.clientName
    })), [projectDistribution]
  );

  const hasData = dashboardData || employeeHours.length > 0 || projectDistribution.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center">
      <div className="max-w-7xl w-full mx-auto px-6 py-8 space-y-8">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase text-blue-600 tracking-[0.25em] mb-2">
              <ChartBarIcon className="w-3.5 h-3.5" />
              Intelligence Engine
            </div>
            <h1 className="text-3xl md:text-5xl font-[1000] text-slate-900 tracking-tight leading-none">
              Analytics Dashboard
            </h1>
            <p className="text-sm font-bold text-slate-500 mt-2 max-w-lg">
              Interactive insights and high-fidelity performance metrics.
            </p>
          </div>
          
          <div className="flex items-center gap-3 self-end md:self-center">
            <div className="text-right hidden sm:block">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Last Synced</p>
              <p className="text-xs font-bold text-slate-600 mt-1">{format(lastUpdated, 'MMM d, HH:mm')}</p>
            </div>
            <button
              onClick={() => fetchDashboardData()}
              disabled={loading}
              className="flex items-center gap-2 h-[44px] px-6 bg-slate-900 text-white text-xs font-[1000] uppercase tracking-widest rounded-2xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/10 active:scale-95 disabled:opacity-50"
            >
              <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Sync Data
            </button>
            <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm">
              <button
                onClick={() => handleExport('excel')}
                className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                title="Export Excel"
              >
                <DocumentArrowDownIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Dashboard Filters Section */}
        <PremiumFilters
          onFiltersChange={handleFiltersChange}
          loading={loading}
          employees={employees}
          projects={projects}
          userRole={user?.role}
          initialFilters={filters}
        />

        {/* Main Orchestration Area */}
        {loading && !hasData ? (
          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-white rounded-3xl animate-pulse border border-slate-100 shadow-sm" />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="h-[400px] bg-white rounded-3xl animate-pulse border border-slate-100 shadow-sm" />
              <div className="h-[400px] bg-white rounded-3xl animate-pulse border border-slate-100 shadow-sm" />
            </div>
          </div>
        ) : !hasData ? (
          <div className="bg-white rounded-[2.5rem] border border-slate-100 p-20 text-center shadow-sm">
            <ChartBarIcon className="w-20 h-20 text-slate-200 mx-auto mb-6" />
            <h3 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">Zero Datapoints Detected</h3>
            <p className="text-sm font-bold text-slate-400 max-w-xs mx-auto">
              The current filter configuration returned no results. Try expanding your reporting window.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* KPI Section */}
            {dashboardData && (
              <div className="grid grid-cols-1">
                <PremiumKPIGrid data={dashboardData} loading={loading} />
              </div>
            )}

            {/* Visual Analytics Matrix */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
              <div className="flex flex-col">
                <InteractiveBarChart
                  data={employeeChartData}
                  title="Hours per Employee"
                  subtitle="Productivity distribution across personnel"
                  onBarClick={handleEmployeeClick}
                  loading={loading}
                  selectedDrillDown={selectedDrillDown as any}
                />
              </div>

              <div className="flex flex-col">
                <InteractivePieChart
                  data={projectChartData}
                  title="Project Distribution"
                  subtitle="Resource allocation by active project"
                  onSliceClick={handleProjectClick}
                  loading={loading}
                  selectedDrillDown={selectedDrillDown as any}
                />
              </div>
            </div>

            {/* Time Series Engine */}
            <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-8 ring-1 ring-slate-200/50">
              <TrendLineChart
                data={trendData}
                title="Historical Trajectory"
                subtitle={`${filters.granularity === 'daily' ? 'Daily' : filters.granularity === 'weekly' ? 'Weekly' : 'Monthly'} hours logged over time`}
                granularity={filters.granularity}
                loading={loading}
              />
            </div>

            {/* Data Drill-down Ledger */}
            {(drillDownData.length > 0 || selectedDrillDown.type) && (
              <div className="w-full">
                <DrillDownTable
                  data={drillDownData}
                  selectedDrillDown={selectedDrillDown as any}
                  onClearDrillDown={clearDrillDown}
                  loading={loading}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Analytics;
