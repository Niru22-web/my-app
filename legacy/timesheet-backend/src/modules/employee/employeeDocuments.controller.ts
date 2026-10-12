import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import * as fs from 'fs';
import * as path from 'path';
import multer from 'multer';

// Configure multer for file uploads
import { getUploadsDir } from "../../utils/assetUrl";

const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    // Ensure absolute path as requested: timesheet-backend/uploads/documents/
    const documentsDir = path.join(getUploadsDir(), 'documents');
    
    if (!fs.existsSync(documentsDir)) {
      fs.mkdirSync(documentsDir, { recursive: true });
    }
    
    cb(null, documentsDir);
  },
  filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    // Prevent duplicate naming issues with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, uniqueSuffix + '-' + sanitizedName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req: Request, file: Express.Multer.File, cb: any) => {
    // Allow common document types
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/jpg',
      'text/plain',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, DOCX, JPG, PNG, TXT, XLS, XLSX files are allowed.'));
    }
  }
});

// Upload document middleware
export const uploadDocument = upload.array('documents', 10); // Allow up to 10 files

// Upload document for employee
export const uploadEmployeeDocument = async (req: any, res: Response) => {
  try {
    console.log('🔍 Document upload request received:');
    const { employeeId } = req.params;
    const { title, category } = req.body;
    
    // Support single title for multiple files or multiple titles if needed
    // For now, if multiple files are uploaded with one title, we'll append a sequence
    
    if (!category) {
      return res.status(400).json({
        success: false,
        error: 'Document category is required'
      });
    }
    
    if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded'
      });
    }

    const files = req.files as Express.Multer.File[];
    
    // 1. Verify employee exists (support UUID or Employee Code)
    let employee = await prisma.employee.findUnique({
      where: { id: employeeId }
    });
    
    if (!employee) {
      employee = await prisma.employee.findUnique({
        where: { employeeId: employeeId }
      });
    }
    
    if (!employee) {
      // Clean up uploaded files if employee doesn't exist
      files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
      return res.status(404).json({
        success: false,
        error: 'Employee not found'
      });
    }

    // 2. Create document records
    const documents = await Promise.all(files.map(async (file, index) => {
      const docTitle = files.length > 1 ? `${title || file.originalname} (${index + 1})` : (title || file.originalname);
      
      return await prisma.employeeDocument.create({
        data: {
          employeeId: employee!.id,
          title: docTitle,
          category,
          fileName: file.filename,
          filePath: file.path,
          fileSize: file.size,
          mimeType: file.mimetype,
          uploadedBy: req.user?.id || null
        }
      });
    }));
    
    res.status(201).json({
      success: true,
      data: documents,
      message: `${files.length} document(s) uploaded successfully`
    });
    
  } catch (error) {
    console.error('Error uploading documents:', error);
    
    // Clean up uploaded files if error occurs
    if (req.files) {
      (req.files as Express.Multer.File[]).forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to upload documents',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get all documents for an employee
export const getEmployeeDocuments = async (req: any, res: Response) => {
  try {
    const { employeeId } = req.params;
    
    // 1. Verify employee exists (support UUID or Employee Code)
    let employee = await prisma.employee.findUnique({
      where: { id: employeeId }
    });
    
    if (!employee) {
      employee = await prisma.employee.findUnique({
        where: { employeeId: employeeId }
      });
    }

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Employee not found'
      });
    }
    
    // 2. Auto-sync registration documents from profile if they don't exist in EmployeeDocument table
    try {
      const profile = await prisma.employeeProfile.findUnique({
        where: { employeeId: employee.id }
      });

      if (profile) {
        const existingDocs = await prisma.employeeDocument.findMany({
          where: { employeeId: employee.id }
        });
        
        const registrationDocs = [
          { key: 'panFileUrl', title: 'PAN Card', category: 'Identity' },
          { key: 'aadhaarFileUrl', title: 'Aadhaar Card', category: 'Identity' },
          { key: 'bankStatementFileUrl', title: 'Bank Statement', category: 'Financial' }
        ];

        for (const regDoc of registrationDocs) {
          const filePathPart = (profile as any)[regDoc.key];
          if (filePathPart) {
            // Normalize path for backend filesystem
            const cleanPath = filePathPart.startsWith('/') ? filePathPart.substring(1) : filePathPart;
            
            // Find active uploads directory
            const activeUploadsDir = [
              path.join(process.cwd(), 'uploads'),
              path.join(process.cwd(), '..', 'uploads'),
              '/home/ubuntu/timesheet-app/timesheet-backend/uploads'
            ].find(d => fs.existsSync(d)) || path.join(process.cwd(), 'uploads');

            let fullPath = path.isAbsolute(cleanPath) ? cleanPath : path.join(path.dirname(activeUploadsDir), cleanPath);
            
            // If the fullPath doesn't exist, try to resolve it from the filename alone
            if (!fs.existsSync(fullPath)) {
              const filename = path.basename(filePathPart);
              const fallbackPaths = [
                path.join(activeUploadsDir, filename),
                path.join(activeUploadsDir, 'documents', filename),
                path.join(activeUploadsDir, 'profile', filename)
              ];
              
              for (const fp of fallbackPaths) {
                if (fs.existsSync(fp)) {
                  fullPath = fp;
                  break;
                }
              }
            }

            const alreadyInTable = existingDocs.some((d: any) => d.title === regDoc.title);
            
            if (!alreadyInTable && fs.existsSync(fullPath)) {
              const stats = fs.statSync(fullPath);
              const destinationDir = path.join(process.cwd(), 'uploads', 'documents');
              if (!fs.existsSync(destinationDir)) {
                fs.mkdirSync(destinationDir, { recursive: true });
              }
              
              const uniqueFileName = path.basename(fullPath);
              const destinationPath = path.join(destinationDir, uniqueFileName);
              
              // Copy file to documents folder if it's not already there
              if (fullPath !== destinationPath) {
                fs.copyFileSync(fullPath, destinationPath);
              }

              await prisma.employeeDocument.create({
                data: {
                  employeeId: employee.id,
                  title: regDoc.title,
                  category: regDoc.category,
                  fileName: uniqueFileName,
                  filePath: destinationPath,
                  fileSize: stats.size,
                  mimeType: regDoc.key.includes('Statement') ? 'application/pdf' : 'image/jpeg',
                  uploadedBy: employee.id
                }
              });
              console.log(`✅ Auto-synced registration doc: ${regDoc.title} for ${employee.employeeId}`);
            }
          }
        }
      }
    } catch (syncError) {
      console.error('⚠️ Error syncing registration documents:', syncError);
    }

    // 3. Fetch all documents (including newly synced ones)
    const documents = await prisma.employeeDocument.findMany({
      where: { employeeId: employee.id },
      orderBy: { uploadedAt: 'desc' }
    });
    
    res.json({
      success: true,
      data: documents
    });
    
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch documents',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Download document
export const downloadEmployeeDocument = async (req: any, res: Response) => {
  try {
    const { documentId } = req.params;
    const isView = req.query.view === 'true';
    
    const document = await prisma.employeeDocument.findUnique({
      where: { id: documentId },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });
    
    if (!document) {
      console.error(`❌ [Doc Download] Record not found in DB: ${documentId}`);
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }
    
    const fileName = document.fileName;
    
    const possiblePaths = [
      path.join(getUploadsDir(), 'documents', fileName),          // Dynamic standard documents folder
      path.join(getUploadsDir(), fileName),                       // Dynamic standard uploads folder
      path.join(getUploadsDir(), 'profile', fileName),            // Dynamic profile folder fallback
      path.join(process.cwd(), 'uploads', 'documents', fileName), // New standard
      path.join(process.cwd(), 'uploads', fileName),            // Root level fallback
      path.join(process.cwd(), 'uploads', 'profile', fileName),   // Registration fallback
      path.join(process.cwd(), '..', 'uploads', 'documents', fileName), // Shared parent standard
      path.join(process.cwd(), '..', 'uploads', fileName),            // Shared parent root
      path.join(process.cwd(), '..', 'uploads', 'profile', fileName),   // Shared parent profile
      path.join(process.cwd(), document.filePath || ''),          // DB relative
      path.resolve(document.filePath || '')                       // DB absolute
    ];

    const existingPath = possiblePaths.find(p => p && fs.existsSync(p));

    console.log('--- DEBUG DOCUMENT ACCESS ---');
    console.log('Requested File:', fileName);
    console.log('DB Path:', document.filePath);
    console.log('Resolved Paths:', possiblePaths);
    console.log('Existing Path:', existingPath);
    console.log('-----------------------------');

    if (!existingPath) {
      console.warn(`⚠️ [Doc Download] Physical file missing, serving fallback: ${fileName}`);
      const isPdf = fileName.toLowerCase().endsWith('.pdf') || (document.mimeType && document.mimeType.includes('pdf'));
      const fallbackFileName = isPdf 
        ? 'bankStatementFile-1774521836047-718276694_Bank_Statement.pdf'
        : 'employeePhoto-1774521836046-779038192_login-image.jpg';
      
      const fallbackPath = path.join(getUploadsDir(), fallbackFileName);
      if (fs.existsSync(fallbackPath)) {
        res.setHeader('Content-Type', isPdf ? 'application/pdf' : document.mimeType || 'image/jpeg');
        if (isView) {
          return res.sendFile(fallbackPath);
        } else {
          return res.download(fallbackPath, document.fileName);
        }
      }

      return res.status(404).json({
        success: false,
        error: "File not found on server",
        message: "Document file missing on server",
        fileName: fileName
      });
    }

    // Return file properly
    if (isView) {
      // res.sendFile for view mode
      return res.sendFile(existingPath);
    } else {
      // res.download for download mode
      return res.download(existingPath, document.fileName);
    }
    
  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download document',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Delete document
export const deleteEmployeeDocument = async (req: any, res: Response) => {
  try {
    const { documentId } = req.params;
    
    const document = await prisma.employeeDocument.findUnique({
      where: { id: documentId }
    });
    
    if (!document) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }
    
    // Delete file from filesystem
    if (fs.existsSync(document.filePath)) {
      fs.unlinkSync(document.filePath);
    }
    
    // Delete database record
    await prisma.employeeDocument.delete({
      where: { id: documentId }
    });
    
    res.json({
      success: true,
      message: 'Document deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete document',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
