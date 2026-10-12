import { prisma } from '../../config/prisma';
import { generateProjectId } from '../../utils/projectIdGenerator';

export class ProjectService {
  async getAllProjects(user?: any) {
    try {
      return await this.searchProjects('', {}, user);
    } catch (error) {
      console.error('Error fetching projects:', error);
      throw error;
    }
  }

  async getProjectById(id: string) {
    try {
      const project = await prisma.project.findUnique({
        where: { id },
        include: {
          client: true,
          jobs: true,
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
              jobs: true
            }
          }
        }
      });

      if (!project) return null;

      const timelogsSum = await prisma.timelog.aggregate({
        where: { projectId: id },
        _sum: { hours: true }
      });

      return {
        ...project,
        loggedHours: timelogsSum._sum.hours || 0
      };
    } catch (error) {
      console.error('Error fetching project:', error);
      throw error;
    }
  }

  async createProject(projectData: any, attachments?: any[], user?: any) {
    try {
      const projectId = generateProjectId();

      const existingProject = await prisma.project.findUnique({
        where: { projectId }
      });

      if (existingProject) {
        throw new Error('Project ID already exists');
      }

      const role = user?.role?.toUpperCase();
      const createdBy = user?.id;
      let managerId = projectData.managerId || null;
      let partnerId = projectData.partnerId || null;

      if (role === 'MANAGER') {
        managerId = user.id;
      } else if (role === 'PARTNER') {
        partnerId = user.id;
      }

      const project = await prisma.project.create({
        data: {
          projectId,
          name: projectData.name,
          status: projectData.status || 'Active',
          startDate: new Date(projectData.startDate),
          endDate: projectData.endDate ? new Date(projectData.endDate) : null,
          billable: projectData.billable === true,
          contactPerson: projectData.contactPerson || null,
          createdByEmail: user?.email || null,
          createdBy: createdBy || null,
          managerId: managerId,
          partnerId: partnerId,
          clientId: projectData.clientId,
          users: {
            create: projectData.assignedEmployees?.map((empId: string) => ({
              employeeId: empId
            })) || []
          }
        } as any,
        include: {
          client: true,
          users: {
            include: {
              employee: true
            }
          }
        }
      });

      return project;
    } catch (error) {
      console.error('Error creating project:', error);
      throw error;
    }
  }

  async updateProject(id: string, projectData: any) {
    try {
      const project = await prisma.project.update({
        where: { id },
        data: {
          name: projectData.name,
          status: projectData.status,
          startDate: projectData.startDate ? new Date(projectData.startDate) : undefined,
          endDate: projectData.endDate ? new Date(projectData.endDate) : null,
          billable: projectData.billable,
          contactPerson: projectData.contactPerson,
          clientId: projectData.clientId
        }
      });

      // Update assignments
      if (projectData.assignedEmployees) {
        await prisma.projectUser.deleteMany({
          where: { projectId: id }
        });
        
        if (projectData.assignedEmployees.length > 0) {
          await prisma.projectUser.createMany({
            data: projectData.assignedEmployees.map((empId: string) => ({
              projectId: id,
              employeeId: empId
            }))
          });
        }
      }

      return await this.getProjectById(id);
    } catch (error) {
      console.error('Error updating project:', error);
      throw error;
    }
  }

  async deleteProject(id: string) {
    try {
      return await prisma.$transaction(async (tx) => {
        // 1. Delete associated ProjectAttachments
        await tx.projectAttachment.deleteMany({
          where: { projectId: id }
        });
        
        // 2. Fetch all jobs to delete their timelogs
        const projectJobs = await tx.job.findMany({
          where: { projectId: id },
          select: { id: true }
        });
        const jobIds = projectJobs.map(j => j.id);
        
        if (jobIds.length > 0) {
          // 3. Delete timelogs associated with these jobs
          await tx.timelog.deleteMany({
            where: { jobId: { in: jobIds } }
          });
          
          // 4. Delete JobUser assignments (though cascade should handle it)
          await tx.jobUser.deleteMany({
            where: { jobId: { in: jobIds } }
          });

          // 5. Delete the jobs
          await tx.job.deleteMany({
            where: { id: { in: jobIds } }
          });
        }

        // 6. Delete ProjectUser assignments (though cascade should handle it)
        await tx.projectUser.deleteMany({
          where: { projectId: id }
        });

        // 7. Finally delete the project
        const deletedProject = await tx.project.delete({
          where: { id }
        });

        return deletedProject;
      });
    } catch (error) {
      console.error('Error in cascade project deletion:', error);
      throw error;
    }
  }

  async getProjectAttachments(projectId: string) {
    try {
      const attachments = await prisma.projectAttachment.findMany({
        where: { projectId },
        orderBy: { uploadedAt: 'desc' }
      });

      return attachments;
    } catch (error) {
      console.error('Error fetching project attachments:', error);
      throw error;
    }
  }

  async addProjectAttachment(projectId: string, attachment: any, userEmail?: string) {
    try {
      const projectAttachment = await prisma.projectAttachment.create({
        data: {
          projectId,
          fileName: attachment.originalname,
          filePath: attachment.path,
          fileSize: attachment.size,
          mimeType: attachment.mimetype,
          uploadedBy: userEmail
        }
      });

      return projectAttachment;
    } catch (error) {
      console.error('Error adding project attachment:', error);
      throw error;
    }
  }

  async deleteProjectAttachment(attachmentId: string) {
    try {
      await prisma.projectAttachment.delete({
        where: { id: attachmentId }
      });

      return { message: 'Attachment deleted successfully' };
    } catch (error) {
      console.error('Error deleting project attachment:', error);
      throw error;
    }
  }

  async searchProjects(query: string, filters?: any, user?: any) {
    try {
      let whereClause: any = {};

      if (user) {
        const role = user.role?.toUpperCase();
        const isAdmin = role === 'ADMIN' || role === 'OWNER' || role === 'IT';
        
        if (!isAdmin) {
          if (role === 'PARTNER' || role === 'MANAGER') {
            whereClause.OR = [
              { createdBy: user.id },
              { managerId: user.id },
              { partnerId: user.id },
              {
                users: {
                  some: { employeeId: user.id }
                }
              },
              {
                jobs: {
                  some: {
                    users: { some: { employeeId: user.id } }
                  }
                }
              },
              {
                client: {
                  OR: [
                    { createdBy: user.id },
                    { partnerId: user.id }
                  ]
                }
              }
            ];
          } else {
            // Regular Employee: Show only projects where they are assigned or have assigned jobs
            whereClause.OR = [
              { users: { some: { employeeId: user.id } } },
              { jobs: { some: { users: { some: { employeeId: user.id } } } } }
            ];
          }
        }
      }

      // Apply clientId filter if present
      if (filters?.clientId) {
        whereClause.clientId = filters.clientId;
      }

      // Handle search query
      const search = query?.trim();
      if (search) {
        const searchOR = [
          { name: { contains: search, mode: 'insensitive' } },
          { projectId: { contains: search, mode: 'insensitive' } },
          { client: { name: { contains: search, mode: 'insensitive' } } }
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

      console.log('🔍 Executing Project findMany with where:', JSON.stringify(whereClause, null, 2));

      const projects = await prisma.project.findMany({
        where: whereClause,
        include: {
          client: true,
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
              jobs: true
            }
          }
        },
        orderBy: {
          startDate: 'desc'
        }
      });

      const timelogGroups = await prisma.timelog.groupBy({
        by: ['projectId'],
        _sum: {
          hours: true
        }
      });

      const projectHoursMap = new Map<string, number>();
      timelogGroups.forEach(group => {
        if (group.projectId) {
          projectHoursMap.set(group.projectId, group._sum.hours || 0);
        }
      });

      return projects.map(project => ({
        ...project,
        loggedHours: projectHoursMap.get(project.id) || 0
      }));
    } catch (error) {
      console.error('Error searching projects:', error);
      throw error;
    }
  }
}