import { Router } from 'express';
import {
  getAllJobs,
  getJobById,
  createJob,
  updateJob,
  deleteJob,
  getJobsByProject,
  getJobsByClient,
  searchJobs,
  bulkUploadJobs,
  exportJobs,
  downloadJobTemplate,
  uploadJobExcel,
  toggleJobStatus
} from './job.controller';
import { allowRoles } from '../../middleware/role.middleware';
import { authenticate } from '../../middleware/auth.middleware';


const router = Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Job CRUD operations
router.get('/', getAllJobs);
router.get('/export', exportJobs);
router.get('/template/download', downloadJobTemplate);
router.get('/search', searchJobs);
router.get('/:id', getJobById);

router.post('/bulk-upload', allowRoles('Admin', 'Partner', 'Manager', 'IT'), uploadJobExcel, bulkUploadJobs);
router.post('/', allowRoles('Admin', 'Partner', 'Manager', 'IT'), createJob);
router.put('/:id', allowRoles('Admin', 'Partner', 'Manager', 'IT'), updateJob);
router.patch('/:id/toggle-status', allowRoles('Admin', 'Partner', 'Manager', 'IT'), toggleJobStatus);
router.delete('/:id', allowRoles('Admin', 'Partner', 'Manager', 'IT'), deleteJob);

// Client/Project based retrieval
router.get('/project/:projectId', getJobsByProject);
router.get('/client/:clientId', getJobsByClient);

export default router;