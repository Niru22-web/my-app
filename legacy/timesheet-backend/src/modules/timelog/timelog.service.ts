import { prisma } from '../../config/prisma';
import { generateCombinedId } from '../../utils/jobIdGenerator';
import { NotificationService } from '../notification/notification.service';

// Removed local PrismaClient instantiation to use shared instance

export class TimelogService {
  async getTimelogsByUser(employeeId: string, filters?: any) {
    const startTime = Date.now();
    try {
      console.log(`[API_START] getTimelogsByUser for employee: ${employeeId}`);
      let whereClause: any = { employeeId: employeeId || undefined };
      if (!employeeId) throw new Error("Employee ID is required");

      // Apply filters
      this.applyFilters(whereClause, filters);

      const timelogs = await prisma.timelog.findMany({
        where: whereClause,
        include: {
          employee: {
            select: {
              id: true,
              employeeId: true,
              firstName: true,
              lastName: true,
              officeEmail: true,
              managers: { select: { managerId: true } },
              partners: { select: { partnerId: true } }
            } as any
          },
          job: {
            include: {
              project: {
                include: {
                  client: {
                    select: {
                      id: true,
                      clientId: true,
                      name: true,
                      alias: true
                    }
                  }
                }
              }
            }
          }
        },
        orderBy: {
          date: 'desc'
        }
      });

      // Add combined ID to each timelog
      return timelogs.map((timelog: any) => ({
        ...timelog,
        combinedId: generateCombinedId(
          timelog.job.project.client.clientId,
          timelog.job.project.projectId || '',
          timelog.job.jobId
        )
      }));
    } catch (error) {
      console.error('Error fetching timelogs by user:', error);
      throw error;
    }
  }

  async getTimelogsForManager(managerId: string, managerEmail: string, filters?: any) {
    const startTime = Date.now();
    try {
      console.log(`[API_START] getTimelogsForManager for manager: ${managerId} (${managerEmail})`);
      
      // Build the where clause for Timelog using employee's managers/partners relation
      let whereClause: any = {
        employee: {
          OR: [
            {
              managers: {
                some: {
                  OR: [
                    { managerId: managerId },
                    { manager: { officeEmail: managerEmail } }
                  ]
                }
              }
            },
            { reportingManagerIds: { has: managerId } },
            { subManagerIds: { has: managerId } },
            { subManagerId: managerId },
            { subManager: { officeEmail: managerEmail } },
            {
              // I am the manager of someone who has a submanager, I should see the submanager's logs
              subManagedEmployees: {
                some: {
                  OR: [
                    { managers: { some: { managerId: managerId } } },
                    { reportingManagerIds: { has: managerId } }
                  ]
                }
              }
            },
            {
              // I am the manager of someone who has a submanager, I should see the submanager's employees' logs
              subManager: {
                subManagedEmployees: {
                  some: {
                    OR: [
                      { managers: { some: { managerId: managerId } } },
                      { reportingManagerIds: { has: managerId } }
                    ]
                  }
                }
              }
            }
          ]
        }

      };

      this.applyFilters(whereClause, filters);

      console.log(`[DB_QUERY_START] Fetching team logs for manager ${managerId} with filters:`, JSON.stringify(whereClause, null, 2));

      const timelogs = await prisma.timelog.findMany({
        where: whereClause,
        include: this.getTimelogInclude(),
        orderBy: { date: 'desc' }
      });
      
      console.log(`[DB_QUERY_END] Found ${timelogs.length} logs for manager team (${Date.now() - startTime}ms)`);

      return this.mapTimelogs(timelogs);
    } catch (error: any) {
      console.error("Timelog Team Error (Manager):", error);
      throw error;
    }
  }

  async getTimelogsForPartner(partnerId: string, partnerEmail: string, filters?: any) {
    const startTime = Date.now();
    try {
      console.log(`[API_START] getTimelogsForPartner for partner: ${partnerId} (${partnerEmail})`);

      // Build the query using employee's partners relation
      let whereClause: any = {
        employee: {
          OR: [
            {
              partners: {
                some: {
                  OR: [
                    { partnerId: partnerId },
                    { partner: { officeEmail: partnerEmail } }
                  ]
                }
              }
            },
            { reportingPartnerIds: { has: partnerId } }
          ]
        }

      };

      this.applyFilters(whereClause, filters);

      console.log(`[DB_QUERY_START] Fetching team logs for partner ${partnerId} with filters:`, JSON.stringify(whereClause, null, 2));

      const timelogs = await prisma.timelog.findMany({
        where: whereClause,
        include: this.getTimelogInclude(),
        orderBy: { date: 'desc' }
      });
      
      console.log(`[DB_QUERY_END] Found ${timelogs.length} logs for partner team (${Date.now() - startTime}ms)`);

      return this.mapTimelogs(timelogs);
    } catch (error: any) {
      console.error("Timelog Team Error (Partner):", error);
      throw error;
    }
  }

