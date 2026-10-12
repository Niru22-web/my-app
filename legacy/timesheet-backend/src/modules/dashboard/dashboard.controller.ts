import { Request, Response } from "express";
import { getDashboardSummary, getEmployeeHours, getProjectDistribution, getHoursTrend } from "./dashboard.service";
import { getRecentActivities as getDbActivities, getMyActivities as getMyDbActivities } from "../activity/activity.service";
import { authenticate } from "../../middleware/auth.middleware";
// Using centralized prisma instance
import { prisma } from "../../config/prisma";



interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
    email: string;
  };
}

export const getDashboardSummaryData = async (req: Request, res: Response) => {
  try {
    const { fromDate, toDate, employeeIds, projectIds, status } = req.query;
    const user = (req as any).user;

    const data = await getDashboardSummary(
      user,
      fromDate as string,
      toDate as string,
      employeeIds as string[],
      projectIds as string[],
      status as string
    );

    res.json({
      success: true,
      data,
      message: 'Dashboard summary retrieved successfully'
    });
  } catch (error) {
    console.error("Dashboard summary error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to retrieve dashboard summary" 
    });
  }
};

export const getEmployeeHoursData = async (req: Request, res: Response) => {
  try {
    const { fromDate, toDate, employeeIds, projectIds, status } = req.query;
    const user = (req as any).user;

    const data = await getEmployeeHours(
      user,
      fromDate as string,
      toDate as string,
      employeeIds as string[],
      projectIds as string[],
      status as string
    );

    res.json({
      success: true,
      data,
      message: 'Employee hours data retrieved successfully'
    });
  } catch (error) {
    console.error("Employee hours error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to retrieve employee hours data" 
    });
  }
};

export const getProjectDistributionData = async (req: Request, res: Response) => {
  try {
    const { fromDate, toDate, employeeIds, projectIds, status } = req.query;
    const user = (req as any).user;

    const data = await getProjectDistribution(
      user,
      fromDate as string,
      toDate as string,
      employeeIds as string[],
      projectIds as string[],
      status as string
    );

    res.json({
      success: true,
      data,
      message: 'Project distribution data retrieved successfully'
    });
  } catch (error) {
    console.error("Project distribution error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to retrieve project distribution data" 
    });
  }
};

export const getHoursTrendData = async (req: Request, res: Response) => {
  try {
    const { fromDate, toDate, employeeIds, projectIds, status, granularity = 'daily' } = req.query;
    const user = (req as any).user;

    const data = await getHoursTrend(
      user,
      fromDate as string,
      toDate as string,
      employeeIds as string[],
      projectIds as string[],
      status as string,
      granularity as 'daily' | 'weekly' | 'monthly'
    );

    res.json({
      success: true,
      data,
      message: 'Hours trend data retrieved successfully'
    });
  } catch (error) {
    console.error("Hours trend error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to retrieve hours trend data" 
    });
  }
};

export const exportDashboardData = async (req: Request, res: Response) => {
  try {
    const { format = 'excel', fromDate, toDate, employeeIds, projectIds, status } = req.query;
    const user = (req as any).user;

    // This would integrate with a library like exceljs or pdfkit
    // For now, return the raw data that can be processed client-side
    const summaryData = await getDashboardSummary(
      user,
      fromDate as string,
      toDate as string,
      employeeIds as string[],
      projectIds as string[],
      status as string
    );

    res.json({
      success: true,
      data: summaryData,
      format,
      message: 'Export data retrieved successfully'
    });
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to export data" 
    });
  }
};

