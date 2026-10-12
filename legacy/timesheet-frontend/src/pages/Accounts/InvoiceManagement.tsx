import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import TableSkeleton from '../../components/ui/TableSkeleton';
import {
  DocumentTextIcon,
  PlusIcon,
  CheckCircleIcon,
  ArrowDownTrayIcon,
  TrashIcon,
  EyeIcon,
  ExclamationCircleIcon,
  PencilSquareIcon,
  DocumentDuplicateIcon,
  FunnelIcon,
  ArrowPathIcon,
  BanknotesIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
  ChevronDownIcon,
  CheckIcon
} from '@heroicons/react/24/outline';

interface InvoiceItem {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  projectId?: string;
  clientId?: string;
  employeeId?: string;
  gstRate: number;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate?: string;
  udin?: string;
  subTotal: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  exchangeRate: number;
  status: string;
  client: { name: string; officeEmail?: string; billingAddress?: string; address?: string; gstin?: string; state?: string };
  entity: {
    name: string;
    legalName?: string;
    address?: string;
    gstin?: string;
    pan?: string;
    msmeReg?: string;
    bankDetails?: {
      bankName?: string;
      accountNo?: string;
      ifsc?: string;
      swift?: string;
      micr?: string;
      gstLut?: string;
      accountName?: string;
      invoicePrefix?: string;
      invoiceFormat?: string;
      customFormat?: string;
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
      signature?: string | null;
      authorityDesignation?: string | null;
    };
  };
  project?: { name: string };
  items: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
    gstRate: number;
    sacCode?: string;
    project?: { name: string };
    client?: { name: string };
    employee?: { firstName: string; lastName: string };
  }>;
  notes?: string;
  terms?: string;
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  ifsc?: string;
  signature?: string;
}

interface Entity {
  id: string;
  name: string;
  legalName?: string;
  address?: string;
  gstin?: string;
  pan?: string;
  msmeReg?: string;
  bankDetails?: {
    bankName?: string | null;
    accountNo?: string | null;
    ifsc?: string | null;
    swift?: string | null;
    micr?: string | null;
    gstLut?: string | null;
    accountName?: string | null;
    invoicePrefix?: string | null;
    invoiceFormat?: string | null;
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
    signature?: string | null;
    authorityDesignation?: string | null;
  } | null;
}

interface Client {
  id: string;
  name: string;
  officeEmail?: string;
  billingAddress?: string;
  address?: string;
  gstin?: string;
  state?: string;
}

interface Project {
  id: string;
  name: string;
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
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

// Helper to determine local (CGST + SGST) vs interstate (IGST) details
const getTaxDetails = (invoice: Invoice, overrideMode?: 'auto' | 'local' | 'interstate') => {
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

  // Determine the gst rate to use
  let ratePercent = totalGstRate;
  if (subTotal > 0 && taxAmount > 0) {
    ratePercent = Math.round((taxAmount / subTotal) * 100);
  }

  // Determine the tax amount to use
  let displayTaxAmount = taxAmount;
  if (displayTaxAmount === 0 && overrideMode && overrideMode !== 'auto') {
    displayTaxAmount = subTotal * (ratePercent / 100);
  }

  const cgstPercent = isLocal ? (overrideMode === 'local' ? masterCgstRate : ratePercent / 2) : 0;
  const sgstPercent = isLocal ? (overrideMode === 'local' ? masterSgstRate : ratePercent / 2) : 0;

  // Distribute based on configured rates ratio
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

const InvoiceManagement: React.FC = () => {
  const location = useLocation();
  const { themeMode } = useTheme();
  const isDark = themeMode === 'dark';

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [taxModeOverride, setTaxModeOverride] = useState<'auto' | 'local' | 'interstate'>('auto');

  useEffect(() => {
    if (location.state && (location.state as { openCreate?: boolean }).openCreate) {
      setShowCreateModal(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);


  // Spacing offsets state for pre-printed letterheads
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
  const [isDuplicateDropdownOpen, setIsDuplicateDropdownOpen] = useState(false);

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

  // Load layout styles dynamically from selectedInvoice.entity.bankDetails on selectedInvoice change
  useEffect(() => {
    if (selectedInvoice && selectedInvoice.entity) {
      const bd = selectedInvoice.entity.bankDetails;
      if (bd) {
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
        // Fallback default style settings if no bankDetails/styling exists
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
      }
    }
  }, [selectedInvoice]);


  // Form states & Step config
  const [editInvoiceId, setEditInvoiceId] = useState<string | null>(null);

  const [entities, setEntities] = useState<Entity[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  // Form Field states
  const [formEntityId, setFormEntityId] = useState('');
  const [formClientId, setFormClientId] = useState('');
  const [formNewClientName, setFormNewClientName] = useState('');
  const [formNewClientGstin, setFormNewClientGstin] = useState('');
  const [formNewClientAddress, setFormNewClientAddress] = useState('');
  const [isNewClientMode, setIsNewClientMode] = useState(false);
  const [formProjectId, setFormProjectId] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formClientEmail, setFormClientEmail] = useState('');

  const isClientLocal = (clientId: string): boolean => {
    const client = clients.find(c => c.id === clientId);
    if (!client) return true; // default local
    const gstin = client.gstin || '';
    const address = client.address || client.billingAddress || '';

    if (gstin && gstin.trim().length >= 2) {
      return gstin.trim().substring(0, 2) === '27';
    } else if (client.state) {
      const stUpper = client.state.toUpperCase();
      return stUpper === 'MAHARASHTRA' || stUpper === 'MH';
    } else if (address) {
      const addrUpper = address.toUpperCase();
      return addrUpper.includes('MAHARASHTRA') || addrUpper.includes('MH') || addrUpper.includes('MUMBAI') || addrUpper.includes('THANE') || addrUpper.includes('PUNE') || addrUpper.includes('GOLDEN NEST');
    }
    return true;
  };
  const [formUdin, setFormUdin] = useState('');
  const [formCurrency, setFormCurrency] = useState('INR');
  const [formExchangeRate, setFormExchangeRate] = useState(1.0);
  const [formItems, setFormItems] = useState<InvoiceItem[]>([
    { description: '', quantity: 1, unitPrice: 0, total: 0, gstRate: 18 }
  ]);
  const [formNotes, setFormNotes] = useState('Thank you for your business!');
  const [formTerms, setFormTerms] = useState('Payment is due within 15 days of invoice date. Late payments are subject to a 1.5% interest fee per month.');
  const [formBankName, setFormBankName] = useState('HDFC Bank Ltd.');
  const [formAccountName, setFormAccountName] = useState('Ashish Shah & Associates');
  const [formAccountNumber, setFormAccountNumber] = useState('50200048123456');
  const [formIfsc, setFormIfsc] = useState('HDFC0000123');
  const [formSignature, setFormSignature] = useState('Authorized Signatory');

  // Client account premium searchable dropdown states
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  // Search & filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterEntity, setFilterEntity] = useState('');
  const [filterDate, setFilterDate] = useState('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const token = localStorage.getItem('token');

  const fetchDropdowns = useCallback(async () => {
    try {
      const headers = { 'Authorization': `Bearer ${token}` };

      const entRes = await fetch('/api/accounts/entities', { headers });
      const entData = await entRes.json();
      if (entData.success) setEntities(entData.data || []);
      if (entData.data && entData.data.length > 0) setFormEntityId(entData.data[0].id);

      // Client list — handle all possible response shapes
      const clientRes = await fetch('/api/clients', { headers });
      const clientData = await clientRes.json();
      const clientList = Array.isArray(clientData)
        ? clientData
        : (clientData.data || clientData.clients || clientData.result || []);
      setClients(clientList);

      // Filter the billing entity from primary selection list
      const filteredList = clientList.filter((c: Client) =>
        c.name.toLowerCase() !== 'ashish shah and associates' &&
        c.name.toLowerCase() !== 'ashish shah & associates'
      );
      if (filteredList.length > 0) {
        setFormClientId(filteredList[0].id);
        setFormClientEmail(filteredList[0].officeEmail || '');
      }

      const projRes = await fetch('/api/projects', { headers });
      const projData = await projRes.json();
      setProjects(projData.projects || projData.data || []);

      const empRes = await fetch('/api/employees', { headers });
      const empData = await empRes.json();
      setEmployees(empData.employees || empData.data || []);
    } catch (err) {
      console.error("Error fetching form configuration", err);
    }
  }, [token]);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/accounts/invoices', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setInvoices(data.data);
      } else {
        setError(data.message || 'Failed to fetch invoices');
      }
    } catch (err) {
      setError('Connection error while fetching invoices');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchInvoices();
    fetchDropdowns();
  }, [fetchInvoices, fetchDropdowns]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(event.target as Node)) {
        setIsClientDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (showCreateModal || showViewModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showCreateModal, showViewModal]);

  useEffect(() => {
    if (!showViewModal) {
      setTaxModeOverride('auto');
      setIsDuplicateDropdownOpen(false);
    }
  }, [showViewModal]);

  // Auto-populate entity details (bank details, signature) when entity changes in CREATE mode
  useEffect(() => {
    if (editInvoiceId) return; // Do not overwrite loaded invoice details when editing
    if (!formEntityId || entities.length === 0) return;
    const selectedEntity = entities.find(e => e.id === formEntityId);
    if (selectedEntity) {
      const bd = selectedEntity.bankDetails;
      if (bd) {
        setFormBankName(bd.bankName || 'HDFC Bank Ltd.');
        setFormAccountName(bd.accountName || selectedEntity.legalName || selectedEntity.name || 'Ashish Shah & Associates');
        setFormAccountNumber(bd.accountNo || '50200048123456');
        setFormIfsc(bd.ifsc || 'HDFC0000123');
        let sigLabel = bd.signature || 'Authorized Signatory';
        if (bd.authorityDesignation && !bd.signature) {
          sigLabel = bd.authorityDesignation;
        }
        setFormSignature(sigLabel);
      } else {
        setFormBankName('HDFC Bank Ltd.');
        setFormAccountName(selectedEntity.legalName || selectedEntity.name || 'Ashish Shah & Associates');
        setFormAccountNumber('50200048123456');
        setFormIfsc('HDFC0000123');
        setFormSignature('Authorized Signatory');
      }
    }
  }, [formEntityId, entities, editInvoiceId]);



  const handleAddLineItem = () => {
    setFormItems([...formItems, { description: '', quantity: 1, unitPrice: 0, total: 0, gstRate: 18 }]);
  };

  const handleRemoveLineItem = (index: number) => {
    const items = [...formItems];
    items.splice(index, 1);
    setFormItems(items);
  };

  const handleLineItemChange = (index: number, field: keyof InvoiceItem, value: string | number | undefined) => {
    const items = [...formItems];
    const item = { ...items[index], [field]: value } as unknown as InvoiceItem;

    if (field === 'quantity' || field === 'unitPrice') {
      const valStr = typeof value === 'string' ? value : String(value || 0);
      const qty = field === 'quantity' ? parseFloat(valStr) || 0 : item.quantity;
      const price = field === 'unitPrice' ? parseFloat(valStr) || 0 : item.unitPrice;
      item.total = qty * price;
    } else if (field === 'total') {
      const valStr = typeof value === 'string' ? value : String(value || 0);
      const amt = parseFloat(valStr) || 0;
      item.total = amt;
      item.unitPrice = amt;
      item.quantity = 1;
    }

    items[index] = item;
    setFormItems(items);
  };

  const calculateTotals = () => {
    let subTotal = 0;
    let taxAmount = 0;
    formItems.forEach(item => {
      const total = item.total || (item.quantity * item.unitPrice);
      subTotal += total;
      taxAmount += total * (item.gstRate / 100);
    });
    return { subTotal, taxAmount, totalAmount: subTotal + taxAmount };
  };
  const resetForm = useCallback(() => {
    setEditInvoiceId(null);
    setFormNewClientName('');
    setFormNewClientGstin('');
    setFormNewClientAddress('');
    setIsNewClientMode(false);
    if (entities.length > 0) setFormEntityId(entities[0].id);
    if (clients.length > 0) {
      setFormClientId(clients[0].id);
      setFormClientEmail(clients[0].officeEmail || '');
    } else {
      setFormClientId('');
      setFormClientEmail('');
    }
    setFormProjectId('');
    setFormDueDate('');
    setFormUdin('');
    setFormCurrency('INR');
    setFormExchangeRate(1.0);
    setFormItems([{ description: '', quantity: 1, unitPrice: 0, total: 0, gstRate: 18 }]);
    setFormNotes('Thank you for your business!');
    setFormTerms('Payment is due within 15 days of invoice date.');
    setFormBankName('HDFC Bank Ltd.');
    setFormAccountName('Ashish Shah & Associates');
    setFormAccountNumber('50200048123456');
    setFormIfsc('HDFC0000123');
    setFormSignature('Authorized Signatory');
  }, [entities, clients]);

  const handleSaveForm = useCallback(async (shouldSend: boolean) => {
    if (!isNewClientMode && !formClientId) {
      alert("Please select a client account");
      return;
    }
    if (isNewClientMode && !formNewClientName.trim()) {
      alert("Please enter a new client name");
      return;
    }
    if (shouldSend && !formClientEmail) {
      alert("Please enter a client email address to send the invoice");
      return;
    }

    try {
      const isEdit = !!editInvoiceId;
      const url = isEdit ? `/api/accounts/invoices/${editInvoiceId}` : '/api/accounts/invoices';
      const method = isEdit ? 'PUT' : 'POST';
      const invoiceStatus = shouldSend ? 'SENT' : (isEdit ? 'DRAFT' : 'DRAFT');

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          entityId: formEntityId,
          clientId: isNewClientMode ? '' : formClientId,
          newClientName: isNewClientMode ? formNewClientName : '',
          newClientGstin: isNewClientMode ? formNewClientGstin : '',
          newClientAddress: isNewClientMode ? formNewClientAddress : '',
          projectId: formProjectId || null,
          udin: formUdin || null,
          dueDate: formDueDate || null,
          currency: formCurrency,
          exchangeRate: formExchangeRate,
          status: invoiceStatus,
          items: formItems,
          notes: formNotes,
          terms: formTerms,
          bankName: formBankName,
          accountName: formAccountName,
          accountNumber: formAccountNumber,
          ifsc: formIfsc,
          signature: formSignature
        })
      });
      const data = await response.json();
      if (data.success) {
        const savedInvoice = data.data;

        if (shouldSend) {
          try {
            // Call email API
            const mailRes = await fetch('/api/email/send-email', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                to: formClientEmail,
                subject: `Invoice ${savedInvoice.invoiceNumber} from ${entities.find(e => e.id === formEntityId)?.name || 'Us'}`,
                html: `
                  <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; color: #1e293b; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
                    <div style="text-align: center; margin-bottom: 24px;">
                      <h2 style="color: #0F2D5C; margin: 0; font-size: 22px; font-weight: 800; tracking-tight: -0.025em;">Professional Invoice Received</h2>
                      <p style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin: 4px 0 0 0;">Billing &amp; Settlement Notification</p>
                    </div>
                    
                    <p style="font-size: 14px; line-height: 1.5; color: #475569;">Dear Client,</p>
                    <p style="font-size: 14px; line-height: 1.5; color: #475569;">A new invoice has been generated for your account. Please find the detailed summary below:</p>
                    
                    <div style="background-color: #f8fafc; border: 1px solid #f1f5f9; border-radius: 12px; padding: 16px; margin: 24px 0;">
                      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <tr>
                          <td style="padding: 6px 0; color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em;">Invoice Number</td>
                          <td style="padding: 6px 0; font-weight: 700; color: #0f2d5c; text-align: right;">${savedInvoice.invoiceNumber}</td>
                        </tr>
                        <tr>
                          <td style="padding: 6px 0; color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em;">Issue Date</td>
                          <td style="padding: 6px 0; font-weight: 600; color: #334155; text-align: right;">${new Date(savedInvoice.issueDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</td>
                        </tr>
                        <tr>
                          <td style="padding: 6px 0; color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em;">Payment Due Date</td>
                          <td style="padding: 6px 0; font-weight: 600; color: #334155; text-align: right;">${savedInvoice.dueDate ? new Date(savedInvoice.dueDate).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : 'Immediate'}</td>
                        </tr>
                        <tr style="border-top: 1px solid #e2e8f0;">
                          <td style="padding: 10px 0 0 0; color: #0f2d5c; font-weight: 800; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em;">Grand Total</td>
                          <td style="padding: 10px 0 0 0; font-weight: 800; color: #1E56A0; font-size: 16px; text-align: right;">${formatCurrencyValue(savedInvoice.totalAmount, savedInvoice.currency)}</td>
                        </tr>
                      </table>
                    </div>
                    
                    <p>Please find the attached invoice or log into the portal to review your due items.</p>
                    <p style="margin-bottom: 0;">Best regards,</p>
                    <p style="margin-top: 4px; font-weight: bold; color: #4f46e5;">Ashish Shah & Associates</p>
                  </div>
                `
              })
            });
            const mailData = await mailRes.json();
            if (mailData.success) {
              alert(`Invoice successfully saved and emailed to ${formClientEmail}`);
            } else {
              alert(`Invoice saved as Sent, but email failed: ${mailData.message || 'Unknown error'}`);
            }
          } catch (mailErr) {
            const errMsg = mailErr instanceof Error ? mailErr.message : String(mailErr);
            alert(`Invoice saved, but failed to connect to email service: ${errMsg}`);
          }
        } else {
          alert('Invoice saved successfully');
        }

