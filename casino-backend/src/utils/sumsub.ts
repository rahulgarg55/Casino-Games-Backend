import axios, { AxiosError } from 'axios';
import crypto from 'crypto';
import winston from 'winston';

// Environment variables
const SUMSUB_BASE_URL = process.env.SUMSUB_BASE_URL || 'https://api.sumsub.com';
const SUMSUB_API_KEY = process.env.SUMSUB_API_KEY;
const SUMSUB_SECRET_KEY = process.env.SUMSUB_SECRET_KEY;

if (!SUMSUB_API_KEY || !SUMSUB_SECRET_KEY) {
  throw new Error('Sumsub API credentials (SUMSUB_API_KEY and SUMSUB_SECRET_KEY) are not configured');
}

// Logger configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/sumsub.log' }),
    new winston.transports.Console()
  ]
});

// Interfaces for type safety
export interface SumsubTokenResponse {
  token: string;
  userId: string;
}

export interface SumsubError {
  code: number;
  message: string;
  correlationId?: string;
  description?: string;
}

export interface SumsubApplicantResponse {
  id: string;
  externalUserId: string;
}

// Utility to validate email
const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Utility to delay execution
const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// Generate HMAC signature for Sumsub API requests
const generateSignature = (
  method: string,
  path: string,
  body: string,
  timestamp: number,
): string => {
  const signatureData = `${timestamp}${method}${path}${body}`;
  logger.debug('Signature generation data', { signatureData });
  return crypto
    .createHmac('sha256', SUMSUB_SECRET_KEY)
    .update(signatureData)
    .digest('hex');
};

// Generate Sumsub access token with retry logic
export const generateSumsubAccessToken = async (
  playerId: string,
  externalUserId: string,
  email: string,
  levelName: string = 'id-and-liveness',
  retries: number = 2,
  delayMs: number = 2000,
): Promise<SumsubTokenResponse> => {
  // Validate email
  if (!validateEmail(email)) {
    logger.error('Invalid email provided for Sumsub applicant creation', { playerId, email });
    throw new Error('Invalid email address provided');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const method = 'POST';
  const path = '/resources/accessTokens';

  // Helper function to attempt token generation
  const attemptTokenGeneration = async (bodyObj: { applicantId?: string; userId?: string; ttlInSecs: number; levelName: string }): Promise<SumsubTokenResponse> => {
    const body = JSON.stringify(bodyObj);
    const signature = generateSignature(method, path, body, timestamp);

    logger.info('Sumsub access token request body', { playerId, externalUserId, requestBody: bodyObj });
    console.log('Sumsub access token request body:', bodyObj);

    try {
      const response = await axios.post(
        `${SUMSUB_BASE_URL}${path}`,
        bodyObj,
        {
          headers: {
            'X-App-Token': SUMSUB_API_KEY,
            'X-App-Access-Sig': signature,
            'X-App-Access-Ts': timestamp.toString(),
            'Content-Type': 'application/json',
          },
        },
      );
      logger.info('Sumsub access token generated successfully', { playerId, externalUserId, response: response.data });
      console.log('Sumsub access token response:', response.data);
      return {
        token: response.data.token,
        userId: externalUserId,
      };
    } catch (error) {
      throw error;
    }
  };

  logger.info('Generating Sumsub access token', { playerId, externalUserId, email, levelName, timestamp });

  // Try with applicantId first
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await attemptTokenGeneration({
        applicantId: externalUserId.toString(),
        ttlInSecs: 3600,
        levelName,
      });
    } catch (error) {
      const axiosError = error as AxiosError;
      const errorData = axiosError.response?.data as SumsubError;
      logger.error(`Sumsub access token attempt ${attempt} with applicantId failed`, {
        playerId,
        externalUserId,
        error: errorData?.description || axiosError.message,
        correlationId: errorData?.correlationId,
      });
      console.error(`Sumsub access token attempt ${attempt} with applicantId failed:`, error);

      // If the error indicates a missing applicant, create one and retry
      if (errorData?.description?.includes("'userId' or 'applicantId' parameter must be provided")) {
        logger.info('Applicant not found, attempting to create new applicant', { playerId, externalUserId });
        try {
          const applicantId = await createSumsubApplicant(playerId, email, externalUserId);
          logger.info('Waiting for Sumsub to propagate applicant creation', { playerId, applicantId });
          await delay(delayMs); // Wait for Sumsub to process the new applicant
          logger.info('Retrying token generation with new applicantId', { playerId, applicantId });

          // Retry with the new applicantId
          return await attemptTokenGeneration({
            applicantId,
            ttlInSecs: 3600,
            levelName,
          });
        } catch (createError) {
          logger.error('Failed to create applicant and generate token', { playerId, externalUserId, error: createError });
          throw new Error(`Sumsub token generation failed after applicant creation: ${createError.message}`);
        }
      }

      // Try with userId as fallback if retries remain
      if (attempt < retries) {
        logger.info(`Attempt ${attempt} failed, retrying with userId`, { playerId, externalUserId });
        await delay(delayMs);
        try {
          return await attemptTokenGeneration({
            userId: externalUserId.toString(),
            ttlInSecs: 3600,
            levelName,
          });
        } catch (error2) {
          const axiosError2 = error2 as AxiosError;
          const errorData2 = axiosError2.response?.data as SumsubError;
          logger.error(`Sumsub token generation attempt ${attempt} with userId failed`, {
            playerId,
            externalUserId,
            error: errorData2?.description || axiosError2.message,
            correlationId: errorData2?.correlationId,
          });
          console.error(`Sumsub access token attempt ${attempt} with userId failed:`, error2);
          if (attempt === retries) {
            throw new Error(`Sumsub token generation failed after ${retries} attempts: ${errorData2?.description || axiosError2.message}`);
          }
        }
      } else {
        throw new Error(`Sumsub token generation failed after ${retries} attempts: ${errorData?.description || axiosError.message}`);
      }
    }
  }

  throw new Error('Sumsub token generation failed: maximum retries reached');
};

