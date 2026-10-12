import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const count = await prisma.attendance.count();
  const nullCount = await prisma.attendance.count({ where: { location_name: null } });
  console.log(`Total attendance records: ${count}`);
  console.log(`Records with null location_name: ${nullCount}`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
