import { Request, Response } from 'express';
import { prisma } from '../../config/prisma';
import ExcelJS from 'exceljs';
import { triggerNotification } from '../../services/notification.service';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
    email: string;
  };
}

// Get current allocations
export const getAllocations = async (req: Request, res: Response) => {
  try {
    const list = await prisma.assetAllocation.findMany({
      where: {
        inventory: {
          isDeleted: false
        }
      },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeId: true, department: true }
        },
        inventory: true
      },
      orderBy: { allocatedAt: 'desc' }
    });
    res.json({ success: true, data: list });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

// Create direct allocation (assignment)
export const assignAssetDirectly = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const { employeeId, inventoryId, remarks } = req.body;
    if (!employeeId || !inventoryId) {
      return res.status(400).json({ success: false, message: 'Employee ID and Asset (Inventory ID) are required' });
    }

    const [employee, asset] = await Promise.all([
      prisma.employee.findUnique({ where: { id: employeeId } }),
      prisma.assetInventory.findUnique({ where: { id: inventoryId } })
    ]);

    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found' });

    // Prevent duplicate assignment / unavailable assets
    if (asset.status !== 'Available') {
      return res.status(400).json({
        success: false,
        message: `Asset "${asset.assetName}" is currently not available (Status: ${asset.status})`
      });
    }

    // Create a dummy Request ID since allocations require a request reference
    const directRequestId = `DIR-${Math.floor(100000 + Math.random() * 900000)}`;

    const request = await prisma.assetRequest.create({
      data: {
        requestId: directRequestId,
        employeeId: employeeId,
        assetType: asset.type,
        assetCategory: asset.category,
        title: `Direct Assignment of ${asset.assetName}`,
        description: 'Assigned directly by administrator',
        status: 'Allocated'
      }
    });

    const result = await prisma.$transaction([
      // 1. Create allocation
      prisma.assetAllocation.create({
        data: {
          requestId: request.id,
          inventoryId,
          employeeId,
          status: 'Allocated',
          remarks: remarks || 'Assigned directly by admin'
        }
      }),
      // 2. Update asset inventory status
      prisma.assetInventory.update({
        where: { id: inventoryId },
        data: { status: 'Allocated' }
      }),
      // 3. Track history
      prisma.assetInventoryHistory.create({
        data: {
          inventoryId,
          action: 'AllocatedDirect',
          status: 'Allocated',
          performedById: user.id,
          remarks: `Asset directly assigned to employee ${employee.firstName} ${employee.lastName}`
        }
      })
    ]);

    // Trigger in-app notification
    try {
      await triggerNotification({
        userId: employeeId,
        title: 'Asset Allocated 💻',
        message: `An asset "${asset.assetName}" has been directly allocated to you.`,
        type: 'asset_allocated_direct',
        module: 'IT',
        priority: 'High',
        actionUrl: '/portal/profile',
        relatedId: asset.id
      });
    } catch (e) {
      console.error('Error triggering direct assignment notification:', e);
    }

    res.status(201).json({ success: true, data: result[0], message: 'Asset assigned successfully' });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

// Return asset
export const returnAssetDirectly = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const { allocationId } = req.params;
    const { condition, remarks } = req.body;

    const allocation = await prisma.assetAllocation.findUnique({
      where: { id: allocationId },
      include: { inventory: true, employee: true }
    });

    if (!allocation) return res.status(404).json({ success: false, message: 'Allocation record not found' });

    await prisma.$transaction([
      // 1. Update allocation status
      prisma.assetAllocation.update({
        where: { id: allocationId },
        data: {
          status: 'Returned',
          returnedAt: new Date(),
          remarks: remarks || 'Returned directly to admin'
        }
      }),
      // 2. Update inventory status to Available
      prisma.assetInventory.update({
        where: { id: allocation.inventoryId },
        data: {
          status: 'Available',
          condition: condition || allocation.inventory.condition
        }
      }),
      // 3. Add to inventory history
      prisma.assetInventoryHistory.create({
        data: {
          inventoryId: allocation.inventoryId,
          action: 'ReturnedDirect',
          status: 'Available',
          performedById: user.id,
          remarks: `Asset returned from ${allocation.employee.firstName} ${allocation.employee.lastName}. Condition: ${condition || 'Good'}`
        }
      })
    ]);

    res.json({ success: true, message: 'Asset returned and marked as Available' });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get personal allocations for the logged in employee/partner
