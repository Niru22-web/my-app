/**
 * Safe Hierarchy Migration Script
 * ================================
 * This script migrates old single reporting hierarchy (reportingManager / reportingPartner)
 * into the new relational tables (employee_managers / employee_partners).
 *
 * It uses raw SQL to read old columns (if they still exist), so it is safe to run
 * against both old and new database states.
 *
 * If old columns are already dropped, it will report "no data to migrate" and exit cleanly.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrate() {
  console.log('🚀 Starting safe hierarchy migration...\n');

  try {
    // Step 1: Check if old columns still exist in the Employee table
    const colCheck = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Employee' 
        AND column_name IN ('reportingManager', 'reportingPartner')
    `;

    const hasReportingManager = colCheck.some(c => c.column_name === 'reportingManager');
    const hasReportingPartner = colCheck.some(c => c.column_name === 'reportingPartner');

    console.log(`📊 Column check:`);
    console.log(`   reportingManager column exists: ${hasReportingManager}`);
    console.log(`   reportingPartner column exists: ${hasReportingPartner}`);

    if (!hasReportingManager && !hasReportingPartner) {
      console.log('\n✅ Old hierarchy columns already removed from the database.');
      console.log('   Checking current state of new tables...\n');

      const mgCount = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) as count FROM employee_managers`;
      const ptCount = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) as count FROM employee_partners`;
      console.log(`   employee_managers: ${mgCount[0].count} rows`);
      console.log(`   employee_partners: ${ptCount[0].count} rows`);
      console.log('\n✅ No migration needed. Database is in the correct final state.');
      return;
    }

    // Step 2: Read all employees with their old reporting fields (using raw SQL)
    console.log('\n📥 Reading employees with old hierarchy data...');
    
    let employees: Array<{ id: string; reportingManager: string | null; reportingPartner: string | null }> = [];

    if (hasReportingManager && hasReportingPartner) {
      employees = await prisma.$queryRaw`
        SELECT id, "reportingManager", "reportingPartner" FROM "Employee"
        WHERE "reportingManager" IS NOT NULL OR "reportingPartner" IS NOT NULL
      `;
    } else if (hasReportingManager) {
      employees = await prisma.$queryRaw`
        SELECT id, "reportingManager", NULL as "reportingPartner" FROM "Employee"
        WHERE "reportingManager" IS NOT NULL
      `;
    } else if (hasReportingPartner) {
      employees = await prisma.$queryRaw`
        SELECT id, NULL as "reportingManager", "reportingPartner" FROM "Employee"
        WHERE "reportingPartner" IS NOT NULL
      `;
    }

    console.log(`   Found ${employees.length} employees with hierarchy data.\n`);

    let migratedManagers = 0;
    let migratedPartners = 0;
    let skippedManagers = 0;
    let skippedPartners = 0;

    // Step 3: Migrate each employee's reporting hierarchy
    for (const emp of employees) {
      // Migrate reportingManager → employee_managers
      if (emp.reportingManager) {
        const manager = await prisma.employee.findUnique({ 
          where: { id: emp.reportingManager },
          select: { id: true, firstName: true, lastName: true }
        });

        if (manager) {
          await (prisma as any).employeeManager.upsert({
            where: {
              employeeId_managerId: {
                employeeId: emp.id,
                managerId: emp.reportingManager
              }
            },
            create: {
              employeeId: emp.id,
              managerId: emp.reportingManager
            },
            update: {}
          });
          console.log(`   ✅ Manager migrated: ${emp.id} → ${manager.firstName} ${manager.lastName}`);
          migratedManagers++;
        } else {
          console.warn(`   ⚠️  Manager not found: ${emp.reportingManager} (for employee ${emp.id})`);
          skippedManagers++;
        }
      }

      // Migrate reportingPartner → employee_partners
      if (emp.reportingPartner) {
        const partner = await prisma.employee.findUnique({ 
          where: { id: emp.reportingPartner },
          select: { id: true, firstName: true, lastName: true }
        });

        if (partner) {
          await (prisma as any).employeePartner.upsert({
            where: {
              employeeId_partnerId: {
                employeeId: emp.id,
                partnerId: emp.reportingPartner
              }
            },
            create: {
              employeeId: emp.id,
              partnerId: emp.reportingPartner
            },
            update: {}
          });
          console.log(`   ✅ Partner migrated: ${emp.id} → ${partner.firstName} ${partner.lastName}`);
          migratedPartners++;
        } else {
          console.warn(`   ⚠️  Partner not found: ${emp.reportingPartner} (for employee ${emp.id})`);
          skippedPartners++;
        }
      }
    }

    // Step 4: Summary
    console.log('\n📊 Migration Summary:');
    console.log(`   Managers migrated: ${migratedManagers}`);
    console.log(`   Partners migrated: ${migratedPartners}`);
    console.log(`   Managers skipped (not found): ${skippedManagers}`);
    console.log(`   Partners skipped (not found): ${skippedPartners}`);

    // Step 5: Verify final counts
    const mgCount = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) as count FROM employee_managers`;
    const ptCount = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) as count FROM employee_partners`;
    console.log(`\n   Total employee_managers rows: ${mgCount[0].count}`);
    console.log(`   Total employee_partners rows: ${ptCount[0].count}`);

    console.log('\n✅ Hierarchy migration completed successfully!');
    console.log('\nNext step: Remove old columns from schema.prisma and run prisma db push.');

  } catch (error) {
    console.error('\n❌ Error during migration:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

migrate();
