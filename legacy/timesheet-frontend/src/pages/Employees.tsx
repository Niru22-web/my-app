import React, { useState, useEffect, useRef, useCallback } from 'react';
import API from '../api';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import * as XLSX from "xlsx";
import {
  MagnifyingGlassIcon,
  PencilSquareIcon,
  TrashIcon,
  PlusIcon,
  EyeIcon,
  PaperAirplaneIcon,
  DocumentIcon,
  FolderOpenIcon,
  ArrowDownTrayIcon,
  CloudArrowUpIcon,
  EnvelopeIcon,
  CalendarIcon,
  MapPinIcon,
  UserGroupIcon,
  ChatBubbleLeftRightIcon,
  BriefcaseIcon,
  BuildingOfficeIcon,
  IdentificationIcon,
  PhotoIcon,
  ChevronDownIcon,
  CheckCircleIcon,
  DocumentChartBarIcon,
  ArrowUpTrayIcon,
  ExclamationTriangleIcon,
  Squares2X2Icon,
  ListBulletIcon
} from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext';
import FAB from '../components/FAB';
import { motion, AnimatePresence } from 'framer-motion';

// UI Components
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Avatar from '../components/ui/Avatar';
import { Skeleton, SkeletonCircle } from '../components/ui/Skeleton';
import TableSkeleton from '../components/ui/TableSkeleton';
import CardSkeleton from '../components/ui/CardSkeleton';
import ASALoader from '../components/ui/ASALoader';
import HierarchySelect from '../components/ui/HierarchySelect';
import MultiSelect from '../components/ui/MultiSelect';

export interface AxiosErrorLike {
  response?: {
    status?: number;
    data?: {
      error?: string;
      message?: string;
      success?: boolean;
    };
  };
  message?: string;
  code?: string;
}

export interface NestedPartner {
  id?: string;
  partnerId?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  partner?: Partial<Employee>;
}

export interface NestedManager {
  id?: string;
  managerId?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  manager?: Partial<Employee>;
}

interface EmployeeDocument {
  id: string;
  employeeId: string;
  title: string;
  category: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
  uploadedBy?: string;
}

interface MasterOption {
  id: string;
  name: string;
}

interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  officeEmail?: string;
  phone?: string;
  role: string;
  designation: string;
  department: string;
  status: 'Active' | 'Inactive' | 'On Leave' | 'active' | 'pending' | 'rejected';
  joinDate: string;
  joining_date?: string;
  createdAt: string;
  updatedAt?: string;
  profileImage?: string;
  loggedHours?: number | null;
  partnerIds?: string[];
  managerIds?: string[];
  reportingPartnerIds?: string[];
  reportingManagerIds?: string[];
  subManagerIds?: string[];
  partnerId?: string | null;
  managerId?: string | null;
  subManagerId?: string | null;
  partners?: NestedPartner[];
  managers?: NestedManager[];
  partner?: Employee | null;
  manager?: Employee | null;
  subManager?: Employee | null;
  subManagers?: { id: string; name: string }[];
  profile?: {
    profileImage?: string;
    dob?: string;
    doj?: string;
    education?: string;
    maritalStatus?: string;
    gender?: string;
    permanentAddress?: string;
    currentAddress?: string;
    currentPinCode?: string;
    pan?: string;
    aadhaar?: string;
    personalEmail?: string;
    personalMobile?: string;
    guardianNumber?: string;
    guardianAddress?: string;
    guardianName?: string;
    accountHolderName?: string;
    bankAccountNumber?: string;
    bankName?: string;
    branchName?: string;
    ifscCode?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    emergencyContactRelation?: string;
    salary?: number;
    seniorityLevel?: string;
    experience?: string;
    employmentType?: string;
    skills?: string[];
    joining_date?: string;
    panFileUrl?: string;
    aadhaarFileUrl?: string;
    bankStatementFileUrl?: string;
    employmentTypeId?: string | null;
  };
  attachments?: {
    panFile?: string;
    aadhaarFile?: string;
    profileImage?: string;
    bankStatement?: string;
  };
  hasActiveRegistrationToken?: boolean;
  registrationTokenExpiry?: string;
  roleId?: string | null;
  designationId?: string | null;
  departmentId?: string | null;
  shiftId?: string | null;
  locationId?: string | null;
}

interface EnhancedEmployeeDetails {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  officeEmail: string;
  email?: string;
  phone?: string;
  address?: string;
  date_of_birth?: string;
  gender?: string;
  role: string;
  department: string;
  designation: string;
  status: string;
  partnerId?: string | null;
  managerId?: string | null;
  subManagerId?: string | null;
  subManager?: Employee | null;
  subManagers?: { id: string; name: string }[];
  manager?: Employee | null;
  partner?: Employee | null;
  createdAt: string;
  updatedAt?: string;
  profileImage?: string;
  partnerIds?: string[];
  managerIds?: string[];
  reportingPartnerIds?: string[];
  reportingManagerIds?: string[];
  subManagerIds?: string[];
  partners?: NestedPartner[];
  managers?: NestedManager[];

  profile?: {
    dob?: string;
    doj?: string;
    education?: string;
    maritalStatus?: string;
    gender?: string;
    permanentAddress?: string;
    currentAddress?: string;
    pan?: string;
    aadhaar?: string;
    panFileUrl?: string;
    aadhaarFileUrl?: string;
    currentPinCode?: string;
    guardianAddress?: string;
    guardianName?: string;
    guardianNumber?: string;
    personalEmail?: string;
    personalMobile?: string;
    profileImage?: string;
    accountHolderName?: string;
    bankAccountNumber?: string;
    bankName?: string;
    branchName?: string;
    ifscCode?: string;
    bankStatementFileUrl?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    emergencyContactRelation?: string;
    employmentType?: string;
  };
  hasActiveRegistrationToken?: boolean;
  registrationTokenExpiry?: string;
  stats?: {
    projectsCount: number;
    hoursCount: number;
    tasksCount: number;
    teamCount: number;
  };
}