export const getMyAllocations = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const list = await prisma.assetAllocation.findMany({
      where: {
        employeeId: user.id,
        status: { in: ['Allocated', 'Assigned'] },
        inventory: {
          isDeleted: false
        }
      },
      include: {
        inventory: true
      },
      orderBy: { allocatedAt: 'desc' }
    });

    res.json({ success: true, data: list });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

// Self register an asset already in possession
export const selfRegisterAsset = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { assetName, category, type, serialNumber, officeTagNo, condition, remarks, description } = req.body;

    if (!assetName || !category || !type || !serialNumber) {
      return res.status(400).json({ success: false, message: 'Asset Name, Category, Type, and Serial Number are required' });
    }

    // Verify unique serial number
    const existing = await prisma.assetInventory.findUnique({
      where: { serialNumber }
    });
    if (existing) {
      return res.status(400).json({ success: false, message: 'An asset with this serial number already exists in the inventory.' });
    }

    const employee = await prisma.employee.findUnique({
      where: { id: user.id }
    });
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee profile not found' });
    }

    const regRequestId = `REG-${Math.floor(100000 + Math.random() * 900000)}`;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create asset inventory item
      const asset = await tx.assetInventory.create({
        data: {
          assetId: (officeTagNo && officeTagNo.trim()) || null,
          assetName,
          category,
          type,
          serialNumber,
          officeTagNo: officeTagNo || null,
          condition: condition || 'Good',
          status: 'Allocated',
          description: description || 'Self-registered asset in possession',
          location: 'Headquarters',
          remarks: remarks || 'Self-registered by user'
        }
      });

      // 2. Create self-registration asset request
      const request = await tx.assetRequest.create({
        data: {
          requestId: regRequestId,
          employeeId: employee.id,
          assetType: type,
          assetCategory: category,
          title: `Self Registration: ${assetName}`,
          description: description || 'Self-registered asset already in possession',
          status: 'Allocated'
        }
      });

      // 3. Create asset allocation
      const allocation = await tx.assetAllocation.create({
        data: {
          requestId: request.id,
          inventoryId: asset.id,
          employeeId: employee.id,
          status: 'Allocated',
          remarks: remarks || 'Self-registered by employee'
        }
      });

      // 4. Track history
      await tx.assetInventoryHistory.create({
        data: {
          inventoryId: asset.id,
          action: 'SelfRegistered',
          status: 'Allocated',
          performedById: employee.id,
          remarks: `Asset self-registered and allocated to ${employee.firstName} ${employee.lastName}`
        }
      });

      return { asset, allocation };
    });

    res.status(201).json({
      success: true,
      message: 'Asset registered and allocated successfully.',
      data: result
    });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
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

