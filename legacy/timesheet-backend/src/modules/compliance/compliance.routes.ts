// ============================================================
// Compliance Routes
// ============================================================

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import {
  getComplianceDashboard,
  getComplianceLogs,
  getActivityFeed,
  getManagerSummary,
  triggerManualReminder,
  triggerEscalation,
  addException
} from './compliance.controller';

const router = Router();

// All routes require auth
router.use(authenticate);

// Dashboard — main endpoint with filter support
router.get('/dashboard', getComplianceDashboard);

// Compliance logs for frontend reports grid
router.get('/logs', getComplianceLogs);

// Activity feed
router.get('/activity-feed', getActivityFeed);

// Manager summary
router.get('/manager-summary', getManagerSummary);

// Actions
router.post('/trigger-reminder/:employeeId', triggerManualReminder);
router.post('/escalate/:employeeId', triggerEscalation);
router.post('/add-exception/:employeeId', addException);

export default router;