// Role-specific dashboard endpoints
export const getAdminStats = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const role = user.role?.toUpperCase();
    const isAdmin = role === 'ADMIN' || role === 'OWNER';
    const isPartner = role === 'PARTNER';
    const isManager = role === 'MANAGER';
    const isHR = role === 'HR';
    const isIT = role === 'IT';
    const isAccountant = role === 'ACCOUNTANT';
    const isAccounts = role === 'ACCOUNTS';
    const hasFullStats = isAdmin || isAccounts;


    let projectWhere: any = {};
    let clientWhere: any = {};
    let employeeWhere: any = { status: { in: ['active', 'Active'] } };
    let jobWhere: any = {};
    let pendingWhere: any = { status: { in: ['pending', 'pending_approval'] } };

    if (!hasFullStats) {
      if (isPartner) {
        projectWhere = {
          OR: [
            { createdBy: user.id }, 
            { users: { some: { employeeId: user.id } } },
            { client: { createdBy: user.id } }
          ]
        };
        clientWhere = {
          OR: [{ createdBy: user.id }, { projects: { some: { createdBy: user.id } } }]
        };
        employeeWhere.OR = [
          { partners: { some: { partnerId: user.id } } },
          { reportingPartnerIds: { has: user.id } }
        ];

        jobWhere = { 
          OR: [
            { createdBy: user.id },
            { project: { createdBy: user.id } },
            { users: { some: { employeeId: user.id } } }
          ]
        };
        pendingWhere.OR = [
          { partners: { some: { partnerId: user.id } } },
          { reportingPartnerIds: { has: user.id } }
        ];

      } else if (isManager) {
        projectWhere = {
          OR: [
            { createdBy: user.id }, 
            { users: { some: { employeeId: user.id } } },
            { jobs: { some: { users: { some: { employeeId: user.id } } } } }
          ]
        };
        clientWhere = {
          projects: { some: { users: { some: { employeeId: user.id } } } }
        };
        employeeWhere.OR = [
          { managers: { some: { managerId: user.id } } },
          { reportingManagerIds: { has: user.id } },
          { subManagerIds: { has: user.id } }
        ];

        jobWhere = {
          OR: [
            { createdBy: user.id },
            { users: { some: { employeeId: user.id } } },
            { project: { users: { some: { employeeId: user.id } } } }
          ]
        };
        pendingWhere.OR = [
          { managers: { some: { managerId: user.id } } },
          { reportingManagerIds: { has: user.id } },
          { subManagerIds: { has: user.id } }
        ];

      } else {
        // Employee
        projectWhere = { 
          OR: [
            { users: { some: { employeeId: user.id } } },
            { jobs: { some: { users: { some: { employeeId: user.id } } } } }
          ]
        };
        clientWhere = { projects: { some: { users: { some: { employeeId: user.id } } } } };
        employeeWhere = { id: user.id };
        jobWhere = { users: { some: { employeeId: user.id } } };
        pendingWhere = { employeeId: user.id, status: 'pending' };
      }
    }

    const [
      totalProjects,
      totalClients,
      totalEmployees,
      totalTasks,
      pendingApprovals,
      activeJobs
    ] = await Promise.all([
      prisma.project.count({ where: projectWhere }),
      prisma.client.count({ where: clientWhere }),
      prisma.employee.count({ where: employeeWhere }),
      prisma.job.count({ where: jobWhere }),
      prisma.employee.count({ where: pendingWhere }),
      prisma.job.count({ 
        where: { 
          ...jobWhere,
          status: { in: ['Started', 'started'] } 
        } 
      })
    ]);

    const stats = {
      totalProjects,
      totalClients,
      totalEmployees,
      totalTasks,
      pendingApprovals,
      activeJobs
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch admin statistics'
    });
  }
};

export const getManagerStats = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const managerId = req.user?.id;

    const [
      assignedProjects,
      teamMembers,
      teamTasks,
      activeJobs
    ] = await Promise.all([
      prisma.timelog.groupBy({ 
        by: ['projectId'], 
        where: { employeeId: managerId } 
      }).then((res: any) => res.length),
      prisma.employee.count({ 
        where: { 
          OR: [
            { managers: { some: { managerId: managerId } } },
            { reportingManagerIds: { has: managerId } },
            { subManagerIds: { has: managerId } }
          ]
        } as any 
      }),

      prisma.timelog.count({ 
        where: { 
          employee: {
            OR: [
              { managers: { some: { managerId: managerId } } },
              { reportingManagerIds: { has: managerId } },
              { subManagerIds: { has: managerId } }
            ]
          } as any,

          submissionStatus: 'submitted'
        }
      }),

      prisma.job.count({ 
        where: { 
          status: { in: ['Started', 'started'] }
        }
      })
    ]);

    const stats = {
      totalProjects: assignedProjects,
      totalEmployees: teamMembers,
      totalTasks: teamTasks,
      activeJobs
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching manager stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch manager statistics'
    });
  }
};

