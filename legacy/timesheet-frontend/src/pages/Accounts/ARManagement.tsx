import React, { useState, useEffect } from 'react';
import {
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
  MagnifyingGlassIcon,
  CalendarIcon
} from '@heroicons/react/24/outline';
import TableSkeleton from '../../components/ui/TableSkeleton';

interface ClientOutstanding {
  name: string;
  totalOutstanding: number;
  current: number;
  overdue30: number;
  overdue60: number;
  overdue90: number;
}

const ARManagement: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Dynamic outstanding ledger
  const [outstandings, setOutstandings] = useState<ClientOutstanding[]>([]);

  useEffect(() => {
    const fetchARData = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/accounts/invoices', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
          const invoicesList = data.data || [];
          
          // Calculate client-wise outstanding and aging
          const today = new Date();
          const clientMap: Record<string, {
            name: string;
            totalOutstanding: number;
            current: number;
            overdue30: number;
            overdue60: number;
            overdue90: number;
          }> = {};

          invoicesList.forEach((inv: any) => {
            if (inv.status === 'CANCELLED') return;

            const paid = (inv.receiptAllocations || []).reduce((sum: number, alloc: any) => sum + (alloc.amountAllocated || 0), 0);
            const outstanding = inv.totalAmount - paid;
            if (outstanding <= 0) return;

            const clientName = inv.client?.name || 'Unknown Client';
            if (!clientMap[clientName]) {
              clientMap[clientName] = {
                name: clientName,
                totalOutstanding: 0,
                current: 0,
                overdue30: 0,
                overdue60: 0,
                overdue90: 0
              };
            }

            const baseOutstanding = outstanding * inv.exchangeRate;
            clientMap[clientName].totalOutstanding += baseOutstanding;

            // Compute aging buckets using issueDate
            const diffTime = today.getTime() - new Date(inv.issueDate).getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays <= 30) {
              clientMap[clientName].current += baseOutstanding;
            } else if (diffDays <= 60) {
              clientMap[clientName].overdue30 += baseOutstanding;
            } else if (diffDays <= 90) {
              clientMap[clientName].overdue60 += baseOutstanding;
            } else {
              clientMap[clientName].overdue90 += baseOutstanding;
            }
          });

          setOutstandings(Object.values(clientMap));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchARData();
  }, []);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  const totalAR = outstandings.reduce((sum, item) => sum + item.totalOutstanding, 0);
  const totalOverdue = outstandings.reduce((sum, item) => sum + (item.overdue30 + item.overdue60 + item.overdue90), 0);
  const overduePercent = (totalOverdue / (totalAR || 1)) * 100;

  const filtered = outstandings.filter(o => o.name.toLowerCase().includes(searchTerm.toLowerCase()));

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="space-y-2">
          <div className="h-9 w-48 bg-secondary-200/80 dark:bg-slate-800 rounded-2xl animate-pulse" />
          <div className="h-4 w-96 bg-secondary-100 dark:bg-slate-800/60 rounded-lg animate-pulse" />
        </div>
        <TableSkeleton rows={5} columns={6} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 font-sans text-secondary-900 dark:text-white">
      <style>{`
        .overdue-progress-bar {
          width: ${overduePercent}%;
        }
      `}</style>
      {/* Header */}
      <div>
        <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-primary-600 to-indigo-600 dark:from-primary-400 dark:to-indigo-400 bg-clip-text text-transparent">
          Accounts Receivable (AR) Management
        </h1>
        <p className="text-secondary-500 dark:text-secondary-400 font-medium mt-1">
          Monitor active customer ledger outstanding, overdue periods, and credit limits.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-6 rounded-3xl border border-white/20 dark:border-white/5 shadow-md">
          <span className="text-xs font-bold text-secondary-400 uppercase tracking-widest block mb-2">Total Receivables</span>
          <span className="text-3xl font-black text-primary-600 dark:text-primary-400">{formatCurrency(totalAR)}</span>
          <div className="w-full h-1.5 bg-secondary-100 dark:bg-secondary-800 rounded-full mt-4 overflow-hidden">
            <div className="h-full bg-primary-600 rounded-full w-full" />
          </div>
        </div>

        <div className="glass-card p-6 rounded-3xl border border-white/20 dark:border-white/5 shadow-md">
          <span className="text-xs font-bold text-secondary-400 uppercase tracking-widest block mb-2">Total Overdue</span>
          <span className="text-3xl font-black text-red-500">{formatCurrency(totalOverdue)}</span>
          <div className="w-full h-1.5 bg-secondary-100 dark:bg-secondary-800 rounded-full mt-4 overflow-hidden">
            <div className="h-full bg-red-500 rounded-full overdue-progress-bar" />
          </div>
        </div>

        <div className="glass-card p-6 rounded-3xl border border-white/20 dark:border-white/5 shadow-md">
          <span className="text-xs font-bold text-secondary-400 uppercase tracking-widest block mb-2">Average Collection Period</span>
          <span className="text-3xl font-black">42 Days</span>
          <span className="text-xs font-bold text-emerald-500 block mt-3">↓ 4 days from last quarter</span>
        </div>
      </div>

      {/* Active Ledgers List */}
      <div className="glass-card rounded-[2rem] border border-white/20 dark:border-white/5 shadow-xl overflow-hidden">
        <div className="p-6 border-b border-secondary-200 dark:border-secondary-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/50 dark:bg-black/20">
          <h3 className="font-black text-lg tracking-tight">Receivables Aging by Client</h3>
          <div className="relative w-full md:w-80">
            <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-3.5 text-secondary-400" />
            <input
              type="text"
              placeholder="Search Client..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white dark:bg-secondary-900 border border-secondary-200 dark:border-secondary-700 rounded-2xl outline-none text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary-50 dark:bg-secondary-800/40 text-secondary-500 dark:text-secondary-400 text-xs font-bold uppercase tracking-wider">
                <th className="p-5">Client Name</th>
                <th className="p-5 text-right">Total Outstanding</th>
                <th className="p-5 text-right">Current</th>
                <th className="p-5 text-right">31-60 Days</th>
                <th className="p-5 text-right">61-90 Days</th>
                <th className="p-5 text-right">90+ Days</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-secondary-200 dark:divide-secondary-800 font-semibold text-sm">
              {filtered.map((item, idx) => (
                <tr key={idx} className="hover:bg-secondary-50/40 dark:hover:bg-secondary-800/10 transition-colors">
                  <td className="p-5 font-bold">{item.name}</td>
                  <td className="p-5 text-right font-black text-primary-600 dark:text-primary-400">{formatCurrency(item.totalOutstanding)}</td>
                  <td className="p-5 text-right text-emerald-600">{formatCurrency(item.current)}</td>
                  <td className="p-5 text-right text-amber-500">{formatCurrency(item.overdue30)}</td>
                  <td className="p-5 text-right text-orange-500">{formatCurrency(item.overdue60)}</td>
                  <td className="p-5 text-right text-red-500">{formatCurrency(item.overdue90)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ARManagement;
