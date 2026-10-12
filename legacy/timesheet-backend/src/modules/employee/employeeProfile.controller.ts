import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import bcrypt from "bcrypt";
import multer from "multer";
import path from "path";
import * as fs from 'fs';
import { markTokenAsUsed } from "./registrationToken.controller";
import { logActivity } from "../activity/activity.service";
import { Prisma } from "@prisma/client";
import { toAbsoluteAssetUrl, normalizeProfileAssetUrls } from "../../utils/assetUrl";

const uploadRoot = path.join(process.cwd(), "uploads");

import { getUploadsDir } from "../../utils/assetUrl";

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = file.fieldname === "profilePhoto" ? "profile" : "documents";
    const dest = path.join(getUploadsDir(), folder);
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    // Standardize naming: profilePhoto-timestamp-originalName (without spaces)
    const uniqueName = "profilePhoto-" + Date.now() + "-" + file.originalname.replace(/\s+/g, "_");
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Enhanced file type validation with better error handling
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    // Special validation for profile image (images only)
    if (file.fieldname === 'profilePhoto') {
      const imageTypes = /jpeg|jpg|png|webp/; // Added webp as requested
      const isImage = imageTypes.test(path.extname(file.originalname).toLowerCase()) &&
        imageTypes.test(file.mimetype);

      if (isImage) {
        return cb(null, true);
      } else {
        return cb(new Error('Employee photo must be a valid image file (JPG, JPEG, PNG, WEBP)'));
      }
    }

    // For other files (PAN, Aadhaar, Bank Statement)
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only JPEG, JPG, PNG, WEBP and PDF files are Allowed'));
    }
  }
});

