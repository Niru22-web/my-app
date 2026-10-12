import { Router } from 'express';
import {
  getAuthUrls,
  handleGoogleCallback,
  handleMicrosoftCallback,
  getConnectionStatus,
  disconnectEmail,
  sendTestEmail,
  getAllConnections,
  getGoogleOAuthAuth,
  getOutlookOAuthAuth,
  handleOAuthCallback,
  getOAuthAuthUrl,
  disconnectOAuth,
  getOAuthStatus,
  getProviderConfigurations,
  getEmailConfiguration,
  saveEmailConfiguration,
  testEmailConfiguration,
  getEmailTemplates,
  createEmailTemplate,
  updateEmailTemplate,
  sendEmailFromTemplate,
  getPendingApprovals,
  checkEmailHealth
} from './email.controller';

const router = Router();

// Middleware to check if user is admin
// Middleware to check authentication and optionally admin role
const authenticateUser = (req: any, res: any, next: any) => {
  let token = req.headers.authorization?.replace('Bearer ', '');
  if (!token && req.query && req.query.token) {
    token = req.query.token as string;
  }

  if (!token) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey');
    req.user = decoded;
    next();
  } catch (error) {
    res.status(400).json({ error: "Invalid token." });
  } 
};

const checkAdminRole = (req: any, res: any, next: any) => {
  authenticateUser(req, res, () => {
    const userRole = (req.user.role as string).toLowerCase();
    if (userRole === 'admin') {
      next();
    } else {
      res.status(403).json({ error: "Access denied. Admin role required." });
    }
  });
};

// Email service health check route
router.get('/health', checkEmailHealth);

// Email OAuth routes (Admin only for initiating connection)
router.get('/oauth/google', checkAdminRole, getGoogleOAuthAuth);
router.get('/oauth/outlook', checkAdminRole, getOutlookOAuthAuth);
router.post('/oauth/callback', handleOAuthCallback);
router.get('/oauth/outlook/callback', handleMicrosoftCallback);

// Email connection status route - visible to all authenticated users
router.get('/status', authenticateUser, getConnectionStatus);

// Admin-only OAuth routes
router.get('/admin/oauth/auth-url', checkAdminRole, getAuthUrls);
router.post('/admin/oauth/callback', checkAdminRole, handleGoogleCallback);
router.post('/admin/oauth/disconnect', checkAdminRole, disconnectEmail);
router.get('/admin/oauth/status', checkAdminRole, getConnectionStatus);

// Email Configuration routes (Admin only)
router.get('/email-configuration', checkAdminRole, getEmailConfiguration);
router.post('/email-configuration', checkAdminRole, saveEmailConfiguration);
router.post('/test-email-configuration', checkAdminRole, testEmailConfiguration);
router.get('/provider-configurations', checkAdminRole, getProviderConfigurations);

// Email Templates routes (Admin only)
router.get('/templates', checkAdminRole, getEmailTemplates);
router.post('/templates', checkAdminRole, createEmailTemplate);
router.put('/templates/:id', checkAdminRole, updateEmailTemplate);
router.post('/send-from-template', checkAdminRole, sendEmailFromTemplate);

// Send email route (can be used by other services)
router.post('/send-email', sendTestEmail);

// Admin approval routes
router.get('/pending-approvals', checkAdminRole, getPendingApprovals);

// Placeholder for any additional final routes
export default router;