  private applyFilters(whereClause: any, filters?: any) {
    if (!filters) return;

    // Helper to check if string is UUID
    const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    // Employee Filter - handle both UUID and employeeId string
    if (filters.employeeId && filters.employeeId !== 'all') {
      if (isUUID(filters.employeeId)) {
        whereClause.employeeId = filters.employeeId;
      } else {
        whereClause.employee = { 
          ...(whereClause.employee || {}),
          employeeId: filters.employeeId 
        };
      }
    }
    
    // Status Filter
    if (filters.status && filters.status.toLowerCase() !== 'all status') {
      const statusMap: any = {
        'Draft': 'not_submitted',
        'Submitted': 'submitted',
        'Approved': 'approved',
        'Rejected': 'rejected'
      };
      whereClause.submissionStatus = statusMap[filters.status] || filters.status.toLowerCase();
    }
    
    // Date Filters
    if (filters.dateFrom || filters.dateTo) {
      whereClause.date = {};
      if (filters.dateFrom) whereClause.date.gte = new Date(filters.dateFrom);
      if (filters.dateTo) whereClause.date.lte = new Date(filters.dateTo);
    }

    // Client/Project Filters - use direct fields on Timelog for efficiency
    if (filters.clientId && filters.clientId !== 'all') {
      whereClause.clientId = filters.clientId;
    }

    if (filters.projectId && filters.projectId !== 'all') {
      whereClause.projectId = filters.projectId;
    }

    // Job Filter - handle both UUID and jobId string
    if (filters.jobId && filters.jobId !== 'all') {
      if (isUUID(filters.jobId)) {
        whereClause.jobId = filters.jobId;
      } else {
        whereClause.job = { 
          ...(whereClause.job || {}),
          jobId: filters.jobId 
        };
      }
    }

    // Cleanup: Prevent any invalid fields from leaking into Prisma query
    const validFields = ['employeeId', 'employee', 'jobId', 'job', 'clientId', 'projectId', 'date', 'submissionStatus', 'weekStart', 'OR', 'AND'];
    Object.keys(whereClause).forEach(key => {
      if (!validFields.includes(key)) {
        delete whereClause[key];
      }
    });
  }

  private getTimelogInclude() {
    return {
      employee: {
        select: {
          id: true,
          employeeId: true,
          firstName: true,
          lastName: true,
          officeEmail: true,
          subManagerId: true,
          subManagerIds: true,
          subManager: { select: { id: true, firstName: true, lastName: true, officeEmail: true } },
          managers: { include: { manager: { select: { id: true, firstName: true, lastName: true, officeEmail: true } } } },
          partners: { include: { partner: { select: { id: true, firstName: true, lastName: true, officeEmail: true } } } }
        }
      },
      job: {
        select: {
          id: true,
          jobId: true,
          name: true,
          project: {
            select: {
              id: true,
              projectId: true,
              name: true,
              managerId: true,
              partnerId: true,
              createdBy: true,
              client: {
                select: { id: true, clientId: true, name: true, alias: true, partnerId: true }
              }
            }
          }
        }
      }
    };
  }

  private mapTimelogs(timelogs: any[]) {
    return timelogs.map((timelog: any) => ({
      ...timelog,
      combinedId: generateCombinedId(
        timelog.job.project.client.clientId,
        timelog.job.project.projectId || '',
        timelog.job.jobId
      )
    }));
  }

  async getAllTimelogs(filters?: any) {
    const startTime = Date.now();
    try {
      console.log(`[API_START] getAllTimelogs`);
      let whereClause: any = {};
      
      // Apply filters
      this.applyFilters(whereClause, filters);

      console.log(`[DB_QUERY_START] Fetching all timelogs with where:`, JSON.stringify(whereClause, null, 2));
      const timelogs = await prisma.timelog.findMany({
        where: whereClause,
        include: this.getTimelogInclude(),
        orderBy: { date: 'desc' }
      });
      console.log(`[DB_QUERY_END] Found ${timelogs.length} logs (${Date.now() - startTime}ms)`);

      const mapped = this.mapTimelogs(timelogs);
      console.log(`[API_SUCCESS] Returning ${mapped.length} logs`);
      return mapped;
    } catch (error) {
      console.error('Error fetching all timelogs:', error);
      throw error;
    }
  }

