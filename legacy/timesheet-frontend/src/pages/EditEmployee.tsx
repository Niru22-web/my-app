import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeftIcon,
  UserIcon,
  BanknotesIcon,
  IdentificationIcon,
  AcademicCapIcon,
  BuildingOfficeIcon,
  UserGroupIcon,
  EnvelopeIcon
} from '@heroicons/react/24/outline';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import StatusBadge from '../components/ui/StatusBadge';
import Modal from '../components/ui/Modal';
import HierarchySelect from '../components/ui/HierarchySelect';
import API from '../api';
import { useAuth } from '../contexts/AuthContext';
import { getProfileImageUrl } from '../utils/assetUtils';
import ASALoader from '../components/ui/ASALoader';

interface EmployeeDetails {
  // Personal Details
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  officeEmail: string;
  personalEmail?: string;
  phone?: string;
  address?: string;
  dob?: string;
  gender?: string;
  
  // Identity Details
  panNumber?: string;
  aadhaarNumber?: string;
  
  // Guardian Details
  guardianName?: string;
  guardianPhone?: string;
  guardianRelation?: string;
  
  // Education Details
  qualification?: string;
  university?: string;
  passingYear?: string;
  
  // Bank Details
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  branchName?: string;
  
  // Employment Details
  role: string;
  designation: string;
  department: string;
  status: string;
  joiningDate?: string;
  
  // Attachments
  profile?: {
    panFileUrl?: string;
    aadhaarFileUrl?: string;
    profileImage?: string;
    bankStatementFileUrl?: string;
  };

  // Reporting details
  reportingPartnerIds?: string[];
  reportingManagerIds?: string[];
  subManagerIds?: string[];
  partnerIds?: string[]; // Keep for legacy
  managerIds?: string[]; // Keep for legacy
  partners?: EmployeeRef[];
  managers?: EmployeeRef[];
  subManagers?: EmployeeRef[];
  profileImage?: string | null;

  // Master references
  roleId?: string;
  designationId?: string;
  departmentId?: string;
  shiftId?: string;
  locationId?: string;
  employmentTypeId?: string;
}

interface EmployeeRef {
  id: string;
  _id?: string; // Legacy fallback for MongoDB-style responses
  firstName: string;
  lastName: string;
  name?: string;
  role?: string;
  department?: string;
  status?: string;
}



