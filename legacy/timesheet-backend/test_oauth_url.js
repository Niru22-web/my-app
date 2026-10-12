const path = require('path');
const dotenv = require('dotenv');

// Load environment
const env = process.env.NODE_ENV || 'production';
const envPath = path.resolve(process.cwd(), `.env.${env}`);
const defaultEnvPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });
dotenv.config({ path: defaultEnvPath });

console.log('ENV GMAIL_CLIENT_ID:', process.env.GMAIL_CLIENT_ID);

// Lazy-load googleapis to match how it's done in email.service.ts
const google = require('googleapis').google;

// Replicate getGoogleAuthConfig
const getGoogleAuthConfig = () => ({
  clientId: process.env.GMAIL_CLIENT_ID || '',
  clientSecret: process.env.GMAIL_CLIENT_SECRET || '',
  redirectUri: process.env.GOOGLE_REDIRECT_URI || 'https://timesheet.asaind.co.in/api/email/callback/google'
});

const getGoogleAuthUrl = (state) => {
  const config = getGoogleAuthConfig();
  console.log('Using config:', {
    clientId: config.clientId,
    clientSecret: config.clientSecret ? 'Present' : 'Missing',
    redirectUri: config.redirectUri
  });
  
  const oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );

  const scopes = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/userinfo.email'
  ];

  const authOptions = {
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  };
  
  if (state) {
    authOptions.state = state;
  }

  const url = oauth2Client.generateAuthUrl(authOptions);
  return url;
};

try {
  const url = getGoogleAuthUrl('EMP001');
  console.log('Generated URL:', url);
} catch (err) {
  console.error('Error generating URL:', err);
}
