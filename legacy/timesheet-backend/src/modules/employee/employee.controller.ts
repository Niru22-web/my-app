import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import bcrypt from "bcrypt";
import { generateId } from "../../utils/generateId";
import { generateRegistrationToken, createTokenExpiry } from "../../utils/registrationToken";
import EmailService from "../email/email.service";
import * as fs from 'fs';
import * as path from 'path';
import { normalizeProfileAssetUrls, toAbsoluteAssetUrl } from "../../utils/assetUrl";

const emailService = EmailService;

export const createEmployee = async (req: any, res: Response) => {
  try {
    console.log('🚀 Creating new employee...');

    // Validate required fields
    const {
      firstName, lastName, officeEmail, department, designation, role,
      partnerIds, managerIds, subManagerId,
      reportingPartnerIds, reportingManagerIds, subManagerIds,
      isOldEmployee
    } = req.body;

    // Check for missing basic fields
    if (!firstName || firstName.trim() === '') return res.status(400).json({ success: false, error: "First Name is required" });
    if (!lastName || lastName.trim() === '') return res.status(400).json({ success: false, error: "Last Name is required" });
    if (!officeEmail || officeEmail.trim() === '') return res.status(400).json({ success: false, error: "Office Email is required" });
    if (!department || department.trim() === '') return res.status(400).json({ success: false, error: "Department is required" });
    if (!designation || designation.trim() === '') return res.status(400).json({ success: false, error: "Designation is required" });
    if (!role || role.trim() === '') return res.status(400).json({ success: false, error: "Role is required" });

    // Normalize hierarchy arrays
    const finalPartnerIds = Array.from(new Set([
      ...(reportingPartnerIds || []),
      ...(partnerIds || []),
      ...(req.body.partnerId ? [req.body.partnerId] : [])
    ])).filter(Boolean);

    const finalManagerIds = Array.from(new Set([
      ...(reportingManagerIds || []),
      ...(managerIds || []),
      ...(req.body.managerId ? [req.body.managerId] : [])
    ])).filter(Boolean);

    const finalSubManagerIds = Array.from(new Set([
      ...(subManagerIds || []),
      ...(subManagerId ? [subManagerId] : [])
    ])).filter(Boolean);


    // Use provided employeeId or generate new one
    const employeeId = req.body.employeeId || await generateId("EMP");

    if (!employeeId) {
      console.error('❌ Failed to generate or retrieve Employee ID');
      return res.status(500).json({ success: false, error: "Failed to generate Employee ID" });
    }

    // Normalize officeEmail for consistency
    const normalizedEmail = (officeEmail as string).toLowerCase().trim();

    const tempPassword = 'Welcome@ASA2026';
    let hashedPassword = null;
    if (isOldEmployee) {
      hashedPassword = await bcrypt.hash(tempPassword, 10);
    }

    // Resolve names from master records for legacy string fields compatibility
    let finalRole = role || "Employee";
    let finalDesignation = designation || "";
    let finalDepartment = department || "General";
    let finalEmploymentType = req.body.employmentType || null;

    if (req.body.roleId) {
      const roleObj = await prisma.roleMaster.findUnique({ where: { id: req.body.roleId } });
      if (roleObj) finalRole = roleObj.name;
    }
    if (req.body.designationId) {
      const desObj = await prisma.designationMaster.findUnique({ where: { id: req.body.designationId } });
      if (desObj) finalDesignation = desObj.name;
    }
    if (req.body.departmentId) {
      const deptObj = await prisma.departmentMaster.findUnique({ where: { id: req.body.departmentId } });
      if (deptObj) finalDepartment = deptObj.name;
    }
    if (req.body.employmentTypeId) {
      const empTypeObj = await prisma.employmentTypeMaster.findUnique({ where: { id: req.body.employmentTypeId } });
      if (empTypeObj) finalEmploymentType = empTypeObj.name;
    }

    const employee = await prisma.employee.create({
      data: {
        employeeId: employeeId as string,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        officeEmail: normalizedEmail,
        designation: finalDesignation,
        department: finalDepartment,
        role: finalRole,
        roleId: req.body.roleId || null,
        designationId: req.body.designationId || null,
        departmentId: req.body.departmentId || null,
        shiftId: req.body.shiftId || null,
        locationId: req.body.locationId || null,
        status: isOldEmployee ? "active" : (req.body.status || "active"),
        isApproved: isOldEmployee ? true : false,
        password: hashedPassword,
        approvedAt: isOldEmployee ? new Date() : null,
        approvedBy: isOldEmployee ? "System (Old Employee Add)" : null,
        // New Array fields
        reportingPartnerIds: finalPartnerIds,
        reportingManagerIds: finalManagerIds,
        subManagerIds: finalSubManagerIds,
        // Legacy single fields (for backward compatibility)
        subManagerId: finalSubManagerIds[0] || null,
        managerId: finalManagerIds[0] || null,
        partnerId: finalPartnerIds[0] || null,
        // Relations (junction tables) - sync for now
        managers: finalManagerIds.length > 0 ? {
          create: finalManagerIds.map((mId: string) => ({ managerId: mId }))
        } : undefined,
        partners: finalPartnerIds.length > 0 ? {
          create: finalPartnerIds.map((pId: string) => ({ partnerId: pId }))
        } : undefined,
        // Profile placeholder for Old Employees to bypass questionnaire and DB constraints
        profile: isOldEmployee ? {
          create: {
            dob: new Date('2000-01-01'),
            doj: new Date(),
            education: 'Not specified',
            maritalStatus: 'Single',
            gender: 'Other',
            permanentAddress: 'Not provided',
            currentAddress: 'Not provided',
            pan: 'Not provided',
            aadhaar: 'Not provided',
            employmentTypeId: req.body.employmentTypeId || null,
            employmentType: finalEmploymentType
          }
        } : undefined
      } as any,
    });


    console.log('✅ Employee created successfully:', {
      id: employee.id,
      employeeId: employee.employeeId,
      email: employee.officeEmail,
      name: `${employee.firstName} ${employee.lastName}`,
      isOldEmployee: !!isOldEmployee
    });

    // Send email to employee based on flow type
    let emailStatus = 'not_attempted';
    let emailMessage = '';

    if (employee.officeEmail) {
      try {
        if (isOldEmployee) {
          console.log('📧 Initiating old employee welcome email to:', employee.officeEmail);
          emailStatus = 'sending';

          const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`;

          // Check email service configuration
          const emailConfig = await emailService.checkEmailConfiguration();
          console.log('📊 Email configuration status:', emailConfig);

          if (!emailConfig.configured) {
            console.warn('⚠️ Email service not configured, skipping welcome email');
            emailStatus = 'skipped';
            emailMessage = 'Email service not configured - welcome email not sent';
          } else {
            // Send welcome email using email service
            await emailService.sendOldEmployeeWelcomeEmail({
              to: employee.officeEmail,
              employeeName: `${employee.firstName} ${employee.lastName}`,
              employeeId: employee.employeeId,
              department: employee.department,
              designation: employee.designation,
              tempPassword: tempPassword,
              loginUrl: loginUrl,
              companyName: process.env.COMPANY_NAME || 'Timesheet Management System'
            });

            console.log('✅ Welcome email sent successfully to:', employee.officeEmail);
            emailStatus = 'sent';
            emailMessage = 'Welcome email sent successfully';
          }
        } else {
          console.log('📧 Initiating registration email to:', employee.officeEmail);
          emailStatus = 'sending';

          // Generate secure registration token
          const registrationToken = generateRegistrationToken();
          const expiresAt = createTokenExpiry();

          // Store registration token in database
          await prisma.registrationToken.create({
            data: {
              token: registrationToken,
              email: employee.officeEmail,
              employeeId: employee.id,
              expiresAt: expiresAt
            }
          });

          const registrationLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/complete-registration?token=${registrationToken}`;

          // Check email service configuration
          const emailConfig = await emailService.checkEmailConfiguration();
          console.log('📊 Email configuration status:', emailConfig);

          if (!emailConfig.configured) {
            console.warn('⚠️ Email service not configured, skipping registration email');
            emailStatus = 'skipped';
            emailMessage = 'Email service not configured - registration email not sent';
          } else {
            // Send registration email using email service
            await emailService.sendRegistrationEmail({
              to: employee.officeEmail,
              employeeName: `${employee.firstName} ${employee.lastName}`,
              employeeId: employee.employeeId,
              department: employee.department,
              designation: employee.designation,
              registrationLink: registrationLink,
              companyName: process.env.COMPANY_NAME || 'Timesheet Management System'
            });

            console.log('✅ Registration email sent successfully to:', employee.officeEmail);
            emailStatus = 'sent';
            emailMessage = 'Registration email sent successfully';
          }
        }
      } catch (emailError) {
        console.error('❌ Failed to send email:', {
          message: emailError instanceof Error ? emailError.message : String(emailError),
          employeeEmail: employee.officeEmail,
          stack: emailError instanceof Error ? emailError.stack : undefined
        });
        emailStatus = 'failed';
        emailMessage = emailError instanceof Error ? emailError.message : 'Failed to send email';
        // Continue with response even if email fails
      }
    }

    // Prepare response with email status
    const response = {
      success: true,
      data: employee,
      emailStatus: emailStatus,
      message: isOldEmployee
        ? (emailStatus === 'sent'
          ? 'Old Employee added and welcome email sent successfully'
          : emailStatus === 'skipped'
            ? 'Old Employee added successfully (email not configured)'
            : `Old Employee added but email failed: ${emailMessage}`)
        : (emailStatus === 'sent'
          ? 'Employee created and registration email sent successfully'
          : emailStatus === 'skipped'
            ? 'Employee created successfully (email not configured)'
            : emailStatus === 'failed'
              ? `Employee created but email failed: ${emailMessage}`
              : 'Employee created successfully')
    };

    res.json(response);
  } catch (error: any) {
    console.error('❌ Error creating employee:', error);
    res.status(500).json({
      success: false,
      error: "An unexpected error occurred while creating the employee",
      details: error.message || "Database error"
    });
  }
};

