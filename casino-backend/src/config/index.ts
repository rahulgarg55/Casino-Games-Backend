export const config = {
  sumsub: {
    baseUrl: process.env.SUMSUB_BASE_URL || 'https://api.sumsub.com',
    appToken: process.env.SUMSUB_API_KEY,
    secretKey: process.env.SUMSUB_SECRET_KEY,
    webhookSecret: process.env.SUMSUB_WEBHOOK_SECRET
  }
};