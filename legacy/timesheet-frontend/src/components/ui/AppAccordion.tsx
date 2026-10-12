import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

export interface AppAccordionProps {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
}

export const AppAccordion: React.FC<AppAccordionProps> = ({
  title,
  isOpen,
  onToggle,
  children,
  className = '',
  headerClassName = '',
}) => {
  return (
    <div className={`border border-slate-100 dark:border-secondary-800 rounded-2xl overflow-hidden bg-white dark:bg-secondary-900 ${className}`}>
      {/* Header Button */}
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between p-4 bg-slate-50/50 dark:bg-secondary-850/20 text-slate-800 dark:text-white text-xs font-black uppercase tracking-wider cursor-pointer border-none focus:outline-none transition-colors hover:bg-slate-50 dark:hover:bg-secondary-800/30 ${headerClassName}`}
      >
        <span>{title}</span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex items-center shrink-0"
        >
          <ChevronDown className="w-4 h-4 text-slate-500" />
        </motion.span>
      </button>

      {/* Collapsible Content */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
          >
            <div className="p-5 border-t border-slate-100 dark:border-secondary-800 space-y-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AppAccordion;
