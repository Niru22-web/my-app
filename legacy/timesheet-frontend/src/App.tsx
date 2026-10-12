import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PermissionsProvider, usePermissions } from './contexts/PermissionsContext';
import { LoadingProvider } from './contexts/LoadingContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { ConfirmProvider } from './contexts/ConfirmContext';
import { NotificationProvider } from './contexts/NotificationContext';
import ProtectedRoute from './components/ProtectedRoute';

import FrozenLayout from './components/FrozenLayout';
import ErrorBoundary from './components/ErrorBoundary';
import axios from 'axios';
import { Maintenance } from './components/Maintenance';

// Pages

import AdminDashboard from './pages/NewAdminDashboard';
import HRDashboard from './pages/NewHRDashboard';
import ManagerDashboard from './pages/NewManagerDashboard';
import PartnerDashboard from './pages/NewPartnerDashboard';
import EmployeeDashboard from './pages/NewEmployeeDashboard';

// import TestComponent from './pages/TestComponent';
import Timesheet from './pages/Timesheet';

import SimpleLogin from './pages/SimpleLogin';
import ForgotPassword from './pages/ForgotPassword';
import ResponsiveAuthLayout from './components/layouts/ResponsiveAuthLayout';
import ResetPassword from './pages/ResetPassword';
import UserRegistration from './pages/UserRegistration';
import EmployeeRegistration from './pages/EmployeeRegistration';
import OAuthCallback from './pages/OAuthCallback';
import Analytics from './pages/Analytics';
import AttendanceReport from './pages/AttendanceReport';
import AttendanceMonthly from './pages/AttendanceMonthly';
import HelpDesk from './pages/HelpDesk';
import AssetManagementPortal from './pages/AssetManagement/AssetManagementPortal';
import CalendarPage from './pages/CalendarPage';
import AssetRequest from './pages/AssetRequest';
import AccountsPortal from './pages/Accounts/AccountsPortal';
import ManagementPortal from './pages/Management/ManagementPortal';
import AttendancePortal from './pages/AttendancePortal';
import EmployeePortal from './pages/EmployeePortal';
import AdminPortal from './pages/AdminPortal';
import Inbox from './pages/Inbox';
import TimesheetComplianceDashboard from './pages/TimesheetComplianceDashboard';
import AdminStorageServer from './pages/AdminStorageServer';

import AdminLayout from './components/layouts/AdminLayout';

import ManagerLayout from './components/layouts/ManagerLayout';
import EmployeeLayout from './components/layouts/EmployeeLayout';

// Sub-pages for portals
import Employees from './pages/Employees';
import Clients from './pages/Clients';
import Projects from './pages/Projects';
import Jobs from './pages/Jobs';
import EditEmployee from './pages/EditEmployee';
import Profile from './pages/Profile';
import LeaveManagement from './pages/LeaveManagement';
import Reimbursement from './pages/Reimbursement';
import Reports from './pages/Reports';
import Attendance from './pages/Attendance';
import AttendanceLogs from './pages/AttendanceLogs';
import Admin from './pages/Admin';
import Masters from './pages/Masters';
import UserAccessControl from './pages/UserAccessControl';
import OrganizationHierarchy from './pages/OrganizationHierarchy';
import EmailConfiguration from './pages/EmailConfiguration';
import EmailTemplates from './pages/EmailTemplates';
import EsslIntegration from './pages/ITTools/EsslIntegration';
import AssetDashboard from './pages/AssetManagement/AssetDashboard';
import AssetCRUD from './pages/AssetManagement/AssetCRUD';
import AssetAssignment from './pages/AssetManagement/AssetAssignment';
import InventoryTrack from './pages/AssetManagement/InventoryTrack';
import VendorManagement from './pages/AssetManagement/VendorManagement';
import MaintenanceTracker from './pages/AssetManagement/MaintenanceTracker';
import TicketSystem from './pages/AssetManagement/TicketSystem';
import ReportsGenerator from './pages/AssetManagement/ReportsGenerator';
import MastersConfig from './pages/AssetManagement/MastersConfig';
import AccountsDashboard from './pages/Accounts/AccountsDashboard';
import InvoiceManagement from './pages/Accounts/InvoiceManagement';
import ARManagement from './pages/Accounts/ARManagement';
import APManagement from './pages/Accounts/APManagement';
import BankImport from './pages/Accounts/BankImport';
import BankReconciliation from './pages/Accounts/BankReconciliation';
import ReceiptsManagement from './pages/Accounts/ReceiptsManagement';
import PaymentsManagement from './pages/Accounts/PaymentsManagement';
import EmployeeLedger from './pages/Accounts/EmployeeLedger';
import ClientLedger from './pages/Accounts/ClientLedger';
import GSTReports from './pages/Accounts/GSTReports';
import CurrencyManagement from './pages/Accounts/CurrencyManagement';
import ApprovalQueue from './pages/Accounts/ApprovalQueue';
import FinanceReports from './pages/Accounts/FinanceReports';
import AccountsSettings from './pages/Accounts/AccountsSettings';




