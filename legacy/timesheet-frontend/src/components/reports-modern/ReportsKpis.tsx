import React from 'react';
import { Card, Spinner } from '@fluentui/react-components';
import { ArrowTrendingRegular, MoneyRegular, PeopleRegular, BriefcaseRegular, CalendarRegular, WarningRegular, SavingsRegular } from '@fluentui/react-icons';
import type { ReportOverview } from './reports.types';

interface ReportsKpisProps {
  overview: ReportOverview | null;
  loading: boolean;
}

const iconMap = {
  'Total Employees': PeopleRegular,
  'Logged Hours': ArrowTrendingRegular,
  'Billable Hours': MoneyRegular,
  'Active Projects': BriefcaseRegular,
  'Attendance Hours': CalendarRegular,
  'Leave Balance': SavingsRegular,
  'Pending Leaves': WarningRegular,
  'Reimbursements': ArrowTrendingRegular
};

const toneClasses: Record<string, string> = {
  brand: 'from-blue-600 to-cyan-500 text-white',
  success: 'from-emerald-600 to-emerald-400 text-white',
  warning: 'from-amber-500 to-orange-400 text-white',
  danger: 'from-rose-600 to-rose-400 text-white',
  neutral: 'from-slate-700 to-slate-500 text-white'
};

const ReportsKpis: React.FC<ReportsKpisProps> = ({ overview, loading }) => {
  if (loading && !overview) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Card key={index} className="rounded-[24px] border border-slate-200/60 bg-white p-6">
            <Spinner label="Loading metrics" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {overview?.summary.map(item => {
        const Icon = iconMap[item.label as keyof typeof iconMap] || ArrowTrendingRegular;
        return (
          <Card key={item.label} className="rounded-[24px] border border-slate-200/70 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.06)] overflow-hidden">
            <div className={`h-1 bg-gradient-to-r ${toneClasses[item.tone] || toneClasses.neutral}`} />
            <div className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">{item.label}</p>
                  <p className="mt-2 text-3xl font-black tracking-tight text-slate-900">{item.value}</p>
                  <p className="mt-2 text-sm text-slate-500">{item.trend}</p>
                </div>
                <div className={`h-12 w-12 rounded-2xl bg-gradient-to-br ${toneClasses[item.tone] || toneClasses.neutral} flex items-center justify-center shadow-lg`}>
                  <Icon className="h-6 w-6" />
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
};

export default ReportsKpis;
