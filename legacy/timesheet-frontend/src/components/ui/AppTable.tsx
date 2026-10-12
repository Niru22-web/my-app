import React from 'react';
import { ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import ASALoader from './ASALoader';

export interface AppTableColumn<T> {
  key: string;
  title: string;
  render?: (row: T, index: number) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

export interface AppTableProps<T> {
  columns: AppTableColumn<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  pagination?: {
    page: number;
    pages: number;
    total: number;
    onPageChange: (page: number) => void;
  };
}

export function AppTable<T>({
  columns,
  data,
  loading = false,
  emptyMessage = 'No records found',
  pagination,
}: AppTableProps<T>) {
  return (
    <div className="bg-white dark:bg-secondary-900 border border-slate-100 dark:border-secondary-800 rounded-3xl shadow-sm overflow-hidden flex flex-col">
      {/* Table Scroll Area */}
      <div className="overflow-x-auto relative min-h-[200px] app-scrollbar">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 dark:bg-secondary-900/60 z-10">
            <ASALoader size="md" />
          </div>
        )}

        {data.length === 0 && !loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-secondary-500">
            <AlertCircle className="w-10 h-10 opacity-30 text-indigo-500" />
            <p className="font-bold text-xs text-slate-700 dark:text-white">{emptyMessage}</p>
            <p className="text-[10px] text-slate-450 dark:text-secondary-400">Try adjusting your filters or add a new entry.</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-slate-50/75 dark:bg-secondary-850/20 border-b border-slate-100 dark:border-secondary-800 sticky top-0 z-5 select-none">
              <tr>
                {columns.map((col, idx) => {
                  const headerProps = col.width ? { style: { width: col.width } } : {};
                  return (
                    <th
                      key={col.key || idx}
                      className={`px-5 py-4 font-black uppercase tracking-wider text-slate-500 dark:text-secondary-400 ${
                        col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'
                      }`}
                      {...headerProps}
                    >
                      {col.title}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/50 dark:divide-secondary-800/40">
              {data.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className="even:bg-slate-50/20 dark:even:bg-secondary-850/5 group hover:bg-slate-50/50 dark:hover:bg-secondary-800/10 transition-colors duration-150"
                >
                  {columns.map((col, colIdx) => (
                    <td
                      key={col.key || colIdx}
                      className={`px-5 py-3.5 text-slate-700 dark:text-secondary-300 font-semibold align-middle ${
                        col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'
                      }`}
                    >
                      {col.render ? col.render(row, rowIdx) : ((row as Record<string, unknown>)[col.key] as React.ReactNode) || '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Bar */}
      {pagination && pagination.pages > 1 && (
        <div className="px-5 py-4 border-t border-slate-100 dark:border-secondary-800 flex items-center justify-between bg-slate-50/30 dark:bg-secondary-950/10">
          <span className="text-[10px] text-slate-400 dark:text-secondary-550 font-bold">
            Showing page {pagination.page} of {pagination.pages} &bull; {pagination.total} entries
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-secondary-750 bg-white dark:bg-secondary-800 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-secondary-700 transition-colors cursor-pointer disabled:cursor-not-allowed text-slate-500"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            {Array.from({ length: pagination.pages }).map((_, i) => {
              const p = i + 1;
              return (
                <button
                  key={p}
                  onClick={() => pagination.onPageChange(p)}
                  className={`w-7.5 h-7.5 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer border-none ${
                    p === pagination.page
                      ? 'bg-indigo-650 text-white shadow-sm shadow-indigo-650/20'
                      : 'bg-transparent text-slate-500 hover:bg-slate-100 dark:hover:bg-secondary-800'
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.pages}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-secondary-750 bg-white dark:bg-secondary-800 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-secondary-700 transition-colors cursor-pointer disabled:cursor-not-allowed text-slate-500"
              aria-label="Next page"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AppTable;
