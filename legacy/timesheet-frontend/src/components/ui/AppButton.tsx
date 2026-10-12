import React, { ButtonHTMLAttributes } from 'react';

export interface AppButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning' | 'info' | 'ghost' | 'glass';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

export const AppButton: React.FC<AppButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center rounded-xl font-bold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98] border border-transparent shadow-sm cursor-pointer';

  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-755 hover:shadow-indigo-500/10 focus:ring-indigo-500 dark:bg-indigo-600 dark:hover:bg-indigo-700',
    secondary: 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:text-slate-900 focus:ring-slate-200 dark:bg-secondary-800 dark:text-secondary-300 dark:border-secondary-750 dark:hover:bg-secondary-750',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 hover:shadow-rose-500/10 focus:ring-rose-500',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow-emerald-500/10 focus:ring-emerald-500',
    warning: 'bg-amber-500 text-white hover:bg-amber-600 hover:shadow-amber-500/10 focus:ring-amber-500',
    info: 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-500/10 focus:ring-blue-500',
    ghost: 'bg-transparent text-slate-500 hover:bg-slate-100/50 hover:text-slate-800 focus:ring-slate-100 dark:text-secondary-400 dark:hover:bg-secondary-800/40 dark:hover:text-white shadow-none border-none',
    glass: 'bg-white/10 text-white border-white/20 backdrop-blur-md hover:bg-white/20 focus:ring-white/50 dark:bg-secondary-900/30 dark:border-secondary-850 dark:hover:bg-secondary-800/40 shadow-none',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-[11px] leading-4 gap-1.5 rounded-lg',
    md: 'px-4 py-2 text-xs leading-5 gap-2',
    lg: 'px-6 py-3 text-sm leading-6 gap-2.5',
    icon: 'p-2 rounded-xl flex items-center justify-center shrink-0 w-8 h-8',
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={isLoading || disabled}
      {...props}
    >
      {isLoading ? (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      ) : (
        <>
          {leftIcon && <span className="flex items-center shrink-0">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="flex items-center shrink-0">{rightIcon}</span>}
        </>
      )}
    </button>
  );
};

export default AppButton;
