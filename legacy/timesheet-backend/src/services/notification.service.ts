import { prisma } from '../config/prisma';
import { getIO } from './socket.service';





interface TriggerNotificationProps {
  userId: string;
  title: string;
  message: string;
  type: string;
  relatedId?: string;
  actionUrl?: string;
  module?: string;
  priority?: string;
  metadata?: any;
}

export const triggerNotification = async ({
  userId,
  title,
  message,
  type,
  relatedId,
  actionUrl,
  module,
  priority,
  metadata
}: TriggerNotificationProps) => {
  try {
    // Inference for module
    let inferredModule = module;
    if (!inferredModule) {
      const typeLower = (type || '').toLowerCase();
      if (typeLower.includes('leave') || typeLower.includes('birthday') || typeLower.includes('anniversary') || typeLower.includes('holiday') || typeLower.includes('hr') || typeLower.includes('policy')) {
        inferredModule = 'HR';
      } else if (typeLower.includes('reimbursement') || typeLower.includes('salary') || typeLower.includes('payslip') || typeLower.includes('expense') || typeLower.includes('invoice') || typeLower.includes('payment') || typeLower.includes('payroll')) {
        inferredModule = 'Finance';
      } else if (typeLower.includes('asset') || typeLower.includes('password') || typeLower.includes('device') || typeLower.includes('license') || typeLower.includes('it')) {
        inferredModule = 'IT';
      } else if (typeLower.includes('ticket') || typeLower.includes('helpdesk') || typeLower.includes('sla')) {
        inferredModule = 'HelpDesk';
      } else if (typeLower.includes('announcement') || typeLower.includes('meeting') || typeLower.includes('circular') || typeLower.includes('compliance') || typeLower.includes('visitor') || typeLower.includes('admin')) {
        inferredModule = 'Admin';
      } else {
        inferredModule = 'Employee';
      }
    }

    // Inference for priority
    let inferredPriority = priority;
    if (!inferredPriority) {
      const checkText = `${(title || '').toLowerCase()} ${(message || '').toLowerCase()}`;
      if (checkText.includes('critical') || checkText.includes('emergency') || checkText.includes('breach') || checkText.includes('sla') || checkText.includes('error')) {
        inferredPriority = 'Critical';
      } else if (checkText.includes('reject') || checkText.includes('warning') || checkText.includes('alert') || checkText.includes('negative') || checkText.includes('cancel')) {
        inferredPriority = 'Warning';
      } else if (checkText.includes('urgent') || checkText.includes('high') || checkText.includes('approve') || checkText.includes('action required') || checkText.includes('pending')) {
        inferredPriority = 'High';
      } else {
        inferredPriority = 'Info';
      }
    }

    // 1. Create in DB
    const notification = await prisma.notification.create({
      data: {
        userId,
        title: title || 'Notification',
        message,
        type,
        relatedId,
        actionUrl,
        module: inferredModule,
        priority: inferredPriority,
        metadata: metadata || null
      }
    });

    // 2. Emit Realtime Event
    const io = getIO();
    if (io) {
      // Broadcast to the user's specific room
      io.to(userId).emit('new_notification', notification);
    }
    
    return notification;
  } catch (error) {
    console.error(`❌ Failed to trigger notification for User ${userId}`, error);
    return null;
  }
};

// HELPER TRIGGERS

export const notifyAdmins = async (title: string, message: string, type: string, actionUrl?: string, relatedId?: string) => {
  // Get all admin-level users
  const admins = await prisma.employee.findMany({ 
    where: { 
      role: {
        in: ['Admin', 'Manager', 'Partner', 'HR', 'IT', 'Accountant']
      }

    } 
  });
  
  for (const admin of admins) {
    await triggerNotification({
      userId: admin.id,
      title,
      message,
      type,
      relatedId,
      actionUrl
    });
  }
};

export const notifyReportingManagers = async (employeeId: string, title: string, message: string, type: string, actionUrl?: string, relatedId?: string) => {
  // Get direct managers
  const managers = await prisma.employeeManager.findMany({ 
    where: { employeeId },
    select: { managerId: true }
  });
  
  // Get sub manager
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { subManagerId: true }
  });

  const allManagerIds = new Set<string>();
  managers.forEach(m => allManagerIds.add(m.managerId));
  if (employee?.subManagerId) allManagerIds.add(employee.subManagerId);
  
  for (const mId of allManagerIds) {
    await triggerNotification({
      userId: mId,
      title,
      message,
      type,
      actionUrl,
      relatedId
    });
  }
};

export const notifySubManager = async (employeeId: string, title: string, message: string, type: string, actionUrl?: string, relatedId?: string) => {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { subManagerId: true }
  });

  if (employee?.subManagerId) {
    await triggerNotification({
      userId: employee.subManagerId,
      title,
      message,
      type,
      actionUrl,
      relatedId
    });
  }
};

export const notifyReportingPartners = async (employeeId: string, title: string, message: string, type: string, actionUrl?: string, relatedId?: string) => {
  const partners = await prisma.employeePartner.findMany({ 
    where: { employeeId },
    select: { partnerId: true }
  });
  
  for (const record of partners) {
    await triggerNotification({
      userId: record.partnerId,
      title,
      message,
      type,
      actionUrl,
      relatedId
    });
  }
};

// Aliases for backward compatibility
export const notifyReportingManager = notifyReportingManagers;
export const notifyReportingPartner = notifyReportingPartners;
