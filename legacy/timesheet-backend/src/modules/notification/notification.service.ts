import { prisma } from '../../config/prisma';
import { triggerNotification } from '../../services/notification.service';

export class NotificationService {
  static async createNotification(data: {
    userId: string;
    message: string;
    type: string;
    title?: string;
    relatedId?: string;
    actionUrl?: string;
    module?: string;
    priority?: string;
    metadata?: any;
  }) {
    try {
      return await triggerNotification({
        userId: data.userId,
        title: data.title || 'Notification',
        message: data.message,
        type: data.type,
        relatedId: data.relatedId,
        actionUrl: data.actionUrl,
        module: data.module,
        priority: data.priority,
        metadata: data.metadata
      });
    } catch (error) {
      console.error('Error creating notification:', error);
    }
  }

  static async notifyRoles(roles: string[], data: {
    message: string;
    type: string;
    title?: string;
    relatedId?: string;
    actionUrl?: string;
    module?: string;
    priority?: string;
    metadata?: any;
  }) {
    try {
      const users = await prisma.employee.findMany({
        where: {
          role: {
            in: roles as any,
          },
          status: { in: ['active', 'pending'] },
        },
        select: { id: true },
      });

      for (const user of users) {
        await triggerNotification({
          userId: user.id,
          title: data.title || 'Notification',
          message: data.message,
          type: data.type,
          relatedId: data.relatedId,
          actionUrl: data.actionUrl,
          module: data.module,
          priority: data.priority,
          metadata: data.metadata
        });
      }
    } catch (error) {
      console.error('Error notifying roles:', error);
    }
  }
}