// ✅ Export All Allocations to Excel
export const exportAllocations = async (req: Request, res: Response) => {
  try {
    const list = await prisma.assetAllocation.findMany({
      where: { inventory: { isDeleted: false } },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeId: true, department: true } },
        inventory: true
      },
      orderBy: { allocatedAt: 'desc' }
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Asset Allocations');

    worksheet.columns = [
      { header: 'Employee Name', key: 'employeeName', width: 25 },
      { header: 'Employee ID', key: 'employeeId', width: 15 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Asset Name', key: 'assetName', width: 25 },
      { header: 'Serial Number', key: 'serialNumber', width: 20 },
      { header: 'Office Tag No', key: 'officeTagNo', width: 20 },
      { header: 'Category', key: 'category', width: 15 },
      { header: 'Type', key: 'type', width: 15 },
      { header: 'Allocated At', key: 'allocatedAt', width: 18 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Remarks', key: 'remarks', width: 35 }
    ];

    list.forEach((alloc) => {
      const empName = alloc.employee
        ? `${alloc.employee.firstName} ${alloc.employee.lastName}`
        : 'Unassigned';
      worksheet.addRow({
        employeeName: empName,
        employeeId: alloc.employee?.employeeId || '',
        department: alloc.employee?.department || '',
        assetName: alloc.inventory?.assetName || '',
        serialNumber: alloc.inventory?.serialNumber || '',
        officeTagNo: alloc.inventory?.officeTagNo || '',
        category: alloc.inventory?.category || '',
        type: alloc.inventory?.type || '',
        allocatedAt: alloc.allocatedAt ? alloc.allocatedAt.toISOString().split('T')[0] : '',
        status: alloc.status,
        remarks: alloc.remarks || ''
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=asset_allocations_export.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Download Excel Template for Asset Assignment
export const getAllocationTemplate = async (req: Request, res: Response) => {
  try {
    const [availableAssets, employees] = await Promise.all([
      prisma.assetInventory.findMany({
        where: {
          status: 'Available',
          isDeleted: false
        },
        select: {
          assetId: true,
          serialNumber: true,
          assetName: true,
          type: true,
          category: true
        },
        orderBy: {
          serialNumber: 'asc'
        }
      }),
      prisma.employee.findMany({
        select: {
          firstName: true,
          lastName: true,
          officeEmail: true,
          employeeId: true
        },
        orderBy: {
          firstName: 'asc'
        }
      })
    ]);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Assignment Template');

    worksheet.columns = [
      { header: 'Employee Email', key: 'employeeIdentifier', width: 30 },
      { header: 'Asset ID', key: 'assetIdentifier', width: 30 },
      { header: 'Remarks', key: 'remarks', width: 40 }
    ];

    // Sample Row
    worksheet.addRow({
      employeeIdentifier: 'john.doe@company.com',
      assetIdentifier: 'AST-1009',
      remarks: 'Laptop assigned for software development'
    });

    // Add Employees sheet for reference dropdown
    const empSheet = workbook.addWorksheet('Employees');
    empSheet.columns = [
      { header: 'Employee Name', key: 'name', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Employee ID', key: 'employeeId', width: 15 }
    ];
    employees.forEach(emp => {
      empSheet.addRow({
        name: `${emp.firstName} ${emp.lastName}`,
        email: emp.officeEmail,
        employeeId: emp.employeeId
      });
    });

    // Add Assets sheet for reference dropdown
    const assetSheet = workbook.addWorksheet('Assets');
    assetSheet.columns = [
      { header: 'Asset ID', key: 'assetId', width: 15 },
      { header: 'Serial Number', key: 'serialNumber', width: 20 },
      { header: 'Asset Name', key: 'assetName', width: 25 },
      { header: 'Type', key: 'type', width: 15 },
      { header: 'Category', key: 'category', width: 15 }
    ];
    availableAssets.forEach(asset => {
      assetSheet.addRow({
        assetId: asset.assetId || asset.serialNumber,
        serialNumber: asset.serialNumber,
        assetName: asset.assetName,
        type: asset.type,
        category: asset.category
      });
    });

    // Set validation on input cells (rows 2 to 100)
    for (let i = 2; i <= 100; i++) {
      if (employees.length > 0) {
        worksheet.getCell(`A${i}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`='Employees'!$B$2:$B$${employees.length + 1}`],
          showErrorMessage: true,
          errorTitle: 'Invalid Employee',
          error: 'Please select an employee email from the list.'
        };
      }
      if (availableAssets.length > 0) {
        worksheet.getCell(`B${i}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`='Assets'!$A$2:$A$${availableAssets.length + 1}`],
          showErrorMessage: true,
          errorTitle: 'Invalid Asset',
          error: 'Please select an available Asset ID from the list.'
        };
      }
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=asset_assignment_template.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Import Asset Assignments from Excel
export const importAllocations = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const worksheet = workbook.getWorksheet(1);

    const errors: string[] = [];
    const successfulAssignments: string[] = [];
    const seenAssetIds = new Set<string>();

    const rowCount = worksheet?.rowCount || 0;
    const assignmentsToProcess: any[] = [];

    for (let i = 2; i <= rowCount; i++) {
      const row = worksheet?.getRow(i);
      if (!row) continue;

      const employeeIdentifier = getCleanCellValue(row.getCell(1).value);
      const assetIdentifier = getCleanCellValue(row.getCell(2).value);
      const remarksVal = getCleanCellValue(row.getCell(3).value);

      // If the row is completely empty, skip it silently
      if (!employeeIdentifier && !assetIdentifier && !remarksVal) {
        continue;
      }

      if (!employeeIdentifier || !assetIdentifier) {
        errors.push(`Row ${i}: Missing Employee Email or Asset ID`);
        continue;
      }

      // 1. Find Employee
      const employee = await prisma.employee.findFirst({
        where: {
          OR: [
            { officeEmail: { equals: employeeIdentifier, mode: 'insensitive' } },
            { employeeId: { equals: employeeIdentifier, mode: 'insensitive' } }
          ]
        }
      });

      if (!employee) {
        errors.push(`Row ${i}: Employee "${employeeIdentifier}" not found`);
        continue;
      }

      // 2. Find Asset
      const asset = await prisma.assetInventory.findFirst({
        where: {
          OR: [
            { serialNumber: { equals: assetIdentifier, mode: 'insensitive' } },
            { assetId: { equals: assetIdentifier, mode: 'insensitive' } }
          ],
          isDeleted: false
        }
      });

      if (!asset) {
        errors.push(`Row ${i}: Asset "${assetIdentifier}" not found`);
        continue;
      }

      // 3. Check status
      if (asset.status !== 'Available') {
        errors.push(`Row ${i}: Asset "${asset.assetName}" is currently not available (Status: ${asset.status})`);
        continue;
      }

      // 4. Check internal sheet duplicates
      if (seenAssetIds.has(asset.id)) {
        errors.push(`Row ${i}: Asset "${asset.assetName}" is assigned multiple times in the spreadsheet`);
        continue;
      }
      seenAssetIds.add(asset.id);

      assignmentsToProcess.push({
        employee,
        asset,
        remarks: remarksVal
      });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Import failed due to validation errors. Please fix and re-upload.",
        errors
      });
    }

    if (assignmentsToProcess.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid rows found in the uploaded file."
      });
    }

    // Perform database operations in transaction
    await prisma.$transaction(async (tx) => {
      for (const item of assignmentsToProcess) {
        const directRequestId = `DIR-${Math.floor(100000 + Math.random() * 900000)}`;

        // 1. Create request
        const request = await tx.assetRequest.create({
          data: {
            requestId: directRequestId,
            employeeId: item.employee.id,
            assetType: item.asset.type,
            assetCategory: item.asset.category,
            title: `Direct Assignment of ${item.asset.assetName}`,
            description: 'Assigned directly via bulk import',
            status: 'Allocated'
          }
        });

        // 2. Create allocation
        await tx.assetAllocation.create({
          data: {
            requestId: request.id,
            inventoryId: item.asset.id,
            employeeId: item.employee.id,
            status: 'Allocated',
            remarks: item.remarks || 'Assigned via bulk import'
          }
        });

        // 3. Update asset inventory status to Allocated
        await tx.assetInventory.update({
          where: { id: item.asset.id },
          data: { status: 'Allocated' }
        });

        // 4. Create history
        await tx.assetInventoryHistory.create({
          data: {
            inventoryId: item.asset.id,
            action: 'AllocatedDirect',
            status: 'Allocated',
            performedById: user.id,
            remarks: `Asset directly assigned to employee ${item.employee.firstName} ${item.employee.lastName} via bulk import`
          }
        });

        successfulAssignments.push(`${item.asset.assetName} to ${item.employee.firstName} ${item.employee.lastName}`);
      }
    });

    res.json({
      success: true,
      message: `${successfulAssignments.length} asset assignments imported successfully.`,
      data: successfulAssignments
    });

  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};



// Transfer asset allocation
export const transferAllocation = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const { allocationId } = req.params;
    const { employeeId, remarks } = req.body;

    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'New employee ID is required' });
    }

    const currentAllocation = await prisma.assetAllocation.findUnique({
      where: { id: allocationId },
      include: { inventory: true, employee: true }
    });

    if (!currentAllocation) {
      return res.status(404).json({ success: false, message: 'Current allocation record not found' });
    }

    const newEmployee = await prisma.employee.findUnique({
      where: { id: employeeId }
    });
    if (!newEmployee) {
      return res.status(404).json({ success: false, message: 'New employee not found' });
    }

    const directRequestId = `DIR-${Math.floor(100000 + Math.random() * 900000)}`;

    const request = await prisma.assetRequest.create({
      data: {
        requestId: directRequestId,
        employeeId: employeeId,
        assetType: currentAllocation.inventory.type,
        assetCategory: currentAllocation.inventory.category,
        title: `Direct Assignment of ${currentAllocation.inventory.assetName}`,
        description: 'Assigned directly by administrator via transfer',
        status: 'Allocated'
      }
    });

    const result = await prisma.$transaction([
      // 1. Mark current allocation as Returned (Transferred)
      prisma.assetAllocation.update({
        where: { id: allocationId },
        data: {
          status: 'Returned',
          returnedAt: new Date(),
          remarks: `Transferred to ${newEmployee.firstName} ${newEmployee.lastName}. Remarks: ${remarks || 'None'}`
        }
      }),
      // 2. Create new allocation
      prisma.assetAllocation.create({
        data: {
          requestId: request.id,
          inventoryId: currentAllocation.inventoryId,
          employeeId: employeeId,
          status: 'Allocated',
          remarks: `Transferred from ${currentAllocation.employee.firstName} ${currentAllocation.employee.lastName}`
        }
      }),
      // 3. Track history
      prisma.assetInventoryHistory.create({
        data: {
          inventoryId: currentAllocation.inventoryId,
          action: 'Transferred',
          status: 'Allocated',
          performedById: user.id,
          remarks: `Asset transferred from ${currentAllocation.employee.firstName} ${currentAllocation.employee.lastName} to ${newEmployee.firstName} ${newEmployee.lastName}`
        }
      })
    ]);

    res.json({ success: true, message: 'Asset transferred successfully', data: result[1] });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};

// Delete asset allocation
export const deleteAllocation = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const { allocationId } = req.params;

    const allocation = await prisma.assetAllocation.findUnique({
      where: { id: allocationId },
      include: { inventory: true }
    });

    if (!allocation) {
      return res.status(404).json({ success: false, message: 'Allocation record not found' });
    }

    await prisma.$transaction([
      // 1. Set inventory back to Available if it was Allocated
      ...(allocation.status === 'Allocated' ? [
        prisma.assetInventory.update({
          where: { id: allocation.inventoryId },
          data: { status: 'Available' }
        }),
        prisma.assetInventoryHistory.create({
          data: {
            inventoryId: allocation.inventoryId,
            action: 'AllocationDeleted',
            status: 'Available',
            performedById: user.id,
            remarks: `Allocation to employee ID ${allocation.employeeId} was deleted`
          }
        })
      ] : []),
      // 2. Delete the allocation
      prisma.assetAllocation.delete({
        where: { id: allocationId }
      })
    ]);

    res.json({ success: true, message: 'Allocation record deleted successfully' });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ success: false, message: err.message });
  }
};
