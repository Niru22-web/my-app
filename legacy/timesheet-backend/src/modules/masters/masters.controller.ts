import { Request, Response } from 'express';
import { prisma } from '../../config/prisma';

// Helper to get the correct prisma model delegate
const getModelDelegate = (type: string): any => {
  switch (type.toLowerCase()) {
    case 'roles': return prisma.roleMaster;
    case 'designations': return prisma.designationMaster;
    case 'departments': return prisma.departmentMaster;
    case 'employment-types': return prisma.employmentTypeMaster;
    case 'shifts': return prisma.shiftMaster;
    case 'locations': return prisma.location;
    case 'entities': return prisma.entity;
    case 'currencies': return prisma.currency;
    case 'vendors': return prisma.vendor;
    default: return null;
  }
};

// Check if a master record is in use by any employee
const checkMasterInUse = async (type: string, id: string): Promise<boolean> => {
  const t = type.toLowerCase();
  try {
    if (t === 'roles') {
      const count = await prisma.employee.count({ where: { roleId: id } });
      return count > 0;
    } else if (t === 'designations') {
      const count = await prisma.employee.count({ where: { designationId: id } });
      return count > 0;
    } else if (t === 'departments') {
      const count = await prisma.employee.count({ where: { departmentId: id } });
      return count > 0;
    } else if (t === 'shifts') {
      const count = await prisma.employee.count({ where: { shiftId: id } });
      return count > 0;
    } else if (t === 'locations') {
      const count = await prisma.employee.count({ where: { locationId: id } });
      return count > 0;
    } else if (t === 'employment-types') {
      const count = await prisma.employeeProfile.count({ where: { employmentTypeId: id } });
      return count > 0;
    } else if (t === 'entities') {
      const invCount = await prisma.invoice.count({ where: { entityId: id } });
      const recCount = await prisma.receipt.count({ where: { entityId: id } });
      const ledCount = await prisma.ledger.count({ where: { entityId: id } });
      return (invCount + recCount + ledCount) > 0;
    } else if (t === 'currencies') {
      // Checked by code / name usage in transactions
      return false;
    } else if (t === 'vendors') {
      const count = await prisma.assetInventory.count({ where: { vendorId: id } });
      return count > 0;
    }
  } catch (err) {
    console.error(`Error checking use for ${type}:`, err);
  }
  return false;
};

// 1. List Master with search, pagination, and status filters
export const listMaster = async (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    const delegate = getModelDelegate(type);
    if (!delegate) {
      return res.status(400).json({ success: false, error: `Invalid master type: ${type}` });
    }

    const page = parseInt(req.query.page as string || '1');
    const limit = parseInt(req.query.limit as string || '10');
    const search = req.query.search as string || '';
    const status = req.query.status as string || 'all';

    const skip = (page - 1) * limit;
    const where: any = {};
    const tLower = type.toLowerCase();

    // Apply Status Filter
    if (tLower === 'entities') {
      if (status === 'active') where.status = 'ACTIVE';
      else if (status === 'inactive') where.status = 'INACTIVE';
    } else if (tLower !== 'currencies' && tLower !== 'vendors') {
      if (status === 'active') where.isActive = true;
      else if (status === 'inactive') where.isActive = false;
    }

    // Apply Search Filter
    if (search.trim() !== '') {
      if (tLower === 'vendors') {
        where.OR = [
          { vendorName: { contains: search, mode: 'insensitive' } },
          { company: { contains: search, mode: 'insensitive' } },
          { contactPerson: { contains: search, mode: 'insensitive' } }
        ];
      } else {
        const searchConditions: any[] = [
          { name: { contains: search, mode: 'insensitive' } }
        ];
        if (tLower !== 'currencies') {
          searchConditions.push({ description: { contains: search, mode: 'insensitive' } });
        }
        if (tLower === 'roles' || tLower === 'currencies') {
          searchConditions.push({ code: { contains: search, mode: 'insensitive' } });
        }
        where.OR = searchConditions;
      }
    }

    const [items, total] = await Promise.all([
      delegate.findMany({
        where,
        skip,
        take: limit,
        orderBy: tLower === 'currencies' ? { code: 'asc' } : { createdAt: 'desc' }
      }),
      delegate.count({ where })
    ]);

    // Normalize items to have consistent fields (name, isActive) for frontend table compatibility
    const normalizedItems = items.map((item: any) => {
      const normalized: any = { ...item };
      if (tLower === 'vendors') {
        normalized.name = item.vendorName;
        normalized.isActive = true; // Vendors are always active
      } else if (tLower === 'entities') {
        normalized.isActive = item.status === 'ACTIVE';
      } else if (tLower === 'currencies') {
        normalized.name = `${item.name} (${item.code})`;
        normalized.isActive = true;
      }
      return normalized;
    });

    res.json({
      success: true,
      data: normalizedItems,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    console.error('Error listing master:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch master data', details: error.message });
  }
};

