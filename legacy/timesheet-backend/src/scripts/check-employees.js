const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function run() {
  try {
    const empCount = await p.employee.count();
    const mgCount = await p.employee.count({ where: { role: 'Manager' } });
    const ptCount = await p.employee.count({ where: { role: 'Partner' } });
    const empMgrCount = await p.$queryRaw`SELECT COUNT(*) as c FROM employee_managers`;
    const empPrtCount = await p.$queryRaw`SELECT COUNT(*) as c FROM employee_partners`;

    console.log('Total employees:', empCount);
    console.log('Managers (by role):', mgCount);
    console.log('Partners (by role):', ptCount);
    console.log('employee_managers rows:', empMgrCount[0].c.toString());
    console.log('employee_partners rows:', empPrtCount[0].c.toString());

    // Show all employees with their roles
    const employees = await p.employee.findMany({
      select: { id: true, employeeId: true, firstName: true, lastName: true, role: true },
      orderBy: { role: 'asc' }
    });
    console.log('\n--- All Employees (id, empId, name, role) ---');
    employees.forEach(e => {
      console.log(`  ${e.id} | ${e.employeeId} | ${e.firstName} ${e.lastName} | ${e.role}`);
    });

    // Check reimbursements for hierarchy hints
    const rWithMgr = await p.reimbursement.count({ where: { managerId: { not: null } } });
    const rWithPrt = await p.reimbursement.count({ where: { partnerId: { not: null } } });
    console.log('\nReimbursements with managerId set:', rWithMgr);
    console.log('Reimbursements with partnerId set:', rWithPrt);

    // Check projects for manager/partner assignments
    const projWithMgr = await p.project.count({ where: { managerId: { not: null } } });
    const projWithPrt = await p.project.count({ where: { partnerId: { not: null } } });
    console.log('\nProjects with managerId set:', projWithMgr);
    console.log('Projects with partnerId set:', projWithPrt);

  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await p.$disconnect();
  }
}

run();
