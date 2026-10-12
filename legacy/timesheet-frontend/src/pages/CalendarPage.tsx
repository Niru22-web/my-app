/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React, { useState, useEffect } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar as CalendarIcon,
  Plus,
  X,
  Clock,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Info
} from 'lucide-react';
import API from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { useTheme } from '../contexts/ThemeContext';

const locales = {
  'en-US': enUS,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

// Custom Event Component with sleek pill styling
const CustomEventComponent = ({ event }: any) => {
  let pillClass = 'custom-event-indigo';
  if (event.resource.type === 'Holiday') pillClass = 'custom-event-rose';
  if (event.resource.type === 'Meeting') pillClass = 'custom-event-cyan';
  if (event.resource.type === 'Birthday') pillClass = 'custom-event-amber';

  return (
    <div className={`custom-event-pill ${pillClass} truncate h-full flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold transition-all duration-200 select-none`}>
      <span className="w-1 h-1 rounded-full bg-current shrink-0"></span>
      <span className="truncate">{event.title}</span>
    </div>
  );
};

// Custom Toolbar Component for beautiful premium controls
const CustomToolbar = (toolbarProps: any) => {
  const goToBack = () => {
    toolbarProps.onNavigate('PREV');
  };

  const goToNext = () => {
    toolbarProps.onNavigate('NEXT');
  };

  const goToCurrent = () => {
    toolbarProps.onNavigate('TODAY');
  };

  const toggleView = (viewName: string) => {
    toolbarProps.onView(viewName);
  };

  return (
    <div className="flex flex-col md:flex-row justify-between items-center gap-3 mb-4 bg-slate-50/50 dark:bg-[#152238] p-2.5 rounded-2xl border border-slate-100 dark:border-white/5 backdrop-blur-md">
      {/* Left: Navigation Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={goToCurrent}
          className="px-4 py-2.5 bg-white dark:bg-[#1A2942] text-xs font-black text-gray-700 dark:text-white border border-slate-200/60 dark:border-white/5 rounded-xl hover:bg-slate-50 dark:hover:bg-[#203354] transition-all hover:scale-[1.02] active:scale-[0.98] shadow-sm uppercase tracking-wider"
        >
          Today
        </button>

        <div className="flex items-center bg-white dark:bg-[#1A2942] border border-slate-200/60 dark:border-white/5 rounded-xl p-0.5 shadow-sm">
          <button
            onClick={goToBack}
            className="p-2 hover:bg-slate-50 dark:hover:bg-[#203354] rounded-lg text-gray-600 dark:text-white transition-all active:scale-90"
            title="Previous Month"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="w-[1px] h-4 bg-slate-200 dark:bg-[#152238] mx-1"></div>
          <button
            onClick={goToNext}
            className="p-2 hover:bg-slate-50 dark:hover:bg-[#203354] rounded-lg text-gray-600 dark:text-white transition-all active:scale-90"
            title="Next Month"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Center: Current Month/Date Label */}
      <h2 className="text-xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.6)]"></span>
        {toolbarProps.label}
      </h2>

      {/* Right: View switcher tabs */}
      <div className="flex bg-slate-100/80 dark:bg-[#0F1B33] p-1 rounded-2xl border border-slate-200/20 shadow-inner">
        {['month', 'week', 'day'].map((viewOpt) => (
          <button
            key={viewOpt}
            onClick={() => toggleView(viewOpt)}
            className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${toolbarProps.view === viewOpt
              ? 'bg-white dark:bg-[#1A2942] text-indigo-600 dark:text-[#4F6BFF] shadow-md scale-[1.02]'
              : 'text-gray-400 hover:text-gray-700 dark:hover:text-white'
              }`}
          >
            {viewOpt}
          </button>
        ))}
      </div>
    </div>
  );
};

const CalendarPage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const { themeMode } = useTheme();
  const [events, setEvents] = useState<any[]>([]);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [formData, setFormData] = useState({
    title: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    time: '10:00',
    type: 'Event'
  });

  const userRole = user?.role?.toLowerCase() || '';
  const canManage = ['admin', 'hr', 'partner', 'owner'].some(r => userRole.includes(r));

  const isAnyCalendarModalOpen = isModalOpen || !!selectedEvent;

  useEffect(() => {
    if (isAnyCalendarModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isAnyCalendarModalOpen]);

  const fetchEvents = async () => {
    try {
      setLoading(true);

      // Fetch both events and employees list in parallel (using all=true to bypass any filter constraints)
      const [eventsRes, employeesRes] = await Promise.all([
        API.get('/events'),
        API.get('/employees?all=true')
      ]);

      let combinedEvents: any[] = [];

      // 1. Process corporate events
      if (eventsRes.data.success) {
        const formattedEvents = eventsRes.data.data.map((e: any) => ({
          id: e.id,
          title: e.title,
          start: new Date(e.date),
          end: new Date(e.date),
          allDay: !e.time,
          resource: e
        }));
        combinedEvents = [...formattedEvents];
      }

      // 2. Process employee birthdays from profile dob
      if (employeesRes.data.success) {
        const employees = employeesRes.data.data;
        const currentYear = new Date().getFullYear();

        employees.forEach((emp: any) => {
          const dobStr = emp.profile?.dob;
          // Only process birthdays if date is available and not the default placeholder (2000-01-01)
          if (dobStr && !dobStr.startsWith('2000-01-01')) {
            // Split the ISO string to parse year, month, day independently of local timezone shift
            const parts = dobStr.split('T')[0].split('-');
            if (parts.length === 3) {
              const dobMonth = parseInt(parts[1], 10) - 1; // 0-indexed month (0 = January)
              const dobDay = parseInt(parts[2], 10);

              const fullName = emp.lastName ? `${emp.firstName} ${emp.lastName}` : emp.firstName;

              // Create birthday events for previous, current, and next year to support seamless calendar browsing
              [currentYear - 1, currentYear, currentYear + 1].forEach((year) => {
                const bdayStart = new Date(year, dobMonth, dobDay);
                const bdayEnd = new Date(year, dobMonth, dobDay);

                combinedEvents.push({
                  id: `birthday-${emp.id}-${year}`,
                  title: `${fullName}'s Birthday`,
                  start: bdayStart,
                  end: bdayEnd,
                  allDay: true,
                  resource: {
                    id: `birthday-${emp.id}`,
                    title: `${fullName}'s Birthday`,
                    type: 'Birthday',
                    date: format(bdayStart, 'yyyy-MM-dd'),
                    time: 'All Day',
                    employeeName: fullName,
                    designation: emp.designation || 'Team Member'
                  }
                });
              });
            }
          }
        });
      }

      setEvents(combinedEvents);
    } catch (error) {
      console.error('Failed to fetch calendar data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await API.post('/events', formData);
      if (res.data.success) {
        toast.success('Event created successfully');
        setIsModalOpen(false);
        setFormData({ title: '', date: format(new Date(), 'yyyy-MM-dd'), time: '10:00', type: 'Event' });
        fetchEvents();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to create event');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this event?')) return;
    try {
      const res = await API.delete(`/events/${id}`);
      if (res.data.success) {
        toast.success('Event deleted successfully');
        setSelectedEvent(null);
        fetchEvents();
      }
    } catch (error) {
      toast.error('Failed to delete event');
    }
  };

  return (
    <div className="space-y-5 pb-6 max-w-[1600px] mx-auto px-4 md:px-0">
      {/* Gorgeous SaaS Styled Custom Calendar CSS */}
      <style dangerouslySetInnerHTML={{
        __html: `
        /* Hide Default Toolbar */
        .rbc-toolbar {
          display: none !important;
        }

        /* Calendar Root and Typography */
        .rbc-calendar {
          border: none !important;
          font-family: inherit !important;
        }

        /* Calendar Grid Headers (Sun, Mon, etc.) */
        .rbc-header {
          border-bottom: 1px solid #f1f5f9 !important;
          border-left: none !important;
          border-right: none !important;
          padding: 10px 6px !important;
          font-weight: 900 !important;
          font-size: 11px !important;
          text-transform: uppercase !important;
          letter-spacing: 0.05em !important;
          color: #64748b !important;
          background-color: transparent !important;
        }
        .dark .rbc-header {
          border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
          color: #FFFFFF !important;
          background-color: #1A2942 !important;
        }

        /* Grid Outer Border - Seamless integration into Card wrapper */
        .rbc-month-view {
          border: none !important;
          background-color: transparent !important;
          box-shadow: none !important;
          overflow: visible !important;
        }
        .dark .rbc-month-view {
          background-color: #152238 !important;
        }

        /* Day Bg grids and dynamic hover transitions */
        .rbc-day-bg {
          transition: background-color 0.25s ease !important;
          border-left: 1px solid #f1f5f9 !important;
        }
        .dark .rbc-day-bg {
          border-left: 1px solid rgba(255, 255, 255, 0.08) !important;
          background-color: #152238 !important;
        }
        .rbc-day-bg:hover {
          background-color: #f8fafc !important;
        }
        .dark .rbc-day-bg:hover {
          background-color: #203354 !important;
        }

        .rbc-month-row {
          border-bottom: 1px solid #f1f5f9 !important;
        }
        .dark .rbc-month-row {
          border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
        }

        /* Off range days background */
        .rbc-off-range-bg {
          background-color: #fafbfc !important;
        }
        .dark .rbc-off-range-bg {
          background-color: #0F1B33 !important;
        }

        /* Date cells and link styling */
        .rbc-date-cell {
          padding: 5px 8px !important;
          text-align: right !important;
        }
        .rbc-date-cell a {
          font-size: 11px !important;
          font-weight: 900 !important;
          color: #64748b !important;
          transition: all 0.25s !important;
          display: inline-block !important;
          width: 24px !important;
          height: 24px !important;
          line-height: 24px !important;
          text-align: center !important;
          border-radius: 50% !important;
          text-decoration: none !important;
        }
        .dark .rbc-date-cell a {
          color: #FFFFFF !important;
        }

        /* Hover numbers */
        .rbc-date-cell:hover a {
          background-color: #f1f5f9 !important;
          color: #0f172a !important;
          scale: 1.05;
        }
        .dark .rbc-date-cell:hover a {
          background-color: #1A2942 !important;
          color: #ffffff !important;
        }

        /* Off-range date number dimming */
        .rbc-off-range .rbc-date-cell a {
          color: #cbd5e1 !important;
          opacity: 0.4 !important;
        }
        .dark .rbc-off-range .rbc-date-cell a {
          color: #7F8CA3 !important;
          opacity: 0.4 !important;
        }

        /* Elegant Today Highlighting */
        .rbc-today {
          background-color: rgba(99, 102, 241, 0.02) !important;
        }
        .dark .rbc-today {
          background-color: rgba(79, 107, 255, 0.15) !important;
        }
        .rbc-today .rbc-date-cell a {
          background-color: #4f46e5 !important;
          color: #ffffff !important;
          box-shadow: 0 0 10px rgba(99, 102, 241, 0.45) !important;
          font-weight: 900 !important;
          transform: scale(1.05);
        }
        .dark .rbc-today .rbc-date-cell a {
          background-color: #4F6BFF !important;
          color: #ffffff !important;
          box-shadow: 0 0 10px rgba(79, 107, 255, 0.45) !important;
        }

        /* Override React Big Calendar default events styles */
        .rbc-event {
          background: transparent !important;
          border: none !important;
          padding: 1px 4px !important;
          margin-bottom: 2px !important;
        }
        .rbc-event-content {
          font-size: 0px !important; /* Hide defaults, use custom event component */
        }

        /* Custom Event Pill Styles */
        .custom-event-pill {
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.01) !important;
          border: 1px solid transparent !important;
        }
        .custom-event-pill:hover {
          transform: translateY(-1px) scale(1.01) !important;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.08) !important;
        }

        /* Color configurations for light/dark mode event types */
        .custom-event-indigo {
          background-color: rgba(99, 102, 241, 0.06) !important;
          color: #4f46e5 !important;
          border-left: 3px solid #4f46e5 !important;
          border-color: rgba(99, 102, 241, 0.12) !important;
        }
        .dark .custom-event-indigo {
          background-color: rgba(129, 140, 248, 0.08) !important;
          color: #a5b4fc !important;
          border-left: 3px solid #6366f1 !important;
          border-color: rgba(129, 140, 248, 0.15) !important;
        }

        .custom-event-rose {
          background-color: rgba(244, 63, 94, 0.06) !important;
          color: #e11d48 !important;
          border-left: 3px solid #e11d48 !important;
          border-color: rgba(244, 63, 94, 0.12) !important;
        }
        .dark .custom-event-rose {
          background-color: rgba(251, 113, 133, 0.08) !important;
          color: #fda4af !important;
          border-left: 3px solid #f43f5e !important;
          border-color: rgba(251, 113, 133, 0.15) !important;
        }

        .custom-event-cyan {
          background-color: rgba(6, 182, 212, 0.06) !important;
          color: #0891b2 !important;
          border-left: 3px solid #0891b2 !important;
          border-color: rgba(6, 182, 212, 0.12) !important;
        }
        .dark .custom-event-cyan {
          background-color: rgba(34, 211, 238, 0.08) !important;
          color: #67e8f9 !important;
          border-left: 3px solid #06b6d4 !important;
          border-color: rgba(34, 211, 238, 0.15) !important;
        }

        .custom-event-amber {
          background-color: rgba(245, 158, 11, 0.06) !important;
          color: #d97706 !important;
          border-left: 3px solid #f59e0b !important;
          border-color: rgba(245, 158, 11, 0.12) !important;
        }
        .dark .custom-event-amber {
          background-color: rgba(245, 158, 11, 0.08) !important;
          color: #fcd34d !important;
          border-left: 3px solid #f59e0b !important;
          border-color: rgba(245, 158, 11, 0.15) !important;
        }

        /* Show more button text alignment */
        .rbc-show-more {
          font-size: 10px !important;
          font-weight: 800 !important;
          color: #4f46e5 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.05em !important;
        }
        .dark .rbc-show-more {
          color: #818cf8 !important;
        }
      `}} />

      {/* 1. TOP HERO BANNER / PAGE TITLE */}
      <motion.div
        initial={{ opacity: 0, y: -15 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white dark:bg-slate-900 py-3 px-5 rounded-2xl border border-slate-100 dark:border-slate-800/80 shadow-lg shadow-slate-100/50 dark:shadow-none"
      >
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/50 rounded-xl text-indigo-600 dark:text-indigo-400 shadow-inner">
            <CalendarIcon size={24} className="animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight leading-none">Corporate Calendar</h1>
            <p className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mt-2 flex items-center gap-1.5">
              <Sparkles size={11} className="text-indigo-500" />
              Company Events, Meetings & Holidays
            </p>
          </div>
        </div>

        {canManage && (
          <Button
            onClick={() => setIsModalOpen(true)}
            className="relative overflow-hidden bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-2xl px-6 py-3.5 shadow-lg shadow-indigo-200 dark:shadow-none flex items-center gap-2 font-black transition-all duration-300 hover:scale-[1.03] active:scale-[0.97]"
          >
            <Plus size={18} />
            <span>Schedule Event</span>
          </Button>
        )}
      </motion.div>

      {/* 2. CALENDAR BODY & SIDEBAR */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">

        {/* LEFT COLUMN: THE GRID CALENDAR (3/4 Width) */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="xl:col-span-3"
        >
          <Card className="p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-lg shadow-slate-100/50 dark:shadow-none border border-slate-100 dark:border-slate-800">
            <div className="h-[550px] calendar-container">
              <Calendar
                localizer={localizer}
                events={events}
                startAccessor="start"
                endAccessor="end"
                style={{ height: '100%' }}
                onSelectEvent={(event) => setSelectedEvent(event.resource)}
                views={['month', 'week', 'day']}
                className="font-brand"
                components={{
                  toolbar: CustomToolbar,
                  event: CustomEventComponent
                }}
                date={currentDate}
                onNavigate={(date) => setCurrentDate(date)}
              />
            </div>
          </Card>
        </motion.div>

        {/* RIGHT COLUMN: THE INFORMATION SIDEBAR (1/4 Width) */}
        <div className="space-y-4 flex flex-col h-fit">

          {/* Glassmorphic Schedule Tip Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="p-5 bg-gradient-to-tr from-slate-900 to-indigo-950 dark:from-slate-950 dark:to-indigo-950 text-white rounded-2xl shadow-xl relative overflow-hidden group border border-slate-800"
          >
            {/* Pulsing visual glow artifacts */}
            <div className="absolute top-0 right-0 -m-10 w-36 h-36 bg-indigo-500/20 blur-[60px] rounded-full group-hover:bg-indigo-500/30 transition-all duration-500"></div>
            <div className="absolute bottom-0 left-0 -m-8 w-24 h-24 bg-purple-500/10 blur-[40px] rounded-full"></div>

            <div className="relative z-10 space-y-4">
              <div className="inline-flex p-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10 text-indigo-400 group-hover:scale-110 transition-all duration-300">
                <Info size={20} />
              </div>
              <div>
                <h3 className="text-lg font-black tracking-tight mb-2">Calendar Tips</h3>
                <p className="text-indigo-200/70 text-xs font-medium leading-relaxed">
                  Events published here are synced instantly to all employees. Use
                  <span className="text-rose-300 font-bold mx-1">Holiday</span>
                  type for office closures, and
                  <span className="text-amber-300 font-bold mx-1">Birthday</span>
                  to celebrate colleagues!
                </p>
              </div>
            </div>
          </motion.div>

          {/* Upcoming Events Module */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="h-fit animate-none"
          >
            <Card className="p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-lg shadow-slate-100/50 dark:shadow-none border border-slate-100 dark:border-slate-800 h-fit flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black text-gray-900 dark:text-slate-100 uppercase tracking-tight">
                  Upcoming in {format(currentDate, 'MMMM')}
                </h3>
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]"></div>
              </div>

              <div className="space-y-3 flex-1 overflow-y-auto max-h-[310px] pr-1 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                {events.filter(event =>
                  event.start.getMonth() === currentDate.getMonth() &&
                  event.start.getFullYear() === currentDate.getFullYear()
                ).length > 0 ? (
                  [...events]
                    .filter(event =>
                      event.start.getMonth() === currentDate.getMonth() &&
                      event.start.getFullYear() === currentDate.getFullYear()
                    )
                    .sort((a, b) => a.start.getTime() - b.start.getTime())
                    .slice(0, 6)
                    .map((event, i) => {
                      let typeColor = 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 border-indigo-100 dark:border-indigo-950';
                      let dotColor = 'bg-indigo-500';
                      if (event.resource.type === 'Holiday') {
                        typeColor = 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 border-rose-100 dark:border-rose-950';
                        dotColor = 'bg-rose-500';
                      }
                      if (event.resource.type === 'Meeting') {
                        typeColor = 'bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-400 border-cyan-100 dark:border-cyan-950';
                        dotColor = 'bg-cyan-500';
                      }
                      if (event.resource.type === 'Birthday') {
                        typeColor = 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 border-amber-100 dark:border-amber-950';
                        dotColor = 'bg-amber-500';
                      }

                      return (
                        <div
                          key={i}
                          className="flex gap-4 p-3.5 bg-slate-50/50 dark:bg-slate-950/50 hover:bg-slate-50 dark:hover:bg-slate-950 rounded-2xl border border-slate-100/50 dark:border-slate-900 hover:scale-[1.01] hover:shadow-md hover:shadow-slate-100/20 dark:hover:shadow-none transition-all duration-300 group cursor-pointer"
                          onClick={() => setSelectedEvent(event.resource)}
                        >
                          <div className={`shrink-0 w-12 h-12 rounded-2xl flex flex-col items-center justify-center border font-bold ${typeColor}`}>
                            <span className="text-[8px] uppercase tracking-wider leading-none">{format(event.start, 'MMM')}</span>
                            <span className="text-lg leading-none mt-1">{format(event.start, 'dd')}</span>
                          </div>

                          <div className="min-w-0 flex-1 flex flex-col justify-center">
                            <p className="text-xs font-black text-gray-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">{event.title}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></span>
                              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                                {event.resource.type === 'Birthday' ? 'Birthday' : (event.resource.time || 'All Day')}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center opacity-70 h-full">
                    <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-full mb-3 text-slate-300">
                      <CalendarIcon size={32} />
                    </div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">No events scheduled</p>
                  </div>
                )}
              </div>
            </Card>
          </motion.div>

        </div>

      </div>

      {/* 3. ADD NEW EVENT MODAL */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
            />

            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl p-8 overflow-hidden border border-slate-100 dark:border-slate-800"
            >
              {/* Top ambient color bar */}
              <div className="absolute top-0 left-0 w-full h-2.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

              <div className="flex justify-between items-center mb-6 pt-2">
                <div>
                  <h2 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">Publish Event</h2>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Add to organizational timeline</p>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 dark:text-slate-500 transition-colors"
                  title="Close modal"
                  aria-label="Close modal"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">

                {/* Title */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1">Event Title</label>
                  <input
                    required
                    id="event-title"
                    title="Event Title"
                    aria-label="Event Title"
                    className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-100/30 dark:border-slate-800/80 rounded-2xl text-sm font-bold text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition-all outline-none"
                    placeholder="e.g., Annual Strategy Meet"
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>

                {/* Date & Time Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1">Date</label>
                    <input
                      required type="date"
                      id="event-date"
                      title="Event Date"
                      aria-label="Event Date"
                      placeholder="Select date"
                      className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-100/30 dark:border-slate-800/80 rounded-2xl text-sm font-bold text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition-all outline-none"
                      value={formData.date}
                      onChange={e => setFormData({ ...formData, date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1">Time</label>
                    <input
                      type="time"
                      id="event-time"
                      title="Event Time"
                      aria-label="Event Time"
                      placeholder="Select time"
                      className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-100/30 dark:border-slate-800/80 rounded-2xl text-sm font-bold text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition-all outline-none"
                      value={formData.time}
                      onChange={e => setFormData({ ...formData, time: e.target.value })}
                    />
                  </div>
                </div>

                {/* Event Type Select buttons */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1">Event Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['Event', 'Holiday', 'Meeting'].map(type => {
                      let activeStyle = 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 dark:shadow-none';
                      if (type === 'Holiday') activeStyle = 'bg-rose-600 text-white shadow-lg shadow-rose-100 dark:shadow-none';
                      if (type === 'Meeting') activeStyle = 'bg-cyan-600 text-white shadow-lg shadow-cyan-100 dark:shadow-none';

                      return (
                        <button
                          key={type} type="button"
                          onClick={() => setFormData({ ...formData, type })}
                          className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${formData.type === type ? activeStyle : 'bg-slate-50 dark:bg-slate-950 text-slate-400 dark:text-slate-500 hover:text-slate-600'
                            }`}
                        >
                          {type}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Submit Action */}
                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-2xl py-4 font-black shadow-lg shadow-indigo-100 dark:shadow-none hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  Publish to Calendar
                </Button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 4. EVENT DETAILS MODAL */}
      <AnimatePresence>
        {selectedEvent && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedEvent(null)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
            />

            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl p-8 overflow-hidden border border-slate-100 dark:border-slate-800"
            >
              {/* Type-based top accent line */}
              <div className={`absolute top-0 left-0 w-full h-2.5 bg-${selectedEvent.type === 'Holiday' ? 'rose' : (selectedEvent.type === 'Meeting' ? 'cyan' : (selectedEvent.type === 'Birthday' ? 'amber' : 'indigo'))}-500`} />

              <div className="flex justify-between items-start mb-6 pt-2">
                <div>
                  <Badge variant={selectedEvent.type === 'Holiday' ? 'danger' : (selectedEvent.type === 'Birthday' ? 'warning' : 'primary')} className="mb-2 uppercase text-[9px] font-black px-2.5 py-0.5">{selectedEvent.type}</Badge>
                  <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight leading-tight mt-1">{selectedEvent.title}</h2>
                </div>
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 dark:text-slate-500 transition-colors"
                  title="Close details"
                  aria-label="Close details"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Event Metadata Cards */}
              <div className="space-y-4 mb-8 bg-slate-50 dark:bg-slate-950 p-5 rounded-2xl border border-slate-100/50 dark:border-slate-900">
                <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
                  <div className="p-2 bg-white dark:bg-slate-900 rounded-lg text-indigo-500 shadow-sm border border-slate-100/30">
                    <CalendarIcon size={16} />
                  </div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{format(new Date(selectedEvent.date), 'EEEE, MMMM dd, yyyy')}</span>
                </div>

                {selectedEvent.type !== 'Birthday' && (
                  <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
                    <div className="p-2 bg-white dark:bg-slate-900 rounded-lg text-indigo-500 shadow-sm border border-slate-100/30">
                      <Clock size={16} />
                    </div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{selectedEvent.time || 'All Day Event'}</span>
                  </div>
                )}

                {selectedEvent.type === 'Birthday' && (
                  <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
                    <div className="p-2 bg-white dark:bg-slate-900 rounded-lg text-amber-500 shadow-sm border border-slate-100/30">
                      <Sparkles size={16} />
                    </div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Designation: {selectedEvent.designation || 'Team Member'}</span>
                  </div>
                )}
              </div>

              {/* Administrative Trash Action */}
              {canManage && selectedEvent.type !== 'Birthday' && (
                <Button
                  onClick={() => handleDelete(selectedEvent.id)}
                  className="w-full bg-rose-50 hover:bg-rose-100/80 dark:bg-rose-950/20 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-2xl py-4 font-black flex items-center justify-center gap-2 transition-all border border-rose-100/55 dark:border-rose-950/40 active:scale-[0.98]"
                >
                  <Trash2 size={16} />
                  <span>Remove Event</span>
                </Button>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CalendarPage;
