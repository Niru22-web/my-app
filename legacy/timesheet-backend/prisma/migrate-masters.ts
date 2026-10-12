import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('🏁 Starting masters data backfill and migration...');

  // 1. Roles Master
  console.log('🔄 Seeding Roles Master...');
  const defaultRoles = [
    { name: 'Admin', code: 'ADMIN', description: 'Administrator with full system permissions' },
    { name: 'IT Support', code: 'IT', description: 'Information Technology Support' },
    { name: 'HR Manager', code: 'HR', description: 'Human Resources Manager' },
    { name: 'Partner', code: 'PARTNER', description: 'Partner with management overview' },
    { name: 'Manager', code: 'MANAGER', description: 'Reporting Manager' },
    { name: 'Employee', code: 'EMPLOYEE', description: 'Standard employee user' },
    { name: 'Accounts', code: 'ACCOUNTS', description: 'Accounts and Finance user' }
  ];

  const roleMap: Record<string, string> = {};
  for (const role of defaultRoles) {
    const created = await prisma.roleMaster.upsert({
      where: { code: role.code },
      update: { name: role.name, description: role.description },
      create: role
    });
    roleMap[role.name.toLowerCase()] = created.id;
    roleMap[role.code.toLowerCase()] = created.id;
  }

  // 2. Query all employees to find unique designations and departments
  const employees = await prisma.employee.findMany({
    include: { profile: true }
  });

  const uniqueDesignations = Array.from(new Set(
    employees.map(e => e.designation).filter(Boolean)
  ));
  const uniqueDepartments = Array.from(new Set(
    employees.map(e => e.department).filter(Boolean)
  ));
  
  const rawEmploymentTypes = employees.map(e => e.profile?.employmentType).filter((x): x is string => !!x);
  const uniqueEmploymentTypes = Array.from(new Set(rawEmploymentTypes));

  // 3. Designation Master
  console.log('🔄 Seeding Designation Master...');
  const designationMap: Record<string, string> = {};
  if (uniqueDesignations.length === 0) {
    uniqueDesignations.push('Associate');
  }
  for (const des of uniqueDesignations) {
    const created = await prisma.designationMaster.upsert({
      where: { name: des },
      update: {},
      create: { name: des, description: `${des} Designation` }
    });
    designationMap[des.toLowerCase()] = created.id;
  }

  // 4. Department Master
  console.log('🔄 Seeding Department Master...');
  const departmentMap: Record<string, string> = {};
  if (uniqueDepartments.length === 0) {
    uniqueDepartments.push('General');
  }
  for (const dept of uniqueDepartments) {
    const created = await prisma.departmentMaster.upsert({
      where: { name: dept },
      update: {},
      create: { name: dept, description: `${dept} Department` }
    });
    departmentMap[dept.toLowerCase()] = created.id;
  }

  // 5. Employment Type Master
  console.log('🔄 Seeding Employment Type Master...');
  const employmentTypeMap: Record<string, string> = {};
  if (uniqueEmploymentTypes.length === 0) {
    uniqueEmploymentTypes.push('Full-Time', 'Part-Time', 'Contractor', 'Intern');
  }
  for (const type of uniqueEmploymentTypes) {
    const created = await prisma.employmentTypeMaster.upsert({
      where: { name: type },
      update: {},
      create: { name: type, description: `${type} Employment Type` }
    });
    employmentTypeMap[type.toLowerCase()] = created.id;
  }

  // 6. Shift Master
  console.log('🔄 Seeding Shift Master...');
  const defaultShift = await prisma.shiftMaster.upsert({
    where: { name: 'Regular Shift' },
    update: {},
    create: {
      name: 'Regular Shift',
      startTime: '09:30',
      endTime: '18:30',
      description: 'Standard office hours'
    }
  });

  // 7. Location Master
  console.log('🔄 Seeding Location Master...');
  const defaultLocation = await prisma.location.upsert({
    where: { name: 'Head Office' },
    update: { isActive: true },
    create: {
      name: 'Head Office',
      description: 'Main corporate headquarters',
      isActive: true
    }
  });

  // 8. Update each employee to link with foreign keys
  console.log(`🔄 Backfilling ${employees.length} employees with foreign keys...`);
  let updatedCount = 0;
  for (const emp of employees) {
    const matchedRoleId = roleMap[emp.role.toLowerCase()] || roleMap['employee'];
    const matchedDesignationId = designationMap[emp.designation.toLowerCase()] || null;
    const matchedDepartmentId = departmentMap[emp.department.toLowerCase()] || null;
    const matchedLocationId = defaultLocation.id;
    const matchedShiftId = defaultShift.id;

    let matchedEmploymentTypeId: string | null = null;
    if (emp.profile && emp.profile.employmentType) {
      matchedEmploymentTypeId = employmentTypeMap[emp.profile.employmentType.toLowerCase()] || null;
    }

    // Update employee record
    await prisma.employee.update({
      where: { id: emp.id },
      data: {
        roleId: matchedRoleId,
        designationId: matchedDesignationId,
        departmentId: matchedDepartmentId,
        locationId: matchedLocationId,
        shiftId: matchedShiftId
      }
    });

    // Update profile record if it exists
    if (emp.profile) {
      await prisma.employeeProfile.update({
        where: { id: emp.profile.id },
        data: {
          employmentTypeId: matchedEmploymentTypeId
        }
      });
    }

    updatedCount++;
  }

  console.log(`✅ Completed backfilling. Updated ${updatedCount} employees.`);
}

main()
  .catch((e) => {
    console.error('❌ Error during backfill:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
