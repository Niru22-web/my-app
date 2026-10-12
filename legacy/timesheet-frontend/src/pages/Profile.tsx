/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import API from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { getLoadingMessage, getSuccessMessage } from '../utils/messageUtils';
import { getProfileImageUrl } from '../utils/assetUtils';
import {
    PencilSquareIcon,
    CameraIcon,
    LockClosedIcon,
    KeyIcon,
    BriefcaseIcon,
    ClockIcon,
    CheckCircleIcon,
    IdentificationIcon,
    UserCircleIcon,
    DocumentTextIcon,
    ChartBarIcon,
    EnvelopeIcon,
    PhoneIcon,
    CalendarDaysIcon,
    AcademicCapIcon,
    ShieldCheckIcon,
    MapPinIcon,
    ComputerDesktopIcon,
    UserIcon,
    ArrowDownTrayIcon,
    CpuChipIcon
} from '@heroicons/react/24/outline';

// UI Components
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import ASALoader from '../components/ui/ASALoader';

import './Profile.css';

const HERO_THEMES: Record<string, string> = {
    cyberNight:
        'linear-gradient(135deg, #0f172a 0%, #1e293b 30%, #312e81 65%, #2563eb 100%)',

    graphitePurple:
        'linear-gradient(135deg, #1e293b 0%, #334155 30%, #4c1d95 70%, #7c3aed 100%)',

    aurora_img: "url('/images/bg_aurora_minimal.png') center/cover no-repeat",
    nebula_img: "url('/images/bg_midnight_nebula.png') center/cover no-repeat"
};

const PaletteIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 14.7255 3.09032 17.1962 4.85857 19C5.03456 19.176 5.12256 19.264 5.23432 19.3248C5.35266 19.3892 5.48312 19.4263 5.61746 19.434C5.74418 19.4412 5.86791 19.4093 6.11537 19.3654L6.44296 19.3072C7.29177 19.1563 7.71618 19.0809 8.08253 19.1678C8.4116 19.2458 8.70617 19.4239 8.92484 19.6766C9.1683 19.9579 9.27306 20.3703 9.48256 21.1951L9.62024 21.7371C9.72146 22.1356 9.77207 22.3349 9.89736 22.4835C10.0076 22.6144 10.1558 22.7126 10.3235 22.7656C10.514 22.8257 10.7188 22.7848 11.1284 22.7028C11.4172 22.6451 11.7118 22.6152 12.0086 22.0044C12 22 12 22 12 22Z" />
        <circle cx="7.5" cy="10.5" r="1.5" fill="currentColor" />
        <circle cx="11.5" cy="7.5" r="1.5" fill="currentColor" />
        <circle cx="16.5" cy="9.5" r="1.5" fill="currentColor" />
        <circle cx="15.5" cy="14.5" r="1.5" fill="currentColor" />
    </svg>
);

type TabType = 'overview' | 'registry' | 'hardware' | 'credentials';

