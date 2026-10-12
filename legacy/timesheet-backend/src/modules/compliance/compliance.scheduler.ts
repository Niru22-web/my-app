// ============================================================
// Compliance Scheduler — Cron Job Definitions
// ============================================================

import cron from 'node-cron';
import { ComplianceService } from './compliance.service';

export const registerComplianceSchedulers = () => {
  // Daily 9 AM (Mon–Fri): check yesterday missing timesheets
  cron.schedule('0 9 * * 1-5', async () => {
    await ComplianceService.runDailyComplianceCheck();
  });

  // Thursday 2 PM: warn employees with hours < 32
  cron.schedule('0 14 * * 4', async () => {
    await ComplianceService.runThursdayCheck();
  });

  // Friday 6 PM: critical reminder for hours < 40
  cron.schedule('0 18 * * 5', async () => {
    await ComplianceService.runWeeklyComplianceCheck();
  });

  // Monday 10 AM: escalate previous week non-compliance
  cron.schedule('0 10 * * 1', async () => {
    await ComplianceService.runMondayEscalation();
  });

  console.log('[Compliance] Compliance schedulers registered.');
};
