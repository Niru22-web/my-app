import { Request, Response } from 'express';
import { prisma } from '../../config/prisma'; // Multi-level approval enabled
import { ExcelService } from '../../utils/ExcelService';
import { startOfMonth, endOfMonth, differenceInDays } from 'date-fns';
import { NotificationService } from '../notification/notification.service';

/**
 * Validates if a string is a valid UUID to prevent PostgreSQL query errors.
 */
const isValidUUID = (uuid: any): boolean => {
  if (!uuid || typeof uuid !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

export const getPendingReimbursementCount = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userRole = user.role?.toUpperCase();

    let pendingManagerApprovals = 0;
    let pendingPartnerApprovals = 0;
    let pendingFinanceReview = 0;

    // 1. Manager Count (Requests at PENDING_MANAGER status assigned to this manager)
    if (userRole === 'MANAGER' || ['ADMIN', 'PARTNER', 'OWNER'].includes(userRole)) {
      pendingManagerApprovals = await prisma.reimbursement.count({
        where: {
          status: 'PENDING_MANAGER',
          OR: [
            { managerId: user.id },
            { employee: { managers: { some: { managerId: user.id } } } },
            { employee: { subManagerId: user.id } },
            {
              // Manager sees pending requests of sub-managed employees under them
              employee: {
                subManager: {
                  subManagedEmployees: {
                    some: { managers: { some: { managerId: user.id } } }
                  }
                }
              }
            }
          ] as any[]
        } as any
      });
    }

    // 2. Partner/Admin Count (Requests at MANAGER_APPROVED status awaiting final approval)
    if (['ADMIN', 'PARTNER', 'OWNER'].includes(userRole)) {
      pendingPartnerApprovals = await prisma.reimbursement.count({
        where: {
          status: 'MANAGER_APPROVED'
        }
      });
    }

    // 3. Accountant Count (Requests at APPROVED status awaiting finance review/processing)
    if (['ACCOUNTANT', 'FINANCE MANAGER', 'ADMIN'].includes(userRole)) {
      pendingFinanceReview = await prisma.reimbursement.count({
        where: {
          status: 'APPROVED'
        }
      });
    }

    // Total pending for the dashboard badge depends on role
    let count = 0;
    if (userRole === 'MANAGER') count = pendingManagerApprovals;
    else if (['ADMIN', 'PARTNER', 'OWNER'].includes(userRole)) count = pendingManagerApprovals + pendingPartnerApprovals;
    else if (userRole === 'ACCOUNTANT' || userRole === 'FINANCE MANAGER') count = pendingFinanceReview;

    return res.json({
      success: true,
      data: {
        count,
        pendingManagerApprovals,
        pendingPartnerApprovals,
        pendingFinanceReview
      }
    });
  } catch (error: any) {
    console.error("🔥 [getPendingReimbursementCount] Error:", error.message);
    return res.status(500).json({ success: false, message: "Error fetching pending counts" });
  }
};

export const getAllReimbursements = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user || !user.id) {
       console.error("❌ [getAllReimbursements] Unauthorized: User context missing");
       return res.status(401).json({ success: false, message: "Unauthorized: User context missing" });
    }

    const { q, status, employeeId, category, startDate, endDate, minAmount, maxAmount, clientId, projectId, department, orgView } = req.query;
    const userRole = user.role?.toUpperCase();
    const isPowerUser = ['ADMIN', 'PARTNER', 'OWNER', 'HR', 'ACCOUNTANT', 'FINANCE MANAGER'].includes(userRole);
    const isOrgView = orgView === 'true';

    console.log("🔍 [getAllReimbursements] Incoming Query:", { q, status, employeeId, category, startDate, endDate, orgView: isOrgView });

    // 1. Robust Date Parsing
    const dateStart = startDate && !isNaN(new Date(String(startDate)).getTime()) ? new Date(String(startDate)) : null;
    const dateEnd = endDate && !isNaN(new Date(String(endDate)).getTime()) ? new Date(String(endDate)) : null;

    // 2. Safe Where Construction using spread syntax
    const where: any = {
      // Role-based scoping
      ...(isPowerUser && isOrgView 
        ? {
            ...(employeeId && isValidUUID(employeeId) ? { employeeId: String(employeeId) } : {}),
            ...(department && department !== 'All Departments' ? { employee: { department: String(department) } } : {})
          }
        : userRole === 'MANAGER' && isOrgView
          ? {
              OR: [
                { managerId: user.id },
                { partnerId: user.id },
                { employeeId: user.id },
                { employee: { managers: { some: { managerId: user.id } } } },
                { employee: { partners: { some: { partnerId: user.id } } } },
                { employee: { subManagerId: user.id } },
                {
                  // Manager sees employees under their sub-managers
                  employee: {
                    subManager: {
                      subManagedEmployees: {
                        some: {
                          managers: { some: { managerId: user.id } }
                        }
                      }
                    }
                  }
                },
                {
                  // Manager sees their sub-managers' own reimbursements
                  employee: {
                    subManagedEmployees: {
                      some: {
                        managers: { some: { managerId: user.id } }
                      }
                    }
                  }
                }
              ],
              ...(employeeId && isValidUUID(employeeId) ? { employeeId: String(employeeId) } : {})
            }
          : { employeeId: user.id }
      ),

      // Status Filter
      ...(status && status !== 'All Status' && status !== 'all' && status !== ''
        ? {
            status: ['PENDING', 'pending'].includes(String(status))
              ? { in: ['PENDING_MANAGER', 'MANAGER_APPROVED'] }
              : ['SEND_BACK', 'SENT_BACK', 'sent_back'].includes(String(status))
                ? 'SENT_BACK'
                : String(status).toUpperCase()
          }
        : {}
      ),

      // Category Filter
      ...(category && category !== 'All Categories' && category !== ''
        ? { category: String(category) }
        : {}
      ),

      // Client/Project/Job Filter
      ...(clientId && isValidUUID(clientId) ? { clientId: String(clientId) } : {}),
      ...(projectId && isValidUUID(projectId) ? { projectId: String(projectId) } : {}),

      // Date Range Filter
      ...(dateStart && dateEnd
        ? { date: { gte: dateStart, lte: dateEnd } }
        : dateStart
          ? { date: { gte: dateStart } }
          : dateEnd
            ? { date: { lte: dateEnd } }
            : {}
      ),

      // Amount Range Filter
      ...((minAmount || maxAmount)
        ? {
            amount: {
              ...(minAmount && !isNaN(parseFloat(String(minAmount))) ? { gte: parseFloat(String(minAmount)) } : {}),
              ...(maxAmount && !isNaN(parseFloat(String(maxAmount))) ? { lte: parseFloat(String(maxAmount)) } : {})
            }
          }
        : {}
      ),

      // Search Filter
      ...(q && String(q).trim() !== ''
        ? {
            OR: [
              { claimId: { contains: String(q).trim(), mode: 'insensitive' } },
              { description: { contains: String(q).trim(), mode: 'insensitive' } },
              { category: { contains: String(q).trim(), mode: 'insensitive' } },
              { employee: { firstName: { contains: String(q).trim(), mode: 'insensitive' } } },
              { employee: { lastName: { contains: String(q).trim(), mode: 'insensitive' } } },
            ]
          }
        : {}
      )
    };

    console.log("⚙️ [getAllReimbursements] Final Where Clause:", JSON.stringify(where, null, 2));

    const claims = await prisma.reimbursement.findMany({
      where,
      include: { 
        employee: { 
          select: { 
            id: true, 
            firstName: true, 
            lastName: true, 
            officeEmail: true, 
            employeeId: true, 
            department: true, 
            managers: { select: { managerId: true } },
            partners: { select: { partnerId: true } }          } 
        },
        client: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        job: { select: { id: true, name: true } },
        attachments: true,
        managerApprover: { select: { firstName: true, lastName: true } },
        partnerApprover: { select: { firstName: true, lastName: true } },
        processedBy: { select: { firstName: true, lastName: true } },
        logs: {
          include: { performedBy: { select: { firstName: true, lastName: true } } },
          orderBy: { performedAt: 'desc' }
        }
      } as any,
      orderBy: { date: 'desc' }
    });

    const enrichedClaims = (claims || []).map(claim => ({
      ...claim,
      pendingDays: ['PENDING_MANAGER', 'MANAGER_APPROVED'].includes(claim.status) 
        ? differenceInDays(new Date(), claim.submittedAt) 
        : 0
    }));

    return res.json({
      success: true,
      count: enrichedClaims.length,
      data: enrichedClaims,
      message: 'Reimbursement claims retrieved successfully'
    });
  } catch (error: any) {
    console.error("🔥 [getAllReimbursements] Critical Error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Internal server error while fetching reimbursements",
      error: process.env.NODE_ENV === 'development' ? String(error.message || error) : undefined
    });
  }
};

