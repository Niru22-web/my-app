import React, { useState, useEffect } from 'react';
import {
  ChartBarIcon,
  ArrowTrendingUpIcon,
  BanknotesIcon,
  ShieldCheckIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import ASALoader from '../../components/ui/ASALoader';

interface ProfitLoss {
  revenue: number;
  expenses: {
    salary: number;
    travel: number;
    meals: number;
    officeOverheads: number;
  };
  netProfit: number;
  timesheetOverview?: {
    totalHours: number;
    billableHours: number;
    clientBreakdown: Array<{
      clientId: string;
      clientName: string;
      hours: number;
    }>;
  };
}

const FinanceReports: React.FC = () => {
  const [pnl, setPnl] = useState<ProfitLoss | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const token = localStorage.getItem('token');

  const fetchPnL = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/accounts/reports/pnl', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setPnl(data.data);
      } else {
        setError(data.message || 'Failed to fetch P&L report');
      }
    } catch (err) {
      console.error(err);
      setError('Connection error while fetching P&L report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPnL();
  }, []);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  if (loading) {
    return <ASALoader fullPage size="lg" text="Loading financial statement..." />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <p className="text-red-500 font-bold text-center">{error}</p>
        <button
          onClick={fetchPnL}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-md transition-all active:scale-[0.98]"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!pnl) return null;

  const totalExpense = pnl.expenses.salary + pnl.expenses.travel + pnl.expenses.meals + pnl.expenses.officeOverheads;

  return (
    <div className="p-6 space-y-8 font-sans text-secondary-900 dark:text-white">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-primary-600 to-indigo-600 dark:from-primary-400 dark:to-indigo-400 bg-clip-text text-transparent">
          Financial Statements & P&L
        </h1>
        <p className="text-secondary-500 dark:text-secondary-400 font-medium mt-1">
          Review dynamic corporate profits and losses sheets, gross turnovers, and operational expenses.
        </p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="glass-card p-6 rounded-3xl border border-white/20 dark:border-white/5 shadow-md flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-secondary-400 uppercase tracking-widest block mb-1">Gross Revenue</span>
            <span className="text-3xl font-black text-emerald-600">{formatCurrency(pnl.revenue)}</span>
          </div>
          <div className="p-4 bg-emerald-500/10 rounded-2xl text-emerald-600">
            <ArrowTrendingUpIcon className="w-8 h-8" />
          </div>
        </div>

        <div className="glass-card p-6 rounded-3xl border border-white/20 dark:border-white/5 shadow-md flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-secondary-400 uppercase tracking-widest block mb-1">Gross Expenses</span>
            <span className="text-3xl font-black text-red-500">{formatCurrency(totalExpense)}</span>
          </div>
          <div className="p-4 bg-red-500/10 rounded-2xl text-red-600">
            <BanknotesIcon className="w-8 h-8" />
          </div>
        </div>

        <div className="glass-card p-6 rounded-3xl border border-white/20 dark:border-white/5 shadow-md flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-secondary-400 uppercase tracking-widest block mb-1">Net Operating Profit</span>
            <span className="text-3xl font-black text-primary-600 dark:text-primary-400">{formatCurrency(pnl.netProfit)}</span>
          </div>
          <div className="p-4 bg-primary-500/10 rounded-2xl text-primary-600">
            <ChartBarIcon className="w-8 h-8" />
          </div>
        </div>

        <div className="glass-card p-6 rounded-3xl border border-white/20 dark:border-white/5 shadow-md flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-secondary-400 uppercase tracking-widest block mb-1">Timesheet Hours</span>
            <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400">
              {pnl.timesheetOverview?.totalHours ?? 0}h
            </span>
            <span className="text-[10px] text-secondary-400 font-bold block mt-1">
              ({pnl.timesheetOverview?.billableHours ?? 0}h Billable)
            </span>
          </div>
          <div className="p-4 bg-indigo-500/10 rounded-2xl text-indigo-600">
            <ClockIcon className="w-8 h-8" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Detailed P&L */}
        <div className="glass-card rounded-[2rem] border border-white/20 dark:border-white/5 shadow-xl overflow-hidden p-8 space-y-6">
          <h3 className="text-xl font-black tracking-tight border-b border-secondary-200 dark:border-secondary-800 pb-4">
            Statement of Profit and Loss (P&L)
          </h3>

          <div className="space-y-4">
            <div className="flex justify-between font-black text-md">
              <span>Operating Revenue</span>
              <span className="text-emerald-600">{formatCurrency(pnl.revenue)}</span>
            </div>
            <div className="pl-4 space-y-2 border-l border-secondary-200 dark:border-secondary-800">
              <div className="flex justify-between text-sm font-bold text-secondary-500">
                <span>Sales & Consulting Invoices</span>
                <span>{formatCurrency(pnl.revenue)}</span>
              </div>
            </div>

            <div className="flex justify-between font-black text-md pt-4">
              <span>Operating Expenses</span>
              <span className="text-red-500">({formatCurrency(totalExpense)})</span>
            </div>
            <div className="pl-4 space-y-2 border-l border-secondary-200 dark:border-secondary-800 text-sm font-bold text-secondary-500">
              <div className="flex justify-between">
                <span>Employee Payroll & Disbursals</span>
                <span>{formatCurrency(pnl.expenses.salary)}</span>
              </div>
              <div className="flex justify-between">
                <span>Travel & Business Convenance</span>
                <span>{formatCurrency(pnl.expenses.travel)}</span>
              </div>
              <div className="flex justify-between">
                <span>Corporate Entertainment & Meals</span>
                <span>{formatCurrency(pnl.expenses.meals)}</span>
              </div>
              <div className="flex justify-between">
                <span>General Overheads & Rent</span>
                <span>{formatCurrency(pnl.expenses.officeOverheads)}</span>
              </div>
            </div>

            <div className="flex justify-between font-black text-lg border-t border-secondary-200 dark:border-secondary-800 pt-4 text-primary-600 dark:text-primary-400">
              <span>Net Operating Income</span>
              <span>{formatCurrency(pnl.netProfit)}</span>
            </div>
          </div>
        </div>

        {/* Client Resource Hours Breakdown */}
        <div className="glass-card rounded-[2rem] border border-white/20 dark:border-white/5 shadow-xl overflow-hidden p-8 space-y-6">
          <h3 className="text-xl font-black tracking-tight border-b border-secondary-200 dark:border-secondary-800 pb-4">
            Resource Hours Logged by Client
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-secondary-200 dark:border-secondary-800">
                  <th className="py-3 text-[10px] font-bold text-secondary-400 uppercase tracking-widest">Client Name</th>
                  <th className="py-3 text-[10px] font-bold text-secondary-400 uppercase tracking-widest text-right">Hours Logged</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary-100 dark:divide-secondary-800/50">
                {pnl.timesheetOverview?.clientBreakdown && pnl.timesheetOverview.clientBreakdown.length > 0 ? (
                  pnl.timesheetOverview.clientBreakdown.map((item) => (
                    <tr key={item.clientId} className="text-sm">
                      <td className="py-4 font-bold text-secondary-800 dark:text-slate-200">{item.clientName}</td>
                      <td className="py-4 font-black text-right text-indigo-600 dark:text-indigo-400">{item.hours} hours</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2} className="py-8 text-center text-secondary-400 italic font-bold">
                      No timesheet logs tracked for clients.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinanceReports;
