import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma";

export const checkPermission = (moduleName: string, permission: 'canView' | 'canCreate' | 'canEdit' | 'canDelete') => {
  return async (req: any, res: Response, next: NextFunction) => {
    try {
      // Admin role bypasses permission checks
      if (req.user.role === 'admin') {
        return next();
      }

      const userId = req.user.id;

      // Get user's permission record (without select to get all fields dynamically)
      const userPermission = await prisma.userPermission.findUnique({
        where: { userId }
      });

      // If no permission record exists, deny access
      if (!userPermission) {
        return res.status(403).json({
          success: false,
          message: "Access denied: No permissions configured for this module"
        });
      }

      // Map module name and permission to field name
      const fieldName = getFieldNameForModuleAndPermission(moduleName, permission);
      if (!fieldName) {
        return res.status(403).json({
          success: false,
          message: "Access denied: Invalid module"
        });
      }

      // Check the specific permission
      const hasAccess = userPermission[fieldName as keyof typeof userPermission];
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: `Access denied: You don't have permission to access this module`
        });
      }

      // Permission granted
      next();
    } catch (error) {
      console.error("Permission check error:", error);
      return res.status(500).json({
        success: false,
        message: "Error checking permissions"
      });
    }
  };
};

// Helper function to map module names and permissions to field names
const getFieldNameForModuleAndPermission = (
  moduleName: string,
  permission: 'canView' | 'canCreate' | 'canEdit' | 'canDelete'
): string | null => {
  const moduleFieldMap: { [key: string]: { canView: string; canCreate: string; canEdit: string; canDelete: string } } = {
    'dashboard': { canView: 'dashboardView', canCreate: 'dashboardCreate', canEdit: 'dashboardEdit', canDelete: 'dashboardDelete' },
    'timesheet': { canView: 'timesheetView', canCreate: 'timesheetCreate', canEdit: 'timesheetEdit', canDelete: 'timesheetDelete' },
    'projects': { canView: 'projectsView', canCreate: 'projectsCreate', canEdit: 'projectsEdit', canDelete: 'projectsDelete' },
    'reports': { canView: 'reportsView', canCreate: 'reportsCreate', canEdit: 'reportsEdit', canDelete: 'reportsDelete' },
    'admin_panel': { canView: 'adminPanelView', canCreate: 'adminPanelCreate', canEdit: 'adminPanelEdit', canDelete: 'adminPanelDelete' },
    'email_templates': { canView: 'emailTemplatesView', canCreate: 'emailTemplatesCreate', canEdit: 'emailTemplatesEdit', canDelete: 'emailTemplatesDelete' },
    'inbox': { canView: 'inboxView', canCreate: 'inboxCreate', canEdit: 'inboxEdit', canDelete: 'inboxDelete' },
    'calendar': { canView: 'calendarView', canCreate: 'calendarCreate', canEdit: 'calendarEdit', canDelete: 'calendarDelete' },
    'compliance': { canView: 'complianceView', canCreate: 'complianceCreate', canEdit: 'complianceEdit', canDelete: 'complianceDelete' },
    'help_desk': { canView: 'helpDeskView', canCreate: 'helpDeskCreate', canEdit: 'helpDeskEdit', canDelete: 'helpDeskDelete' },
    'asset_management': { canView: 'assetManagementView', canCreate: 'assetManagementCreate', canEdit: 'assetManagementEdit', canDelete: 'assetManagementDelete' },
    'accounts': { canView: 'accountsView', canCreate: 'accountsCreate', canEdit: 'accountsEdit', canDelete: 'accountsDelete' }
  };
  
  const mapping = moduleFieldMap[moduleName];
  if (!mapping) return null;
  return mapping[permission];
};

// Helper function to check if user has any access to a module
export const hasModuleAccess = (moduleName: string) => {
  return async (req: any, res: Response, next: NextFunction) => {
    try {
      // Admin role bypasses permission checks
      if (req.user.role === 'admin') {
        return next();
      }

      const userId = req.user.id;

      // Get user's permission record
      const userPermission = await prisma.userPermission.findUnique({
        where: { userId }
      });

      // If no permission record exists, deny access
      if (!userPermission) {
        return res.status(403).json({
          success: false,
          message: "Access denied: No permissions configured for this module"
        });
      }

      // Map module name to field name (using view permission as base access)
      const fieldName = getFieldNameForModuleAndPermission(moduleName, 'canView');
      if (!fieldName) {
        return res.status(403).json({
          success: false,
          message: "Access denied: Invalid module"
        });
      }

      // Check if user has access to the module
      const hasAccess = userPermission[fieldName as keyof typeof userPermission];
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied: You don't have any permissions for this module"
        });
      }

      // Permission granted
      next();
    } catch (error) {
      console.error("Module access check error:", error);
      return res.status(500).json({
        success: false,
        message: "Error checking module access"
      });
    }
  };
};