export const completeEmployeeProfile = async (req: any, res: Response) => {
  try {
    console.log('=== Profile Completion Request ===');
    console.log('Request body keys:', Object.keys(req.body));
    console.log('Request files:', req.files ? Object.keys(req.files) : 'No files');

    // Log complete request body for debugging
    console.log('Complete request body:');
    Object.entries(req.body).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    // Log uploaded files details
    if (req.files) {
      console.log('Uploaded files details:');
      const files = req.files as Record<string, any[]>;
      Object.entries(files).forEach(([key, fileArray]) => {
        console.log(`  ${key}: ${fileArray.length} file(s)`);
        fileArray.forEach((file: any, index: number) => {
          console.log(`    File ${index + 1}: ${file.originalname} (${file.size} bytes)`);
        });
      });
    }

    const authHeader = req.headers.authorization as string | undefined;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
    const headerToken = (req.headers['x-registration-token'] as string | undefined)?.trim();
    const bodyToken = typeof req.body.token === 'string' ? req.body.token.trim() : '';
    const token = bodyToken || headerToken || bearerToken || '';
    const { email, password } = req.body;

    // Validate required fields with comprehensive checking
    console.log('=== Validating Required Fields ===');

    const requiredFields: { key: string; label: string }[] = [
      { key: 'password', label: 'Password' },
      { key: 'dob', label: 'Date of birth' },
      { key: 'doj', label: 'Date of joining' },
      { key: 'gender', label: 'Gender' },
      { key: 'maritalStatus', label: 'Marital status' },
      { key: 'education', label: 'Education' },
      { key: 'currentAddress', label: 'Current address' },
      { key: 'permanentAddress', label: 'Permanent address' },
      { key: 'pan', label: 'PAN number' },
      { key: 'aadhaar', label: 'Aadhaar number' }
    ];

    // Optional fields that should be validated if provided but not required
    const optionalFields = {
      currentPinCode: 'PIN code',
      guardianName: 'Guardian name',
      guardianNumber: 'Guardian number',
      guardianAddress: 'Guardian address',
      personalEmail: 'Personal email',
      personalMobile: 'Personal mobile',
      bankName: 'Bank name',
      accountHolderName: 'Account holder name',
      bankAccountNumber: 'Bank account number',
      ifscCode: 'IFSC code',
      branchName: 'Branch name'
    };

    const missingFields: string[] = [];

    // Check each required field
    requiredFields.forEach(({ key, label }) => {
      const value = req.body[key];
      if (!value || (typeof value === 'string' && value.trim() === '')) {
        console.error(`Missing required field: ${key} (${label})`);
        missingFields.push(label);
      } else {
        console.log(`Valid ${label}: ${value}`);
      }
    });

    // Log optional fields (for debugging)
    console.log('=== Checking Optional Fields ===');
    Object.entries(optionalFields).forEach(([fieldKey, fieldName]) => {
      const value = req.body[fieldKey];
      if (value && typeof value === 'string' && value.trim() !== '') {
        console.log(`✓ Optional ${fieldName}: ${value}`);
      } else {
        console.log(`- Optional ${fieldName}: not provided or empty`);
      }
    });

    // Log bank details specifically
    console.log('=== Bank Details Received ===');
    console.log('Bank Name:', req.body.bankName || 'Not provided');
    console.log('Account Holder Name:', req.body.accountHolderName || 'Not provided');
    console.log('Bank Account Number:', req.body.bankAccountNumber || 'Not provided');
    console.log('IFSC Code:', req.body.ifscCode || 'Not provided');
    console.log('Branch Name:', req.body.branchName || 'Not provided');

    // Return detailed error if any required fields are missing
    if (missingFields.length > 0) {
      console.error('❌ Missing required fields:', missingFields);
      return res.status(400).json({
        success: false,
        error: 'REQUIRED_FIELDS_MISSING',
        missingFields: missingFields,
        message: `Please provide the following required fields: ${missingFields.join(', ')}`,
        details: 'These fields are required to complete your registration'
      });
    }

    // Validate token or email presence
    if (!token && !email) {
      console.error('❌ Neither token nor email provided');
      return res.status(400).json({
        success: false,
        error: 'TOKEN_MISSING',
        message: 'Registration token is required. Please check your registration link or contact support.',
        details: 'Token should be provided in request body as "token" field'
      });
    }

    // Enhanced token validation
    if (!token) {
      console.error('❌ Token missing from request');
      return res.status(400).json({
        success: false,
        error: 'TOKEN_REQUIRED',
        message: 'Registration token is required to complete registration.',
        details: 'Please use the registration link sent to your email'
      });
    }

    // Enhanced password validation
    if (!password) {
      console.error('❌ Password missing from request');
      return res.status(400).json({
        success: false,
        error: 'PASSWORD_REQUIRED',
        message: 'Password is required to complete registration.',
        details: 'Please provide a password with at least 8 characters'
      });
    }

    if (typeof password === 'string' && password.length < 8) {
      console.error('❌ Password too short:', password.length, 'characters');
      return res.status(400).json({
        success: false,
        error: 'PASSWORD_TOO_SHORT',
        message: 'Password must be at least 8 characters long.',
        details: 'Current password length: ' + password.length + ' characters'
      });
    }

    // Check for confirmPassword if provided
    const confirmPassword = req.body.confirmPassword;
    if (confirmPassword && password !== confirmPassword) {
      console.error('❌ Passwords do not match');
      return res.status(400).json({
        success: false,
        error: 'PASSWORD_MISMATCH',
        message: 'Password and confirm password do not match.',
        details: 'Please ensure both passwords are identical'
      });
    }

    // Validate date formats
    console.log('=== Validating Date Formats ===');
    const validateDateFormat = (dateString: string, fieldName: string) => {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return res.status(400).json({ error: `Invalid ${fieldName} format. Please provide a valid date.` });
      }
    };

    const dobValidation = validateDateFormat(req.body.dob, 'date of birth');
    if (dobValidation) return dobValidation;

    const dojValidation = validateDateFormat(req.body.doj, 'date of joining');
    if (dojValidation) return dojValidation;

    // Validate bank details if provided
    console.log('=== Validating Bank Details ===');
    if (req.body.bankName && typeof req.body.bankName === 'string' && req.body.bankName.trim() === '') {
      return res.status(400).json({ error: 'Bank name cannot be empty if provided' });
    }

    if (req.body.accountHolderName && typeof req.body.accountHolderName === 'string' && req.body.accountHolderName.trim() === '') {
      return res.status(400).json({ error: 'Account holder name cannot be empty if provided' });
    }

    if (req.body.bankAccountNumber && !/^\d{9,18}$/.test(req.body.bankAccountNumber)) {
      return res.status(400).json({ error: 'Bank account number must be numeric (9-18 digits)' });
    }

    if (req.body.ifscCode && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(req.body.ifscCode.toUpperCase())) {
      return res.status(400).json({ error: 'Invalid IFSC code format. Expected format: SBIN0001234' });
    }

    if (req.body.branchName && typeof req.body.branchName === 'string' && req.body.branchName.trim() === '') {
      return res.status(400).json({ error: 'Branch name cannot be empty if provided' });
    }

    // Validate uploaded files
    console.log('=== Validating Uploaded Files ===');
    const requiredFiles = ['panFile', 'aadhaarFile', 'profileImage'];
    const optionalFiles = ['bankStatementFile'];
    const missingFiles: string[] = [];

    if (req.files) {
      const files = req.files as Record<string, any[]>;
      requiredFiles.forEach(fileName => {
        const fileArray = files[fileName];
        if (!fileArray || fileArray.length === 0) {
          console.error(`Missing required file: ${fileName}`);
          missingFiles.push(fileName.replace('File', ' File'));
        } else {
          console.log(`✓ ${fileName}: ${fileArray[0].originalname} (${fileArray[0].size} bytes)`);
        }
      });

      // Log optional files
      optionalFiles.forEach(fileName => {
        const fileArray = files[fileName];
        if (fileArray && fileArray.length > 0) {
          console.log(`✓ Optional ${fileName}: ${fileArray[0].originalname} (${fileArray[0].size} bytes)`);
        }
      });
    } else {
      console.error('No files uploaded at all');
      missingFiles.push('PAN File', 'Aadhaar File', 'Profile Image');
    }

    if (missingFiles.length > 0) {
      console.error('❌ Missing required files:', missingFiles);
      return res.status(400).json({
        success: false,
        error: 'REQUIRED_FILES_MISSING',
        missingFiles: missingFiles,
        message: `Please upload the following required files: ${missingFiles.join(', ')}`,
        details: 'These documents are required for identity verification'
      });
    }

    console.log('Token provided:', !!token);
    console.log('Email provided:', !!email);

    let employee;

    // Handle token-based registration (new method) or email-based (fallback)
    if (token) {
      console.log('=== Token-Based Registration ===');
      console.log('Looking up token:', token);

      // Validate token and get employee
      const registrationToken = await prisma.registrationToken.findUnique({
        where: { token },
        include: {
          employee: true
        }
      });

      if (!registrationToken) {
        console.error('❌ Registration token not found:', token);
        return res.status(400).json({
          success: false,
          error: 'TOKEN_NOT_FOUND',
          message: 'Registration token is invalid or has been deleted.',
          details: 'Please request a new registration link from your administrator'
        });
      }

      console.log('✅ Token found:', registrationToken.id);
      console.log('📅 Token is used:', registrationToken.isUsed);
      console.log('⏰ Token expires at:', registrationToken.expiresAt);
      console.log('👤 Associated employee:', registrationToken.employee.employeeId);

      if (registrationToken.isUsed) {
        console.error('❌ Registration token already used:', token);
        return res.status(400).json({
          success: false,
          error: 'TOKEN_ALREADY_USED',
          message: 'This registration link has already been used to create an account.',
          details: 'If you need to reset your account, please contact your administrator'
        });
      }

      const { isTokenExpired } = require("../../utils/registrationToken");
      if (isTokenExpired(registrationToken.expiresAt)) {
        console.error('❌ Registration token expired:', registrationToken.expiresAt);
        return res.status(400).json({
          success: false,
          error: 'TOKEN_EXPIRED',
          message: 'This registration link has expired for security reasons.',
          details: 'Please request a new registration link from your administrator'
        });
      }

      employee = registrationToken.employee;
    } else if (email) {
      console.log('=== Email-Based Registration (Fallback) ===');
      console.log('Looking up employee by email:', email);

      // Fallback to email-based lookup (for backward compatibility)
      employee = await prisma.employee.findUnique({
        where: { officeEmail: email }
      });

      if (!employee) {
        console.error('Employee not found by email:', email);
        return res.status(404).json({ error: 'Employee not found with this email' });
      }

      console.log('Employee found:', employee.employeeId);
    } else {
      return res.status(400).json({ error: 'Either token or email is required' });
    }

    if (!employee) {
      console.error('Employee not found after lookup');
      return res.status(404).json({ error: 'Employee not found' });
    }

    console.log('=== Employee Found ===');
    console.log('Employee ID:', employee.employeeId);
    console.log('Employee Name:', `${employee.firstName} ${employee.lastName}`);
    console.log('Employee Email:', employee.officeEmail);

    // Check if profile already exists
    console.log('=== Checking Existing Profile ===');
    const existingProfile = await prisma.employeeProfile.findUnique({
      where: { employeeId: employee.id }
    });

    if (existingProfile) {
      console.error('Profile already exists for employee:', employee.employeeId);
      return res.status(400).json({ error: 'Profile already completed' });
    }

    console.log('No existing profile found, proceeding with creation');

    // Hash password
    console.log('=== Hashing Password ===');
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('Password hashed successfully');

    // Update employee with password
    console.log('=== Updating Employee Password ===');
    await prisma.employee.update({
      where: { id: employee.id },
      data: { password: hashedPassword }
    });
    console.log('Employee password updated successfully');

    // Get file URLs if files were uploaded
    console.log('=== Processing File Uploads ===');

    const files = req.files as any;

    const panFileUrl = files?.panFile
      ? `/uploads/documents/${files.panFile[0].filename}`
      : null;

    const aadhaarFileUrl = files?.aadhaarFile
      ? `/uploads/documents/${files.aadhaarFile[0].filename}`
      : null;

    const bankStatementFileUrl = files?.bankStatementFile
      ? `/uploads/documents/${files.bankStatementFile[0].filename}`
      : null;

    const profileImage = files?.profileImage
      ? `/uploads/profile/${files.profileImage[0].filename}`
      : null;

    if (profileImage) {
      console.log("Uploaded file:", files.profileImage[0]);
      console.log("Saved profile image path:", profileImage);
    }

    console.log('PAN File URL:', panFileUrl);
    console.log('Aadhaar File URL:', aadhaarFileUrl);
    console.log('Bank Statement File URL:', bankStatementFileUrl);
    console.log('Profile Image URL:', profileImage);
    console.log('All files processed successfully');
    // Parse dates (already validated above)
    console.log('=== Parsing Dates ===');
    const dob = new Date(req.body.dob);
    const doj = new Date(req.body.doj);

    console.log('Parsed DOB:', dob);
    console.log('Parsed DOJ:', doj);

    // Create employee profile
    console.log('=== Creating Employee Profile ===');

    const profileData: any = {
      employee: { connect: { id: employee.id } },
      dob: dob,
      doj: doj,
      education: req.body.education || null,
      maritalStatus: req.body.maritalStatus || null,
      gender: req.body.gender || null,
      permanentAddress: req.body.permanentAddress || null,
      currentAddress: req.body.currentAddress || null,
      currentPinCode: req.body.currentPinCode || null,
      guardianName: req.body.guardianName || null,
      guardianAddress: req.body.guardianAddress || null,
      guardianNumber: req.body.guardianNumber || null,
      personalEmail: req.body.personalEmail || null,
      personalMobile: req.body.personalMobile || null,
      pan: req.body.pan || null,
      aadhaar: req.body.aadhaar || null,
      panFileUrl: panFileUrl || null,
      aadhaarFileUrl: aadhaarFileUrl || null,
      bankStatementFileUrl: bankStatementFileUrl || null,
      profileImage: profileImage || null,
      bankName: req.body.bankName || null,
      accountHolderName: req.body.accountHolderName || null,
      bankAccountNumber: req.body.bankAccountNumber || null,
      ifscCode: req.body.ifscCode || null,
      branchName: req.body.branchName || null,
      salary: req.body.salary ? parseFloat(req.body.salary) : null,
      skills: req.body.skills ? (Array.isArray(req.body.skills) ? req.body.skills : req.body.skills.split(',').map((s: string) => s.trim()).filter((s: string) => s !== '')) : [],
    };

    console.log('Profile data prepared:', JSON.stringify(profileData, null, 2));

    const profile = await prisma.employeeProfile.create({
      data: profileData,
    });

    // Create EmployeeDocument records for the uploaded registration files
    try {
      const registrationFiles = [
        { field: 'panFile', title: 'PAN Card', category: 'Identity' },
        { field: 'aadhaarFile', title: 'Aadhaar Card', category: 'Identity' },
        { field: 'bankStatementFile', title: 'Bank Statement', category: 'Financial' }
      ];

      if (req.files) {
        const files = req.files as Record<string, any[]>;
        for (const regFile of registrationFiles) {
          const fileArray = files[regFile.field];
          if (fileArray && fileArray.length > 0) {
            const file = fileArray[0];
            await prisma.employeeDocument.create({
              data: {
                employeeId: employee.id,
                title: regFile.title,
                category: regFile.category,
                fileName: file.filename, // Store physical filename (with timestamp)
                filePath: file.path,
                fileSize: file.size,
                mimeType: file.mimetype,
                uploadedBy: employee.id
              }
            });
            console.log(`✅ Created EmployeeDocument for ${regFile.title}`);
          }
        }
      }
    } catch (docError) {
      console.error('⚠️ Error creating registration documents records:', docError);
      // Don't fail the whole registration if doc records creation fails
    }

    console.log('=== Profile Created Successfully ===');
    console.log('Created profile:', profile.id);

    // Update employee status and profileImage
    console.log('=== Updating Employee Status & Photo ===');
    await prisma.employee.update({
      where: { id: employee.id },
      data: {
        status: 'pending_approval',
        profileImage: profileImage
      }
    });
    console.log('Employee status updated to pending_approval and profileImage updated');

    // Mark token as used if this was a token-based registration
    if (token) {
      console.log('=== Marking Token as Used ===');
      await markTokenAsUsed(token);
      console.log('Token marked as used successfully');
    }

    console.log('=== Registration Completed Successfully ===');

    // Log activity
    await logActivity({
      type: 'user_registration',
      title: 'New User Registration',
      description: `${employee.firstName} ${employee.lastName} completed their registration`,
      userId: employee.id,
      relatedId: employee.id
    });

    console.log('Created profile ID:', profile.id);
    console.log('Bank details saved:', {
      bankName: req.body.bankName,
      accountHolderName: req.body.accountHolderName,
      bankAccountNumber: req.body.bankAccountNumber ? '[REDACTED]' : null,
      ifscCode: req.body.ifscCode,
      branchName: req.body.branchName
    });

    const profileWithAbsoluteUrls = normalizeProfileAssetUrls(profile as any, req);

    res.json({
      message: 'Profile completed successfully',
      profile: profileWithAbsoluteUrls
    });
  } catch (error) {
    console.error('=== Profile Completion Error ===');
    console.error('Error details:', error);

    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }

    // Handle specific errors with detailed responses
    if (error instanceof SyntaxError) {
      console.error('Syntax error in request data');
      return res.status(400).json({
        error: 'Invalid data format provided',
        details: 'Please check that all form data is correctly formatted'
      });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error('Prisma database error code:', (error as any).code);
      console.error('Prisma error meta:', (error as any).meta);

      if ((error as any).code === 'P2002') {
        console.error('Unique constraint violation');
        return res.status(400).json({
          error: 'Profile already exists for this employee',
          details: 'This employee has already completed their registration'
        });
      }

      if ((error as any).code === 'P2025') {
        console.error('Record not found in database');
        return res.status(404).json({
          error: 'Employee not found',
          details: 'The employee record could not be found in the database'
        });
      }

      // Handle other Prisma errors
      return res.status(500).json({
        error: 'Database operation failed',
        details: `Database error: ${(error as any).code}`,
        message: 'Please try again later or contact support'
      });
    }

    // Handle multer-specific errors
    if (error instanceof multer.MulterError) {
      console.error('Multer file upload error:', error.code, error.message);
      return res.status(400).json({
        error: 'File upload failed',
        details: error.message,
        code: error.code
      });
    }

    // Generic error with detailed information
    console.error('Unhandled error type:', typeof error);
    return res.status(500).json({
      error: 'Failed to complete profile registration',
      details: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Please check the server logs for more details and try again'
    });
  }
};

