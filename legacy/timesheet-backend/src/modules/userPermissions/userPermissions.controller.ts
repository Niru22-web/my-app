import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import { authenticate } from "../../middleware/auth.middleware";

// Get all users for admin
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const users = await prisma.employee.findMany({
      select: {
        id: true,
        employeeId: true,
        firstName: true,
        lastName: true,
        officeEmail: true,
        designation: true,
        department: true,
        role: true,
        status: true
      },
      orderBy: [
        { role: 'asc' },
        { firstName: 'asc' }
      ]
    });

    res.json({
      success: true,
      users
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch users"
    });
  }
};

// Get permissions for a specific user
export const getUserPermissions = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required"
      });
    }

    const permission = await prisma.userPermission.findUnique({
      where: { userId },
      select: {
        dashboardView: true,
        dashboardCreate: true,
        dashboardEdit: true,
        dashboardDelete: true,
        timesheetView: true,
        timesheetCreate: true,
        timesheetEdit: true,
        timesheetDelete: true,
        projectsView: true,
        projectsCreate: true,
        projectsEdit: true,
        projectsDelete: true,
        reportsView: true,
        reportsCreate: true,
        reportsEdit: true,
        reportsDelete: true,
        employeesView: true,
        employeesCreate: true,
        employeesEdit: true,
        employeesDelete: true,
        adminPanelView: true,
        adminPanelCreate: true,
        adminPanelEdit: true,
        adminPanelDelete: true,
        emailTemplatesView: true,
        emailTemplatesCreate: true,
        emailTemplatesEdit: true,
        emailTemplatesDelete: true,
        clientsView: true,
        clientsCreate: true,
        clientsEdit: true,
        clientsDelete: true,
        jobsView: true,
        jobsCreate: true,
        jobsEdit: true,
        jobsDelete: true,
        analyticsView: true,
        reimbursementView: true,
        reimbursementCreate: true,
        reimbursementEdit: true,
        reimbursementDelete: true,
        leaveManagementView: true,
        leaveManagementCreate: true,
        leaveManagementEdit: true,
        leaveManagementDelete: true,
        attendanceView: true,
        attendanceCreate: true,
        attendanceEdit: true,
        attendanceDelete: true,
        inboxView: true,
        inboxCreate: true,
        inboxEdit: true,
        inboxDelete: true,
        calendarView: true,
        calendarCreate: true,
        calendarEdit: true,
        calendarDelete: true,
        complianceView: true,
        complianceCreate: true,
        complianceEdit: true,
        complianceDelete: true,
        helpDeskView: true,
        helpDeskCreate: true,
        helpDeskEdit: true,
        helpDeskDelete: true,
        assetManagementView: true,
        assetManagementCreate: true,
        assetManagementEdit: true,
        assetManagementDelete: true,
        accountsView: true,
        accountsCreate: true,
        accountsEdit: true,
        accountsDelete: true
      }
    });

    // Define all available modules with their field names
    const allModules = [
      { moduleName: 'dashboard', viewField: 'dashboardView', createField: 'dashboardCreate', editField: 'dashboardEdit', deleteField: 'dashboardDelete' },
      { moduleName: 'timesheet', viewField: 'timesheetView', createField: 'timesheetCreate', editField: 'timesheetEdit', deleteField: 'timesheetDelete' },
      { moduleName: 'projects', viewField: 'projectsView', createField: 'projectsCreate', editField: 'projectsEdit', deleteField: 'projectsDelete' },
      { moduleName: 'reports', viewField: 'reportsView', createField: 'reportsCreate', editField: 'reportsEdit', deleteField: 'reportsDelete' },
      { moduleName: 'employees', viewField: 'employeesView', createField: 'employeesCreate', editField: 'employeesEdit', deleteField: 'employeesDelete' },
      { moduleName: 'admin_panel', viewField: 'adminPanelView', createField: 'adminPanelCreate', editField: 'adminPanelEdit', deleteField: 'adminPanelDelete' },
      { moduleName: 'email_templates', viewField: 'emailTemplatesView', createField: 'emailTemplatesCreate', editField: 'emailTemplatesEdit', deleteField: 'emailTemplatesDelete' },
      { moduleName: 'clients', viewField: 'clientsView', createField: 'clientsCreate', editField: 'clientsEdit', deleteField: 'clientsDelete' },
      { moduleName: 'jobs', viewField: 'jobsView', createField: 'jobsCreate', editField: 'jobsEdit', deleteField: 'jobsDelete' },
      { moduleName: 'analytics', viewField: 'analyticsView', createField: 'analyticsView', editField: 'analyticsView', deleteField: 'analyticsView' },
      { moduleName: 'reimbursement', viewField: 'reimbursementView', createField: 'reimbursementCreate', editField: 'reimbursementEdit', deleteField: 'reimbursementDelete' },
      { moduleName: 'leave_management', viewField: 'leaveManagementView', createField: 'leaveManagementCreate', editField: 'leaveManagementEdit', deleteField: 'leaveManagementDelete' },
      { moduleName: 'attendance', viewField: 'attendanceView', createField: 'attendanceCreate', editField: 'attendanceEdit', deleteField: 'attendanceDelete' },
      { moduleName: 'inbox', viewField: 'inboxView', createField: 'inboxCreate', editField: 'inboxEdit', deleteField: 'inboxDelete' },
      { moduleName: 'calendar', viewField: 'calendarView', createField: 'calendarCreate', editField: 'calendarEdit', deleteField: 'calendarDelete' },
      { moduleName: 'compliance', viewField: 'complianceView', createField: 'complianceCreate', editField: 'complianceEdit', deleteField: 'complianceDelete' },
      { moduleName: 'help_desk', viewField: 'helpDeskView', createField: 'helpDeskCreate', editField: 'helpDeskEdit', deleteField: 'helpDeskDelete' },
      { moduleName: 'asset_management', viewField: 'assetManagementView', createField: 'assetManagementCreate', editField: 'assetManagementEdit', deleteField: 'assetManagementDelete' },
      { moduleName: 'accounts', viewField: 'accountsView', createField: 'accountsCreate', editField: 'accountsEdit', deleteField: 'accountsDelete' }
    ];

    // Convert to the expected format
    const modulePermissions = allModules.map(({ moduleName, viewField, createField, editField, deleteField }) => {
      return {
        moduleName,
        canView: permission ? Boolean(permission[viewField as keyof typeof permission]) : false,
        canCreate: permission && createField !== viewField ? Boolean(permission[createField as keyof typeof permission]) : false,
        canEdit: permission && editField !== viewField ? Boolean(permission[editField as keyof typeof permission]) : false,
        canDelete: permission && deleteField !== viewField ? Boolean(permission[deleteField as keyof typeof permission]) : false
      };
    });

    res.json({
      success: true,
      permissions: modulePermissions
    });
  } catch (error) {
    console.error("Error fetching user permissions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user permissions"
    });
  }
};

