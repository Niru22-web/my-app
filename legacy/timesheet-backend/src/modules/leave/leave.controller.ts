import { Request, Response } from 'express';
import { prisma } from '../../config/prisma';
import { notifyReportingManager, triggerNotification } from '../../services/notification.service';

/**
 * Validates if a string is a valid UUID to prevent PostgreSQL query errors.
 */
const isValidUUID = (uuid: any): boolean => {
  if (!uuid || typeof uuid !== 'string') return false;
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  const isBusinessId = /^[A-Za-z0-9_-]{3,20}$/.test(uuid);
  return uuidRegex.test(uuid) || isBusinessId;
};

// Utility to calculate dynamically accrued balance from transactions
// Utility to calculate dynamically accrued balance based on Financial Year (April 1 - March 31)
const calculateLeaveBalance = async (employeeId: string) => {
  if (!employeeId || !isValidUUID(employeeId)) {
    throw new Error('Invalid employee ID format');
  }

  const today = new Date();
  
  // Financial Year Start: April 1st
  // If today is Jan-Mar (0,1,2), FY started April 1st of PREVIOUS year.
  // If today is Apr-Dec (3-11), FY started April 1st of CURRENT year.
  const fyStart = new Date(
    today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1,
    3, 1, 0, 0, 0, 0
  );
  
  // Financial Year End: March 31st of next year
  const fyEnd = new Date(fyStart.getFullYear() + 1, 2, 31, 23, 59, 59, 999);
  
  // Calculate total days in this financial year (handles leap years)
  const totalDaysInYear = Math.round((fyEnd.getTime() - fyStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  // Calculate days passed since FY start
  const daysPassed = Math.floor((today.getTime() - fyStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  
  // Daily accrual rate: 16 days / total days in FY
  const dailyAccrual = 16 / totalDaysInYear;
  
  // Accrued Leave = days passed * daily accrual, capped at 16
  const accrued = Math.min(daysPassed * dailyAccrual, 16);

  // Fetch all approved leave transactions (used and adjustments) within current FY
  const transactions = await prisma.leaveTransaction.findMany({
    where: { 
      employeeId,
      date: {
        gte: fyStart,
        lte: fyEnd
      }
    }
  });

  let used = 0;
  let adjustment = 0;

  transactions.forEach((t: any) => {
    if (t.type === 'used') used += t.amount || 0;
    else if (t.type === 'adjustment') adjustment += t.amount || 0;
  });

  // Final available balance
  const available = accrued - used + adjustment;
  
  // KPI Score based on discipline (how much of the 16 days is left)
  const kpiScore = Math.max(0, ((16 - used) / 16) * 100);

  return {
    accrued: parseFloat(accrued.toFixed(2)),
    used: parseFloat(used.toFixed(2)),
    adjustment: parseFloat(adjustment.toFixed(2)),
    available: parseFloat(available.toFixed(2)),
    kpiScore: parseFloat(kpiScore.toFixed(1)),
    financialYearStart: fyStart.toISOString().split('T')[0],
    financialYearEnd: fyEnd.toISOString().split('T')[0]
  };
};

// Helper to safely parse dates from various formats (ISO or DD-MM-YYYY)
const parseDateInput = (dateStr: any) => {
  if (!dateStr || dateStr === 'undefined' || String(dateStr).trim() === '') return null;
  
  const str = String(dateStr).trim();
  // Handle DD-MM-YYYY
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(str)) {
    const [dd, mm, yyyy] = str.split("-");
    return new Date(`${yyyy}-${mm}-${dd}`);
  }
  
  const date = new Date(str);
  return isNaN(date.getTime()) ? null : date;
};

// Get leave records based on user role
export const getLeaves = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user || !user.id) {
       return res.status(401).json({ success: false, message: "Unauthorized: User context missing" });
    }

    console.log("📥 [getLeaves] Request Query:", req.query);
    const { type, status, dateFrom, dateTo, employeeId } = req.query;

    const where: any = {};
    
    // 1. Role-based Visibility Logic
    const userRoleNormalized = user.role?.toLowerCase() || '';
    const isAdmin = ['admin', 'owner'].includes(userRoleNormalized);
    const isApprover = ['manager', 'partner', 'sub manager', 'sub-manager', 'hr'].includes(userRoleNormalized);

    if (isAdmin) {
      // Admins can see everything, but can filter by employeeId if provided
      const targetEmpId = String(employeeId || '').trim();
      if (targetEmpId && targetEmpId !== 'undefined' && isValidUUID(targetEmpId)) {
        where.employeeId = targetEmpId;
      }
    } else if (isApprover) {
      // Approvers see leaves assigned to them OR their own leaves
      const targetId = String(employeeId || '').trim();
      if (targetId && targetId !== 'undefined' && isValidUUID(targetId)) {
        where.employeeId = targetId;
      } else {
        where.OR = [
          { employee: { managers: { some: { managerId: user.id } } } },
          { employee: { reportingManagerIds: { has: user.id } } },
          { employee: { partners: { some: { partnerId: user.id } } } },
          { employee: { reportingPartnerIds: { has: user.id } } },
          { employee: { subManagerIds: { has: user.id } } },
          { employee: { subManagerId: user.id } },
          {
            // Manager sees employees under their sub-managers
            employee: {
              subManager: {
                subManagedEmployees: {
                  some: {
                    OR: [
                      { managers: { some: { managerId: user.id } } },
                      { reportingManagerIds: { has: user.id } }
                    ]
                  }
                }
              }
            }
          },

          {
            // Manager sees their sub-managers' own leaves
            employee: {
              subManagedEmployees: {
                some: {
                  OR: [
                    { managers: { some: { managerId: user.id } } },
                    { reportingManagerIds: { has: user.id } }
                  ]
                }
              }
            }
          },

          { employeeId: user.id }
        ];
      }
    } else {
      // Regular employees ONLY see their own records
      where.employeeId = user.id;
    }

    // 2. Status Filter
    if (status && status !== 'All Status' && String(status).trim() !== '') {
      where.status = String(status).toLowerCase();
    }

    // 3. Type Filter
    if (type && type !== 'All Types' && String(type).trim() !== '') {
      where.type = String(type);
    }
    
    // 4. Date Filtering (Safe Parsing)
    const start = parseDateInput(dateFrom);
    const end = parseDateInput(dateTo);

    if (start && end) {
      where.fromDate = { gte: start };
      where.toDate = { lte: end };
    } else if (start) {
      where.fromDate = { gte: start };
    } else if (end) {
      where.toDate = { lte: end };
    }

    console.log("🔍 [getLeaves] Applied Filters:", JSON.stringify(where, null, 2));

    const leaves = await prisma.leave.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            officeEmail: true
          }
        },
        approver: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      } as any,
      orderBy: { appliedDate: 'desc' }
    });

    return res.json({
      success: true,
      data: leaves,
      message: 'Leaves retrieved successfully'
    });
  } catch (error: any) {
    console.error("🔥 [getLeaves] Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching leaves",
      error: error.message
    });
  }
};

