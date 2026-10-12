import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  DocumentTextIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowPathIcon,
  BuildingOfficeIcon,
  CurrencyRupeeIcon,
  ReceiptPercentIcon,
  ScaleIcon
} from '@heroicons/react/24/outline';
import TableSkeleton from '../../components/ui/TableSkeleton';

interface GSTLine {
  invoiceNumber: string;
  issueDate: string;
  entity: string;
  client: string;
  gstin: string;
  state: string;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalGst: number;
  totalAmount: number;
  gstType: 'Local' | 'Inter-State' | 'Exempt';
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
}

const GSTReports: React.FC = () => {
  const [report, setReport] = useState<GSTLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterEntity, setFilterEntity] = useState('All');
  const [filterType, setFilterType] = useState('All');
  const [filterMonth, setFilterMonth] = useState('All');

  const token = localStorage.getItem('token');

  const fetchGSTReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/accounts/reports/gst', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        // Normalize records: fill fields added by the latest backend that may
        // be absent if the server hasn't restarted after the last deploy.
        const normalized = (data.data as GSTLine[]).map(r => ({
          ...r,
          cgstRate: r.cgstRate ?? (r.cgst > 0 && r.taxableValue > 0 ? (r.cgst / r.taxableValue) * 100 : 0),
          sgstRate: r.sgstRate ?? (r.sgst > 0 && r.taxableValue > 0 ? (r.sgst / r.taxableValue) * 100 : 0),
          igstRate: r.igstRate ?? (r.igst > 0 && r.taxableValue > 0 ? (r.igst / r.taxableValue) * 100 : 0),
          gstType: r.gstType ?? ((r.cgst > 0 || r.sgst > 0) ? 'Local' : r.igst > 0 ? 'Inter-State' : 'Exempt'),
          state: r.state ?? '',
          totalAmount: r.totalAmount ?? (r.taxableValue + r.totalGst),
        }));
        setReport(normalized);
      } else {
        setError(data.message || 'Failed to fetch GST report');
      }
    } catch (err) {
      console.error(err);
      setError('Connection error while fetching GST report');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchGSTReport();
  }, [fetchGSTReport]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(val);

  const formatDate = (iso: string) => {
    if (!iso) return '-';
    try {
      return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));
    } catch { return iso; }
  };

  // Derived filter options
  const entities = useMemo(() => ['All', ...Array.from(new Set(report.map(r => r.entity)))], [report]);
  const months = useMemo(() => {
    const ms = Array.from(new Set(report.map(r => {
      const d = new Date(r.issueDate);
      return isNaN(d.getTime()) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }).filter(Boolean))) as string[];
    ms.sort((a, b) => b.localeCompare(a));
    return ['All', ...ms];
  }, [report]);

  // Filtered data
  const filtered = useMemo(() => {
    return report.filter(r => {
      const matchSearch = !search ||
        r.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
        r.client.toLowerCase().includes(search.toLowerCase()) ||
        (r.gstin || '').toLowerCase().includes(search.toLowerCase());
      const matchEntity = filterEntity === 'All' || r.entity === filterEntity;
      const matchType = filterType === 'All' || r.gstType === filterType;
      const matchMonth = filterMonth === 'All' || (() => {
        const d = new Date(r.issueDate);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return key === filterMonth;
      })();
      return matchSearch && matchEntity && matchType && matchMonth;
    });
  }, [report, search, filterEntity, filterType, filterMonth]);

  // Totals
  const totals = useMemo(() => ({
    taxableValue: filtered.reduce((s, r) => s + r.taxableValue, 0),
    cgst: filtered.reduce((s, r) => s + r.cgst, 0),
    sgst: filtered.reduce((s, r) => s + r.sgst, 0),
    igst: filtered.reduce((s, r) => s + r.igst, 0),
    totalGst: filtered.reduce((s, r) => s + r.totalGst, 0),
    totalAmount: filtered.reduce((s, r) => s + r.totalAmount, 0),
  }), [filtered]);

  // CSV Export
  const exportCSV = () => {
    const headers = ['Invoice No', 'Date', 'Entity', 'Client', 'GSTIN', 'State', 'GST Type', 'Taxable Value', 'CGST %', 'CGST Amt', 'SGST %', 'SGST Amt', 'IGST %', 'IGST Amt', 'Total GST', 'Invoice Total'];
    const rows = filtered.map(r => [
      r.invoiceNumber,
      formatDate(r.issueDate),
      r.entity,
      r.client,
      r.gstin || 'Consumer',
      r.state || '-',
      r.gstType,
      (r.taxableValue ?? 0).toFixed(2),
      (r.cgstRate ?? 0).toFixed(1) + '%',
      (r.cgst ?? 0).toFixed(2),
      (r.sgstRate ?? 0).toFixed(1) + '%',
      (r.sgst ?? 0).toFixed(2),
      (r.igstRate ?? 0).toFixed(1) + '%',
      (r.igst ?? 0).toFixed(2),
      (r.totalGst ?? 0).toFixed(2),
      (r.totalAmount ?? 0).toFixed(2),
    ]);
    const csv = [headers, ...rows].map(row => row.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GST_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
          <ScaleIcon className="w-8 h-8 text-red-500" />
        </div>
        <p className="text-red-500 font-bold text-center max-w-xs">{error}</p>
        <button
          onClick={fetchGSTReport}
          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-md transition-all active:scale-[0.98] flex items-center gap-2"
        >
          <ArrowPathIcon className="w-4 h-4" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 font-sans text-secondary-900 dark:text-white">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-primary-600 to-indigo-600 dark:from-primary-400 dark:to-indigo-400 bg-clip-text text-transparent">
            GST Reports &amp; Tax Ledger
          </h1>
          <p className="text-secondary-500 dark:text-secondary-400 font-medium mt-1">
            GSTR-1 Sales Register — CGST · SGST · IGST breakdowns for all invoices
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchGSTReport}
            title="Refresh data"
            className="p-2.5 rounded-xl bg-white dark:bg-secondary-800 border border-secondary-200 dark:border-secondary-700 hover:bg-secondary-50 dark:hover:bg-secondary-700 shadow-sm transition-all active:scale-95"
          >
            <ArrowPathIcon className="w-4 h-4 text-secondary-500" />
          </button>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-primary-600 hover:from-indigo-700 hover:to-primary-700 text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-95"
          >
            <ArrowDownTrayIcon className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Taxable Turnover', value: totals.taxableValue, icon: CurrencyRupeeIcon, color: 'text-primary-600 dark:text-primary-400', bg: 'from-primary-50 to-indigo-50 dark:from-primary-900/20 dark:to-indigo-900/20' },
          { label: 'Output CGST', value: totals.cgst, icon: ReceiptPercentIcon, color: 'text-violet-600 dark:text-violet-400', bg: 'from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20' },
          { label: 'Output SGST', value: totals.sgst, icon: ReceiptPercentIcon, color: 'text-fuchsia-600 dark:text-fuchsia-400', bg: 'from-fuchsia-50 to-pink-50 dark:from-fuchsia-900/20 dark:to-pink-900/20' },
          { label: 'Output IGST', value: totals.igst, icon: BuildingOfficeIcon, color: 'text-orange-600 dark:text-orange-400', bg: 'from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20' },
          { label: 'Total GST Liability', value: totals.totalGst, icon: ScaleIcon, color: 'text-emerald-600 dark:text-emerald-400', bg: 'from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20' },
          { label: 'Total Invoice Value', value: totals.totalAmount, icon: DocumentTextIcon, color: 'text-sky-600 dark:text-sky-400', bg: 'from-sky-50 to-cyan-50 dark:from-sky-900/20 dark:to-cyan-900/20' },
        ].map(card => (
          <div key={card.label} className={`glass-card p-4 rounded-2xl border border-white/30 dark:border-white/5 shadow-sm bg-gradient-to-br ${card.bg}`}>
            <div className="flex items-center gap-2 mb-2">
              <card.icon className={`w-4 h-4 ${card.color}`} />
              <span className="text-[9px] font-bold text-secondary-400 uppercase tracking-widest">{card.label}</span>
            </div>
            <span className={`text-lg font-black ${card.color}`}>{formatCurrency(card.value)}</span>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="glass-card rounded-2xl border border-white/20 dark:border-white/5 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <FunnelIcon className="w-4 h-4 text-secondary-400" />

          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400" />
            <input
              type="text"
              placeholder="Search invoice, client, GSTIN…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-secondary-800 border border-secondary-200 dark:border-secondary-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>

          {/* Entity filter */}
          <select
            value={filterEntity}
            onChange={e => setFilterEntity(e.target.value)}
            title="Filter by Entity"
            aria-label="Filter by Entity"
            className="text-sm py-2 px-3 bg-white dark:bg-secondary-800 border border-secondary-200 dark:border-secondary-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none min-w-[140px]"
          >
            {entities.map(e => <option key={e}>{e}</option>)}
          </select>

          {/* Month filter */}
          <select
            value={filterMonth}
            onChange={e => setFilterMonth(e.target.value)}
            title="Filter by Month"
            aria-label="Filter by Month"
            className="text-sm py-2 px-3 bg-white dark:bg-secondary-800 border border-secondary-200 dark:border-secondary-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none min-w-[130px]"
          >
            {months.map(m => <option key={m} value={m}>{m === 'All' ? 'All Months' : m}</option>)}
          </select>

          {/* GST Type filter */}
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            title="Filter by GST Type"
            aria-label="Filter by GST Type"
            className="text-sm py-2 px-3 bg-white dark:bg-secondary-800 border border-secondary-200 dark:border-secondary-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none min-w-[130px]"
          >
            <option value="All">All Types</option>
            <option value="Local">Local (CGST+SGST)</option>
            <option value="Inter-State">Inter-State (IGST)</option>
            <option value="Exempt">Exempt</option>
          </select>

          <span className="ml-auto text-xs text-secondary-400 font-semibold whitespace-nowrap">
            {filtered.length} of {report.length} entries
          </span>
        </div>
      </div>

      {/* ── GSTR-1 Table ── */}
      <div className="glass-card rounded-[2rem] border border-white/20 dark:border-white/5 shadow-xl overflow-hidden">
        <div className="p-5 border-b border-secondary-200 dark:border-secondary-800 bg-gradient-to-r from-white/60 to-indigo-50/40 dark:from-black/20 dark:to-indigo-900/10 flex items-center justify-between">
          <div>
            <h3 className="font-black text-base tracking-tight">GSTR-1 · Sales Compliance Register</h3>
            <p className="text-xs text-secondary-400 mt-0.5">All outward taxable supplies — intra-state and inter-state</p>
          </div>
          <DocumentTextIcon className="w-6 h-6 text-indigo-400 opacity-60" />
        </div>

        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-secondary-400">
              <DocumentTextIcon className="w-10 h-10 opacity-30" />
              <p className="font-semibold text-sm">No records match your filters</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-secondary-50 dark:bg-secondary-800/60 text-secondary-500 dark:text-secondary-400 text-[11px] font-bold uppercase tracking-wider border-b border-secondary-200 dark:border-secondary-700">
                  <th className="px-4 py-3 sticky left-0 bg-secondary-50 dark:bg-secondary-800/60 z-10 whitespace-nowrap">Invoice No.</th>
                  <th className="px-4 py-3 whitespace-nowrap">Date</th>
                  <th className="px-4 py-3 whitespace-nowrap">Entity</th>
                  <th className="px-4 py-3 whitespace-nowrap">Client / Party</th>
                  <th className="px-4 py-3 whitespace-nowrap">GSTIN</th>
                  <th className="px-4 py-3 whitespace-nowrap">State</th>
                  <th className="px-4 py-3 whitespace-nowrap">Type</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Taxable (₹)</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap bg-violet-50 dark:bg-violet-900/10">CGST %</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap bg-violet-50 dark:bg-violet-900/10">CGST Amt</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap bg-fuchsia-50 dark:bg-fuchsia-900/10">SGST %</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap bg-fuchsia-50 dark:bg-fuchsia-900/10">SGST Amt</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap bg-orange-50 dark:bg-orange-900/10">IGST %</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap bg-orange-50 dark:bg-orange-900/10">IGST Amt</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Total GST</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Invoice Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary-100 dark:divide-secondary-800/60">
                {filtered.map((line, idx) => (
                  <tr
                    key={`${line.invoiceNumber}-${idx}`}
                    className="hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors group"
                  >
                    {/* Invoice No */}
                    <td className="px-4 py-3 sticky left-0 bg-white dark:bg-secondary-900 group-hover:bg-indigo-50/30 dark:group-hover:bg-indigo-900/10 transition-colors z-10">
                      <span className="font-bold text-primary-600 dark:text-primary-400 text-xs">{line.invoiceNumber}</span>
                    </td>
                    {/* Date */}
                    <td className="px-4 py-3 text-secondary-500 text-xs whitespace-nowrap">{formatDate(line.issueDate)}</td>
                    {/* Entity */}
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-secondary-700 dark:text-secondary-300">
                        <BuildingOfficeIcon className="w-3 h-3 text-secondary-400" />
                        {line.entity}
                      </span>
                    </td>
                    {/* Client */}
                    <td className="px-4 py-3 font-semibold text-secondary-800 dark:text-secondary-200 max-w-[150px]">
                      <span className="block truncate" title={line.client}>{line.client}</span>
                    </td>
                    {/* GSTIN */}
                    <td className="px-4 py-3">
                      {line.gstin ? (
                        <span className="font-mono text-[10px] bg-secondary-100 dark:bg-secondary-800 px-1.5 py-0.5 rounded text-secondary-600 dark:text-secondary-300">{line.gstin}</span>
                      ) : (
                        <span className="text-xs text-secondary-400 italic">Consumer</span>
                      )}
                    </td>
                    {/* State */}
                    <td className="px-4 py-3 text-xs text-secondary-500">{line.state || '-'}</td>
                    {/* GST Type badge */}
                    <td className="px-4 py-3">
                      {line.gstType === 'Local' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 whitespace-nowrap">
                          ● Local
                        </span>
                      )}
                      {line.gstType === 'Inter-State' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 whitespace-nowrap">
                          ● Inter-State
                        </span>
                      )}
                      {line.gstType === 'Exempt' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary-100 text-secondary-500 dark:bg-secondary-800 whitespace-nowrap">
                          ○ Exempt
                        </span>
                      )}
                    </td>
                    {/* Taxable */}
                    <td className="px-4 py-3 text-right font-semibold text-secondary-800 dark:text-secondary-200 whitespace-nowrap">{formatCurrency(line.taxableValue)}</td>
                    {/* CGST % */}
                    <td className="px-4 py-3 text-center bg-violet-50/40 dark:bg-violet-900/5">
                      {line.cgst > 0 ? (
                        <span className="text-[11px] font-bold text-violet-600 dark:text-violet-400">{(line.cgstRate ?? 0).toFixed(1)}%</span>
                      ) : <span className="text-secondary-300">—</span>}
                    </td>
                    {/* CGST Amt */}
                    <td className="px-4 py-3 text-right bg-violet-50/40 dark:bg-violet-900/5 font-semibold text-violet-700 dark:text-violet-300 whitespace-nowrap">
                      {line.cgst > 0 ? formatCurrency(line.cgst) : <span className="text-secondary-300">—</span>}
                    </td>
                    {/* SGST % */}
                    <td className="px-4 py-3 text-center bg-fuchsia-50/40 dark:bg-fuchsia-900/5">
                      {line.sgst > 0 ? (
                        <span className="text-[11px] font-bold text-fuchsia-600 dark:text-fuchsia-400">{(line.sgstRate ?? 0).toFixed(1)}%</span>
                      ) : <span className="text-secondary-300">—</span>}
                    </td>
                    {/* SGST Amt */}
                    <td className="px-4 py-3 text-right bg-fuchsia-50/40 dark:bg-fuchsia-900/5 font-semibold text-fuchsia-700 dark:text-fuchsia-300 whitespace-nowrap">
                      {line.sgst > 0 ? formatCurrency(line.sgst) : <span className="text-secondary-300">—</span>}
                    </td>
                    {/* IGST % */}
                    <td className="px-4 py-3 text-center bg-orange-50/40 dark:bg-orange-900/5">
                      {line.igst > 0 ? (
                        <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400">{(line.igstRate ?? 0).toFixed(1)}%</span>
                      ) : <span className="text-secondary-300">—</span>}
                    </td>
                    {/* IGST Amt */}
                    <td className="px-4 py-3 text-right bg-orange-50/40 dark:bg-orange-900/5 font-semibold text-orange-700 dark:text-orange-300 whitespace-nowrap">
                      {line.igst > 0 ? formatCurrency(line.igst) : <span className="text-secondary-300">—</span>}
                    </td>
                    {/* Total GST */}
                    <td className="px-4 py-3 text-right font-black text-emerald-600 dark:text-emerald-400 whitespace-nowrap">{formatCurrency(line.totalGst)}</td>
                    {/* Invoice Total */}
                    <td className="px-4 py-3 text-right font-black text-secondary-800 dark:text-secondary-100 whitespace-nowrap">{formatCurrency(line.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
              {/* Totals Row */}
              <tfoot>
                <tr className="bg-gradient-to-r from-secondary-100 to-indigo-50 dark:from-secondary-800 dark:to-indigo-900/20 border-t-2 border-secondary-300 dark:border-secondary-600 font-black text-sm">
                  <td className="px-4 py-4 sticky left-0 bg-secondary-100 dark:bg-secondary-800 z-10 text-secondary-600 dark:text-secondary-300 uppercase tracking-wider text-[11px]">
                    TOTAL
                  </td>
                  <td colSpan={6} className="px-4 py-4 text-secondary-400 text-xs">
                    {filtered.length} Invoice{filtered.length !== 1 ? 's' : ''}
                  </td>
                  <td className="px-4 py-4 text-right text-secondary-800 dark:text-white whitespace-nowrap">{formatCurrency(totals.taxableValue)}</td>
                  <td className="px-4 py-4 text-center bg-violet-100/60 dark:bg-violet-900/20 text-secondary-400">—</td>
                  <td className="px-4 py-4 text-right bg-violet-100/60 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 whitespace-nowrap">{formatCurrency(totals.cgst)}</td>
                  <td className="px-4 py-4 text-center bg-fuchsia-100/60 dark:bg-fuchsia-900/20 text-secondary-400">—</td>
                  <td className="px-4 py-4 text-right bg-fuchsia-100/60 dark:bg-fuchsia-900/20 text-fuchsia-700 dark:text-fuchsia-300 whitespace-nowrap">{formatCurrency(totals.sgst)}</td>
                  <td className="px-4 py-4 text-center bg-orange-100/60 dark:bg-orange-900/20 text-secondary-400">—</td>
                  <td className="px-4 py-4 text-right bg-orange-100/60 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 whitespace-nowrap">{formatCurrency(totals.igst)}</td>
                  <td className="px-4 py-4 text-right text-emerald-700 dark:text-emerald-300 whitespace-nowrap">{formatCurrency(totals.totalGst)}</td>
                  <td className="px-4 py-4 text-right text-secondary-800 dark:text-white whitespace-nowrap">{formatCurrency(totals.totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {/* ── GST Type breakdown mini-cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { type: 'Local', label: 'Intra-State (CGST + SGST)', colorClass: 'border-l-violet-500', bg: 'bg-violet-50/60 dark:bg-violet-900/10' },
          { type: 'Inter-State', label: 'Inter-State (IGST only)', colorClass: 'border-l-orange-500', bg: 'bg-orange-50/60 dark:bg-orange-900/10' },
          { type: 'Exempt', label: 'Exempt / Zero-rated', colorClass: 'border-l-secondary-400', bg: 'bg-secondary-50/60 dark:bg-secondary-800/20' },
        ].map(({ type, label, colorClass, bg }) => {
          const rows = filtered.filter(r => r.gstType === type);
          const gst = rows.reduce((s, r) => s + r.totalGst, 0);
          const taxable = rows.reduce((s, r) => s + r.taxableValue, 0);
          return (
            <div key={type} className={`glass-card rounded-2xl border border-white/20 dark:border-white/5 shadow-sm p-4 border-l-4 ${colorClass} ${bg}`}>
              <div className="text-[10px] font-bold uppercase tracking-widest text-secondary-400 mb-1">{label}</div>
              <div className="text-xl font-black text-secondary-800 dark:text-white">{rows.length} invoices</div>
              <div className="flex justify-between mt-2 text-xs font-semibold">
                <span className="text-secondary-500">Taxable: <span className="text-secondary-800 dark:text-white">{formatCurrency(taxable)}</span></span>
                <span className="text-secondary-500">GST: <span className="text-emerald-600 dark:text-emerald-400">{formatCurrency(gst)}</span></span>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
};

export default GSTReports;
