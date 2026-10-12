import express from 'express';
import { 
  getAllReimbursements, 
  createReimbursement, 
  bulkUploadReimbursements, 
  exportReimbursements,
  getReimbursementKPIs,
  approveReimbursement, 
  rejectReimbursement, 
  sendBackReimbursement, 
  bulkApproveReimbursements, 
  bulkRejectReimbursements,
  getReimbursementCharts,
  getTeamApprovals,
  updateReimbursement,
  deleteReimbursement,
  getPendingReimbursementCount,
  markAsPaid,
  getPendingRequests,
  getApprovedRequests,
  getRejectedRequests,
  getReimbursementLogs
} from './reimbursement.controller';
import multer from 'multer';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Auth check middleware
const authenticate = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: "Access denied. No token provided." });
  
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey');
    req.user = decoded;
    next();
  } catch (error) {
    res.status(400).json({ error: "Invalid token." });
  }
};

router.get('/', authenticate, getAllReimbursements);
router.get('/pending-count', authenticate, getPendingReimbursementCount);
router.get('/kpis', authenticate, getReimbursementKPIs);
router.post('/', authenticate, upload.array('attachments'), createReimbursement);
router.post('/bulk-upload', authenticate, upload.single('file'), bulkUploadReimbursements);
router.get('/export', authenticate, exportReimbursements);
router.patch('/:id', authenticate, upload.array('attachments'), updateReimbursement);
router.delete('/:id', authenticate, deleteReimbursement);

// Approval Routes
router.get('/team-approvals', authenticate, getTeamApprovals);
router.get('/stats', authenticate, getReimbursementKPIs);
router.get('/charts', authenticate, getReimbursementCharts);

// New Status-Specific Routes
router.get('/pending', authenticate, getPendingRequests);
router.get('/approved', authenticate, getApprovedRequests);
router.get('/rejected', authenticate, getRejectedRequests);
router.get('/logs', authenticate, getReimbursementLogs);

router.patch('/:id/approve', authenticate, approveReimbursement);
router.patch('/:id/reject', authenticate, rejectReimbursement);
router.patch('/:id/send-back', authenticate, sendBackReimbursement);
router.patch('/:id/mark-as-paid', authenticate, markAsPaid);
router.post('/bulk-approve', authenticate, bulkApproveReimbursements);
router.post('/bulk-reject', authenticate, bulkRejectReimbursements);

export default router;