export const updateProfilePhoto = async (req: any, res: Response) => {
  try {
    console.log('=== Profile Photo Update Request ===');
    console.log('Full request headers:', req.headers);
    console.log('User object from auth middleware:', req.user);
    console.log('User ID from token:', req.user?.id);
    console.log('Files received:', req.files);

    if (!req.user?.id) {
      console.log('ERROR: No user ID found in req.user');
      return res.status(401).json({ error: 'Unauthorized: No user ID found in token' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No profile photo file provided' });
    }

    const profileImage = req.file;
    console.log("Uploaded File:", profileImage); // Added debug logging as requested
    console.log('Profile photo details:', {
      originalname: profileImage.originalname,
      filename: profileImage.filename,
      size: profileImage.size,
      mimetype: profileImage.mimetype
    });

    // First, find the employee to verify they exist
    console.log('Looking for employee with ID:', req.user.id);
    const employee = await prisma.employee.findUnique({
      where: { id: req.user.id }
    });

    if (!employee) {
      console.log('ERROR: Employee not found with ID:', req.user.id);
      return res.status(404).json({ error: 'Employee not found' });
    }

    console.log('Found employee:', employee.employeeId, employee.firstName, employee.lastName);

    // Profile photo path relative to uploads root (standardized to profile/filename)
    const photoUrl = `/uploads/profile/${profileImage.filename}`;

    // VERIFY FILE EXISTS PHYSICALLY BEFORE SAVING TO DB
    const physicalPath = path.join(getUploadsDir(), 'profile', profileImage.filename);
    if (!fs.existsSync(physicalPath)) {
      console.log('ERROR: File was not saved to disk physically:', physicalPath);
      return res.status(500).json({ error: 'File upload failed. Image not saved to disk.' });
    }

    console.log("Uploaded file:", profileImage);
    console.log("Saved profile image path:", photoUrl);

    // Check if employee has a profile, create one if it doesn't exist
    console.log('Looking for profile with employeeId:', req.user.id);
    let employeeProfile = await prisma.employeeProfile.findUnique({
      where: { employeeId: req.user.id }
    });

    if (!employeeProfile) {
      console.log('No profile found for employee:', req.user.id);
    }

    // Update Employee table
    await prisma.employee.update({
      where: { id: req.user.id },
      data: { profileImage: photoUrl }
    });
    console.log('✅ Updated Employee.profileImage');

    // Update EmployeeProfile table
    if (employeeProfile) {
      console.log('📝 Updating existing profile...');
      await prisma.employeeProfile.update({
        where: { employeeId: req.user.id },
        data: { profileImage: photoUrl } as any
      });
    } else {
      console.log('➕ Creating new profile for photo...');
      await prisma.employeeProfile.create({
        data: {
          employeeId: req.user.id,
          profileImage: photoUrl,
          dob: new Date('2000-01-01'), // Required field
          doj: new Date(), // Required field
          education: 'Not specified',
          maritalStatus: 'Single',
          gender: 'Other',
          permanentAddress: 'Not provided',
          currentAddress: 'Not provided',
          pan: 'Not provided',
          aadhaar: 'Not provided'
        } as any
      });
    }

    console.log('✅ Profile photo updated successfully in database');

    res.json({
      success: true,
      message: 'Profile photo updated successfully',
      profileImage: toAbsoluteAssetUrl(photoUrl, req)
    });

  } catch (error: any) {
    console.error('Error updating profile photo:', error);
    res.status(500).json({ error: 'Failed to update profile photo', details: error.message });
  }
};

// Middleware for profile photo upload
export const uploadProfilePhoto = (req: Request, res: Response, next: Function) => {
  const profileUploadDir = path.join(getUploadsDir(), "profile");
  if (!fs.existsSync(profileUploadDir)) {
    fs.mkdirSync(profileUploadDir, { recursive: true });
  }

  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, profileUploadDir);
      },
      filename: (req, file, cb) => {
        // Standardize naming: profilePhoto-timestamp-originalName (without spaces)
        const uniqueName = "profilePhoto-" + Date.now() + "-" + file.originalname.replace(/\s+/g, "_");
        cb(null, uniqueName);
      }
    }),
    limits: {
      fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
      // Only allow image files for profile photos (JPG, JPEG, PNG, WEBP)
      const imageTypes = /jpeg|jpg|png|webp/;
      const extname = imageTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = imageTypes.test(file.mimetype);

      if (mimetype && extname) {
        return cb(null, true);
      } else {
        cb(new Error('Only JPEG, JPG, PNG and WEBP image files are allowed for profile photos'));
      }
    }
  });

  upload.fields([
    { name: 'profileImage', maxCount: 1 },
    { name: 'profilePhoto', maxCount: 1 }
  ])(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      console.error(`❌ Multer Error [${err.code}]:`, err.message, '| Field:', err.field);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: 'File size too large. Maximum size is 10MB.',
          limit: '10MB'
        });
      }
      return res.status(400).json({
        error: 'File upload error: ' + err.message,
        code: err.code
      });
    } else if (err) {
      console.error('❌ File Validation Error:', err.message);
      return res.status(400).json({
        error: 'File validation error: ' + err.message,
        type: 'validation_error'
      });
    }

    // Normalize req.file from req.files for the controller
    if (req.files) {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      req.file = files['profileImage']?.[0] || files['profilePhoto']?.[0];
    }

    if (req.file) {
      console.log('✅ File received by Multer:', {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size
      });
    } else {
      console.warn('⚠️ No file detected in Multer middleware');
    }

    next();
  });
};