const ACCOUNTS_ROLES = [
  'ACCOUNTS',
  'ACCOUNTS_ADMIN',
  'ACCOUNTS_MANAGER',
  'ACCOUNTS_EXECUTIVE',
  'FINANCE_APPROVER',
  'FINANCE MANAGER',
  'FINANCE_MANAGER',
  'AR_MANAGER',
  'AP_MANAGER',
  'ACCOUNTANT',
  'CFO'
];

const APPROVER_ROLES = [
  'MANAGER',
  'SUB MANAGER',
  'SUB-MANAGER',
  'PARTNER',
  'ADMIN',
  'OWNER',
  'HR',
  ...ACCOUNTS_ROLES
];

const PAID_ROLES = [
  'ADMIN',
  'OWNER',
  ...ACCOUNTS_ROLES
];

const sanitizeClaimEmployee = (claim: any) => {
  if (!claim || typeof claim !== 'object') return claim;
  const copy = { ...claim };
  if (copy.employee && typeof copy.employee === 'object') {
    const { password, ...safeEmp } = copy.employee;
    copy.employee = safeEmp;
  }
  if (copy.manager && typeof copy.manager === 'object') {
    const { password, ...safeMgr } = copy.manager;
    copy.manager = safeMgr;
  }
  if (copy.partner && typeof copy.partner === 'object') {
    const { password, ...safePtr } = copy.partner;
    copy.partner = safePtr;
  }
  return copy;
};

const extractUploadedFiles = (req: Request): Express.Multer.File[] => {
  const files: Express.Multer.File[] = [];
  if ((req as any).file) {
    files.push((req as any).file);
  }
  const reqFiles = (req as any).files;
  if (Array.isArray(reqFiles)) {
    files.push(...reqFiles);
  } else if (reqFiles && typeof reqFiles === 'object') {
    Object.values(reqFiles).forEach((arr: any) => {
      if (Array.isArray(arr)) files.push(...arr);
    });
  }
  return files;
};

const persistAttachmentsForClaim = async (reimbursementId: string, req: Request) => {
  const uploadedFiles = extractUploadedFiles(req);
  for (const file of uploadedFiles) {
    const fileName = file.originalname || file.filename || 'receipt';
    const filePath = file.filename
      ? `/uploads/reimbursements/${file.filename}`
      : file.path || `/uploads/reimbursements/${fileName}`;
    await prisma.reimbursementAttachment.create({
      data: {
        reimbursementId,
        fileName,
        filePath,
        fileSize: file.size || 0,
        mimeType: file.mimetype || 'application/octet-stream'
      }
    });
  }
};