// Create new leave request

export const createLeave = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user || !user.id) {
       return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { type, reason, duration, fromDate, toDate, totalDays } = req.body;
    if (!type || !fromDate || !toDate || totalDays === undefined) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // Generate unique leave ID
    const count = await prisma.leave.count();
    const leaveId = `LV-${String(count + 1).padStart(3, '0')}`;

    // Validate against available balance
    const currentYear = new Date().getFullYear();
    const balance = await calculateLeaveBalance(user.id);
    const parsedTotalDays = parseFloat(totalDays);
    
    // Optional: Add warning but don't block
    const willGoNegative = parsedTotalDays > balance.available;




    // Fetch employee details for reporting structure and notifications
    const employee = await prisma.employee.findUnique({
      where: { id: user.id },
      select: { 
        id: true,
        firstName: true, 
        lastName: true,
        managers: { select: { managerId: true } },
        partners: { select: { partnerId: true } }      }
    });

    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }

    const employeeName = `${employee.firstName} ${employee.lastName || ''}`.trim();

    let status = 'pending';
    if (['Partner', 'Admin', 'Owner'].includes(user.role)) {
      status = 'auto_approved';
    }

    const newLeave = await prisma.leave.create({
      data: {
        leaveId,
        type,
        reason: reason || '',
        duration: duration || 'full_day',
        fromDate: new Date(fromDate),
        toDate: new Date(toDate),
        totalDays: parsedTotalDays,
        employeeId: user.id,
        status
      } as any
    });

    if (status === 'auto_approved') {
      const today = new Date();
      const currentYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
      
      await prisma.leaveTransaction.create({
        data: {
          employeeId: user.id,
          type: 'used',
          amount: parsedTotalDays,
          reason: `Auto approved leave: ${leaveId}`,
          year: currentYear
        }
      });
    } else {
      await notifyReportingManager(
        user.id,
        'Leave Application 🏖️',
        `${employeeName} applied for leave: ${new Date(fromDate).toLocaleDateString()} to ${new Date(toDate).toLocaleDateString()}`,
        'leave',
        `/approvals/leaves`
      );
    }


    return res.status(201).json({
      success: true,
      data: newLeave,
      message: 'Leave request submitted successfully'
    });
  } catch (error: any) {
    console.error("🔥 [createLeave] Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error while creating leave",
      error: error.message
    });
  }
};