// Save or update permissions for a user
export const saveUserPermissions = async (req: Request, res: Response) => {
  try {
    const userId = req.body.userId || req.params.userId;
    const { permissions } = req.body;

    if (!userId || !permissions) {
      return res.status(400).json({
        success: false,
        message: "User ID and permissions are required"
      });
    }

    // Prevent a user from modifying their own permissions (AD3)
    if (userId === (req as any).user?.id) {
      return res.status(403).json({
        success: false,
        message: "You cannot modify your own permissions"
      });
    }

    // Verify user exists
    const user = await prisma.employee.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Convert permissions array to the database schema format
    const permissionData: any = {};
    
    permissions.forEach((permission: any) => {
      const fieldMapping = getFieldMappingForModule(permission.moduleName);
      if (fieldMapping) {
        permissionData[fieldMapping.view] = permission.canView || false;
        if (fieldMapping.create && fieldMapping.create !== fieldMapping.view) {
          permissionData[fieldMapping.create] = permission.canCreate || false;
        }
        if (fieldMapping.edit && fieldMapping.edit !== fieldMapping.view) {
          permissionData[fieldMapping.edit] = permission.canEdit || false;
        }
        if (fieldMapping.delete && fieldMapping.delete !== fieldMapping.view) {
          permissionData[fieldMapping.delete] = permission.canDelete || false;
        }
      }
    });

    // Upsert the user permission record
    const result = await prisma.userPermission.upsert({
      where: { userId },
      update: permissionData,
      create: {
        userId,
        ...permissionData
      }
    });

    res.json({
      success: true,
      message: "Permissions updated successfully",
      permission: result
    });
  } catch (error) {
    console.error("Error saving user permissions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save user permissions"
    });
  }
};

