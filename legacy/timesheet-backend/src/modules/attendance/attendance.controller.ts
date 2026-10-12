import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../../config/prisma';
import { v4 as uuidv4 } from 'uuid';
import { getLocationName } from '../../utils/location';
import { logActivity } from '../activity/activity.service';

// ✅ Check-in (Login)
export const checkIn = async (req: any, res: Response) => {
  try {
    const employeeId = req.user?.employeeId;
    let location = req.body?.location;
    const { lat, lng, latitude, longitude, manualCheckIn } = req.body;
    
    // Requirement 2: Manual Check-In validation
    if (!manualCheckIn) {
      return res.status(400).json({
        success: false,
        message: "Manual check-in required"
      });
    }

    // Requirement 7: Prevent attendance from stale tokens
    const currentEpoch = Math.floor(Date.now() / 1000);
    const tokenAgeSeconds = currentEpoch - (req.user?.iat || 0);
    if (tokenAgeSeconds > 3600) { // 1 hour
      return res.status(401).json({
        success: false,
        message: "Your session is stale (older than 1 hour). Please log out and log in again to check in.",
        errorCode: "STALE_TOKEN"
      });
    }

    // Explicitly handle coordinates from either format
    const finalLat = latitude !== undefined ? latitude : lat;
    const finalLng = longitude !== undefined ? longitude : lng;
    
    if (!location && finalLat !== undefined && finalLng !== undefined && finalLat !== null && finalLng !== null) {
      location = await getLocationName(finalLat, finalLng);
    }
    
    console.log(`[Attendance] checkIn attempt for: ${employeeId}, location: ${location}, coords: ${finalLat},${finalLng}`);
    
    if (!employeeId) {
      return res.status(401).json({ success: false, message: "Unauthorized: Missing employee identity" });
    }
    
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const today = new Date(`${todayStr}T00:00:00.000Z`);

    // Requirement 7: Prevent duplicate check-ins
    const activeSession = await prisma.attendance_sessions.findFirst({
      where: {
        employee_id: employeeId,
        check_out_time: null
      }
    });

    if (activeSession) {
      return res.status(400).json({ 
        success: false, 
        message: "You already have an active session. Please logout first.",
        errorCode: "ACTIVE_SESSION_EXISTS"
      });
    }

    // Determine trigger source
    const attendanceSource = req.body.attendance_source || 'MANUAL';

    // Requirement 4: Create daily attendance record only once per day
    const existingAttendance = await prisma.attendance.findUnique({
      where: {
        employee_id_date: {
          employee_id: employeeId,
          date: today
        }
      }
    });

    if (existingAttendance) {
      await prisma.attendance.update({
        where: {
          employee_id_date: {
            employee_id: employeeId,
            date: today
          }
        },
        data: {
          status: 'Present',
          is_auto_checkout: false
        } as any
      });
    } else {
      await prisma.attendance.create({
        data: {
          id: uuidv4(),
          employee_id: employeeId,
          date: today,
          status: 'Present',
          check_in_time: new Date(),
          check_in_location: location || null,
          location_name: location || null,
          latitude: (finalLat !== undefined && finalLat !== null) ? parseFloat(finalLat.toString()) : null,
          longitude: (finalLng !== undefined && finalLng !== null) ? parseFloat(finalLng.toString()) : null,
          attendance_source: attendanceSource
        } as any
      });
    }

    // Create new session
    const session = await prisma.attendance_sessions.create({
      data: {
        id: uuidv4(),
        employee_id: employeeId,
        check_in_time: new Date(),
        check_in_location: location || null,
        location_name: location || null,
        latitude: (finalLat !== undefined && finalLat !== null) ? parseFloat(finalLat.toString()) : null,
        longitude: (finalLng !== undefined && finalLng !== null) ? parseFloat(finalLng.toString()) : null,
        date: today
      } as any
    });

    // Requirement 6: Add debugging logs
    const debugDetails = {
      employeeId,
      ip: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown',
      userAgent: req.headers['user-agent'] || 'Unknown',
      sessionId: session.id,
      loginTime: session.check_in_time.toISOString(),
      attendanceTriggerSource: attendanceSource,
      coordinates: (finalLat !== undefined && finalLng !== undefined && finalLat !== null && finalLng !== null) ? `${finalLat},${finalLng}` : 'None',
      timestamp: new Date().toISOString()
    };
    console.log("[ATTENDANCE DEBUG] [CHECK-IN]", JSON.stringify(debugDetails, null, 2));

    // Log Activity
    await logActivity({
      type: 'check_in',
      title: 'Attendance Checked-In',
      description: `Clocked in at ${location || 'Unknown Location'}`,
      userId: req.user?.id
    });

    res.json({ success: true, message: "Check-in successful", data: session });
  } catch (error: any) {
    console.error("Check-in error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Standalone Attendance Login (with Credentials)
export const attendanceLogin = async (req: Request, res: Response) => {
  try {
    const { employeeId, password, latitude, longitude, location, manualCheckIn } = req.body;
    
    // Requirement 2: Manual Check-In validation
    if (!manualCheckIn) {
      return res.status(400).json({
        success: false,
        message: "Manual check-in required"
      });
    }

    console.log(`[Attendance] login attempt for: ${employeeId}`);

    if (!employeeId || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing credentials: employeeId and password are required",
        errorCode: "MISSING_CREDENTIALS"
      });
    }

    // Find employee
    const employee = await prisma.employee.findUnique({
      where: { employeeId }
    });

    if (!employee || !employee.password) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, employee.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const today = new Date(`${todayStr}T00:00:00.000Z`);

    const activeSession = await prisma.attendance_sessions.findFirst({
      where: {
        employee_id: employeeId,
        check_out_time: null
      }
    });

    if (activeSession) {
      return res.status(400).json({ 
        success: false, 
        message: "You already have an active session. Please logout first." 
      });
    }

    let finalLocation = location;
    const finalLat = latitude !== undefined ? latitude : null;
    const finalLng = longitude !== undefined ? longitude : null;

    if (!finalLocation && finalLat !== null && finalLng !== null) {
      finalLocation = await getLocationName(finalLat, finalLng);
    }

    const attendanceSource = req.body.attendance_source || 'MANUAL';

    const existingAttendance = await prisma.attendance.findUnique({
      where: {
        employee_id_date: {
          employee_id: employeeId,
          date: today
        }
      }
    });

    if (existingAttendance) {
      await prisma.attendance.update({
        where: {
          employee_id_date: {
            employee_id: employeeId,
            date: today
          }
        },
        data: {
          status: 'Present',
          is_auto_checkout: false
        } as any
      });
    } else {
      await prisma.attendance.create({
        data: {
          id: uuidv4(),
          employee_id: employeeId,
          date: today,
          status: 'Present',
          check_in_time: new Date(),
          check_in_location: finalLocation || null,
          location_name: finalLocation || null,
          latitude: (finalLat !== undefined && finalLat !== null) ? parseFloat(finalLat.toString()) : null,
          longitude: (finalLng !== undefined && finalLng !== null) ? parseFloat(finalLng.toString()) : null,
          attendance_source: attendanceSource
        } as any
      });
    }

    const session = await prisma.attendance_sessions.create({
      data: {
        id: uuidv4(),
        employee_id: employeeId,
        check_in_time: new Date(),
        check_in_location: finalLocation || null,
        location_name: finalLocation || null,
        latitude: (finalLat !== undefined && finalLat !== null) ? parseFloat(finalLat.toString()) : null,
        longitude: (finalLng !== undefined && finalLng !== null) ? parseFloat(finalLng.toString()) : null,
        date: today
      } as any
    });

    // Requirement 6: Add debugging logs
    const debugDetails = {
      employeeId,
      ip: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown',
      userAgent: req.headers['user-agent'] || 'Unknown',
      sessionId: session.id,
      loginTime: session.check_in_time.toISOString(),
      attendanceTriggerSource: attendanceSource,
      coordinates: (finalLat !== null && finalLng !== null) ? `${finalLat},${finalLng}` : 'None',
      timestamp: new Date().toISOString()
    };
    console.log("[ATTENDANCE DEBUG] [ATTENDANCE-LOGIN]", JSON.stringify(debugDetails, null, 2));

    // Log Activity
    await logActivity({
      type: 'attendance_login',
      title: 'Attendance Logged In',
      description: `Logged in and clocked in at ${finalLocation || 'Unknown Location'}`,
      userId: employee.id
    });

    res.json({ success: true, message: "Attendance login successful", data: session });
  } catch (error: any) {
    console.error("Attendance login error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Check-out (Logout)
export const checkOut = async (req: any, res: Response) => {
  try {
    const employeeId = req.user?.employeeId;
    let location = req.body?.location;
    const { lat, lng, latitude, longitude } = req.body;
    const finalLat = latitude !== undefined ? latitude : lat;
    const finalLng = longitude !== undefined ? longitude : lng;

    // Requirement 7: Prevent attendance from stale tokens
    const currentEpoch = Math.floor(Date.now() / 1000);
    const tokenAgeSeconds = currentEpoch - (req.user?.iat || 0);
    if (tokenAgeSeconds > 3600) { // 1 hour
      return res.status(401).json({
        success: false,
        message: "Your session is stale (older than 1 hour). Please log out and log in again to check out.",
        errorCode: "STALE_TOKEN"
      });
    }

    if (!location && finalLat && finalLng) {
      location = await getLocationName(finalLat, finalLng);
    }
    if (!employeeId) {
      return res.status(401).json({ success: false, message: "Unauthorized: Missing employee identity" });
    }
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const today = new Date(`${todayStr}T00:00:00.000Z`);

    // Find latest active session
    const activeSession = await prisma.attendance_sessions.findFirst({
      where: {
        employee_id: employeeId,
        check_out_time: null
      },
      orderBy: { check_in_time: 'desc' }
    });

    if (!activeSession) {
      return res.status(400).json({ 
        success: false, 
        message: "No active session found. Please login first." 
      });
    }

    const checkOutTime = new Date();
    const durationMs = checkOutTime.getTime() - activeSession.check_in_time.getTime();
    const durationMinutes = Math.round(durationMs / (1000 * 60));

    const sessionDate = activeSession.date ? new Date(activeSession.date) : new Date(activeSession.check_in_time);
    sessionDate.setHours(0, 0, 0, 0);

    // Update session
    await prisma.attendance_sessions.update({
      where: { id: activeSession.id },
      data: {
        check_out_time: checkOutTime,
        check_out_location: location || null,
        duration: durationMinutes
      } as any
    });

    // Recalculate daily total hours for the day the session was checked in
    const allSessions = await prisma.attendance_sessions.findMany({
      where: {
        employee_id: employeeId,
        date: sessionDate
      }
    });

    const totalMinutes = allSessions.reduce((acc: number, sess: any) => acc + (sess.duration || 0), 0);
    const totalHours = parseFloat((totalMinutes / 60).toFixed(2));

    // Requirement 3: Only update check_out_time and check_out_location. DO NOT update location_name, check_in_location or check-in coordinates.
    await prisma.attendance.upsert({
      where: {
        employee_id_date: {
          employee_id: employeeId,
          date: sessionDate
        }
      },
      update: {
        check_out_time: checkOutTime,
        check_out_location: location || null,
        total_hours: totalHours,
        status: 'Present',
        is_auto_checkout: false
      } as any,
      create: {
        id: uuidv4(),
        employee_id: employeeId,
        date: sessionDate,
        check_in_time: activeSession.check_in_time,
        check_in_location: activeSession.check_in_location || null,
        check_out_time: checkOutTime,
        check_out_location: location || null,
        location_name: activeSession.location_name || activeSession.check_in_location || null,
        latitude: activeSession.latitude,
        longitude: activeSession.longitude,
        total_hours: totalHours,
        status: 'Present',
        is_auto_checkout: false,
        attendance_source: 'MANUAL'
      } as any
    });

    // Requirement 6: Add debugging logs
    const debugDetails = {
      employeeId,
      ip: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown',
      userAgent: req.headers['user-agent'] || 'Unknown',
      sessionId: activeSession.id,
      loginTime: activeSession.check_in_time.toISOString(),
      attendanceTriggerSource: 'MANUAL',
      coordinates: (finalLat !== undefined && finalLng !== undefined) ? `${finalLat},${finalLng}` : 'None',
      timestamp: new Date().toISOString()
    };
    console.log("[ATTENDANCE DEBUG] [CHECK-OUT]", JSON.stringify(debugDetails, null, 2));

    // Log Activity
    await logActivity({
      type: 'check_out',
      title: 'Attendance Checked-Out',
      description: `Clocked out at ${location || 'Unknown Location'} with ${totalHours} hours logged`,
      userId: req.user?.id
    });

    res.json({ success: true, message: "Check-out successful", totalHours });
  } catch (error: any) {
    console.error("Check-out error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Get Comprehensive Attendance Dashboard Data
export const getTodaySummary = async (req: any, res: Response) => {
  try {
    const employeeId = req.user?.employeeId;
    if (!employeeId) {
      return res.status(401).json({ success: false, message: "Unauthorized: Missing employee identity" });
    }

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const today = new Date(`${todayStr}T00:00:00.000Z`);

    // 1. Fetch User and Today's Record
    const [user, todayRecord, activeSession] = await Promise.all([
      prisma.employee.findUnique({
        where: { employeeId }
      }),
      prisma.attendance.findUnique({
        where: { employee_id_date: { employee_id: employeeId, date: today } },
        include: { attendance_sessions: { orderBy: { check_in_time: 'asc' } } }
      }),
      prisma.attendance_sessions.findFirst({
        where: { employee_id: employeeId, check_out_time: null }
      })
    ]);

    // Backfill location_name for today's record if missing
    if (todayRecord && !todayRecord.location_name) {
      let lat = (todayRecord as any).latitude;
      let lng = (todayRecord as any).longitude;

      // Try to parse from check_in_location string if float fields are missing
      if ((!lat || !lng) && todayRecord.check_in_location) {
        const parts = todayRecord.check_in_location.split(',');
        if (parts.length === 2) {
          const pLat = parseFloat(parts[0].trim());
          const pLng = parseFloat(parts[1].trim());
          if (!isNaN(pLat) && !isNaN(pLng)) {
            lat = pLat;
            lng = pLng;
          }
        }
      }

      if (lat && lng) {
        const name = await getLocationName(lat, lng);
        await prisma.attendance.update({
          where: { id: todayRecord.id },
          data: { location_name: name }
        });
        todayRecord.location_name = name;
      }
    }

    // Backfill location_name for sessions if missing
    if (todayRecord?.attendance_sessions) {
      for (const session of todayRecord.attendance_sessions) {
        if (!session.location_name && session.latitude && session.longitude) {
          const name = await getLocationName(session.latitude, session.longitude);
          await prisma.attendance_sessions.update({
            where: { id: session.id },
            data: { location_name: name }
          });
          session.location_name = name;
        }
      }
    }

    // 2. Weekly Stats (Monday to Sunday)
    const startOfWeek = new Date(today);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    const weeklyRecords = await prisma.attendance.findMany({
      where: {
        employee_id: employeeId,
        date: { gte: startOfWeek, lte: today }
      }
    });

    const weeklyHours = weeklyRecords.reduce((acc: number, r: any) => acc + (r.total_hours || 0), 0);
    const presentDays = weeklyRecords.filter((r: any) => r.status === 'Present' || r.status === 'Late').length;
    
    // Simple average in-time calculation
    let avgInTime = '--:--';
    const validInTimes = weeklyRecords
      .map((r: any) => r.check_in_time)
      .filter((t: any) => t) as Date[];
    
    if (validInTimes.length > 0) {
      const totalMinutes = validInTimes.reduce((acc: number, t: Date) => {
        return acc + (t.getHours() * 60 + t.getMinutes());
      }, 0);
      const avgMinutes = totalMinutes / validInTimes.length;
      const h = Math.floor(avgMinutes / 60);
      const m = Math.floor(avgMinutes % 60);
      avgInTime = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }

    // 3. Work Log (Last 30 days)
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);

    const workLog = await prisma.attendance.findMany({
      where: {
        employee_id: employeeId,
        date: { gte: thirtyDaysAgo, lt: today }
      },
      orderBy: { date: 'desc' },
      take: 10
    });

    res.json({
      success: true,
      data: {
        user,
        status: activeSession ? 'Active' : 'Inactive',
        todayRecord: todayRecord ? {
          checkInTime: todayRecord.check_in_time,
          checkOutTime: todayRecord.check_out_time,
          status: todayRecord.status,
          totalHours: todayRecord.total_hours,
          checkInLocation: todayRecord.check_in_location,
          checkOutLocation: todayRecord.check_out_location,
          location_name: todayRecord.location_name,
          latitude: (todayRecord as any).latitude,
          longitude: (todayRecord as any).longitude
        } : null,
        checkInLocation: todayRecord?.location_name || todayRecord?.check_in_location,
        checkOutLocation: todayRecord?.location_name || todayRecord?.check_out_location,
        activeSession,
        activeSessions: todayRecord?.attendance_sessions || [],
        weeklyStats: {
          totalHours: weeklyHours.toFixed(2),
          presentDays,
          avgInTime
        },
        workLog: workLog.map((r: any) => ({
          date: r.date,
          status: r.status,
          checkInTime: r.check_in_time,
          checkOutTime: r.check_out_time,
          totalHours: r.total_hours
        }))
      }
    });
  } catch (error: any) {
    console.error("Attendance Dashboard Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Get Weekly Summary
export const getWeeklySummary = async (req: any, res: Response) => {
  try {
    const employeeId = req.user?.employeeId;
    if (!employeeId) {
      return res.status(401).json({ success: false, message: "Unauthorized: Missing employee identity" });
    }
    const now = new Date();
    
    // Get start of week (Monday)
    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    // Get end of week (Sunday)
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        employee_id: employeeId,
        date: {
          gte: startOfWeek,
          lte: endOfWeek
        }
      },
      include: {
        attendance_sessions: {
          orderBy: { check_in_time: 'asc' }
        }
      },
      orderBy: { date: 'asc' }
    });

    // Map records to each day of the week
    const weeklyData = [];
    const currentDate = new Date(startOfWeek);
    
    for (let i = 0; i < 7; i++) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const record = attendanceRecords.find(r => r.date.toISOString().split('T')[0] === dateStr);
      
      const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;
      
      weeklyData.push({
        date: new Date(currentDate),
        dateStr: dateStr,
        status: record ? record.status : (isWeekend ? 'Weekend' : (currentDate < now ? 'Absent' : 'Yet to check-in')),
        totalHours: record?.total_hours || 0,
        sessions: record?.attendance_sessions || [],
        check_in: record?.check_in_time || null,
        check_out: record?.check_out_time || null
      });
      
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const totalWeeklyHours = parseFloat(attendanceRecords.reduce((acc: number, r: any) => acc + (r.total_hours || 0), 0).toFixed(2));

    res.json({
      success: true,
      data: {
        weeklyData,
        totalWeeklyHours,
        weekStart: startOfWeek,
        weekEnd: endOfWeek
      }
    });
  } catch (error: any) {
    console.error("Weekly summary error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Get History
export const getHistory = async (req: any, res: Response) => {
  try {
    const employeeId = req.user?.employeeId;
    if (!employeeId) {
      return res.status(401).json({ success: false, message: "Unauthorized: Missing employee identity" });
    }
    const limit = parseInt(req.query.limit as string) || 30;
    const history = await prisma.attendance.findMany({
      where: { employee_id: employeeId },
      orderBy: { date: 'desc' },
      take: Number(limit),
      include: {
        attendance_sessions: true
      }
    });

    res.json({ success: true, data: history });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
// ✅ Get All Attendance (Admin)
export const getAllAttendance = async (req: any, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: "Missing required date range parameters (startDate, endDate)" });
    }

    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid date format" });
    }
    
    // Ensure we cover the full end day
    end.setHours(23, 59, 59, 999);
    
    const attendance = await prisma.attendance.findMany({
      where: {
        date: {
          gte: start,
          lte: end
        }
      },
      include: {
        Employee: true,
        attendance_sessions: {
          orderBy: {
            check_in_time: 'asc'
          }
        }
      },
      orderBy: {
        date: 'desc'
      }
    });

    const transformedData = attendance.map((log: any) => ({
      ...log,
      employee: log.Employee,
      checkInTime: log.check_in_time,
      checkOutTime: log.check_out_time,
      totalHours: log.total_hours ? parseFloat(Number(log.total_hours).toFixed(2)) : 0,
      employeeId: log.employee_id,
      latitude: (log as any).latitude,
      longitude: (log as any).longitude,
      location_name: (log as any).location_name
    }));

    res.json({ success: true, data: transformedData });
  } catch (error: any) {
    console.error("Attendance Fetch Error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
  }
};
// ✅ Get Attendance Report (Detailed)
export const getAttendanceReport = async (req: any, res: Response) => {
  try {
    const { employeeId, date } = req.query;
    
    if (!employeeId || !date) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing required parameters: employeeId and date" 
      });
    }

    const targetDate = new Date(date as string);
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid date format" });
    }

    // Get attendance record with sessions
    const attendance = await prisma.attendance.findFirst({
      where: {
        employee_id: employeeId,
        date: targetDate
      },
      include: {
        Employee: true,
        attendance_sessions: {
          orderBy: {
            check_in_time: 'asc'
          }
        }
      }
    });

    if (!attendance) {
      return res.status(404).json({ 
        success: false, 
        message: "No attendance record found for this date" 
      });
    }

    // Calculate total break time and working hours
    const sessions = attendance.attendance_sessions || [];
    const totalWorkMinutes = sessions.reduce((acc: number, sess: any) => acc + (sess.duration || 0), 0);
    const totalBreakTime = sessions.length > 1 ? 
      sessions.slice(0, -1).reduce((acc: number, sess: any, idx: number) => {
        const nextSession = sessions[idx + 1];
        if (nextSession && sess.check_out_time) {
          const breakMs = new Date(nextSession.check_in_time).getTime() - new Date(sess.check_out_time).getTime();
          return acc + Math.round(breakMs / (1000 * 60));
        }
        return acc;
      }, 0) : 0;

    res.json({
      success: true,
      data: {
        employee: attendance.Employee,
        attendance: {
          date: attendance.date,
          checkInTime: attendance.check_in_time,
          checkOutTime: attendance.check_out_time,
          status: attendance.status,
          totalHours: attendance.total_hours,
          checkInLocation: attendance.check_in_location,
          checkOutLocation: attendance.check_out_location,
          location_name: attendance.location_name,
          latitude: (attendance as any).latitude,
          longitude: (attendance as any).longitude
        },
        sessions: sessions.map(sess => ({
          id: sess.id,
          checkInTime: sess.check_in_time,
          checkOutTime: sess.check_out_time,
          duration: sess.duration,
          checkInLocation: sess.check_in_location,
          checkOutLocation: sess.check_out_location,
          location_name: sess.location_name,
          latitude: (sess as any).latitude,
          longitude: (sess as any).longitude
        })),
        summary: {
          totalWorkHours: (totalWorkMinutes / 60).toFixed(2),
          totalBreakHours: (totalBreakTime / 60).toFixed(2),
          netWorkHours: ((totalWorkMinutes - totalBreakTime) / 60).toFixed(2),
          sessionCount: sessions.length
        }
      }
    });
  } catch (error: any) {
    console.error("Attendance Report Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Get Monthly Attendance Trends
export const getMonthlyTrends = async (req: any, res: Response) => {
  try {
    const { employeeId, month } = req.query;
    
    if (!employeeId || !month) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing required parameters: employeeId and month (YYYY-MM)" 
      });
    }

    // Parse month (YYYY-MM format)
    const [year, monthNum] = (month as string).split('-').map(Number);
    if (isNaN(year) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ success: false, message: "Invalid month format. Use YYYY-MM" });
    }

    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999); // Last day of month

    // Get all attendance records for the month
    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        employee_id: employeeId,
        date: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        attendance_sessions: true
      },
      orderBy: {
        date: 'asc'
      }
    });

    // Get employee info
    const employee = await prisma.employee.findUnique({
      where: { employeeId }
    });

    // Calculate daily stats
    const dailyStats = attendanceRecords.map(record => {
      const sessions = record.attendance_sessions || [];
      const totalMinutes = sessions.reduce((acc: number, sess: any) => acc + (sess.duration || 0), 0);
      const totalHours = (totalMinutes / 60).toFixed(2);
      
      return {
        date: record.date,
        status: record.status,
        totalHours: parseFloat(totalHours),
        sessionCount: sessions.length,
        checkInTime: record.check_in_time,
        checkOutTime: record.check_out_time,
        isWeekend: record.date.getDay() === 0 || record.date.getDay() === 6
      };
    });

    // Calculate monthly summary
    const presentDays = dailyStats.filter(d => d.status === 'Present' || d.status === 'Late').length;
    const absentDays = dailyStats.filter(d => d.status === 'Absent').length;
    const lateDays = dailyStats.filter(d => d.status === 'Late').length;
    const totalWorkingHours = dailyStats.reduce((acc: number, d) => acc + d.totalHours, 0);
    const avgDailyHours = presentDays > 0 ? (totalWorkingHours / presentDays).toFixed(2) : '0.0';

    res.json({
      success: true,
      data: {
        employee,
        month: month,
        period: {
          startDate,
          endDate,
          totalDays: endDate.getDate()
        },
        dailyStats,
        summary: {
          presentDays,
          absentDays,
          lateDays,
          totalWorkingHours: totalWorkingHours.toFixed(2),
          avgDailyHours,
          attendanceRate: ((presentDays / dailyStats.length) * 100).toFixed(2)
        }
      }
    });
  } catch (error: any) {
    console.error("Monthly Trends Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Update Attendance Record
export const updateAttendance = async (req: any, res: Response) => {
  try {
    const { employeeId, date, checkInTime, checkOutTime } = req.body;
    
    if (!employeeId || !date) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing required parameters: employeeId and date" 
      });
    }

    const targetDate = new Date(date);
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid date format" });
    }

    // Find or create attendance record
    const attendance = await prisma.attendance.findFirst({
      where: {
        employee_id: employeeId,
        date: targetDate
      }
    });

    if (!attendance) {
      return res.status(404).json({ 
        success: false, 
        message: "No attendance record found for this employee on specified date" 
      });
    }

    // Update attendance record
    const updateData: any = {
      status: 'Present',
      is_auto_checkout: false
    };

    if (checkInTime) {
      const checkInDate = new Date(checkInTime);
      if (!isNaN(checkInDate.getTime())) {
        updateData.check_in_time = checkInDate;
        
        // Update the first session's check-in time if it exists
        const firstSession = await prisma.attendance_sessions.findFirst({
          where: {
            employee_id: employeeId,
            date: targetDate
          },
          orderBy: {
            check_in_time: 'asc'
          }
        });
        
        if (firstSession) {
          await prisma.attendance_sessions.update({
            where: { id: firstSession.id },
            data: {
              check_in_time: checkInDate
            }
          });
        }
      }
    }

    if (checkOutTime) {
      const checkOutDate = new Date(checkOutTime);
      if (!isNaN(checkOutDate.getTime())) {
        updateData.check_out_time = checkOutDate;
        
        // Update the last session's check-out time if it exists
        const lastSession = await prisma.attendance_sessions.findFirst({
          where: {
            employee_id: employeeId,
            date: targetDate
          },
          orderBy: {
            check_in_time: 'desc'
          }
        });
        
        if (lastSession) {
          const durationMs = checkOutDate.getTime() - lastSession.check_in_time.getTime();
          const durationMinutes = Math.round(durationMs / (1000 * 60));
          
          await prisma.attendance_sessions.update({
            where: { id: lastSession.id },
            data: {
              check_out_time: checkOutDate,
              duration: durationMinutes
            }
          });
        }
      }
    }

    // Recalculate total hours if both check-in and check-out are provided
    if (checkInTime && checkOutTime) {
      const sessions = await prisma.attendance_sessions.findMany({
        where: {
          employee_id: employeeId,
          date: targetDate
        }
      });
      
      const totalMinutes = sessions.reduce((acc: number, sess: any) => acc + (sess.duration || 0), 0);
      updateData.total_hours = parseFloat((totalMinutes / 60).toFixed(2));
    }

    await prisma.attendance.update({
      where: { id: attendance.id },
      data: updateData
    });

    res.json({ 
      success: true, 
      message: "Attendance updated successfully",
      data: updateData
    });
  } catch (error: any) {
    console.error("Update Attendance Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Force Check-out
export const forceCheckout = async (req: any, res: Response) => {
  try {
    const { employeeId, date } = req.body;
    
    if (!employeeId || !date) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing required parameters: employeeId and date" 
      });
    }

    const targetDate = new Date(date);
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid date format" });
    }

    // Find active session for the employee on that date
    const activeSession = await prisma.attendance_sessions.findFirst({
      where: {
        employee_id: employeeId,
        date: targetDate,
        check_out_time: null
      },
      orderBy: {
        check_in_time: 'desc'
      }
    });

    if (!activeSession) {
      return res.status(404).json({ 
        success: false, 
        message: "No active session found for this employee on the specified date" 
      });
    }

    const checkOutTime = new Date();
    const durationMs = checkOutTime.getTime() - activeSession.check_in_time.getTime();
    const durationMinutes = Math.round(durationMs / (1000 * 60));

    // Update the session
    await prisma.attendance_sessions.update({
      where: { id: activeSession.id },
      data: {
        check_out_time: checkOutTime,
        duration: durationMinutes
      }
    });

    // Recalculate daily total hours
    const allSessions = await prisma.attendance_sessions.findMany({
      where: {
        employee_id: employeeId,
        date: targetDate
      }
    });

    const totalMinutes = allSessions.reduce((acc: number, sess: any) => acc + (sess.duration || 0), 0);
    const totalHours = parseFloat((totalMinutes / 60).toFixed(2));

    // Update attendance record
    await prisma.attendance.update({
      where: {
        employee_id_date: {
          employee_id: employeeId,
          date: targetDate
        }
      },
      data: {
        check_out_time: checkOutTime,
        total_hours: totalHours
      }
    });

    res.json({ 
      success: true, 
      message: "Employee checked out successfully",
      data: {
        checkOutTime,
        duration: durationMinutes,
        totalHours
      }
    });
  } catch (error: any) {
    console.error("Force Checkout Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Aliases for compatibility
export const punchIn = checkIn;
export const punchOut = checkOut;

// ✅ Get Weekly Pulse Comparison (Calculated from attendance table)
export const getWeeklyPulseComparison = async (req: any, res: Response) => {
  try {
    const user = req.user;
    if (!user || !user.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const startStr = req.query.startDate as string;
    const endStr = req.query.endDate as string;

    if (!startStr || !endStr) {
      return res.status(400).json({ success: false, message: "Missing required date range parameters (startDate, endDate)" });
    }

    // Build UTC midnight dates that match how dates are stored in the DB
    // (attendance.checkIn stores: new Date(`${todayStr}T00:00:00.000Z`))
    const prevWeekStart = new Date(`${startStr}T00:00:00.000Z`);
    const currentWeekEnd = new Date(`${endStr}T23:59:59.999Z`);

    // The prev week is the first 7 days, current week is the next 7 days
    const prevWeekEnd = new Date(prevWeekStart);
    prevWeekEnd.setUTCDate(prevWeekStart.getUTCDate() + 6);
    prevWeekEnd.setUTCHours(23, 59, 59, 999);

    const currentWeekStart = new Date(prevWeekEnd);
    currentWeekStart.setUTCMilliseconds(currentWeekStart.getUTCMilliseconds() + 1);

    console.log("🔍 Weekly Pulse Comparison:");
    console.log(`- Employee: ${user.employeeId || user.id}`);
    console.log(`- Prev Week: ${prevWeekStart.toISOString()} → ${prevWeekEnd.toISOString()}`);
    console.log(`- This Week: ${currentWeekStart.toISOString()} → ${currentWeekEnd.toISOString()}`);

    // Query attendance records for both weeks
    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        employee_id: user.employeeId,
        date: {
          gte: prevWeekStart,
          lte: currentWeekEnd
        }
      }
    });

    console.log(`- Records Found: ${attendanceRecords.length}`);

    const thisWeekDays: Record<string, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
    const prevWeekDays: Record<string, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
    let thisWeekHours = 0;
    let prevWeekHours = 0;

    const dayNames: Record<number, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun' };

    attendanceRecords.forEach(record => {
      const recordDate = new Date(record.date);
      const hours = Number(record.total_hours || 0);
      // Use UTC day since dates are stored as UTC midnight
      const dayName = dayNames[recordDate.getUTCDay()] || 'Mon';

      if (recordDate >= currentWeekStart && recordDate <= currentWeekEnd) {
        thisWeekHours += hours;
        thisWeekDays[dayName] = (thisWeekDays[dayName] || 0) + hours;
      } else if (recordDate >= prevWeekStart && recordDate <= prevWeekEnd) {
        prevWeekHours += hours;
        prevWeekDays[dayName] = (prevWeekDays[dayName] || 0) + hours;
      }
    });

    // Add live running session hours to today's slot (if user is active right now)
    const activeSession = await prisma.attendance_sessions.findFirst({
      where: {
        employee_id: user.employeeId,
        check_out_time: null
      }
    });

    if (activeSession?.check_in_time) {
      const now = new Date();
      const liveHours = (now.getTime() - new Date(activeSession.check_in_time).getTime()) / 3600000;
      const todayName = dayNames[now.getDay()] || 'Mon';

      // Add live hours on top of any already-recorded hours for today
      thisWeekDays[todayName] = (thisWeekDays[todayName] || 0) + liveHours;
      thisWeekHours += liveHours;

      console.log(`- Live Session: +${liveHours.toFixed(2)}h added to ${todayName}`);
    }

    const hoursDiff = parseFloat((thisWeekHours - prevWeekHours).toFixed(2));
    const percentDiff = prevWeekHours > 0 ? parseFloat(((hoursDiff / prevWeekHours) * 100).toFixed(1)) : 0;

    console.log(`- This Week Total: ${thisWeekHours.toFixed(2)}h, Prev Week: ${prevWeekHours.toFixed(2)}h, Diff: ${hoursDiff}h (${percentDiff}%)`);

    res.json({
      success: true,
      data: {
        thisWeekHours: parseFloat(thisWeekHours.toFixed(2)),
        prevWeekHours: parseFloat(prevWeekHours.toFixed(2)),
        percentDiff,
        hoursDiff,
        thisWeekDays,
        prevWeekDays
      }
    });
  } catch (error: any) {
    console.error("Weekly Pulse Comparison Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
