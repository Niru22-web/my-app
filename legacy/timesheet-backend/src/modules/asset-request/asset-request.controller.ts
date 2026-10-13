import { Request, Response } from 'express';
import { prisma } from '../../config/prisma';
import { v4 as uuidv4 } from 'uuid';
import { sendITEmail } from '../../services/mail.service';
import ExcelJS from 'exceljs';
import { triggerNotification } from '../../services/notification.service';

const DEFAULT_CATEGORIES = [
  { name: 'Laptop', category: 'Hardware' },
  { name: 'Monitor', category: 'Hardware' },
  { name: 'Keyboard', category: 'Hardware' },
  { name: 'Mouse', category: 'Hardware' },
  { name: 'Headset', category: 'Hardware' },
  { name: 'Docking Station', category: 'Hardware' },
  { name: 'Printer', category: 'Hardware' },
  { name: 'Mobile Phone', category: 'Hardware' },
  { name: 'Software License', category: 'Software' },
  { name: 'Office Equipment', category: 'Office Equipment' },
  { name: 'Furniture', category: 'Furniture' }
];

const ensureCategoryExists = async (name: string, category: string) => {
  try {
    const existing = await prisma.assetCategory.findUnique({ where: { name } });
    if (!existing) {
      await prisma.assetCategory.create({
        data: { name, category: category || 'Hardware' }
      });
    }
  } catch (error) {
    console.error('Error ensuring category exists:', error);
  }
};

export const createAssetRequest = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { 
      assetType, 
      assetCategory, 
      title, 
      description, 
      reason,
      priority, 
      requiredDate, 
      quantity, 
      deliveryLocation,
      attachmentUrl,
      employeeId // New field for admin creation
    } = req.body;

    const trimmedAssetType = typeof assetType === 'string' ? assetType.trim() : '';
    const trimmedTitle = typeof title === 'string' ? title.trim() : '';
    const trimmedDescription = typeof description === 'string' ? description.trim() : '';
    const trimmedReason = typeof reason === 'string' ? reason.trim() : '';

    if (!trimmedAssetType || (!trimmedTitle && !trimmedDescription && !trimmedReason)) {
      return res.status(400).json({
        success: false,
        message: 'Asset type and reason/title are required'
      });
    }

    const resolvedCategory = (typeof assetCategory === 'string' && assetCategory.trim()) ? assetCategory.trim() : 'Hardware';
    const resolvedTitle = trimmedTitle || trimmedReason || `${trimmedAssetType} Request`;
    const resolvedDescription = trimmedDescription || trimmedReason || null;

    // Ensure category exists in master table
    await ensureCategoryExists(trimmedAssetType, resolvedCategory);

    const requestId = `ASSET-${Math.floor(100000 + Math.random() * 900000)}`;
    const userRoleUpper = String(user?.role || '').toUpperCase();
    const canAssignEmployee = ['ADMIN', 'HR', 'IT', 'OWNER'].includes(userRoleUpper);

    const assetRequest = await prisma.assetRequest.create({
      data: {
        requestId,
        employeeId: canAssignEmployee && employeeId ? employeeId : user.id,
        assetType: trimmedAssetType,
        assetCategory: resolvedCategory,
        title: resolvedTitle,
        description: resolvedDescription,
        priority: priority || 'Medium',
        requiredDate: requiredDate ? new Date(requiredDate) : null,
        quantity: quantity ? Number(quantity) : 1,
        deliveryLocation,
        attachmentUrl,
        status: 'Pending'
      }
    });

    // Create history record
    await prisma.assetRequestHistory.create({
      data: {
        requestId: assetRequest.id,
        action: 'Submitted',
        performedById: user.id,
        status: 'Pending',
        remarks: 'Asset request submitted by employee'
      }
    });

    // Send email notification
    await sendAssetRequestNotification({
      requestId: assetRequest.id,
      action: 'Submitted'
    });

    res.status(201).json({
      success: true,
      data: assetRequest,
      message: 'Asset request submitted successfully'
    });
  } catch (error) {
    console.error('Create asset request error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit asset request' });
  }
};

export const getMyRequests = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const requests = await prisma.assetRequest.findMany({
      where: { employeeId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        approver: {
          select: { firstName: true, lastName: true }
        },
        allocations: {
          include: {
            inventory: true
          }
        }
      }
    });

    res.json({ success: true, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch your requests' });
  }
};

