import dotenv from 'dotenv';

dotenv.config();

export const config = {
  sumsub: {
    baseUrl: process.env.SUMSUB_BASE_URL || 'https://test-api.sumsub.com',
    appToken: process.env.SUMSUB_APP_TOKEN || '',
    secretKey: process.env.SUMSUB_SECRET_KEY || '',
    levelName: process.env.SUMSUB_LEVEL_NAME || 'basic-kyc-level'
  },
  // Add other configuration sections as needed
}; 