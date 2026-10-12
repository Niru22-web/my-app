import React, { useState } from 'react';
import DashboardHeader from './DashboardHeader';
import Sidebar from './Sidebar';

interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ 
  children, 
  title, 
  subtitle 
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-brand-royal">
      {/* Fixed Sidebar - Collapsed default width */}
      <div className="h-full w-16 flex-shrink-0 relative z-50">
        <Sidebar 
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
      </div>

      {/* Main Content Area - Gets remaining space */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0 bg-brand-royal">
        {/* Fixed Header */}
        <div className="flex-shrink-0 z-40 bg-brand-royal">
          <DashboardHeader
            title={title}
            subtitle={subtitle}
            onMenuToggle={() => setIsSidebarOpen(!isSidebarOpen)}
          />
        </div>

        {/* Scrollable Content Area - Full width available */}
        <main className="flex-1 overflow-auto bg-gray-50 dark:bg-[#0F172A] rounded-tl-[32px] border-t border-l border-white/5 dark:border-slate-800/50 shadow-[-8px_-8px_20px_rgba(0,0,0,0.15)]">
          <div className="p-4 sm:p-6 lg:p-8 max-w-none mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