const GlobalSplash: React.FC = () => {
    return (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-slate-50 dark:bg-[#080F1D] transition-colors duration-300 z-[9999] animate-in fade-in duration-300">
            <div className="flex flex-col items-center gap-6">
                {/* Logo and Progress Ring */}
                <div className="relative flex items-center justify-center w-20 h-20 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-3xl shadow-xl shadow-indigo-500/20">
                    <span className="text-3xl font-black text-white tracking-tighter">A</span>
                    <div className="absolute inset-0 rounded-3xl border-2 border-white/10 border-t-white animate-spin duration-1000" />
                </div>
                
                <div className="text-center">
                    <h1 className="text-lg font-bold text-slate-800 dark:text-white tracking-tight">ASHISH SHAH & ASSOCIATES</h1>
                    <p className="text-[10px] font-extrabold text-indigo-500 dark:text-indigo-400 uppercase tracking-[0.25em] mt-2">Timesheet Portal</p>
                </div>
            </div>
        </div>
    );
};

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { isAuthenticated, loading } = useAuth();

    if (loading) {
        return <GlobalSplash />;
    }

    return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
};

const RoleProtectedRoute: React.FC<{ children: React.ReactNode, allowedRoles: string[] }> = ({ children, allowedRoles }) => {
    const { user, isAuthenticated, loading } = useAuth();

    if (loading) {
        return <GlobalSplash />;
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" />;
    }

    const userRole = user?.role?.toLowerCase() || '';
    const normalizedAllowedRoles = allowedRoles.map(r => r.toLowerCase());

    if (!normalizedAllowedRoles.includes(userRole)) {
        // Redirect to their correct dashboard
        if (userRole === 'admin') return <Navigate to="/admin" />;

        const accountsRoles = ['accounts', 'accounts_admin', 'accounts_manager', 'accounts_executive', 'finance_approver', 'ar_manager', 'ap_manager', 'accountant'];
        if (accountsRoles.includes(userRole)) return <Navigate to="/accounts/dashboard" />;

        if (userRole === 'manager') return <Navigate to="/manager" />;
        if (userRole === 'hr') return <Navigate to="/hr" />;
        if (userRole === 'partner') return <Navigate to="/partner" />;
        return <Navigate to="/employee" />;
    }

    return <>{children}</>;
};

const DashboardRedirect: React.FC = () => {
    const { user, isAuthenticated, loading } = useAuth();

    if (loading) {
        return <GlobalSplash />;
    }

    if (!isAuthenticated || !user) {
        return <Navigate to="/login" replace />;
    }

    const userRole = user.role?.toLowerCase() || '';
    if (userRole === 'admin') return <Navigate to="/admin" replace />;
    if (userRole === 'hr') return <Navigate to="/hr" replace />;
    if (userRole === 'it') return <Navigate to="/admin" replace />;

    const accountsRoles = ['accounts', 'accounts_admin', 'accounts_manager', 'accounts_executive', 'finance_approver', 'ar_manager', 'ap_manager', 'accountant'];
    if (accountsRoles.includes(userRole)) return <Navigate to="/accounts/dashboard" replace />;

    if (userRole === 'manager') return <Navigate to="/manager" replace />;
    if (userRole === 'partner') return <Navigate to="/partner" replace />;

    return <Navigate to="/employee" replace />;
};

