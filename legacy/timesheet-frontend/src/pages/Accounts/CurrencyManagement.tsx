import React, { useState, useEffect } from 'react';
import {
  CurrencyDollarIcon,
  PlusIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  rate: number;
}

const CurrencyManagement: React.FC = () => {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form State
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formSymbol, setFormSymbol] = useState('');
  const [formRate, setFormRate] = useState('');

  const token = localStorage.getItem('token');

  const fetchCurrencies = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/accounts/currencies', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        // Map backend list to view currencies structure
        const list = (data.data || []).map((c: any) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          symbol: c.symbol || '',
          rate: c.exchangeRates && c.exchangeRates.length > 0 
            ? [...c.exchangeRates].sort((a: any, b: any) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime())[0].rate 
            : 1.0
        }));
        setCurrencies(list);
      } else {
        // Fallback default mock currencies
        const mock: Currency[] = [
          { id: "1", code: "INR", name: "Indian Rupee", symbol: "₹", rate: 1.0 },
          { id: "2", code: "USD", name: "US Dollar", symbol: "$", rate: 83.45 },
          { id: "3", code: "AED", name: "UAE Dirham", symbol: "AED", rate: 22.72 },
          { id: "4", code: "EUR", name: "Euro", symbol: "€", rate: 90.15 },
          { id: "5", code: "GBP", name: "Pound Sterling", symbol: "£", rate: 104.50 }
        ];
        setCurrencies(mock);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrencies();
  }, []);

  const handleAddExchangeRate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/accounts/exchange-rates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          currencyCode: formCode,
          rate: parseFloat(formRate),
          date: new Date().toISOString().split('T')[0]
        })
      });
      const data = await response.json();
      if (data.success) {
        setShowAddModal(false);
        fetchCurrencies();
        setFormRate('');
      } else {
        alert(data.message || 'Error updating rate');
      }
    } catch (err) {
      alert('Failed to connect to currency update gateway');
    }
  };

  return (
    <div className="p-6 space-y-8 font-sans text-secondary-900 dark:text-white">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-primary-600 to-indigo-600 dark:from-primary-400 dark:to-indigo-400 bg-clip-text text-transparent">
            Currency & Forex Management
          </h1>
          <p className="text-secondary-500 dark:text-secondary-400 font-medium mt-1">
            Configure business currency registers (INR, USD, AED, EUR, GBP), adjust daily exchange rates, and evaluate forex exposures.
          </p>
        </div>
        <button
          onClick={() => {
            if (currencies.length > 0) setFormCode(currencies[0].code);
            setShowAddModal(true);
          }}
          className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 text-white rounded-2xl shadow-md font-bold transition-all duration-300 active:scale-[0.98]"
        >
          <PlusIcon className="w-5 h-5" />
          Update Exchange Rate
        </button>
      </div>

      {/* Grid of Currencies */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {currencies.map((cur) => (
          <div key={cur.id} className="glass-card p-6 rounded-3xl border border-white/20 dark:border-white/5 shadow-md flex flex-col justify-between hover:scale-[1.03] transition-all duration-300">
            <div>
              <span className="text-xs font-bold text-secondary-400 uppercase tracking-widest block mb-1">{cur.name}</span>
              <span className="text-3xl font-black text-primary-600 dark:text-primary-400">{cur.code} ({cur.symbol})</span>
            </div>
            <div className="mt-6 border-t border-secondary-200 dark:border-secondary-800 pt-4 flex justify-between items-center text-xs font-bold text-secondary-500">
              <span>Conversion vs INR</span>
              <span className="text-sm font-black text-secondary-800 dark:text-secondary-200">₹{cur.rate}</span>
            </div>
          </div>
        ))}
      </div>

      {/* UPDATE MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-secondary-900 border border-white/20 dark:border-white/5 w-full max-w-md rounded-[2rem] shadow-2xl p-8 space-y-6">
            <div className="flex justify-between items-center border-b border-secondary-200 dark:border-secondary-800 pb-4">
              <h2 className="text-2xl font-black tracking-tight">Update Exchange Rate</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-secondary-400 hover:text-secondary-600 font-black text-xl"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddExchangeRate} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-secondary-500">Select Currency</label>
                <select
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  required
                  title="Select Currency"
                  className="w-full p-4 bg-secondary-50 dark:bg-secondary-800/40 border border-secondary-200 dark:border-secondary-700 rounded-2xl outline-none"
                >
                  {currencies.filter(c => c.code !== 'INR').map(c => (
                    <option key={c.id} value={c.code}>{c.code} - {c.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-secondary-500">Exchange Rate (vs Base INR)</label>
                <input
                  type="number"
                  step="0.0001"
                  value={formRate}
                  onChange={(e) => setFormRate(e.target.value)}
                  title="Exchange Rate"
                  placeholder="e.g. 83.45"
                  required
                  className="w-full p-4 bg-secondary-50 dark:bg-secondary-800/40 border border-secondary-200 dark:border-secondary-700 rounded-2xl outline-none"
                />
              </div>

              <div className="flex justify-end gap-4 pb-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-6 py-3 bg-secondary-100 hover:bg-secondary-200 dark:bg-secondary-800 dark:hover:bg-secondary-700 rounded-xl font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-3 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-md transition-all active:scale-[0.98]"
                >
                  Save rate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CurrencyManagement;
