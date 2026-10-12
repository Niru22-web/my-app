import React from 'react';
import {
  Card,
  Spinner
} from '@fluentui/react-components';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';
import type { ReportChartRow, ReportOverview, ReportsTab } from './reports.types';

interface ReportsVisualsProps {
  tab: ReportsTab;
  overview: ReportOverview | null;
  chartData: ReportChartRow[];
  loading: boolean;
}

const COLORS = ['#1D4ED8', '#06B6D4', '#10B981', '#F59E0B', '#8B5CF6', '#F97316', '#EF4444', '#64748B'];

function pickBreakdown(overview: ReportOverview | null, tab: ReportsTab) {
  if (!overview) return [];
  switch (tab) {
    case 'attendance':
      return overview.attendanceBreakdown;
    case 'finance':
      return overview.reimbursementBreakdown;
    case 'leave':
      return overview.leaveBreakdown;
    default:
      return overview.departmentBreakdown;
  }
}

function formatSeriesLabel(tab: ReportsTab) {
  switch (tab) {
    case 'workforce':
      return 'Top workforce contributors';
    case 'projects':
      return 'Project effort split';
    case 'attendance':
      return 'Attendance distribution';
    case 'finance':
      return 'Financial claim distribution';
    case 'leave':
      return 'Leave demand profile';
    default:
      return 'Logged hours over time';
  }
}

const ReportsVisuals: React.FC<ReportsVisualsProps> = ({ tab, overview, chartData, loading }) => {
  const breakdown = pickBreakdown(overview, tab);
  const trend = overview?.trend || [];
  const usePie = tab === 'attendance' || tab === 'finance' || tab === 'leave';

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <Card className="xl:col-span-2 rounded-[24px] border border-slate-200/70 bg-[#07111F] text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)] overflow-hidden">
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-cyan-200/80">Primary chart</p>
              <h3 className="mt-1 text-xl font-black tracking-tight">{formatSeriesLabel(tab)}</h3>
            </div>
            <div className="text-xs font-semibold text-slate-300">
              {loading ? 'Refreshing data...' : `${chartData.length} points`}
            </div>
          </div>
        </div>
        <div className="h-[360px] p-4">
          {loading && chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <Spinner label="Loading chart" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {usePie ? (
                <PieChart>
                  <Tooltip />
                  <Legend />
                  <Pie
                    data={chartData.length > 0 ? chartData : breakdown}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={72}
                    outerRadius={118}
                    paddingAngle={4}
                  >
                    {(chartData.length > 0 ? chartData : breakdown).map((entry, index) => (
                      <Cell key={`slice-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              ) : tab === 'workforce' || tab === 'projects' ? (
                <BarChart data={chartData}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.72)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'rgba(255,255,255,0.72)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[14, 14, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`bar-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="hoursGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38BDF8" stopOpacity={0.7} />
                      <stop offset="95%" stopColor="#38BDF8" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.72)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'rgba(255,255,255,0.72)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="value" stroke="#38BDF8" fill="url(#hoursGradient)" strokeWidth={3} />
                </AreaChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <div className="flex flex-col gap-4">
        <Card className="rounded-[24px] border border-slate-200/70 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.06)] overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Trend line</p>
            <h3 className="mt-1 text-lg font-black text-slate-900">Activity trajectory</h3>
          </div>
          <div className="h-[170px] p-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1D4ED8" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#1D4ED8" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip />
                <Area type="monotone" dataKey="hours" stroke="#1D4ED8" fill="url(#trendFill)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="rounded-[24px] border border-slate-200/70 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.06)] overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Breakdown</p>
            <h3 className="mt-1 text-lg font-black text-slate-900">Operational mix</h3>
          </div>
          <div className="h-[170px] p-4">
            {breakdown.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-400">
                No breakdown data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={breakdown} dataKey="value" nameKey="label" innerRadius={46} outerRadius={78} paddingAngle={2}>
                    {breakdown.map((entry, index) => (
                      <Cell key={`breakdown-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ReportsVisuals;

