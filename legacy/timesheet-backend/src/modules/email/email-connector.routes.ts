import { Router } from 'express';
import emailConnectorController from './email-connector.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

// OAuth callback endpoints (must be public as they are called by Google/Microsoft redirection)
router.get('/callback/google', emailConnectorController.handleGoogleCallback);
router.get('/callback/outlook', emailConnectorController.handleMicrosoftCallback);

// Apply authentication middleware to all subsequent routes
router.use(authenticate);

const requireAdminRole = (req: any, res: any, next: any) => {
  const userRole = (req.user?.role as string || '').toLowerCase().trim();
  if (userRole === 'admin' || userRole === 'owner') {
    return next();
  }
  return res.status(403).json({ success: false, error: 'Access denied. Admin role required.' });
};

// Get OAuth URLs for connecting accounts
router.get('/auth/urls', emailConnectorController.getAuthUrls);

// Get connection status
router.get('/status', emailConnectorController.getConnectionStatus);

// Send test email
router.post('/send-test', emailConnectorController.sendTestEmail);

// Disconnect email account (admin only)
router.delete('/disconnect/:provider', requireAdminRole, emailConnectorController.disconnectEmail);

// Get all connections (admin only, strip sensitive tokens)
router.get('/connections', requireAdminRole, (req, res) => {
  const originalJson = res.json.bind(res);
  res.json = (body: any) => {
    if (body && Array.isArray(body.data)) {
      body.data = body.data.map(({ accessToken, refreshToken, ...rest }: any) => rest);
    }
    return originalJson(body);
  };
  return emailConnectorController.getAllConnections(req, res);
});

export default router;
