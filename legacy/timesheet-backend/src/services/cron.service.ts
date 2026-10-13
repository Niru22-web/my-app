import cron from 'node-cron';
import { prisma } from '../config/prisma';
import { triggerNotification, notifyAdmins } from './notification.service';
import { registerComplianceSchedulers } from '../modules/compliance/compliance.scheduler';
import { registerEsslScheduler } from '../modules/essl/essl.scheduler';



export const startCronJobs = () => {
  console.log('⏳ Initializing Notification Cron Jobs...');

  // Run everyday at 09:00 AM server time
  cron.schedule('0 9 * * *', async () => {
    console.log('⏰ Running Birthday Check Cron Job...');
    
    try {
      const today = new Date();
      const currentMonth = today.getMonth() + 1; // 1-12
      const currentDay = today.getDate(); // 1-31

      // First query all profiles (we will filter in JS if exact raw query is tricky in Prisma for date parts)
      const profiles = await prisma.employeeProfile.findMany({
        include: {
          employee: true
        }
      });

      const birthdayEmployees = profiles.filter((profile: any) => {
        if (!profile.dob) return false;
        const dob = new Date(profile.dob);
        return (dob.getMonth() + 1 === currentMonth) && (dob.getDate() === currentDay);
      });

      for (const bday of birthdayEmployees) {
        if (!bday.employee) continue;
        
        const employeeName = `${bday.employee.firstName} ${bday.employee.lastName || ''}`.trim();

        // 1. Notify the birthday person
        await triggerNotification({
          userId: bday.employee.id,
          title: 'Happy Birthday! 🎂',
          message: `Wishing you a fantastic birthday, ${employeeName}!`,
          type: 'birthday'
        });

        // 2. Notify all Admins
        await notifyAdmins(
          'Employee Birthday 🎉', 
          `Today is ${employeeName}'s Birthday.`, 
          'birthday', 
          `/employees/${bday.employee.id}`
        );

        // 3. Notify all assigned managers and partners
        const managers = await prisma.employeeManager.findMany({ 
          where: { employeeId: bday.employee.id },
          select: { managerId: true }
        });
        const partners = await prisma.employeePartner.findMany({ 
          where: { employeeId: bday.employee.id },
          select: { partnerId: true }
        });

        const notifyIds = new Set([...managers.map(m => m.managerId), ...partners.map(p => p.partnerId)]);

        for (const notifyId of notifyIds) {
          await triggerNotification({
            userId: notifyId,
            title: 'Team Birthday 🎉',
            message: `Today is ${employeeName}'s Birthday.`,
            type: 'birthday',
            actionUrl: `/employees/${bday.employee.id}`
          });
        }
      }

      console.log(`✅ Processed ${birthdayEmployees.length} birthdays today.`);
    } catch (error) {
      console.error('❌ Error executing birthday cron job', error);
    }
  });


  
  // ⏰ Auto Check-Out Job
  // Run everyday at 11:59 PM server time
  cron.schedule('59 23 * * *', async () => {
    console.log('⏰ Running Auto Check-Out Cron Job...');
    
    try {
      const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const today = new Date(`${todayStr}T00:00:00.000Z`);

      // Find all active attendance records for today that haven't checked out
      const openAttendances = await prisma.attendance.findMany({
        where: {
          date: today,
          check_out_time: null
        }
      });

      console.log(`🔍 Found ${openAttendances.length} open attendance records for auto check-out.`);

      for (const record of openAttendances) {
        const autoCheckoutTime = new Date();
        // Set to 6:30 PM of the same day as shift end, or keep as current time (23:59)
        // Using 6:30 PM (18:30) as a reasonable shift end fallback
        autoCheckoutTime.setHours(18, 30, 0, 0);

        const checkoutTime = record.check_in_time
          ? new Date(Math.max(autoCheckoutTime.getTime(), new Date(record.check_in_time).getTime()))
          : autoCheckoutTime;

        // Close any open attendance_sessions for this attendance record
        const openSessions = await prisma.attendance_sessions.findMany({
          where: {
            employee_id: record.employee_id,
            date: record.date,
            check_out_time: null
          }
        });

        for (const activeSession of openSessions) {
          const sessCheckoutTime = new Date(
            Math.max(checkoutTime.getTime(), new Date(activeSession.check_in_time).getTime())
          );
          const durationMs = sessCheckoutTime.getTime() - new Date(activeSession.check_in_time).getTime();
          const durationMinutes = Math.max(0, Math.round(durationMs / (1000 * 60)));

          await prisma.attendance_sessions.update({
            where: { id: activeSession.id },
            data: {
              check_out_time: sessCheckoutTime,
              duration: durationMinutes,
              is_auto_checkout: true,
              location_name: 'Auto Check-out (System)'
            } as any
          });
        }

        // Calculate total hours from all sessions for this attendance record
        const allSessions = await prisma.attendance_sessions.findMany({
          where: {
            employee_id: record.employee_id,
            date: record.date
          }
        });

        const totalMinutes = allSessions.reduce((acc: number, sess: any) => acc + (sess.duration || 0), 0);
        const totalHours = parseFloat((totalMinutes / 60).toFixed(2));

        // Update main attendance record
        await prisma.attendance.update({
          where: { id: record.id },
          data: {
            check_out_time: checkoutTime,
            total_hours: totalHours,
            is_auto_checkout: true,
            status: 'INCOMPLETE', // 🔥 Mark as Incomplete
            check_out_location: 'Auto Check-out (System)'
          } as any
        });

        // Look up the employee's UUID (Employee.id) since record.employee_id is the employee code (e.g. EMP001)
        const emp = await prisma.employee.findUnique({
          where: { employeeId: record.employee_id },
          select: { id: true }
        });

        if (emp?.id) {
          await triggerNotification({
            userId: emp.id,
            title: 'Auto Check-out Notice ⏱️',
            message: 'You forgot to check out today. The system has automatically checked you out at 6:30 PM. Your status is marked as INCOMPLETE.',
            type: 'attendance'
          });
        }

        console.log(`✅ Auto checked-out employee: ${record.employee_id}`);
      }
    } catch (error) {
      console.error('❌ Error executing auto check-out cron job', error);
    }
  });

  // ⏰ Register all compliance schedulers (daily, Thursday, Friday, Monday)
  registerComplianceSchedulers();
  registerEsslScheduler();

  console.log(`[Cron] Cron Jobs registered.`);
};
