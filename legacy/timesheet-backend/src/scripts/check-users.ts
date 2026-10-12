
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Checking Database Users ---');
  const employees = await prisma.employee.findMany({
    select: {
      id: true,
      employeeId: true,
      officeEmail: true,
      status: true,
      password: true,
      role: true
    }
  });

  console.log(`Total employees: ${employees.length}`);

  employees.forEach(emp => {
    const hasPassword = !!emp.password;
    const isBcrypt = emp.password?.startsWith('$2b$');
    const status = emp.status;
    
    if (!isBcrypt && hasPassword) {
        console.log(`⚠️ User ${emp.officeEmail} (${emp.employeeId}) has plain text or invalid hash password.`);
    }

    if (status !== 'active') {
        console.log(`ℹ️ User ${emp.officeEmail} is ${status}.`);
    }
  });

  console.log('--- Check Complete ---');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
