import { Router } from 'express';
import * as controller from './asset-request.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/role.middleware';

const router = Router();

// Employee Routes
router.post('/requests', authenticate, controller.createAssetRequest);
router.get('/my-requests', authenticate, controller.getMyRequests);

// HR/Admin/IT Routes
router.get('/all-requests', authenticate, authorize(['ADMIN', 'HR', 'IT', 'OWNER']), controller.getAllRequests);
router.patch('/requests/:id/status', authenticate, authorize(['ADMIN', 'HR', 'IT', 'OWNER']), controller.updateRequestStatus);
router.get('/categories', authenticate, controller.getAssetCategories);
router.get('/stats', authenticate, authorize(['ADMIN', 'HR', 'IT', 'OWNER']), controller.getAssetStats);
// Inventory Routes
router.get('/inventory', authenticate, authorize(['ADMIN', 'HR', 'IT', 'OWNER']), controller.getInventory);
router.post('/inventory', authenticate, authorize(['ADMIN', 'HR', 'IT', 'OWNER']), controller.createInventoryItem);
router.patch('/inventory/:id', authenticate, authorize(['ADMIN', 'HR', 'IT', 'OWNER']), controller.updateInventoryItem);
router.delete('/inventory/:id', authenticate, authorize(['ADMIN', 'HR', 'IT', 'OWNER']), controller.deleteInventoryItem);
router.get('/inventory/:id/timeline', authenticate, authorize(['ADMIN', 'HR', 'IT', 'OWNER']), controller.getAssetTimeline);
router.patch('/inventory/:id/status', authenticate, authorize(['ADMIN', 'HR', 'IT', 'OWNER']), controller.updateAssetStatus);

// Allocation Actions
router.post('/allocate', authenticate, authorize(['ADMIN', 'HR', 'IT', 'OWNER']), controller.allocateAsset);
router.get('/allocations', authenticate, authorize(['ADMIN', 'HR', 'IT', 'OWNER']), controller.getAllAllocations);
router.patch('/allocations/:allocationId/return', authenticate, authorize(['ADMIN', 'HR', 'IT', 'OWNER']), controller.returnAsset);

export default router;
