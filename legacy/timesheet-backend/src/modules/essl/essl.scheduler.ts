import cron from 'node-cron';
import { prisma } from '../../config/prisma';
import { EsslSyncService } from './essl.sync.service';

export const registerEsslScheduler = () => {
  console.log('⏳ Initializing ESSL Biometric Sync Scheduler...');

  // Schedule to run every 5 minutes: '*/5 * * * *'
  cron.schedule('*/5 * * * *', async () => {
    console.log('⏰ Running ESSL Auto Attendance Sync Cron Job...');
    try {
      const activeMachines = await prisma.esslMachine.findMany({
        where: { isActive: true }
      });

      console.log(`🔍 Found ${activeMachines.length} active ESSL machine(s) for auto-sync.`);

      for (const machine of activeMachines) {
        console.log(`🔄 Syncing ESSL machine: ${machine.name} (IP: ${machine.ipAddress})`);
        const result = await EsslSyncService.syncMachine(machine.id);
        console.log(`✅ Sync result for ${machine.name}: Synced ${result.recordsSynced} records, Errors: ${result.errors.length}`);
      }
    } catch (err: any) {
      console.error('❌ Error in ESSL auto sync cron job:', err.message);
    }
  });
};
