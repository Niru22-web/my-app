import { Request, Response } from 'express';
import { JobService } from './job.service';
import multer from 'multer';
import { ExcelService } from '../../utils/ExcelService';
import { prisma } from '../../config/prisma';

const jobService = new JobService();

export const getAllJobs = async (req: Request, res: Response) => {
  try {
    const { q, status, billable, clientId, projectId, startDateFrom, startDateTo } = req.query;
    
    // Safety check for search term
    const search = typeof q === 'string' ? q.trim() : "";
    
    const filters = {
      status: status && status !== 'All Status' ? status as string : undefined,
      billable: billable === 'true' ? true : billable === 'false' ? false : undefined,
      clientId: clientId as string,
      projectId: projectId as string,
      startDateFrom: startDateFrom as string,
      startDateTo: startDateTo as string
    };
    
    const jobs = await jobService.searchJobs(search, filters, (req as any).user);
    
    res.json({
      success: true,
      data: jobs || [],
      message: 'Jobs retrieved successfully'
    });
  } catch (error: any) {
    console.error("Jobs API Error:", error);
    console.error(error.stack);
    res.status(500).json({ 
      success: false,
      message: "Internal Server Error",
      error: error.message || 'Failed to fetch jobs' 
    });
  }
};

export const getJobById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const job = await jobService.getJobById(id);
    
    if (!job) {
      return res.status(404).json({ 
        success: false,
        error: 'Job not found' 
      });
    }
    
    res.json({
      success: true,
      data: job,
      message: 'Job retrieved successfully'
    });
  } catch (error: any) {
    console.error("Job Fetch Error:", error);
    console.error(error.stack);
    res.status(500).json({ 
      success: false,
      message: "Internal Server Error",
      error: error.message || 'Failed to fetch job' 
    });
  }
};

export const createJob = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const job = await jobService.createJob(req.body, user);
    res.status(201).json({
      success: true,
      data: job,
      message: 'Job created successfully'
    });
  } catch (error: any) {
    console.error("Job Create Error:", error);
    console.error(error.stack);
    res.status(400).json({ 
      success: false,
      message: "Bad Request",
      error: error.message || 'Failed to create job' 
    });
  }
};

export const updateJob = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const job = await jobService.updateJob(id, req.body);
    res.json({
      success: true,
      data: job,
      message: 'Job updated successfully'
    });
  } catch (error: any) {
    console.error("Job Update Error:", error);
    console.error(error.stack);
    res.status(400).json({ 
      success: false,
      message: "Bad Request",
      error: error.message || 'Failed to update job' 
    });
  }
};

export const deleteJob = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    // 1. Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid job ID format. Expected a valid UUID." 
      });
    }

    // 2. Check if job exists
    const job = await jobService.getJobById(id) as any;
    if (!job) {
      return res.status(404).json({ 
        success: false, 
        error: "Job not found" 
      });
    }

    // 3. Authorization check
    const isAdmin = user.role?.toLowerCase() === 'admin';
    const isCreator = job.createdByEmail === user.email || job.createdBy === user.id;

    if (!isAdmin && !isCreator) {
      return res.status(403).json({ 
        success: false, 
        error: "Not authorized to delete this job. Only admins or the job creator can perform this action." 
      });
    }

    // 4. Perform deletion
    await jobService.deleteJob(id);
    
    res.json({
      success: true,
      message: 'Job deleted successfully'
    });
  } catch (error: any) {
    console.error("Job Delete Error:", error);
    console.error(error.stack);
    res.status(500).json({ 
      success: false,
      message: "Internal Server Error",
      error: error.message || 'Failed to delete job' 
    });
  }
};

export const getJobsByProject = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const jobs = await jobService.getJobsByProject(projectId);
    res.json({
      success: true,
      data: jobs,
      message: 'Jobs retrieved successfully'
    });
  } catch (error: any) {
    console.error("Jobs by Project Fetch Error:", error);
    console.error(error.stack);
    res.status(500).json({ 
      success: false,
      message: "Internal Server Error",
      error: error.message || 'Failed to fetch jobs by project' 
    });
  }
};

