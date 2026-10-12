import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import API from '../api';
import { useAuth } from './AuthContext';

interface Permission {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

interface Permissions {
  [moduleName: string]: Permission;
}

interface PermissionsContextType {
  permissions: Permissions;
  loading: boolean;
  hasPermission: (moduleName: string, permissionType: keyof Permission) => boolean;
  hasAnyPermission: (moduleName: string) => boolean;
  refreshPermissions: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

interface PermissionsProviderProps {
  children: ReactNode;
}

export const PermissionsProvider: React.FC<PermissionsProviderProps> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [permissions, setPermissions] = useState<Permissions>({});
  const [loading, setLoading] = useState(false);

  const fetchPermissions = async () => {
    try {
      setLoading(true);
      const response = await API.get('/admin/my-permissions');
      console.log('🔐 Permissions fetched:', response.data.permissions);
      if (response.data.success) {
        setPermissions(response.data.permissions);
      } else {
        console.error('Failed to fetch permissions:', response.data);
        // Set empty permissions on error
        setPermissions({});
      }
    } catch (error: unknown) {
      console.warn('⚠️ Could not fetch permissions (Server may be down):', error instanceof Error ? error.message : String(error));
      // Set empty permissions on error - allows app to continue with restricted access
      setPermissions({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('🔄 Permissions check - Authenticated:', isAuthenticated, 'User role:', user?.role);
    if (isAuthenticated && user) {
      fetchPermissions();
    } else {
      setPermissions({});
      setLoading(false);
    }
  }, [isAuthenticated, user]);

  const normalizeModuleName = (name: string): string => {
    if (name === 'admin_panel') return 'adminPanel';
    if (name === 'email_templates') return 'emailTemplates';
    if (name === 'leave_management') return 'leaveManagement';
    return name;
  };

  const hasPermission = (moduleName: string, permissionType: keyof Permission): boolean => {
    const userRole = user?.role?.toLowerCase() || '';

    // Admin override
    if (userRole === 'admin' || userRole === 'owner' || userRole === 'it') {
      return true;
    }

    // Accounts override (view only for employees, projects, clients)
    const accountsRoles = ['accounts', 'accounts_admin', 'accounts_manager', 'accounts_executive', 'finance_approver', 'ar_manager', 'ap_manager', 'accountant'];
    if (accountsRoles.includes(userRole)) {
      if (['employees', 'projects', 'clients'].includes(moduleName)) {
        return permissionType === 'canView';
      }
    }
    
    const normModule = normalizeModuleName(moduleName);
    const hasPerm = permissions[normModule]?.[permissionType] || false;
    // console.log(`🔍 Checking permission: ${moduleName} (${normModule}).${permissionType} = ${hasPerm}`);
    return hasPerm;
  };

  const hasAnyPermission = (moduleName: string): boolean => {
    const userRole = user?.role?.toLowerCase() || '';

    // Admin override
    if (userRole === 'admin' || userRole === 'owner' || userRole === 'it') {
      return true;
    }

    // Accounts override (view only for employees, projects, clients)
    const accountsRoles = ['accounts', 'accounts_admin', 'accounts_manager', 'accounts_executive', 'finance_approver', 'ar_manager', 'ap_manager', 'accountant'];
    if (accountsRoles.includes(userRole)) {
      if (['employees', 'projects', 'clients'].includes(moduleName)) {
        return true;
      }
    }

    const normModule = normalizeModuleName(moduleName);
    const modulePermissions = permissions[normModule];
    if (!modulePermissions) return false;
    
    return modulePermissions.canView || 
           modulePermissions.canCreate || 
           modulePermissions.canEdit || 
           modulePermissions.canDelete;
  };

  const refreshPermissions = async () => {
    await fetchPermissions();
  };

  const value: PermissionsContextType = {
    permissions,
    loading,
    hasPermission,
    hasAnyPermission,
    refreshPermissions
  };

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
};

// Named export for hook — kept in same file intentionally (small context file)
// eslint-disable-next-line react-refresh/only-export-components
export const usePermissions = (): PermissionsContextType => {
  const context = useContext(PermissionsContext);
  if (context === undefined) {
    throw new Error('usePermissions must be used within a PermissionsProvider');
  }
  return context;
};
