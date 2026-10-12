const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const ids = ['EMP0009', 'EMP0008', 'EMP0007', 'EMP0006'];
  const emps = await prisma.employee.findMany({
    where: { employeeId: { in: ids } },
    select: { id: true, employeeId: true }
  });
  
  const empIds = emps.map(e => e.id);
  const profiles = await prisma.employeeProfile.findMany({
    where: { employeeId: { in: empIds } },
    select: { employeeId: true, profileImage: true }
  });

  const results = emps.map(e => ({
    employeeId: e.employeeId,
    dbId: e.id,
    profileImage: profiles.find(p => p.employeeId === e.id)?.profileImage || null
  }));

  console.log(JSON.stringify(results, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