export const getAllRequests = async (req: Request, res: Response) => {
  try {
    const { status, priority, employeeId } = req.query;
    const where: any = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (employeeId) where.employeeId = employeeId;

    const requests = await prisma.assetRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        employee: {
          select: { firstName: true, lastName: true, employeeId: true, department: true }
        },
        approver: {
          select: { firstName: true, lastName: true }
        },
        allocations: {
          include: {
            inventory: true
          }
        }
      }
    });

    res.json({ success: true, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch all requests' });
  }
};

export const updateRequestStatus = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;
    const { status, remarks } = req.body;

    const currentRequest = await prisma.assetRequest.findUnique({ where: { id } });
    if (!currentRequest) return res.status(404).json({ success: false, message: 'Request not found' });

    const updatedRequest = await prisma.assetRequest.update({
      where: { id },
      data: {
        status,
        remarks,
        approvedBy: ['Approved', 'Rejected'].includes(status) ? user.id : currentRequest.approvedBy,
        approvedAt: ['Approved', 'Rejected'].includes(status) ? new Date() : currentRequest.approvedAt
      }
    });

    // Create history
    await prisma.assetRequestHistory.create({
      data: {
        requestId: id,
        action: status,
        performedById: user.id,
        status,
        remarks
      }
    });

    // Send email notification
    await sendAssetRequestNotification({
      requestId: id,
      action: status,
      remarks
    });

    res.json({ success: true, data: updatedRequest, message: `Request ${status.toLowerCase()} successfully` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update request status' });
  }
};

export const allocateAsset = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { requestId, inventoryId, remarks } = req.body;

    const [request, inventory] = await Promise.all([
      prisma.assetRequest.findUnique({ where: { id: requestId } }),
      prisma.assetInventory.findUnique({ where: { id: inventoryId } })
    ]);

    if (!request || !inventory) return res.status(404).json({ success: false, message: 'Request or Inventory item not found' });
    if (inventory.status !== 'Available') return res.status(400).json({ success: false, message: 'Asset is not available for allocation' });

    // Transaction to ensure atomicity
    const result = await prisma.$transaction([
      // 1. Create allocation
      prisma.assetAllocation.create({
        data: {
          requestId,
          inventoryId,
          employeeId: request.employeeId,
          status: 'Allocated',
          remarks
        }
      }),
      // 2. Update inventory status
      prisma.assetInventory.update({
        where: { id: inventoryId },
        data: { status: 'Allocated' }
      }),
      // 3. Update request status
      prisma.assetRequest.update({
        where: { id: requestId },
        data: { status: 'Allocated' }
      }),
      // 4. Add history
      prisma.assetRequestHistory.create({
        data: {
          requestId,
          action: 'Allocated',
          performedById: user.id,
          status: 'Allocated',
          remarks: `Asset ${inventory.serialNumber} allocated. ${remarks || ''}`
        }
      })
    ]);

    // Send email notification
    await sendAssetRequestNotification({
      requestId,
      action: 'Allocated',
      remarks,
      inventoryId
    });

    res.json({ success: true, message: 'Asset allocated successfully' });
  } catch (error) {
    console.error('Allocation error:', error);
    res.status(500).json({ success: false, message: 'Failed to allocate asset' });
  }
};

export const getInventory = async (req: Request, res: Response) => {
  try {
    const { status, type } = req.query;
    const where: any = {};
    if (status) where.status = status;
    if (type) where.type = type;

    const inventory = await prisma.assetInventory.findMany({
      where: {
        ...where,
        isDeleted: false
      },
      orderBy: { assetName: 'asc' }
    });

    res.json({ success: true, data: inventory });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch inventory' });
  }
};