// 2. Fetch Active Options (lightweight, no pagination, sorted alphabetically)
export const getMasterOptions = async (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    const delegate = getModelDelegate(type);
    if (!delegate) {
      return res.status(400).json({ success: false, error: `Invalid master type: ${type}` });
    }

    const tLower = type.toLowerCase();
    let where: any = {};
    if (tLower === 'entities') {
      where = { status: 'ACTIVE' };
    } else if (tLower !== 'currencies' && tLower !== 'vendors') {
      where = { isActive: true };
    }

    const items = await delegate.findMany({
      where,
      orderBy: tLower === 'vendors' ? { vendorName: 'asc' } : (tLower === 'currencies' ? { code: 'asc' } : { name: 'asc' })
    });

    const normalizedItems = items.map((item: any) => {
      const normalized: any = { ...item };
      if (tLower === 'vendors') {
        normalized.name = item.vendorName;
      }
      return normalized;
    });

    res.json({
      success: true,
      data: normalizedItems
    });
  } catch (error: any) {
    console.error('Error fetching master options:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch master options', details: error.message });
  }
};

// 3. Create Master record
export const createMaster = async (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    const delegate = getModelDelegate(type);
    if (!delegate) {
      return res.status(400).json({ success: false, error: `Invalid master type: ${type}` });
    }

    const tLower = type.toLowerCase();
    const { name, description, code, startTime, endTime, legalName, gstin, pan, address, msmeReg, symbol, company, email, phone, contactPerson } = req.body;

    const checkName = tLower === 'vendors' ? req.body.vendorName || name : name;
    if (!checkName || checkName.trim() === '') {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    // Name uniqueness check
    let existingByName;
    if (tLower === 'vendors') {
      existingByName = await delegate.findFirst({ where: { vendorName: checkName.trim() } });
    } else if (tLower === 'currencies') {
      existingByName = await delegate.findUnique({ where: { code: code.trim().toUpperCase() } });
    } else {
      existingByName = await delegate.findUnique({ where: { name: checkName.trim() } });
    }

    if (existingByName) {
      return res.status(400).json({ success: false, error: 'A record with this name/code already exists' });
    }

    const data: any = {};

    if (tLower === 'vendors') {
      data.vendorName = checkName.trim();
      data.company = company ? company.trim() : '';
      data.email = email ? email.trim() : null;
      data.phone = phone ? phone.trim() : null;
      data.address = address ? address.trim() : null;
      data.gstNumber = req.body.gstNumber ? req.body.gstNumber.trim() : null;
      data.contactPerson = contactPerson ? contactPerson.trim() : null;
    } else if (tLower === 'currencies') {
      data.code = code.trim().toUpperCase();
      data.name = name.trim();
      data.symbol = symbol ? symbol.trim() : null;
    } else if (tLower === 'entities') {
      data.name = name.trim();
      data.legalName = legalName ? legalName.trim() : null;
      data.gstin = gstin ? gstin.trim() : null;
      data.pan = pan ? pan.trim() : null;
      data.address = address ? address.trim() : null;
      data.msmeReg = msmeReg ? msmeReg.trim() : null;
      data.status = req.body.isActive === false ? 'INACTIVE' : 'ACTIVE';
    } else {
      data.name = name.trim();
      data.description = description ? description.trim() : null;
      data.isActive = req.body.isActive !== undefined ? !!req.body.isActive : true;

      // Role Specific
      if (tLower === 'roles') {
        if (!code || code.trim() === '') {
          return res.status(400).json({ success: false, error: 'Role Code is required' });
        }
        const normalizedCode = code.trim().toUpperCase();
        const existingByCode = await delegate.findUnique({ where: { code: normalizedCode } });
        if (existingByCode) {
          return res.status(400).json({ success: false, error: 'A role with this code already exists' });
        }
        data.code = normalizedCode;
      }

      // Shift Specific
      if (tLower === 'shifts') {
        if (!startTime || startTime.trim() === '') {
          return res.status(400).json({ success: false, error: 'Start Time is required' });
        }
        if (!endTime || endTime.trim() === '') {
          return res.status(400).json({ success: false, error: 'End Time is required' });
        }
        data.startTime = startTime.trim();
        data.endTime = endTime.trim();
      }
    }

    const created = await delegate.create({ data });
    res.status(201).json({ success: true, data: created });
  } catch (error: any) {
    console.error('Error creating master:', error);
    res.status(500).json({ success: false, error: 'Failed to create master record', details: error.message });
  }
};