// Create Sumsub applicant
export const createSumsubApplicant = async (
  playerId: string,
  email: string,
  externalUserId: string,
  phone?: string,
): Promise<string> => {
  const timestamp = Math.floor(Date.now() / 1000);
  const method = 'POST';
  const levelName = 'id-and-liveness';
  const path = `/resources/applicants?levelName=${encodeURIComponent(levelName)}`;

  const bodyObj = {
    externalUserId,
    email,
    phone: phone || undefined,
  };
  const body = JSON.stringify(bodyObj);

  logger.info('Sumsub applicant creation request body', { playerId, externalUserId, email, phone });
  console.log('Sumsub applicant creation request body:', bodyObj);

  const signature = generateSignature(method, path, body, timestamp);
  logger.info('Creating Sumsub applicant', { playerId, email, phone, timestamp });

  try {
    const response = await axios.post(
      `${SUMSUB_BASE_URL}${path}`,
      bodyObj,
      {
        headers: {
          'X-App-Token': SUMSUB_API_KEY,
          'X-App-Access-Sig': signature,
          'X-App-Access-Ts': timestamp.toString(),
          'Content-Type': 'application/json',
        },
      },
    );
    logger.info('Sumsub applicant created successfully', { playerId, applicantId: response.data.id, response: response.data });
    console.log('Sumsub applicant creation response:', response.data);
    return response.data.id;
  } catch (error) {
    const axiosError = error as AxiosError;
    const errorData = axiosError.response?.data as SumsubError;
    // Handle 'already exists' error
    const match = /already exists: ([a-z0-9]+)/i.exec(errorData?.description || '');
    if (match) {
      const existingApplicantId = match[1];
      logger.warn('Sumsub applicant already exists, using existing applicantId', { playerId, existingApplicantId });
      return existingApplicantId;
    }
    logger.error('Sumsub applicant creation failed', {
      playerId,
      email,
      externalUserId,
      error: errorData?.description || axiosError.message,
      correlationId: errorData?.correlationId,
      fullError: error,
    });
    console.error('Sumsub applicant creation failed:', error);
    throw new Error(
      `Sumsub applicant creation failed: ${errorData?.description || axiosError.message}`,
    );
  }
};

// Validate Sumsub webhook signature
export const validateWebhookSignature = (
  body: any,
  signature: string,
): boolean => {
  const computedSignature = crypto
    .createHmac('sha256', process.env.SUMSUB_WEBHOOK_SECRET || '')
    .update(JSON.stringify(body))
    .digest('hex');
  logger.info('Validating Sumsub webhook signature', { signature, computedSignature });
  return computedSignature === signature;
};