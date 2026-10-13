import { Request, Response } from 'express';
import EmailService from './email.service';
import { sendEmail } from '../../services/email.service';
import { authenticate } from '../../middleware/auth.middleware';
import { prisma } from '../../config/prisma';
import axios from 'axios';
import jwt from 'jsonwebtoken';

const emailService = EmailService;

// Get OAuth URLs for connecting accounts
export const getAuthUrls = async (req: Request, res: Response) => {
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
export const handleGoogleCallback = async (req: Request, res: Response) => {
  try {
    const { code, state, error, error_description } = req.query;

    console.log('=== Google OAuth Callback Debug ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Query parameters:', Object.keys(req.query));
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
export const handleMicrosoftCallback = async (req: Request, res: Response) => {
  try {
    const { code, state, error, error_description } = req.query;

    console.log('=== Microsoft OAuth Callback Debug ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Query parameters:', Object.keys(req.query));
    console.log('Code parameter:', code ? 'Present' : 'Missing');
    console.log('State parameter (userId):', state);
    console.log('Error parameter:', error);
    console.log('Error description:', error_description);
    console.log('Request URL:', req.originalUrl);
    console.log('Request headers:', Object.keys(req.headers));
    
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
    console.log('Processing OAuth for employeeId:', employeeId);

    // Exchange code for access token using form-encoded data
    console.log('Exchanging authorization code for access token...');
    
    const clientId = process.env.MICROSOFT_CLIENT_ID || process.env.OUTLOOK_CLIENT_ID || '';
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET || process.env.OUTLOOK_CLIENT_SECRET || '';
    const redirectUri = process.env.OUTLOOK_REDIRECT_URI || process.env.MICROSOFT_REDIRECT_URI || `${process.env.BACKEND_URL || 'https://timesheet.asaind.co.in'}/api/email/oauth/outlook/callback`;

    if (!clientId || !clientSecret) {
      console.error('CRITICAL: Microsoft Client ID or Secret is missing in environment variables');
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return res.redirect(`${frontendUrl}/email-configuration?success=false&provider=outlook&error=Server configuration error: Missing Client ID or Secret`);
    }

    const tokenData = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: code as string,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      scope: 'https://graph.microsoft.com/.default offline_access'
    });

    try {
      const tokenResponse = await axios.post(
        'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        tokenData,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      const { access_token, refresh_token, expires_in } = tokenResponse.data;

      // Get user info
      const userResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
        headers: {
          Authorization: `Bearer ${access_token}`
        }
      });

      const email = userResponse.data.mail || userResponse.data.userPrincipalName;
      console.log('Microsoft OAuth connection successful for email:', email);

      // Store tokens in database for the user
      await emailService.storeEmailConnection({
        employeeId: employeeId,
        provider: 'outlook',
        email: email,
        accessToken: access_token,
        refreshToken: refresh_token || '',
        tokenExpiry: new Date(Date.now() + (expires_in * 1000))
      });

      console.log('Tokens stored successfully for employeeId:', employeeId);

      // Redirect to frontend email configuration page
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      res.redirect(`${frontendUrl}/email-configuration?outlook=connected&email=${email}`);
    } catch (tokenError: any) {
      console.error('Microsoft token exchange error:', tokenError.response?.data || tokenError.message);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const errorMessage = tokenError.response?.data?.error_description || tokenError.message || 'Token exchange failed';
      res.redirect(`${frontendUrl}/email-configuration?success=false&provider=outlook&error=${encodeURIComponent(errorMessage)}`);
    }
  } catch (error) {
    console.error('Microsoft callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/email-configuration?success=false&provider=outlook&error=Failed to connect Outlook`);
  }
};

// Get email connection status
export const getConnectionStatus = async (req: Request, res: Response) => {
  try {
    console.log("=== API HIT ===");
    console.log("User object:", (req as any).user);
    
    const user = (req as any).user;
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated"
      });
    }

    if (!user.employeeId) {
      console.error("Missing employeeId in user:", user);
      return res.status(400).json({
        success: false,
        message: "Employee ID missing"
      });
    }
    
    let gmailConnection;
    let outlookConnection;
    
    try {
      gmailConnection = await emailService.getEmailConnection(user.employeeId, 'gmail');
      outlookConnection = await emailService.getEmailConnection(user.employeeId, 'outlook');
    } catch (err: any) {
      console.error("DB Error:", err);
      return res.status(500).json({
        success: false,
        message: "Database error",
        error: err.message
      });
    }

    console.log('Gmail connection:', !!gmailConnection);
    console.log('Outlook connection:', !!outlookConnection);

    const response: any = {
      success: true,
      connected: false,
      outlookConnected: false,
      gmailConnected: false,
      providers: {}
    };

    if (gmailConnection) {
      response.providers.gmail = {
        connected: true,
        email: gmailConnection.email,
        provider: 'gmail'
      };
      response.connected = true;
      response.gmailConnected = true;
    }

    if (outlookConnection) {
      response.providers.outlook = {
        connected: true,
        email: outlookConnection.email,
        provider: 'outlook'
      };
      response.connected = true;
      response.outlookConnected = true;
    }

    console.log('Final connection status:', {
      connected: response.connected,
      outlookConnected: response.outlookConnected,
      gmailConnected: response.gmailConnected
    });

    return res.json(response);
  } catch (error: any) {
    console.error("API ERROR:", error);
    console.error("Stack:", error.stack);
    return res.status(500).json({
      success: false,
      message: 'Failed to get connection status',
      error: error.message || 'Unknown error'
    });
  }
};