// Helper function to map module names to field names
const getFieldMappingForModule = (moduleName: string): { view: string; create: string; edit: string; delete: string } | null => {
  const moduleFieldMap: { [key: string]: { view: string; create: string; edit: string; delete: string } } = {
    'dashboard': {
      view: 'dashboardView',
      create: 'dashboardCreate',
      edit: 'dashboardEdit',
      delete: 'dashboardDelete'
    },
    'timesheet': {
      view: 'timesheetView',
      create: 'timesheetCreate',
      edit: 'timesheetEdit',
      delete: 'timesheetDelete'
    },
    'projects': {
      view: 'projectsView',
      create: 'projectsCreate',
      edit: 'projectsEdit',
      delete: 'projectsDelete'
    },
    'reports': {
      view: 'reportsView',
      create: 'reportsCreate',
      edit: 'reportsEdit',
      delete: 'reportsDelete'
    },
    'employees': {
      view: 'employeesView',
      create: 'employeesCreate',
      edit: 'employeesEdit',
      delete: 'employeesDelete'
    },
    'admin_panel': {
      view: 'adminPanelView',
      create: 'adminPanelCreate',
      edit: 'adminPanelEdit',
      delete: 'adminPanelDelete'
    },
    'email_templates': {
      view: 'emailTemplatesView',
      create: 'emailTemplatesCreate',
      edit: 'emailTemplatesEdit',
      delete: 'emailTemplatesDelete'
    },
    'clients': {
      view: 'clientsView',
      create: 'clientsCreate',
      edit: 'clientsEdit',
      delete: 'clientsDelete'
    },
    'jobs': {
      view: 'jobsView',
      create: 'jobsCreate',
      edit: 'jobsEdit',
      delete: 'jobsDelete'
    },
    'analytics': {
      view: 'analyticsView',
      create: 'analyticsView',
      edit: 'analyticsView',
      delete: 'analyticsView'
    },
    'reimbursement': {
      view: 'reimbursementView',
      create: 'reimbursementCreate',
      edit: 'reimbursementEdit',
      delete: 'reimbursementDelete'
    },
    'leave_management': {
      view: 'leaveManagementView',
      create: 'leaveManagementCreate',
      edit: 'leaveManagementEdit',
      delete: 'leaveManagementDelete'
    },
    'attendance': {
      view: 'attendanceView',
      create: 'attendanceCreate',
      edit: 'attendanceEdit',
      delete: 'attendanceDelete'
    },
    'inbox': {
      view: 'inboxView',
      create: 'inboxCreate',
      edit: 'inboxEdit',
      delete: 'inboxDelete'
    },
    'calendar': {
      view: 'calendarView',
      create: 'calendarCreate',
      edit: 'calendarEdit',
      delete: 'calendarDelete'
    },
    'compliance': {
      view: 'complianceView',
      create: 'complianceCreate',
      edit: 'complianceEdit',
      delete: 'complianceDelete'
    },
    'help_desk': {
      view: 'helpDeskView',
      create: 'helpDeskCreate',
      edit: 'helpDeskEdit',
      delete: 'helpDeskDelete'
    },
    'asset_management': {
      view: 'assetManagementView',
      create: 'assetManagementCreate',
      edit: 'assetManagementEdit',
      delete: 'assetManagementDelete'
    },
    'accounts': {
      view: 'accountsView',
      create: 'accountsCreate',
      edit: 'accountsEdit',
      delete: 'accountsDelete'
    }
  };
  
  return moduleFieldMap[moduleName] || null;
};

