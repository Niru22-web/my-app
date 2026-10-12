import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeftIcon, 
  CalendarIcon, 
  ClockIcon, 
  MapPinIcon, 
  UserCircleIcon,
  ChartBarIcon,
  ArrowDownTrayIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';
import API from '../api';
import Card from '../components/ui/Card';
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { resolveAssetUrl } from '../utils/assetUtils';
import { toast } from 'react-toastify';
import ASALoader from '../components/ui/ASALoader';

interface AttendanceReport {
  employee: any;
  attendance: {
    date: string;
    checkInTime: string;
    checkOutTime: string;
    status: string;
    totalHours: number;
    checkInLocation: string;
    checkOutLocation: string;
    location_name: string;
    latitude?: number;
    longitude?: number;
  };
  sessions: Array<{
    id: string;
    checkInTime: string;
    checkOutTime: string;
    duration: number;
    checkInLocation: string;
    checkOutLocation: string;
    location_name: string;
    latitude?: number;
    longitude?: number;
  }>;
  summary: {
    totalWorkHours: string;
    totalBreakHours: string;
    netWorkHours: string;
    sessionCount: number;
  };
}

const AttendanceReport: React.FC = () => {
  const { employeeId, date } = useParams<{ employeeId: string; date: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        setLoading(true);
        setError(false);
        const response = await API.get(`/attendance/report?employeeId=${employeeId}&date=${date}`);
        setReport(response.data.data);
      } catch (error) {
        console.error('Failed to fetch attendance report:', error);
        setError(true);
        toast.error('Failed to load attendance report');
      } finally {
        setLoading(false);
      }
    };

    if (employeeId && date) {
      fetchReport();
    }
  }, [employeeId, date]);

  const formatTime = (timeString: string) => {
    if (!timeString) return '--:--';
    return new Date(timeString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, { 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    });
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const handleExport = () => {
    if (!report) return;
    
    const csvContent = [
      ['Attendance Report', ''],
      ['Employee', `${report.employee.firstName} ${report.employee.lastName}`],
      ['Employee ID', report.employee.employeeId],
      ['Date', formatDate(report.attendance.date)],
      ['Status', report.attendance.status],
      [''],
      ['Session Details', ''],
      ['Session #', 'Check In', 'Check Out', 'Duration', 'Location'],
      ...report.sessions.map((session, idx) => [
        idx + 1,
        formatTime(session.checkInTime),
        formatTime(session.checkOutTime),
        formatDuration(session.duration),
        session.location_name || 'N/A'
      ]),
      [''],
      ['Summary', ''],
      ['Total Work Hours', report.summary.totalWorkHours + 'h'],
      ['Total Break Hours', report.summary.totalBreakHours + 'h'],
      ['Net Work Hours', report.summary.netWorkHours + 'h'],
      ['Number of Sessions', report.summary.sessionCount.toString()]
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `attendance_report_${employeeId}_${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Report exported successfully');
  };

  if (loading) {
    return <ASALoader fullPage size="lg" text="Loading attendance report..." />;
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <DocumentTextIcon className="w-16 h-16 text-rose-500 mx-auto mb-4" />
          <p className="text-slate-900 font-semibold mb-4">Failed to load attendance report</p>
          <Button onClick={() => navigate(-1)} className="bg-indigo-600">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const biometricPunchCount = report.sessions.reduce((acc, sess) => {
    let count = 0;
    if (sess.checkInLocation?.toLowerCase().includes('biometric')) count++;
    if (sess.checkOutTime && sess.checkOutLocation?.toLowerCase().includes('biometric')) count++;
    return acc + count;
  }, 0);

  const portalPunchCount = report.sessions.reduce((acc, sess) => {
    let count = 0;
    if (sess.checkInLocation && !sess.checkInLocation.toLowerCase().includes('biometric')) count++;
    if (sess.checkOutTime && sess.checkOutLocation && !sess.checkOutLocation.toLowerCase().includes('biometric')) count++;
    return acc + count;
  }, 0);

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Button 
            variant="ghost" 
            onClick={() => navigate(-1)}
            className="mb-4 text-slate-600 hover:text-indigo-600"
          >
            <ArrowLeftIcon className="w-5 h-5 mr-2" />
            Back to Attendance Logs
          </Button>
          
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Attendance Report</h1>
              <p className="text-slate-600 mt-1">
                Detailed attendance breakdown for {formatDate(report.attendance.date)}
              </p>
            </div>
            <Button 
              onClick={handleExport}
              className="mt-4 md:mt-0 bg-indigo-600 hover:bg-indigo-700"
            >
              <ArrowDownTrayIcon className="w-5 h-5 mr-2" />
              Export Report
            </Button>
          </div>
        </div>

        {/* Employee Info Card */}
        <Card className="mb-8 p-6">
          <div className="flex items-center gap-4">
            <Avatar 
              src={report.employee.profile?.profileImage ? resolveAssetUrl(report.employee.profile.profileImage) : undefined}
              name={`${report.employee.firstName} ${report.employee.lastName}`}
              size="lg"
            />
            <div className="flex-1">
              <h2 className="text-xl font-bold text-slate-900">
                {report.employee.firstName} {report.employee.lastName}
              </h2>
              <p className="text-slate-600">{report.employee.employeeId}</p>
              <Badge variant="ghost" className="mt-2">
                {report.employee.designation || 'Employee'}
              </Badge>
            </div>
            <div className="text-right">
              <Badge 
                variant={report.attendance.status === 'Present' ? 'success' : report.attendance.status === 'Late' ? 'warning' : 'danger'}
                className="text-sm px-4 py-2"
              >
                {report.attendance.status}
              </Badge>
            </div>
          </div>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-100 rounded-lg">
                <ClockIcon className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Total Work Hours</p>
                <p className="text-2xl font-bold text-slate-900">{report.summary.totalWorkHours}h</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-100 rounded-lg">
                <ChartBarIcon className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Break Hours</p>
                <p className="text-2xl font-bold text-slate-900">{report.summary.totalBreakHours}h</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-100 rounded-lg">
                <UserCircleIcon className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Net Work Hours</p>
                <p className="text-2xl font-bold text-slate-900">{report.summary.netWorkHours}h</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-100 rounded-lg">
                <DocumentTextIcon className="w-6 h-6 text-purple-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-slate-600">Sessions & Punches</p>
                <p className="text-2xl font-bold text-slate-900">{report.summary.sessionCount}</p>
                <p className="text-[10px] text-slate-500 font-bold mt-1">
                  Biometric: {biometricPunchCount} | Portal: {portalPunchCount}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Attendance Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-indigo-600" />
              Attendance Details
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-slate-600">Date:</span>
                <span className="font-medium">{formatDate(report.attendance.date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Check In:</span>
                <span className="font-medium">{formatTime(report.attendance.checkInTime)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Check Out:</span>
                <span className="font-medium">{formatTime(report.attendance.checkOutTime)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Total Hours:</span>
                <span className="font-medium">{report.attendance.totalHours}h</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Location:</span>
                <span className="font-medium text-right max-w-[200px] truncate">
                  {report.attendance.location_name || report.attendance.checkInLocation || 'N/A'}
                </span>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <MapPinIcon className="w-5 h-5 text-rose-600" />
              Location Information
            </h3>
            <div className="space-y-4">
              <div>
                <span className="text-slate-600 block mb-2">Check-in Location:</span>
                <p className="font-medium">{report.attendance.location_name || report.attendance.checkInLocation || 'Not captured'}</p>
                {report.attendance.latitude && report.attendance.longitude && (
                  <p className="text-sm text-slate-500 mt-1">
                    {report.attendance.latitude.toFixed(6)}, {report.attendance.longitude.toFixed(6)}
                  </p>
                )}
              </div>
              <div>
                <span className="text-slate-600 block mb-2">Check-out Location:</span>
                <p className="font-medium">{report.attendance.checkOutLocation || 'Not captured'}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Sessions Timeline */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
            <ClockIcon className="w-5 h-5 text-indigo-600" />
            Session Timeline
          </h3>
          <div className="space-y-4">
            {report.sessions.map((session, idx) => (
              <div key={session.id} className="border-l-4 border-indigo-500 pl-6 py-4 bg-slate-50 rounded-r-lg">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-indigo-600">Session #{idx + 1}</span>
                  <Badge variant="ghost" className="text-xs">
                    {formatDuration(session.duration)}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Check In</p>
                    <p className="font-medium">{formatTime(session.checkInTime)}</p>
                    <p className="text-sm text-slate-500">{session.location_name || session.checkInLocation || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Check Out</p>
                    <p className="font-medium">{formatTime(session.checkOutTime)}</p>
                    <p className="text-sm text-slate-500">{session.checkOutLocation || 'N/A'}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AttendanceReport;
