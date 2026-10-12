import React, { useEffect, useRef } from 'react';
import { motion, animate } from 'framer-motion';
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon
} from '@heroicons/react/24/outline';

// UI Components
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';

interface KPICardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral' | 'warning';
  icon: React.ComponentType<any>;
  color?: string;
  bg?: string;
  loading?: boolean;
}

export const AnimatedCounter: React.FC<{ value: number | string }> = ({ value }) => {
  const nodeRef = useRef<HTMLSpanElement>(null);
  
  const strVal = String(value);
  const numVal = parseFloat(strVal.replace(/[^0-9.]/g, ''));
  const prefix = strVal.match(/^[^\d]+/)?.[0] || '';
  const suffix = strVal.match(/[^\d.]+$/)?.[0] || '';
  
  useEffect(() => {
    if (isNaN(numVal)) {
      if (nodeRef.current) nodeRef.current.textContent = strVal;
      return;
    }

    const node = nodeRef.current;
    if (!node) return;

    const decimalPlaces = (strVal.split('.')[1] || '').length;

    const controls = animate(0, numVal, {
      duration: 1.0,
      ease: [0.16, 1, 0.3, 1], // Custom easeOutExpo
      onUpdate(val) {
        node.textContent = prefix + val.toFixed(decimalPlaces) + suffix;
      },
    });

    return () => controls.stop();
  }, [numVal, prefix, suffix, strVal]);

  return <span ref={nodeRef}>{value}</span>;
};

const KPICard: React.FC<KPICardProps> = ({ 
  title, 
  value, 
  change, 
  changeType = 'positive',
  icon: Icon,
  color = 'text-blue-600 dark:text-blue-400',
  bg = 'bg-blue-50 dark:bg-blue-950/35',
  loading = false 
}) => {
  const isDark = document.documentElement.classList.contains('dark');

  const getChangeColor = () => {
    switch (changeType) {
      case 'positive': return 'text-green-600 dark:text-green-400';
      case 'negative': return 'text-red-600 dark:text-red-400';
      case 'warning': return 'text-orange-600 dark:text-orange-400';
      default: return 'text-slate-600 dark:text-slate-400';
    }
  };

  const getSparklineColor = () => {
    switch (changeType) {
      case 'positive': return 'stroke-green-500';
      case 'negative': return 'stroke-red-500';
      case 'warning': return 'stroke-orange-500';
      default: return 'stroke-blue-500';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-3xl"
    >
      <Card className="p-6 h-full border border-slate-100 dark:border-slate-800/40 bg-white dark:bg-[#0E1626] transition-all duration-300 hover:shadow-[0_12px_30px_-5px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_12px_30px_-5px_rgba(0,0,0,0.35)] hover:border-blue-500/10 dark:hover:border-blue-500/20 group">
        
        {/* Decorative background sparkline */}
        <div className="absolute bottom-0 left-0 right-0 h-12 opacity-15 dark:opacity-10 pointer-events-none transition-opacity duration-300 group-hover:opacity-25">
          <svg className="w-full h-full" viewBox="0 0 100 24" preserveAspectRatio="none">
            <path
              d="M0,18 C15,16 25,6 40,14 C55,22 65,4 80,10 C90,14 95,8 100,2"
              fill="none"
              className={getSparklineColor()}
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <div className="flex items-center justify-between mb-5">
          {/* Icon wrapper with hover spin */}
          <div className={`w-12 h-12 rounded-2xl ${bg} ${color} flex items-center justify-center shadow-inner transition-transform duration-500 group-hover:scale-110 group-hover:rotate-[10deg]`}>
            {loading ? (
              <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <Icon className="w-6 h-6" />
            )}
          </div>

          {/* Badge */}
          {change && (
            <Badge 
              variant={changeType === 'warning' ? 'danger' : changeType === 'negative' ? 'danger' : 'success'}
              className="text-[10px] font-black uppercase tracking-wider px-2 py-1 border border-transparent dark:border-slate-800/30"
            >
              {change}
            </Badge>
          )}
        </div>

        {/* Content */}
        <div className="relative z-10">
          <p className="text-[11px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mb-2">{title}</p>
          <div className="text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-none">
            {loading ? (
              <div className="h-8 w-24 shimmer-bg rounded-lg"></div>
            ) : (
              <AnimatedCounter value={value} />
            )}
          </div>
        </div>

        {/* Trend Indicator */}
        {!loading && (
          <div className="flex items-center gap-1.5 mt-4 text-xs font-semibold text-slate-400 dark:text-slate-500">
            {changeType === 'positive' && (
              <>
                <motion.span
                  animate={{ y: [0, -2, 0] }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                >
                  <ArrowTrendingUpIcon className="w-4 h-4 text-green-500" />
                </motion.span>
                <span className="text-green-600 dark:text-green-400">+12%</span>
              </>
            )}
            {changeType === 'negative' && (
              <>
                <motion.span
                  animate={{ y: [0, 2, 0] }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                >
                  <ArrowTrendingDownIcon className="w-4 h-4 text-red-500" />
                </motion.span>
                <span className="text-red-600 dark:text-red-400">-5%</span>
              </>
            )}
            <span>vs last month</span>
          </div>
        )}
      </Card>
    </motion.div>
  );
};

export default KPICard;
