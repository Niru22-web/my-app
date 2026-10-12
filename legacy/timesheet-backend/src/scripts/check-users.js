
const { PrismaClient } = require('@prisma/client');
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
    console.log(`Email: ${emp.officeEmail} | ID: ${emp.employeeId} | Status: ${emp.status} | Has PW: ${hasPassword} | Is Bcrypt: ${isBcrypt} | Role: ${emp.role}`);
    
    if (hasPassword && !isBcrypt) {
        console.log(`   ⚠️ WARNING: Plain text or invalid hash: ${emp.password}`);
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
