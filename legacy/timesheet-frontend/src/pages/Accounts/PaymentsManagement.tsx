import React, { useState, useEffect } from 'react';
import {
  BanknotesIcon
} from '@heroicons/react/24/outline';
import TableSkeleton from '../../components/ui/TableSkeleton';

const PaymentsManagement: React.FC = () => {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPayments = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/accounts/payments', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
          setPayments(data.data || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchPayments();
  }, []);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(val);
  };

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
      {/* Header */}
      <div>
        <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-primary-600 to-indigo-600 dark:from-primary-400 dark:to-indigo-400 bg-clip-text text-transparent">
          Payments & Disbursements (AP)
        </h1>
        <p className="text-secondary-500 dark:text-secondary-400 font-medium mt-1">
          Review, analyze, and audit all processed employee disbursements and general corporate overhead payables.
        </p>
      </div>

      {/* Table */}
      <div className="glass-card rounded-[2rem] border border-white/20 dark:border-white/5 shadow-xl overflow-hidden">
        <div className="p-6 border-b border-secondary-200 dark:border-secondary-800 bg-white/50 dark:bg-black/20">
          <h3 className="font-black text-lg tracking-tight">Disbursed Outflow Register</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary-50 dark:bg-secondary-800/40 text-secondary-500 dark:text-secondary-400 text-xs font-bold uppercase tracking-wider">
                <th className="p-5">Payment Reference</th>
                <th className="p-5">Disbursal Date</th>
                <th className="p-5">Beneficiary Recipient</th>
                <th className="p-5">Mode</th>
                <th className="p-5">Bank Wire UTR</th>
                <th className="p-5 text-right">Amount Disbursed</th>
                <th className="p-5 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-secondary-200 dark:divide-secondary-800 font-semibold text-sm">
              {payments.map((pay) => (
                <tr key={pay.id} className="hover:bg-secondary-50/40 dark:hover:bg-secondary-800/10 transition-colors">
                  <td className="p-5 font-bold text-primary-600 dark:text-primary-400">{pay.id}</td>
                  <td className="p-5 text-secondary-500 text-xs">{new Date(pay.date).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</td>
                  <td className="p-5 font-bold">{pay.recipient}</td>
                  <td className="p-5 text-secondary-500 text-xs">{pay.mode}</td>
                  <td className="p-5 text-xs text-secondary-600 dark:text-secondary-400">{pay.ref}</td>
                  <td className="p-5 text-right font-black text-red-500">{formatCurrency(pay.amount)}</td>
                  <td className="p-5 text-center">
                    <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 uppercase">
                      {pay.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PaymentsManagement;
