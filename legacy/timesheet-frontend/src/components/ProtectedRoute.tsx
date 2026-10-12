import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../contexts/PermissionsContext';
import AccessDenied from './AccessDenied';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string | string[];
  moduleName?: string;
  permissionType?: 'canView' | 'canCreate' | 'canEdit' | 'canDelete';
  requireAnyPermission?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requiredRole,
  moduleName,
  permissionType = 'canView',
  requireAnyPermission = false 
}) => {
  const { isAuthenticated, user } = useAuth();
  const { hasPermission, hasAnyPermission, loading } = usePermissions();
  const location = useLocation();

  // Show loading spinner while permissions are being fetched (only if moduleName is specified)
  if (moduleName && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect to login if not authenticated
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Role-based bypasses for permission checks
  const userRole = user?.role?.toLowerCase();
  
  if (userRole === 'admin') {
    return <>{children}</>;
  }

  // HR has access to employees, reports, attendance, leave management, and asset management
  if (userRole === 'hr' && moduleName && ['employees', 'reports', 'attendance', 'leaveManagement', 'leave_management', 'dashboard', 'assetManagement', 'asset_management'].includes(moduleName)) {
    return <>{children}</>;
  }

  // Accountant has access to reports and attendance
  if (userRole === 'accountant' && moduleName && ['reports', 'attendance', 'dashboard'].includes(moduleName)) {
    return <>{children}</>;
  }

  // Accounts has access to employees, clients, projects, reports, dashboard, timesheets, reimbursements, leaveManagement, and attendance
  const accountsRoles = ['accounts', 'accounts_admin', 'accounts_manager', 'accounts_executive', 'finance_approver', 'ar_manager', 'ap_manager', 'accountant'];
  if (accountsRoles.includes(userRole || '') && moduleName) {
    if (['employees', 'clients', 'projects'].includes(moduleName)) {
      if (permissionType === 'canView') {
        return <>{children}</>;
      }
    } else if (['reports', 'dashboard', 'timesheets', 'reimbursements', 'leaveManagement', 'leave_management', 'attendance'].includes(moduleName)) {
      return <>{children}</>;
    }
  }

  // IT has access to help-desk, employees, projects, admin-panel, and asset management
  if (userRole === 'it' && moduleName && ['employees', 'projects', 'helpDesk', 'help_desk', 'adminPanel', 'admin_panel', 'dashboard', 'assetManagement', 'asset_management'].includes(moduleName)) {
    return <>{children}</>;
  }

  // Employees, Users, Managers, Partners, and Accountants can access the assetManagement and employees modules
  if (['employee', 'user', 'manager', 'partner', 'accountant'].includes(userRole || '') && (moduleName === 'employees' || moduleName === 'assetManagement' || moduleName === 'asset_management')) {
    return <>{children}</>;
  }


  // Check role-based access if requiredRole is specified
  if (requiredRole) {
    const requiredRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    
    if (!user?.role || !requiredRoles.includes(user.role)) {
      return (
        <div className="p-8 text-center bg-red-50 text-red-600 rounded-lg my-8 mx-auto max-w-md shadow-sm border border-red-100">
          <h2 className="text-xl font-bold mb-4">
            Access Denied
          </h2>
          <p className="mb-4">
            You don't have permission to access this page.
          </p>
          <div className="text-sm space-y-1">
            <p>Required roles: <span className="font-bold">{requiredRoles.join(', ')}</span></p>
            <p>Your role: <span className="font-bold">{user?.role || 'Not specified'}</span></p>
          </div>
        </div>
      );
    }

  }

  // Check permission-based access if moduleName is specified
  if (moduleName) {
    if (requireAnyPermission) {
      if (!hasAnyPermission(moduleName)) {
        return <AccessDenied />;
      }
    } else {
      if (!hasPermission(moduleName, permissionType)) {
        return <AccessDenied />;
      }
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;