// Helper components for Management Portal Route Permissions
const ManagementEmployeesEdit: React.FC = () => {
    const { user } = useAuth();
    const userRole = user?.role?.toLowerCase();
    const isEmployee = userRole === 'user' || userRole === 'employee';
    return !isEmployee ? (
        <ProtectedRoute moduleName="employees">
            <EditEmployee />
        </ProtectedRoute>
    ) : (
        <Navigate to="/management/projects" replace />
    );
};

const ManagementClients: React.FC = () => {
    const { user } = useAuth();
    const userRole = user?.role?.toLowerCase();
    const isEmployee = userRole === 'user' || userRole === 'employee';
    return !isEmployee ? (
        <Clients />
    ) : (
        <Navigate to="/management/projects" replace />
    );
};

const ManagementRedirect: React.FC = () => {
    const { user } = useAuth();
    const userRole = user?.role?.toLowerCase();
    const isEmployee = userRole === 'user' || userRole === 'employee';
    return <Navigate to={isEmployee ? "/management/projects" : "/management/employees"} replace />;
};

// Helper component for Employee Portal Reports Permission
const EmployeePortalReports: React.FC = () => {
    const { user } = useAuth();
    const { hasPermission } = usePermissions();
    const userRole = user?.role?.toUpperCase() || '';
    const canViewReports = ['ADMIN', 'OWNER', 'HR', 'IT', 'MANAGER', 'PARTNER'].includes(userRole) || hasPermission('reports', 'canView');
    return canViewReports ? <Reports /> : <Navigate to="/portal/profile" replace />;
};

// Helper component for Attendance Portal Logs Permission
const AttendancePortalLogs: React.FC = () => {
    const { user } = useAuth();
    const userRole = user?.role?.toLowerCase();
    const isManagement = ['manager', 'admin', 'partner', 'owner', 'hr'].includes(userRole || '');
    return isManagement ? <AttendanceLogs /> : <Navigate to="/attendance/dashboard" replace />;
};

// Helper components for Admin Portal Route Permissions
const AdminPortalDashboard: React.FC = () => {
    const { user } = useAuth();
    const { hasPermission } = usePermissions();
    const userRole = user?.role?.toLowerCase();
    const isAllowed = userRole === 'admin' || userRole === 'it' || hasPermission('admin_panel', 'canView');
    return isAllowed ? <Admin /> : <Navigate to="/dashboard" replace />;
};

const AdminPortalMasters: React.FC = () => {
    const { user } = useAuth();
    const { hasPermission } = usePermissions();
    const userRole = user?.role?.toLowerCase();
    const isAllowed = userRole === 'admin' || userRole === 'it' || hasPermission('admin_panel', 'canView');
    return isAllowed ? <Masters /> : <Navigate to="/dashboard" replace />;
};

const AdminPortalUsers: React.FC = () => {
    const { user } = useAuth();
    const { hasPermission } = usePermissions();
    const userRole = user?.role?.toLowerCase();
    const isAllowed = userRole === 'admin' || userRole === 'it' || hasPermission('admin_panel', 'canView');
    return isAllowed ? <UserAccessControl /> : <Navigate to="/dashboard" replace />;
};

const AdminPortalHierarchy: React.FC = () => {
    const { user } = useAuth();
    const { hasPermission } = usePermissions();
    const userRole = user?.role?.toLowerCase();
    const isAllowed = userRole === 'admin' || userRole === 'it' || userRole === 'hr' || hasPermission('employees', 'canView');
    return isAllowed ? <OrganizationHierarchy /> : <Navigate to="/dashboard" replace />;
};

const AdminPortalEmailConfig: React.FC = () => {
    const { user } = useAuth();
    const { hasPermission } = usePermissions();
    const userRole = user?.role?.toLowerCase();
    const isAllowed = userRole === 'admin' || userRole === 'it' || hasPermission('email_templates', 'canView');
    return isAllowed ? <EmailConfiguration /> : <Navigate to="/dashboard" replace />;
};