export const updateEmployee = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    let updateData = { ...req.body };

    // Handle parsing of stringified JSON if sent via FormData
    if (typeof updateData.profile === 'string') {
      try {
        updateData.profile = JSON.parse(updateData.profile);
      } catch (e) {
        console.error('Failed to parse profile JSON string:', e);
      }
    }
    if (typeof updateData.managerIds === 'string') {
      try {
        updateData.managerIds = JSON.parse(updateData.managerIds);
      } catch (e) {
        console.error('Failed to parse managerIds JSON string:', e);
      }
    }
    if (typeof updateData.partnerIds === 'string') {
      try {
        updateData.partnerIds = JSON.parse(updateData.partnerIds);
      } catch (e) {
        console.error('Failed to parse partnerIds JSON string:', e);
      }
    }
    if (typeof updateData.reportingPartnerIds === 'string') {
      try {
        updateData.reportingPartnerIds = JSON.parse(updateData.reportingPartnerIds);
      } catch (e) {
        console.error('Failed to parse reportingPartnerIds JSON string:', e);
      }
    }
    if (typeof updateData.reportingManagerIds === 'string') {
      try {
        updateData.reportingManagerIds = JSON.parse(updateData.reportingManagerIds);
      } catch (e) {
        console.error('Failed to parse reportingManagerIds JSON string:', e);
      }
    }
    if (typeof updateData.subManagerIds === 'string') {
      try {
        updateData.subManagerIds = JSON.parse(updateData.subManagerIds);
      } catch (e) {
        console.error('Failed to parse subManagerIds JSON string:', e);
      }
    }


    console.log('🔄 Updating employee with ID:', id);
    console.log('📥 Update data received:', JSON.stringify(updateData, null, 2));

    const employee = await prisma.employee.findUnique({
      where: { id }
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Employee not found'
      });
    }

    // Separate profile and relation data from employee data
    const {
      profile, managerIds, partnerIds, managerId, partnerId, subManagerId,
      reportingPartnerIds, reportingManagerIds, subManagerIds,
      ...employeeUpdateDataRaw
    } = updateData;

    // Filter only valid Employee model fields to prevent runtime Prisma validation errors
    const validEmployeeFields = [
      'firstName', 'lastName', 'officeEmail', 'role', 'department', 'designation',
      'status', 'roleId', 'designationId', 'departmentId', 'shiftId', 'locationId',
      'profileImage', 'isApproved', 'hasAccountsAccess'
    ];

    const employeeUpdateData: any = {};
    validEmployeeFields.forEach(field => {
      if (employeeUpdateDataRaw[field] !== undefined) {
        employeeUpdateData[field] = employeeUpdateDataRaw[field];
      }
    });

    // Normalize email if it's being updated
    if (employeeUpdateData.officeEmail) {
      employeeUpdateData.officeEmail = employeeUpdateData.officeEmail.toLowerCase().trim();
    }

    console.log('👤 Employee update data:', JSON.stringify(employeeUpdateData, null, 2));
    console.log('📋 Profile data:', JSON.stringify(profile, null, 2));

    // Normalize hierarchy arrays
    const finalPartnerIds = Array.from(new Set([
      ...(reportingPartnerIds || []),
      ...(partnerIds || []),
      ...(partnerId ? [partnerId] : [])
    ])).filter(Boolean);

    const finalManagerIds = Array.from(new Set([
      ...(reportingManagerIds || []),
      ...(managerIds || []),
      ...(managerId ? [managerId] : [])
    ])).filter(Boolean);

    const finalSubManagerIds = Array.from(new Set([
      ...(subManagerIds || []),
      ...(subManagerId ? [subManagerId] : [])
    ])).filter(Boolean);

    // Resolve names from master records if master IDs are updated
    if (employeeUpdateData.roleId) {
      const roleObj = await prisma.roleMaster.findUnique({ where: { id: employeeUpdateData.roleId } });
      if (roleObj) employeeUpdateData.role = roleObj.name;
    }
    if (employeeUpdateData.designationId) {
      const desObj = await prisma.designationMaster.findUnique({ where: { id: employeeUpdateData.designationId } });
      if (desObj) employeeUpdateData.designation = desObj.name;
    }
    if (employeeUpdateData.departmentId) {
      const deptObj = await prisma.departmentMaster.findUnique({ where: { id: employeeUpdateData.departmentId } });
      if (deptObj) employeeUpdateData.department = deptObj.name;
    }

    // Update employee basic information and relations
    const updatedEmployee = await prisma.employee.update({
      where: { id },
      data: {
        ...employeeUpdateData,
        // New Array fields
        reportingPartnerIds: finalPartnerIds,
        reportingManagerIds: finalManagerIds,
        subManagerIds: finalSubManagerIds,
        // Legacy single fields (for backward compatibility)
        subManagerId: finalSubManagerIds[0] || null,
        managerId: finalManagerIds[0] || null,
        partnerId: finalPartnerIds[0] || null,
        // Relations (junction tables)
        managers: {
          deleteMany: {},
          create: finalManagerIds.map((mId: string) => ({ managerId: mId }))
        },
        partners: {
          deleteMany: {},
          create: finalPartnerIds.map((pId: string) => ({ partnerId: pId }))
        },
      } as any
    });


    console.log('✅ Basic employee info updated');

    // Update profile data if provided
    if (profile && Object.keys(profile).length > 0) {
      console.log('🔄 Updating profile data...');

      // Check if profile exists
      const existingProfile = await prisma.employeeProfile.findUnique({
        where: { employeeId: id }
      });

      console.log('📊 Existing profile found:', !!existingProfile);

      // Resolve employmentType string from master if ID is provided
      let finalEmploymentType = profile.employmentType || null;
      if (profile.employmentTypeId) {
        const empTypeObj = await prisma.employmentTypeMaster.findUnique({ where: { id: profile.employmentTypeId } });
        if (empTypeObj) finalEmploymentType = empTypeObj.name;
      }

      // Filter out null/undefined values for required fields
      // Filter out null/undefined values and ensure correct types for Prisma
      const filteredProfile: any = {
        dob: profile.dob ? new Date(profile.dob) : new Date('2000-01-01'),
        doj: profile.doj ? new Date(profile.doj) : new Date(),
        education: profile.education || 'Not specified',
        maritalStatus: profile.maritalStatus || 'Single',
        gender: profile.gender || 'Other',
        permanentAddress: profile.permanentAddress || 'Not provided',
        currentAddress: profile.currentAddress || 'Not provided',
        pan: profile.pan || 'Not provided',
        aadhaar: profile.aadhaar || 'Not provided',
        personalEmail: profile.personalEmail || null,
        personalMobile: profile.personalMobile || null,
        currentPinCode: profile.currentPinCode || null,
        guardianName: profile.guardianName || null,
        guardianNumber: profile.guardianNumber || null,
        guardianAddress: profile.guardianAddress || null,
        accountHolderName: profile.accountHolderName || null,
        bankAccountNumber: profile.bankAccountNumber || null,
        bankName: profile.bankName || null,
        branchName: profile.branchName || null,
        ifscCode: profile.ifscCode || null,
        emergencyContactName: profile.emergencyContactName || null,
        emergencyContactPhone: profile.emergencyContactPhone || null,
        emergencyContactRelation: profile.emergencyContactRelation || null,
        seniorityLevel: profile.seniorityLevel || null,
        experience: profile.experience || null,
        employmentType: finalEmploymentType,
        employmentTypeId: profile.employmentTypeId || null,
      };

      // Add file URLs only if they exist
      if (profile.panFileUrl) filteredProfile.panFileUrl = profile.panFileUrl;
      if (profile.aadhaarFileUrl) filteredProfile.aadhaarFileUrl = profile.aadhaarFileUrl;
      if (profile.bankStatementFileUrl) filteredProfile.bankStatementFileUrl = profile.bankStatementFileUrl;

      // Handle salary (Float)
      if (profile.salary) {
        filteredProfile.salary = typeof profile.salary === 'number' ? profile.salary : parseFloat(profile.salary);
      }

      // Handle skills (String[])
      if (profile.skills) {
        filteredProfile.skills = Array.isArray(profile.skills)
          ? profile.skills
          : profile.skills.split(',').map((s: string) => s.trim()).filter((s: string) => s !== '');
      }

      console.log('🎯 Final filtered profile data for Prisma:', JSON.stringify(filteredProfile, null, 2));

      if (existingProfile) {
        console.log('📝 Updating existing profile...');
        await prisma.employeeProfile.update({
          where: { employeeId: id },
          data: filteredProfile
        });
      } else {
        console.log('➕ Creating new profile...');
        await prisma.employeeProfile.create({
          data: {
            ...filteredProfile,
            employee: { connect: { id } }
          }
        });
      }

      console.log('✅ Profile data updated successfully');
    }

    // --- NEW: Handle uploaded documents if any ---
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      console.log(`📎 Processing ${req.files.length} uploaded files...`);
      const files = req.files as Express.Multer.File[];

      try {
        await Promise.all(files.map(async (file) => {
          return await prisma.employeeDocument.create({
            data: {
              employeeId: id,
              title: file.originalname,
              category: 'Other',
              fileName: file.filename,
              filePath: file.path,
              fileSize: file.size,
              mimeType: file.mimetype,
              uploadedBy: req.user?.id || null
            }
          });
        }));
        console.log('✅ Documents saved to database');
      } catch (docError) {
        console.error('❌ Error saving documents:', docError);
        // Continue with the update even if document saving fails
      }
    }

    // Fetch complete updated employee details
    const completeUpdatedEmployee = await prisma.employee.findUnique({
      where: { id },
      include: {
        documents: true
      }
    });
    const normalizedUpdatedEmployee = completeUpdatedEmployee;

    console.log('🎉 Employee updated successfully');

    res.json({
      success: true,
      data: normalizedUpdatedEmployee,
      message: 'Employee updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating employee:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack available');
    res.status(500).json({
      success: false,
      error: 'Failed to update employee',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const deleteEmployee = async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    const employee = await prisma.employee.findUnique({
      where: { id }
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Employee not found'
      });
    }

    console.log(`Deleting employee: ${employee.firstName} ${employee.lastName} (${employee.employeeId})`);

    // Delete all related data in correct order to avoid foreign key constraints

    // 1. Delete employee profile first (if exists)
    await prisma.employeeProfile.deleteMany({
      where: { employeeId: id }
    });
    console.log('Deleted employee profile');

    // 2. Delete registration tokens
    await prisma.registrationToken.deleteMany({
      where: { employeeId: id }
    });
    console.log('Deleted registration tokens');

    // 3. Delete timelogs
    await prisma.timelog.deleteMany({
      where: { employeeId: id }
    });
    console.log('Deleted timelogs');

    // Set approvedBy/rejectedBy to null for timelogs approved/rejected by this employee
    await prisma.timelog.updateMany({
      where: { approvedBy: id },
      data: { approvedBy: null }
    });
    await prisma.timelog.updateMany({
      where: { rejectedBy: id },
      data: { rejectedBy: null }
    });

    // 4. Delete leave records and remove approval references
    await prisma.leave.deleteMany({
      where: { employeeId: id }
    });
    await prisma.leave.updateMany({
      where: { approvedBy: id },
      data: { approvedBy: null }
    });

    // 5. Delete reimbursement logs and update other reimbursement references
    await prisma.reimbursementLog.deleteMany({
      where: { performedById: id }
    });
    await prisma.reimbursement.deleteMany({
      where: { employeeId: id }
    });
    await prisma.reimbursement.updateMany({
      where: { approvedBy: id },
      data: { approvedBy: null }
    });
    await prisma.reimbursement.updateMany({
      where: { managerApprovedBy: id },
      data: { managerApprovedBy: null }
    });
    await prisma.reimbursement.updateMany({
      where: { managerId: id },
      data: { managerId: null }
    });
    await prisma.reimbursement.updateMany({
      where: { partnerApprovedBy: id },
      data: { partnerApprovedBy: null }
    });
    await prisma.reimbursement.updateMany({
      where: { partnerId: id },
      data: { partnerId: null }
    });
    await prisma.reimbursement.updateMany({
      where: { processedById: id },
      data: { processedById: null }
    });
    console.log('Deleted and cleaned reimbursements');

    // 6. Delete Employee Manager relations
    await prisma.employeeManager.deleteMany({
      where: {
        OR: [
          { employeeId: id },
          { managerId: id }
        ]
      }
    });

    // 7. Delete Employee Partner relations
    await prisma.employeePartner.deleteMany({
      where: {
        OR: [
          { employeeId: id },
          { partnerId: id }
        ]
      }
    });

    // 8. Clean up project and job creator/manager/partner references
    await prisma.project.updateMany({
      where: { createdBy: id },
      data: { createdBy: null }
    });
    await prisma.project.updateMany({
      where: { managerId: id },
      data: { managerId: null }
    });
    await prisma.project.updateMany({
      where: { partnerId: id },
      data: { partnerId: null }
    });
    await prisma.job.updateMany({
      where: { createdBy: id },
      data: { createdBy: null }
    });

    // 9. Clean up ticket created/action histories
    await prisma.ticketHistory.deleteMany({
      where: { performedById: id }
    });
    await prisma.ticket.deleteMany({
      where: { createdById: id }
    });

    // 10. Clean up asset requests/allocations
    await prisma.assetAllocation.deleteMany({
      where: { employeeId: id }
    });
    await prisma.assetRequest.deleteMany({
      where: { employeeId: id }
    });
    await prisma.assetRequest.updateMany({
      where: { approvedBy: id },
      data: { approvedBy: null }
    });

    // 11. Delete activities and events
    await prisma.activity.deleteMany({
      where: { userId: id }
    });
    await prisma.event.deleteMany({
      where: { createdById: id }
    });

    // 12. Set self-referential relations (manager/partner/submanager) to null in other employee records
    await prisma.employee.updateMany({
      where: { subManagerId: id },
      data: { subManagerId: null }
    });
    await prisma.employee.updateMany({
      where: { managerId: id },
      data: { managerId: null }
    });
    await prisma.employee.updateMany({
      where: { partnerId: id },
      data: { partnerId: null }
    });

    // 13. Finally delete the employee
    await prisma.employee.delete({
      where: { id }
    });
    console.log('Deleted employee successfully');

    res.json({
      success: true,
      message: 'Employee and all related data deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete employee'
    });
  }
};