// Get current user's permissions (for frontend route guards)
export const getCurrentUserPermissions = async (req: any, res: Response) => {
  try {
    console.log('🔍 getCurrentUserPermissions called');
    
    // If no user in request, return default restricted permissions
    if (!req.user || !req.user.id) {
      console.log('❌ No user found in request');
      return res.json({
        success: true,
        permissions: {
          dashboard: { canView: true, canCreate: false, canEdit: false, canDelete: false },
          timesheet: { canView: true, canCreate: true, canEdit: true, canDelete: false },
          projects: { canView: true, canCreate: false, canEdit: false, canDelete: false },
          reports: { canView: true, canCreate: false, canEdit: false, canDelete: false },
          employees: { canView: false, canCreate: false, canEdit: false, canDelete: false }
        },
        hasCustomAccess: false
      });
    }
    
    const userId = req.user.id;

    // Get user-specific permissions
    const permissionSelect = {
      dashboardView: true,
      dashboardCreate: true,
      dashboardEdit: true,
      dashboardDelete: true,
      timesheetView: true,
      timesheetCreate: true,
      timesheetEdit: true,
      timesheetDelete: true,
      projectsView: true,
      projectsCreate: true,
      projectsEdit: true,
      projectsDelete: true,
      reportsView: true,
      reportsCreate: true,
      reportsEdit: true,
      reportsDelete: true,
      employeesView: true,
      employeesCreate: true,
      employeesEdit: true,
      employeesDelete: true,
      adminPanelView: true,
      adminPanelCreate: true,
      adminPanelEdit: true,
      adminPanelDelete: true,
      emailTemplatesView: true,
      emailTemplatesCreate: true,
      emailTemplatesEdit: true,
      emailTemplatesDelete: true,
      clientsView: true,
      clientsCreate: true,
      clientsEdit: true,
      clientsDelete: true,
      jobsView: true,
      jobsCreate: true,
      jobsEdit: true,
      jobsDelete: true,
      analyticsView: true,
      reimbursementView: true,
      reimbursementCreate: true,
      reimbursementEdit: true,
      reimbursementDelete: true,
      leaveManagementView: true,
      leaveManagementCreate: true,
      leaveManagementEdit: true,
      leaveManagementDelete: true,
      attendanceView: true,
      attendanceCreate: true,
      attendanceEdit: true,
      attendanceDelete: true,
      inboxView: true,
      inboxCreate: true,
      inboxEdit: true,
      inboxDelete: true,
      calendarView: true,
      calendarCreate: true,
      calendarEdit: true,
      calendarDelete: true,
      complianceView: true,
      complianceCreate: true,
      complianceEdit: true,
      complianceDelete: true,
      helpDeskView: true,
      helpDeskCreate: true,
      helpDeskEdit: true,
      helpDeskDelete: true,
      assetManagementView: true,
      assetManagementCreate: true,
      assetManagementEdit: true,
      assetManagementDelete: true,
      accountsView: true,
      accountsCreate: true,
      accountsEdit: true,
      accountsDelete: true
    };

    const userPermission = await prisma.userPermission.findUnique({
      where: { userId },
      select: permissionSelect
    });

    // Get role-based permissions as fallback - handle casing
    const userRole = req.user.role || 'user';
    const rolePermission = await prisma.rolePermission.findFirst({
      where: { 
        role: {
          equals: userRole,
          mode: 'insensitive'
        }
      },
      select: permissionSelect
    });

    // Priority logic: user-specific permissions override role permissions
    const permission: any = userPermission || rolePermission;

    // Module mapping for easier frontend consumption
    const modules = [
      { name: 'dashboard', view: 'dashboardView', create: 'dashboardCreate', edit: 'dashboardEdit', del: 'dashboardDelete' },
      { name: 'timesheet', view: 'timesheetView', create: 'timesheetCreate', edit: 'timesheetEdit', del: 'timesheetDelete' },
      { name: 'projects', view: 'projectsView', create: 'projectsCreate', edit: 'projectsEdit', del: 'projectsDelete' },
      { name: 'reports', view: 'reportsView', create: 'reportsCreate', edit: 'reportsEdit', del: 'reportsDelete' },
      { name: 'employees', view: 'employeesView', create: 'employeesCreate', edit: 'employeesEdit', del: 'employeesDelete' },
      { name: 'adminPanel', view: 'adminPanelView', create: 'adminPanelCreate', edit: 'adminPanelEdit', del: 'adminPanelDelete' },
      { name: 'emailTemplates', view: 'emailTemplatesView', create: 'emailTemplatesCreate', edit: 'emailTemplatesEdit', del: 'emailTemplatesDelete' },
      { name: 'clients', view: 'clientsView', create: 'clientsCreate', edit: 'clientsEdit', del: 'clientsDelete' },
      { name: 'jobs', view: 'jobsView', create: 'jobsCreate', edit: 'jobsEdit', del: 'jobsDelete' },
      { name: 'analytics', view: 'analyticsView', create: 'analyticsView', edit: 'analyticsView', del: 'analyticsView' },
      { name: 'reimbursement', view: 'reimbursementView', create: 'reimbursementCreate', edit: 'reimbursementEdit', del: 'reimbursementDelete' },
      { name: 'leaveManagement', view: 'leaveManagementView', create: 'leaveManagementCreate', edit: 'leaveManagementEdit', del: 'leaveManagementDelete' },
      { name: 'attendance', view: 'attendanceView', create: 'attendanceCreate', edit: 'attendanceEdit', del: 'attendanceDelete' },
      { name: 'inbox', view: 'inboxView', create: 'inboxCreate', edit: 'inboxEdit', del: 'inboxDelete' },
      { name: 'calendar', view: 'calendarView', create: 'calendarCreate', edit: 'calendarEdit', del: 'calendarDelete' },
      { name: 'compliance', view: 'complianceView', create: 'complianceCreate', edit: 'complianceEdit', del: 'complianceDelete' },
      { name: 'help_desk', view: 'helpDeskView', create: 'helpDeskCreate', edit: 'helpDeskEdit', del: 'helpDeskDelete' },
      { name: 'asset_management', view: 'assetManagementView', create: 'assetManagementCreate', edit: 'assetManagementEdit', del: 'assetManagementDelete' },
      { name: 'accounts', view: 'accountsView', create: 'accountsCreate', edit: 'accountsEdit', del: 'accountsDelete' },
    ];

    const permissionMap: any = {};
    
    modules.forEach((mod) => {
      if (permission) {
        permissionMap[mod.name] = {
          canView: !!permission[mod.view],
          canCreate: mod.create !== mod.view ? (!!permission[mod.create] || !!permission[mod.edit]) : false,
          canEdit: mod.edit !== mod.view ? !!permission[mod.edit] : false,
          canDelete: mod.del !== mod.view ? (!!permission[mod.del] || false) : false,
        };
      } else {
        // Safe defaults if no record in DB
        const isDefaultVisible = ['dashboard', 'projects', 'timesheet'].includes(mod.name);
        permissionMap[mod.name] = {
          canView: isDefaultVisible,
          canCreate: mod.name === 'timesheet',
          canEdit: mod.name === 'timesheet',
          canDelete: false,
        };
      }
    });

    const accountsRoles = ['accounts', 'accounts_admin', 'accounts_manager', 'accounts_executive', 'finance_approver', 'ar_manager', 'ap_manager', 'accountant'];
    if (accountsRoles.includes(userRole?.toLowerCase())) {
      const viewOnlyModules = ['employees', 'projects', 'clients'];
      const standardEmployeeModules = ['dashboard', 'timesheet', 'reimbursement', 'leaveManagement', 'attendance'];
      
      viewOnlyModules.forEach(mod => {
        permissionMap[mod] = {
          canView: true,
          canCreate: false,
          canEdit: false,
          canDelete: false
        };
      });

      standardEmployeeModules.forEach(mod => {
        permissionMap[mod] = {
          canView: true,
          canCreate: true,
          canEdit: true,
          canDelete: false
        };
      });
    }

    res.json({
      success: true,
      permissions: permissionMap,
      hasCustomAccess: !!userPermission
    });
  } catch (error) {
    console.error("❌ ERROR in getCurrentUserPermissions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch current user permissions",
      error: error instanceof Error ? error.message : String(error)
    });
  }
};

