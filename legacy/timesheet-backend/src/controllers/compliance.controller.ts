import { Request, Response } from 'express';
import { ComplianceService } from '../services/compliance.service';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
    email: string;
    department?: string;
  };
}

export const getComplianceDashboard = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const data = await ComplianceService.getComplianceDashboardData(user as any);

    return res.json({
      success: true,
      data,
      message: 'Compliance dashboard data retrieved successfully'
    });
  } catch (error: any) {
    console.error('Error fetching compliance dashboard data:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve compliance dashboard data'
    });
  }
};

export const triggerManualReminder = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    const { employeeId } = req.params;

    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Employee ID is required' });
    }

    const result = await ComplianceService.sendManualReminder(user.id, employeeId);

    return res.json(result);
  } catch (error: any) {
    console.error('Error sending manual compliance reminder:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to send compliance reminder'
    });
  }
};
