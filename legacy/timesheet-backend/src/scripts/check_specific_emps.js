const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const ids = ['EMP0009', 'EMP0008', 'EMP0007', 'EMP0006'];
  const emps = await prisma.employee.findMany({
    where: { employeeId: { in: ids } },
    select: { employeeId: true, firstName: true, lastName: true, profileImage: true }
  });
  console.log(JSON.stringify(emps, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
