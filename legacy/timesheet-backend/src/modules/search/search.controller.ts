import { Request, Response } from 'express';
import { prisma } from '../../config/prisma';

export const globalSearch = async (req: any, res: Response) => {
  try {
    const { q } = req.query;
    const query = typeof q === 'string' ? q.trim() : '';

    if (!query || query.length < 2) {
      return res.json({
        success: true,
        data: {
          employees: [],
          projects: [],
          jobs: []
        }
      });
    }

    // 1. Search Employees
    const employees = await prisma.employee.findMany({
      where: {
        OR: [
          { firstName: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } },
          { employeeId: { contains: query, mode: 'insensitive' } },
          { officeEmail: { contains: query, mode: 'insensitive' } },
          { department: { contains: query, mode: 'insensitive' } }
        ],
        status: {
          in: ['active', 'pending_approval', 'pending']
        }
      },
      select: {
        id: true,
        employeeId: true,
        firstName: true,
        lastName: true,
        officeEmail: true,
        designation: true,
        profileImage: true,
        updatedAt: true,
        profile: {
          select: { profileImage: true }
        },
      },
      take: 5
    });

    // 2. Search Projects
    const projects = await prisma.project.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { projectId: { contains: query, mode: 'insensitive' } }
        ]
      },
      select: {
        id: true,
        projectId: true,
        name: true,
        client: {
          select: {
            name: true
          }
        }
      },
      take: 5
    });

    // 3. Search Jobs
    const jobs = await prisma.job.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { jobId: { contains: query, mode: 'insensitive' } }
        ]
      },
      select: {
        id: true,
        jobId: true,
        name: true,
        project: {
          select: {
            name: true
          }
        }
      },
      take: 5
    });

    // Import the utility
    const { toAbsoluteAssetUrl } = require("../../utils/assetUrl");

    return res.json({
      success: true,
      data: {
        employees: employees.map(emp => ({
          ...emp,
          profileImage: toAbsoluteAssetUrl(emp.profileImage || (emp as any).profile?.profileImage, req)
        })),
        projects,
        jobs
      }
    });
  } catch (error) {
    console.error('Global search error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to perform search'
    });
  }
};
