const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function listImages() {
  try {
    const employees = await prisma.employee.findMany({
      select: {
        id: true,
        employeeId: true,
        firstName: true,
        profileImage: true,
        profile: {
          select: {
            employeePhotoUrl: true
          }
        }
      }
    });

    console.log('--- Current Image Paths in DB ---');
    employees.forEach(emp => {
      if (emp.profileImage || emp.profile?.employeePhotoUrl) {
        console.log(`Employee: ${emp.employeeId} (${emp.firstName})`);
        console.log(`  profileImage: ${emp.profileImage}`);
        console.log(`  employeePhotoUrl: ${emp.profile?.employeePhotoUrl}`);
      }
    });
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

listImages();
