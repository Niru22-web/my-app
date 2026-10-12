const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkState() {
  try {
    // Check if old columns exist in Employee table
    const empCols = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Employee' 
      ORDER BY column_name
    `;
    console.log('\n=== Employee Columns ===');
    empCols.forEach(c => console.log(' -', c.column_name));

    // Check if old columns exist in Timelog table
    const timelogCols = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Timelog' 
      ORDER BY column_name
    `;
    console.log('\n=== Timelog Columns ===');
    timelogCols.forEach(c => console.log(' -', c.column_name));

    // Check if old columns exist in leaves table
    const leavesCols = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'leaves' 
      ORDER BY column_name
    `;
    console.log('\n=== Leaves Columns ===');
    leavesCols.forEach(c => console.log(' -', c.column_name));

    // Check if new tables exist
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('employee_managers', 'employee_partners')
    `;
    console.log('\n=== New Hierarchy Tables ===');
    if (tables.length === 0) console.log(' (none found)');
    tables.forEach(t => console.log(' -', t.table_name));

    // Count data if tables exist
    if (tables.some(t => t.table_name === 'employee_managers')) {
      const mgCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM employee_managers`;
      console.log(`\n  employee_managers row count: ${mgCount[0].count}`);
    }
    if (tables.some(t => t.table_name === 'employee_partners')) {
      const ptCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM employee_partners`;
      console.log(`  employee_partners row count: ${ptCount[0].count}`);
    }

    // Check how many employees have old reporting fields set (if columns exist)
    const empColNames = empCols.map(c => c.column_name);
    if (empColNames.includes('reportingManager')) {
      const withMgr = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Employee" WHERE "reportingManager" IS NOT NULL`;
      console.log(`\n  Employees with reportingManager set: ${withMgr[0].count}`);
    } else {
      console.log('\n  reportingManager column NOT found in Employee table (already dropped)');
    }
    if (empColNames.includes('reportingPartner')) {
      const withPrt = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Employee" WHERE "reportingPartner" IS NOT NULL`;
      console.log(`  Employees with reportingPartner set: ${withPrt[0].count}`);
    } else {
      console.log('  reportingPartner column NOT found in Employee table (already dropped)');
    }

  } catch (err) {
    console.error('Error checking state:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkState();
