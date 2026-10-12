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

// CRUD
export const getVendors = async (req: Request, res: Response) => {
  try {
    const vendors = await prisma.vendor.findMany({
      orderBy: { vendorName: 'asc' }
    });
    res.json({ success: true, data: vendors });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

export const createVendor = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || !isManagement(user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { vendorName, company, email, phone, address, gstNumber, contactPerson } = req.body;
    if (!vendorName || !company) {
      return res.status(400).json({ success: false, message: 'Vendor Name and Company are required' });
    }

    const newVendor = await prisma.vendor.create({
      data: { vendorName, company, email, phone, address, gstNumber, contactPerson }
    });

    res.status(201).json({ success: true, data: newVendor });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

export const updateVendor = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || !isManagement(user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { id } = req.params;
    const { vendorName, company, email, phone, address, gstNumber, contactPerson } = req.body;

    const updatedVendor = await prisma.vendor.update({
      where: { id },
      data: { vendorName, company, email, phone, address, gstNumber, contactPerson }
    });

    res.json({ success: true, data: updatedVendor });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteVendor = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || !isManagement(user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { id } = req.params;
    await prisma.vendor.delete({ where: { id } });
    res.json({ success: true, message: 'Vendor deleted successfully' });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

// Vendor-wise assets
export const getVendorAssets = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const assets = await prisma.assetInventory.findMany({
      where: { vendorId: id, isDeleted: false },
      orderBy: { purchaseDate: 'desc' }
    });
    res.json({ success: true, data: assets });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

// Purchase History
export const getVendorPurchaseHistory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const assets = await prisma.assetInventory.findMany({
      where: { vendorId: id, isDeleted: false, purchaseDate: { not: null } },
      select: {
        id: true,
        assetName: true,
        type: true,
        serialNumber: true,
        purchaseDate: true,
        purchaseCost: true,
        status: true
      },
      orderBy: { purchaseDate: 'desc' }
    });
    res.json({ success: true, data: assets });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};
