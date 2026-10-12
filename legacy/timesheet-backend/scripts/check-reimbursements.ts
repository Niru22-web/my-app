
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkData() {
  try {
    const counts = await prisma.reimbursement.groupBy({
      by: ['status'],
      _count: { id: true }
    });
    console.log('Reimbursement counts by status:', JSON.stringify(counts, null, 2));

    const niranjan = await prisma.employee.findFirst({
      where: { firstName: 'Niranjan' }
    });
    console.log('Niranjan user:', JSON.stringify(niranjan, null, 2));

    const pendingClaims = await prisma.reimbursement.findMany({
      where: { status: { in: ['PENDING_MANAGER', 'MANAGER_APPROVED'] } },
      take: 5,
      include: {
        employee: { select: { firstName: true, lastName: true } }
      }
    });
    console.log('Sample Pending Claims:', JSON.stringify(pendingClaims, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

checkData();
