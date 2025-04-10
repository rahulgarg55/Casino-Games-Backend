import axios, { AxiosError } from 'axios';
import crypto from 'crypto';

const SUMSUB_BASE_URL = process.env.SUMSUB_BASE_URL || 'https://api.sumsub.com';
const SUMSUB_API_KEY = process.env.SUMSUB_API_KEY;
const SUMSUB_SECRET_KEY = process.env.SUMSUB_SECRET_KEY;

if (!SUMSUB_API_KEY || !SUMSUB_SECRET_KEY) {
  throw new Error('Sumsub API credentials are not configured');
}

export interface SumsubTokenResponse {
  token: string;
  userId: string;
}

export interface SumsubError {
  code: number;
  message: string;
}

/**
 * Generates a signature for Sumsub API requests.
 */
const generateSignature = (
  method: string,
  path: string,
  body: string,
  timestamp: number,
): string => {
  return crypto
    .createHmac('sha256', SUMSUB_SECRET_KEY)
    .update(`${timestamp}${method}${path}${body}`)
    .digest('hex');
};

/**
 * Generates a Sumsub access token for the SDK.
 * @param playerId - Internal player ID
 * @param externalUserId - Unique identifier for Sumsub (e.g., playerId)
 * @param levelName - Verification level name (default: "basic-kyc")
 * @throws {SumsubError} If token generation fails
 */
export const generateSumsubAccessToken = async (
  playerId: string,
  externalUserId: string,
  levelName: string = 'basic-kyc',
): Promise<SumsubTokenResponse> => {
  const timestamp = Math.floor(Date.now() / 1000);
  const method = 'POST';
  const path = '/resources/accessTokens';
  const body = JSON.stringify({
    userId: externalUserId,
    ttlInSecs: 3600,
    levelName,
  });

  const signature = generateSignature(method, path, body, timestamp);

  try {
    const response = await axios.post(
      `${SUMSUB_BASE_URL}${path}`,
      { userId: externalUserId, ttlInSecs: 3600, levelName },
      {
        headers: {
          'X-App-Token': SUMSUB_API_KEY,
          'X-App-Access-Sig': signature,
          'X-App-Access-Ts': timestamp.toString(),
          'Content-Type': 'application/json',
        },
      },
    );

    return {
      token: response.data.token,
      userId: externalUserId,
    };
  } catch (error) {
    const axiosError = error as AxiosError;
    const errorData = axiosError.response?.data as { description?: string };
    throw new Error(
      `Sumsub token generation failed: ${
        errorData?.description || axiosError.message
      }`,
    );
  }
};
/**
 * Creates a new Sumsub applicant.
 * @param playerId - Internal player ID
 * @param email - Player's email
 * @param phone - Player's phone number (optional)
 * @throws {SumsubError} If applicant creation fails
 */
export const createSumsubApplicant = async (
  playerId: string,
  email: string,
  phone?: string,
): Promise<string> => {
  const timestamp = Math.floor(Date.now() / 1000);
  const method = 'POST';
  const path = '/resources/applicants';
  const externalUserId = playerId;

  const body = JSON.stringify({
    externalUserId,
    email,
    phone,
    levelName: 'basic-kyc',
  });

  const signature = generateSignature(method, path, body, timestamp);

  try {
    const response = await axios.post(
      `${SUMSUB_BASE_URL}${path}`,
      { externalUserId, email, phone, levelName: 'basic-kyc' },
      {
        headers: {
          'X-App-Token': SUMSUB_API_KEY,
          'X-App-Access-Sig': signature,
          'X-App-Access-Ts': timestamp.toString(),
          'Content-Type': 'application/json',
        },
      },
    );

    return response.data.applicantId;
  } catch (error) {
    const axiosError = error as AxiosError;
    const errorData = axiosError.response?.data as { description?: string };
    throw new Error(
      `Sumsub applicant creation failed: ${
        errorData?.description || axiosError.message
      }`,
    );
  }
};
/**
 * Validates Sumsub webhook signature.
 * @param body - Webhook payload
 * @param signature - Signature from 'x-payload-signature' header
 * @returns Boolean indicating if the signature is valid
 */
export const validateWebhookSignature = (
  body: any,
  signature: string,
): boolean => {
  const computedSignature = crypto
    .createHmac('sha256', process.env.SUMSUB_WEBHOOK_SECRET || '')
    .update(JSON.stringify(body))
    .digest('hex');
  return computedSignature === signature;
};
