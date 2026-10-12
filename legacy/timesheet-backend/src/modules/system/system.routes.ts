import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/role.middleware';
import {
  getSystemStatus,
  getStorageFiles,
  deleteStorageFile,
  cleanupStorage
} from './system.controller';

const router = Router();

// Require authentication and admin / it role
router.use(authenticate);
router.use(authorize(['admin', 'it', 'Admin', 'IT', 'owner', 'Owner']));

// Server & Storage Status
router.get('/status', getSystemStatus);

// Storage File Manager
router.get('/storage/files', getStorageFiles);
router.delete('/storage/file', deleteStorageFile);
router.post('/storage/cleanup', cleanupStorage);

export default router;