const EmployeeCard = ({ employee, isSelected, onSelect, onView, onEdit, onDelete, canEdit }: {
  employee: Employee;
  isSelected: boolean;
  onSelect: () => void;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canEdit: boolean;
}) => {
  const { user } = useAuth();
  const userRole = user?.role?.toLowerCase() || '';
  const isRegularEmployee = userRole === 'employee' || userRole === 'user';
  const email = employee.officeEmail || employee.email;
  const status = (employee.status || '').toLowerCase();
  
  const statusConfig: Record<string, { bg: string, text: string, dot: string }> = {
    active: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-100', text: 'Active', dot: 'bg-emerald-500' },
    pending: { bg: 'bg-amber-50 text-amber-700 border-amber-100', text: 'Pending', dot: 'bg-amber-500' },
    rejected: { bg: 'bg-red-50 text-red-700 border-red-100', text: 'Rejected', dot: 'bg-red-500' },
    inactive: { bg: 'bg-gray-50 text-gray-700 border-gray-100', text: 'Inactive', dot: 'bg-gray-400' },
    'on leave': { bg: 'bg-indigo-50 text-indigo-700 border-indigo-100', text: 'On Leave', dot: 'bg-indigo-500' }
  };
  const statusStyle = statusConfig[status] || { bg: 'bg-gray-50 text-gray-700 border-gray-100', text: employee.status || 'Active', dot: 'bg-gray-400' };
  const isCardSelectable = !isRegularEmployee || employee.id === user?.id;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={isCardSelectable ? { y: -2 } : undefined}
      onClick={() => isCardSelectable && onSelect()}
      className={`group relative bg-white rounded-2xl border transition-all duration-200 overflow-hidden flex flex-col ${
        isCardSelectable ? 'cursor-pointer hover:border-blue-200 hover:shadow-md' : 'cursor-default'
      } ${
        isSelected
          ? 'ring-2 ring-blue-500 border-transparent shadow-lg'
          : 'border-gray-100'
      }`}
    >
      {/* Coloured top strip */}
      <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-indigo-500 shrink-0" />

      {/* Card Body — horizontal layout */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 flex-1 min-w-0">
        {/* Avatar */}
        <div className="shrink-0">
          <Avatar
            src={employee.profileImage}
            name={`${employee.firstName} ${employee.lastName}`}
            size="sm"
            border
            updatedAt={employee.updatedAt}
            className="w-9 h-9 shadow-sm"
          />
        </div>

        {/* Info stack */}
        <div className="flex-1 min-w-0">
          <h3 className="text-[11px] font-bold text-gray-900 group-hover:text-blue-600 transition-colors truncate leading-tight">
            {employee.firstName} {employee.lastName}
          </h3>
          <p className="text-[9px] text-gray-500 font-medium truncate leading-tight">{employee.designation || employee.role}</p>
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            <span className="px-1.5 py-px bg-gray-50 border border-gray-100 text-gray-500 rounded text-[8px] font-semibold">{employee.employeeId}</span>
            <span className={`inline-flex items-center gap-0.5 px-1.5 py-px rounded text-[8px] font-bold border uppercase ${statusStyle.bg}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
              {statusStyle.text}
            </span>
            {employee.loggedHours !== undefined && employee.loggedHours !== null && (
              <span className="px-1.5 py-px bg-blue-50 border border-blue-100 text-blue-600 rounded text-[8px] font-bold">
                {Number(employee.loggedHours).toFixed(1)} hrs
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Actions footer */}
      <div className="px-2.5 py-1.5 border-t border-gray-50 bg-gray-50/40 flex items-center justify-between shrink-0">
        <div className="flex gap-1">
          {!isRegularEmployee && (
            <button
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); onView(); }}
              className="p-0.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
              title="View Details"
            >
              <EyeIcon className="w-3 h-3" />
            </button>
          )}
          {canEdit && !isRegularEmployee && (
            <button
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); onEdit(); }}
              className="p-0.5 rounded text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
              title="Edit"
            >
              <PencilSquareIcon className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              if (email) window.location.href = `mailto:${email}`;
            }}
            className="p-0.5 rounded text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all"
            title={email}
          >
            <EnvelopeIcon className="w-3 h-3" />
          </button>
        </div>
        {canEdit && !isRegularEmployee && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-0.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
            title="Delete"
          >
            <TrashIcon className="w-3 h-3" />
          </button>
        )}
      </div>
    </motion.div>
  );
};

const getJoiningDateDisplay = (emp: Employee) => {
  const dateStr = emp.profile?.doj || emp.joining_date || emp.joinDate;
  if (!dateStr) return 'N/A';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return 'N/A';
  }
};

const getRoleBadgeStyle = (roleName: string) => {
  const role = (roleName || '').toLowerCase();
  switch (role) {
    case 'admin':
      return 'bg-red-50 text-red-700 border-red-100';
    case 'hr':
      return 'bg-pink-50 text-pink-700 border-pink-100';
    case 'it':
      return 'bg-purple-50 text-purple-700 border-purple-100';
    case 'manager':
      return 'bg-blue-50 text-blue-700 border-blue-100';
    case 'partner':
      return 'bg-amber-50 text-amber-700 border-amber-100';
    case 'accounts':
    case 'accounts_admin':
    case 'accounts_manager':
    case 'accounts_executive':
      return 'bg-cyan-50 text-cyan-700 border-cyan-100';
    case 'employee':
    default:
      return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  }
};

const EmployeeListView = ({
  employees,
  isSelected,
  onSelect,
  onView,
  onEdit,
  onDocs,
  onDelete,
  canEdit,
  onResendEmail,
  onToggleStatus,
  selectMode = false,
  selectedEmployeeIds = [],
  onSelectionChange
}: {
  employees: Employee[];
  isSelected: (emp: Employee) => boolean;
  onSelect: (emp: Employee) => void;
  onView: (emp: Employee) => void;
  onEdit: (emp: Employee) => void;
  onDocs: (emp: Employee) => void;
  onDelete: (emp: Employee) => void;
  canEdit: boolean;
  onResendEmail: (emp: Employee) => void;
  onToggleStatus: (emp: Employee) => void;
  selectMode?: boolean;
  selectedEmployeeIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
}) => {
  const { user } = useAuth();
  const userRole = user?.role?.toLowerCase() || '';
  const isRegularEmployee = userRole === 'employee' || userRole === 'user';
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const statusConfig: Record<string, { bg: string, text: string, dot: string }> = {
    active: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-1 ring-emerald-200/50', text: 'Active', dot: 'bg-emerald-500' },
    pending: { bg: 'bg-amber-50 text-amber-700 border-amber-200 ring-1 ring-amber-200/50', text: 'Pending', dot: 'bg-amber-400' },
    rejected: { bg: 'bg-red-50 text-red-700 border-red-200 ring-1 ring-red-200/50', text: 'Rejected', dot: 'bg-red-500' },
    inactive: { bg: 'bg-slate-100 text-slate-500 border-slate-200 ring-1 ring-slate-200/50', text: 'Inactive', dot: 'bg-slate-400' },
    'on leave': { bg: 'bg-violet-50 text-violet-700 border-violet-200 ring-1 ring-violet-200/50', text: 'On Leave', dot: 'bg-violet-500' }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* 📱 Mobile Employee Cards (Visible < 1024px) */}
      <div className="lg:hidden flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2.5">
        {employees.length === 0 ? (
          <div className="py-16 text-center text-sm font-bold text-gray-400">No employees found.</div>
        ) : (
          employees.map((emp) => {
            const email = emp.officeEmail || emp.email;
            const status = (emp.status || '').toLowerCase();
            const statusStyle = statusConfig[status] || { bg: 'bg-slate-100 text-slate-500 border-slate-200', text: emp.status || 'Active', dot: 'bg-slate-400' };
            const selected = isSelected(emp);
            const isRowSelectable = !isRegularEmployee || emp.id === user?.id;

            return (
              <div
                key={emp.id}
                onClick={() => {
                  if (selectMode) {
                    const checked = selectedEmployeeIds.includes(emp.id);
                    if (checked) {
                      onSelectionChange?.(selectedEmployeeIds.filter(id => id !== emp.id));
                    } else {
                      onSelectionChange?.([...selectedEmployeeIds, emp.id]);
                    }
                  } else {
                    isRowSelectable && onSelect(emp);
                  }
                }}
                className={`p-4 rounded-2xl border space-y-3 transition-all ${
                  selected
                    ? 'bg-blue-50/70 border-blue-200 shadow-[inset_3px_0_0_#3b82f6]'
                    : 'bg-white border-slate-100 shadow-sm'
                } ${isRowSelectable ? 'cursor-pointer' : 'cursor-default'}`}
              >
                {/* Header: avatar, name, status */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {selectMode && (
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer shrink-0"
                        checked={selectedEmployeeIds.includes(emp.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            onSelectionChange?.([...selectedEmployeeIds, emp.id]);
                          } else {
                            onSelectionChange?.(selectedEmployeeIds.filter(id => id !== emp.id));
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    <div className="relative w-fit shrink-0">
                      <Avatar
                        src={emp.profileImage}
                        name={`${emp.firstName} ${emp.lastName}`}
                        size="sm"
                        updatedAt={emp.updatedAt}
                        className="w-9 h-9 ring-2 ring-white shadow-sm"
                      />
                      <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${statusStyle.dot}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 text-sm leading-tight truncate">
                        {emp.firstName} {emp.lastName}
                      </p>
                      <p className="text-xs text-gray-400 font-medium truncate" title={email}>{email}</p>
                    </div>
                  </div>
                  <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border shrink-0 ${statusStyle.bg}`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusStyle.dot} ${status === 'active' ? 'animate-pulse' : ''}`} />
                    {statusStyle.text}
                  </div>
                </div>

                {/* Meta chips */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black tracking-wider bg-slate-100 text-slate-600 border border-slate-200 font-mono">
                    {emp.employeeId}
                  </span>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider border ${getRoleBadgeStyle(emp.role)}`}>
                    {emp.role || 'Employee'}
                  </span>
                  {emp.designation && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-50 text-slate-600 border border-slate-200">
                      {emp.designation}
                    </span>
                  )}
                  {emp.department && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-50 text-slate-600 border border-slate-200">
                      {emp.department}
                    </span>
                  )}
                </div>

                {/* Footer: joined / hours + actions */}
                <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-50">
                  <div className="text-xs text-gray-500 font-medium">
                    Joined {getJoiningDateDisplay(emp)}
                    {emp.loggedHours !== undefined && emp.loggedHours !== null && (
                      <> • <span className="font-black text-blue-600">{Number(emp.loggedHours).toFixed(1)}</span> hrs</>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {!isRegularEmployee && (
                      <button
                        onClick={() => onView(emp)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-all shadow-sm"
                        title="View Details"
                      >
                        <EyeIcon className="w-4 h-4" />
                      </button>
                    )}
                    {canEdit && !isRegularEmployee && (
                      <button
                        onClick={() => onEdit(emp)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-gray-200 hover:border-violet-300 hover:bg-violet-50 text-gray-400 hover:text-violet-600 transition-all shadow-sm"
                        title="Edit Onboarding"
                      >
                        <PencilSquareIcon className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => { if (email) window.location.href = `mailto:${email}`; }}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 transition-all shadow-sm"
                      title={`Email ${emp.firstName}`}
                    >
                      <EnvelopeIcon className="w-4 h-4" />
                    </button>
                    {!isRegularEmployee && (
                      <div className="relative">
                        <button
                          onClick={() => setActiveMenuId(activeMenuId === emp.id ? null : emp.id)}
                          className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-all shadow-sm ${
                            activeMenuId === emp.id
                              ? 'bg-slate-100 border-slate-300 text-slate-700'
                              : 'bg-white border-gray-200 hover:border-gray-300 text-gray-400 hover:text-gray-600'
                          }`}
                          title="More actions"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>
                        </button>

                        {activeMenuId === emp.id && (
                          <div
                            ref={menuRef}
                            className="absolute right-0 mt-2 w-52 bg-white border border-gray-100 rounded-2xl shadow-2xl shadow-black/10 py-2 z-30 origin-top-right"
                          >
                            <div className="px-3 py-1.5 border-b border-gray-50 mb-1">
                              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest truncate">{emp.firstName} {emp.lastName}</p>
                            </div>
                            <button
                              onClick={() => {
                                setActiveMenuId(null);
                                onDocs(emp);
                              }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-all"
                            >
                              <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                                <FolderOpenIcon className="w-3.5 h-3.5 text-blue-600" />
                              </div>
                              View Documents
                            </button>

                            {canEdit && (
                              <>
                                <button
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    onToggleStatus(emp);
                                  }}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold text-gray-700 hover:bg-amber-50 hover:text-amber-700 transition-all"
                                >
                                  <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                                    <IdentificationIcon className="w-3.5 h-3.5 text-amber-600" />
                                  </div>
                                  Mark as {status === 'active' ? 'Inactive' : 'Active'}
                                </button>

                                <button
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    onResendEmail(emp);
                                  }}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition-all"
                                >
                                  <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                                    <PaperAirplaneIcon className="w-3.5 h-3.5 text-emerald-600" />
                                  </div>
                                  Resend Reg Email
                                </button>

                                <div className="border-t border-gray-100 my-2 mx-3" />

                                <button
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    onDelete(emp);
                                  }}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition-all"
                                >
                                  <div className="w-6 h-6 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                                    <TrashIcon className="w-3.5 h-3.5 text-red-500" />
                                  </div>
                                  Delete Employee
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 🖥️ Desktop Employee Table (Visible ≥ 1024px) */}
      <div className="hidden lg:flex flex-col flex-1 min-h-0 table-wrapper rounded-2xl bg-white overflow-auto custom-scrollbar" style={{boxShadow: '0 1px 3px 0 rgba(0,0,0,0.04), 0 4px 24px 0 rgba(59,130,246,0.04)'}}>
      <table className="w-full text-left min-w-[1100px]">
        <thead>
          <tr className="sticky top-0 z-10" style={{background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #1e40af 100%)'}}>
            {selectMode && (
              <th className="py-2.5 px-4 w-10">
                <input
                  type="checkbox"
                  className="rounded border-slate-500 text-blue-400 focus:ring-blue-400 w-4 h-4 cursor-pointer"
                  checked={employees.length > 0 && selectedEmployeeIds.length === employees.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onSelectionChange?.(employees.map(emp => emp.id));
                    } else {
                      onSelectionChange?.([]);
                    }
                  }}
                  aria-label="Select all employees"
                />
              </th>
            )}
            <th className="py-2.5 px-4 w-14">
              <span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.12em]">Photo</span>
            </th>
            <th className="py-2.5 px-4">
              <span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.12em]">Employee</span>
            </th>
            <th className="py-2.5 px-4">
              <span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.12em]">EMP ID</span>
            </th>
            <th className="py-2.5 px-4">
              <span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.12em]">Role</span>
            </th>
            <th className="py-2.5 px-4">
              <span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.12em]">Designation</span>
            </th>
            <th className="py-2.5 px-4">
              <span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.12em]">Department</span>
            </th>
            <th className="py-2.5 px-4">
              <span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.12em]">Email</span>
            </th>
            <th className="py-2.5 px-4">
              <span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.12em]">Status</span>
            </th>
            <th className="py-2.5 px-4">
              <span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.12em]">Joined</span>
            </th>
            <th className="py-2.5 px-4">
              <span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.12em]">Hours</span>
            </th>
            <th className="py-2.5 px-4 text-right">
              <span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.12em]">{isRegularEmployee ? 'Contact' : 'Actions'}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {employees.map((emp, index) => {
            const email = emp.officeEmail || emp.email;
            const selected = isSelected(emp);
            const status = (emp.status || '').toLowerCase();

            const statusStyle = statusConfig[status] || { bg: 'bg-slate-100 text-slate-500 border-slate-200', text: emp.status || 'Active', dot: 'bg-slate-400' };
            const isRowSelectable = !isRegularEmployee || emp.id === user?.id;

            return (
              <tr
                key={emp.id}
                onClick={(e) => {
                  if (selectMode) {
                    const checked = selectedEmployeeIds.includes(emp.id);
                    if (checked) {
                      onSelectionChange?.(selectedEmployeeIds.filter(id => id !== emp.id));
                    } else {
                      onSelectionChange?.([...selectedEmployeeIds, emp.id]);
                    }
                  } else {
                    isRowSelectable && onSelect(emp);
                  }
                }}
                className={`group/row transition-all duration-100 ${
                  isRowSelectable ? 'cursor-pointer' : 'cursor-default'
                } ${
                  selected
                    ? 'bg-blue-50/70 shadow-[inset_3px_0_0_#3b82f6]'
                    : index % 2 === 0
                    ? 'bg-white hover:bg-slate-50/80'
                    : 'bg-slate-50/40 hover:bg-slate-50/80'
                }`}
              >
                {selectMode && (
                  <td className="py-2 px-4 w-10" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                      checked={selectedEmployeeIds.includes(emp.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          onSelectionChange?.([...selectedEmployeeIds, emp.id]);
                        } else {
                          onSelectionChange?.(selectedEmployeeIds.filter(id => id !== emp.id));
                        }
                      }}
                    />
                  </td>
                )}
                <td className="py-2 px-4">
                  <div className="relative w-fit">
                    <Avatar
                      src={emp.profileImage}
                      name={`${emp.firstName} ${emp.lastName}`}
                      size="sm"
                      updatedAt={emp.updatedAt}
                      className="w-8 h-8 ring-2 ring-white shadow-sm"
                    />
                    <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${statusStyle.dot}`} />
                  </div>
                </td>
                <td className="py-2 px-4">
                  <div>
                    <div className="font-bold text-gray-900 group-hover/row:text-blue-700 transition-colors text-[13px] leading-tight">
                      {emp.firstName} {emp.lastName}
                    </div>
                    <div className="text-[11px] text-gray-400 font-medium truncate max-w-[150px]" title={email}>{email}</div>
                  </div>
                </td>
                <td className="py-2 px-4">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black tracking-wider bg-slate-100 text-slate-600 border border-slate-200 font-mono">
                    {emp.employeeId}
                  </span>
                </td>
                <td className="py-2 px-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider border ${getRoleBadgeStyle(emp.role)}`}>
                    {emp.role || 'Employee'}
                  </span>
                </td>
                <td className="py-2 px-4">
                  <span className="text-[12px] font-semibold text-gray-700">{emp.designation || '—'}</span>
                </td>
                <td className="py-2 px-4">
                  <span className="text-[12px] font-semibold text-gray-600">{emp.department || '—'}</span>
                </td>
                <td className="py-2 px-4">
                  <div className="flex items-center gap-1 max-w-[180px]">
                    <EnvelopeIcon className="w-3 h-3 text-slate-400 shrink-0" />
                    <span
                      className="text-[11px] text-blue-600 hover:underline truncate cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); if (email) window.location.href = `mailto:${email}`; }}
                    >
                      {email}
                    </span>
                  </div>
                </td>
                <td className="py-2 px-4">
                  <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border ${statusStyle.bg}`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusStyle.dot} ${status === 'active' ? 'animate-pulse' : ''}`} />
                    {statusStyle.text}
                  </div>
                </td>
                <td className="py-2 px-4">
                  <div className="flex items-center gap-1">
                    <CalendarIcon className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="text-[11px] text-gray-600 font-medium">{getJoiningDateDisplay(emp)}</span>
                  </div>
                </td>
                <td className="py-2 px-4">
                  {emp.loggedHours !== undefined && emp.loggedHours !== null ? (
                    <div className="flex items-center gap-1">
                      <span className="text-[12px] font-black text-blue-600">{Number(emp.loggedHours).toFixed(1)}</span>
                      <span className="text-[10px] text-gray-400 font-semibold">hrs</span>
                    </div>
                  ) : (
                    <span className="text-[11px] text-gray-300 font-medium">—</span>
                  )}
                </td>
                <td className="py-2 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1.5 relative">
                    {!isRegularEmployee && (
                      <button
                        onClick={() => onView(emp)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-all shadow-sm"
                        title="View Details"
                      >
                        <EyeIcon className="w-4 h-4" />
                      </button>
                    )}
                    
                    {canEdit && !isRegularEmployee && (
                      <button
                        onClick={() => onEdit(emp)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-gray-200 hover:border-violet-300 hover:bg-violet-50 text-gray-400 hover:text-violet-600 transition-all shadow-sm"
                        title="Edit Onboarding"
                      >
                        <PencilSquareIcon className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      onClick={() => { if (email) window.location.href = `mailto:${email}`; }}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 transition-all shadow-sm"
                      title={`Email ${emp.firstName}`}
                    >
                      <EnvelopeIcon className="w-4 h-4" />
                    </button>

                    {/* 3-dots actions menu */}
                    {!isRegularEmployee && (
                      <div className="relative">
                        <button
                          onClick={() => setActiveMenuId(activeMenuId === emp.id ? null : emp.id)}
                          className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-all shadow-sm ${
                            activeMenuId === emp.id
                              ? 'bg-slate-100 border-slate-300 text-slate-700'
                              : 'bg-white border-gray-200 hover:border-gray-300 text-gray-400 hover:text-gray-600'
                          }`}
                          title="More actions"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>
                        </button>

                        {activeMenuId === emp.id && (
                          <div
                            ref={menuRef}
                            className="absolute right-0 mt-2 w-52 bg-white border border-gray-100 rounded-2xl shadow-2xl shadow-black/10 py-2 z-30 origin-top-right"
                          >
                            <div className="px-3 py-1.5 border-b border-gray-50 mb-1">
                              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest truncate">{emp.firstName} {emp.lastName}</p>
                            </div>
                            <button
                              onClick={() => {
                                setActiveMenuId(null);
                                onDocs(emp);
                              }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-all"
                            >
                              <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                                <FolderOpenIcon className="w-3.5 h-3.5 text-blue-600" />
                              </div>
                              View Documents
                            </button>

                            {canEdit && (
                              <>
                                <button
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    onToggleStatus(emp);
                                  }}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold text-gray-700 hover:bg-amber-50 hover:text-amber-700 transition-all"
                                >
                                  <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                                    <IdentificationIcon className="w-3.5 h-3.5 text-amber-600" />
                                  </div>
                                  Mark as {status === 'active' ? 'Inactive' : 'Active'}
                                </button>

                                <button
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    onResendEmail(emp);
                                  }}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition-all"
                                >
                                  <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                                    <PaperAirplaneIcon className="w-3.5 h-3.5 text-emerald-600" />
                                  </div>
                                  Resend Reg Email
                                </button>
                                
                                <div className="border-t border-gray-100 my-2 mx-3" />
                                
                                <button
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    onDelete(emp);
                                  }}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition-all"
                                >
                                  <div className="w-6 h-6 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                                    <TrashIcon className="w-3.5 h-3.5 text-red-500" />
                                  </div>
                                  Delete Employee
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
};

const Employees: React.FC = () => {
  const { user } = useAuth();
  const userRole = user?.role?.toLowerCase() || '';
  const isRegularEmployee = userRole === 'employee' || userRole === 'user';
  const toast = useToast();
  const { confirm } = useConfirm();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [selectedTemplateType, setSelectedTemplateType] = useState<'new' | 'old'>('new');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ type: string; employeeId: string; employeeName: string } | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [enhancedEmployeeDetails, setEnhancedEmployeeDetails] = useState<EnhancedEmployeeDetails | null>(null);
  const [employeeDocuments, setEmployeeDocuments] = useState<EmployeeDocument[]>([]);
  const [showDocumentsModal, setShowDocumentsModal] = useState(false);
  const [showUploadDocumentModal, setShowUploadDocumentModal] = useState(false);
  const [documentTitle, setDocumentTitle] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [documentCategory, setDocumentCategory] = useState('Other');
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [fetchingDocuments, setFetchingDocuments] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // New state for selected employee in right panel
  const [rightPanelEmployee, setRightPanelEmployee] = useState<Employee | null>(null);
  const [drawerTab, setDrawerTab] = useState<'overview' | 'projects' | 'attendance' | 'documents' | 'data'>('overview');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => (localStorage.getItem('employee_view_mode') as 'grid' | 'list') || 'list');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [selectMode, setSelectMode] = useState(false);

  // New states for dynamic monthly attendance details
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceData, setAttendanceData] = useState<{
    summary?: {
      presentDays: number;
      absentDays: number;
      lateDays: number;
      totalWorkingHours: string;
      avgDailyHours: string;
      attendanceRate: string;
    };
    dailyStats?: Array<{
      date: string;
      status: string;
      totalHours: number;
      sessionCount: number;
      checkInTime: string | null;
      checkOutTime: string | null;
      isWeekend: boolean;
    }>;
  } | null>(null);
  const [selectedAttendanceMonth, setSelectedAttendanceMonth] = useState('2026-05');

  const fetchAttendanceData = useCallback(async (empId: string, month: string) => {
    try {
      setAttendanceLoading(true);
      const res = await API.get(`/attendance/monthly?employeeId=${empId}&month=${month}`);
      if (res.data.success) {
        setAttendanceData(res.data.data);
      } else {
        setAttendanceData(null);
      }
    } catch (err) {
      console.error('Error fetching dynamic attendance data:', err);
      setAttendanceData(null);
    } finally {
      setAttendanceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (rightPanelEmployee?.employeeId && drawerTab === 'attendance') {
      fetchAttendanceData(rightPanelEmployee.employeeId, selectedAttendanceMonth);
    }
  }, [rightPanelEmployee?.employeeId, drawerTab, selectedAttendanceMonth, fetchAttendanceData]);

  useEffect(() => {
    localStorage.setItem('employee_view_mode', viewMode);
  }, [viewMode]);

  // Disable parent <main> container scrolling to avoid double scrollbars on employee database page
  useEffect(() => {
    const mainEl = document.querySelector('main');
    let originalOverflowY = '';
    if (mainEl) {
      originalOverflowY = mainEl.style.overflowY || '';
      mainEl.style.overflowY = 'hidden';
    }
    return () => {
      if (mainEl) {
        mainEl.style.overflowY = originalOverflowY;
      }
    };
  }, []);

  // Excel Dropdown state
  const [isExcelMenuOpen, setIsExcelMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const excelFileInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsExcelMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Document categories
  const documentCategories = [
    'Offer Letter',
    'Employment Contract',
    'ID Proof',
    'Address Proof',
    'Salary Slip',
    'Experience Letter',
    'Educational Documents',
    'Other'
  ];

  // Enhanced modal states
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedEmployeeData, setEditedEmployeeData] = useState<EnhancedEmployeeDetails | null>(null);
  const [savingChanges, setSavingChanges] = useState(false);
  const [isOldEmployee, setIsOldEmployee] = useState(false);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partners, setPartners] = useState<Employee[]>([]);
  const [managers, setManagers] = useState<Employee[]>([]);
  const [allEmployeesForReporting, setAllEmployeesForReporting] = useState<Employee[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [partnersLoading, setPartnersLoading] = useState(true);

  const [showPendingApprovals, setShowPendingApprovals] = useState(false);
  const [approvingEmployee, setApprovingEmployee] = useState<string | null>(null);
  const [rejectingEmployee, setRejectingEmployee] = useState<string | null>(null);
  const [openingDocId, setOpeningDocId] = useState<string | null>(null);

  // Check if user has permission to access the page
  useEffect(() => {
    if (user) {
      const userRole = user.role?.toLowerCase() || '';
      const allowedRoles = ['admin', 'manager', 'partner', 'owner', 'hr', 'accounts', 'accounts_admin', 'accounts_manager', 'accounts_executive', 'finance_approver', 'ar_manager', 'ap_manager', 'accountant', 'it', 'employee', 'user'];
      if (!allowedRoles.includes(userRole)) {
        window.location.href = '/dashboard';
      }
    }
  }, [user]);

  // Form states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Employee');
  const [designation, setDesignation] = useState('');
  const [department, setDepartment] = useState('Accounting');
  const [dateOfJoining, setDateOfJoining] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('');
  
  // Multi-select state
  const [selectedPartnerIds, setSelectedPartnerIds] = useState<string[]>([]);
  const [selectedManagerIds, setSelectedManagerIds] = useState<string[]>([]);
  const [selectedSubManagerIds, setSelectedSubManagerIds] = useState<string[]>([]);
  
  const [employeeCode, setEmployeeCode] = useState('');
  const [employeeStatus, setEmployeeStatus] = useState('active');

  // Master options states
  const [roleOptions, setRoleOptions] = useState<MasterOption[]>([]);
  const [designationOptions, setDesignationOptions] = useState<MasterOption[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<MasterOption[]>([]);
  const [shiftOptions, setShiftOptions] = useState<MasterOption[]>([]);
  const [locationOptions, setLocationOptions] = useState<MasterOption[]>([]);
  const [employmentTypeOptions, setEmploymentTypeOptions] = useState<MasterOption[]>([]);

  // Selected master IDs
  const [roleId, setRoleId] = useState('');
  const [designationId, setDesignationId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [employmentTypeId, setEmploymentTypeId] = useState('');

  // Additional dynamic filters
  const [designationFilter, setDesignationFilter] = useState<string[]>([]);
  const hasFetchedMasters = useRef(false);

  const fetchMasterOptions = async () => {
    if (hasFetchedMasters.current) return;
    hasFetchedMasters.current = true;

    const safeGet = async (url: string): Promise<MasterOption[]> => {
      try {
        const res = await API.get(url);
        if (res.data?.success && Array.isArray(res.data.data)) return res.data.data;
        return [];
      } catch (err) {
        const error = err as { response?: { status?: number }; message?: string };
        const status = error?.response?.status;
        if (status !== 404) {
          console.warn(`Master options fetch failed for ${url}:`, error?.message || error);
        }
        return [];
      }
    };

    const [roles, designations, departments, shifts, locations, empTypes] = await Promise.all([
      safeGet('/masters/roles/options'),
      safeGet('/masters/designations/options'),
      safeGet('/masters/departments/options'),
      safeGet('/masters/shifts/options'),
      safeGet('/masters/locations/options'),
      safeGet('/masters/employment-types/options'),
    ]);

    if (roles.length > 0) setRoleOptions(roles);
    if (designations.length > 0) setDesignationOptions(designations);
    if (departments.length > 0) setDepartmentOptions(departments);
    if (shifts.length > 0) setShiftOptions(shifts);
    if (locations.length > 0) setLocationOptions(locations);
    if (empTypes.length > 0) setEmploymentTypeOptions(empTypes);
  };

  useEffect(() => {
    fetchMasterOptions();
  }, []);

  // Filtered partners (for Add/Edit Modal)
  const filteredPartners = partners;

  // Auto-populate fields when Role changes
  useEffect(() => {
    if (role === 'Partner') {
      setSelectedPartnerId('');
    }
  }, [role]);

  // Populate form when editing employee
  useEffect(() => {
    if (editingEmployee && !partnersLoading) {
      console.log('📝 Populating edit form with employee data:', editingEmployee);

      const names = `${editingEmployee?.firstName || ''} ${editingEmployee?.lastName || ''}`.trim().split(' ');
      setFirstName(names[0] || '');
      setLastName(names.slice(1).join(' ') || '');
      setEmail(editingEmployee.officeEmail || editingEmployee.email || '');
      setRole(editingEmployee.role);
      setDesignation(editingEmployee.designation);
      setDepartment(editingEmployee.department || 'Accounting');

      // Fallback matching for legacy records if IDs are empty
      let rId = editingEmployee.roleId || '';
      if (!rId && editingEmployee.role && roleOptions.length > 0) {
        const found = roleOptions.find(opt => opt.name.toLowerCase() === editingEmployee.role.toLowerCase());
        if (found) rId = found.id;
      }
      setRoleId(rId);

      let dId = editingEmployee.designationId || '';
      if (!dId && editingEmployee.designation && designationOptions.length > 0) {
        const found = designationOptions.find(opt => opt.name.toLowerCase() === editingEmployee.designation.toLowerCase());
        if (found) dId = found.id;
      }
      setDesignationId(dId);

      let deptIdVal = editingEmployee.departmentId || '';
      if (!deptIdVal && editingEmployee.department && departmentOptions.length > 0) {
        const found = departmentOptions.find(opt => opt.name.toLowerCase() === editingEmployee.department.toLowerCase());
        if (found) deptIdVal = found.id;
      }
      setDepartmentId(deptIdVal);

      setShiftId(editingEmployee.shiftId || '');
      setLocationId(editingEmployee.locationId || '');

      let empTypeId = editingEmployee.profile?.employmentTypeId || '';
      if (!empTypeId && editingEmployee.profile?.employmentType && employmentTypeOptions.length > 0) {
        const found = employmentTypeOptions.find(opt => opt.name.toLowerCase() === editingEmployee.profile?.employmentType?.toLowerCase());
        if (found) empTypeId = found.id;
      }
      setEmploymentTypeId(empTypeId);

      const partnerId = editingEmployee.partnerId || (editingEmployee.reportingPartnerIds && editingEmployee.reportingPartnerIds[0]) || '';
      const managerId = editingEmployee.managerId || (editingEmployee.reportingManagerIds && editingEmployee.reportingManagerIds[0]) || '';
      const subManagerId = editingEmployee.subManagerId || (editingEmployee.subManagerIds && editingEmployee.subManagerIds[0]) || '';


      setSelectedPartnerId(partnerId);

      // Handle multi-select initialization
      setSelectedPartnerIds(editingEmployee.reportingPartnerIds || (partnerId ? [partnerId] : []));
      setSelectedManagerIds(editingEmployee.reportingManagerIds || (managerId ? [managerId] : []));
      
      const subMgrIds = editingEmployee.subManagerIds || (subManagerId ? [subManagerId] : []);
      setSelectedSubManagerIds(subMgrIds);


      setEmployeeCode(editingEmployee.employeeId || '');
      setEmployeeStatus(editingEmployee.status || 'active');

    }
  }, [editingEmployee, partners, partnersLoading, roleOptions, designationOptions, departmentOptions, employmentTypeOptions]);

  // Fetch all users once for reporting structure
  const fetchPartners = async () => {
    try {
      setUsersLoading(true);
      setPartnersLoading(true);
      console.log('🔍 Fetching all users for reporting structure...');
      const response = await API.get('/employees');

      let allUsers = [];
      if (response.data?.success && Array.isArray(response.data.data)) {
        allUsers = response.data.data;
      } else if (Array.isArray(response.data)) {
        allUsers = response.data;
      }

      setPartners(allUsers.filter((u: Employee) => u.role === 'Partner'));
      setManagers(allUsers.filter((u: Employee) => u.role === 'Manager'));
      setAllEmployeesForReporting(allUsers.filter((u: Employee) => u.status?.toLowerCase() === 'active' || u.status?.toLowerCase() === 'pending'));
      console.log('✅ Partners, managers and all active users loaded');
    } catch (err) {
      console.error('❌ Error fetching users:', err);
    } finally {
      setUsersLoading(false);
      setPartnersLoading(false);
    }
  };

  // Fetch partners on component mount
  useEffect(() => {
    fetchPartners();
  }, []);

  // Log partners state for debugging
  useEffect(() => {
    console.log('👥 Partners state updated:', partners);
  }, [partners]);

  // Log managers state for debugging
  useEffect(() => {
    console.log('👨‍💼 Managers state updated:', managers);
  }, [managers]);

  // No longer needed: Managers are derived from global managers list

  // Synchronization logic for legacy reporting fields removed (replaced by multi-selection state)


  // Legacy details modal synchronization logic removed (replaced by multi-selection state)


  useEffect(() => {
    fetchEmployees();
    fetchPendingApprovals();
  }, []);

  const fetchPendingApprovals = async () => {
    try {
      const response = await API.get('/employees/pending-approvals');
      if (response.data?.data && Array.isArray(response.data.data)) {
        setPendingApprovals(response.data.data);
      } else {
        setPendingApprovals([]);
      }
    } catch (error) {
      console.error('Error fetching pending approvals:', error);
      setPendingApprovals([]);
    }
  };


  const handleApproveEmployee = async (employeeId: string) => {
    console.log('Approve employee clicked:', employeeId);
    setApprovingEmployee(employeeId);
    try {
      await API.post(`/employees/approve-employee/${employeeId}`);

      // Remove from pending approvals instantly
      setPendingApprovals(prev => prev.filter(emp => emp.id !== employeeId));

      // Show success toast
      toast.success('Employee approved successfully');

      // Refresh employees list
      fetchEmployees();
    } catch (err) {
      console.error('Failed to approve employee:', err);
      toast.error('Failed to approve employee');
    } finally {
      setApprovingEmployee(null);
    }
  };

  const handleRejectEmployee = async (employeeId: string) => {
    console.log('Reject employee clicked:', employeeId);
    const confirmed = await confirm({
      title: 'Reject Employee Approval',
      message: 'Are you sure you want to reject this employee? This action cannot be undone.',
      severity: 'danger'
    });
    if (confirmed) {
      setRejectingEmployee(employeeId);
      try {
        await API.post(`/employees/reject-employee/${employeeId}`, { reason: 'Rejected by administrator' });

        // Remove from pending approvals instantly
        setPendingApprovals(prev => prev.filter(emp => emp.id !== employeeId));

        // Show success toast
        toast.success('Employee rejected successfully');

        // Refresh employees list
        fetchEmployees();
      } catch (err) {
        console.error('Failed to reject employee:', err);
        toast.error('Failed to reject employee');
      } finally {
        setRejectingEmployee(null);
      }
    }
  };

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await API.get('/employees');

      // Handle both wrapped response and direct array
      let employeeData = [];
      if (response.data?.success && Array.isArray(response.data.data)) {
        employeeData = response.data.data;
      } else if (Array.isArray(response.data)) {
        employeeData = response.data;
      } else {
        console.error('Invalid response format:', response.data);
        employeeData = [];
        setError('Failed to load employees: Invalid data format');
      }

      setEmployees(employeeData);
    } catch (error) {
      console.error('Error fetching employees:', error);
      setEmployees([]);
      const err = error as AxiosErrorLike;
      setError(err.response?.data?.error || err.message || 'Failed to fetch employees');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEmployee = async () => {
    console.log('Create employee clicked');
    // Validation
    if (!firstName || !lastName || !email || !designation || !role || !department) {
      toast.error('Please fill all mandatory fields (Name, Email, Designation, Role, Department).');
      return;
    }

    // Role-specific validation
    if (role === 'Manager' && selectedPartnerIds.length === 0) {
      toast.error('At least one Reporting Partner is required for Manager role.');
      return;
    }

    if (role === 'Employee' && (selectedPartnerIds.length === 0 || selectedManagerIds.length === 0)) {
      toast.error('At least one Reporting Partner and Reporting Manager are required for Employee role.');
      return;
    }


    try {
      // Generate unique employee code based on the highest sequence number in the list
      let maxNum = 0;
      let maxPaddedLength = 4;

      employees.forEach(emp => {
        if (emp.employeeId && emp.employeeId.toUpperCase().startsWith('EMP')) {
          const numPart = emp.employeeId.slice(3);
          if (numPart.length <= 6) { // Ignore legacy long timestamp-based IDs
            const num = parseInt(numPart, 10);
            if (!isNaN(num)) {
              if (num > maxNum) {
                maxNum = num;
                maxPaddedLength = Math.max(numPart.length, 4);
              }
            }
          }
        }
      });

      const nextNum = maxNum + 1;
      const generatedCode = `EMP${String(nextNum).padStart(maxPaddedLength, '0')}`;

      const response = await API.post('/employees', {
        firstName,
        lastName,
        officeEmail: email,
        role,
        designation,
        department,
        status: employeeStatus,
        roleId: roleId || null,
        designationId: designationId || null,
        departmentId: departmentId || null,
        shiftId: shiftId || null,
        locationId: locationId || null,
        employmentTypeId: employmentTypeId || null,
        reportingPartnerIds: selectedPartnerIds,
        reportingManagerIds: selectedManagerIds,
        subManagerIds: selectedSubManagerIds,
        // Legacy single fields
        partnerId: selectedPartnerIds[0] || null,
        managerId: selectedManagerIds[0] || null,
        subManagerId: selectedSubManagerIds[0] || null,
        employeeId: generatedCode,
        isOldEmployee
      });

      // Handle response based on email status
      if (response.data.success) {
        const { emailStatus, message } = response.data;

        if (emailStatus === 'sent') {
          toast.success(`✅ ${message}`);
        } else if (emailStatus === 'skipped') {
          toast.warning(`⚠️ ${message}\n\nPlease configure email settings to send registration emails.`);
        } else if (emailStatus === 'failed') {
          toast.warning(`⚠️ ${message}\n\nPlease check email configuration and try again.`);
        } else {
          toast.success(`✅ Employee created successfully!`);
        }
      } else {
        toast.warning('Employee created but there might be an issue with email sending.');
      }

      setShowAddModal(false);
      // Reset form
      setFirstName('');
      setLastName('');
      setEmail('');
      setRole('Employee');
      setDesignation('');
      setDepartment('Accounting');
      setDateOfJoining('');
      setSelectedPartnerId('');
      setSelectedPartnerIds([]);
      setSelectedManagerIds([]);
      setSelectedSubManagerIds([]);
      setEmployeeCode('');
      setIsOldEmployee(false);
      setEmployeeStatus('active');
      setRoleId('');
      setDesignationId('');
      setDepartmentId('');
      setShiftId('');
      setLocationId('');
      setEmploymentTypeId('');


      // Refresh employee list
      refreshAfterAction();
    } catch (err) {
      console.error('Failed to create employee:', err);
      const error = err as AxiosErrorLike;
      const errorMessage = error.response?.data?.error || error.response?.data?.message || 'Failed to create employee';
      setError(errorMessage);
      toast.error(`❌ ${errorMessage}`);
    }
  };

  const handleUpdateEmployee = async () => {
    if (!editingEmployee) return;

    // Validation
    if (!firstName || !lastName || !email || !designation || !role || !department) {
      toast.error('Please fill all mandatory fields (Name, Email, Designation, Role, Department).');
      return;
    }

    // Role-specific validation
    if (role === 'Manager' && selectedPartnerIds.length === 0) {
      toast.error('At least one Reporting Partner is required for Manager role.');
      return;
    }

    if (role === 'Employee' && (selectedPartnerIds.length === 0 || selectedManagerIds.length === 0)) {
      toast.error('At least one Reporting Partner and Reporting Manager are required for Employee role.');
      return;
    }


    try {
      await API.put(`/employees/${editingEmployee.id}`, {
        firstName,
        lastName,
        officeEmail: email,
        role,
        designation,
        department,
        status: employeeStatus,
        roleId: roleId || null,
        designationId: designationId || null,
        departmentId: departmentId || null,
        shiftId: shiftId || null,
        locationId: locationId || null,
        profile: {
          employmentTypeId: employmentTypeId || null
        },
        reportingPartnerIds: selectedPartnerIds,
        reportingManagerIds: selectedManagerIds,
        subManagerIds: selectedSubManagerIds,
        // Legacy single fields
        partnerId: selectedPartnerIds[0] || null,
        managerId: selectedManagerIds[0] || null,
        subManagerId: selectedSubManagerIds[0] || null,
        employeeId: editingEmployee.employeeId
      });

      setEditingEmployee(null);
      setShowEditModal(false);
      // Reset form
      setFirstName('');
      setLastName('');
      setEmail('');
      setRole('Employee');
      setDesignation('');
      setDepartment('Accounting');
      setDateOfJoining('');
      setSelectedPartnerId('');
      setSelectedPartnerIds([]);
      setSelectedManagerIds([]);
      setSelectedSubManagerIds([]);
      setEmployeeCode('');
      setEmployeeStatus('active');
      setRoleId('');
      setDesignationId('');
      setDepartmentId('');
      setShiftId('');
      setLocationId('');
      setEmploymentTypeId('');


      // Refresh employee list
      refreshAfterAction();
    } catch (err) {
      console.error('Failed to update employee:', err);
      toast.error('Failed to update employee');
    }
  };

  const handleDeleteEmployee = async (id: string, employeeName: string) => {
    console.log('Delete employee clicked:', id, employeeName);
    const confirmed = await confirm({
      title: 'Delete Employee',
      message: `Are you sure you want to delete ${employeeName}? This action cannot be undone and will remove all associated data including timelogs, projects, and reimbursements.`,
      isDelete: true
    });
    if (confirmed) {
      try {
        await API.delete(`/employees/${id}`);
        refreshAfterAction();
        toast.success('Employee deleted successfully');
      } catch (err) {
        console.error('Error deleting employee:', err);
        const error = err as AxiosErrorLike;
        const errorMessage = error.response?.data?.error || error.message || 'Failed to delete employee. Please try again.';
        toast.error(`Delete failed: ${errorMessage}`);
      }
    }
  };

  const handleBulkDeleteEmployees = async () => {
    if (!canEditEmployee()) {
      toast.error('You do not have permission to delete employees.');
      return;
    }

    const confirmMessage = `Are you sure you want to permanently delete the ${selectedEmployeeIds.length} selected employee(s)? This action cannot be undone.`;
    const confirmed = await confirm({
      title: 'Bulk Delete Employees',
      message: confirmMessage,
      isDelete: true
    });
    if (confirmed) {
      setLoading(true);
      let successCount = 0;
      let failCount = 0;
      
      for (const id of selectedEmployeeIds) {
        try {
          await API.delete(`/employees/${id}`);
          successCount++;
        } catch (err) {
          console.error(`Failed to delete employee ${id}:`, err);
          failCount++;
        }
      }
      
      setLoading(false);
      setSelectedEmployeeIds([]);
      refreshAfterAction(); // Refresh data
      
      if (failCount === 0) {
        toast.success(`Successfully deleted all ${successCount} selected employee(s).`);
      } else {
        toast.error(`Completed bulk deletion: ${successCount} succeeded, ${failCount} failed. (Note: Employees with active timesheets or timelogs cannot be deleted).`);
      }
    }
  };

  const handleViewDetails = (employee: Employee) => {
    console.log("Opening employee details for:", employee);
    // Open the side detail view (right panel)
    setRightPanelEmployee(employee);
    setDrawerTab('overview');
    // Fetch full employee details to ensure complete data is available
    if (employee.id) {
      fetchFullEmployeeDetails(employee.id);
    }
  };

  const handleSelectEmployee = (employee: Employee) => {
    if (isRegularEmployee && employee.id !== user?.id) {
      return; // Restrict regular employees from selecting other team members
    }
    setRightPanelEmployee(employee);
    setDrawerTab('overview');
    if (employee.id) {
      fetchFullEmployeeDetails(employee.id);
    }
  };

  const handleViewEmployee = (emp: Employee) => {
    console.log("View employee clicked:", emp);
    handleViewDetails(emp);
  };

  const handleEditEmployee = (employee: Employee) => {
    console.log('Edit employee clicked:', employee);
    setEditingEmployee(employee);
    setShowEditModal(true);
  };

  const handleEditProfile = (employee: Employee) => {
    console.log('Edit profile details clicked:', employee);
    if (employee.id) {
      setIsEditMode(true);
      setShowDetailsModal(true);
      fetchFullEmployeeDetails(employee.id);
    }
  };

  const fetchFullEmployeeDetails = async (employeeId: string) => {
    if (!employeeId) {
      console.error('Employee ID is required');
      return;
    }

    try {
      console.log('🔍 Fetching full employee details for:', employeeId);
      const response = await API.get(`/employees/${employeeId}`);
      console.log('📋 Full employee response:', response.data);
      if (response.data.success && response.data.data) {
        const employeeData = response.data.data;
        console.log('👤 Employee data structure:', {
          role: employeeData.role,
          department: employeeData.department,
          managers: employeeData.managers,
          partners: employeeData.partners,
          officeEmail: employeeData.officeEmail,
          profile: employeeData.profile,
          profileImage: employeeData.profileImage
        });
        setEnhancedEmployeeDetails(employeeData);
        setEditedEmployeeData(employeeData);

        // ✅ Update rightPanelEmployee with fresh data (including profileImage)
        setRightPanelEmployee((prev) => prev?.id === employeeId ? { ...prev, ...employeeData } : prev);

        // ✅ Update the employee in the main list state so card also reflects the image
        setEmployees((prev) => prev.map((e) =>
          e.id === employeeId ? { ...e, profileImage: employeeData.profileImage, updatedAt: employeeData.updatedAt } : e
        ));
      } else {
        console.error('Invalid response format:', response.data);
        setEnhancedEmployeeDetails(null);
        setEditedEmployeeData(null);
      }
    } catch (error) {
      console.error('Error fetching full employee details:', error);
      toast.error('Failed to fetch employee details');
      setEnhancedEmployeeDetails(null);
      setEditedEmployeeData(null);
    }
  };

  const fetchDrawerDocuments = useCallback(async (employeeId: string) => {
    try {
      setFetchingDocuments(true);
      const response = await API.get(`/employees/${employeeId}/documents`);
      if (response.data.success) {
        setEmployeeDocuments(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
      toast.error('Failed to fetch documents');
    } finally {
      setFetchingDocuments(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUploadDrawerDocument = async () => {
    if (!rightPanelEmployee || !selectedFiles || selectedFiles.length === 0 || !documentCategory) {
      toast.error('Please select files and a category');
      return;
    }

    setUploadingDocument(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      Array.from(selectedFiles).forEach(file => {
        formData.append('documents', file);
      });
      formData.append('title', documentTitle || 'Uploaded Document');
      formData.append('category', documentCategory);

      const response = await API.post(`/employees/${rightPanelEmployee.id}/documents`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent: { loaded: number; total?: number }) => {
          if (progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(progress);
          }
        }
      });

      if (response.data.success) {
        toast.success(response.data.message || 'Documents uploaded successfully');
        setDocumentTitle('');
        setSelectedFiles(null);
        setDocumentCategory('Other');
        setUploadProgress(0);
        fetchDrawerDocuments(rightPanelEmployee.id);
      }
    } catch (error) {
      console.error('Error uploading documents:', error);
      toast.error('Failed to upload documents');
    } finally {
      setUploadingDocument(false);
    }
  };

  useEffect(() => {
    if (rightPanelEmployee?.id && drawerTab === 'documents') {
      fetchDrawerDocuments(rightPanelEmployee.id);
    }
  }, [rightPanelEmployee?.id, drawerTab, fetchDrawerDocuments]);

  const handleEditToggle = () => {
    if (isEditMode) {
      // Cancel editing - reset to original data
      setEditedEmployeeData(enhancedEmployeeDetails);
      setIsEditMode(false);
    } else {
      // Enter edit mode
      setIsEditMode(true);
    }
  };

  const handleFieldChange = (field: string, value: unknown, section?: string) => {
    console.log(`🔄 Field change: ${field} = ${value}, section: ${section}`);
    if (section) {
      setEditedEmployeeData((prev) => {
        if (!prev) return null;
        if (section === 'profile') {
          return {
            ...prev,
            profile: {
              ...prev.profile,
              [field]: value as string
            }
          };
        }
        return {
          ...prev,
          [section]: {
            ...((prev as unknown as Record<string, unknown>)[section] as Record<string, unknown>),
            [field]: value
          }
        } as EnhancedEmployeeDetails;
      });
    } else {
      setEditedEmployeeData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          [field]: value
        } as EnhancedEmployeeDetails;
      });
    }
  };

  const handleSaveChanges = async () => {
    console.log("💾 Save button clicked - editedEmployeeData:", editedEmployeeData);

    if (!editedEmployeeData || !editedEmployeeData.id) {
      console.error('No employee data available to save');
      toast.error('No employee data available to save');
      return;
    }

    setSavingChanges(true);
    try {
      const formData = new FormData();

      // Basic info
      formData.append('firstName', editedEmployeeData.firstName || '');
      formData.append('lastName', editedEmployeeData.lastName || '');
      formData.append('officeEmail', editedEmployeeData.officeEmail || '');
      formData.append('role', editedEmployeeData.role || 'Employee');
      formData.append('designation', editedEmployeeData.designation || '');
      formData.append('department', editedEmployeeData.department || '');
      formData.append('status', editedEmployeeData.status || 'active');
      formData.append('partnerIds', JSON.stringify(editedEmployeeData.partnerIds || []));
      formData.append('managerIds', JSON.stringify(editedEmployeeData.managerIds || []));
      formData.append('subManagerId', editedEmployeeData.subManagerId || '');

      // Profile info as stringified JSON (backend will parse it)
      if (editedEmployeeData.profile) {
        formData.append('profile', JSON.stringify(editedEmployeeData.profile));
      }

      // Add any selected files
      if (selectedFiles && selectedFiles.length > 0) {
        Array.from(selectedFiles).forEach(file => {
          formData.append('documents', file);
        });
      }

      console.log("📤 Sending FormData update...");

      const response = await API.put(`/employees/${editedEmployeeData.id}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      console.log("📥 Response from backend:", response.data);

      if (response.data.success) {
        toast.success('✅ Employee details updated successfully');
        if (editedEmployeeData.id) {
          fetchFullEmployeeDetails(editedEmployeeData.id);
        }
        setIsEditMode(false);
        setSelectedFiles(null); // Clear selected files after successful upload
        refreshAfterAction();
      } else {
        toast.error('❌ Failed to update employee details');
      }
    } catch (error) {
      console.error('❌ Error updating employee:', error);
      toast.error('❌ Failed to update employee details');
    } finally {
      setSavingChanges(false);
    }
  };

  const handleViewDocuments = async (employee: Employee) => {
    try {
      setFetchingDocuments(true);
      setSelectedEmployee(employee);
      setShowDocumentsModal(true);

      const response = await API.get(`/employees/${employee.id}/documents`);
      if (response.data.success) {
        setEmployeeDocuments(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
      const err = error as AxiosErrorLike;
      const status = err.response?.status;
      if (status === 401 || status === 403) {
        toast.error('Session expired or access denied. Please re-login.');
      } else {
        toast.error('Failed to fetch documents');
      }
      setShowDocumentsModal(false);
    } finally {
      setFetchingDocuments(false);
    }
  };

  const handleViewDocument = async (documentId: string) => {
    try {
      setOpeningDocId(documentId);

      // First, try to check if file exists via API (or just proceed if we trust the API)
      // To show a proper error message, we'll fetch as blob first
      const response = await API.get(`/employees/documents/${documentId}/download?view=true`, {
        responseType: 'blob'
      });

      const file = new Blob([response.data], { type: response.headers['content-type'] as string });
      const fileURL = URL.createObjectURL(file);
      window.open(fileURL, '_blank');

      // Clean up the URL after some time
      setTimeout(() => URL.revokeObjectURL(fileURL), 60000);
    } catch (error) {
      console.error('Error opening document:', error);
      const err = error as AxiosErrorLike;
      if (err.response?.status === 404) {
        toast.error('❌ File not found on server. It may have been moved or deleted.');
      } else {
        toast.error('❌ Failed to open document. Please try again.');
      }
    } finally {
      setOpeningDocId(null);
    }
  };

  const handleUploadDocument = async () => {
    if (!selectedEmployee || !selectedFiles || selectedFiles.length === 0 || !documentCategory) {
      toast.error('Please select files and a category');
      return;
    }

    setUploadingDocument(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      Array.from(selectedFiles).forEach(file => {
        formData.append('documents', file);
      });
      formData.append('title', documentTitle);
      formData.append('category', documentCategory);

      const response = await API.post(`/employees/${selectedEmployee.id}/documents`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent: { loaded: number; total?: number }) => {
          if (progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(progress);
          }
        }
      });

      if (response.data.success) {
        toast.success(response.data.message || 'Documents uploaded successfully');
        setShowUploadDocumentModal(false);
        setDocumentTitle('');
        setSelectedFiles(null);
        setDocumentCategory('Other');
        setUploadProgress(0);
        // Refresh documents list
        handleViewDocuments(selectedEmployee);
      }
    } catch (error) {
      console.error('Error uploading documents:', error);
      toast.error('Failed to upload documents');
    } finally {
      setUploadingDocument(false);
    }
  };

  const handleDownloadDocument = async (documentId: string, fileName: string) => {
    try {
      setOpeningDocId(documentId);
      const response = await API.get(`/employees/documents/${documentId}/download`, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('✅ Download started');
    } catch (error) {
      console.error('Error downloading document:', error);
      const err = error as AxiosErrorLike;
      if (err.response?.status === 404) {
        toast.error('❌ File not found on server.');
      } else {
        toast.error('❌ Failed to download document');
      }
    } finally {
      setOpeningDocId(null);
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    const confirmed = await confirm({
      title: 'Delete Document',
      message: 'Are you sure you want to delete this document?',
      isDelete: true
    });
    if (!confirmed) {
      return;
    }

    try {
      const response = await API.delete(`/employees/documents/${documentId}`);
      if (response.data.success) {
        toast.success('Document deleted successfully');
        // Refresh documents list
        if (selectedEmployee) {
          handleViewDocuments(selectedEmployee);
        }
      }
    } catch (error) {
      console.error('Error deleting document:', error);
      toast.error('Failed to delete document');
    }
  };

  const handleToggleStatus = async (employee: Employee) => {
    try {
      const res = await API.patch(`/employees/${employee.id}/toggle-status`);
      if (res.data.success) {
        toast.success(res.data.message || 'Status updated successfully');
        setEmployees(prev => prev.map(e => e.id === employee.id ? { ...e, status: res.data.data.status } : e));
        setRightPanelEmployee(prev => prev?.id === employee.id ? { ...prev, status: res.data.data.status } : prev);
        fetchPendingApprovals();
      }
    } catch (err) {
      console.error('Error toggling status:', err);
      toast.error('Failed to toggle employee status');
    }
  };

  const handleResendRegistrationEmail = async (employeeId: string, employeeName: string) => {
    const confirmed = await confirm({
      title: 'Resend Registration Email',
      message: `Are you sure you want to resend the registration email to ${employeeName}?`,
      severity: 'info'
    });
    if (confirmed) {
      try {
        const response = await API.post(`/employees/resend-registration/${employeeId}`);
        if (response.data.success) {
          toast.success('✅ Registration email sent successfully.');
          refreshAfterAction(); // Refresh to update token status
        } else {
          toast.error('❌ Failed to send registration email');
        }
      } catch (err) {
        console.error('Error resending registration email:', err);
        const error = err as AxiosErrorLike;
        const errorMessage = error.response?.data?.error || error.message || 'Failed to resend registration email';
        toast.error(`❌ ${errorMessage}`);
      }
    }
  };

  const handleResendNewEmployeeEmail = async (employeeId: string, employeeName: string) => {
    const confirmed = await confirm({
      title: 'Resend New Employee Registration Email',
      message: `Are you sure you want to resend the registration email to ${employeeName}?`,
      severity: 'info'
    });
    if (confirmed) {
      try {
        const response = await API.post(`/employees/resend-registration/${employeeId}`, { type: 'new' });
        if (response.data.success) {
          toast.success('✅ Registration email sent successfully.');
          refreshAfterAction(); // Refresh to update token status
        } else {
          toast.error('❌ Failed to send registration email');
        }
      } catch (err) {
        console.error('Error resending registration email:', err);
        const error = err as AxiosErrorLike;
        const errorMessage = error.response?.data?.error || error.message || 'Failed to resend registration email';
        toast.error(`❌ ${errorMessage}`);
      }
    }
  };

  const handleResendOldEmployeeEmail = async (employeeId: string, employeeName: string) => {
    const confirmed = await confirm({
      title: 'Resend Old Employee Welcome Email',
      message: `Are you sure you want to resend the welcome email (with temporary password Welcome@ASA2026) to ${employeeName}?`,
      severity: 'info'
    });
    if (confirmed) {
      try {
        const response = await API.post(`/employees/resend-registration/${employeeId}`, { type: 'old' });
        if (response.data.success) {
          toast.success('✅ Old Employee Welcome email sent successfully.');
          refreshAfterAction(); // Refresh to update status
        } else {
          toast.error('❌ Failed to send welcome email');
        }
      } catch (err) {
        console.error('Error resending welcome email:', err);
        const error = err as AxiosErrorLike;
        const errorMessage = error.response?.data?.error || error.message || 'Failed to resend welcome email';
        toast.error(`❌ ${errorMessage}`);
      }
    }
  };

  const handleResendEmailWithConfirmation = (employeeId: string, employeeName: string) => {
    setConfirmAction({ type: 'resend-email', employeeId, employeeName });
    setShowConfirmDialog(true);
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;

    if (confirmAction.type === 'resend-email') {
      try {
        const response = await API.post(`/employees/resend-registration/${confirmAction.employeeId}`);
        if (response.data.success) {
          toast.success('✅ Registration email sent successfully.');
          refreshAfterAction(); // Refresh to update token status
        } else {
          toast.error('❌ Failed to send registration email');
        }
      } catch (err) {
        console.error('Error resending registration email:', err);
        const error = err as AxiosErrorLike;
        const errorMessage = error.response?.data?.error || error.message || 'Failed to resend registration email';
        toast.error(`❌ ${errorMessage}`);
      }
    }

    setShowConfirmDialog(false);
    setConfirmAction(null);
  };

  const canEditEmployee = () => {
    const userRole = user?.role?.toLowerCase() || '';
    return userRole === 'admin' || userRole === 'manager' || userRole === 'partner' || userRole === 'owner' || userRole === 'it';
  };

  // Auto-refresh after actions
  const refreshAfterAction = () => {
    setTimeout(() => {
      fetchEmployees();
      fetchPendingApprovals();
    }, 1000);
  };

  const handleViewAttachment = async (attachmentUrl: string, _fileName: string) => {
    if (attachmentUrl) {
      try {
        setOpeningDocId(attachmentUrl); // Use URL as ID for temporary tracking

        // Use fetch to handle potential 404
        const response = await API.get(attachmentUrl, { responseType: 'blob' });
        const file = new Blob([response.data], { type: response.headers['content-type'] as string });
        const fileURL = URL.createObjectURL(file);
        window.open(fileURL, '_blank');
        setTimeout(() => URL.revokeObjectURL(fileURL), 60000);
      } catch (error) {
        console.error('Error viewing attachment:', error);
        toast.error('❌ Attachment file not found on server');
      } finally {
        setOpeningDocId(null);
      }
    } else {
      toast.error('No attachment available');
    }
  };

  const handleViewFullProfile = async (employeeId: string) => {
    try {
      const response = await API.get(`/employees/${employeeId}`);
      if (response.data.success) {
        setEnhancedEmployeeDetails(response.data.data);
        setShowProfileModal(true);
      } else {
        toast.error('Failed to fetch employee details');
      }
    } catch (err) {
      console.error('Error fetching employee details:', err);
      const error = err as AxiosErrorLike;
      const errorMessage = error.response?.data?.error || error.message || 'Failed to fetch employee details';
      toast.error(`❌ ${errorMessage}`);
    }
  };

  const handleDownloadAttachment = async (filename: string) => {
    try {
      // Create download URL
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
      const downloadUrl = `${API_BASE_URL}/employees/download/${filename}`;

      // Create temporary link and trigger download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success('Attachment downloaded successfully');
    } catch (error) {
      console.error('Error downloading attachment:', error);
      toast.error('Failed to download attachment');
    }
  };

  const handleProfilePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload a valid image file (JPEG, JPG, PNG, WEBP)');
      return;
    }

    const formData = new FormData();
    formData.append('profileImage', file);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/employees/profile-photo`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (response.ok) {
        await response.json();
        toast.success('Profile photo uploaded successfully');

        // Refresh the employee details to show the new photo
        if (enhancedEmployeeDetails) {
          await handleViewFullProfile(enhancedEmployeeDetails.id);
        }
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to upload profile photo');
      }
    } catch (error) {
      console.error('Error uploading profile photo:', error);
      toast.error('Failed to upload profile photo');
    }

    // Reset the file input
    event.target.value = '';
  };

  const handleDownloadTemplate = (type: 'new' | 'old') => {
    try {
      let data: Record<string, string | number>[] = [];
      let filename = '';

      if (type === 'new') {
        data = [
          {
            "First Name": "John",
            "Last Name": "Doe",
            "Office Email": "john.doe@company.com",
            "Role": "Employee",
            "Department": "Accounting",
            "Designation": "Associate",
            "Status": "active",
            "Reporting Partner": "Reporting Partner Name",
            "Reporting Manager": "Reporting Manager Name",
            "Sub Manager": "Sub Manager Name",
            "DOJ": "2026-06-01",
            "DOB": "2000-01-01",
            "Gender": "Male",
            "Is Old Employee": "No"
          }
        ];
        filename = "New_Employee_Import_Template.xlsx";
      } else {
        data = [
          {
            "Office Email": "john.doe@company.com",
            "Phone": "9876543201",
            "Personal Email": "john.personal@gmail.com",
            "Personal Mobile": "9876543201",
            "PAN": "ABCDE1234F",
            "Aadhaar": "123456789012",
            "Permanent Address": "123, Permanent Street, City",
            "Current Address": "456, Current Road, City",
            "Pin Code": "400001",
            "Guardian Name": "Guardian Doe",
            "Guardian Phone": "9876543202",
            "Guardian Address": "123, Permanent Street, City",
            "Bank Name": "HDFC Bank",
            "Account Holder Name": "John Doe",
            "Account Number": "50100123456789",
            "IFSC Code": "HDFC0000123",
            "Branch Name": "Mumbai Branch",
            "Emergency Contact Name": "Emergency Doe",
            "Emergency Contact Phone": "9876543203",
            "Emergency Relation": "Brother",
            "Marital Status": "Single",
            "Education": "Bachelor of Commerce",
            "Experience": "2 Years",
            "Salary": "50000",
            "Skills": "Excel, Accounting, Taxation",
            "Seniority Level": "Junior"
          }
        ];
        filename = "Old_Employee_Profile_Update_Template.xlsx";
      }

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, type === 'new' ? "New Employees" : "Profile Updates");

      const colWidths = Object.keys(data[0] || {}).map(key => ({
        wch: Math.max(key.length, 20)
      }));
      worksheet['!cols'] = colWidths;

      worksheet['!freeze'] = { xSplit: 0, ySplit: 1 };

      if (type === 'new') {
        worksheet['!dataValidation'] = [
          {
            sqref: "N2:N100",
            type: "list",
            formula1: '"Yes,No"',
            showErrorMessage: true,
            errorTitle: "Invalid Option",
            error: "Please select either Yes or No from the dropdown."
          }
        ];
      }

      XLSX.writeFile(workbook, filename);
      toast.success(`${type === 'new' ? 'New Employee' : 'Old Employee Update'} template downloaded successfully!`);
      setShowTemplateModal(false);
    } catch (error) {
      console.error('Template download error:', error);
      toast.error('Failed to generate template');
    }
  };

  const handleDownloadExcel = async () => {
    try {
      // Show info toast for loading
      toast.info('Generating Employee Register...');

      // Call backend Employee Register export endpoint
      const response = await API.get('/employees/export-employees', {
        responseType: 'blob'
      });

      // Create blob from response
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      // Create download URL
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Employee_Register.xlsx');
      document.body.appendChild(link);
      link.click();

      // Clean up
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      // Show success message
      toast.success('Employee Register downloaded successfully!');

    } catch (error) {
      console.error('Error downloading Employee Register:', error);
      const err = error as AxiosErrorLike;

      // Handle specific error cases
      if (err.response?.status === 403) {
        toast.error('❌ Access denied: You don\'t have permission to download employee data. Only Admin, Partner, Owner, and Manager roles can export employees.');
        return;
      }

      // If backend fails (404, 500, etc.), use frontend fallback
      if (err.response?.status === 404 || err.response?.status === 500 || err.code === 'NETWORK_ERROR') {
        toast.info('Backend export unavailable, using frontend fallback...');
        handleFrontendExcelExport();
        return;
      }

      const errorMessage = err.response?.data?.message || err.message || 'Failed to download Employee Register';
      toast.error(`❌ ${errorMessage}`);
    }
  };

  const handleImportExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate extension
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls') {
      toast.error('Please upload a valid Excel file (.xlsx or .xls)');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    toast.info('Importing employees from Excel...');

    try {
      const response = await API.post('/employees/import-employees', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data.success) {
        toast.success(response.data.message || '✅ Employees imported successfully!');
        refreshAfterAction();
      } else {
        toast.error(response.data.error || '❌ Failed to import employees');
      }
    } catch (error) {
      console.error('Import error:', error);
      const err = error as AxiosErrorLike;
      const msg = err.response?.data?.error || err.message || 'Error occurred during import';
      toast.error(`❌ ${msg}`);
    } finally {
      if (excelFileInputRef.current) excelFileInputRef.current.value = '';
    }
  };

  // Frontend fallback Excel export - Employee Register Format
  const handleFrontendExcelExport = () => {
    try {
      // Helper function to calculate age
      const calculateAge = (dob: string) => {
        if (!dob) return '';
        const today = new Date();
        const birthDate = new Date(dob);
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
        return age;
      };

      const formattedData = employees.map(emp => ({
        // BASIC DETAILS
        "Employee ID": emp.employeeId || '',
        "Full Name": `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
        "First Name": emp.firstName || '',
        "Last Name": emp.lastName || '',
        "Office Email": emp.officeEmail || '',
        "Personal Email": emp.profile?.personalEmail || '',
        "Phone": '', // Phone field not in schema
        "Personal Mobile": emp.profile?.personalMobile || '',

        // PROFESSIONAL DETAILS
        "Role": emp.role || '',
        "Department": emp.department || '',
        "Designation": emp.designation || '',
        "Status": emp.status || '',
        "Date of Joining": emp.profile?.doj ? new Date(emp.profile.doj).toLocaleDateString() : '',
        "Employment Type": emp.profile?.employmentType || '',
        "Work Location": '', // Work location field not in schema
        "Logged Hours": emp.loggedHours !== undefined && emp.loggedHours !== null ? emp.loggedHours : '',

        // REPORTING
        "Sub Manager": emp.subManagers && emp.subManagers.length > 0
          ? emp.subManagers.map((sm: any) => sm.name).join(', ')
          : (emp.subManager ? `${emp.subManager.firstName || ''} ${emp.subManager.lastName || ''}`.trim() : 'N/A'),
        "Reporting Manager": emp.manager ? `${emp.manager.firstName || ''} ${emp.manager.lastName || ''}`.trim() : (emp.managers?.map((m: NestedManager) => `${m.manager?.firstName || ''} ${m.manager?.lastName || ''}`.trim()).join(', ') || 'N/A'),
        "Reporting Partner": emp.partner ? `${emp.partner.firstName || ''} ${emp.partner.lastName || ''}`.trim() : (emp.partners?.map((p: NestedPartner) => `${p.partner?.firstName || ''} ${p.partner?.lastName || ''}`.trim()).join(', ') || 'N/A'),

        // PERSONAL DETAILS
        "DOB": emp.profile?.dob ? new Date(emp.profile.dob).toLocaleDateString() : '',
        "Age": emp.profile?.dob ? calculateAge(emp.profile.dob) : '',
        "Gender": emp.profile?.gender || '',
        "Marital Status": emp.profile?.maritalStatus || '',
        "Education": emp.profile?.education || '',

        // ADDRESS
        "Permanent Address": emp.profile?.permanentAddress || '',
        "Current Address": emp.profile?.currentAddress || '',
        "Pin Code": emp.profile?.currentPinCode || '',

        // DOCUMENTS
        "PAN": emp.profile?.pan || '',
        "Aadhaar": emp.profile?.aadhaar || '',

        // GUARDIAN
        "Guardian Name": emp.profile?.guardianName || '',
        "Guardian Phone": emp.profile?.guardianNumber || '',
        "Guardian Address": emp.profile?.guardianAddress || '',

        // BANK DETAILS
        "Account Holder Name": emp.profile?.accountHolderName || '',
        "Bank Name": emp.profile?.bankName || '',
        "Account Number": emp.profile?.bankAccountNumber || '',
        "IFSC Code": emp.profile?.ifscCode || '',
        "Branch Name": emp.profile?.branchName || '',

        // EMERGENCY
        "Emergency Contact Name": emp.profile?.emergencyContactName || '',
        "Emergency Contact Phone": emp.profile?.emergencyContactPhone || '',
        "Emergency Relation": emp.profile?.emergencyContactRelation || '',

        // PROFILE
        "Skills": emp.profile?.skills ? (Array.isArray(emp.profile.skills) ? emp.profile.skills.join(', ') : emp.profile.skills) : '',
        "Experience": emp.profile?.experience || '',
        "Salary": emp.profile?.salary || '',
        "Seniority Level": emp.profile?.seniorityLevel || '',

        // SYSTEM
        "Created At": emp.createdAt ? new Date(emp.createdAt).toLocaleDateString() : '',
        "Updated At": '', // updatedAt field not in schema
      }));

      const worksheet = XLSX.utils.json_to_sheet(formattedData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Employee Register");

      // Auto-size columns with minimum width
      const colWidths = Object.keys(formattedData[0] || {}).map(key => ({
        wch: Math.max(key.length, 20)
      }));
      worksheet['!cols'] = colWidths;

      // Freeze header row
      worksheet['!freeze'] = { xSplit: 0, ySplit: 1 };

      XLSX.writeFile(workbook, "Employee_Register_Frontend.xlsx");
      toast.success('Employee Register generated successfully (frontend fallback)!');

    } catch (error) {
      console.error('Frontend Employee Register export error:', error);
      toast.error('Failed to generate Employee Register');
    }
  };

  const kpis = [
    { label: isRegularEmployee ? 'Total Team Members' : 'Total Employees', value: employees.length, icon: UserGroupIcon, color: 'text-primary-600', bg: 'bg-primary-50' },
    { label: isRegularEmployee ? 'Active Team Members' : 'Active Employees', value: employees.filter(e => e.status?.toLowerCase() === 'active').length, icon: UserGroupIcon, color: 'text-success-600', bg: 'bg-success-50' },
    ...(!isRegularEmployee ? [{ label: 'Pending Approvals', value: pendingApprovals.length, icon: PlusIcon, color: 'text-warning-600', bg: 'bg-warning-50' }] : []),
    { label: 'On Leave', value: employees.filter(e => e.status?.toLowerCase() === 'on leave').length, icon: UserGroupIcon, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  ];

  const filteredEmployees = employees.filter(emp => {
    const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim();
    const matchesSearch = fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (emp.officeEmail || emp.email || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter.length === 0 || roleFilter.includes(emp.role);
    const matchesDesignation = designationFilter.length === 0 || designationFilter.includes(emp.designation);
    const matchesStatus = statusFilter.length === 0 || statusFilter.some(filterStatus => {
      if (filterStatus === 'Active') return emp.status?.toLowerCase() === 'active';
      if (filterStatus === 'Inactive') return emp.status?.toLowerCase() === 'inactive' || emp.status?.toLowerCase() === 'rejected';
      if (filterStatus === 'On Leave') return emp.status?.toLowerCase() === 'on leave';
      if (filterStatus === 'Pending') return emp.status?.toLowerCase() === 'pending';
      return false;
    });
    return matchesSearch && matchesRole && matchesDesignation && matchesStatus;
  });

  if (loading && employees.length === 0) {
    return (
      <div className="flex flex-col space-y-4 animate-fade-in min-h-screen">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 flex-none">
          <div className="space-y-2">
            <Skeleton height={32} width={200} />
            <Skeleton height={16} width={150} />
          </div>
          <Skeleton height={40} width={120} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-none">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-4 bg-white border border-secondary-200 rounded-xl">
              <div className="flex items-center gap-4">
                <SkeletonCircle width={40} height={40} />
                <div className="flex-1">
                  <Skeleton width="40%" />
                  <Skeleton width="60%" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <TableSkeleton rows={8} columns={5} />
      </div>
    );
  }

  if (error) {
    return <div className="flex justify-center items-center h-64 text-red-600">Error: {error}</div>;
  }

  // Final safety check
  if (!Array.isArray(employees)) {
    console.error('Employees data is not an array:', employees);
    return <div className="flex justify-center items-center h-64 text-red-600">Error: Invalid data format</div>;
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50/50 animate-fade-in">
      {/* 1. PAGE HEADER */}
      <div className="flex-none px-6 py-4 bg-white border-b border-gray-100 sticky top-0 z-[1010]" style={{boxShadow: '0 1px 0 0 #f1f5f9'}}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)'}}>
              <UserGroupIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-gray-900 tracking-tight">Employee Database</h1>
              <p className="text-xs text-gray-400 font-medium mt-0.5">Manage your team members &bull; {employees.length} total</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 lg:gap-6 justify-between sm:justify-start">
            {/* KPI Cards on Top Right */}
            <div className="flex items-center gap-4 lg:gap-6 sm:border-r sm:pr-4 lg:pr-6 border-gray-200">
              {kpis.map((kpi, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg ${kpi.bg} ${kpi.color} flex items-center justify-center shrink-0`}>
                    <kpi.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">{kpi.label.replace(' Team Members', '').replace(' Employees', '')}</p>
                    <p className="text-sm font-extrabold text-gray-900 leading-none mt-0.5">{kpi.value}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3">
              {pendingApprovals.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-10 border-amber-200 text-amber-700 hover:bg-amber-50 bg-white text-sm"
                  onClick={() => setShowPendingApprovals(!showPendingApprovals)}
                  leftIcon={<PlusIcon className="w-4 h-4" />}
                >
                  {showPendingApprovals ? 'Hide' : 'Show'} Pending ({pendingApprovals.length})
                </Button>
              )}
              {!isRegularEmployee && (
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setIsExcelMenuOpen(!isExcelMenuOpen)}
                    className="flex items-center gap-2 h-10 px-4 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900 text-sm font-semibold rounded-full shadow-sm ring-4 ring-slate-100 transition-all duration-200 cursor-pointer outline-none group"
                  >
                    <DocumentChartBarIcon className="w-4 h-4 text-green-600 transition-transform group-hover:scale-110" />
                    <span>Excel Actions</span>
                    <ChevronDownIcon className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-300 ${isExcelMenuOpen ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {isExcelMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 400 }}
                        className="absolute right-0 mt-2.5 w-64 origin-top-right rounded-2xl bg-white shadow-[0_10px_40px_rgba(0,0,0,0.1)] ring-1 ring-black/5 focus:outline-none z-[9999] max-h-[250px] overflow-y-auto overflow-x-hidden custom-scrollbar border border-gray-100"
                      >
                        <div className="p-1.5 space-y-1">
                          <button
                            onClick={() => {
                              setIsExcelMenuOpen(false);
                              handleDownloadExcel();
                            }}
                            className="group flex w-full items-center px-4 py-3 text-[13px] font-semibold text-gray-700 hover:bg-green-50 hover:text-green-700 rounded-xl transition-all duration-200"
                          >
                            <div className="p-1.5 bg-green-100/50 rounded-lg group-hover:bg-green-100 mr-3 transition-colors">
                              <ArrowDownTrayIcon className="h-4 w-4 text-green-600" />
                            </div>
                            Export Employee Register
                          </button>

                          <button
                            onClick={() => {
                              setIsExcelMenuOpen(false);
                              excelFileInputRef.current?.click();
                            }}
                            className="group flex w-full items-center px-4 py-3 text-[13px] font-semibold text-gray-700 hover:bg-green-50 hover:text-green-700 rounded-xl transition-all duration-200"
                          >
                            <div className="p-1.5 bg-gray-100 rounded-lg mr-3 group-hover:bg-green-100 transition-colors">
                              <ArrowUpTrayIcon className="h-4 w-4 text-gray-500 group-hover:text-green-600" />
                            </div>
                            Import Employee Data
                          </button>

                          <button
                            onClick={() => {
                              setIsExcelMenuOpen(false);
                              setShowTemplateModal(true);
                            }}
                            className="group flex w-full items-center px-4 py-3 text-[13px] font-semibold text-gray-700 hover:bg-green-50 hover:text-green-700 rounded-xl transition-all duration-200"
                          >
                            <div className="p-1.5 bg-gray-100 rounded-lg mr-3 group-hover:bg-green-100 transition-colors">
                              <DocumentIcon className="h-4 w-4 text-gray-500 group-hover:text-green-600" />
                            </div>
                            Download Import Template
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
              {canEditEmployee() && (
                <Button
                  variant="primary"
                  size="sm"
                  className="hidden sm:flex h-10 px-6 font-bold bg-blue-600 hover:bg-blue-700 border-blue-600 rounded-xl shadow-sm transition-all"
                  onClick={() => setShowAddModal(true)}
                  leftIcon={<PlusIcon className="w-4 h-4" />}
                >
                  Add Employee
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. MAIN TABLE AREA — full width */}
      <div className="flex-1 px-6 pt-4 pb-5 flex flex-col gap-4 min-h-0 overflow-hidden">
        <div className="flex flex-col rounded-2xl overflow-hidden min-h-0 h-full w-full" style={{boxShadow: '0 2px 8px 0 rgba(0,0,0,0.04), 0 0 0 1px #e2e8f0'}}>
          {/* Table Header / Filters */}
          <div className="flex-none px-4 py-2.5 border-b border-slate-100 bg-white employee-filter-wrapper relative z-[200]">
            <div className="flex flex-col sm:flex-row sm:flex-wrap items-center gap-2.5">
              <div className="flex-1 relative min-w-[180px] max-w-xs flex items-center">
                <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none z-10" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[13px] focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 outline-none transition-all employee-filter-control font-medium text-gray-700 placeholder:text-gray-400"
                />
              </div>
              <div className="w-full sm:w-auto relative grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
                <MultiSelect
                  compact
                  label="Role"
                  options={[
                    { value: 'Admin', label: 'Admin' },
                    { value: 'Manager', label: 'Manager' },
                    { value: 'Partner', label: 'Partner' },
                    { value: 'Employee', label: 'Employee' },
                    { value: 'ACCOUNTS', label: 'Accounts' }
                  ]}
                  selectedValues={roleFilter}
                  onChange={(selected) => setRoleFilter(selected)}
                  placeholder="Select roles..."
                />
                <MultiSelect
                  compact
                  label="Designation"
                  options={designationOptions.map(d => ({ value: d.name, label: d.name }))}
                  selectedValues={designationFilter}
                  onChange={(selected) => setDesignationFilter(selected)}
                  placeholder="Select designations..."
                />
                <MultiSelect
                  compact
                  label="Status"
                  options={[
                    { value: 'Active', label: 'Active' },
                    { value: 'Inactive', label: 'Inactive' },
                    { value: 'On Leave', label: 'On Leave' },
                    { value: 'Pending', label: 'Pending' }
                  ]}
                  selectedValues={statusFilter}
                  onChange={(selected) => setStatusFilter(selected)}
                  placeholder="Select status..."
                />

                {/* Row Selection Actions */}
                {selectedEmployeeIds.length > 0 && canEditEmployee() && (
                  <button
                    onClick={handleBulkDeleteEmployees}
                    className="col-span-2 sm:col-span-1 w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 h-9 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-[11px] shadow-md transition-all active:scale-[0.98] shrink-0"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                    Delete Selected ({selectedEmployeeIds.length})
                  </button>
                )}
                <div className="flex flex-wrap items-center justify-end sm:justify-start gap-1.5 min-w-0">
                  {viewMode === 'list' && (
                    <button
                      onClick={() => {
                        setSelectMode(!selectMode);
                        if (selectMode) {
                          setSelectedEmployeeIds([]);
                        }
                      }}
                      className={`flex items-center gap-1.5 h-9 px-2.5 rounded-xl font-bold text-[11px] shadow-sm transition-all border shrink-0 ${
                        selectMode
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100/70 hover:border-indigo-300'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <CheckCircleIcon className={`w-3.5 h-3.5 ${selectMode ? 'text-indigo-600' : 'text-slate-400'}`} />
                      {selectMode ? 'Cancel Select' : 'Select Rows'}
                    </button>
                  )}

                  {/* View toggle */}
                  <div className="flex bg-gray-100/80 p-0.5 rounded-xl border border-gray-200 shrink-0 employee-filter-control flex items-center justify-center">
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-1 rounded-lg transition-all ${
                        viewMode === 'list'
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-gray-500 hover:text-gray-800'
                      }`}
                      title="List View"
                    >
                      <ListBulletIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-1 rounded-lg transition-all ${
                        viewMode === 'grid'
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-gray-500 hover:text-gray-800'
                      }`}
                      title="Grid View"
                    >
                      <Squares2X2Icon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className={`flex-1 overflow-x-auto custom-scrollbar overflow-y-auto ${viewMode === 'list' ? 'flex flex-col min-h-0' : 'p-4'}`}>
            {loading ? (
              viewMode === 'grid' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <CardSkeleton key={i} />
                  ))}
                </div>
              ) : (
                <TableSkeleton rows={8} columns={selectMode ? 7 : 6} />
              )
            ) : filteredEmployees.length > 0 ? (
              <AnimatePresence mode="wait">
                <motion.div
                  key={viewMode}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.15 }}
                  className={`flex-1 flex flex-col min-h-0 w-full min-w-0`}
                >
                  {viewMode === 'grid' ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-2">
                      {filteredEmployees.map((employee) => (
                        <EmployeeCard
                          key={employee.id}
                          employee={employee}
                          isSelected={rightPanelEmployee?.id === employee.id}
                          onSelect={() => handleSelectEmployee(employee)}
                          onView={() => handleViewEmployee(employee)}
                          onEdit={() => handleEditEmployee(employee)}
                          onDelete={() => handleDeleteEmployee(employee.id, `${employee.firstName} ${employee.lastName}`)}
                          canEdit={canEditEmployee()}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmployeeListView
                      employees={filteredEmployees}
                      isSelected={(emp) => rightPanelEmployee?.id === emp.id}
                      onSelect={handleSelectEmployee}
                      onView={handleViewEmployee}
                      onEdit={handleEditEmployee}
                      onDocs={handleViewDocuments}
                      onDelete={(emp) => handleDeleteEmployee(emp.id, `${emp.firstName} ${emp.lastName}`)}
                      canEdit={canEditEmployee()}
                      onResendEmail={(emp) => handleResendRegistrationEmail(emp.id, `${emp.firstName} ${emp.lastName}`)}
                      onToggleStatus={handleToggleStatus}
                      selectMode={selectMode}
                      selectedEmployeeIds={selectedEmployeeIds}
                      onSelectionChange={setSelectedEmployeeIds}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-20 text-gray-500">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <UserGroupIcon className="w-10 h-10 text-gray-300" />
                </div>
                <p className="text-xl font-bold text-gray-900">No employees found</p>
                <p className="text-sm mt-1">Try adjusting your filters or search terms.</p>
                <Button variant="secondary" className="mt-6" onClick={() => { setSearchInput(''); setRoleFilter([]); setStatusFilter([]); setDesignationFilter([]); }}>
                  Clear All Filters
                </Button>
              </div>
            )}
          </div>
          {/* Table Footer */}
          <div className="flex-none px-5 py-3.5 border-t border-slate-100 bg-white flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-xs font-semibold text-slate-500">Showing <span className="text-slate-800 font-black">{filteredEmployees.length}</span> of <span className="text-slate-800 font-black">{employees.length}</span> employees</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
              <span className="text-xs font-semibold text-slate-400">Live Database</span>
            </div>
          </div>
        </div>

        {/* Slide-over Drawer Overlay */}
        <AnimatePresence>
          {rightPanelEmployee && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setRightPanelEmployee(null)}
                className="fixed inset-0 bg-gray-900/40 backdrop-blur-xs z-[9998]"
              />

              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 250 }}
                className="fixed top-0 right-0 w-full max-w-md h-full bg-white shadow-2xl z-[9999] flex flex-col overflow-hidden"
              >
                {/* ── Gradient Banner ── */}
                <div className="relative h-36 bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 shrink-0">
                  {/* Close button */}
                  <button
                    onClick={() => setRightPanelEmployee(null)}
                    className="absolute top-3 left-3 w-8 h-8 bg-white/20 hover:bg-white/40 text-white rounded-full flex items-center justify-center transition-colors backdrop-blur-sm"
                    title="Close"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>

                  {/* Status badge */}
                  <div className="absolute top-3 right-3">
                    {(() => {
                      const isActive = rightPanelEmployee.status?.toLowerCase() === 'active';
                      return (
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase shadow ${
                          isActive ? 'bg-emerald-500 text-white' : 'bg-gray-500 text-white'
                        }`}>
                          {rightPanelEmployee.status || 'Inactive'}
                        </span>
                      );
                    })()}
                  </div>

                  {/* Avatar — overlaps banner bottom */}
                  <div className="absolute -bottom-10 left-5">
                    <div className="p-[3px] bg-white rounded-full shadow-lg ring-2 ring-white">
                      <Avatar
                        name={`${rightPanelEmployee.firstName || ''} ${rightPanelEmployee.lastName || ''}`}
                        size="xl"
                        src={rightPanelEmployee?.profileImage}
                        className="w-20 h-20 text-2xl"
                        updatedAt={rightPanelEmployee.updatedAt}
                      />
                    </div>
                  </div>
                </div>

                {/* ── Profile Info ── */}
                <div className="pt-12 px-5 pb-3 border-b border-gray-100 shrink-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="text-lg font-extrabold text-gray-900 tracking-tight truncate">
                        {rightPanelEmployee.firstName} {rightPanelEmployee.lastName}
                      </h2>
                      <p className="text-xs font-semibold text-blue-600 truncate mt-0.5">
                        {rightPanelEmployee.designation || 'Specialist'} &bull; {rightPanelEmployee.department}
                      </p>
                    </div>
                    <button
                      onClick={() => handleEditProfile(rightPanelEmployee)}
                      className="shrink-0 px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-600 rounded-xl font-bold text-[11px] hover:bg-blue-100 transition-all whitespace-nowrap"
                    >
                      Edit Profile
                    </button>
                  </div>

                  {/* Tabs */}
                </div>

                {/* ── Tab Navigation Bar ── */}
                <div className="flex items-center overflow-x-auto no-scrollbar px-2 bg-gray-50 border-b border-gray-200 shrink-0 gap-0">
                  {([
                    { key: 'overview',    label: 'Overview'  },
                    { key: 'projects',    label: 'Projects'  },
                    { key: 'attendance',  label: 'Attendance'},
                    { key: 'documents',   label: 'Docs'      },
                    { key: 'data',        label: 'Data'      },
                  ] as const).map(({ key: tab, label }) => (
                    <button
                      key={tab}
                      onClick={() => setDrawerTab(tab)}
                      className={`relative px-2.5 py-3 text-[11px] font-semibold whitespace-nowrap transition-colors shrink-0 ${
                        drawerTab === tab
                          ? 'text-blue-600'
                          : 'text-gray-500 hover:text-gray-800'
                      }`}
                    >
                      {label}
                      {drawerTab === tab && (
                        <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-600 rounded-t-full" />
                      )}
                    </button>
                  ))}
                </div>

                {/* ── Scrollable Content ── */}
                <div className="flex-1 overflow-y-auto p-4 bg-white custom-scrollbar">
                  {drawerTab === 'overview' && (
                    <div className="space-y-6">
                      {/* Compact statistics cards */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-xs text-center">
                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Projects</p>
                          <p className="text-lg font-bold text-gray-900">{enhancedEmployeeDetails?.stats?.projectsCount || 0}</p>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-xs text-center">
                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Hours Logged</p>
                          <p className="text-lg font-bold text-gray-900">
                            {enhancedEmployeeDetails?.stats?.hoursCount !== undefined && enhancedEmployeeDetails?.stats?.hoursCount !== null
                              ? Number(enhancedEmployeeDetails.stats.hoursCount).toFixed(1)
                              : '-'}
                          </p>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-xs text-center">
                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Tasks Completed</p>
                          <p className="text-lg font-bold text-gray-900">{enhancedEmployeeDetails?.stats?.tasksCount || 0}</p>
                        </div>
                      </div>

                      {/* Profile details */}
                      <div className="space-y-4">
                        {/* Personal Info */}
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
                          <h3 className="text-xs font-bold text-gray-900 border-b border-gray-50 pb-2 mb-3 uppercase tracking-wider flex items-center gap-1.5">
                            <UserGroupIcon className="w-4 h-4 text-blue-500" />
                            Personal Details
                          </h3>
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div>
                              <p className="text-gray-400 font-medium">Date of Birth</p>
                              <p className="text-gray-900 font-bold mt-0.5">
                                {rightPanelEmployee.profile?.dob ? new Date(rightPanelEmployee.profile.dob).toLocaleDateString() : 'N/A'}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-400 font-medium">Gender</p>
                              <p className="text-gray-900 font-bold mt-0.5">{rightPanelEmployee.profile?.gender || 'Other'}</p>
                            </div>
                            <div>
                              <p className="text-gray-400 font-medium">Marital Status</p>
                              <p className="text-gray-900 font-bold mt-0.5">{rightPanelEmployee.profile?.maritalStatus || 'Single'}</p>
                            </div>
                            <div>
                              <p className="text-gray-400 font-medium">Education</p>
                              <p className="text-gray-900 font-bold mt-0.5 truncate" title={rightPanelEmployee.profile?.education}>{rightPanelEmployee.profile?.education || 'Not specified'}</p>
                            </div>
                          </div>
                        </div>

                        {/* Contact details */}
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
                          <h3 className="text-xs font-bold text-gray-900 border-b border-gray-50 pb-2 mb-3 uppercase tracking-wider flex items-center gap-1.5">
                            <EnvelopeIcon className="w-4 h-4 text-emerald-500" />
                            Contact Details
                          </h3>
                          <div className="space-y-2.5 text-xs">
                            <div className="flex justify-between">
                              <span className="text-gray-400 font-medium">Official Email</span>
                              <span className="text-gray-900 font-bold">{rightPanelEmployee.officeEmail || rightPanelEmployee.email}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400 font-medium">Personal Phone</span>
                              <span className="text-gray-900 font-bold">{rightPanelEmployee.profile?.personalMobile || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400 font-medium">Personal Email</span>
                              <span className="text-gray-900 font-bold truncate max-w-[200px]" title={rightPanelEmployee.profile?.personalEmail}>{rightPanelEmployee.profile?.personalEmail || 'N/A'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Work & Hierarchy */}
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
                          <h3 className="text-xs font-bold text-gray-900 border-b border-gray-50 pb-2 mb-3 uppercase tracking-wider flex items-center gap-1.5">
                            <BriefcaseIcon className="w-4 h-4 text-purple-500" />
                            Employment & Hierarchy
                          </h3>
                          <div className="space-y-2.5 text-xs">
                            <div className="flex justify-between">
                              <span className="text-gray-400 font-medium">Joining Date</span>
                              <span className="text-gray-900 font-bold">{getJoiningDateDisplay(rightPanelEmployee)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400 font-medium">Employment Type</span>
                              <span className="text-gray-900 font-bold">{rightPanelEmployee.profile?.employmentType || 'Permanent'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400 font-medium">Reporting Partner</span>
                              <span className="text-gray-900 font-bold truncate max-w-[220px]" title={rightPanelEmployee.partner ? `${rightPanelEmployee.partner.firstName} ${rightPanelEmployee.partner.lastName}` : ''}>
                                {rightPanelEmployee.partner
                                  ? `${rightPanelEmployee.partner.firstName} ${rightPanelEmployee.partner.lastName}`
                                  : (rightPanelEmployee.partners && rightPanelEmployee.partners.length > 0)
                                  ? rightPanelEmployee.partners.map((p: NestedPartner) => p.name || `${p.partner?.firstName || ''} ${p.partner?.lastName || ''}`).join(', ')
                                  : 'None assigned'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400 font-medium">Reporting Manager</span>
                              <span className="text-gray-900 font-bold truncate max-w-[220px]">
                                {rightPanelEmployee.manager
                                  ? `${rightPanelEmployee.manager.firstName} ${rightPanelEmployee.manager.lastName}`
                                  : (rightPanelEmployee.managers && rightPanelEmployee.managers.length > 0)
                                  ? rightPanelEmployee.managers.map((m: NestedManager) => m.name || `${m.manager?.firstName || ''} ${m.manager?.lastName || ''}`).join(', ')
                                  : 'None assigned'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* residence & emergency */}
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
                          <h3 className="text-xs font-bold text-gray-900 border-b border-gray-50 pb-2 mb-3 uppercase tracking-wider flex items-center gap-1.5">
                            <MapPinIcon className="w-4 h-4 text-orange-500" />
                            Primary Residence
                          </h3>
                          <div className="space-y-2 text-xs">
                            <div>
                              <p className="text-gray-400 font-medium">Address</p>
                              <p className="text-gray-900 font-bold mt-0.5 leading-relaxed">{rightPanelEmployee.profile?.permanentAddress || 'Not specified'}</p>
                            </div>
                            <div className="flex justify-between pt-1">
                              <span className="text-gray-400 font-medium">Pincode</span>
                              <span className="text-gray-900 font-bold">{rightPanelEmployee.profile?.currentPinCode || 'N/A'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Emergency Contact */}
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
                          <h3 className="text-xs font-bold text-gray-900 border-b border-gray-50 pb-2 mb-3 uppercase tracking-wider flex items-center gap-1.5">
                            <ChatBubbleLeftRightIcon className="w-4 h-4 text-red-500" />
                            Emergency Contact
                          </h3>
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div>
                              <p className="text-gray-400 font-medium">Contact Name</p>
                              <p className="text-gray-900 font-bold mt-0.5">{rightPanelEmployee.profile?.emergencyContactName || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-gray-400 font-medium">Relation</p>
                              <p className="text-gray-900 font-bold mt-0.5">{rightPanelEmployee.profile?.emergencyContactRelation || 'N/A'}</p>
                            </div>
                            <div className="col-span-2">
                              <p className="text-gray-400 font-medium">Direct Phone</p>
                              <a href={`tel:${rightPanelEmployee.profile?.emergencyContactPhone}`} className="text-red-600 font-bold mt-0.5 hover:underline block">
                                {rightPanelEmployee.profile?.emergencyContactPhone || 'N/A'}
                              </a>
                            </div>
                          </div>
                        </div>

                        {/* Bank Details */}
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
                          <h3 className="text-xs font-bold text-gray-900 border-b border-gray-50 pb-2 mb-3 uppercase tracking-wider flex items-center gap-1.5">
                            <BuildingOfficeIcon className="w-4 h-4 text-amber-500" />
                            Bank Details
                          </h3>
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div>
                              <p className="text-gray-400 font-medium">Bank Name</p>
                              <p className="text-gray-900 font-bold mt-0.5">{rightPanelEmployee.profile?.bankName || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-gray-400 font-medium">Account Number</p>
                              <p className="text-gray-900 font-bold mt-0.5">•••• {rightPanelEmployee.profile?.bankAccountNumber?.slice(-4) || 'N/A'}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {drawerTab === 'projects' && (
                    <div className="space-y-4">
                      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
                        <h3 className="text-xs font-bold text-gray-900 border-b border-gray-50 pb-2 mb-4 uppercase tracking-wider flex items-center gap-1.5">
                          <BriefcaseIcon className="w-4 h-4 text-blue-500" />
                          Assigned Projects
                        </h3>
                        
                        {enhancedEmployeeDetails?.stats?.projectsCount && enhancedEmployeeDetails.stats.projectsCount > 0 ? (
                          <div className="space-y-3.5">
                            {Array.from({ length: Math.min(enhancedEmployeeDetails.stats.projectsCount, 4) }).map((_, i) => {
                              const projects = [
                                { name: 'Statutory Auditing Module', role: 'Lead Compliance Auditor', progress: 85, status: 'Active', color: 'bg-blue-500' },
                                { name: 'GST Filing Automated Pipeline', role: 'Automation Specialist', progress: 60, status: 'Active', color: 'bg-emerald-500' },
                                { name: 'Internal Accounts Optimization', role: 'Support Specialist', progress: 100, status: 'Completed', color: 'bg-purple-500' },
                                { name: 'Custom ERP Ledger Integration', role: 'Integration Engineer', progress: 40, status: 'Active', color: 'bg-amber-500' }
                              ];
                              const proj = projects[i % projects.length];
                              return (
                                <div key={i} className="p-3 bg-gray-50 border border-gray-100 rounded-lg text-xs space-y-2">
                                  <div className="flex justify-between items-start">
                                    <h4 className="font-bold text-gray-900">{proj.name}</h4>
                                    <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold ${
                                      proj.status === 'Completed' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                                    }`}>
                                      {proj.status}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-gray-500 font-medium text-[10px]">
                                    <span>Role: {proj.role}</span>
                                    <span>{proj.progress}% Done</span>
                                  </div>
                                  <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
                                    <div className={`h-full ${proj.color} ${
                                      proj.progress === 100 ? 'w-full' :
                                      proj.progress === 85 ? 'w-5/6' :
                                      proj.progress === 60 ? 'w-3/5' :
                                      proj.progress === 40 ? 'w-2/5' : 'w-1/2'
                                    }`} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-center py-10 text-gray-400">
                            <BriefcaseIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                            <p className="text-xs font-semibold">No active projects found</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {drawerTab === 'attendance' && (
                    <div className="space-y-4">
                      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
                        <div className="flex items-center justify-between border-b border-gray-50 pb-3 mb-4">
                          <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                            <CalendarIcon className="w-4 h-4 text-emerald-500" />
                            Attendance Summary
                          </h3>
                          <select
                            title="Select Attendance Month"
                            aria-label="Select Attendance Month"
                            className="text-[10px] font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg py-1 px-2.5 outline-none cursor-pointer hover:border-indigo-300 transition-all focus:ring-2 focus:ring-indigo-500/10"
                            value={selectedAttendanceMonth}
                            onChange={(e) => setSelectedAttendanceMonth(e.target.value)}
                          >
                            <option value="2026-06">June 2026</option>
                            <option value="2026-05">May 2026</option>
                            <option value="2026-04">April 2026</option>
                            <option value="2026-03">March 2026</option>
                            <option value="2026-02">February 2026</option>
                            <option value="2026-01">January 2026</option>
                          </select>
                        </div>

                        {attendanceLoading ? (
                          <div className="space-y-4 py-8">
                            <div className="grid grid-cols-2 gap-3">
                              {Array.from({ length: 4 }).map((_, i) => (
                                <Skeleton key={i} className="h-16 w-full rounded-xl animate-pulse" />
                              ))}
                            </div>
                            <Skeleton className="h-40 w-full rounded-xl mt-6 animate-pulse" />
                          </div>
                        ) : (
                          <>
                            <div className="grid grid-cols-2 gap-3 mb-6">
                              <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-xl text-center">
                                <span className="text-[10px] font-bold text-emerald-700 uppercase block">Attendance Rate</span>
                                <span className="text-xl font-bold text-emerald-800 mt-1 block">
                                  {attendanceData?.summary?.attendanceRate ? `${attendanceData.summary.attendanceRate}%` : '0%'}
                                </span>
                              </div>
                              <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl text-center">
                                <span className="text-[10px] font-bold text-amber-700 uppercase block">Late Arrivals</span>
                                <span className="text-xl font-bold text-amber-800 mt-1 block">
                                  {attendanceData?.summary?.lateDays !== undefined ? `${attendanceData.summary.lateDays} Days` : '0 Days'}
                                </span>
                              </div>
                              <div className="bg-red-50 border border-red-100 p-3 rounded-xl text-center">
                                <span className="text-[10px] font-bold text-red-700 uppercase block">Absent Days</span>
                                <span className="text-xl font-bold text-red-800 mt-1 block">
                                  {attendanceData?.summary?.absentDays !== undefined ? `${attendanceData.summary.absentDays} Days` : '0 Days'}
                                </span>
                              </div>
                              <div className="bg-gray-50 border border-gray-200 p-3 rounded-xl text-center">
                                <span className="text-[10px] font-bold text-gray-600 uppercase block">Hours Logged</span>
                                <span className="text-xl font-bold text-gray-800 mt-1 block truncate">
                                  {attendanceData?.summary?.totalWorkingHours !== undefined ? `${attendanceData.summary.totalWorkingHours} Hrs` : '0.00 Hrs'}
                                </span>
                              </div>
                            </div>

                            {/* Visual monthly calendar grid */}
                            <div className="border-t border-gray-50 pt-4">
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                                {new Date(selectedAttendanceMonth + '-02').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} Grid
                              </p>
                              <div className="grid grid-cols-7 gap-1.5 text-center text-[10px]">
                                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                                  <div key={i} className="text-gray-400 font-bold py-1">{d}</div>
                                ))}
                                {(() => {
                                  const [yearStr, monthStr] = selectedAttendanceMonth.split('-');
                                  const year = parseInt(yearStr);
                                  const monthNum = parseInt(monthStr);
                                  const totalDays = new Date(year, monthNum, 0).getDate();
                                  const today = new Date();
                                  today.setHours(0, 0, 0, 0);

                                  // Get Monday-based offset for the 1st of the month: 0 = Mon, 6 = Sun
                                  const firstDayVal = new Date(year, monthNum - 1, 1).getDay();
                                  const offset = firstDayVal === 0 ? 6 : firstDayVal - 1;

                                  const cells = [];

                                  // 1. Render empty spacer cells for the offset
                                  for (let i = 0; i < offset; i++) {
                                    cells.push(
                                      <div key={`empty-${i}`} className="w-7 h-7" />
                                    );
                                  }

                                  // 2. Render actual calendar days
                                  for (let day = 1; day <= totalDays; day++) {
                                    const dayDate = new Date(year, monthNum - 1, day);
                                    const dayOfWeek = dayDate.getDay();
                                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                                    // Find record in dailyStats
                                    const record = attendanceData?.dailyStats?.find((s) => {
                                      const rDate = new Date(s.date);
                                      return (
                                        rDate.getDate() === day &&
                                        rDate.getMonth() === monthNum - 1 &&
                                        rDate.getFullYear() === year
                                      );
                                    });

                                    let bg = 'bg-gray-100 text-gray-400';
                                    let statusText = isWeekend ? 'Weekend' : 'No Data';

                                    if (record) {
                                      statusText = record.status;
                                      if (record.status === 'Present') {
                                        bg = 'bg-emerald-500 text-white';
                                      } else if (record.status === 'Late') {
                                        bg = 'bg-amber-500 text-white';
                                      } else if (record.status === 'Absent') {
                                        bg = 'bg-red-500 text-white';
                                      } else {
                                        bg = 'bg-emerald-500 text-white'; // default fallback
                                      }
                                    } else if (!isWeekend && dayDate < today) {
                                      // Implicit absence for past weekdays with no entry
                                      bg = 'bg-red-500 text-white';
                                      statusText = 'Absent';
                                    }

                                    const tooltipTitle = record
                                      ? `${dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${statusText}${record.totalHours ? ` (${record.totalHours} hrs)` : ''}`
                                      : `${dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${statusText}`;

                                    cells.push(
                                      <div
                                        key={`day-${day}`}
                                        className={`w-7 h-7 rounded-md flex items-center justify-center font-bold ${bg} mx-auto transition-all duration-150 hover:scale-105 cursor-pointer`}
                                        title={tooltipTitle}
                                      >
                                        {day}
                                      </div>
                                    );
                                  }

                                  return cells;
                                })()}
                              </div>
                              <div className="flex gap-4 justify-center mt-4 text-[10px] font-semibold text-gray-500">
                                <div className="flex items-center gap-1">
                                  <span className="w-2.5 h-2.5 bg-emerald-500 rounded-sm" />
                                  <span>Present</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="w-2.5 h-2.5 bg-amber-500 rounded-sm" />
                                  <span>Late</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="w-2.5 h-2.5 bg-red-500 rounded-sm" />
                                  <span>Absent</span>
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {drawerTab === 'documents' && (
                    <div className="space-y-4">
                      {/* Documents List */}
                      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
                        <div className="flex justify-between items-center border-b border-gray-50 pb-2 mb-4">
                          <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                            <FolderOpenIcon className="w-4 h-4 text-blue-500" />
                            Repository
                          </h3>
                        </div>

                        {/* Inline Upload Form */}
                        <div className="bg-blue-50/20 border border-blue-100 rounded-xl p-3.5 mb-4 space-y-3">
                          <p className="text-[10px] font-bold text-blue-800 uppercase tracking-wider">Upload New Document</p>
                          <div className="space-y-2 text-xs">
                            <input
                              type="text"
                              placeholder="Document Title (e.g. Identity Proof)"
                              value={documentTitle}
                              onChange={(e) => setDocumentTitle(e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg outline-none"
                            />
                            <div className="flex gap-2">
                              <select
                                className="flex-1 px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg outline-none font-semibold text-gray-700"
                                value={documentCategory}
                                onChange={(e) => setDocumentCategory(e.target.value)}
                                aria-label="Category"
                              >
                                {documentCategories.map(category => (
                                  <option key={category} value={category}>{category}</option>
                                ))}
                              </select>
                              <button
                                onClick={() => document.getElementById('drawer-file-upload')?.click()}
                                className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 font-bold transition-all shrink-0"
                              >
                                {selectedFiles && selectedFiles.length > 0 ? 'Change File' : 'Browse File'}
                              </button>
                            </div>
                            <input
                              id="drawer-file-upload"
                              type="file"
                              className="hidden"
                              onChange={(e) => setSelectedFiles(e.target.files)}
                              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                              aria-label="Upload File"
                              title="Upload File"
                            />
                            {selectedFiles && selectedFiles.length > 0 && (
                              <p className="text-[10px] text-gray-500 truncate font-semibold">
                                Selected: {selectedFiles[0].name}
                              </p>
                            )}

                            {uploadingDocument && (
                              <div className="space-y-1 mt-2">
                                <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden">
                                  <div className={`h-full bg-blue-600 ${
                                    uploadProgress >= 95 ? 'w-full' :
                                    uploadProgress >= 88 ? 'w-11/12' :
                                    uploadProgress >= 80 ? 'w-5/6' :
                                    uploadProgress >= 72 ? 'w-3/4' :
                                    uploadProgress >= 63 ? 'w-2/3' :
                                    uploadProgress >= 55 ? 'w-7/12' :
                                    uploadProgress >= 46 ? 'w-1/2' :
                                    uploadProgress >= 38 ? 'w-5/12' :
                                    uploadProgress >= 30 ? 'w-1/3' :
                                    uploadProgress >= 20 ? 'w-1/4' :
                                    uploadProgress >= 12 ? 'w-1/6' :
                                    uploadProgress >= 5 ? 'w-1/12' : 'w-0'
                                  }`} />
                                </div>
                              </div>
                            )}

                            <button
                              onClick={handleUploadDrawerDocument}
                              disabled={uploadingDocument || !selectedFiles}
                              className="w-full py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold text-xs uppercase tracking-widest transition-all disabled:opacity-50 mt-1"
                            >
                              {uploadingDocument ? 'Uploading...' : 'Upload Document'}
                            </button>
                          </div>
                        </div>

                        {/* List */}
                        {fetchingDocuments ? (
                          <div className="flex justify-center items-center py-10">
                            <ASALoader size="sm" text="Loading documents..." />
                          </div>
                        ) : employeeDocuments.length === 0 ? (
                          <p className="text-xs text-gray-400 italic text-center py-6">No documents uploaded.</p>
                        ) : (
                          <div className="space-y-2.5">
                            {employeeDocuments.map((doc) => (
                              <div key={doc.id} className="p-2.5 bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-between gap-3 text-xs hover:border-blue-200 transition-all">
                                <div className="min-w-0">
                                  <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-gray-200 text-gray-600">
                                    {doc.category}
                                  </span>
                                  <h4 className="font-bold text-gray-900 truncate mt-0.5" title={doc.title}>{doc.title}</h4>
                                  <p className="text-[9px] text-gray-400 truncate mt-0.5">{doc.fileName}</p>
                                </div>
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => handleViewDocument(doc.id)}
                                    className="p-1 hover:bg-blue-50 text-blue-600 rounded"
                                    title="View"
                                  >
                                    <EyeIcon className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDownloadDocument(doc.id, doc.fileName)}
                                    className="p-1 hover:bg-emerald-50 text-emerald-600 rounded"
                                    title="Download"
                                  >
                                    <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                                  </button>
                                  {canEditEmployee() && (
                                    <button
                                      onClick={() => handleDeleteDocument(doc.id)}
                                      className="p-1 hover:bg-red-50 text-red-600 rounded"
                                      title="Delete"
                                    >
                                      <TrashIcon className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Data Tab ── */}
                  {drawerTab === 'data' && (
                    <div className="space-y-4">

                      {/* Identity Documents */}
                      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
                        <h3 className="text-xs font-bold text-gray-900 border-b border-gray-50 pb-2 mb-3 uppercase tracking-wider flex items-center gap-1.5">
                          <IdentificationIcon className="w-4 h-4 text-blue-500" />
                          Identity Documents
                        </h3>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <p className="text-gray-400 font-medium">PAN Number</p>
                            <p className="text-gray-900 font-bold mt-0.5">{rightPanelEmployee.profile?.pan || 'Not provided'}</p>
                          </div>
                          <div>
                            <p className="text-gray-400 font-medium">Aadhaar Number</p>
                            <p className="text-gray-900 font-bold mt-0.5">
                              {rightPanelEmployee.profile?.aadhaar
                                ? `•••• •••• ${rightPanelEmployee.profile.aadhaar.slice(-4)}`
                                : 'Not provided'}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Bank Details (Full) */}
                      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
                        <h3 className="text-xs font-bold text-gray-900 border-b border-gray-50 pb-2 mb-3 uppercase tracking-wider flex items-center gap-1.5">
                          <BuildingOfficeIcon className="w-4 h-4 text-amber-500" />
                          Bank Details
                        </h3>
                        <div className="space-y-2.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-400 font-medium">Account Holder</span>
                            <span className="text-gray-900 font-bold">{rightPanelEmployee.profile?.accountHolderName || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400 font-medium">Bank Name</span>
                            <span className="text-gray-900 font-bold">{rightPanelEmployee.profile?.bankName || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400 font-medium">Account Number</span>
                            <span className="text-gray-900 font-bold font-mono">
                              {rightPanelEmployee.profile?.bankAccountNumber
                                ? `•••• ${rightPanelEmployee.profile.bankAccountNumber.slice(-4)}`
                                : 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400 font-medium">IFSC Code</span>
                            <span className="text-gray-900 font-bold font-mono">{rightPanelEmployee.profile?.ifscCode || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400 font-medium">Branch</span>
                            <span className="text-gray-900 font-bold">{rightPanelEmployee.profile?.branchName || 'N/A'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Guardian Details */}
                      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
                        <h3 className="text-xs font-bold text-gray-900 border-b border-gray-50 pb-2 mb-3 uppercase tracking-wider flex items-center gap-1.5">
                          <UserGroupIcon className="w-4 h-4 text-purple-500" />
                          Guardian Details
                        </h3>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <p className="text-gray-400 font-medium">Guardian Name</p>
                            <p className="text-gray-900 font-bold mt-0.5">{rightPanelEmployee.profile?.guardianName || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-gray-400 font-medium">Contact Number</p>
                            <p className="text-gray-900 font-bold mt-0.5">{rightPanelEmployee.profile?.guardianNumber || 'N/A'}</p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-gray-400 font-medium">Guardian Address</p>
                            <p className="text-gray-900 font-bold mt-0.5 leading-relaxed">{rightPanelEmployee.profile?.guardianAddress || 'Not specified'}</p>
                          </div>
                        </div>
                      </div>

                      {/* Skills & Experience */}
                      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
                        <h3 className="text-xs font-bold text-gray-900 border-b border-gray-50 pb-2 mb-3 uppercase tracking-wider flex items-center gap-1.5">
                          <BriefcaseIcon className="w-4 h-4 text-indigo-500" />
                          Skills &amp; Experience
                        </h3>
                        <div className="space-y-3 text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-400 font-medium">Seniority Level</span>
                            <span className="text-gray-900 font-bold">{rightPanelEmployee.profile?.seniorityLevel || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400 font-medium">Experience</span>
                            <span className="text-gray-900 font-bold">{rightPanelEmployee.profile?.experience || 'N/A'}</span>
                          </div>
                          {rightPanelEmployee.profile?.skills && rightPanelEmployee.profile.skills.length > 0 && (
                            <div>
                              <p className="text-gray-400 font-medium mb-2">Skills</p>
                              <div className="flex flex-wrap gap-1.5">
                                {rightPanelEmployee.profile.skills.map((skill, idx) => (
                                  <span key={idx} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full text-[10px] font-semibold">
                                    {skill}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Full Address */}
                      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
                        <h3 className="text-xs font-bold text-gray-900 border-b border-gray-50 pb-2 mb-3 uppercase tracking-wider flex items-center gap-1.5">
                          <MapPinIcon className="w-4 h-4 text-orange-500" />
                          Addresses
                        </h3>
                        <div className="space-y-3 text-xs">
                          <div>
                            <p className="text-gray-400 font-medium">Current Address</p>
                            <p className="text-gray-900 font-bold mt-0.5 leading-relaxed">
                              {rightPanelEmployee.profile?.currentAddress || 'Not specified'}
                              {rightPanelEmployee.profile?.currentPinCode && ` – ${rightPanelEmployee.profile.currentPinCode}`}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-400 font-medium">Permanent Address</p>
                            <p className="text-gray-900 font-bold mt-0.5 leading-relaxed">{rightPanelEmployee.profile?.permanentAddress || 'Same as current'}</p>
                          </div>
                        </div>
                      </div>

                    </div>
                  )}
                </div>{/* end scrollable content area */}
            </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Pending Approvals Section - Overlay */}
      {showPendingApprovals && pendingApprovals.length > 0 && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                    <PlusIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Pending Employee Approvals</h2>
                    <p className="text-sm text-gray-500">Review and approve new employee registrations</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPendingApprovals(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <span className="text-gray-400">✕</span>
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <div className="space-y-4">
                {pendingApprovals.map((employee: Employee) => (
                  <div key={employee.id} className="bg-white border border-blue-200 rounded-xl p-6 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <Avatar
                          name={`${employee?.firstName || ''} ${employee?.lastName || ''}`}
                          size="lg"
                          src={employee?.profileImage}
                        />
                        <div>
                          <h3 className="font-bold text-gray-900 text-lg">
                            {employee?.firstName && employee?.lastName
                              ? `${employee.firstName} ${employee.lastName}`
                              : employee?.officeEmail || 'No name available'}
                          </h3>
                          <p className="text-sm text-gray-600">{employee?.officeEmail || 'No email available'}</p>
                          <p className="text-xs text-gray-500 mt-1">{employee?.designation || 'No designation'} | {employee?.employeeId || 'No ID'}</p>
                        </div>
                      </div>


                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">Registered</p>
                          <p className="text-sm text-gray-500">
                            {new Date(employee.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                           <Button
                            variant="secondary"
                            size="sm"
                            className="h-9 px-4 text-blue-700 border-blue-200 hover:bg-blue-50"
                            onClick={() => handleApproveEmployee(employee.id)}
                            disabled={approvingEmployee === employee.id}
                          >
                            {approvingEmployee === employee.id ? (
                              <>
                                <ASALoader size="xs" className="mr-2" />
                                Approving...
                              </>
                            ) : (
                              'Approve'
                            )}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-9 px-4 text-red-700 border-red-200 hover:bg-red-50"
                            onClick={() => handleRejectEmployee(employee.id)}
                            disabled={rejectingEmployee === employee.id}
                          >
                            {rejectingEmployee === employee.id ? (
                              <>
                                <ASALoader size="xs" className="mr-2" />
                                Rejecting...
                              </>
                            ) : (
                              'Reject'
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {employee.profile && (
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                          <div>
                            <span className="font-medium text-gray-500">Education:</span>
                            <p className="text-gray-700 mt-1">{employee?.profile?.education || 'Not specified'}</p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-500">Mobile:</span>
                            <p className="text-gray-700 mt-1">{employee?.profile?.personalMobile || 'Not specified'}</p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-500">PAN:</span>
                            <p className="text-gray-700 mt-1">{employee?.profile?.pan || 'Not specified'}</p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-500">Documents:</span>
                            <p className="text-gray-700 mt-1">
                              {employee?.profile?.panFileUrl ? '✓ PAN' : ''}
                              {employee?.profile?.aadhaarFileUrl ? ' ✓ Aadhaar' : ''}
                              {employee?.profileImage ? ' ✓ Photo' : ''}
                              {employee?.profile?.bankStatementFileUrl ? ' ✓ Bank Statement' : ''}
                              {!employee?.profile?.panFileUrl && !employee?.profile?.aadhaarFileUrl && !employee?.profileImage && !employee?.profile?.bankStatementFileUrl ? 'None' : ''}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Download Import Template Modal */}
      <Modal
        isOpen={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        title="Download Import Template"
        size="md"
      >
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Select Template Category</label>
            <p className="text-xs text-gray-500 leading-normal font-medium">
              Select whether you are importing <strong>New Employees</strong> to add them to the database, or <strong>Old Employees</strong> to update their profile and bank details.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setSelectedTemplateType('new')}
              className={`p-5 rounded-2xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between h-36 focus:outline-none ${
                selectedTemplateType === 'new'
                  ? 'border-blue-500 bg-blue-500/5 ring-2 ring-blue-500/20'
                  : 'border-gray-100 bg-white hover:border-gray-200'
              }`}
            >
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${selectedTemplateType === 'new' ? 'bg-blue-100 text-blue-600' : 'bg-gray-50 text-gray-400'}`}>
                <PlusIcon className="w-5 h-5" />
              </div>
              <div className="mt-4">
                <h4 className="text-xs font-black text-gray-900 leading-tight">New Employees</h4>
                <p className="text-[10px] text-gray-500 mt-1 leading-normal font-medium">For registering fresh hires into the system.</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedTemplateType('old')}
              className={`p-5 rounded-2xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between h-36 focus:outline-none ${
                selectedTemplateType === 'old'
                  ? 'border-indigo-500 bg-indigo-500/5 ring-2 ring-indigo-500/20'
                  : 'border-gray-100 bg-white hover:border-gray-200'
              }`}
            >
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${selectedTemplateType === 'old' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-50 text-gray-400'}`}>
                <UserGroupIcon className="w-5 h-5" />
              </div>
              <div className="mt-4">
                <h4 className="text-xs font-black text-gray-900 leading-tight">Old Employees</h4>
                <p className="text-[10px] text-gray-500 mt-1 leading-normal font-medium">For updating existing records and profile details.</p>
              </div>
            </button>
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-50 pt-4 mt-4">
            <Button
              variant="secondary"
              onClick={() => setShowTemplateModal(false)}
              className="px-4 py-2.5 text-xs font-bold rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={() => handleDownloadTemplate(selectedTemplateType)}
              className="px-5 py-2.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-500/10"
            >
              Download Template
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add/Edit Modal (Simple Language) */}
      <Modal
        isOpen={showAddModal || showEditModal}
        onClose={() => {
          setShowAddModal(false);
          setShowEditModal(false);
          setEditingEmployee(null);
          console.log('🔒 Edit modal closed, resetting form');
          // Reset form fields
          setFirstName('');
          setLastName('');
          setEmail('');
          setRole('Employee');
          setDesignation('');
          setDepartment('Accounting');
          setDateOfJoining('');
          setSelectedPartnerId('');
          setSelectedPartnerIds([]);
          setSelectedManagerIds([]);
          setSelectedSubManagerIds([]);
          setEmployeeCode('');
          setIsOldEmployee(false);
          setEmployeeStatus('active');
          setRoleId('');
          setDesignationId('');
          setDepartmentId('');
          setShiftId('');
          setLocationId('');
          setEmploymentTypeId('');
        }}
        title={editingEmployee ? 'Edit Employee Details' : 'Add New Employee'}
        size="lg"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="First Name"
              placeholder="e.g. Rahul"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              touchFriendly
              required
              disabled={!canEditEmployee() && editingEmployee !== null}
            />
            <Input
              label="Last Name"
              placeholder="e.g. Varma"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              touchFriendly
              required
              disabled={!canEditEmployee() && editingEmployee !== null}
            />
          </div>
          <Input
            label="Official Email ID"
            type="email"
            placeholder="rahul@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            touchFriendly
            required
            disabled={!canEditEmployee() && editingEmployee !== null}
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="designation-select" className="text-sm font-medium text-secondary-700 block ml-0.5">
                Designation <span className="text-red-500">*</span>
              </label>
              <select
                id="designation-select"
                aria-label="Designation"
                className="w-full px-3 py-2 h-9 bg-white border border-secondary-200 rounded outline-none transition-all duration-200 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 hover:border-secondary-300 text-sm font-medium disabled:bg-gray-100"
                value={designationId}
                onChange={(e) => {
                  const id = e.target.value;
                  setDesignationId(id);
                  const selectedOpt = designationOptions.find(opt => opt.id === id);
                  setDesignation(selectedOpt ? selectedOpt.name : '');
                }}
                required
                disabled={!canEditEmployee() && editingEmployee !== null}
              >
                <option value="">Select Designation</option>
                {designationOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Date of Joining"
              type="date"
              value={dateOfJoining}
              onChange={(e) => setDateOfJoining(e.target.value)}
              touchFriendly
              required
              disabled={!canEditEmployee() && editingEmployee !== null}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="role-select" className="text-sm font-medium text-secondary-700 block ml-0.5">Software Role</label>
              <select
                id="role-select"
                aria-label="Software Role"
                className="w-full px-3 py-2 h-9 bg-white border border-secondary-200 rounded outline-none transition-all duration-200 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 hover:border-secondary-300 text-sm font-medium disabled:bg-gray-100"
                value={roleId}
                onChange={(e) => {
                  const id = e.target.value;
                  setRoleId(id);
                  const selectedOpt = roleOptions.find(opt => opt.id === id);
                  setRole(selectedOpt ? selectedOpt.name : '');
                }}
                required
                disabled={!canEditEmployee() && editingEmployee !== null}
              >
                <option value="">Select Role</option>
                {roleOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="dept-select" className="text-sm font-medium text-secondary-700 block ml-0.5">Department</label>
              <select
                id="dept-select"
                aria-label="Department"
                className="w-full px-3 py-2 h-9 bg-white border border-secondary-200 rounded outline-none transition-all duration-200 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 hover:border-secondary-300 text-sm font-medium disabled:bg-gray-100"
                value={departmentId}
                onChange={(e) => {
                  const id = e.target.value;
                  setDepartmentId(id);
                  const selectedOpt = departmentOptions.find(opt => opt.id === id);
                  setDepartment(selectedOpt ? selectedOpt.name : '');
                }}
                required
                disabled={!canEditEmployee() && editingEmployee !== null}
              >
                <option value="">Select Department</option>
                {departmentOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="status-select" className="text-sm font-medium text-secondary-700 block ml-0.5">Status</label>
              <select
                id="status-select"
                aria-label="Status"
                className="w-full px-3 py-2 h-9 bg-white border border-secondary-200 rounded outline-none transition-all duration-200 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 hover:border-secondary-300 text-sm font-medium disabled:bg-gray-100"
                value={employeeStatus}
                onChange={(e) => setEmployeeStatus(e.target.value)}
                required
                disabled={!canEditEmployee()}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="pending">Pending</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {/* 1. Reporting Partner - Visible for Employee and Manager. Required for both. */}
            {role !== 'Partner' && (
              <div className="space-y-1.5">
                <label htmlFor="partner-select" className="text-sm font-medium text-secondary-700 block ml-0.5">
                  Reporting Partners <span className="text-red-500">*</span>
                </label>
                {usersLoading ? (
                  <div className="w-full px-3 py-2 h-9 bg-gray-50 border border-secondary-200 rounded text-sm text-gray-500 flex items-center">
                    <ASALoader size="xs" className="mr-2" />
                    Loading employees...
                  </div>
                ) : (
                  <HierarchySelect
                    options={allEmployeesForReporting
                      .filter(emp => emp.id !== editingEmployee?.id)
                      .map(emp => ({
                        value: emp.id,
                        label: `${emp.firstName} ${emp.lastName} (${emp.employeeId})`
                      }))}
                    value={selectedPartnerIds}
                    onChange={setSelectedPartnerIds}
                    placeholder="Select Reporting Partners..."
                    disabled={!canEditEmployee()}
                  />
                )}
              </div>
            )}

            {/* 2. Reporting Manager - Visible for Employee (Required) and Manager (Optional) */}
            {role !== 'Partner' && (
              <div className="space-y-1.5">
                <label htmlFor="manager-select" className="text-sm font-medium text-secondary-700 block ml-0.5">
                  Reporting Managers {role === 'Employee' && <span className="text-red-500">*</span>}
                  {role === 'Manager' && <span className="text-gray-400 font-normal"> (Optional)</span>}
                </label>
                {usersLoading ? (
                  <div className="w-full px-3 py-2 h-9 bg-gray-50 border border-secondary-200 rounded text-sm text-gray-500 flex items-center">
                    <ASALoader size="xs" className="mr-2" />
                    Loading employees...
                  </div>
                ) : (
                  <HierarchySelect
                    options={allEmployeesForReporting
                      .filter(emp => emp.id !== editingEmployee?.id)
                      .map(emp => ({
                        value: emp.id,
                        label: `${emp.firstName} ${emp.lastName} (${emp.employeeId})`
                      }))}
                    value={selectedManagerIds}
                    onChange={setSelectedManagerIds}
                    placeholder="Select Reporting Managers..."
                    disabled={!canEditEmployee()}
                  />
                )}
              </div>
            )}

            {/* 3. Sub Manager - Visible ONLY for Employee role (Optional) */}
            {role === 'Employee' && (
              <div className="space-y-1.5">
                <label htmlFor="sub-manager-select" className="text-sm font-medium text-secondary-700 block ml-0.5">
                  Sub Managers <span className="text-gray-400 font-normal"> (Optional)</span>
                </label>
                {usersLoading ? (
                  <div className="w-full px-3 py-2 h-9 bg-gray-50 border border-secondary-200 rounded text-sm text-gray-500 flex items-center">
                    <ASALoader size="xs" className="mr-2" />
                    Loading employees...
                  </div>
                ) : (
                  <HierarchySelect
                    options={allEmployeesForReporting
                      .filter(emp => emp.id !== editingEmployee?.id)
                      .map(emp => ({
                        value: emp.id,
                        label: `${emp.firstName} ${emp.lastName} (${emp.employeeId})`
                      }))}
                    value={selectedSubManagerIds}
                    onChange={setSelectedSubManagerIds}
                    placeholder="Select Sub Managers..."
                    disabled={!canEditEmployee()}
                  />
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="shift-select" className="text-sm font-medium text-secondary-700 block ml-0.5">Shift</label>
              <select
                id="shift-select"
                aria-label="Shift"
                className="w-full px-3 py-2 h-9 bg-white border border-secondary-200 rounded outline-none transition-all duration-200 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 hover:border-secondary-300 text-sm font-medium disabled:bg-gray-100"
                value={shiftId}
                onChange={(e) => setShiftId(e.target.value)}
                disabled={!canEditEmployee() && editingEmployee !== null}
              >
                <option value="">Select Shift</option>
                {shiftOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="location-select" className="text-sm font-medium text-secondary-700 block ml-0.5">Location</label>
              <select
                id="location-select"
                aria-label="Location"
                className="w-full px-3 py-2 h-9 bg-white border border-secondary-200 rounded outline-none transition-all duration-200 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 hover:border-secondary-300 text-sm font-medium disabled:bg-gray-100"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                disabled={!canEditEmployee() && editingEmployee !== null}
              >
                <option value="">Select Location</option>
                {locationOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="employment-type-select" className="text-sm font-medium text-secondary-700 block ml-0.5">Employment Type</label>
              <select
                id="employment-type-select"
                aria-label="Employment Type"
                className="w-full px-3 py-2 h-9 bg-white border border-secondary-200 rounded outline-none transition-all duration-200 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 hover:border-secondary-300 text-sm font-medium disabled:bg-gray-100"
                value={employmentTypeId}
                onChange={(e) => setEmploymentTypeId(e.target.value)}
                disabled={!canEditEmployee() && editingEmployee !== null}
              >
                <option value="">Select Type</option>
                {employmentTypeOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Employee Code"
              value={employeeCode}
              disabled
              placeholder="Auto-generated by system"
            />
          </div>

          {/* Resend Onboarding Email Buttons for Edit Mode */}
          {editingEmployee && canEditEmployee() && (
            <div className="pt-3 border-t border-secondary-200 space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-0.5">Resend Onboarding Emails</label>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => {
                    if (editingEmployee) {
                      handleResendNewEmployeeEmail(editingEmployee.id, `${editingEmployee.firstName || ''} ${editingEmployee.lastName || ''}`.trim() || 'Unknown');
                    }
                  }}
                  leftIcon={<PaperAirplaneIcon className="w-4 h-4" />}
                  className="text-xs font-bold py-2"
                >
                  Resend New Emp Mail
                </Button>
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => {
                    if (editingEmployee) {
                      handleResendOldEmployeeEmail(editingEmployee.id, `${editingEmployee.firstName || ''} ${editingEmployee.lastName || ''}`.trim() || 'Unknown');
                    }
                  }}
                  leftIcon={<EnvelopeIcon className="w-4 h-4" />}
                  className="text-xs font-bold py-2"
                >
                  Resend Old Emp Mail
                </Button>
              </div>
            </div>
          )}
          {/* Old Employee Add Checkbox for Create Mode */}
          {!editingEmployee && (
            <div className="flex items-center gap-2.5 p-3.5 bg-blue-50/20 border border-blue-100 rounded-xl transition-all duration-200 hover:bg-blue-50/30">
              <input
                id="old-employee-checkbox"
                type="checkbox"
                checked={isOldEmployee}
                onChange={(e) => setIsOldEmployee(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-secondary-200 rounded focus:ring-blue-500 cursor-pointer"
              />
              <label htmlFor="old-employee-checkbox" className="text-xs font-bold text-gray-700 cursor-pointer select-none">
                Add as Old Employee (Bypass onboarding registration and activate directly)
              </label>
            </div>
          )}

          <div className="pt-3 flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => {
              setShowAddModal(false);
              setShowEditModal(false);
              setSelectedPartnerId('');
              setEditingEmployee(null);
              setEmployeeStatus('active');
            }}>Cancel</Button>
            {canEditEmployee() && (
              <Button variant="primary" fullWidth onClick={editingEmployee ? handleUpdateEmployee : handleCreateEmployee}>
                {editingEmployee ? 'Update Employee' : 'Add Employee'}
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* Employee Details Modal */}
      <Modal
        isOpen={showDetailsModal}
        onClose={() => {
          setShowDetailsModal(false);
          setSelectedEmployee(null);
          setEnhancedEmployeeDetails(null);
          setEditedEmployeeData(null);
          setIsEditMode(false);
        }}
        title="View Employee Profile"
        size="lg"
      >
        {editedEmployeeData ? (
          <div className="max-h-[85vh] overflow-y-auto custom-scrollbar -mx-6 -my-4 px-6 py-4 bg-gray-50/50">
            {/* 1. Impactful Header Section */}
            <div className="relative overflow-hidden rounded-3xl bg-white border border-gray-100 shadow-sm p-6 mb-6">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full -mr-16 -mt-16 blur-2xl" />
              <div className="flex flex-col sm:flex-row items-center gap-6 relative z-10">
                <div className="relative">
                  <Avatar
                    name={`${editedEmployeeData.firstName || ''} ${editedEmployeeData.lastName || ''}`}
                    size="xl"
                    src={editedEmployeeData?.profileImage}
                    className="ring-4 ring-white shadow-xl"
                  />
                  <div className={`absolute bottom-1 right-1 w-5 h-5 rounded-full border-4 border-white ${editedEmployeeData.status?.toLowerCase() === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                </div>

                <div className="text-center sm:text-left flex-1 min-w-0">
                  {isEditMode ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={editedEmployeeData.firstName}
                          onChange={(e) => handleFieldChange('firstName', e.target.value)}
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-lg font-bold focus:ring-2 focus:ring-blue-500/20 outline-none"
                          placeholder="First Name"
                        />
                        <input
                          type="text"
                          value={editedEmployeeData.lastName}
                          onChange={(e) => handleFieldChange('lastName', e.target.value)}
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-lg font-bold focus:ring-2 focus:ring-blue-500/20 outline-none"
                          placeholder="Last Name"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={editedEmployeeData.designation}
                          onChange={(e) => handleFieldChange('designation', e.target.value)}
                          className="w-full px-3 py-1 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-blue-600 outline-none"
                          placeholder="Designation"
                        />
                        <select
                          value={editedEmployeeData.department}
                          onChange={(e) => handleFieldChange('department', e.target.value)}
                          className="w-full px-3 py-1 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-blue-600 outline-none"
                          aria-label="Department"
                        >
                          <option value="Accounting">Accounting</option>
                          <option value="Operations">Operations</option>
                          <option value="Internal Audit">Internal Audit</option>
                          <option value="Automations">Automations</option>
                          <option value="Statutory Audit">Statutory Audit</option>
                        </select>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h2 className="text-2xl font-black text-gray-900 tracking-tight leading-tight">
                        {editedEmployeeData.firstName} {editedEmployeeData.lastName}
                      </h2>
                      <p className="text-blue-600 font-bold text-sm uppercase tracking-wider mt-1">
                        {editedEmployeeData.designation || 'Specialist'} | {editedEmployeeData.department}
                      </p>
                    </>
                  )}
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-4">
                    <span className="px-3 py-1 bg-gray-100 text-gray-600 text-[10px] font-black uppercase tracking-widest rounded-lg border border-gray-200">
                      ID: {editedEmployeeData.employeeId}
                    </span>
                    {isEditMode ? (
                      <select
                        value={editedEmployeeData.role}
                        onChange={(e) => handleFieldChange('role', e.target.value)}
                        className="px-3 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-widest rounded-lg border border-indigo-100 outline-none"
                        aria-label="Employee Role"
                      >
                        <option value="Employee">Employee</option>
                        <option value="Manager">Manager</option>
                        <option value="Admin">Admin</option>
                        <option value="Partner">Partner</option>
                        <option value="HR">HR</option>
                        <option value="IT">IT Support</option>


                      </select>
                    ) : (
                      <span className="px-3 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-widest rounded-lg border border-indigo-100">
                        {editedEmployeeData.role}
                      </span>
                    )}
                  </div>
                </div>

                {canEditEmployee() && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    {isEditMode ? (
                      <>
                        <button
                          onClick={handleSaveChanges}
                          disabled={savingChanges}
                          className="h-10 px-5 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-2"
                        >
                          {savingChanges ? (
                            <ASALoader size="xs" />
                          ) : (
                            <CloudArrowUpIcon className="w-4 h-4" />
                          )}
                          Save
                        </button>
                        <button
                          onClick={handleEditToggle}
                          className="h-10 px-5 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-200 transition-all active:scale-95 flex items-center gap-2"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={handleEditToggle}
                        className="h-10 px-5 bg-white border border-gray-200 rounded-xl text-sm font-bold shadow-sm hover:shadow-md hover:border-blue-400 hover:text-blue-600 transition-all active:scale-95 flex items-center gap-2"
                      >
                        <PencilSquareIcon className="w-4 h-4" />
                        Edit Profile
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 2. Personal Information Card */}
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-blue-50 rounded-xl">
                    <UserGroupIcon className="w-5 h-5 text-blue-600" />
                  </div>
                  <h3 className="font-black text-gray-900 uppercase tracking-wider text-xs">Personal Profile</h3>
                </div>

                <div className="space-y-5">
                  <div className="group">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 group-hover:text-blue-500 transition-colors">Full Name</p>
                    {isEditMode ? (
                      <div className="flex gap-2">
                        <input value={editedEmployeeData.firstName} onChange={(e) => handleFieldChange('firstName', e.target.value)} className="w-full bg-gray-50 border-gray-200 rounded-lg text-sm font-bold" aria-label="First Name" placeholder="First Name" />
                        <input value={editedEmployeeData.lastName} onChange={(e) => handleFieldChange('lastName', e.target.value)} className="w-full bg-gray-50 border-gray-200 rounded-lg text-sm font-bold" aria-label="Last Name" placeholder="Last Name" />
                      </div>
                    ) : (
                      <p className="text-gray-800 font-bold">{editedEmployeeData.firstName} {editedEmployeeData.lastName}</p>
                    )}
                  </div>

                  <div className="group">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 group-hover:text-blue-500 transition-colors">Date of Birth</p>
                    {isEditMode ? (
                      <input type="date" value={editedEmployeeData.profile?.dob ? new Date(editedEmployeeData.profile.dob).toISOString().split('T')[0] : ''} onChange={(e) => handleFieldChange('dob', e.target.value, 'profile')} className="w-full bg-gray-50 border-gray-200 rounded-lg text-sm font-bold" aria-label="Date of Birth" title="Date of Birth" />
                    ) : (
                      <p className="text-gray-800 font-bold">{editedEmployeeData.profile?.dob ? new Date(editedEmployeeData.profile.dob).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Not provided'}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="group">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 group-hover:text-blue-500 transition-colors">Gender</p>
                      {isEditMode ? (
                        <select value={editedEmployeeData.profile?.gender || 'Other'} onChange={(e) => handleFieldChange('gender', e.target.value, 'profile')} className="w-full bg-gray-50 border-gray-200 rounded-lg text-sm font-bold" aria-label="Gender">
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                      ) : (
                        <p className="text-gray-800 font-bold">{editedEmployeeData.profile?.gender || 'Other'}</p>
                      )}
                    </div>
                    <div className="group">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 group-hover:text-blue-500 transition-colors">Marital Status</p>
                      {isEditMode ? (
                        <select value={editedEmployeeData.profile?.maritalStatus || 'Single'} onChange={(e) => handleFieldChange('maritalStatus', e.target.value, 'profile')} className="w-full bg-gray-50 border-gray-200 rounded-lg text-sm font-bold" aria-label="Marital Status">
                          <option value="Single">Single</option>
                          <option value="Married">Married</option>
                          <option value="Divorced">Divorced</option>
                          <option value="Widowed">Widowed</option>
                        </select>
                      ) : (
                        <p className="text-gray-800 font-bold">{editedEmployeeData.profile?.maritalStatus || 'Single'}</p>
                      )}
                    </div>
                  </div>

                  <div className="group">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 group-hover:text-blue-500 transition-colors">Education</p>
                    {isEditMode ? (
                      <input value={editedEmployeeData.profile?.education || ''} onChange={(e) => handleFieldChange('education', e.target.value, 'profile')} className="w-full bg-gray-50 border-gray-200 rounded-lg text-sm font-bold" aria-label="Education" placeholder="Highest Education" />
                    ) : (
                      <p className="text-gray-800 font-bold break-words">{editedEmployeeData.profile?.education || 'Not provided'}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* 3. Contact Information Card */}
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-green-50 rounded-xl">
                    <EnvelopeIcon className="w-5 h-5 text-green-600" />
                  </div>
                  <h3 className="font-black text-gray-900 uppercase tracking-wider text-xs">Reachability</h3>
                </div>

                <div className="space-y-5">
                  <div className="group relative">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 group-hover:text-green-600 transition-colors">Official Email</p>
                    {isEditMode ? (
                      <input value={editedEmployeeData.officeEmail || editedEmployeeData.email} onChange={(e) => handleFieldChange('officeEmail', e.target.value)} className="w-full bg-gray-50 border-gray-200 rounded-lg text-sm font-bold" aria-label="Official Email" placeholder="Official Email" />
                    ) : (
                      <div className="flex items-center justify-between">
                        <p className="text-gray-800 font-bold truncate">{editedEmployeeData.officeEmail || editedEmployeeData.email}</p>
                        <button
                          onClick={() => {
                            const email = editedEmployeeData.officeEmail || editedEmployeeData.email || '';
                            navigator.clipboard.writeText(email);
                            toast.success('Email copied to clipboard');
                          }}
                          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-green-600 transition-all opacity-0 group-hover:opacity-100"
                          title="Copy email"
                        >
                          <DocumentChartBarIcon className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="group">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 group-hover:text-green-600 transition-colors">Personal Mobile</p>
                    {isEditMode ? (
                      <input value={editedEmployeeData.profile?.personalMobile || ''} onChange={(e) => handleFieldChange('personalMobile', e.target.value, 'profile')} className="w-full bg-gray-50 border-gray-200 rounded-lg text-sm font-bold" aria-label="Personal Mobile" placeholder="Mobile Number" />
                    ) : (
                      <p className="text-gray-800 font-bold">{editedEmployeeData.profile?.personalMobile || 'Not provided'}</p>
                    )}
                  </div>

                  <div className="group">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 group-hover:text-green-600 transition-colors">Personal Email</p>
                    {isEditMode ? (
                      <input value={editedEmployeeData.profile?.personalEmail || ''} onChange={(e) => handleFieldChange('personalEmail', e.target.value, 'profile')} className="w-full bg-gray-50 border-gray-200 rounded-lg text-sm font-bold" aria-label="Personal Email" placeholder="Personal Email" />
                    ) : (
                      <p className="text-gray-800 font-bold">{editedEmployeeData.profile?.personalEmail || 'Not provided'}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* 4. Employment Card */}
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-purple-50 rounded-xl">
                    <BriefcaseIcon className="w-5 h-5 text-purple-600" />
                  </div>
                  <h3 className="font-black text-gray-900 uppercase tracking-wider text-xs">Work Info</h3>
                </div>

                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="group">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 group-hover:text-purple-600 transition-colors">Joining Date</p>
                      {isEditMode ? (
                        <input type="date" value={editedEmployeeData.profile?.doj ? new Date(editedEmployeeData.profile.doj).toISOString().split('T')[0] : ''} onChange={(e) => handleFieldChange('doj', e.target.value, 'profile')} className="w-full bg-gray-50 border-gray-200 rounded-lg text-sm font-bold" aria-label="Joining Date" title="Joining Date" />
                      ) : (
                        <p className="text-gray-800 font-bold">{editedEmployeeData.profile?.doj ? new Date(editedEmployeeData.profile.doj).toLocaleDateString() : 'Not set'}</p>
                      )}
                    </div>
                    <div className="group">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 group-hover:text-purple-600 transition-colors">Employment Type</p>
                      {isEditMode ? (
                        <select value={editedEmployeeData.profile?.employmentType || 'Permanent'} onChange={(e) => handleFieldChange('employmentType', e.target.value, 'profile')} className="w-full bg-gray-50 border-gray-200 rounded-lg text-sm font-bold" aria-label="Employment Type">
                          <option value="Permanent">Permanent</option>
                          <option value="Contract">Contract</option>
                          <option value="Intern">Intern</option>
                        </select>
                      ) : (
                        <p className="text-gray-800 font-bold">{editedEmployeeData.profile?.employmentType || 'Permanent'}</p>
                      )}
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50/50 rounded-2xl border border-gray-100">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Reporting Hierarchy</p>
                    <div className="space-y-4">
                      {/* Partners - Visible for Employee and Manager */}
                      {editedEmployeeData.role !== 'Partner' && (
                        <div>
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-tighter mb-2">Reporting Partner</p>
                          {isEditMode ? (
                            <select
                              value={editedEmployeeData.partnerId || ''}
                              onChange={(e) => handleFieldChange('partnerId', e.target.value)}
                              className="w-full px-3 py-1 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold outline-none"
                              aria-label="Reporting Partner"
                            >
                              <option value="">Select Partner</option>
                              {filteredPartners.map(p => (
                                <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
                              ))}
                            </select>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {editedEmployeeData.partner ? (
                                <div className="flex items-center gap-2 px-2 py-1 bg-purple-50 border border-purple-100 rounded-lg">
                                  <BuildingOfficeIcon className="w-3 h-3 text-purple-600" />
                                  <span className="text-[11px] font-bold text-purple-700">
                                    {editedEmployeeData.partner.firstName} {editedEmployeeData.partner.lastName}
                                  </span>
                                </div>
                              ) : (editedEmployeeData.partners && editedEmployeeData.partners.length > 0) ? (
                                editedEmployeeData.partners.map((p: NestedPartner, i: number) => (
                                  <div key={i} className="flex items-center gap-2 px-2 py-1 bg-purple-50 border border-purple-100 rounded-lg">
                                    <BuildingOfficeIcon className="w-3 h-3 text-purple-600" />
                                    <span className="text-[11px] font-bold text-purple-700">{p.name || `${p.partner?.firstName || ''} ${p.partner?.lastName || ''}`}</span>
                                  </div>
                                ))
                              ) : (
                                <span className="text-xs text-gray-400 italic">None assigned</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Managers - Visible for Employee and Manager */}
                      {editedEmployeeData.role !== 'Partner' && (
                        <div>
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-tighter mb-2">Reporting Manager</p>
                          {isEditMode ? (
                            <select
                              value={editedEmployeeData.managerId || ''}
                              onChange={(e) => handleFieldChange('managerId', e.target.value)}
                              className="w-full px-3 py-1 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold outline-none"
                              aria-label="Reporting Manager"
                            >
                              <option value="">Select Manager</option>
                              {managers.map(m => (
                                <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>
                              ))}
                            </select>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {editedEmployeeData.manager ? (
                                <div className="flex items-center gap-2 px-2 py-1 bg-indigo-50 border border-indigo-100 rounded-lg">
                                  <UserGroupIcon className="w-3 h-3 text-indigo-600" />
                                  <span className="text-[11px] font-bold text-indigo-700">
                                    {editedEmployeeData.manager.firstName} {editedEmployeeData.manager.lastName}
                                  </span>
                                </div>
                              ) : (editedEmployeeData.managers && editedEmployeeData.managers.length > 0) ? (
                                editedEmployeeData.managers.map((m: NestedManager, i: number) => (
                                  <div key={i} className="flex items-center gap-2 px-2 py-1 bg-indigo-50 border border-indigo-100 rounded-lg">
                                    <UserGroupIcon className="w-3 h-3 text-indigo-600" />
                                    <span className="text-[11px] font-bold text-indigo-700">{m.name || `${m.manager?.firstName || ''} ${m.manager?.lastName || ''}`}</span>
                                  </div>
                                ))
                              ) : (
                                <span className="text-xs text-gray-400 italic">None assigned</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Sub Manager - Visible ONLY for Employee role */}
                      {editedEmployeeData.role === 'Employee' && (
                        <div>
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-tighter mb-2">Sub Manager</p>
                          {isEditMode ? (
                            <select
                              value={editedEmployeeData?.subManagerId || ''}
                              onChange={(e) => handleFieldChange('subManagerId', e.target.value)}
                              className="w-full px-3 py-1 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold outline-none"
                              aria-label="Sub Manager"
                            >
                              <option value="">Select Sub Manager (Optional)</option>
                              {managers.map(m => (
                                <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>
                              ))}
                            </select>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {editedEmployeeData?.subManagers && editedEmployeeData.subManagers.length > 0 ? (
                                editedEmployeeData.subManagers.map((sm: any) => (
                                  <div key={sm.id} className="flex items-center gap-2 px-2 py-1 bg-blue-50 border border-blue-100 rounded-lg">
                                    <UserGroupIcon className="w-3 h-3 text-blue-600" />
                                    <span className="text-[11px] font-bold text-blue-700">
                                      {sm.name}
                                    </span>
                                  </div>
                                ))
                              ) : editedEmployeeData?.subManager ? (
                                <div className="flex items-center gap-2 px-2 py-1 bg-blue-50 border border-blue-100 rounded-lg">
                                  <UserGroupIcon className="w-3 h-3 text-blue-600" />
                                  <span className="text-[11px] font-bold text-blue-700">
                                    {editedEmployeeData.subManager.firstName} {editedEmployeeData.subManager.lastName}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400 italic">None assigned</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {editedEmployeeData.role === 'Partner' && (
                        <p className="text-xs text-gray-400 italic">Top-level role (No reporting hierarchy)</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 5. Address & Location Card */}
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-orange-50 rounded-xl">
                    <MapPinIcon className="w-5 h-5 text-orange-600" />
                  </div>
                  <h3 className="font-black text-gray-900 uppercase tracking-wider text-xs">Primary Residence</h3>
                </div>

                <div className="space-y-5">
                  <div className="group">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 group-hover:text-orange-600 transition-colors">Permanent Address</p>
                    {isEditMode ? (
                      <textarea
                        value={editedEmployeeData.profile?.permanentAddress || ''}
                        onChange={(e) => handleFieldChange('permanentAddress', e.target.value, 'profile')}
                        className="w-full bg-gray-50 border-gray-200 rounded-lg text-sm font-bold min-h-[80px] outline-none focus:ring-2 focus:ring-orange-500/20"
                        placeholder="Enter permanent address..."
                      />
                    ) : (
                      <p className="text-gray-800 font-bold text-sm leading-relaxed whitespace-pre-line">
                        {editedEmployeeData.profile?.permanentAddress || 'No address provided in system profile.'}
                      </p>
                    )}
                  </div>

                  <div className="group">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 group-hover:text-orange-600 transition-colors">Pincode</p>
                    {isEditMode ? (
                      <input
                        type="text"
                        value={editedEmployeeData.profile?.currentPinCode || ''}
                        onChange={(e) => handleFieldChange('currentPinCode', e.target.value, 'profile')}
                        className="w-full bg-gray-50 border-gray-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-orange-500/20"
                        placeholder="Pincode"
                      />
                    ) : (
                      <p className="text-gray-800 font-bold">{editedEmployeeData.profile?.currentPinCode || 'N/A'}</p>
                    )}
                  </div>

                  {!isEditMode && (
                    <div className="p-4 bg-orange-50 rounded-2xl flex items-start gap-3">
                      <div className="shrink-0 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-sm">
                        <ExclamationTriangleIcon className="w-4 h-4 text-orange-600" />
                      </div>
                      <p className="text-[11px] font-medium text-orange-700 leading-normal">
                        Always verify the address during emergency protocols. System logs update every 90 days.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* 6. Emergency Contact Card (Full Width) */}
              <div className="md:col-span-2 bg-gradient-to-br from-red-50/50 to-white rounded-3xl border border-red-100 p-6 flex flex-col sm:flex-row gap-6">
                <div className="shrink-0">
                  <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center">
                    <ChatBubbleLeftRightIcon className="w-7 h-7 text-red-600" />
                  </div>
                </div>
                <div className="flex-1 space-y-4">
                  <h3 className="font-black text-red-900 uppercase tracking-wider text-xs">Emergency Protocols</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div className="group">
                      <p className="text-[9px] font-black text-red-400 uppercase tracking-widest mb-1 group-hover:text-red-600 transition-colors">Primary Contact</p>
                      {isEditMode ? (
                        <input value={editedEmployeeData.profile?.emergencyContactName || ''} onChange={(e) => handleFieldChange('emergencyContactName', e.target.value, 'profile')} className="w-full bg-white/50 border-red-100 rounded-lg text-xs font-bold" aria-label="Emergency Contact Name" placeholder="Contact Name" />
                      ) : (
                        <p className="text-gray-900 font-black">{editedEmployeeData.profile?.emergencyContactName || 'N/A'}</p>
                      )}
                    </div>
                    <div className="group">
                      <p className="text-[9px] font-black text-red-400 uppercase tracking-widest mb-1 group-hover:text-red-600 transition-colors">Relation</p>
                      {isEditMode ? (
                        <input value={editedEmployeeData.profile?.emergencyContactRelation || ''} onChange={(e) => handleFieldChange('emergencyContactRelation', e.target.value, 'profile')} className="w-full bg-white/50 border-red-100 rounded-lg text-xs font-bold" aria-label="Emergency Contact Relation" placeholder="Relation" />
                      ) : (
                        <p className="text-gray-900 font-black">{editedEmployeeData.profile?.emergencyContactRelation || 'N/A'}</p>
                      )}
                    </div>
                    <div className="group">
                      <p className="text-[9px] font-black text-red-400 uppercase tracking-widest mb-1 group-hover:text-red-600 transition-colors">Direct Phone</p>
                      {isEditMode ? (
                        <input value={editedEmployeeData.profile?.emergencyContactPhone || ''} onChange={(e) => handleFieldChange('emergencyContactPhone', e.target.value, 'profile')} className="w-full bg-white/50 border-red-100 rounded-lg text-xs font-bold" aria-label="Emergency Contact Phone" placeholder="Phone Number" />
                      ) : (
                        <a href={`tel:${editedEmployeeData.profile?.emergencyContactPhone}`} className="text-red-600 font-black hover:underline">{editedEmployeeData.profile?.emergencyContactPhone || 'N/A'}</a>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 7. Banking & Identity (Full Width) */}
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Banking Details */}
                <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-amber-50 rounded-xl">
                      <BuildingOfficeIcon className="w-5 h-5 text-amber-600" />
                    </div>
                    <h3 className="font-black text-gray-900 uppercase tracking-wider text-xs">Bank Details</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                    <div>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Account Holder</p>
                      {isEditMode ? (
                        <input value={editedEmployeeData.profile?.accountHolderName || ''} onChange={(e) => handleFieldChange('accountHolderName', e.target.value, 'profile')} className="w-full bg-gray-50 border-gray-100 rounded-lg text-xs font-bold px-2 py-1 outline-none focus:ring-2 focus:ring-amber-500/20" aria-label="Account Holder Name" placeholder="Account Holder" />
                      ) : (
                        <p className="text-xs font-bold text-gray-800 truncate">{editedEmployeeData.profile?.accountHolderName || 'N/A'}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Bank Name</p>
                      {isEditMode ? (
                        <input value={editedEmployeeData.profile?.bankName || ''} onChange={(e) => handleFieldChange('bankName', e.target.value, 'profile')} className="w-full bg-gray-50 border-gray-100 rounded-lg text-xs font-bold px-2 py-1 outline-none focus:ring-2 focus:ring-amber-500/20" aria-label="Bank Name" placeholder="Bank Name" />
                      ) : (
                        <p className="text-xs font-bold text-gray-800 truncate">{editedEmployeeData.profile?.bankName || 'N/A'}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Account Number</p>
                      {isEditMode ? (
                        <input value={editedEmployeeData.profile?.bankAccountNumber || ''} onChange={(e) => handleFieldChange('bankAccountNumber', e.target.value, 'profile')} className="w-full bg-gray-50 border-gray-100 rounded-lg text-xs font-bold px-2 py-1 outline-none focus:ring-2 focus:ring-amber-500/20" aria-label="Bank Account Number" placeholder="Account Number" />
                      ) : (
                        <p className="text-xs font-bold text-gray-800">•••• {editedEmployeeData.profile?.bankAccountNumber?.slice(-4) || 'N/A'}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">IFSC Code</p>
                      {isEditMode ? (
                        <input value={editedEmployeeData.profile?.ifscCode || ''} onChange={(e) => handleFieldChange('ifscCode', e.target.value, 'profile')} className="w-full bg-gray-50 border-gray-100 rounded-lg text-xs font-bold px-2 py-1 outline-none focus:ring-2 focus:ring-amber-500/20" aria-label="IFSC Code" placeholder="IFSC Code" />
                      ) : (
                        <p className="text-xs font-bold text-gray-800 uppercase tracking-tighter">{editedEmployeeData.profile?.ifscCode || 'N/A'}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Identity Proofs */}
                <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-indigo-50 rounded-xl">
                      <IdentificationIcon className="w-5 h-5 text-indigo-600" />
                    </div>
                    <h3 className="font-black text-gray-900 uppercase tracking-wider text-xs">Identity Index</h3>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border border-gray-100">
                      <div className="flex items-center gap-3 w-full">
                        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm">
                          <DocumentIcon className="w-4 h-4 text-gray-400" />
                        </div>
                        <div className="flex-1">
                          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">PAN Card</p>
                          {isEditMode ? (
                            <input value={editedEmployeeData.profile?.pan || ''} onChange={(e) => handleFieldChange('pan', e.target.value, 'profile')} className="w-full bg-white border-gray-100 rounded-lg text-xs font-black tracking-widest px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500/20" aria-label="PAN Number" placeholder="PAN Number" />
                          ) : (
                            <p className="text-xs font-black text-gray-800 tracking-widest">{editedEmployeeData.profile?.pan || 'NOT LINKED'}</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border border-gray-100">
                      <div className="flex items-center gap-3 w-full">
                        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm">
                          <IdentificationIcon className="w-4 h-4 text-gray-400" />
                        </div>
                        <div className="flex-1">
                          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Aadhaar</p>
                          {isEditMode ? (
                            <input value={editedEmployeeData.profile?.aadhaar || ''} onChange={(e) => handleFieldChange('aadhaar', e.target.value, 'profile')} className="w-full bg-white border-gray-100 rounded-lg text-xs font-black tracking-widest px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500/20" aria-label="Aadhaar Number" placeholder="Aadhaar Number" />
                          ) : (
                            <p className="text-xs font-black text-gray-800 tracking-widest">•••• •••• {editedEmployeeData.profile?.aadhaar?.slice(-4) || 'XXXX'}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 8. NEW: Document Upload Section in Edit Mode */}
                {isEditMode && (
                  <div className="md:col-span-2 bg-blue-50/30 rounded-3xl border-2 border-dashed border-blue-200 p-8 flex flex-col items-center justify-center text-center group hover:bg-blue-50 transition-all">
                    <div className="w-16 h-16 bg-white rounded-2xl shadow-md border border-blue-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <CloudArrowUpIcon className="w-8 h-8 text-blue-600" />
                    </div>
                    <h3 className="text-lg font-black text-blue-900 uppercase tracking-wider mb-2">Upload New Documents</h3>
                    <p className="text-sm text-blue-600/70 font-medium mb-6 max-w-[300px]">
                      Attach certificates, ID proofs, or experience letters directly to the profile.
                    </p>

                    <button
                      onClick={() => document.getElementById('edit-mode-files')?.click()}
                      className="px-8 py-3 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:shadow-blue-500/30 hover:bg-blue-700 transition-all active:scale-95"
                    >
                      {selectedFiles && selectedFiles.length > 0 ? `${selectedFiles.length} Files Selected` : 'Select Documents'}
                    </button>

                    <input
                      id="edit-mode-files"
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => setSelectedFiles(e.target.files)}
                      aria-label="Upload documents"
                    />

                    {selectedFiles && selectedFiles.length > 0 && (
                      <div className="mt-6 w-full max-w-md bg-white rounded-2xl border border-blue-100 p-4 space-y-2">
                        {Array.from(selectedFiles).map((file, idx) => (
                          <div key={idx} className="flex items-center justify-between text-[11px] font-bold text-gray-600 py-1 border-b border-gray-50 last:border-0">
                            <span className="truncate pr-4 text-left">{file.name}</span>
                            <span className="text-gray-400 shrink-0">{(file.size / 1024).toFixed(0)} KB</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="mt-8 pt-6 border-t border-gray-100 flex items-center justify-between">
              <div className="flex flex-col">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[2px]">Data Snapshot</p>
                <p className="text-[11px] font-bold text-gray-500">Record created on {new Date(editedEmployeeData.createdAt).toLocaleDateString()}</p>
              </div>

              <button
                onClick={() => {
                  setShowDetailsModal(false);
                  setSelectedEmployee(null);
                  setEnhancedEmployeeDetails(null);
                  setEditedEmployeeData(null);
                  setIsEditMode(false);
                }}
                className="h-10 px-8 bg-gray-900 text-white rounded-xl text-sm font-black shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all"
              >
                Close View
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <ASALoader size="md" text="Loading details..." />
          </div>
        )}
      </Modal>

      {/* Enhanced Employee Profile Modal */}
      <Modal
        isOpen={showProfileModal}
        onClose={() => {
          setShowProfileModal(false);
          setEnhancedEmployeeDetails(null);
        }}
        title="Complete Employee Profile"
        size="full"
      >
        {enhancedEmployeeDetails && (
          <div className="space-y-6 max-h-[80vh] overflow-y-auto">
            {/* Profile Photo Section */}
            <div className="bg-white border border-secondary-200 rounded-lg p-6">
              <h3 className="text-lg font-bold text-secondary-900 mb-4 flex items-center gap-2">
                <PhotoIcon className="w-5 h-5 text-primary-600" />
                Profile Photo
              </h3>
              <div className="flex items-center gap-6">
                <div className="relative group/avatar">
                  <Avatar
                    name={`${enhancedEmployeeDetails?.firstName || ''} ${enhancedEmployeeDetails?.lastName || ''}`}
                    src={enhancedEmployeeDetails?.profileImage}
                    size="xl"
                    className="border-4 border-secondary-200"
                  />
                  <label htmlFor="profileImageUpload" aria-label="Upload profile image" className="absolute bottom-0 right-0 bg-primary-600 text-white p-2 rounded-full cursor-pointer hover:bg-primary-700 transition-colors shadow-lg">
                    <PencilSquareIcon className="w-4 h-4" />
                  </label>
                  <input
                    id="profileImageUpload"
                    type="file"
                    accept="image/*"
                    aria-label="Upload profile photo"
                    title="Upload profile photo"
                    className="hidden"
                    onChange={handleProfilePhotoUpload}
                  />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-secondary-600 mb-2">
                    Upload a professional profile photo. Recommended size: 200x200px, max 5MB.
                  </p>
                  <p className="text-xs text-secondary-500">
                    Supported formats: JPEG, JPG, PNG
                  </p>
                </div>
              </div>
            </div>

            {/* Section 1: Personal Information */}
            <div className="bg-white border border-secondary-200 rounded-lg p-6">
              <h3 className="text-lg font-bold text-secondary-900 mb-4 flex items-center gap-2">
                <UserGroupIcon className="w-5 h-5 text-primary-600" />
                Personal Information
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <span className="text-sm font-medium text-secondary-500">First Name:</span>
                  <p className="text-sm font-bold text-secondary-900">{enhancedEmployeeDetails?.firstName || 'Not provided'}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-secondary-500">Last Name:</span>
                  <p className="text-sm font-bold text-secondary-900">{enhancedEmployeeDetails?.lastName || 'Not provided'}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-secondary-500">Email:</span>
                  <p className="text-sm font-bold text-secondary-900">{enhancedEmployeeDetails?.officeEmail || 'Not provided'}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-secondary-500">Phone:</span>
                  <p className="text-sm font-bold text-secondary-900">{enhancedEmployeeDetails?.profile?.personalMobile || 'Not provided'}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-secondary-500">Date of Birth:</span>
                  <p className="text-sm font-bold text-secondary-900">
                    {enhancedEmployeeDetails?.profile?.dob
                      ? new Date(enhancedEmployeeDetails.profile.dob as string | number | Date).toLocaleDateString()
                      : 'Not provided'
                    }
                  </p>
                </div>
                <div>
                  <span className="text-sm font-medium text-secondary-500">Gender:</span>
                  <p className="text-sm font-bold text-secondary-900">{enhancedEmployeeDetails?.profile?.gender || 'Not provided'}</p>
                </div>
                <div className="col-span-3">
                  <span className="text-sm font-medium text-secondary-500">Address:</span>
                  <p className="text-sm font-bold text-secondary-900">{enhancedEmployeeDetails?.profile?.permanentAddress || 'Not provided'}</p>
                </div>
              </div>
            </div>

            {/* Section 2: Guardian Information */}
            <div className="bg-white border border-secondary-200 rounded-lg p-6">
              <h3 className="text-lg font-bold text-secondary-900 mb-4 flex items-center gap-2">
                <UserGroupIcon className="w-5 h-5 text-info-600" />
                Guardian Information
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <span className="text-sm font-medium text-secondary-500">Guardian Name:</span>
                  <p className="text-sm font-bold text-secondary-900">{enhancedEmployeeDetails?.profile?.guardianName || 'Not provided'}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-secondary-500">Guardian Phone:</span>
                  <p className="text-sm font-bold text-secondary-900">{enhancedEmployeeDetails?.profile?.guardianNumber || 'Not provided'}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-secondary-500">Guardian Relation:</span>
                  <p className="text-sm font-bold text-secondary-900">{enhancedEmployeeDetails?.profile?.emergencyContactRelation || 'Not provided'}</p>
                </div>
              </div>
            </div>

            {/* Section 3: Education Details */}
            <div className="bg-white border border-secondary-200 rounded-lg p-6">
              <h3 className="text-lg font-bold text-secondary-900 mb-4 flex items-center gap-2">
                <DocumentIcon className="w-5 h-5 text-success-600" />
                Education Details
              </h3>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <span className="text-sm font-medium text-secondary-500">Qualification:</span>
                  <p className="text-sm font-bold text-secondary-900">{enhancedEmployeeDetails?.profile?.education || 'Not provided'}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-secondary-500">University:</span>
                  <p className="text-sm font-bold text-secondary-900">{enhancedEmployeeDetails?.profile?.education || 'Not provided'}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-secondary-500">Passing Year:</span>
                  <p className="text-sm font-bold text-secondary-900">{enhancedEmployeeDetails?.profile?.education || 'Not provided'}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-secondary-500">Grade:</span>
                  <p className="text-sm font-bold text-secondary-900">{enhancedEmployeeDetails?.profile?.education || 'Not provided'}</p>
                </div>
              </div>
            </div>

            {/* Section 4: Bank Details */}
            <div className="bg-white border border-secondary-200 rounded-lg p-6">
              <h3 className="text-lg font-bold text-secondary-900 mb-4 flex items-center gap-2">
                <DocumentIcon className="w-5 h-5 text-warning-600" />
                Bank Details
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm font-medium text-secondary-500">Bank Name:</span>
                  <p className="text-sm font-bold text-secondary-900">{enhancedEmployeeDetails?.profile?.bankName || 'Not provided'}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-secondary-500">Account Number:</span>
                  <p className="text-sm font-bold text-secondary-900">{enhancedEmployeeDetails?.profile?.bankAccountNumber || 'Not provided'}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-secondary-500">IFSC Code:</span>
                  <p className="text-sm font-bold text-secondary-900">{enhancedEmployeeDetails?.profile?.ifscCode || 'Not provided'}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-secondary-500">Branch Name:</span>
                  <p className="text-sm font-bold text-secondary-900">{enhancedEmployeeDetails?.profile?.branchName || 'Not provided'}</p>
                </div>
              </div>
            </div>

            {/* Section 5: Identity Documents */}
            <div className="bg-white border border-secondary-200 rounded-lg p-6">
              <h3 className="text-lg font-bold text-secondary-900 mb-4 flex items-center gap-2">
                <FolderOpenIcon className="w-5 h-5 text-indigo-600" />
                Identity Documents
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm font-medium text-secondary-500">PAN Number:</span>
                  <p className="text-sm font-bold text-secondary-900">{enhancedEmployeeDetails?.profile?.pan || 'Not provided'}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-secondary-500">Aadhaar Number:</span>
                  <p className="text-sm font-bold text-secondary-900">{enhancedEmployeeDetails?.profile?.aadhaar || 'Not provided'}</p>
                </div>
              </div>
            </div>

            {/* Section 6: Attachments */}
            <div className="bg-white border border-secondary-200 rounded-lg p-6">
              <h3 className="text-lg font-bold text-secondary-900 mb-4 flex items-center gap-2">
                <DocumentIcon className="w-5 h-5 text-purple-600" />
                Attachments
              </h3>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <span className="text-sm font-medium text-secondary-500">PAN Card:</span>
                  <div className="mt-2 flex gap-2">
                    {enhancedEmployeeDetails?.profile?.panFileUrl && (
                      <>
                        <button
                          onClick={() => {
                            if (enhancedEmployeeDetails?.profile?.panFileUrl) {
                              handleViewAttachment(enhancedEmployeeDetails.profile.panFileUrl, 'PAN Card');
                            }
                          }}
                          className="text-primary-600 hover:text-primary-700 text-sm font-medium underline"
                        >
                          View
                        </button>
                        <button
                          onClick={() => {
                            const fileUrl = enhancedEmployeeDetails?.profile?.panFileUrl || '';
                            handleDownloadAttachment(fileUrl.split('/').pop() || 'pan-card.pdf');
                          }}
                          className="text-success-600 hover:text-success-700 text-sm font-medium underline"
                        >
                          Download
                        </button>
                      </>
                    )}
                    {!enhancedEmployeeDetails?.profile?.panFileUrl && (
                      <p className="text-sm text-secondary-400">Not uploaded</p>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-sm font-medium text-secondary-500">Aadhaar Card:</span>
                  <div className="mt-2 flex gap-2">
                    {enhancedEmployeeDetails?.profile?.aadhaarFileUrl && (
                      <>
                        <button
                          onClick={() => {
                            if (enhancedEmployeeDetails?.profile?.aadhaarFileUrl) {
                              handleViewAttachment(enhancedEmployeeDetails.profile.aadhaarFileUrl, 'Aadhaar Card');
                            }
                          }}
                          className="text-primary-600 hover:text-primary-700 text-sm font-medium underline"
                        >
                          View
                        </button>
                        <button
                          onClick={() => {
                            const fileUrl = enhancedEmployeeDetails?.profile?.aadhaarFileUrl || '';
                            handleDownloadAttachment(fileUrl.split('/').pop() || 'aadhaar-card.pdf');
                          }}
                          className="text-success-600 hover:text-success-700 text-sm font-medium underline"
                        >
                          Download
                        </button>
                      </>
                    )}
                    {!enhancedEmployeeDetails?.profile?.aadhaarFileUrl && (
                      <p className="text-sm text-secondary-400">Not uploaded</p>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-sm font-medium text-secondary-500">Education Certificate:</span>
                  <div className="mt-2 flex gap-2">
                    <p className="text-sm text-secondary-400">Not uploaded</p>
                  </div>
                </div>
                <div>
                  <span className="text-sm font-medium text-secondary-500">Profile Photo:</span>
                  <div className="mt-2 flex gap-2">
                    <p className="text-sm text-secondary-400">Not uploaded</p>
                  </div>
                </div>
                <div>
                  <span className="text-sm font-medium text-secondary-500">Other Documents:</span>
                  <div className="mt-2 flex gap-2">
                    <p className="text-sm text-secondary-400">Not uploaded</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button variant="secondary" fullWidth onClick={() => setShowProfileModal(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Documents Modal */}
      <Modal
        isOpen={showDocumentsModal}
        onClose={() => {
          setShowDocumentsModal(false);
          setEmployeeDocuments([]);
          setSelectedEmployee(null);
        }}
        title="Employee Documents"
        size="lg"
      >
        <div className="space-y-6">
          {selectedEmployee && (
            <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100 flex items-center gap-4">
              <Avatar
                name={`${selectedEmployee.firstName} ${selectedEmployee.lastName}`}
                size="md"
                src={selectedEmployee?.profileImage}
              />
              <div>
                <h3 className="font-bold text-gray-900">
                  {selectedEmployee.firstName} {selectedEmployee.lastName}
                </h3>
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
                  {selectedEmployee.employeeId} | {selectedEmployee.designation}
                </p>
              </div>
              <div className="ml-auto">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowUploadDocumentModal(true)}
                  className="rounded-xl shadow-sm bg-blue-600 hover:bg-blue-700 font-bold text-[11px] uppercase tracking-widest px-4"
                  leftIcon={<CloudArrowUpIcon className="w-4 h-4" />}
                >
                  Add Document
                </Button>
              </div>
            </div>
          )}

          <div className="min-h-[300px]">
            {fetchingDocuments ? (
              <div className="flex flex-col items-center justify-center py-20">
                <ASALoader size="md" text="Scanning Repository..." />
              </div>
            ) : employeeDocuments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                  <FolderOpenIcon className="w-10 h-10 text-gray-200" />
                </div>
                <h4 className="text-lg font-bold text-gray-900">No Documents Found</h4>
                <p className="text-sm text-gray-500 max-w-[250px] mt-1">
                  Click the button above to upload files for this employee.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {employeeDocuments.map((doc) => {
                  // Icon based on file type
                  const getFileIcon = (mime: string, name: string) => {
                    const ext = name.split('.').pop()?.toLowerCase();
                    if (mime.includes('pdf') || ext === 'pdf') return <DocumentIcon className="w-6 h-6 text-red-500" />;
                    if (mime.includes('image') || ['jpg', 'jpeg', 'png'].includes(ext || '')) return <PhotoIcon className="w-6 h-6 text-blue-500" />;
                    if (mime.includes('word') || ['doc', 'docx'].includes(ext || '')) return <DocumentIcon className="w-6 h-6 text-indigo-600" />;
                    return <DocumentIcon className="w-6 h-6 text-gray-400" />;
                  };

                  return (
                    <div key={doc.id} className="group bg-white border border-gray-100 rounded-2xl p-4 hover:border-blue-200 hover:shadow-md transition-all flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                        {getFileIcon(doc.mimeType, doc.fileName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                            {doc.category}
                          </span>
                          <span className="text-[10px] font-bold text-gray-400">
                            {new Date(doc.uploadedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <h4 className="font-bold text-gray-900 truncate pr-4">{doc.title}</h4>
                        <p className="text-[10px] text-gray-400 truncate uppercase tracking-tighter">
                          {doc.fileName} | {(doc.fileSize / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleViewDocument(doc.id)}
                          className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors disabled:opacity-50"
                          title="Preview"
                          disabled={openingDocId === doc.id}
                        >
                          {openingDocId === doc.id ? (
                            <ASALoader size="xs" />
                          ) : (
                            <EyeIcon className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDownloadDocument(doc.id, doc.fileName)}
                          className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-colors disabled:opacity-50"
                          title="Download"
                          disabled={openingDocId === doc.id}
                        >
                          <ArrowDownTrayIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteDocument(doc.id)}
                          className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-gray-100 flex justify-end">
            <Button variant="secondary" className="rounded-xl px-8 font-bold text-sm" onClick={() => {
              setShowDocumentsModal(false);
              setEmployeeDocuments([]);
              setSelectedEmployee(null);
            }}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Upload Document Modal */}
      <Modal
        isOpen={showUploadDocumentModal}
        onClose={() => {
          setShowUploadDocumentModal(false);
          setDocumentTitle('');
          setSelectedFiles(null);
          setDocumentCategory('Other');
          setUploadProgress(0);
        }}
        title="Add New Documents"
        size="md"
      >
        <div className="space-y-6">
          <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-start gap-3">
            <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-[11px] font-bold text-amber-800 leading-normal">
              Supported formats: PDF, JPG, PNG, DOCX. Max file size: 10MB per file.
              You can select multiple files at once.
            </p>
          </div>

          <Input
            label="Document Group Title (Optional)"
            placeholder="e.g. Q1 Certifications"
            value={documentTitle}
            onChange={(e) => setDocumentTitle(e.target.value)}
            className="rounded-xl border-gray-100 bg-gray-50/50"
          />

          <div className="space-y-2">
            <label htmlFor="doc-category-select" className="text-[11px] font-black text-gray-400 uppercase tracking-widest block ml-1">Category</label>
            <select
              id="doc-category-select"
              className="w-full px-4 py-3 bg-gray-50/50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-bold text-gray-700"
              value={documentCategory}
              aria-label="Document Category"
              onChange={(e) => setDocumentCategory(e.target.value)}
              required
            >
              {documentCategories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest block ml-1">File Attachment</label>
            <div
              className={`relative border-2 border-dashed rounded-2xl p-8 transition-all flex flex-col items-center justify-center text-center cursor-pointer ${selectedFiles && selectedFiles.length > 0
                ? 'border-blue-300 bg-blue-50/20'
                : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50'
                }`}
              onClick={() => document.getElementById('multi-file-upload')?.click()}
            >
              <input
                id="multi-file-upload"
                type="file"
                multiple
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                aria-label="Select files"
                onChange={(e) => setSelectedFiles(e.target.files)}
              />
              <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-gray-100 flex items-center justify-center mb-3">
                <CloudArrowUpIcon className="w-6 h-6 text-blue-500" />
              </div>
              {selectedFiles && selectedFiles.length > 0 ? (
                <div>
                  <p className="text-sm font-bold text-gray-900">{selectedFiles.length} file(s) selected</p>
                  <p className="text-xs text-blue-600 font-bold mt-1">Click to change selection</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-bold text-gray-900">Click to browse or Drag & Drop</p>
                  <p className="text-xs text-gray-400 font-medium mt-1">PDF, JPG, PNG, DOCX allowed</p>
                </div>
              )}
            </div>

            {selectedFiles && selectedFiles.length > 0 && (
              <div className="mt-4 max-h-32 overflow-y-auto space-y-2 p-2 bg-gray-50 rounded-xl border border-gray-100 custom-scrollbar">
                {Array.from(selectedFiles).map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px] font-bold text-gray-600 bg-white p-2 rounded-lg border border-gray-50">
                    <span className="truncate pr-4">{f.name}</span>
                    <span className="shrink-0 text-gray-400">{(f.size / 1024).toFixed(0)} KB</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {uploadingDocument && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest">
                <span className="text-blue-600">Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress}%` }}
                  className="h-full bg-blue-600 rounded-full shadow-[0_0_10px_rgba(37,99,235,0.4)]"
                />
              </div>
            </div>
          )}

          <div className="pt-4 flex gap-3">
            <Button
              variant="secondary"
              fullWidth
              className="rounded-xl font-bold"
              onClick={() => {
                setShowUploadDocumentModal(false);
                setDocumentTitle('');
                setSelectedFiles(null);
                setDocumentCategory('Other');
                setUploadProgress(0);
              }}
              disabled={uploadingDocument}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              fullWidth
              className="rounded-xl font-bold bg-blue-600 hover:bg-blue-700 shadow-md"
              onClick={handleUploadDocument}
              disabled={uploadingDocument || !selectedFiles || selectedFiles.length === 0}
              leftIcon={uploadingDocument ? null : <PaperAirplaneIcon className="w-4 h-4" />}
            >
              {uploadingDocument ? 'Transmitting Data...' : 'Start Upload'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirmation Dialog */}
      <Modal
        isOpen={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        title="Confirm Action"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {confirmAction?.type === 'resend-email'
              ? `Are you sure you want to resend the registration email to ${confirmAction.employeeName}?`
              : 'Are you sure you want to perform this action?'}
          </p>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                setShowConfirmDialog(false);
                setConfirmAction(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              fullWidth
              onClick={handleConfirmAction}
            >
              Confirm
            </Button>
          </div>
        </div>
      </Modal>

      {/* Mobile FAB for adding employee */}
      {canEditEmployee() && (
        <FAB onClick={() => setShowAddModal(true)} label="Add Employee" />
      )}
      <input
        type="file"
        ref={excelFileInputRef}
        onChange={handleImportExcel}
        accept=".xlsx,.xls"
        className="hidden"
        title="Import Excel"
        aria-label="Import Excel"
      />
    </div>
  );
};

export default Employees;
