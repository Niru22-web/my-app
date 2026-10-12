import React, { useState, useEffect } from 'react';
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';

interface ReimbursementItem {
  id: string;
  claimId: string;
  employeeName: string;
  category: string;
  amount: number;
  status: string;
  date: string;
}

interface InvoiceItem {
  id: string;
  invoiceNumber: string;
  clientName: string;
  totalAmount: number;
  status: string;
}

const ApprovalQueue: React.FC = () => {
  const [reimbursements, setReimbursements] = useState<ReimbursementItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'reimbursements' | 'invoices'>('reimbursements');

  const token = localStorage.getItem('token');

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/accounts/approval-queue', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setReimbursements((data.data.reimbursements || []).map((r: any) => ({
          id: r.id,
          claimId: r.claimId || `CLM-${r.id.substring(0,6).toUpperCase()}`,
          employeeName: `${r.employee?.firstName || ''} ${r.employee?.lastName || ''}`.trim(),
          category: r.category || 'Expense',
          amount: r.amount,
          status: r.status,
          date: r.createdAt || r.date || new Date().toISOString()
        })));
        setInvoices((data.data.invoices || []).map((i: any) => ({
          id: i.id,
          invoiceNumber: i.invoiceNumber,
          clientName: i.client?.name || 'N/A',
          totalAmount: i.totalAmount,
          status: i.status
        })));
      } else {
        // Fallback mock queues
        setReimbursements([
          { id: "1", claimId: "CLM-A8271", employeeName: "Aditya Sharma", category: "Client Travel", amount: 45000, status: "PENDING_ACCOUNTS", date: "2026-05-10" },
          { id: "2", claimId: "CLM-B9210", employeeName: "Rohan Varma", category: "Office Overheads", amount: 120000, status: "PENDING_MANAGER", date: "2026-05-12" },
          { id: "3", claimId: "CLM-C4829", employeeName: "Nisha Sen", category: "Client Entertainment", amount: 550000, status: "PENDING_PARTNER", date: "2026-05-14" }
        ]);
        setInvoices([
          { id: "10", invoiceNumber: "INV-2026-0001", clientName: "Zephyr Ventures LLC", totalAmount: 413000, status: "PENDING_APPROVAL" }
        ]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const handleAction = async (type: 'reimbursement' | 'invoice', id: string, remarks: string) => {
    try {
      const response = await fetch(`/api/accounts/approval-queue/${type}/${id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ remarks })
      });
      const data = await response.json();
      if (data.success) {
        alert('Verification successfully processed!');
        fetchQueue();
      } else {
        alert(data.message || 'Error processing approval');
      }
    } catch (err) {
      alert('Failed to process approval');
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  return (
    <div className="p-6 space-y-8 font-sans text-secondary-900 dark:text-white">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-primary-600 to-indigo-600 dark:from-primary-400 dark:to-indigo-400 bg-clip-text text-transparent flex items-center gap-3">
          <ShieldCheckIcon className="w-10 h-10 text-primary-500" />
          Finance Verification Matrix
        </h1>
        <p className="text-secondary-500 dark:text-secondary-400 font-medium mt-1">
          Review, authenticate, and release claims and billing drafts based on the CFO authority grid.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-secondary-200 dark:border-secondary-800 pb-px">
        <button
          onClick={() => setActiveTab('reimbursements')}
          className={`pb-4 px-2 font-black text-sm tracking-wider uppercase border-b-2 transition-all ${
            activeTab === 'reimbursements'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-secondary-400 hover:text-secondary-600'
          }`}
        >
          Expense Claims ({reimbursements.length})
        </button>
        <button
          onClick={() => setActiveTab('invoices')}
          className={`pb-4 px-2 font-black text-sm tracking-wider uppercase border-b-2 transition-all ${
            activeTab === 'invoices'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-secondary-400 hover:text-secondary-600'
          }`}
        >
          Invoice Drafts ({invoices.length})
        </button>
      </div>

      {/* Queue Listing */}
      {activeTab === 'reimbursements' && (
        <div className="glass-card rounded-[2rem] border border-white/20 dark:border-white/5 shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-secondary-50 dark:bg-secondary-800/40 text-secondary-500 dark:text-secondary-400 text-xs font-bold uppercase tracking-wider">
                  <th className="p-5">Claim ID</th>
                  <th className="p-5">Employee Name</th>
                  <th className="p-5">Category</th>
                  <th className="p-5 text-right">Amount</th>
                  <th className="p-5">Authority Requirement</th>
                  <th className="p-5 text-center">Status</th>
                  <th className="p-5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary-200 dark:divide-secondary-800 font-semibold text-sm">
                {reimbursements.map((item) => (
                  <tr key={item.id} className="hover:bg-secondary-50/40 dark:hover:bg-secondary-800/10 transition-colors">
                    <td className="p-5 text-primary-600 dark:text-primary-400 font-bold">{item.claimId}</td>
                    <td className="p-5 font-bold">{item.employeeName}</td>
                    <td className="p-5 text-secondary-500">{item.category}</td>
                    <td className="p-5 text-right font-black text-red-500">{formatCurrency(item.amount)}</td>
                    <td className="p-5 text-xs">
                      {item.amount < 50000 && <span className="text-secondary-500">Manager Sign-off</span>}
                      {item.amount >= 50000 && item.amount < 500000 && <span className="text-indigo-500 font-bold">Director Authority</span>}
                      {item.amount >= 500000 && <span className="text-red-500 font-black tracking-wider uppercase">CFO Authority</span>}
                    </td>
                    <td className="p-5 text-center">
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-500 uppercase">
                        {item.status}
                      </span>
                    </td>
                    <td className="p-5">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => handleAction('reimbursement', item.id, 'Approved via verification desk')}
                          className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl shadow-md text-xs font-bold transition-all active:scale-[0.98]"
                        >
                          Verify & Approve
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {reimbursements.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-10 text-center text-secondary-400 font-bold">
                      No pending expense claims in authorization queue.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'invoices' && (
        <div className="glass-card rounded-[2rem] border border-white/20 dark:border-white/5 shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-secondary-50 dark:bg-secondary-800/40 text-secondary-500 dark:text-secondary-400 text-xs font-bold uppercase tracking-wider">
                  <th className="p-5">Invoice Number</th>
                  <th className="p-5">Client Name</th>
                  <th className="p-5 text-right">Draft Total</th>
                  <th className="p-5 text-center">Status</th>
                  <th className="p-5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary-200 dark:divide-secondary-800 font-semibold text-sm">
                {invoices.map((item) => (
                  <tr key={item.id} className="hover:bg-secondary-50/40 dark:hover:bg-secondary-800/10 transition-colors">
                    <td className="p-5 text-primary-600 dark:text-primary-400 font-bold">{item.invoiceNumber}</td>
                    <td className="p-5 font-bold">{item.clientName}</td>
                    <td className="p-5 text-right font-black text-primary-600 dark:text-primary-400">{formatCurrency(item.totalAmount)}</td>
                    <td className="p-5 text-center">
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-500 uppercase">
                        {item.status}
                      </span>
                    </td>
                    <td className="p-5">
                      <div className="flex justify-center">
                        <button
                          onClick={() => handleAction('invoice', item.id, 'Approved invoice draft release')}
                          className="flex items-center gap-1 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl shadow-md text-xs font-bold transition-all active:scale-[0.98]"
                        >
                          Release Invoice
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-secondary-400 font-bold">
                      No pending invoice drafts awaiting authorization.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApprovalQueue;