// 4. Update Master record
export const updateMaster = async (req: Request, res: Response) => {
  try {
    const { type, id } = req.params;
    const delegate = getModelDelegate(type);
    if (!delegate) {
      return res.status(400).json({ success: false, error: `Invalid master type: ${type}` });
    }

    const existing = await delegate.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    const tLower = type.toLowerCase();
    const { name, description, code, startTime, endTime, isActive, legalName, gstin, pan, address, msmeReg, symbol, company, email, phone, contactPerson } = req.body;

    const data: any = {};

    if (tLower === 'vendors') {
      const checkName = req.body.vendorName || name;
      if (checkName !== undefined) {
        if (checkName.trim() === '') return res.status(400).json({ success: false, error: 'Name cannot be empty' });
        data.vendorName = checkName.trim();
      }
      if (company !== undefined) data.company = company.trim();
      if (email !== undefined) data.email = email ? email.trim() : null;
      if (phone !== undefined) data.phone = phone ? phone.trim() : null;
      if (address !== undefined) data.address = address ? address.trim() : null;
      if (req.body.gstNumber !== undefined) data.gstNumber = req.body.gstNumber ? req.body.gstNumber.trim() : null;
      if (contactPerson !== undefined) data.contactPerson = contactPerson ? contactPerson.trim() : null;
    } else if (tLower === 'currencies') {
      if (name !== undefined) data.name = name.trim();
      if (code !== undefined) data.code = code.trim().toUpperCase();
      if (symbol !== undefined) data.symbol = symbol ? symbol.trim() : null;
    } else if (tLower === 'entities') {
      if (name !== undefined) {
        if (name.trim() === '') return res.status(400).json({ success: false, error: 'Name cannot be empty' });
        data.name = name.trim();
      }
      if (legalName !== undefined) data.legalName = legalName ? legalName.trim() : null;
      if (gstin !== undefined) data.gstin = gstin ? gstin.trim() : null;
      if (pan !== undefined) data.pan = pan ? pan.trim() : null;
      if (address !== undefined) data.address = address ? address.trim() : null;
      if (msmeReg !== undefined) data.msmeReg = msmeReg ? msmeReg.trim() : null;
      if (isActive !== undefined) data.status = isActive ? 'ACTIVE' : 'INACTIVE';
    } else {
      if (name !== undefined) {
        if (name.trim() === '') return res.status(400).json({ success: false, error: 'Name cannot be empty' });
        
        // Check for uniqueness
        const existingByName = await delegate.findUnique({ where: { name: name.trim() } });
        if (existingByName && existingByName.id !== id) {
          return res.status(400).json({ success: false, error: 'A record with this name already exists' });
        }
        data.name = name.trim();
      }

      if (description !== undefined) {
        data.description = description ? description.trim() : null;
      }

      if (isActive !== undefined) {
        data.isActive = !!isActive;
      }

      // Role Specific
      if (tLower === 'roles' && code !== undefined) {
        if (code.trim() === '') return res.status(400).json({ success: false, error: 'Role Code cannot be empty' });
        const normalizedCode = code.trim().toUpperCase();
        const existingByCode = await delegate.findUnique({ where: { code: normalizedCode } });
        if (existingByCode && existingByCode.id !== id) {
          return res.status(400).json({ success: false, error: 'A role with this code already exists' });
        }
        data.code = normalizedCode;
      }

      // Shift Specific
      if (tLower === 'shifts') {
        if (startTime !== undefined) {
          if (startTime.trim() === '') return res.status(400).json({ success: false, error: 'Start Time cannot be empty' });
          data.startTime = startTime.trim();
        }
        if (endTime !== undefined) {
          if (endTime.trim() === '') return res.status(400).json({ success: false, error: 'End Time cannot be empty' });
          data.endTime = endTime.trim();
        }
      }
    }

    const updated = await delegate.update({
      where: { id },
      data
    });

    res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('Error updating master:', error);
    res.status(500).json({ success: false, error: 'Failed to update master record', details: error.message });
  }
};

// 5. Delete Master record (with in-use prevention check)
export const deleteMaster = async (req: Request, res: Response) => {
  try {
    const { type, id } = req.params;
    const delegate = getModelDelegate(type);
    if (!delegate) {
      return res.status(400).json({ success: false, error: `Invalid master type: ${type}` });
    }

    const existing = await delegate.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    // Check if the record is currently in use
    const isInUse = await checkMasterInUse(type, id);
    if (isInUse) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete this record because it is currently in use in other parts of the system.`
      });
    }

    await delegate.delete({ where: { id } });
    res.json({ success: true, message: 'Record deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting master:', error);
    res.status(500).json({ success: false, error: 'Failed to delete master record', details: error.message });
  }
};

// 6. Toggle status (Patch route for activate/deactivate)
export const toggleMasterStatus = async (req: Request, res: Response) => {
  try {
    const { type, id } = req.params;
    const delegate = getModelDelegate(type);
    if (!delegate) {
      return res.status(400).json({ success: false, error: `Invalid master type: ${type}` });
    }

    const existing = await delegate.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    const tLower = type.toLowerCase();
    if (tLower === 'entities') {
      const newStatus = existing.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      const updated = await delegate.update({
        where: { id },
        data: { status: newStatus }
      });
      return res.json({ success: true, data: updated, message: `Status updated to ${newStatus}` });
    } else if (tLower === 'currencies' || tLower === 'vendors') {
      // Currencies and vendors do not have active/inactive toggles
      return res.json({ success: true, data: existing, message: 'Status toggle not supported for this master' });
    }

    const updated = await delegate.update({
      where: { id },
      data: { isActive: !existing.isActive }
    });

    res.json({ success: true, data: updated, message: `Status updated to ${updated.isActive ? 'Active' : 'Inactive'}` });
  } catch (error: any) {
    console.error('Error toggling master status:', error);
    res.status(500).json({ success: false, error: 'Failed to update status', details: error.message });
  }
};
