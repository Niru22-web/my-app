/// <reference types="node" />
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting hierarchy data migration...');
  
  const employees = await prisma.employee.findMany();
  let updatedCount = 0;

  for (const emp of (employees as any[])) {
    const updates: any = {};

    
    // Collect all unique partner IDs
    const partnerIds = new Set<string>();
    if (emp.reportingPartner) partnerIds.add(emp.reportingPartner);
    if (emp.partnerId) partnerIds.add(emp.partnerId);
    
    // Collect all unique manager IDs
    const managerIds = new Set<string>();
    if (emp.reportingManager) managerIds.add(emp.reportingManager);
    if (emp.managerId) managerIds.add(emp.managerId);
    
    // Collect all unique sub-manager IDs
    const subManagerIds = new Set<string>();
    if (emp.subManagerId) subManagerIds.add(emp.subManagerId);

    if (partnerIds.size > 0 && (!emp.reportingPartnerIds || emp.reportingPartnerIds.length === 0)) {
      updates.reportingPartnerIds = Array.from(partnerIds);
    }
    
    if (managerIds.size > 0 && (!emp.reportingManagerIds || emp.reportingManagerIds.length === 0)) {
      updates.reportingManagerIds = Array.from(managerIds);
    }
    
    if (subManagerIds.size > 0 && (!emp.subManagerIds || emp.subManagerIds.length === 0)) {
      updates.subManagerIds = Array.from(subManagerIds);
    }

    if (Object.keys(updates).length > 0) {
      await prisma.employee.update({
        where: { id: emp.id },
        data: updates
      });
      updatedCount++;
      console.log(`✅ Migrated hierarchy for ${emp.firstName} ${emp.lastName} (${emp.employeeId})`);
    }
  }

  console.log(`\n✨ Migration complete! Updated ${updatedCount} employees.`);
}

main()
  .catch((e) => {
    console.error('❌ Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