// Disconnect email account
export const disconnectEmail = async (req: Request, res: Response) => {
  try {
    console.log("=== API HIT ===");
    console.log("User object:", (req as any).user);

    const { provider } = req.body;
    const user = (req as any).user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated"
      });
    }

    if (!user.employeeId) {
      console.error("Missing employeeId in user:", user);
      return res.status(400).json({
        success: false,
        message: "Employee ID missing"
      });
    }

    const employeeId = user.employeeId;

    if (!['gmail', 'outlook'].includes(provider)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid provider'
      });
    }

    try {
      await emailService.disconnectEmail(employeeId, provider);
    } catch (err: any) {
      console.error("DB Error:", err);
      return res.status(500).json({
        success: false,
        message: "Database error",
        error: err.message
      });
    }

    return res.json({
      success: true,
      message: `Successfully disconnected ${provider}`
    });
  } catch (error: any) {
    console.error("API ERROR:", error);
    console.error("Stack:", error.stack);
    return res.status(500).json({
      success: false,
      message: 'Failed to disconnect email account'
    });
  }
};

// Send test email (for testing)
export const sendTestEmail = async (req: Request, res: Response) => {
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
export const getAllConnections = async (req: Request, res: Response) => {
  try {
    const connections = await emailService.getAllEmailConnections();
    const safeConnections = Array.isArray(connections)
      ? connections.map(({ accessToken, refreshToken, ...rest }: any) => rest)
      : connections;

    res.json({
      success: true,
      data: safeConnections
    });
  } catch (error) {
    console.error('Get all connections error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get email connections'
    });
  }
};

// Get OAuth URL for specific provider
export const getOAuthAuthUrl = async (req: Request, res: Response) => {
  try {
    const { provider } = req.query;
    
    if (!provider || !['gmail', 'outlook'].includes(provider as string)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid provider'
      });
    }

    let authUrl: string;
    if (provider === 'gmail') {
      authUrl = emailService.getGoogleAuthUrl();
    } else {
      authUrl = emailService.getMicrosoftAuthUrl();
    }

    res.json({
      success: true,
      url: authUrl,
      state: Math.random().toString(36).substring(7)
    });
  } catch (error) {
    console.error('Get OAuth URL error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate OAuth URL'
    });
  }
};

// Handle OAuth callback
export const handleOAuthCallback = async (req: Request, res: Response) => {
  try {
    const { provider, code, state } = req.body;
    const user = (req as any).user;

    if (!provider || !['gmail', 'outlook'].includes(provider)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid provider'
      });
    }

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Authorization code is required'
      });
    }

    // Use employeeId for consistent database mapping
    const employeeId = user.employeeId;
    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: 'User is not linked to an employee'
      });
    }
    
    let result;
    if (provider === 'gmail') {
      result = await emailService.handleGoogleCallback(code, employeeId);
    } else {
      result = await emailService.handleMicrosoftCallback(code, employeeId);
    }

    res.json({
      success: true,
      connection: {
        provider: result.provider,
        email: result.email,
        isActive: true,
        connectedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to complete OAuth connection'
    });
  }
};

// Disconnect OAuth
export const disconnectOAuth = async (req: Request, res: Response) => {
  return await disconnectEmail(req, res);
};