export const getEmployeeByEmail = async (req: any, res: Response) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const employee = await prisma.employee.findUnique({
      where: { officeEmail: email as string },
      include: {
        managers: { include: { manager: { select: { id: true, firstName: true, lastName: true, officeEmail: true, employeeId: true } } } },
        partners: { include: { partner: { select: { id: true, firstName: true, lastName: true, officeEmail: true, employeeId: true } } } },
        timelogs: {
          take: 5,
          orderBy: { date: 'desc' }
        }
      } as any
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const managerDetails = (employee as any).managers?.map((m: any) => ({
      id: m.manager.id,
      employeeId: m.manager.employeeId,
      name: `${m.manager.firstName} ${m.manager.lastName}`,
      email: m.manager.officeEmail
    })) || [];

    const partnerDetails = (employee as any).partners?.map((p: any) => ({
      id: p.partner.id,
      employeeId: p.partner.employeeId,
      name: `${p.partner.firstName} ${p.partner.lastName}`,
      email: p.partner.officeEmail
    })) || [];

    // Fetch details for subManagers from subManagerIds array
    const subManagerDetails = await prisma.employee.findMany({
      where: { id: { in: (employee as any).subManagerIds || [] } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        officeEmail: true,
        employeeId: true,
        role: true
      }
    });

    // Log the profile image path for debugging as requested
    console.log("Profile Image Path:", employee.profileImage);

    const fullEmployeeDetails = {
      ...employee,
      profileImage: toAbsoluteAssetUrl(employee.profileImage, req),
      
      // New Array Fields
      reportingPartnerIds: (employee as any).reportingPartnerIds || [],
      reportingManagerIds: (employee as any).reportingManagerIds || [],
      subManagerIds: (employee as any).subManagerIds || [],
      
      stats: {
        projectsCount: 0,
        timelogsCount: await prisma.timelog.count({ where: { employeeId: employee.id } }),
        teamCount: employee.role === 'Partner'
          ? await (prisma as any).employeePartner.count({ where: { partnerId: employee.id } })
          : employee.role === 'Manager'
            ? await (prisma as any).employeeManager.count({ where: { managerId: employee.id } })
            : 0
      },
      managerDetails,
      partnerDetails,
      subManagerDetails: subManagerDetails.map(sm => ({
        id: sm.id,
        name: `${sm.firstName} ${sm.lastName}`,
        employeeCode: sm.employeeId,
        email: sm.officeEmail
      })),
      recentActivities: (employee as any).timelogs?.map((log: any) => ({
        id: log.id,
        type: 'timelog',
        description: `Logged ${log.hours}h for ${log.workItem || 'work'}`,
        timestamp: log.createdAt
      })) || []
    };

    res.json({
      success: true,
      data: fullEmployeeDetails
    });
  } catch (error) {
    console.error('Error fetching employee by email:', error);
    res.status(500).json({ error: 'Failed to fetch employee' });
  }
};


