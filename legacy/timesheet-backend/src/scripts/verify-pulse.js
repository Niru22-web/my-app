const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const EMPLOYEE_ID = 'EMP001';

async function main() {
  // Simulating today as Tuesday June 2, 2026
  // Local dates matching the frontend calculation:
  const prevWeekMonday = new Date('2026-05-25T00:00:00.000Z');
  const currentWeekSunday = new Date('2026-06-07T23:59:59.999Z');

  console.log(`Verifying weekly pulse comparison for ${EMPLOYEE_ID}...`);
  console.log(`Querying attendance from ${prevWeekMonday.toISOString()} to ${currentWeekSunday.toISOString()}`);

  const attendanceRecords = await prisma.attendance.findMany({
    where: {
      employee_id: EMPLOYEE_ID,
      date: {
        gte: prevWeekMonday,
        lte: currentWeekSunday
      }
    },
    orderBy: { date: 'asc' }
  });

  console.log(`\nFound ${attendanceRecords.length} records:`);
  attendanceRecords.forEach(record => {
    console.log(`- Date: ${record.date.toISOString().split('T')[0]}, Hours: ${record.total_hours}, Status: ${record.status}`);
  });

  const thisWeekDays = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
  const prevWeekDays = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
  let thisWeekHours = 0;
  let prevWeekHours = 0;

  const dayNames = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun' };

  const prevWeekEnd = new Date('2026-05-31T23:59:59.999Z');
  const currentWeekStart = new Date('2026-06-01T00:00:00.000Z');

  attendanceRecords.forEach(record => {
    const recordDate = new Date(record.date);
    const hours = Number(record.total_hours || 0);
    const dayName = dayNames[recordDate.getUTCDay()] || 'Mon';

    if (recordDate >= currentWeekStart && recordDate <= currentWeekSunday) {
      thisWeekHours += hours;
      thisWeekDays[dayName] = (thisWeekDays[dayName] || 0) + hours;
    } else if (recordDate >= prevWeekMonday && recordDate <= prevWeekEnd) {
      prevWeekHours += hours;
      prevWeekDays[dayName] = (prevWeekDays[dayName] || 0) + hours;
    }
  });

  console.log('\n--- Weekly Summary ---');
  console.log('Previous Week (May 25 - May 31):', prevWeekHours, 'hours');
  console.log(prevWeekDays);
  console.log('Current Week (Jun 01 - Jun 07):', thisWeekHours, 'hours');
  console.log(thisWeekDays);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
