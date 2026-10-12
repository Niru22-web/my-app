import React from 'react';
import { 
  ClockIcon, 
  UserGroupIcon, 
  BriefcaseIcon, 
  DocumentTextIcon 
} from '@heroicons/react/24/outline';
import { AnimatedCounter } from '../KPICard';

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  color: 'primary' | 'indigo' | 'emerald' | 'amber';
  loading?: boolean;
}

const KPICard: React.FC<KPICardProps> = ({ 
  title, 
  value, 
  subtitle, 
  color, 
  loading = false 
}) => {
  const colorClasses = {
    primary: {
      bg: 'bg-primary-50',
      text: 'text-primary-600',
      iconBg: 'bg-primary-100',
    },
    indigo: {
      bg: 'bg-indigo-50',
      text: 'text-indigo-600',
      iconBg: 'bg-indigo-100',
    },
    emerald: {
      bg: 'bg-emerald-50',
      text: 'text-emerald-600',
      iconBg: 'bg-emerald-100',
    },
    amber: {
      bg: 'bg-amber-50',
      text: 'text-amber-600',
      iconBg: 'bg-amber-100',
    }
  };

  const getIcon = () => {
    switch (color) {
      case 'primary': return <ClockIcon className="w-5 h-5" />;
      case 'indigo': return <UserGroupIcon className="w-5 h-5" />;
      case 'emerald': return <BriefcaseIcon className="w-5 h-5" />;
      case 'amber': return <DocumentTextIcon className="w-5 h-5" />;
      default: return <ClockIcon className="w-5 h-5" />;
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-secondary-100 p-6 animate-pulse h-32">
        <div className="h-4 bg-secondary-100 rounded w-24 mb-4"></div>
        <div className="h-8 bg-secondary-100 rounded w-16"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-secondary-100 p-6 hover:shadow-md transition-all duration-300 group flex flex-col justify-between h-32">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-black text-secondary-400 uppercase tracking-[0.15em] mb-1">
            {title}
          </p>
          <p className="text-2xl font-black text-secondary-900 tabular-nums leading-none">
            <AnimatedCounter value={value} />
          </p>
        </div>
        <div className={`p-2.5 ${colorClasses[color].bg} ${colorClasses[color].text} rounded-lg`}>
          {getIcon()}
        </div>
      </div>
      {subtitle && (
        <p className="text-xs font-bold text-secondary-400 mt-2 truncate">
          {subtitle}
        </p>
      )}
    </div>
  );
};

interface KPIGridProps {
  data: {
    totalHours: number;
    totalEmployees: number;
    totalProjects: number;
    pendingTimesheets: number;
  };
  loading?: boolean;
}

const KPIGrid: React.FC<KPIGridProps> = ({ data, loading }) => {
  const kpiData = [
    {
      title: 'Total Hours Logged',
      value: data.totalHours.toFixed(1),
      subtitle: 'Recorded effort this period',
      color: 'primary' as const
    },
    {
      title: 'Total Employees',
      value: data.totalEmployees,
      subtitle: 'Contributing personnel',
      color: 'indigo' as const
    },
    {
      title: 'Total Projects',
      value: data.totalProjects,
      subtitle: 'Active engagements',
      color: 'emerald' as const
    },
    {
      title: 'Pending Timesheets',
      value: data.pendingTimesheets,
      subtitle: 'Awaiting approval',
      color: 'amber' as const
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {kpiData.map((kpi, index) => (
        <KPICard
          key={index}
          title={kpi.title}
          value={kpi.value}
          subtitle={kpi.subtitle}
          color={kpi.color}
          loading={loading}
        />
      ))}
    </div>
  );
};

export { KPICard, KPIGrid };
export default KPIGrid;