export const getPartnerStats = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const partnerId = req.user?.id;

    const [
      myProjects,
      myClients,
      teamTasks,
      teamMembers
    ] = await Promise.all([
      prisma.timelog.groupBy({ 
        by: ['projectId'], 
        where: { employeeId: partnerId } 
      }).then((res: any) => res.length),
      prisma.client.count({ where: { createdBy: partnerId } }),
      prisma.timelog.count({ 
        where: { 
          employee: {
            OR: [
              { partners: { some: { partnerId: partnerId } } },
              { reportingPartnerIds: { has: partnerId } }
            ]
          } as any,

          submissionStatus: 'submitted'
        }
      }),

      prisma.employee.count({ 
        where: { 
          OR: [
            { partners: { some: { partnerId: partnerId } } },
            { reportingPartnerIds: { has: partnerId } }
          ]
        } as any 
      })

    ]);

    const stats = {
      myProjects,
      myClients,
      teamTasks,
      teamMembers
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching partner stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch partner statistics'
    });
  }
};

export const getEmployeeStats = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const employeeId = req.user?.id;

    const [
      myProjects,
      myTasks,
      completedTasks,
      hoursLogged
    ] = await Promise.all([
      // Count distinct projects employee is assigned to
      prisma.timelog.groupBy({
        by: ['projectId'],
        where: { employeeId }
      }).then((projects: any) => projects.length),
      
      prisma.timelog.count({ 
        where: { 
          employeeId,
          submissionStatus: 'submitted'
        }
      }),
      
      prisma.timelog.count({ 
        where: { 
          employeeId,
          approvedAt: { not: null }
        }
      }),
      
      // Calculate total hours from timelog entries
      prisma.timelog.aggregate({
        where: { employeeId },
        _sum: { hours: true }
      }).then((result: any) => result._sum.hours || 0)
    ]);

    const stats = {
      myProjects,
      totalTasks: myTasks,
      completedTasks,
      hoursLogged
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching employee stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employee statistics'
    });
  }
};

export const getHRStats = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [totalEmployees, activeEmployees, pendingApprovals, departments] = await Promise.all([
      prisma.employee.count(),
      prisma.employee.count({ where: { status: 'active' } }),
      prisma.employee.count({ where: { status: 'pending' } }),
      prisma.employee.groupBy({ by: ['department'] }).then(res => res.length)
    ]);

    res.json({
      success: true,
      data: { totalEmployees, activeEmployees, pendingApprovals, departments }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch HR statistics' });
  }
};

export const getITStats = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [totalTickets, openTickets, resolvedTickets] = await Promise.all([
      prisma.ticket.count(),
      prisma.ticket.count({ where: { status: 'Open' } }),
      prisma.ticket.count({ where: { status: 'Resolved' } })
    ]);

    res.json({
      success: true,
      data: { totalTickets, openTickets, resolvedTickets }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch IT statistics' });
  }
};

export const getAccountantStats = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [totalPayroll, pendingReimbursements, totalHours] = await Promise.all([
      prisma.employeeProfile.aggregate({ _sum: { salary: true } }).then(res => res._sum.salary || 0),
      prisma.reimbursement.count({ where: { status: 'pending' } }),
      prisma.timelog.aggregate({ _sum: { hours: true } }).then(res => res._sum.hours || 0)
    ]);

    res.json({
      success: true,
      data: { totalPayroll, pendingReimbursements, totalHours }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch Accountant statistics' });
  }
};


export const getRecentActivities = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const activities = await getDbActivities(limit);

    res.json({
      success: true,
      data: activities
    });
  } catch (error) {
    console.error('Error fetching recent activities:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent activities'
    });
  }
};

