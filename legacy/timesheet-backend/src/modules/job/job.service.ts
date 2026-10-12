import { prisma } from '../../config/prisma';
import { generateJobId, generateCombinedId } from '../../utils/jobIdGenerator';

export class JobService {
  async getAllJobs(user?: any) {
    try {
      return await this.searchJobs('', {}, user);
    } catch (error) {
      console.error('Error fetching jobs:', error);
      throw error;
    }
  }

  async getJobById(id: string) {
    try {
      const job = await prisma.job.findUnique({
        where: { id },
        include: {
          project: {
            include: {
              client: true
            }
          },
          _count: {
            select: {
              timelogs: true
            }
          }
        }
      });

      if (!job) return null;

      const timelogsSum = await prisma.timelog.aggregate({
        where: { jobId: id },
        _sum: { hours: true }
      });

      return {
        ...job,
        loggedHours: timelogsSum._sum.hours || 0
      } as any;
    } catch (error) {
      console.error('Error fetching job:', error);
      throw error;
    }
  }

  async createJob(jobData: any, user?: any) {
    try {
      const jobId = generateJobId();

      const existingJob = await prisma.job.findUnique({
        where: { jobId }
      });

      if (existingJob) {
        throw new Error('Job ID already exists');
      }

      const project = (await prisma.project.findUnique({
        where: { id: jobData.projectId },
        include: {
          client: true,
          manager: true,
          partner: true,
          creator: true
        }
      } as any)) as any;

      if (!project) {
        throw new Error('Project not found');
      }

      // Validation: If manager/partner, ensure they can create jobs for this project
      const role = user?.role?.toUpperCase();
      if (role === 'MANAGER' || role === 'PARTNER') {
        // Check if user is the manager/partner or creator of the project
        const isProjectOwner = 
          project.createdBy === user.id || 
          project.managerId === user.id || 
          project.partnerId === user.id ||
          project.createdByEmail === user.email;
        
        if (!isProjectOwner) {
          throw new Error('You are not authorized to create jobs for this project');
        }

        // Validate assigned employees if applicable
        const assignedEmployees = jobData.assignedEmployees || [];
        if (assignedEmployees.length > 0) {
          const employees = await prisma.employee.findMany({
            where: {
              id: { in: assignedEmployees }
            }
          });

          for (const emp of employees) {
            const isAuthorizedForEmp = await prisma.employee.findFirst({
              where: {
                id: emp.id,
                OR: [
                  { managers: { some: { managerId: user.id } } },
                  { partners: { some: { partnerId: user.id } } },
                  { managerId: user.id },
                  { partnerId: user.id },
                  { reportingManagerIds: { has: user.id } },
                  { reportingPartnerIds: { has: user.id } },
                  { projects: { some: { projectId: jobData.projectId } } }
                ]
              } as any
            });

            if (!isAuthorizedForEmp && role === 'MANAGER') {
              throw new Error(`Employee ${emp.firstName} ${emp.lastName} is not in your team`);
            }
            if (!isAuthorizedForEmp && role === 'PARTNER') {
              throw new Error(`Employee ${emp.firstName} ${emp.lastName} is not under your partnership`);
            }
          }
        }
      }

      const combinedId = generateCombinedId(
        project.client.clientId,
        project.projectId,
        jobId
      );

      const job = await prisma.job.create({
        data: {
          jobId,
          combinedId,
          name: jobData.name,
          description: jobData.description || null,
          status: jobData.status || 'Active',
          startDate: jobData.startDate ? new Date(jobData.startDate) : null,
          endDate: jobData.endDate ? new Date(jobData.endDate) : null,
          billable: jobData.billable === true,
          projectId: jobData.projectId,
          createdByEmail: user?.email || null,
          createdBy: user?.id || null,
          users: {
            create: jobData.assignedEmployees?.map((empId: string) => ({
              employeeId: empId
            })) || []
          }
        } as any,
        include: {
          project: {
            include: {
              client: true
            }
          },
          users: {
            include: {
              employee: true
            }
          }
        }
      });

      return job;
    } catch (error) {
      console.error('Error creating job:', error);
      throw error;
    }
  }

  async updateJob(id: string, jobData: any) {
    try {
      if (jobData.projectId) {
        const project = await prisma.project.findUnique({
          where: { id: jobData.projectId }
        });

        if (!project) {
          throw new Error('Project not found');
        }
      }

      await prisma.job.update({
        where: { id },
        data: {
          name: jobData.name,
          description: jobData.description,
          status: jobData.status,
          startDate: jobData.startDate ? new Date(jobData.startDate) : undefined,
          endDate: jobData.endDate ? new Date(jobData.endDate) : null,
          billable: jobData.billable,
          projectId: jobData.projectId
        }
      });

      // Update assignments
      if (jobData.assignedEmployees) {
        await prisma.jobUser.deleteMany({
          where: { jobId: id }
        });
        
        if (jobData.assignedEmployees.length > 0) {
          await prisma.jobUser.createMany({
            data: jobData.assignedEmployees.map((empId: string) => ({
              jobId: id,
              employeeId: empId
            }))
          });
        }
      }

      return await this.getJobById(id);
    } catch (error) {
      console.error('Error updating job:', error);
      throw error;
    }
  }

