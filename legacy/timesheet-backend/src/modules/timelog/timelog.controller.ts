import { Request, Response } from 'express';
import { prisma } from '../../config/prisma';
import { TimelogService } from './timelog.service';
import multer from 'multer';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import { logActivity } from '../activity/activity.service';

import { getUploadsDir } from '../../utils/assetUrl';

const timelogService = new TimelogService();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = path.join(getUploadsDir(), 'timelogs');

    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `timelog-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Excel files (.xls, .xlsx) and CSV files are allowed.'));
    }
  }
});

export const uploadTimelogFile = upload.single('file');

export const getTimelogs = async (req: Request, res: Response) => {
  try {
    console.log('Fetching timelogs - API request received');

    const user = (req as any).user;
    const { employeeId, clientId, projectId, jobId, dateFrom, dateTo } = req.query;

    // Check if user exists
    if (!user) {
      console.error('No user found in request - authentication failed');
      return res.status(401).json({
        message: 'Unauthorized - User not authenticated'
      });
    }

    // Check if user has required properties
    if (!user.id || !user.role) {
      console.error('Invalid user object - missing id or role:', user);
      return res.status(401).json({
        message: 'Unauthorized - Invalid user credentials'
      });
    }

    console.log('User:', { id: user.id, email: user.email, role: user.role });
    console.log('Filters:', { employeeId, clientId, projectId, jobId, dateFrom, dateTo });

    const filters = {
      employeeId: employeeId as string,
      clientId: clientId as string,
      projectId: projectId as string,
      jobId: jobId as string,
      dateFrom: dateFrom as string,
      dateTo: dateTo as string
    };

    let timelogs;

    // Role-based access control
    if (['Admin', 'Owner'].includes(user.role)) {
      console.log('Fetching all timelogs (Admin/Owner role)');
      timelogs = await timelogService.getAllTimelogs({ ...filters, view: 'team' });
    } else if (user.role === 'Partner') {
      console.log('Fetching timelogs for partner:', user.id);
      timelogs = await timelogService.getTimelogsForPartner(user.id, user.email, { ...filters, view: 'team' });
    } else if (user.role === 'Manager') {
      console.log('Fetching timelogs for manager:', user.id);
      timelogs = await timelogService.getTimelogsForManager(user.id, user.email, { ...filters, view: 'team' });
    } else {
      // Regular users can only see their own timelogs
      console.log('Fetching timelogs for user:', user.id);
      timelogs = await timelogService.getTimelogsByUser(user.id, filters);
    }

    console.log('Timelogs fetched successfully, count:', Array.isArray(timelogs) ? timelogs.length : 'not an array');

    // Ensure we always return an array
    const timelogArray = Array.isArray(timelogs) ? timelogs : [];
    res.json({
      success: true,
      data: timelogArray,
      message: 'Timelogs retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching timelogs:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    res.status(500).json({
      message: 'Failed to fetch timelogs',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

function parseHours(hours: any): number {
  if (hours === null || hours === undefined) return 0;
  if (typeof hours === 'number') return hours;

  const hoursStr = String(hours).trim();
  if (hoursStr === '') return 0;

  // Support HH:MM format (common in Excel)
  if (hoursStr.includes(':')) {
    const parts = hoursStr.split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);

    if (isNaN(h) || isNaN(m)) return 0;
    return h + (m / 60);
  }

  // Support decimal string format
  const parsed = parseFloat(hoursStr);
  return isNaN(parsed) ? 0 : parsed;
}

export const createTimelog = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { jobId, hours, description, date, workItem, isBillable } = req.body;

    // Convert hours to number if it's a string (HH:MM or decimal)
    const parsedHours = parseHours(hours);

    if (!jobId || !parsedHours || !description || !date) {
      return res.status(400).json({
        error: 'Missing or invalid required fields',
        required: ['jobId', 'hours', 'description', 'date'],
        note: 'Hours must be a valid number or HH:MM format'
      });
    }

    // Map isBillable to billableStatus
    const billableStatus = isBillable === false ? 'non_billable' : 'billable';

    const timelog = await timelogService.createTimelog(
      { jobId, hours: parsedHours, description, date, workItem, billableStatus },
      user.id
    );

    // Log activity
    await logActivity({
      type: 'task_completed',
      title: 'Task Completed',
      description: `${user.firstName || 'User'} completed the ${workItem || 'task'}`,
      userId: user.id,
      relatedId: timelog.id
    });

    res.status(201).json({
      success: true,
      data: timelog,
      message: 'Timelog created successfully'
    });
  } catch (error: any) {
    console.error('Error creating timelog:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to create timelog'
    });
  }
};

export const updateTimelog = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    const timelogData = { ...req.body };

    // Convert hours to number if it's present
    if (timelogData.hours !== undefined) {
      timelogData.hours = parseHours(timelogData.hours);
    }

    // Map isBillable if present
    if (timelogData.isBillable !== undefined) {
      timelogData.billableStatus = timelogData.isBillable === false ? 'non_billable' : 'billable';
      delete timelogData.isBillable;
    }

    const timelog = await timelogService.updateTimelog(
      id,
      timelogData,
      user.id,
      user.role
    );

    res.json({
      success: true,
      data: timelog,
      message: 'Timelog updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating timelog:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to update timelog'
    });
  }
};

export const deleteTimelog = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    const result = await timelogService.deleteTimelog(id, user.id, user.role);
    res.json({
      success: true,
      message: 'Timelog deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting timelog:', error);
    res.status(400).json({ error: error.message || 'Failed to delete timelog' });
  }
};

export const getAccessibleClients = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const clients = await timelogService.getAccessibleClients(user.id);
    res.json({
      success: true,
      data: clients,
      message: 'Accessible clients retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching accessible clients:', error);
    res.status(500).json({ error: 'Failed to fetch accessible clients' });
  }
};

export const getAccessibleProjects = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { clientId } = req.query;
    const projects = await timelogService.getAccessibleProjects(
      user.id,
      clientId as string
    );
    res.json({
      success: true,
      data: projects,
      message: 'Accessible projects retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching accessible projects:', error);
    res.status(500).json({ error: 'Failed to fetch accessible projects' });
  }
};

export const getAccessibleJobs = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { projectId } = req.query;
    const jobs = await timelogService.getAccessibleJobs(
      user.id,
      projectId as string
    );
    res.json({
      success: true,
      data: jobs,
      message: 'Accessible jobs retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching accessible jobs:', error);
    res.status(500).json({ error: 'Failed to fetch accessible jobs' });
  }
};

export const exportTimelogsToExcel = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { employeeId, clientId, projectId, jobId, dateFrom, dateTo } = req.query;

    const filters = {
      employeeId: employeeId as string,
      clientId: clientId as string,
      projectId: projectId as string,
      jobId: jobId as string,
      dateFrom: dateFrom as string,
      dateTo: dateTo as string
    };

    let timelogs;

    // Role-based access control for export
    if (['Admin', 'Owner'].includes(user.role)) {
      timelogs = await timelogService.getAllTimelogs(filters);
    } else if (user.role === 'Partner') {
      timelogs = await timelogService.getTimelogsForPartner(user.id, user.email, filters);
    } else if (user.role === 'Manager') {
      timelogs = await timelogService.getTimelogsForManager(user.id, user.email, filters);
    } else {
      // Regular users can only export their own timelogs
      timelogs = await timelogService.getTimelogsByUser(user.id, filters);
    }

    // Create Excel workbook
    const wb = XLSX.utils.book_new();

    // Prepare data for Excel
    const excelData = timelogs.map(timelog => ({
      'Employee ID': timelog.employee.employeeId,
      'Employee Name': `${timelog.employee.firstName} ${timelog.employee.lastName}`,
      'Employee Email': timelog.employee.officeEmail,
      'Reporting Managers': timelog.employee.managers?.map((m: any) => `${m.manager.firstName} ${m.manager.lastName}`).join(", ") || 'N/A',
      'Reporting Partners': timelog.employee.partners?.map((p: any) => `${p.partner.firstName} ${p.partner.lastName}`).join(", ") || 'N/A',
      'Client ID': timelog.job.project.client.clientId,
      'Client Name': timelog.job.project.client.name,
      'Project ID': timelog.job.project.projectId || '',
      'Project Name': timelog.job.project.name,
      'Job ID': timelog.job.jobId,
      'Job Name': timelog.job.name,
      'Combined ID': timelog.combinedId,
      'Description': timelog.description,
      'Hours': timelog.hours,
      'Date': timelog.date.toISOString().split('T')[0],
      'Created Date': timelog.date.toISOString().split('T')[0]
    }));

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(excelData);

    // Set column widths
    const colWidths = [
      { wch: 15 }, // Employee ID
      { wch: 20 }, // Employee Name
      { wch: 25 }, // Employee Email
      { wch: 20 }, // Reporting Manager
      { wch: 20 }, // Reporting Partner
      { wch: 12 }, // Client ID
      { wch: 20 }, // Client Name
      { wch: 12 }, // Project ID
      { wch: 20 }, // Project Name
      { wch: 12 }, // Job ID
      { wch: 20 }, // Job Name
      { wch: 25 }, // Combined ID
      { wch: 30 }, // Description
      { wch: 8 },  // Hours
      { wch: 12 }, // Date
      { wch: 12 }  // Created Date
    ];
    ws['!cols'] = colWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Timesheet Data');

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `timesheet-export-${timestamp}.xlsx`;

    // Write file to buffer
    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', excelBuffer.length);

    // Send file
    res.send(excelBuffer);
  } catch (error) {
    console.error('Error exporting timelogs:', error);
    res.status(500).json({ error: 'Failed to export timelogs' });
  }
};

export const importTimelogsFromExcel = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const file = req.file;

    console.log("🔍 Excel Import - Request received. User:", user?.email, "File:", file ? {
      filename: file.filename,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    } : "MISSING");

    if (!file) {
      return res.status(400).json({ message: 'No file uploaded. Make sure the form-data field name is "file".' });
    }

    // Read Excel file
    const workbook = XLSX.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Check headers for format mismatch
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
    if (!rawData || rawData.length === 0) {
      fs.unlinkSync(file.path);
      return res.status(400).json({ error: 'File is empty' });
    }

    // Normalize helper: replace any dash/en-dash/em-dash variants with a plain hyphen for comparison
    const normalizeDashes = (s: string) => s.replace(/[\u2013\u2014]/g, '-').trim();

    // Actual headers from file (normalized)
    const headers = (rawData[0] || []).map(h => normalizeDashes(String(h)));

    // Required headers (normalized for comparison)
    const requiredHeaders = [
      'Employee Email',
      'Project (Required)',
      'Job (Required)',
      'Date (Required - format: DD-MM-YYYY)',
      'Hours (Required - numeric, e.g., 8.5)',
      'Work Description (Required)'
    ];

    const missingHeaders = requiredHeaders.filter(rh => !headers.includes(normalizeDashes(rh)));
    if (missingHeaders.length > 0) {
      fs.unlinkSync(file.path);
      return res.status(400).json({
        message: `Invalid template format. Missing columns: ${missingHeaders.join(', ')}. Please use the latest downloaded template.`,
        missingHeaders
      });
    }

    // Build a header map: normalized -> original header string (for row value lookup)
    const originalHeaders = (rawData[0] || []).map(h => String(h).trim());
    const headerMap: Record<string, string> = {};
    originalHeaders.forEach(h => {
      headerMap[normalizeDashes(h)] = h;
    });

    // Helper to get a row value using normalized key
    const getCell = (row: any, normalizedKey: string) => row[headerMap[normalizedKey]];

    const data = XLSX.utils.sheet_to_json(worksheet);

    console.log("🔍 Excel Import - Raw Data Count:", data.length);
    if (data.length > 0) {
      console.log("🔍 Excel Import - First Row Preview:", JSON.stringify(data[0], null, 2));
    }

    // Validate and process data
    const timelogsToImport = [];
    const validationErrors = [];

    // Helper to normalize strings for robust lookup
    const normalizeString = (value: any): string => {
      if (value === undefined || value === null) return '';
      return String(value).trim().replace(/\s+/g, ' ');
    };

    // Caches to avoid repeated DB lookups
    const employeeCache = new Map<string, string>();
    const projectCache = new Map<string, string>(); // Name -> ID
    const jobCache = new Map<string, string>();     // "ProjectID|JobName" -> JobID

    for (let i = 0; i < data.length; i++) {
      const row = data[i] as any;
      const rowNum = i + 2;

      let employeeEmail = '';
      let projectName = '';
      let jobName = '';

      try {
        projectName = getCell(row, 'Project (Required)') || '';
        jobName = getCell(row, 'Job (Required)') || '';
        const hoursRaw = getCell(row, 'Hours (Required - numeric, e.g., 8.5)');
        const description = getCell(row, 'Work Description (Required)') || '';
        const dateValue = getCell(row, 'Date (Required - format: DD-MM-YYYY)');
        const billableRaw = getCell(row, 'Billable (Yes/No)') || row['Billable (Yes/No)'];
        employeeEmail = getCell(row, 'Employee Email') || '';

        if (!projectName) throw new Error('Project name is required (Column C: Project (Required))');
        if (!jobName) throw new Error('Job name is required (Column D: Job (Required))');
        if (!hoursRaw && hoursRaw !== 0) throw new Error('Hours is required (Column F)');
        if (!description) throw new Error('Work Description is required (Column G)');
        if (!dateValue) throw new Error('Date is required (Column E: DD-MM-YYYY format)');

        // 1. Resolve target employee
        let targetEmployeeId = user.id;
        let targetEmployeeEmail = user.email;
        const isPrivileged = ['Admin', 'Manager', 'Partner', 'Owner'].includes(user.role);

        if (employeeEmail) {
          const emailKey = normalizeString(employeeEmail).toLowerCase();
          if (isPrivileged) {
            if (employeeCache.has(emailKey)) {
              targetEmployeeId = employeeCache.get(emailKey)!;
              targetEmployeeEmail = emailKey;
            } else {
              const employee = await prisma.employee.findUnique({
                where: { officeEmail: emailKey }
              });
              if (employee) {
                targetEmployeeId = employee.id;
                targetEmployeeEmail = employee.officeEmail;
                employeeCache.set(emailKey, employee.id);
              } else {
                console.error(`❌ Excel Import [Row ${rowNum}] - Employee lookup failed: Email "${employeeEmail}" not found in PostgreSQL`);
                throw new Error(`Employee with email "${employeeEmail}" not found`);
              }
            }
          } else {
            // Regular employee: check if they are trying to log for someone else
            const loggedInEmailKey = normalizeString(user.email).toLowerCase();
            if (emailKey !== loggedInEmailKey) {
              console.error(`❌ Excel Import [Row ${rowNum}] - Permission denied: Employee "${user.email}" tried to log timesheet for "${employeeEmail}"`);
              throw new Error(`You do not have permission to import timesheets for another employee ("${employeeEmail}")`);
            }
          }
        } else {
          // If email is missing, regular employee logs for themselves
          if (!isPrivileged) {
            targetEmployeeEmail = user.email;
          } else {
            console.error(`❌ Excel Import [Row ${rowNum}] - Employee email column is empty for privileged user import`);
            throw new Error('Employee Email is required for administrative import');
          }
        }

        // 2. Resolve Project
        let projectId: string;
        const pNameNorm = normalizeString(projectName);
        if (projectCache.has(pNameNorm)) {
          projectId = projectCache.get(pNameNorm)!;
        } else {
          console.log(`Excel Import [Row ${rowNum}] - Querying project: "${pNameNorm}"`);
          const project = await prisma.project.findFirst({
            where: { name: { equals: pNameNorm, mode: 'insensitive' } }
          });
          if (project) {
            projectId = project.id;
            projectCache.set(pNameNorm, project.id);
          } else {
            console.error(`❌ Excel Import [Row ${rowNum}] - Project lookup failed: "${projectName}" not found in database`);
            throw new Error(`Project "${projectName}" not found`);
          }
        }

        // 3. Verify Employee is assigned to Project (Check ProjectUser table)
        const projectAssignment = await prisma.projectUser.findUnique({
          where: {
            projectId_employeeId: {
              projectId,
              employeeId: targetEmployeeId
            }
          }
        });

        if (!projectAssignment) {
          console.error(`❌ Excel Import [Row ${rowNum}] - Project assignment check failed: Employee "${targetEmployeeEmail}" (ID: ${targetEmployeeId}) is not assigned to Project "${projectName}" (ID: ${projectId})`);
          throw new Error(`Employee is not assigned to project "${projectName}"`);
        }

        // 4. Resolve Job
        let jobId: string;
        const jNameNorm = normalizeString(jobName);
        const jobCacheKey = `${projectId}|${jNameNorm}`;
        if (jobCache.has(jobCacheKey)) {
          jobId = jobCache.get(jobCacheKey)!;
        } else {
          console.log(`🔍 Excel Import [Row ${rowNum}] - Querying job: "${jNameNorm}"`);

          // First, search for the job under the selected project
          const projectJob = await prisma.job.findFirst({
            where: {
              projectId: projectId,
              name: { equals: jNameNorm, mode: 'insensitive' }
            }
          });

          if (projectJob) {
            jobId = projectJob.id;
            jobCache.set(jobCacheKey, projectJob.id);
          } else {
            // Job not found under selected project. Check if it exists globally to give a very detailed error.
            const globalJob = await prisma.job.findFirst({
              where: { name: { equals: jNameNorm, mode: 'insensitive' } },
              include: { project: true }
            });

            if (!globalJob) {
              console.error(`❌ Excel Import [Row ${rowNum}] - Job lookup failed: Job "${jobName}" does not exist globally`);
              throw new Error(`Job "${jobName}" does not exist in the system`);
            }

            console.error(`❌ Excel Import [Row ${rowNum}] - Job-Project mismatch: Job "${jobName}" (ID: ${globalJob.id}) belongs to Project "${globalJob.project.name}" (ID: ${globalJob.projectId}), not the selected Project "${projectName}" (ID: ${projectId})`);
            throw new Error(`Job "${jobName}" belongs to project "${globalJob.project.name}", not to the selected project "${projectName}"`);
          }
        }

        // 5. Verify Employee is assigned to Job (Check JobUser table)
        const jobAssignment = await prisma.jobUser.findUnique({
          where: {
            jobId_employeeId: {
              jobId,
              employeeId: targetEmployeeId
            }
          }
        });

        if (!jobAssignment) {
          console.error(`❌ Excel Import [Row ${rowNum}] - Job assignment check failed: Employee "${targetEmployeeEmail}" (ID: ${targetEmployeeId}) is not assigned to Job "${jobName}" (ID: ${jobId})`);
          throw new Error(`Employee is not assigned to job "${jobName}"`);
        }

        // 6. Parse hours (handles decimal and HH:MM)
        const hours = parseHours(hoursRaw);
        if (hours <= 0 || hours > 24) {
          throw new Error('Hours must be a positive number between 0 and 24');
        }

        // 7. Parse date
        let workDate: Date;
        if (typeof dateValue === 'number') {
          // Excel serial date -> UTC midnight. Add local TZ offset so the date is correct locally.
          const utcMs = Math.round((dateValue - 25569) * 86400 * 1000);
          const localOffset = new Date(utcMs).getTimezoneOffset() * 60 * 1000;
          workDate = new Date(utcMs + localOffset);
        } else {
          const str = String(dateValue).trim();
          // Try parsing DD-MM-YYYY or DD/MM/YYYY
          const dmY = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(str);
          if (dmY) {
            // Use local date constructor to avoid UTC shift
            workDate = new Date(Number(dmY[3]), Number(dmY[2]) - 1, Number(dmY[1]));
          } else if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
            // ISO format YYYY-MM-DD — parse as local date
            const [y, m, d] = str.split('-').map(Number);
            workDate = new Date(y, m - 1, d);
          } else {
            workDate = new Date(str);
          }
        }

        if (isNaN(workDate.getTime())) {
          throw new Error(`Invalid date format: ${dateValue}`);
        }

        if (workDate > new Date()) {
          throw new Error('Cannot log time for future dates');
        }

        // 8. Duplicate detection: check if this employee already has a timelog for the same date and job
        const duplicateLog = await prisma.timelog.findFirst({
          where: {
            employeeId: targetEmployeeId,
            date: workDate,
            jobId: jobId
          }
        });

        if (duplicateLog) {
          console.error(`❌ Excel Import [Row ${rowNum}] - Duplicate detected: Employee "${targetEmployeeEmail}" already has an entry on ${workDate.toISOString().split('T')[0]} for Job "${jobName}"`);
          throw new Error(`Duplicate entry: You have already logged time for job "${jobName}" on ${workDate.toISOString().split('T')[0]}`);
        }

        // 9. Parse billable
        let billableStatus: 'billable' | 'non_billable' | undefined = undefined;
        if (billableRaw) {
          const bs = String(billableRaw).trim().toLowerCase();
          if (bs === 'yes' || bs === 'true') {
            billableStatus = 'billable';
          } else if (bs === 'no' || bs === 'false') {
            billableStatus = 'non_billable';
          }
        }

        timelogsToImport.push({
          row: rowNum,
          employeeId: targetEmployeeId,
          jobId,
          hours,
          description,
          date: workDate.toISOString().split('T')[0],
          ...(billableStatus && { billableStatus })
        });
      } catch (error: any) {
        console.error(`❌ Excel Import [Row ${rowNum}] - Validation failed: ${error.message}. Input row:`, JSON.stringify(row));
        validationErrors.push({
          row: rowNum,
          employee: employeeEmail || "N/A",
          project: projectName || "N/A",
          job: jobName || "N/A",
          error: error.message,
          data: row
        });
      }
    }

    console.log(`🔍 Excel Import - Validated ${timelogsToImport.length} rows, ${validationErrors.length} errors`);
    console.log("IMPORT ERRORS:");
    console.log(JSON.stringify(validationErrors, null, 2));

    // Handle failure case where no valid rows were found
    if (timelogsToImport.length === 0) {
      fs.unlinkSync(file.path);
      const errorDetails = validationErrors.map(e => `Row ${e.row}: ${e.error}`).join('; ');
      return res.status(400).json({
        success: false,
        message: `No valid rows found in the uploaded file. Errors: ${errorDetails}`,
        error: `No valid rows found in the uploaded file. Errors:\n${validationErrors.map(e => `Row ${e.row}: ${e.error}`).join('\n')}`,
        totalRows: data.length,
        validRows: 0,
        validationErrorsCount: validationErrors.length,
        errors: validationErrors
      });
    }

    // Import valid timelogs
    const importResults = await timelogService.bulkCreateTimelogs(timelogsToImport, user.id);

    console.log("🔍 Excel Import - Insert Results:", {
      success: importResults.success.length,
      errors: importResults.errors.length
    });

    if (importResults.errors.length > 0) {
      console.error("❌ Excel Import - Insertion Errors (first 5):", JSON.stringify(importResults.errors.slice(0, 5), null, 2));
    }

    // Clean up uploaded file
    fs.unlinkSync(file.path);

    res.json({
      success: true,
      message: 'Import completed',
      totalRows: data.length,
      validRows: timelogsToImport.length,
      successfulImports: importResults.success.length,
      validationErrorsCount: validationErrors.length,
      importErrorsCount: importResults.errors.length,
      validationErrors,
      importErrors: importResults.errors,
      data: importResults.success
    });
  } catch (error: any) {
    console.error('Error importing timelogs:', error);

    // Clean up uploaded file on error
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('Error cleaning up file:', cleanupError);
      }
    }

    res.status(400).json({
      message: error.message || 'Failed to import timelogs',
      stack: error.stack,
      details: error
    });
  }
};

export const downloadTimelogTemplate = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user || !user.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Fetch user details from database to get official email and ensure role matches
    const dbUser = await prisma.employee.findUnique({
      where: { id: user.id }
    });

    if (!dbUser) {
      return res.status(404).json({ error: 'Logged in employee not found' });
    }

    const loginEmail = dbUser.officeEmail;
    const role = dbUser.role?.toUpperCase();
    const isAdmin = role === 'ADMIN' || role === 'OWNER';

    let clientNames: string[] = [];
    let projectNames: string[] = [];
    let jobNames: string[] = [];

    if (isAdmin) {
      const dbClients = await prisma.client.findMany({
        where: { status: { in: ['Active', 'Started'] } },
        select: { name: true },
        orderBy: { name: 'asc' }
      });
      clientNames = dbClients.map(c => c.name);

      const dbProjects = await prisma.project.findMany({
        where: { status: { in: ['Active', 'Started'] } },
        select: { name: true },
        orderBy: { name: 'asc' }
      });
      projectNames = dbProjects.map(p => p.name);

      const dbJobs = await prisma.job.findMany({
        where: { status: { in: ['Active', 'Started'] } },
        select: { name: true },
        orderBy: { name: 'asc' }
      });
      jobNames = dbJobs.map(j => j.name);
    } else if (role === 'PARTNER' || role === 'MANAGER') {
      const dbClients = await prisma.client.findMany({
        where: {
          status: { in: ['Active', 'Started'] },
          OR: [
            { createdBy: dbUser.id },
            { partnerId: dbUser.id },
            { projects: { some: { createdBy: dbUser.id } } },
            { projects: { some: { managerId: dbUser.id } } },
            { projects: { some: { partnerId: dbUser.id } } },
            { projects: { some: { users: { some: { employeeId: dbUser.id } } } } }
          ]
        },
        select: { name: true },
        orderBy: { name: 'asc' }
      });
      clientNames = dbClients.map(c => c.name);

      const dbProjects = await prisma.project.findMany({
        where: {
          status: { in: ['Active', 'Started'] },
          OR: [
            { createdBy: dbUser.id },
            { managerId: dbUser.id },
            { partnerId: dbUser.id },
            { users: { some: { employeeId: dbUser.id } } },
            { jobs: { some: { users: { some: { employeeId: dbUser.id } } } } }
          ]
        },
        select: { name: true },
        orderBy: { name: 'asc' }
      });
      projectNames = dbProjects.map(p => p.name);

      const dbJobs = await prisma.job.findMany({
        where: {
          status: { in: ['Active', 'Started'] },
          OR: [
            { createdBy: dbUser.id },
            { users: { some: { employeeId: dbUser.id } } },
            { project: { createdBy: dbUser.id } },
            { project: { managerId: dbUser.id } },
            { project: { partnerId: dbUser.id } },
            { project: { users: { some: { employeeId: dbUser.id } } } },
            { project: { client: { createdBy: dbUser.id } } },
            { project: { client: { partnerId: dbUser.id } } }
          ]
        },
        select: { name: true },
        orderBy: { name: 'asc' }
      });
      jobNames = dbJobs.map(j => j.name);
    } else {
      // Regular employee — fetch via direct assignment OR timelogs already logged
      // Fallback via jobs.timelogs since Project has no direct timelogs relation in schema
      const assignedProjectIds = await prisma.timelog.findMany({
        where: { employeeId: dbUser.id },
        select: { projectId: true },
        distinct: ['projectId']
      });
      const fallbackProjectIds = assignedProjectIds.map(t => t.projectId);

      const dbProjects = await prisma.project.findMany({
        where: {
          status: { in: ['Active', 'Started'] },
          OR: [
            { users: { some: { employeeId: dbUser.id } } },
            { jobs: { some: { users: { some: { employeeId: dbUser.id } } } } },
            // Fallback: projects where the employee has already logged time
            { id: { in: fallbackProjectIds } }
          ]
        },
        select: {
          name: true,
          client: {
            select: { name: true }
          }
        },
        orderBy: { name: 'asc' }
      });
      projectNames = dbProjects.map(p => p.name);
      clientNames = Array.from(new Set(dbProjects.map(p => p.client?.name).filter(Boolean) as string[]));

      const dbJobs = await prisma.job.findMany({
        where: {
          status: { in: ['Active', 'Started'] },
          OR: [
            { users: { some: { employeeId: dbUser.id } } },
            { project: { users: { some: { employeeId: dbUser.id } } } },
            // Fallback: jobs where the employee has already logged time
            { timelogs: { some: { employeeId: dbUser.id } } }
          ]
        },
        select: { name: true },
        orderBy: { name: 'asc' }
      });
      jobNames = dbJobs.map(j => j.name);
    }

    // Clean, deduplicate and sort lists
    clientNames = Array.from(new Set(clientNames)).filter(Boolean).sort();
    projectNames = Array.from(new Set(projectNames)).filter(Boolean).sort();
    jobNames = Array.from(new Set(jobNames)).filter(Boolean).sort();

    // Ensure non-empty fallbacks to prevent Excel validation formula error
    if (clientNames.length === 0) clientNames = ['No Assigned Client'];
    if (projectNames.length === 0) projectNames = ['No Assigned Project'];
    if (jobNames.length === 0) jobNames = ['No Assigned Job'];

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Timesheet Template', {
      views: [{ state: 'frozen', ySplit: 1 }]
    });

    // Define columns on the main sheet
    worksheet.columns = [
      { header: 'Employee Email', key: 'employeeEmail', width: 25 },
      { header: 'Client', key: 'client', width: 25 },
      { header: 'Project (Required)', key: 'project', width: 30 },
      { header: 'Job (Required)', key: 'job', width: 25 },
      { header: 'Date (Required – format: DD-MM-YYYY)', key: 'date', width: 35 },
      { header: 'Hours (Required – numeric, e.g., 8.5)', key: 'hours', width: 35 },
      { header: 'Work Description (Required)', key: 'description', width: 45 },
      { header: 'Billable (Yes/No)', key: 'billable', width: 20 }
    ];

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Create reference worksheet for lists
    const listsSheet = workbook.addWorksheet('Lists', {
      state: 'hidden'
    });

    // Write headers and data to hidden lists sheet
    listsSheet.addRow(['Clients', 'Projects', 'Jobs']);
    const maxRows = Math.max(clientNames.length, projectNames.length, jobNames.length);
    for (let r = 0; r < maxRows; r++) {
      listsSheet.addRow([
        clientNames[r] || '',
        projectNames[r] || '',
        jobNames[r] || ''
      ]);
    }

    // Add sample row with actual login email and assigned details
    worksheet.addRow({
      employeeEmail: loginEmail,
      client: clientNames[0],
      project: projectNames[0],
      job: jobNames[0],
      date: new Date().toLocaleDateString('en-GB').replace(/\//g, '-'),
      hours: 8.0,
      description: 'Worked on assigned tasks',
      billable: 'Yes'
    });

    // Add Data Validation for 100 rows
    for (let i = 2; i <= 100; i++) {
      // Client Dropdown
      worksheet.getCell(`B${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`='Lists'!$A$2:$A$${clientNames.length + 1}`]
      };

      // Project Dropdown
      worksheet.getCell(`C${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`='Lists'!$B$2:$B$${projectNames.length + 1}`]
      };

      // Job Dropdown
      worksheet.getCell(`D${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`='Lists'!$C$2:$C$${jobNames.length + 1}`]
      };

      // Billable Dropdown
      worksheet.getCell(`H${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Yes,No"']
      };

      // Hours Numeric Validation
      worksheet.getCell(`F${i}`).dataValidation = {
        type: 'decimal',
        operator: 'between',
        allowBlank: true,
        showErrorMessage: true,
        formulae: [0.1, 24],
        errorStyle: 'error',
        errorTitle: 'Invalid Hours',
        error: 'Please enter a numeric value between 0.1 and 24.'
      };
    }

    // Generate filename
    const filename = 'Timesheet_Template.xlsx';

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Write file directly to response stream
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error downloading template:', error);
    res.status(500).json({ error: 'Failed to download template' });
  }
};

// NEW: Timesheet Reports and Dashboard endpoints
export const getTimesheetReports = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { employeeId, clientId, projectId, jobId, dateFrom, dateTo } = req.query;

    const filters = {
      employeeId: employeeId as string,
      clientId: clientId as string,
      projectId: projectId as string,
      jobId: jobId as string,
      dateFrom: dateFrom as string,
      dateTo: dateTo as string
    };

    const reports = await timelogService.getTimesheetReports(
      user.id,
      user.email,
      user.role,
      filters
    );

    res.json({
      success: true,
      data: reports,
      message: 'Timesheet reports generated successfully'
    });
  } catch (error) {
    console.error('Error generating timesheet reports:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate timesheet reports'
    });
  }
};

export const getMissingTimesheets = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { dateFrom, dateTo } = req.query;

    if (!dateFrom || !dateTo) {
      return res.status(400).json({
        error: 'Missing required parameters',
        required: ['dateFrom', 'dateTo']
      });
    }

    const missingTimesheets = await timelogService.getMissingTimesheets(
      user.email,
      user.role,
      dateFrom as string,
      dateTo as string
    );

    res.json({
      success: true,
      data: missingTimesheets,
      message: 'Missing timesheets retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching missing timesheets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch missing timesheets'
    });
  }
};


export const submitTimelog = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    await timelogService.submitTimelog(id, user.id);
    res.json({ success: true, message: 'Timelog submitted successfully' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || 'Failed to submit' });
  }
};

export const getMyTimelogs = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { employeeId, clientId, projectId, jobId, dateFrom, dateTo } = req.query;

    if (!user || !user.id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const filters = {
      employeeId: employeeId as string,
      clientId: clientId as string,
      projectId: projectId as string,
      jobId: jobId as string,
      dateFrom: dateFrom as string,
      dateTo: dateTo as string
    };

    const timelogs = await timelogService.getTimelogsByUser(user.id, filters);

    res.json({
      success: true,
      data: timelogs || [],
      message: 'My timelogs retrieved successfully'
    });
  } catch (error: any) {
    console.error('Error fetching my timelogs:', error);
    res.status(500).json({ message: 'Failed to fetch my timelogs', error: error.message });
  }
};

export const getTeamTimelogs = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { employeeId, clientId, projectId, jobId, dateFrom, dateTo } = req.query;

    if (!user || !user.role || user.role === 'Employee') {
      return res.status(403).json({ message: 'Forbidden. Non-employees only.' });
    }

    const filters = {
      employeeId: employeeId as string,
      clientId: clientId as string,
      projectId: projectId as string,
      jobId: jobId as string,
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      status: req.query.status as string
    };

    let timelogs;
    if (['Admin', 'Owner'].includes(user.role)) {
      timelogs = await timelogService.getAllTimelogs({ ...filters, view: 'team' });
    } else if (user.role === 'Partner') {
      console.log('Fetching timelogs for partner:', user.id, user.email);
      timelogs = await timelogService.getTimelogsForPartner(user.id, user.email, { ...filters, view: 'team' });
    } else {
      console.log('Fetching timelogs for manager:', user.id, user.email);
      timelogs = await timelogService.getTimelogsForManager(user.id, user.email, { ...filters, view: 'team' });
    }
    // Process to include requested fields
    const mappedTimelogs = (timelogs || []).map((t: any) => {
      const isManager =
        t.employee?.managers?.some((m: any) => m.managerId === user.id) ||
        t.job?.project?.managerId === user.id;

      const isPartner =
        t.employee?.partners?.some((p: any) => p.partnerId === user.id) ||
        t.job?.project?.partnerId === user.id ||
        t.job?.project?.client?.partnerId === user.id;

      return {
        ...t,
        managerId: t.employee?.managers?.[0]?.managerId || t.job?.project?.managerId,
        partnerId: t.employee?.partners?.[0]?.partnerId || t.job?.project?.partnerId || t.job?.project?.client?.partnerId,
        isTeamMember: isManager || isPartner || ['Admin', 'Owner'].includes(user.role)
      };
    });

    res.json({
      success: true,
      data: mappedTimelogs,
      message: 'Team timelogs retrieved successfully'
    });
  } catch (error: any) {
    console.error('Error fetching team timelogs:', error);
    res.status(500).json({ message: 'Failed to fetch team timelogs', error: error.message });
  }
};

export const approveTimelogHandler = async (req: Request, res: Response) => {
  const user = (req as any).user;
  try {
    const { id } = req.params;

    console.log(`[CONTROLLER_APPROVE] - Request received:`, {
      timelogId: id,
      userId: user?.id,
      userEmail: user?.email,
      userRole: user?.role,
      timestamp: new Date().toISOString()
    });

    // Enhanced role validation
    if (!user) {
      console.error(`[CONTROLLER_APPROVE] - No user found in request`);
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
        message: 'Please login to continue'
      });
    }

    if (['Employee', 'employee'].includes(user.role)) {
      console.error(`[CONTROLLER_APPROVE] - Employee role not authorized: ${user.email}`);
      return res.status(403).json({
        success: false,
        error: 'User not authorized to approve timesheets',
        message: 'Employees cannot approve timesheets'
      });
    }

    // Validate timelog ID format
    if (!id || typeof id !== 'string') {
      console.error(`[CONTROLLER_APPROVE] - Invalid timelog ID: ${id}`);
      return res.status(400).json({
        success: false,
        error: 'Invalid timelog ID',
        message: 'Timelog ID is required and must be valid'
      });
    }

    const updated = await timelogService.approveTimelog(id, user.id);

    console.log(`[CONTROLLER_APPROVE] - Success:`, {
      timelogId: id,
      approvedBy: user.email,
      newStatus: updated.submissionStatus
    });

    res.json({
      success: true,
      data: updated,
      message: 'Timesheet approved successfully'
    });
  } catch (error: any) {
    console.error(`[CONTROLLER_APPROVE_ERROR] - Details:`, {
      timelogId: req.params.id,
      userId: user?.id,
      userEmail: user?.email,
      userRole: user?.role,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    // Return specific error messages based on error type
    let statusCode = 400;
    let errorMessage = error.message || 'Failed to approve timesheet';

    if (error.message.includes('not found')) {
      statusCode = 404;
      errorMessage = 'Timesheet not found';
    } else if (error.message.includes('not authorized')) {
      statusCode = 403;
      errorMessage = 'You are not authorized to approve this timesheet';
    } else if (error.message.includes('not in submitted state')) {
      statusCode = 400;
      errorMessage = 'Only submitted timesheets can be approved';
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      message: errorMessage
    });
  }
};

export const rejectTimelogHandler = async (req: Request, res: Response) => {
  const user = (req as any).user;
  try {
    const { id } = req.params;
    const { reason } = req.body;

    console.log(`[CONTROLLER_REJECT] - Request received:`, {
      timelogId: id,
      userId: user?.id,
      userEmail: user?.email,
      userRole: user?.role,
      reason: reason,
      timestamp: new Date().toISOString()
    });

    // Enhanced validation
    if (!user) {
      console.error(`[CONTROLLER_REJECT] - No user found in request`);
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
        message: 'Please login to continue'
      });
    }

    if (['Employee', 'employee'].includes(user.role)) {
      console.error(`[CONTROLLER_REJECT] - Employee role not authorized: ${user.email}`);
      return res.status(403).json({
        success: false,
        error: 'User not authorized to reject timesheets',
        message: 'Employees cannot reject timesheets'
      });
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      console.error(`[CONTROLLER_REJECT] - Invalid or missing rejection reason: ${reason}`);
      return res.status(400).json({
        success: false,
        error: 'Rejection reason is required',
        message: 'Please provide a valid reason for rejection'
      });
    }

    const updated = await timelogService.rejectTimelog(id, user.id, reason);

    console.log(`[CONTROLLER_REJECT] - Success:`, {
      timelogId: id,
      rejectedBy: user.email,
      newStatus: updated.submissionStatus,
      rejectionReason: reason
    });

    res.json({
      success: true,
      data: updated,
      message: 'Timesheet rejected successfully'
    });
  } catch (error: any) {
    console.error(`[CONTROLLER_REJECT_ERROR] - Details:`, {
      timelogId: req.params.id,
      userId: user?.id,
      userEmail: user?.email,
      userRole: user?.role,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    // Return specific error messages based on error type
    let statusCode = 400;
    let errorMessage = error.message || 'Failed to reject timesheet';

    if (error.message.includes('not found')) {
      statusCode = 404;
      errorMessage = 'Timesheet not found';
    } else if (error.message.includes('not authorized')) {
      statusCode = 403;
      errorMessage = 'You are not authorized to reject this timesheet';
    } else if (error.message.includes('not in submitted state')) {
      statusCode = 400;
      errorMessage = 'Only submitted timesheets can be rejected';
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      message: errorMessage
    });
  }
};

export const bulkApproveHandler = async (req: Request, res: Response) => {
  const user = (req as any).user;
  try {
    if (!user) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    if (['Employee', 'employee'].includes(user.role)) {
      return res.status(403).json({ success: false, error: 'Employees cannot approve timesheets' });
    }

    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'ids must be a non-empty array of timelog IDs' });
    }

    console.log(`[BULK_APPROVE_CONTROLLER] - User: ${user.email}, IDs: ${ids.length}`);

    const result = await timelogService.bulkApproveTimelogs(ids, user.id);

    res.json({
      success: true,
      data: result,
      message: result.message
    });
  } catch (error: any) {
    console.error('[BULK_APPROVE_ERROR]', error.message);
    res.status(400).json({ success: false, message: error.message || 'Bulk approve failed' });
  }
};

export const bulkRejectHandler = async (req: Request, res: Response) => {
  const user = (req as any).user;
  try {
    if (!user) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    if (['Employee', 'employee'].includes(user.role)) {
      return res.status(403).json({ success: false, error: 'Employees cannot reject timesheets' });
    }

    const { ids, reason } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'ids must be a non-empty array of timelog IDs' });
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Rejection reason is required for bulk rejection' });
    }

    console.log(`[BULK_REJECT_CONTROLLER] - User: ${user.email}, IDs: ${ids.length}, Reason: ${reason}`);

    const result = await timelogService.bulkRejectTimelogs(ids, user.id, reason);

    res.json({
      success: true,
      data: result,
      message: result.message
    });
  } catch (error: any) {
    console.error('[BULK_REJECT_ERROR]', error.message);
    res.status(400).json({ success: false, message: error.message || 'Bulk reject failed' });
  }
};

export const bulkSubmitHandler = async (req: Request, res: Response) => {
  const user = (req as any).user;
  try {
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'ids must be a non-empty array of timelog IDs' });
    }

    console.log(`[BULK_SUBMIT_CONTROLLER] - User: ${user.email}, IDs: ${ids.length}`);

    const result = await timelogService.bulkSubmitTimelogs(ids, user.id);

    res.json({
      success: true,
      data: result,
      message: result.message
    });
  } catch (error: any) {
    console.error('[BULK_SUBMIT_ERROR]', error.message);
    res.status(400).json({ success: false, message: error.message || 'Bulk submission failed' });
  }
};
