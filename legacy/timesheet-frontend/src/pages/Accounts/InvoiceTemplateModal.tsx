import React, { useState, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import {
  XMarkIcon,
  DocumentTextIcon,
  CheckIcon,
  ArrowPathIcon,
  ArrowDownTrayIcon
} from '@heroicons/react/24/outline';
import API from '../../api';

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

interface Props {
  isOpen: boolean;
  entity: Entity;
  onClose: () => void;
  onSaved: () => void;
}

// Helper to convert number to words (Indian Numbering System)
const convertNumberToWords = (num: number): string => {
  if (num === 0) return 'Rupees Zero Only';

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];

  const tens = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
  ];

  const convertBelowThousand = (n: number): string => {
    if (n === 0) return '';
    if (n < 20) return ones[n] + ' ';
    if (n < 100) return tens[Math.floor(n / 10)] + ' ' + ones[n % 10] + ' ';
    return ones[Math.floor(n / 100)] + ' Hundred ' + convertBelowThousand(n % 100);
  };

  let result = '';
  let temp = Math.floor(num);

  const crore = Math.floor(temp / 10000000);
  temp %= 10000000;

  const lakh = Math.floor(temp / 100000);
  temp %= 100000;

  const thousand = Math.floor(temp / 1000);
  temp %= 1000;

  if (crore > 0) {
    result += convertBelowThousand(crore) + 'Crore ';
  }
  if (lakh > 0) {
    result += convertBelowThousand(lakh) + 'Lakh ';
  }
  if (thousand > 0) {
    result += convertBelowThousand(thousand) + 'Thousand ';
  }
  if (temp > 0) {
    result += convertBelowThousand(temp);
  }

  const paise = Math.round((num - Math.floor(num)) * 100);
  let paiseStr = '';
  if (paise > 0) {
    paiseStr = ' and Paise ' + convertBelowThousand(paise) + 'Only';
  } else {
    paiseStr = 'Only';
  }

  return 'Rupees ' + result.trim() + ' ' + paiseStr;
};

// Helper to format numeric values (with Indian comma grouping) without currency symbols
const formatAmountNumber = (value: number): string => {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(value);
};

interface TaxInvoiceParam {
  client?: {
    gstin?: string;
    address?: string;
    billingAddress?: string;
    state?: string;
  };
  taxAmount?: number;
  subTotal?: number;
}

// Helper to determine local (CGST + SGST) vs interstate (IGST) details
const getTaxDetails = (invoice: TaxInvoiceParam, overrideMode?: 'auto' | 'local' | 'interstate') => {
  const gstin = invoice.client?.gstin || '';
  const address = invoice.client?.address || invoice.client?.billingAddress || '';
  const taxAmount = invoice.taxAmount || 0;
  const subTotal = invoice.subTotal || 0;

  const masterCgstRate = parseFloat(localStorage.getItem('ASA_defaultCgst') || '9');
  const masterSgstRate = parseFloat(localStorage.getItem('ASA_defaultSgst') || '9');
  const totalGstRate = masterCgstRate + masterSgstRate;

  let isLocal = true; // default to local (Maharashtra)
  if (overrideMode && overrideMode !== 'auto') {
    isLocal = (overrideMode === 'local');
  } else {
    if (gstin && gstin.trim().length >= 2) {
      const stateCode = gstin.trim().substring(0, 2);
      isLocal = (stateCode === '27');
    } else if (invoice.client?.state) {
      const stUpper = invoice.client.state.toUpperCase();
      isLocal = stUpper === 'MAHARASHTRA' || stUpper === 'MH';
    } else if (address) {
      const addrUpper = address.toUpperCase();
      const hasMaharashtra = addrUpper.includes('MAHARASHTRA') || addrUpper.includes('MH') || addrUpper.includes('MUMBAI') || addrUpper.includes('THANE') || addrUpper.includes('PUNE') || addrUpper.includes('GOLDEN NEST');
      isLocal = hasMaharashtra;
    }
  }

  let ratePercent = totalGstRate;
  if (subTotal > 0 && taxAmount > 0) {
    ratePercent = Math.round((taxAmount / subTotal) * 100);
  }

  let displayTaxAmount = taxAmount;
  if (displayTaxAmount === 0 && overrideMode && overrideMode !== 'auto') {
    displayTaxAmount = subTotal * (ratePercent / 100);
  }

  const cgstPercent = isLocal ? (overrideMode === 'local' ? masterCgstRate : ratePercent / 2) : 0;
  const sgstPercent = isLocal ? (overrideMode === 'local' ? masterSgstRate : ratePercent / 2) : 0;

  const totalRate = cgstPercent + sgstPercent;
  const cgstAmount = isLocal ? (totalRate > 0 ? displayTaxAmount * (cgstPercent / totalRate) : displayTaxAmount / 2) : 0;
  const sgstAmount = isLocal ? (totalRate > 0 ? displayTaxAmount * (sgstPercent / totalRate) : displayTaxAmount / 2) : 0;
  const igstAmount = isLocal ? 0 : displayTaxAmount;

  return {
    isLocal,
    ratePercent,
    cgstPercent,
    sgstPercent,
    cgstAmount,
    sgstAmount,
    igstPercent: ratePercent,
    igstAmount
  };
};

const getFontStack = (fontName: string): string => {
  switch (fontName) {
    case 'Times New Roman':
      return '"Times New Roman", Times, serif';
    case 'Arial':
      return 'Arial, Helvetica, sans-serif';
    case 'Georgia':
      return 'Georgia, serif';
    case 'Courier New':
      return '"Courier New", Courier, monospace';
    case 'Garamond':
      return 'Garamond, serif';
    case 'Verdana':
      return 'Verdana, Geneva, sans-serif';
    case 'Trebuchet MS':
      return '"Trebuchet MS", sans-serif';
    case 'Calibri':
      return 'Calibri, sans-serif';
    default:
      return `"${fontName}", sans-serif`;
  }
};