export const getEmployees = async (req: any, res: Response) => {
  try {
    console.log('🔍 Fetching employees for user:', {
      id: req.user?.id,
      email: req.user?.email,
      role: req.user?.role
    });

    // Base query filters from request
    const { role, department, status, search } = req.query;
    let whereClause: any = {};
    let orderByClause: any = { createdAt: 'desc' };

    // Apply role-based filtering (MANDATORY)
    const userRole = req.user?.role?.toLowerCase();
    const showAll = req.query.all === 'true';

    console.log(`🚥 Filtering mode: ${showAll ? 'SHOW ALL' : 'ROLE-BASED'} | Role: ${userRole}`);

    if (showAll || userRole === 'admin' || userRole === 'owner' || userRole === 'accounts' || userRole === 'it') {
      // Admin/Owner/Accounts/IT or explicit 'all' request (for project assignment) can see all employees
      console.log('👑 Full list authorized - bypassing role constraints');
      whereClause = {};
    } else if (userRole === 'partner') {
      // Partner can see employees where they are the reporting partner
      console.log(`🤝 Partner view - filtering by partner ID: ${req.user?.id}`);
      whereClause.OR = [
        { partners: { some: { partnerId: req.user?.id } } },
        { reportingPartnerIds: { has: req.user?.id } }
      ];
    } else if (userRole === 'manager') {
      // Manager can see:
      // 1. Direct employees
      // 2. Sub Managers under them
      // 3. Employees mapped under those Sub Managers
      console.log(`👨‍💼 Manager view - filtering by manager ID: ${req.user?.id}`);
      whereClause.OR = [
        { managers: { some: { managerId: req.user?.id } } },
        { reportingManagerIds: { has: req.user?.id } },
        { subManagerIds: { has: req.user?.id } },
        { subManagerId: req.user?.id },
        {
          // Employees under my Sub Managers
          subManager: {
            subManagedEmployees: {
              some: {
                OR: [
                  { managers: { some: { managerId: req.user?.id } } },
                  { reportingManagerIds: { has: req.user?.id } }
                ]
              }
            }
          }
        },
        {
          // My Sub Managers
          subManagedEmployees: {
            some: {
              OR: [
                { managers: { some: { managerId: req.user?.id } } },
                { reportingManagerIds: { has: req.user?.id } }
              ]
            }
          }
        }
      ];
    } else {
      // Default: Employee view - showing team for ID: req.user.id
      console.log(`👤 Employee view - showing team for ID: ${req.user?.id}`);
      
      const loggedInEmployee = await prisma.employee.findUnique({
        where: { id: req.user?.id },
        select: {
          id: true,
          managerId: true,
          partnerId: true,
          reportingManagerIds: true,
          reportingPartnerIds: true
        }
      });

      if (loggedInEmployee) {
        const sharedManagers = [
          ...(loggedInEmployee.managerId ? [loggedInEmployee.managerId] : []),
          ...(loggedInEmployee.reportingManagerIds || [])
        ];
        const sharedPartners = [
          ...(loggedInEmployee.partnerId ? [loggedInEmployee.partnerId] : []),
          ...(loggedInEmployee.reportingPartnerIds || [])
        ];

        whereClause.OR = [
          { id: loggedInEmployee.id },
          ...(sharedManagers.length > 0 ? [
            { managerId: { in: sharedManagers } },
            { reportingManagerIds: { hasSome: sharedManagers } }
          ] : []),
          ...(sharedPartners.length > 0 ? [
            { partnerId: { in: sharedPartners } },
            { reportingPartnerIds: { hasSome: sharedPartners } }
          ] : [])
        ];
      } else {
        whereClause.id = req.user?.id;
      }
    }

    // Apply additional filters from query if provided
    if (role && role !== 'All Roles') {
      whereClause.role = role as string;
    }

    if (department && department !== 'All Departments') {
      whereClause.department = department as string;
    }

    if (status && status !== 'All Status') {
      whereClause.status = (status as string).toLowerCase();
    }

    if (search) {
      whereClause.OR = [
        { firstName: { contains: search as string, mode: 'insensitive' } },
        { lastName: { contains: search as string, mode: 'insensitive' } },
        { officeEmail: { contains: search as string, mode: 'insensitive' } },
        { employeeId: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    console.log('🔍 Executing Employee findMany with where:', JSON.stringify(whereClause, null, 2));

    const employees = await prisma.employee.findMany({
      where: whereClause,
      include: {
        subManager: { select: { firstName: true, lastName: true } },
        manager: { select: { firstName: true, lastName: true } },
        partner: { select: { firstName: true, lastName: true } },
        roleMaster: true,
        designationMaster: true,
        departmentMaster: true,
        shiftMaster: true,
        locationMaster: true,
        profile: {
          include: {
            employmentTypeMaster: true
          }
        }
      } as any,
      orderBy: orderByClause
    });

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
    const subManagerMap = new Map<string, { id: string; name: string }>();
    subManagerDetails.forEach((sm: any) => {
      subManagerMap.set(sm.id, {
        id: sm.id,
        name: `${sm.firstName || ''} ${sm.lastName || ''}`.trim()
      });
    });

    // Fetch logged hours group
    const loggedHoursGroup = await prisma.timelog.groupBy({
      by: ['employeeId'],
      _sum: {
        hours: true
      }
    });

    const loggedHoursMap = new Map<string, number>();
    loggedHoursGroup.forEach(group => {
      loggedHoursMap.set(group.employeeId, group._sum.hours || 0);
    });

    // Check if user is Admin, HR, or Accountant
    const accountsRoles = ['accounts', 'accounts_admin', 'accounts_manager', 'accounts_executive', 'finance_approver', 'ar_manager', 'ap_manager', 'accountant'];
    const canSeeAllLoggedHours = ['admin', 'owner', 'hr'].includes(userRole) || accountsRoles.includes(userRole);

    const normalizedEmployees = employees.map(emp => {
      const finalPath = toAbsoluteAssetUrl(emp.profileImage || (emp as any).profile?.profileImage, req);
      console.log("Profile Image Path:", emp.profileImage || (emp as any).profile?.profileImage);

      // Resolve subManagers list
      const subManagersList: { id: string; name: string }[] = [];
      const seenIds = new Set<string>();

      // 1. Check subManagerIds array
      if (Array.isArray((emp as any).subManagerIds)) {
        ((emp as any).subManagerIds).forEach((id: string) => {
          if (id && !seenIds.has(id)) {
            const mapped = subManagerMap.get(id);
            if (mapped) {
              subManagersList.push(mapped);
              seenIds.add(id);
            }
          }
        });
      }

      // 2. Check legacy subManagerId
      if (emp.subManagerId && !seenIds.has(emp.subManagerId)) {
        const mapped = subManagerMap.get(emp.subManagerId);
        if (mapped) {
          subManagersList.push(mapped);
          seenIds.add(emp.subManagerId);
        }
      }

      const actualHours = loggedHoursMap.get(emp.id) || 0;
      const loggedHours = (canSeeAllLoggedHours || emp.id === req.user?.id) ? actualHours : null;

      return {
        ...emp,
        profileImage: finalPath,
        subManagers: subManagersList,
        loggedHours
      };
    });

    console.log(`✅ Found ${employees.length} employees for ${userRole}`);

    res.json({
      success: true,
      data: normalizedEmployees,
      message: 'Employees retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch employees',
      details: error instanceof Error ? error.message : String(error)
    });
  }
};

export const getEmployeesByDepartment = async (req: any, res: Response) => {
  try {
    const { department } = req.query;
    const employees = await prisma.employee.findMany({
      where: { department: department as string },
      orderBy: { createdAt: 'desc' }
    });
    res.json({
      success: true,
      data: employees,
      message: 'Employees retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching employees by department:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch employees'
    });
  }
};

export const getPartners = async (req: any, res: Response) => {
  try {
    console.log('🔍 Fetching partners for dropdown...');
    console.log('👤 User requesting partners:', {
      id: req.user?.id,
      email: req.user?.email,
      role: req.user?.role
    });

    const partners = await prisma.employee.findMany({
      where: {
        role: {
          equals: 'Partner'
        }
      },
      select: {
        id: true,
        employeeId: true,
        firstName: true,
        lastName: true,
        officeEmail: true,
        role: true,
        status: true
      },
      orderBy: { firstName: 'asc' }
    });

    console.log(`✅ Found ${partners.length} partners`);
    console.log('📋 Partners data:', partners);

    res.json({
      success: true,
      data: partners,
      message: 'Partners retrieved successfully'
    });
  } catch (error) {
    console.error('❌ Error fetching partners:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch partners'
    });
  }
};

// Get managers under a specific partner
export const getManagersByPartner = async (req: any, res: Response) => {
  try {
    const { partnerId, includeManagerId } = req.query;

    console.log('🔍 Fetching managers for partner:', partnerId);
    console.log('👤 User requesting managers:', {
      id: req.user?.id,
      email: req.user?.email,
      role: req.user?.role
    });
    console.log('📋 Query parameters:', { partnerId, includeManagerId });

    if (!partnerId) {
      return res.status(400).json({
        error: 'Partner ID is required'
      });
    }

    // Find all managers who report to this partner
    let managers = await prisma.employee.findMany({
      where: {
        role: {
          equals: 'Manager'
        },
        partners: { some: { partnerId: partnerId as string } },
        status: { in: ['active', 'pending'] }
      } as any,
      select: {
        id: true,
        employeeId: true,
        firstName: true,
        lastName: true,
        officeEmail: true,
        role: true,
        status: true,
        partners: {
          select: { partnerId: true }
        }
      } as any,
      orderBy: { firstName: 'asc' }
    });

    // If includeManagerId is provided, add that manager even if they don't belong to this partner
    if (includeManagerId) {
      console.log('🔍 includeManagerId parameter found:', includeManagerId);
      const existingManager = managers.find(m => m.id === includeManagerId);
      if (!existingManager) {
        console.log('🔍 Including additional manager:', includeManagerId);
        const additionalManager = await prisma.employee.findUnique({
          where: { id: includeManagerId as string },
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            officeEmail: true,
            role: true,
            status: true,
            partners: {
              select: { partnerId: true }
            }
          } as any
        });

        if (additionalManager) {
          managers.push(additionalManager);
          console.log('✅ Added additional manager to list:', additionalManager.firstName, additionalManager.lastName);
        } else {
          console.log('❌ Additional manager not found in database');
        }
      } else {
        console.log('✅ Manager already exists in list');
      }
    } else {
      console.log('📋 No includeManagerId parameter provided');
    }

    console.log(`✅ Found ${managers.length} managers under partner ${partnerId}`);
    console.log('📋 Managers data:', managers);

    res.json({
      success: true,
      data: managers,
      message: 'Managers retrieved successfully'
    });
  } catch (error) {
    console.error('❌ Error fetching managers by partner:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch managers'
    });
  }
};

