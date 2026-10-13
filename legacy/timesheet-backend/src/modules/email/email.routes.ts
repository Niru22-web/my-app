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
    const userRole = (req.user?.role as string || '').toLowerCase();
    if (userRole === 'admin' || userRole === 'owner') {
      next();
    } else {
      res.status(403).json({ error: "Access denied. Admin role required." });
    }
  });
};

// Email service health check route
router.get('/health', checkAdminRole, checkEmailHealth);

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
router.post('/send-email', authenticateUser, sendTestEmail);

// Admin approval routes
router.get('/pending-approvals', checkAdminRole, getPendingApprovals);

// Email delivery logs & safe mailbox configuration
router.get('/logs', checkAdminRole, async (req: any, res: any) => {
  try {
    const { prisma } = require('../../config/prisma');
    const { status, search, limit = '100' } = req.query || {};
    const where: Record<string, any> = {};
    if (status && status !== 'all') where.status = status;
    if (search && String(search).trim()) {
      const s = String(search).trim();
      where.OR = [
        { recipient: { contains: s, mode: 'insensitive' } },
        { subject: { contains: s, mode: 'insensitive' } },
        { category: { contains: s, mode: 'insensitive' } },
      ];
    }
    const logs = await prisma.emailLog.findMany({
      where,
      orderBy: { sentAt: 'desc' },
      take: Math.min(200, Math.max(1, Number(limit) || 100)),
    });
    res.json({ success: true, logs });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/connect', checkAdminRole, async (req: any, res: any) => {
  try {
    const { prisma } = require('../../config/prisma');
    const { provider, email } = req.body || {};
    const cleanProvider = String(provider || 'outlook').trim().toLowerCase();
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!['outlook', 'gmail'].includes(cleanProvider) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ success: false, message: 'Valid provider and sender email are required' });
    }
    const emp = await prisma.employee.findUnique({ where: { id: req.user?.id }, select: { employeeId: true } });
    const employeeCode = emp?.employeeId || req.user?.employeeId || 'ADMIN001';
    await prisma.emailConnection.upsert({
      where: { employeeId_provider: { employeeId: employeeCode, provider: cleanProvider } },
      create: {
        employeeId: employeeCode,
        provider: cleanProvider,
        email: cleanEmail,
        accessToken: 'configured',
        refreshToken: 'configured',
        tokenExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        isActive: true,
      },
      update: { email: cleanEmail, isActive: true, updatedAt: new Date() },
    });
    res.json({ success: true, message: `Connected ${cleanProvider} sender mailbox (${cleanEmail}).` });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/disconnect/:provider', checkAdminRole, async (req: any, res: any) => {
  try {
    const { prisma } = require('../../config/prisma');
    const cleanProvider = String(req.params.provider || '').trim().toLowerCase();
    await prisma.emailConnection.updateMany({
      where: { provider: { equals: cleanProvider, mode: 'insensitive' } },
      data: { isActive: false },
    });
    res.json({ success: true, message: `Disconnected ${cleanProvider} mailbox.` });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
