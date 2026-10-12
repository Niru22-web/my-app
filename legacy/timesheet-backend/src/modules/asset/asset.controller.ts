import { Request, Response } from 'express';
import { prisma } from '../../config/prisma';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
    email: string;
  };
}

// ✅ Role Access: Admin (Full), HR (View/Export), IT (Assign/Update), Employee (Self-Add)
const hasFullAccess = (role: string) => ['admin', 'owner', 'partner', 'it', 'hr', 'manager', 'accountant', 'accounts'].includes(role?.toLowerCase());
const hasITAccess = (role: string) => ['admin', 'owner', 'partner', 'it', 'hr', 'manager', 'accountant', 'accounts'].includes(role?.toLowerCase());
const hasViewAccess = (role: string) => ['admin', 'owner', 'partner', 'it', 'hr', 'employee', 'manager', 'accountant', 'accounts'].includes(role?.toLowerCase());

// ✅ Get All Assets (AssetInventory)
export const getAssets = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || !hasViewAccess(user.role)) {
      return res.status(403).json({ success: false, message: "Forbidden: Access denied" });
    }

    const { status, assetType, search } = req.query;

    const where: Prisma.AssetInventoryWhereInput = { isDeleted: false };
    if (status) where.status = status as string;
    if (assetType) where.type = assetType as string;

    if (search) {
      where.OR = [
        { assetName: { contains: search as string, mode: 'insensitive' } },
        { serialNumber: { contains: search as string, mode: 'insensitive' } },
        { assetId: { contains: search as string, mode: 'insensitive' } },
        { officeTagNo: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    const list = await prisma.assetInventory.findMany({
      where,
      include: {
        vendorRelation: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, data: list });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Create Asset (AssetInventory)
export const createAsset = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || !hasITAccess(user.role)) {
      return res.status(403).json({ success: false, message: "Forbidden: Access denied" });
    }
    
    const { 
      assetId, assetName, category, type, serialNumber, officeTagNo,
      purchaseDate, purchaseCost, vendorId, warrantyExpiry, status, location, description, condition
    } = req.body;

    if (!assetName || !serialNumber || !category || !type) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // Check duplicate serial number
    const existing = await prisma.assetInventory.findUnique({
      where: { serialNumber }
    });
    if (existing) {
      return res.status(400).json({ success: false, message: "An asset with this serial number already exists" });
    }

    const asset = await prisma.assetInventory.create({
      data: {
        assetId: (assetId && assetId.trim()) || (officeTagNo && officeTagNo.trim()) || null,
        assetName,
        category,
        type,
        serialNumber,
        officeTagNo: officeTagNo ? officeTagNo.trim() : null,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
        purchaseCost: purchaseCost ? parseFloat(purchaseCost) : null,
        vendorId: vendorId || null,
        warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null,
        status: status || 'Available',
        location: location || 'Headquarters',
        description: description || null,
        condition: condition || 'New'
      }
    });

    res.status(201).json({ success: true, data: asset });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Update Asset (AssetInventory)
export const updateAsset = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || !hasITAccess(user.role)) {
      return res.status(403).json({ success: false, message: "Forbidden: Access denied" });
    }
    const { id } = req.params;
    const { 
      assetId, assetName, category, type, serialNumber, officeTagNo,
      purchaseDate, purchaseCost, vendorId, warrantyExpiry, status, location, description, condition
    } = req.body;

    const existing = await prisma.assetInventory.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Asset not found" });
    }

    const updated = await prisma.assetInventory.update({
      where: { id },
      data: {
        assetId: assetId !== undefined ? assetId : undefined,
        assetName: assetName !== undefined ? assetName : undefined,
        category: category !== undefined ? category : undefined,
        type: type !== undefined ? type : undefined,
        serialNumber: serialNumber !== undefined ? serialNumber : undefined,
        officeTagNo: officeTagNo !== undefined ? officeTagNo : undefined,
        purchaseDate: purchaseDate !== undefined ? (purchaseDate ? new Date(purchaseDate) : null) : undefined,
        purchaseCost: purchaseCost !== undefined ? (purchaseCost ? parseFloat(purchaseCost) : null) : undefined,
        vendorId: vendorId !== undefined ? (vendorId || null) : undefined,
        warrantyExpiry: warrantyExpiry !== undefined ? (warrantyExpiry ? new Date(warrantyExpiry) : null) : undefined,
        status: status !== undefined ? status : undefined,
        location: location !== undefined ? location : undefined,
        description: description !== undefined ? description : undefined,
        condition: condition !== undefined ? condition : undefined
      }
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Delete Asset (AssetInventory)
export const deleteAsset = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || !hasFullAccess(user.role)) {
      return res.status(403).json({ success: false, message: "Forbidden: Only Admins can delete asset records" });
    }
    const { id } = req.params;

    const existing = await prisma.assetInventory.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Asset not found" });
    }

    // Delete associated allocations and soft-delete the asset in a transaction
    await prisma.$transaction([
      prisma.assetAllocation.deleteMany({
        where: { inventoryId: id }
      }),
      prisma.assetInventory.update({
        where: { id },
        data: { isDeleted: true, status: 'Retired' }
      })
    ]);

    res.json({ success: true, message: "Asset retired and all assignment records removed successfully" });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Asset Dashboard Stats (AssetInventory)
export const getAssetDashboard = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || !hasViewAccess(user.role)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const [
      total, available, assigned, maintenance, retired, lost,
      byType, byStatus, byCategory
    ] = await Promise.all([
      prisma.assetInventory.count({ where: { isDeleted: false } }),
      prisma.assetInventory.count({ where: { status: 'Available', isDeleted: false } }),
      prisma.assetInventory.count({ where: { status: 'Assigned', isDeleted: false } }),
      prisma.assetInventory.count({ where: { status: 'Maintenance', isDeleted: false } }),
      prisma.assetInventory.count({ where: { status: 'Retired', isDeleted: false } }),
      prisma.assetInventory.count({ where: { status: 'Lost', isDeleted: false } }),
      prisma.assetInventory.groupBy({
        by: ['type'],
        where: { isDeleted: false },
        _count: { id: true }
      }),
      prisma.assetInventory.groupBy({
        by: ['status'],
        where: { isDeleted: false },
        _count: { id: true }
      }),
      prisma.assetInventory.groupBy({
        by: ['category'],
        where: { isDeleted: false },
        _count: { id: true }
      })
    ]);

    res.json({
      success: true,
      data: {
        summary: {
          total,
          available,
          assigned,
          maintenance,
          retired,
          lost
        },
        byType: byType.map((b) => ({ type: b.type, count: b._count.id })),
        byCategory: byCategory.map((b) => ({ category: b.category, count: b._count.id })),
        statusDistribution: byStatus.map((b) => ({ status: b.status, count: b._count.id }))
      }
    });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Export Assets to Excel (AssetInventory)
export const exportAssets = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || !hasViewAccess(user.role)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const assets = await prisma.assetInventory.findMany({
      where: { isDeleted: false },
      include: { vendorRelation: true }
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Asset Inventory');

    worksheet.columns = [
      { header: 'Asset ID', key: 'assetId', width: 15 },
      { header: 'Asset Name', key: 'assetName', width: 25 },
      { header: 'Category', key: 'category', width: 15 },
      { header: 'Type', key: 'type', width: 15 },
      { header: 'Serial Number', key: 'serialNumber', width: 20 },
      { header: 'Office Tag No', key: 'officeTagNo', width: 20 },
      { header: 'Purchase Date', key: 'purchaseDate', width: 15 },
      { header: 'Purchase Cost (INR)', key: 'purchaseCost', width: 15 },
      { header: 'Vendor', key: 'vendorName', width: 20 },
      { header: 'Warranty Expiry', key: 'warrantyExpiry', width: 15 },
      { header: 'Location', key: 'location', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Condition', key: 'condition', width: 15 },
      { header: 'Description', key: 'description', width: 30 }
    ];

    assets.forEach((asset) => {
      worksheet.addRow({
        assetId: asset.assetId,
        assetName: asset.assetName,
        category: asset.category,
        type: asset.type,
        serialNumber: asset.serialNumber,
        officeTagNo: asset.officeTagNo,
        purchaseDate: asset.purchaseDate ? asset.purchaseDate.toISOString().split('T')[0] : '',
        purchaseCost: asset.purchaseCost,
        vendorName: asset.vendorRelation?.vendorName || '',
        warrantyExpiry: asset.warrantyExpiry ? asset.warrantyExpiry.toISOString().split('T')[0] : '',
        location: asset.location,
        status: asset.status,
        condition: asset.condition,
        description: asset.description
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=asset_inventory.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

// Helper functions for parsing Excel values
const parseExcelDate = (val: any): Date | null => {
  if (!val) return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  const dateStr = val.toString().trim();
  if (dateStr === '') return null;
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
};

const parseExcelFloat = (val: any): number | null => {
  if (val === undefined || val === null) return null;
  if (typeof val === 'number') return val;
  const parsed = parseFloat(val.toString().trim());
  return isNaN(parsed) ? null : parsed;
};

const getCleanCellValue = (val: any): string => {
  if (val === undefined || val === null) return '';
  if (typeof val === 'object') {
    if ('result' in val) return val.result?.toString().trim() || '';
    if ('text' in val) return val.text?.toString().trim() || '';
    if ('richText' in val && Array.isArray(val.richText)) {
      return val.richText.map((rt: any) => rt.text || '').join('').trim();
    }
  }
  return val.toString().trim();
};

// ✅ Import Assets from Excel (AssetInventory)
export const importAssets = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || !hasITAccess(user.role)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const worksheet = workbook.getWorksheet(1);

    const errors: string[] = [];
    const finalAssets = [];
    const seenSerials = new Set<string>();

    // Find maximum numeric suffix of existing assetIds in database to ensure sequence continuity
    const allAssets = await prisma.assetInventory.findMany({
      select: { assetId: true }
    });
    
    let maxNum = 1000;
    for (const ast of allAssets) {
      if (ast.assetId) {
        const match = ast.assetId.match(/\d+/);
        if (match) {
          const num = parseInt(match[0], 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      }
    }
    let nextNum = maxNum + 1;
    
    const rowCount = worksheet?.rowCount || 0;
    for (let i = 2; i <= rowCount; i++) {
        const row = worksheet?.getRow(i);
        if (!row) continue;
        
        const assetName = getCleanCellValue(row.getCell(1).value);
        const category = getCleanCellValue(row.getCell(2).value);
        const type = getCleanCellValue(row.getCell(3).value);
        const serialNumber = getCleanCellValue(row.getCell(4).value);
        const officeTagNo = getCleanCellValue(row.getCell(5).value);

        // If the row is completely empty, skip it silently
        if (!serialNumber && !assetName && !category && !type && !officeTagNo) {
            continue;
        }

        if (!serialNumber || !assetName || !category || !type) {
            errors.push(`Row ${i}: Missing required fields (Name, Category, Type, Serial Number)`);
            continue;
        }

        // Validate unique serial number case-insensitively (internal sheet duplicates & DB duplicates)
        const serialNumberUpper = serialNumber.toUpperCase();
        if (seenSerials.has(serialNumberUpper)) {
            errors.push(`Row ${i}: Serial number ${serialNumber} is duplicated within the spreadsheet`);
            continue;
        }
        seenSerials.add(serialNumberUpper);

        const existingSerial = await prisma.assetInventory.findFirst({
            where: {
                serialNumber: {
                    equals: serialNumber,
                    mode: 'insensitive'
                }
            }
        });
        if (existingSerial) {
            errors.push(`Row ${i}: Serial number ${serialNumber} already exists in the database`);
            continue;
        }

        // Generate sequential Asset ID (e.g. AST-1011)
        const finalAssetId = `AST-${nextNum}`;
        nextNum++;

        const purchaseDateVal = row.getCell(6).value;
        const purchaseCostVal = row.getCell(7).value;
        const vendorIdVal = getCleanCellValue(row.getCell(8).value);
        const warrantyExpiryVal = row.getCell(9).value;

        finalAssets.push({
            assetId: finalAssetId,
            assetName,
            category,
            type,
            serialNumber,
            officeTagNo: officeTagNo || null,
            purchaseDate: parseExcelDate(purchaseDateVal),
            purchaseCost: parseExcelFloat(purchaseCostVal),
            vendorId: vendorIdVal || null,
            warrantyExpiry: parseExcelDate(warrantyExpiryVal),
            location: getCleanCellValue(row.getCell(10).value) || 'Headquarters',
            status: getCleanCellValue(row.getCell(11).value) || 'Available',
            condition: getCleanCellValue(row.getCell(12).value) || 'New',
            description: getCleanCellValue(row.getCell(13).value) || null
        });
    }

    if (finalAssets.length > 0) {
        await prisma.assetInventory.createMany({ data: finalAssets });
    }

    res.json({ 
        success: true, 
        message: `${finalAssets.length} assets imported successfully.`,
        errors: errors.length > 0 ? errors : null
    });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};


// ✅ Download Excel Template (AssetInventory)
export const getTemplate = async (req: Request, res: Response) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Asset Template');

    worksheet.columns = [
      { header: 'Asset Name', key: 'assetName', width: 25 },
      { header: 'Category', key: 'category', width: 15 },
      { header: 'Type', key: 'type', width: 15 },
      { header: 'Serial Number', key: 'serialNumber', width: 20 },
      { header: 'Office Tag No', key: 'officeTagNo', width: 20 },
      { header: 'Purchase Date (YYYY-MM-DD)', key: 'purchaseDate', width: 25 },
      { header: 'Purchase Cost', key: 'purchaseCost', width: 15 },
      { header: 'Vendor ID', key: 'vendorId', width: 15 },
      { header: 'Warranty Expiry (YYYY-MM-DD)', key: 'warrantyExpiry', width: 25 },
      { header: 'Location', key: 'location', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Condition', key: 'condition', width: 15 },
      { header: 'Description', key: 'description', width: 30 }
    ];

    // Sample Row
    worksheet.addRow({
      assetName: 'MacBook Pro 16',
      category: 'Hardware',
      type: 'Laptop',
      serialNumber: 'C02FXXXXXX',
      officeTagNo: 'ASA/IT/2026/089',
      purchaseDate: '2026-05-01',
      purchaseCost: 180000,
      vendorId: '',
      warrantyExpiry: '2027-05-01',
      location: 'Headquarters',
      status: 'Available',
      condition: 'New',
      description: 'M3 Pro 18GB Space Black'
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=asset_inventory_template.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};
