import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BriefcaseIcon, ChartPieIcon } from '@heroicons/react/24/outline';

interface ChartData {
  name: string;
  value: number;
  projectId: string;
  clientName?: string;
}

interface InteractivePieChartProps {
  data: ChartData[];
  title: string;
  subtitle: string;
  onSliceClick: (data: any) => void;
  loading?: boolean;
  selectedDrillDown?: { type: string; data: any };
}

const InteractivePieChart: React.FC<InteractivePieChartProps> = ({
  data,
  title,
  subtitle,
  onSliceClick,
  loading = false,
  selectedDrillDown
}) => {
  const [hoveredSlice, setHoveredSlice] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; data: ChartData } | null>(null);

  // Chart dimensions
  const width = 400;
  const height = 300;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 40;

  // Calculate pie slices
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let currentAngle = -Math.PI / 2; // Start from top

  const pieSlices = data.map((item, index) => {
    const percentage = item.value / total;
    const angle = percentage * 2 * Math.PI;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    
    // Calculate slice path
    const x1 = centerX + radius * Math.cos(startAngle);
    const y1 = centerY + radius * Math.sin(startAngle);
    const x2 = centerX + radius * Math.cos(endAngle);
    const y2 = centerY + radius * Math.sin(endAngle);
    
    // Large arc flag
    const largeArcFlag = angle > Math.PI ? 1 : 0;
    
    const pathData = [
      `M ${centerX} ${centerY}`,
      `L ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
      'Z'
    ].join(' ');

    currentAngle += angle;

    return {
      ...item,
      percentage,
      pathData,
      startAngle,
      endAngle,
      x1,
      y1,
      x2,
      y2
    };
  });

  // Color palette with tailwind classes and hex for SVG fallback if needed
  const colorPalette = [
    { name: 'blue', bg: 'bg-blue-500', fill: 'fill-blue-500', hex: '#3b82f6' },
    { name: 'emerald', bg: 'bg-emerald-500', fill: 'fill-emerald-500', hex: '#10b981' },
    { name: 'amber', bg: 'bg-amber-500', fill: 'fill-amber-500', hex: '#f59e0b' },
    { name: 'rose', bg: 'bg-rose-500', fill: 'fill-rose-500', hex: '#f43f5e' },
    { name: 'violet', bg: 'bg-violet-500', fill: 'fill-violet-500', hex: '#8b5cf6' },
    { name: 'pink', bg: 'bg-pink-500', fill: 'fill-pink-500', hex: '#ec4899' },
    { name: 'teal', bg: 'bg-teal-500', fill: 'fill-teal-500', hex: '#14b8a6' },
    { name: 'orange', bg: 'bg-orange-500', fill: 'fill-orange-500', hex: '#f97316' },
    { name: 'cyan', bg: 'bg-cyan-500', fill: 'fill-cyan-500', hex: '#06b6d4' },
    { name: 'lime', bg: 'bg-lime-500', fill: 'fill-lime-500', hex: '#84cc16' },
  ];

  const handleMouseMove = (e: React.MouseEvent<SVGElement>, chartData: ChartData) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setTooltip({
      x: x,
      y: y,
      data: chartData
    });
    setHoveredSlice(chartData.name);
  };

  const handleMouseLeave = () => {
    setTooltip(null);
    setHoveredSlice(null);
  };

  const handleSliceClick = (chartData: ChartData) => {
    onSliceClick(chartData);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-48 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-64 mb-6"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <div className="text-center py-12">
          <ChartPieIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Data Available</h3>
          <p className="text-sm text-gray-600">No project distribution data for the selected period</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8 relative flex-1 ring-1 ring-slate-200/50">
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-lg font-bold text-gray-900 mb-1">{title}</h3>
        <p className="text-sm text-gray-600">{subtitle}</p>
        {selectedDrillDown?.type === 'project' && (
          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 text-sm font-medium rounded-lg">
            <BriefcaseIcon className="w-4 h-4" />
            Filtered: {selectedDrillDown.data.name}
          </div>
        )}
      </div>

      {/* Chart Container */}
      <div className="relative">
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="overflow-visible"
        >
          {/* Pie slices */}
          <g className="pie-slices">
            {pieSlices.map((slice, index) => {
              const isHovered = hoveredSlice === slice.name;
              const isSelected = selectedDrillDown?.type === 'project' && 
                                selectedDrillDown?.data.name === slice.name;
              const colorConfig = colorPalette[index % colorPalette.length];
              
              // Calculate hover offset
              const midAngle = (slice.startAngle + slice.endAngle) / 2;
              const offsetX = isHovered ? Math.cos(midAngle) * 10 : 0;
              const offsetY = isHovered ? Math.sin(midAngle) * 10 : 0;

              return (
                <g key={slice.projectId}>
                  {/* Shadow */}
                  <path
                    d={slice.pathData}
                    fill="#000"
                    fillOpacity={isHovered ? 0.1 : 0.05}
                    transform={`translate(${offsetX + 2}, ${offsetY + 2})`}
                  />
                  
                  {/* Main slice */}
                  <path
                    d={slice.pathData}
                    fill={colorConfig.hex}
                    fillOpacity={isHovered ? 0.9 : 0.8}
                    stroke={isSelected ? colorConfig.hex : '#fff'}
                    strokeWidth={isSelected ? 3 : 2}
                    className={`cursor-pointer transition-all duration-200 ${isHovered ? 'brightness-110' : ''}`}
                    transform={`translate(${offsetX}, ${offsetY})`}
                    onMouseMove={(e) => handleMouseMove(e, slice)}
                    onMouseLeave={handleMouseLeave}
                    onClick={() => handleSliceClick(slice)}
                  />

                  {/* Percentage label */}
                  {slice.percentage > 0.05 && (
                    <text
                      x={centerX + Math.cos(midAngle) * (radius * 0.7) + offsetX}
                      y={centerY + Math.sin(midAngle) * (radius * 0.7) + offsetY}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="text-sm font-bold fill-white"
                    >
                      {(slice.percentage * 100).toFixed(1)}%
                    </text>
                  )}
                </g>
              );
            })}
          </g>

          {/* Center circle (donut effect) */}
          <circle
            cx={centerX}
            cy={centerY}
            r={radius * 0.3}
            fill="white"
            stroke="#f3f4f6"
            strokeWidth="2"
          />

          {/* Center text */}
          <text
            x={centerX}
            y={centerY}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-lg font-bold fill-gray-900"
          >
            {total.toFixed(0)}h
          </text>
          <text
            x={centerX}
            y={centerY + 15}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-xs fill-gray-500"
          >
            Total Hours
          </text>
        </svg>

        <AnimatePresence>
          {tooltip && (
            <motion.div
              initial={{ opacity: 0, y: 10, x: '-50%' }}
              animate={{ 
                opacity: 1, 
                y: 0, 
                x: '-50%',
                left: tooltip.x,
                top: tooltip.y - 40
              }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute bg-slate-900 text-white px-3 py-2 rounded-xl shadow-2xl pointer-events-none z-50 border border-slate-700/50 backdrop-blur-md"
            >
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{tooltip.data.name}</div>
              <div className="text-sm font-[1000]">{tooltip.data.value.toFixed(1)} <span className="text-[10px] text-slate-400 font-bold">HOURS</span></div>
              <div className="text-[10px] text-slate-400 font-bold mt-1">{(tooltip.data.value / total * 100).toFixed(1)}% OF TOTAL</div>
              <div className="absolute w-2 h-2 bg-slate-900 border-r border-b border-slate-700/50 transform rotate-45 -bottom-1 left-1/2 -translate-x-1/2"></div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Legend */}
      <div className="mt-6 space-y-2">
        {pieSlices.slice(0, 6).map((slice, index) => {
          return (
            <div
              key={slice.projectId}
              className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                hoveredSlice === slice.name ? 'bg-gray-50' : ''
              }`}
              onMouseEnter={() => setHoveredSlice(slice.name)}
              onMouseLeave={() => setHoveredSlice(null)}
              onClick={() => handleSliceClick(slice)}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-3 h-3 rounded-full ${colorPalette[index % colorPalette.length].bg}`}
                ></div>
                <span className="text-sm font-medium text-gray-700">
                  {slice.name.length > 20 ? slice.name.substring(0, 20) + '...' : slice.name}
                </span>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-gray-900">
                  {slice.value.toFixed(1)}h
                </div>
                <div className="text-xs text-gray-500">
                  {(slice.percentage * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          );
        })}
        
        {pieSlices.length > 6 && (
          <div className="text-center pt-2">
            <span className="text-xs text-gray-500">
              +{pieSlices.length - 6} more projects
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default InteractivePieChart;
