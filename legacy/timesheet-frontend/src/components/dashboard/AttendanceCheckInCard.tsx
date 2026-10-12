import React, { useState, useEffect, useCallback } from 'react';
import { 
  Clock, 
  CheckCircle, 
  MapPin,
  RefreshCcw,
  RotateCcw
} from 'lucide-react';
import API from '../../api';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { getDetailedLocation } from '../../utils/locationUtils';
import Avatar from '../ui/Avatar';

const formatLocation = (loc: string | null | undefined) => {
    if (!loc) return '';
    if (loc.includes('GPS:')) return loc.replace('GPS:', '').trim();
    const parts = loc.split(',');
    if (parts.length > 2) return parts.slice(0, 2).join(',').trim();
    return loc.trim();
};

interface AttendanceSession {
    check_in_time: string;
    check_out_time?: string | null;
    location_name?: string | null;
    check_in_location?: string | null;
    check_out_location?: string | null;
    latitude?: number | null;
    longitude?: number | null;
}

interface AttendanceRecord {
    checkInTime?: string | null;
    checkOutTime?: string | null;
    checkInLocation?: string | null;
    checkOutLocation?: string | null;
    location_name?: string | null;
    latitude?: number | null;
    longitude?: number | null;
}

interface AttendanceSummary {
    status: string;
    activeSession?: AttendanceSession | null;
    todayRecord?: AttendanceRecord | null;
    location_name?: string | null;
}