  async createTimelog(timelogData: any, employeeId: string) {
    try {
      // Validate job exists and user has access
      const job = await prisma.job.findUnique({
        where: { id: timelogData.jobId },
        include: {
          project: {
            include: {
              client: true
            }
          }
        }
      });

      if (!job) {
        console.error(`[VALIDATION_ERROR] Job not found for ID: ${timelogData.jobId}`);
        throw new Error(`Job not found. Please select a valid task from the list.`);
      }

      if (job.status !== 'Active' && job.status !== 'Started') {
         console.warn(`[VALIDATION_WARNING] Job ${job.jobId} is ${job.status}`);
      }

      // Validate hours
      if (typeof timelogData.hours !== 'number' || timelogData.hours <= 0 || timelogData.hours > 24) {
        throw new Error('Hours must be a positive number between 0 and 24');
      }

      // Validate date
      const workDate = new Date(timelogData.date);
      if (isNaN(workDate.getTime())) {
        throw new Error('Invalid date format');
      }

      // Check if date is not in future
      if (workDate > new Date()) {
        throw new Error('Cannot log time for future dates');
      }

      // Calculate weekStart (Monday of the week)
      const dateForWeek = new Date(workDate);
      const day = dateForWeek.getDay();
      const diff = dateForWeek.getDate() - day + (day === 0 ? -6 : 1);
      const weekStart = new Date(dateForWeek.setDate(diff));
      weekStart.setHours(0, 0, 0, 0);

      const timelog = await prisma.timelog.create({
        data: {
          hours: timelogData.hours,
          description: timelogData.description,
          date: workDate,
          employeeId,
          jobId: timelogData.jobId,
          clientId: job.project.clientId,
          projectId: job.projectId,
          combinedJobCode: job.combinedId,
          weekStart: weekStart,
          workItem: timelogData.workItem || null,
          billableStatus: timelogData.billableStatus || 'billable'
        },
        include: {
          employee: {
            select: {
              id: true,
              employeeId: true,
              firstName: true,
              lastName: true,
              officeEmail: true,
              managers: { select: { managerId: true } },
              partners: { select: { partnerId: true } }
            } as any
          },

          job: {
            include: {
              project: {
                include: {
                  client: {
                    select: {
                      id: true,
                      clientId: true,
                      name: true,
                      alias: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      // Add combined ID
      const combinedId = generateCombinedId(
        (timelog as any).job.project.client.clientId,
        (timelog as any).job.project.projectId || '',
        (timelog as any).job.jobId
      );

      return {
        ...timelog,
        combinedId
      };
    } catch (error) {
      console.error('Error creating timelog:', error);
      throw error;
    }
  }

  async updateTimelog(id: string, timelogData: any, employeeId: string, userRole: string) {
    try {
      // Check if timelog exists and user has permission
      const existingTimelog = await prisma.timelog.findUnique({
        where: { id },
        include: {
          employee: {
            select: {
              id: true,
              officeEmail: true
            }
          }
        }
      });

      if (!existingTimelog) {
        throw new Error('Timelog not found');
      }

      // Check permissions (only owner or admin/manager can update)
      if (existingTimelog.employeeId !== employeeId && 
          !['Admin', 'Manager', 'Partner', 'Owner'].includes(userRole)) {
        throw new Error('You can only update your own timelogs');
      }

      // Block update if already approved or rejected, unless user is Admin/Manager/Owner
      const isPrivileged = ['Admin', 'Manager', 'Partner', 'Owner'].includes(userRole);
      if ((existingTimelog.submissionStatus === 'approved' || existingTimelog.submissionStatus === 'rejected') && !isPrivileged) {
        throw new Error(`This timelog is already ${existingTimelog.submissionStatus} and cannot be modified. Contact your manager for overrides.`);
      }

      // Validate job exists if being updated
      if (timelogData.jobId) {
        const job = await prisma.job.findUnique({
          where: { id: timelogData.jobId }
        });

        if (!job) {
          throw new Error('Job not found');
        }
      }

      // Validate hours if provided
      if (timelogData.hours !== undefined) {
        if (typeof timelogData.hours !== 'number' || timelogData.hours <= 0 || timelogData.hours > 24) {
          throw new Error('Hours must be a positive number between 0 and 24');
        }
      }

      // Validate date if provided
      if (timelogData.date !== undefined) {
        const workDate = new Date(timelogData.date);
        if (isNaN(workDate.getTime())) {
          throw new Error('Invalid date format');
        }

        if (workDate > new Date()) {
          throw new Error('Cannot log time for future dates');
        }

        timelogData.date = workDate;

        // Recalculate weekStart
        const dateForWeek = new Date(workDate);
        const day = dateForWeek.getDay();
        const diff = dateForWeek.getDate() - day + (day === 0 ? -6 : 1);
        const weekStart = new Date(dateForWeek.setDate(diff));
        weekStart.setHours(0, 0, 0, 0);
        timelogData.weekStart = weekStart;
      }

      // If jobId is being updated, fetch new job details to update related fields
      if (timelogData.jobId) {
        const job = await prisma.job.findUnique({
          where: { id: timelogData.jobId },
          include: { project: true }
        });
        
        if (job) {
          timelogData.clientId = job.project.clientId;
          timelogData.projectId = job.projectId;
          timelogData.combinedJobCode = job.combinedId;
        }
      }

      const timelog = await prisma.timelog.update({
        where: { id },
        data: timelogData,
        include: {
          employee: {
            select: {
              id: true,
              employeeId: true,
              firstName: true,
              lastName: true,
              officeEmail: true,
              managers: { select: { managerId: true } },
              partners: { select: { partnerId: true } }
            } as any
          },

          job: {
            include: {
              project: {
                include: {
                  client: {
                    select: {
                      id: true,
                      clientId: true,
                      name: true,
                      alias: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      // Add combined ID
      const combinedId = generateCombinedId(
        (timelog as any).job.project.client.clientId,
        (timelog as any).job.project.projectId || '',
        (timelog as any).job.jobId
      );

      return {
        ...timelog,
        combinedId
      };
    } catch (error) {
      console.error('Error updating timelog:', error);
      throw error;
    }
  }

  async deleteTimelog(id: string, employeeId: string, userRole: string) {
    try {
      // Check if timelog exists and user has permission
      const existingTimelog = await prisma.timelog.findUnique({
        where: { id },
        include: {
          employee: {
            select: {
              id: true,
              officeEmail: true
            }
          }
        }
      });

      if (!existingTimelog) {
        throw new Error('Timelog not found');
      }

      // Check permissions (only owner or admin/manager can delete)
      if (existingTimelog.employeeId !== employeeId && 
          !['Admin', 'Manager', 'Partner', 'Owner'].includes(userRole)) {
        throw new Error('You can only delete your own timelogs');
      }

      await prisma.timelog.delete({
        where: { id }
      });

      return { message: 'Timelog deleted successfully' };
    } catch (error) {
      console.error('Error deleting timelog:', error);
      throw error;
    }
  }

  async getAccessibleClients(employeeId: string) {
    try {
      // Get all jobs assigned to the employee through project assignments
      const jobs = await prisma.job.findMany({
        where: {
          project: {
            status: 'Started'
          }
        },
        include: {
          project: {
            include: {
              client: true
            }
          }
        }
      });

      // Extract unique clients
      const clients = new Map();
      jobs.forEach(job => {
        const client = job.project.client;
        if (!clients.has(client.id)) {
          clients.set(client.id, {
            id: client.id,
            clientId: client.clientId,
            name: client.name,
            alias: client.alias
          });
        }
      });

      return Array.from(clients.values());
    } catch (error) {
      console.error('Error fetching accessible clients:', error);
      throw error;
    }
  }

  async getAccessibleProjects(employeeId: string, clientId?: string) {
    try {
      let whereClause: any = {
        status: 'Started'
      };

      if (clientId) {
        whereClause.clientId = clientId;
      }

      const projects = await prisma.project.findMany({
        where: whereClause,
        include: {
          client: {
            select: {
              id: true,
              clientId: true,
              name: true,
              alias: true
            }
          }
        }
      });

      return projects;
    } catch (error) {
      console.error('Error fetching accessible projects:', error);
      throw error;
    }
  }

  async getAccessibleJobs(employeeId: string, projectId?: string) {
    try {
      let whereClause: any = {};

      if (projectId) {
        whereClause.projectId = projectId;
      } else {
        // Get jobs from all projects assigned to employee
        const assignedProjects = await prisma.project.findMany({
          where: {
            status: 'Started'
          },
          select: { id: true }
        });

        whereClause.projectId = {
          in: assignedProjects.map(p => p.id)
        };
      }

      const jobs = await prisma.job.findMany({
        where: whereClause,
        include: {
          project: {
            include: {
              client: {
                select: {
                  id: true,
                  clientId: true,
                  name: true,
                  alias: true
                }
              }
            }
          }
        }
      });

      return jobs;
    } catch (error) {
      console.error('Error fetching accessible jobs:', error);
      throw error;
    }
  }

  async bulkCreateTimelogs(timelogs: any[], employeeId: string) {
    try {
      const results: {
        success: any[];
        errors: Array<{
          row: any;
          error: string;
          data: any;
        }>;
      } = {
        success: [],
        errors: []
      };

      for (const timelogData of timelogs) {
        try {
          const timelog = await this.createTimelog(timelogData, timelogData.employeeId || employeeId);
          results.success.push(timelog);
        } catch (error: any) {
          results.errors.push({
            row: timelogData.row || 'Unknown',
            error: error.message,
            data: timelogData
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Error in bulk timelog creation:', error);
      throw error;
    }
  }

  async getTimesheetReports(userId: string, userEmail: string, userRole: string, filters?: any) {
    try {
      let timelogs: any[] = [];

      // Role-based data access
      if (['Admin', 'Owner'].includes(userRole)) {
        timelogs = await this.getAllTimelogs(filters);
      } else if (userRole === 'Partner') {
        timelogs = await this.getTimelogsForPartner(userId, userEmail, filters);
      } else if (userRole === 'Manager') {
        timelogs = await this.getTimelogsForManager(userId, userEmail, filters);
      } else {
        // Regular users can only see their own timelogs
        const employee = await prisma.employee.findUnique({
          where: { officeEmail: userEmail },
          select: { id: true }
        });
        if (employee) {
          timelogs = await this.getTimelogsByUser(employee.id, filters);
        }
      }

      // Calculate reports
      const totalHours = timelogs.reduce((sum: number, log: any) => sum + log.hours, 0);
      
      // Client-wise hours
      const clientHours = new Map();
      timelogs.forEach((log: any) => {
        const clientName = log.job.project.client.name;
        clientHours.set(clientName, (clientHours.get(clientName) || 0) + log.hours);
      });

      // Project-wise hours
      const projectHours = new Map();
      timelogs.forEach(log => {
        const projectName = log.job.project.name;
        projectHours.set(projectName, (projectHours.get(projectName) || 0) + log.hours);
      });

      // Job-wise hours
      const jobHours = new Map();
      timelogs.forEach(log => {
        const jobName = log.job.name;
        jobHours.set(jobName, (jobHours.get(jobName) || 0) + log.hours);
      });

      return {
        totalHours,
        totalEntries: timelogs.length,
        clientHours: Array.from(clientHours.entries()).map(([name, hours]) => ({ name, hours })),
        projectHours: Array.from(projectHours.entries()).map(([name, hours]) => ({ name, hours })),
        jobHours: Array.from(jobHours.entries()).map(([name, hours]) => ({ name, hours })),
        timelogs
      };
    } catch (error) {
      console.error('Error generating timesheet reports:', error);
      throw error;
    }
  }

  async getMissingTimesheets(userEmail: string, userRole: string, dateFrom: string, dateTo: string) {
    try {
      const fromDate = new Date(dateFrom);
      const toDate = new Date(dateTo);
      
      // Get all employees based on role
      let employees: any[] = [];
      if (['Admin', 'Partner', 'Owner'].includes(userRole)) {
        employees = await prisma.employee.findMany({
          where: { status: 'active' },
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            officeEmail: true,
            managers: { select: { managerId: true } },
            partners: { select: { partnerId: true } }
          } as any
        });
      } else if (['Manager'].includes(userRole)) {
        employees = await prisma.employee.findMany({
          where: {
            status: 'active',
            OR: [
              { managers: { some: { manager: { officeEmail: userEmail } } } },
              { partners: { some: { partner: { officeEmail: userEmail } } } },
              { officeEmail: userEmail }
            ] as any[] as any[]
          },
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            officeEmail: true,
            managers: { select: { managerId: true } },
            partners: { select: { partnerId: true } }
          } as any
        });
      } else {
        // Regular users can only see their own missing timesheets
        employees = await prisma.employee.findMany({
          where: { 
            status: 'active',
            officeEmail: userEmail 
          },
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            officeEmail: true,
            managers: { select: { managerId: true } },
            partners: { select: { partnerId: true } }
          } as any
        });
      }

      // Get timelogs for the date range
      const timelogs = await prisma.timelog.findMany({
        where: {
          date: {
            gte: fromDate,
            lte: toDate
          },
          employeeId: {
            in: employees.map(emp => emp.id)
          }
        },
        select: {
          employeeId: true,
          date: true,
          hours: true
        }
      });

      // Group timelogs by employee and date
      const timelogMap = new Map();
      timelogs.forEach(log => {
        const key = `${log.employeeId}-${log.date.toISOString().split('T')[0]}`;
        timelogMap.set(key, log);
      });

      // Generate missing timesheet entries
      const missingEntries: any[] = [];
      const currentDate = new Date(fromDate);

      while (currentDate <= toDate) {
        // Skip weekends (Saturday = 6, Sunday = 0)
        if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
          const dateStr = currentDate.toISOString().split('T')[0];
          
          employees.forEach(employee => {
            const key = `${employee.id}-${dateStr}`;
            const timelog = timelogMap.get(key);
            
            if (!timelog || timelog.hours === 0) {
              missingEntries.push({
                employee,
                date: dateStr,
                hasEntry: !!timelog,
                totalHours: timelog?.hours || 0
              });
            }
          });
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
      }

      return missingEntries;
    } catch (error) {
      console.error('Error fetching missing timesheets:', error);
      throw error;
    }
  }

  async submitTimelog(id: string, employeeId: string) {
    try {
      const timelog = await prisma.timelog.findUnique({
        where: { id },
        include: { 
          employee: true,
          job: {
            include: {
              project: {
                include: { client: true }
              }
            }
          }
        }
      });

      if (!timelog) {
        throw new Error('Timelog entry not found');
      }

      if (timelog.employeeId !== employeeId) {
        throw new Error('You can only submit your own timelogs');
      }

      // Ensure reporting hierarchy is set if missing
      const updateData: any = {
        submissionStatus: 'submitted',
        submittedAt: new Date()
      };



      const updated = await prisma.timelog.update({
        where: { id },
        data: updateData
      });

      // [DISABLED] Timesheet submission notifications turned off
      // Uncomment below to re-enable "New Timesheet Submission" alerts for managers/admins.
      /*
      const employeeName = `${timelog.employee.firstName} ${timelog.employee.lastName || ''}`.trim();
      const notificationData = {
        title: 'New Timesheet Submission 📝',
        message: `${employeeName} submitted ${timelog.hours}h for ${timelog.job.project.client.name} - ${timelog.job.project.name} on ${new Date(timelog.date).toLocaleDateString()}.`,
        type: 'timesheet_submission',
        relatedId: timelog.id,
        actionUrl: '/timesheet'
      };

      // 1. Notify All Managers
      const managers = await (prisma as any).employeeManager.findMany({
        where: { employeeId: timelog.employeeId },
        select: { managerId: true }
      });
      for (const m of managers) {
        await NotificationService.createNotification({
          userId: m.managerId,
          ...notificationData
        });
      }

      // 2. Notify All Partners
      const partners = await (prisma as any).employeePartner.findMany({
        where: { employeeId: timelog.employeeId },
        select: { partnerId: true }
      });
      for (const p of partners) {
        await NotificationService.createNotification({
          userId: p.partnerId,
          ...notificationData
        });
      }

      // 3. Notify Admin
      await NotificationService.notifyRoles(['Admin', 'Owner'], notificationData);

      // 4. Notify Sub Managers (if exist)
      const employee: any = await prisma.employee.findUnique({
        where: { id: timelog.employeeId },
        select: { 
          id: true,
          subManagerId: true,
          subManagerIds: true
        } as any
      });
      if (employee) {
        const subManagerIds = new Set<string>();
        if (employee.subManagerId) subManagerIds.add(employee.subManagerId);
        if (Array.isArray((employee as any).subManagerIds)) {
          ((employee as any).subManagerIds).forEach((id: string) => subManagerIds.add(id));
        }
        for (const smId of subManagerIds) {
          await NotificationService.createNotification({
            userId: smId,
            ...notificationData
          });
        }
      }
      */

      return updated;
    } catch (error) {
       console.error('Error submitting timelog:', error);
       throw error;
    }
  }

  async approveTimelog(id: string, approverId: string) {
    try {
      console.log(`[TIMESTAMP]: ${new Date().toISOString()}`);
      console.log(`[APPROVAL_START] - Timelog ID: ${id}, Approver ID: ${approverId}`);
      
      const timelog = await prisma.timelog.findUnique({
        where: { id },
        include: { 
          employee: {
            select: {
              id: true,
              employeeId: true,
              firstName: true,
              lastName: true,
              officeEmail: true,
              subManagerId: true,
              subManagerIds: true,
              managers: { select: { managerId: true } },
              partners: { select: { partnerId: true } }
            } as any
          },
          job: {
            include: {
              project: {
                include: {
                  client: {
                    select: {
                      id: true,
                      partnerId: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (!timelog) {
        console.error(`[APPROVAL_ERROR] - Timelog not found: ${id}`);
        throw new Error('Timelog entry not found');
      }

      // Get approver details
      const approver = await prisma.employee.findUnique({
        where: { id: approverId },
        select: {
          id: true,
          employeeId: true,
          firstName: true,
          lastName: true,
          officeEmail: true,
          role: true
        }
      });

      if (!approver) {
        console.error(`[APPROVAL_ERROR] - Approver not found: ${approverId}`);
        throw new Error('Approver not found');
      }

      console.log(`[APPROVAL_DEBUG] - LoggedInUser: { id: "${approverId}", role: "${approver.role}" }`);
      console.log(`[APPROVAL_DEBUG] - Timesheet: { id: "${id}", employeeId: "${timelog.employeeId}" }`);
      console.log(`[APPROVAL_DEBUG] - ClientPartnerId: "${timelog.job?.project?.client?.partnerId}"`);

      if (timelog.submissionStatus !== 'submitted') {
        console.error(`[APPROVAL_ERROR] - Invalid status for approval: ${timelog.submissionStatus}`);
        throw new Error(`Timesheet not in submitted state. Current status: ${timelog.submissionStatus}`);
      }

      console.log(`[DEBUG] - Approver: ${approver.firstName} ${approver.lastName} (${approver.officeEmail})`);
      console.log(`[DEBUG] - Approver role: ${approver.role}`);

      // Validate approval authorization
      const hasApprovalAuthority = await this.validateApprovalAuthority(timelog, approver);
      
      if (!hasApprovalAuthority) {
        console.error(`[APPROVAL_ERROR] - User ${approver.officeEmail} not authorized to approve timelog ${id}`);
        throw new Error('User not authorized to approve this timesheet');
      }

      console.log(`[DEBUG] - Approval authority validated successfully`);

      const updated = await prisma.timelog.update({
        where: { id },
        data: {
          submissionStatus: 'approved',
          approvedAt: new Date(),
          approvedBy: approverId,
          rejectedAt: null,
          rejectedBy: null,
          rejectionReason: null
        } as any
      });

      console.log(`[APPROVAL_SUCCESS] - Timelog ${id} approved by ${approver.officeEmail}`);

      // Notify the employee
      const dateStr = new Date(timelog.date).toLocaleDateString();
      await NotificationService.createNotification({
        userId: timelog.employeeId,
        title: 'Timesheet Approved ✅',
        message: `Your timesheet for ${dateStr} has been approved by ${approver.firstName} ${approver.lastName}.`,
        type: 'timesheet_approved',
        relatedId: timelog.id,
        actionUrl: '/timesheet'
      });

      // Notify Manager if Sub Manager takes action
      const isSubManagerAction = (timelog.employee as any).subManagerId === approverId || 
                                 (timelog.employee as any).subManagerIds?.includes(approverId);
      if (isSubManagerAction) {
        const managers = await (prisma as any).employeeManager.findMany({
          where: { employeeId: timelog.employeeId },
          select: { managerId: true }
        });
        for (const m of managers) {
          await NotificationService.createNotification({
            userId: m.managerId,
            title: 'Sub Manager Action: Timesheet Approved 📝',
            message: `Sub Manager ${approver.firstName} approved timesheet for ${timelog.employee.firstName} ${timelog.employee.lastName}.`,
            type: 'timesheet_approved',
            relatedId: timelog.id,
            actionUrl: '/timesheet'
          });
        }
      }

      return updated;
    } catch (error) {
      console.error('Error approving timelog:', error);
      throw error;
    }
  }

  private async validateApprovalAuthority(timelog: any, approver: any): Promise<boolean> {
    console.log(`[AUTHORITY_CHECK] - Checking authority for User: ${approver.id} (${approver.role})`);
    
    // 0. Verify mandatory relations exist
    if (!timelog.job || !timelog.job.project || !timelog.job.project.client) {
      console.error(`[AUTHORITY_CHECK] - Denied: Missing mandatory relations (job/project/client)`);
      return false;
    }

    // 0.5 Prevent self approval/rejection
    if (timelog.employeeId === approver.id) {
      console.error(`[AUTHORITY_CHECK] - Denied: Users cannot approve/reject their own timesheets`);
      return false;
    }

    // 1. Admin/Owner: Always allowed
    if (['Admin', 'Owner'].some(r => r.toLowerCase() === approver.role.toLowerCase())) {
      console.log(`[AUTHORITY_CHECK] - Granted: Admin/Owner role`);
      return true;
    }

    // 2. Manager, Partner, or Sub Manager logic
    if (['Manager', 'Partner', 'Sub Manager', 'Sub-Manager'].some(r => r.toLowerCase() === approver.role.toLowerCase())) {
      // Check if approver is in the employee's manager, partner, or sub-manager lists
      const isReportingAuthority = await prisma.employee.findFirst({
        where: {
          id: timelog.employeeId,
          OR: [
            { managers: { some: { managerId: approver.id } } },
            { partners: { some: { partnerId: approver.id } } },
            { subManagerId: approver.id },
            { subManagerIds: { has: approver.id } }
          ]
        } as any
      });
      
      if (isReportingAuthority) {
        console.log(`[AUTHORITY_CHECK] - Granted: Approver is a reporting authority for this employee`);
        return true;
      }

      // Check Case B: Approver is the Manager/Partner/Creator of the Project
      const project = timelog.job.project;
      if (
        project.managerId === approver.id || 
        project.partnerId === approver.id || 
        project.createdBy === approver.id ||
        project.createdByEmail === approver.officeEmail
      ) {
        console.log(`[AUTHORITY_CHECK] - Granted: Approver is the Project Owner/Manager/Partner`);
        return true;
      }
    }

    console.log(`[AUTHORITY_CHECK] - Denied: No authorization match found`);
    return false;
  }

  async rejectTimelog(id: string, rejectorId: string, reason: string) {
    try {
      console.log(`[TIMESTAMP]: ${new Date().toISOString()}`);
      console.log(`[REJECTION_START] - Timelog ID: ${id}, Rejector ID: ${rejectorId}, Reason: ${reason}`);
      
      const timelog = await prisma.timelog.findUnique({
        where: { id },
        include: { 
          employee: {
            select: {
              id: true,
              employeeId: true,
              firstName: true,
              lastName: true,
              officeEmail: true,
              subManagerId: true,
              subManagerIds: true,
              managers: { select: { managerId: true } },
              partners: { select: { partnerId: true } }
            } as any
          },
          job: {
            include: {
              project: {
                include: {
                  client: {
                    select: {
                      id: true,
                      partnerId: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (!timelog) {
        console.error(`[REJECTION_ERROR] - Timelog not found: ${id}`);
        throw new Error('Timelog entry not found');
      }

      // Get rejector details
      const rejector = await prisma.employee.findUnique({
        where: { id: rejectorId },
        select: {
          id: true,
          employeeId: true,
          firstName: true,
          lastName: true,
          officeEmail: true,
          role: true
        }
      });

      if (!rejector) {
        console.error(`[REJECTION_ERROR] - Rejector not found: ${rejectorId}`);
        throw new Error('Rejector not found');
      }

      console.log(`[REJECT_DEBUG] - LoggedInUser: { id: "${rejectorId}", role: "${rejector.role}" }`);
      console.log(`[REJECT_DEBUG] - Timesheet: { id: "${id}", employeeId: "${timelog.employeeId}" }`);
      console.log(`[REJECT_DEBUG] - ClientPartnerId: "${timelog.job?.project?.client?.partnerId}"`);

      if (timelog.submissionStatus !== 'submitted') {
        console.error(`[REJECTION_ERROR] - Invalid status for rejection: ${timelog.submissionStatus}`);
        throw new Error(`Timesheet not in submitted state. Current status: ${timelog.submissionStatus}`);
      }

      console.log(`[DEBUG] - Rejector: ${rejector.firstName} ${rejector.lastName} (${rejector.officeEmail})`);
      console.log(`[DEBUG] - Rejector role: ${rejector.role}`);

      // Validate rejection authorization (same logic as approval)
      const hasRejectionAuthority = await this.validateApprovalAuthority(timelog, rejector);
      
      if (!hasRejectionAuthority) {
        console.error(`[REJECTION_ERROR] - User ${rejector.officeEmail} not authorized to reject timelog ${id}`);
        throw new Error('User not authorized to reject this timesheet');
      }

      console.log(`[DEBUG] - Rejection authority validated successfully`);

      const updated = await prisma.timelog.update({
        where: { id },
        data: {
          submissionStatus: 'rejected',
          rejectedAt: new Date(),
          rejectedBy: rejectorId,
          rejectionReason: reason,
          approvedAt: null,
          approvedBy: null
        } as any
      });

      console.log(`[REJECTION_SUCCESS] - Timelog ${id} rejected by ${rejector.officeEmail}`);

      // Notify employee
      const dateStr = new Date(timelog.date).toLocaleDateString();
      await NotificationService.createNotification({
        userId: timelog.employeeId,
        title: 'Timesheet Rejected ❌',
        message: `Your timesheet for ${dateStr} was rejected by ${rejector.firstName} ${rejector.lastName}. Reason: ${reason}`,
        type: 'timesheet_rejected',
        relatedId: timelog.id,
        actionUrl: '/timesheet'
      });

      // Notify Manager if Sub Manager takes action
      const isSubManagerAction = (timelog.employee as any).subManagerId === rejectorId || 
                                 (timelog.employee as any).subManagerIds?.includes(rejectorId);
      if (isSubManagerAction) {
        const managers = await (prisma as any).employeeManager.findMany({
          where: { employeeId: timelog.employeeId },
          select: { managerId: true }
        });
        for (const m of managers) {
          await NotificationService.createNotification({
            userId: m.managerId,
            title: 'Sub Manager Action: Timesheet Rejected ❌',
            message: `Sub Manager ${rejector.firstName} rejected timesheet for ${timelog.employee.firstName} ${timelog.employee.lastName}. Reason: ${reason}`,
            type: 'timesheet_rejected',
            relatedId: timelog.id,
            actionUrl: '/timesheet'
          });
        }
      }

      return updated;
    } catch (error) {
      console.error('Error rejecting timelog:', error);
      throw error;
    }
  }

  async bulkApproveTimelogs(ids: string[], approverId: string) {
    try {
      console.log(`[BULK_APPROVE_START] - IDs: ${ids.join(', ')}, Approver: ${approverId}`);

      if (!ids || ids.length === 0) {
        throw new Error('No timelog IDs provided for bulk approval');
      }

      // Verify approver exists and has permission
      const approver = await prisma.employee.findUnique({
        where: { id: approverId },
        select: { id: true, firstName: true, lastName: true, officeEmail: true, role: true }
      });

      if (!approver) {
        throw new Error('Approver not found');
      }

      if (['Employee'].includes(approver.role)) {
        throw new Error('Employees are not authorized to approve timesheets');
      }

      // Fetch all candidate timelogs to authorize
      const timelogs = await prisma.timelog.findMany({
        where: { id: { in: ids } },
        include: {
          job: {
            include: {
              project: {
                include: {
                  client: true
                }
              }
            }
          }
        }
      });

      // Filter to only authorized IDs that are currently in 'submitted' state
      const authorizedIds: string[] = [];
      for (const timelog of timelogs) {
        if (timelog.submissionStatus === 'submitted') {
          const hasAuthority = await this.validateApprovalAuthority(timelog, approver);
          if (hasAuthority) {
            authorizedIds.push(timelog.id);
          }
        }
      }

      if (authorizedIds.length === 0) {
        return { count: 0, message: `0 timelog(s) approved successfully` };
      }

      // Update authorized timelogs
      const result = await prisma.timelog.updateMany({
        where: {
          id: { in: authorizedIds }
        },
        data: {
          submissionStatus: 'approved',
          approvedAt: new Date(),
          approvedBy: approverId,
          rejectedAt: null,
          rejectedBy: null,
          rejectionReason: null
        } as any
      });

      console.log(`[BULK_APPROVE_SUCCESS] - Updated ${result.count} timelogs`);

      // Send notifications to employees for successfully approved timelogs
      const approvedTimelogs = timelogs.filter(t => authorizedIds.includes(t.id));
      for (const timelog of approvedTimelogs) {
        await NotificationService.createNotification({
          userId: timelog.employeeId,
          title: 'Timesheet Approved ✅',
          message: `Your timesheet for ${new Date(timelog.date).toLocaleDateString()} has been approved by ${approver.firstName} ${approver.lastName}.`,
          type: 'timesheet_approved',
          relatedId: timelog.id,
          actionUrl: '/timesheet'
        });
      }

      return { count: result.count, message: `${result.count} timelog(s) approved successfully` };
    } catch (error) {
      console.error('Error in bulk approve:', error);
      throw error;
    }
  }

  async bulkRejectTimelogs(ids: string[], rejectorId: string, reason: string) {
    try {
      console.log(`[BULK_REJECT_START] - IDs: ${ids.join(', ')}, Rejector: ${rejectorId}`);

      if (!ids || ids.length === 0) {
        throw new Error('No timelog IDs provided for bulk rejection');
      }

      // Verify rejector exists and has permission
      const rejector = await prisma.employee.findUnique({
        where: { id: rejectorId },
        select: { id: true, firstName: true, lastName: true, officeEmail: true, role: true }
      });

      if (!rejector) {
        throw new Error('Rejector not found');
      }

      if (['Employee'].includes(rejector.role)) {
        throw new Error('Employees are not authorized to reject timesheets');
      }

      if (!reason || reason.trim().length === 0) {
        throw new Error('Rejection reason is required');
      }

      // Fetch all candidate timelogs to authorize
      const timelogs = await prisma.timelog.findMany({
        where: { id: { in: ids } },
        include: {
          job: {
            include: {
              project: {
                include: {
                  client: true
                }
              }
            }
          }
        }
      });

      // Filter to only authorized IDs that are currently in 'submitted' state
      const authorizedIds: string[] = [];
      for (const timelog of timelogs) {
        if (timelog.submissionStatus === 'submitted') {
          const hasAuthority = await this.validateApprovalAuthority(timelog, rejector);
          if (hasAuthority) {
            authorizedIds.push(timelog.id);
          }
        }
      }

      if (authorizedIds.length === 0) {
        return { count: 0, message: `0 timelog(s) rejected successfully` };
      }

      // Update authorized timelogs to rejected state
      const result = await prisma.timelog.updateMany({
        where: {
          id: { in: authorizedIds }
        },
        data: {
          submissionStatus: 'rejected',
          rejectedAt: new Date(),
          rejectedBy: rejectorId,
          rejectionReason: reason,
          approvedAt: null,
          approvedBy: null
        } as any
      });

      console.log(`[BULK_REJECT_SUCCESS] - Updated ${result.count} timelogs`);

      // Send notifications to employees for successfully rejected timelogs
      const rejectedTimelogs = timelogs.filter(t => authorizedIds.includes(t.id));
      for (const timelog of rejectedTimelogs) {
        await NotificationService.createNotification({
          userId: timelog.employeeId,
          title: 'Timesheet Rejected ❌',
          message: `Your timesheet for ${new Date(timelog.date).toLocaleDateString()} was rejected by ${rejector.firstName} ${rejector.lastName}. Reason: ${reason}`,
          type: 'timesheet_rejected',
          relatedId: timelog.id,
          actionUrl: '/timesheet'
        });
      }

      return { count: result.count, message: `${result.count} timelog(s) rejected successfully` };
    } catch (error) {
      console.error('Error in bulk reject:', error);
      throw error;
    }
  }

  async bulkSubmitTimelogs(ids: string[], employeeId: string) {
    try {
      console.log(`[BULK_SUBMIT_SERVICE] - User: ${employeeId}, IDs: ${ids.length}`);
      
      // Fetch the timelogs first with all details needed for notifications
      const timelogs = await prisma.timelog.findMany({
        where: {
          id: { in: ids },
          employeeId: employeeId,
          submissionStatus: { in: ['not_submitted', 'draft', 'DRAFT', 'NOT_SUBMITTED'] }
        },
        include: { 
          employee: true,
          job: {
            include: {
              project: {
                include: { client: true }
              }
            }
          }
        }
      });

      if (timelogs.length === 0) {
        return { count: 0, message: 'No timelogs to submit' };
      }

      const targetIds = timelogs.map(t => t.id);

      // Perform bulk update status to submitted
      const result = await prisma.timelog.updateMany({
        where: {
          id: { in: targetIds }
        },
        data: {
          submissionStatus: 'submitted',
          submittedAt: new Date()
        }
      });

      console.log(`[BULK_SUBMIT_SUCCESS] - Updated ${result.count} timelogs`);

      // [DISABLED] Bulk timesheet submission notifications turned off
      // Uncomment below to re-enable "New Timesheet Submission" alerts for managers/admins.
      /*
      for (const timelog of timelogs) {
        const employeeName = `${timelog.employee.firstName} ${timelog.employee.lastName || ''}`.trim();
        const notificationData = {
          title: 'New Timesheet Submission 📝',
          message: `${employeeName} submitted ${timelog.hours}h for ${timelog.job.project.client.name} - ${timelog.job.project.name} on ${new Date(timelog.date).toLocaleDateString()}.`,
          type: 'timesheet_submission',
          relatedId: timelog.id,
          actionUrl: '/timesheet'
        };

        // 1. Notify All Managers
        const managers = await (prisma as any).employeeManager.findMany({
          where: { employeeId: timelog.employeeId },
          select: { managerId: true }
        });
        for (const m of managers) {
          await NotificationService.createNotification({
            userId: m.managerId,
            ...notificationData
          });
        }

        // 2. Notify All Partners
        const partners = await (prisma as any).employeePartner.findMany({
          where: { employeeId: timelog.employeeId },
          select: { partnerId: true }
        });
        for (const p of partners) {
          await NotificationService.createNotification({
            userId: p.partnerId,
            ...notificationData
          });
        }

        // 3. Notify Admin
        await NotificationService.notifyRoles(['Admin', 'Owner'], notificationData);

        // 4. Notify Sub Managers (if exist)
        const employee: any = await prisma.employee.findUnique({
          where: { id: timelog.employeeId },
          select: { 
            id: true,
            subManagerId: true,
            subManagerIds: true
          } as any
        });
        if (employee) {
          const subManagerIds = new Set<string>();
          if (employee.subManagerId) subManagerIds.add(employee.subManagerId);
          if (Array.isArray((employee as any).subManagerIds)) {
            ((employee as any).subManagerIds).forEach((id: string) => subManagerIds.add(id));
          }
          for (const smId of subManagerIds) {
            await NotificationService.createNotification({
              userId: smId,
              ...notificationData
            });
          }
        }
      }
      */

      return { count: result.count, message: `${result.count} timelog(s) submitted successfully` };
    } catch (error) {
      console.error('Error in bulk submit:', error);
      throw error;
    }
  }
}
