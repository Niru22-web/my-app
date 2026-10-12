import React from 'react';

export interface ASALoaderProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  text?: string;
  fullPage?: boolean;
  className?: string;
}

export const ASALoader: React.FC<ASALoaderProps> = ({
  size = 'md',
  text,
  fullPage = false,
  className = ''
}) => {
  // Sizes mapping
  const sizeClasses = {
    xs: {
      container: 'w-4 h-4',
      logo: 'hidden',
      border: 'border-2'
    },
    sm: {
      container: 'w-8 h-8',
      logo: 'text-[7px] font-black tracking-tighter',
      border: 'border-2'
    },
    md: {
      container: 'w-14 h-14',
      logo: 'text-[10px] font-black tracking-tighter',
      border: 'border-[3px]'
    },
    lg: {
      container: 'w-20 h-20',
      logo: 'text-sm font-black tracking-tight',
      border: 'border-4'
    },
    xl: {
      container: 'w-28 h-28',
      logo: 'text-lg font-black tracking-tight',
      border: 'border-4'
    }
  };

  const selected = sizeClasses[size];

  const loaderContent = (
    <div className={`inline-flex ${text ? 'flex-col gap-4' : 'flex-row gap-2'} items-center justify-center ${className}`}>
      {/* Circular animated loader with center static ASA text */}
      <div className={`relative flex items-center justify-center ${selected.container}`}>
        {/* Outer Rotating Gradient Ring */}
        <div className={`absolute inset-0 rounded-full ${selected.border} border-transparent border-t-indigo-600 border-r-primary-500 animate-spin`} />
        <div 
          className={`absolute inset-0.5 rounded-full ${selected.border} border-transparent border-b-primary-500 border-l-indigo-600 animate-spin-reverse-custom`} 
        />
        
        {/* Inner Static Center with Brand ASA */}
        <div className="absolute inset-2 bg-white/90 dark:bg-slate-900/90 rounded-full flex flex-col items-center justify-center shadow-inner backdrop-blur-md">
          <span className={`font-black bg-gradient-to-r from-primary-600 to-indigo-600 dark:from-primary-400 dark:to-indigo-400 bg-clip-text text-transparent uppercase ${selected.logo}`}>
            ASA
          </span>
        </div>
      </div>

      {text && (
        <p className="text-sm font-semibold tracking-wide text-secondary-600 dark:text-secondary-300 animate-pulse">
          {text}
        </p>
      )}
    </div>
  );

  if (fullPage) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/60 dark:bg-slate-900/60 backdrop-blur-md animate-fade-in">
        {loaderContent}
      </div>
    );
  }

  return loaderContent;
};

export default ASALoader;
