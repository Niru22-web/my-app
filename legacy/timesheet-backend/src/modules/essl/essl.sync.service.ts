import { prisma } from '../../config/prisma';
import { EsslMachineService } from './essl.machine.service';
import { EsslService } from './essl.service';
import { EsslPunchLog, EsslSyncResult } from './essl.types';
import { v4 as uuidv4 } from 'uuid';
import { logActivity } from '../activity/activity.service';

export class EsslSyncService {
  /**
   * Sync punches from a specific machine
   */
  static async syncMachine(machineId: string): Promise<EsslSyncResult> {
    const errors: string[] = [];
    let recordsSynced = 0;

    try {
      const machine = await EsslService.getMachineById(machineId);
      if (!machine) {
        throw new Error(`Machine with ID ${machineId} not found.`);
      }

      if (!machine.isActive) {
        return { success: true, recordsSynced: 0, errors: ['Machine is inactive. Sync skipped.'] };
      }

      // 1. Fetch logs from machine (using machine service which runs mock or socket)
      const punches = await EsslMachineService.fetchPunchLogs(
        machine.ipAddress,
        machine.port,
        machine.branch
      );

      // Update machine status to Online since we fetched successfully
      await EsslService.updateMachine(machineId, {
        status: 'Online',
        lastSyncAt: new Date()
      });

      // 2. Process each punch log
      const syncedDetails: string[] = [];
      for (const punch of punches) {
        try {
          const syncSuccess = await this.processPunch(punch, machine.id);
          if (syncSuccess) {
            recordsSynced++;
            const timeStr = new Date(punch.punchTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            syncedDetails.push(`${punch.biometricName} (${punch.punchType} @ ${timeStr})`);
          }
        } catch (punchErr: any) {
          errors.push(`Punch for biometric ID ${punch.biometricEmployeeId} failed: ${punchErr.message}`);
        }
      }

      // 3. Write success log
      const logDetails = syncedDetails.length > 0 ? `Synced: ${syncedDetails.join(', ')}` : 'No new punches synced.';
      await EsslService.createSyncLog({
        machineId,
        status: errors.length > 0 && recordsSynced === 0 ? 'Failed' : 'Success',
        recordsSynced,
        errorMessage: errors.length > 0 ? errors.join('\n').substring(0, 1000) : null,
        rawResponse: logDetails
      });

      return {
        success: true,
        recordsSynced,
        errors
      };

    } catch (err: any) {
      console.error(`[ESSL Sync Error] Machine ${machineId}:`, err);
      
      // Update machine status to Offline
      await EsslService.updateMachine(machineId, {
        status: 'Offline'
      }).catch(() => {});

      // Write failure log
      await EsslService.createSyncLog({
        machineId,
        status: 'Failed',
        recordsSynced: 0,
        errorMessage: err.message
      }).catch(() => {});

      return {
        success: false,
        recordsSynced: 0,
        errors: [err.message]
      };
    }
  }

  /**
   * Trigger auto-matching logic for all Pending mappings
   */
  static async autoMatchAllPending(): Promise<{ matchedCount: number }> {
    const pendingMappings = await prisma.esslEmployeeMapping.findMany({
      where: { syncStatus: 'Pending' }
    });

    let matchedCount = 0;

    for (const mapping of pendingMappings) {
      const matchedEmployee = await this.findEmployeeByMatchRules(
        mapping.biometricEmployeeId,
        mapping.biometricName
      );

      if (matchedEmployee) {
        await prisma.esslEmployeeMapping.update({
          where: { id: mapping.id },
          data: {
            portalEmployeeId: matchedEmployee.id,
            syncStatus: 'Mapped'
          }
        });
        matchedCount++;
      }
    }

    return { matchedCount };
  }

  /**
   * Process an individual punch log
   */
  private static async processPunch(punch: EsslPunchLog, machineId: string): Promise<boolean> {
    // 1. Resolve employee mapping
    const employee = await this.resolveEmployee(punch, machineId);
    if (!employee) {
      // Unmapped / Pending mapping created - skip punch log processing until mapped
      return false;
    }

    const employeeCode = employee.employeeId; // e.g. "EMP001"

    // 2. Check for exact duplicate in database attendance_log to avoid double syncs
    const existingLog = await prisma.attendance_log.findFirst({
      where: {
        employee_id: employeeCode,
        punchTime: punch.punchTime
      }
    });

    if (existingLog) {
      return false; // Skip duplicate
    }

    // 3. Save to raw attendance_log table
    await prisma.attendance_log.create({
      data: {
        employee_id: employeeCode,
        punchTime: punch.punchTime,
        type: punch.punchType,
        source: 'ESSL',
        deviceId: machineId
      }
    });

    // Update last punch time in mapping table
    await prisma.esslEmployeeMapping.update({
      where: { biometricEmployeeId: punch.biometricEmployeeId },
      data: { lastPunch: punch.punchTime }
    });

    // 4. Update core attendance tables
    await this.applyAttendanceRules(employeeCode, employee.id, punch.punchTime, punch.punchType);

    return true;
  }

  /**
   * Resolves the portal Employee for a biometric log using the match priorities.
   */
  private static async resolveEmployee(punch: EsslPunchLog, machineId: string) {
    // Priority 1: Check existing mappings
    const mapping = await prisma.esslEmployeeMapping.findUnique({
      where: { biometricEmployeeId: punch.biometricEmployeeId },
      include: { employee: true }
    });

    if (mapping) {
      if (mapping.syncStatus === 'Mapped' && mapping.employee) {
        return mapping.employee;
      }
      return null; // Mapping is pending or unmapped
    }

    // Try auto-matching rules
    const matchedEmployee = await this.findEmployeeByMatchRules(
      punch.biometricEmployeeId,
      punch.biometricName
    );

    if (matchedEmployee) {
      // Create a Mapped entry
      await prisma.esslEmployeeMapping.create({
        data: {
          biometricEmployeeId: punch.biometricEmployeeId,
          biometricName: punch.biometricName,
          portalEmployeeId: matchedEmployee.id,
          machineId,
          syncStatus: 'Mapped'
        }
      });
      return matchedEmployee;
    } else {
      // Create a Pending entry
      await prisma.esslEmployeeMapping.create({
        data: {
          biometricEmployeeId: punch.biometricEmployeeId,
          biometricName: punch.biometricName,
          portalEmployeeId: null,
          machineId,
          syncStatus: 'Pending'
        }
      });
      return null;
    }
  }

  /**
   * Helper implementing priorities 2, 3, and 4 matching logic
   */
  private static async findEmployeeByMatchRules(biometricId: string, biometricName: string) {
    // Priority 2: Match by employee code (employeeId field)
    let employee = await prisma.employee.findUnique({
      where: { employeeId: biometricId }
    });
    if (employee) return employee;

    // Priority 3: Match by email (officeEmail field)
    // Sometimes biometricName contains email, or biometricId contains email
    const emailToSearch = biometricName.includes('@') ? biometricName : (biometricId.includes('@') ? biometricId : null);
    if (emailToSearch) {
      employee = await prisma.employee.findUnique({
        where: { officeEmail: emailToSearch }
      });
      if (employee) return employee;
    }

    // Priority 4: Match by employee name (case-insensitive fuzzy first + last name, ignoring spaces)
    const normalizedName = biometricName.toLowerCase().replace(/\s+/g, '').trim();
    const allEmployees = await prisma.employee.findMany({
      where: {
        status: { in: ['active', 'Active'] }
      }
    });
    
    employee = allEmployees.find(emp => {
      const fullName = `${emp.firstName}${emp.lastName}`.toLowerCase().replace(/\s+/g, '').trim();
      return fullName === normalizedName;
    }) || null;

    return employee;
  }

  /**
   * Applies Check-In / Check-Out logic for a specific employee punch.
   * Maintains active sessions and updates total daily working hours.
   */
  private static async applyAttendanceRules(
    employeeCode: string,
    employeeUuid: string,
    punchTime: Date,
    punchType: string
  ) {
    const dateStr = punchTime.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const punchDate = new Date(`${dateStr}T00:00:00.000Z`);

    // Check for an active session (check_out_time is null)
    const activeSession = await prisma.attendance_sessions.findFirst({
      where: {
        employee_id: employeeCode,
        check_out_time: null
      },
      orderBy: { check_in_time: 'desc' }
    });

    const isCheckIn = punchType === 'CheckIn';
    const isCheckOut = punchType === 'CheckOut';

    // Helper to auto check-out an old session from a previous day
    const checkAndCloseOldSession = async (session: typeof activeSession) => {
      if (!session) return false;
      const sessionDateStr = session.check_in_time.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      if (sessionDateStr !== dateStr) {
        // Auto check-out the old session (set checkout to checkin + 8 hours)
        const autoOutTime = new Date(session.check_in_time.getTime() + 8 * 60 * 60 * 1000);
        await prisma.attendance_sessions.update({
          where: { id: session.id },
          data: {
            check_out_time: autoOutTime,
            check_out_location: 'Auto Check-Out (Missing Punch)',
            duration: 480,
            is_auto_checkout: true
          }
        });

        // Recalculate daily total hours for the old date
        const oldSessionDate = session.date ? new Date(session.date) : new Date(session.check_in_time);
        oldSessionDate.setHours(0, 0, 0, 0);

        const allOldSessions = await prisma.attendance_sessions.findMany({
          where: {
            employee_id: employeeCode,
            date: oldSessionDate
          }
        });

        const totalMinutes = allOldSessions.reduce((acc, sess) => acc + (sess.duration || 0), 0);
        const totalHours = parseFloat((totalMinutes / 60).toFixed(2));

        // Update old overall attendance record
        await prisma.attendance.update({
          where: {
            employee_id_date: {
              employee_id: employeeCode,
              date: oldSessionDate
            }
          },
          data: {
            check_out_time: autoOutTime,
            check_out_location: 'Auto Check-Out (Missing Punch)',
            total_hours: totalHours,
            is_auto_checkout: true
          }
        }).catch(() => {});

        return true;
      }
      return false;
    };

    if (activeSession) {
      // 1. If active session is from a different day, auto-close it
      const wasOldClosed = await checkAndCloseOldSession(activeSession);

      if (wasOldClosed) {
        // Now there is no active session for today.
        if (isCheckOut) {
          // It's a checkout punch but no checkin. Create a zero-duration session.
          await this.createZeroDurationSession(employeeCode, employeeUuid, punchTime, punchDate);
        } else {
          // Check-in or Unknown punch: start new session
          await this.startNewSession(employeeCode, employeeUuid, punchTime, punchDate);
        }
      } else {
        // Active session is on the SAME day.
        if (isCheckOut || punchType === 'Unknown') {
          // Close the active session
          await this.closeSession(activeSession, punchTime, employeeCode, employeeUuid, punchDate);
        } else if (isCheckIn) {
          // If they punch "CheckIn" again on the same day while a session is active, ignore it
          console.log(`[ESSL Sync] Ignored duplicate CheckIn punch for ${employeeCode} at ${punchTime}`);
        }
      }
    } else {
      // No active session exists.
      if (isCheckOut) {
        // Today's first punch is a checkout (missing checkin).
        // Create a zero-duration session to log the punch without adding hours.
        await this.createZeroDurationSession(employeeCode, employeeUuid, punchTime, punchDate);
      } else {
        // CheckIn or Unknown: start new session
        await this.startNewSession(employeeCode, employeeUuid, punchTime, punchDate);
      }
    }
  }

  private static async startNewSession(employeeCode: string, employeeUuid: string, punchTime: Date, punchDate: Date) {
    // Create daily attendance record if it doesn't exist yet
    const existingAttendance = await prisma.attendance.findUnique({
      where: {
        employee_id_date: {
          employee_id: employeeCode,
          date: punchDate
        }
      }
    });

    if (existingAttendance) {
      await prisma.attendance.update({
        where: {
          employee_id_date: {
            employee_id: employeeCode,
            date: punchDate
          }
        },
        data: {
          status: 'Present',
          is_auto_checkout: false
        }
      });
    } else {
      await prisma.attendance.create({
        data: {
          id: uuidv4(),
          employee_id: employeeCode,
          date: punchDate,
          status: 'Present',
          check_in_time: punchTime,
          check_in_location: 'Biometric Machine',
          location_name: 'Biometric Machine',
          attendance_source: 'ESSL'
        }
      });
    }

    // Create new session
    await prisma.attendance_sessions.create({
      data: {
        id: uuidv4(),
        employee_id: employeeCode,
        check_in_time: punchTime,
        check_in_location: 'Biometric Machine',
        location_name: 'Biometric Machine',
        date: punchDate
      }
    });

    // Log Activity
    await logActivity({
      type: 'check_in',
      title: 'Biometric Clock-In',
      description: `Synced clock-in via biometric machine`,
      userId: employeeUuid
    }).catch(() => {});
  }

  private static async closeSession(activeSession: any, punchTime: Date, employeeCode: string, employeeUuid: string, punchDate: Date) {
    const durationMs = punchTime.getTime() - activeSession.check_in_time.getTime();
    const durationMinutes = Math.max(0, Math.round(durationMs / (1000 * 60)));

    // Update session with check-out details
    await prisma.attendance_sessions.update({
      where: { id: activeSession.id },
      data: {
        check_out_time: punchTime,
        check_out_location: 'Biometric Machine',
        duration: durationMinutes
      }
    });

    // Recalculate daily total hours
    const allSessions = await prisma.attendance_sessions.findMany({
      where: {
        employee_id: employeeCode,
        date: punchDate
      }
    });

    const totalMinutes = allSessions.reduce((acc, sess) => acc + (sess.duration || 0), 0);
    const totalHours = parseFloat((totalMinutes / 60).toFixed(2));

    // Update overall attendance record
    await prisma.attendance.update({
      where: {
        employee_id_date: {
          employee_id: employeeCode,
          date: punchDate
        }
      },
      data: {
        check_out_time: punchTime,
        check_out_location: 'Biometric Machine',
        total_hours: totalHours,
        status: 'Present',
        is_auto_checkout: false
      }
    });

    // Log Activity
    await logActivity({
      type: 'check_out',
      title: 'Biometric Clock-Out',
      description: `Synced clock-out via biometric machine (${totalHours} total hours today)`,
      userId: employeeUuid
    }).catch(() => {});
  }

  private static async createZeroDurationSession(employeeCode: string, employeeUuid: string, punchTime: Date, punchDate: Date) {
    const existingAttendance = await prisma.attendance.findUnique({
      where: {
        employee_id_date: {
          employee_id: employeeCode,
          date: punchDate
        }
      }
    });

    if (existingAttendance) {
      await prisma.attendance.update({
        where: {
          employee_id_date: {
            employee_id: employeeCode,
            date: punchDate
          }
        },
        data: {
          status: 'Present',
          check_out_time: punchTime,
          check_out_location: 'Biometric Machine',
          is_auto_checkout: false
        }
      });
    } else {
      await prisma.attendance.create({
        data: {
          id: uuidv4(),
          employee_id: employeeCode,
          date: punchDate,
          status: 'Present',
          check_in_time: punchTime,
          check_out_time: punchTime,
          check_in_location: 'Biometric Machine',
          check_out_location: 'Biometric Machine',
          location_name: 'Biometric Machine',
          attendance_source: 'ESSL',
          total_hours: 0
        }
      });
    }

    // Create session
    await prisma.attendance_sessions.create({
      data: {
        id: uuidv4(),
        employee_id: employeeCode,
        check_in_time: punchTime,
        check_out_time: punchTime,
        check_in_location: 'Biometric Machine',
        check_out_location: 'Biometric Machine',
        location_name: 'Biometric Machine',
        date: punchDate,
        duration: 0
      }
    });
  }
}
