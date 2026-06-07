import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',
  database: {
    url: process.env.DATABASE_URL || '',
  },
  session: {
    secret: process.env.SESSION_SECRET || 'dev-session-secret-change-in-prod',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback',
  },
  cron: {
    apiKey: process.env.CRON_API_KEY || 'dev-cron-key',
  },
  footballData: {
    apiKey: process.env.FOOTBALL_DATA_API_KEY || '',
  },
};
