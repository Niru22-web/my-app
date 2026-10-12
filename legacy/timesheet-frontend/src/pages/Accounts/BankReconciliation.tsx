import React, { useState, useEffect } from 'react';
import {
  CheckCircleIcon,
  ArrowPathIcon,
  ExclamationCircleIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';

interface Transaction {
  id: string;
  bankReference: string;
  date: string;
  description: string;
  type: string;
  amount: number;
  mappedStatus: string;
  client?: { name: string } | null;
  employee?: { firstName: string; lastName: string } | null;
}

const BankReconciliation: React.FC = () => {
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reconciling, setReconciling] = useState(false);

  const token = localStorage.getItem('token');

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      // Fetching all transactions in reconciliation workspace
      const response = await fetch('/api/accounts/transactions', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const resData = await response.json();
      if (resData.success) {
        setTxns(resData.data || []);
      } else {
        setError(resData.message || 'Failed to fetch statement records');
      }
    } catch (err) {
      setError('Connection failure loading statement records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const handleAutoMatch = async () => {
    setReconciling(true);
    try {
      const response = await fetch('/api/accounts/bank-statements/auto-match', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        // Reload live reconciled transactions dynamically from database
        await fetchTransactions();
        alert(`Auto-Matching complete! Reconciled ${data.matchedCount || 0} matches.`);
      } else {
        alert(data.message || 'Error executing auto-match engine');
      }
    } catch (err) {
      alert('Failed to connect to reconciliation server');
    } finally {
      setReconciling(false);
    }
  };

  const handleManualReconcile = (idx: number) => {
    const list = [...txns];
    list[idx].mappedStatus = "RECONCILED";
    setTxns(list);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(val);
  };

  return (
    <div className="p-6 space-y-8 font-sans text-secondary-900 dark:text-white">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-primary-600 to-indigo-600 dark:from-primary-400 dark:to-indigo-400 bg-clip-text text-transparent">
            Bank Statement Reconciliation Workspace
          </h1>
          <p className="text-secondary-500 dark:text-secondary-400 font-medium mt-1">
            Compare imported bank lines with employee expense bills and sales invoices using the machine learning Auto-Match Engine.
          </p>
        </div>
        <button
          onClick={handleAutoMatch}
          disabled={reconciling}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-primary-600 hover:from-indigo-700 hover:to-primary-700 text-white rounded-2xl shadow-md font-bold transition-all duration-300 active:scale-[0.98] disabled:opacity-50"
        >
          <SparklesIcon className="w-5 h-5 animate-pulse" />
          {reconciling ? 'Auto-Matching...' : 'Auto-Match Engine'}
        </button>
      </div>

      {/* Reconciliation workspace table */}
      <div className="glass-card rounded-[2rem] border border-white/20 dark:border-white/5 shadow-xl overflow-hidden">
        <div className="p-6 border-b border-secondary-200 dark:border-secondary-800 flex justify-between items-center bg-white/50 dark:bg-black/20">
          <h3 className="font-black text-lg tracking-tight">Active Reconciliation Queue</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary-50 dark:bg-secondary-800/40 text-secondary-500 dark:text-secondary-400 text-xs font-bold uppercase tracking-wider">
                <th className="p-5">Bank Reference</th>
                <th className="p-5">Date</th>
                <th className="p-5">Narration / Description</th>
                <th className="p-5 text-right">Statement Amount</th>
                <th className="p-5">Auto-Match Recommendation</th>
                <th className="p-5 text-center">Status</th>
                <th className="p-5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-secondary-200 dark:divide-secondary-800 font-semibold text-sm">
              {txns.map((txn, idx) => (
                <tr key={txn.id} className="hover:bg-secondary-50/40 dark:hover:bg-secondary-800/10 transition-colors">
                  <td className="p-5 text-primary-600 dark:text-primary-400 font-bold">{txn.bankReference}</td>
                  <td className="p-5 text-secondary-500">{new Date(txn.date).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</td>
                  <td className="p-5 text-xs">{txn.description}</td>
                  <td className={`p-5 text-right font-black ${txn.type === 'CREDIT' ? 'text-emerald-600' : 'text-red-500'}`}>
                    {formatCurrency(txn.amount)}
                  </td>
                  <td className="p-5">
                    {txn.mappedStatus === 'RECONCILED' && (
                      <span className="text-emerald-500 text-xs font-bold flex items-center gap-1.5">
                        <CheckCircleIcon className="w-4 h-4" />
                        Matched to {txn.client ? `Client: ${txn.client.name}` : txn.employee ? `Employee: ${txn.employee.firstName} ${txn.employee.lastName}` : 'Ledger Line'}
                      </span>
                    )}
                    {txn.mappedStatus === 'UNMAPPED' && (
                      <span className="text-secondary-400 text-xs font-bold">
                        Unmapped statement line
                      </span>
                    )}
                  </td>
                  <td className="p-5 text-center">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      txn.mappedStatus === 'RECONCILED' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'
                    }`}>
                      {txn.mappedStatus}
                    </span>
                  </td>
                  <td className="p-5">
                    <div className="flex justify-center">
                      {txn.mappedStatus === 'UNMAPPED' ? (
                        <button
                          onClick={() => handleManualReconcile(idx)}
                          className="px-3.5 py-2 bg-secondary-100 hover:bg-secondary-200 dark:bg-secondary-800 dark:hover:bg-secondary-700 rounded-xl text-xs font-bold transition-all"
                        >
                          Manual Match
                        </button>
                      ) : (
                        <span className="text-xs font-bold text-emerald-600">Reconciled</span>
                      )}
                    </div>
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

export default BankReconciliation;