export const createInventoryItem = async (req: Request, res: Response) => {
  try {
    const { assetName, category, type, serialNumber, officeTagNo, condition, specifications, remarks } = req.body;

    // Validation
    if (!assetName?.trim() || !type?.trim() || !serialNumber?.trim()) {
      return res.status(400).json({ success: false, message: 'Asset Name, Type, and Serial Number are required' });
    }

    const trimmedName = assetName.trim();
    const trimmedSerial = serialNumber.trim();
    const trimmedType = type.trim();

    // Check for duplicate serial number
    const existing = await prisma.assetInventory.findUnique({
      where: { serialNumber: trimmedSerial }
    });

    if (existing) {
      return res.status(400).json({ success: false, message: `Serial Number ${trimmedSerial} already exists in inventory` });
    }

    // Ensure category exists in master table
    await ensureCategoryExists(trimmedType, category);

    const item = await prisma.assetInventory.create({
      data: {
        assetName: trimmedName,
        category: category || 'Hardware',
        type: trimmedType,
        serialNumber: trimmedSerial,
        officeTagNo: officeTagNo?.trim(),
        condition: condition || 'New',
        specifications,
        remarks: remarks?.trim(),
        status: 'Available',
        purchaseCost: req.body.purchaseCost ? parseFloat(req.body.purchaseCost) : undefined,
        vendor: req.body.vendor,
        purchaseDate: req.body.purchaseDate ? new Date(req.body.purchaseDate) : undefined
      }
    });

    // Track creation history
    await prisma.assetInventoryHistory.create({
      data: {
        inventoryId: item.id,
        action: 'Created',
        status: 'Available',
        performedById: (req as any).user.id,
        remarks: 'Initial inventory registration'
      }
    });

    res.status(201).json({ success: true, data: item, message: 'Inventory item added successfully' });
  } catch (error: any) {
    console.error('Create inventory item error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.code === 'P2002' ? 'Serial Number already exists' : 'Failed to add inventory item',
      error: error.message
    });
  }
};

export const getAssetCategories = async (req: Request, res: Response) => {
  try {
    // 1. Get from master table
    let categories = await prisma.assetCategory.findMany({
      orderBy: { name: 'asc' }
    });

    // 2. If empty, seed with defaults
    if (categories.length === 0) {
      await prisma.assetCategory.createMany({
        data: DEFAULT_CATEGORIES
      });
      categories = await prisma.assetCategory.findMany({
        orderBy: { name: 'asc' }
      });
    }

    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch categories' });
  }
};

export const getAssetStats = async (req: Request, res: Response) => {
  try {
    const categories = await prisma.assetCategory.findMany();
    
    // Group and aggregate pending requests by assetType in a single query
    const pendingRequestsGrouped = await prisma.assetRequest.groupBy({
      by: ['assetType'],
      where: { status: { in: ['Pending', 'HR Review', 'Approved'] } },
      _sum: { quantity: true }
    });

    // Group and count available inventory items by type in a single query
    const availableStockGrouped = await prisma.assetInventory.groupBy({
      by: ['type'],
      where: { status: 'Available', isDeleted: false },
      _count: { _all: true }
    });

    // Create lookup maps for performance
    const pendingMap = new Map<string, number>();
    for (const group of pendingRequestsGrouped) {
      if (group.assetType) {
        pendingMap.set(group.assetType, group._sum.quantity || 0);
      }
    }

    const availableMap = new Map<string, number>();
    for (const group of availableStockGrouped) {
      if (group.type) {
        availableMap.set(group.type, group._count._all || 0);
      }
    }

    // Map categories to their stats
    const stats = categories.map((cat) => {
      return {
        type: cat.name,
        category: cat.category,
        pendingRequests: pendingMap.get(cat.name) || 0,
        availableStock: availableMap.get(cat.name) || 0
      };
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Failed to fetch asset stats:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch asset stats' });
  }
};

export const getAllAllocations = async (req: Request, res: Response) => {
  try {
    const allocations = await prisma.assetAllocation.findMany({
      orderBy: { allocatedAt: 'desc' },
      include: {
        employee: {
          select: { firstName: true, lastName: true, employeeId: true, department: true }
        },
        inventory: true,
        request: true
      }
    });

    res.json({ success: true, data: allocations });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch allocations' });
  }
};

export const updateInventoryItem = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    const { assetName, category, type, serialNumber, officeTagNo, condition, status, specifications, remarks, purchaseCost, vendor, purchaseDate } = req.body;

    const current = await prisma.assetInventory.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ success: false, message: 'Asset not found' });

    const updated = await prisma.assetInventory.update({
      where: { id },
      data: {
        assetName,
        category,
        type,
        serialNumber,
        officeTagNo,
        condition,
        status,
        specifications,
        remarks,
        purchaseCost: purchaseCost ? parseFloat(purchaseCost) : undefined,
        vendor,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : undefined
      }
    });

    // Track history
    await prisma.assetInventoryHistory.create({
      data: {
        inventoryId: id,
        action: 'Updated',
        status: status || current.status,
        performedById: user.id,
        remarks: 'Asset details updated by administrator'
      }
    });

    res.json({ success: true, data: updated, message: 'Asset updated successfully' });
  } catch (error) {
    console.error('Update inventory item error:', error);
    res.status(500).json({ success: false, message: 'Failed to update inventory item' });
  }
};

