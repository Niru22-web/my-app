const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const employees = await prisma.employee.findMany({
    where: { profileImage: { not: null } },
    select: { id: true, employeeId: true, firstName: true, lastName: true, profileImage: true }
  });

  console.log('--- Employees with profileImage ---');
  employees.forEach(e => {
    console.log(`[${e.employeeId}] ${e.firstName} ${e.lastName}: ${e.profileImage}`);
  });

  const profiles = await prisma.employeeProfile.findMany({
    where: { profileImage: { not: null } },
    select: { employeeId: true, profileImage: true }
  });

  console.log('\n--- EmployeeProfiles with profileImage ---');
  profiles.forEach(p => {
    console.log(`Employee ID: ${p.employeeId}, Photo: ${p.profileImage}`);
  });
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
