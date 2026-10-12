import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CurrencyDollarIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  BanknotesIcon,
  CheckCircleIcon,
  ArrowTrendingUpIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  PlusIcon
} from '@heroicons/react/24/outline';
import DashboardSkeleton from '../../components/ui/DashboardSkeleton';

interface DashboardData {
  summary: {
    arOutstanding: number;
    apOutstanding: number;
    monthlyRevenue: number;
    monthlyCollections: number;
    pendingReimbursements: number;
    pendingTimesheetPayments: number;
    gstLiability: number;
    forexExposure: number;
  };
  widgets: {
    receivables: {
      clientAging: Array<{ name: string; value: number }>;
      invoiceAging: {
        current: number;
        overdue1to30: number;
        overdue31to60: number;
        overdueAbove60: number;
      };
    };
    payables: {
      payrollDue: number;
      reimbursementsDue: number;
    };
    banking: {
      importedStatements: number;
      unmappedEntries: number;
      reconciliationSummary: {
        reconciled: number;
        total: number;
      };
    };
    operations: {
      pendingInvoiceApprovals: number;
      pendingPaymentApprovals: number;
    };
  };
}

const AccountsDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      
      const response = await fetch('/api/accounts/dashboard', { 
        headers: { 'Authorization': `Bearer ${token}` } 
      });

      const accountsJson = await response.json();

      if (accountsJson.success) {
        setData(accountsJson.data);
      } else {
        setError(accountsJson.message || 'Failed to fetch finance dashboard data');
      }
    } catch (err) {
      setError('Connection error while fetching metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(value);
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="p-6 bg-red-50 dark:bg-red-950/20 text-red-600 rounded-2xl border border-red-200 dark:border-red-900/30 flex items-center gap-4">
        <ExclamationTriangleIcon className="w-8 h-8" />
        <div>
          <h4 className="font-bold text-lg">Failed to load Accounts Dashboard</h4>
          <p className="text-sm opacity-90">{error || 'Unknown error'}</p>
        </div>
      </div>
    );
  }

  const { summary, widgets } = data;


  return (
    <div className="p-6 space-y-10 font-sans text-secondary-900 dark:text-white">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-primary-600 to-indigo-600 dark:from-primary-400 dark:to-indigo-400 bg-clip-text text-transparent">
            Unified Accounts & Operations Dashboard
          </h1>
          <p className="text-secondary-500 dark:text-secondary-400 font-medium mt-1">
            Real-time tracking of corporate receivable/payable metrics, banking reconciliation, and financial health.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/accounts/invoices', { state: { openCreate: true } })}
            className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl shadow-md transition-all duration-300 font-bold active:scale-[0.98]"
          >
            <PlusIcon className="w-5 h-5" />
            Generate Invoice
          </button>
          <button
            onClick={fetchDashboardData}
            className="flex items-center gap-2 px-5 py-3 bg-white dark:bg-secondary-800 hover:bg-secondary-50 dark:hover:bg-secondary-700/80 border border-secondary-200 dark:border-secondary-700 rounded-2xl shadow-sm transition-all duration-300 font-bold active:scale-[0.98]"
          >
            <ArrowPathIcon className="w-5 h-5" />
            Refresh
          </button>
        </div>
      </div>

      {/* SECTION 2: ACCOUNTS & FINANCE */}
      <div className="space-y-6">
        <h2 className="text-2xl font-black tracking-tight text-secondary-800 dark:text-secondary-100 flex items-center gap-3">
          <span className="w-3 h-8 bg-gradient-to-b from-indigo-500 to-purple-500 rounded-full inline-block"></span>
          Accounts & Finance Overview
        </h2>

        {/* KPI Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          {/* AR Outstanding */}
          <div className="glass-card p-6 rounded-3xl border border-white/20 dark:border-white/5 shadow-xl relative overflow-hidden group hover:scale-[1.02] transition-all duration-300">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Receivables (AR)</span>
              <div className="p-2 bg-blue-500/10 rounded-xl text-blue-600 shrink-0">
                <CurrencyDollarIcon className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-6">
              <h3 className="text-2xl font-black tracking-tight truncate">{formatCurrency(summary.arOutstanding)}</h3>
              <span className="text-[10px] font-semibold text-blue-500 flex items-center gap-1 mt-2">
                <ArrowTrendingUpIcon className="w-3 h-3" />
                Outstanding invoices
              </span>
            </div>
          </div>

          {/* AP Outstanding */}
          <div className="glass-card p-6 rounded-3xl border border-white/20 dark:border-white/5 shadow-xl relative overflow-hidden group hover:scale-[1.02] transition-all duration-300">
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Payables (AP)</span>
              <div className="p-2 bg-red-500/10 rounded-xl text-red-600 shrink-0">
                <BanknotesIcon className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-6">
              <h3 className="text-2xl font-black tracking-tight truncate">{formatCurrency(summary.apOutstanding)}</h3>
              <span className="text-[10px] font-semibold text-red-500 flex items-center gap-1 mt-2">
                <ClockIcon className="w-3 h-3" />
                Supplier & salary dues
              </span>
            </div>
          </div>

          {/* Monthly Revenue */}
          <div className="glass-card p-6 rounded-3xl border border-white/20 dark:border-white/5 shadow-xl relative overflow-hidden group hover:scale-[1.02] transition-all duration-300">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Monthly Revenue</span>
              <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-600 shrink-0">
                <ArrowTrendingUpIcon className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-6">
              <h3 className="text-2xl font-black tracking-tight truncate">{formatCurrency(summary.monthlyRevenue)}</h3>
              <span className="text-[10px] font-semibold text-emerald-500 flex items-center gap-1 mt-2">
                <CheckCircleIcon className="w-3 h-3" />
                Realized this month
              </span>
            </div>
          </div>

          {/* GST Liability */}
          <div className="glass-card p-6 rounded-3xl border border-white/20 dark:border-white/5 shadow-xl relative overflow-hidden group hover:scale-[1.02] transition-all duration-300">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">GST Liability</span>
              <div className="p-2 bg-purple-500/10 rounded-xl text-purple-600 shrink-0">
                <DocumentTextIcon className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-6">
              <h3 className="text-2xl font-black tracking-tight truncate">{formatCurrency(summary.gstLiability)}</h3>
              <span className="text-[10px] font-semibold text-purple-500 flex items-center gap-1 mt-2">
                <CheckCircleIcon className="w-3 h-3" />
                Accumulated tax due
              </span>
            </div>
          </div>

          {/* Bank Reconciliation Summary */}
          <div className="glass-card p-6 rounded-3xl border border-white/20 dark:border-white/5 shadow-xl relative overflow-hidden group hover:scale-[1.02] transition-all duration-300">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Bank Reconciliation</span>
              <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-600 shrink-0">
                <CheckCircleIcon className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-6">
              <h3 className="text-2xl font-black tracking-tight">
                {widgets?.banking?.reconciliationSummary?.total > 0
                  ? `${Math.round((widgets.banking.reconciliationSummary.reconciled / widgets.banking.reconciliationSummary.total) * 100)}%`
                  : '100%'}
              </h3>
              <span className="text-[10px] font-semibold text-indigo-500 flex items-center gap-1 mt-2">
                <CheckCircleIcon className="w-3 h-3" />
                {widgets?.banking?.reconciliationSummary?.reconciled || 0} / {widgets?.banking?.reconciliationSummary?.total || 0} reconciled
              </span>
            </div>
          </div>
        </div>

        {/* Detailed Widgets Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Receivables Aging Widget */}
          <div className="glass-card p-8 rounded-[2rem] border border-white/20 dark:border-white/5 shadow-xl space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black tracking-tight">Receivables Aging & Overdue</h3>
              <span className="text-xs font-bold bg-blue-500/10 text-blue-600 px-3 py-1.5 rounded-full">FIFO Method</span>
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm font-bold mb-1.5">
                  <span className="text-secondary-600 dark:text-secondary-400">Current (0 - 30 days)</span>
                  <span>{formatCurrency(widgets.receivables.invoiceAging.current)}</span>
                </div>
                <div className="w-full h-3 bg-secondary-100 dark:bg-secondary-800 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full w-[60%]" />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm font-bold mb-1.5">
                  <span className="text-secondary-600 dark:text-secondary-400">Overdue (31 - 60 days)</span>
                  <span>{formatCurrency(widgets.receivables.invoiceAging.overdue1to30)}</span>
                </div>
                <div className="w-full h-3 bg-secondary-100 dark:bg-secondary-800 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full w-[25%]" />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm font-bold mb-1.5">
                  <span className="text-secondary-600 dark:text-secondary-400">Overdue (61 - 90 days)</span>
                  <span>{formatCurrency(widgets.receivables.invoiceAging.overdue31to60)}</span>
                </div>
                <div className="w-full h-3 bg-secondary-100 dark:bg-secondary-800 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-full w-[12%]" />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm font-bold mb-1.5">
                  <span className="text-secondary-600 dark:text-secondary-400">Overdue (Above 90 days)</span>
                  <span>{formatCurrency(widgets.receivables.invoiceAging.overdueAbove60)}</span>
                </div>
                <div className="w-full h-3 bg-secondary-100 dark:bg-secondary-800 rounded-full overflow-hidden">
                  <div className="h-full bg-red-500 rounded-full w-[8%]" />
                </div>
              </div>
            </div>
          </div>

          {/* Banking Reconciliation Detail */}
          <div className="glass-card p-8 rounded-[2rem] border border-white/20 dark:border-white/5 shadow-xl space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black tracking-tight">Bank Reconciliation Summary</h3>
              <span className="text-xs font-bold bg-indigo-500/10 text-indigo-600 px-3 py-1.5 rounded-full">Auto-Match Active</span>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="p-5 bg-secondary-50 dark:bg-secondary-800/40 rounded-2xl border border-secondary-200/50 dark:border-secondary-700/50">
                <span className="text-xs font-bold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider block mb-2">Imported Statements</span>
                <span className="text-3xl font-black">{widgets.banking.importedStatements}</span>
                <span className="text-xs font-bold text-secondary-400 block mt-2">Active statement uploads</span>
              </div>
              <div className="p-5 bg-secondary-50 dark:bg-secondary-800/40 rounded-2xl border border-secondary-200/50 dark:border-secondary-700/50">
                <span className="text-xs font-bold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider block mb-2">Unmapped Entries</span>
                <span className="text-3xl font-black text-amber-500">{widgets.banking.unmappedEntries}</span>
                <span className="text-xs font-bold text-amber-500 block mt-2">Needs manual mapping</span>
              </div>
            </div>
            <div className="p-5 bg-indigo-500/5 rounded-2xl border border-indigo-500/15 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-sm font-bold">Auto-Reconciled Ratio</span>
                <div className="text-xs text-secondary-500 font-medium">
                  {widgets?.banking?.reconciliationSummary?.reconciled || 0} reconciled out of {widgets?.banking?.reconciliationSummary?.total || 0} total lines
                </div>
              </div>
              <div className="text-2xl font-black text-indigo-600">
                {widgets?.banking?.reconciliationSummary?.total > 0
                  ? Math.round((widgets.banking.reconciliationSummary.reconciled / widgets.banking.reconciliationSummary.total) * 100)
                  : 100}%
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountsDashboard;