// Middleware for handling file uploads
export const uploadProfileDocuments = (req: Request, res: Response, next: Function) => {
  upload.fields([
    { name: 'panFile', maxCount: 1 },
    { name: 'aadhaarFile', maxCount: 1 },
    { name: 'bankStatementFile', maxCount: 1 },
    { name: 'profilePhoto', maxCount: 1 }
  ])(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      // Multer-specific errors with better messages
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: 'File size too large. Maximum size is 10MB.',
          field: err.field,
          limit: '10MB'
        });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
          error: 'Too many files uploaded.',
          field: err.field
        });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
          error: 'Unexpected file field. Allowed fields: panFile, aadhaarFile, profilePhoto, bankStatementFile.',
          field: err.field
        });
      }
      return res.status(400).json({
        error: 'File upload error: ' + err.message,
        code: err.code,
        field: err.field
      });
    } else if (err) {
      // Other errors with better formatting
      return res.status(400).json({
        error: 'File validation error: ' + err.message,
        type: 'validation_error'
      });
    }
    // No errors, continue to next middleware
    next();
  });
};

// Middleware for handling Excel upload
export const uploadExcel = (req: Request, res: Response, next: Function) => {
  const upload = multer({
    storage: multer.memoryStorage(), // Use memory storage for direct buffer access
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext === '.xlsx' || ext === '.xls') {
        cb(null, true);
      } else {
        cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
      }
    }
  }).single('file');

  upload(req, res, (err: any) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
};

