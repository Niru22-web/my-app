import { Request, Response } from 'express';
import { EsslService } from './essl.service';
import { EsslMachineService } from './essl.machine.service';
import { EsslSyncService } from './essl.sync.service';

export class EsslController {
  // Machine endpoints
  static async getMachines(req: Request, res: Response) {
    try {
      const machines = await EsslService.getAllMachines();
      res.json({ success: true, data: machines });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  static async createMachine(req: Request, res: Response) {
    try {
      const { name, ipAddress, port, deviceKey, apiKey, branch, syncInterval, isActive } = req.body;
      
      if (!name || !ipAddress || !port || !deviceKey || !branch) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing required fields: name, ipAddress, port, deviceKey, and branch are required.' 
        });
      }

      const machine = await EsslService.createMachine({
        name,
        ipAddress,
        port: Number(port),
        deviceKey,
        apiKey: apiKey || null,
        branch,
        syncInterval: Number(syncInterval) || 5,
        isActive: isActive !== undefined ? !!isActive : true
      });

      res.status(201).json({ success: true, data: machine });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  static async updateMachine(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, ipAddress, port, deviceKey, apiKey, branch, syncInterval, isActive } = req.body;

      const dataToUpdate: any = {};
      if (name !== undefined) dataToUpdate.name = name;
      if (ipAddress !== undefined) dataToUpdate.ipAddress = ipAddress;
      if (port !== undefined) dataToUpdate.port = Number(port);
      if (deviceKey !== undefined) dataToUpdate.deviceKey = deviceKey;
      if (apiKey !== undefined) dataToUpdate.apiKey = apiKey;
      if (branch !== undefined) dataToUpdate.branch = branch;
      if (syncInterval !== undefined) dataToUpdate.syncInterval = Number(syncInterval);
      if (isActive !== undefined) dataToUpdate.isActive = !!isActive;

      const machine = await EsslService.updateMachine(id, dataToUpdate);
      res.json({ success: true, data: machine });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  static async deleteMachine(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await EsslService.deleteMachine(id);
      res.json({ success: true, message: 'Machine configuration deleted successfully.' });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  static async testConnection(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const machine = await EsslService.getMachineById(id);
      if (!machine) {
        return res.status(404).json({ success: false, message: 'Machine not found.' });
      }

      const result = await EsslMachineService.testConnection(machine.ipAddress, machine.port);
      
      // Update machine status on test
      await EsslService.updateMachine(id, { status: result.status });

      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  static async syncNow(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await EsslSyncService.syncMachine(id);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // Mappings endpoints
  static async getMappings(req: Request, res: Response) {
    try {
      const mappings = await EsslService.getAllMappings();
      res.json({ success: true, data: mappings });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  static async updateMapping(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { portalEmployeeId, syncStatus } = req.body;

      if (syncStatus && !['Mapped', 'Unmapped', 'Pending'].includes(syncStatus)) {
        return res.status(400).json({ success: false, message: 'Invalid sync status. Must be Mapped, Unmapped, or Pending.' });
      }

      const mapping = await EsslService.updateMapping(id, portalEmployeeId || null, syncStatus || 'Mapped');
      res.json({ success: true, data: mapping });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  static async autoMatchPending(req: Request, res: Response) {
    try {
      const result = await EsslSyncService.autoMatchAllPending();
      res.json({ success: true, message: `Successfully matched ${result.matchedCount} employees.`, data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // Logs endpoints
  static async getLogs(req: Request, res: Response) {
    try {
      const limit = Number(req.query.limit) || 100;
      const logs = await EsslService.getSyncLogs(limit);
      res.json({ success: true, data: logs });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  static async getLivePunchActivity(req: Request, res: Response) {
    try {
      const limit = Number(req.query.limit) || 50;
      const punches = await EsslService.getLivePunchActivity(limit);
      res.json({ success: true, data: punches });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
}