export const createReimbursement = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { category, amount, description, date, clientId, projectId, jobId } = req.body;

    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount." });
    }

    const employee = await prisma.employee.findUnique({
      where: { id: user.id },
      select: { 
        managers: { select: { managerId: true } },
        partners: { select: { partnerId: true } },
        subManagerId: true
      } as any
    });

    const count = await prisma.reimbursement.count();
    const claimId = `CLM-${String(count + 1).padStart(3, '0')}`;

    const newClaim = await prisma.reimbursement.create({
      data: {
        claimId,
        category: category || 'Other',
        amount: parsedAmount,
        description: description || '',
        date: date ? new Date(date) : new Date(),
        employeeId: user.id,
        clientId: clientId && isValidUUID(clientId) ? clientId : null,
        projectId: projectId && isValidUUID(projectId) ? projectId : null,
        jobId: jobId && isValidUUID(jobId) ? jobId : null,
        status: 'PENDING_MANAGER',
        managerId: (employee as any)?.managers && (employee as any).managers.length > 0 ? (employee as any).managers[0].managerId : null,
        partnerId: (employee as any)?.partners && (employee as any).partners.length > 0 ? (employee as any).partners[0].partnerId : null,
        approvalLevel: 1, // Level 1 = Manager
        submittedBy: user.id,
        logs: {
          create: {
            action: 'submitted',
            status: 'PENDING_MANAGER',
            performedById: user.id,
            remarks: 'Reimbursement request submitted'
          }
        }
      }
    });

    await persistAttachmentsForClaim(newClaim.id, req);

    const claimWithAttachments = await prisma.reimbursement.findUnique({
      where: { id: newClaim.id },
      include: { attachments: true }
    });

    // Notify Managers & Sub Manager
    const allManagerIds = new Set<string>();
    if ((employee as any)?.managers) {
      (employee as any).managers.forEach((m: any) => allManagerIds.add(m.managerId));
    }
    if ((employee as any)?.subManagerId) {
      allManagerIds.add((employee as any).subManagerId);
    }

    if (allManagerIds.size > 0) {
      await Promise.all(Array.from(allManagerIds).map((managerId: any) => 
        NotificationService.createNotification({
          userId: managerId,
          title: 'New Reimbursement Request',
          message: `${user.firstName} submitted a claim for ₹${parsedAmount}`,
          type: 'reimbursement',
          relatedId: newClaim.id,
          actionUrl: `/approvals/reimbursement`
        })
      ));
    }
    
    return res.status(201).json({ success: true, data: claimWithAttachments || newClaim, message: 'Reimbursement submitted' });
  } catch (error: any) {
    console.error("🔥 [createReimbursement] Error:", error.message);
    return res.status(500).json({ success: false, message: "Error creating claim" });
  }
};

const hasWritePermission = async (existingClaim: any, user: any): Promise<boolean> => {
  const userRole = user.role?.toUpperCase()?.trim() || '';
  // 1. Creator of the claim
  if (existingClaim.employeeId === user.id) return true;
  // 2. Power users (Admin, Partner, Owner, HR, Accountant, Finance Manager, Accounts)
  if (['ADMIN', 'PARTNER', 'OWNER', 'HR', ...ACCOUNTS_ROLES].includes(userRole)) return true;
  // 3. Designated Manager or Partner
  if (existingClaim.managerId === user.id || existingClaim.partnerId === user.id) return true;
  
  // 4. Check if manager of the employee who submitted
  if (userRole === 'MANAGER' || userRole === 'SUB MANAGER' || userRole === 'SUB-MANAGER') {
    const isEmpManager = await (prisma as any).employeeManager.findUnique({
      where: {
        employeeId_managerId: {
          employeeId: existingClaim.employeeId,
          managerId: user.id
        }
      }
    });
    if (isEmpManager) return true;

    // Check if subManager
    const employee = await prisma.employee.findUnique({
      where: { id: existingClaim.employeeId },
      select: { subManagerId: true }
    });
    if (employee && employee.subManagerId === user.id) return true;
  }
  
  // 5. Check if partner of the employee who submitted
  if (userRole === 'PARTNER') {
    const isEmpPartner = await (prisma as any).employeePartner.findUnique({
      where: {
        employeeId_partnerId: {
          employeeId: existingClaim.employeeId,
          partnerId: user.id
        }
      }
    });
    if (isEmpPartner) return true;
  }
  return false;
};

export const updateReimbursement = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    const { category, amount, description, date, clientId, projectId, jobId } = req.body;

    const existingClaim = await prisma.reimbursement.findUnique({ where: { id } });
    if (!existingClaim) return res.status(404).json({ success: false, message: "Claim not found" });
    
    const hasPermission = await hasWritePermission(existingClaim, user);
    if (!hasPermission) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    const currentStatus = (existingClaim.status || '').toUpperCase();
    // Block edits of APPROVED or PAID claims (R4)
    if (['APPROVED', 'PAID', 'APPROVED_DIRECTOR', 'APPROVED_CFO'].includes(currentStatus)) {
      return res.status(400).json({
        success: false,
        message: `Cannot edit a reimbursement claim that is already ${existingClaim.status}`
      });
    }

    const userRole = (user.role || '').toUpperCase().trim();
    const isOwnerOfClaim = existingClaim.employeeId === user.id;
    if (isOwnerOfClaim && !['ADMIN', 'OWNER'].includes(userRole)) {
      if (!['PENDING_MANAGER', 'SENT_BACK', 'PENDING'].includes(currentStatus)) {
        return res.status(400).json({
          success: false,
          message: `You can only edit your claim when its status is PENDING_MANAGER or SENT_BACK (current: ${existingClaim.status})`
        });
      }
    }

    const updateData: any = {};
    if (category) updateData.category = category;
    if (amount !== undefined) {
      const parsedAmount = Number(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ success: false, message: "Invalid amount." });
      }
      updateData.amount = parsedAmount;
    }
    if (description !== undefined) updateData.description = description;
    if (date) updateData.date = new Date(date);
    if (clientId !== undefined) updateData.clientId = isValidUUID(clientId) ? clientId : null;
    if (projectId !== undefined) updateData.projectId = isValidUUID(projectId) ? projectId : null;
    if (jobId !== undefined) updateData.jobId = isValidUUID(jobId) ? jobId : null;

    // When editing a SENT_BACK claim, reset its status to PENDING_MANAGER
    let nextStatus = existingClaim.status;
    let actionLabel = 'updated';
    if (currentStatus === 'SENT_BACK') {
      nextStatus = 'PENDING_MANAGER';
      updateData.status = 'PENDING_MANAGER';
      updateData.approvalLevel = 1;
      actionLabel = 'resubmitted';
    }

    await prisma.reimbursement.update({
      where: { id },
      data: {
        ...updateData,
        logs: {
          create: {
            action: actionLabel,
            status: nextStatus,
            performedById: user.id,
            remarks: currentStatus === 'SENT_BACK' ? 'Reimbursement request corrected and resubmitted' : 'Reimbursement request updated'
          }
        }
      }
    });

    await persistAttachmentsForClaim(id, req);

    const updatedClaim = await prisma.reimbursement.findUnique({
      where: { id },
      include: { attachments: true }
    });

    return res.json({ success: true, data: updatedClaim, message: 'Reimbursement updated' });
  } catch (error: any) {
    console.error("🔥 [updateReimbursement] Error:", error.message);
    return res.status(500).json({ success: false, message: "Error updating claim" });
  }
};

