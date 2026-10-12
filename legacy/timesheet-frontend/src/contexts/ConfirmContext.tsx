import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import { TrashIcon, ExclamationTriangleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDelete?: boolean;
  severity?: 'warning' | 'danger' | 'info';
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export const useConfirm = () => {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context;
};

interface ConfirmProviderProps {
  children: ReactNode;
}

export const ConfirmProvider: React.FC<ConfirmProviderProps> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    isDelete: false,
    severity: 'danger',
  });
  const [resolveCallback, setResolveCallback] = useState<((val: boolean) => void) | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const confirmRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  const confirm = (opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setOptions({
        confirmText: opts.isDelete ? 'Yes, Delete' : 'Confirm',
        cancelText: 'Cancel',
        severity: opts.isDelete ? 'danger' : 'warning',
        ...opts,
      });
      setResolveCallback(() => resolve);
      setIsLoading(false);
      setIsOpen(true);
    });
  };

  const handleCancel = () => {
    if (resolveCallback) resolveCallback(false);
    setIsOpen(false);
  };

  const handleConfirm = () => {
    setIsLoading(true);
    // Simulate minor loading animation for smooth UX before resolving
    setTimeout(() => {
      if (resolveCallback) resolveCallback(true);
      setIsOpen(false);
      setIsLoading(false);
    }, 450);
  };

  // Keyboard Navigation: ESC to close, TAB focus trap
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        handleCancel();
      }

      if (e.key === 'Tab') {
        if (confirmRef.current) {
          const focusable = confirmRef.current.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          if (focusable.length > 0) {
            const first = focusable[0] as HTMLElement;
            const last = focusable[focusable.length - 1] as HTMLElement;
            if (e.shiftKey && document.activeElement === first) {
              last.focus();
              e.preventDefault();
            } else if (!e.shiftKey && document.activeElement === last) {
              first.focus();
              e.preventDefault();
            }
          }
        }
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      // Auto-focus cancel or confirm button
      setTimeout(() => {
        if (options.isDelete && cancelButtonRef.current) {
          cancelButtonRef.current.focus();
        } else if (confirmButtonRef.current) {
          confirmButtonRef.current.focus();
        }
      }, 50);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, options, resolveCallback]);

  const getIcon = () => {
    if (options.isDelete) {
      return (
        <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center text-red-500 animate-pulse">
          <TrashIcon className="w-6 h-6" />
        </div>
      );
    }
    switch (options.severity) {
      case 'danger':
        return (
          <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center text-red-500 animate-pulse">
            <ExclamationTriangleIcon className="w-6 h-6" />
          </div>
        );
      case 'info':
        return (
          <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center text-blue-500 animate-pulse">
            <InformationCircleIcon className="w-6 h-6" />
          </div>
        );
      case 'warning':
      default:
        return (
          <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center text-amber-500 animate-pulse">
            <ExclamationTriangleIcon className="w-6 h-6" />
          </div>
        );
    }
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop Blur */}
          <div
            className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-md transition-opacity duration-300 animate-fade-in"
            onClick={handleCancel}
          />

          {/* Modal Container */}
          <div
            ref={confirmRef}
            className="relative w-full max-w-md bg-white dark:bg-secondary-900 border border-slate-200 dark:border-secondary-800 rounded-3xl p-6 shadow-2xl transition-all transform animate-confirm-zoom text-slate-800 dark:text-slate-100 flex flex-col items-center text-center select-none"
            role="dialog"
            aria-modal="true"
          >
            {/* Header Icon */}
            <div className="mb-4">{getIcon()}</div>

            {/* Title */}
            <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">
              {options.title}
            </h3>

            {/* Description */}
            <p className="text-sm text-slate-500 dark:text-secondary-400 mb-6 leading-relaxed">
              {options.message}
            </p>

            {/* Actions */}
            <div className="flex w-full items-center justify-center gap-3">
              <button
                ref={cancelButtonRef}
                onClick={handleCancel}
                disabled={isLoading}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 dark:border-secondary-800 text-sm font-semibold text-slate-700 dark:text-secondary-300 hover:bg-slate-50 dark:hover:bg-secondary-805 active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50"
              >
                {options.cancelText}
              </button>
              <button
                ref={confirmButtonRef}
                onClick={handleConfirm}
                disabled={isLoading}
                className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold text-white active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 flex items-center justify-center gap-2
                  ${
                    options.isDelete
                      ? 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 focus:ring-red-500 shadow-lg shadow-red-500/20'
                      : options.severity === 'info'
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 focus:ring-blue-500 shadow-lg shadow-blue-500/20'
                      : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 focus:ring-amber-500 shadow-lg shadow-amber-500/20'
                  }
                  disabled:opacity-80`}
              >
                {isLoading ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Processing...
                  </>
                ) : (
                  options.confirmText
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};
