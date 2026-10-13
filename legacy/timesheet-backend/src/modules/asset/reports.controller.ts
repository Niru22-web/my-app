import { Request, Response } from 'express';
import { prisma } from '../../config/prisma';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';

const sanitizeReportEmployee = (emp: any) => {
  if (!emp || typeof emp !== 'object') return emp;
  const { password, ...safeEmp } = emp;
  return safeEmp;
};

export const getReportData = async (req: Request, res: Response) => {
  try {
    const { type, startDate, endDate, category } = req.query;

    const dateFilter: Prisma.DateTimeFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate as string);
    if (endDate) dateFilter.lte = new Date(endDate as string);

    let data: unknown[] = [];

    switch (type) {
      case 'Asset': {
        const where: Prisma.AssetInventoryWhereInput = { isDeleted: false };
        if (startDate || endDate) {
          where.createdAt = dateFilter;
        }
        if (category && category !== 'All') {
          where.category = category as string;
        }
        const rows = await prisma.assetInventory.findMany({
          where,
          include: {
            allocations: {
              where: { status: 'Allocated' },
              include: { employee: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        });
        data = rows.map((row: any) => ({
          ...row,
          allocations: Array.isArray(row.allocations)
            ? row.allocations.map((alloc: any) => ({
                ...alloc,
                employee: sanitizeReportEmployee(alloc.employee)
              }))
            : row.allocations
        }));
        break;
      }
      case 'Assignment': {
        const where: Prisma.AssetAllocationWhereInput = {};
        if (startDate || endDate) {
          where.allocatedAt = dateFilter;
        }
        const rows = await prisma.assetAllocation.findMany({
          where,
          include: {
            employee: true,
            inventory: true
          },
          orderBy: { allocatedAt: 'desc' }
        });
        data = rows.map((row: any) => ({
          ...row,
          employee: sanitizeReportEmployee(row.employee)
        }));
        break;
      }
      case 'Maintenance': {
        const where: Prisma.AssetMaintenanceWhereInput = {};
        if (startDate || endDate) {
          where.date = dateFilter;
        }
        data = await prisma.assetMaintenance.findMany({
          where,
          include: {
            inventory: true
          },
          orderBy: { date: 'desc' }
        });
        break;
      }
      case 'Ticket': {
        const where: Prisma.TicketWhereInput = {};
        if (startDate || endDate) {
          where.createdAt = dateFilter;
        }
        const rows = await prisma.ticket.findMany({
          where,
          include: {
            createdBy: true
          },
          orderBy: { createdAt: 'desc' }
        });
        data = rows.map((row: any) => ({
          ...row,
          createdBy: sanitizeReportEmployee(row.createdBy)
        }));
        break;
      }
      case 'Inventory':
      default: {
        // Stock report
        const where: Prisma.AssetInventoryWhereInput = { isDeleted: false };
        data = await prisma.assetInventory.findMany({
          where,
          orderBy: { assetName: 'asc' }
        });
        break;
      }
    }

    res.json({ success: true, data });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

export const exportReportExcel = async (req: Request, res: Response) => {
  try {
    const { type, startDate, endDate } = req.query;

    const dateFilter: Prisma.DateTimeFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate as string);
    if (endDate) dateFilter.lte = new Date(endDate as string);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`${type} Report`);

    if (type === 'Asset') {
      worksheet.columns = [
        { header: 'Asset Name', key: 'assetName', width: 25 },
        { header: 'Category', key: 'category', width: 15 },
        { header: 'Type', key: 'type', width: 15 },
        { header: 'Serial Number', key: 'serialNumber', width: 20 },
        { header: 'Office Tag No', key: 'officeTagNo', width: 20 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Condition', key: 'condition', width: 15 },
        { header: 'Cost', key: 'purchaseCost', width: 15 },
        { header: 'Purchase Date', key: 'purchaseDate', width: 15 }
      ];

      const assets = await prisma.assetInventory.findMany({
        where: { isDeleted: false },
        orderBy: { createdAt: 'desc' }
      });

      assets.forEach((a) => {
        worksheet.addRow({
          assetName: a.assetName,
          category: a.category,
          type: a.type,
          serialNumber: a.serialNumber,
          officeTagNo: a.officeTagNo || '',
          status: a.status,
          condition: a.condition,
          purchaseCost: a.purchaseCost || 0,
          purchaseDate: a.purchaseDate ? a.purchaseDate.toISOString().split('T')[0] : ''
        });
      });
    } else if (type === 'Assignment') {
      worksheet.columns = [
        { header: 'Employee Name', key: 'employeeName', width: 25 },
        { header: 'Department', key: 'department', width: 15 },
        { header: 'Asset Name', key: 'assetName', width: 25 },
        { header: 'Serial Number', key: 'serialNumber', width: 20 },
        { header: 'Allocated Date', key: 'allocatedAt', width: 15 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Returned Date', key: 'returnedAt', width: 15 }
      ];

      const allocations = await prisma.assetAllocation.findMany({
        include: { employee: true, inventory: true },
        orderBy: { allocatedAt: 'desc' }
      });

      allocations.forEach((al) => {
        worksheet.addRow({
          employeeName: `${al.employee.firstName} ${al.employee.lastName}`,
          department: al.employee.department,
          assetName: al.inventory.assetName,
          serialNumber: al.inventory.serialNumber,
          allocatedAt: al.allocatedAt ? al.allocatedAt.toISOString().split('T')[0] : '',
          status: al.status,
          returnedAt: al.returnedAt ? al.returnedAt.toISOString().split('T')[0] : 'N/A'
        });
      });
    } else {
      // General Inventory summary
      worksheet.columns = [
        { header: 'Asset Type', key: 'type', width: 20 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Status', key: 'status', width: 20 },
        { header: 'Count', key: 'count', width: 15 }
      ];

      const stats = await prisma.assetInventory.groupBy({
        by: ['type', 'category', 'status'],
        where: { isDeleted: false },
        _count: { id: true }
      });

      stats.forEach((s) => {
        worksheet.addRow({
          type: s.type,
          category: s.category,
          status: s.status,
          count: s._count.id
        });
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${type}_report.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};
