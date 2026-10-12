import React from 'react';

export interface AppCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const AppCard: React.FC<AppCardProps> = ({
  children,
  className = '',
  onClick,
}) => {
  const isClickable = !!onClick;
  
  return (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-secondary-900 border border-slate-100 dark:border-secondary-800 rounded-3xl shadow-sm p-5 transition-all duration-200 ${
        isClickable 
          ? 'cursor-pointer hover:shadow-md hover:border-slate-200 dark:hover:border-secondary-700 active:scale-[0.99]' 
          : ''
      } ${className}`}
    >
      {children}
    </div>
  );
};

export default AppCard;
