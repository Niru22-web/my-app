// ============================================================
// Compliance Controller
// ============================================================

import { Request, Response } from 'express';
import { ComplianceService } from './compliance.service';
import { ComplianceFilters } from './compliance.types';
import * as Repo from './compliance.repository';

export const getComplianceDashboard = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const filters: ComplianceFilters = {
      department: req.query.department as string | undefined,
      managerId: req.query.managerId as string | undefined,
      employeeId: req.query.employeeId as string | undefined,
      riskLevel: req.query.riskLevel as any,
      status: req.query.status as any,
      hoursMax: req.query.hoursMax ? parseFloat(req.query.hoursMax as string) : undefined,
      missingDaysMin: req.query.missingDaysMin ? parseInt(req.query.missingDaysMin as string) : undefined,
      weekStart: req.query.weekStart as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : 50,
      sortBy: req.query.sortBy as string | undefined,
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
    };

    const data = await ComplianceService.getComplianceDashboardData(user, filters);
    res.json({ success: true, data });
  } catch (err: any) {
    console.error('❌ Compliance dashboard error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getComplianceLogs = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const data = await ComplianceService.getComplianceDashboardData(user, {});
    const logs = data.employees.map((e: any) => ({
      id: e.employeeId,
      name: e.name,
      department: e.department,
      logged: e.weeklyHours,
      status: e.complianceStatus === 'compliant' ? 'Compliant' : (e.complianceStatus === 'under_40_hours' ? 'Under 40 Hours' : 'Unsubmitted')
    }));
    res.json({ success: true, data: logs });
  } catch (err: any) {
    console.error('❌ Compliance logs error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getActivityFeed = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const activity = await Repo.getRecentReminderActivity(limit);
    const feed = activity.map((h: any) => ({
      id: h.id,
      type: h.reminderType.includes('escalation') ? 'escalation_triggered' : 'reminder_sent',
      employeeName: `${h.employee?.firstName || ''} ${h.employee?.lastName || ''}`.trim(),
      employeeId: h.employeeId,
      description: h.reminderType.replace(/_/g, ' '),
      timestamp: h.sentAt
    }));
    res.json({ success: true, data: feed });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getManagerSummary = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    // Build team data using compliance service
    const data = await ComplianceService.getComplianceDashboardData(user, {});
    const summary = {
      teamCompliance: data.kpis.weeklyCompliance,
      totalEmployees: data.kpis.totalEmployees,
      compliantCount: data.kpis.compliantEmployees,
      missingYesterday: data.kpis.missingYesterday,
      below40Hours: data.kpis.below40Hours,
      criticalRisk: data.kpis.criticalRisk,
      departmentBreakdown: data.departmentAnalytics
    };
    res.json({ success: true, data: summary });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const triggerManualReminder = async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const user = (req as any).user;
    const result = await ComplianceService.sendManualReminder(employeeId, user);
    res.json(result);
  } catch (err: any) {
    console.error('Error sending manual compliance reminder:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const triggerEscalation = async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const result = await ComplianceService.triggerEscalation(employeeId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const addException = async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const { reason, weekStart } = req.body;

    if (!weekStart) {
      return res.status(400).json({ success: false, message: 'weekStart is required' });
    }

    const weekStartDate = new Date(weekStart);
    await Repo.upsertComplianceLog(employeeId, weekStartDate, {
      complianceStatus: 'compliant',
      loggedHours: 40, // mark as compliant
      missingDays: [],
      escalationLevel: 0
    });

    res.json({ success: true, message: `Exception added for employee (${reason || 'no reason given'})` });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};