const AdminPortalEmailTemplates: React.FC = () => {
    const { user } = useAuth();
    const { hasPermission } = usePermissions();
    const userRole = user?.role?.toLowerCase();
    const isAllowed = userRole === 'admin' || userRole === 'it' || hasPermission('email_templates', 'canView');
    return isAllowed ? <EmailTemplates /> : <Navigate to="/dashboard" replace />;
};

const AdminPortalEssl: React.FC = () => {
    const { user } = useAuth();
    const { hasPermission } = usePermissions();
    const userRole = user?.role?.toLowerCase();
    const isAllowed = userRole === 'admin' || userRole === 'it' || hasPermission('admin_panel', 'canView');
    return isAllowed ? <EsslIntegration /> : <Navigate to="/dashboard" replace />;
};

const AdminPortalSystem: React.FC = () => {
    const { user } = useAuth();
    const { hasPermission } = usePermissions();
    const userRole = user?.role?.toLowerCase();
    const isAllowed = userRole === 'admin' || userRole === 'it' || hasPermission('admin_panel', 'canView');
    return isAllowed ? <AdminStorageServer /> : <Navigate to="/dashboard" replace />;
};

const AdminPortalRedirect: React.FC = () => {
    const { user } = useAuth();
    const { hasPermission } = usePermissions();
    const userRole = user?.role?.toLowerCase() || '';
    const isAdmin = userRole === 'admin';
    const isIT = userRole === 'it';
    const isHR = userRole === 'hr';
    
    const categories = [
        { path: '/admin-portal/dashboard', show: isAdmin || isIT || hasPermission('admin_panel', 'canView') },
        { path: '/admin-portal/masters', show: isAdmin || isIT || hasPermission('admin_panel', 'canView') },
        { path: '/admin-portal/users', show: isAdmin || isIT || hasPermission('admin_panel', 'canView') },
        { path: '/admin-portal/hierarchy', show: isAdmin || isIT || isHR || hasPermission('employees', 'canView') },
        { path: '/admin-portal/email-config', show: isAdmin || isIT || hasPermission('email_templates', 'canView') },
        { path: '/admin-portal/email-templates', show: isAdmin || isIT || hasPermission('email_templates', 'canView') },
        { path: '/admin-portal/essl', show: isAdmin || isIT || hasPermission('admin_panel', 'canView') },
        { path: '/admin-portal/system', show: isAdmin || isIT || hasPermission('admin_panel', 'canView') }
    ];
    const visible = categories.filter(c => c.show);
    const defaultPath = visible[0]?.path || '/dashboard';
    return <Navigate to={defaultPath} replace />;
};

