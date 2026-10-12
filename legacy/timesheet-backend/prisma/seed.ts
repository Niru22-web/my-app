import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const employees = [
  {
    firstName: 'Niranjan',
    lastName: 'Mulam',
    officeEmail: 'niranjan.mulam@asaind.co.in',
    designation: 'Software Developer',
    department: 'IT',
    role: 'admin',
    status: 'active',
    password: 'password123'
  },
  {
    firstName: 'John',
    lastName: 'Doe',
    officeEmail: 'john.doe@company.com',
    designation: 'Senior Developer',
    department: 'IT',
    role: 'user',
    status: 'active',
    password: 'password123'
  },
  {
    firstName: 'Jane',
    lastName: 'Smith',
    officeEmail: 'jane.smith@company.com',
    designation: 'Project Manager',
    department: 'IT',
    role: 'manager',
    status: 'active',
    password: 'password123'
  },
  {
    firstName: 'Mike',
    lastName: 'Johnson',
    officeEmail: 'mike.johnson@company.com',
    designation: 'Team Lead',
    department: 'IT',
    role: 'manager',
    status: 'active',
    password: 'password123'
  },
  {
    firstName: 'Sarah',
    lastName: 'Williams',
    officeEmail: 'sarah.williams@company.com',
    designation: 'UI/UX Designer',
    department: 'Design',
    role: 'user',
    status: 'active',
    password: 'password123'
  },
  {
    firstName: 'David',
    lastName: 'Brown',
    officeEmail: 'david.brown@company.com',
    designation: 'DevOps Engineer',
    department: 'IT',
    role: 'user',
    status: 'active',
    password: 'password123'
  },
  {
    firstName: 'Emily',
    lastName: 'Davis',
    officeEmail: 'emily.davis@company.com',
    designation: 'QA Engineer',
    department: 'IT',
    role: 'user',
    status: 'active',
    password: 'password123'
  },
  {
    firstName: 'Robert',
    lastName: 'Miller',
    officeEmail: 'robert.miller@company.com',
    designation: 'Business Analyst',
    department: 'Business',
    role: 'user',
    status: 'active',
    password: 'password123'
  },
  {
    firstName: 'Lisa',
    lastName: 'Wilson',
    officeEmail: 'lisa.wilson@company.com',
    designation: 'HR Manager',
    department: 'HR',
    role: 'admin',
    status: 'active',
    password: 'password123'
  }
];