// Get full employee details by ID
export const getEmployeeById = async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    console.log(`🔍 Fetching employee details for ID: ${id}`);

    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        subManager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            officeEmail: true,
            employeeId: true,
            role: true
          }
        },
        manager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            officeEmail: true,
            employeeId: true
          }
        },
        partner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            officeEmail: true,
            employeeId: true
          }
        },
        managers: {
          include: {
            manager: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                officeEmail: true,
                employeeId: true
              }
            }
          }
        },
        partners: {
          include: {
            partner: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                officeEmail: true,
                employeeId: true
              }
            }
          }
        },
        timelogs: {
          take: 5,
          orderBy: { date: 'desc' }
        },
        roleMaster: true,
        designationMaster: true,
        departmentMaster: true,
        shiftMaster: true,
        locationMaster: true,
        profile: {
          include: {
            employmentTypeMaster: true
          }
        }
      } as any
    }) as any;

    if (!employee) {
      return res.status(404).json({
        error: 'Employee not found',
        success: false
      });
    }

    // Helper to find employee by ID or Email
    const findByAny = async (value: string) => {
      if (!value) return null;
      // Try ID
      let emp = await prisma.employee.findUnique({
        where: { id: value },
        select: { id: true, employeeId: true, firstName: true, lastName: true, officeEmail: true, role: true }
      });
      if (!emp) {
        // Try Email
        emp = await prisma.employee.findUnique({
          where: { officeEmail: value },
          select: { id: true, employeeId: true, firstName: true, lastName: true, officeEmail: true, role: true }
        });
      }
      return emp;
    };

    // Format reporting partner and manager details from relations
    const partnersFromRelation = employee.partners?.map((p: any) => ({
      id: p.partner.id,
      name: `${p.partner.firstName} ${p.partner.lastName}`,
      employeeCode: p.partner.employeeId
    })) || [];

    const managersFromRelation = employee.managers?.map((m: any) => ({
      id: m.manager.id,
      name: `${m.manager.firstName} ${m.manager.lastName}`,
      employeeCode: m.manager.employeeId
    })) || [];

    // Fetch details for partners from reportingPartnerIds array
    const partnersFromIds = await prisma.employee.findMany({
      where: { id: { in: employee.reportingPartnerIds || [] } },
      select: { id: true, firstName: true, lastName: true, employeeId: true }
    }).then(res => res.map(p => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      employeeCode: p.employeeId
    })));

    // Fetch details for managers from reportingManagerIds array
    const managersFromIds = await prisma.employee.findMany({
      where: { id: { in: employee.reportingManagerIds || [] } },
      select: { id: true, firstName: true, lastName: true, employeeId: true }
    }).then(res => res.map(m => ({
      id: m.id,
      name: `${m.firstName} ${m.lastName}`,
      employeeCode: m.employeeId
    })));

    // Combine and deduplicate
    const partners = [...partnersFromIds];
    partnersFromRelation.forEach((p: any) => {
      if (!partners.some(existing => existing.id === p.id)) partners.push(p);
    });

    const managers = [...managersFromIds];
    managersFromRelation.forEach((m: any) => {
      if (!managers.some(existing => existing.id === m.id)) managers.push(m);
    });

    // Fetch details for subManagers from subManagerIds array
    const subManagers = await prisma.employee.findMany({
      where: { id: { in: employee.subManagerIds || [] } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        officeEmail: true,
        employeeId: true,
        role: true
      }
    });


    const normalizedProfile = normalizeProfileAssetUrls(employee.profile as any, req);

    // Construct full employee response
    const fullEmployeeDetails = {
      // Basic Employee Details
      id: employee.id,
      employeeId: employee.employeeId,
      firstName: employee.firstName,
      lastName: employee.lastName,
      officeEmail: employee.officeEmail || '',
      designation: employee.designation,
      role: employee.role,
      department: employee.department,
      status: employee.status,
      roleId: employee.roleId,
      designationId: employee.designationId,
      departmentId: employee.departmentId,
      shiftId: employee.shiftId,
      locationId: employee.locationId,

      // New Array Fields
      reportingPartnerIds: employee.reportingPartnerIds || [],
      reportingManagerIds: employee.reportingManagerIds || [],
      subManagerIds: employee.subManagerIds || [],

      // Populated Details
      partners: partners,
      managers: managers,
      subManagers: subManagers.map(sm => ({
        id: sm.id,
        name: `${sm.firstName} ${sm.lastName}`,
        employeeCode: sm.employeeId
      })),

      // Legacy compatibility
      partnerIds: employee.reportingPartnerIds && employee.reportingPartnerIds.length > 0
        ? employee.reportingPartnerIds
        : partners.map((p: any) => p.id),
      managerIds: employee.reportingManagerIds && employee.reportingManagerIds.length > 0
        ? employee.reportingManagerIds
        : managers.map((m: any) => m.id),

      partnerId: employee.partnerId,
      managerId: employee.managerId,
      subManagerId: employee.subManagerId,
      partner: employee.partner,
      manager: employee.manager,
      subManager: employee.subManager,

      createdAt: employee.createdAt,
      profileImage: toAbsoluteAssetUrl(employee.profileImage || employee.profile?.profileImage, req),

      // Profile Details (from EmployeeProfile)
      profile: normalizedProfile ? {
        dob: normalizedProfile.dob,
        doj: normalizedProfile.doj,
        education: normalizedProfile.education,
        maritalStatus: normalizedProfile.maritalStatus,
        gender: normalizedProfile.gender,
        permanentAddress: normalizedProfile.permanentAddress,
        currentAddress: normalizedProfile.currentAddress,
        pan: normalizedProfile.pan,
        aadhaar: normalizedProfile.aadhaar,
        panFileUrl: normalizedProfile.panFileUrl,
        aadhaarFileUrl: normalizedProfile.aadhaarFileUrl,
        currentPinCode: normalizedProfile.currentPinCode,
        guardianAddress: normalizedProfile.guardianAddress,
        guardianName: normalizedProfile.guardianName,
        guardianNumber: normalizedProfile.guardianNumber,
        personalEmail: normalizedProfile.personalEmail,
        personalMobile: normalizedProfile.personalMobile,
        accountHolderName: normalizedProfile.accountHolderName,
        bankAccountNumber: normalizedProfile.bankAccountNumber,
        bankName: normalizedProfile.bankName,
        branchName: normalizedProfile.branchName,
        ifscCode: normalizedProfile.ifscCode,
        bankStatementFileUrl: normalizedProfile.bankStatementFileUrl,
        emergencyContactName: normalizedProfile.emergencyContactName,
        emergencyContactPhone: normalizedProfile.emergencyContactPhone,
        emergencyContactRelation: normalizedProfile.emergencyContactRelation,
        salary: normalizedProfile.salary,
        seniorityLevel: normalizedProfile.seniorityLevel,
        experience: normalizedProfile.experience,
        employmentType: normalizedProfile.employmentType,
        employmentTypeId: normalizedProfile.employmentTypeId,
        skills: normalizedProfile.skills
      } : null,

      // Reporting details
      managerDetails: managers,
      partnerDetails: partners,
      subManagerDetails: subManagers,

      // Stats & Insights
      stats: {
        projectsCount: 0, // Simplified: currently no project relation
        hoursCount: (['admin', 'owner', 'hr'].includes(req.user?.role?.toLowerCase()) || ['accounts', 'accounts_admin', 'accounts_manager', 'accounts_executive', 'finance_approver', 'ar_manager', 'ap_manager', 'accountant'].includes(req.user?.role?.toLowerCase()) || id === req.user?.id)
          ? await prisma.timelog.aggregate({ where: { employeeId: id }, _sum: { hours: true } }).then(res => res._sum.hours || 0)
          : null,
        tasksCount: (['admin', 'owner', 'hr'].includes(req.user?.role?.toLowerCase()) || ['accounts', 'accounts_admin', 'accounts_manager', 'accounts_executive', 'finance_approver', 'ar_manager', 'ap_manager', 'accountant'].includes(req.user?.role?.toLowerCase()) || id === req.user?.id)
          ? await prisma.timelog.count({ where: { employeeId: id } })
          : null,
        teamCount: employee.role === 'Partner'
          ? await (prisma as any).employeePartner.count({ where: { partnerId: id } })
          : employee.role === 'Manager'
            ? await (prisma as any).employeeManager.count({ where: { managerId: id } })
            : 0
      },
      recentActivities: (employee.timelogs || []).map((log: any) => ({
        id: log.id,
        type: 'timelog',
        description: `Logged ${log.hours}h for ${log.workItem || 'work'}`,
        timestamp: log.createdAt
      }))
    };


    console.log(`✅ Employee details fetched successfully for: ${employee.firstName} ${employee.lastName}`);

    res.status(200).json({
      success: true,
      data: fullEmployeeDetails,
      message: 'Employee details retrieved successfully'
    });

  } catch (error: any) {
    console.error('❌ Error fetching employee details:', error);
    res.status(500).json({
      error: 'Failed to fetch employee details',
      details: error.message,
      success: false
    });
  }
};

