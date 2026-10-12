import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export interface AppModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

export const AppModal: React.FC<AppModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}) => {
  // Prevent background scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-[95vw] h-[95vh]',
  };

  const modalMarkup = (
    <AnimatePresence>
      <div className="fixed inset-0 z-[1050] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
        {/* Click outside to close backdrop */}
        <div className="absolute inset-0" onClick={onClose} />
        
        {/* Modal Window */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className={`w-full ${sizes[size]} max-h-[90vh] bg-white dark:bg-secondary-900 border border-slate-100 dark:border-secondary-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden relative z-10`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-secondary-800 shrink-0">
            <h3 className="text-base font-black text-slate-900 dark:text-white leading-tight">
              {title}
            </h3>
            <button
              onClick={onClose}
              title="Close modal"
              className="p-1.5 rounded-lg border-none bg-transparent hover:bg-slate-100 dark:hover:bg-secondary-800 text-slate-400 hover:text-slate-650 cursor-pointer flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-5 app-scrollbar">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="flex items-center justify-end gap-2.5 px-6 py-4.5 border-t border-slate-100 dark:border-secondary-800 shrink-0 bg-slate-50/50 dark:bg-secondary-950/20">
              {footer}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );

  return createPortal(modalMarkup, document.body);
};

export default AppModal;
