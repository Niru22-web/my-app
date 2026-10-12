import EmailService from '../modules/email/email.service';
import nodemailer from 'nodemailer';

// Direct Email Connector interface
interface DirectEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  cc?: string | string[];
}

// SMTP Configuration
const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  },
  // Add TLS options for better compatibility
  tls: {
    rejectUnauthorized: false
  }
};

// Create SMTP transporter if SMTP credentials are available
const createSMTPTransporter = () => {
  console.log('🔍 Checking SMTP configuration...');
  
  if (SMTP_CONFIG.auth.user && SMTP_CONFIG.auth.pass) {
    const isGmail = SMTP_CONFIG.host.includes('gmail');
    
    const transporterConfig: any = isGmail ? {
      service: 'gmail',
      auth: {
        user: SMTP_CONFIG.auth.user,
        pass: SMTP_CONFIG.auth.pass
      }
    } : SMTP_CONFIG;

    console.log(`📧 Creating ${isGmail ? 'Gmail' : 'SMTP'} transporter...`);
    return nodemailer.createTransport(transporterConfig);
  } else {
    console.warn('❌ SMTP credentials not configured. Email will fail.');
  }
  return null;
};

export const sendEmail = async (options: DirectEmailOptions): Promise<boolean> => {
  const startTime = Date.now();
  
  try {
    console.log('📧 === EMAIL SENDING START ===');
    console.log('📋 To:', options.to);
    
    // Check available services
    const connections = await EmailService.getAllEmailConnections();
    const outlookConnection = connections.find(conn => conn.provider === 'outlook' && conn.accessToken);
    
    if (outlookConnection) {
      console.log('🔐 Using Outlook OAuth connection...');
      try {
        await EmailService['sendSystemEmail']({
          to: options.to,
          subject: options.subject,
          content: options.html || options.text || '',
          isHtml: !!options.html
        });
        console.log('✅ Email sent via Outlook.');
        return true;
      } catch (oauthError) {
        console.error('❌ Outlook OAuth failed, attempting SMTP fallback...');
      }
    }
    
    // Fallback to SMTP
    const smtpTransporter = createSMTPTransporter();
    if (smtpTransporter) {
      const mailOptions = {
        from: `"ASA Timesheet Portal" <${SMTP_CONFIG.auth.user}>`,
        to: options.to,
        cc: options.cc,
        subject: options.subject,
        html: options.html,
        text: options.text
      };
      
      const info = await smtpTransporter.sendMail(mailOptions);
      console.log('✅ Email sent via SMTP:', info.response);
      return true;
    }
    
    return false;
  } catch (error: any) {
    console.error('❌ EMAIL SENDING FAILED:', error.message);
    throw error;
  }
};

export const sendPasswordResetEmail = async (email: string, resetLink: string): Promise<boolean> => {
  const subject = 'Password Reset Request - ASA Timesheet Portal';
  
  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; color: #333; border: 1px solid #e1e1e1; border-radius: 12px; padding: 24px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: #4f46e5; margin: 0;">ASA Timesheet Portal</h2>
      </div>
      <p style="font-size: 16px;">Hello,</p>
      <p style="font-size: 16px; line-height: 1.5;">We received a request to reset the password for your account. Click the button below to set a new password:</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${resetLink}" style="background-color: #4f46e5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">Reset Password</a>
      </div>
      <p style="font-size: 14px; color: #666; background: #f9f9f9; padding: 12px; border-radius: 6px; word-break: break-all;">
        If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="${resetLink}" style="color: #4f46e5;">${resetLink}</a>
      </p>
      <p style="font-size: 14px; color: #666;">This link will expire in 15 minutes.</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 24px 0;">
      <p style="font-size: 12px; color: #999; text-align: center;">If you did not request a password reset, please ignore this email.</p>
    </div>
  `;

  const text = `
Hello,

We received a request to reset the password for your ASA Timesheet Portal account.

Reset your password by visiting this link:
${resetLink}

This link will expire in 15 minutes.

If you did not request this, please ignore this email.
  `;

  return await sendEmail({
    to: email,
    subject,
    html,
    text,
  });
};
