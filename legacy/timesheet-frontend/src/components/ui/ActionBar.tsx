import React, { useState, useRef, useEffect } from 'react';
import Button from './Button';
import { 
  PlusIcon,
} from '@heroicons/react/24/outline';
import {
  FileSpreadsheet,
  ChevronDown,
  Download,
  Upload,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

interface ActionBarProps {
  onAdd?: () => void;
  addLabel?: string;
  onUpload?: () => void;
  onDownload?: () => void;
  onDownloadTemplate?: () => void;
  showAdd?: boolean;
  showUpload?: boolean;
  showDownload?: boolean;
  showTemplate?: boolean;
  isUploading?: boolean;
}

const ActionBar: React.FC<ActionBarProps> = ({
  onAdd,
  addLabel = 'Add New',
  onUpload,
  onDownload,
  onDownloadTemplate,
  showAdd = true,
  showUpload = true,
  showDownload = true,
  showTemplate = true,
  isUploading = false,
}) => {
  const [isExcelMenuOpen, setIsExcelMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsExcelMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const hasExcelActions = 
    (showTemplate && onDownloadTemplate) || 
    (showUpload && onUpload) || 
    (showDownload && onDownload);

  return (
    <div className="flex flex-wrap items-center gap-3 relative z-[999]">
      {hasExcelActions && (
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsExcelMenuOpen(!isExcelMenuOpen)}
            className="flex items-center gap-2 h-10 px-4 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900 text-sm font-semibold rounded-full shadow-sm ring-4 ring-slate-100 transition-all duration-200 cursor-pointer outline-none group"
          >
            <FileSpreadsheet className="w-4 h-4 text-green-600 transition-transform group-hover:scale-110" />
            <span>Excel Actions</span>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-300 ${isExcelMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {isExcelMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ type: 'spring', damping: 25, stiffness: 400 }}
                className="absolute right-0 mt-2.5 w-56 origin-top-right rounded-2xl bg-white shadow-[0_20px_50px_rgba(0,0,0,0.15)] ring-1 ring-slate-200 focus:outline-none z-[9999] p-1.5 space-y-1 border border-slate-100"
              >
                {showTemplate && onDownloadTemplate && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsExcelMenuOpen(false);
                      onDownloadTemplate();
                    }}
                    className="group flex w-full items-center px-4 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-xl transition-all duration-200 text-left gap-2.5 cursor-pointer"
                  >
                    <span className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-100 transition-colors">
                      <Download className="w-3.5 h-3.5 text-indigo-600" />
                    </span>
                    Download Template
                  </button>
                )}

                {showUpload && onUpload && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsExcelMenuOpen(false);
                      onUpload();
                    }}
                    disabled={isUploading}
                    className="group flex w-full items-center px-4 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 rounded-xl transition-all duration-200 text-left gap-2.5 disabled:opacity-50 cursor-pointer"
                  >
                    <span className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-100 transition-colors">
                      <Upload className="w-3.5 h-3.5 text-emerald-600" />
                    </span>
                    {isUploading ? 'Uploading...' : 'Import Excel'}
                  </button>
                )}

                {showDownload && onDownload && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsExcelMenuOpen(false);
                      onDownload();
                    }}
                    className="group flex w-full items-center px-4 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 rounded-xl transition-all duration-200 text-left gap-2.5 cursor-pointer"
                  >
                    <span className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 transition-colors">
                      <Download className="w-3.5 h-3.5 text-blue-600" />
                    </span>
                    Export Excel
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {showAdd && onAdd && (
        <Button
          variant="primary"
          size="sm"
          className="h-10 px-6 text-xs font-bold shadow-md shadow-primary-500/10"
          onClick={onAdd}
          leftIcon={<PlusIcon className="w-4 h-4" />}
        >
          {addLabel}
        </Button>
      )}
    </div>
  );
};

export default ActionBar;