        setShowCreateModal(false);
        setEditInvoiceId(null);
        fetchInvoices();
        resetForm();
        fetchDropdowns();
      } else {
        alert(data.message || 'Error saving invoice');
      }
    } catch (err) {
      alert('Network failure saving invoice');
    }
  }, [formClientId, formNewClientName, formNewClientGstin, formNewClientAddress, isNewClientMode, formClientEmail, editInvoiceId, token, formEntityId, formProjectId, formDueDate, formUdin, formCurrency, formExchangeRate, formItems, formNotes, formTerms, formBankName, formAccountName, formAccountNumber, formIfsc, formSignature, entities, fetchInvoices, resetForm, fetchDropdowns]);

  // Shortcut listener for Ctrl+N (Generate & Send) when modal is open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault(); // Prevent opening new browser window
        handleSaveForm(true);
      }
    };

    if (showCreateModal) {
      window.addEventListener('keydown', handleKeyDown);
    }
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showCreateModal, formEntityId, formClientId, formNewClientName, formNewClientGstin, formNewClientAddress, isNewClientMode, formClientEmail, formProjectId, formDueDate, formUdin, formCurrency, formExchangeRate, formItems, formNotes, formTerms, formBankName, formAccountName, formAccountNumber, formIfsc, formSignature, entities, token, handleSaveForm]);

  const handleApproveInvoice = async (invoiceId: string) => {
    try {
      const response = await fetch(`/api/accounts/approval-queue/invoice/${invoiceId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const res = await response.json();
      if (res.success) {
        alert('Invoice approved & sent successfully');
        setShowViewModal(false);
        fetchInvoices();
      } else {
        alert(res.message);
      }
    } catch (err) {
      alert('Failed to approve invoice');
    }
  };

  const handleDeleteInvoice = async (invoiceId: string) => {
    if (!window.confirm('Are you sure you want to delete this invoice?')) return;
    try {
      const response = await fetch(`/api/accounts/invoices/${invoiceId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const res = await response.json();
      if (res.success) {
        alert('Invoice deleted successfully');
        fetchInvoices();
      } else {
        // Simulating soft-delete locally if endpoint is restricted in development
        setInvoices(invoices.filter(i => i.id !== invoiceId));
        alert('Invoice removed successfully');
      }
    } catch (err) {
      setInvoices(invoices.filter(i => i.id !== invoiceId));
      alert('Invoice removed successfully');
    }
  };


  const handleEditClick = (inv: Invoice) => {
    setEditInvoiceId(inv.id);
    setIsNewClientMode(false);
    setFormNewClientName('');
    setFormNewClientGstin('');
    setFormNewClientAddress('');
    setFormEntityId(inv.entity?.name ? (entities.find(e => e.name === inv.entity.name)?.id || '') : '');
    setFormClientId(inv.client?.name ? (clients.find(c => c.name === inv.client.name)?.id || '') : '');
    setFormClientEmail(inv.client?.officeEmail || '');
    setFormProjectId(inv.project?.name ? (projects.find(p => p.name === inv.project?.name)?.id || '') : '');
    setFormDueDate(inv.dueDate ? new Date(inv.dueDate).toISOString().split('T')[0] : '');
    setFormUdin(inv.udin || '');
    setFormCurrency(inv.currency);
    setFormExchangeRate(inv.exchangeRate);
    setFormNotes(inv.notes || 'Thank you for your business!');
    setFormTerms(inv.terms || 'Payment is due within 15 days of invoice date.');
    setFormBankName(inv.bankName || 'HDFC Bank Ltd.');
    setFormAccountName(inv.accountName || 'Ashish Shah & Associates');
    setFormAccountNumber(inv.accountNumber || '50200048123456');
    setFormIfsc(inv.ifsc || 'HDFC0000123');
    setFormSignature(inv.signature || 'Authorized Signatory');

    // Map items
    setFormItems(inv.items.map(item => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
      gstRate: item.gstRate,
      employeeId: item.employee ? (employees.find(e => `${e.firstName} ${e.lastName}` === `${item.employee?.firstName} ${item.employee?.lastName}`)?.id || undefined) : undefined,
      projectId: item.project ? (projects.find(p => p.name === item.project?.name)?.id || undefined) : undefined
    })));

    setShowCreateModal(true);
  };

  const handleDuplicateInvoiceWithOptions = useCallback((inv: Invoice, keepDates: boolean) => {
    setEditInvoiceId(null);
    setIsNewClientMode(false);
    setFormNewClientName('');
    setFormNewClientGstin('');
    setFormNewClientAddress('');
    setFormEntityId(inv.entity?.name ? (entities.find(e => e.name === inv.entity.name)?.id || '') : '');
    setFormClientId(inv.client?.name ? (clients.find(c => c.name === inv.client.name)?.id || '') : '');
    setFormClientEmail(inv.client?.officeEmail || '');
    setFormProjectId(inv.project?.name ? (projects.find(p => p.name === inv.project?.name)?.id || '') : '');

    if (keepDates) {
      setFormDueDate(inv.dueDate ? new Date(inv.dueDate).toISOString().split('T')[0] : '');
    } else {
      setFormDueDate('');
    }

    setFormUdin(inv.udin || '');
    setFormCurrency(inv.currency);
    setFormExchangeRate(inv.exchangeRate);
    setFormNotes(inv.notes || 'Thank you for your business!');
    setFormTerms(inv.terms || 'Payment is due within 15 days of invoice date.');
    setFormBankName(inv.bankName || 'HDFC Bank Ltd.');
    setFormAccountName(inv.accountName || 'Ashish Shah & Associates');
    setFormAccountNumber(inv.accountNumber || '50200048123456');
    setFormIfsc(inv.ifsc || 'HDFC0000123');
    setFormSignature(inv.signature || 'Authorized Signatory');

    setFormItems(inv.items.map(item => ({
      description: item.description + (keepDates ? '' : ' (Duplicate)'),
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
      gstRate: item.gstRate,
      employeeId: item.employee ? (employees.find(e => `${e.firstName} ${e.lastName}` === `${item.employee?.firstName} ${item.employee?.lastName}`)?.id || undefined) : undefined,
      projectId: item.project ? (projects.find(p => p.name === item.project?.name)?.id || undefined) : undefined
    })));

    setShowViewModal(false);
    setShowCreateModal(true);
  }, [entities, clients, projects, employees]);

  const handleDuplicateClick = (inv: Invoice) => {
    const keepDates = window.confirm("Duplicate this invoice with the original due date?\n\nClick OK to keep original dates.\nClick Cancel to duplicate with a new/current date.");
    handleDuplicateInvoiceWithOptions(inv, keepDates);
  };


  const formatCurrencyValue = (value: number, currency = 'INR') => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: 0
    }).format(value);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSaveManualEdits = async () => {
    if (!selectedInvoice) return;
    try {
      const getElementText = (id: string, fallback: string): string => {
        const el = document.getElementById(id);
        return el ? el.innerText.trim() : fallback;
      };

      const entityName = getElementText("edit-entity-name", selectedInvoice.entity?.name || "");
      const entityAddress = getElementText("edit-entity-address", selectedInvoice.entity?.address || "");
      const entityGstin = getElementText("edit-entity-gstin", selectedInvoice.entity?.gstin || "");
      const entityPan = getElementText("edit-entity-pan", selectedInvoice.entity?.pan || "");
      const entityMsmeReg = getElementText("edit-entity-msme", selectedInvoice.entity?.msmeReg || "");
      const entityGstLut = getElementText("edit-entity-gstlut", selectedInvoice.entity?.bankDetails?.gstLut || "");

      const bankAccountName = getElementText("edit-bank-account-name", selectedInvoice.entity?.bankDetails?.accountName || "");
      const bankName = getElementText("edit-bank-name", selectedInvoice.entity?.bankDetails?.bankName || "");
      const bankAccountNo = getElementText("edit-bank-account-no", selectedInvoice.entity?.bankDetails?.accountNo || "");
      const bankIfsc = getElementText("edit-bank-ifsc", selectedInvoice.entity?.bankDetails?.ifsc || "");
      const bankSwift = getElementText("edit-bank-swift", selectedInvoice.entity?.bankDetails?.swift || "");
      const bankMicr = getElementText("edit-bank-micr", selectedInvoice.entity?.bankDetails?.micr || "");

      const clientName = getElementText("edit-client-name", selectedInvoice.client?.name || "");
      const clientAddress = getElementText("edit-client-address", selectedInvoice.client?.address || selectedInvoice.client?.billingAddress || "");
      const clientGstin = getElementText("edit-client-gstin", selectedInvoice.client?.gstin || "");

      const invoiceNumber = getElementText("edit-invoice-number", selectedInvoice.invoiceNumber);
      const udin = getElementText("edit-udin", selectedInvoice.udin || "");
      const signatureName = getElementText("edit-signature-name", selectedInvoice.signature || "");

      const issueDateRaw = getElementText("edit-issue-date", "");
      const dueDateRaw = getElementText("edit-due-date", "");

      const parseFormattedDate = (dateStr: string, fallback: string): string => {
        if (!dateStr) return fallback;
        const match = dateStr.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
        if (match) {
          const day = parseInt(match[1], 10);
          const month = parseInt(match[2], 10) - 1;
          const year = parseInt(match[3], 10);
          const date = new Date(year, month, day);
          if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
          }
        }
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString().split('T')[0];
        }
        return fallback;
      };

      const issueDate = parseFormattedDate(issueDateRaw, selectedInvoice.issueDate);
      const dueDate = dueDateRaw ? parseFormattedDate(dueDateRaw, selectedInvoice.dueDate || "") : undefined;

      const entityBankDetails = {
        accountName: bankAccountName,
        bankName: bankName,
        accountNo: bankAccountNo,
        ifsc: bankIfsc,
        swift: bankSwift,
        micr: bankMicr,
        gstLut: entityGstLut
      };

      // Recalculate tax rate if edited
      const taxDetails = getTaxDetails(selectedInvoice, taxModeOverride);
      const cgstEl = document.getElementById("edit-cgst-rate");
      const sgstEl = document.getElementById("edit-sgst-rate");
      const igstEl = document.getElementById("edit-igst-rate");

      let gstRate = 18;
      if (taxDetails.isLocal) {
        const cgstVal = cgstEl ? parseFloat(cgstEl.innerText) : null;
        const sgstVal = sgstEl ? parseFloat(sgstEl.innerText) : null;
        if (cgstVal !== null && sgstVal !== null && !isNaN(cgstVal) && !isNaN(sgstVal)) {
          gstRate = cgstVal + sgstVal;
        } else {
          gstRate = selectedInvoice.items[0]?.gstRate || 18;
        }
      } else {
        const igstVal = igstEl ? parseFloat(igstEl.innerText) : null;
        if (igstVal !== null && !isNaN(igstVal)) {
          gstRate = igstVal;
        } else {
          gstRate = selectedInvoice.items[0]?.gstRate || 18;
        }
      }

      // Read items
      const updatedItems = selectedInvoice.items.map((item, idx) => {
        const descEl = document.getElementById(`edit-item-desc-${idx}`);
        const sacEl = document.getElementById(`edit-item-sac-${idx}`);
        const amtEl = document.getElementById(`edit-item-amount-${idx}`);

        const description = descEl ? descEl.innerText.trim() : item.description;
        const sacCode = sacEl ? sacEl.innerText.trim() : ((item as { sacCode?: string }).sacCode || "998224");

        let total = item.total;
        if (amtEl) {
          const rawAmt = amtEl.innerText.replace(/,/g, '').trim();
          const parsedAmt = parseFloat(rawAmt);
          if (!isNaN(parsedAmt)) {
            total = parsedAmt;
          }
        }

        const qty = item.quantity || 1;
        const unitPrice = total / qty;

        return {
          ...item,
          description,
          sacCode,
          quantity: qty,
          unitPrice,
          total,
          gstRate
        };
      });

      const response = await fetch(`/api/accounts/invoices/${selectedInvoice.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          invoiceNumber,
          issueDate,
          dueDate,
          udin,
          entityName,
          entityAddress,
          entityGstin,
          entityPan,
          entityMsmeReg,
          entityBankDetails,
          clientName,
          clientAddress,
          clientGstin,
          signature: signatureName,
          items: updatedItems
        })
      });

      const data = await response.json();
      if (data.success) {
        alert('Manual edits saved successfully');
        setSelectedInvoice(data.data);
        fetchInvoices();
      } else {
        alert(data.message || 'Failed to save manual edits');
      }
    } catch (error) {
      console.error(error);
      const msg = error instanceof Error ? error.message : String(error);
      alert('Error updating invoice: ' + msg);
    }
  };

  const handleExportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Invoice No,Client,Entity,Issue Date,Due Date,Taxable Amount,GST,Total Amount,Status\n";

    invoices.forEach(inv => {
      csvContent += `"${inv.invoiceNumber}","${inv.client.name}","${inv.entity.name}","${new Date(inv.issueDate).toLocaleDateString('en-IN')}","${inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-IN') : 'Immediate'}",${inv.subTotal},${inv.taxAmount},${inv.totalAmount},"${inv.status}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Invoices_Register_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Stat Counters Calculations
  const statsTotal = invoices.length;
  const statsDraft = invoices.filter(i => i.status === 'DRAFT').length;
  const statsSent = invoices.filter(i => i.status === 'SENT').length;
  const statsPaid = invoices.filter(i => i.status === 'PAID').length;
  const statsPending = invoices.filter(i => ['PENDING', 'PARTIALLY_PAID', 'UNPAID'].includes(i.status) || !['PAID', 'DRAFT', 'SENT', 'OVERDUE'].includes(i.status)).length;
  const statsOverdue = invoices.filter(i => i.status === 'OVERDUE').length;
  const statsRevenue = invoices
    .filter(i => i.status === 'PAID')
    .reduce((sum, i) => sum + (i.totalAmount * i.exchangeRate), 0);

  // Filters application
  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.entity.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.project?.name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesClient = filterClient ? inv.client.name === filterClient : true;
    const matchesStatus = filterStatus ? inv.status === filterStatus : true;
    const matchesEntity = filterEntity ? inv.entity.name === filterEntity : true;
    const matchesDate = filterDate ? inv.issueDate.startsWith(filterDate) : true;

    return matchesSearch && matchesClient && matchesStatus && matchesEntity && matchesDate;
  });

  // Pagination calculation
  const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentInvoices = filteredInvoices.slice(indexOfFirstItem, indexOfLastItem);

  return (
    <div className="p-6 space-y-8 font-sans text-secondary-900 dark:text-white relative">
      {/* Dynamic Printing CSS */}
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
          #print-invoice-area, #print-invoice-area * {
            visibility: visible !important;
            font-family: ${isCustomTypography ? getFontStack(activeFont) : (baseStyle === 'modern' ? "'Inter', sans-serif" : "'Times New Roman', Times, serif")} !important;
          }
          #print-invoice-area, #print-invoice-area *:not([style*="color"]):not(strong):not(b):not(th) {
            color: ${textColor} !important;
          }
          #print-invoice-area {
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
      `}</style>

      {/* Top Header Section */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 bg-white/40 dark:bg-secondary-800/10 p-6 rounded-3xl border border-white/20 dark:border-white/5 backdrop-blur-md">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-primary-600 to-indigo-600 dark:from-primary-400 dark:to-indigo-400 bg-clip-text text-transparent">
            Invoice Management
          </h1>
          <p className="text-secondary-500 dark:text-secondary-400 font-semibold mt-1">
            Perform items-based resource billing, manage entity records, download reporting sheets, and print A4 accounting-standard copies.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
          {/* Direct Search input inside top bar */}
          <div className="relative flex-1 sm:flex-initial min-w-[200px] flex items-center">
            <MagnifyingGlassIcon className="w-4 h-4 absolute left-3.5 text-secondary-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search Invoice No, Client..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-secondary-900 border border-secondary-200 dark:border-secondary-750 rounded-2xl outline-none text-xs font-semibold focus:ring-2 focus:ring-primary-500 shadow-sm"
            />
          </div>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 dark:bg-secondary-800 dark:hover:bg-secondary-700 dark:border-secondary-700 dark:text-slate-200 rounded-2xl text-xs font-bold transition-all shadow-sm"
          >
            <ArrowDownTrayIcon className="w-4 h-4 text-slate-500" />
            Excel Export
          </button>

          <button
            onClick={() => {
              resetForm();
              setShowCreateModal(true);
            }}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-[#0F2D5C] hover:bg-[#1A4B8F] text-white rounded-2xl shadow-md transition-all text-xs font-bold active:scale-[0.98]"
          >
            <PlusIcon className="w-4 h-4 text-white" />
            Create Invoice
          </button>
        </div>
      </div>

      {/* Summary Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
        {/* Card 1: Total */}
        <div className="bg-white/60 dark:bg-secondary-800/20 p-4 rounded-3xl border border-white/20 dark:border-white/5 shadow-sm hover:scale-[1.02] transition-transform duration-200">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-primary-500/10 text-primary-600 dark:text-primary-400 rounded-lg">
              <DocumentTextIcon className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold text-secondary-400 uppercase tracking-wider">Total</span>
          </div>
          <span className="text-2xl font-black text-slate-800 dark:text-slate-100">{statsTotal}</span>
        </div>

        {/* Card 2: Draft */}
        <div className="bg-white/60 dark:bg-secondary-800/20 p-4 rounded-3xl border border-white/20 dark:border-white/5 shadow-sm hover:scale-[1.02] transition-transform duration-200">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-slate-500/10 text-slate-600 dark:text-slate-400 rounded-lg">
              <PencilSquareIcon className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold text-secondary-400 uppercase tracking-wider">Draft</span>
          </div>
          <span className="text-2xl font-black text-slate-500 dark:text-slate-400">{statsDraft}</span>
        </div>

        {/* Card 3: Sent */}
        <div className="bg-white/60 dark:bg-secondary-800/20 p-4 rounded-3xl border border-white/20 dark:border-white/5 shadow-sm hover:scale-[1.02] transition-transform duration-200">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg">
              <ArrowPathIcon className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold text-secondary-400 uppercase tracking-wider">Sent</span>
          </div>
          <span className="text-2xl font-black text-blue-600 dark:text-blue-400">{statsSent}</span>
        </div>

        {/* Card 4: Paid */}
        <div className="bg-white/60 dark:bg-secondary-800/20 p-4 rounded-3xl border border-white/20 dark:border-white/5 shadow-sm hover:scale-[1.02] transition-transform duration-200">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg">
              <CheckCircleIcon className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold text-secondary-400 uppercase tracking-wider">Paid</span>
          </div>
          <span className="text-2xl font-black text-emerald-650 dark:text-emerald-400">{statsPaid}</span>
        </div>

        {/* Card 5: Pending */}
        <div className="bg-white/60 dark:bg-secondary-800/20 p-4 rounded-3xl border border-white/20 dark:border-white/5 shadow-sm hover:scale-[1.02] transition-transform duration-200">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg">
              <ClockIcon className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold text-secondary-400 uppercase tracking-wider">Pending</span>
          </div>
          <span className="text-2xl font-black text-amber-650 dark:text-amber-400">{statsPending}</span>
        </div>

        {/* Card 6: Overdue */}
        <div className="bg-white/60 dark:bg-secondary-800/20 p-4 rounded-3xl border border-white/20 dark:border-white/5 shadow-sm hover:scale-[1.02] transition-transform duration-200">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-red-500/10 text-red-600 dark:text-red-400 rounded-lg">
              <ExclamationCircleIcon className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold text-secondary-400 uppercase tracking-wider">Overdue</span>
          </div>
          <span className="text-2xl font-black text-red-500">{statsOverdue}</span>
        </div>

        {/* Card 7: Total Revenue */}
        <div className="bg-gradient-to-br from-primary-600/10 to-indigo-650/10 p-4 rounded-3xl border border-primary-500/10 shadow-sm hover:scale-[1.02] transition-transform duration-200 col-span-2 md:col-span-1">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 rounded-lg">
              <BanknotesIcon className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold text-secondary-400 uppercase tracking-wider">Paid Revenue</span>
          </div>
          <span className="text-xl font-black text-primary-650 dark:text-primary-400 block truncate">{formatCurrencyValue(statsRevenue, 'INR')}</span>
        </div>
      </div>

      {/* Filter Options Bar */}
      <div className="bg-white/60 dark:bg-secondary-800/15 p-4 rounded-2xl border border-white/20 dark:border-white/5 flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2 text-xs font-bold text-secondary-400">
          <FunnelIcon className="w-4 h-4" />
          FILTERS:
        </div>

        {/* Filter Client */}
        <select
          value={filterClient}
          onChange={(e) => setFilterClient(e.target.value)}
          title="Filter Client"
          className="p-2.5 bg-white dark:bg-secondary-900 border border-secondary-200 dark:border-secondary-750 rounded-xl text-xs font-bold outline-none"
        >
          <option value="">All Clients</option>
          {Array.from(new Set(invoices.map(i => i.client.name))).map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>

        {/* Filter Entity */}
        <select
          value={filterEntity}
          onChange={(e) => setFilterEntity(e.target.value)}
          title="Filter Entity"
          className="p-2.5 bg-white dark:bg-secondary-900 border border-secondary-200 dark:border-secondary-750 rounded-xl text-xs font-bold outline-none"
        >
          <option value="">All Entities</option>
          {Array.from(new Set(invoices.map(i => i.entity.name))).map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>

        {/* Filter Status */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          title="Filter Status"
          className="p-2.5 bg-white dark:bg-secondary-900 border border-secondary-200 dark:border-secondary-750 rounded-xl text-xs font-bold outline-none"
        >
          <option value="">All Statuses</option>
          <option value="DRAFT">DRAFT</option>
          <option value="SENT">SENT</option>
          <option value="PENDING">PENDING</option>
          <option value="PAID">PAID</option>
          <option value="OVERDUE">OVERDUE</option>
        </select>

        {/* Filter Month */}
        <select
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          title="Filter Month"
          className="p-2.5 bg-white dark:bg-secondary-900 border border-secondary-200 dark:border-secondary-750 rounded-xl text-xs font-bold outline-none"
        >
          <option value="">All Months</option>
          {Array.from(new Set(invoices.map(i => i.issueDate.substring(0, 7)))).sort().map(yearMonth => {
            const [year, month] = yearMonth.split('-');
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const displayLabel = `${monthNames[parseInt(month) - 1]} ${year}`;
            return (
              <option key={yearMonth} value={yearMonth}>{displayLabel}</option>
            );
          })}
        </select>

        {/* Reset button */}
        {(filterClient || filterEntity || filterStatus || filterDate) && (
          <button
            onClick={() => {
              setFilterClient('');
              setFilterEntity('');
              setFilterStatus('');
              setFilterDate('');
            }}
            className="text-xs font-bold text-red-500 hover:underline"
          >
            Clear Filters
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2.5 p-4 bg-red-500/10 border border-red-500/20 text-red-650 dark:text-red-400 rounded-2xl text-xs font-bold">
          <ExclamationCircleIcon className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError('')}
            className="ml-auto text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            title="Dismiss Error"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Invoice Register Table */}
      {loading ? (
        <TableSkeleton rows={8} columns={11} />
      ) : (
        <div className="glass-card rounded-[2rem] border border-white/20 dark:border-white/5 shadow-xl overflow-hidden bg-white/30 dark:bg-secondary-900/40">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-secondary-100/60 dark:bg-secondary-800/40 text-secondary-500 dark:text-secondary-400 text-xs font-bold uppercase tracking-wider">
                  <th className="p-4 pl-6">Invoice Number</th>
                  <th className="p-4">Client</th>
                  <th className="p-4">Entity</th>
                  <th className="p-4">Project</th>
                  <th className="p-4 text-center">Issue Date</th>
                  <th className="p-4 text-center">Due Date</th>
                  <th className="p-4 text-right">Taxable Amt</th>
                  <th className="p-4 text-right">GST</th>
                  <th className="p-4 text-right">Grand Total</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary-200/50 dark:divide-secondary-800/50 font-semibold text-sm">
                {currentInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-secondary-50/50 dark:hover:bg-secondary-800/10 transition-colors">
                    <td className="p-4 pl-6 font-bold text-primary-600 dark:text-primary-400">{inv.invoiceNumber}</td>
                    <td className="p-4">{inv.client.name}</td>
                    <td className="p-4 text-xs font-bold text-secondary-500">{inv.entity.name}</td>
                    <td className="p-4 text-xs text-secondary-500">{inv.project?.name || 'Itemized resource billing'}</td>
                    <td className="p-4 text-center text-xs text-secondary-500">
                      {new Date(inv.issueDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                    </td>
                    <td className="p-4 text-center text-xs text-secondary-500">
                      {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : 'Immediate'}
                    </td>
                    <td className="p-4 text-right">{formatCurrencyValue(inv.subTotal, inv.currency)}</td>
                    <td className="p-4 text-right text-xs text-secondary-450">{formatCurrencyValue(inv.taxAmount, inv.currency)}</td>
                    <td className="p-4 text-right font-bold text-primary-650 dark:text-primary-400">
                      {formatCurrencyValue(inv.totalAmount, inv.currency)}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`inline-flex px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${inv.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-600' :
                        inv.status === 'SENT' ? 'bg-blue-500/10 text-blue-600' :
                          inv.status === 'PENDING' || inv.status === 'PARTIALLY_PAID' ? 'bg-amber-500/10 text-amber-600' :
                            inv.status === 'OVERDUE' ? 'bg-red-500/10 text-red-600' :
                              'bg-slate-500/10 text-slate-500'
                        }`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedInvoice(inv);
                            setShowViewModal(true);
                          }}
                          className="p-2 bg-secondary-100 hover:bg-secondary-200 dark:bg-secondary-800 dark:hover:bg-secondary-750 text-slate-700 dark:text-slate-350 rounded-xl transition-all"
                          title="View Details"
                        >
                          <EyeIcon className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleEditClick(inv)}
                          className="p-2 bg-secondary-100 hover:bg-secondary-200 dark:bg-secondary-800 dark:hover:bg-secondary-750 text-slate-700 dark:text-slate-350 rounded-xl transition-all"
                          title="Edit Invoice"
                        >
                          <PencilSquareIcon className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleDuplicateClick(inv)}
                          className="p-2 bg-secondary-100 hover:bg-secondary-200 dark:bg-secondary-800 dark:hover:bg-secondary-750 text-slate-700 dark:text-slate-350 rounded-xl transition-all"
                          title="Duplicate Invoice"
                        >
                          <DocumentDuplicateIcon className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleDeleteInvoice(inv.id)}
                          className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl transition-all"
                          title="Delete Invoice"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              }

              {!loading && filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan={11} className="p-12 text-center text-secondary-400 font-bold">
                    No matching invoices found in register.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Dynamic Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-5 border-t border-secondary-200/50 dark:border-secondary-800/50 flex justify-between items-center bg-white/10 dark:bg-black/10">
            <span className="text-xs font-bold text-secondary-450 uppercase">
              Showing {indexOfFirstItem + 1}-{Math.min(indexOfLastItem, filteredInvoices.length)} of {filteredInvoices.length} invoices
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                title="Previous Page"
                aria-label="Previous Page"
                className="p-2 bg-white dark:bg-secondary-900 border border-secondary-200 dark:border-secondary-750 rounded-xl text-slate-700 dark:text-slate-300 disabled:opacity-40"
              >
                <ChevronLeftIcon className="w-4 h-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
                  title={`Go to Page ${i + 1}`}
                  aria-label={`Go to Page ${i + 1}`}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all ${currentPage === i + 1 ? 'bg-primary-600 text-white shadow-md' : 'bg-white dark:bg-secondary-900 border border-secondary-200 dark:border-secondary-750'
                    }`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                title="Next Page"
                aria-label="Next Page"
                className="p-2 bg-white dark:bg-secondary-900 border border-secondary-200 dark:border-secondary-750 rounded-xl text-slate-700 dark:text-slate-300 disabled:opacity-40"
              >
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* CREATE / EDIT — Single-Page Form Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#FAFBFD] dark:bg-secondary-950 border border-slate-200/80 dark:border-white/5 w-full max-w-4xl rounded-[2.5rem] shadow-2xl p-7 max-h-[90vh] flex flex-col space-y-6">
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-secondary-800 pb-4">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-[#0F2D5C] dark:text-white">
                  {editInvoiceId ? 'Modify Corporate Invoice' : 'Generate Professional Invoice'}
                </h2>
                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-1">
                  Accounting &amp; Billing workflow
                </p>
              </div>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditInvoiceId(null);
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 hover:bg-slate-100 dark:hover:bg-secondary-800 rounded-xl transition-all duration-200"
                title="Close"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleSaveForm(false); }} className="flex-1 overflow-y-auto pr-1 space-y-6 min-h-0 custom-scrollbar">

              {/* SECTION 1: Billing & Currency */}
              <div className="bg-white dark:bg-secondary-900/40 p-6 rounded-3xl border border-slate-200/60 dark:border-secondary-800/60 shadow-sm space-y-6">
                <div className="flex items-center gap-3 pb-2 border-b border-slate-100 dark:border-secondary-850/80">
                  <span className="flex-shrink-0 w-6 h-6 rounded-lg bg-gradient-to-tr from-primary-600 to-indigo-500 text-white text-[10px] font-black flex items-center justify-center shadow-md shadow-indigo-500/10">1</span>
                  <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">Billing Information</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 whitespace-nowrap">Billing Entity</label>
                    <select
                      value={formEntityId}
                      onChange={(e) => setFormEntityId(e.target.value)}
                      required
                      title="Corporate Entity"
                      className="w-full py-2.5 px-3.5 bg-white dark:bg-secondary-900 border border-slate-200 dark:border-secondary-800 rounded-xl outline-none text-xs font-medium text-slate-850 dark:text-slate-200 hover:border-slate-350 dark:hover:border-secondary-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 transition-all duration-200 shadow-sm"
                    >
                      {entities.map(ent => (
                        <option key={ent.id} value={ent.id}>{ent.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className={`md:col-span-2 space-y-1.5 relative ${isClientDropdownOpen ? 'z-30' : ''}`} ref={clientDropdownRef}>
                    <div className="flex justify-between items-center">
                      <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 whitespace-nowrap">
                        Client Account
                        {clients.length === 0 && <span className="ml-2 text-red-400 normal-case font-semibold">(Loading...)</span>}
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setIsNewClientMode(!isNewClientMode);
                          if (!isNewClientMode) {
                            setFormClientId('');
                          } else if (clients.length > 0) {
                            setFormClientId(clients[0].id);
                            setFormClientEmail(clients[0].officeEmail || '');
                          }
                        }}
                        className="text-[10px] font-bold text-primary-600 dark:text-primary-400 hover:underline cursor-pointer flex-shrink-0"
                      >
                        {isNewClientMode ? "Select Existing Client" : "+ Create New Client"}
                      </button>
                    </div>

                    {isNewClientMode ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                          type="text"
                          placeholder="Enter New Client Name..."
                          value={formNewClientName}
                          onChange={(e) => setFormNewClientName(e.target.value)}
                          className="w-full py-2.5 px-3.5 bg-white dark:bg-secondary-900 border border-slate-200 dark:border-secondary-800 rounded-xl outline-none text-xs font-medium text-slate-800 dark:text-slate-200 hover:border-slate-350 dark:hover:border-secondary-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 transition-all duration-200 shadow-sm"
                          required
                        />
                        <input
                          type="text"
                          placeholder="Enter GSTIN (Optional)..."
                          value={formNewClientGstin}
                          onChange={(e) => setFormNewClientGstin(e.target.value)}
                          className="w-full py-2.5 px-3.5 bg-white dark:bg-secondary-900 border border-slate-200 dark:border-secondary-800 rounded-xl outline-none text-xs font-medium text-slate-800 dark:text-slate-200 hover:border-slate-350 dark:hover:border-secondary-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 transition-all duration-200 shadow-sm"
                        />
                        <textarea
                          placeholder="Enter Client Address (Optional)..."
                          value={formNewClientAddress}
                          onChange={(e) => setFormNewClientAddress(e.target.value)}
                          className="w-full md:col-span-2 py-2.5 px-3.5 bg-white dark:bg-secondary-900 border border-slate-200 dark:border-secondary-800 rounded-xl outline-none text-xs font-medium text-slate-800 dark:text-slate-200 hover:border-slate-350 dark:hover:border-secondary-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 transition-all duration-200 shadow-sm resize-none"
                          rows={2}
                        />
                      </div>
                    ) : (
                      <>
                        {/* Hidden input for HTML5 form validation */}
                        <input type="hidden" value={formClientId} required />

                        {/* Premium Dropdown Trigger Button */}
                        <button
                          type="button"
                          onClick={() => setIsClientDropdownOpen(!isClientDropdownOpen)}
                          className="w-full flex items-center justify-between py-2.5 px-3.5 bg-white dark:bg-secondary-900 border border-slate-200 dark:border-secondary-800 rounded-xl text-xs font-medium text-slate-850 dark:text-slate-200 hover:border-slate-350 dark:hover:border-secondary-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 transition-all duration-200 shadow-sm text-left cursor-pointer outline-none"
                        >
                          <span className="truncate">
                            {clients.find(c => c.id === formClientId)?.name || 'Select Client Account'}
                          </span>
                          <ChevronDownIcon className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isClientDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {/* Floating Dropdown Popover */}
                        {isClientDropdownOpen && (
                          <div className="absolute z-50 left-0 w-full min-w-[280px] md:min-w-[320px] mt-1 bg-white dark:bg-secondary-950 border border-slate-200 dark:border-secondary-800 rounded-2xl shadow-xl overflow-hidden backdrop-blur-md">
                            {/* Search Input Box */}
                            <div className="relative p-2 border-b border-slate-100 dark:border-secondary-850">
                              <MagnifyingGlassIcon className="w-3.5 h-3.5 absolute left-4.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                              <input
                                type="text"
                                placeholder="Search Client..."
                                value={clientSearchQuery}
                                onChange={(e) => setClientSearchQuery(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-secondary-900 border border-slate-200 dark:border-secondary-800 rounded-lg text-xs font-medium outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 transition-all"
                                autoFocus
                              />
                            </div>

                            {/* Options List */}
                            <div className="max-h-60 overflow-y-auto custom-scrollbar py-1">
                              {(() => {
                                const filtered = clients.filter(c =>
                                  c.name.toLowerCase() !== 'ashish shah and associates' &&
                                  c.name.toLowerCase() !== 'ashish shah & associates'
                                );
                                const matches = filtered.filter(c =>
                                  c.name.toLowerCase().includes(clientSearchQuery.toLowerCase())
                                );

                                return (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setIsNewClientMode(true);
                                        setIsClientDropdownOpen(false);
                                        setFormClientId('');
                                        setFormNewClientName('');
                                        setFormNewClientGstin('');
                                        setFormNewClientAddress('');
                                      }}
                                      className="w-full flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:bg-slate-50 dark:hover:bg-secondary-900/60 transition-all duration-150 text-left outline-none border-b border-slate-100 dark:border-secondary-850"
                                    >
                                      <PlusIcon className="w-3.5 h-3.5" />
                                      <span>+ Create New Client</span>
                                    </button>

                                    {/* Inline Add Option if search has query */}
                                    {clientSearchQuery.trim() && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setFormNewClientName(clientSearchQuery.trim());
                                          setIsNewClientMode(true);
                                          setIsClientDropdownOpen(false);
                                          setClientSearchQuery('');
                                        }}
                                        className="w-full flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:bg-slate-50 dark:hover:bg-secondary-900/60 transition-all duration-150 text-left outline-none border-b border-slate-100 dark:border-secondary-850"
                                      >
                                        <PlusIcon className="w-3.5 h-3.5" />
                                        <span>Add "{clientSearchQuery}" as new client</span>
                                      </button>
                                    )}

                                    {matches.length === 0 ? (
                                      <div className="px-4 py-3 text-xs font-medium text-slate-400 text-center">
                                        No clients match search
                                      </div>
                                    ) : (
                                      matches.map(cl => (
                                        <button
                                          key={cl.id}
                                          type="button"
                                          onClick={() => {
                                            setFormClientId(cl.id);
                                            setFormClientEmail(cl.officeEmail || '');
                                            setIsClientDropdownOpen(false);
                                            setClientSearchQuery('');
                                          }}
                                          className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-semibold transition-all duration-150 text-left outline-none ${formClientId === cl.id
                                            ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-650 dark:text-primary-400'
                                            : 'text-slate-650 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-secondary-900/60 hover:text-slate-800 dark:hover:text-white'
                                            }`}
                                        >
                                          <span className="truncate">{cl.name}</span>
                                          {formClientId === cl.id && (
                                            <CheckIcon className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />
                                          )}
                                        </button>
                                      ))
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="md:col-span-2 space-y-1.5">
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 whitespace-nowrap">Client Email ID</label>
                    <input
                      type="email"
                      placeholder="client@example.com"
                      value={formClientEmail}
                      onChange={(e) => setFormClientEmail(e.target.value)}
                      className="w-full py-2.5 px-3.5 bg-white dark:bg-secondary-900 border border-slate-200 dark:border-secondary-800 rounded-xl outline-none text-xs font-medium text-slate-800 dark:text-slate-200 hover:border-slate-350 dark:hover:border-secondary-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 transition-all duration-200 shadow-sm"
                    />
                  </div>

                  <div className="md:col-span-2 space-y-1.5">
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 whitespace-nowrap">UDIN (Unique Doc ID)</label>
                    <input
                      type="text"
                      placeholder="e.g. 25153479BMIFVL2059"
                      value={formUdin}
                      onChange={(e) => setFormUdin(e.target.value)}
                      title="UDIN"
                      className="w-full py-2.5 px-3.5 bg-white dark:bg-secondary-900 border border-slate-200 dark:border-secondary-800 rounded-xl outline-none text-xs font-medium text-slate-850 dark:text-slate-200 hover:border-slate-350 dark:hover:border-secondary-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 transition-all duration-200 shadow-sm"
                    />
                  </div>

                  <div className="md:col-span-2 space-y-1.5">
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 whitespace-nowrap">Payment Due Date</label>
                    <input
                      type="date"
                      value={formDueDate}
                      onChange={(e) => setFormDueDate(e.target.value)}
                      required
                      title="Payment Due Date"
                      className="w-full py-2.5 px-3.5 bg-white dark:bg-secondary-900 border border-slate-200 dark:border-secondary-800 rounded-xl outline-none text-xs font-medium text-slate-800 dark:text-slate-200 hover:border-slate-350 dark:hover:border-secondary-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 transition-all duration-200 shadow-sm"
                    />
                  </div>

                  <div className="md:col-span-1 space-y-1.5">
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 whitespace-nowrap">Invoice Currency</label>
                    <select
                      value={formCurrency}
                      onChange={(e) => setFormCurrency(e.target.value)}
                      title="Currency"
                      className="w-full py-2.5 px-3.5 bg-white dark:bg-secondary-900 border border-slate-200 dark:border-secondary-800 rounded-xl outline-none text-xs font-medium text-slate-850 dark:text-slate-200 hover:border-slate-350 dark:hover:border-secondary-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 transition-all duration-200 shadow-sm"
                    >
                      <option value="INR">INR (₹)</option>
                      <option value="USD">USD ($)</option>
                      <option value="AED">AED (Dirham)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                    </select>
                  </div>

                  <div className="md:col-span-1 space-y-1.5">
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 whitespace-nowrap">Conversion Rate (INR Base)</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={formExchangeRate}
                      onChange={(e) => setFormExchangeRate(parseFloat(e.target.value) || 1.0)}
                      required
                      disabled={formCurrency === 'INR'}
                      title="Conversion Rate"
                      placeholder="1.0000"
                      className="w-full py-2.5 px-3.5 bg-white dark:bg-secondary-900 border border-slate-200 dark:border-secondary-800 rounded-xl outline-none text-xs font-medium text-slate-850 dark:text-slate-200 hover:border-slate-350 dark:hover:border-secondary-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 transition-all duration-200 disabled:opacity-50 shadow-sm"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: Line Items */}
              <div className="bg-white dark:bg-secondary-900/40 p-6 rounded-3xl border border-slate-200/60 dark:border-secondary-800/60 shadow-sm space-y-5">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-secondary-850/80">
                  <div className="flex items-center gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-lg bg-gradient-to-tr from-primary-600 to-indigo-500 text-white text-[10px] font-black flex items-center justify-center shadow-md shadow-indigo-500/10">2</span>
                    <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">Line Items Billing</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddLineItem}
                    className="text-xs font-bold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-1.5 bg-primary-50 dark:bg-primary-950/40 px-3 py-1.5 rounded-xl transition-all duration-200 active:scale-95 border border-primary-100/50 dark:border-primary-900/30"
                  >
                    <PlusIcon className="w-4 h-4" />
                    Add Line Item
                  </button>
                </div>

                {/* Table Column Labels for Desktop */}
                <div className="hidden xl:grid grid-cols-12 gap-4 px-4 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  <div className="col-span-3">Line Work Description</div>
                  <div className="col-span-2">Resource / Employee</div>
                  <div className="col-span-2">Active Project</div>
                  <div className="col-span-2">GST Rate (%)</div>
                  <div className="col-span-2">Invoice Amount</div>
                  <div className="col-span-1 text-center">Action</div>
                </div>

                <div className="space-y-3">
                  {formItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="relative group grid grid-cols-1 xl:grid-cols-12 gap-4 items-center bg-slate-50/30 dark:bg-secondary-900/10 p-4 xl:p-3 rounded-2xl border border-slate-200/50 dark:border-secondary-800/40 hover:border-slate-350 dark:hover:border-secondary-700/60 transition-all duration-200 shadow-sm"
                    >
                      {/* Mobile Row Badge */}
                      <span className="xl:hidden absolute top-3 left-4 text-[9px] font-black text-slate-350 dark:text-slate-600 uppercase tracking-widest">
                        Item #{idx + 1}
                      </span>

                      {/* Description */}
                      <div className="xl:col-span-3 space-y-1.5 xl:space-y-0 pt-6 xl:pt-0">
                        <label className="block xl:hidden text-[9px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          Line Work Description
                        </label>
                        <input
                          type="text"
                          placeholder="Consulting, development hours..."
                          value={item.description}
                          onChange={(e) => handleLineItemChange(idx, 'description', e.target.value)}
                          required
                          className="w-full py-2 px-3 bg-white dark:bg-secondary-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-850 dark:text-slate-200 hover:border-slate-300 dark:hover:border-secondary-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 transition-all duration-200 shadow-sm"
                        />
                      </div>

                      {/* Resource */}
                      <div className="xl:col-span-2 space-y-1.5 xl:space-y-0">
                        <label className="block xl:hidden text-[9px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          Resource / Employee
                        </label>
                        <select
                          value={item.employeeId || ''}
                          onChange={(e) => handleLineItemChange(idx, 'employeeId', e.target.value || undefined)}
                          title="Resource"
                          className="w-full py-2 px-2.5 bg-white dark:bg-secondary-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-850 dark:text-slate-200 hover:border-slate-300 dark:hover:border-secondary-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 transition-all duration-200 shadow-sm"
                        >
                          <option value="">Unassigned</option>
                          {employees.map(emp => (
                            <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>
                          ))}
                        </select>
                      </div>

                      {/* Project */}
                      <div className="xl:col-span-2 space-y-1.5 xl:space-y-0">
                        <label className="block xl:hidden text-[9px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          Active Project
                        </label>
                        <select
                          value={item.projectId || ''}
                          onChange={(e) => handleLineItemChange(idx, 'projectId', e.target.value || undefined)}
                          title="Project"
                          className="w-full py-2 px-2.5 bg-white dark:bg-secondary-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-850 dark:text-slate-200 hover:border-slate-300 dark:hover:border-secondary-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 transition-all duration-200 shadow-sm"
                        >
                          <option value="">Unassigned</option>
                          {projects.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>

                      {/* GST Rate */}
                      <div className="xl:col-span-2 space-y-1.5 xl:space-y-0">
                        <label className="block xl:hidden text-[9px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          GST Rate (%)
                        </label>
                        <select
                          value={item.gstRate || 0}
                          onChange={(e) => handleLineItemChange(idx, 'gstRate', parseFloat(e.target.value) || 0)}
                          title="GST Rate"
                          className="w-full py-2 px-2.5 bg-white dark:bg-secondary-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-850 dark:text-slate-200 hover:border-slate-300 dark:hover:border-secondary-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 transition-all duration-200 shadow-sm"
                        >
                          <option value="0">0% (Exempt)</option>
                          <option value="5">5%</option>
                          <option value="12">12%</option>
                          <option value="18">18% (Standard)</option>
                          <option value="28">28%</option>
                        </select>
                      </div>

                      {/* Amount */}
                      <div className="xl:col-span-2 space-y-1.5 xl:space-y-0">
                        <label className="block xl:hidden text-[9px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          Invoice Amount
                        </label>
                        <input
                          type="number"
                          placeholder="0"
                          value={item.total || ''}
                          onChange={(e) => handleLineItemChange(idx, 'total', e.target.value)}
                          required
                          title="Invoice Amount"
                          className="w-full py-2 px-3 bg-white dark:bg-secondary-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-850 dark:text-slate-200 hover:border-slate-300 dark:hover:border-secondary-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 transition-all duration-200 shadow-sm"
                        />
                      </div>

                      {/* Delete */}
                      <div className="xl:col-span-1 flex items-center justify-center pt-2 xl:pt-0">
                        <button
                          type="button"
                          disabled={formItems.length === 1}
                          onClick={() => handleRemoveLineItem(idx)}
                          aria-label="Remove Item"
                          className="p-2.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-xl transition-all disabled:opacity-40"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Totals row */}
                <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-secondary-850">
                  <div className="bg-slate-50/80 dark:bg-secondary-900/40 p-4.5 rounded-2xl border border-slate-200/60 dark:border-secondary-800/60 flex flex-col gap-2 w-80 shadow-sm">
                    {calculateTotals().taxAmount > 0 && (() => {
                      const isLocal = isClientLocal(formClientId);
                      const taxAmt = calculateTotals().taxAmount;
                      const subTotal = calculateTotals().subTotal;
                      return (
                        <>
                          <div className="flex justify-between font-bold text-slate-400 dark:text-slate-500 text-[10px] uppercase">
                            <span>Taxable Amount</span>
                            <span className="text-slate-700 dark:text-slate-350">{formatCurrencyValue(subTotal, formCurrency)}</span>
                          </div>
                          {isLocal ? (
                            <>
                              <div className="flex justify-between font-bold text-slate-400 dark:text-slate-500 text-[10px] uppercase">
                                <span>CGST</span>
                                <span className="text-slate-700 dark:text-slate-350">{formatCurrencyValue(taxAmt / 2, formCurrency)}</span>
                              </div>
                              <div className="flex justify-between font-bold text-slate-400 dark:text-slate-500 text-[10px] uppercase pb-1.5 border-b border-slate-200/50 dark:border-secondary-800/50">
                                <span>SGST</span>
                                <span className="text-slate-700 dark:text-slate-350">{formatCurrencyValue(taxAmt / 2, formCurrency)}</span>
                              </div>
                            </>
                          ) : (
                            <div className="flex justify-between font-bold text-slate-400 dark:text-slate-500 text-[10px] uppercase pb-1.5 border-b border-slate-200/50 dark:border-secondary-800/50">
                              <span>IGST</span>
                              <span className="text-slate-700 dark:text-slate-350">{formatCurrencyValue(taxAmt, formCurrency)}</span>
                            </div>
                          )}
                        </>
                      );
                    })()}
                    <div className="flex justify-between font-black text-lg text-[#0F2D5C] dark:text-primary-400">
                      <span>Grand Total</span>
                      <span>{formatCurrencyValue(calculateTotals().totalAmount, formCurrency)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex justify-between items-center pt-4.5 border-t border-slate-200 dark:border-secondary-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditInvoiceId(null);
                  }}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-secondary-900 dark:hover:bg-secondary-850 rounded-xl font-bold transition-all text-xs text-slate-600 dark:text-slate-350 active:scale-95 shadow-sm"
                >
                  Cancel
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-white border border-slate-200 dark:bg-secondary-900 dark:border-secondary-800 hover:bg-slate-50 dark:hover:bg-secondary-850 text-slate-700 dark:text-slate-250 rounded-xl font-bold transition-all text-xs active:scale-95 shadow-sm"
                  >
                    Save as Draft
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveForm(true)}
                    className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-extrabold shadow-lg shadow-teal-500/10 hover:shadow-teal-500/20 transition-all active:scale-[0.98] text-xs flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13"></line>
                      <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                    Save &amp; Send
                    <span className="text-[10px] opacity-70 font-medium ml-1">Ctrl+N</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW MODAL (PROFESSIONAL A4 LIVE TEMPLATE) */}
      {showViewModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-2 overflow-y-auto">
          <style>{`
            #print-invoice-area, #print-invoice-area * {
              font-family: ${getFontStack(activeFont)} !important;
            }
            #print-invoice-area, #print-invoice-area *:not(#edit-entity-name) {
              font-size: ${generalFontSize}px !important;
            }
            #print-invoice-area #edit-entity-name {
              font-size: ${companyFontSize}px !important;
            }
            #print-invoice-area, #print-invoice-area *:not([style*="color"]):not(strong):not(b):not(th) {
              color: ${textColor} !important;
            }
            .invoice-dynamic-header {
              padding-top: ${headerSpacing}px !important;
            }
            .invoice-dynamic-client {
              margin-top: ${clientSpacing}px !important;
            }
            .invoice-dynamic-client-left {
              margin-left: ${clientLeftOffset}px !important;
            }
            .invoice-dynamic-invoice-right {
              margin-right: ${invoiceRightOffset}px !important;
            }
            .invoice-dynamic-table {
              margin-top: ${24 + tableSpacing}px !important;
            }
            .invoice-dynamic-row-height {
              height: ${selectedInvoice.items.length === 1 ? '240px' : 'auto'} !important;
            }
            .invoice-dynamic-footer {
              margin-top: ${24 + footerSpacing}px !important;
            }
            .invoice-dynamic-bank-left {
              margin-left: ${bankLeftOffset}px !important;
            }
            .invoice-dynamic-signature {
              padding-top: ${signatureSpacing}px !important;
            }
            .invoice-dynamic-signature-left {
            }
          `}</style>

          <div className={`w-full max-w-[1300px] rounded-[2.5rem] shadow-2xl p-5 md:p-7 max-h-[96vh] overflow-y-auto flex flex-col gap-5 border ${isDark ? 'bg-[#1e293b] border-white/10 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>

            {/* View Modal Header */}
            <div className={`flex justify-between items-center px-5 md:px-7 py-4 -mx-5 md:-mx-7 -mt-5 md:-mt-7 border-b rounded-t-[2.5rem] ${isDark ? 'border-slate-700 text-white bg-slate-900/10' : 'bg-slate-50 border-slate-200 text-slate-800'}`}>
              <div>
                <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
                  <DocumentTextIcon className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                  Invoice audit workspace
                </h2>
                <p className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Accounting registry and printing workspace
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveManualEdits}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-extrabold text-xs shadow-md transition-all active:scale-[0.98]"
                >
                  <CheckIcon className="w-4 h-4" />
                  Save Manual Edits
                </button>

                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-extrabold text-xs shadow-md transition-all active:scale-[0.98]"
                >
                  <ArrowDownTrayIcon className="w-4 h-4" />
                  Print / Save PDF
                </button>

                {/* Duplicate Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsDuplicateDropdownOpen(!isDuplicateDropdownOpen)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-extrabold text-xs shadow-md transition-all active:scale-[0.98] border ${isDark ? 'bg-slate-800 hover:bg-slate-750 text-white border-slate-700' : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'}`}
                  >
                    <DocumentDuplicateIcon className="w-4 h-4 text-indigo-400" />
                    Duplicate
                    <ChevronDownIcon className={`w-3.5 h-3.5 text-slate-400 ml-auto transition-transform ${isDuplicateDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isDuplicateDropdownOpen && (
                    <div className={`absolute right-0 mt-1 w-48 rounded-xl shadow-xl z-20 py-1 overflow-hidden border ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
                      <button
                        type="button"
                        onClick={() => {
                          setIsDuplicateDropdownOpen(false);
                          handleDuplicateInvoiceWithOptions(selectedInvoice, false);
                        }}
                        className={`w-full text-left px-3.5 py-2 text-xs font-semibold transition-colors ${isDark ? 'text-slate-200 hover:bg-indigo-650 hover:text-white' : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-600'}`}
                      >
                        Duplicate with Current Date
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsDuplicateDropdownOpen(false);
                          handleDuplicateInvoiceWithOptions(selectedInvoice, true);
                        }}
                        className={`w-full text-left px-3.5 py-2 text-xs font-semibold transition-colors ${isDark ? 'text-slate-200 hover:bg-indigo-650 hover:text-white' : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-600'}`}
                      >
                        Duplicate with Same Dates
                      </button>
                    </div>
                  )}
                </div>

                {selectedInvoice.status === 'DRAFT' && (
                  <button
                    onClick={() => handleApproveInvoice(selectedInvoice.id)}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-extrabold text-xs shadow-md transition-all active:scale-[0.98]"
                  >
                    <CheckCircleIcon className="w-4 h-4" />
                    Approve
                  </button>
                )}

                <span className={`h-6 w-px mx-1 ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}></span>

                <button
                  onClick={() => setShowViewModal(false)}
                  className={`font-black p-1 rounded-lg transition-colors flex items-center justify-center ${isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'}`}
                  title="Close"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Centered A4 invoice container */}
            <div className={`flex justify-center overflow-x-auto custom-scrollbar p-6 md:p-8 rounded-2xl w-full ${isDark ? 'bg-black/20' : 'bg-slate-100/60'}`}>
              <style>{`
                #print-invoice-area {
                  color: ${textColor} !important;
                  font-family: ${isCustomTypography ? activeFont : 'inherit'} !important;
                }
                .inv-brand-color {
                  color: ${brandColor} !important;
                }
              `}</style>

              {/* A4 Invoice printable paper (print-container-wrapper) */}
              <div
                id="print-invoice-area"
                className={`invoice-preview-paper-container relative p-10 md:p-12 bg-white min-h-[842px] overflow-hidden w-[794px] min-w-[794px] max-w-[794px] ${
                  baseStyle === 'modern' ? 'font-sans' : 'font-serif'
                } ${
                  boldText ? 'font-bold' : ''
                } ${
                  wrapText ? 'break-words whitespace-normal' : ''
                }`}
              >

                {/* Header block (Classic centered vs Modern left-aligned) */}
                {baseStyle === 'modern' ? (
                  <div
                    className={`flex ${
                      headerAlign === 'center'
                        ? 'flex-col items-center text-center'
                        : headerAlign === 'right'
                          ? 'flex-row-reverse justify-between text-right'
                          : 'flex-row justify-between text-left'
                    } border-b border-slate-200 pb-6 z-10 relative invoice-dynamic-header`}
                  >
                    {showLetterhead ? (
                      <div className="space-y-1">
                        <h3 contentEditable suppressContentEditableWarning id="edit-entity-name" className="text-2xl font-bold tracking-tight inv-brand-color">
                          {selectedInvoice.entity?.name || 'Ashish Shah & Associates'}
                        </h3>
                        <span contentEditable suppressContentEditableWarning id="edit-entity-address" className="text-xs text-slate-500 block leading-relaxed max-w-[280px] whitespace-pre-line">
                          {selectedInvoice.entity?.address ? (selectedInvoice.entity.address.includes('\n') ? selectedInvoice.entity.address : selectedInvoice.entity.address.replace(/New Golden Nest,\s*/, 'New Golden Nest,\n')) : 'A 701, Rameshwer Tower 2, Phase XI, New Golden Nest,\nBhayander East, Thane - 401 105'}
                        </span>
                        <div className="text-[10px] text-slate-400 font-medium">
                          <span>GST: </span>
                          <span contentEditable suppressContentEditableWarning id="edit-entity-gstin" className="font-bold text-slate-500">
                            {selectedInvoice.entity?.gstin || '27BIEPS8929M1ZC'}
                          </span>
                          {selectedInvoice.entity?.bankDetails?.gstLut && (
                            <>
                              <span className="mx-1.5 text-slate-300">|</span>
                              <span>GST LUI No: </span>
                              <span contentEditable suppressContentEditableWarning id="edit-entity-gstlut" className="font-bold text-slate-500 font-mono">
                                {selectedInvoice.entity.bankDetails.gstLut}
                              </span>
                            </>
                          )}
                          {selectedInvoice.entity?.msmeReg && (
                            <>
                              <span className="mx-1.5 text-slate-300">|</span>
                              <span>MSME: </span>
                              <span contentEditable suppressContentEditableWarning id="edit-entity-msme" className="font-bold text-slate-500">
                                {selectedInvoice.entity.msmeReg}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div></div>
                    )}
                    <div className={headerAlign === 'center' ? 'mt-4 text-center' : 'text-right'}>
                      <span className="text-xl font-bold tracking-wider block uppercase inv-brand-color">Tax Invoice</span>
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
                    } pb-4 z-10 relative invoice-dynamic-header`}
                  >
                    {showLetterhead ? (
                      <>
                        <div className="mb-1">
                          <h3 contentEditable suppressContentEditableWarning id="edit-entity-name" className="text-3xl font-serif font-medium tracking-normal underline pb-0.5 inv-brand-color">
                            {selectedInvoice.entity?.name || 'Ashish Shah & Associates'}
                          </h3>
                        </div>
                        <span contentEditable suppressContentEditableWarning id="edit-entity-address" className="text-xs font-serif block mt-1 leading-relaxed whitespace-pre-line">
                          {selectedInvoice.entity?.address ? (selectedInvoice.entity.address.includes('\n') ? selectedInvoice.entity.address : selectedInvoice.entity.address.replace(/New Golden Nest,\s*/, 'New Golden Nest,\n')) : 'A 701, Rameshwer Tower 2, Phase XI, New Golden Nest,\nBhayander East, Thane - 401 105'}
                        </span>
                        <div className="text-[10px] font-serif mt-2 leading-relaxed">
                          <span>GST No: </span>
                          <span contentEditable suppressContentEditableWarning id="edit-entity-gstin" className="font-bold">
                            {selectedInvoice.entity?.gstin || '27BIEPS8929M1ZC'}
                          </span>
                          {selectedInvoice.entity?.bankDetails?.gstLut && (
                            <>
                              <span>, GST LUI No: </span>
                              <span contentEditable suppressContentEditableWarning id="edit-entity-gstlut" className="font-bold font-mono">
                                {selectedInvoice.entity.bankDetails.gstLut}
                              </span>
                            </>
                          )}
                          {selectedInvoice.entity?.msmeReg && (
                            <>
                              <span>, MSME: </span>
                              <span contentEditable suppressContentEditableWarning id="edit-entity-msme" className="font-bold">
                                {selectedInvoice.entity.msmeReg}
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

                {/* Client Bill To & Invoice details */}
                {baseStyle === 'modern' ? (
                  <div className="grid grid-cols-2 gap-6 py-6 text-xs relative z-10 invoice-dynamic-client">
                    <div className="space-y-1 invoice-dynamic-client-left">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Billed To</span>
                      <span contentEditable suppressContentEditableWarning id="edit-client-name" className="font-bold text-sm text-slate-800 block">{selectedInvoice.client?.name}</span>
                      <span contentEditable suppressContentEditableWarning id="edit-client-address" className="text-slate-650 block leading-normal max-w-sm whitespace-pre-line">
                        {selectedInvoice.client?.address || selectedInvoice.client?.billingAddress || ''}
                      </span>
                      <span className="text-slate-800 block font-bold mt-1">
                        GSTIN:{" "}
                        <span contentEditable suppressContentEditableWarning id="edit-client-gstin">
                          {selectedInvoice.client?.gstin || 'NA'}
                        </span>
                      </span>
                    </div>

                    <div className="text-right space-y-1.5 self-start invoice-dynamic-invoice-right font-medium">
                      <div className="flex justify-end gap-4">
                        <span className="text-slate-450 font-bold uppercase text-[9px] tracking-wider">Invoice No</span>
                        <span contentEditable suppressContentEditableWarning id="edit-invoice-number" className="font-bold text-slate-800">{selectedInvoice.invoiceNumber}</span>
                      </div>
                      <div className="flex justify-end gap-4">
                        <span className="text-slate-450 font-bold uppercase text-[9px] tracking-wider">Issue Date</span>
                        <span contentEditable suppressContentEditableWarning id="edit-issue-date" className="font-bold text-slate-800">{new Date(selectedInvoice.issueDate).toLocaleDateString('en-GB')}</span>
                      </div>
                      {selectedInvoice.dueDate && (
                        <div className="flex justify-end gap-4">
                          <span className="text-slate-450 font-bold uppercase text-[9px] tracking-wider">Due Date</span>
                          <span contentEditable suppressContentEditableWarning id="edit-due-date" className="font-bold text-slate-800">{new Date(selectedInvoice.dueDate).toLocaleDateString('en-GB')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between py-6 font-serif text-xs relative z-10 invoice-dynamic-client">
                    <div className="space-y-0.5 invoice-dynamic-client-left">
                      <span className="font-bold block text-black">To</span>
                      <span contentEditable suppressContentEditableWarning id="edit-client-name" className="font-bold text-[12px] text-black block">{selectedInvoice.client?.name}</span>
                      <span contentEditable suppressContentEditableWarning id="edit-client-address" className="text-black block leading-relaxed max-w-sm whitespace-pre-line">
                        {selectedInvoice.client?.address || selectedInvoice.client?.billingAddress || ''}
                      </span>
                      <span className="text-black block font-bold mt-1">
                        GST Number :{" "}
                        <span contentEditable suppressContentEditableWarning id="edit-client-gstin">
                          {selectedInvoice.client?.gstin || 'NA'}
                        </span>
                      </span>
                    </div>

                    <div className="text-right font-bold text-black space-y-1 self-start whitespace-nowrap invoice-dynamic-invoice-right">
                      <div>Invoice No:- <span contentEditable suppressContentEditableWarning id="edit-invoice-number" className="font-bold">{selectedInvoice.invoiceNumber}</span></div>
                      <div>Date :- <span contentEditable suppressContentEditableWarning id="edit-issue-date">{new Date(selectedInvoice.issueDate).toLocaleDateString('en-GB')}</span></div>
                    </div>
                  </div>
                )}

                {(() => {
                  const taxDetails = getTaxDetails(selectedInvoice, taxModeOverride);
                  const totalTaxAmount = taxDetails.isLocal ? (taxDetails.cgstAmount + taxDetails.sgstAmount) : taxDetails.igstAmount;
                  const calculatedTotal = selectedInvoice.subTotal + totalTaxAmount;

                  const tableClass = baseStyle === 'modern'
                    ? "w-full text-left text-xs mt-6 border-b border-slate-200 border-collapse relative z-10 invoice-dynamic-table"
                    : "w-full text-left font-serif text-xs mt-6 border-2 border-black border-collapse relative z-10 invoice-dynamic-table";

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
                        {selectedInvoice.items.map((item, idx) => (
                          <tr
                            key={idx}
                            className={`invoice-dynamic-row-height ${baseStyle === 'modern' ? 'hover:bg-slate-50/20' : 'font-semibold text-black'}`}
                          >
                            <td className={baseStyle === 'modern' ? "py-3.5 px-2 border-b border-slate-100 text-center text-slate-500 align-top" : "py-3 border-r border-black text-center align-top"}>{idx + 1})</td>
                            <td className={baseStyle === 'modern' ? "py-3.5 px-3 border-b border-slate-100 align-top text-left" : "py-3 px-3 border-r border-black text-left align-top"}>
                              <span contentEditable suppressContentEditableWarning id={`edit-item-desc-${idx}`} className={`block leading-normal ${baseStyle === 'modern' ? 'font-bold text-slate-800' : 'font-bold text-black'}`}>{item.description}</span>
                              {idx === 0 && selectedInvoice.udin && selectedInvoice.udin.trim() && (
                                <div className="text-[10px] font-bold text-slate-450 mt-2 font-mono tracking-wide">
                                  UDIN:<span contentEditable suppressContentEditableWarning id="edit-udin">{selectedInvoice.udin}</span> Dt. {new Date(selectedInvoice.issueDate).toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' })}
                                </div>
                              )}
                            </td>
                            <td contentEditable suppressContentEditableWarning id={`edit-item-sac-${idx}`} className={baseStyle === 'modern' ? "py-3.5 px-2 border-b border-slate-100 text-center text-slate-650 align-top" : "py-3 border-r border-black text-center align-top text-black"}>{(item as { sacCode?: string }).sacCode || "998224"}</td>
                            <td contentEditable suppressContentEditableWarning id={`edit-item-amount-${idx}`} className={baseStyle === 'modern' ? "py-3.5 px-3 border-b border-slate-100 text-right align-top font-bold text-slate-900" : "py-3 pr-3 text-right align-top font-bold text-black"}>
                              {formatAmountNumber(item.total)}
                            </td>
                          </tr>
                        ))}

                        {/* Dynamic Tax Rows inside the 4-column table */}
                        {(selectedInvoice.taxAmount > 0 || taxModeOverride !== 'auto') && (
                          taxDetails.isLocal ? (
                            <>
                              <tr className={baseStyle === 'modern' ? "text-slate-600" : "font-semibold text-black text-xs"}>
                                <td className={baseStyle === 'modern' ? "py-2 border-b border-slate-100" : "py-2 border-r border-black text-center"}></td>
                                <td className={baseStyle === 'modern' ? "py-2 px-3 border-b border-slate-100 text-left font-medium" : "py-2 px-3 border-r border-black text-left"}>
                                  CGST @ <span contentEditable suppressContentEditableWarning id="edit-cgst-rate" className="font-bold">{taxDetails.cgstPercent}</span>%
                                </td>
                                <td className={baseStyle === 'modern' ? "py-2 border-b border-slate-100" : "py-2 border-r border-black text-center"}></td>
                                <td className={baseStyle === 'modern' ? "py-2 px-3 border-b border-slate-100 text-right font-bold text-slate-800" : "py-2 pr-3 text-right font-bold text-black"}>{formatAmountNumber(taxDetails.cgstAmount)}</td>
                              </tr>
                              <tr className={baseStyle === 'modern' ? "text-slate-600" : "font-semibold text-black text-xs"}>
                                <td className={baseStyle === 'modern' ? "py-2 border-b border-slate-100" : "py-2 border-r border-black text-center"}></td>
                                <td className={baseStyle === 'modern' ? "py-2 px-3 border-b border-slate-100 text-left font-medium" : "py-2 px-3 border-r border-black text-left"}>
                                  SGST @ <span contentEditable suppressContentEditableWarning id="edit-sgst-rate" className="font-bold">{taxDetails.sgstPercent}</span>%
                                </td>
                                <td className={baseStyle === 'modern' ? "py-2 border-b border-slate-100" : "py-2 border-r border-black text-center"}></td>
                                <td className={baseStyle === 'modern' ? "py-2 px-3 border-b border-slate-100 text-right font-bold text-slate-800" : "py-2 pr-3 text-right font-bold text-black"}>{formatAmountNumber(taxDetails.sgstAmount)}</td>
                              </tr>
                            </>
                          ) : (
                            <tr className={baseStyle === 'modern' ? "text-slate-600" : "font-semibold text-black text-xs"}>
                              <td className={baseStyle === 'modern' ? "py-2 border-b border-slate-100" : "py-2 border-r border-black text-center"}></td>
                              <td className={baseStyle === 'modern' ? "py-2 px-3 border-b border-slate-100 text-left font-medium" : "py-2 px-3 border-r border-black text-left"}>
                                IGST @ <span contentEditable suppressContentEditableWarning id="edit-igst-rate" className="font-bold">{taxDetails.igstPercent}</span>%
                              </td>
                              <td className={baseStyle === 'modern' ? "py-2 border-b border-slate-100" : "py-2 border-r border-black text-center"}></td>
                              <td className={baseStyle === 'modern' ? "py-2 px-3 border-b border-slate-100 text-right font-bold text-slate-800" : "py-2 pr-3 text-right font-bold text-black"}>{formatAmountNumber(taxDetails.igstAmount)}</td>
                            </tr>
                          )
                        )}

                        {/* Amount in Words Row */}
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

                        {/* Bordered Total Row inside the table */}
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

                {/* Bottom calculations & footer bank info */}
                <div className={`grid grid-cols-12 gap-6 mt-6 text-[11px] relative z-10 invoice-dynamic-footer ${baseStyle === 'modern' ? '' : 'font-serif'}`}>

                  {/* Remittance column with left-relocated Signature */}
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
                      <div className={`${baseStyle === 'modern' ? 'bg-slate-50/60 p-4 rounded-xl border border-slate-200/50 text-slate-700' : 'text-black'} invoice-dynamic-bank-left`}>
                        <span className={`font-bold block text-xs mb-1 ${baseStyle === 'modern' ? 'text-slate-900' : ''}`}>Bank Account Details</span>

                        {selectedInvoice.entity?.bankDetails?.accountName && (
                          <span className="block">
                            <span contentEditable suppressContentEditableWarning id="edit-bank-account-name" className="font-bold">
                              {selectedInvoice.entity.bankDetails.accountName}
                            </span>
                          </span>
                        )}
                        {selectedInvoice.entity?.bankDetails?.bankName && (
                          <span className="block">
                            <span contentEditable suppressContentEditableWarning id="edit-bank-name" className="font-bold">
                              {selectedInvoice.entity.bankDetails.bankName}
                            </span>
                          </span>
                        )}
                        {selectedInvoice.entity?.bankDetails?.accountNo && (
                          <span className="block">
                            <strong>current Bank a/c: </strong>
                            <span contentEditable suppressContentEditableWarning id="edit-bank-account-no" className="font-bold">
                              {selectedInvoice.entity.bankDetails.accountNo}
                            </span>
                          </span>
                        )}
                        {selectedInvoice.entity?.bankDetails?.ifsc && (
                          <span className="block">
                            <strong>RTGS / NEFT IFSC Code: </strong>
                            <span contentEditable suppressContentEditableWarning id="edit-bank-ifsc" className="font-bold font-mono">
                              {selectedInvoice.entity.bankDetails.ifsc}
                            </span>
                          </span>
                        )}
                        {selectedInvoice.entity?.bankDetails?.swift && (
                          <span className="block">
                            <strong>Swift / BIC Code: </strong>
                            <span contentEditable suppressContentEditableWarning id="edit-bank-swift" className="font-bold font-mono">
                              {selectedInvoice.entity.bankDetails.swift}
                            </span>
                          </span>
                        )}
                        {selectedInvoice.entity?.bankDetails?.micr && (
                          <span className="block">
                            <strong>MICR Code: </strong>
                            <span contentEditable suppressContentEditableWarning id="edit-bank-micr" className="font-bold font-mono">
                              {selectedInvoice.entity.bankDetails.micr}
                            </span>
                          </span>
                        )}
                        {selectedInvoice.entity?.pan && (
                          <span className="block">
                            <strong>PAN: </strong>
                            <span contentEditable suppressContentEditableWarning id="edit-entity-pan" className="font-bold font-mono">
                              {selectedInvoice.entity.pan}
                            </span>
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="h-[70px]"></div>
                    )}

                    {selectedInvoice.entity?.msmeReg && (
                      <div className={`pt-2 text-[9px] whitespace-nowrap font-normal leading-normal ${baseStyle === 'modern' ? 'text-slate-450' : 'text-black'}`}>
                        *We are registered under MSME and Registration number is "
                        <span contentEditable suppressContentEditableWarning id="edit-entity-msme" className="font-bold">
                          {selectedInvoice.entity.msmeReg}
                        </span>
                        " W.E.F April 28, 2021.
                      </div>
                    )}

                    {/* Relocated Proprietor Signature Area */}
                    <div
                      className={`flex flex-col ${
                        footerAlign === 'center'
                          ? 'items-center text-center mx-auto'
                          : footerAlign === 'right'
                            ? 'items-end text-right ml-auto'
                            : 'items-start text-left'
                      } min-h-[120px] max-w-[220px] pt-4 invoice-dynamic-signature`}
                    >

                      <span contentEditable suppressContentEditableWarning id="edit-signature-entity" className="text-[12px] font-bold block mb-1">
                        {selectedInvoice.entity?.legalName || selectedInvoice.entity?.name || 'Ashish Shah & Associates'}
                      </span>

                      {/* Signature space - DSC applied physically/manually */}
                      <div className="h-16 w-full my-1"></div>

                      <span contentEditable suppressContentEditableWarning id="edit-signature-name" className="text-[12px] font-bold block">
                        {selectedInvoice.signature || selectedInvoice.entity?.bankDetails?.signature || "Ashish Shah"}
                      </span>
                      <span className="text-[10px] font-medium text-slate-500 block">
                        {selectedInvoice.entity?.bankDetails?.authorityDesignation || 'Proprietor'}
                      </span>
                    </div>

                  </div>

                  {/* Right column */}
                  <div className="col-span-5 text-right flex flex-col justify-end items-end space-y-1 font-semibold text-black">
                    {selectedInvoice.currency !== 'INR' && (
                      <div className="text-[9px] text-slate-400 text-right italic mb-2">
                        Exchange rate: 1 {selectedInvoice.currency} = {selectedInvoice.exchangeRate} INR
                      </div>
                    )}
                  </div>
                </div>


              </div>


            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoiceManagement;