const AttendanceCheckInCard: React.FC<{ onAction?: () => void }> = ({ onAction }) => {
    const { user } = useAuth();
    const toast = useToast();
    const [summary, setSummary] = useState<AttendanceSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [timer, setTimer] = useState('00:00:00');

    const fetchStatus = useCallback(async () => {
        try {
            setLoading(true);
            const res = await API.get('/attendance/today');
            if (res.data && res.data.success) {
                setSummary(res.data.data);
            } else {
                setSummary(null);
            }
        } catch (error) {
            console.error('Failed to fetch attendance status:', error);
            setSummary(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | undefined;
        const checkInTime = summary?.activeSession?.check_in_time;
        
        if (summary?.status === 'Active' && checkInTime) {
            const startTime = new Date(checkInTime).getTime();
            const updateTimer = () => {
                const now = new Date().getTime();
                const diff = Math.max(0, now - startTime);
                const h = Math.floor(diff / 3600000);
                const m = Math.floor((diff % 3600000) / 60000);
                const s = Math.floor((diff % 60000) / 1000);
                setTimer(`${String(h || 0).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}:${String(s || 0).padStart(2, '0')}`);
            };
            updateTimer();
            interval = setInterval(updateTimer, 1000);
        } else {
            setTimer('00:00:00');
        }
        return () => { if (interval) clearInterval(interval); };
    }, [summary]);



    const handleAction = async () => {
        const isActive = summary?.status === 'Active';
        const endpoint = isActive ? '/attendance/logout' : '/attendance/check-in';
        const successMsg = isActive ? 'Check-out recorded successfully' : 'Check-in confirmed';
        
        try {
            setActionLoading(true);
            const locData = await getDetailedLocation();
            const location = locData.address;
            
            const payload: {
                location: string;
                latitude: number | null;
                longitude: number | null;
                manualCheckIn?: boolean;
            } = { 
                location,
                latitude: locData.latitude,
                longitude: locData.longitude
            };
            if (!isActive) {
                payload.manualCheckIn = true;
            }
            
            await API.post(endpoint, payload);
            toast.success(successMsg);
            await fetchStatus();
            if (onAction) onAction();
        } catch (error: unknown) {
            const err = error as { response?: { data?: { message?: string } } };
            toast.error(err.response?.data?.message || 'Action failed');
            await fetchStatus();
        } finally {
            setActionLoading(false);
        }
    };

    if (loading && !summary) {
        return (
            <Card className="h-24 bg-white rounded-[2rem] shadow-xl animate-pulse">
                <div className="w-full h-full" />
            </Card>
        );
    }

    const isActive = summary?.status === 'Active';

    return (
        <Card className="relative overflow-hidden p-5 md:p-6 border-none bg-white rounded-[2rem] shadow-xl shadow-gray-100/50">
            <div className="relative z-10 flex flex-col xl:flex-row items-center justify-between gap-6">
                {/* 1. Left: Profile Info */}
                <div className="flex items-center gap-4 w-full xl:w-auto">
                    <div className="relative flex-shrink-0">
                        <Avatar 
                            name={user?.name || ''} 
                            src={user?.profileImage} 
                            size="lg" 
                            className="rounded-2xl border border-gray-100" 
                        />
                        <div className={`absolute -bottom-1 -right-1 w-5 h-5 ${isActive ? 'bg-emerald-500' : 'bg-gray-400'} rounded-lg border-2 border-white flex items-center justify-center`}>
                            <CheckCircle size={10} className="text-white" />
                        </div>
                    </div>

                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="text-base font-black text-gray-900">{user?.name}</h3>
                            <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded uppercase">{user?.employeeId}</span>
                        </div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">{user?.designation || 'Administrator'} • {user?.department || 'Management'}</p>
                        <div className="mt-1.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-600'
                            }`}>
                                <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`}></span>
                                {isActive ? 'Present / Checked-in' : 'Offline'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* 2. Middle: Location Details */}
                <div className="flex flex-col md:flex-row xl:flex-1 gap-4 md:gap-8 w-full xl:w-auto border-t md:border-t-0 pt-4 md:pt-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
                            <MapPin size={14} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tight">Check-in:</p>
                            <p className="text-[11px] font-bold text-gray-900 truncate">
                                {summary?.todayRecord?.checkInTime 
                                    ? (formatLocation(summary.todayRecord.location_name || summary.todayRecord.checkInLocation) || 
                                       `${Number(summary.todayRecord.latitude || 19.115).toFixed(4)}, ${Number(summary.todayRecord.longitude || 72.849).toFixed(4)}`)
                                    : '—'}
                                {summary?.todayRecord?.checkInTime && ` (${new Date(summary.todayRecord.checkInTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})})`}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-xl bg-rose-50 text-rose-600 shrink-0">
                            <MapPin size={14} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tight">Check-out:</p>
                            <p className="text-[11px] font-bold text-gray-900 truncate">
                                {summary?.todayRecord?.checkOutTime 
                                    ? `${formatLocation(summary.location_name || summary.todayRecord.checkOutLocation || 'Andheri East, Mumbai')} (${new Date(summary.todayRecord.checkOutTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})})` 
                                    : '—'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* 3. Right: Timer & Action */}
                <div className="flex items-center gap-4 w-full xl:w-auto">
                    <div className="flex items-center gap-3 px-6 py-2 bg-indigo-50/50 rounded-2xl border border-indigo-100/50">
                        <Clock className={`w-5 h-5 ${isActive ? 'text-indigo-500 animate-spin-slow' : 'text-gray-400'}`} />
                        <div className="flex flex-col">
                            <span className={`text-2xl font-black tabular-nums tracking-tighter ${isActive ? 'text-indigo-600' : 'text-gray-400'}`}>{timer}</span>
                            <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none">Working Hours</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-1 xl:flex-none">
                        <Button
                            onClick={handleAction}
                            disabled={actionLoading}
                            className={`flex-1 xl:flex-none h-12 px-6 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-xl transition-all active:scale-95 ${
                                isActive ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-200' : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200'
                            }`}
                        >
                            {actionLoading ? <RefreshCcw size={14} className="animate-spin" /> : isActive ? 'Check-out' : 'Check-in'}
                        </Button>
                        
                        <button
                            onClick={fetchStatus}
                            aria-label="Refresh Status"
                            title="Refresh Status"
                            className="p-3 rounded-xl border border-gray-100 text-gray-400 hover:bg-gray-50 hover:text-indigo-600 transition-all"
                        >
                            <RotateCcw size={16} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>
            </div>
        </Card>
    );
};

export default AttendanceCheckInCard;
