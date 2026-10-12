import { Router } from 'express';
import emailConnectorController from './email-connector.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

// OAuth callback endpoints (must be public as they are called by Google/Microsoft redirection)
router.get('/callback/google', emailConnectorController.handleGoogleCallback);
router.get('/callback/outlook', emailConnectorController.handleMicrosoftCallback);

// Apply authentication middleware to all subsequent routes
router.use(authenticate);

// Get OAuth URLs for connecting accounts
router.get('/auth/urls', emailConnectorController.getAuthUrls);

// Get connection status
router.get('/status', emailConnectorController.getConnectionStatus);

// Send test email
router.post('/send-test', emailConnectorController.sendTestEmail);

// Disconnect email account
router.delete('/disconnect/:provider', emailConnectorController.disconnectEmail);

// Get all connections (admin only)
router.get('/connections', emailConnectorController.getAllConnections);

export default router;