const employeeProfiles = [
  {
    dob: new Date('1995-01-01'),
    doj: new Date('2023-01-01'),
    education: 'B.Tech Computer Science',
    maritalStatus: 'Single',
    gender: 'Male',
    permanentAddress: '123 Main St, City, State 12345',
    currentAddress: '456 Oak Ave, City, State 12345',
    pan: 'NIRAN1234F',
    aadhaar: '123456789012'
  },
  {
    dob: new Date('1990-05-15'),
    doj: new Date('2020-01-15'),
    education: 'B.Tech Computer Science',
    maritalStatus: 'Single',
    gender: 'Male',
    permanentAddress: '123 Main St, City, State 12345',
    currentAddress: '456 Oak Ave, City, State 12345',
    pan: 'ABCDE1234F',
    aadhaar: '123456789012'
  },
  {
    dob: new Date('1988-08-22'),
    doj: new Date('2019-03-10'),
    education: 'MBA',
    maritalStatus: 'Married',
    gender: 'Female',
    permanentAddress: '789 Elm St, City, State 67890',
    currentAddress: '321 Pine Rd, City, State 67890',
    pan: 'FGHIJ5678K',
    aadhaar: '345678901234'
  },
  {
    dob: new Date('1985-12-10'),
    doj: new Date('2018-06-01'),
    education: 'M.Tech Software Engineering',
    maritalStatus: 'Married',
    gender: 'Male',
    permanentAddress: '456 Maple Dr, City, State 11111',
    currentAddress: '789 Cedar Ln, City, State 11111',
    pan: 'KLMNO9012P',
    aadhaar: '567890123456'
  },
  {
    dob: new Date('1992-03-25'),
    doj: new Date('2021-02-15'),
    education: 'B.Des Graphic Design',
    maritalStatus: 'Single',
    gender: 'Female',
    permanentAddress: '321 Birch Blvd, City, State 22222',
    currentAddress: '654 Spruce Way, City, State 22222',
    pan: 'PQRST3456U',
    aadhaar: '789012345678'
  },
  {
    dob: new Date('1987-07-18'),
    doj: new Date('2019-09-20'),
    education: 'B.Sc Computer Science',
    maritalStatus: 'Single',
    gender: 'Male',
    permanentAddress: '987 Redwood Sq, City, State 33333',
    currentAddress: '147 Fir Ct, City, State 33333',
    pan: 'UVWXY7890Z',
    aadhaar: '890123456789'
  },
  {
    dob: new Date('1993-11-30'),
    doj: new Date('2020-07-01'),
    education: 'B.Tech Information Technology',
    maritalStatus: 'Single',
    gender: 'Female',
    permanentAddress: '258 Oak Terr, City, State 44444',
    currentAddress: '369 Pine Pl, City, State 44444',
    pan: 'ZABCD1234E',
    aadhaar: '901234567890'
  },
  {
    dob: new Date('1986-04-12'),
    doj: new Date('2018-11-15'),
    education: 'B.Com',
    maritalStatus: 'Married',
    gender: 'Male',
    permanentAddress: '741 Elm Dr, City, State 55555',
    currentAddress: '852 Maple Ave, City, State 55555',
    pan: 'EFGHI5678J',
    aadhaar: '012345678901'
  },
  {
    dob: new Date('1984-09-08'),
    doj: new Date('2017-05-10'),
    education: 'MA HR',
    maritalStatus: 'Married',
    gender: 'Female',
    permanentAddress: '963 Cedar St, City, State 66666',
    currentAddress: '147 Birch Rd, City, State 66666',
    pan: 'JKLMN9012O',
    aadhaar: '234567890123'
  }
];

async function generateEmployeeId(): Promise<string> {
  const lastEmployee = await prisma.employee.findFirst({
    orderBy: { employeeId: 'desc' }
  });
  
  if (!lastEmployee) {
    return 'EMP001';
  }
  
  const lastNumber = parseInt(lastEmployee.employeeId.replace('EMP', ''));
  const newNumber = lastNumber + 1;
  return `EMP${newNumber.toString().padStart(3, '0')}`;
}

