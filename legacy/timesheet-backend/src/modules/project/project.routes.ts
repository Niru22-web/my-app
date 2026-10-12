import { Router } from 'express';
import {
  getAllProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  searchProjects,
  getProjectAttachments,
  addProjectAttachment,
  deleteProjectAttachment,
  exportProjects,
  bulkUploadProjects,
  downloadProjectTemplate,
  uploadProjectFiles,
  uploadProjectExcel,
  toggleProjectStatus
} from './project.controller';
import { allowRoles } from '../../middleware/role.middleware';
import { authenticate } from '../../middleware/auth.middleware';


const router = Router();

// Apply authentication middleware to all routes
router.use(authenticate);


// Project CRUD operations
router.get('/', getAllProjects);
router.get('/search', searchProjects); 
router.get('/export', exportProjects);
router.get('/template/download', downloadProjectTemplate);
router.get('/:id', getProjectById);

router.post('/bulk-upload', allowRoles('Admin', 'Partner', 'Manager', 'IT'), uploadProjectExcel, bulkUploadProjects);
router.post('/', allowRoles('Admin', 'Partner', 'Manager', 'IT'), uploadProjectFiles, createProject);
router.put('/:id', allowRoles('Admin', 'Partner', 'Manager', 'IT'), updateProject);
router.patch('/:id/toggle-status', allowRoles('Admin', 'Partner', 'Manager', 'IT'), toggleProjectStatus);
router.delete('/:id', allowRoles('Admin', 'Partner', 'IT'), deleteProject);

// Attachment operations
router.get('/:projectId/attachments', getProjectAttachments);
router.post('/:projectId/attachments', allowRoles('Admin', 'Partner', 'Manager', 'IT'), uploadProjectFiles, addProjectAttachment);
router.delete('/attachments/:attachmentId', allowRoles('Admin', 'Partner', 'Manager', 'IT'), deleteProjectAttachment);

export default router;