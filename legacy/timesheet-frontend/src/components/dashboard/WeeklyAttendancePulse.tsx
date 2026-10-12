import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell, TooltipProps
} from 'recharts';
import { Clock, TrendingUp, AlertCircle, Calendar } from 'lucide-react';
import API from '../../api';
import Button from '../ui/Button';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white p-4 rounded-2xl shadow-2xl border border-slate-100 backdrop-blur-md bg-white/90">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{data.day} Details</p>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-8">
            <span className="text-xs font-bold text-slate-500">Status</span>
            <span className={`text-xs font-black uppercase ${
              data.status === 'Present' ? 'text-emerald-500' : 
              data.status === 'Late' ? 'text-amber-500' : 'text-rose-500'
            }`}>{data.status}</span>
          </div>
          {data.status !== 'Absent' && (
            <>
              <div className="flex items-center justify-between gap-8">
                <span className="text-xs font-bold text-slate-500">Check In</span>
                <span className="text-xs font-black text-slate-900">{data.checkIn}</span>
              </div>
              <div className="flex items-center justify-between gap-8">
                <span className="text-xs font-bold text-slate-500">Check Out</span>
                <span className="text-xs font-black text-slate-900">{data.checkOut || '--:--'}</span>
              </div>
              <div className="flex items-center justify-between gap-8 border-t border-slate-50 pt-2">
                <span className="text-xs font-bold text-slate-500">Working Hours</span>
                <span className="text-xs font-black text-indigo-600">{data.hours} hrs</span>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }
  return null;
};

const WeeklyAttendancePulse: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'weekly' | 'monthly'>('weekly');

  const fetchWeeklyData = async () => {
    try {
      setLoading(true);
      const res = await API.get('attendance/weekly');
      setData(res?.data?.data || []);
    } catch (error) {
      console.error('Failed to fetch weekly attendance:', error);
      setData([]); // Reset to empty array on failure to avoid UI crashes
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWeeklyData();

    const handleUpdate = () => {
      console.log('🔄 Weekly attendance update received via socket event');
      fetchWeeklyData();
    };

    window.addEventListener('attendance-updated', handleUpdate);
    return () => {
      window.removeEventListener('attendance-updated', handleUpdate);
    };
  }, []);

  const getBarColor = (status: string) => {
    switch (status) {
      case 'Present': return '#10B981'; // Emerald-500
      case 'Late': return '#F59E0B';    // Amber-500
      case 'Absent': return '#EF4444';   // Rose-500
      default: return '#6366f1';        // Indigo-500
    }
  };

  if (loading) {
    return (
      <div className="h-72 w-full flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin"></div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Loading Attendance...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-black text-slate-900">Attendance Pulse</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Weekly performance session history</p>
        </div>
        <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl">
          <button 
            onClick={() => setView('weekly')}
            className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${view === 'weekly' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Weekly
          </button>
          <button 
             onClick={() => setView('monthly')}
             className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${view === 'monthly' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Monthly
          </button>
        </div>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <BarChart data={data} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis 
              dataKey="day" 
              axisLine={false} 
              tickLine={false} 
              tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 900}} 
              dy={10} 
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 900}} 
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
            <Bar dataKey="hours" radius={[6, 6, 0, 0]} barSize={40}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.status)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap items-center gap-6 pt-4 border-t border-slate-50">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">On Time</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-amber-500"></div>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Late Mark</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-rose-500"></div>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Absent</span>
        </div>
        <div className="ml-auto flex items-center gap-2 text-indigo-600">
           <TrendingUp size={14} />
           <span className="text-[10px] font-black uppercase tracking-widest">94% Efficiency</span>
        </div>
      </div>
    </div>
  );
};

export default WeeklyAttendancePulse;
