import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const attendances = await prisma.attendance.findMany({
    where: {
      date: { gte: sevenDaysAgo }
    },
    orderBy: { date: 'asc' },
    select: {
      id: true,
      employee_id: true,
      date: true,
      total_hours: true,
      Employee: {
        select: {
          firstName: true,
          lastName: true,
          role: true
        }
      }
    }
  });

  console.log("=== RECENT ATTENDANCE RECORDS (Last 7 Days) ===");
  console.log(JSON.stringify(attendances, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
