import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/role.middleware';
import { getComplianceDashboard, triggerManualReminder } from '../controllers/compliance.controller';

const router = Router();

// Require auth for all compliance routes
router.use(authenticate);

// Get compliance dashboard statistics and list
router.get(
  '/dashboard',
  authorizeRoles('Admin', 'Owner', 'Partner', 'Manager', 'HR', 'IT', 'Employee', 'Accounts', 'ACCOUNTS', 'accounts'),
  getComplianceDashboard
);

// Manually trigger a timesheet reminder
router.post(
  '/trigger-reminder/:employeeId',
  authorizeRoles('Admin', 'Owner', 'Partner', 'Manager', 'HR', 'IT', 'Accounts', 'ACCOUNTS', 'accounts'),
  triggerManualReminder
);

export default router;