// Update leave status (approve/reject)
export const updateLeaveStatus = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;
    const { status } = req.body; // status can be 'approved' or 'rejected'

    if (!isValidUUID(id)) return res.status(400).json({ success: false, message: 'Invalid ID format' });

    const existingLeave = await prisma.leave.findUnique({ 
      where: { id },
      include: { employee: true }
    });
    
    if (!existingLeave) return res.status(404).json({ success: false, message: 'Leave not found' });

    // 1. Single-Level Approval Logic: Only PENDING leaves can be processed
    if (existingLeave.status !== 'pending') {
      return res.status(400).json({ 
        success: false, 
        message: `This leave request is already ${existingLeave.status} and cannot be modified.` 
      });
    }

    // Role check: Only Manager, Partner, HR, Admin, or Sub Manager can approve/reject
    const userRoleNormalized = user.role?.toLowerCase() || '';
    if (!['admin', 'manager', 'partner', 'owner', 'hr', 'sub manager', 'sub-manager'].includes(userRoleNormalized)) {
      return res.status(403).json({ success: false, message: 'Forbidden: You do not have permission to approve leaves' });
    }

    const isApproved = status === 'approved';
    const newStatus = isApproved ? 'approved' : 'rejected';

    // Update leave record with approver info
    const updatedLeave = await prisma.leave.update({
      where: { id },
      data: {
        status: newStatus,
        approvedBy: user.id,
        approvedRole: user.role, // Track who approved it
        approvedDate: new Date()
      } as any,
      include: { employee: true }
    });


    // 2. Deduction Logic (Triggers immediately on approval)
    if (isApproved) {
      console.log(`✅ [Single-Level Approval] Leave ${updatedLeave.leaveId} approved by ${user.role} (${user.id})`);
      
      const today = new Date();
      const fyStartYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
      
      // Record transaction to deduct balance
      await prisma.leaveTransaction.create({
        data: {
          employeeId: updatedLeave.employeeId,
          type: 'used',
          amount: updatedLeave.totalDays,
          reason: `Approved leave: ${updatedLeave.leaveId}`,
          year: fyStartYear,
          date: new Date()
        }
      });

      // Sync LeaveBalance summary table
      try {
        await prisma.leaveBalance.update({
          where: {
            employeeId_year: {
              employeeId: updatedLeave.employeeId,
              year: fyStartYear
            }
          },
          data: {
            usedLeaves: { increment: updatedLeave.totalDays },
            remainingLeaves: { decrement: updatedLeave.totalDays }
          }
        });
      } catch (err) {
        console.warn(`⚠️ [updateLeaveStatus] No LeaveBalance record for ${updatedLeave.employeeId} in ${fyStartYear}. Skipping summary update.`);
      }

      // Check for negative balance and notify
      const balance = await calculateLeaveBalance(updatedLeave.employeeId);
      if (balance.available < 0) {
        await triggerNotification({
          userId: updatedLeave.employeeId,
          title: 'Negative Leave Balance 🔴',
          message: `Your leave balance is now ${balance.available} days.`,
          type: 'leave',
          actionUrl: '/leave-management'
        });
      }
    }

    // 3. Notification to Employee
    await triggerNotification({
      userId: updatedLeave.employeeId,
      title: `Leave Request ${newStatus.toUpperCase()}`,
      message: `Your leave request for ${updatedLeave.totalDays} days has been ${newStatus} by ${user.role}.`,
      type: 'leave',
      actionUrl: '/leave-management'
    });

    // Notify Manager if Sub Manager takes action
    const employeeData = updatedLeave.employee as any;
    const isSubManager = employeeData.subManagerId === user.id || 
                        (employeeData.subManagerIds || []).includes(user.id);


    if (isSubManager) {
      const managers = await prisma.employee.findUnique({
        where: { id: updatedLeave.employeeId },
        select: {
          reportingManagerIds: true,
          managers: { select: { managerId: true } }
        }
      });

      const managerIds = new Set([
        ...(managers?.reportingManagerIds || []),
        ...((managers?.managers as any[])?.map((m: any) => m.managerId) || [])
      ]);


      for (const mId of managerIds) {
        await triggerNotification({
          userId: mId,
          title: `Sub Manager Action: Leave ${newStatus.toUpperCase()}`,
          message: `Sub Manager ${user.firstName} ${newStatus} leave request for ${updatedLeave.employee.firstName} ${updatedLeave.employee.lastName}.`,
          type: 'leave',
          actionUrl: '/approvals/leaves'
        });
      }
    }


    return res.json({ 
      success: true, 
      data: updatedLeave, 
      message: `Leave request has been ${newStatus} successfully.` 
    });
  } catch (error: any) {
    console.error("🔥 [updateLeaveStatus] Error:", error.message);
    return res.status(500).json({ success: false, message: "Internal server error during leave approval", error: error.message });
  }
};