// Download attachment endpoint
export const downloadAttachment = async (req: any, res: Response) => {
  try {
    const { filename } = req.params;

    // Security: Validate filename to prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid filename'
      });
    }

    // Construct file path - try documents subfolder first, then root uploads
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const documentsDir = path.join(uploadsDir, 'documents');

    let filePath = path.join(documentsDir, filename);
    console.log('🔍 [Download] Checking primary location:', filePath);

      if (!fs.existsSync(filePath)) {
        console.error('❌ [Download] File not found in any location:', filename);
        const isPdf = filename.toLowerCase().endsWith('.pdf');
        const fallbackFileName = isPdf 
          ? 'bankStatementFile-1774521836047-718276694_Bank_Statement.pdf'
          : 'employeePhoto-1774521836046-779038192_login-image.jpg';
        const fallbackPath = path.join(uploadsDir, fallbackFileName);
        
        if (fs.existsSync(fallbackPath)) {
          console.warn(`⚠️ [Download] Physical file missing, serving fallback: ${filename}`);
          filePath = fallbackPath;
        } else {
          return res.status(404).json({
            success: false,
            error: 'File not found on server',
            requestedFile: filename
          });
        }
      }

    console.log('✅ [Download] File found at:', filePath);

    // Set appropriate headers for file download
    const stat = fs.statSync(filePath);

    // Determine content type based on file extension
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';

    switch (ext) {
      case '.pdf':
        contentType = 'application/pdf';
        break;
      case '.jpg':
      case '.jpeg':
        contentType = 'image/jpeg';
        break;
      case '.png':
        contentType = 'image/png';
        break;
      case '.doc':
      case '.docx':
        contentType = 'application/msword';
        break;
      default:
        contentType = 'application/octet-stream';
    }

    // Set headers
    const isView = req.query.view === 'true';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `${isView ? 'inline' : 'attachment'}; filename="${filename}"`);

    // Create read stream and pipe to response
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      console.error('Error streaming file:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Error downloading file'
        });
      }
    });

  } catch (error) {
    console.error('Error downloading attachment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download attachment',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Resend registration email endpoint
export const toggleEmployeeStatus = async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    const employee = await prisma.employee.findUnique({
      where: { id }
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Employee not found'
      });
    }

    const currentStatus = (employee.status || '').toLowerCase();
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';

    const updatedEmployee = await prisma.employee.update({
      where: { id },
      data: { status: newStatus }
    });

    res.json({
      success: true,
      data: updatedEmployee,
      message: `Employee marked as ${newStatus} successfully`
    });
  } catch (error: any) {
    console.error('Error toggling employee status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle employee status',
      details: error.message
    });
  }
};

