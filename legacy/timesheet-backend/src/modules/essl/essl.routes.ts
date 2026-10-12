import { Router } from 'express';
import { EsslController } from './essl.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { allowRoles } from '../../middleware/role.middleware';

const router = Router();

// Apply authentication and Admin/IT role guard to all routes
router.use(authenticate);
router.use(allowRoles('Admin', 'IT'));

// Machine Routes
router.get('/machines', EsslController.getMachines);
router.post('/machines', EsslController.createMachine);
router.put('/machines/:id', EsslController.updateMachine);
router.delete('/machines/:id', EsslController.deleteMachine);
router.post('/machines/:id/test-connection', EsslController.testConnection);
router.post('/machines/:id/sync', EsslController.syncNow);

// Mapping Routes
router.get('/mappings', EsslController.getMappings);
router.put('/mappings/:id', EsslController.updateMapping);
router.post('/mappings/auto-match', EsslController.autoMatchPending);

// Logs and Live Activity Routes
router.get('/logs', EsslController.getLogs);
router.get('/live-punch-activity', EsslController.getLivePunchActivity);

export default router;