export const deleteReimbursement = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    const existingClaim = await prisma.reimbursement.findUnique({ where: { id } });
    if (!existingClaim) return res.status(404).json({ success: false, message: "Claim not found" });
    
    const hasPermission = await hasWritePermission(existingClaim, user);
    if (!hasPermission) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    const currentStatus = (existingClaim.status || '').toUpperCase();
    if (['APPROVED', 'PAID', 'APPROVED_DIRECTOR', 'APPROVED_CFO'].includes(currentStatus)) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete a reimbursement claim with status ${existingClaim.status}`
      });
    }

    await prisma.reimbursement.delete({ where: { id } });

    return res.json({ success: true, message: 'Reimbursement deleted' });
  } catch (error: any) {
    console.error("🔥 [deleteReimbursement] Error:", error.message);
    return res.status(500).json({ success: false, message: "Error deleting claim" });
  }
};

export const approveReimbursement = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;
    const user = (req as any).user;
    const userRole = (user?.role || '').toUpperCase().trim();

    if (!APPROVER_ROLES.includes(userRole) && !user?.hasAccountsAccess) {
      return res.status(403).json({ success: false, message: "Forbidden: You do not have permission to approve reimbursements." });
    }

    const existingClaim = await prisma.reimbursement.findUnique({ where: { id } });
    if (!existingClaim) return res.status(404).json({ success: false, message: "Claim not found" });

    // Prevent self-approval unless admin or owner
    if (existingClaim.employeeId === user.id && !['ADMIN', 'OWNER'].includes(userRole)) {
      return res.status(403).json({ success: false, message: "Forbidden: You cannot approve your own reimbursement claim." });
    }

    let updateData: any = { remarks };
    let nextStatus = '';

    const isManager = ['MANAGER', 'SUB MANAGER', 'SUB-MANAGER'].includes(userRole) || 
                      (existingClaim.managerId === user.id && existingClaim.status === 'PENDING_MANAGER') ||
                      Boolean(await (prisma as any).employeeManager.findUnique({ 
                        where: { employeeId_managerId: { employeeId: existingClaim.employeeId, managerId: user.id } } 
                      }));
    const isPartnerOrAdmin = ['PARTNER', 'ADMIN', 'OWNER', 'HR', ...ACCOUNTS_ROLES].includes(userRole) ||
                             Boolean(user?.hasAccountsAccess) ||
                             Boolean(await (prisma as any).employeePartner.findUnique({ 
                               where: { employeeId_partnerId: { employeeId: existingClaim.employeeId, partnerId: user.id } } 
                             }));

    if (isManager && !isPartnerOrAdmin && existingClaim.status === 'PENDING_MANAGER') {
      nextStatus = 'MANAGER_APPROVED';
      updateData = {
        ...updateData,
        status: nextStatus,
        managerApprovedBy: user.id,
        managerApprovedAt: new Date(),
        approvalLevel: 2 // Level 2 = Partner
      };
    } else if (isPartnerOrAdmin && (existingClaim.status === 'MANAGER_APPROVED' || existingClaim.status === 'PENDING_MANAGER')) {
      nextStatus = 'APPROVED';
      updateData = {
        ...updateData,
        status: nextStatus,
        partnerApprovedBy: user.id,
        partnerApprovedAt: new Date(),
        approvedBy: user.id, // Unified field
        approvedAt: new Date(), // Unified field
        approvalLevel: 2
      };
    } else {
      return res.status(403).json({ success: false, message: "You do not have permission to approve this request at its current stage." });
    }

    const claim = await prisma.reimbursement.update({
      where: { id },
      data: {
        ...updateData,
        logs: {
          create: {
            action: 'approved',
            status: nextStatus,
            performedById: user.id,
            remarks: remarks || `Approved at ${user.role} level`
          }
        }
      },
      include: { employee: true, manager: true, partner: true, attachments: true }
    });

    // Notify Next level or Employee
    const claimData = claim as any;
    if (nextStatus === 'MANAGER_APPROVED' && claimData.partnerId) {
      await NotificationService.createNotification({
        userId: claimData.partnerId,
        title: 'Reimbursement Final Approval Needed',
        message: `${claimData.employee?.firstName}'s claim ${claimData.claimId} approved by manager. Final approval needed.`,
        type: 'reimbursement',
        relatedId: claimData.id
      });
    } else if (nextStatus === 'APPROVED') {
      await NotificationService.createNotification({
        userId: claimData.employeeId,
        title: 'Reimbursement Finalized',
        message: `Your claim ${claimData.claimId} has been fully approved.`,
        type: 'reimbursement',
        relatedId: claimData.id
      });
    }

    // Notify Manager if Sub Manager takes action
    if ((claim.employee as any)?.subManagerId === user.id) {
      const managers = await (prisma as any).employeeManager.findMany({
        where: { employeeId: claim.employeeId },
        select: { managerId: true }
      });
      for (const m of managers) {
        await NotificationService.createNotification({
          userId: m.managerId,
          title: `Sub Manager Action: Reimbursement ${nextStatus.replace('_', ' ')}`,
          message: `Sub Manager ${user.firstName} ${nextStatus.toLowerCase().replace('_', ' ')} claim for ${claim.employee.firstName} ${claim.employee.lastName}.`,
          type: 'reimbursement',
          relatedId: claim.id,
          actionUrl: '/approvals/reimbursement'
        });
      }
    }

    return res.json({ success: true, data: sanitizeClaimEmployee(claim), message: 'Reimbursement approved' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: "Error approving request" });
  }
};