const hasLeaveWritePermission = async (leave: any, user: any): Promise<boolean> => {
  const userRole = user.role?.toUpperCase();
  // 1. Creator of the leave
  if (leave.employeeId === user.id) return true;
  // 2. Power users (Admin, Partner, Owner, HR)
  if (['ADMIN', 'PARTNER', 'OWNER', 'HR'].includes(userRole)) return true;
  
  // 3. Check if manager of the employee who submitted
  if (userRole === 'MANAGER' || userRole === 'SUB MANAGER' || userRole === 'SUB-MANAGER') {
    const isEmpManager = await (prisma as any).employeeManager.findUnique({
      where: {
        employeeId_managerId: {
          employeeId: leave.employeeId,
          managerId: user.id
        }
      }
    });
    if (isEmpManager) return true;

    // Check if subManager
    const employee = await prisma.employee.findUnique({
      where: { id: leave.employeeId },
      select: { subManagerId: true }
    });
    if (employee && employee.subManagerId === user.id) return true;
  }
  
  // 4. Check if partner of the employee who submitted
  if (userRole === 'PARTNER') {
    const isEmpPartner = await (prisma as any).employeePartner.findUnique({
      where: {
        employeeId_partnerId: {
          employeeId: leave.employeeId,
          partnerId: user.id
        }
      }
    });
    if (isEmpPartner) return true;
  }
  return false;
};

// Update leave details (only allowed if pending and authorized)
export const updateLeave = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    const { type, reason, duration, fromDate, toDate, totalDays } = req.body;

    if (!isValidUUID(id)) return res.status(400).json({ success: false, message: 'Invalid ID format' });

    const existingLeave = await prisma.leave.findUnique({ where: { id } });
    if (!existingLeave) return res.status(404).json({ success: false, message: 'Leave request not found' });

    const hasPermission = await hasLeaveWritePermission(existingLeave, user);
    if (!hasPermission) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    if (existingLeave.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Can only edit pending leave requests' });
    }

    const updateData: any = {};
    if (type) updateData.type = type;
    if (reason !== undefined) updateData.reason = reason;
    if (duration) updateData.duration = duration;
    if (fromDate) updateData.fromDate = new Date(fromDate);
    if (toDate) updateData.toDate = new Date(toDate);
    if (totalDays !== undefined) updateData.totalDays = parseFloat(totalDays);

    const updatedLeave = await prisma.leave.update({
      where: { id },
      data: updateData
    });

    return res.json({ success: true, data: updatedLeave, message: 'Leave request updated successfully' });
  } catch (error: any) {
    console.error("🔥 [updateLeave] Error:", error.message);
    return res.status(500).json({ success: false, message: 'Error updating leave request' });
  }
};

// Cancel/delete leave request
export const deleteLeave = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    if (!isValidUUID(id)) return res.status(400).json({ success: false, message: 'Invalid ID format' });

    const leave = await prisma.leave.findUnique({ where: { id } });
    if (!leave) return res.status(404).json({ success: false, message: 'Leave not found' });

    const hasPermission = await hasLeaveWritePermission(leave, user);
    if (!hasPermission) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    if (leave.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Can only cancel pending requests' });
    }

    await prisma.leave.update({ 
      where: { id },
      data: { status: 'cancelled' }
    });
    return res.json({ success: true, message: 'Leave cancelled successfully' });
  } catch (error: any) {
    console.error("🔥 [deleteLeave] Error:", error.message);
    return res.status(500).json({ success: false, message: "Error deleting leave" });
  }
};

