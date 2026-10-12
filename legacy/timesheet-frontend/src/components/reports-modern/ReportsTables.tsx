import React from 'react';
import { Card } from '@fluentui/react-components';
import type { ReportOverview, ReportsTab } from './reports.types';

interface ReportsTablesProps {
  overview: ReportOverview | null;
  tab: ReportsTab;
  searchTerm: string;
}

function matchesSearch(values: Array<string | number | undefined>, searchTerm: string) {
  if (!searchTerm) return true;
  const normalized = searchTerm.toLowerCase();
  return values.some(value => String(value ?? '').toLowerCase().includes(normalized));
}

const ReportsTables: React.FC<ReportsTablesProps> = ({ overview, tab, searchTerm }) => {
  const topEmployees = (overview?.topEmployees || []).filter(item =>
    matchesSearch([item.name, item.department, item.hours], searchTerm)
  );

  const topProjects = (overview?.topProjects || []).filter(item =>
    matchesSearch([item.name, item.client, item.hours], searchTerm)
  );

  const activity = (overview?.recentActivity || []).filter(item =>
    matchesSearch([item.label, item.detail, item.timestamp], searchTerm)
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <Card className="rounded-[24px] border border-slate-200/70 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.06)] overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Leadership table</p>
            <h3 className="mt-1 text-lg font-black text-slate-900">Top employees</h3>
          </div>
          <span className="text-xs font-semibold text-slate-400">{topEmployees.length} rows</span>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Employee</th>
                <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Department</th>
                <th className="px-5 py-3 text-right text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topEmployees.map(item => (
                <tr key={item.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-4 text-sm font-semibold text-slate-900">{item.name}</td>
                  <td className="px-5 py-4 text-sm text-slate-500">{item.department}</td>
                  <td className="px-5 py-4 text-sm font-bold text-right text-slate-900">{item.hours.toFixed(1)}</td>
                </tr>
              ))}
              {topEmployees.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-sm text-slate-400">
                    No employee rows match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="rounded-[24px] border border-slate-200/70 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.06)] overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Portfolio view</p>
            <h3 className="mt-1 text-lg font-black text-slate-900">Top projects</h3>
          </div>
          <span className="text-xs font-semibold text-slate-400">{topProjects.length} rows</span>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Project</th>
                <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Client</th>
                <th className="px-5 py-3 text-right text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topProjects.map(item => (
                <tr key={item.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-4 text-sm font-semibold text-slate-900">{item.name}</td>
                  <td className="px-5 py-4 text-sm text-slate-500">{item.client}</td>
                  <td className="px-5 py-4 text-sm font-bold text-right text-slate-900">{item.hours.toFixed(1)}</td>
                </tr>
              ))}
              {topProjects.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-sm text-slate-400">
                    No project rows match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className={`rounded-[24px] border border-slate-200/70 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.06)] overflow-hidden ${tab === 'executive' ? 'xl:col-span-2' : ''}`}>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Operational feed</p>
            <h3 className="mt-1 text-lg font-black text-slate-900">Recent activity</h3>
          </div>
          <span className="text-xs font-semibold text-slate-400">{activity.length} events</span>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {activity.map(item => (
            <div key={`${item.label}-${item.timestamp}`} className="rounded-2xl border border-slate-100 p-4 bg-slate-50/70">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">{item.timestamp}</span>
              </div>
              <p className="mt-2 text-sm text-slate-500">{item.detail}</p>
            </div>
          ))}
          {activity.length === 0 && (
            <div className="md:col-span-2 xl:col-span-3 py-8 text-center text-sm text-slate-400">
              No activity rows match the current filters.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default ReportsTables;