export const rejectReimbursement = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;
    const user = (req as any).user;
    const userRole = (user?.role || '').toUpperCase().trim();

    if (!APPROVER_ROLES.includes(userRole) && !user?.hasAccountsAccess) {
      return res.status(403).json({ success: false, message: "Forbidden: You do not have permission to reject reimbursements." });
    }

    const existingClaim = await prisma.reimbursement.findUnique({ where: { id } });
    if (!existingClaim) return res.status(404).json({ success: false, message: "Claim not found" });

    if (existingClaim.employeeId === user.id && !['ADMIN', 'OWNER'].includes(userRole)) {
      return res.status(403).json({ success: false, message: "Forbidden: You cannot reject your own reimbursement claim." });
    }

    if (['PAID', 'REJECTED'].includes((existingClaim.status || '').toUpperCase())) {
      return res.status(400).json({ success: false, message: `Cannot reject a claim that is already ${existingClaim.status}` });
    }

    const claim = await prisma.reimbursement.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason: remarks as string,
        remarks,
        rejectedAt: new Date(),
        logs: {
          create: {
            action: 'rejected',
            status: 'REJECTED',
            performedById: user.id,
            remarks: remarks || 'Request rejected'
          }
        }
      },
      include: { employee: true }
    });

    await NotificationService.createNotification({
      userId: claim.employeeId,
      title: 'Reimbursement Rejected',
      message: `Your claim ${claim.claimId} has been rejected. Reason: ${remarks || 'N/A'}`,
      type: 'reimbursement',
      relatedId: claim.id
    });

    // Notify Manager if Sub Manager takes action
    if ((claim.employee as any)?.subManagerId === user.id) {
      const managers = await (prisma as any).employeeManager.findMany({
        where: { employeeId: claim.employeeId },
        select: { managerId: true }
      });
      for (const m of managers) {
        await NotificationService.createNotification({
          userId: m.managerId,
          title: 'Sub Manager Action: Reimbursement REJECTED ❌',
          message: `Sub Manager ${user.firstName} rejected claim for ${claim.employee.firstName} ${claim.employee.lastName}. Reason: ${remarks}`,
          type: 'reimbursement',
          relatedId: claim.id,
          actionUrl: '/approvals/reimbursement'
        });
      }
    }

    return res.json({ success: true, data: sanitizeClaimEmployee(claim), message: 'Reimbursement rejected' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: "Error rejecting request" });
  }
};

export const sendBackReimbursement = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;
    const user = (req as any).user;
    const userRole = (user?.role || '').toUpperCase().trim();

    if (!APPROVER_ROLES.includes(userRole) && !user?.hasAccountsAccess) {
      return res.status(403).json({ success: false, message: "Forbidden: You do not have permission to send back reimbursements." });
    }

    const existingClaim = await prisma.reimbursement.findUnique({ where: { id } });
    if (!existingClaim) return res.status(404).json({ success: false, message: "Claim not found" });

    if (existingClaim.employeeId === user.id && !['ADMIN', 'OWNER'].includes(userRole)) {
      return res.status(403).json({ success: false, message: "Forbidden: You cannot send back your own reimbursement claim." });
    }

    if (['APPROVED', 'PAID', 'REJECTED'].includes((existingClaim.status || '').toUpperCase())) {
      return res.status(400).json({ success: false, message: `Cannot send back a claim with status ${existingClaim.status}` });
    }

    const claim = await prisma.reimbursement.update({
      where: { id },
      data: {
        status: 'SENT_BACK',
        remarks,
        logs: {
          create: {
            action: 'sent_back',
            status: 'SENT_BACK',
            performedById: user.id,
            remarks: remarks || 'Request sent back for correction'
          }
        }
      }
    });

    await NotificationService.createNotification({
      userId: claim.employeeId,
      title: 'Reimbursement Sent Back',
      message: `Your claim ${claim.claimId} requires correction: ${remarks}`,
      type: 'reimbursement',
      relatedId: claim.id
    });

    return res.json({ success: true, data: claim, message: 'Reimbursement sent back' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: "Error sending back request" });
  }
};

export const bulkApproveReimbursements = async (req: Request, res: Response) => {
  try {
    const { ids, remarks } = req.body;
    const user = (req as any).user;
    const userRoleUpper = (user?.role || '').toUpperCase().trim();
    const userRole = (user?.role || '').toLowerCase().trim();

    if (!APPROVER_ROLES.includes(userRoleUpper) && !user?.hasAccountsAccess) {
      return res.status(403).json({ success: false, message: "Forbidden: Insufficient permissions for bulk approval." });
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "No claim IDs provided for bulk approval." });
    }

    const existingClaims = await prisma.reimbursement.findMany({
      where: { id: { in: ids } }
    });

    if (!['ADMIN', 'OWNER'].includes(userRoleUpper)) {
      const hasSelfClaim = existingClaims.some((c) => c.employeeId === user.id);
      if (hasSelfClaim) {
        return res.status(403).json({ success: false, message: "Forbidden: You cannot approve your own reimbursement claim." });
      }
    }

    const isFinalApprover = ['partner', 'admin', 'owner', 'hr'].includes(userRole) || ACCOUNTS_ROLES.includes(userRoleUpper);
    const targetStatus = isFinalApprover ? 'APPROVED' : 'MANAGER_APPROVED';

    const results = await prisma.$transaction(
      ids.map((id: string) =>
        prisma.reimbursement.update({
          where: { id },
          data: {
            status: targetStatus,
            remarks,
            managerApprovedBy: !isFinalApprover ? user.id : undefined,
            managerApprovedAt: !isFinalApprover ? new Date() : undefined,
            partnerApprovedBy: isFinalApprover ? user.id : undefined,
            partnerApprovedAt: isFinalApprover ? new Date() : undefined,
            approvedBy: isFinalApprover ? user.id : undefined,
            approvedAt: isFinalApprover ? new Date() : undefined,
            logs: {
              create: {
                action: 'approved',
                status: targetStatus,
                performedById: user.id,
                remarks: remarks || 'Bulk approved'
              }
            }
          }
        })
      )
    );

    return res.json({ success: true, count: results.length, message: 'Bulk approval successful' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: "Error in bulk approval" });
  }
};

