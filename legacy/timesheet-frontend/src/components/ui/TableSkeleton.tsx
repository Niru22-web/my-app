import React from 'react';

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  className?: string;
}

const getHeaderDelayClass = (index: number) => {
  const delays = [
    'animation-delay-0',
    'animation-delay-100',
    'animation-delay-200',
    'animation-delay-300',
    'animation-delay-400',
    'animation-delay-500',
    'animation-delay-600',
    'animation-delay-700',
    'animation-delay-800'
  ];
  return delays[index % delays.length];
};

const getBodyDelayClass = (i: number, j: number) => {
  const index = i + j;
  const delays = [
    'animation-delay-0',
    'animation-delay-80',
    'animation-delay-160',
    'animation-delay-240',
    'animation-delay-320',
    'animation-delay-400',
    'animation-delay-480',
    'animation-delay-560',
    'animation-delay-640',
    'animation-delay-720',
    'animation-delay-800'
  ];
  return delays[index % delays.length];
};

export const TableSkeleton: React.FC<TableSkeletonProps> = ({
  rows = 5,
  columns = 5,
  className = ''
}) => {
  return (
    <div className={`w-full overflow-hidden border border-secondary-200 dark:border-slate-800 rounded-3xl bg-white dark:bg-slate-900 shadow-sm ${className}`}>
      {/* Table Header skeleton */}
      <div className="bg-secondary-50/50 dark:bg-slate-850/40 border-b border-secondary-100 dark:border-slate-800 p-5">
        <div className="flex gap-6">
          {Array.from({ length: columns }).map((_, i) => (
            <div 
              key={i} 
              className={`h-4 bg-secondary-200/80 dark:bg-slate-800 rounded-lg animate-pulse flex-1 ${
                i === 0 ? 'max-w-[120px]' : i === columns - 1 ? 'max-w-[100px]' : 'max-w-[150px]'
              } ${getHeaderDelayClass(i)}`}
            />
          ))}
        </div>
      </div>
      {/* Table Body skeleton */}
      <div className="divide-y divide-secondary-100 dark:divide-slate-800/80">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="p-5 flex gap-6 items-center">
            {Array.from({ length: columns }).map((_, j) => (
              <div 
                key={j} 
                className={`h-4 bg-secondary-100/60 dark:bg-slate-800/50 rounded-lg animate-pulse flex-1 ${getBodyDelayClass(i, j)}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TableSkeleton;