  async deleteJob(id: string) {
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.timelog.deleteMany({
          where: { jobId: id }
        });

        await tx.job.delete({
          where: { id }
        });

        return { success: true, message: 'Job deleted successfully' };
      });
    } catch (error) {
      console.error('Error deleting job:', error);
      throw error;
    }
  }

  async getJobsByProject(projectId: string) {
    try {
      const jobs = await prisma.job.findMany({
        where: { projectId },
        include: {
          project: {
            include: {
              client: true
            }
          },
          users: {
            include: {
              employee: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true
                }
              }
            }
          },
          _count: {
            select: {
              timelogs: true
            }
          }
        },
        orderBy: {
          startDate: 'desc'
        }
      });

      const timelogGroups = await prisma.timelog.groupBy({
        by: ['jobId'],
        _sum: {
          hours: true
        }
      });

      const jobHoursMap = new Map<string, number>();
      timelogGroups.forEach(group => {
        if (group.jobId) {
          jobHoursMap.set(group.jobId, group._sum.hours || 0);
        }
      });

      return (jobs || []).map(job => ({
        ...job,
        loggedHours: jobHoursMap.get(job.id) || 0
      }));
    } catch (error) {
      console.error('Error fetching jobs by project:', error);
      throw error;
    }
  }

  async getJobsByClient(clientId: string) {
    try {
      const jobs = await prisma.job.findMany({
        where: {
          project: {
            clientId
          }
        },
        include: {
          project: {
            include: {
              client: true
            }
          },
          users: {
            include: {
              employee: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true
                }
              }
            }
          },
          _count: {
            select: {
              timelogs: true
            }
          }
        },
        orderBy: {
          startDate: 'desc'
        }
      });

      const timelogGroups = await prisma.timelog.groupBy({
        by: ['jobId'],
        _sum: {
          hours: true
        }
      });

      const jobHoursMap = new Map<string, number>();
      timelogGroups.forEach(group => {
        if (group.jobId) {
          jobHoursMap.set(group.jobId, group._sum.hours || 0);
        }
      });

      return (jobs || []).map(job => ({
        ...job,
        loggedHours: jobHoursMap.get(job.id) || 0
      }));
    } catch (error) {
      console.error('Error fetching jobs by client:', error);
      throw error;
    }
  }

  async searchJobs(query: string, filters?: any, user?: any) {
    try {
      let whereClause: any = {};

      if (user) {
        const role = user.role?.toUpperCase();
        const isAdmin = role === 'ADMIN' || role === 'OWNER' || role === 'IT';
        
        if (!isAdmin) {
          if (role === 'PARTNER' || role === 'MANAGER') {
            whereClause.OR = [
              { createdBy: user.id },
              { users: { some: { employeeId: user.id } } },
              { project: { createdBy: user.id } },
              { project: { managerId: user.id } },
              { project: { partnerId: user.id } },
              { project: { users: { some: { employeeId: user.id } } } },
              { project: { client: { createdBy: user.id } } },
              { project: { client: { partnerId: user.id } } }
            ];
          } else {
            // Regular Employee: Show only jobs where they are assigned
            whereClause.users = { some: { employeeId: user.id } };
          }
        }
      }

      if (filters?.projectId) {
        whereClause.projectId = filters.projectId;
      }
      
      if (filters?.clientId) {
        whereClause.project = { ...whereClause.project, clientId: filters.clientId };
      }

      // Handle search query
      const search = query?.trim();
      if (search) {
        const searchOR = [
          { name: { contains: search, mode: 'insensitive' } },
          { jobId: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { project: { name: { contains: search, mode: 'insensitive' } } },
          { project: { client: { name: { contains: search, mode: 'insensitive' } } } }
        ];

        // Combine RBAC where with search using AND as requested by user
        if (Object.keys(whereClause).length > 0) {
          const currentWhere = { ...whereClause };
          whereClause = {
            AND: [
              currentWhere,
              { OR: searchOR }
            ]
          };
        } else {
          whereClause.OR = searchOR;
        }
      }

      if (filters?.status) {
        whereClause.status = filters.status;
      }

      console.log('🔍 Executing Job findMany with where:', JSON.stringify(whereClause, null, 2));

      const jobs = await prisma.job.findMany({
        where: whereClause,
        include: {
          project: {
            include: {
              client: true
            }
          },
          _count: {
            select: {
              timelogs: true
            }
          },
          users: {
            include: {
              employee: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true
                }
              }
            }
          }
        },
        orderBy: {
          startDate: 'desc'
        }
      });

      const timelogGroups = await prisma.timelog.groupBy({
        by: ['jobId'],
        _sum: {
          hours: true
        }
      });

      const jobHoursMap = new Map<string, number>();
      timelogGroups.forEach(group => {
        if (group.jobId) {
          jobHoursMap.set(group.jobId, group._sum.hours || 0);
        }
      });

      return (jobs || []).map(job => ({
        ...job,
        loggedHours: jobHoursMap.get(job.id) || 0
      }));
    } catch (error) {
      console.error('Error searching jobs:', error);
      throw error;
    }
  }
}