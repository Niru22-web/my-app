import React from 'react';

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  width,
  height,
  borderRadius,
}) => {
  const style: React.CSSProperties = {
    width: width ?? '100%',
    height: height ?? '1rem',
    borderRadius: borderRadius ?? '0.5rem',
  };

  return (
    <div
      className={`shimmer-bg bg-slate-200/60 dark:bg-slate-800/50 ${className}`}
      style={style}
    />
  );
};

export const SkeletonCircle: React.FC<SkeletonProps> = ({
  className = '',
  width = '2.5rem',
  height = '2.5rem',
}) => {
  return (
    <Skeleton
      className={className}
      width={width}
      height={height}
      borderRadius="9999px"
    />
  );
};

export const SkeletonText: React.FC<{
  lines?: number;
  className?: string;
}> = ({ lines = 3, className = '' }) => {
  return (
    <div className={`space-y-2 w-full ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height="0.75rem"
          width={i === lines - 1 && lines > 1 ? '70%' : '100%'}
        />
      ))}
    </div>
  );
};

export const TableSkeleton: React.FC<{
  rows?: number;
  cols?: number;
  className?: string;
}> = ({ rows = 5, cols = 4, className = '' }) => {
  return (
    <div className={`w-full border border-slate-100 dark:border-slate-800/40 rounded-2xl p-4 bg-white dark:bg-[#0E1626] overflow-hidden ${className}`}>
      {/* Header Row */}
      <div className="flex items-center gap-4 border-b border-slate-100 dark:border-slate-800/40 pb-4 mb-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} height="1rem" className="flex-1" />
        ))}
      </div>
      {/* Rows */}
      <div className="space-y-4">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton
                key={c}
                height="0.875rem"
                className="flex-1"
                width={c === 0 ? '40%' : '100%'}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export const CardSkeleton: React.FC<{
  className?: string;
}> = ({ className = '' }) => {
  return (
    <div className={`p-6 border border-slate-100 dark:border-slate-800/40 rounded-2xl bg-white dark:bg-[#0E1626] shadow-sm flex flex-col justify-between h-32 ${className}`}>
      <div className="flex items-center justify-between">
        <Skeleton width="40%" height="0.75rem" />
        <SkeletonCircle width="2rem" height="2rem" />
      </div>
      <div className="space-y-2 mt-4">
        <Skeleton width="60%" height="1.5rem" />
        <Skeleton width="30%" height="0.625rem" />
      </div>
    </div>
  );
};
