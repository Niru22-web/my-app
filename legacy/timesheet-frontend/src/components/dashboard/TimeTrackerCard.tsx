import React, { useState, useEffect } from 'react';
import {
  PlayIcon,
  PauseIcon,
  ClockIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ListBulletIcon
} from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';
import API from '../../api';
import { toast } from 'react-toastify';
import { getDetailedLocation } from '../../utils/locationUtils';

interface Session {
  id: string;
  checkInTime: string;
  checkOutTime: string | null;
  duration: number; // in minutes
}

const TimeTrackerCard: React.FC = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [totalWorkedSeconds, setTotalWorkedSeconds] = useState(0);
  const [currentSessionSeconds, setCurrentSessionSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isPunching, setIsPunching] = useState(false);

  const fetchAttendance = async () => {
    try {
      setLoading(true);
      const res = await API.get('attendance/today');
      
      const fetchedSessions = res?.data?.sessions || [];
      const currentActive = res?.data?.currentSession || null;

      setSessions(fetchedSessions);
      setActiveSession(currentActive);

      // Calculate total seconds excluding active session (will be added live)
      const completedSeconds = fetchedSessions
        .filter((s: Session) => s.checkOutTime)
        .reduce((acc: number, s: Session) => acc + (s.duration * 60), 0);

      setTotalWorkedSeconds(completedSeconds);

      if (currentActive) {
        const start = new Date(currentActive.checkInTime).getTime();
        setCurrentSessionSeconds(Math.floor((Date.now() - start) / 1000));
      } else {
        setCurrentSessionSeconds(0);
      }
    } catch (error: unknown) {
      console.error('Failed to fetch attendance:', error);
      // Don't show toast for initial background fetch to avoid spamming
      // but log it for debugging
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIn = async () => {
    if (isPunching) return;
    try {
      setIsPunching(true);
      const locData = await getDetailedLocation();
      await API.post('attendance/check-in', {
        manualCheckIn: true,
        location: locData.address,
        latitude: locData.latitude,
        longitude: locData.longitude
      });
      toast.success('Successfully checked in');
      await fetchAttendance();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      const msg = err.response?.data?.message || 'Check-in failed. Please try again.';
      toast.error(msg);
      console.error('Check-in error:', error);
    } finally {
      setIsPunching(false);
    }
  };

  const handleCheckOut = async () => {
    if (isPunching) return;
    try {
      setIsPunching(true);
      const locData = await getDetailedLocation();
      await API.post('attendance/check-out', {
        location: locData.address,
        latitude: locData.latitude,
        longitude: locData.longitude
      });
      toast.success('Successfully checked out');
      await fetchAttendance();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      const msg = err.response?.data?.message || 'Check-out failed. Please try again.';
      toast.error(msg);
      console.error('Check-out error:', error);
    } finally {
      setIsPunching(false);
    }
  };

  // Initial fetch and Socket listener
  useEffect(() => {
    fetchAttendance();

    const handleSocketUpdate = () => {
      console.log('🔄 Attendance update received via socket event');
      fetchAttendance();
    };

    window.addEventListener('attendance-updated', handleSocketUpdate);
    return () => {
      window.removeEventListener('attendance-updated', handleSocketUpdate);
    };
  }, []);

  // Live timer for active session
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (activeSession && !activeSession.checkOutTime) {
      interval = setInterval(() => {
        const start = new Date(activeSession.checkInTime).getTime();
        setCurrentSessionSeconds(Math.floor((Date.now() - start) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [activeSession]);

  const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return {
      h: String(hours || 0).padStart(2, '0'),
      m: String(minutes || 0).padStart(2, '0'),
      s: String(secs || 0).padStart(2, '0')
    };
  };

  const currentTotalSeconds = totalWorkedSeconds + currentSessionSeconds;
  const totalTime = formatTime(currentTotalSeconds);

  // Progress based on 8 hour workday (28800 seconds)
  const progress = Math.min((currentTotalSeconds / 28800) * 100, 100);

  return (
    <div className="bg-white/80 backdrop-blur-3xl rounded-[3.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-white p-8 group relative overflow-hidden flex flex-col items-center">
      {/* Dynamic Background Accents */}
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-500/5 rounded-full blur-[100px] group-hover:bg-indigo-500/10 transition-all duration-1000"></div>
      <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-purple-500/5 rounded-full blur-[100px] group-hover:bg-purple-500/10 transition-all duration-1000"></div>

      {/* Header */}
      <div className="w-full flex items-center justify-between mb-8 relative z-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
            <ClockIcon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight">Session Tracker</h3>
            <p className="text-[10px] font-black text-slate-400 opacity-60 uppercase tracking-[0.2em]">Live Workforce Pulse</p>
          </div>
        </div>

      </div>

      {/* Main Timer Display */}
      <div className="relative mb-10 group/timer">
        {/* Glowing aura */}
        <div className="absolute inset-0 bg-indigo-500/10 rounded-full blur-3xl opacity-0 group-hover/timer:opacity-100 transition-opacity duration-1000"></div>

        <div className="relative w-56 h-56">
          <svg className="transform -rotate-90 w-56 h-56">
            <circle cx="112" cy="112" r="102" stroke="rgba(241, 245, 249, 0.8)" strokeWidth="12" fill="none" />
            <circle
              cx="112" cy="112" r="102" stroke="url(#timerGradient)" strokeWidth="14" fill="none"
              strokeDasharray={`${2 * Math.PI * 102}`}
              strokeDashoffset={`${2 * Math.PI * 102 * (1 - progress / 100)}`}
              className="transition-all duration-1000 ease-out"
              strokeLinecap="round"
            />
            <defs>
              <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#5286f5ff" />
              </linearGradient>
            </defs>
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">
              Total Today
            </span>
            <div className="text-5xl font-black text-slate-900 tracking-tighter tabular-nums">
              {totalTime.h}<span className={`text-indigo-600 ${activeSession ? 'animate-pulse' : ''} mx-0.5`}>:</span>{totalTime.m}
            </div>
            <div className="text-[10px] font-black text-slate-400 mt-1 uppercase tracking-widest flex items-center gap-2">
              <span className="opacity-40">SECONDS</span>
              <span className="text-indigo-600 font-black">{totalTime.s}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats and Controls */}
      <div className="w-full space-y-6 relative z-10">
        <div className="bg-indigo-50/50 backdrop-blur-md rounded-3xl p-6 border border-white shadow-inner group/stats">
          <div className="flex justify-between items-end mb-4">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Productivity Goal</p>
              <h4 className="text-2xl font-black text-slate-900">{totalTime.h}h {totalTime.m}m</h4>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-indigo-600">{Math.round(progress)}%</span>
              <p className="text-[9px] font-bold text-indigo-300 uppercase tracking-[0.2em]">of 8h Goal</p>
            </div>
          </div>
          <div className="h-2 bg-indigo-100/50 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
            />
          </div>
        </div>

        {!activeSession ? (
          <button
            onClick={handleCheckIn}
            disabled={isPunching || loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-6 rounded-[2rem] font-black uppercase tracking-[0.2em] text-xs shadow-xl shadow-indigo-500/30 transition-all active:scale-95 border-b-4 border-indigo-800 disabled:opacity-50 flex items-center justify-center gap-3"
          >
            {isPunching ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : (
              <><PlayIcon className="w-6 h-6" /> {sessions.length > 0 ? 'Resume Shift' : 'Start Session'}</>
            )}
          </button>
        ) : (
          <button
            onClick={handleCheckOut}
            disabled={isPunching || loading}
            className="w-full bg-rose-600 hover:bg-rose-700 text-white p-6 rounded-[2rem] font-black uppercase tracking-[0.2em] text-xs shadow-xl shadow-rose-500/30 transition-all active:scale-95 border-b-4 border-rose-800 disabled:opacity-50 flex items-center justify-center gap-3"
          >
            {isPunching ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : (
              <><PauseIcon className="w-6 h-6" /> Stop Session</>
            )}
          </button>
        )}

        {/* Mini Status */}
        <div className="flex items-center justify-center gap-4 py-2">
          {activeSession ? (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></div>
              <span className="text-[9px] font-black text-emerald-600 uppercase tracking-[0.3em]">Live Status: Working</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-slate-300 rounded-full"></div>
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">Live Status: On Break</span>
            </div>
          )}
        </div>
      </div>

      {/* Compact Sessions List */}
      <div className="w-full mt-8 border-t border-slate-100 pt-8">
        <div className="flex items-center justify-between mb-4 px-2">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <ListBulletIcon className="w-3 h-3" /> Recent Activity
          </h4>
          <span className="text-[9px] font-bold text-slate-400">{sessions.length} today</span>
        </div>

        <div className="space-y-3 max-h-48 overflow-y-auto pr-1 flex flex-col custom-scrollbar">
          <AnimatePresence initial={false}>
            {[...sessions].reverse().slice(0, 3).map((session, index) => (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/50 border border-slate-50 p-4 rounded-2xl flex items-center justify-between group/session hover:bg-white transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black ${session.checkOutTime ? 'bg-slate-50 text-slate-400' : 'bg-emerald-50 text-emerald-600'}`}>
                    S{sessions.length - index}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-black text-slate-700">
                      {new Date(session.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {session.checkOutTime && ` - ${new Date(session.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase">{session.checkOutTime ? `${session.duration}m logged` : 'Currently active'}</span>
                  </div>
                </div>
                {session.checkOutTime && <CheckCircleIcon className="w-4 h-4 text-emerald-500 opacity-20 group-hover/session:opacity-100 transition-opacity" />}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default TimeTrackerCard;
