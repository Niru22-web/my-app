import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { authorizeRoles } from "../../middleware/role.middleware";
import { 
  getDashboardSummaryData, 
  getEmployeeHoursData, 
  getProjectDistributionData, 
  getHoursTrendData, 
  exportDashboardData,
  getAdminStats,
  getManagerStats,
  getPartnerStats,
  getEmployeeStats,
  getHRStats,
  getITStats,
  getAccountantStats,
  getRecentActivities,

  getMyRecentActivities,
  getCombinedDashboardData
} from "./dashboard.controller";

const router = Router();

// Apply authentication to all dashboard routes
router.use(authenticate);

// Dashboard summary - KPIs and overview data
router.get("/summary", authorizeRoles("Admin", "HR", "IT", "Accountant", "Manager", "Partner", "Employee", "Accounts", "ACCOUNTS", "accounts"), getDashboardSummaryData);

// Employee hours breakdown - for bar charts and detailed analysis
router.get("/employee-hours", getEmployeeHoursData);

// Project distribution - for pie charts and project analysis
router.get("/project-distribution", getProjectDistributionData);

// Hours trends - for line charts and time series analysis
router.get("/trends", getHoursTrendData);

// Export functionality
router.get("/export", exportDashboardData);

// Role-specific dashboard endpoints
router.get("/admin-stats", authorizeRoles("Admin", "HR", "IT", "Accountant", "Manager", "Partner", "Employee", "Accounts", "ACCOUNTS", "accounts"), getAdminStats);
router.get("/manager-stats", authorizeRoles("Admin", "Manager"), getManagerStats);
router.get("/partner-stats", authorizeRoles("Admin", "Partner"), getPartnerStats);
router.get("/employee-stats", authorizeRoles("Admin", "Employee", "Manager", "Partner"), getEmployeeStats);
router.get("/hr-stats", authorizeRoles("Admin", "HR"), getHRStats);
router.get("/it-stats", authorizeRoles("Admin", "IT"), getITStats);
router.get("/accountant-stats", authorizeRoles("Admin", "Accountant"), getAccountantStats);


// Combined dashboard endpoint
router.get("/combined", getCombinedDashboardData);

export default router;