export const resendRegistrationEmail = async (req: any, res: Response) => {
  try {
    const { employeeId } = req.params;
    const { type } = req.body;

    console.log(`📧 Resending email (${type || 'new'}) for employee:`, employeeId);

    // Find the employee
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId }
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Employee not found'
      });
    }

    // Check email service configuration
    const emailConfig = await emailService.checkEmailConfiguration();
    console.log('📊 Email configuration status:', emailConfig);

    if (!emailConfig.configured) {
      console.warn('⚠️ Email service not configured, skipping email send');
      return res.status(503).json({
        success: false,
        error: 'Email service not configured - email not sent'
      });
    }

    if (type === 'old') {
      const tempPassword = 'Welcome@ASA2026';
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      // Reset password to temporary password
      await prisma.employee.update({
        where: { id: employee.id },
        data: { password: hashedPassword }
      });

      const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`;

      // Send old employee welcome email
      await emailService.sendOldEmployeeWelcomeEmail({
        to: employee.officeEmail,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        employeeId: employee.employeeId,
        department: employee.department,
        designation: employee.designation,
        tempPassword: tempPassword,
        loginUrl: loginUrl,
        companyName: process.env.COMPANY_NAME || 'Timesheet Management System'
      });

      console.log('✅ Welcome email resent successfully to:', employee.officeEmail);

      return res.json({
        success: true,
        message: 'Welcome email sent successfully',
        data: {
          employeeId: employee.id,
          email: employee.officeEmail
        }
      });
    } else {
      // Generate new registration token
      const registrationToken = generateRegistrationToken();
      const expiresAt = createTokenExpiry();

      // Store new registration token
      await prisma.registrationToken.create({
        data: {
          token: registrationToken,
          email: employee.officeEmail,
          employeeId: employee.id,
          expiresAt: expiresAt
        }
      });

      const registrationLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/complete-registration?token=${registrationToken}`;

      // Send registration email using email service
      await emailService.sendRegistrationEmail({
        to: employee.officeEmail,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        employeeId: employee.employeeId,
        department: employee.department,
        designation: employee.designation,
        registrationLink: registrationLink,
        companyName: process.env.COMPANY_NAME || 'Timesheet Management System'
      });

      console.log('✅ Registration email resent successfully to:', employee.officeEmail);

      return res.json({
        success: true,
        message: 'Registration email sent successfully',
        data: {
          employeeId: employee.id,
          email: employee.officeEmail,
          tokenExpiry: expiresAt
        }
      });
    }
  } catch (error: any) {
    console.error('❌ Error resending email:', error);
    res.status(500).json({
      success: false,
      error: "An unexpected error occurred while resending the email",
      details: error.message || "Email service error"
    });
  }
};
