import { Router } from 'express';
import multer from 'multer';
import * as assetController from './asset.controller';
import * as mastersController from './masters.controller';
import * as vendorController from './vendor.controller';
import * as maintenanceController from './maintenance.controller';
import * as assignmentController from './assignment.controller';
import * as reportsController from './reports.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// All routes require authentication
router.use(authenticate);

// Masters Config Routes
router.get('/masters/categories', mastersController.getCategories);
router.post('/masters/categories', mastersController.createCategory);
router.delete('/masters/categories/:id', mastersController.deleteCategory);

router.get('/masters/types', mastersController.getTypes);
router.post('/masters/types', mastersController.createType);
router.delete('/masters/types/:id', mastersController.deleteType);

router.get('/masters/locations', mastersController.getLocations);
router.post('/masters/locations', mastersController.createLocation);
router.delete('/masters/locations/:id', mastersController.deleteLocation);

router.get('/masters/statuses', mastersController.getStatuses);
router.post('/masters/statuses', mastersController.createStatus);
router.delete('/masters/statuses/:id', mastersController.deleteStatus);

router.get('/masters/departments', mastersController.getDepartments);

// Vendor Management Routes
router.get('/vendors', vendorController.getVendors);
router.post('/vendors', vendorController.createVendor);
router.put('/vendors/:id', vendorController.updateVendor);
router.delete('/vendors/:id', vendorController.deleteVendor);
router.get('/vendors/:id/assets', vendorController.getVendorAssets);
router.get('/vendors/:id/purchases', vendorController.getVendorPurchaseHistory);

// Maintenance Module Routes
router.get('/maintenance/reminders', maintenanceController.getMaintenanceReminders);
router.get('/maintenance', maintenanceController.getMaintenances);
router.post('/maintenance', maintenanceController.createMaintenance);
router.put('/maintenance/:id', maintenanceController.updateMaintenance);
router.delete('/maintenance/:id', maintenanceController.deleteMaintenance);

// Asset Direct Allocation (Assignment) Routes
router.get('/allocations', assignmentController.getAllocations);
router.get('/allocations/export', assignmentController.exportAllocations);
router.get('/allocations/template', assignmentController.getAllocationTemplate);
router.post('/allocations/import', upload.single('file'), assignmentController.importAllocations);
router.post('/allocations/assign', assignmentController.assignAssetDirectly);
router.patch('/allocations/:allocationId/return', assignmentController.returnAssetDirectly);
router.post('/allocations/:allocationId/transfer', assignmentController.transferAllocation);
router.delete('/allocations/:allocationId', assignmentController.deleteAllocation);
router.get('/my-allocations', assignmentController.getMyAllocations);
router.post('/self-register', assignmentController.selfRegisterAsset);

// Reports Module Routes
router.get('/reports/export', reportsController.exportReportExcel);
router.get('/reports', reportsController.getReportData);

// Original CRUD & Special Operations
// ⚠️ Static named routes MUST come before /:id to prevent wildcard capture
router.get('/dashboard', assetController.getAssetDashboard);
router.get('/export', assetController.exportAssets);
router.get('/template', assetController.getTemplate);
router.post('/import', upload.single('file'), assetController.importAssets);

router.get('/', assetController.getAssets);
router.post('/', assetController.createAsset);
router.put('/:id', assetController.updateAsset);
router.delete('/:id', assetController.deleteAsset);

export default router;

