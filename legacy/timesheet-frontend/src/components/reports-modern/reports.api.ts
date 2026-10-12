import API from '../../api';
import { format } from 'date-fns';
import { saveAs } from 'file-saver';
import type { ReportChartRow, ReportOverview, ReportsFilterOptions, ReportsFilterState, ReportsTab } from './reports.types';

export interface ReportsWorkspaceData {
  overview: ReportOverview;
  chartData: ReportChartRow[];
  options: ReportsFilterOptions;
}

function mapTabToQuery(tab: ReportsTab, filters: ReportsFilterState) {
  switch (tab) {
    case 'workforce':
      return { dataset: 'timesheet', groupBy: 'employee', ...filters, limit: 10 };
    case 'projects':
      return { dataset: 'timesheet', groupBy: 'project', ...filters, limit: 10 };
    case 'attendance':
      return { dataset: 'attendance', groupBy: 'status', ...filters, limit: 10 };
    case 'finance':
      return { dataset: 'reimbursement', groupBy: 'status', ...filters, limit: 10 };
    case 'leave':
      return { dataset: 'leaves', groupBy: 'type', ...filters, limit: 10 };
    case 'executive':
    default:
      return { dataset: 'timesheet', groupBy: 'date', ...filters, limit: 12 };
  }
}

export async function loadReportsOptions() {
  const response = await API.get('/reports/options');
  return response.data.data as ReportsFilterOptions;
}

export async function loadReportsOverview(filters: ReportsFilterState) {
  const response = await API.get('/reports/overview', { params: filters });
  return response.data.data as ReportOverview;
}

export async function loadReportsChart(tab: ReportsTab, filters: ReportsFilterState) {
  const response = await API.post('/reports/query', mapTabToQuery(tab, filters));
  return response.data.data as ReportChartRow[];
}

export async function downloadReportsExport(
  filters: ReportsFilterState,
  formatType: 'xlsx' | 'csv'
) {
  const response = await API.get('/reports/export', {
    params: { ...filters, format: formatType },
    responseType: 'blob'
  });

  const blob = new Blob([response.data], {
    type: formatType === 'csv'
      ? 'text/csv;charset=utf-8'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  saveAs(blob, `reports-${format(new Date(), 'yyyy-MM-dd')}.${formatType}`);
}