export const getLeaveBalance = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user || !user.id) return res.status(401).json({ success: false, message: "Unauthorized" });

    const employeeIdFromQuery = typeof req.query.employeeId === 'string' ? req.query.employeeId.trim() : String(req.query.employeeId || '').trim();
    console.log(`[getLeaveBalance] Hit for user: ${user.id} (${user.role}), querying: ${employeeIdFromQuery}`);
    
    let targetEmployeeUUID = user.id;

    const userRoleNormalized = user.role?.toLowerCase() || '';
    const isAdminOrManager = ['admin', 'partner', 'owner', 'manager', 'sub manager', 'sub-manager', 'hr'].includes(userRoleNormalized);
    
    // Resolve employeeId from query (could be UUID or business ID like emp_0037)
    if (employeeIdFromQuery && employeeIdFromQuery !== '' && employeeIdFromQuery !== 'undefined') {
      if (isValidUUID(employeeIdFromQuery)) {
        targetEmployeeUUID = employeeIdFromQuery;
      } else {
        // Resolve business ID to UUID
        const employee = await prisma.employee.findUnique({
          where: { employeeId: employeeIdFromQuery }
        });
        if (!employee) {
          console.warn(`[getLeaveBalance] Employee not found for ID: ${employeeIdFromQuery}`);
          return res.status(404).json({ 
            success: false, 
            message: `Employee with ID '${employeeIdFromQuery}' not found` 
          });
        }
        targetEmployeeUUID = employee.id;
        console.log(`[getLeaveBalance] Resolved ${employeeIdFromQuery} to UUID: ${targetEmployeeUUID}`);
      }
    }

    // Authorization: Only admins/managers can view others' balance
    if (!isAdminOrManager && targetEmployeeUUID !== user.id) {
      return res.status(403).json({ 
        success: false, 
        message: "Access denied: You can only view your own leave balance" 
      });
    }

    const balance = await calculateLeaveBalance(targetEmployeeUUID);

    return res.json({
      success: true,
      data: balance,
      message: 'Leave balance retrieved successfully'
    });
  } catch (error: any) {
    console.error("🔥 [getLeaveBalance] Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching balance",
      error: error.message
    });
  }
};

// Admin/Manager adjustment of leave balance
export const adjustLeave = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { employeeId, amount, reason } = req.body;

    const userRoleNormalized = user.role?.toLowerCase() || '';
    if (!['admin', 'partner', 'manager', 'sub manager', 'sub-manager', 'owner', 'hr'].includes(userRoleNormalized)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    if (!employeeId || !isValidUUID(employeeId) || amount === undefined || !reason) {
      return res.status(400).json({ success: false, message: 'Invalid data provided' });
    }

    const today = new Date();
    const fyStartYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
    const amountFloat = parseFloat(amount);

    await prisma.leaveTransaction.create({
      data: {
        employeeId,
        type: 'adjustment',
        amount: amountFloat,
        reason,
        year: fyStartYear
      }
    });

    return res.json({ success: true, message: 'Adjustment recorded successfully' });
  } catch (error: any) {
    console.error("🔥 [adjustLeave] Error:", error.message);
    return res.status(500).json({ success: false, message: "Error adjusting balance" });
  }
};

export const getNegativeBalances = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userRoleNormalized = user?.role?.toLowerCase() || '';
    if (!['admin', 'partner', 'owner', 'hr'].includes(userRoleNormalized)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const employees = await prisma.employee.findMany({
      where: { status: { in: ['active', 'Active'] } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        officeEmail: true,
        employeeId: true,
        designation: true,
        department: true
      }
    });

    const results = [];
    for (const emp of employees) {
      const balance = await calculateLeaveBalance(emp.id);
      if (balance.available < 0) {
        results.push({
          ...emp,
          balance: balance.available,
          used: balance.used,
          accrued: balance.accrued
        });
      }
    }

    return res.json({
      success: true,
      data: results,
      message: 'Negative leave balances retrieved successfully'
    });
  } catch (error: any) {
    console.error("🔥 [getNegativeBalances] Error:", error.message);
    return res.status(500).json({ success: false, message: "Error fetching negative balances" });
  }
};



