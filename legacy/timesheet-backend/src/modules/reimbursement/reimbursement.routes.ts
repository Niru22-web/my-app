import express from 'express';
import fs from 'fs';
import path from 'path';
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
  updateReimbursementStatus,
  getPendingRequests,
  getApprovedRequests,
  getRejectedRequests,
  getReimbursementLogs
} from './reimbursement.controller';
import multer from 'multer';

const router = express.Router();

const uploadDir = path.join(process.cwd(), 'uploads', 'reimbursements');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const receiptStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}-${safeName}`);
  }
});

const receiptUpload = multer({ storage: receiptStorage });
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
    res.status(401).json({ error: "Invalid token." });
  }
};

router.get('/', authenticate, getAllReimbursements);
router.get('/my-claims', authenticate, getAllReimbursements);
router.get('/pending-count', authenticate, getPendingReimbursementCount);
router.get('/kpis', authenticate, getReimbursementKPIs);
router.post('/', authenticate, receiptUpload.any(), createReimbursement);
router.post('/bulk-upload', authenticate, upload.single('file'), bulkUploadReimbursements);
router.get('/export', authenticate, exportReimbursements);
router.put('/:id', authenticate, receiptUpload.any(), updateReimbursement);
router.patch('/:id', authenticate, receiptUpload.any(), updateReimbursement);
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

router.patch('/:id/status', authenticate, updateReimbursementStatus);
router.put('/:id/status', authenticate, updateReimbursementStatus);
router.patch('/:id/approve', authenticate, approveReimbursement);
router.post('/:id/approve', authenticate, approveReimbursement);
router.patch('/:id/reject', authenticate, rejectReimbursement);
router.post('/:id/reject', authenticate, rejectReimbursement);
router.patch('/:id/send-back', authenticate, sendBackReimbursement);
router.post('/:id/send-back', authenticate, sendBackReimbursement);
router.patch('/:id/mark-as-paid', authenticate, markAsPaid);
router.post('/:id/mark-as-paid', authenticate, markAsPaid);
router.patch('/:id/pay', authenticate, markAsPaid);
router.post('/bulk-approve', authenticate, bulkApproveReimbursements);
router.post('/bulk-reject', authenticate, bulkRejectReimbursements);

export default router;

