import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import API from '../api';
import {
  LockClosedIcon,
  UserIcon,
  CalendarIcon,
  CheckCircleIcon,
  XCircleIcon,
  ChevronLeftIcon,
  InformationCircleIcon,
  IdentificationIcon,
  HomeIcon,
  AcademicCapIcon,
  BanknotesIcon,
  CloudArrowUpIcon,
  PhoneIcon,
  EnvelopeIcon,
  ClockIcon,
  ArrowRightIcon,
  CameraIcon,
  PhotoIcon,
  PaperClipIcon
} from '@heroicons/react/24/outline';
import { CheckBadgeIcon } from '@heroicons/react/24/solid';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Button from '../components/ui/Button';
import ASALoader from '../components/ui/ASALoader';

// Reusable Section Card Component
const SectionCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden mb-8"
  >
    <div className="p-6 sm:p-8">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-bold">
          {icon}
        </div>
        <h3 className="text-xl font-black text-slate-800 tracking-tight">{title}</h3>
      </div>
      {children}
    </div>
  </motion.div>
);

const EmployeeRegistration: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  // Page States
  const [isValidating, setIsValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [employeeId, setEmployeeId] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: '',
    gender: '',
    dob: '',
    maritalStatus: '',
    personalEmail: '',
    personalMobile: '',
    pan: '',
    aadhaar: '',
    currentAddress: '',
    currentCity: '',
    currentState: '',
    currentPinCode: '',
    permanentAddress: '',
    permanentCity: '',
    permanentState: '',
    permanentPinCode: '',
    sameAsCurrent: false,
    guardianName: '',
    guardianNumber: '',
    guardianAddress: '',
    education: '',
    accountHolderName: '',
    bankName: '',
    bankAccountNumber: '',
    ifscCode: '',
    branchName: '',
    joiningDate: ''
  });

  // File States
  const [files, setFiles] = useState<{
    panFile: File | null;
    aadhaarFile: File | null;
    profileImage: File | null;
    bankStatementFile: File | null;
  }>({
    panFile: null,
    aadhaarFile: null,
    profileImage: null,
    bankStatementFile: null
  });

  const [previews, setPreviews] = useState<{
    panFile: string | null;
    aadhaarFile: string | null;
    profileImage: string | null;
    bankStatementFile: string | null;
  }>({
    panFile: null,
    aadhaarFile: null,
    profileImage: null,
    bankStatementFile: null
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    validateToken();
  }, [token]);

  const validateToken = async () => {
    if (!token) {
      setIsValidating(false);
      setTokenValid(false);
      setErrorReason('missing');
      return;
    }

    try {
      const response = await API.get(`/auth/validate-registration-token?token=${token}`);
      if (response.data.valid) {
        setTokenValid(true);
        setEmail(response.data.email);
        setFullName(`${response.data.firstName} ${response.data.lastName}`);
        setEmployeeId(response.data.employeeId);
        // If the backend doesn't provide joining date, we'll let user fill it or use default
        setFormData(prev => ({ 
          ...prev, 
          personalEmail: response.data.email,
          joiningDate: new Date().toISOString().split('T')[0] // Default to today
        }));
      } else {
        setTokenValid(false);
        setErrorReason(response.data.reason);
      }
    } catch (err: any) {
      setTokenValid(false);
      setErrorReason(err.response?.data?.reason || 'invalid');
    } finally {
      setIsValidating(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;

    if (name === 'sameAsCurrent') {
      const isChecked = val as boolean;
      if (isChecked) {
        setFormData(prev => ({
          ...prev,
          sameAsCurrent: true,
          permanentAddress: prev.currentAddress,
          permanentCity: prev.currentCity,
          permanentState: prev.currentState,
          permanentPinCode: prev.currentPinCode
        }));
      } else {
        setFormData(prev => ({ ...prev, sameAsCurrent: false }));
      }
    } else {
      setFormData(prev => {
        const newData = { ...prev, [name]: val };
        // If sameAsCurrent is true and we're editing a current address field, update permanent too
        if (prev.sameAsCurrent) {
          if (name === 'currentAddress') newData.permanentAddress = value as string;
          if (name === 'currentCity') newData.permanentCity = value as string;
          if (name === 'currentState') newData.permanentState = value as string;
          if (name === 'currentPinCode') newData.permanentPinCode = value as string;
        }
        return newData;
      });
    }

    if (formErrors[name]) {
      setFormErrors(prev => {
        const updated = { ...prev };
        delete updated[name];
        return updated;
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, files: selectedFiles } = e.target;
    if (selectedFiles && selectedFiles[0]) {
      const file = selectedFiles[0];
      
      // Validation: Size (5MB) and Type
      if (file.size > 5 * 1024 * 1024) {
        setFormErrors(prev => ({ ...prev, [name]: 'File size exceeds 5MB' }));
        return;
      }

      const allowedTypes = name === 'profileImage' ? ['image/jpeg', 'image/png', 'image/jpg'] : ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
      if (!allowedTypes.includes(file.type)) {
        setFormErrors(prev => ({ ...prev, [name]: 'Invalid file type' }));
        return;
      }

      setFiles(prev => ({ ...prev, [name]: file }));
      
      // Generate preview
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreviews(prev => ({ ...prev, [name]: reader.result as string }));
        };
        reader.readAsDataURL(file);
      } else {
        setPreviews(prev => ({ ...prev, [name]: 'pdf' })); // Placeholder for PDF
      }

      if (formErrors[name]) {
        setFormErrors(prev => {
          const updated = { ...prev };
          delete updated[name];
          return updated;
        });
      }
    }
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    
    // Password
    if (!formData.password) errors.password = 'Password is required';
    else {
      if (formData.password.length < 8) errors.password = 'Min 8 characters';
      if (!/[A-Z]/.test(formData.password)) errors.password = 'Needs uppercase';
      if (!/[a-z]/.test(formData.password)) errors.password = 'Needs lowercase';
      if (!/[0-9]/.test(formData.password)) errors.password = 'Needs number';
      if (!/[!@#$%^&*]/.test(formData.password)) errors.password = 'Needs special char';
    }

    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    // Personal Info
    if (!formData.gender) errors.gender = 'Gender is required';
    if (!formData.dob) errors.dob = 'DOB is required';
    if (!formData.maritalStatus) errors.maritalStatus = 'Status is required';
    if (!formData.personalEmail) errors.personalEmail = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.personalEmail)) errors.personalEmail = 'Invalid email';
    if (!formData.personalMobile) errors.personalMobile = 'Mobile is required';
    else if (!/^\d{10}$/.test(formData.personalMobile)) errors.personalMobile = '10 digits required';

    // Identity
    if (!formData.pan) errors.pan = 'PAN is required';
    else if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(formData.pan.toUpperCase())) errors.pan = 'Invalid PAN format';
    if (!formData.aadhaar) errors.aadhaar = 'Aadhaar is required';
    else if (!/^\d{12}$/.test(formData.aadhaar)) errors.aadhaar = '12 digits required';

    if (!files.panFile) errors.panFile = 'PAN proof required';
    if (!files.aadhaarFile) errors.aadhaarFile = 'Aadhaar proof required';

    // Address
    if (!formData.currentAddress) errors.currentAddress = 'Required';
    if (!formData.currentCity) errors.currentCity = 'Required';
    if (!formData.currentState) errors.currentState = 'Required';
    if (!formData.currentPinCode) errors.currentPinCode = 'Required';

    if (!formData.permanentAddress) errors.permanentAddress = 'Required';
    if (!formData.permanentCity) errors.permanentCity = 'Required';
    if (!formData.permanentState) errors.permanentState = 'Required';
    if (!formData.permanentPinCode) errors.permanentPinCode = 'Required';

    // Guardian
    if (!formData.guardianName) errors.guardianName = 'Required';
    if (!formData.guardianNumber) errors.guardianNumber = 'Required';

    // Education
    if (!formData.education) errors.education = 'Required';
    if (!files.profileImage) errors.profileImage = 'Photo required';

    // Bank
    if (!formData.bankName) errors.bankName = 'Required';
    if (!formData.accountHolderName) errors.accountHolderName = 'Required';
    if (!formData.bankAccountNumber) errors.bankAccountNumber = 'Required';
    if (!formData.ifscCode) errors.ifscCode = 'Required';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setIsSubmitting(true);
    try {
      // Concat Address fields
      const fullCurrentAddress = `${formData.currentAddress}, ${formData.currentCity}, ${formData.currentState} - ${formData.currentPinCode}`;
      const fullPermanentAddress = `${formData.permanentAddress}, ${formData.permanentCity}, ${formData.permanentState} - ${formData.permanentPinCode}`;

      const payload = {
        token: token || '',
        name: fullName || '',
        email,
        password: formData.password,
        confirmPassword: formData.confirmPassword,
        gender: formData.gender,
        dob: formData.dob,
        doj: formData.joiningDate,
        maritalStatus: formData.maritalStatus,
        personalEmail: formData.personalEmail,
        personalMobile: formData.personalMobile,
        pan: formData.pan,
        aadhaar: formData.aadhaar,
        currentAddress: fullCurrentAddress,
        currentPinCode: formData.currentPinCode,
        permanentAddress: fullPermanentAddress,
        guardianName: formData.guardianName,
        guardianNumber: formData.guardianNumber,
        guardianAddress: formData.guardianAddress,
        education: formData.education,
        accountHolderName: formData.accountHolderName,
        bankName: formData.bankName,
        bankAccountNumber: formData.bankAccountNumber,
        ifscCode: formData.ifscCode,
        branchName: formData.branchName
      };

      // Debug logging before API call
      console.log("🔍 Sending registration payload:", {
        token: token ? 'present' : 'missing',
        password: formData.password ? 'present' : 'missing',
        confirmPassword: formData.confirmPassword ? 'present' : 'missing',
        email,
        doj: formData.joiningDate,
        fieldCount: Object.keys(payload).length
      });

      const hasFileUpload = !!(files.panFile || files.aadhaarFile || files.profileImage || files.bankStatementFile);

      if (hasFileUpload) {
        console.log("📎 Sending with files:", {
          panFile: files.panFile?.name || 'none',
          aadhaarFile: files.aadhaarFile?.name || 'none',
          profileImage: files.profileImage?.name || 'none',
          bankStatementFile: files.bankStatementFile?.name || 'none'
        });

        const submitData = new FormData();
        Object.entries(payload).forEach(([key, value]) => {
          submitData.append(key, value ?? '');
        });

        if (files.panFile) submitData.append('panFile', files.panFile);
        if (files.aadhaarFile) submitData.append('aadhaarFile', files.aadhaarFile);
        if (files.profileImage) submitData.append('profileImage', files.profileImage);
        if (files.bankStatementFile) submitData.append('bankStatementFile', files.bankStatementFile);

        await API.post('/auth/complete-registration', submitData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        console.log("📄 Sending without files");
        await API.post('/auth/complete-registration', payload, {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      setIsSuccess(true);
    } catch (err: any) {
      console.error("❌ Registration API Error:", {
        status: err.response?.status,
        data: err.response?.data,
        message: err.message,
        config: err.config
      });
      
      const errorMessage = err.response?.data?.error || err.response?.data?.message || 'Failed to complete registration. Please try again.';
      setFormErrors({ global: errorMessage });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <ASALoader size="md" text="Verifying Security Token..." />
      </div>
    );
  }

  if (!tokenValid || errorReason) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-10 text-center border border-slate-100"
        >
          <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <XCircleIcon className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-4">Registration Link Error</h2>
          <p className="text-slate-500 mb-8 font-medium italic">
            {errorReason === 'expired' 
              ? 'This link has expired for security reasons.' 
              : errorReason === 'used'
              ? 'This link has already been used to create an account.'
              : 'The registration token provided is invalid.'}
          </p>
          <button onClick={() => navigate('/login')} className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl shadow-lg">Back to Login</button>
        </motion.div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-6">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-lg bg-white rounded-[3rem] shadow-2xl p-12 text-center border border-slate-100"
        >
          <div className="w-32 h-32 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto mb-8">
            <CheckBadgeIcon className="w-24 h-24" />
          </div>
          <h2 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">Onboarding Complete!</h2>
          <p className="text-lg text-slate-500 mb-10 leading-relaxed font-medium">
            Welcome to ASA, <span className="text-blue-600 font-black">{fullName}</span>!<br />
            Your documents have been submitted and are pending admin approval.
          </p>
          <Button onClick={() => navigate('/login')} size="lg" className="w-full py-5 rounded-2xl text-xl font-black">Get Started</Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-[#f8fafc] py-12 sm:py-20 px-4 flex flex-col items-center justify-start overflow-y-auto scroll-smooth">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-4xl pb-32">
        {/* Header Section */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-full text-sm font-black mb-6 border border-blue-100 uppercase tracking-widest animate-pulse">
            <InformationCircleIcon className="w-4 h-4" />
            Security Verified: {fullName}
          </div>
          <h1 className="text-5xl font-black text-slate-900 mb-4 tracking-tighter">Complete Registration</h1>
          <p className="text-xl text-slate-500 font-medium">Please provide your details to activate your employee portal</p>
        </div>

        {formErrors.global && (
          <div className="mb-8 p-6 bg-red-50 border border-red-100 rounded-3xl flex items-center gap-4 text-red-700 shadow-sm">
            <XCircleIcon className="w-8 h-8 shrink-0" />
            <p className="font-bold text-lg">{formErrors.global}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* A. Account Setup */}
          <SectionCard title="Account Setup" icon={<LockClosedIcon className="w-6 h-6" />}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              <Input
                label="Employee ID (System Generated)"
                value={employeeId}
                disabled
                leftIcon={<IdentificationIcon />}
              />
              <Input
                label="Official Email Address"
                value={email}
                disabled
                leftIcon={<EnvelopeIcon />}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <Input
                label="Create Password"
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                error={formErrors.password}
                placeholder="••••••••"
                leftIcon={<LockClosedIcon />}
                helperText="Must be 8+ chars with Upper, Lower, Number & Special Char"
              />
              <Input
                label="Confirm Password"
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                error={formErrors.confirmPassword}
                placeholder="••••••••"
                leftIcon={<LockClosedIcon />}
              />
            </div>
          </SectionCard>

          {/* B. Personal Information */}
          <SectionCard title="Personal Information" icon={<UserIcon className="w-6 h-6" />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <Select
                label="Gender"
                name="gender"
                value={formData.gender}
                onChange={handleChange}
                error={formErrors.gender}
                options={[
                  { label: 'Male', value: 'Male' },
                  { label: 'Female', value: 'Female' },
                  { label: 'Other', value: 'Other' }
                ]}
              />
              <Input
                label="Date of Birth"
                type="date"
                name="dob"
                value={formData.dob}
                onChange={handleChange}
                error={formErrors.dob}
                leftIcon={<CalendarIcon />}
              />
              <Select
                label="Marital Status"
                name="maritalStatus"
                value={formData.maritalStatus}
                onChange={handleChange}
                error={formErrors.maritalStatus}
                options={[
                  { label: 'Single', value: 'Single' },
                  { label: 'Married', value: 'Married' },
                  { label: 'Divorced', value: 'Divorced' },
                  { label: 'Widowed', value: 'Widowed' }
                ]}
              />
              <Input
                label="Personal Email ID"
                name="personalEmail"
                value={formData.personalEmail}
                onChange={handleChange}
                error={formErrors.personalEmail}
                placeholder="your.email@example.com"
                leftIcon={<EnvelopeIcon />}
              />
              <Input
                label="Personal Mobile Number"
                name="personalMobile"
                value={formData.personalMobile}
                onChange={handleChange}
                error={formErrors.personalMobile}
                placeholder="10 digit mobile number"
                leftIcon={<PhoneIcon />}
              />
              <Input
                label="Expected DOJ"
                type="date"
                name="joiningDate"
                value={formData.joiningDate}
                onChange={handleChange}
                error={formErrors.joiningDate}
                leftIcon={<ClockIcon />}
                helperText="Actual date you joined the company"
              />
            </div>
          </SectionCard>

          {/* C. Identity Details */}
          <SectionCard title="Identity Verification" icon={<IdentificationIcon className="w-6 h-6" />}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-6">
                <Input
                  label="PAN Number"
                  name="pan"
                  value={formData.pan}
                  onChange={handleChange}
                  error={formErrors.pan}
                  placeholder="ABCDE1234F"
                  className="uppercase"
                />
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 ml-1">PAN Card Attachment (PDF/Image)</label>
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-200 rounded-[1.5rem] bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer group">
                    <div className="flex flex-col items-center justify-center pt-2">
                      {files.panFile ? (
                        <div className="flex items-center gap-2 text-green-600 font-black">
                          <CheckCircleIcon className="w-8 h-8" />
                          <span>{files.panFile.name}</span>
                        </div>
                      ) : (
                        <>
                          <CloudArrowUpIcon className="w-10 h-10 text-slate-400 group-hover:text-blue-600 transition-colors" />
                          <p className="mt-2 text-sm text-slate-500 font-bold">Click or drag to upload</p>
                        </>
                      )}
                    </div>
                    <input type="file" id="panFile" name="panFile" className="hidden" onChange={handleFileChange} accept=".pdf,.jpg,.jpeg,.png" aria-label="Upload PAN Card" />
                  </label>
                  {formErrors.panFile && <p className="text-xs text-red-600 font-bold ml-1">{formErrors.panFile}</p>}
                </div>
              </div>

              <div className="space-y-6">
                <Input
                  label="Aadhaar Number"
                  name="aadhaar"
                  value={formData.aadhaar}
                  onChange={handleChange}
                  error={formErrors.aadhaar}
                  placeholder="12 digit Aadhaar number"
                />
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 ml-1">Aadhaar Card Attachment (PDF/Image)</label>
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-200 rounded-[1.5rem] bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer group">
                    <div className="flex flex-col items-center justify-center pt-2">
                      {files.aadhaarFile ? (
                        <div className="flex items-center gap-2 text-green-600 font-black">
                          <CheckCircleIcon className="w-8 h-8" />
                          <span>{files.aadhaarFile.name}</span>
                        </div>
                      ) : (
                        <>
                          <CloudArrowUpIcon className="w-10 h-10 text-slate-400 group-hover:text-blue-600 transition-colors" />
                          <p className="mt-2 text-sm text-slate-500 font-bold">Click or drag to upload</p>
                        </>
                      )}
                    </div>
                    <input type="file" id="aadhaarFile" name="aadhaarFile" className="hidden" onChange={handleFileChange} accept=".pdf,.jpg,.jpeg,.png" aria-label="Upload Aadhaar Card" />
                  </label>
                  {formErrors.aadhaarFile && <p className="text-xs text-red-600 font-bold ml-1">{formErrors.aadhaarFile}</p>}
                </div>
              </div>
            </div>
          </SectionCard>

          {/* D. Address Details */}
          <SectionCard title="Address Details" icon={<HomeIcon className="w-6 h-6" />}>
            <div className="space-y-12">
              {/* Current Address */}
              <div className="space-y-6">
                <div className="flex items-center gap-2 text-slate-800 font-black border-l-4 border-blue-600 pl-3">
                  <span className="uppercase tracking-widest text-xs">Current Address</span>
                </div>
                <Input
                  label="Address Line"
                  name="currentAddress"
                  multiline
                  rows={2}
                  value={formData.currentAddress}
                  onChange={handleChange}
                  error={formErrors.currentAddress}
                  placeholder="House No, Street, Landmark..."
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <Input label="City" name="currentCity" value={formData.currentCity} onChange={handleChange} error={formErrors.currentCity} />
                  <Input label="State" name="currentState" value={formData.currentState} onChange={handleChange} error={formErrors.currentState} />
                  <Input label="PIN Code" name="currentPinCode" value={formData.currentPinCode} onChange={handleChange} error={formErrors.currentPinCode} />
                </div>
              </div>

              {/* Permanent Address */}
              <div className="space-y-6">
              <div className="flex items-center justify-between border-l-4 border-indigo-600 pl-3">
                  <span className="text-slate-800 font-black uppercase tracking-widest text-xs">Permanent Address</span>
                  <label className="flex items-center gap-2 cursor-pointer bg-slate-100 px-4 py-2 rounded-full hover:bg-slate-200 transition-colors">
                    <input type="checkbox" name="sameAsCurrent" checked={formData.sameAsCurrent} onChange={handleChange} className="w-4 h-4 rounded text-blue-600" />
                    <span className="text-xs font-black text-slate-600">Same as current</span>
                  </label>
                </div>
                {!formData.sameAsCurrent && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="space-y-6">
                    <Input
                      label="Address Line"
                      name="permanentAddress"
                      multiline
                      rows={2}
                      value={formData.permanentAddress}
                      onChange={handleChange}
                      error={formErrors.permanentAddress}
                      placeholder="Permanent house location..."
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                      <Input label="City" name="permanentCity" value={formData.permanentCity} onChange={handleChange} error={formErrors.permanentCity} />
                      <Input label="State" name="permanentState" value={formData.permanentState} onChange={handleChange} error={formErrors.permanentState} />
                      <Input label="PIN Code" name="permanentPinCode" value={formData.permanentPinCode} onChange={handleChange} error={formErrors.permanentPinCode} />
                    </div>
                  </motion.div>
                )}
                {formData.sameAsCurrent && (
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-slate-500 font-medium italic text-sm">
                    Permanent address is synced with current address.
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          {/* E. Guardian Details */}
          <SectionCard title="Guardian Details" icon={<InformationCircleIcon className="w-6 h-6" />}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <Input label="Guardian Name" name="guardianName" value={formData.guardianName} onChange={handleChange} error={formErrors.guardianName} leftIcon={<UserIcon />} />
              <Input label="Guardian Contact Number" name="guardianNumber" value={formData.guardianNumber} onChange={handleChange} error={formErrors.guardianNumber} leftIcon={<PhoneIcon />} />
              <div className="md:col-span-2">
                <Input label="Guardian Address" name="guardianAddress" multiline rows={2} value={formData.guardianAddress} onChange={handleChange} error={formErrors.guardianAddress} leftIcon={<HomeIcon />} />
              </div>
            </div>
          </SectionCard>

          {/* F. Education & Profile */}
          <SectionCard title="Education & Profile" icon={<AcademicCapIcon className="w-6 h-6" />}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
              <div className="space-y-6">
                <Select
                  label="Educational Qualification"
                  name="education"
                  value={formData.education}
                  onChange={handleChange}
                  error={formErrors.education}
                  options={[
                    { label: 'Post Graduate', value: 'Post Graduate' },
                    { label: 'Graduate', value: 'Graduate' },
                    { label: 'Diploma', value: 'Diploma' },
                    { label: 'HSC', value: 'HSC' },
                    { label: 'SSC', value: 'SSC' },
                    { label: 'Other', value: 'Other' }
                  ]}
                />
                <p className="text-xs text-slate-500 font-medium bg-blue-50 p-4 rounded-2xl border border-blue-100">
                  <InformationCircleIcon className="w-4 h-4 inline mr-1" />
                  Please ensure your photo clearly identifies your face against a plain background.
                </p>
              </div>

              <div className="flex flex-col items-center gap-4 py-4">
                <div className="relative group w-48 h-48">
                  <div className="w-full h-full rounded-[2.5rem] bg-slate-100 border-4 border-white shadow-xl overflow-hidden flex items-center justify-center transition-transform group-hover:scale-105 duration-300">
                    {previews.profileImage ? (
                      <img src={previews.profileImage} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <CameraIcon className="w-12 h-12" />
                        <span className="text-xs font-black uppercase">No Photo</span>
                      </div>
                    )}
                  </div>
                  <label className="absolute bottom-[-10px] right-[-10px] w-14 h-14 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg cursor-pointer hover:bg-blue-700 transition-colors">
                    <CloudArrowUpIcon className="w-8 h-8" />
                    <input type="file" id="profileImage" name="profileImage" className="hidden" onChange={handleFileChange} accept="image/*" aria-label="Upload Employee Photo" />
                  </label>
                </div>
                <span className="text-sm font-black text-slate-800 tracking-tight">Employee Passport Photo</span>
                {formErrors.profileImage && <p className="text-xs text-red-600 font-bold mt-1">{formErrors.profileImage}</p>}
              </div>
            </div>
          </SectionCard>

          {/* G. Bank Details */}
          <SectionCard title="Bank Details" icon={<BanknotesIcon className="w-6 h-6" />}>
            <div className="space-y-10">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Input label="Bank Name" name="bankName" value={formData.bankName} onChange={handleChange} error={formErrors.bankName} placeholder="e.g. HDFC Bank, ICICI..." />
                <Input label="Branch Name" name="branchName" value={formData.branchName} onChange={handleChange} error={formErrors.branchName} />
                <Input label="Account Holder Name" name="accountHolderName" value={formData.accountHolderName} onChange={handleChange} error={formErrors.accountHolderName} placeholder="As per passbook" />
                <Input label="Account Number" name="bankAccountNumber" value={formData.bankAccountNumber} onChange={handleChange} error={formErrors.bankAccountNumber} />
                <Input label="IFSC Code" name="ifscCode" value={formData.ifscCode} onChange={handleChange} error={formErrors.ifscCode} placeholder="11 Chars like BKID0001234" />
              </div>

              <div className="space-y-4">
                <label className="text-sm font-bold text-slate-700 ml-1">Cancelled Cheque / Bank Passbook (PDF/Image)</label>
                <div className="flex items-center gap-4 p-6 bg-slate-50 rounded-[2rem] border border-slate-200">
                  <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-slate-400 shadow-sm border border-slate-100">
                    {previews.bankStatementFile ? (
                      previews.bankStatementFile === 'pdf' ? <PaperClipIcon className="w-8 h-8 text-blue-600" /> : <img src={previews.bankStatementFile} alt="Bank statement preview" className="w-full h-full object-cover rounded-xl" />
                    ) : <BanknotesIcon className="w-8 h-8" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-black text-slate-800">{files.bankStatementFile ? files.bankStatementFile.name : 'No file selected'}</p>
                    <p className="text-xs text-slate-500 font-medium">Wait, {files.bankStatementFile ? (files.bankStatementFile.size / 1024).toFixed(1) + ' KB' : 'Max 5MB'}</p>
                  </div>
                  <label className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black text-sm cursor-pointer hover:bg-blue-700 shadow-md">
                    Choose File
                    <input type="file" id="bankStatementFile" name="bankStatementFile" className="hidden" onChange={handleFileChange} accept=".pdf,.jpg,.jpeg,.png" aria-label="Upload Bank Statement" />
                  </label>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Submission Action */}
          <div className="sticky bottom-8 z-50 pt-10">
            <div className="bg-white/70 backdrop-blur-xl p-4 rounded-[2.5rem] shadow-2xl border border-white max-w-lg mx-auto transform transition-transform hover:scale-[1.01]">
              <motion.button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black text-xl py-5 rounded-[2rem] shadow-xl shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-4 disabled:opacity-70"
              >
                {isSubmitting ? (
                  <ASALoader size="xs" />
                ) : (
                  <>
                    Submit & Register
                    <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                      <ArrowRightIcon className="w-5 h-5" />
                    </div>
                  </>
                )}
              </motion.button>
              <div className="mt-4 flex justify-center">
                <Link to="/login" className="text-slate-500 font-black hover:text-blue-600 transition-colors flex items-center gap-2 text-sm uppercase tracking-widest">
                  <ChevronLeftIcon className="w-5 h-5" />
                  Cancel
                </Link>
              </div>
            </div>
          </div>

        </form>

        <footer className="mt-20 pb-12 text-center">
          <p className="text-slate-400 font-bold uppercase tracking-[0.3em] text-[10px]">
            © 2026 ASA Insights • Secure Employee Onboarding
          </p>
        </footer>
      </motion.div>
    </div>
  );
};

export default EmployeeRegistration;
