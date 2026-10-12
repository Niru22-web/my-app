import { Request, Response } from 'express';
import emailService from './email.service';
import { sendEmail } from '../../services/email.service';
import { authenticate } from '../../middleware/auth.middleware';

class EmailConnectorController {
  // Get OAuth URLs for connection
  getAuthUrls = async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      
      const googleUrl = emailService.getGoogleAuthUrl();
      const microsoftUrl = emailService.getMicrosoftAuthUrl();

      res.json({
        success: true,
        data: {
          google: {
            authUrl: googleUrl,
            provider: 'gmail',
            name: 'Gmail'
          },
          microsoft: {
            authUrl: microsoftUrl,
            provider: 'outlook',
            name: 'Outlook'
          }
        }
      });
    } catch (error) {
      console.error('Get auth URLs error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get authentication URLs'
      });
    }
  };

  // Handle Google OAuth callback
  handleGoogleCallback = async (req: Request, res: Response) => {
    try {
      const { code, state, error, error_description } = req.query;

      console.log('=== Email-Connector Google OAuth Callback Debug ===');
      console.log('Timestamp:', new Date().toISOString());
      console.log('Code parameter:', code ? 'Present' : 'Missing');
      console.log('State parameter (employeeId):', state);
      console.log('Error parameter:', error);
      console.log('Error description:', error_description);
      
      // Check for OAuth errors
      if (error) {
        console.error('OAuth error returned from Google:', error, error_description);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(`${frontendUrl}/email-configuration?success=false&provider=gmail&error=${error}&description=${error_description}`);
      }

      if (!code || !state) {
        console.error('Invalid callback parameters:', { code: !!code, state: !!state });
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(`${frontendUrl}/email-configuration?success=false&provider=gmail&error=Missing authorization code or state`);
      }

      // Import prisma for database validation
      const { prisma } = require('../../config/prisma');
      
      // Validate state as employeeId by finding the employee
      const employee = await prisma.employee.findUnique({
        where: { employeeId: state as string }
      });

      if (!employee) {
        console.error("❌ Employee not found for state:", state);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(`${frontendUrl}/email-configuration?success=false&provider=gmail&error=Employee not found`);
      }

      const employeeId = employee.employeeId;
      console.log('✅ Employee found, processing OAuth for employeeId:', employeeId);

      const result = await emailService.handleGoogleCallback(code as string, employeeId);

      // Redirect to frontend with success
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      res.redirect(`${frontendUrl}/email-configuration?success=true&provider=gmail&email=${result.email}`);
    } catch (error) {
      console.error('Google callback error:', error);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      res.redirect(`${frontendUrl}/email-configuration?success=false&provider=gmail&error=Failed to connect Gmail`);
    }
  };

  // Handle Microsoft OAuth callback
  handleMicrosoftCallback = async (req: Request, res: Response) => {
    try {
      const { code, state, error, error_description } = req.query;

      console.log('=== Email-Connector Microsoft OAuth Callback Debug ===');
      console.log('Timestamp:', new Date().toISOString());
      console.log('Code parameter:', code ? 'Present' : 'Missing');
      console.log('State parameter (employeeId):', state);
      console.log('Error parameter:', error);
      console.log('Error description:', error_description);
      
      // Check for OAuth errors
      if (error) {
        console.error('OAuth error returned from Microsoft:', error, error_description);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(`${frontendUrl}/email-configuration?success=false&provider=outlook&error=${error}&description=${error_description}`);
      }

      if (!code || !state) {
        console.error('Invalid callback parameters:', { code: !!code, state: !!state });
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(`${frontendUrl}/email-configuration?success=false&provider=outlook&error=Missing authorization code or state`);
      }

      // Import prisma for database validation
      const { prisma } = require('../../config/prisma');
      
      // Validate state as employeeId by finding the employee
      const employee = await prisma.employee.findUnique({
        where: { employeeId: state as string }
      });

      if (!employee) {
        console.error("❌ Employee not found for state:", state);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(`${frontendUrl}/email-configuration?success=false&provider=outlook&error=Employee not found`);
      }

      const employeeId = employee.employeeId;
      console.log('✅ Employee found, processing OAuth for employeeId:', employeeId);
      
      const result = await emailService.handleMicrosoftCallback(code as string, employeeId);

      // Redirect to frontend with success
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      res.redirect(`${frontendUrl}/email-configuration?success=true&provider=outlook&email=${result.email}`);
    } catch (error) {
      console.error('Microsoft callback error:', error);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      res.redirect(`${frontendUrl}/email-configuration?success=false&provider=outlook&error=Failed to connect Outlook`);
    }
  };

  // Get email connection status
  getConnectionStatus = async (req: Request, res: Response) => {
    try {
      console.log("=== API HIT ===", req.method, req.originalUrl);
      console.log("User:", (req as any).user);

      const user = (req as any).user;
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!user.employeeId) {
        console.error("Missing employeeId:", user);
        return res.status(400).json({
          success: false,
          message: "Employee ID missing"
        });
      }
      
      const employeeId = user.employeeId;
      let gmailConnection;
      let outlookConnection;

      try {
        gmailConnection = await emailService.getEmailConnection(employeeId, 'gmail');
        outlookConnection = await emailService.getEmailConnection(employeeId, 'outlook');
      } catch (dbError: any) {
        console.error("DB ERROR in getConnectionStatus:", dbError);
        return res.status(500).json({
          success: false,
          message: "Database error",
          error: dbError.message
        });
      }

      res.json({
        success: true,
        data: {
          gmail: gmailConnection ? {
            connected: true,
            email: gmailConnection.email,
            connectedAt: gmailConnection.createdAt,
            isActive: gmailConnection.isActive
          } : {
            connected: false
          },
          outlook: outlookConnection ? {
            connected: true,
            email: outlookConnection.email,
            connectedAt: outlookConnection.createdAt,
            isActive: outlookConnection.isActive
          } : {
            connected: false
          }
        }
      });
    } catch (error: any) {
      console.error('API ERROR in getConnectionStatus:', error);
      console.error('Stack:', error.stack);
      res.status(500).json({
        success: false,
        message: 'Failed to get connection status',
        error: error.message
      });
    }
  };

  // Disconnect email account
  disconnectEmail = async (req: Request, res: Response) => {
    try {
      console.log("=== API HIT ===", req.method, req.originalUrl);
      console.log("User:", (req as any).user);

      const { provider } = req.params;
      const user = (req as any).user;

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!user.employeeId) {
        console.error("Missing employeeId:", user);
        return res.status(400).json({
          success: false,
          message: "Employee ID missing"
        });
      }

      const employeeId = user.employeeId;
      console.log(`Disconnect request for employee: ${employeeId}, provider: ${provider}`);

      if (!['gmail', 'outlook'].includes(provider)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid provider'
        });
      }

      try {
        const result = await emailService.disconnectEmail(employeeId, provider);
        console.log(`Disconnect successful for ${provider}:`, result);

        return res.json({
          success: true,
          message: `${provider === 'gmail' ? 'Gmail' : 'Outlook'} account disconnected successfully`,
          data: result
        });
      } catch (dbError: any) {
        console.error("DB ERROR in disconnectEmail:", dbError);
        return res.status(500).json({
          success: false,
          message: "Database error",
          error: dbError.message
        });
      }
    } catch (error: any) {
      console.error('API ERROR in disconnectEmail:', error);
      console.error('Stack:', error.stack);
      return res.status(500).json({
        success: false,
        message: 'Failed to disconnect email account',
        error: error.message
      });
    }
  };

  // Send email (for testing)
  sendTestEmail = async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { to, subject, text, html } = req.body;

      if (!to || !subject) {
        return res.status(400).json({
          success: false,
          message: 'Recipient and subject are required'
        });
      }

      const result = await sendEmail({
        to,
        subject,
        text,
        html
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Send test email error:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to send email'
      });
    }
  };

  // Get all email connections (admin only)
  getAllConnections = async (req: Request, res: Response) => {
    try {
      const connections = await emailService.getAllEmailConnections();

      res.json({
        success: true,
        data: connections
      });
    } catch (error) {
      console.error('Get all connections error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get email connections'
      });
    }
  };
}

export default new EmailConnectorController();