export const deleteInventoryItem = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    await prisma.assetInventory.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        status: 'Retired'
      }
    });

    // Track history
    await prisma.assetInventoryHistory.create({
      data: {
        inventoryId: id,
        action: 'Deleted',
        status: 'Retired',
        performedById: user.id,
        remarks: 'Asset soft-deleted by administrator'
      }
    });

    res.json({ success: true, message: 'Asset deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete asset' });
  }
};

export const returnAsset = async (req: Request, res: Response) => {
  try {
    const { allocationId } = req.params;
    const { condition, remarks } = req.body;
    const user = (req as any).user;

    const allocation = await prisma.assetAllocation.findUnique({
      where: { id: allocationId },
      include: { inventory: true }
    });

    if (!allocation) return res.status(404).json({ success: false, message: 'Allocation not found' });

    await prisma.$transaction([
      // Update allocation
      prisma.assetAllocation.update({
        where: { id: allocationId },
        data: {
          status: 'Returned',
          returnedAt: new Date(),
          remarks: `Returned by user. ${remarks || ''}`
        }
      }),
      // Update inventory
      prisma.assetInventory.update({
        where: { id: allocation.inventoryId },
        data: {
          status: 'Available',
          condition: condition || allocation.inventory.condition
        }
      }),
      // Track history
      prisma.assetInventoryHistory.create({
        data: {
          inventoryId: allocation.inventoryId,
          action: 'Returned',
          status: 'Available',
          performedById: user.id,
          remarks: `Asset returned from employee. Condition: ${condition || 'N/A'}`
        }
      })
    ]);

    // Send email notification
    await sendAssetRequestNotification({
      requestId: allocation.requestId,
      action: 'Returned',
      remarks,
      inventoryId: allocation.inventoryId,
      condition
    });

    res.json({ success: true, message: 'Asset returned successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to return asset' });
  }
};

export const updateAssetStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, remarks, condition } = req.body;
    const user = (req as any).user;

    const updated = await prisma.assetInventory.update({
      where: { id },
      data: { status, remarks, condition }
    });

    await prisma.assetInventoryHistory.create({
      data: {
        inventoryId: id,
        action: 'StatusUpdate',
        status,
        performedById: user.id,
        remarks: remarks || `Status updated to ${status}`
      }
    });

    res.json({ success: true, data: updated, message: `Asset status updated to ${status}` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update asset status' });
  }
};

export const getAssetTimeline = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const history = await prisma.assetInventoryHistory.findMany({
      where: { inventoryId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        performer: {
          select: { firstName: true, lastName: true }
        }
      }
    });

    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch asset history' });
  }
};

