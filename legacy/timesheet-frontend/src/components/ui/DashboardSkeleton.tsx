import React from 'react';

interface DashboardSkeletonProps {
  className?: string;
}

export const DashboardSkeleton: React.FC<DashboardSkeletonProps> = ({ className = '' }) => {
  return (
    <div className={`p-6 space-y-8 animate-fade-in ${className}`}>
      {/* Title Block */}
      <div className="space-y-2 w-full max-w-lg">
        <div className="h-9 w-2/3 bg-secondary-200/80 dark:bg-slate-800 rounded-2xl animate-pulse" />
        <div className="h-4 w-5/6 bg-secondary-100 dark:bg-slate-800/60 rounded-lg animate-pulse" />
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-6 bg-white dark:bg-slate-900 border border-secondary-200 dark:border-slate-800 rounded-3xl shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <div className="h-4 w-1/2 bg-secondary-200 dark:bg-slate-800 rounded-lg animate-pulse" />
              <div className="w-8 h-8 rounded-full bg-secondary-100 dark:bg-slate-800/60 animate-pulse" />
            </div>
            <div className="h-8 w-2/3 bg-secondary-200/90 dark:bg-slate-800 rounded-xl animate-pulse" />
            <div className="h-3.5 w-3/4 bg-secondary-100 dark:bg-slate-800/50 rounded-lg animate-pulse" />
          </div>
        ))}
      </div>

      {/* Charts / Two Column Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-6 bg-white dark:bg-slate-900 border border-secondary-200 dark:border-slate-800 rounded-3xl shadow-sm space-y-4">
          <div className="h-5 w-1/4 bg-secondary-200 dark:bg-slate-800 rounded-lg animate-pulse" />
          <div className="h-[280px] w-full bg-secondary-100/60 dark:bg-slate-800/40 rounded-2xl animate-pulse" />
        </div>
        <div className="p-6 bg-white dark:bg-slate-900 border border-secondary-200 dark:border-slate-800 rounded-3xl shadow-sm space-y-4">
          <div className="h-5 w-1/3 bg-secondary-200 dark:bg-slate-800 rounded-lg animate-pulse" />
          <div className="h-[280px] w-full bg-secondary-100/60 dark:bg-slate-800/40 rounded-2xl animate-pulse" />
        </div>
      </div>

      {/* Recent Items Table */}
      <div className="p-6 bg-white dark:bg-slate-900 border border-secondary-200 dark:border-slate-800 rounded-3xl shadow-sm space-y-4">
        <div className="h-5 w-1/5 bg-secondary-200 dark:bg-slate-800 rounded-lg animate-pulse" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-4 py-2 border-b border-secondary-100 dark:border-slate-800/60 items-center">
              <div className="w-10 h-10 rounded-full bg-secondary-200 dark:bg-slate-800 animate-pulse" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-1/3 bg-secondary-200 dark:bg-slate-800 rounded-lg animate-pulse" />
                <div className="h-3 w-1/4 bg-secondary-100 dark:bg-slate-800/60 rounded-lg animate-pulse" />
              </div>
              <div className="h-4 w-20 bg-secondary-200 dark:bg-slate-800 rounded-lg animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DashboardSkeleton;
