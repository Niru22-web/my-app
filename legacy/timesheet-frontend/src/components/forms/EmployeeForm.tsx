"use client";

import { useState, useEffect, useRef } from "react";
import API from "../../api";
import HierarchySelect from "../ui/HierarchySelect";

interface FormErrors {
  [key: string]: string;
}

export default function EmployeeForm() {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    designation: "",
    role: "Employee",
    department: "",
    reportingPartnerIds: [] as string[],
    reportingManagerIds: [] as string[],
    subManagerIds: [] as string[],
    officeEmail: "",
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [partners, setPartners] = useState<any[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [subManagers, setSubManagers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchUsers();
    // Auto-focus first field
    if (firstInputRef.current) {
      firstInputRef.current.focus();
    }
  }, []);

  const fetchUsers = async () => {
    try {
      setUsersLoading(true);
      console.log('🔍 Fetching all employees for dropdowns...');
      const response = await API.get('/employees');
      
      let allUsers = [];
      if (response.data?.success && Array.isArray(response.data.data)) {
        allUsers = response.data.data;
      } else if (Array.isArray(response.data)) {
        allUsers = response.data;
      }

      // Filter based on roles
      const pts = allUsers.filter((u: any) => u.role === 'Partner');
      const mgs = allUsers.filter((u: any) => u.role === 'Manager');
      // Sub managers can be Managers or even Senior Employees, but for now we'll allow all active employees
      const sms = allUsers.filter((u: any) => u.status !== 'inactive' && u.status !== 'rejected');
      
      setPartners(pts);
      setManagers(mgs);
      setSubManagers(sms);
      console.log(`✅ Loaded ${pts.length} partners, ${mgs.length} managers, and ${sms.length} potential sub-managers`);
    } catch (err) {
      console.error('❌ Error fetching users:', err);
      setPartners([]);
      setManagers([]);
      setSubManagers([]);
    } finally {
      setUsersLoading(false);
    }
  };

  // Filter partners based on selected department
  const filteredPartners = partners.filter(
    (p) => !form.department || p.department === form.department
  );

  // Filter managers based on selected department
  const filteredManagers = managers.filter(
    (m) => !form.department || m.department === form.department
  );

  // Filter sub managers based on selected department
  const filteredSubManagers = subManagers.filter(
    (sm) => !form.department || sm.department === form.department
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm(prev => {
      const newForm = { ...prev, [name]: value };
      
      // Reset dependent fields when role changes
      if (name === 'role') {
        if (value === 'Partner') {
          newForm.reportingPartnerIds = [];
          newForm.reportingManagerIds = [];
          newForm.subManagerIds = [];
        } else if (value === 'Manager') {
          newForm.reportingManagerIds = [];
          newForm.subManagerIds = [];
        }
      }
      
      // Reset hierarchy when department changes
      if (name === 'department') {
        newForm.reportingPartnerIds = [];
        newForm.reportingManagerIds = [];
        newForm.subManagerIds = [];
      }
      
      return newForm;
    });
  };

  const handlePartnerChange = (reportingPartnerIds: string[]) => {
    setForm(prev => ({ ...prev, reportingPartnerIds }));
  };

  const handleManagerChange = (reportingManagerIds: string[]) => {
    setForm(prev => ({ ...prev, reportingManagerIds }));
  };

  const handleSubManagerChange = (subManagerIds: string[]) => {
    setForm(prev => ({ ...prev, subManagerIds }));
  };

  const handleSubmit = async () => {
    const requiredFields = ['firstName', 'lastName', 'designation', 'role', 'department', 'officeEmail'];
    
    // Add conditional required fields
    if (form.role !== 'Partner' && form.reportingPartnerIds.length === 0) {
      alert("At least one Reporting Partner is required");
      return;
    }
    if (form.role === 'Employee' && form.reportingManagerIds.length === 0) {
      alert("At least one Reporting Manager is required");
      return;
    }

    if (requiredFields.some((field) => !form[field as keyof typeof form])) {
      alert("All fields are mandatory");
      return;
    }

    try {
      setLoading(true);
      const response = await API.post("/employees", form);
      
      if (response.data?.emailStatus === "failed") {
        alert(response.data.message || "Employee created, but failed to send email.");
      } else {
        alert("Employee Created Successfully");
      }

      setForm({
        firstName: "",
        lastName: "",
        designation: "",
        role: "Employee",
        department: "",
        reportingPartnerIds: [],
        reportingManagerIds: [],
        subManagerIds: [],
        officeEmail: "",
      });
    } catch (error) {
      alert("Error creating employee");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <style dangerouslySetInnerHTML={{ __html: `
        .form-container::-webkit-scrollbar {
          width: 6px;
        }
        .form-container::-webkit-scrollbar-thumb {
          background: #cbd5f5;
          border-radius: 10px;
        }
        .form-container::-webkit-scrollbar-thumb:hover {
          background: #a5b4fc;
        }
      ` }} />
      
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* Fixed Header */}
        <div className="px-8 py-6 border-b border-gray-100 bg-white">
          <h1 className="text-2xl font-semibold text-gray-900">Register Employee</h1>
          <p className="text-sm text-gray-600 mt-1">Add new employee details</p>
        </div>

        {/* Scrollable Form Content */}
        <div className="form-container max-h-[70vh] overflow-y-auto px-8 py-6">
          
          {/* Personal Details Section */}
          <div className="mb-8">
            <h2 className="text-lg font-medium text-gray-900 mb-4 pb-2 border-b border-gray-100">
              Personal Details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                  First Name *
                </label>
                <input
                  ref={firstInputRef}
                  id="firstName"
                  name="firstName"
                  type="text"
                  placeholder="Enter first name"
                  value={form.firstName}
                  onChange={handleChange}
                  className={`w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors ${
                    errors.firstName ? 'border-red-500' : ''
                  }`}
                />
                {errors.firstName && (
                  <p className="text-xs text-red-600 mt-1">{errors.firstName}</p>
                )}
              </div>

              <div className="space-y-1">
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
                  Last Name *
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  placeholder="Enter last name"
                  value={form.lastName}
                  onChange={handleChange}
                  className={`w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors ${
                    errors.lastName ? 'border-red-500' : ''
                  }`}
                />
                {errors.lastName && (
                  <p className="text-xs text-red-600 mt-1">{errors.lastName}</p>
                )}
              </div>
            </div>
          </div>

          {/* Job Information Section */}
          <div className="mb-8">
            <h2 className="text-lg font-medium text-gray-900 mb-4 pb-2 border-b border-gray-100">
              Job Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                  Role *
                </label>
                <select
                  id="role"
                  name="role"
                  value={form.role}
                  onChange={handleChange}
                  className={`w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors ${
                    errors.role ? 'border-red-500' : ''
                  }`}
                >
                  <option value="Admin">Admin</option>
                  <option value="HR">HR</option>
                  <option value="IT">IT</option>
                  <option value="Employee">Employee</option>
                  <option value="Manager">Manager</option>
                  <option value="Partner">Partner</option>
                  <option value="ACCOUNTS">Accounts</option>
                </select>
                {errors.role && (
                  <p className="text-xs text-red-600 mt-1">{errors.role}</p>
                )}
              </div>

              <div className="space-y-1">
                <label htmlFor="department" className="block text-sm font-medium text-gray-700">
                  Department *
                </label>
                <select
                  id="department"
                  name="department"
                  value={form.department}
                  onChange={handleChange}
                  className={`w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors ${
                    errors.department ? 'border-red-500' : ''
                  }`}
                >
                  <option value="">Select Department</option>
                  <option value="Accounting">Accounting</option>
                  <option value="Operations">Operations</option>
                  <option value="Internal Audit">Internal Audit</option>
                  <option value="Automations">Automations</option>
                  <option value="Statutory Audit">Statutory Audit</option>
                </select>
                {errors.department && (
                  <p className="text-xs text-red-600 mt-1">{errors.department}</p>
                )}
              </div>

              <div className="space-y-1">
                <label htmlFor="designation" className="block text-sm font-medium text-gray-700">
                  Designation *
                </label>
                <select
                  id="designation"
                  name="designation"
                  value={form.designation}
                  onChange={handleChange}
                  className={`w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors ${
                    errors.designation ? 'border-red-500' : ''
                  }`}
                >
                  <option value="">Select Designation</option>
                  <option value="Executive">Executive</option>
                  <option value="Manager">Manager</option>
                  <option value="Senior Manager">Senior Manager</option>
                  <option value="Partner">Partner</option>
                  <option value="Owner">Owner</option>
                </select>
                {errors.designation && (
                  <p className="text-xs text-red-600 mt-1">{errors.designation}</p>
                )}
              </div>
            </div>
          </div>

          {/* Contact Details Section */}
          <div className="mb-8">
            <h2 className="text-lg font-medium text-gray-900 mb-4 pb-2 border-b border-gray-100">
              Contact Details
            </h2>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1">
                <label htmlFor="officeEmail" className="block text-sm font-medium text-gray-700">
                  Office Email *
                </label>
                <input
                  id="officeEmail"
                  name="officeEmail"
                  type="email"
                  placeholder="Enter office email address"
                  value={form.officeEmail}
                  onChange={handleChange}
                  className={`w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors ${
                    errors.officeEmail ? 'border-red-500' : ''
                  }`}
                />
                {errors.officeEmail && (
                  <p className="text-xs text-red-600 mt-1">{errors.officeEmail}</p>
                )}
              </div>
            </div>
          </div>

          {/* Reporting Structure Section */}
          <div className="mb-8">
            <h2 className="text-lg font-medium text-gray-900 mb-4 pb-2 border-b border-gray-100">
              Reporting Structure
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {form.role !== 'Partner' && (
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">
                    Reporting Partners *
                  </label>
                  <HierarchySelect
                    options={filteredPartners.map(p => ({
                      value: p.id || p._id,
                      label: `${p.firstName} ${p.lastName}`
                    }))}
                    value={form.reportingPartnerIds}
                    onChange={handlePartnerChange}
                    placeholder="Select Partners..."
                    disabled={usersLoading || !form.department}
                  />
                  {errors.reportingPartnerIds && (
                    <p className="text-xs text-red-600 mt-1">{errors.reportingPartnerIds}</p>
                  )}
                </div>
              )}

              {form.role === 'Employee' && (
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">
                    Reporting Managers *
                  </label>
                  <HierarchySelect
                    options={filteredManagers.map(m => ({
                      value: m.id || m._id,
                      label: `${m.firstName} ${m.lastName}`
                    }))}
                    value={form.reportingManagerIds}
                    onChange={handleManagerChange}
                    placeholder="Select Managers..."
                    disabled={usersLoading || form.reportingPartnerIds.length === 0}
                  />
                  {errors.reportingManagerIds && (
                    <p className="text-xs text-red-600 mt-1">{errors.reportingManagerIds}</p>
                  )}
                </div>
              )}

              {form.role === 'Employee' && (
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">
                    Sub Managers
                  </label>
                  <HierarchySelect
                    options={filteredSubManagers.map(sm => ({
                      value: sm.id || sm._id,
                      label: `${sm.firstName} ${sm.lastName}`
                    }))}
                    value={form.subManagerIds}
                    onChange={handleSubManagerChange}
                    placeholder="Select Sub Managers..."
                    disabled={usersLoading || !form.department}
                  />
                  {errors.subManagerIds && (
                    <p className="text-xs text-red-600 mt-1">{errors.subManagerIds}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-8 py-4">
          <div className="flex justify-between items-center">
            <button
              onClick={() => {
                  setForm({
                    firstName: "",
                    lastName: "",
                    designation: "",
                    role: "Employee",
                    department: "",
                    reportingPartnerIds: [],
                    reportingManagerIds: [],
                    subManagerIds: [],
                    officeEmail: "",
                  });
                setManagers([]);
                setErrors({});
              }}
              className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Creating..." : "Create Employee"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}