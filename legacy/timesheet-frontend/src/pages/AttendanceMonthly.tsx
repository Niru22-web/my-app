import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeftIcon, 
  CalendarIcon, 
  ChartBarIcon, 
  UserCircleIcon,
  ArrowDownTrayIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import API from '../api';
import Card from '../components/ui/Card';
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { resolveAssetUrl } from '../utils/assetUtils';
import { toast } from 'react-toastify';
import ASALoader from '../components/ui/ASALoader';

interface DailyStats {
  date: string;
  status: string;
  totalHours: number;
  sessionCount: number;
  checkInTime: string;
  checkOutTime: string;
  isWeekend: boolean;
}

interface TrendsEmployee {
  firstName: string;
  lastName: string;
  employeeId: string;
  designation?: string;
  profile?: {
    profileImage?: string;
  };
}

interface MonthlyTrends {
  employee: TrendsEmployee;
  month: string;
  period: {
    startDate: Date;
    endDate: Date;
    totalDays: number;
  };
  dailyStats: DailyStats[];
  summary: {
    presentDays: number;
    absentDays: number;
    lateDays: number;
    totalWorkingHours: string;
    avgDailyHours: string;
    attendanceRate: string;
  };
}

const AttendanceMonthly: React.FC = () => {
  const { employeeId } = useParams<{ employeeId: string }>();
  const navigate = useNavigate();
  const [trends, setTrends] = useState<MonthlyTrends | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

  useEffect(() => {
    const fetchTrends = async () => {
      try {
        setLoading(true);
        setError(false);
        const response = await API.get(`/attendance/monthly?employeeId=${employeeId}&month=${selectedMonth}`);
        setTrends(response.data.data);
      } catch (error) {
        console.error('Failed to fetch monthly trends:', error);
        setError(true);
        toast.error('Failed to load monthly trends');
      } finally {
        setLoading(false);
      }
    };

    if (employeeId && selectedMonth) {
      fetchTrends();
    }
  }, [employeeId, selectedMonth]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, { 
      day: 'numeric', 
      month: 'short' 
    });
  };

  const formatMonth = (monthString: string) => {
    const [year, month] = monthString.split('-');
    return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString(undefined, { 
      month: 'long', 
      year: 'numeric' 
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Present': return 'success';
      case 'Late': return 'warning';
      case 'Absent': return 'danger';
      default: return 'ghost';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Present': return CheckCircleIcon;
      case 'Late': return ClockIcon;
      case 'Absent': return XCircleIcon;
      default: return DocumentTextIcon;
    }
  };

  const handleExport = () => {
    if (!trends) return;
    
    const csvContent = [
      ['Monthly Attendance Report', ''],
      ['Employee', `${trends.employee.firstName} ${trends.employee.lastName}`],
      ['Employee ID', trends.employee.employeeId],
      ['Month', formatMonth(trends.month)],
      [''],
      ['Summary', ''],
      ['Present Days', trends.summary.presentDays.toString()],
      ['Absent Days', trends.summary.absentDays.toString()],
      ['Late Days', trends.summary.lateDays.toString()],
      ['Total Working Hours', trends.summary.totalWorkingHours + 'h'],
      ['Average Daily Hours', trends.summary.avgDailyHours + 'h'],
      ['Attendance Rate', trends.summary.attendanceRate + '%'],
      [''],
      ['Daily Breakdown', ''],
      ['Date', 'Status', 'Hours Worked', 'Sessions', 'Check In', 'Check Out'],
      ...trends.dailyStats.map(day => [
        formatDate(day.date),
        day.status,
        day.totalHours + 'h',
        day.sessionCount.toString(),
        day.checkInTime ? new Date(day.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--',
        day.checkOutTime ? new Date(day.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `monthly_attendance_${employeeId}_${trends.month}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Monthly report exported successfully');
  };

  if (loading) {
    return <ASALoader fullPage size="lg" text="Loading monthly trends..." />;
  }

  if (error || !trends) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <DocumentTextIcon className="w-16 h-16 text-rose-500 mx-auto mb-4" />
          <p className="text-slate-900 font-semibold mb-4">Failed to load monthly trends</p>
          <Button onClick={() => navigate(-1)} className="bg-indigo-600">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

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
              <h1 className="text-3xl font-bold text-slate-900">Monthly Attendance Trends</h1>
              <p className="text-slate-600 mt-1">
                Attendance analysis for {formatMonth(trends.month)}
              </p>
            </div>
            <div className="flex items-center gap-3 mt-4 md:mt-0">
              <div className="flex items-center gap-2">
                <select
                  value={selectedMonth.split('-')[1] || '01'}
                  onChange={(e) => {
                    const [currYear] = selectedMonth.split('-');
                    setSelectedMonth(`${currYear}-${e.target.value}`);
                  }}
                  title="Select month"
                  aria-label="Select month"
                  className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-semibold bg-white dark:bg-secondary-800 dark:border-secondary-700 dark:text-white"
                >
                  <option value="01">January</option>
                  <option value="02">February</option>
                  <option value="03">March</option>
                  <option value="04">April</option>
                  <option value="05">May</option>
                  <option value="06">June</option>
                  <option value="07">July</option>
                  <option value="08">August</option>
                  <option value="09">September</option>
                  <option value="10">October</option>
                  <option value="11">November</option>
                  <option value="12">December</option>
                </select>

                <select
                  value={selectedMonth.split('-')[0] || '2026'}
                  onChange={(e) => {
                    const [, currMonth] = selectedMonth.split('-');
                    setSelectedMonth(`${e.target.value}-${currMonth}`);
                  }}
                  title="Select year"
                  aria-label="Select year"
                  className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-semibold bg-white dark:bg-secondary-800 dark:border-secondary-700 dark:text-white"
                >
                  {Array.from({ length: 7 }, (_, i) => String(2023 + i)).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <Button 
                onClick={handleExport}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <ArrowDownTrayIcon className="w-5 h-5 mr-2" />
                Export Report
              </Button>
            </div>
          </div>
        </div>

        {/* Employee Info Card */}
        <Card className="mb-8 p-6">
          <div className="flex items-center gap-4">
            <Avatar 
              src={trends.employee.profile?.profileImage ? resolveAssetUrl(trends.employee.profile.profileImage) : undefined}
              name={`${trends.employee.firstName} ${trends.employee.lastName}`}
              size="lg"
            />
            <div className="flex-1">
              <h2 className="text-xl font-bold text-slate-900">
                {trends.employee.firstName} {trends.employee.lastName}
              </h2>
              <p className="text-slate-600">{trends.employee.employeeId}</p>
              <Badge variant="secondary" className="mt-2">
                {trends.employee.designation || 'Employee'}
              </Badge>
            </div>
          </div>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <Card className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-100 rounded-lg">
                <CheckCircleIcon className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Present Days</p>
                <p className="text-2xl font-bold text-slate-900">{trends.summary.presentDays}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-100 rounded-lg">
                <XCircleIcon className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Absent Days</p>
                <p className="text-2xl font-bold text-slate-900">{trends.summary.absentDays}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-100 rounded-lg">
                <ClockIcon className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Late Days</p>
                <p className="text-2xl font-bold text-slate-900">{trends.summary.lateDays}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-100 rounded-lg">
                <ChartBarIcon className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Total Hours</p>
                <p className="text-2xl font-bold text-slate-900">{trends.summary.totalWorkingHours}h</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-100 rounded-lg">
                <UserCircleIcon className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Attendance Rate</p>
                <p className="text-2xl font-bold text-slate-900">{trends.summary.attendanceRate}%</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Daily Breakdown */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-indigo-600" />
            Daily Breakdown
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Date</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Hours</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Sessions</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Check In</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Check Out</th>
                </tr>
              </thead>
              <tbody>
                {trends.dailyStats.map((day, idx) => {
                  const StatusIcon = getStatusIcon(day.status);
                  return (
                    <tr key={idx} className={`border-b border-slate-100 hover:bg-slate-50 ${day.isWeekend ? 'bg-slate-50' : ''}`}>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{formatDate(day.date)}</span>
                          {day.isWeekend && <Badge variant="ghost" className="text-xs">Weekend</Badge>}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={getStatusColor(day.status)} className="text-xs">
                          <StatusIcon className="w-3 h-3 mr-1 inline" />
                          {day.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium">{day.totalHours}h</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-slate-600">{day.sessionCount}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm">
                          {day.checkInTime ? new Date(day.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm">
                          {day.checkOutTime ? new Date(day.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AttendanceMonthly;
