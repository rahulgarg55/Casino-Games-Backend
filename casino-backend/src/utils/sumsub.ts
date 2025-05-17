import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import crypto from 'crypto';
import winston from 'winston';

// Environment variables
const SUMSUB_BASE_URL = process.env.SUMSUB_BASE_URL || 'https://api.sumsub.com';
const SUMSUB_API_KEY = process.env.SUMSUB_API_KEY;
const SUMSUB_SECRET_KEY = process.env.SUMSUB_SECRET_KEY;
const SUMSUB_WEBHOOK_SECRET = process.env.SUMSUB_WEBHOOK_SECRET;

if (!SUMSUB_API_KEY || !SUMSUB_SECRET_KEY) {
  throw new Error('Sumsub API credentials are not configured');
}

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

export interface SumsubTokenResponse {
  token: string;
  userId: string;
}

interface SumsubErrorResponse {
  code?: number;
  description?: string;
  errorCode?: number;
  correlationId?: string;
}

const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const generateSignature = (
  method: string,
  path: string,
  body: string,
  timestamp: number,
): string => {
  const signatureData = `${timestamp}${method.toUpperCase()}${path}${body}`;
  return crypto
    .createHmac('sha256', SUMSUB_SECRET_KEY)
    .update(signatureData)
    .digest('hex');
};

export const generateSumsubAccessToken = async (
  playerId: string,
  applicantId: string,
  email: string,
  levelName: string = 'id-only',
  retries: number = 3,
  delayMs: number = 1000,
): Promise<SumsubTokenResponse> => {
  if (!validateEmail(email)) {
    logger.error('Invalid email provided', { playerId, email });
    throw new Error('Invalid email address provided');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const method = 'POST';
  const path = '/resources/accessTokens';

  const attemptTokenGeneration = async (
    bodyObj: any,
    attemptDescription: string,
  ): Promise<SumsubTokenResponse> => {
    const body = JSON.stringify(bodyObj);
    const signature = generateSignature(method, path, body, timestamp);

    const config: AxiosRequestConfig = {
      headers: {
        'X-App-Token': SUMSUB_API_KEY!,
        'X-App-Access-Sig': signature,
        'X-App-Access-Ts': timestamp.toString(),
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    };

    logger.info(`Attempting token generation (${attemptDescription})`, {
      playerId,
      applicantId,
      bodyObj,
      config: {
        url: `${SUMSUB_BASE_URL}${path}`,
        method,
        headers: config.headers,
      },
    });

    try {
      const response = await axios.post(
        `${SUMSUB_BASE_URL}${path}`,
        bodyObj,
        config,
      );

      logger.info('Sumsub access token generated', { playerId, applicantId, token: response.data.token });
      return {
        token: response.data.token,
        userId: bodyObj.userId,
      };
    } catch (error) {
      const axiosError = error as AxiosError<SumsubErrorResponse>;
      logger.error(`Token generation attempt failed (${attemptDescription})`, {
        playerId,
        applicantId,
        error: axiosError.message,
        response: axiosError.response?.data,
      });
      throw error;
    }
  };

  const externalUserId = playerId;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Try with both userId and applicantId
      logger.info('Trying with both userId and applicantId', { attempt });
      return await attemptTokenGeneration(
        {
          userId: externalUserId,
          applicantId,
          ttlInSecs: 3600,
          levelName,
        },
        'both userId and applicantId',
      );
    } catch (error: any) {
      if (attempt === retries) {
        logger.error('All attempts with both userId and applicantId failed', { playerId, applicantId });

        // Fallback: Try with only userId and a different levelName
        try {
          logger.info('Falling back to userId only with levelName "basic-kyc"', { attempt });
          return await attemptTokenGeneration(
            {
              userId: externalUserId,
              ttlInSecs: 3600,
              levelName: 'basic-kyc', // Fallback to a common levelName
            },
            'userId only with basic-kyc',
          );
        } catch (fallbackError: any) {
          logger.error('Fallback attempt with userId only failed', {
            playerId,
            applicantId,
            error: fallbackError.message,
            response: (fallbackError as AxiosError<SumsubErrorResponse>).response?.data,
          });
          throw new Error(`Sumsub token generation failed after all attempts: ${fallbackError.message}`);
        }
      }
      const delay = Math.min(delayMs * Math.pow(2, attempt - 1), 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Sumsub token generation failed: maximum retries reached');
};

export const createSumsubApplicant = async (
  playerId: string,
  email: string,
  externalUserId: string,
  phone?: string,
): Promise<string> => {
  const timestamp = Math.floor(Date.now() / 1000);
  const method = 'POST';
  const levelName = 'id-only';
  const path = `/resources/applicants?levelName=${encodeURIComponent(levelName)}`;

  const bodyObj = {
    externalUserId,
    email,
    phone: phone || undefined,
    requiredIdDocs: {
      docSets: [{
        idDocSetType: 'IDENTITY',
        types: ['PASSPORT', 'ID_CARD', 'DRIVERS', 'RESIDENCE_PERMIT'],
      }],
    },
  };

  const body = JSON.stringify(bodyObj);
  const signature = generateSignature(method, path, body, timestamp);

  logger.info('Creating Sumsub applicant', { playerId, externalUserId, email });

  try {
    const response = await axios.post(
      `${SUMSUB_BASE_URL}${path}`,
      bodyObj,
      {
        headers: {
          'X-App-Token': SUMSUB_API_KEY!,
          'X-App-Access-Sig': signature,
          'X-App-Access-Ts': timestamp.toString(),
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      },
    );

    logger.info('Sumsub applicant created', { playerId, applicantId: response.data.id });
    return response.data.id;
  } catch (error: any) {
    const axiosError = error as AxiosError<SumsubErrorResponse>;
    const errorDescription = axiosError.response?.data?.description || '';
    const match = /already exists: ([a-z0-9]+)/i.exec(errorDescription);
    if (match) {
      logger.warn('Applicant already exists', { playerId, existingId: match[1] });
      return match[1];
    }

    logger.error('Applicant creation failed', {
      playerId,
      error: axiosError.response?.data || axiosError.message,
    });
    throw new Error(`Sumsub applicant creation failed: ${errorDescription || axiosError.message}`);
  }
};

export const validateWebhookSignature = (
  body: any,
  signature: string,
): boolean => {
  if (!SUMSUB_WEBHOOK_SECRET) {
    logger.error('Webhook secret not configured');
    return false;
  }

  const computedSignature = crypto
    .createHmac('sha256', SUMSUB_WEBHOOK_SECRET)
    .update(JSON.stringify(body))
    .digest('hex');

  return computedSignature === signature;
};