// Helper function to map field names to module names
const getModuleNameForField = (fieldName: string): string | null => {
  const fieldModuleMap: { [key: string]: string } = {
    'dashboard': 'dashboard',
    'timesheet': 'timesheet',
    'projects': 'projects',
    'reports': 'reports',
    'employees': 'employees',
    'adminPanel': 'admin_panel',
    'emailTemplates': 'email_templates',
    'clients': 'clients',
    'jobs': 'jobs',
    'analytics': 'analytics',
    'reimbursement': 'reimbursement',
    'leaveManagement': 'leave_management',
    'attendance': 'attendance',
    'inbox': 'inbox',
    'calendar': 'calendar',
    'compliance': 'compliance',
    'helpDesk': 'help_desk',
    'assetManagement': 'asset_management',
    'accounts': 'accounts'
  };
  
  return fieldModuleMap[fieldName] || null;
};

// Get role-based permissions
export const getRolePermissions = async (req: Request, res: Response) => {
  try {
    const { role } = req.params;

    if (!role) {
      return res.status(400).json({
        success: false,
        message: "Role is required"
      });
    }

    const permission = await prisma.rolePermission.findUnique({
      where: { role },
      select: {
        dashboardView: true,
        dashboardCreate: true,
        dashboardEdit: true,
        dashboardDelete: true,
        timesheetView: true,
        timesheetCreate: true,
        timesheetEdit: true,
        timesheetDelete: true,
        projectsView: true,
        projectsCreate: true,
        projectsEdit: true,
        projectsDelete: true,
        reportsView: true,
        reportsCreate: true,
        reportsEdit: true,
        reportsDelete: true,
        employeesView: true,
        employeesCreate: true,
        employeesEdit: true,
        employeesDelete: true,
        adminPanelView: true,
        adminPanelCreate: true,
        adminPanelEdit: true,
        adminPanelDelete: true,
        emailTemplatesView: true,
        emailTemplatesCreate: true,
        emailTemplatesEdit: true,
        emailTemplatesDelete: true,
        clientsView: true,
        clientsCreate: true,
        clientsEdit: true,
        clientsDelete: true,
        jobsView: true,
        jobsCreate: true,
        jobsEdit: true,
        jobsDelete: true,
        analyticsView: true,
        reimbursementView: true,
        reimbursementCreate: true,
        reimbursementEdit: true,
        reimbursementDelete: true,
        leaveManagementView: true,
        leaveManagementCreate: true,
        leaveManagementEdit: true,
        leaveManagementDelete: true,
        attendanceView: true,
        attendanceCreate: true,
        attendanceEdit: true,
        attendanceDelete: true,
        inboxView: true,
        inboxCreate: true,
        inboxEdit: true,
        inboxDelete: true,
        calendarView: true,
        calendarCreate: true,
        calendarEdit: true,
        calendarDelete: true,
        complianceView: true,
        complianceCreate: true,
        complianceEdit: true,
        complianceDelete: true,
        helpDeskView: true,
        helpDeskCreate: true,
        helpDeskEdit: true,
        helpDeskDelete: true,
        assetManagementView: true,
        assetManagementCreate: true,
        assetManagementEdit: true,
        assetManagementDelete: true,
        accountsView: true,
        accountsCreate: true,
        accountsEdit: true,
        accountsDelete: true
      }
    });

    // Define all available modules with their field names
    const allModules = [
      { moduleName: 'dashboard', viewField: 'dashboardView', createField: 'dashboardCreate', editField: 'dashboardEdit', deleteField: 'dashboardDelete' },
      { moduleName: 'timesheet', viewField: 'timesheetView', createField: 'timesheetCreate', editField: 'timesheetEdit', deleteField: 'timesheetDelete' },
      { moduleName: 'projects', viewField: 'projectsView', createField: 'projectsCreate', editField: 'projectsEdit', deleteField: 'projectsDelete' },
      { moduleName: 'reports', viewField: 'reportsView', createField: 'reportsCreate', editField: 'reportsEdit', deleteField: 'reportsDelete' },
      { moduleName: 'employees', viewField: 'employeesView', createField: 'employeesCreate', editField: 'employeesEdit', deleteField: 'employeesDelete' },
      { moduleName: 'admin_panel', viewField: 'adminPanelView', createField: 'adminPanelCreate', editField: 'adminPanelEdit', deleteField: 'adminPanelDelete' },
      { moduleName: 'email_templates', viewField: 'emailTemplatesView', createField: 'emailTemplatesCreate', editField: 'emailTemplatesEdit', deleteField: 'emailTemplatesDelete' },
      { moduleName: 'clients', viewField: 'clientsView', createField: 'clientsCreate', editField: 'clientsEdit', deleteField: 'clientsDelete' },
      { moduleName: 'jobs', viewField: 'jobsView', createField: 'jobsCreate', editField: 'jobsEdit', deleteField: 'jobsDelete' },
      { moduleName: 'analytics', viewField: 'analyticsView', createField: 'analyticsView', editField: 'analyticsView', deleteField: 'analyticsView' },
      { moduleName: 'reimbursement', viewField: 'reimbursementView', createField: 'reimbursementCreate', editField: 'reimbursementEdit', deleteField: 'reimbursementDelete' },
      { moduleName: 'leave_management', viewField: 'leaveManagementView', createField: 'leaveManagementCreate', editField: 'leaveManagementEdit', deleteField: 'leaveManagementDelete' },
      { moduleName: 'attendance', viewField: 'attendanceView', createField: 'attendanceCreate', editField: 'attendanceEdit', deleteField: 'attendanceDelete' },
      { moduleName: 'inbox', viewField: 'inboxView', createField: 'inboxCreate', editField: 'inboxEdit', deleteField: 'inboxDelete' },
      { moduleName: 'calendar', viewField: 'calendarView', createField: 'calendarCreate', editField: 'calendarEdit', deleteField: 'calendarDelete' },
      { moduleName: 'compliance', viewField: 'complianceView', createField: 'complianceCreate', editField: 'complianceEdit', deleteField: 'complianceDelete' },
      { moduleName: 'help_desk', viewField: 'helpDeskView', createField: 'helpDeskCreate', editField: 'helpDeskEdit', deleteField: 'helpDeskDelete' },
      { moduleName: 'asset_management', viewField: 'assetManagementView', createField: 'assetManagementCreate', editField: 'assetManagementEdit', deleteField: 'assetManagementDelete' },
      { moduleName: 'accounts', viewField: 'accountsView', createField: 'accountsCreate', editField: 'accountsEdit', deleteField: 'accountsDelete' }
    ];

    // Convert to the expected format
    const modulePermissions = allModules.map(({ moduleName, viewField, createField, editField, deleteField }) => {
      return {
        moduleName,
        canView: permission ? Boolean(permission[viewField as keyof typeof permission]) : false,
        canCreate: permission && createField !== viewField ? Boolean(permission[createField as keyof typeof permission]) : false,
        canEdit: permission && editField !== viewField ? Boolean(permission[editField as keyof typeof permission]) : false,
        canDelete: permission && deleteField !== viewField ? Boolean(permission[deleteField as keyof typeof permission]) : false
      };
    });

    res.json({
      success: true,
      permissions: modulePermissions
    });
  } catch (error) {
    console.error("Error fetching role permissions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch role permissions"
    });
  }
};

