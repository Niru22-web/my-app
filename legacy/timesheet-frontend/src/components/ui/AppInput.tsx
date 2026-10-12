import React, { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from 'react';

export interface AppInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string;
  id?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  multiline?: boolean;
  rows?: number;
  containerClassName?: string;
  textareaProps?: TextareaHTMLAttributes<HTMLTextAreaElement>;
  onChange?: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

export const AppInput = forwardRef<HTMLInputElement | HTMLTextAreaElement, AppInputProps>(({
  label,
  id,
  error,
  leftIcon,
  rightIcon,
  multiline = false,
  rows = 3,
  containerClassName = '',
  className = '',
  textareaProps,
  onChange,
  type = 'text',
  ...props
}, ref) => {
  
  const baseInputStyles = 'w-full px-4 py-2.5 text-xs bg-gray-50 dark:bg-secondary-800 border border-gray-200 dark:border-secondary-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white font-semibold transition-all duration-200 placeholder-gray-400 dark:placeholder-secondary-500';
  const errorStyles = error ? 'border-rose-500 focus:ring-rose-500/20' : '';
  const paddingStyles = `${leftIcon ? 'pl-10' : ''} ${rightIcon ? 'pr-10' : ''}`;

  return (
    <div className={`space-y-1.5 w-full ${containerClassName}`}>
      {label && (
        <label htmlFor={id} className="text-[10px] font-black uppercase tracking-wider text-gray-400 dark:text-secondary-400 block ml-0.5">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {leftIcon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none flex items-center shrink-0">
            {leftIcon}
          </div>
        )}
        
        {multiline ? (
          <textarea
            ref={ref as React.ForwardedRef<HTMLTextAreaElement>}
            id={id}
            rows={rows}
            onChange={onChange as React.ChangeEventHandler<HTMLTextAreaElement>}
            className={`${baseInputStyles} ${errorStyles} ${paddingStyles} resize-none ${className}`}
            {...(props as unknown as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
            {...textareaProps}
          />
        ) : (
          <input
            ref={ref as React.ForwardedRef<HTMLInputElement>}
            id={id}
            type={type}
            onChange={onChange as React.ChangeEventHandler<HTMLInputElement>}
            className={`${baseInputStyles} ${errorStyles} ${paddingStyles} ${className}`}
            {...props}
          />
        )}

        {rightIcon && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none flex items-center shrink-0">
            {rightIcon}
          </div>
        )}
      </div>
      {error && (
        <p className="text-[10px] text-rose-500 font-bold ml-1 mt-0.5">
          {error}
        </p>
      )}
    </div>
  );
});

AppInput.displayName = 'AppInput';

export default AppInput;
