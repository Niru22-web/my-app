const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDhruti() {
  try {
    const employees = await prisma.employee.findMany({
      where: {
        OR: [
          { firstName: { contains: 'Dhruti', mode: 'insensitive' } },
          { lastName: { contains: 'Dhruti', mode: 'insensitive' } }
        ]
      },
      include: {
        documents: true
      }
    });

    console.log('--- DHRUTI RECORDS ---');
    employees.forEach(emp => {
      console.log(`Employee: ${emp.firstName} ${emp.lastName} (${emp.id})`);
      console.log(`Status: ${emp.status}`);
      console.log('Documents:');
      emp.documents.forEach(doc => {
        console.log(`  - Title: ${doc.title}`);
        console.log(`    FileName: ${doc.fileName}`);
        console.log(`    FilePath: ${doc.filePath}`);
      });
      console.log('----------------------');
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDhruti();
