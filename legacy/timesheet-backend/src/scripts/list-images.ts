import { prisma } from "../config/prisma";

async function main() {
  const employees = await prisma.employee.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      officeEmail: true,
    },
  });

  console.log("Employees:");

  employees.forEach((emp) => {
    console.log(
      `${emp.firstName} ${emp.lastName} - ${emp.officeEmail}`
    );
  });
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