async function main() {
  console.log('🌱 Starting database seeding...');

  try {
    // Clean existing data
    console.log('🧹 Cleaning existing data...');
    // Reimbursement children
    await prisma.reimbursementLog.deleteMany();
    await prisma.reimbursementAttachment.deleteMany();
    await prisma.reimbursement.deleteMany();

    // Asset Management Cleans
    await prisma.assetAllocation.deleteMany();
    await prisma.assetInventoryHistory.deleteMany();
    await prisma.assetRequestHistory.deleteMany();
    await prisma.assetMaintenance.deleteMany();
    await prisma.assetRequest.deleteMany();
    await prisma.assetInventory.deleteMany();
    await prisma.vendor.deleteMany();
    await prisma.location.deleteMany();
    await prisma.assetType.deleteMany();
    await prisma.assetCategory.deleteMany();
    await prisma.assetReport.deleteMany();
    await prisma.employee_asset.deleteMany();

    // HelpDesk & General Cleans
    await prisma.ticketHistory.deleteMany();
    await prisma.ticket.deleteMany();
    await prisma.helpdeskCategory.deleteMany();
    await prisma.timelog.deleteMany();
    await prisma.projectUser.deleteMany();
    await prisma.jobUser.deleteMany();
    await prisma.job.deleteMany();
    await prisma.project.deleteMany();
    
    // Attendance Cleans
    await prisma.attendance_sessions.deleteMany();
    await prisma.attendance_log.deleteMany();
    await prisma.attendance.deleteMany();

    // Leave & Document Cleans
    await prisma.leave.deleteMany();
    await prisma.leaveBalance.deleteMany();
    await prisma.employeeDocument.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.event.deleteMany();

    // Employee Cleans
    await prisma.employeeProfile.deleteMany();
    await prisma.userPermission.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.employeeManager.deleteMany();
    await prisma.employeePartner.deleteMany();
    await prisma.registrationToken.deleteMany();
    await prisma.emailConnection.deleteMany();
    await prisma.employee.deleteMany();
    console.log('✅ Existing data cleaned');

    // Create employees
    console.log('👥 Creating employees...');
    const createdEmployees: any[] = [];
    for (let i = 0; i < employees.length; i++) {
      const emp = employees[i];
      const profile = employeeProfiles[i];
      
      const employeeId = await generateEmployeeId();
      const hashedPassword = await bcrypt.hash(emp.password, 10);
      
      const employee = await prisma.employee.create({
        data: {
          employeeId,
          firstName: emp.firstName,
          lastName: emp.lastName,
          officeEmail: emp.officeEmail,
          designation: emp.designation,
          department: emp.department,
          role: emp.role,
          status: emp.status,
          password: hashedPassword,
        }
      });
      createdEmployees.push(employee);
      
      // Create employee profile
      await prisma.employeeProfile.create({
        data: {
          employeeId: employee.id,
          dob: profile.dob,
          doj: profile.doj,
          education: profile.education,
          maritalStatus: profile.maritalStatus,
          gender: profile.gender,
          permanentAddress: profile.permanentAddress,
          currentAddress: profile.currentAddress,
          pan: profile.pan,
          aadhaar: profile.aadhaar,
        }
      });
      
      console.log(`✅ Created employee: ${emp.firstName} ${emp.lastName} (${employeeId})`);

      // If this is the admin user (Niranjan), give him custom user permissions as well
      if (emp.officeEmail === 'niranjan.mulam@asaind.co.in') {
        await prisma.userPermission.create({
          data: {
            userId: employee.id,
            dashboardView: true,
            dashboardCreate: true,
            dashboardEdit: true,
            dashboardDelete: true,
            timesheetView: true,
            timesheetCreate: true,
            timesheetEdit: true,
            timesheetDelete: true,
            projectsView: true,
            projectsCreate: true,
            projectsEdit: true,
            projectsDelete: true,
            reportsView: true,
            reportsCreate: true,
            reportsEdit: true,
            reportsDelete: true,
            employeesView: true,
            employeesCreate: true,
            employeesEdit: true,
            employeesDelete: true,
            adminPanelView: true,
            adminPanelCreate: true,
            adminPanelEdit: true,
            adminPanelDelete: true,
            inboxView: true,
            inboxCreate: true,
            inboxEdit: true,
            inboxDelete: true,
            calendarView: true,
            calendarCreate: true,
            calendarEdit: true,
            calendarDelete: true,
            complianceView: true,
            complianceCreate: true,
            complianceEdit: true,
            complianceDelete: true,
            helpDeskView: true,
            helpDeskCreate: true,
            helpDeskEdit: true,
            helpDeskDelete: true,
            assetManagementView: true,
            assetManagementCreate: true,
            assetManagementEdit: true,
            assetManagementDelete: true,
            accountsView: true,
            accountsCreate: true,
            accountsEdit: true,
            accountsDelete: true,
          }
        });
        console.log(`✅ Created custom permissions for ${emp.firstName}`);
      }
    }

    // Create Role Permissions
    console.log('🔐 Creating role permissions...');
    const roles = [
      {
        role: 'admin',
        dashboardView: true, dashboardCreate: true, dashboardEdit: true, dashboardDelete: true,
        timesheetView: true, timesheetCreate: true, timesheetEdit: true, timesheetDelete: true,
        projectsView: true, projectsCreate: true, projectsEdit: true, projectsDelete: true,
        reportsView: true, reportsCreate: true, reportsEdit: true, reportsDelete: true,
        employeesView: true, employeesCreate: true, employeesEdit: true, employeesDelete: true,
        adminPanelView: true, adminPanelCreate: true, adminPanelEdit: true, adminPanelDelete: true,
        inboxView: true, inboxCreate: true, inboxEdit: true, inboxDelete: true,
        calendarView: true, calendarCreate: true, calendarEdit: true, calendarDelete: true,
        complianceView: true, complianceCreate: true, complianceEdit: true, complianceDelete: true,
        helpDeskView: true, helpDeskCreate: true, helpDeskEdit: true, helpDeskDelete: true,
        assetManagementView: true, assetManagementCreate: true, assetManagementEdit: true, assetManagementDelete: true,
        accountsView: true, accountsCreate: true, accountsEdit: true, accountsDelete: true,
      },
      {
        role: 'manager',
        dashboardView: true, dashboardCreate: false, dashboardEdit: false, dashboardDelete: false,
        timesheetView: true, timesheetCreate: true, timesheetEdit: true, timesheetDelete: false,
        projectsView: true, projectsCreate: true, projectsEdit: true, projectsDelete: false,
        reportsView: true, reportsCreate: true, reportsEdit: false, reportsDelete: false,
        employeesView: true, employeesCreate: false, employeesEdit: false, employeesDelete: false,
        adminPanelView: false, adminPanelCreate: false, adminPanelEdit: false, adminPanelDelete: false,
        inboxView: true, inboxCreate: true, inboxEdit: true, inboxDelete: false,
        calendarView: true, calendarCreate: true, calendarEdit: true, calendarDelete: false,
        complianceView: true, complianceCreate: true, complianceEdit: true, complianceDelete: false,
        helpDeskView: true, helpDeskCreate: true, helpDeskEdit: true, helpDeskDelete: false,
        assetManagementView: true, assetManagementCreate: true, assetManagementEdit: true, assetManagementDelete: false,
        accountsView: false, accountsCreate: false, accountsEdit: false, accountsDelete: false,
      },
      {
        role: 'user',
        dashboardView: true, dashboardCreate: false, dashboardEdit: false, dashboardDelete: false,
        timesheetView: true, timesheetCreate: true, timesheetEdit: true, timesheetDelete: false,
        projectsView: true, projectsCreate: false, projectsEdit: false, projectsDelete: false,
        reportsView: true, reportsCreate: false, reportsEdit: false, reportsDelete: false,
        employeesView: false, employeesCreate: false, employeesEdit: false, employeesDelete: false,
        adminPanelView: false, adminPanelCreate: false, adminPanelEdit: false, adminPanelDelete: false,
        inboxView: true, inboxCreate: true, inboxEdit: true, inboxDelete: false,
        calendarView: true, calendarCreate: true, calendarEdit: true, calendarDelete: false,
        complianceView: true, complianceCreate: false, complianceEdit: false, complianceDelete: false,
        helpDeskView: true, helpDeskCreate: true, helpDeskEdit: true, helpDeskDelete: false,
        assetManagementView: true, assetManagementCreate: true, assetManagementEdit: true, assetManagementDelete: false,
        accountsView: false, accountsCreate: false, accountsEdit: false, accountsDelete: false,
      }
    ];

    for (const roleDef of roles) {
      await prisma.rolePermission.create({
        data: roleDef
      });
    }
    console.log('✅ Created default role permissions');

    // --- Asset Management Seeding ---
    console.log('📦 Seeding Asset Management data...');

    // 1. Seed Locations
    console.log('📍 Seeding Locations...');
    const locationsData = [
      { name: 'Headquarters' },
      { name: 'Mumbai Office' },
      { name: 'Bangalore Tech Hub' }
    ];
    for (const loc of locationsData) {
      await prisma.location.create({ data: loc });
    }
    console.log('✅ Locations seeded');

    // 2. Seed Vendors
    console.log('🏢 Seeding Vendors...');
    const appleVendor = await prisma.vendor.create({
      data: {
        vendorName: 'Apple India Reseller',
        company: 'Apple Inc.',
        email: 'sales@apple.in',
        phone: '+91 9999999999',
        address: 'BKC, Mumbai',
        gstNumber: '27AAAAA1111A1Z1',
        contactPerson: 'Aditya Sen'
      }
    });

    const dellVendor = await prisma.vendor.create({
      data: {
        vendorName: 'Dell Business Direct',
        company: 'Dell Technologies',
        email: 'corp-sales@dell.in',
        phone: '+91 8888888888',
        address: 'Indiranagar, Bangalore',
        gstNumber: '29BBBBB2222B2Z2',
        contactPerson: 'Rohan Hegde'
      }
    });

    const primeVendor = await prisma.vendor.create({
      data: {
        vendorName: 'Prime IT Solutions',
        company: 'Prime Hardware Ltd.',
        email: 'support@primeit.in',
        phone: '+91 7777777777',
        address: 'Andheri West, Mumbai',
        gstNumber: '27CCCCC3333C3Z3',
        contactPerson: 'Vikram Mehta'
      }
    });
    console.log('✅ Vendors seeded');

    // 3. Seed Categories & Types
    console.log('🏷️ Seeding Asset Categories and Types...');
    const hardwareCat = await prisma.assetCategory.create({
      data: { name: 'Hardware', category: 'Hardware' }
    });
    const softwareCat = await prisma.assetCategory.create({
      data: { name: 'Software', category: 'Software' }
    });

    const laptopType = await prisma.assetType.create({
      data: { name: 'Laptop', assetCategoryId: hardwareCat.id }
    });
    const monitorType = await prisma.assetType.create({
      data: { name: 'Monitor', assetCategoryId: hardwareCat.id }
    });
    const keyboardType = await prisma.assetType.create({
      data: { name: 'Keyboard', assetCategoryId: hardwareCat.id }
    });
    const mouseType = await prisma.assetType.create({
      data: { name: 'Mouse', assetCategoryId: hardwareCat.id }
    });
    const mobileType = await prisma.assetType.create({
      data: { name: 'Mobile', assetCategoryId: hardwareCat.id }
    });

    const licenseType = await prisma.assetType.create({
      data: { name: 'License', assetCategoryId: softwareCat.id }
    });
    const subType = await prisma.assetType.create({
      data: { name: 'Cloud Subscription', assetCategoryId: softwareCat.id }
    });
    console.log('✅ Categories and Types seeded');

    // 4. Seed Asset Inventories (purchased across Jan-May 2026 for line chart)
    console.log('💻 Seeding Asset Inventories...');
    const assetsData = [
      {
        assetId: 'AST-1001',
        assetName: 'MacBook Pro 16"',
        category: 'Hardware',
        type: 'Laptop',
        serialNumber: 'C02FG1234567',
        officeTagNo: 'ASA/IT/2026/001',
        purchaseDate: new Date('2026-01-10'),
        purchaseCost: 180000,
        vendorId: appleVendor.id,
        warrantyExpiry: new Date('2027-01-10'),
        status: 'Assigned',
        condition: 'New',
        location: 'Headquarters',
        description: 'M3 Pro, 18GB RAM, 512GB SSD'
      },
      {
        assetId: 'AST-1002',
        assetName: 'Dell UltraSharp 27"',
        category: 'Hardware',
        type: 'Monitor',
        serialNumber: 'CN04Y1234567',
        officeTagNo: 'ASA/IT/2026/002',
        purchaseDate: new Date('2026-02-15'),
        purchaseCost: 35000,
        vendorId: dellVendor.id,
        warrantyExpiry: new Date('2029-02-15'),
        status: 'Assigned',
        condition: 'New',
        location: 'Mumbai Office',
        description: '4K USB-C Hub Monitor'
      },
      {
        assetId: 'AST-1003',
        assetName: 'Lenovo ThinkPad T14',
        category: 'Hardware',
        type: 'Laptop',
        serialNumber: 'PF2X1234567',
        officeTagNo: 'ASA/IT/2026/003',
        purchaseDate: new Date('2026-02-28'),
        purchaseCost: 95000,
        vendorId: primeVendor.id,
        warrantyExpiry: new Date('2027-02-28'),
        status: 'Available',
        condition: 'Good',
        location: 'Bangalore Tech Hub',
        description: 'AMD Ryzen 7, 16GB RAM, 512GB SSD'
      },
      {
        assetId: 'AST-1004',
        assetName: 'iPad Pro 11"',
        category: 'Hardware',
        type: 'Mobile',
        serialNumber: 'DMY12345678',
        officeTagNo: 'ASA/IT/2026/004',
        purchaseDate: new Date('2026-03-05'),
        purchaseCost: 85000,
        vendorId: appleVendor.id,
        warrantyExpiry: new Date('2027-03-05'),
        status: 'Available',
        condition: 'New',
        location: 'Headquarters',
        description: 'M2 Chip, 128GB WiFi Only'
      },
      {
        assetId: 'AST-1005',
        assetName: 'MacBook Air M2',
        category: 'Hardware',
        type: 'Laptop',
        serialNumber: 'C02DK1234567',
        officeTagNo: 'ASA/IT/2026/005',
        purchaseDate: new Date('2026-04-12'),
        purchaseCost: 110000,
        vendorId: appleVendor.id,
        warrantyExpiry: new Date('2027-04-12'),
        status: 'Assigned',
        condition: 'New',
        location: 'Headquarters',
        description: '8-Core CPU/GPU, 8GB RAM, 256GB'
      },
      {
        assetId: 'AST-1006',
        assetName: 'Logitech MX Master 3S',
        category: 'Hardware',
        type: 'Mouse',
        serialNumber: 'LZ221234567',
        officeTagNo: 'ASA/IT/2026/006',
        purchaseDate: new Date('2026-04-20'),
        purchaseCost: 9000,
        vendorId: primeVendor.id,
        warrantyExpiry: new Date('2027-04-20'),
        status: 'Assigned',
        condition: 'Good',
        location: 'Headquarters',
        description: 'Ergonomic Wireless Mouse'
      },
      {
        assetId: 'AST-1007',
        assetName: 'iPhone 15 Pro',
        category: 'Hardware',
        type: 'Mobile',
        serialNumber: 'G2F12345678',
        officeTagNo: 'ASA/IT/2026/007',
        purchaseDate: new Date('2026-04-25'),
        purchaseCost: 120000,
        vendorId: appleVendor.id,
        warrantyExpiry: new Date('2027-04-25'),
        status: 'Maintenance',
        condition: 'Damaged',
        location: 'Headquarters',
        description: 'Natural Titanium 128GB'
      },
      {
        assetId: 'AST-1008',
        assetName: 'Dell Latitude 5440',
        category: 'Hardware',
        type: 'Laptop',
        serialNumber: 'PF3Z1234567',
        officeTagNo: 'ASA/IT/2026/008',
        purchaseDate: new Date('2026-05-05'),
        purchaseCost: 75000,
        vendorId: dellVendor.id,
        warrantyExpiry: new Date('2027-05-05'),
        status: 'Damaged',
        condition: 'Defective',
        location: 'Mumbai Office',
        description: 'Core i5 13th Gen, 8GB RAM'
      },
      {
        assetId: 'AST-1009',
        assetName: 'Office 365 License',
        category: 'Software',
        type: 'License',
        serialNumber: 'MS365-ABCDE-12345',
        officeTagNo: 'ASA/SW/2026/001',
        purchaseDate: new Date('2026-05-15'),
        purchaseCost: 12000,
        vendorId: primeVendor.id,
        warrantyExpiry: new Date('2027-05-15'),
        status: 'Available',
        condition: 'New',
        location: 'Headquarters',
        description: 'Office 365 Business Premium Annual'
      },
      {
        assetId: 'AST-1010',
        assetName: 'Slack Enterprise Grid',
        category: 'Software',
        type: 'Cloud Subscription',
        serialNumber: 'SLK-ENT-999-888',
        officeTagNo: 'ASA/SW/2026/002',
        purchaseDate: new Date('2026-05-20'),
        purchaseCost: 48000,
        vendorId: primeVendor.id,
        warrantyExpiry: new Date('2027-05-20'),
        status: 'Assigned',
        condition: 'New',
        location: 'Headquarters',
        description: '50 Seats Annual Slack Enterprise'
      }
    ];

    const createdAssets = [];
    for (const ast of assetsData) {
      const dbAst = await prisma.assetInventory.create({ data: ast });
      createdAssets.push(dbAst);
    }
    console.log('✅ Assets seeded');

    // 5. Seed Asset Requests & Allocations linked to real employees
    console.log('🤝 Seeding Asset Requests & Allocations...');
    const adminUser = createdEmployees.find(e => e.officeEmail === 'niranjan.mulam@asaind.co.in');
    const normalUser = createdEmployees.find(e => e.officeEmail === 'john.doe@company.com');
    const managerUser = createdEmployees.find(e => e.officeEmail === 'jane.smith@company.com');

    const firstEmp = adminUser || createdEmployees[0];
    const secondEmp = normalUser || createdEmployees[1];
    const thirdEmp = managerUser || createdEmployees[2];

    // Seed Request for MBP 16"
    const req1 = await prisma.assetRequest.create({
      data: {
        requestId: 'REQ-1001',
        employeeId: firstEmp.id,
        assetCategory: 'Hardware',
        assetType: 'Laptop',
        title: 'MacBook Pro 16" for Development',
        description: 'Require high performance Apple Silicon for mobile builds and containers.',
        priority: 'High',
        requiredDate: new Date('2026-01-05'),
        status: 'Approved',
        remarks: 'Approved for development role.',
        approvedBy: firstEmp.id,
        approvedAt: new Date('2026-01-08')
      }
    });

    // Seed Allocation for MBP 16"
    const mbpAsset = createdAssets.find(a => a.assetName === 'MacBook Pro 16"');
    if (mbpAsset) {
      await prisma.assetAllocation.create({
        data: {
          requestId: req1.id,
          inventoryId: mbpAsset.id,
          employeeId: firstEmp.id,
          allocatedAt: new Date('2026-01-10'),
          status: 'Allocated'
        }
      });
    }

    // Seed Request for Dell UltraSharp 27"
    const req2 = await prisma.assetRequest.create({
      data: {
        requestId: 'REQ-1002',
        employeeId: secondEmp.id,
        assetCategory: 'Hardware',
        assetType: 'Monitor',
        title: 'Dual Monitor Setup',
        description: 'Need external display for code review and testing.',
        priority: 'Medium',
        requiredDate: new Date('2026-02-10'),
        status: 'Approved',
        remarks: 'Approved for UI testing.',
        approvedBy: firstEmp.id,
        approvedAt: new Date('2026-02-12')
      }
    });

    // Seed Allocation for Dell Monitor
    const dellAsset = createdAssets.find(a => a.assetName === 'Dell UltraSharp 27"');
    if (dellAsset) {
      await prisma.assetAllocation.create({
        data: {
          requestId: req2.id,
          inventoryId: dellAsset.id,
          employeeId: secondEmp.id,
          allocatedAt: new Date('2026-02-15'),
          status: 'Allocated'
        }
      });
    }

    // Seed Open Asset Request for Approvals Queue
    await prisma.assetRequest.create({
      data: {
        requestId: 'REQ-1003',
        employeeId: thirdEmp.id,
        assetCategory: 'Hardware',
        assetType: 'Laptop',
        title: 'Upgrade to MacBook Air',
        description: 'Requiring slim profile laptop for travel and meetings.',
        priority: 'Medium',
        requiredDate: new Date('2026-06-10'),
        status: 'Pending'
      }
    });
    console.log('✅ Asset Requests & Allocations seeded');

    // 6. Seed HelpDesk Categories & Subcategories
    console.log('🏷️ Seeding HelpDesk Categories...');
    const helpdeskCategoriesData = [
      {
        categoryName: 'IT Support',
        description: 'Issues regarding laptop hardware, software, emails, or access requests.',
        displayOrder: 1,
        subcategories: [
          { categoryName: 'Email ID Generation', displayOrder: 1 },
          { categoryName: 'VPN Access', displayOrder: 2 },
          { categoryName: 'Laptop Issue', displayOrder: 3 }
        ]
      },
      {
        categoryName: 'HR',
        description: 'Grievances, leave queries, policy questions, and general employee support.',
        displayOrder: 2,
        subcategories: [
          { categoryName: 'Leave Support', displayOrder: 1 },
          { categoryName: 'Policies', displayOrder: 2 },
          { categoryName: 'Employee Grievance', displayOrder: 3 }
        ]
      },
      {
        categoryName: 'Finance',
        description: 'Salary, reimbursements, and tax document related help.',
        displayOrder: 3,
        subcategories: [
          { categoryName: 'Salary Issue', displayOrder: 1 },
          { categoryName: 'Reimbursement', displayOrder: 2 }
        ]
      }
    ];

    const seededCategoriesMap: Record<string, any> = {};
    const seededSubcategoriesMap: Record<string, any> = {};

    for (const cat of helpdeskCategoriesData) {
      const parentCat = await prisma.helpdeskCategory.create({
        data: {
          category_name: cat.categoryName,
          description: cat.description,
          display_order: cat.displayOrder,
          is_active: true
        }
      });
      seededCategoriesMap[cat.categoryName] = parentCat;
      console.log(`✅ Created Parent Category: ${parentCat.category_name}`);

      for (const sub of cat.subcategories) {
        const subCat = await prisma.helpdeskCategory.create({
          data: {
            category_name: sub.categoryName,
            parent_id: parentCat.id,
            display_order: sub.displayOrder,
            is_active: true
          }
        });
        seededSubcategoriesMap[`${cat.categoryName}:${sub.categoryName}`] = subCat;
      }
      console.log(`   └─ ✅ Seeded ${cat.subcategories.length} subcategories`);
    }

    // 7. Seed IT Tickets for dynamic Support Queue
    console.log('🎫 Seeding HelpDesk tickets...');
    const itSupportCat = seededCategoriesMap['IT Support'];
    const laptopIssueSub = seededSubcategoriesMap['IT Support:Laptop Issue'];

    const ticket1 = await prisma.ticket.create({
      data: {
        title: 'MacBook Charger Defective',
        description: 'My Type-C charger is sparking and not charging the MacBook. Require immediate replacement.',
        status: 'Open',
        priority: 'High',
        createdById: secondEmp.id,
        category: 'IT Support',
        categoryId: itSupportCat?.id,
        subcategoryId: laptopIssueSub?.id
      }
    });
    await prisma.ticketHistory.create({
      data: {
        ticketId: ticket1.id,
        action: 'Created',
        fromStatus: 'None',
        toStatus: 'Open',
        performedById: secondEmp.id,
        remarks: 'Ticket raised by employee'
      }
    });

    const ticket2 = await prisma.ticket.create({
      data: {
        title: 'VPN Access Blocked',
        description: 'Account deactivated from VPN, please check access permissions.',
        status: 'Open',
        priority: 'Medium',
        createdById: thirdEmp.id,
        category: 'IT Support',
        categoryId: itSupportCat?.id,
        subcategoryId: seededSubcategoriesMap['IT Support:VPN Access']?.id
      }
    });
    await prisma.ticketHistory.create({
      data: {
        ticketId: ticket2.id,
        action: 'Created',
        fromStatus: 'None',
        toStatus: 'Open',
        performedById: thirdEmp.id,
        remarks: 'License support request'
      }
    });
    console.log('✅ HelpDesk tickets seeded');
    
    console.log('🎉 Database seeding completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`- Created ${employees.length} employees`);
    console.log(`- Created ${employeeProfiles.length} employee profiles`);
    console.log('\n🔑 Login credentials:');
    employees.forEach(emp => {
      console.log(`- ${emp.officeEmail}: ${emp.password}`);
    });
    
  } catch (error) {
    console.error('❌ Error during seeding:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
