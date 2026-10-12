import React from 'react';
import { ToggleLeft, ToggleRight } from 'lucide-react';

export interface AppToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  subLabel?: string;
  className?: string;
}

export const AppToggle: React.FC<AppToggleProps> = ({
  checked,
  onChange,
  disabled = false,
  label,
  subLabel,
  className = '',
}) => {
  return (
    <div className={`flex items-center justify-between py-2.5 ${className}`}>
      {(label || subLabel) && (
        <div className="flex flex-col">
          {label && <span className="text-xs font-bold text-slate-800 dark:text-secondary-200">{label}</span>}
          {subLabel && <span className="text-[10px] text-slate-400 dark:text-secondary-500">{subLabel}</span>}
        </div>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className="bg-transparent border-none cursor-pointer flex items-center p-0.5 rounded-lg focus:outline-none transition-all disabled:opacity-50 select-none shrink-0"
        aria-label={label || "Toggle status"}
      >
        {checked ? (
          <ToggleRight className="w-8 h-8 text-indigo-600 hover:scale-105 active:scale-95 transition-transform" />
        ) : (
          <ToggleLeft className="w-8 h-8 text-slate-350 dark:text-slate-650 hover:scale-105 active:scale-95 transition-transform" />
        )}
      </button>
    </div>
  );
};

export default AppToggle;