// Employee Import Function
export const importEmployeesExcel = async (req: any, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No Excel file provided' });

    const XLSX = require('xlsx');
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: null });

    console.log(`📥 Starting import of ${data.length} records...`);

    // Fetch all existing employee IDs starting with 'EMP' to calculate sequential IDs
    const allEmps = await prisma.employee.findMany({
      select: { employeeId: true }
    });

    let maxNum = 0;
    let maxPaddedLength = 3;

    allEmps.forEach(e => {
      if (e.employeeId && e.employeeId.toUpperCase().startsWith('EMP')) {
        const numPart = e.employeeId.slice(3);
        if (numPart.length <= 6) { // Ignore legacy long timestamp-based IDs
          const num = parseInt(numPart, 10);
          if (!isNaN(num)) {
            if (num > maxNum) {
              maxNum = num;
              maxPaddedLength = numPart.length;
            }
          }
        }
      }
    });

    let nextSequentialIdNum = maxNum + 1;
    const paddingLength = Math.max(maxPaddedLength, 3);

    let createdCount = 0;
    let updatedCount = 0;
    let errorCount = 0;
    const errors: any[] = [];

    for (const [index, row] of data.entries()) {
      try {
        let empId = row["Employee ID"] || row["EmployeeID"];
        const email = row["Office Email"] || row["OfficeEmail"] || row["Email"];

        if (!email) {
          throw new Error('Email is missing');
        }

        const firstName = row["First Name"] || (row["Full Name"] ? row["Full Name"].split(' ')[0] : 'Unknown');
        const lastName = row["Last Name"] || (row["Full Name"] ? row["Full Name"].split(' ').slice(1).join(' ') : 'Unknown');

        // If employee ID is not provided in Excel, generate a sequential one
        if (!empId) {
          const paddedNum = String(nextSequentialIdNum).padStart(paddingLength, '0');
          empId = `EMP${paddedNum}`;
          nextSequentialIdNum++;
        }

        // Check if employee exists
        let employee = await prisma.employee.findFirst({
          where: {
            OR: [
              ...(empId ? [{ employeeId: String(empId) }] : []),
              { officeEmail: String(email) }
            ]
          }
        });

        const isOld = String(row["Is Old Employee"] || row["Old Employee"] || '').toLowerCase() === 'yes';

        const empData: any = {
          firstName: firstName || 'First',
          lastName: lastName || 'Last',
          officeEmail: String(email),
          role: row["Role"] || 'Employee',
          department: row["Department"] || 'Accounting',
          designation: row["Designation"] || 'Associate',
          status: isOld ? 'active' : (row["Status"] || 'active').toLowerCase(),
          employeeId: String(empId),
          isApproved: isOld ? true : false,
          approvedAt: isOld ? new Date() : null,
          approvedBy: isOld ? "System (Old Employee Excel Import)" : null,
        };

        // Helper to find user by name
        const findUserByName = async (nameStr: string, userRole?: string) => {
          if (!nameStr || nameStr === 'N/A' || nameStr === 'None') return null;
          const names = nameStr.trim().split(' ');
          const fName = names[0];
          const lName = names.slice(1).join(' ');

          return await prisma.employee.findFirst({
            where: {
              firstName: { contains: fName, mode: 'insensitive' },
              lastName: lName ? { contains: lName, mode: 'insensitive' } : undefined,
              role: userRole ? userRole : undefined,
              status: 'active'
            },
            select: { id: true }
          });
        };

        const subManagerRow = row["Sub Manager"];
        const managerRow = row["Reporting Manager"] || row["Reporting Manager Name"] || row["Reporting Managers"];
        const partnerRow = row["Reporting Partner"] || row["Reporting Partner Name"] || row["Reporting Partners"];

        const subManager = await findUserByName(subManagerRow, 'Manager');
        const reportingManager = await findUserByName(managerRow, 'Manager');
        const reportingPartner = await findUserByName(partnerRow, 'Partner');

        if (subManager) empData.subManagerId = subManager.id;
        if (reportingManager) empData.managerId = reportingManager.id;
        if (reportingPartner) empData.partnerId = reportingPartner.id;

        const plainPassword = isOld ? `${firstName}@2026` : 'Standard@123';
        const hashedPassword = await bcrypt.hash(plainPassword, 10);

        if (employee) {
          // Update
          await prisma.employee.update({
            where: { id: employee.id },
            data: {
              ...empData,
              password: isOld ? hashedPassword : undefined, // Update password only if old employee is explicitly imported
              managers: reportingManager ? {
                deleteMany: {},
                create: { managerId: reportingManager.id }
              } : undefined,
              partners: reportingPartner ? {
                deleteMany: {},
                create: { partnerId: reportingPartner.id }
              } : undefined,
            } as any
          });
          updatedCount++;
        } else {
          // Create
          employee = await prisma.employee.create({
            data: {
              ...empData,
              password: hashedPassword,
              managers: reportingManager ? {
                create: { managerId: reportingManager.id }
              } : undefined,
              partners: reportingPartner ? {
                create: { partnerId: reportingPartner.id }
              } : undefined,
            } as any
          });
          createdCount++;
        }

        // Update/Create Profile
        const profileData: Prisma.EmployeeProfileUpdateInput & Prisma.EmployeeProfileCreateWithoutEmployeeInput = {
          dob: row["DOB"] ? new Date(row["DOB"]) : new Date('2000-01-01'),
          doj: row["Date of Joining"] || row["DOJ"] ? new Date(row["Date of Joining"] || row["DOJ"]) : new Date(),
          gender: row["Gender"] || 'Other',
          maritalStatus: row["Marital Status"] || 'Single',
          education: row["Education"] || '',
          pan: row["PAN"] || '',
          aadhaar: row["Aadhaar"] || '',
          currentAddress: row["Current Address"] || '',
          permanentAddress: row["Permanent Address"] || '',
          bankName: row["Bank Name"] || '',
          bankAccountNumber: row["Account Number"] || '',
          ifscCode: row["IFSC Code"] || '',
          personalEmail: row["Personal Email"] || '',
          personalMobile: row["Personal Mobile"] || '',
          salary: row["Salary"] ? parseFloat(row["Salary"]) : undefined,
        };

        await prisma.employeeProfile.upsert({
          where: { employeeId: employee.id },
          update: profileData,
          create: {
            ...profileData,
            employee: { connect: { id: employee.id } }
          }
        });

      } catch (err: any) {
        errorCount++;
        errors.push({ row: index + 2, error: err.message });
        console.error(`❌ Error importing row ${index + 2}:`, err.message);
      }
    }

    res.json({
      success: true,
      message: `Direct Excel processing completed: ${createdCount} created, ${updatedCount} updated, ${errorCount} errors.`,
      summary: { createdCount, updatedCount, errorCount, errors }
    });

  } catch (error: any) {
    console.error('❌ Import error:', error);
    res.status(500).json({ error: 'Internal server error during import', details: error.message });
  }
};

