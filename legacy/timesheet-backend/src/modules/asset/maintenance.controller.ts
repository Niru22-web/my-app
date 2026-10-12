import { Request, Response } from 'express';
import { prisma } from '../../config/prisma';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
    email: string;
  };
}

// Helper to check roles
const isManagement = (role: string) => ['admin', 'owner', 'partner', 'it', 'hr'].includes(role?.toLowerCase());

export const getMaintenances = async (req: Request, res: Response) => {
  try {
    const list = await prisma.assetMaintenance.findMany({
      include: {
        inventory: {
          select: { id: true, assetName: true, serialNumber: true, officeTagNo: true }
        }
      },
      orderBy: { date: 'desc' }
    });
    res.json({ success: true, data: list });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

export const createMaintenance = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const { inventoryId, type, date, cost, description } = req.body;
    if (!inventoryId || !type || !date) {
      return res.status(400).json({ success: false, message: 'inventoryId, type, and date are required' });
    }

    // Fetch current asset status so we can restore it after maintenance completes
    const currentAsset = await prisma.assetInventory.findUnique({
      where: { id: inventoryId },
      select: { status: true, assetName: true }
    });
    if (!currentAsset) {
      return res.status(404).json({ success: false, message: 'Asset not found' });
    }
    if (currentAsset.status === 'Maintenance') {
      return res.status(400).json({ success: false, message: `"${currentAsset.assetName}" is already under maintenance.` });
    }
    if (currentAsset.status === 'Retired') {
      return res.status(400).json({ success: false, message: `Retired assets cannot be sent for maintenance.` });
    }

    const result = await prisma.$transaction([
      prisma.assetMaintenance.create({
        data: {
          inventoryId,
          type,
          date: new Date(date),
          cost: cost ? parseFloat(cost) : 0,
          description,
          status: 'Pending',
          previousStatus: currentAsset.status  // Save so we can restore on completion
        }
      }),
      prisma.assetInventory.update({
        where: { id: inventoryId },
        data: { status: 'Maintenance' }
      }),
      // Log history
      prisma.assetInventoryHistory.create({
        data: {
          inventoryId,
          action: 'MaintenanceRequest',
          status: 'Maintenance',
          performedById: user.id,
          remarks: `Asset sent for maintenance (${type}). Previous status: ${currentAsset.status}. Issue: ${description || 'N/A'}`
        }
      })
    ]);

    res.status(201).json({ success: true, data: result[0], message: 'Maintenance record created' });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

export const updateMaintenance = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || !isManagement(user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { id } = req.params;
    const { type, date, cost, description, status } = req.body;

    const current = await prisma.assetMaintenance.findUnique({
      where: { id },
      include: { inventory: true }
    });
    if (!current) return res.status(404).json({ success: false, message: 'Maintenance record not found' });

    // Transaction: update maintenance details
    const updated = await prisma.assetMaintenance.update({
      where: { id },
      data: {
        type,
        date: date ? new Date(date) : undefined,
        cost: cost ? parseFloat(cost) : undefined,
        description,
        status
      }
    });

    // If status is completed, restore asset to its previous status (Available or Allocated)
    if (status === 'Completed' && current.inventory.status === 'Maintenance') {
      // Check if there is an active allocation for this asset
      const activeAllocation = await prisma.assetAllocation.findFirst({
        where: {
          inventoryId: current.inventoryId,
          status: 'Allocated',
          returnedAt: null
        }
      });

      // If an active allocation exists in the database, the asset must be restored to 'Allocated'!
      // Otherwise, we restore it to the saved previousStatus, falling back to 'Available'.
      const restoreStatus = activeAllocation 
        ? 'Allocated' 
        : (current.previousStatus || 'Available');

      await prisma.$transaction([
        prisma.assetInventory.update({
          where: { id: current.inventoryId },
          data: { status: restoreStatus }
        }),
        prisma.assetInventoryHistory.create({
          data: {
            inventoryId: current.inventoryId,
            action: 'MaintenanceCompleted',
            status: restoreStatus,
            performedById: user.id,
            remarks: `Maintenance completed. Asset restored to ${restoreStatus} status.`
          }
        })
      ]);
    }

    res.json({ success: true, data: updated });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteMaintenance = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || !isManagement(user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { id } = req.params;
    await prisma.assetMaintenance.delete({ where: { id } });
    res.json({ success: true, message: 'Maintenance record deleted' });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

// Reminders for maintenance due
export const getMaintenanceReminders = async (req: Request, res: Response) => {
  try {
    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);

    const dueList = await prisma.assetMaintenance.findMany({
      where: {
        date: {
          gte: today,
          lte: nextWeek
        }
      },
      include: { inventory: true },
      orderBy: { date: 'asc' }
    });

    res.json({ success: true, data: dueList });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};
