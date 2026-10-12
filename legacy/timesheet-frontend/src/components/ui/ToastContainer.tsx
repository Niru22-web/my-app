import React, { useState, useEffect, useRef } from 'react';
import { 
  CheckCircleIcon, 
  ExclamationTriangleIcon, 
  InformationCircleIcon, 
  XMarkIcon,
  XCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon
} from '@heroicons/react/24/outline';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  details?: string;
}

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

const ToastItem: React.FC<{ toast: Toast; onRemove: () => void }> = ({ toast, onRemove }) => {
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(100);
  const [showDetails, setShowDetails] = useState(false);
  const timerRef = useRef<number | null>(null);
  const onRemoveRef = useRef(onRemove);

  // Keep onRemoveRef updated
  useEffect(() => {
    onRemoveRef.current = onRemove;
  }, [onRemove]);

  const duration = toast.duration !== undefined ? toast.duration : (toast.type === 'error' ? 6500 : 4000);

  useEffect(() => {
    if (duration === 0) return;
    if (paused) return;

    const totalSteps = 200;
    const intervalTime = duration / totalSteps;

    timerRef.current = window.setInterval(() => {
      setProgress((prev) => {
        if (prev <= 0.5) {
          return 0;
        }
        return prev - (100 / totalSteps);
      });
    }, intervalTime);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [paused, duration]);

  useEffect(() => {
    if (progress <= 0) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      onRemoveRef.current();
    }
  }, [progress]);

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return (
          <div className="flex-shrink-0 text-emerald-500 dark:text-emerald-400">
            <CheckCircleIcon className="w-5 h-5 animate-bounce" />
          </div>
        );
      case 'error':
        return (
          <div className="flex-shrink-0 text-red-500 dark:text-red-400">
            <XCircleIcon className="w-5 h-5" />
          </div>
        );
      case 'warning':
        return (
          <div className="flex-shrink-0 text-amber-500 dark:text-amber-400">
            <ExclamationTriangleIcon className="w-5 h-5 animate-pulse" />
          </div>
        );
      case 'info':
      default:
        return (
          <div className="flex-shrink-0 text-indigo-500 dark:text-indigo-400">
            <InformationCircleIcon className="w-5 h-5" />
          </div>
        );
    }
  };

  const getCardStyles = () => {
    switch (toast.type) {
      case 'success':
        return 'bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 border-emerald-500/20 text-emerald-900 dark:text-emerald-300 shadow-emerald-500/5';
      case 'error':
        return 'bg-gradient-to-r from-rose-50 to-red-50 dark:from-rose-950/20 dark:to-red-950/20 border-red-500/20 text-red-900 dark:text-red-300 shadow-red-500/5 animate-shake';
      case 'warning':
        return 'bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border-amber-500/20 text-amber-900 dark:text-amber-300 shadow-amber-500/5';
      case 'info':
      default:
        return 'bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/20 dark:to-blue-950/20 border-indigo-500/20 text-indigo-900 dark:text-indigo-300 shadow-indigo-500/5';
    }
  };

  const getProgressBarColor = () => {
    switch (toast.type) {
      case 'success':
        return 'bg-gradient-to-r from-emerald-400 to-teal-500';
      case 'error':
        return 'bg-gradient-to-r from-rose-400 to-red-500';
      case 'warning':
        return 'bg-gradient-to-r from-amber-400 to-orange-500';
      case 'info':
      default:
        return 'bg-gradient-to-r from-indigo-400 to-blue-500';
    }
  };

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={`
        relative overflow-hidden flex flex-col p-4 rounded-2xl border backdrop-blur-md shadow-lg w-full max-w-sm sm:max-w-md
        transition-all duration-300 ease-in-out hover:scale-[1.01] hover:shadow-xl active:scale-[0.99]
        animate-slide-in-right
        ${getCardStyles()}
      `}
    >
      <div className="flex items-start">
        {/* Type Icon */}
        <div className="mr-3 mt-0.5">{getIcon()}</div>

        {/* Message Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-relaxed break-words pr-2">
            {toast.message}
          </p>

          {/* Action trigger button */}
          {toast.action && (
            <button
              onClick={toast.action.onClick}
              className="mt-2.5 px-3 py-1 bg-white/70 hover:bg-white dark:bg-black/20 dark:hover:bg-black/35 rounded-lg border border-black/5 dark:border-white/5 text-xs font-bold transition-all shadow-sm active:scale-95"
            >
              {toast.action.label}
            </button>
          )}

          {/* Error Details toggle */}
          {toast.details && (
            <div className="mt-2">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider opacity-60 hover:opacity-100 transition-opacity"
              >
                {showDetails ? (
                  <>
                    Hide details <ChevronUpIcon className="w-3 h-3" />
                  </>
                ) : (
                  <>
                    Show details <ChevronDownIcon className="w-3 h-3" />
                  </>
                )}
              </button>
              {showDetails && (
                <div className="mt-2 p-2 bg-black/5 dark:bg-black/25 rounded-lg border border-black/5 dark:border-white/5 text-[10px] font-mono whitespace-pre-wrap max-h-28 overflow-y-auto leading-relaxed select-text">
                  {toast.details}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Dismiss Button */}
        <div className="flex-shrink-0 ml-2">
          <button
            onClick={onRemove}
            className="inline-flex p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors duration-200 focus:outline-none"
            aria-label="Dismiss notification"
          >
            <XMarkIcon className="w-4 h-4 opacity-50 hover:opacity-100" />
          </button>
        </div>
      </div>

      {/* Progress Bar Timer */}
      {duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/5 dark:bg-white/5">
          <div
            className={`h-full ${getProgressBarColor()}`}
            {...{
              style: {
                width: `${progress}%`,
                transition: paused ? 'none' : 'width 100ms linear'
              }
            }}
          />
        </div>
      )}
    </div>
  );
};

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onRemove }) => {
  return (
    <div 
      className="fixed z-[9999] pointer-events-none select-none flex flex-col gap-3 max-h-screen overflow-hidden
        /* Desktop: top-right */
        sm:top-20 sm:right-4 sm:bottom-auto sm:left-auto sm:max-w-md sm:p-0
        /* Mobile: bottom-center stack */
        bottom-4 left-4 right-4 top-auto max-w-none p-1 pointer-events-auto"
    >
      <div className="pointer-events-auto flex flex-col gap-2.5">
        {toasts.map((toast) => (
          <ToastItem 
            key={toast.id} 
            toast={toast} 
            onRemove={() => onRemove(toast.id)} 
          />
        ))}
      </div>
    </div>
  );
};

export default ToastContainer;
