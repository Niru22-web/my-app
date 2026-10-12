const path = require('path');
const dotenv = require('dotenv');

const env = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${env}`);
const defaultEnvPath = path.resolve(process.cwd(), '.env');

dotenv.config({ path: envPath });
dotenv.config({ path: defaultEnvPath });

console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('GMAIL_CLIENT_ID:', process.env.GMAIL_CLIENT_ID);
console.log('GMAIL_CLIENT_SECRET:', process.env.GMAIL_CLIENT_SECRET ? 'Present' : 'Missing');
console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID);
console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? 'Present' : 'Missing');
console.log('GOOGLE_REDIRECT_URI:', process.env.GOOGLE_REDIRECT_URI);
