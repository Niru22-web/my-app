import React, { SelectHTMLAttributes } from 'react';

export interface AppDropdownProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options?: { value: string | number; label: string }[];
  containerClassName?: string;
}

export const AppDropdown: React.FC<AppDropdownProps> = ({
  label,
  id,
  error,
  options,
  children,
  containerClassName = '',
  className = '',
  ...props
}) => {
  const baseSelectStyles = 'w-full px-3 py-2.5 text-xs bg-gray-50 dark:bg-secondary-800 border border-gray-200 dark:border-secondary-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white font-semibold transition-all duration-200 cursor-pointer appearance-none';
  const errorStyles = error ? 'border-rose-500 focus:ring-rose-500/20' : '';

  return (
    <div className={`space-y-1.5 w-full ${containerClassName}`}>
      {label && (
        <label htmlFor={id} className="text-[10px] font-black uppercase tracking-wider text-gray-400 dark:text-secondary-400 block ml-0.5">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={id}
          className={`${baseSelectStyles} ${errorStyles} ${className}`}
          {...props}
        >
          {options
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        
        {/* Custom Arrow Indicator */}
        <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none flex items-center">
          <svg className="w-4 h-4 fill-none stroke-current" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </div>
      {error && (
        <p className="text-[10px] text-rose-500 font-bold ml-1 mt-0.5">
          {error}
        </p>
      )}
    </div>
  );
};

export default AppDropdown;
