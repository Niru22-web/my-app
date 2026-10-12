import React from 'react';
import TableSkeleton from './TableSkeleton';

interface PageSkeletonProps {
  title?: boolean;
  actions?: boolean;
  tableRows?: number;
  tableCols?: number;
  className?: string;
}

export const PageSkeleton: React.FC<PageSkeletonProps> = ({
  title = true,
  actions = true,
  tableRows = 6,
  tableCols = 5,
  className = ''
}) => {
  return (
    <div className={`p-6 space-y-8 animate-fade-in ${className}`}>
      {/* Header Block */}
      {(title || actions) && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          {title && (
            <div className="space-y-2 w-full max-w-md">
              <div className="h-9 w-2/3 bg-secondary-200 dark:bg-slate-800 rounded-2xl animate-pulse" />
              <div className="h-4 w-full bg-secondary-100 dark:bg-slate-800/60 rounded-lg animate-pulse" />
            </div>
          )}
          {actions && (
            <div className="flex gap-3">
              <div className="h-11 w-32 bg-secondary-200 dark:bg-slate-800 rounded-2xl animate-pulse" />
              <div className="h-11 w-24 bg-secondary-100 dark:bg-slate-800/60 rounded-2xl animate-pulse" />
            </div>
          )}
        </div>
      )}

      {/* Content Block */}
      <TableSkeleton rows={tableRows} columns={tableCols} />
    </div>
  );
};

export default PageSkeleton;