const EditEmployee: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const isAdmin = () => {
    const role = user?.role?.toLowerCase() || '';
    return role === 'admin' || role === 'owner' || role === 'it';
  };

  const isManagement = () => {
    const role = user?.role?.toLowerCase() || '';
    return ['manager', 'admin', 'partner', 'owner', 'it'].includes(role);
  };
  
  const [employee, setEmployee] = useState<EmployeeDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{type: string; employeeName: string; employeeId: string} | null>(null);

  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedPartnerIds, setSelectedPartnerIds] = useState<string[]>([]);
  const [selectedManagerIds, setSelectedManagerIds] = useState<string[]>([]);
  const [selectedSubManagerIds, setSelectedSubManagerIds] = useState<string[]>([]);
  const [partners, setPartners] = useState<EmployeeRef[]>([]);
  const [managers, setManagers] = useState<EmployeeRef[]>([]);
  const [allEmployeesForReporting, setAllEmployeesForReporting] = useState<EmployeeRef[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);

  // Master options state
  const [roleOptions, setRoleOptions] = useState<any[]>([]);
  const [designationOptions, setDesignationOptions] = useState<any[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<any[]>([]);
  const [shiftOptions, setShiftOptions] = useState<any[]>([]);
  const [locationOptions, setLocationOptions] = useState<any[]>([]);
  const [employmentTypeOptions, setEmploymentTypeOptions] = useState<any[]>([]);

  useEffect(() => {
    fetchEmployeeDetails();
    fetchMasterOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchMasterOptions = async () => {
    const safeGet = async (url: string) => {
      try {
        const res = await API.get(url);
        if (res.data?.success && Array.isArray(res.data.data)) return res.data.data;
        return [];
      } catch (err: any) {
        const status = err?.response?.status;
        if (status !== 404) {
          console.warn(`Master options fetch failed for ${url}:`, err?.message || err);
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

  const fetchEmployeeDetails = async () => {
    try {
      setLoading(true);
      const response = await API.get(`/employees/${id}`);
      
      if (response.data.success) {
        const empData = response.data.data;
        const profile = empData.profile || {};
        const flattenedData = {
          ...empData,
          personalEmail: profile.personalEmail || '',
          phone: profile.personalMobile || '',
          address: profile.currentAddress || '',
          dob: profile.dob || '',
          gender: profile.gender || '',
          panNumber: profile.pan || '',
          aadhaarNumber: profile.aadhaar || '',
          guardianName: profile.guardianName || '',
          guardianPhone: profile.guardianNumber || '',
          guardianRelation: profile.emergencyContactRelation || '',
          qualification: profile.education || '',
          university: profile.university || '',
          passingYear: profile.passingYear || '',
          bankName: profile.bankName || '',
          accountNumber: profile.bankAccountNumber || '',
          ifscCode: profile.ifscCode || '',
          branchName: profile.branchName || '',
          joiningDate: empData.joiningDate || profile.doj || '',
          employmentTypeId: profile.employmentTypeId || ''
        };
        setEmployee(flattenedData);
        
        console.log('📋 Employee data loaded:', {
          department: empData.department,
          partnerIds: empData.partnerIds,
          managerIds: empData.managerIds
        });
        
        // Fetch all users for dropdowns if admin/management
        if (isManagement()) {
          fetchUsers();
        }
      } else {
        setError('Failed to fetch employee details');
      }
    } catch (err: unknown) {
      setError('Error fetching employee details: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      setUsersLoading(true);
      console.log('🔍 Fetching all employees for dropdowns...');
      const response = await API.get('/employees', { params: { all: true } });
      
      let allUsers = [];
      if (response.data?.success && Array.isArray(response.data.data)) {
        allUsers = response.data.data;
      } else if (Array.isArray(response.data)) {
        allUsers = response.data;
      }

      const pts = (allUsers as EmployeeRef[]).filter((u) => u.role === 'Partner');
      const mgs = (allUsers as EmployeeRef[]).filter((u) => u.role === 'Manager');
      
      setPartners(pts);
      setManagers(mgs);
      setAllEmployeesForReporting((allUsers as EmployeeRef[]).filter((u) => u.status?.toLowerCase() === 'active' || u.status?.toLowerCase() === 'pending'));
      console.log(`✅ Loaded ${pts.length} partners and ${mgs.length} managers`);
    } catch (err) {
      console.error('❌ Error fetching users:', err);
    } finally {
      setUsersLoading(false);
    }

  };

  // Filter partners based on selected department (if selected)
  const filteredPartners = partners.filter(
    (p) => !selectedDepartment || p.department === selectedDepartment
  );

  // Filter managers based on:
  // - selected department (if selected)
  const filteredManagers = managers.filter(
    (m) => {
      const matchesDepartment = !selectedDepartment || m.department === selectedDepartment;
      return matchesDepartment;
    }
  );

  // Edit Mode: Pre-fill values ONLY after data is loaded
  useEffect(() => {
    if (employee && !usersLoading && partners.length > 0) {
      console.log('🔄 Pre-filling dropdown values in edit mode:', {
        pIds: employee.reportingPartnerIds,
        mIds: employee.reportingManagerIds,
        smIds: employee.subManagerIds
      });
      setSelectedDepartment(employee.department || '');
      setSelectedPartnerIds(employee.reportingPartnerIds || employee.partnerIds || []);
      setSelectedManagerIds(employee.reportingManagerIds || employee.managerIds || []);
      setSelectedSubManagerIds(employee.subManagerIds || []);
    }
  }, [employee, usersLoading, partners]);


  // Debug logs
  useEffect(() => {
    if (isManagement()) {
      console.log("Partners:", partners);
      console.log("Filtered Partners:", filteredPartners);
      console.log("Selected Partner IDs:", selectedPartnerIds);
      console.log("Filtered Managers:", filteredManagers);
      console.log("Selected Manager IDs:", selectedManagerIds);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDepartment, selectedPartnerIds, selectedManagerIds, partners, managers, filteredPartners, filteredManagers]);

  const handleSave = async () => {
    if (!employee) return;
    
    try {
      setSaving(true);
      
      // Only allow editing of certain fields
      const updateData = {
        firstName: employee.firstName,
        lastName: employee.lastName,
        officeEmail: employee.officeEmail,
        // Allow editing of these fields for admins
        role: employee.role,
        department: employee.department,
        designation: employee.designation,
        roleId: employee.roleId || null,
        designationId: employee.designationId || null,
        departmentId: employee.departmentId || null,
        shiftId: employee.shiftId || null,
        locationId: employee.locationId || null,
        reportingPartnerIds: selectedPartnerIds,
        reportingManagerIds: selectedManagerIds,
        subManagerIds: selectedSubManagerIds,
        // Legacy support
        partnerId: selectedPartnerIds[0] || null,
        managerId: selectedManagerIds[0] || null,
        subManagerId: selectedSubManagerIds[0] || null,
        status: employee.status,
        profile: {
          personalEmail: employee.personalEmail || null,
          personalMobile: employee.phone || null,
          currentAddress: employee.address || null,
          gender: employee.gender || null,
          guardianName: employee.guardianName || null,
          guardianNumber: employee.guardianPhone || null,
          emergencyContactRelation: employee.guardianRelation || null,
          education: employee.qualification || null,
          university: employee.university || null,
          passingYear: employee.passingYear || null,
          bankName: employee.bankName || null,
          bankAccountNumber: employee.accountNumber || null,
          ifscCode: employee.ifscCode || null,
          branchName: employee.branchName || null,
          dob: employee.dob || null,
          doj: employee.joiningDate || null,
          pan: employee.panNumber || null,
          aadhaar: employee.aadhaarNumber || null,
          employmentTypeId: employee.employmentTypeId || null
        }
      };

      
      const response = await API.put(`/employees/${id}`, updateData);
      
      if (response.data) {
        alert('Employee updated successfully!');
        navigate('/management/employees');
      } else {
        setError('Failed to update employee');
      }
    } catch (err: unknown) {
      setError('Error updating employee: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  const handleResendRegistrationEmail = async (employeeId: string, employeeName: string) => {
    setConfirmAction({ type: 'resend-email', employeeId, employeeName });
    setShowConfirmDialog(true);
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    
    if (confirmAction.type === 'resend-email') {
      try {
        const response = await API.post(`/employees/resend-registration/${confirmAction.employeeId}`);
        if (response.data.success) {
          alert('✅ Registration email sent successfully.');
        } else {
          alert('❌ Failed to send registration email');
        }
      } catch (err: unknown) {
        console.error('Error resending registration email:', err);
        const errorMessage = (err instanceof Error ? err.message : null) || 'Failed to resend registration email';
        alert(`❌ ${errorMessage}`);
      }
    }
    
    setShowConfirmDialog(false);
    setConfirmAction(null);
  };

  const handleDownloadAttachment = (url: string, filename: string) => {
    if (url) {
      const link = document.createElement('a');
      link.href = `${import.meta.env.VITE_API_BASE_URL}${url}`;
      link.download = filename;
      link.click();
    }
  };

  if (loading) {
    return <ASALoader fullPage size="lg" text="Loading employee details..." />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <div className="text-center p-8">
            <div className="text-red-600 text-6xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Error</h2>
            <p className="text-gray-600">{error}</p>
            <Button 
              onClick={() => navigate('/management/employees')}
              className="mt-6"
            >
              Back to Employees
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!employee) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <Button
            onClick={() => navigate('/management/employees')}
            variant="secondary"
            className="mb-4"
          >
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Back to Employees
          </Button>
          
          {isAdmin() && (
            <Button
              onClick={() => handleResendRegistrationEmail(employee.id, `${employee.firstName} ${employee.lastName}`)}
              variant="secondary"
              className="mb-4"
              leftIcon={<EnvelopeIcon className="w-4 h-4" />}
            >
              Resend Registration Email
            </Button>
          )}
        </div>
        
        <div className="bg-white rounded-lg shadow p-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Edit Employee</h1>
            <p className="text-gray-600">
              Editing: {employee.firstName} {employee.lastName} ({employee.employeeId})
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge status={employee.status} className="capitalize" />
            {isAdmin() && (
              <select
                className="text-xs border rounded px-2 py-1 bg-gray-50"
                aria-label="Employee Status"
                value={employee.status}
                onChange={(e) => setEmployee({...employee, status: e.target.value})}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="pending">Pending</option>
                <option value="rejected">Rejected</option>
              </select>
            )}
          </div>
        </div>

        {/* Personal Information */}
        <Card className="mb-8">
          <div className="flex items-center mb-4">
            <UserIcon className="w-5 h-5 text-blue-600 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">Personal Information</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <Input
                label="First Name"
                value={employee.firstName}
                onChange={(e) => setEmployee({...employee, firstName: e.target.value})}
                required
              />
            </div>
            
            <div>
              <Input
                label="Last Name"
                value={employee.lastName}
                onChange={(e) => setEmployee({...employee, lastName: e.target.value})}
                required
              />
            </div>
            
            <div>
              <Input
                label="Office Email"
                type="email"
                value={employee.officeEmail || ''}
                onChange={(e) => setEmployee({...employee, officeEmail: e.target.value})}
                required
              />
            </div>
            
            <div>
              <Input
                label="Personal Email"
                type="email"
                value={employee.personalEmail || ''}
                onChange={(e) => setEmployee({...employee, personalEmail: e.target.value})}
              />
            </div>
            
            <div>
              <Input
                label="Phone"
                value={employee.phone || ''}
                onChange={(e) => setEmployee({...employee, phone: e.target.value})}
              />
            </div>
            
            <div>
              <Input
                label="Address"
                value={employee.address || ''}
                onChange={(e) => setEmployee({...employee, address: e.target.value})}
              />
            </div>
            
            <div>
              <Input
                label="Date of Birth"
                type="date"
                value={employee.dob ? employee.dob.split('T')[0] : ''}
                onChange={(e) => setEmployee({...employee, dob: e.target.value})}
              />
            </div>
            
            <div>
              <Input
                label="Gender"
                value={employee.gender || ''}
                onChange={(e) => setEmployee({...employee, gender: e.target.value})}
              />
            </div>
          </div>
        </Card>

        {/* Identity Documents */}
        <Card className="mb-8">
          <div className="flex items-center mb-4">
            <IdentificationIcon className="w-5 h-5 text-green-600 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">Identity Documents</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Input
                label="PAN Number"
                value={employee.panNumber || ''}
                onChange={(e) => setEmployee({...employee, panNumber: e.target.value})}
              />
            </div>
            
            <div>
              <Input
                label="Aadhaar Number"
                value={employee.aadhaarNumber || ''}
                onChange={(e) => setEmployee({...employee, aadhaarNumber: e.target.value})}
              />
            </div>
          </div>
          
          {/* Attachments */}
          <div className="mt-6">
            <h3 className="text-md font-medium text-gray-900 mb-4">Document Attachments</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {employee.profile?.panFileUrl && (
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">PAN Card</span>
                    <Button
                      onClick={() => handleDownloadAttachment(employee.profile!.panFileUrl!, 'pan-card.pdf')}
                      variant="secondary"
                      size="sm"
                    >
                      Download
                    </Button>
                  </div>
                </div>
              )}
              
              {employee.profile?.aadhaarFileUrl && (
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Aadhaar Card</span>
                    <Button
                      onClick={() => handleDownloadAttachment(employee.profile!.aadhaarFileUrl!, 'aadhaar-card.pdf')}
                      variant="secondary"
                      size="sm"
                    >
                      Download
                    </Button>
                  </div>
                </div>
              )}
              
              {employee.profileImage && (
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Employee Photo</span>
                    <Button
                      onClick={() => handleDownloadAttachment(employee.profileImage!, 'employee-photo.jpg')}
                      variant="secondary"
                      size="sm"
                    >
                      Download
                    </Button>
                  </div>
                  <img 
                    src={getProfileImageUrl(employee.profileImage)}
                    alt="Employee Photo" 
                    className="mt-2 w-20 h-20 rounded object-cover"
                    onError={(e) => {
                      console.error("Image load failed, showing initials");
                      e.currentTarget.style.display = 'none';
                      const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                      if (fallback) fallback.style.display = 'flex';
                    }}
                  />
                  <div className="hidden mt-2 w-20 h-20 rounded items-center justify-center font-bold bg-gray-100 text-blue-600">
                    {(() => {
                      const name = `${employee.firstName || ''} ${employee.lastName || ''}`.trim();
                      return name.split(' ').filter(Boolean).map(part => part[0]).join('').toUpperCase().slice(0, 2) || '?';
                    })()}
                  </div>
                </div>
              )}
              
              {employee.profile?.bankStatementFileUrl && (
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Bank Statement</span>
                    <Button
                      onClick={() => handleDownloadAttachment(employee.profile!.bankStatementFileUrl!, 'bank-statement.pdf')}
                      variant="secondary"
                      size="sm"
                    >
                      Download
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Guardian Details */}
        <Card className="mb-8">
          <div className="flex items-center mb-4">
            <UserGroupIcon className="w-5 h-5 text-purple-600 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">Guardian Details</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <Input
                label="Guardian Name"
                value={employee.guardianName || ''}
                onChange={(e) => setEmployee({...employee, guardianName: e.target.value})}
              />
            </div>
            
            <div>
              <Input
                label="Guardian Phone"
                value={employee.guardianPhone || ''}
                onChange={(e) => setEmployee({...employee, guardianPhone: e.target.value})}
              />
            </div>
            
            <div>
              <Input
                label="Guardian Relation"
                value={employee.guardianRelation || ''}
                onChange={(e) => setEmployee({...employee, guardianRelation: e.target.value})}
              />
            </div>
          </div>
        </Card>

        {/* Education Details */}
        <Card className="mb-8">
          <div className="flex items-center mb-4">
            <AcademicCapIcon className="w-5 h-5 text-indigo-600 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">Education Details</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <Input
                label="Qualification"
                value={employee.qualification || ''}
                onChange={(e) => setEmployee({...employee, qualification: e.target.value})}
              />
            </div>
            
            <div>
              <Input
                label="University"
                value={employee.university || ''}
                onChange={(e) => setEmployee({...employee, university: e.target.value})}
              />
            </div>
            
            <div>
              <Input
                label="Passing Year"
                value={employee.passingYear || ''}
                onChange={(e) => setEmployee({...employee, passingYear: e.target.value})}
              />
            </div>
          </div>
        </Card>

        {/* Bank Details */}
        <Card className="mb-8">
          <div className="flex items-center mb-4">
            <BanknotesIcon className="w-5 h-5 text-green-600 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">Bank Details</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <Input
                label="Bank Name"
                value={employee.bankName || ''}
                onChange={(e) => setEmployee({...employee, bankName: e.target.value})}
              />
            </div>
            
            <div>
              <Input
                label="Account Number"
                value={employee.accountNumber || ''}
                onChange={(e) => setEmployee({...employee, accountNumber: e.target.value})}
              />
            </div>
            
            <div>
              <Input
                label="IFSC Code"
                value={employee.ifscCode || ''}
                onChange={(e) => setEmployee({...employee, ifscCode: e.target.value})}
              />
            </div>
            
            <div>
              <Input
                label="Branch Name"
                value={employee.branchName || ''}
                onChange={(e) => setEmployee({...employee, branchName: e.target.value})}
              />
            </div>
          </div>
        </Card>

        <Card className="mb-20">
          <div className="flex items-center mb-4">
            <BuildingOfficeIcon className="w-5 h-5 text-blue-600 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">Employment Details</h2>
            {!isAdmin() && <span className="ml-4 text-sm text-amber-600 bg-amber-50 px-2 py-1 rounded">Read-only</span>}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Software Role</label>
              {isAdmin() ? (
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  aria-label="Software Role"
                  value={employee.roleId || ''}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    const selectedOpt = roleOptions.find(r => r.id === selectedId);
                    const roleName = selectedOpt ? selectedOpt.name : 'Employee';
                    console.log('🔄 Role changed to:', roleName, selectedId);
                    const updates: Partial<EmployeeDetails> = { 
                      roleId: selectedId, 
                      role: roleName 
                    };
                    if (roleName === 'Partner') {
                      setSelectedPartnerIds([]);
                      setSelectedManagerIds([]);
                    }
                    setEmployee({...employee, ...updates} as EmployeeDetails);
                  }}
                >
                  <option value="">Select Role</option>
                  {roleOptions.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              ) : (
                <Input value={employee.role} disabled className="bg-gray-100" />
              )}
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Designation</label>
              {isAdmin() ? (
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  aria-label="Designation"
                  value={employee.designationId || ''}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    const selectedOpt = designationOptions.find(d => d.id === selectedId);
                    const designationName = selectedOpt ? selectedOpt.name : '';
                    setEmployee({...employee, designationId: selectedId, designation: designationName});
                  }}
                >
                  <option value="">Select Designation</option>
                  {designationOptions.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              ) : (
                <Input value={employee.designation} disabled className="bg-gray-100" />
              )}
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Department</label>
              {isAdmin() ? (
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  aria-label="Department"
                  value={employee.departmentId || ''}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    const selectedOpt = departmentOptions.find(d => d.id === selectedId);
                    const deptName = selectedOpt ? selectedOpt.name : '';
                    setSelectedDepartment(deptName);
                    setSelectedPartnerIds([]); // Reset partner when department changes
                    setSelectedManagerIds([]); // Reset manager when department changes
                    setEmployee({...employee, departmentId: selectedId, department: deptName} as EmployeeDetails);
                  }}
                >
                  <option value="">Select Department</option>
                  {departmentOptions.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              ) : (
                <Input value={employee.department} disabled className="bg-gray-100" />
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Reporting Partners</label>
              {isAdmin() && employee.role !== 'Partner' ? (
                <HierarchySelect
                  options={filteredPartners
                    .filter(p => (p.id || p._id) !== id)
                    .map(p => ({
                      value: p.id || p._id || '',
                      label: `${p.firstName} ${p.lastName}`
                    }))}
                  value={selectedPartnerIds}
                  onChange={setSelectedPartnerIds}
                  placeholder="Select Partners..."
                  disabled={usersLoading}
                />
              ) : (
                <div className="p-2 bg-gray-50 rounded border text-sm text-gray-600">
                   {employee.partners && employee.partners.length > 0 
                     ? employee.partners.map(p => p.name).join(', ')
                     : 'None assigned'}
                </div>
              )}
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Reporting Managers</label>
              {isAdmin() && !['Partner', 'Admin'].includes(employee.role) ? (
                <HierarchySelect
                  options={filteredManagers
                    .filter(m => (m.id || m._id) !== id)
                    .map(m => ({
                      value: m.id || m._id || '',
                      label: `${m.firstName} ${m.lastName}`
                    }))}
                  value={selectedManagerIds}
                  onChange={setSelectedManagerIds}
                  placeholder="Select Managers..."
                  disabled={usersLoading}
                />
              ) : (
                <div className="p-2 bg-gray-50 rounded border text-sm text-gray-600">
                   {employee.managers && employee.managers.length > 0 
                     ? employee.managers.map(m => m.name || `${m.firstName} ${m.lastName}`).join(', ')
                     : 'None assigned'}
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Sub Managers</label>
              {isAdmin() ? (
                <HierarchySelect
                  options={allEmployeesForReporting
                    .filter(e => (e.id || e._id) !== id)
                    .map(e => ({
                      value: e.id || e._id || '',
                      label: `${e.firstName} ${e.lastName} (${e.role})`
                    }))}
                  value={selectedSubManagerIds}
                  onChange={setSelectedSubManagerIds}
                  placeholder="Select Sub Managers..."
                  disabled={usersLoading}
                />
              ) : (
                <div className="p-2 bg-gray-50 rounded border text-sm text-gray-600">
                   {employee.subManagers && employee.subManagers.length > 0 
                     ? employee.subManagers.map((sm) => sm.name || `${sm.firstName} ${sm.lastName}`).join(', ')
                     : 'None assigned'}
                </div>
              )}
            </div>


            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Shift</label>
              {isAdmin() ? (
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  aria-label="Shift"
                  value={employee.shiftId || ''}
                  onChange={(e) => setEmployee({...employee, shiftId: e.target.value})}
                >
                  <option value="">Select Shift</option>
                  {shiftOptions.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.startTime} - {s.endTime})</option>
                  ))}
                </select>
              ) : (
                <div className="p-2 bg-gray-50 rounded border text-sm text-gray-600">
                  {employee.shiftId ? shiftOptions.find(s => s.id === employee.shiftId)?.name || 'Assigned' : 'None assigned'}
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Location</label>
              {isAdmin() ? (
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  aria-label="Location"
                  value={employee.locationId || ''}
                  onChange={(e) => setEmployee({...employee, locationId: e.target.value})}
                >
                  <option value="">Select Location</option>
                  {locationOptions.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              ) : (
                <div className="p-2 bg-gray-50 rounded border text-sm text-gray-600">
                  {employee.locationId ? locationOptions.find(l => l.id === employee.locationId)?.name || 'Assigned' : 'None assigned'}
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Employment Type</label>
              {isAdmin() ? (
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  aria-label="Employment Type"
                  value={employee.employmentTypeId || ''}
                  onChange={(e) => setEmployee({...employee, employmentTypeId: e.target.value})}
                >
                  <option value="">Select Employment Type</option>
                  {employmentTypeOptions.map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              ) : (
                <div className="p-2 bg-gray-50 rounded border text-sm text-gray-600">
                  {employee.employmentTypeId ? employmentTypeOptions.find(e => e.id === employee.employmentTypeId)?.name || 'Assigned' : 'None assigned'}
                </div>
              )}
            </div>

            <div>
              <Input
                label="Joining Date"
                type="date"
                value={employee.joiningDate ? employee.joiningDate.split('T')[0] : ''}
                onChange={(e) => setEmployee({...employee, joiningDate: e.target.value})}
                disabled={!isAdmin()}
                className={!isAdmin() ? "bg-gray-100" : ""}
              />
            </div>
          </div>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-end gap-4 mb-8">
          <Button
            onClick={() => navigate('/management/employees')}
            variant="secondary"
          >
            Cancel
          </Button>
          
          <Button
            onClick={handleSave}
            disabled={saving}
            className="min-w-32"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="fixed bottom-4 right-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg shadow-lg max-w-md">
            <div className="flex">
              <span className="text-sm font-medium">{error}</span>
              <button
                onClick={() => setError('')}
                className="ml-auto text-red-400 hover:text-red-600"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Confirmation Dialog */}
        <Modal
          isOpen={showConfirmDialog}
          onClose={() => {
            setShowConfirmDialog(false);
            setConfirmAction(null);
          }}
          title="Confirm Action"
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-secondary-700">
              {confirmAction?.type === 'resend-email' ? `Do you want to resend the registration email to ${confirmAction.employeeName}?` : ''}
            </p>
            <div className="flex gap-3 pt-4">
              <Button 
                variant="secondary" 
                onClick={() => {
                  setShowConfirmDialog(false);
                  setConfirmAction(null);
                }}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleConfirmAction}
              >
                Confirm
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
};

export default EditEmployee;