// Get OAuth status
export const getOAuthStatus = async (req: Request, res: Response) => {
  return await getConnectionStatus(req, res);
};

// Get Google OAuth auth
export const getGoogleOAuthAuth = async (req: Request, res: Response) => {
  try {
    console.log('=== Google OAuth Initiation ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Request URL:', req.originalUrl);
    
    // Identify user from authenticated request
    const user = (req as any).user;
    if (!user || (!user.id && !user.employeeId)) {
      console.error('❌ Unauthorized request to getGoogleOAuthAuth');
      return res.status(401).json({ message: 'User not authenticated' });
    }

    // Use employeeId as state to ensure correct DB mapping
    const state = user.employeeId;
    
    // Validate employeeId exists
    if (!state) {
      console.error('❌ User is not linked to an employee');
      return res.status(400).json({ message: 'User is not linked to an employee' });
    }
    
    console.log('✅ Sending employeeId in state:', state);
    
    // Generate Google OAuth URL with the state
    const authUrl = emailService.getGoogleAuthUrl(state);
    
    console.log('✅ Google OAuth URL generated successfully');
    console.log('🔗 Redirecting to Google login:', authUrl);
    
    // Redirect directly to Google OAuth login
    res.redirect(authUrl);
  } catch (error) {
    console.error('❌ Get Google OAuth URL error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate Google OAuth URL',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get Outlook OAuth auth (public endpoint - redirects to Microsoft login)
export const getOutlookOAuthAuth = async (req: Request, res: Response) => {
  try {
    console.log('=== Outlook OAuth Initiation ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Request URL:', req.originalUrl);
    
    // Identify user from authenticated request
    const user = (req as any).user;
    if (!user || (!user.id && !user.employeeId)) {
      console.error('❌ Unauthorized request to getOutlookOAuthAuth');
      return res.status(401).json({ message: 'User not authenticated' });
    }

    // Use employeeId as state to ensure correct DB mapping
    const state = user.employeeId;
    
    // Validate employeeId exists
    if (!state) {
      console.error('❌ User is not linked to an employee');
      return res.status(400).json({ message: 'User is not linked to an employee' });
    }
    
    console.log('✅ Sending employeeId in state:', state);
    
    // Generate Microsoft OAuth URL with the state
    const authUrl = emailService.getMicrosoftAuthUrl(state);
    
    console.log('✅ Outlook OAuth URL generated successfully');
    console.log('🔗 Redirecting to Microsoft login:', authUrl);
    
    // Redirect directly to Microsoft OAuth login
    res.redirect(authUrl);
  } catch (error) {
    console.error('❌ Get Outlook OAuth URL error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate Outlook OAuth URL',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Placeholder functions for missing exports
export const getProviderConfigurations = async (req: Request, res: Response) => {
  try {
    const configurations = [
      {
        id: 'google-workspace',
        name: 'Google Workspace',
        description: 'Use Gmail or Google Workspace account',
        authType: 'OAuth',
        setupNote: 'Enable Gmail API in Google Cloud Console and configure OAuth credentials'
      },
      {
        id: 'outlook-365',
        name: 'Outlook 365',
        description: 'Use Microsoft Outlook or Office 365 account',
        authType: 'OAuth',
        setupNote: 'Register app in Azure Active Directory and enable Mail.Send permission'
      }
    ];

    res.json(configurations);
  } catch (error) {
    console.error('Get provider configurations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get provider configurations'
    });
  }
};

export const getEmailConfiguration = async (req: Request, res: Response) => {
  try {
    console.log("=== API HIT ===");
    console.log("User object:", (req as any).user);
    
    const user = (req as any).user;
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated"
      });
    }

    if (!user.employeeId) {
      console.error("Missing employeeId in user:", user);
      return res.status(400).json({
        success: false,
        message: "Employee ID missing"
      });
    }
    
    const employeeId = user.employeeId;
    
    let connection;
    try {
      connection = await emailService.getEmailConnection(employeeId);
    } catch (err: any) {
      console.error("DB Error:", err);
      return res.status(500).json({
        success: false,
        message: "Database error",
        error: err.message
      });
    }
    
    if (!connection) {
      return res.json({
        success: true,
        connected: false,
        providers: {}
      });
    }
    
    const { accessToken, refreshToken, ...safeConnection } = connection as any;

    return res.json({
      emailProvider: `${connection.provider}-workspace`,
      enableNotifications: true,
      oauthConnection: safeConnection
    });
  } catch (error: any) {
    console.error("API ERROR:", error);
    console.error("Stack:", error.stack);
    return res.status(500).json({
      success: false,
      message: 'Failed to get email configuration'
    });
  }
};

export const saveEmailConfiguration = async (req: Request, res: Response) => {
  try {
    const { emailProvider, enableNotifications } = req.body;
    
    // Configuration is saved through OAuth flow, so just return success
    res.json({
      success: true,
      message: 'Email configuration saved successfully'
    });
  } catch (error) {
    console.error('Save email configuration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save email configuration'
    });
  }
};

export const testEmailConfiguration = async (req: Request, res: Response) => {
  return await sendTestEmail(req, res);
};

export const getEmailTemplates = async (req: Request, res: Response) => {
  try {
    console.log('🔍 Fetching email templates from database...');
    
    // Fetch templates from database (only active ones)
    const templates = await prisma.emailTemplate.findMany({
      where: {
        status: 'active'
      },
      orderBy: { createdAt: 'desc' }
    });

    console.log('📊 Templates found in database:', templates.length);

    // If no templates exist, create default ones
    if (templates.length === 0) {
      console.log('📝 No templates found, creating default templates...');
      
      const defaultTemplates = [
        {
          name: 'Employee Registration',
          category: 'Registration',
          subject: 'Your account has been created',
          body: `Hi {{employee_name}},

Welcome to the Timesheet System. Your account has been created successfully.

You can log in to your account using the link below:
{{login_url}}

Account Details:
Email: {{employee_email}}
Company: {{company_name}}

If you have any questions, feel free to reply to this email.

Best regards,
{{company_name}} Team`,
          variables: ['employee_name', 'company_name', 'employee_email', 'login_url']
        },
        {
          name: 'Leave Approval',
          category: 'Leave',
          subject: 'Update on your leave request',
          body: `Hi {{employee_name}},

Your leave request has been {{status}}.

Leave Details:
Type: {{leave_type}}
Period: {{start_date}} to {{end_date}}
Total Days: {{total_days}}
Reason: {{reason}}

If you have any questions, feel free to reply to this email.

Best regards,
Timesheet System Team`,
          variables: ['manager_name', 'employee_name', 'status', 'leave_type', 'start_date', 'end_date', 'total_days', 'reason']
        },
        {
          name: 'Timesheet Reminder',
          category: 'Timesheet',
          subject: 'Reminder: Timesheet submission due',
          body: `Hi {{employee_name}},

This is a friendly reminder to submit your timesheet for {{date}}.

Current Status:
Hours Logged: {{hours_logged}}
Pending Entries: {{pending_entries}}

Please ensure your timesheet is submitted by the deadline: {{deadline}}

You can log in here: {{login_url}}

Best regards,
{{company_name}} Team`,
          variables: ['employee_name', 'date', 'hours_logged', 'pending_entries', 'deadline', 'login_url', 'company_name']
        },
        {
          name: 'Password Reset',
          category: 'Security',
          subject: 'Password Reset Request',
          body: `Hi {{employee_name}},

We received a request to reset your password for your {{company_name}} account.

You can reset your password using the link below:
{{reset_url}}

If you did not request this, please ignore this email.

Best regards,
{{company_name}} Team`,
          variables: ['employee_name', 'company_name', 'reset_url', 'expiry_hours']
        }
      ];

      // Insert default templates using a loop (safer than createMany for autogenerating IDs)
      console.log('📝 Inserting default templates...');
      for (const template of defaultTemplates) {
        try {
          await prisma.emailTemplate.create({
            data: template
          });
        } catch (createErr) {
          console.error(`❌ Failed to create template ${template.name}:`, createErr);
        }
      }

      console.log('✅ Default templates initialization completed');

      // Fetch the newly created templates
      const newTemplates = await prisma.emailTemplate.findMany({
        where: {
          status: 'active'
        },
        orderBy: { createdAt: 'desc' }
      });

      return res.json({
        success: true,
        templates: newTemplates,
        message: 'Default templates created'
      });
    }

    res.json({
      success: true,
      templates: templates
    });
  } catch (error) {
    console.error('❌ Get email templates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get email templates',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get pending employee approvals
export const getPendingApprovals = async (req: Request, res: Response) => {
  try {
    console.log('Fetching pending approvals for admin');
    
    const pendingEmployees = await prisma.employee.findMany({
      where: {
        status: {
          in: ['pending_approval', 'pending']
        }
      },
      select: {
        id: true,
        employeeId: true,
        firstName: true,
        lastName: true,
        officeEmail: true,
        designation: true,
        role: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`Found ${pendingEmployees.length} pending approvals`);
    res.json(pendingEmployees);
  } catch (error) {
    console.error('Error fetching pending approvals:', error);
    res.status(500).json({ 
      message: 'Failed to fetch pending approvals',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const createEmailTemplate = async (req: Request, res: Response) => {
  try {
    const { name, category, subject, body, variables } = req.body;
    
    if (!name || !category || !subject || !body) {
      return res.status(400).json({
        success: false,
        message: 'Name, category, subject, and body are required'
      });
    }

    const template = await prisma.emailTemplate.create({
      data: {
        name,
        category,
        subject,
        body,
        variables: variables || [],
        status: 'active'
      }
    });

    res.status(201).json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('Create email template error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create email template'
    });
  }
};

export const updateEmailTemplate = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, category, subject, body, status } = req.body;
    
    console.log('🔄 Updating email template:', id);
    console.log('📝 Update data:', { name, category, subject, status });
    
    // Validate required fields
    if (!subject || !body) {
      return res.status(400).json({
        success: false,
        message: 'Subject and body are required'
      });
    }
    
    // Update the template in database
    const updatedTemplate = await prisma.emailTemplate.update({
      where: { id },
      data: {
        name: name || undefined,
        category: category || undefined,
        subject,
        body,
        status: status || 'active',
        updatedAt: new Date()
      }
    });
    
    console.log('✅ Template updated successfully:', updatedTemplate.name);
    
    res.json({
      success: true,
      template: updatedTemplate,
      message: 'Email template updated successfully'
    });
  } catch (error) {
    console.error('❌ Update email template error:', error);
    
    if (error instanceof Error && error.message.includes('Record to update not found')) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to update email template',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const sendEmailFromTemplate = async (req: Request, res: Response) => {
  return await sendTestEmail(req, res);
};

// Email health check endpoint
export const checkEmailHealth = async (req: Request, res: Response) => {
  try {
    console.log('🔍 Email health check requested');
    
    const health = {
      smtp: {
        configured: !!process.env.SMTP_USER && !!process.env.SMTP_PASS,
        host: process.env.SMTP_HOST || 'not configured',
        port: process.env.SMTP_PORT || '587',
        secure: process.env.SMTP_SECURE || 'false'
      },
      oauth: {
        google: {
          configured: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
          clientId: process.env.GOOGLE_CLIENT_ID ? 'configured' : 'missing'
        },
        outlook: {
          configured: !!process.env.OUTLOOK_CLIENT_ID && !!process.env.OUTLOOK_CLIENT_SECRET,
          clientId: process.env.OUTLOOK_CLIENT_ID ? 'configured' : 'missing'
        }
      },
      connections: {
        outlook: 0,
        gmail: 0
      },
      frontend: {
        url: process.env.FRONTEND_URL || 'http://localhost:5173'
      }
    };

    // Check active connections
    try {
      const connections = await emailService.getAllEmailConnections();
      health.connections.outlook = connections.filter(c => c.provider === 'outlook').length;
      health.connections.gmail = connections.filter(c => c.provider === 'gmail').length;
      console.log('📊 Active connections:', health.connections);
    } catch (dbError: any) {
      console.warn('⚠️ Could not check connections:', dbError.message);
    }

    const recommendations = [];
    
    if (!health.smtp.configured && health.connections.outlook === 0) {
      recommendations.push("Configure SMTP or OAuth to enable email sending");
    }
    
    if (!health.oauth.google.configured && !health.oauth.outlook.configured) {
      recommendations.push("Set up OAuth credentials for Gmail or Outlook");
    }
    
    if (health.oauth.outlook.configured && health.connections.outlook === 0) {
      recommendations.push("Connect an Outlook account in Email Configuration");
    }
    
    if (health.oauth.google.configured && health.connections.gmail === 0) {
      recommendations.push("Connect a Gmail account in Email Configuration");
    }

    console.log('✅ Email health check completed');
    console.log('📋 Recommendations:', recommendations);

    res.json({
      success: true,
      health,
      recommendations,
      status: (health.connections.outlook > 0 || health.smtp.configured) ? 'operational' : 'not_configured'
    });
  } catch (error) {
    console.error('❌ Email health check error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 'error'
    });
  }
};