export const bulkRejectReimbursements = async (req: Request, res: Response) => {
  try {
    const { ids, remarks } = req.body;
    const user = (req as any).user;
    const userRoleUpper = (user?.role || '').toUpperCase().trim();

    if (!APPROVER_ROLES.includes(userRoleUpper) && !user?.hasAccountsAccess) {
      return res.status(403).json({ success: false, message: "Forbidden: Insufficient permissions for bulk rejection." });
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "No claim IDs provided for bulk rejection." });
    }

    const existingClaims = await prisma.reimbursement.findMany({
      where: { id: { in: ids } }
    });

    if (!['ADMIN', 'OWNER'].includes(userRoleUpper)) {
      const hasSelfClaim = existingClaims.some((c) => c.employeeId === user.id);
      if (hasSelfClaim) {
        return res.status(403).json({ success: false, message: "Forbidden: You cannot reject your own reimbursement claim." });
      }
    }

    const results = await prisma.$transaction(
      ids.map((id: string) =>
        prisma.reimbursement.update({
          where: { id },
          data: {
            status: 'REJECTED',
            rejectionReason: remarks,
            remarks,
            rejectedAt: new Date(),
            logs: {
              create: {
                action: 'rejected',
                status: 'REJECTED',
                performedById: user.id,
                remarks: remarks || 'Bulk rejected'
              }
            }
          }
        })
      )
    );

    return res.json({ success: true, count: results.length, message: 'Bulk rejection successful' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: "Error in bulk rejection" });
  }
};

export const markAsPaid = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { paymentMode, bankReference, utrNumber, remarks } = req.body;
    const user = (req as any).user;
    const userRoleUpper = (user?.role || '').toUpperCase().trim();

    if (!PAID_ROLES.includes(userRoleUpper) && !user?.hasAccountsAccess) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Only Admin, Owner, or Accounts/Finance roles can mark reimbursements as paid."
      });
    }

    const existingClaim = await prisma.reimbursement.findUnique({ where: { id } });
    if (!existingClaim) return res.status(404).json({ success: false, message: "Claim not found" });

    if (existingClaim.employeeId === user.id && !['ADMIN', 'OWNER'].includes(userRoleUpper)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You cannot mark your own reimbursement claim as paid."
      });
    }

    const currentStatus = (existingClaim.status || '').toUpperCase();
    if (currentStatus === 'PAID') {
      return res.status(400).json({ success: false, message: "Claim is already marked as paid." });
    }
    if (!['APPROVED', 'APPROVED_DIRECTOR', 'APPROVED_CFO', 'PENDING_PAYMENT'].includes(currentStatus)) {
      return res.status(400).json({
        success: false,
        message: `Only approved claims can be marked as paid (current status: ${existingClaim.status}).`
      });
    }

    const claim = await prisma.reimbursement.update({
      where: { id },
      data: {
        status: 'PAID',
        paymentStatus: 'Paid',
        paymentDate: new Date(),
        paidAt: new Date(),
        paymentMode: paymentMode || 'Bank Transfer',
        bankReference,
        utrNumber,
        accountantRemarks: remarks,
        processedById: user.id,
        processedAt: new Date(),
        logs: {
          create: {
            action: 'paid',
            status: 'PAID',
            performedById: user.id,
            remarks: `Marked as paid. Ref: ${bankReference || 'N/A'}`
          }
        }
      },
      include: { employee: true }
    });

    await NotificationService.createNotification({
      userId: claim.employeeId,
      title: 'Reimbursement Paid',
      message: `Your claim ${claim.claimId} has been marked as paid. Amount: ₹${claim.amount}`,
      type: 'reimbursement',
      relatedId: claim.id
    });

    return res.json({ success: true, data: sanitizeClaimEmployee(claim), message: 'Reimbursement marked as paid' });
  } catch (error: any) {
    console.error("🔥 [markAsPaid] Error:", error.message);
    return res.status(500).json({ success: false, message: "Error marking as paid" });
  }
};

export const updateReimbursementStatus = async (req: Request, res: Response) => {
  const targetStatus = String(req.body?.status || '').toUpperCase().trim();
  if (targetStatus === 'PAID') {
    return markAsPaid(req, res);
  }
  if (targetStatus === 'APPROVED' || targetStatus === 'MANAGER_APPROVED') {
    return approveReimbursement(req, res);
  }
  if (targetStatus === 'REJECTED') {
    return rejectReimbursement(req, res);
  }
  if (targetStatus === 'SENT_BACK' || targetStatus === 'SEND_BACK') {
    return sendBackReimbursement(req, res);
  }
  return res.status(400).json({ success: false, message: `Unsupported status transition: ${req.body?.status}` });
};

