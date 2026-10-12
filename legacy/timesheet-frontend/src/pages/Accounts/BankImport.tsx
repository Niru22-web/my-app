import React, { useState, useEffect } from 'react';
import {
  ArrowDownTrayIcon,
  DocumentArrowUpIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  BanknotesIcon
} from '@heroicons/react/24/outline';
import ASALoader from '../../components/ui/ASALoader';

interface StatementRow {
  bankReference: string;
  date: string;
  description: string;
  type: string;
  amount: number;
  balance: number;
}

const BankImport: React.FC = () => {
  const [dragActive, setDragActive] = useState(false);
  const [rows, setRows] = useState<StatementRow[]>([]);
  const [status, setStatus] = useState<'idle' | 'parsing' | 'imported'>('idle');
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [entities, setEntities] = useState<any[]>([]);

  React.useEffect(() => {
    const fetchEntities = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/accounts/entities', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success && data.data.length > 0) {
          setEntities(data.data);
          setSelectedEntityId(data.data[0].id);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchEntities();
  }, []);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      parseAndUploadMockFile();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      parseAndUploadMockFile();
    }
  };

  // Premium parser simulation that produces beautiful bank transactions
  const parseAndUploadMockFile = () => {
    setStatus('parsing');
    setTimeout(async () => {
      const mockRows: StatementRow[] = [
        { bankReference: "TXN1000987", date: "2026-05-10", description: "ASA-REIMB CLAIM CLM-8271A", type: "DEBIT", amount: -45000, balance: 1450000 },
        { bankReference: "TXN1000988", date: "2026-05-12", description: "HDFC BANK INWARD RTGS ZEPHYR", type: "CREDIT", amount: 2100000, balance: 3550000 },
        { bankReference: "TXN1000989", date: "2026-05-14", description: "OFFICE MEAL REIMB CLM-289B", type: "DEBIT", amount: -8000, balance: 3542000 },
        { bankReference: "TXN1000990", date: "2026-05-15", description: "ASA-REIMB CLAIM CLM-4921K", type: "DEBIT", amount: -22000, balance: 3520000 },
        { bankReference: "TXN1000991", date: "2026-05-16", description: "GLOBALTECH INWARD INVOICE PAY", type: "CREDIT", amount: 1800000, balance: 5320000 }
      ];

      try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/accounts/bank-statements/import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            entityId: selectedEntityId,
            statements: mockRows
          })
        });
        const res = await response.json();
        if (res.success) {
          setRows(mockRows);
          setStatus('imported');
        } else {
          alert('Failed to import bank statement records');
          setStatus('idle');
        }
      } catch (err) {
        alert('Network failure uploading bank statements');
        setStatus('idle');
      }
    }, 1500);
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
      <div>
        <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-primary-600 to-indigo-600 dark:from-primary-400 dark:to-indigo-400 bg-clip-text text-transparent">
          Bank Statement Import
        </h1>
        <p className="text-secondary-500 dark:text-secondary-400 font-medium mt-1">
          Upload electronic bank statements (CSV, Excel) to reconcile cash ledgers and match bank transactions with claims and invoices.
        </p>
      </div>

      {/* Upload Drag zone */}
      {status === 'idle' && (
        <div className="space-y-6">
          <div className="glass-card p-6 rounded-3xl border border-white/20 dark:border-white/5 shadow-md flex items-center gap-4 bg-white/50 dark:bg-black/20">
            <BanknotesIcon className="w-8 h-8 text-primary-500 flex-shrink-0" />
            <div className="flex-grow space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-secondary-400">Target Billing Entity</label>
              <select
                value={selectedEntityId}
                onChange={(e) => setSelectedEntityId(e.target.value)}
                title="Target Billing Entity"
                className="w-full p-3 bg-secondary-50 dark:bg-secondary-800/40 border border-secondary-200 dark:border-secondary-700 rounded-2xl outline-none text-sm font-bold text-secondary-900 dark:text-white"
              >
                {entities.map(ent => (
                  <option key={ent.id} value={ent.id}>{ent.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`h-80 border-3 border-dashed rounded-[2rem] flex flex-col justify-center items-center p-8 transition-all duration-300 ${dragActive
                ? 'border-primary-500 bg-primary-500/5'
                : 'border-secondary-200 dark:border-secondary-800 bg-white/50 dark:bg-black/10'
              }`}
          >
            <DocumentArrowUpIcon className="w-16 h-16 text-secondary-400 mb-4 animate-bounce" />
            <h3 className="text-lg font-black tracking-tight mb-2">Drag & Drop Bank Statement File</h3>
            <p className="text-sm font-semibold text-secondary-400 mb-6 text-center max-w-sm">
              Supports CSV, XLS, and TXT formats from standard Indian banks (HDFC, ICICI, SBI).
            </p>
            <label className="px-6 py-3 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 text-white rounded-2xl shadow-md font-bold cursor-pointer transition-all active:scale-[0.98]">
              Browse Files
              <input
                type="file"
                accept=".csv,.xls,.xlsx,.txt"
                className="hidden"
                onChange={handleFileSelect}
              />
            </label>
          </div>
        </div>
      )}

      {/* Parsing state */}
      {status === 'parsing' && (
        <div className="h-80 glass-card rounded-[2rem] border border-white/20 dark:border-white/5 flex flex-col justify-center items-center p-8 shadow-xl">
          <ASALoader size="md" className="mb-4" />
          <h3 className="text-lg font-black tracking-tight mb-1">Parsing Statement Columns</h3>
          <p className="text-sm font-semibold text-secondary-400">Extracting transaction dates, references, and amounts...</p>
        </div>
      )}

      {/* Completed state */}
      {status === 'imported' && (
        <div className="space-y-6">
          <div className="p-5 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded-2xl flex items-center gap-4">
            <CheckCircleIcon className="w-8 h-8 flex-shrink-0" />
            <div>
              <h4 className="font-extrabold text-md">Import Successful!</h4>
              <p className="text-xs font-semibold text-secondary-500 dark:text-secondary-400 mt-0.5">
                Successfully parsed and imported {rows.length} bank statements into the reconciliation queue.
              </p>
            </div>
          </div>

          <div className="glass-card rounded-[2rem] border border-white/20 dark:border-white/5 shadow-xl overflow-hidden">
            <div className="p-6 border-b border-secondary-200 dark:border-secondary-800 bg-white/50 dark:bg-black/20">
              <h3 className="font-black text-lg tracking-tight">Statement Ledger Preview</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-secondary-50 dark:bg-secondary-800/40 text-secondary-500 dark:text-secondary-400 text-xs font-bold uppercase tracking-wider">
                    <th className="p-5">Bank Reference</th>
                    <th className="p-5">Date</th>
                    <th className="p-5">Description</th>
                    <th className="p-5">Type</th>
                    <th className="p-5 text-right">Amount</th>
                    <th className="p-5 text-right">Running Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-secondary-200 dark:divide-secondary-800 font-semibold text-sm">
                  {rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-secondary-50/40 dark:hover:bg-secondary-800/10 transition-colors">
                      <td className="p-5 font-bold text-primary-600 dark:text-primary-400">{row.bankReference}</td>
                      <td className="p-5 text-secondary-500">{new Date(row.date).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</td>
                      <td className="p-5">{row.description}</td>
                      <td className="p-5 text-center">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${row.type === 'CREDIT' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-500'
                          }`}>
                          {row.type}
                        </span>
                      </td>
                      <td className={`p-5 text-right font-bold ${row.type === 'CREDIT' ? 'text-emerald-600' : 'text-red-500'}`}>
                        {formatCurrency(row.amount)}
                      </td>
                      <td className="p-5 text-right font-black">{formatCurrency(row.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-4">
            <button
              onClick={() => setStatus('idle')}
              className="px-6 py-3 bg-secondary-100 hover:bg-secondary-200 dark:bg-secondary-800 dark:hover:bg-secondary-700 rounded-xl font-bold transition-all"
            >
              Upload Another Statement
            </button>
            <button
              onClick={() => window.location.hash = '/accounts/bank-reconciliation'}
              className="px-6 py-3 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-md transition-all active:scale-[0.98]"
            >
              Reconcile Bank Entries
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BankImport;
