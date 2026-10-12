import React from 'react';

interface CardSkeletonProps {
  className?: string;
}

export const CardSkeleton: React.FC<CardSkeletonProps> = ({ className = '' }) => {
  return (
    <div className={`p-6 bg-white dark:bg-slate-900 border border-secondary-200 dark:border-slate-800 rounded-3xl shadow-sm flex flex-col gap-4 ${className}`}>
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-secondary-200 dark:bg-slate-800 animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-1/2 bg-secondary-200 dark:bg-slate-800 rounded-lg animate-pulse" />
          <div className="h-3 w-1/3 bg-secondary-100 dark:bg-slate-800/60 rounded-lg animate-pulse" />
        </div>
      </div>
      <div className="space-y-2.5">
        <div className="h-3 w-full bg-secondary-100/80 dark:bg-slate-800/55 rounded-lg animate-pulse" />
        <div className="h-3 w-5/6 bg-secondary-100/80 dark:bg-slate-800/55 rounded-lg animate-pulse" />
        <div className="h-3 w-2/3 bg-secondary-100/80 dark:bg-slate-800/55 rounded-lg animate-pulse" />
      </div>
      <div className="flex gap-3 pt-2">
        <div className="h-9 w-24 bg-secondary-200/80 dark:bg-slate-800 rounded-xl animate-pulse" />
        <div className="h-9 w-24 bg-secondary-100/60 dark:bg-slate-800/60 rounded-xl animate-pulse" />
      </div>
    </div>
  );
};

export default CardSkeleton;
