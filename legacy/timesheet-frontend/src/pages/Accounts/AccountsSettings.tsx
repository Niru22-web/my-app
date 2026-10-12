import React, { useState, useEffect, useCallback } from 'react';
import {
  Cog8ToothIcon,
  CheckCircleIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  BuildingOfficeIcon,
  UserGroupIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';
import API from '../../api';
import RegisterClientModal from '../../components/RegisterClientModal';
import { InvoiceTemplateModal } from './InvoiceTemplateModal';

interface Entity {
  id: string;
  name: string;
  legalName?: string;
  gstin?: string;
  pan?: string;
  address?: string;
  msmeReg?: string;
  bankDetails?: {
    bankName?: string | null;
    accountNo?: string | null;
    ifsc?: string | null;
    swift?: string | null;
    micr?: string | null;
    gstLut?: string | null;
    accountName?: string | null;
    signature?: string | null;
    authorityDesignation?: string | null;
    terms?: string | null;
    invoicePrefix?: string | null;
    invoiceFormat?: 'sequential' | 'custom' | null;
    customFormat?: string | null;
    // Styling settings
    baseStyle?: 'classic' | 'modern' | null;
    showHeader?: boolean | null;
    showBankDetails?: boolean | null;
    taxLayout?: 'auto' | 'cgst_sgst' | 'igst' | null;
    headerAlign?: 'left' | 'center' | 'right' | null;
    footerAlign?: 'left' | 'center' | 'right' | null;
    wrapText?: boolean | null;
    boldText?: boolean | null;
    brandColor?: string | null;
    textColor?: string | null;
    activeFont?: string | null;
    companyFontSize?: number | null;
    generalFontSize?: number | null;
    headerSpacing?: number | null;
    clientSpacing?: number | null;
    tableSpacing?: number | null;
    footerSpacing?: number | null;
    signatureSpacing?: number | null;
    clientLeftOffset?: number | null;
    invoiceRightOffset?: number | null;
    bankLeftOffset?: number | null;
    signatureLeftOffset?: number | null;
  } | null;
  status: string;
}

interface Client {
  id: string;
  clientId: string;
  name: string;
  alias?: string;
  gstStatus?: string;
  gstin?: string;
  pan?: string;
  address?: string;
  pin?: string;
  state?: string;
  country?: string;
  phone?: string;
  status?: string;
}

const AccountsSettings: React.FC = () => {
  // Tabs: 'general' | 'entities' | 'clients'
  const [activeTab, setActiveTab] = useState<'general' | 'entities' | 'clients'>('general');

  // General configuration state
  const [baseCurrency, setBaseCurrency] = useState(() => localStorage.getItem('ASA_baseCurrency') || 'INR');
  const [invoicePrefix, setInvoicePrefix] = useState(() => localStorage.getItem('ASA_invoicePrefix') || 'INV');
  const [defaultGst, setDefaultGst] = useState(() => localStorage.getItem('ASA_defaultGst') || '18');
  const [tdsRate, setTdsRate] = useState(() => localStorage.getItem('ASA_tdsRate') || '10');
  const [defaultCgst, setDefaultCgst] = useState(() => localStorage.getItem('ASA_defaultCgst') || '9');
  const [defaultSgst, setDefaultSgst] = useState(() => localStorage.getItem('ASA_defaultSgst') || '9');

  // Entities state
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [showEntityModal, setShowEntityModal] = useState(false);
  const [isEntityEdit, setIsEntityEdit] = useState(false);
  const [editingEntityId, setEditingEntityId] = useState<string | null>(null);

  // Invoice Template Modal State
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateEntity, setTemplateEntity] = useState<Entity | null>(null);

  // Entity Form state
  const [entityName, setEntityName] = useState('');
  const [entityLegalName, setEntityLegalName] = useState('');
  const [entityGstin, setEntityGstin] = useState('');
  const [entityPan, setEntityPan] = useState('');
  const [entityAddress, setEntityAddress] = useState('');
  const [entityMsmeReg, setEntityMsmeReg] = useState('');
  const [entityBankName, setEntityBankName] = useState('');
  const [entityAccountName, setEntityAccountName] = useState('');
  const [entityAccountNo, setEntityAccountNo] = useState('');
  const [entityIfsc, setEntityIfsc] = useState('');
  const [entitySwift, setEntitySwift] = useState('');
  const [entityMicr, setEntityMicr] = useState('');
  const [entityGstLut, setEntityGstLut] = useState('');
  const [entityStatus, setEntityStatus] = useState('ACTIVE');
  const [entityAuthorityName, setEntityAuthorityName] = useState('');
  const [entityAuthorityDesignation, setEntityAuthorityDesignation] = useState('');
  // Invoice Numbering state
  const [entityInvoicePrefix, setEntityInvoicePrefix] = useState('');
  const [entityInvoiceFormat, setEntityInvoiceFormat] = useState<'sequential' | 'custom'>('sequential');
  const [entityCustomFormat, setEntityCustomFormat] = useState('');

  // Clients state
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);
  const [clientEditData, setClientEditData] = useState<Client | null>(null);
  const [clientIsEditMode, setClientIsEditMode] = useState(false);

  // Notifications
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Fetch Entities
  const fetchEntities = useCallback(async () => {
    try {
      setLoadingEntities(true);
      const res = await API.get('/accounts/entities');
      const data = res.data?.success ? res.data.data : res.data;
      setEntities(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      console.error('Failed to fetch entities:', err);
      const errMsg = err instanceof Error ? err.message : 'Failed to fetch billing entities';
      showToast(errMsg, 'error');
    } finally {
      setLoadingEntities(false);
    }
  }, []);

  // Fetch Clients
  const fetchClients = useCallback(async () => {
    try {
      setLoadingClients(true);
      const res = await API.get('/clients', {
        params: { status: 'All Status' }
      });
      const data = res.data?.success ? res.data.data : res.data;
      setClients(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      console.error('Failed to fetch clients:', err);
      const errMsg = err instanceof Error ? err.message : 'Failed to fetch clients';
      showToast(errMsg, 'error');
    } finally {
      setLoadingClients(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'entities') {
      fetchEntities();
    } else if (activeTab === 'clients') {
      fetchClients();
    }
  }, [activeTab, fetchEntities, fetchClients]);

  // General Configurations save
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('ASA_baseCurrency', baseCurrency);
    localStorage.setItem('ASA_invoicePrefix', invoicePrefix);
    localStorage.setItem('ASA_defaultGst', defaultGst);
    localStorage.setItem('ASA_tdsRate', tdsRate);
    localStorage.setItem('ASA_defaultCgst', defaultCgst);
    localStorage.setItem('ASA_defaultSgst', defaultSgst);
    showToast('Accounting configurations saved successfully!');
  };

  // Open entity modal for Create
  const handleOpenCreateEntity = () => {
    setIsEntityEdit(false);
    setEditingEntityId(null);
    setEntityName('');
    setEntityLegalName('');
    setEntityGstin('');
    setEntityPan('');
    setEntityAddress('');
    setEntityMsmeReg('');
    setEntityBankName('');
    setEntityAccountName('');
    setEntityAccountNo('');
    setEntityIfsc('');
    setEntitySwift('');
    setEntityMicr('');
    setEntityGstLut('');
    setEntityStatus('ACTIVE');
    setEntityAuthorityName('');
    setEntityAuthorityDesignation('');
    setEntityInvoicePrefix('');
    setEntityInvoiceFormat('sequential');
    setEntityCustomFormat('');
    setShowEntityModal(true);
  };

  // Open entity modal for Edit
  const handleOpenEditEntity = (ent: Entity) => {
    setIsEntityEdit(true);
    setEditingEntityId(ent.id);
    setEntityName(ent.name || '');
    setEntityLegalName(ent.legalName || '');
    setEntityGstin(ent.gstin || '');
    setEntityPan(ent.pan || '');
    setEntityAddress(ent.address || '');
    setEntityMsmeReg(ent.msmeReg || '');
    setEntityBankName(ent.bankDetails?.bankName || '');
    setEntityAccountName(ent.bankDetails?.accountName || '');
    setEntityAccountNo(ent.bankDetails?.accountNo || '');
    setEntityIfsc(ent.bankDetails?.ifsc || '');
    setEntitySwift(ent.bankDetails?.swift || '');
    setEntityMicr(ent.bankDetails?.micr || '');
    setEntityGstLut(ent.bankDetails?.gstLut || '');
    setEntityStatus(ent.status || 'ACTIVE');
    setEntityAuthorityName(ent.bankDetails?.signature || '');
    setEntityAuthorityDesignation(ent.bankDetails?.authorityDesignation || '');
    // Invoice numbering
    setEntityInvoicePrefix(ent.bankDetails?.invoicePrefix || '');
    setEntityInvoiceFormat(ent.bankDetails?.invoiceFormat || 'sequential');
    setEntityCustomFormat(ent.bankDetails?.customFormat || '');
    setShowEntityModal(true);
  };

  // Submit Entity form
  const handleSaveEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entityName.trim()) {
      alert('Entity Name is required');
      return;
    }

    const editingEntity = entities.find(e => e.id === editingEntityId);
    const existingBankDetails = editingEntity?.bankDetails || {};

    const payload = {
      name: entityName.trim(),
      legalName: entityLegalName.trim() || null,
      gstin: entityGstin.trim() || null,
      pan: entityPan.trim().toUpperCase() || null,
      address: entityAddress.trim() || null,
      msmeReg: entityMsmeReg.trim() || null,
      status: entityStatus,
      bankDetails: {
        ...existingBankDetails,
        bankName: entityBankName.trim() || null,
        accountName: entityAccountName.trim() || null,
        accountNo: entityAccountNo.trim() || null,
        ifsc: entityIfsc.trim().toUpperCase() || null,
        swift: entitySwift.trim().toUpperCase() || null,
        micr: entityMicr.trim() || null,
        gstLut: entityGstLut.trim() || null,
        signature: entityAuthorityName.trim() || null,
        authorityDesignation: entityAuthorityDesignation.trim() || null,
        invoicePrefix: entityInvoicePrefix.trim() || null,
        invoiceFormat: entityInvoiceFormat || 'sequential',
        customFormat: entityCustomFormat.trim() || null
      }
    };

    try {
      if (isEntityEdit && editingEntityId) {
        await API.put(`/accounts/entities/${editingEntityId}`, payload);
        showToast('Billing entity updated successfully!');
      } else {
        await API.post('/accounts/entities', payload);
        showToast('Billing entity created successfully!');
      }
      setShowEntityModal(false);
      fetchEntities();
    } catch (err: unknown) {
      console.error('Failed to save entity:', err);
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      alert(`Failed to save entity: ${errMsg}`);
    }
  };

  // Delete Entity
  const handleDeleteEntity = async (entId: string) => {
    if (!window.confirm('Are you sure you want to delete this billing entity?')) return;
    try {
      await API.delete(`/accounts/entities/${entId}`);
      showToast('Billing entity deleted successfully!');
      fetchEntities();
    } catch (err: unknown) {
      console.error('Failed to delete entity:', err);
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      alert(`Failed to delete entity: ${errMsg}`);
    }
  };

  // Client actions
  const handleOpenCreateClient = () => {
    setClientIsEditMode(false);
    setClientEditData(null);
    setShowClientModal(true);
  };

  const handleOpenEditClient = (cl: Client) => {
    setClientIsEditMode(true);
    setClientEditData(cl);
    setShowClientModal(true);
  };

  const handleDeleteClient = async (clId: string) => {
    if (!window.confirm('Are you sure you want to delete this client?')) return;
    try {
      await API.delete(`/clients/${clId}`);
      showToast('Client deleted successfully!');
      fetchClients();
    } catch (err: unknown) {
      console.error('Failed to delete client:', err);
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      alert(`Failed to delete client: ${errMsg}`);
    }
  };

  return (
    <div className="p-6 space-y-8 font-sans text-secondary-900 dark:text-white">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-primary-600 to-indigo-600 dark:from-primary-400 dark:to-indigo-400 bg-clip-text text-transparent">
          Finance &amp; Accounts Settings
        </h1>
        <p className="text-secondary-500 dark:text-secondary-400 font-medium mt-1">
          Configure accounting parameters, tax defaults, and manage master records for entities and clients.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-secondary-200 dark:border-secondary-800 gap-6">
        <button
          onClick={() => setActiveTab('general')}
          className={`pb-3 text-sm font-bold uppercase tracking-wider transition-all border-b-2 outline-none ${activeTab === 'general' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-secondary-400 hover:text-secondary-600'}`}
        >
          General Configurations
        </button>
        <button
          onClick={() => setActiveTab('entities')}
          className={`pb-3 text-sm font-bold uppercase tracking-wider transition-all border-b-2 outline-none ${activeTab === 'entities' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-secondary-400 hover:text-secondary-600'}`}
        >
          Billing Entities Master
        </button>
        <button
          onClick={() => setActiveTab('clients')}
          className={`pb-3 text-sm font-bold uppercase tracking-wider transition-all border-b-2 outline-none ${activeTab === 'clients' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-secondary-400 hover:text-secondary-600'}`}
        >
          Clients Master
        </button>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border ${notification.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'} animate-fade-in`}>
          <CheckCircleIcon className="w-5 h-5" />
          <span className="text-xs font-bold">{notification.text}</span>
        </div>
      )}

      {/* TAB CONTENTS */}
      {activeTab === 'general' && (
        <div className="glass-card rounded-[2rem] border border-white/20 dark:border-white/5 shadow-xl p-8 space-y-6 max-w-2xl">
          <h3 className="text-xl font-black tracking-tight flex items-center gap-2 text-slate-800 dark:text-slate-200">
            <Cog8ToothIcon className="w-6 h-6 text-primary-500" />
            General Ledger Configurations
          </h3>

          <form onSubmit={handleSaveSettings} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-secondary-500">Base Currency</label>
              <select
                value={baseCurrency}
                onChange={(e) => setBaseCurrency(e.target.value)}
                title="Base Currency"
                className="w-full p-4 bg-secondary-50 dark:bg-secondary-800/40 border border-secondary-200 dark:border-secondary-700 rounded-2xl outline-none"
              >
                <option value="INR">INR (₹) - Indian Rupee</option>
                <option value="USD">USD ($) - US Dollar</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-secondary-500">Auto Invoice Prefix Format</label>
              <input
                type="text"
                value={invoicePrefix}
                onChange={(e) => setInvoicePrefix(e.target.value)}
                title="Auto Invoice Prefix Format"
                placeholder="e.g. INV-YYYY-"
                className="w-full p-4 bg-secondary-50 dark:bg-secondary-800/40 border border-secondary-200 dark:border-secondary-700 rounded-2xl outline-none text-slate-800 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-secondary-500">Default Service GST %</label>
                <select
                  value={defaultGst}
                  onChange={(e) => setDefaultGst(e.target.value)}
                  title="Default Service GST"
                  className="w-full p-4 bg-secondary-50 dark:bg-secondary-800/40 border border-secondary-200 dark:border-secondary-700 rounded-2xl outline-none"
                >
                  <option value="18">18% (Consultancy Services)</option>
                  <option value="12">12%</option>
                  <option value="5">5%</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-secondary-500">Corporate TDS Rate %</label>
                <input
                  type="number"
                  value={tdsRate}
                  onChange={(e) => setTdsRate(e.target.value)}
                  title="Corporate TDS Rate"
                  placeholder="TDS Rate"
                  className="w-full p-4 bg-secondary-50 dark:bg-secondary-800/40 border border-secondary-200 dark:border-secondary-700 rounded-2xl outline-none text-slate-800 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-secondary-500">Default CGST Rate %</label>
                <input
                  type="number"
                  step="0.1"
                  value={defaultCgst}
                  onChange={(e) => setDefaultCgst(e.target.value)}
                  title="Default CGST Rate"
                  placeholder="e.g. 9"
                  className="w-full p-4 bg-secondary-50 dark:bg-secondary-800/40 border border-secondary-200 dark:border-secondary-700 rounded-2xl outline-none text-slate-800 dark:text-white"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-secondary-500">Default SGST Rate %</label>
                <input
                  type="number"
                  step="0.1"
                  value={defaultSgst}
                  onChange={(e) => setDefaultSgst(e.target.value)}
                  title="Default SGST Rate"
                  placeholder="e.g. 9"
                  className="w-full p-4 bg-secondary-50 dark:bg-secondary-800/40 border border-secondary-200 dark:border-secondary-700 rounded-2xl outline-none text-slate-800 dark:text-white"
                />
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                type="submit"
                className="px-6 py-3 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-md transition-all active:scale-[0.98]"
              >
                Save Configurations
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'entities' && (
        <div className="space-y-6">
          {/* Top Actions */}
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-black tracking-tight flex items-center gap-2 text-slate-800 dark:text-slate-200">
              <BuildingOfficeIcon className="w-6 h-6 text-indigo-500" />
              Corporate Billing Entities
            </h3>
            <button
              onClick={handleOpenCreateEntity}
              className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-primary-600 hover:from-indigo-750 hover:to-primary-750 text-white text-xs font-extrabold uppercase tracking-wider rounded-xl shadow-md flex items-center gap-2 transition-all active:scale-[0.98]"
            >
              <PlusIcon className="w-4 h-4" />
              Add Entity
            </button>
          </div>

          {/* Table list */}
          <div className="glass-card rounded-[2rem] border border-white/20 dark:border-white/5 shadow-xl overflow-hidden">
            {loadingEntities ? (
              <div className="p-8 text-center text-slate-400">Loading Billing Entities...</div>
            ) : entities.length === 0 ? (
              <div className="p-8 text-center text-slate-400">No Billing Entities found. Click "Add Entity" to create one.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-secondary-850 text-secondary-500 dark:text-secondary-400 text-[10px] font-extrabold uppercase tracking-wider">
                      <th className="p-4">Entity Details</th>
                      <th className="p-4">Tax Identifiers</th>
                      <th className="p-4">Remittance (Bank Details)</th>
                      <th className="p-4">Invoice No.</th>
                      <th className="p-4">Authority Signatory</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150 dark:divide-secondary-850 text-xs">
                    {entities.map((ent) => (
                      <tr key={ent.id} className="hover:bg-slate-50/50 dark:hover:bg-secondary-900/10 transition-colors">
                        <td className="p-4 max-w-xs space-y-1">
                          <span className="font-extrabold text-sm text-slate-800 dark:text-slate-100 block">{ent.name}</span>
                          {ent.legalName && <span className="text-slate-400 block">{ent.legalName}</span>}
                          {ent.address && <span className="text-[10px] text-slate-500 block leading-tight">{ent.address}</span>}
                        </td>
                        <td className="p-4 space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">GSTIN:</span>
                            <span className="font-mono text-slate-700 dark:text-slate-200">{ent.gstin || 'N/A'}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">PAN:</span>
                            <span className="font-mono text-slate-700 dark:text-slate-200">{ent.pan || 'N/A'}</span>
                          </div>
                          {ent.msmeReg && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">MSME:</span>
                              <span className="font-mono text-slate-500">{ent.msmeReg}</span>
                            </div>
                          )}
                        </td>
                        <td className="p-4 space-y-1 text-slate-700 dark:text-slate-200">
                          {ent.bankDetails?.bankName ? (
                            <>
                              <span className="block font-bold">{ent.bankDetails.bankName}</span>
                              <span className="block text-[10px]">A/C: {ent.bankDetails.accountNo || 'N/A'}</span>
                              <span className="block text-[10px] font-mono">IFSC: {ent.bankDetails.ifsc || 'N/A'}</span>
                            </>
                          ) : (
                            <span className="text-slate-400 italic">No Bank Info</span>
                          )}
                        </td>
                        {/* Invoice No. column */}
                        <td className="p-4">
                          {ent.bankDetails?.invoicePrefix ? (
                            <div className="space-y-1">
                              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 block text-xs">
                                {ent.bankDetails.invoicePrefix}
                                {ent.bankDetails.customFormat ? `/${ent.bankDetails.customFormat}` : '/*'}
                              </span>
                              <span className="text-[9px] text-slate-400 uppercase block">
                                {ent.bankDetails.invoiceFormat === 'custom' ? 'Custom' : 'Sequential'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[10px]">Not configured</span>
                          )}
                        </td>
                        <td className="p-4 space-y-0.5">
                          {ent.bankDetails?.signature ? (
                            <>
                              <span className="font-bold text-slate-800 dark:text-slate-100 block text-xs">{ent.bankDetails.signature}</span>
                              {ent.bankDetails?.authorityDesignation && (
                                <span className="text-[10px] text-slate-400 block">{ent.bankDetails.authorityDesignation}</span>
                              )}
                            </>
                          ) : (
                            <span className="text-slate-400 italic text-[10px]">Not Set</span>
                          )}
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${ent.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-500/10 text-slate-500'}`}>
                            {ent.status}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => {
                                setTemplateEntity(ent);
                                setShowTemplateModal(true);
                              }}
                              className="p-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-500 rounded-lg transition-all"
                              title="Invoice Template Settings"
                            >
                              <DocumentTextIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleOpenEditEntity(ent)}
                              className="p-1.5 bg-secondary-100 hover:bg-secondary-200 dark:bg-secondary-800 dark:hover:bg-secondary-750 text-slate-700 dark:text-slate-300 rounded-lg transition-all"
                              title="Edit Entity"
                            >
                              <PencilSquareIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteEntity(ent.id)}
                              className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-all"
                              title="Delete Entity"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'clients' && (
        <div className="space-y-6">
          {/* Top Actions */}
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-black tracking-tight flex items-center gap-2 text-slate-800 dark:text-slate-200">
              <UserGroupIcon className="w-6 h-6 text-primary-500" />
              Corporate Clients Directory
            </h3>
            <button
              onClick={handleOpenCreateClient}
              className="px-4 py-2.5 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-750 hover:to-indigo-750 text-white text-xs font-extrabold uppercase tracking-wider rounded-xl shadow-md flex items-center gap-2 transition-all active:scale-[0.98]"
            >
              <PlusIcon className="w-4 h-4" />
              Add Client
            </button>
          </div>

          {/* Table list */}
          <div className="glass-card rounded-[2rem] border border-white/20 dark:border-white/5 shadow-xl overflow-hidden">
            {loadingClients ? (
              <div className="p-8 text-center text-slate-400">Loading Clients...</div>
            ) : clients.length === 0 ? (
              <div className="p-8 text-center text-slate-400">No clients found. Click "Add Client" to register one.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-secondary-850 text-secondary-500 dark:text-secondary-400 text-[10px] font-extrabold uppercase tracking-wider">
                      <th className="p-4">Client ID &amp; Name</th>
                      <th className="p-4">State &amp; Country</th>
                      <th className="p-4">GST / PAN Details</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150 dark:divide-secondary-850 text-xs">
                    {clients.map((cl) => (
                      <tr key={cl.id} className="hover:bg-slate-50/50 dark:hover:bg-secondary-900/10 transition-colors">
                        <td className="p-4 space-y-1">
                          <span className="font-mono text-[10px] text-indigo-500 dark:text-indigo-400 block uppercase font-bold">{cl.clientId}</span>
                          <span className="font-extrabold text-sm text-slate-800 dark:text-slate-100 block">{cl.name}</span>
                          {cl.alias && <span className="text-xs text-slate-400">({cl.alias})</span>}
                        </td>
                        <td className="p-4 space-y-0.5 text-slate-700 dark:text-slate-200">
                          <span className="block font-semibold">{cl.state || 'N/A'}</span>
                          <span className="block text-[10px] text-slate-400">{cl.country || 'N/A'}</span>
                        </td>
                        <td className="p-4 space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">GST Status:</span>
                            <span className="text-slate-700 dark:text-slate-200 font-bold">{cl.gstStatus || 'No'}</span>
                          </div>
                          {cl.gstin && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">GSTIN:</span>
                              <span className="font-mono text-slate-700 dark:text-slate-200">{cl.gstin}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">PAN:</span>
                            <span className="font-mono text-slate-700 dark:text-slate-200">{cl.pan || 'N/A'}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${cl.status === 'Active' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-500/10 text-slate-500'}`}>
                            {cl.status}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleOpenEditClient(cl)}
                              className="p-1.5 bg-secondary-100 hover:bg-secondary-200 dark:bg-secondary-800 dark:hover:bg-secondary-750 text-slate-700 dark:text-slate-350 rounded-lg transition-all"
                              title="Edit Client"
                            >
                              <PencilSquareIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteClient(cl.id)}
                              className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-all"
                              title="Delete Client"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* BILLING ENTITY CRUD FORM MODAL */}
      {showEntityModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-secondary-900 border border-slate-200 dark:border-secondary-800 w-full max-w-xl rounded-3xl p-6 md:p-8 shadow-2xl relative space-y-6 animate-fade-in text-slate-900 dark:text-white">
            <h3 className="text-xl font-black tracking-tight border-b pb-3 border-slate-100 dark:border-secondary-850">
              {isEntityEdit ? 'Modify Billing Entity' : 'Setup New Billing Entity'}
            </h3>

            <form onSubmit={handleSaveEntity} className="space-y-4 max-h-[72vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold uppercase text-slate-400">Entity Display Name *</label>
                  <input
                    type="text"
                    required
                    value={entityName}
                    onChange={(e) => setEntityName(e.target.value)}
                    placeholder="e.g. ASA India"
                    className="w-full p-3 bg-secondary-50 dark:bg-secondary-950 border border-slate-200 dark:border-secondary-800 rounded-xl text-xs font-semibold focus:border-primary-500 outline-none transition-all text-slate-800 dark:text-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold uppercase text-slate-400">Legal Company Name</label>
                  <input
                    type="text"
                    value={entityLegalName}
                    onChange={(e) => setEntityLegalName(e.target.value)}
                    placeholder="e.g. Ashish Shah & Associates India Pvt Ltd"
                    className="w-full p-3 bg-secondary-50 dark:bg-secondary-950 border border-slate-200 dark:border-secondary-800 rounded-xl text-xs font-semibold focus:border-primary-500 outline-none transition-all text-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold uppercase text-slate-400">GSTIN Number</label>
                  <input
                    type="text"
                    value={entityGstin}
                    onChange={(e) => setEntityGstin(e.target.value)}
                    placeholder="e.g. 27AAACA1234F1Z0"
                    className="w-full p-3 bg-secondary-50 dark:bg-secondary-950 border border-slate-200 dark:border-secondary-800 rounded-xl text-xs font-semibold focus:border-primary-500 outline-none transition-all text-slate-800 dark:text-white font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold uppercase text-slate-400">PAN Number</label>
                  <input
                    type="text"
                    value={entityPan}
                    onChange={(e) => setEntityPan(e.target.value)}
                    placeholder="e.g. AAACA1234F"
                    className="w-full p-3 bg-secondary-50 dark:bg-secondary-950 border border-slate-200 dark:border-secondary-800 rounded-xl text-xs font-semibold focus:border-primary-500 outline-none transition-all text-slate-800 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold uppercase text-slate-400">MSME Registration No</label>
                  <input
                    type="text"
                    value={entityMsmeReg}
                    onChange={(e) => setEntityMsmeReg(e.target.value)}
                    placeholder="e.g. UDYAM-MH-19-..."
                    className="w-full p-3 bg-secondary-50 dark:bg-secondary-950 border border-slate-200 dark:border-secondary-800 rounded-xl text-xs font-semibold focus:border-primary-500 outline-none transition-all text-slate-800 dark:text-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold uppercase text-slate-400">Entity Status</label>
                  <select
                    value={entityStatus}
                    onChange={(e) => setEntityStatus(e.target.value)}
                    title="Entity Status"
                    className="w-full p-3 bg-secondary-50 dark:bg-secondary-950 border border-slate-200 dark:border-secondary-800 rounded-xl text-xs font-semibold focus:border-primary-500 outline-none transition-all"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold uppercase text-slate-400">Registered Office Address</label>
                <textarea
                  value={entityAddress}
                  onChange={(e) => setEntityAddress(e.target.value)}
                  placeholder="Official registered address..."
                  rows={2}
                  className="w-full p-3 bg-secondary-50 dark:bg-secondary-950 border border-slate-200 dark:border-secondary-800 rounded-xl text-xs font-semibold focus:border-primary-500 outline-none transition-all text-slate-800 dark:text-white"
                />
              </div>

              <div className="bg-slate-55/50 dark:bg-secondary-950 p-4.5 rounded-2xl border border-slate-150 dark:border-secondary-850 space-y-4">
                <h4 className="text-[11px] font-black uppercase tracking-wider text-indigo-500">Corporate Bank Details</h4>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase">Bank Name</label>
                      <input
                        type="text"
                        value={entityBankName}
                        onChange={(e) => setEntityBankName(e.target.value)}
                        placeholder="e.g. HDFC Bank"
                        className="w-full p-2.5 bg-white dark:bg-secondary-900 border border-slate-250 dark:border-secondary-800 rounded-lg text-xs focus:border-primary-500 outline-none text-slate-850 dark:text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase">Account Name</label>
                      <input
                        type="text"
                        value={entityAccountName}
                        onChange={(e) => setEntityAccountName(e.target.value)}
                        placeholder="e.g. Ashish Shah &amp; Associates"
                        className="w-full p-2.5 bg-white dark:bg-secondary-900 border border-slate-250 dark:border-secondary-800 rounded-lg text-xs focus:border-primary-500 outline-none text-slate-850 dark:text-white"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase">Account Number</label>
                      <input
                        type="text"
                        value={entityAccountNo}
                        onChange={(e) => setEntityAccountNo(e.target.value)}
                        placeholder="e.g. 502000..."
                        className="w-full p-2.5 bg-white dark:bg-secondary-900 border border-slate-250 dark:border-secondary-800 rounded-lg text-xs focus:border-primary-500 outline-none text-slate-850 dark:text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase">IFSC / RTGS / NEFT Code</label>
                      <input
                        type="text"
                        value={entityIfsc}
                        onChange={(e) => setEntityIfsc(e.target.value)}
                        placeholder="e.g. HDFC0000060"
                        className="w-full p-2.5 bg-white dark:bg-secondary-900 border border-slate-250 dark:border-secondary-800 rounded-lg text-xs focus:border-primary-500 outline-none text-slate-850 dark:text-white font-mono"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase">Swift / BIC Code</label>
                      <input
                        type="text"
                        value={entitySwift}
                        onChange={(e) => setEntitySwift(e.target.value)}
                        placeholder="e.g. EBILAEAD"
                        className="w-full p-2.5 bg-white dark:bg-secondary-900 border border-slate-250 dark:border-secondary-800 rounded-lg text-xs focus:border-primary-500 outline-none text-slate-850 dark:text-white font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase">MICR Code</label>
                      <input
                        type="text"
                        value={entityMicr}
                        onChange={(e) => setEntityMicr(e.target.value)}
                        placeholder="e.g. 400240015"
                        className="w-full p-2.5 bg-white dark:bg-secondary-900 border border-slate-250 dark:border-secondary-800 rounded-lg text-xs focus:border-primary-500 outline-none text-slate-850 dark:text-white font-mono"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase">GST LUT Number <span className="text-slate-300 normal-case font-normal">(Letter of Undertaking — for zero-rated exports)</span></label>
                    <input
                      type="text"
                      value={entityGstLut}
                      onChange={(e) => setEntityGstLut(e.target.value)}
                      placeholder="e.g. AD2024MH00001"
                      className="w-full p-2.5 bg-white dark:bg-secondary-900 border border-slate-250 dark:border-secondary-800 rounded-lg text-xs focus:border-primary-500 outline-none text-slate-850 dark:text-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Invoice Numbering Section */}
              <div className="bg-slate-55/50 dark:bg-secondary-950 p-4.5 rounded-2xl border border-slate-150 dark:border-secondary-850 space-y-4">
                <div>
                  <h4 className="text-[11px] font-black uppercase tracking-wider text-emerald-500">Invoice Numbering</h4>
                  <p className="text-[9px] text-slate-400 mt-0.5">Configure how invoice numbers are auto-generated for this entity</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase">Invoice Prefix
                      <span className="text-slate-300 normal-case font-normal ml-1">(e.g. INV, ASA/INV)</span>
                    </label>
                    <input
                      type="text"
                      value={entityInvoicePrefix}
                      onChange={(e) => setEntityInvoicePrefix(e.target.value)}
                      placeholder="e.g. INV or ASA/2026"
                      className="w-full p-2.5 bg-white dark:bg-secondary-900 border border-slate-250 dark:border-secondary-800 rounded-lg text-xs focus:border-emerald-500 outline-none text-slate-850 dark:text-white font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase">Invoice Format</label>
                    <select
                      value={entityInvoiceFormat}
                      onChange={(e) => setEntityInvoiceFormat(e.target.value as 'sequential' | 'custom')}
                      title="Invoice Format"
                      className="w-full p-2.5 bg-white dark:bg-secondary-900 border border-slate-250 dark:border-secondary-800 rounded-lg text-xs focus:border-emerald-500 outline-none text-slate-850 dark:text-white"
                    >
                      <option value="sequential">Sequential (001, 002, 003…)</option>
                      <option value="custom">Custom Starting Number</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">
                    {entityInvoiceFormat === 'custom' ? 'Custom Number / Starting Value' : 'Starting Number'}
                    <span className="text-slate-300 normal-case font-normal ml-1">(optional — leave blank for auto)</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={entityCustomFormat}
                      onChange={(e) => setEntityCustomFormat(e.target.value)}
                      placeholder="e.g. {NNN} or {YYYY}/{NNN} or 001"
                      className="w-full p-2.5 bg-white dark:bg-secondary-900 border border-slate-250 dark:border-secondary-800 rounded-lg text-xs focus:border-emerald-500 outline-none text-slate-850 dark:text-white font-mono"
                    />
                    {entityInvoicePrefix && entityCustomFormat && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 font-mono bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded">
                        Preview: {entityInvoicePrefix}/{entityCustomFormat}
                      </span>
                    )}
                  </div>
                </div>

                {/* Shortcut Legend Panel */}
                <div className="bg-emerald-50/60 dark:bg-emerald-900/10 border border-emerald-200/60 dark:border-emerald-800/40 rounded-xl p-3 space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Available Shortcut Tokens — Full Form
                  </p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    {[
                      { token: '{NNN}',     full: 'Sequential Number (3-digit pad)',   example: '001, 002, 003' },
                      { token: '{NNNN}',    full: 'Sequential Number (4-digit pad)',   example: '0001, 0002' },
                      { token: '{YYYY}',    full: 'Full Calendar Year',               example: '2025, 2026' },
                      { token: '{YY}',      full: 'Short Year (2-digit)',             example: '25, 26' },
                      { token: '{MM}',      full: 'Month Number (2-digit)',           example: '01, 06, 12' },
                      { token: '{FY}',      full: 'Financial Year (Full)',            example: '2025-26' },
                      { token: '{FY_MID}',  full: 'Financial Year (Short Mid)',       example: '25-26' },
                      { token: '{FY_START}',full: 'Financial Year Start (YYYY)',      example: '2025' },
                      { token: '{FY_END}',  full: 'Financial Year End (YYYY)',        example: '2026' },
                      { token: '{FY_S}',    full: 'Financial Year Start (2-digit)',   example: '25' },
                      { token: '{FY_E}',    full: 'Financial Year End (2-digit)',     example: '26' },
                      { token: '{MON}',     full: 'Month Name (3-letter abbrev)',     example: 'APR, JUN, MAR' },
                    ].map(({ token, full, example }) => (
                      <div key={token} className="flex items-start gap-2">
                        <span className="font-mono text-[9px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
                          {token}
                        </span>
                        <div>
                          <span className="text-[9px] font-semibold text-slate-700 dark:text-slate-300 block leading-tight">{full}</span>
                          <span className="text-[8px] text-slate-400 font-mono">{example}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[8px] text-slate-400 pt-1 border-t border-emerald-200/60 dark:border-emerald-800/40">
                    💡 Combine tokens freely — e.g. Prefix: <span className="font-mono text-emerald-600">ASA</span> + Custom: <span className="font-mono text-emerald-600">{'{FY_MID}'}/{'{NNN}'}</span> → <span className="font-mono font-bold text-emerald-700">ASA/25-26/001</span>
                  </p>
                </div>
              </div>

              {/* Authorized Signatory Details */}
              <div className="bg-slate-55/50 dark:bg-secondary-955 p-4.5 rounded-2xl border border-slate-150 dark:border-secondary-850 space-y-4 animate-fade-in">
                <h4 className="text-[11px] font-black uppercase tracking-wider text-indigo-500">Authorized Signatory Details</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase">Signatory Name</label>
                    <input
                      type="text"
                      value={entityAuthorityName}
                      onChange={(e) => setEntityAuthorityName(e.target.value)}
                      placeholder="e.g. Ashish Shah"
                      className="w-full p-2.5 bg-white dark:bg-secondary-900 border border-slate-250 dark:border-secondary-800 rounded-lg text-xs focus:border-primary-500 outline-none text-slate-850 dark:text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase">Designation</label>
                    <input
                      type="text"
                      value={entityAuthorityDesignation}
                      onChange={(e) => setEntityAuthorityDesignation(e.target.value)}
                      placeholder="e.g. Proprietor"
                      className="w-full p-2.5 bg-white dark:bg-secondary-900 border border-slate-250 dark:border-secondary-800 rounded-lg text-xs focus:border-primary-500 outline-none text-slate-850 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4 border-t border-slate-100 dark:border-secondary-850">
                <button
                  type="button"
                  onClick={() => setShowEntityModal(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-secondary-800 dark:hover:bg-secondary-750 text-xs font-bold uppercase tracking-wider rounded-xl transition-all"
                >
                  Cancel setup
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-750 text-white text-xs font-extrabold uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-[0.98]"
                >
                  Save Entity
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INVOICE TEMPLATE MODAL */}
      {showTemplateModal && templateEntity && (
        <InvoiceTemplateModal
          isOpen={showTemplateModal}
          entity={templateEntity}
          onClose={() => {
            setShowTemplateModal(false);
            setTemplateEntity(null);
          }}
          onSaved={() => {
            showToast('Invoice template details updated successfully!');
            fetchEntities();
            setShowTemplateModal(false);
            setTemplateEntity(null);
          }}
        />
      )}

      {/* CLIENT DIRECTORY CRUD FORM MODAL */}
      {showClientModal && (
        <RegisterClientModal
          isOpen={showClientModal}
          onClose={() => {
            setShowClientModal(false);
            setClientEditData(null);
          }}
          onSuccess={() => {
            fetchClients();
          }}
          editData={clientEditData}
          isEditMode={clientIsEditMode}
        />
      )}
    </div>
  );
};

export default AccountsSettings;
