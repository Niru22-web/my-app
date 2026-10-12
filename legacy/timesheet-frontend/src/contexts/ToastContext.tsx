import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import ToastContainer, { Toast } from '../components/ui/ToastContainer';
import { setGlobalToast } from '../utils/globalErrorHandler';
import { ExclamationTriangleIcon, ClockIcon } from '@heroicons/react/24/outline';

interface ToastContextType {
  showToast: (toast: Omit<Toast, 'id'> & { id?: string }) => string;
  success: (message: string, action?: Toast['action']) => string;
  error: (message: string, action?: Toast['action'], details?: string) => string;
  warning: (message: string, action?: Toast['action']) => string;
  info: (message: string, action?: Toast['action']) => string;
  update: (id: string, toast: Partial<Toast>) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

interface ToastProviderProps {
  children: ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showSessionExpired, setShowSessionExpired] = useState(false);

  const showToast = (toast: Omit<Toast, 'id'> & { id?: string }) => {
    const id = toast.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newToast: Toast = {
      ...toast,
      id,
    };
    setToasts((prev) => [newToast, ...prev]);
    return id;
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const success = (message: string, action?: Toast['action']) => {
    return showToast({ message, type: 'success', action });
  };

  const error = (message: string, action?: Toast['action'], details?: string) => {
    // Stays visible longer (6.5s) unless closed, has support for expandable details
    return showToast({ message, type: 'error', duration: 6500, action, details });
  };

  const warning = (message: string, action?: Toast['action']) => {
    return showToast({ message, type: 'warning', action });
  };

  const info = (message: string, action?: Toast['action']) => {
    return showToast({ message, type: 'info', action });
  };

  const update = (id: string, toast: Partial<Toast>) => {
    setToasts((prev) => 
      prev.map((t) => 
        t.id === id 
          ? { ...t, ...toast }
          : t
      )
    );
  };

  // Register global toast instance for error handlers
  useEffect(() => {
    const toastInstance = { 
      success, 
      error: (msg: string, act?: Toast['action'], det?: string) => error(msg, act, det), 
      warning, 
      info 
    };
    setGlobalToast(toastInstance);
  }, []);

  // Listen for online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      success('Connected! Back online.');
    };
    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Listen for session expiration events
  useEffect(() => {
    const handleSessionExpired = () => {
      setShowSessionExpired(true);
    };

    window.addEventListener('session-expired', handleSessionExpired);

    return () => {
      window.removeEventListener('session-expired', handleSessionExpired);
    };
  }, []);

  const handleSessionRedirect = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  const value: ToastContextType = {
    showToast,
    success,
    error,
    warning,
    info,
    update,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      
      {/* Offline Warning Banner */}
      {isOffline && (
        <div className="fixed top-0 left-0 right-0 z-[101] bg-amber-500 text-white font-semibold text-center text-xs py-2 px-4 shadow-md flex items-center justify-center gap-2 border-b border-amber-600 select-none animate-slide-in-right">
          <ExclamationTriangleIcon className="w-4.5 h-4.5 animate-bounce" />
          <span>No Internet Connection. Trying to reconnect...</span>
        </div>
      )}

      {/* Session Expired Overlay Dialog */}
      {showSessionExpired && (
        <div className="fixed inset-0 z-[102] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-md animate-fade-in" />
          <div className="relative w-full max-w-sm bg-white dark:bg-secondary-900 border border-slate-200 dark:border-secondary-800 rounded-3xl p-6 shadow-2xl animate-confirm-zoom text-center select-none flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center text-red-500 mb-4 animate-bounce">
              <ClockIcon className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Session Expired</h3>
            <p className="text-sm text-slate-500 dark:text-secondary-400 mb-6 leading-relaxed">
              Your session has expired. Please login again.
            </p>
            <button
              onClick={handleSessionRedirect}
              className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 focus:ring-red-500 shadow-lg shadow-red-500/20 active:scale-[0.98] transition-all"
            >
              Login Again
            </button>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
};