export const getReimbursementKPIs = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { month, year, employeeId, orgView } = req.query;
    const userRole = user.role?.toUpperCase();
    const isPowerUser = ['ADMIN', 'PARTNER', 'OWNER', 'HR', 'ACCOUNTANT', 'FINANCE MANAGER'].includes(userRole);

    let startDateObj = startOfMonth(new Date());
    let endDateObj = endOfMonth(new Date());

    if (month && year) {
      const parsedMonth = parseInt(String(month));
      const parsedYear = parseInt(String(year));
      if (!isNaN(parsedMonth) && !isNaN(parsedYear)) {
        startDateObj = new Date(parsedYear, parsedMonth - 1, 1);
        endDateObj = endOfMonth(startDateObj);
      }
    }

    const where: any = { date: { gte: startDateObj, lte: endDateObj } };
    
    // Scoping
    if (isPowerUser && orgView === 'true') {
      if (employeeId && isValidUUID(employeeId)) where.employeeId = employeeId;
    } else if (userRole === 'MANAGER' && orgView === 'true') {
      where.OR = [
        { managerId: user.id },
        { partnerId: user.id },
        { employeeId: user.id },
        { employee: { managers: { some: { managerId: user.id } } } },
        { employee: { partners: { some: { partnerId: user.id } } } },
        { employee: { subManagerId: user.id } },
        {
          // Manager sees KPIs of employees under their sub-managers
          employee: {
            subManager: {
              subManagedEmployees: {
                some: {
                  managers: { some: { managerId: user.id } }
                }
              }
            }
          }
        },
        {
          // Manager sees their sub-managers' own KPIs
          employee: {
            subManagedEmployees: {
              some: {
                managers: { some: { managerId: user.id } }
              }
            }
          }
        }
      ];
      if (employeeId && isValidUUID(employeeId)) where.employeeId = employeeId;
    } else {
      where.employeeId = user.id;
    }

    const [totalPending, approvedResult, rejectedResult, pendingAmount, approvedAmount, paidAmount] = await Promise.all([
      prisma.reimbursement.count({ 
        where: { 
          ...where, 
          status: { in: ['PENDING_MANAGER', 'MANAGER_APPROVED'] }
        } 
      }),
      prisma.reimbursement.count({ where: { ...where, status: 'APPROVED' } }),
      prisma.reimbursement.count({ where: { ...where, status: 'REJECTED' } }),
      prisma.reimbursement.aggregate({ where: { ...where, status: { in: ['PENDING_MANAGER', 'MANAGER_APPROVED'] } }, _sum: { amount: true } }),
      prisma.reimbursement.aggregate({ where: { ...where, status: 'APPROVED' }, _sum: { amount: true } }),
      prisma.reimbursement.aggregate({ where: { ...where, paymentStatus: 'Paid' }, _sum: { amount: true } })
    ]);

    return res.json({
      success: true,
      data: {
        totalPending,
        approvedCount: approvedResult,
        rejectedCount: rejectedResult,
        pendingAmount: pendingAmount._sum.amount || 0,
        approvedAmount: approvedAmount._sum.amount || 0,
        paidAmount: paidAmount._sum.amount || 0,
        monthlyApprovalCount: approvedResult + rejectedResult
      }
    });
  } catch (error: any) {
    console.error("🔥 [getReimbursementKPIs] Error:", error.message);
    return res.status(500).json({ success: false, message: "Error fetching KPIs" });
  }
};

export const bulkUploadReimbursements = async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const jsonData = ExcelService.parseExcel(req.file.buffer);
    const user = (req as any).user;
    const results = [];
    const errors = [];

    for (let row of jsonData) {
      try {
        const { category, amount, description, date, employeeEmail } = row;
        const emp = await prisma.employee.findUnique({ 
          where: { officeEmail: (employeeEmail || '').trim() },
          select: { 
            id: true, 
            managers: { select: { managerId: true } },
            partners: { select: { partnerId: true } }
          } as any
        });
        
        let targetEmployeeId = user.id;
        let managerId = null;
        let partnerId = null;

        if (emp) {
          targetEmployeeId = (emp as any).id;
          managerId = (emp as any).managers && (emp as any).managers.length > 0 ? (emp as any).managers[0].managerId : null;
          partnerId = (emp as any).partners && (emp as any).partners.length > 0 ? (emp as any).partners[0].partnerId : null;
        }

        const count = await prisma.reimbursement.count();
        const claimId = `CLM-${String(count + 1).padStart(3, '0')}`;

        const parsedAmount = Number(String(amount).replace(/[₹,]/g, "").trim());
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
          throw new Error(`Invalid amount: ${amount}`);
        }

        const claim = await prisma.reimbursement.create({
          data: {
            claimId,
            category: category || 'Other',
            amount: parsedAmount,
            description: description || '',
            date: date ? new Date(date) : new Date(),
            employeeId: targetEmployeeId,
            status: 'PENDING_MANAGER',
            managerId: managerId as any,
            partnerId: partnerId as any,
            approvalLevel: 1,
            logs: {
              create: {
                action: 'submitted',
                status: 'PENDING_MANAGER',
                performedById: user.id,
                remarks: 'Bulk uploaded'
              }
            }
          }
        });
        results.push(claim);
      } catch (err: any) {
        errors.push({ row, error: err.message });
      }
    }

    return res.json({ success: true, data: { successCount: results.length, errors }, message: 'Bulk upload complete' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: "Error in bulk upload" });
  }
};

export const exportReimbursements = async (req: Request, res: Response) => {
  try {
    const { status, employeeId, category, startDate, endDate, q } = req.query;
    const where: any = {};

    if (status && status !== 'All Status') where.status = String(status).toUpperCase();
    if (employeeId && isValidUUID(employeeId)) where.employeeId = employeeId;
    if (category && category !== 'All Categories') where.category = String(category);
    if (startDate && endDate) where.date = { gte: new Date(String(startDate)), lte: new Date(String(endDate)) };
    if (q) {
      where.OR = [
        { claimId: { contains: String(q), mode: 'insensitive' } },
        { description: { contains: String(q), mode: 'insensitive' } }
      ];
    }

    const claims = await prisma.reimbursement.findMany({
      where,
      include: { employee: true, client: true, project: true },
      orderBy: { date: 'desc' }
    });

    const exportData = claims.map(c => ({
      'Claim ID': c.claimId,
      'Employee': `${c.employee.firstName} ${c.employee.lastName}`,
      'Client': c.client?.name || 'N/A',
      'Project': c.project?.name || 'N/A',
      'Category': c.category,
      'Amount': c.amount,
      'Date': c.date.toISOString().split('T')[0],
      'Status': c.status,
      'Description': c.description,
      'Remarks': c.remarks || ''
    }));

    return ExcelService.exportToExcel(res, exportData, 'reimbursements');
  } catch (error: any) {
    return res.status(500).json({ success: false, message: "Error exporting data" });
  }
};
export const getReimbursementCharts = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    
    // Trend Data (Last 6 Months)
    const trendData = [];
    for (let i = 5; i >= 0; i--) {
      const monthDate = startOfMonth(new Date());
      monthDate.setMonth(monthDate.getMonth() - i);
      const start = startOfMonth(monthDate);
      const end = endOfMonth(monthDate);
      
      const [approved, pending] = await Promise.all([
        prisma.reimbursement.count({ where: { status: 'APPROVED', date: { gte: start, lte: end } } }),
        prisma.reimbursement.count({ where: { status: { in: ['PENDING_MANAGER', 'MANAGER_APPROVED'] }, date: { gte: start, lte: end } } })
      ]);
      
      trendData.push({
        name: monthDate.toLocaleString('default', { month: 'short' }),
        approved,
        pending
      });
    }

    // Category Distribution
    const categories = await prisma.reimbursement.groupBy({
      by: ['category'],
      _count: { id: true },
      _sum: { amount: true }
    });

    const pieData = categories.map(c => ({
      name: c.category,
      value: c._count.id,
      amount: c._sum.amount || 0
    }));

    return res.json({
      success: true,
      data: { trendData, pieData },
      message: 'Chart data retrieved'
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: "Error fetching charts" });
  }
};

