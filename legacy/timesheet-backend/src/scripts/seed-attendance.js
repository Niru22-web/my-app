const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const prisma = new PrismaClient();

const EMPLOYEE_ID = 'EMP001';
const PREV_WEEK_DAYS = [
  { date: '2026-05-25', hours: 8.5, checkIn: '09:15:00', checkOut: '17:45:00' }, // Mon
  { date: '2026-05-26', hours: 9.2, checkIn: '09:00:00', checkOut: '18:12:00' }, // Tue
  { date: '2026-05-27', hours: 7.8, checkIn: '09:30:00', checkOut: '17:18:00' }, // Wed
  { date: '2026-05-28', hours: 8.0, checkIn: '09:00:00', checkOut: '17:00:00' }, // Thu
  { date: '2026-05-29', hours: 8.7, checkIn: '08:50:00', checkOut: '17:32:00' }  // Fri
];

async function main() {
  console.log(`Starting to seed dummy attendance for employee: ${EMPLOYEE_ID} for the previous week...`);

  for (const item of PREV_WEEK_DAYS) {
    const dateStr = item.date;
    const dateMidnight = new Date(`${dateStr}T00:00:00.000Z`);

    console.log(`Processing date: ${dateStr} (${dateMidnight.toISOString()})`);

    // Parse check-in and check-out times relative to UTC (since they are stored as UTC DateTime)
    // 9:00 AM IST is 3:30 AM UTC
    // Let's convert the IST times to UTC dates
    const parseTimeToUtcDate = (dateString, timeString) => {
      // timeString is in format "HH:MM:SS" (IST)
      const [hh, mm, ss] = timeString.split(':').map(Number);
      // IST is UTC + 5:30. To get UTC, we subtract 5 hours and 30 minutes from IST time.
      const utcDate = new Date(`${dateString}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.000Z`);
      // Subtract 5 hours 30 mins to convert from local IST representation to UTC Date
      utcDate.setUTCMinutes(utcDate.getUTCMinutes() - 330);
      return utcDate;
    };

    const checkInTime = parseTimeToUtcDate(dateStr, item.checkIn);
    const checkOutTime = parseTimeToUtcDate(dateStr, item.checkOut);

    // 1. Delete existing attendance sessions for this employee and date to prevent duplicates
    const deletedSessions = await prisma.attendance_sessions.deleteMany({
      where: {
        employee_id: EMPLOYEE_ID,
        date: dateMidnight
      }
    });
    if (deletedSessions.count > 0) {
      console.log(`  Deleted ${deletedSessions.count} existing session(s).`);
    }

    // 2. Delete existing attendance record for this employee and date
    const deletedAttendance = await prisma.attendance.deleteMany({
      where: {
        employee_id: EMPLOYEE_ID,
        date: dateMidnight
      }
    });
    if (deletedAttendance.count > 0) {
      console.log(`  Deleted existing attendance record.`);
    }

    const attendanceId = uuidv4();
    const sessionId = uuidv4();

    // 3. Create attendance record
    const attendanceRecord = await prisma.attendance.create({
      data: {
        id: attendanceId,
        employee_id: EMPLOYEE_ID,
        date: dateMidnight,
        status: 'Present',
        total_hours: item.hours,
        check_in_time: checkInTime,
        check_out_time: checkOutTime,
        check_in_location: 'Office',
        check_out_location: 'Office',
        location_name: 'Office',
        latitude: 19.0760, // Dummy coordinates for Office
        longitude: 72.8777,
        is_auto_checkout: false
      }
    });
    console.log(`  Created attendance record ID: ${attendanceRecord.id}`);

    // 4. Create attendance session record
    const durationMinutes = Math.round(item.hours * 60);
    const sessionRecord = await prisma.attendance_sessions.create({
      data: {
        id: sessionId,
        employee_id: EMPLOYEE_ID,
        date: dateMidnight,
        check_in_time: checkInTime,
        check_out_time: checkOutTime,
        duration: durationMinutes,
        check_in_location: 'Office',
        check_out_location: 'Office',
        latitude: 19.0760,
        longitude: 72.8777,
        location_name: 'Office',
        is_auto_checkout: false
      }
    });
    console.log(`  Created attendance session ID: ${sessionRecord.id} with duration: ${durationMinutes} minutes`);
  }

  console.log('Dummy attendance seeding completed successfully!');
}

main()
  .catch((err) => {
    console.error('Error during seeding:', err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