// Save or update role permissions
export const saveRolePermissions = async (req: Request, res: Response) => {
  try {
    const role = req.body.role || req.params.role;
    const { permissions } = req.body;

    if (!role || !permissions) {
      return res.status(400).json({
        success: false,
        message: "Role and permissions are required"
      });
    }

    // Convert permissions array to the database schema format
    const permissionData: any = {};
    
    permissions.forEach((permission: any) => {
      const fieldMapping = getFieldMappingForModule(permission.moduleName);
      if (fieldMapping) {
        permissionData[fieldMapping.view] = permission.canView || false;
        if (fieldMapping.create && fieldMapping.create !== fieldMapping.view) {
          permissionData[fieldMapping.create] = permission.canCreate || false;
        }
        if (fieldMapping.edit && fieldMapping.edit !== fieldMapping.view) {
          permissionData[fieldMapping.edit] = permission.canEdit || false;
        }
        if (fieldMapping.delete && fieldMapping.delete !== fieldMapping.view) {
          permissionData[fieldMapping.delete] = permission.canDelete || false;
        }
      }
    });

    // Upsert the role permission record
    const result = await prisma.rolePermission.upsert({
      where: { role },
      update: permissionData,
      create: {
        role,
        ...permissionData
      }
    });

    res.json({
      success: true,
      message: "Role permissions updated successfully",
      permission: result
    });
  } catch (error) {
    console.error("Error saving role permissions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save role permissions"
    });
  }
};
