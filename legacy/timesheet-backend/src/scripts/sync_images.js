const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

// CONFIGURE THIS PATH TO MATCH YOUR SERVER
const UPLOADS_DIR = process.env.NODE_ENV === 'production' 
    ? "/home/ubuntu/timesheet-app/timesheet-backend/uploads/profile" 
    : path.join(process.cwd(), 'uploads', 'profile');

async function main() {
  console.log('🚀 Starting profile image audit and sync...');
  console.log(`📁 Checking physical files in: ${UPLOADS_DIR}`);

  // 1. Fetch all employees with a profileImage
  const employees = await prisma.employee.findMany({
    where: { profileImage: { not: null } }
  });

  console.log(`📊 Found ${employees.length} employees with image paths in database.`);

  let updatedCount = 0;
  let clearedCount = 0;

  for (const emp of employees) {
    let currentPath = emp.profileImage;
    if (!currentPath) continue;

    let needsUpdate = false;
    let shouldClear = false;

    // A. Extract filename from any path format
    // Handles: full URLs, api/uploads/..., profile/..., /uploads/profile/...
    let fileName = '';
    if (currentPath.includes('/')) {
        const parts = currentPath.split('/');
        fileName = parts[parts.length - 1];
        // Remove query parameters if any (e.g. ?v=123)
        fileName = fileName.split('?')[0];
    } else {
        fileName = currentPath;
    }

    if (!fileName) {
        console.log(`⚠️ Invalid path for ${emp.firstName}: ${currentPath}`);
        shouldClear = true;
    } else {
        const physicalPath = path.join(UPLOADS_DIR, fileName);
        const normalizedDbPath = `/uploads/profile/${fileName}`;

        if (!fs.existsSync(physicalPath)) {
            console.log(`❌ FILE MISSING for ${emp.firstName} (${emp.employeeId}): ${physicalPath}`);
            shouldClear = true;
        } else if (currentPath !== normalizedDbPath) {
            console.log(`✅ Normalizing path for ${emp.firstName}: ${currentPath} -> ${normalizedDbPath}`);
            needsUpdate = true;
        }
    }

    // B. Apply changes
    const newPath = shouldClear ? null : (needsUpdate ? `/uploads/profile/${fileName}` : currentPath);
    
    if (newPath !== currentPath) {
        await prisma.employee.update({
            where: { id: emp.id },
            data: { profileImage: newPath }
        });

        // Also sync EmployeeProfile
        await prisma.employeeProfile.updateMany({
            where: { employeeId: emp.id },
            data: { profileImage: newPath }
        });

        if (shouldClear) clearedCount++;
        else updatedCount++;
    }
  }

  console.log('\n✨ Audit Complete!');
  console.log(`✅ Records Normalized: ${updatedCount}`);
  console.log(`🧹 Records Cleared (Missing Files): ${clearedCount}`);
  console.log('-------------------------------------------');
}

main()
  .catch(e => {
    console.error('💥 Script Failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
