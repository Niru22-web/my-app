const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function run() {
  const docId = 'bf74625a-9417-4783-8fd3-92f0df23ce1f';
  const doc = await prisma.employeeDocument.findUnique({
    where: { id: docId }
  });

  console.log('--- DATABASE RECORD ---');
  console.log(JSON.stringify(doc, null, 2));
  
  if (doc) {
    console.log('\n--- FILE CHECKS ---');
    const pathsToCheck = [
      doc.filePath,
      path.join('/home/ubuntu/timesheet-app/timesheet-backend', 'uploads', 'documents', doc.fileName),
      path.join('/home/ubuntu/timesheet-app/timesheet-backend', 'uploads', doc.fileName),
      path.join('/home/ubuntu/timesheet-app/timesheet-backend', 'uploads', 'profile', doc.fileName),
      path.join('/home/ubuntu/timesheet-app', 'uploads', 'documents', doc.fileName),
      path.join('/home/ubuntu/timesheet-app', 'uploads', doc.fileName),
      path.join('/home/ubuntu/timesheet-app', 'uploads', 'profile', doc.fileName)
    ];

    pathsToCheck.forEach(p => {
      console.log(`Path: ${p} -> Exists: ${fs.existsSync(p)}`);
    });
  }
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