export const getMyRecentActivities = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = (req as any).user;
    const limit = parseInt(req.query.limit as string) || 10;
    const activities = await getMyDbActivities(user.id, limit);

    res.json({
      success: true,
      data: activities
    });
  } catch (error) {
    console.error('Error fetching my recent activities:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent activities'
    });
  }
};
export const getCombinedDashboardData = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const userId = user.id;
    const role = user.role?.toUpperCase();
    const userRoleLower = user.role?.toLowerCase() || '';
    const isActivityAdmin = userRoleLower === 'admin' || userRoleLower === 'owner';

    // 1. Fetch Role Statistics (Reuse logic from getAdminStats/getEmployeeStats)
    // For simplicity, we'll fetch basic counts
    const [totalProjects, totalTasks, hoursLogged] = await Promise.all([
      prisma.project.count({
        where: role === 'ADMIN' ? {} : { users: { some: { employeeId: userId } } }
      }),
      prisma.job.count({
        where: role === 'ADMIN' ? {} : { users: { some: { employeeId: userId } } }
      }),
      prisma.timelog.aggregate({
        where: { employeeId: userId },
        _sum: { hours: true }
      }).then(res => res._sum.hours || 0)
    ]);

    // 2. Fetch Timesheet/Attendance Data (From Monday of last week to present)
    const localToday = new Date();
    const currentDay = localToday.getDay();
    const daysToSubtract = (currentDay === 0 ? 6 : currentDay - 1) + 7;
    const tempDate = new Date(localToday);
    tempDate.setDate(localToday.getDate() - daysToSubtract);
    const lastWeekMondayStr = tempDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const lastWeekMonday = new Date(`${lastWeekMondayStr}T00:00:00.000Z`);

    let dbAttendance = [];
    if (isActivityAdmin) {
      dbAttendance = await prisma.attendance.findMany({
        where: {
          date: { gte: lastWeekMonday }
        },
        orderBy: { date: 'asc' },
        select: {
          date: true,
          total_hours: true
        }
      });
    } else {
      dbAttendance = await prisma.attendance.findMany({
        where: {
          Employee: { id: userId },
          date: { gte: lastWeekMonday }
        },
        orderBy: { date: 'asc' },
        select: {
          date: true,
          total_hours: true
        }
      });
    }

    // Aggregate by date to support multi-employee firm-wide totals for admins
    const aggregatedMap = new Map<string, { date: Date; total_hours: number }>();
    dbAttendance.forEach(a => {
      const dateStr = new Date(a.date).toISOString().split('T')[0];
      const existing = aggregatedMap.get(dateStr);
      const hours = Number(a.total_hours) || 0;
      if (existing) {
        existing.total_hours += hours;
      } else {
        aggregatedMap.set(dateStr, { date: new Date(a.date), total_hours: hours });
      }
    });

    const attendance = Array.from(aggregatedMap.values()).map(item => ({
      date: item.date,
      total_hours: parseFloat(item.total_hours.toFixed(2))
    })).sort((a, b) => a.date.getTime() - b.date.getTime());

    // 3. Fetch Leave Balance & Summary
    const currentYear = new Date().getFullYear();
    const [leaveBalance, leaveStats] = await Promise.all([
      prisma.leaveBalance.findUnique({
        where: { employeeId_year: { employeeId: userId, year: currentYear } }
      }),
      prisma.leave.groupBy({
        by: ['type'],
        where: { employeeId: userId, status: 'approved' },
        _count: true
      })
    ]);

    // 4. Fetch Expense Summary (Reimbursements)
    const expenses = await prisma.reimbursement.groupBy({
      by: ['category'],
      where: { employeeId: userId },
      _sum: { amount: true }
    });

    // 5. Fetch Upcoming Birthdays (Current month)
    const kolkataDateStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    const kolkataDate = new Date(kolkataDateStr);
    const kolkataMonth = kolkataDate.getMonth() + 1;
    const kolkataDay = kolkataDate.getDate();

    const birthdays = await prisma.employeeProfile.findMany({
      where: {
        employee: {
          status: { in: ['active', 'Active'] }
        }
      },
      include: {
        employee: {
          select: { firstName: true, lastName: true, designation: true, id: true }
        }
      }
    }).then(profiles => {
      return profiles
        .filter(p => {
          if (!p.dob) return false;
          
          const dobDate = p.dob instanceof Date ? p.dob : new Date(p.dob);
          const isoStr = dobDate.toISOString();
          if (isoStr.startsWith('2000-01-01')) return false;

          const parts = isoStr.split('T')[0].split('-');
          if (parts.length !== 3) return false;

          const dobMonth = parseInt(parts[1], 10);
          const dobDay = parseInt(parts[2], 10);

          // Show only birthdays in the current month AND only show today's (current) and future birthdays
          return dobMonth === kolkataMonth && dobDay >= kolkataDay;
        })
        .sort((a, b) => {
          const dobA = a.dob instanceof Date ? a.dob : new Date(a.dob);
          const dobB = b.dob instanceof Date ? b.dob : new Date(b.dob);
          const dayA = parseInt(dobA.toISOString().split('T')[0].split('-')[2], 10);
          const dayB = parseInt(dobB.toISOString().split('T')[0].split('-')[2], 10);
          return dayA - dayB;
        })
        .slice(0, 10);
    });

    // 6. Fetch Upcoming Events (Holidays & Events for the Current Month)
    const startOfMonth = new Date(localToday.getFullYear(), localToday.getMonth(), 1);
    const endOfMonth = new Date(localToday.getFullYear(), localToday.getMonth() + 1, 0, 23, 59, 59, 999);

    const events = await prisma.event.findMany({
      where: {
        date: {
          gte: startOfMonth,
          lte: endOfMonth
        }
      },
      orderBy: { date: 'asc' }
    });

    // 7. Pending Approvals (For Admin/Manager/Partner/IT/HR)
    const isAdmin = ['admin', 'partner', 'manager', 'owner', 'accountant', 'finance manager', 'accounts', 'it', 'hr'].some(r => userRoleLower.includes(r));
    let pendingApprovals = { leaves: 0, assets: 0, reimbursements: 0, tickets: 0 };
    
    if (isAdmin) {
      const userRole = user.role?.toUpperCase();
      const [pendingLeaves, pendingAssets, pendingReimbursements, openTickets] = await Promise.all([
        prisma.leave.count({ where: { status: { in: ['pending', 'Pending'] } } }),
        prisma.assetRequest.count({ where: { status: { in: ['Pending', 'HR Review'] } } }),
        // Role-based reimbursement count
        (async () => {
          if (userRole === 'MANAGER') {
            return prisma.reimbursement.count({ where: { status: 'PENDING_MANAGER', managerId: userId } });
          } else if (['ADMIN', 'PARTNER', 'OWNER'].includes(userRole)) {
            // Admins see their own manager-level approvals + all partner-level approvals
            const [mgrCount, partnerCount] = await Promise.all([
              prisma.reimbursement.count({ where: { status: 'PENDING_MANAGER', managerId: userId } }),
              prisma.reimbursement.count({ where: { status: 'MANAGER_APPROVED' } })
            ]);
            return mgrCount + partnerCount;
          } else if (['ACCOUNTANT', 'FINANCE MANAGER', 'ACCOUNTS'].includes(userRole)) {
            return prisma.reimbursement.count({ where: { status: 'APPROVED' } });
          }
          return 0;
        })(),
        prisma.ticket.count({ where: { status: 'Open' } })
      ]);
      pendingApprovals = { leaves: pendingLeaves, assets: pendingAssets, reimbursements: pendingReimbursements, tickets: openTickets };
    }

    // 8. Recent Activities

    const activities = isActivityAdmin 
      ? await getDbActivities(5)
      : await getMyDbActivities(userId, 5);

    // Fetch personal open tickets count
    const myOpenTickets = await prisma.ticket.count({
      where: {
        createdById: userId,
        status: { not: 'Resolved' }
      }
    });

    res.json({
      success: true,
      data: {
        stats: {
          totalProjects,
          totalTasks,
          hoursLogged
        },
        attendance: attendance.map(a => ({
          date: a.date,
          day: new Date(a.date).toLocaleDateString('en-US', { weekday: 'short' }),
          hours: a.total_hours || 0
        })),
        leaves: {
          balance: leaveBalance?.remainingLeaves || 0,
          used: leaveBalance?.usedLeaves || 0,
          total: leaveBalance?.totalLeaves || 21
        },
        expenses: {
          total: expenses.reduce((acc, curr) => acc + (curr._sum.amount || 0), 0),
          breakdown: expenses.map((e: any) => ({ category: e.category, amount: e._sum.amount || 0 }))
        },
        birthdays: birthdays.map(b => {
          const emp = (b as any).employee;
          const dobDate = b.dob instanceof Date ? b.dob : new Date(b.dob);
          const parts = dobDate.toISOString().split('T')[0].split('-');
          const day = parseInt(parts[2], 10);
          const monthIndex = parseInt(parts[1], 10) - 1;
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          return {
            name: emp.lastName ? `${emp.firstName} ${emp.lastName}` : emp.firstName,
            role: emp.designation,
            date: `${months[monthIndex]} ${day}`
          };
        }),
        events: events.map((e: any) => ({
          id: e.id,
          title: e.title,
          date: new Date(e.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
          time: e.time,
          type: e.type,
          color: e.type === 'Holiday' ? 'rose' : (e.type === 'Meeting' ? 'indigo' : 'blue')
        })),
        activities: activities.map(a => {
          let title = a.title;
          if (isActivityAdmin && (a as any).user) {
            const employeeName = `${(a as any).user.firstName || ''} ${(a as any).user.lastName || ''}`.trim();
            if (employeeName) {
              title = `${employeeName} - ${a.title}`;
            }
          }
          return {
            title,
            description: a.description,
            type: a.type,
            createdAt: a.createdAt
          };
        }),
        pendingApprovals,
        myAssetRequests: await prisma.assetRequest.count({ where: { employeeId: userId, status: { not: 'Delivered' } } }),
        myTickets: myOpenTickets
      }
    });

  } catch (error) {
    console.error('Error fetching combined dashboard data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data'
    });
  }
};
