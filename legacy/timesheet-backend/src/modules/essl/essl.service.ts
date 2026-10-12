import { prisma } from '../../config/prisma';

export class EsslService {
  // Machine Management
  static async getAllMachines() {
    return prisma.esslMachine.findMany({
      orderBy: { createdAt: 'desc' }
    });
  }

  static async getMachineById(id: string) {
    return prisma.esslMachine.findUnique({
      where: { id }
    });
  }

  static async createMachine(data: {
    name: string;
    ipAddress: string;
    port: number;
    deviceKey: string;
    apiKey?: string | null;
    branch: string;
    syncInterval: number;
    isActive: boolean;
  }) {
    return prisma.esslMachine.create({
      data: {
        name: data.name,
        ipAddress: data.ipAddress,
        port: data.port,
        deviceKey: data.deviceKey,
        apiKey: data.apiKey,
        branch: data.branch,
        syncInterval: data.syncInterval,
        isActive: data.isActive,
        status: 'Offline'
      }
    });
  }

  static async updateMachine(id: string, data: Partial<{
    name: string;
    ipAddress: string;
    port: number;
    deviceKey: string;
    apiKey: string | null;
    branch: string;
    syncInterval: number;
    isActive: boolean;
    status: string;
    lastSyncAt: Date | null;
  }>) {
    return prisma.esslMachine.update({
      where: { id },
      data
    });
  }

  static async deleteMachine(id: string) {
    return prisma.esslMachine.delete({
      where: { id }
    });
  }

  // Employee Mapping Management
  static async getAllMappings() {
    return prisma.esslEmployeeMapping.findMany({
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            officeEmail: true,
            department: true,
            role: true
          }
        },
        machine: {
          select: {
            name: true
          }
        }
      },
      orderBy: { biometricName: 'asc' }
    });
  }

  static async updateMapping(id: string, portalEmployeeId: string | null, syncStatus: string) {
    return prisma.esslEmployeeMapping.update({
      where: { id },
      data: {
        portalEmployeeId,
        syncStatus
      },
      include: {
        employee: true
      }
    });
  }

  static async deleteMapping(id: string) {
    return prisma.esslEmployeeMapping.delete({
      where: { id }
    });
  }

  // Logs Management
  static async getSyncLogs(limit = 100) {
    return prisma.esslSyncLog.findMany({
      take: limit,
      include: {
        machine: {
          select: {
            name: true
          }
        }
      },
      orderBy: { syncTime: 'desc' }
    });
  }

  static async createSyncLog(data: {
    machineId: string;
    status: 'Success' | 'Failed';
    recordsSynced: number;
    errorMessage?: string | null;
    rawResponse?: string | null;
  }) {
    return prisma.esslSyncLog.create({
      data: {
        machineId: data.machineId,
        status: data.status,
        recordsSynced: data.recordsSynced,
        errorMessage: data.errorMessage,
        rawResponse: data.rawResponse
      }
    });
  }

  // Fetch recent punches from database attendance logs
  static async getLivePunchActivity(limit = 50) {
    return prisma.attendance_log.findMany({
      take: limit,
      orderBy: { punchTime: 'desc' },
      include: {
        Employee: {
          select: {
            firstName: true,
            lastName: true,
            employeeId: true,
            officeEmail: true
          }
        }
      }
    });
  }
}