const Profile: React.FC = () => {
    const { user, updateUser } = useAuth();
    const toast = useToast();
    const [profileData, setProfileData] = useState<any>(null);
    const [stats, setStats] = useState<any>(null);
    const [documents, setDocuments] = useState<any[]>([]);
    const [assignedAssets, setAssignedAssets] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [photoError, setPhotoError] = useState('');
    const [savingProfile, setSavingProfile] = useState(false);

    // Active sub-navigation tab
    const [activeTab, setActiveTab] = useState<TabType>('overview');

    // Dynamic banner theme selection
    const [heroTheme, setHeroTheme] = useState<string>(() => {
        const saved = localStorage.getItem('hero-bg-theme');
        return (saved && saved !== 'classic') ? saved : 'cyberNight';
    });
    const [showPalette, setShowPalette] = useState(false);

    const handleThemeChange = (themeName: string) => {
        localStorage.setItem('hero-bg-theme', themeName);
        setHeroTheme(themeName);
        window.dispatchEvent(new CustomEvent('hero-bg-theme-updated', { detail: themeName }));
    };

    useEffect(() => {
        const handleEvent = (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail) {
                setHeroTheme(customEvent.detail);
            }
        };
        window.addEventListener('hero-bg-theme-updated', handleEvent);
        return () => {
            window.removeEventListener('hero-bg-theme-updated', handleEvent);
        };
    }, []);

    // Form states for editing
    const [formData, setFormData] = useState({
        personalMobile: '',
        personalEmail: '',
        pan: '',
        aadhaar: '',
        dob: '',
        doj: '',
        education: '',
        maritalStatus: '',
        gender: '',
        currentAddress: '',
        permanentAddress: '',
        salary: '',
        seniorityLevel: '',
        experience: '',
        employmentType: '',
        skills: ''
    });

    // Profile photo state
    const [profileImage, setProfileImage] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string>('');
    const [photoModalOpen, setPhotoModalOpen] = useState(false);

    // Change password state
    const [passwordModalOpen, setPasswordModalOpen] = useState(false);
    const [passwordData, setPasswordData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [passwordError, setPasswordError] = useState('');
    const [passwordLoading, setPasswordLoading] = useState(false);

    // Memoized photo URL to resolve ReferenceError and ensure consistency
    const photoUrl = useMemo(() => {
        return getProfileImageUrl(profileData?.profileImage);
    }, [profileData?.profileImage]);

    useEffect(() => {
        if (user?.id) {
            fetchProfile();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    const fetchProfile = async () => {
        if (!user?.email) return;
        try {
            setLoading(true);
            const [profileRes, statsRes, allocationsRes] = await Promise.all([
                API.get(`/employees/by-email?email=${user.email}`),
                API.get('/dashboard/employee-stats'),
                API.get('/assets/allocations').catch(() => ({ data: { success: false, data: [] } }))
            ]);

            const data = profileRes.data.data;
            const statsData = statsRes.data.data;

            setProfileData(data);
            setStats(statsData);

            if (allocationsRes.data.success && data?.id) {
                const myAllocations = allocationsRes.data.data.filter(
                    (alloc: any) => alloc.employeeId === data.id && 
                                    alloc.status === 'Allocated' && 
                                    alloc.inventory && 
                                    alloc.inventory.isDeleted !== true
                );
                setAssignedAssets(myAllocations);
            }

            if (data?.id) {
                const docsRes = await API.get(`/employees/${data.id}/documents`);
                setDocuments(docsRes.data.data || []);
            }

            updateUser(data);

            const profile = data.profile || {};
            setFormData({
                personalMobile: profile.personalMobile || '',
                personalEmail: profile.personalEmail || '',
                pan: profile.pan || '',
                aadhaar: profile.aadhaar || '',
                dob: profile.dob ? new Date(profile.dob).toISOString().split('T')[0] : '',
                doj: profile.doj ? new Date(profile.doj).toISOString().split('T')[0] : '',
                education: profile.education || '',
                maritalStatus: profile.maritalStatus || '',
                gender: profile.gender || '',
                currentAddress: profile.currentAddress || '',
                permanentAddress: profile.permanentAddress || '',
                salary: profile.salary?.toString() || '',
                seniorityLevel: profile.seniorityLevel || '',
                experience: profile.experience || '',
                employmentType: profile.employmentType || '',
                skills: profile.skills ? profile.skills.join(', ') : ''
            });
        } catch (err) {
            console.error('Failed to fetch profile:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveProfile = async () => {
        try {
            setSavingProfile(true);
            const skillsArray = formData.skills.split(',').map(s => s.trim()).filter(s => s !== '');

            await API.put(`/employees/${profileData.id}`, {
                profile: {
                    ...formData,
                    skills: skillsArray
                }
            });

            await fetchProfile();
            setEditModalOpen(false);
            toast.success(getSuccessMessage('profile'));
        } catch (err) {
            console.error('Failed to update profile:', err);
        } finally {
            setSavingProfile(false);
        }
    };

    const handlePhotoUpload = async () => {
        if (!profileImage) return;

        // Validate file size (10MB)
        if (profileImage.size > 10 * 1024 * 1024) {
            toast.error('File size must be less than 10MB');
            return;
        }

        setUploadingPhoto(true);
        try {
            const formDataObj = new FormData();
            formDataObj.append('profileImage', profileImage);

            await API.post('/employees/profile-photo', formDataObj, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            await fetchProfile();
            setProfileImage(null);
            setPhotoPreview('');
            setPhotoModalOpen(false);
            toast.success(getSuccessMessage('photo'));
        } catch (error: any) {
            setPhotoError(error.response?.data?.error || 'Failed to upload photo');
        } finally {
            setUploadingPhoto(false);
        }
    };

    const handleChangePassword = async () => {
        if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
            setPasswordError('All fields are required');
            return;
        }
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setPasswordError('New passwords do not match');
            return;
        }
        setPasswordLoading(true);
        try {
            await API.post('/auth/change-password', {
                currentPassword: passwordData.currentPassword,
                newPassword: passwordData.newPassword
            });
            setPasswordModalOpen(false);
            setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
            toast.success(getSuccessMessage('password'));
        } catch (error: any) {
            setPasswordError(error.response?.data?.error || 'Failed to change password');
        } finally {
            setPasswordLoading(false);
        }
    };

    if (loading) {
        return <ASALoader fullPage size="lg" text="Loading profile..." />;
    }

    return (
        <div className="w-full">
            {/* Dynamic CSS styles to avoid inline style warnings */}
            <style dangerouslySetInnerHTML={{
                __html: `
                    .dynamic-header-banner {
                        background: ${HERO_THEMES[heroTheme] || HERO_THEMES.cyberNight} !important;
                    }
                    ${Object.entries(HERO_THEMES).map(([key, value]) => `
                        .theme-bubble-${key} {
                            background: ${value} !important;
                        }
                    `).join('\n')}
                `
            }} />

            <div className="profile-container">

                {/* Header Card */}
                <div className="profile-header-card">
                    <div className="header-banner dynamic-header-banner">
                        {/* Theme picker widget */}
                        <div className="absolute top-4 right-4 z-30 flex items-center gap-2 bg-black/25 backdrop-blur-md px-3 py-2 rounded-full border border-white/10 shadow-lg">
                            <AnimatePresence>
                                {showPalette && (
                                    <motion.div
                                        initial={{ width: 0, opacity: 0 }}
                                        animate={{ width: 'auto', opacity: 1 }}
                                        exit={{ width: 0, opacity: 0 }}
                                        className="flex items-center gap-2 overflow-hidden pr-2 border-r border-white/10 mr-1"
                                    >
                                        {Object.entries(HERO_THEMES).map(([key]) => (
                                            <button
                                                key={key}
                                                onClick={() => handleThemeChange(key)}
                                                className={`w-6 h-6 rounded-full border-2 transition-all hover:scale-125 focus:outline-none theme-bubble-${key} ${heroTheme === key ? 'border-white scale-110 shadow-md' : 'border-transparent opacity-75 hover:opacity-100'}`}
                                                title={key.charAt(0).toUpperCase() + key.slice(1)}
                                            />
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            <button
                                onClick={() => setShowPalette(!showPalette)}
                                className="text-white hover:text-indigo-200 transition-colors p-0.5 focus:outline-none"
                                title="Change Header Background"
                            >
                                <PaletteIcon />
                            </button>
                        </div>
                    </div>
                    <div className="header-content">
                        <div className="profile-avatar-container">
                            <div className="avatar-ring">
                                <Avatar
                                    name={`${profileData?.firstName} ${profileData?.lastName}`}
                                    src={profileData?.profileImage}
                                    size="2xl"
                                    border
                                    updatedAt={profileData?.updatedAt}
                                />
                            </div>
                            <button
                                className="edit-photo-btn"
                                onClick={() => setPhotoModalOpen(true)}
                                title="Update Profile Photo"
                                aria-label="Update profile photo"
                            >
                                <CameraIcon className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="header-info">
                            <h1 className="profile-name">{profileData?.firstName} {profileData?.lastName}</h1>
                            <p className="profile-role">{profileData?.designation || 'Specialist'}</p>
                        </div>
                        <div className="header-actions">
                            <Button variant="primary" onClick={() => setEditModalOpen(true)} leftIcon={<PencilSquareIcon className="w-4 h-4" />}>
                                Edit Profile
                            </Button>
                            <Button variant="secondary" onClick={() => setPasswordModalOpen(true)} leftIcon={<KeyIcon className="w-4 h-4" />}>
                                Security
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Redesigned interactive Sub-Navigation bar */}
                <div className="profile-tabs-container">
                    {(['overview', 'registry', 'hardware', 'credentials'] as TabType[]).map((tab) => {
                        const active = activeTab === tab;
                        const labelMap: Record<TabType, string> = {
                            overview: 'Overview',
                            registry: 'Registry',
                            hardware: 'Hardware Custody',
                            credentials: 'Credentials'
                        };
                        const iconMap: Record<TabType, React.ReactNode> = {
                            overview: <ChartBarIcon />,
                            registry: <IdentificationIcon />,
                            hardware: <ComputerDesktopIcon />,
                            credentials: <DocumentTextIcon />
                        };

                        return (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`profile-tab-button ${active ? 'active' : ''}`}
                            >
                                {active && (
                                    <motion.div
                                        layoutId="profileTabActive"
                                        className="profile-tab-active-indicator"
                                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                    />
                                )}
                                {iconMap[tab]}
                                <span>{labelMap[tab]}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Animated Page view container */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    >
                        {activeTab === 'overview' && (
                            <div className="space-y-6">
                                {/* Stats Row */}
                                <div className="stats-grid">
                                    <div className="stat-card">
                                        <div className="stat-icon-box bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                            <BriefcaseIcon className="w-7 h-7" />
                                        </div>
                                        <div className="stat-info">
                                            <div className="stat-value">{stats?.myProjects || 0}</div>
                                            <div className="stat-label">Active Projects</div>
                                        </div>
                                    </div>
                                    <div className="stat-card">
                                        <div className="stat-icon-box bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                                            <ClockIcon className="w-7 h-7" />
                                        </div>
                                        <div className="stat-info">
                                            <div className="stat-value">{Number(stats?.hoursLogged || 0).toFixed(2)}</div>
                                            <div className="stat-label">Hours Logged</div>
                                        </div>
                                    </div>
                                    <div className="stat-card">
                                        <div className="stat-icon-box bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400">
                                            <CheckCircleIcon className="w-7 h-7" />
                                        </div>
                                        <div className="stat-info">
                                            <div className="stat-value">{stats?.totalTasks || 0}</div>
                                            <div className="stat-label">Total Tasks</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="profile-main-grid">
                                    <div className="content-card flex flex-col justify-between">
                                        <div>
                                            <div className="card-title">
                                                <UserIcon className="w-5 h-5 text-indigo-500" />
                                                Welcome back
                                            </div>
                                            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
                                                You're doing fantastic! All timesheet schedules, database assets allocation models, and client deliverables are fully synced. Complete outstanding security matrices or modify address logs in the registry tab.
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div className="radial-completion-container">
                                                <svg width="60" height="60" className="radial-ring-svg">
                                                    <circle cx="30" cy="30" r="25" strokeWidth="6" className="radial-ring-bg" />
                                                    <circle
                                                        cx="30"
                                                        cy="30"
                                                        r="25"
                                                        strokeWidth="6"
                                                        stroke="#6366f1"
                                                        strokeDasharray={157}
                                                        strokeDashoffset={157 * (1 - 0.85)}
                                                        className="radial-ring-bar"
                                                    />
                                                </svg>
                                                <div>
                                                    <div className="text-sm font-black text-slate-700 dark:text-slate-300">85% Complete</div>
                                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Profile Score</div>
                                                </div>
                                            </div>
                                            <div className="radial-completion-container">
                                                <svg width="60" height="60" className="radial-ring-svg">
                                                    <circle cx="30" cy="30" r="25" strokeWidth="6" className="radial-ring-bg" />
                                                    <circle
                                                        cx="30"
                                                        cy="30"
                                                        r="25"
                                                        strokeWidth="6"
                                                        stroke="#10b981"
                                                        strokeDasharray={157}
                                                        strokeDashoffset={0}
                                                        className="radial-ring-bar"
                                                    />
                                                </svg>
                                                <div>
                                                    <div className="text-sm font-black text-emerald-600">Optimal</div>
                                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Attendance</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="content-card">
                                        <div className="card-title">
                                            <ChartBarIcon className="w-5 h-5 text-indigo-500" />
                                            Target Goals
                                        </div>
                                        <div className="space-y-6">
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Monthly Hours</span>
                                                    <span className="text-xs font-black text-indigo-600">85%</span>
                                                </div>
                                                <div className="progress-bar-container">
                                                    <div className="progress-bar-fill bg-indigo-fill w-[85%]" />
                                                </div>
                                            </div>
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Task Completion</span>
                                                    <span className="text-xs font-black text-emerald-600">100%</span>
                                                </div>
                                                <div className="progress-bar-container">
                                                    <div className="progress-bar-fill bg-emerald-fill w-full" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'registry' && (
                            <div className="content-card">
                                <div className="card-title">
                                    <IdentificationIcon className="w-6 h-6 text-indigo-500" />
                                    Information Registry
                                </div>

                                {/* Section 1: Core Professional Profile */}
                                <div className="registry-section">
                                    <div className="registry-section-title">
                                        <BriefcaseIcon className="w-4 h-4 text-indigo-500 mr-2 inline-block" />
                                        Core Professional Profile
                                    </div>
                                    <div className="info-sections">
                                        <div className="info-group">
                                            <div className="info-label">Full Legal Name</div>
                                            <div className="info-value">
                                                <UserCircleIcon className="w-4 h-4 text-slate-400 mr-1.5" />
                                                {profileData?.firstName} {profileData?.lastName}
                                            </div>
                                        </div>
                                        <div className="info-group">
                                            <div className="info-label">Office Credentials</div>
                                            <div className="info-value text-indigo-600 font-bold">
                                                <EnvelopeIcon className="w-4 h-4 text-indigo-400 mr-1.5" />
                                                {profileData?.officeEmail}
                                            </div>
                                        </div>
                                        <div className="info-group">
                                            <div className="info-label">Employee Matrix ID</div>
                                            <div className="info-value">
                                                <IdentificationIcon className="w-4 h-4 text-slate-400 mr-1.5" />
                                                {profileData?.employeeId}
                                            </div>
                                        </div>
                                        <div className="info-group">
                                            <div className="info-label">Departmental Unit</div>
                                            <div className="info-value">
                                                <BriefcaseIcon className="w-4 h-4 text-slate-400 mr-1.5" />
                                                {profileData?.department || 'Operations'}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Section 2: Deployment & Competence */}
                                <div className="registry-section">
                                    <div className="registry-section-title">
                                        <ChartBarIcon className="w-4 h-4 text-indigo-500 mr-2 inline-block" />
                                        Deployment & Competence
                                    </div>
                                    <div className="info-sections">
                                        <div className="info-group">
                                            <div className="info-label">Employment Nature</div>
                                            <div className="info-value">
                                                <ShieldCheckIcon className="w-4 h-4 text-slate-400 mr-1.5" />
                                                {profileData?.profile?.employmentType || 'Regular Full-Time'}
                                            </div>
                                        </div>
                                        <div className="info-group">
                                            <div className="info-label">Seniority Grade</div>
                                            <div className="info-value">
                                                <ShieldCheckIcon className="w-4 h-4 text-indigo-400 mr-1.5" />
                                                {profileData?.profile?.seniorityLevel || 'Professional'}
                                            </div>
                                        </div>
                                        <div className="info-group">
                                            <div className="info-label">Tenure at Firm</div>
                                            <div className="info-value">
                                                <ClockIcon className="w-4 h-4 text-slate-400 mr-1.5" />
                                                {profileData?.profile?.experience || 'Newly Joined'}
                                            </div>
                                        </div>
                                        <div className="info-group">
                                            <div className="info-label">Academic Portfolio</div>
                                            <div className="info-value">
                                                <AcademicCapIcon className="w-4 h-4 text-slate-400 mr-1.5" />
                                                {profileData?.profile?.education || 'Degree Holder'}
                                            </div>
                                        </div>
                                        <div className="info-group md:col-span-2">
                                            <div className="info-label">Core Competencies</div>
                                            <div className="skills-container">
                                                {profileData?.profile?.skills?.map((skill: string, i: number) => (
                                                    <span key={i} className="skill-badge">{skill}</span>
                                                )) || <span className="text-slate-400 italic text-xs">Awaiting proficiency mapping...</span>}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Section 3: Professional Relationship Matrix */}
                                <div className="registry-section">
                                    <div className="registry-section-title">
                                        <UserCircleIcon className="w-4 h-4 text-indigo-500 mr-2 inline-block" />
                                        Professional Relationship Matrix
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="info-group">
                                            <div className="info-label">Reporting Partners</div>
                                            <div className="flex flex-wrap gap-2 mt-1.5">
                                                {profileData?.partnerDetails && profileData.partnerDetails.length > 0 ? (
                                                    profileData.partnerDetails.map((p: any, i: number) => (
                                                        <span key={i} className="rel-badge bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-100 dark:border-purple-500/20">
                                                            {p.name || `${p.firstName} ${p.lastName}`}
                                                        </span>
                                                    ))
                                                ) : (
                                                    <span className="text-slate-400 italic text-xs">No partners assigned</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="info-group">
                                            <div className="info-label">Reporting Managers</div>
                                            <div className="flex flex-wrap gap-2 mt-1.5">
                                                {profileData?.managerDetails && profileData.managerDetails.length > 0 ? (
                                                    profileData.managerDetails.map((m: any, i: number) => (
                                                        <span key={i} className="rel-badge bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-500/20">
                                                            {m.name || `${m.firstName} ${m.lastName}`}
                                                        </span>
                                                    ))
                                                ) : (
                                                    <span className="text-slate-400 italic text-xs">No managers assigned</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="info-group">
                                            <div className="info-label">Sub Managers</div>
                                            <div className="flex flex-wrap gap-2 mt-1.5">
                                                {profileData?.subManagerDetails && profileData.subManagerDetails.length > 0 ? (
                                                    profileData.subManagerDetails.map((sm: any, i: number) => (
                                                        <span key={i} className="rel-badge bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20">
                                                            {sm.name || `${sm.firstName} ${sm.lastName}`}
                                                        </span>
                                                    ))
                                                ) : (
                                                    <span className="text-slate-400 italic text-xs">No sub-managers assigned</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Section 4: Personal Domicile */}
                                <div className="registry-section mb-0">
                                    <div className="registry-section-title">
                                        <MapPinIcon className="w-4 h-4 text-indigo-500 mr-2 inline-block" />
                                        Personal Domicile & Contacts
                                    </div>
                                    <div className="info-sections">
                                        <div className="info-group">
                                            <div className="info-label">Personal Mobile</div>
                                            <div className="info-value">
                                                <PhoneIcon className="w-4 h-4 text-slate-400 mr-1.5" />
                                                {profileData?.profile?.personalMobile || 'Not Provided'}
                                            </div>
                                        </div>
                                        <div className="info-group">
                                            <div className="info-label">Birth Date</div>
                                            <div className="info-value">
                                                <CalendarDaysIcon className="w-4 h-4 text-slate-400 mr-1.5" />
                                                {profileData?.profile?.dob ? new Date(profileData.profile.dob).toLocaleDateString() : 'N/A'}
                                            </div>
                                        </div>
                                        <div className="info-group">
                                            <div className="info-label">Residential Address</div>
                                            <div className="info-value text-xs leading-relaxed">
                                                <MapPinIcon className="w-4 h-4 text-slate-400 mr-1.5 flex-shrink-0" />
                                                {profileData?.profile?.currentAddress || 'No primary address recorded.'}
                                            </div>
                                        </div>
                                        <div className="info-group">
                                            <div className="info-label">Permanent Domicile</div>
                                            <div className="info-value text-xs leading-relaxed">
                                                <MapPinIcon className="w-4 h-4 text-slate-400 mr-1.5 flex-shrink-0" />
                                                {profileData?.profile?.permanentAddress || 'Same as residential address.'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'hardware' && (
                            <div className="content-card">
                                <div className="card-title">
                                    <ComputerDesktopIcon className="w-5 h-5 text-indigo-500" />
                                    Active Hardware Custody
                                </div>
                                <div className="custody-shelf-grid">
                                    {assignedAssets.length > 0 ? assignedAssets.map((alloc, i) => (
                                        <motion.div
                                            key={i}
                                            whileHover={{ scale: 1.02 }}
                                            className="hardware-shelf-card"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="device-avatar-box">
                                                    <ComputerDesktopIcon className="w-6 h-6" />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-extrabold text-slate-800 dark:text-slate-200">{alloc.inventory?.assetName}</div>
                                                    <div className="text-xs text-slate-400 font-mono mt-0.5">SN: {alloc.inventory?.serialNumber}</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 mt-2">
                                                <span className="text-[10px] font-black text-indigo-500 font-mono bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 rounded uppercase tracking-tighter">
                                                    Tag: {alloc.inventory?.officeTagNo || 'N/A'}
                                                </span>
                                                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-0.5 rounded-full uppercase">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                    Allocated
                                                </span>
                                            </div>
                                        </motion.div>
                                    )) : (
                                        <div className="col-span-2 text-center py-16">
                                            <div className="w-16 h-16 bg-slate-50 dark:bg-slate-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <ComputerDesktopIcon className="w-7 h-7 text-slate-300 dark:text-slate-600" />
                                            </div>
                                            <div className="text-xs font-black text-slate-400 uppercase tracking-widest">No hardware assets under custody</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'credentials' && (
                            <div className="content-card">
                                <div className="card-title">
                                    <DocumentTextIcon className="w-5 h-5 text-indigo-500" />
                                    Credentials & Certificates Vault
                                </div>
                                <div className="credential-vault-grid">
                                    {documents.length > 0 ? documents.map((doc, i) => (
                                        <div key={i} className="document-vault-card">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-lg flex items-center justify-center shadow-sm">
                                                    <DocumentTextIcon className="w-5 h-5 text-indigo-400" />
                                                </div>
                                                <div>
                                                    <div className="text-xs font-black text-slate-700 dark:text-slate-300 truncate max-w-[150px]" title={doc.fileName}>{doc.fileName}</div>
                                                    <div className="text-[10px] font-bold text-slate-400 mt-0.5">{doc.category || 'General Document'}</div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const token = localStorage.getItem('token');
                                                    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
                                                    const url = `${API_BASE_URL}/employees/documents/${doc.id}/download?view=true${token ? `&token=${token}` : ''}`;
                                                    window.open(url, '_blank');
                                                }}
                                                className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-indigo-600"
                                                title="Download Document"
                                            >
                                                <ArrowDownTrayIcon className="w-5 h-5" />
                                            </button>
                                        </div>
                                    )) : (
                                        <div className="col-span-2 text-center py-16">
                                            <div className="w-16 h-16 bg-slate-50 dark:bg-slate-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <DocumentTextIcon className="w-7 h-7 text-slate-300 dark:text-slate-600" />
                                            </div>
                                            <div className="text-xs font-black text-slate-400 uppercase tracking-widest">No certifications or files found</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Photo Avatar Upload Modal */}
            <Modal isOpen={photoModalOpen} onClose={() => setPhotoModalOpen(false)} title="Update Avatar" size="sm">
                <div className="flex flex-col items-center gap-6 py-4">
                    <Avatar name={`${profileData?.firstName} ${profileData?.lastName}`} size="2xl" src={photoPreview || photoUrl || undefined} border className="ring-4 ring-indigo-50" updatedAt={profileData?.updatedAt} />
                    <input
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        className="hidden"
                        id="photo-upload-input"
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            const file = e.target.files?.[0];
                            if (file) {
                                setProfileImage(file);
                                const reader = new FileReader();
                                reader.onloadend = () => setPhotoPreview(reader.result as string);
                                reader.readAsDataURL(file);
                            }
                        }} />
                    <label
                        htmlFor="photo-upload-input"
                        className="w-full p-4 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center gap-2 cursor-pointer hover:border-indigo-300 hover:bg-slate-50 transition-all"
                    >
                        <CameraIcon className="w-8 h-8 text-slate-400" />
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Select Image Asset</span>
                    </label>
                    <Button variant="primary" fullWidth onClick={handlePhotoUpload} isLoading={uploadingPhoto}>Apply New Avatar</Button>
                </div>
            </Modal>

            {/* Modify Information Registry Modal */}
            <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title="Modify Information Registry" size="lg">
                <div className="max-h-[60vh] overflow-y-auto px-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Mobile" value={formData.personalMobile} onChange={(e) => setFormData({ ...formData, personalMobile: e.target.value })} />
                    <Input label="Personal Email" value={formData.personalEmail} onChange={(e) => setFormData({ ...formData, personalEmail: e.target.value })} />
                    <Input label="PAN" value={formData.pan} onChange={(e) => setFormData({ ...formData, personalEmail: formData.personalEmail, pan: e.target.value })} />
                    <Input label="Aadhaar" value={formData.aadhaar} onChange={(e) => setFormData({ ...formData, aadhaar: e.target.value })} />
                    <Input label="Date of Birth" type="date" value={formData.dob} onChange={(e) => setFormData({ ...formData, dob: e.target.value })} />
                    <Input label="Joining Date" type="date" value={formData.doj} onChange={(e) => setFormData({ ...formData, doj: e.target.value })} />
                    <Input label="Education" value={formData.education} onChange={(e) => setFormData({ ...formData, education: e.target.value })} />
                    <Input label="Seniority" value={formData.seniorityLevel} onChange={(e) => setFormData({ ...formData, seniorityLevel: e.target.value })} />
                    <Input label="Experience" value={formData.experience} onChange={(e) => setFormData({ ...formData, experience: e.target.value })} />
                    <div className="md:col-span-2">
                        <Input label="Current Address" value={formData.currentAddress} onChange={(e) => setFormData({ ...formData, currentAddress: e.target.value })} />
                    </div>
                    <div className="md:col-span-2">
                        <Input label="Permanent Address" value={formData.permanentAddress} onChange={(e) => setFormData({ ...formData, permanentAddress: e.target.value })} />
                    </div>
                    <div className="md:col-span-2">
                        <Input label="Skills (Comma separated)" value={formData.skills} onChange={(e) => setFormData({ ...formData, skills: e.target.value })} />
                    </div>
                </div>
                <div className="pt-6">
                    <Button variant="primary" fullWidth onClick={handleSaveProfile} isLoading={savingProfile}>Commit All Changes</Button>
                </div>
            </Modal>

            {/* Security Shield Modal */}
            <Modal isOpen={passwordModalOpen} onClose={() => setPasswordModalOpen(false)} title="Security Protocol Update" size="md">
                <div className="space-y-4 pt-2">
                    <Input label="Current Shield" type="password" value={passwordData.currentPassword} onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })} />
                    <Input label="New Shield" type="password" value={passwordData.newPassword} onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })} />
                    <Input label="Confirm Shield" type="password" value={passwordData.confirmPassword} onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })} />
                    {passwordError && <div className="text-red-500 text-xs font-bold">{passwordError}</div>}
                    <Button variant="primary" fullWidth onClick={handleChangePassword} isLoading={passwordLoading}>Update Shield Credentials</Button>
                </div>
            </Modal>
        </div>
    );
};

export default Profile;
