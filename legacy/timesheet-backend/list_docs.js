const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function run() {
  const profiles = await prisma.employeeProfile.findMany({
    select: {
      employeeId: true,
      profileImage: true,
      panFileUrl: true,
      aadhaarFileUrl: true,
      bankStatementFileUrl: true,
      employee: {
        select: {
          employeeId: true,
          firstName: true,
          lastName: true
        }
      }
    }
  });

  const docs = await prisma.employeeDocument.findMany({
    include: {
      employee: {
        select: {
          employeeId: true,
          firstName: true,
          lastName: true
        }
      }
    }
  });

  console.log('=== EMPLOYEE PROFILES ===');
  profiles.forEach(p => {
    if (p.profileImage || p.panFileUrl || p.aadhaarFileUrl || p.bankStatementFileUrl) {
      console.log(`\nEmployee: ${p.employee.firstName} ${p.employee.lastName} (${p.employee.employeeId})`);
      const files = {
        profileImage: p.profileImage,
        pan: p.panFileUrl,
        aadhaar: p.aadhaarFileUrl,
        bank: p.bankStatementFileUrl
      };
      
      for (const [key, val] of Object.entries(files)) {
        if (val) {
          const filename = path.basename(val);
          const resolved = findPhysicalFile(filename);
          console.log(`  - ${key}: ${val} -> Found: ${resolved ? resolved : 'NOT FOUND'}`);
        }
      }
    }
  });

  console.log('\n=== EMPLOYEE DOCUMENTS ===');
  docs.forEach(d => {
    const resolved = findPhysicalFile(d.fileName);
    console.log(`Doc ID: ${d.id} | Title: ${d.title} | File: ${d.fileName} -> Found: ${resolved ? resolved : 'NOT FOUND'}`);
  });
}

function findPhysicalFile(filename) {
  const paths = [
    path.join('/home/ubuntu/timesheet-app/timesheet-backend/uploads', filename),
    path.join('/home/ubuntu/timesheet-app/timesheet-backend/uploads/profile', filename),
    path.join('/home/ubuntu/timesheet-app/timesheet-backend/uploads/documents', filename),
    path.join('/var/www/uploads', filename),
    path.join('/var/www/uploads/profile', filename),
    path.join('/var/www/uploads/documents', filename)
  ];
  
  return paths.find(p => fs.existsSync(p));
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