const App: React.FC = () => {
    const [isMaintenance, setIsMaintenance] = useState(false);

    useEffect(() => {
        const handleMaintenance = () => {
            setIsMaintenance(true);
        };

        window.addEventListener('server-under-maintenance', handleMaintenance);
        return () => {
            window.removeEventListener('server-under-maintenance', handleMaintenance);
        };
    }, []);

    const handleCheckConnection = async (): Promise<boolean> => {
        try {
            const baseUrl = import.meta.env.VITE_API_URL || '';
            // We can ping the health check API endpoint
            let response = await axios.get('/api/health', { timeout: 5000 });
            if (response.status === 200) {
                setIsMaintenance(false);
                return true;
            }
            // Fallback for custom or direct VITE_API_URL
            if (baseUrl) {
                const absoluteHealthUrl = `${baseUrl.replace(/\/$/, '')}/health`;
                response = await axios.get(absoluteHealthUrl, { timeout: 5000 });
                if (response.status === 200) {
                    setIsMaintenance(false);
                    return true;
                }
            }
            return false;
        } catch (err) {
            try {
                // Secondary check to root health
                const responseRoot = await axios.get('/health', { timeout: 5000 });
                if (responseRoot.status === 200) {
                    setIsMaintenance(false);
                    return true;
                }
                return false;
            } catch (e) {
                return false;
            }
        }
    };

    if (isMaintenance) {
        return (
            <ThemeProvider>
                <Maintenance onRetry={handleCheckConnection} />
            </ThemeProvider>
        );
    }

    return (
        <ThemeProvider>
            <ToastProvider>
                <ConfirmProvider>
                    <AuthProvider>
                        <NotificationProvider>
                            <LoadingProvider>
                            <PermissionsProvider>
                                <Router>
                                    <Routes>
                                        {/* Default Route - Redirect to login */}
                                        <Route path="/" element={<Navigate to="/login" replace />} />

                                        {/* Public Routes */}
                                        <Route path="/login" element={<SimpleLogin />} />

                                        <Route path="/signup" element={<ResponsiveAuthLayout mode="signup" />} />
                                        <Route path="/forgot-password" element={<ForgotPassword />} />
                                        <Route path="/reset-password" element={<ResetPassword />} />
                                        <Route path="/register" element={<UserRegistration />} />
                                        <Route path="/complete-registration" element={<EmployeeRegistration />} />
                                        <Route path="/oauth-callback" element={<OAuthCallback />} />

                                        {/* Dashboard Routes - Use FrozenLayout for consistency */}
                                        <Route path="/admin/*" element={
                                            <PrivateRoute>
                                                <RoleProtectedRoute allowedRoles={['admin', 'it']}>
                                                    <AdminLayout />
                                                </RoleProtectedRoute>
                                            </PrivateRoute>
                                        }>
                                            <Route index element={<ErrorBoundary><AdminDashboard /></ErrorBoundary>} />
                                        </Route>



                                        <Route path="/hr" element={
                                            <PrivateRoute>
                                                <RoleProtectedRoute allowedRoles={['hr']}>
                                                    <FrozenLayout>
                                                        <ErrorBoundary><HRDashboard /></ErrorBoundary>
                                                    </FrozenLayout>
                                                </RoleProtectedRoute>
                                            </PrivateRoute>
                                        } />

                                        <Route path="/manager/*" element={
                                            <PrivateRoute>
                                                <RoleProtectedRoute allowedRoles={['manager']}>
                                                    <ManagerLayout />
                                                </RoleProtectedRoute>
                                            </PrivateRoute>
                                        }>
                                            <Route index element={<ErrorBoundary><ManagerDashboard /></ErrorBoundary>} />
                                        </Route>

                                        <Route path="/partner" element={
                                            <PrivateRoute>
                                                <RoleProtectedRoute allowedRoles={['partner']}>
                                                    <FrozenLayout>
                                                        <ErrorBoundary><PartnerDashboard /></ErrorBoundary>
                                                    </FrozenLayout>
                                                </RoleProtectedRoute>
                                            </PrivateRoute>
                                        } />

                                        <Route path="/employee/*" element={
                                            <PrivateRoute>
                                                <RoleProtectedRoute allowedRoles={['employee', 'user', 'accounts', 'accounts_admin', 'accounts_manager', 'accounts_executive', 'finance_approver', 'ar_manager', 'ap_manager', 'accountant']}>
                                                    <EmployeeLayout />
                                                </RoleProtectedRoute>
                                            </PrivateRoute>
                                        }>
                                            <Route index element={<ErrorBoundary><EmployeeDashboard /></ErrorBoundary>} />
                                        </Route>

                                        {/* Protected Routes with Frozen Layout */}
                                        <Route path="/timesheet/*" element={
                                            <PrivateRoute>
                                                <FrozenLayout>
                                                    <ErrorBoundary>
                                                        <Timesheet />
                                                    </ErrorBoundary>
                                                </FrozenLayout>
                                            </PrivateRoute>
                                        } />
                                        {/* Management Portal */}
                                        <Route path="/management/*" element={
                                            <PrivateRoute>
                                                <FrozenLayout>
                                                    <ErrorBoundary>
                                                        <ManagementPortal />
                                                    </ErrorBoundary>
                                                </FrozenLayout>
                                            </PrivateRoute>
                                        }>
                                            <Route index element={<ManagementRedirect />} />
                                            <Route path="employees" element={
                                                <ProtectedRoute moduleName="employees">
                                                    <Employees />
                                                </ProtectedRoute>
                                            } />
                                            <Route path="employees/edit/:id" element={<ManagementEmployeesEdit />} />
                                            <Route path="clients" element={<ManagementClients />} />
                                            <Route path="projects" element={
                                                <ProtectedRoute moduleName="projects">
                                                    <Projects />
                                                </ProtectedRoute>
                                            } />
                                            <Route path="jobs" element={<Jobs />} />
                                            <Route path="*" element={<ManagementRedirect />} />
                                        </Route>

                                        {/* Attendance Portal */}
                                        <Route path="/attendance/*" element={
                                            <PrivateRoute>
                                                <FrozenLayout>
                                                    <ErrorBoundary>
                                                        <AttendancePortal />
                                                    </ErrorBoundary>
                                                </FrozenLayout>
                                            </PrivateRoute>
                                        }>
                                            <Route index element={<Navigate to="dashboard" replace />} />
                                            <Route path="dashboard" element={<Attendance />} />
                                            <Route path="logs" element={<AttendancePortalLogs />} />
                                            <Route path="*" element={<Navigate to="dashboard" replace />} />
                                        </Route>

                                        {/* Employee Portal */}
                                        <Route path="/portal/*" element={
                                            <PrivateRoute>
                                                <FrozenLayout>
                                                    <ErrorBoundary>
                                                        <EmployeePortal />
                                                    </ErrorBoundary>
                                                </FrozenLayout>
                                            </PrivateRoute>
                                        }>
                                            <Route index element={<Navigate to="profile" replace />} />
                                            <Route path="profile" element={<Profile />} />
                                            <Route path="leaves" element={<LeaveManagement />} />
                                            <Route path="reimbursements" element={<Reimbursement />} />
                                            <Route path="reports" element={<EmployeePortalReports />} />
                                            <Route path="*" element={<Navigate to="profile" replace />} />
                                        </Route>

                                        {/* Admin Portal */}
                                        <Route path="/admin-portal/*" element={
                                            <PrivateRoute>
                                                <RoleProtectedRoute allowedRoles={['admin', 'it', 'hr', 'manager', 'partner']}>
                                                    <FrozenLayout>
                                                        <ErrorBoundary>
                                                            <AdminPortal />
                                                        </ErrorBoundary>
                                                    </FrozenLayout>
                                                </RoleProtectedRoute>
                                            </PrivateRoute>
                                        }>
                                            <Route index element={<AdminPortalRedirect />} />
                                            <Route path="dashboard" element={<AdminPortalDashboard />} />
                                            <Route path="masters/:tab?" element={<AdminPortalMasters />} />
                                            <Route path="categories" element={
                                                <RoleProtectedRoute allowedRoles={['admin']}>
                                                    <Navigate to="/admin-portal/masters/helpdesk-categories" replace />
                                                </RoleProtectedRoute>
                                            } />
                                            <Route path="users" element={<AdminPortalUsers />} />
                                            <Route path="hierarchy" element={<AdminPortalHierarchy />} />
                                            <Route path="email-config" element={<AdminPortalEmailConfig />} />
                                            <Route path="email-templates" element={<AdminPortalEmailTemplates />} />
                                            <Route path="essl" element={<AdminPortalEssl />} />
                                            <Route path="system" element={<AdminPortalSystem />} />
                                            <Route path="*" element={<AdminPortalRedirect />} />
                                        </Route>

                                        {/* Management Portal Backward Compatibility Redirects */}
                                        <Route path="/employees" element={<Navigate to="/management/employees" replace />} />
                                        <Route path="/clients" element={<Navigate to="/management/clients" replace />} />
                                        <Route path="/projects" element={<Navigate to="/management/projects" replace />} />
                                        <Route path="/jobs" element={<Navigate to="/management/jobs" replace />} />
                                        <Route path="/employees/edit/:id" element={<Navigate to="/management/employees/edit/:id" replace />} />

                                        {/* Accounts & Finance Suite */}
                                        <Route path="/accounts/*" element={
                                            <PrivateRoute>
                                                <ProtectedRoute moduleName="accounts">
                                                    <RoleProtectedRoute allowedRoles={['admin', 'hr', 'accounts', 'accounts_admin', 'accounts_manager', 'accounts_executive', 'finance_approver', 'ar_manager', 'ap_manager', 'accountant']}>
                                                        <FrozenLayout>
                                                            <ErrorBoundary>
                                                                <AccountsPortal />
                                                            </ErrorBoundary>
                                                        </FrozenLayout>
                                                    </RoleProtectedRoute>
                                                </ProtectedRoute>
                                            </PrivateRoute>
                                        }>
                                            <Route index element={<Navigate to="dashboard" replace />} />
                                            <Route path="dashboard" element={<AccountsDashboard />} />
                                            <Route path="invoices" element={<InvoiceManagement />} />
                                            <Route path="ar-management" element={<ARManagement />} />
                                            <Route path="ap-management" element={<APManagement />} />
                                            <Route path="bank-import" element={<BankImport />} />
                                            <Route path="bank-reconciliation" element={<BankReconciliation />} />
                                            <Route path="receipts" element={<ReceiptsManagement />} />
                                            <Route path="payments" element={<PaymentsManagement />} />
                                            <Route path="employee-ledger" element={<EmployeeLedger />} />
                                            <Route path="client-ledger" element={<ClientLedger />} />
                                            <Route path="gst-reports" element={<GSTReports />} />
                                            <Route path="currency-management" element={<CurrencyManagement />} />
                                            <Route path="approval-queue" element={<ApprovalQueue />} />
                                            <Route path="finance-reports" element={<FinanceReports />} />
                                            <Route path="settings" element={<AccountsSettings />} />
                                            <Route path="*" element={<Navigate to="dashboard" replace />} />
                                        </Route>

                                        {/* Help Desk */}
                                        <Route path="/help-desk/*" element={
                                            <PrivateRoute>
                                                <ProtectedRoute moduleName="help_desk">
                                                    <FrozenLayout>
                                                        <ErrorBoundary>
                                                            <HelpDesk />
                                                        </ErrorBoundary>
                                                    </FrozenLayout>
                                                </ProtectedRoute>
                                            </PrivateRoute>
                                        } />

                                        {/* Inbox */}
                                        <Route path="/inbox" element={
                                            <PrivateRoute>
                                                <ProtectedRoute moduleName="inbox">
                                                    <FrozenLayout>
                                                        <ErrorBoundary>
                                                            <Inbox />
                                                        </ErrorBoundary>
                                                    </FrozenLayout>
                                                </ProtectedRoute>
                                            </PrivateRoute>
                                        } />

                                        {/* Timesheet Compliance */}
                                        <Route path="/compliance" element={
                                            <PrivateRoute>
                                                <ProtectedRoute moduleName="compliance">
                                                    <FrozenLayout>
                                                        <ErrorBoundary>
                                                            <TimesheetComplianceDashboard />
                                                        </ErrorBoundary>
                                                    </FrozenLayout>
                                                </ProtectedRoute>
                                            </PrivateRoute>
                                        } />

                                        {/* Backward Compatibility Redirects */}
                                        <Route path="/profile" element={<Navigate to="/portal/profile" replace />} />
                                        <Route path="/leave-management" element={<Navigate to="/portal/leaves" replace />} />
                                        <Route path="/reimbursement" element={<Navigate to="/portal/reimbursements" replace />} />
                                        <Route path="/reports" element={<Navigate to="/portal/reports" replace />} />
                                        <Route path="/admin-panel" element={<Navigate to="/admin-portal/dashboard" replace />} />
                                        <Route path="/admin/masters" element={<Navigate to="/admin-portal/masters" replace />} />
                                        <Route path="/admin/helpdesk/categories" element={<Navigate to="/admin-portal/masters/helpdesk-categories" replace />} />
                                        <Route path="/admin/user-access" element={<Navigate to="/admin-portal/users" replace />} />
                                        <Route path="/admin/OrganizationHierarchy" element={<Navigate to="/admin-portal/hierarchy" replace />} />
                                        <Route path="/email-configuration" element={<Navigate to="/admin-portal/email-config" replace />} />
                                        <Route path="/email-templates" element={<Navigate to="/admin-portal/email-templates" replace />} />
                                        <Route path="/attendance/report/:employeeId/:date" element={
                                            <PrivateRoute>
                                                <RoleProtectedRoute allowedRoles={['admin', 'hr', 'it']}>
                                                    <FrozenLayout>
                                                        <ErrorBoundary>
                                                            <AttendanceReport />
                                                        </ErrorBoundary>
                                                    </FrozenLayout>
                                                </RoleProtectedRoute>
                                            </PrivateRoute>
                                        } />
                                        <Route path="/attendance/monthly/:employeeId" element={
                                            <PrivateRoute>
                                                <FrozenLayout>
                                                    <ErrorBoundary>
                                                        <AttendanceMonthly />
                                                    </ErrorBoundary>
                                                </FrozenLayout>
                                            </PrivateRoute>
                                        } />
                                        <Route path="/analytics" element={
                                            <PrivateRoute>
                                                <FrozenLayout>
                                                    <ErrorBoundary>
                                                        <Analytics />
                                                    </ErrorBoundary>
                                                </FrozenLayout>
                                            </PrivateRoute>
                                        } />
                                        <Route path="/employee/asset-requests" element={
                                            <PrivateRoute>
                                                <FrozenLayout>
                                                    <ErrorBoundary>
                                                        <AssetRequest />
                                                    </ErrorBoundary>
                                                </FrozenLayout>
                                            </PrivateRoute>
                                        } />
                                        <Route path="/admin/asset-management/*" element={
                                            <PrivateRoute>
                                                <ProtectedRoute moduleName="asset_management">
                                                    <FrozenLayout>
                                                        <ErrorBoundary>
                                                            <AssetManagementPortal />
                                                        </ErrorBoundary>
                                                    </FrozenLayout>
                                                </ProtectedRoute>
                                            </PrivateRoute>
                                        }>
                                            <Route index element={<Navigate to="dashboard" replace />} />
                                            <Route path="dashboard" element={<AssetDashboard />} />
                                            <Route path="assets" element={<AssetCRUD />} />
                                            <Route path="assignment" element={<AssetAssignment />} />
                                            <Route path="inventory" element={<InventoryTrack />} />
                                            <Route path="vendors" element={<VendorManagement />} />
                                            <Route path="maintenance" element={<MaintenanceTracker />} />
                                            <Route path="tickets" element={<TicketSystem />} />
                                            <Route path="reports" element={<ReportsGenerator />} />
                                            <Route path="masters" element={<MastersConfig />} />
                                            <Route path="*" element={<Navigate to="dashboard" replace />} />
                                        </Route>
                                        <Route path="/calendar" element={
                                            <PrivateRoute>
                                                <ProtectedRoute moduleName="calendar">
                                                    <FrozenLayout>
                                                        <ErrorBoundary>
                                                            <CalendarPage />
                                                        </ErrorBoundary>
                                                    </FrozenLayout>
                                                </ProtectedRoute>
                                            </PrivateRoute>
                                        } />



                                        {/* Dashboard Redirect */}
                                        <Route path="/dashboard" element={
                                            <PrivateRoute>
                                                <DashboardRedirect />
                                            </PrivateRoute>
                                        } />

                                        {/* Path Aliases */}
                                        <Route path="/corporate-calendar" element={<Navigate to="/calendar" replace />} />
                                        <Route path="/helpdesk" element={<Navigate to="/help-desk" replace />} />
                                        <Route path="/leave" element={<Navigate to="/portal/leaves" replace />} />
                                        <Route path="/reimbursements" element={<Navigate to="/portal/reimbursements" replace />} />

                                        {/* Catch-all route */}
                                        <Route path="*" element={<Navigate to="/login" replace />} />
                                    </Routes>
                                </Router>
                            </PermissionsProvider>
                        </LoadingProvider>
                    </NotificationProvider>
                </AuthProvider>
                </ConfirmProvider>
            </ToastProvider>
        </ThemeProvider>
    );
};

export default App;