export const getTeamApprovals = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user || !user.id) {
       console.error("❌ [getTeamApprovals] Unauthorized: User context missing");
       return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { q, status, category, startDate, endDate, orgView, employeeId, department } = req.query;
    const userRole = user.role?.toUpperCase();
    const isPowerUser = ['PARTNER', 'ADMIN', 'OWNER', 'HR', 'ACCOUNTANT', 'FINANCE MANAGER'].includes(userRole);
    const isOrgView = orgView === 'true';

    console.log("🔍 [getTeamApprovals] Query Params:", { q, status, category, startDate, endDate, orgView: isOrgView, employeeId, department, userRole });

    // 1. Robust Date Parsing
    const dateStart = startDate && !isNaN(new Date(String(startDate)).getTime()) ? new Date(String(startDate)) : null;
    const dateEnd = endDate && !isNaN(new Date(String(endDate)).getTime()) ? new Date(String(endDate)) : null;

    // 2. Safe Where Construction
    const where: any = {
      // Role-based visibility scoping
      ...(isPowerUser && isOrgView
        ? {} // Power users in Org View see everything (status filters apply later)
        : userRole === 'MANAGER' || (isPowerUser && !isOrgView)
          ? {
              OR: [
                { managerId: user.id },
                { partnerId: user.id }
              ]
            }
          : { id: '0' } // Fallback to nothing if unauthorized
      ),

      // Status Filter
      ...(status && status !== 'all' && status !== 'all_levels' && status !== ''
        ? {
            status: ['PENDING', 'pending'].includes(String(status))
              ? { in: ['PENDING_MANAGER', 'MANAGER_APPROVED'] }
              : String(status).toUpperCase()
          }
        : !status || status === 'pending'
          ? { status: { in: ['PENDING_MANAGER', 'MANAGER_APPROVED'] } }
          : {}
      ),

      // Secondary Filters
      ...(employeeId && isValidUUID(employeeId) ? { employeeId: String(employeeId) } : {}),
      ...(department && department !== 'All Departments' ? { employee: { department: String(department) } } : {}),
      ...(category && category !== 'All Categories' && category !== '' ? { category: String(category) } : {}),

      // Date Range Filter
      ...(dateStart && dateEnd
        ? { date: { gte: dateStart, lte: dateEnd } }
        : dateStart
          ? { date: { gte: dateStart } }
          : dateEnd
            ? { date: { lte: dateEnd } }
            : {}
      ),

      // Search Filter
      ...(q && String(q).trim() !== ''
        ? {
            OR: [
              ...(isPowerUser && isOrgView ? [] : [{ managerId: user.id }, { partnerId: user.id }]), // Maintain scoping if needed
              { claimId: { contains: String(q).trim(), mode: 'insensitive' } },
              { description: { contains: String(q).trim(), mode: 'insensitive' } },
              { employee: { firstName: { contains: String(q).trim(), mode: 'insensitive' } } },
              { employee: { lastName: { contains: String(q).trim(), mode: 'insensitive' } } },
              { category: { contains: String(q).trim(), mode: 'insensitive' } }
            ]
          }
        : {}
      )
    };

    // Edge case for regular employees
    if (!isPowerUser && userRole !== 'MANAGER') {
      console.warn(`⚠️ [getTeamApprovals] Unauthorized access attempt by user ${user.id}`);
      return res.json({ success: true, data: [], message: 'No approvals found for your role' });
    }

    console.log("⚙️ [getTeamApprovals] Final Where Clause:", JSON.stringify(where, null, 2));

    const data = await prisma.reimbursement.findMany({
      where,
      include: {
        employee: { 
          select: { 
            id: true, 
            firstName: true, 
            lastName: true, 
            employeeId: true, 
            department: true, 
            managers: { include: { manager: { select: { firstName: true, lastName: true } } } }
          } 
        },
        client: { select: { name: true } },
        project: { select: { name: true } },
        job: { select: { name: true } },
        attachments: true,
        managerApprover: { select: { firstName: true, lastName: true } },
        partnerApprover: { select: { firstName: true, lastName: true } },
        processedBy: { select: { firstName: true, lastName: true } },
        logs: {
          include: { performedBy: { select: { firstName: true, lastName: true } } },
          orderBy: { performedAt: 'desc' }
        }
      } as any,
      orderBy: { submittedAt: 'desc' }
    });

    console.log(`✅ [getTeamApprovals] Found ${data.length} approvals`);

    return res.json({ 
      success: true, 
      count: data.length,
      data: data || [], 
      message: 'Approvals retrieved successfully' 
    });
  } catch (error: any) {
    console.error("🔥 [getTeamApprovals] Critical Error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Internal server error while fetching team approvals",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getPendingRequests = async (req: Request, res: Response) => {
  req.query.status = 'PENDING';
  return getAllReimbursements(req, res);
};

export const getApprovedRequests = async (req: Request, res: Response) => {
  req.query.status = 'APPROVED';
  return getAllReimbursements(req, res);
};

export const getRejectedRequests = async (req: Request, res: Response) => {
  req.query.status = 'REJECTED';
  return getAllReimbursements(req, res);
};

export const getReimbursementLogs = async (req: Request, res: Response) => {
  try {
    const logs = await (prisma.reimbursementLog as any).findMany({
      include: {
        reimbursement: {
          include: {
            employee: { select: { firstName: true, lastName: true, employeeId: true } },
            finalApprover: { select: { firstName: true, lastName: true } }
          }
        },
        performedBy: { select: { firstName: true, lastName: true } }
      },
      orderBy: { performedAt: 'desc' }
    });
    return res.json({ success: true, data: logs });
  } catch (error: any) {
    console.error("🔥 [getReimbursementLogs] Error:", error.message);
    return res.status(500).json({ success: false, message: "Error fetching logs" });
  }
};