export const getJobsByClient = async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const jobs = await jobService.getJobsByClient(clientId);
    res.json({
      success: true,
      data: jobs,
      message: 'Jobs retrieved successfully'
    });
  } catch (error: any) {
    console.error("Jobs by Client Fetch Error:", error);
    console.error(error.stack);
    res.status(500).json({ 
      success: false,
      message: "Internal Server Error",
      error: error.message || 'Failed to fetch jobs by client' 
    });
  }
};

export const searchJobs = async (req: Request, res: Response) => {
  try {
    const { q, status, billable, clientId, projectId, startDateFrom, startDateTo } = req.query;
    
    const search = typeof q === 'string' ? q.trim() : "";
    
    const filters = {
      status: status && status !== 'All Status' ? status as string : undefined,
      billable: billable === 'true' ? true : billable === 'false' ? false : undefined,
      clientId: clientId as string,
      projectId: projectId as string,
      startDateFrom: startDateFrom as string,
      startDateTo: startDateTo as string
    };
    
    const jobs = await jobService.searchJobs(search, filters, (req as any).user);
    res.json({
      success: true,
      data: jobs || [],
      message: 'Jobs search completed'
    });
  } catch (error: any) {
    console.error("Jobs Search API Error:", error);
    console.error(error.stack);
    res.status(500).json({ 
      success: false,
      message: "Internal Server Error",
      error: error.message || 'Failed to search jobs' 
    });
  }
};

export const bulkUploadJobs = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const jsonData = ExcelService.parseExcel(req.file.buffer);
    const userEmail = (req as any).user?.email;

    const results = [];
    const errors = [];

    for (let row of jsonData) {
      try {
        const { name, projectName, status, startDate, billable, description } = row;
        
        // Find project by name
        const project = await (prisma as any).project.findFirst({
          where: { name: { contains: projectName, mode: 'insensitive' } }
        });

        if (!project) {
          throw new Error(`Project "${projectName}" not found`);
        }

        const jobData = {
          name,
          projectId: project.id,
          status: status || 'Started',
          startDate: startDate ? new Date(startDate) : new Date(),
          billable: billable === 'Yes' || billable === true,
          description: description || ''
        };

        const job = await jobService.createJob(jobData, (req as any).user);
        results.push(job);
      } catch (err: any) {
        errors.push({ row, error: err.message });
      }
    }

    res.json({
      success: true,
      data: { successCount: results.length, errors },
      message: 'Bulk upload completed'
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const exportJobs = async (req: Request, res: Response) => {
  try {
    const { q, status, billable, clientId, projectId, startDateFrom, startDateTo } = req.query;
    
    const filters = {
      status: status && status !== 'All Status' ? status as string : undefined,
      billable: billable === 'true' ? true : billable === 'false' ? false : undefined,
      clientId: clientId as string,
      projectId: projectId as string,
      startDateFrom: startDateFrom as string,
      startDateTo: startDateTo as string
    };
    
    const jobs = await jobService.searchJobs(q as string, filters, (req as any).user);

    const exportData = jobs.map(j => ({
      'Job ID': j.jobId,
      'Name': j.name,
      'Project': j.project.name,
      'Client': j.project.client.name,
      'Status': j.status,
      'Billable': j.billable ? 'Yes' : 'No',
      'Start Date': j.startDate ? j.startDate.toISOString().split('T')[0] : '',
      'Entries': j._count.timelogs
    }));

    ExcelService.exportToExcel(res, exportData, 'jobs');
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const downloadJobTemplate = async (req: Request, res: Response) => {
  try {
    const columns = ['name', 'projectName', 'status', 'startDate', 'billable', 'description'];
    ExcelService.generateTemplate(res, columns, 'job_template');
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate template' });
  }
};

export const toggleJobStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const job = await jobService.getJobById(id);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    const newStatus = job.status === 'Inactive' ? 'Started' : 'Inactive';
    const updatedJob = await jobService.updateJob(id, { status: newStatus });

    res.json({
      success: true,
      data: updatedJob,
      message: `Job status toggled successfully to ${newStatus}`
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to toggle job status',
      error: error.message
    });
  }
};

// Middleware for memory storage upload
const memoryStorage = multer.memoryStorage();
const memoryUpload = multer({ storage: memoryStorage });
export const uploadJobExcel = memoryUpload.single('file');