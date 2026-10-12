import React, { useState, useEffect } from 'react';
import {
  InboxStackIcon,
  PlusIcon,
  CheckCircleIcon,
  ArrowTrendingUpIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline';

interface Receipt {
  id: string;
  receiptNumber: string;
  amount: number;
  currency: string;
  receiptDate: string;
  paymentMode: string;
  referenceNumber?: string;
  client: { name: string };
  allocations: Array<{ amountAllocated: number; invoice: { invoiceNumber: string } }>;
}

const ReceiptsManagement: React.FC = () => {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [entities, setEntities] = useState<any[]>([]);

  // Form State
  const [formClientId, setFormClientId] = useState('');
  const [formEntityId, setFormEntityId] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formCurrency, setFormCurrency] = useState('INR');
  const [formExchangeRate, setFormExchangeRate] = useState(1.0);
  const [formMode, setFormMode] = useState('RTGS');
  const [formRef, setFormRef] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const token = localStorage.getItem('token');

  const fetchDropdowns = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const cRes = await fetch('/api/clients', { headers });
      const cData = await cRes.json();
      setClients(cData.clients || cData.data || []);
      if (cData.clients && cData.clients.length > 0) setFormClientId(cData.clients[0].id);

      const eRes = await fetch('/api/accounts/entities', { headers });
      const eData = await eRes.json();
      setEntities(eData.data || []);
      if (eData.data && eData.data.length > 0) setFormEntityId(eData.data[0].id);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchReceipts = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/accounts/receipts', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setReceipts(data.data);
      } else {
        setError(data.message || 'Failed to fetch receipts');
      }
    } catch (err) {
      setError('Connection failure loading collections log');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReceipts();
    fetchDropdowns();
  }, []);

  const handleCreateReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/accounts/receipts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          clientId: formClientId,
          entityId: formEntityId,
          amount: parseFloat(formAmount),
          currency: formCurrency,
          exchangeRate: formExchangeRate,
          receiptDate: new Date().toISOString(),
          paymentMode: formMode,
          referenceNumber: formRef,
          notes: formNotes
        })
      });
      const data = await response.json();
      if (data.success) {
        setShowCreateModal(false);
        fetchReceipts();
        // Reset form
        setFormAmount('');
        setFormRef('');
        setFormNotes('');
      } else {
        alert(data.message || 'Error recording receipt');
      }
    } catch (err) {
      alert('Network error recording receipt');
    }
  };

  const formatCurrency = (val: number, cur = 'INR') => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: 0
    }).format(val);
  };

  return (
    <div className="p-6 space-y-8 font-sans text-secondary-900 dark:text-white">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-primary-600 to-indigo-600 dark:from-primary-400 dark:to-indigo-400 bg-clip-text text-transparent">
            Receipts & Collections (AR)
          </h1>
          <p className="text-secondary-500 dark:text-secondary-400 font-medium mt-1">
            Record customer payments, upload bank wire references, and automatically clear outstanding invoices via FIFO allocations.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 text-white rounded-2xl shadow-md font-bold transition-all duration-300 active:scale-[0.98]"
        >
          <PlusIcon className="w-5 h-5" />
          Record Receipt
        </button>
      </div>

      {/* Receipts Table */}
      <div className="glass-card rounded-[2rem] border border-white/20 dark:border-white/5 shadow-xl overflow-hidden">
        <div className="p-6 border-b border-secondary-200 dark:border-secondary-800 bg-white/50 dark:bg-black/20">
          <h3 className="font-black text-lg tracking-tight">Collections & Credit Logs</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary-50 dark:bg-secondary-800/40 text-secondary-500 dark:text-secondary-400 text-xs font-bold uppercase tracking-wider">
                <th className="p-5">Receipt Number</th>
                <th className="p-5">Client</th>
                <th className="p-5">Receipt Date</th>
                <th className="p-5">Payment Mode</th>
                <th className="p-5">Reference wire No.</th>
                <th className="p-5 text-right">Amount Received</th>
                <th className="p-5">FIFO Allocations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-secondary-200 dark:divide-secondary-800 font-semibold text-sm">
              {receipts.map((rcpt) => (
                <tr key={rcpt.id} className="hover:bg-secondary-50/40 dark:hover:bg-secondary-800/10 transition-colors">
                  <td className="p-5 font-bold text-primary-600 dark:text-primary-400">{rcpt.receiptNumber}</td>
                  <td className="p-5 font-bold">{rcpt.client?.name || 'N/A'}</td>
                  <td className="p-5 text-secondary-500 text-xs">
                    {new Date(rcpt.receiptDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                  </td>
                  <td className="p-5 text-secondary-500 text-xs">{rcpt.paymentMode}</td>
                  <td className="p-5 font-semibold text-secondary-700 dark:text-secondary-300 text-xs">{rcpt.referenceNumber || 'N/A'}</td>
                  <td className="p-5 text-right font-black text-emerald-600">{formatCurrency(rcpt.amount, rcpt.currency)}</td>
                  <td className="p-5">
                    <div className="flex flex-col gap-1.5">
                      {(rcpt.allocations || []).map((a, i) => (
                        <span key={i} className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-600 bg-emerald-500/5 px-2 py-0.5 rounded-full border border-emerald-500/10">
                          {formatCurrency(a.amountAllocated, rcpt.currency)} allocated to {a.invoice?.invoiceNumber}
                        </span>
                      ))}
                      {(!rcpt.allocations || rcpt.allocations.length === 0) && (
                        <span className="text-[10px] font-extrabold text-secondary-400">Unallocated Advance</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {receipts.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-secondary-400 font-bold">
                    No Receipts registered yet. Click "Record Receipt" to add one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE RECEIPT MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-secondary-900 border border-white/20 dark:border-white/5 w-full max-w-2xl rounded-[2rem] shadow-2xl p-8 max-h-[90vh] overflow-y-auto space-y-6">
            <div className="flex justify-between items-center border-b border-secondary-200 dark:border-secondary-800 pb-4">
              <h2 className="text-2xl font-black tracking-tight">Record Client Collection</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-secondary-400 hover:text-secondary-600 font-black text-xl"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateReceipt} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-secondary-500">Billing Entity</label>
                  <select
                    value={formEntityId}
                    onChange={(e) => setFormEntityId(e.target.value)}
                    required
                    title="Billing Entity"
                    className="w-full p-4 bg-secondary-50 dark:bg-secondary-800/40 border border-secondary-200 dark:border-secondary-700 rounded-2xl outline-none"
                  >
                    {entities.map(ent => (
                      <option key={ent.id} value={ent.id}>{ent.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-secondary-500">From Client</label>
                  <select
                    value={formClientId}
                    onChange={(e) => setFormClientId(e.target.value)}
                    required
                    title="From Client"
                    className="w-full p-4 bg-secondary-50 dark:bg-secondary-800/40 border border-secondary-200 dark:border-secondary-700 rounded-2xl outline-none"
                  >
                    {clients.map(cl => (
                      <option key={cl.id} value={cl.id}>{cl.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-secondary-500">Amount Received</label>
                  <input
                    type="number"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    title="Amount Received"
                    placeholder="Enter amount..."
                    required
                    className="w-full p-4 bg-secondary-50 dark:bg-secondary-800/40 border border-secondary-200 dark:border-secondary-700 rounded-2xl outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-secondary-500">Payment Currency</label>
                  <select
                    value={formCurrency}
                    onChange={(e) => setFormCurrency(e.target.value)}
                    title="Payment Currency"
                    className="w-full p-4 bg-secondary-50 dark:bg-secondary-800/40 border border-secondary-200 dark:border-secondary-700 rounded-2xl outline-none"
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="AED">AED (Dirham)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-secondary-500">Payment Mode</label>
                  <select
                    value={formMode}
                    onChange={(e) => setFormMode(e.target.value)}
                    title="Payment Mode"
                    className="w-full p-4 bg-secondary-50 dark:bg-secondary-800/40 border border-secondary-200 dark:border-secondary-700 rounded-2xl outline-none"
                  >
                    <option value="RTGS">RTGS Wire</option>
                    <option value="NEFT">NEFT Transfer</option>
                    <option value="IMPS">IMPS Instant</option>
                    <option value="CHEQUE">Cheque</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-secondary-500">Reference Wire / UTR No.</label>
                  <input
                    type="text"
                    value={formRef}
                    onChange={(e) => setFormRef(e.target.value)}
                    title="Reference Wire / UTR No."
                    placeholder="Enter UTR reference..."
                    className="w-full p-4 bg-secondary-50 dark:bg-secondary-800/40 border border-secondary-200 dark:border-secondary-700 rounded-2xl outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-secondary-500">Internal Accounts Remarks</label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Details of client reconciliation or TDS adjustments..."
                  className="w-full p-4 bg-secondary-50 dark:bg-secondary-800/40 border border-secondary-200 dark:border-secondary-700 rounded-2xl outline-none h-24"
                />
              </div>

              <div className="flex justify-end gap-4 pb-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-6 py-3 bg-secondary-100 hover:bg-secondary-200 dark:bg-secondary-800 dark:hover:bg-secondary-700 rounded-xl font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-3 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-md transition-all active:scale-[0.98]"
                >
                  Record & Allocate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReceiptsManagement;
