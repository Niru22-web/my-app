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
const isAdmin = (role: string) => ['admin', 'owner', 'partner', 'it', 'hr', 'manager', 'accountant', 'accounts'].includes(role?.toLowerCase());

// ---------------- CATEGORIES ----------------
export const getCategories = async (req: Request, res: Response) => {
  try {
    const categories = await prisma.assetCategory.findMany({
      orderBy: { name: 'asc' }
    });
    res.json({ success: true, data: categories });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

export const createCategory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || !isAdmin(user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { name, category } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name is required' });

    const newCat = await prisma.assetCategory.create({
      data: { name, category: category || 'Hardware' }
    });
    res.status(201).json({ success: true, data: newCat });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteCategory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || !isAdmin(user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { id } = req.params;
    await prisma.assetCategory.delete({ where: { id } });
    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

// ---------------- TYPES ----------------
export const getTypes = async (req: Request, res: Response) => {
  try {
    const types = await prisma.assetType.findMany({
      include: { category: true },
      orderBy: { name: 'asc' }
    });
    res.json({ success: true, data: types });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

export const createType = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || !isAdmin(user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { name, categoryId } = req.body;
    if (!name || !categoryId) {
      return res.status(400).json({ success: false, message: 'Name and categoryId are required' });
    }

    const newType = await prisma.assetType.create({
      data: { name, assetCategoryId: categoryId }
    });
    res.status(201).json({ success: true, data: newType });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteType = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || !isAdmin(user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { id } = req.params;
    await prisma.assetType.delete({ where: { id } });
    res.json({ success: true, message: 'Asset Type deleted successfully' });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

// ---------------- LOCATIONS ----------------
export const getLocations = async (req: Request, res: Response) => {
  try {
    const locations = await prisma.location.findMany({
      orderBy: { name: 'asc' }
    });
    res.json({ success: true, data: locations });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

export const createLocation = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || !isAdmin(user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name is required' });

    const newLoc = await prisma.location.create({ data: { name } });
    res.status(201).json({ success: true, data: newLoc });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteLocation = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || !isAdmin(user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { id } = req.params;
    await prisma.location.delete({ where: { id } });
    res.json({ success: true, message: 'Location deleted successfully' });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

// ---------------- STATUSES ----------------
export const getStatuses = async (req: Request, res: Response) => {
  try {
    const statuses = await prisma.assetStatus.findMany({
      orderBy: { name: 'asc' }
    });
    res.json({ success: true, data: statuses });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

export const createStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || !isAdmin(user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name is required' });

    const newStatus = await prisma.assetStatus.create({ data: { name } });
    res.status(201).json({ success: true, data: newStatus });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || !isAdmin(user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { id } = req.params;
    await prisma.assetStatus.delete({ where: { id } });
    res.json({ success: true, message: 'Status deleted successfully' });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

// ---------------- DEPARTMENTS ----------------
export const getDepartments = async (req: Request, res: Response) => {
  try {
    const employees = await prisma.employee.findMany({
      select: { department: true }
    });
    const uniqueDepts = Array.from(new Set(employees.map(e => e.department).filter(Boolean)));
    res.json({ success: true, data: uniqueDepts });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};