export const InvoiceTemplateModal: React.FC<Props> = ({ isOpen, entity, onClose, onSaved }) => {
  const { themeMode } = useTheme();
  const isDark = themeMode === 'dark';

  // Styles settings state
  const [baseStyle, setBaseStyle] = useState<'classic' | 'modern'>('classic');
  const [headerSpacing, setHeaderSpacing] = useState<number>(0);
  const [clientSpacing, setClientSpacing] = useState<number>(0);
  const [tableSpacing, setTableSpacing] = useState<number>(0);
  const [footerSpacing, setFooterSpacing] = useState<number>(0);
  const [signatureSpacing, setSignatureSpacing] = useState<number>(0);
  const [showLetterhead, setShowLetterhead] = useState<boolean>(true);
  const [showBankDetails, setShowBankDetails] = useState<boolean>(true);
  const [clientLeftOffset, setClientLeftOffset] = useState<number>(0);
  const [invoiceRightOffset, setInvoiceRightOffset] = useState<number>(0);
  const [bankLeftOffset, setBankLeftOffset] = useState<number>(0);
  const [signatureLeftOffset, setSignatureLeftOffset] = useState<number>(0);

  const [activeFont, setActiveFont] = useState<string>('Times New Roman');
  const [companyFontSize, setCompanyFontSize] = useState<number>(26.5);
  const [generalFontSize, setGeneralFontSize] = useState<number>(10.1);
  const [isCustomTypography, setIsCustomTypography] = useState<boolean>(false);

  const [headerAlign, setHeaderAlign] = useState<'left' | 'center' | 'right'>('center');
  const [footerAlign, setFooterAlign] = useState<'left' | 'center' | 'right'>('left');
  const [wrapText, setWrapText] = useState<boolean>(true);
  const [boldText, setBoldText] = useState<boolean>(false);
  const [brandColor, setBrandColor] = useState<string>('#000000');
  const [textColor, setTextColor] = useState<string>('#000000');
  const [taxModeOverride, setTaxModeOverride] = useState<'auto' | 'local' | 'interstate'>('auto');

  const [isSaving, setIsSaving] = useState(false);

  // Sample static invoice for A4 live template preview
  const sampleInvoice = {
    invoiceNumber: 'INV/2026/001',
    issueDate: new Date().toISOString(),
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    udin: '26089304AAAAAA1234',
    subTotal: 100000,
    taxAmount: 18000,
    totalAmount: 118000,
    currency: 'INR',
    exchangeRate: 1,
    status: 'DRAFT',
    client: {
      name: 'Sample Client Ltd.',
      officeEmail: 'accounts@sampleclient.com',
      billingAddress: '101, Business District,\nBKC, Bandra East, Mumbai - 400 051',
      address: '101, Business District,\nBKC, Bandra East, Mumbai - 400 051',
      gstin: '27AAACS1234A1Z1',
      state: 'Maharashtra'
    },
    project: { name: 'IT Consultancy Services' },
    items: [
      {
        description: 'Professional Services - IT Consulting & Software Development',
        quantity: 1,
        unitPrice: 100000,
        total: 100000,
        gstRate: 18,
        sacCode: '998224'
      }
    ],
    notes: 'Thank you for your business.',
    terms: entity.bankDetails?.terms || '1. Payment should be made within 30 days from the invoice date.\n2. Please mention Invoice Number in remittance advise.\n3. Interest at 18% p.a. will be charged for delayed payment.',
    signature: entity.bankDetails?.signature || 'Authorized Signatory'
  };

  // Load styles from entity bankDetails on open
  useEffect(() => {
    if (entity && entity.bankDetails) {
      const bd = entity.bankDetails;
      setBaseStyle(bd.baseStyle || 'classic');
      setHeaderSpacing(bd.headerSpacing ?? 0);
      setClientSpacing(bd.clientSpacing ?? 0);
      setTableSpacing(bd.tableSpacing ?? 0);
      setFooterSpacing(bd.footerSpacing ?? 0);
      setSignatureSpacing(bd.signatureSpacing ?? 0);
      setShowLetterhead(bd.showHeader !== false);
      setShowBankDetails(bd.showBankDetails !== false);
      setClientLeftOffset(bd.clientLeftOffset ?? 0);
      setInvoiceRightOffset(bd.invoiceRightOffset ?? 0);
      setBankLeftOffset(bd.bankLeftOffset ?? 0);
      setSignatureLeftOffset(bd.signatureLeftOffset ?? 0);
      setActiveFont(bd.activeFont || (bd.baseStyle === 'modern' ? 'Arial' : 'Times New Roman'));
      setCompanyFontSize(bd.companyFontSize ?? (bd.baseStyle === 'modern' ? 24.0 : 26.5));
      setGeneralFontSize(bd.generalFontSize ?? (bd.baseStyle === 'modern' ? 12.0 : 10.1));
      setIsCustomTypography(!!bd.activeFont);
      setHeaderAlign(bd.headerAlign || (bd.baseStyle === 'modern' ? 'left' : 'center'));
      setFooterAlign(bd.footerAlign || 'left');
      setWrapText(bd.wrapText !== false);
      setBoldText(!!bd.boldText);
      setBrandColor(bd.brandColor || (bd.baseStyle === 'modern' ? '#4f46e5' : '#000000'));
      setTextColor(bd.textColor || (bd.baseStyle === 'modern' ? '#1e293b' : '#000000'));
      
      if (bd.taxLayout === 'cgst_sgst') {
        setTaxModeOverride('local');
      } else if (bd.taxLayout === 'igst') {
        setTaxModeOverride('interstate');
      } else {
        setTaxModeOverride('auto');
      }
    } else {
      resetToDefaults();
    }
  }, [entity]);

  // Adjust style overrides automatically if baseStyle changes
  const handleBaseStyleChange = (style: 'classic' | 'modern') => {
    setBaseStyle(style);
    if (style === 'modern') {
      setActiveFont('Arial');
      setCompanyFontSize(24.0);
      setGeneralFontSize(12.0);
      setIsCustomTypography(true);
      setHeaderAlign('left');
      setBrandColor('#4f46e5');
      setTextColor('#1e293b');
    } else {
      setActiveFont('Times New Roman');
      setCompanyFontSize(26.5);
      setGeneralFontSize(10.1);
      setIsCustomTypography(false);
      setHeaderAlign('center');
      setBrandColor('#000000');
      setTextColor('#000000');
    }
  };

  const resetToDefaults = () => {
    setBaseStyle('classic');
    setHeaderSpacing(0);
    setClientSpacing(0);
    setTableSpacing(0);
    setFooterSpacing(0);
    setSignatureSpacing(0);
    setShowLetterhead(true);
    setShowBankDetails(true);
    setClientLeftOffset(0);
    setInvoiceRightOffset(0);
    setBankLeftOffset(0);
    setSignatureLeftOffset(0);
    setActiveFont('Times New Roman');
    setCompanyFontSize(26.5);
    setGeneralFontSize(10.1);
    setIsCustomTypography(false);
    setHeaderAlign('center');
    setFooterAlign('left');
    setWrapText(true);
    setBoldText(false);
    setBrandColor('#000000');
    setTextColor('#000000');
    setTaxModeOverride('auto');
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSaveTemplate = async () => {
    setIsSaving(true);
    try {
      const getElementText = (id: string, fallback: string): string => {
        const el = document.getElementById(id);
        return el ? el.innerText.trim() : fallback;
      };

      // Read all manually edited fields from A4 DOM container
      const name = getElementText('template-edit-entity-name', entity.name || '');
      const address = getElementText('template-edit-entity-address', entity.address || '');
      const gstin = getElementText('template-edit-entity-gstin', entity.gstin || '');
      const pan = getElementText('template-edit-entity-pan', entity.pan || '').toUpperCase();
      const msmeReg = getElementText('template-edit-entity-msme', entity.msmeReg || '');
      const gstLut = getElementText('template-edit-entity-gstlut', entity.bankDetails?.gstLut || '');

      const accountName = getElementText('template-edit-bank-account-name', entity.bankDetails?.accountName || '');
      const bankName = getElementText('template-edit-bank-name', entity.bankDetails?.bankName || '');
      const accountNo = getElementText('template-edit-bank-account-no', entity.bankDetails?.accountNo || '');
      const ifsc = getElementText('template-edit-bank-ifsc', entity.bankDetails?.ifsc || '').toUpperCase();
      const swift = getElementText('template-edit-bank-swift', entity.bankDetails?.swift || '').toUpperCase();
      const micr = getElementText('template-edit-bank-micr', entity.bankDetails?.micr || '');

      const signature = getElementText('template-edit-signature-name', entity.bankDetails?.signature || 'Authorized Signatory');
      const authorityDesignation = getElementText('template-edit-authority-designation', entity.bankDetails?.authorityDesignation || 'Proprietor');
      const signatureEntity = getElementText('template-edit-signature-entity', entity.legalName || entity.name || '');

      const payload = {
        name,
        legalName: signatureEntity || null,
        gstin: gstin || null,
        pan: pan || null,
        address: address || null,
        msmeReg: msmeReg || null,
        status: entity.status,
        bankDetails: {
          ...entity.bankDetails,
          bankName: bankName || null,
          accountNo: accountNo || null,
          ifsc: ifsc || null,
          swift: swift || null,
          micr: micr || null,
          gstLut: gstLut || null,
          accountName: accountName || null,
          signature: signature || null,
          authorityDesignation: authorityDesignation || null,
          terms: entity.bankDetails?.terms || null,
          // styling configurations
          baseStyle,
          activeFont,
          brandColor,
          textColor,
          companyFontSize,
          generalFontSize,
          headerSpacing,
          clientSpacing,
          tableSpacing,
          footerSpacing,
          signatureSpacing,
          clientLeftOffset,
          invoiceRightOffset,
          bankLeftOffset,
          signatureLeftOffset,
          showHeader: showLetterhead,
          showBankDetails,
          headerAlign,
          footerAlign,
          wrapText,
          boldText,
          taxLayout: taxModeOverride === 'local' ? 'cgst_sgst' : taxModeOverride === 'interstate' ? 'igst' : 'auto'
        }
      };

      await API.put(`/accounts/entities/${entity.id}`, payload);
      onSaved();
    } catch (err) {
      console.error('Failed to save entity template settings:', err);
      alert('Failed to save template: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const fontOptions = [
    'Times New Roman',
    'Arial',
    'Georgia',
    'Courier New',
    'Garamond',
    'Verdana',
    'Trebuchet MS',
    'Calibri'
  ];

  const taxDetails = getTaxDetails(sampleInvoice, taxModeOverride);
  const totalTaxAmount = taxDetails.isLocal ? (taxDetails.cgstAmount + taxDetails.sgstAmount) : taxDetails.igstAmount;
  const calculatedTotal = sampleInvoice.subTotal + totalTaxAmount;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-2 overflow-y-auto">
      {/* Dynamic Printing CSS for Template Area */}
      <style>{`
        @media print {
          @page {
            margin: 0;
            size: A4;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
          }
          body * {
            visibility: hidden !important;
          }
          #template-print-invoice-area, #template-print-invoice-area * {
            visibility: visible !important;
            font-family: ${isCustomTypography ? getFontStack(activeFont) : (baseStyle === 'modern' ? "'Inter', sans-serif" : "'Times New Roman', Times, serif")} !important;
          }
          #template-print-invoice-area, #template-print-invoice-area *:not([style*="color"]):not(strong):not(b):not(th) {
            color: ${textColor} !important;
          }
          #template-print-invoice-area {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 1.6cm 1.2cm !important;
            background: white !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }

        #template-print-invoice-area, #template-print-invoice-area * {
          font-family: ${getFontStack(activeFont)} !important;
        }
        #template-print-invoice-area, #template-print-invoice-area *:not(#template-edit-entity-name) {
          font-size: ${generalFontSize}px !important;
        }
        #template-print-invoice-area #template-edit-entity-name {
          font-size: ${companyFontSize}px !important;
        }
        #template-print-invoice-area, #template-print-invoice-area *:not([style*="color"]):not(strong):not(b):not(th) {
          color: ${textColor} !important;
        }
        .tmpl-dynamic-header {
          padding-top: ${headerSpacing}px !important;
        }
        .tmpl-dynamic-client {
          margin-top: ${clientSpacing}px !important;
        }
        .tmpl-dynamic-client-left {
          margin-left: ${clientLeftOffset}px !important;
        }
        .tmpl-dynamic-invoice-right {
          margin-right: ${invoiceRightOffset}px !important;
        }
        .tmpl-dynamic-table {
          margin-top: ${24 + tableSpacing}px !important;
        }
        .tmpl-dynamic-row-height {
          height: 180px !important;
        }
        .tmpl-dynamic-footer {
          margin-top: ${24 + footerSpacing}px !important;
        }
        .tmpl-dynamic-bank-left {
          margin-left: ${bankLeftOffset}px !important;
        }
        .tmpl-dynamic-signature {
          padding-top: ${signatureSpacing}px !important;
        }
        .tmpl-dynamic-signature-left {
          margin-left: ${signatureLeftOffset}px !important;
        }
      `}</style>

      <div className={`w-full max-w-[1350px] h-[92vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden border ${isDark ? 'bg-[#0f172a] border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}`}>
        
        {/* Header Bar */}
        <div className={`flex justify-between items-center px-6 py-4 border-b ${isDark ? 'bg-[#1e293b] border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'}`}>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
              <DocumentTextIcon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-md font-bold flex items-center gap-2">
                Invoice Template Styling Editor — <span className="text-indigo-400 font-extrabold">{entity.name}</span>
              </h2>
              <p className={`text-[10px] uppercase tracking-widest font-extrabold mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Customize dimensions, margins, typography, and default layout template
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-all ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'}`}
            title="Close Editor"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Side-by-Side Panels */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden h-full">
          
          {/* LEFT PANEL: Styling Controls */}
          <div className={`lg:col-span-4 overflow-y-auto custom-scrollbar p-5 flex flex-col justify-between border-r ${isDark ? 'bg-[#111827] border-slate-800/80' : 'bg-slate-50 border-slate-200'}`}>
            <div className="space-y-6">
              
              {/* Layout Base Style */}
              <div className="space-y-2">
                <span className={`text-[10px] font-extrabold tracking-wider uppercase block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Base Design Style</span>
                <div className={`grid grid-cols-2 gap-2 p-1 rounded-xl ${isDark ? 'bg-[#1f2937]' : 'bg-slate-200/60'}`}>
                  <button
                    type="button"
                    onClick={() => handleBaseStyleChange('classic')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${baseStyle === 'classic' ? 'bg-indigo-600 text-white shadow-md' : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-800')}`}
                  >
                    Classic (Serif)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBaseStyleChange('modern')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${baseStyle === 'modern' ? 'bg-indigo-600 text-white shadow-md' : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-800')}`}
                  >
                    Modern (Sans-Serif)
                  </button>
                </div>
              </div>

              {/* Typography Group */}
              <div className={`space-y-3 p-3.5 rounded-2xl border ${isDark ? 'bg-[#1f2937]/50 border-slate-800' : 'bg-white border-slate-200'}`}>
                <span className={`text-[10px] font-extrabold tracking-wider uppercase block ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>Typography &amp; Sizes</span>
                
                {/* Font Picker */}
                <div className="space-y-1">
                  <label htmlFor="font-family-select" className={`text-[9px] uppercase font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Font Family</label>
                  <select
                    id="font-family-select"
                    title="Font Family"
                    value={activeFont}
                    onChange={(e) => {
                      setActiveFont(e.target.value);
                      setIsCustomTypography(true);
                    }}
                    className={`w-full p-2 rounded-lg text-xs outline-none border focus:border-indigo-500 ${isDark ? 'bg-[#111827] border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800'}`}
                  >
                    {fontOptions.map(font => (
                      <option key={font} value={font}>{font}</option>
                    ))}
                  </select>
                </div>

                {/* Font Sizes */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className={`flex justify-between text-[9px] font-bold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      <span>Company Size</span>
                      <span className={isDark ? 'text-indigo-400' : 'text-indigo-600'}>{companyFontSize}px</span>
                    </div>
                    <input
                      type="range"
                      min="16"
                      max="40"
                      step="0.5"
                      title="Company Font Size"
                      value={companyFontSize}
                      onChange={(e) => setCompanyFontSize(parseFloat(e.target.value))}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className={`flex justify-between text-[9px] font-bold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      <span>General Size</span>
                      <span className={isDark ? 'text-indigo-400' : 'text-indigo-600'}>{generalFontSize}px</span>
                    </div>
                    <input
                      type="range"
                      min="8"
                      max="18"
                      step="0.1"
                      title="General Font Size"
                      value={generalFontSize}
                      onChange={(e) => setGeneralFontSize(parseFloat(e.target.value))}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Colors Group */}
              <div className={`grid grid-cols-2 gap-3 p-3.5 rounded-2xl border ${isDark ? 'bg-[#1f2937]/50 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className="space-y-1">
                  <span className={`text-[10px] font-extrabold tracking-wider uppercase block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Brand Color</span>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="color"
                      title="Brand Color"
                      value={brandColor}
                      onChange={(e) => setBrandColor(e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer bg-transparent border-0 outline-none"
                    />
                    <span className={`text-[10px] font-mono ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{brandColor}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <span className={`text-[10px] font-extrabold tracking-wider uppercase block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Text Color</span>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="color"
                      title="Text Color"
                      value={textColor}
                      onChange={(e) => setTextColor(e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer bg-transparent border-0 outline-none"
                    />
                    <span className={`text-[10px] font-mono ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{textColor}</span>
                  </div>
                </div>
              </div>

              {/* Spacing Offsets Sliders */}
              <div className={`space-y-3.5 p-3.5 rounded-2xl border ${isDark ? 'bg-[#1f2937]/50 border-slate-800' : 'bg-white border-slate-200'}`}>
                <span className={`text-[10px] font-extrabold tracking-wider uppercase block ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>Vertical Spacings (Margins)</span>
                
                {/* Header spacing */}
                <div className="space-y-1">
                  <div className={`flex justify-between text-[9px] font-bold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    <span>Header Top Space</span>
                    <span className={isDark ? 'text-indigo-400' : 'text-indigo-600'}>{headerSpacing}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="150"
                    title="Header Top Space"
                    value={headerSpacing}
                    onChange={(e) => setHeaderSpacing(parseInt(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>

                {/* Client spacing */}
                <div className="space-y-1">
                  <div className={`flex justify-between text-[9px] font-bold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    <span>Client Top space</span>
                    <span className={isDark ? 'text-indigo-400' : 'text-indigo-600'}>{clientSpacing}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    title="Client Top Space"
                    value={clientSpacing}
                    onChange={(e) => setClientSpacing(parseInt(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>

                {/* Table spacing */}
                <div className="space-y-1">
                  <div className={`flex justify-between text-[9px] font-bold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    <span>Table Top space</span>
                    <span className={isDark ? 'text-indigo-400' : 'text-indigo-600'}>{tableSpacing}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    title="Table Top Space"
                    value={tableSpacing}
                    onChange={(e) => setTableSpacing(parseInt(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>

                {/* Footer spacing */}
                <div className="space-y-1">
                  <div className={`flex justify-between text-[9px] font-bold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    <span>Footer Top space</span>
                    <span className={isDark ? 'text-indigo-400' : 'text-indigo-600'}>{footerSpacing}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="150"
                    title="Footer Top Space"
                    value={footerSpacing}
                    onChange={(e) => setFooterSpacing(parseInt(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>

                {/* Signature spacing */}
                <div className="space-y-1">
                  <div className={`flex justify-between text-[9px] font-bold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    <span>Signature Top Space</span>
                    <span className={isDark ? 'text-indigo-400' : 'text-indigo-600'}>{signatureSpacing}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="150"
                    title="Signature Top Space"
                    value={signatureSpacing}
                    onChange={(e) => setSignatureSpacing(parseInt(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Offset Adjustments */}
              <div className={`space-y-3.5 p-3.5 rounded-2xl border ${isDark ? 'bg-[#1f2937]/50 border-slate-800' : 'bg-white border-slate-200'}`}>
                <span className={`text-[10px] font-extrabold tracking-wider uppercase block ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>Horizontal Offsets (Indentation)</span>

                {/* Client Left Offset */}
                <div className="space-y-1">
                  <div className={`flex justify-between text-[9px] font-bold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    <span>Client Left Offset</span>
                    <span className={isDark ? 'text-indigo-400' : 'text-indigo-600'}>{clientLeftOffset}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    title="Client Left Offset"
                    value={clientLeftOffset}
                    onChange={(e) => setClientLeftOffset(parseInt(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>

                {/* Invoice Details Right Offset */}
                <div className="space-y-1">
                  <div className={`flex justify-between text-[9px] font-bold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    <span>Invoice Details Right Offset</span>
                    <span className={isDark ? 'text-indigo-400' : 'text-indigo-600'}>{invoiceRightOffset}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    title="Invoice Details Right Offset"
                    value={invoiceRightOffset}
                    onChange={(e) => setInvoiceRightOffset(parseInt(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>

                {/* Bank details Left Offset */}
                <div className="space-y-1">
                  <div className={`flex justify-between text-[9px] font-bold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    <span>Bank details Left Offset</span>
                    <span className={isDark ? 'text-indigo-400' : 'text-indigo-600'}>{bankLeftOffset}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    title="Bank Details Left Offset"
                    value={bankLeftOffset}
                    onChange={(e) => setBankLeftOffset(parseInt(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>

                {/* Signature details Left Offset */}
                <div className="space-y-1">
                  <div className={`flex justify-between text-[9px] font-bold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    <span>Signature details Left Offset</span>
                    <span className={isDark ? 'text-indigo-400' : 'text-indigo-600'}>{signatureLeftOffset}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    title="Signature Details Left Offset"
                    value={signatureLeftOffset}
                    onChange={(e) => setSignatureLeftOffset(parseInt(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Alignments and Layout Toggles */}
              <div className={`space-y-3.5 p-3.5 rounded-2xl border ${isDark ? 'bg-[#1f2937]/50 border-slate-800' : 'bg-white border-slate-200'}`}>
                <span className={`text-[10px] font-extrabold tracking-wider uppercase block ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>Alignments &amp; Visibility</span>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="header-align-select" className={`text-[9px] uppercase font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Header Align</label>
                    <select
                      id="header-align-select"
                      title="Header Alignment"
                      value={headerAlign}
                      onChange={(e) => setHeaderAlign(e.target.value as 'left' | 'center' | 'right')}
                      className={`w-full p-2 rounded-lg text-xs outline-none border focus:border-indigo-500 ${isDark ? 'bg-[#111827] border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800'}`}
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="footer-align-select" className={`text-[9px] uppercase font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Footer Align</label>
                    <select
                      id="footer-align-select"
                      title="Footer Alignment"
                      value={footerAlign}
                      onChange={(e) => setFooterAlign(e.target.value as 'left' | 'center' | 'right')}
                      className={`w-full p-2 rounded-lg text-xs outline-none border focus:border-indigo-500 ${isDark ? 'bg-[#111827] border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800'}`}
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
                  <label className={`flex items-center gap-2 font-medium cursor-pointer ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    <input
                      type="checkbox"
                      checked={showLetterhead}
                      onChange={(e) => setShowLetterhead(e.target.checked)}
                      className={`rounded accent-indigo-500 w-4 h-4 border ${isDark ? 'bg-[#111827] border-slate-800' : 'bg-white border-slate-300'}`}
                    />
                    Show Letterhead
                  </label>
                  <label className={`flex items-center gap-2 font-medium cursor-pointer ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    <input
                      type="checkbox"
                      checked={showBankDetails}
                      onChange={(e) => setShowBankDetails(e.target.checked)}
                      className={`rounded accent-indigo-500 w-4 h-4 border ${isDark ? 'bg-[#111827] border-slate-800' : 'bg-white border-slate-300'}`}
                    />
                    Show Bank Info
                  </label>
                  <label className={`flex items-center gap-2 font-medium cursor-pointer ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    <input
                      type="checkbox"
                      checked={wrapText}
                      onChange={(e) => setWrapText(e.target.checked)}
                      className={`rounded accent-indigo-500 w-4 h-4 border ${isDark ? 'bg-[#111827] border-slate-800' : 'bg-white border-slate-300'}`}
                    />
                    Wrap Text
                  </label>
                  <label className={`flex items-center gap-2 font-medium cursor-pointer ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    <input
                      type="checkbox"
                      checked={boldText}
                      onChange={(e) => setBoldText(e.target.checked)}
                      className={`rounded accent-indigo-500 w-4 h-4 border ${isDark ? 'bg-[#111827] border-slate-800' : 'bg-white border-slate-300'}`}
                    />
                    Bold Text
                  </label>
                </div>

                <div className="space-y-1 pt-2">
                  <label htmlFor="tax-mode-select" className={`text-[9px] uppercase font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Tax Mode (Override)</label>
                  <select
                    id="tax-mode-select"
                    title="Tax Mode Override"
                    value={taxModeOverride}
                    onChange={(e) => setTaxModeOverride(e.target.value as 'auto' | 'local' | 'interstate')}
                    className={`w-full p-2 rounded-lg text-xs outline-none border focus:border-indigo-500 ${isDark ? 'bg-[#111827] border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800'}`}
                  >
                    <option value="auto">Auto (Calculate based on client GSTIN state)</option>
                    <option value="local">Local CGST + SGST</option>
                    <option value="interstate">Interstate IGST Only</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Bottom Actions inside Left Panel */}
            <div className={`flex flex-col gap-2.5 pt-6 border-t mt-6 ${isDark ? 'border-slate-850' : 'border-slate-200'}`}>
              <button
                type="button"
                onClick={handleSaveTemplate}
                disabled={isSaving}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 text-white rounded-xl font-extrabold text-xs shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <CheckIcon className="w-4.5 h-4.5" />
                {isSaving ? 'Saving...' : 'Save Template Details'}
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={resetToDefaults}
                  className={`py-2.5 rounded-xl font-bold text-xs transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 ${isDark ? 'bg-[#1e293b] hover:bg-slate-800 text-slate-300 border border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'}`}
                >
                  <ArrowPathIcon className="w-4 h-4" />
                  Defaults
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
                >
                  <ArrowDownTrayIcon className="w-4 h-4" />
                  Print Test
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: Live A4 Preview */}
          <div className={`lg:col-span-8 overflow-y-auto custom-scrollbar p-6 md:p-8 flex justify-center items-start ${isDark ? 'bg-[#0b0f19]' : 'bg-slate-200/50'}`}>
            
            {/* Scrollable container for centered page */}
            <div className={`invoice-preview-paper-container w-[794px] min-w-[794px] max-w-[794px] bg-white text-black shadow-2xl p-10 md:p-12 min-h-[1050px] relative rounded-sm overflow-hidden select-text border ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <style>{`
                #template-print-invoice-area {
                  color: ${textColor} !important;
                }
                .tmpl-brand-color {
                  color: ${brandColor} !important;
                }
              `}</style>
              <div
                id="template-print-invoice-area"
                className={`w-full h-full bg-white ${baseStyle === 'modern' ? 'font-sans' : 'font-serif'} ${boldText ? 'font-bold' : ''} ${wrapText ? 'break-words whitespace-normal' : ''}`}
              >
                {/* A4 Header Block */}
                {baseStyle === 'modern' ? (
                  <div
                    className={`flex ${
                      headerAlign === 'center'
                        ? 'flex-col items-center text-center'
                        : headerAlign === 'right'
                          ? 'flex-row-reverse justify-between text-right'
                          : 'flex-row justify-between text-left'
                    } border-b border-slate-200 pb-6 z-10 relative tmpl-dynamic-header`}
                  >
                    {showLetterhead ? (
                      <div className="space-y-1">
                        <h3
                          contentEditable
                          suppressContentEditableWarning
                          id="template-edit-entity-name"
                          className="text-2xl font-bold tracking-tight outline-none border-b border-dashed border-slate-300 hover:border-slate-550 focus:border-indigo-500 focus:bg-slate-50 transition-colors tmpl-brand-color"
                        >
                          {entity.name}
                        </h3>
                        <span
                          contentEditable
                          suppressContentEditableWarning
                          id="template-edit-entity-address"
                          className="text-xs text-slate-500 block leading-relaxed max-w-[320px] whitespace-pre-line outline-none border-b border-dashed border-slate-300 hover:border-slate-550 focus:border-indigo-500 focus:bg-slate-50 transition-colors"
                        >
                          {entity.address || 'Ashish Shah & Associates\nA 701, Rameshwer Tower 2, Phase XI, New Golden Nest,\nBhayander East, Thane - 401 105'}
                        </span>
                        <div className="text-[10px] text-slate-400 font-medium">
                          <span>GST: </span>
                          <span
                            contentEditable
                            suppressContentEditableWarning
                            id="template-edit-entity-gstin"
                            className="font-bold text-slate-500 outline-none border-b border-dashed border-slate-300 hover:border-slate-550 focus:border-indigo-500"
                          >
                            {entity.gstin || '27BIEPS8929M1ZC'}
                          </span>
                          <span className="mx-1.5 text-slate-300">|</span>
                          <span>PAN: </span>
                          <span
                            contentEditable
                            suppressContentEditableWarning
                            id="template-edit-entity-pan"
                            className="font-bold text-slate-500 outline-none border-b border-dashed border-slate-300 hover:border-slate-550 focus:border-indigo-500"
                          >
                            {entity.pan || 'BIEPS8929M'}
                          </span>
                          {entity.bankDetails?.gstLut && (
                            <>
                              <span className="mx-1.5 text-slate-300">|</span>
                              <span>LUT: </span>
                              <span
                                contentEditable
                                suppressContentEditableWarning
                                id="template-edit-entity-gstlut"
                                className="font-bold text-slate-500 outline-none border-b border-dashed border-slate-300 hover:border-slate-550 focus:border-indigo-500"
                              >
                                {entity.bankDetails.gstLut}
                              </span>
                            </>
                          )}
                          {entity.msmeReg && (
                            <>
                              <span className="mx-1.5 text-slate-300">|</span>
                              <span>MSME: </span>
                              <span
                                contentEditable
                                suppressContentEditableWarning
                                id="template-edit-entity-msme"
                                className="font-bold text-slate-500 outline-none border-b border-dashed border-slate-300 hover:border-slate-550 focus:border-indigo-500"
                              >
                                {entity.msmeReg}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div></div>
                    )}
                    <div className={headerAlign === 'center' ? 'mt-4 text-center' : 'text-right'}>
                      <span className="text-xl font-bold tracking-wider block uppercase tmpl-brand-color">Tax Invoice</span>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`flex flex-col ${
                      headerAlign === 'right'
                        ? 'text-right items-end'
                        : headerAlign === 'left'
                          ? 'text-left items-start'
                          : 'text-center items-center'
                    } pb-4 z-10 relative tmpl-dynamic-header`}
                  >
                    {showLetterhead ? (
                      <>
                        <div className="mb-1">
                          <h3
                            contentEditable
                            suppressContentEditableWarning
                            id="template-edit-entity-name"
                            className="text-3xl font-serif font-medium tracking-normal underline pb-0.5 outline-none border-b border-dashed border-slate-300 hover:border-slate-550 focus:border-indigo-500 focus:bg-slate-50 transition-colors tmpl-brand-color"
                          >
                            {entity.name}
                          </h3>
                        </div>
                        <span
                          contentEditable
                          suppressContentEditableWarning
                          id="template-edit-entity-address"
                          className="text-xs font-serif block mt-1 leading-relaxed whitespace-pre-line outline-none border-b border-dashed border-slate-300 hover:border-slate-550 focus:border-indigo-500 focus:bg-slate-50 transition-colors"
                        >
                          {entity.address || 'Ashish Shah & Associates\nA 701, Rameshwer Tower 2, Phase XI, New Golden Nest,\nBhayander East, Thane - 401 105'}
                        </span>
                        <div className="text-[10px] font-serif mt-2 leading-relaxed">
                          <span>GST No: </span>
                          <span
                            contentEditable
                            suppressContentEditableWarning
                            id="template-edit-entity-gstin"
                            className="font-bold outline-none border-b border-dashed border-slate-300"
                          >
                            {entity.gstin || '27BIEPS8929M1ZC'}
                          </span>
                          <span>, PAN: </span>
                          <span
                            contentEditable
                            suppressContentEditableWarning
                            id="template-edit-entity-pan"
                            className="font-bold outline-none border-b border-dashed border-slate-300"
                          >
                            {entity.pan || 'BIEPS8929M'}
                          </span>
                          {entity.bankDetails?.gstLut && (
                            <>
                              <span>, LUT No: </span>
                              <span
                                contentEditable
                                suppressContentEditableWarning
                                id="template-edit-entity-gstlut"
                                className="font-bold font-mono outline-none border-b border-dashed border-slate-300"
                              >
                                {entity.bankDetails.gstLut}
                              </span>
                            </>
                          )}
                          {entity.msmeReg && (
                            <>
                              <span>, MSME: </span>
                              <span
                                contentEditable
                                suppressContentEditableWarning
                                id="template-edit-entity-msme"
                                className="font-bold outline-none border-b border-dashed border-slate-300"
                              >
                                {entity.msmeReg}
                              </span>
                            </>
                          )}
                          <span>.</span>
                        </div>
                      </>
                    ) : (
                      <div className="h-[70px]"></div>
                    )}
                    <div className="mt-4">
                      <span className="text-sm font-serif font-bold underline">Tax Invoice</span>
                    </div>
                  </div>
                )}

                {/* Client Section */}
                {baseStyle === 'modern' ? (
                  <div className="grid grid-cols-2 gap-6 py-6 text-xs relative z-10 tmpl-dynamic-client">
                    <div className="space-y-1 tmpl-dynamic-client-left">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Billed To</span>
                      <span className="font-bold text-sm text-slate-800 block">{sampleInvoice.client.name}</span>
                      <span className="text-slate-650 block leading-normal max-w-sm whitespace-pre-line">
                        {sampleInvoice.client.address}
                      </span>
                      <span className="text-slate-800 block font-bold mt-1">
                        GSTIN: <span>{sampleInvoice.client.gstin}</span>
                      </span>
                    </div>

                    <div className="text-right space-y-1.5 self-start tmpl-dynamic-invoice-right font-medium">
                      <div className="flex justify-end gap-4">
                        <span className="text-slate-450 font-bold uppercase text-[9px] tracking-wider">Invoice No</span>
                        <span className="font-bold text-slate-800">{sampleInvoice.invoiceNumber}</span>
                      </div>
                      <div className="flex justify-end gap-4">
                        <span className="text-slate-450 font-bold uppercase text-[9px] tracking-wider">Issue Date</span>
                        <span className="font-bold text-slate-800">{new Date(sampleInvoice.issueDate).toLocaleDateString('en-GB')}</span>
                      </div>
                      <div className="flex justify-end gap-4">
                        <span className="text-slate-450 font-bold uppercase text-[9px] tracking-wider">Due Date</span>
                        <span className="font-bold text-slate-800">{new Date(sampleInvoice.dueDate).toLocaleDateString('en-GB')}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between py-6 font-serif text-xs relative z-10 tmpl-dynamic-client">
                    <div className="space-y-0.5 tmpl-dynamic-client-left">
                      <span className="font-bold block text-black">To</span>
                      <span className="font-bold text-[12px] text-black block">{sampleInvoice.client.name}</span>
                      <span className="text-black block leading-relaxed max-w-sm whitespace-pre-line">
                        {sampleInvoice.client.address}
                      </span>
                      <span className="text-black block font-bold mt-1">
                        GST Number : <span>{sampleInvoice.client.gstin}</span>
                      </span>
                    </div>

                    <div className="text-right font-bold text-black space-y-1 self-start whitespace-nowrap tmpl-dynamic-invoice-right">
                      <div>Invoice No:- <span className="font-bold">{sampleInvoice.invoiceNumber}</span></div>
                      <div>Date :- <span>{new Date(sampleInvoice.issueDate).toLocaleDateString('en-GB')}</span></div>
                    </div>
                  </div>
                )}

                {/* Invoice Line Items Table */}
                {(() => {
                  const tableClass = baseStyle === 'modern'
                    ? "w-full text-left text-xs mt-6 border-b border-slate-200 border-collapse relative z-10 tmpl-dynamic-table"
                    : "w-full text-left font-serif text-xs mt-6 border-2 border-black border-collapse relative z-10 tmpl-dynamic-table";

                  return (
                    <table className={tableClass}>
                      <thead>
                        <tr className={baseStyle === 'modern' ? "" : "border-b-2 border-black text-black font-bold uppercase"}>
                          <th className={baseStyle === 'modern' ? "py-3 px-2 bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider w-[8%] text-center" : "py-2 text-center border-r border-black w-[8%]"}>S.No</th>
                          <th className={baseStyle === 'modern' ? "py-3 px-3 bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider w-[67%] text-left" : "py-2 px-3 border-r border-black w-[67%] text-center"}>Particulars</th>
                          <th className={baseStyle === 'modern' ? "py-3 px-2 bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider w-[12%] text-center" : "py-2 border-r border-black w-[12%] text-center"}>SAC Code</th>
                          <th className={baseStyle === 'modern' ? "py-3 px-3 bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider w-[13%] text-right" : "py-2 pr-3 w-[13%] text-center"}>Amount</th>
                        </tr>
                      </thead>
                      <tbody className="font-semibold text-black">
                        {sampleInvoice.items.map((item, idx) => (
                          <tr
                            key={idx}
                            className={`tmpl-dynamic-row-height ${baseStyle === 'modern' ? 'hover:bg-slate-50/20' : 'font-semibold text-black'}`}
                          >
                            <td className={baseStyle === 'modern' ? "py-3.5 px-2 border-b border-slate-100 text-center text-slate-500 align-top" : "py-3 border-r border-black text-center align-top"}>{idx + 1})</td>
                            <td className={baseStyle === 'modern' ? "py-3.5 px-3 border-b border-slate-100 align-top text-left" : "py-3 px-3 border-r border-black text-left align-top"}>
                              <span className={`block leading-normal ${baseStyle === 'modern' ? 'font-bold text-slate-800' : 'font-bold text-black'}`}>{item.description}</span>
                              {sampleInvoice.udin && sampleInvoice.udin.trim() && (
                                <div className="text-[10px] font-bold text-slate-450 mt-2 font-mono tracking-wide">
                                  UDIN:<span>{sampleInvoice.udin}</span> Dt. {new Date(sampleInvoice.issueDate).toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' })}
                                </div>
                              )}
                            </td>
                            <td className={baseStyle === 'modern' ? "py-3.5 px-2 border-b border-slate-100 text-center text-slate-650 align-top" : "py-3 border-r border-black text-center align-top text-black"}>{item.sacCode}</td>
                            <td className={baseStyle === 'modern' ? "py-3.5 px-3 border-b border-slate-100 text-right align-top font-bold text-slate-900" : "py-3 pr-3 text-right align-top font-bold text-black"}>
                              {formatAmountNumber(item.total)}
                            </td>
                          </tr>
                        ))}

                        {/* Tax Details Rows */}
                        {taxDetails.isLocal ? (
                          <>
                            <tr className={baseStyle === 'modern' ? "text-slate-600" : "font-semibold text-black text-xs"}>
                              <td className={baseStyle === 'modern' ? "py-2 border-b border-slate-100" : "py-2 border-r border-black text-center"}></td>
                              <td className={baseStyle === 'modern' ? "py-2 px-3 border-b border-slate-100 text-left font-medium" : "py-2 px-3 border-r border-black text-left"}>
                                CGST @ <span className="font-bold">{taxDetails.cgstPercent}</span>%
                              </td>
                              <td className={baseStyle === 'modern' ? "py-2 border-b border-slate-100" : "py-2 border-r border-black text-center"}></td>
                              <td className={baseStyle === 'modern' ? "py-2 px-3 border-b border-slate-100 text-right font-bold text-slate-800" : "py-2 pr-3 text-right font-bold text-black"}>{formatAmountNumber(taxDetails.cgstAmount)}</td>
                            </tr>
                            <tr className={baseStyle === 'modern' ? "text-slate-600" : "font-semibold text-black text-xs"}>
                              <td className={baseStyle === 'modern' ? "py-2 border-b border-slate-100" : "py-2 border-r border-black text-center"}></td>
                              <td className={baseStyle === 'modern' ? "py-2 px-3 border-b border-slate-100 text-left font-medium" : "py-2 px-3 border-r border-black text-left"}>
                                SGST @ <span className="font-bold">{taxDetails.sgstPercent}</span>%
                              </td>
                              <td className={baseStyle === 'modern' ? "py-2 border-b border-slate-100" : "py-2 border-r border-black text-center"}></td>
                              <td className={baseStyle === 'modern' ? "py-2 px-3 border-b border-slate-100 text-right font-bold text-slate-800" : "py-2 pr-3 text-right font-bold text-black"}>{formatAmountNumber(taxDetails.sgstAmount)}</td>
                            </tr>
                          </>
                        ) : (
                          <tr className={baseStyle === 'modern' ? "text-slate-600" : "font-semibold text-black text-xs"}>
                            <td className={baseStyle === 'modern' ? "py-2 border-b border-slate-100" : "py-2 border-r border-black text-center"}></td>
                            <td className={baseStyle === 'modern' ? "py-2 px-3 border-b border-slate-100 text-left font-medium" : "py-2 px-3 border-r border-black text-left"}>
                              IGST @ <span className="font-bold">{taxDetails.igstPercent}</span>%
                            </td>
                            <td className={baseStyle === 'modern' ? "py-2 border-b border-slate-100" : "py-2 border-r border-black text-center"}></td>
                            <td className={baseStyle === 'modern' ? "py-2 px-3 border-b border-slate-100 text-right font-bold text-slate-800" : "py-2 pr-3 text-right font-bold text-black"}>{formatAmountNumber(taxDetails.igstAmount)}</td>
                          </tr>
                        )}

                        {/* Amount in words */}
                        <tr className={baseStyle === 'modern' ? "text-slate-500 italic text-[11px]" : "font-bold text-black text-xs"}>
                          <td className={baseStyle === 'modern' ? "py-2 border-b border-slate-100" : "py-2 border-r border-black text-center"}></td>
                          <td className={baseStyle === 'modern' ? "py-2 px-3 border-b border-slate-100 text-left capitalize" : "py-2 px-3 border-r border-black text-left capitalize"}>
                            Rs. {(() => {
                              const w = convertNumberToWords(calculatedTotal);
                              return w.startsWith('Rupees') ? w.replace('Rupees', '').trim() : w;
                            })()}
                          </td>
                          <td className={baseStyle === 'modern' ? "py-2 border-b border-slate-100" : "py-2 border-r border-black text-center"}></td>
                          <td className={baseStyle === 'modern' ? "py-2 px-3 border-b border-slate-100" : "py-2 pr-3 text-right"}></td>
                        </tr>

                        {/* Bordered Total Row */}
                        <tr className={baseStyle === 'modern' ? "font-bold text-slate-900 text-xs bg-slate-50/50" : "border-t-2 border-b-2 border-black font-bold text-black text-xs"}>
                          <td className={baseStyle === 'modern' ? "py-3.5 border-b border-slate-200" : "py-2 border-r border-black text-center"}></td>
                          <td className={baseStyle === 'modern' ? "py-3.5 px-3 border-b border-slate-200 text-left uppercase tracking-wider font-bold" : "py-2 border-r border-black text-center uppercase tracking-wider font-bold"}>
                            Total
                          </td>
                          <td className={baseStyle === 'modern' ? "py-3.5 border-b border-slate-200" : "py-2 border-r border-black text-center"}></td>
                          <td className={baseStyle === 'modern' ? "py-3.5 px-3 border-b border-slate-200 text-right font-extrabold text-slate-900" : "py-2 pr-3 text-right font-bold"}>
                            {formatAmountNumber(calculatedTotal)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  );
                })()}

                {/* Bottom Details (Bank Info & Signatures) */}
                <div className={`grid grid-cols-12 gap-6 mt-6 text-[11px] relative z-10 tmpl-dynamic-footer ${baseStyle === 'modern' ? '' : 'font-serif'}`}>
                  
                  {/* Bank Details section */}
                  <div
                    className={`col-span-7 space-y-1 ${
                      footerAlign === 'center'
                        ? 'text-center'
                        : footerAlign === 'right'
                          ? 'text-right'
                          : 'text-left'
                    }`}
                  >
                    {showBankDetails ? (
                      <div className={`${baseStyle === 'modern' ? 'bg-slate-50/60 p-4 rounded-xl border border-slate-200/50 text-slate-700' : 'text-black'} tmpl-dynamic-bank-left`}>
                        <span className={`font-bold block text-xs mb-1 ${baseStyle === 'modern' ? 'text-slate-900' : ''}`}>Bank Account Details</span>

                        <span className="block">
                          <span
                            contentEditable
                            suppressContentEditableWarning
                            id="template-edit-bank-account-name"
                            className="font-bold outline-none border-b border-dashed border-slate-300"
                          >
                            {entity.bankDetails?.accountName || entity.legalName || entity.name}
                          </span>
                        </span>
                        
                        <span className="block">
                          <span
                            contentEditable
                            suppressContentEditableWarning
                            id="template-edit-bank-name"
                            className="font-bold outline-none border-b border-dashed border-slate-300"
                          >
                            {entity.bankDetails?.bankName || 'HDFC Bank'}
                          </span>
                        </span>

                        <span className="block">
                          <strong>Current Bank a/c: </strong>
                          <span
                            contentEditable
                            suppressContentEditableWarning
                            id="template-edit-bank-account-no"
                            className="font-bold outline-none border-b border-dashed border-slate-300"
                          >
                            {entity.bankDetails?.accountNo || '502000...'}
                          </span>
                        </span>

                        <span className="block">
                          <strong>RTGS / NEFT IFSC Code: </strong>
                          <span
                            contentEditable
                            suppressContentEditableWarning
                            id="template-edit-bank-ifsc"
                            className="font-bold font-mono outline-none border-b border-dashed border-slate-300"
                          >
                            {entity.bankDetails?.ifsc || 'HDFC0000060'}
                          </span>
                        </span>

                        {entity.bankDetails?.swift && (
                          <span className="block">
                            <strong>Swift / BIC Code: </strong>
                            <span
                              contentEditable
                              suppressContentEditableWarning
                              id="template-edit-bank-swift"
                              className="font-bold font-mono outline-none border-b border-dashed border-slate-300"
                            >
                              {entity.bankDetails.swift}
                            </span>
                          </span>
                        )}

                        {entity.bankDetails?.micr && (
                          <span className="block">
                            <strong>MICR Code: </strong>
                            <span
                              contentEditable
                              suppressContentEditableWarning
                              id="template-edit-bank-micr"
                              className="font-bold font-mono outline-none border-b border-dashed border-slate-300"
                            >
                              {entity.bankDetails.micr}
                            </span>
                          </span>
                        )}

                        {entity.pan && (
                          <span className="block">
                            <strong>PAN: </strong>
                            <span
                              contentEditable
                              suppressContentEditableWarning
                              id="template-edit-entity-pan-bottom"
                              className="font-bold font-mono outline-none border-b border-dashed border-slate-300"
                            >
                              {entity.pan}
                            </span>
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="h-[70px]"></div>
                    )}

                    {entity.msmeReg && (
                      <div className={`pt-2 text-[9px] whitespace-nowrap font-normal leading-normal ${baseStyle === 'modern' ? 'text-slate-450' : 'text-black'}`}>
                        *We are registered under MSME and Registration number is "
                        <span className="font-bold">{entity.msmeReg}</span>
                        " W.E.F April 28, 2021.
                      </div>
                    )}

                    {/* Signature Area (Left Aligned, No Space/Line, No Underline) */}
                    <div
                      className={`flex flex-col ${
                        footerAlign === 'center'
                          ? 'items-center text-center'
                          : footerAlign === 'right'
                            ? 'items-end text-right'
                            : 'items-start text-left'
                      } min-h-[120px] max-w-[220px] pt-6 tmpl-dynamic-signature tmpl-dynamic-signature-left`}
                    >
                      <span
                        contentEditable
                        suppressContentEditableWarning
                        id="template-edit-signature-entity"
                        className="text-[12px] font-bold block mb-1 outline-none hover:bg-slate-50 focus:bg-slate-55 focus:ring-1 focus:ring-indigo-500 rounded px-1 min-w-[150px]"
                      >
                        {entity.legalName || entity.name || 'Ashish Shah & Associates'}
                      </span>

                      {/* Signature space - DSC applied physically/manually */}
                      <div className="h-16 w-full my-1"></div>

                      <span
                        contentEditable
                        suppressContentEditableWarning
                        id="template-edit-signature-name"
                        className="text-[12px] font-bold block outline-none hover:bg-slate-50 focus:bg-slate-55 focus:ring-1 focus:ring-indigo-500 rounded px-1 min-w-[150px]"
                      >
                        {entity.bankDetails?.signature || 'Ashish Shah'}
                      </span>
                      <span
                        contentEditable
                        suppressContentEditableWarning
                        id="template-edit-authority-designation"
                        className="text-[10px] font-medium text-slate-500 block outline-none hover:bg-slate-50 focus:bg-slate-55 focus:ring-1 focus:ring-indigo-500 rounded px-1 min-w-[150px]"
                      >
                        {entity.bankDetails?.authorityDesignation || 'Proprietor'}
                      </span>
                    </div>
                  </div>

                  {/* Right column */}
                  <div className="col-span-5 text-right flex flex-col justify-end items-end space-y-1 font-semibold text-black">
                  </div>
                </div>

              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};