const sendAssetRequestNotification = async ({
  requestId,
  action,
  remarks,
  inventoryId,
  condition
}: {
  requestId: string;
  action: 'Submitted' | 'Approved' | 'Rejected' | 'Allocated' | 'Returned' | string;
  remarks?: string;
  inventoryId?: string;
  condition?: string;
}) => {
  try {
    const request = await prisma.assetRequest.findUnique({
      where: { id: requestId },
      include: { employee: true }
    });
    if (!request) return;

    const targetEmployee = request.employee;

    // Trigger In-App Notifications
    try {
      if (action === 'Submitted') {
        await triggerNotification({
          userId: targetEmployee.id,
          title: 'Asset Request Submitted 💻',
          message: `Your request for asset "${request.assetType}" (ID: ${request.requestId}) has been submitted.`,
          type: 'asset_request_submitted',
          module: 'IT',
          priority: 'Info',
          actionUrl: '/portal/profile',
          relatedId: request.id
        });

        const itAdmins = await prisma.employee.findMany({
          where: {
            role: { in: ['Admin', 'IT', 'HR'] }
          },
          select: { id: true }
        });
        for (const admin of itAdmins) {
          if (admin.id !== targetEmployee.id) {
            await triggerNotification({
              userId: admin.id,
              title: 'New Asset Request 💻',
              message: `New asset request from ${targetEmployee.firstName}: "${request.title}"`,
              type: 'asset_request_pending',
              module: 'IT',
              priority: 'High',
              actionUrl: '/admin/asset-management/dashboard',
              relatedId: request.id
            });
          }
        }
      } else if (action === 'Approved' || action === 'Rejected') {
        await triggerNotification({
          userId: targetEmployee.id,
          title: `Asset Request ${action} 💻`,
          message: `Your asset request "${request.title}" has been ${action.toLowerCase()}. Remarks: ${remarks || 'None'}`,
          type: 'asset_request_status',
          module: 'IT',
          priority: action === 'Approved' ? 'High' : 'Warning',
          actionUrl: '/portal/profile',
          relatedId: request.id
        });
      } else if (action === 'Allocated') {
        await triggerNotification({
          userId: targetEmployee.id,
          title: 'Asset Allocated 💻',
          message: `An asset "${request.assetType}" has been allocated to you.`,
          type: 'asset_allocated',
          module: 'IT',
          priority: 'High',
          actionUrl: '/portal/profile',
          relatedId: request.id
        });
      } else if (action === 'Returned') {
        await triggerNotification({
          userId: targetEmployee.id,
          title: 'Asset Return Registered 💻',
          message: `The asset for request "${request.title}" has been successfully returned.`,
          type: 'asset_returned',
          module: 'IT',
          priority: 'Info',
          actionUrl: '/portal/profile',
          relatedId: request.id
        });
      }
    } catch (e) {
      console.error('Error triggering in-app asset request notification:', e);
    }
    const frontendUrl = process.env.FRONTEND_URL || 'https://timesheet.asaind.co.in';

    // Fetch IT, HR, and Admin users
    const adminsAndIT = await prisma.employee.findMany({
      where: {
        OR: [
          { role: { equals: "IT", mode: "insensitive" } },
          { role: { equals: "it", mode: "insensitive" } },
          { role: { contains: "IT", mode: "insensitive" } },
          { role: { equals: "HR", mode: "insensitive" } },
          { role: { equals: "hr", mode: "insensitive" } },
          { role: { contains: "HR", mode: "insensitive" } },
          { role: { equals: "Admin", mode: "insensitive" } },
          { role: { equals: "admin", mode: "insensitive" } }
        ]
      }
    });

    const officeEmails = adminsAndIT
      .map(emp => emp.officeEmail)
      .filter((email): email is string => !!email);

    // Fetch inventory if allocated/returned
    let inventory: any = null;
    if (inventoryId) {
      inventory = await prisma.assetInventory.findUnique({ where: { id: inventoryId } });
    }

    // Prepare email HTML and Subject based on action
    let subject = '';
    let employeeHtml = '';
    let adminHtml = '';

    if (action === 'Submitted') {
      subject = `Asset Request Raised: [Request ID: ${request.requestId}] ${request.title}`;
      employeeHtml = `
        <h3>Your Asset Request Has Been Submitted</h3>
        <p>Hello ${targetEmployee.firstName},</p>
        <p>Your request for an asset has been registered with ID: <b>${request.requestId}</b>.</p>
        <hr />
        <p><b>Title:</b> ${request.title}</p>
        <p><b>Asset Category:</b> ${request.assetCategory}</p>
        <p><b>Asset Type:</b> ${request.assetType}</p>
        <p><b>Quantity:</b> ${request.quantity}</p>
        <p><b>Priority:</b> ${request.priority}</p>
        <p><b>Description:</b> ${request.description || 'N/A'}</p>
        <hr />
        <p><a href="${frontendUrl}/asset-management">Click here to view your requests</a></p>
      `;
      adminHtml = `
        <h3>New Asset Request Submitted</h3>
        <p>A new asset request requires approval/attention.</p>
        <hr />
        <p><b>Request ID:</b> ${request.requestId}</p>
        <p><b>Title:</b> ${request.title}</p>
        <p><b>Asset Category:</b> ${request.assetCategory}</p>
        <p><b>Asset Type:</b> ${request.assetType}</p>
        <p><b>Quantity:</b> ${request.quantity}</p>
        <p><b>Raised By:</b> ${targetEmployee.firstName} ${targetEmployee.lastName} (${targetEmployee.employeeId})</p>
        <p><b>Description:</b> ${request.description || 'N/A'}</p>
        <p><b>Priority:</b> ${request.priority}</p>
        <hr />
        <p><a href="${frontendUrl}/asset-management">Click here to view the asset request queue</a></p>
      `;
    } else if (action === 'Approved' || action === 'Rejected') {
      subject = `Asset Request Status Update: [Request ID: ${request.requestId}] ${request.title}`;
      employeeHtml = `
        <h3>Your Asset Request Status Update</h3>
        <p>Hello ${targetEmployee.firstName},</p>
        <p>Your asset request (ID: <b>${request.requestId}</b>) has been <b>${action.toLowerCase()}</b>.</p>
        <hr />
        <p><b>Title:</b> ${request.title}</p>
        <p><b>New Status:</b> ${request.status}</p>
        <p><b>Remarks:</b> ${remarks || 'No remarks provided'}</p>
        <hr />
        <p><a href="${frontendUrl}/asset-management">Click here to view your request</a></p>
      `;
      adminHtml = `
        <h3>Asset Request Status Update</h3>
        <p>Asset request (ID: <b>${request.requestId}</b>) raised by ${targetEmployee.firstName} ${targetEmployee.lastName} has been <b>${action.toLowerCase()}</b>.</p>
        <hr />
        <p><b>New Status:</b> ${request.status}</p>
        <p><b>Remarks:</b> ${remarks || 'No remarks provided'}</p>
        <hr />
        <p><a href="${frontendUrl}/asset-management">Click here to view the asset requests</a></p>
      `;
    } else if (action === 'Allocated') {
      subject = `Asset Allocated: [Request ID: ${request.requestId}] ${request.title}`;
      const assetDetails = inventory ? `
        <p><b>Asset Name:</b> ${inventory.assetName}</p>
        <p><b>Serial Number:</b> ${inventory.serialNumber}</p>
        <p><b>Office Tag No:</b> ${inventory.officeTagNo || 'N/A'}</p>
      ` : '';
      employeeHtml = `
        <h3>Asset Allocated Successfully</h3>
        <p>Hello ${targetEmployee.firstName},</p>
        <p>An asset has been allocated to you for request ID: <b>${request.requestId}</b>.</p>
        <hr />
        ${assetDetails}
        <p><b>Remarks:</b> ${remarks || 'N/A'}</p>
        <hr />
        <p><a href="${frontendUrl}/asset-management">Click here to view your assets</a></p>
      `;
      adminHtml = `
        <h3>Asset Allocated</h3>
        <p>An asset has been allocated to ${targetEmployee.firstName} ${targetEmployee.lastName} for request ID: <b>${request.requestId}</b>.</p>
        <hr />
        ${assetDetails}
        <p><b>Remarks:</b> ${remarks || 'N/A'}</p>
        <hr />
        <p><a href="${frontendUrl}/asset-management">Click here to view assets</a></p>
      `;
    } else if (action === 'Returned') {
      subject = `Asset Returned: [Request ID: ${request.requestId}] ${request.title}`;
      const assetDetails = inventory ? `
        <p><b>Asset Name:</b> ${inventory.assetName}</p>
        <p><b>Serial Number:</b> ${inventory.serialNumber}</p>
      ` : '';
      employeeHtml = `
        <h3>Asset Return Registered</h3>
        <p>Hello ${targetEmployee.firstName},</p>
        <p>The asset allocated for request ID: <b>${request.requestId}</b> has been successfully returned.</p>
        <hr />
        ${assetDetails}
        <p><b>Condition:</b> ${condition || 'N/A'}</p>
        <p><b>Remarks:</b> ${remarks || 'N/A'}</p>
        <hr />
        <p><a href="${frontendUrl}/asset-management">Click here to view your assets</a></p>
      `;
      adminHtml = `
        <h3>Asset Returned</h3>
        <p>An asset allocated to ${targetEmployee.firstName} ${targetEmployee.lastName} for request ID: <b>${request.requestId}</b> has been returned.</p>
        <hr />
        ${assetDetails}
        <p><b>Condition:</b> ${condition || 'N/A'}</p>
        <p><b>Remarks:</b> ${remarks || 'N/A'}</p>
        <hr />
        <p><a href="${frontendUrl}/asset-management">Click here to view asset history</a></p>
      `;
    }

    // Send email to Employee
    if (targetEmployee.officeEmail) {
      try {
        await sendITEmail({
          to: targetEmployee.officeEmail,
          subject,
          html: employeeHtml
        });
      } catch (err) {
        console.error(`Failed to send asset notification to employee ${targetEmployee.officeEmail}:`, err);
      }
    }

    // Send email to admins/IT
    for (const email of officeEmails) {
      if (email !== targetEmployee.officeEmail) {
        try {
          await sendITEmail({
            to: email,
            subject: `[Asset management] ${subject}`,
            html: adminHtml
          });
        } catch (err) {
          console.error(`Failed to send asset notification to admin/IT ${email}:`, err);
        }
      }
    }
  } catch (error) {
    console.error('Error sending asset request notification:', error);
  }
};