// Employee Register Export Function - HR REGISTER FORMAT
export const exportEmployeesExcel = async (req: any, res: Response) => {
  try {
    console.log('🔄 Starting EMPLOYEE REGISTER export for user:', req.user?.id, req.user?.role);
    console.log('🔍 User object:', JSON.stringify(req.user, null, 2));
    const user = req.user;

    // 🔐 Role-based filtering (case-insensitive)
    const userRole = (user.role as string).toLowerCase();
    console.log('🔍 Normalized user role:', userRole);

    let employees: any[];
    if (userRole === 'admin' || userRole === 'owner') {
      employees = await prisma.employee.findMany({
        include: {
          subManager: { select: { firstName: true, lastName: true } },
          manager: { select: { firstName: true, lastName: true } },
          partner: { select: { firstName: true, lastName: true } },
          managers: { include: { manager: { select: { firstName: true, lastName: true } } } },
          partners: { include: { partner: { select: { firstName: true, lastName: true } } } }
        } as any
      });
    } else if (userRole === 'partner') {
      employees = await prisma.employee.findMany({
        where: { partners: { some: { partnerId: user.id } } } as any,
        include: {
          subManager: { select: { firstName: true, lastName: true } },
          manager: { select: { firstName: true, lastName: true } },
          partner: { select: { firstName: true, lastName: true } },
          managers: { include: { manager: { select: { firstName: true, lastName: true } } } },
          partners: { include: { partner: { select: { firstName: true, lastName: true } } } }
        } as any
      });
    } else if (userRole === 'manager') {
      employees = await prisma.employee.findMany({
        where: { managers: { some: { managerId: user.id } } } as any,
        include: {
          subManager: { select: { firstName: true, lastName: true } },
          manager: { select: { firstName: true, lastName: true } },
          partner: { select: { firstName: true, lastName: true } },
          managers: { include: { manager: { select: { firstName: true, lastName: true } } } },
          partners: { include: { partner: { select: { firstName: true, lastName: true } } } }
        } as any
      });
    } else {
      console.log('❌ Access denied for role:', user.role, '(normalized:', userRole, ')');
      return res.status(403).json({ message: "Access denied. Only Admin, Partner, Owner, and Manager roles can export employees." });
    }

    console.log(`✅ Found ${employees.length} employees for register export`);

    // Helper function to get employee details by ID or Email
    const getEmployeeDetails = async (identifier: string) => {
      if (!identifier) return null;

      // Try by ID first
      let emp = await prisma.employee.findUnique({
        where: { id: identifier },
        select: { firstName: true, lastName: true, officeEmail: true }
      });

      // If not found, try by email
      if (!emp) {
        emp = await prisma.employee.findUnique({
          where: { officeEmail: identifier },
          select: { firstName: true, lastName: true, officeEmail: true }
        });
      }

      return emp;
    };

    // Helper function to calculate age from DOB
    const calculateAge = (dob: Date) => {
      if (!dob) return '';
      const today = new Date();
      const birthDate = new Date(dob);
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      return age;
    };

    // Collect all sub-manager IDs from the retrieved employees
    const allSubManagerIds = new Set<string>();
    employees.forEach((emp: any) => {
      if (emp.subManagerId) {
        allSubManagerIds.add(emp.subManagerId);
      }
      if (Array.isArray(emp.subManagerIds)) {
        emp.subManagerIds.forEach((id: string) => {
          if (id) allSubManagerIds.add(id);
        });
      }
    });

    // Query their details (id, firstName, lastName)
    const subManagerDetails = allSubManagerIds.size > 0
      ? await prisma.employee.findMany({
          where: { id: { in: Array.from(allSubManagerIds) } },
          select: { id: true, firstName: true, lastName: true }
        })
      : [];

    // Create a lookup map
    const subManagerMap = new Map<string, string>();
    subManagerDetails.forEach((sm: any) => {
      subManagerMap.set(sm.id, `${sm.firstName || ''} ${sm.lastName || ''}`.trim());
    });

    // Map to EMPLOYEE REGISTER format with exact column order
    const data = employees.map((emp: any) => {
      // Resolve sub-managers list
      const subManagersNames: string[] = [];
      const seenIds = new Set<string>();

      if (Array.isArray(emp.subManagerIds)) {
        emp.subManagerIds.forEach((id: string) => {
          if (id && !seenIds.has(id)) {
            const name = subManagerMap.get(id);
            if (name) {
              subManagersNames.push(name);
              seenIds.add(id);
            }
          }
        });
      }

      if (emp.subManagerId && !seenIds.has(emp.subManagerId)) {
        const name = subManagerMap.get(emp.subManagerId);
        if (name) {
          subManagersNames.push(name);
          seenIds.add(emp.subManagerId);
        } else if (emp.subManager) {
          const nameFromRel = `${emp.subManager.firstName || ''} ${emp.subManager.lastName || ''}`.trim();
          if (nameFromRel) {
            subManagersNames.push(nameFromRel);
            seenIds.add(emp.subManagerId);
          }
        }
      }

      const subManagerDisplay = subManagersNames.length > 0 ? subManagersNames.join(", ") : 'N/A';

      return {
        // 👤 BASIC DETAILS
        "Employee ID": emp.employeeId || '',
        "Full Name": `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
        "First Name": emp.firstName || '',
        "Last Name": emp.lastName || '',
        "Office Email": emp.officeEmail || '',
        "Personal Email": emp.profile?.personalEmail || '',
        "Phone": '', // Phone field not in schema
        "Personal Mobile": emp.profile?.personalMobile || '',

        // 💼 PROFESSIONAL DETAILS
        "Role": emp.role || '',
        "Department": emp.department || '',
        "Designation": emp.designation || '',
        "Status": emp.status || '',
        "Date of Joining": emp.profile?.doj ? new Date(emp.profile.doj).toLocaleDateString() : '',
        "Employment Type": emp.profile?.employmentType || '',
        "Work Location": '', // Work location field not in schema

        // 👥 REPORTING
        "Sub Manager": subManagerDisplay,
        "Reporting Manager": emp.manager ? `${emp.manager.firstName} ${emp.manager.lastName}`.trim() : (emp.managers?.map((m: any) => `${m.manager.firstName} ${m.manager.lastName}`).join(", ") || 'N/A'),
        "Reporting Partner": emp.partner ? `${emp.partner.firstName} ${emp.partner.lastName}`.trim() : (emp.partners?.map((p: any) => `${p.partner.firstName} ${p.partner.lastName}`).join(", ") || 'N/A'),

        // 📅 PERSONAL DETAILS
        "DOB": emp.profile?.dob ? new Date(emp.profile.dob).toLocaleDateString() : '',
        "Age": emp.profile?.dob ? calculateAge(new Date(emp.profile.dob)) : '',
        "Gender": emp.profile?.gender || '',
        "Marital Status": emp.profile?.maritalStatus || '',
        "Education": emp.profile?.education || '',

        // 🏠 ADDRESS
        "Permanent Address": emp.profile?.permanentAddress || '',
        "Current Address": emp.profile?.currentAddress || '',
        "Pin Code": emp.profile?.currentPinCode || '',

        // 🆔 DOCUMENTS
        "PAN": emp.profile?.pan || '',
        "Aadhaar": emp.profile?.aadhaar || '',

        // 👨‍👩‍👧 GUARDIAN
        "Guardian Name": emp.profile?.guardianName || '',
        "Guardian Phone": emp.profile?.guardianNumber || '',
        "Guardian Address": emp.profile?.guardianAddress || '',

        // 🏦 BANK DETAILS
        "Account Holder Name": emp.profile?.accountHolderName || '',
        "Bank Name": emp.profile?.bankName || '',
        "Account Number": emp.profile?.bankAccountNumber || '',
        "IFSC Code": emp.profile?.ifscCode || '',
        "Branch Name": emp.profile?.branchName || '',

        // 🚨 EMERGENCY
        "Emergency Contact Name": emp.profile?.emergencyContactName || '',
        "Emergency Contact Phone": emp.profile?.emergencyContactPhone || '',
        "Emergency Relation": emp.profile?.emergencyContactRelation || '',

        // 📸 PROFILE
        "Skills": emp.profile?.skills ? (Array.isArray(emp.profile.skills) ? emp.profile.skills.join(', ') : emp.profile.skills) : '',
        "Experience": emp.profile?.experience || '',
        "Salary": emp.profile?.salary || '',
        "Seniority Level": emp.profile?.seniorityLevel || '',

        // ⚙️ SYSTEM
        "Created At": emp.createdAt ? new Date(emp.createdAt).toLocaleDateString() : '',
        "Updated At": '', // updatedAt field not in schema
      };
    });

    // Use XLSX library for Employee Register
    const XLSX = require('xlsx');

    const worksheet = XLSX.utils.json_to_sheet(data);

    // 🎨 HR REGISTER STYLING

    // Auto width with minimum column width
    const colWidths = Object.keys(data[0] || {}).map(key => ({
      wch: Math.max(key.length, 20) // Minimum width of 20 for readability
    }));
    worksheet['!cols'] = colWidths;

    // Freeze header row (HR register style)
    worksheet['!freeze'] = { xSplit: 0, ySplit: 1 };

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Employee Register");

    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx'
    });

    res.setHeader('Content-Disposition', 'attachment; filename=Employee_Register.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    console.log('📤 Sending EMPLOYEE REGISTER file to client...');
    res.send(buffer);
    console.log('✅ EMPLOYEE REGISTER export completed successfully');

  } catch (err: any) {
    console.error('❌ EMPLOYEE REGISTER export error:', err);
    res.status(500).json({ message: err.message });
  }
};

