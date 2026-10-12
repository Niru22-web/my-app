import React, { useState, useEffect } from 'react';
import {
  CurrencyDollarIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  CreditCardIcon
} from '@heroicons/react/24/outline';

interface ReimbursementPayable {
  id: string;
  claimId: string;
  employeeName: string;
  amount: number;
  category: string;
  status: string;
  date: string;
}

const APManagement: React.FC = () => {
  const [payables, setPayables] = useState<ReimbursementPayable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const token = localStorage.getItem('token');

  const fetchPayables = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/accounts/approval-queue', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        // Map the pending reimbursements from the approval queue as payables
        const list = (data.data.reimbursements || []).map((r: any) => ({
          id: r.id,
          claimId: r.claimId || `CLM-${r.id.substring(0,6).toUpperCase()}`,
          employeeName: `${r.employee?.firstName || ''} ${r.employee?.lastName || ''}`.trim(),
          amount: r.amount,
          category: r.category || 'Expense',
          status: r.status,
          date: r.createdAt || r.date || new Date().toISOString()
        }));
        setPayables(list);
      } else {
        setError(data.message || 'Failed to fetch payables queue');
      }
    } catch (err) {
      setError('Connection failure loading payables queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayables();
  }, []);

  const handleProcessPayment = async (claimId: string, id: string) => {
    try {
      const response = await fetch(`/api/accounts/approval-queue/reimbursement/${id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ remarks: 'Paid via AP direct processing' })
      });
      const data = await response.json();
      if (data.success) {
        alert(`Payment processed successfully for claim ${claimId}!`);
        fetchPayables();
      } else {
        alert(data.message || 'Error processing payment');
      }
    } catch (err) {
      alert('Failed to connect to accounts payment processing engine');
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  const totalAP = payables.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="p-6 space-y-8 font-sans text-secondary-900 dark:text-white">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-primary-600 to-indigo-600 dark:from-primary-400 dark:to-indigo-400 bg-clip-text text-transparent">
          Accounts Payable (AP) Management
        </h1>
        <p className="text-secondary-500 dark:text-secondary-400 font-medium mt-1">
          Review employee reimbursement queues, manager approvals, pending salary dispersals, and process electronic payments.
        </p>
      </div>

      {/* Summary Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-6 rounded-3xl border border-white/20 dark:border-white/5 shadow-md">
          <span className="text-xs font-bold text-secondary-400 uppercase tracking-widest block mb-2">Total AP Outstanding</span>
          <span className="text-3xl font-black text-red-500">{formatCurrency(totalAP)}</span>
          <div className="w-full h-1.5 bg-secondary-100 dark:bg-secondary-800 rounded-full mt-4 overflow-hidden">
            <div className="h-full bg-red-500 rounded-full w-full" />
          </div>
        </div>

        <div className="glass-card p-6 rounded-3xl border border-white/20 dark:border-white/5 shadow-md">
          <span className="text-xs font-bold text-secondary-400 uppercase tracking-widest block mb-2">Average Claims In Queue</span>
          <span className="text-3xl font-black">{payables.length} Claims</span>
          <span className="text-xs font-bold text-secondary-400 block mt-3">Ready for cash payout ledger entries</span>
        </div>

        <div className="glass-card p-6 rounded-3xl border border-white/20 dark:border-white/5 shadow-md">
          <span className="text-xs font-bold text-secondary-400 uppercase tracking-widest block mb-2">Default Payment Mode</span>
          <span className="text-3xl font-black">NEFT Bank Transfer</span>
          <span className="text-xs font-bold text-emerald-500 block mt-3">Active routing linked to HDFC Current Acc</span>
        </div>
      </div>

      {/* Payables Table */}
      <div className="glass-card rounded-[2rem] border border-white/20 dark:border-white/5 shadow-xl overflow-hidden">
        <div className="p-6 border-b border-secondary-200 dark:border-secondary-800 flex justify-between items-center bg-white/50 dark:bg-black/20">
          <h3 className="font-black text-lg tracking-tight">Pending Employee Reimbursements Queue</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary-50 dark:bg-secondary-800/40 text-secondary-500 dark:text-secondary-400 text-xs font-bold uppercase tracking-wider">
                <th className="p-5">Claim ID</th>
                <th className="p-5">Employee</th>
                <th className="p-5">Category</th>
                <th className="p-5">Requested Date</th>
                <th className="p-5 text-right">Amount</th>
                <th className="p-5 text-center">Status</th>
                <th className="p-5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-secondary-200 dark:divide-secondary-800 font-semibold text-sm">
              {payables.map((item) => (
                <tr key={item.id} className="hover:bg-secondary-50/40 dark:hover:bg-secondary-800/10 transition-colors">
                  <td className="p-5 text-primary-600 dark:text-primary-400 font-bold">{item.claimId}</td>
                  <td className="p-5 font-bold">{item.employeeName}</td>
                  <td className="p-5 text-secondary-500">{item.category}</td>
                  <td className="p-5 text-secondary-500 text-xs">
                    {new Date(item.date).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                  </td>
                  <td className="p-5 text-right font-black text-red-500">{formatCurrency(item.amount)}</td>
                  <td className="p-5 text-center">
                    <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-500 uppercase">
                      {item.status}
                    </span>
                  </td>
                  <td className="p-5">
                    <div className="flex justify-center">
                      <button
                        onClick={() => handleProcessPayment(item.claimId, item.id)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl shadow-md text-xs font-bold transition-all active:scale-[0.98]"
                      >
                        <CreditCardIcon className="w-4 h-4" />
                        Disburse
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {payables.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-secondary-400 font-bold">
                    No pending employee payables in accounts queue. Good job!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default APManagement;
