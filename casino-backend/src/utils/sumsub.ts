import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import crypto from 'crypto';
import winston from 'winston';
import { config } from '../config';
import FormData from 'form-data';

// Environment variables
const SUMSUB_BASE_URL = process.env.SUMSUB_BASE_URL || 'https://api.sumsub.com';
const SUMSUB_API_KEY = process.env.SUMSUB_API_KEY;
const SUMSUB_SECRET_KEY = process.env.SUMSUB_SECRET_KEY;
const SUMSUB_WEBHOOK_SECRET = process.env.SUMSUB_WEBHOOK_SECRET;

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

if (!SUMSUB_API_KEY || !SUMSUB_SECRET_KEY || !SUMSUB_WEBHOOK_SECRET) {
  throw new Error('Sumsub API credentials are not configured');
}

// Validate API key format
if (!SUMSUB_API_KEY.startsWith('sbx:')) {
  logger.warn('API key does not start with "sbx:" prefix. Make sure you are using sandbox credentials.');
}

// Log the current base URL for debugging
logger.info('Using Sumsub base URL', { baseUrl: SUMSUB_BASE_URL });

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
  // Remove any trailing slashes from path
  const cleanPath = path.replace(/\/+$/, '');
  
  // Ensure body is properly formatted
  const cleanBody = body ? body.trim() : '';
  
  // Construct signature data exactly as Sumsub expects
  // Format: timestamp + method + path + body (no spaces, no separators)
  const signatureData = `${timestamp}${method.toUpperCase()}${cleanPath}${cleanBody}`;
  
  // Log the exact components used in signature generation
  logger.debug('Signature generation details', { 
    components: {
      timestamp: {
        value: timestamp,
        type: typeof timestamp,
        length: timestamp.toString().length
      },
      method: {
        value: method.toUpperCase(),
        type: typeof method,
        length: method.length
      },
      path: {
        value: cleanPath,
        type: typeof cleanPath,
        length: cleanPath.length
      },
      body: {
        value: cleanBody,
        type: typeof cleanBody,
        length: cleanBody.length
      }
    },
    finalSignatureData: signatureData,
    signatureDataLength: signatureData.length
  });
  
  if (!SUMSUB_SECRET_KEY) {
    throw new Error('SUMSUB_SECRET_KEY is not configured');
  }

  // Ensure the secret key is properly formatted
  const secretKey = SUMSUB_SECRET_KEY.trim();
  if (!secretKey) {
    throw new Error('SUMSUB_SECRET_KEY is empty after trimming');
  }

  // Generate signature using SHA-256
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(signatureData)
    .digest('hex');

  // Log the generated signature and its components
  logger.debug('Generated signature', { 
    signature,
    signatureLength: signature.length,
    components: {
      timestamp,
      method: method.toUpperCase(),
      path: cleanPath,
      body: cleanBody
    },
    signatureData,
    secretKeyPrefix: secretKey.substring(0, 10) + '...' // Log first 10 chars of secret key for debugging
  });
  
  return signature;
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
  const path = '/resources/accessTokens/sdk'; // Correct endpoint for SDK tokens
  const url = `${SUMSUB_BASE_URL}${path}`;

  // Request body for SDK access token, using internal playerId as userId
  const bodyObj = {
    userId: playerId, // Your internal player ID (externalUserId in Sumsub)
    ttlInSecs: 3600,
    levelName,
  };

  // Generate the body string once and use it for both signature and request
  const body = JSON.stringify(bodyObj);

  const signature = generateSignature(method, path, body, timestamp);

  const headers = {
    'X-App-Token': SUMSUB_API_KEY!,
    'X-App-Access-Sig': signature,
    'X-App-Access-Ts': timestamp.toString(),
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  const config: AxiosRequestConfig = {
    headers: headers,
    timeout: 10000,
    transformRequest: [(data) => data], // Prevent axios from modifying the body
  };

  logger.info('Attempting to generate Sumsub access token for SDK', {
    playerId,
    applicantId,
    url,
    method,
    requestHeaders: headers,
    requestBody: bodyObj,
    requestBodyString: body,
    signature,
    timestamp
  });

  let lastError: any;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.post(url, body, config);
      
      logger.info('Sumsub access token for SDK generated successfully', { 
        playerId, 
        applicantId, 
        token: response.data.token.substring(0, 10) + '...' 
      });

      return {
        token: response.data.token,
        userId: playerId, // Return internal userId as per function signature
      };
    } catch (error: any) {
      lastError = error;
      const axiosError = error as AxiosError<SumsubErrorResponse>;
      
      logger.error('Sumsub access token generation failed', {
        attempt,
        playerId,
        applicantId,
        error: axiosError.message,
        responseStatus: axiosError.response?.status,
        responseData: axiosError.response?.data,
        requestUrl: url,
        requestHeaders: headers,
        requestBodyString: body,
        generatedSignature: signature
      });

      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw new Error(`Failed to generate Sumsub access token after ${retries} attempts: ${lastError?.message}`);
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
  const path = `/resources/applicants?levelName=${levelName}`;

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

  console.log('bodyObj :>> ', bodyObj);
  
  // Convert body to string and ensure it's not empty
  const body = JSON.stringify(bodyObj);
  if (!body) {
    throw new Error('Request body cannot be empty');
  }

  // Generate signature with the exact body string
  const signature = generateSignature(method, path, body, timestamp);

  console.log('signature :>> ', signature);

  const headers = {
    'X-App-Token': SUMSUB_API_KEY!,
    'X-App-Access-Sig': signature,
    'X-App-Access-Ts': timestamp.toString(),
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  logger.info('Creating Sumsub applicant', { 
    playerId, 
    externalUserId, 
    email, 
    signature,
    timestamp,
    path,
    bodyObj,
    bodyString: body,
    headers,
    apiKeyPrefix: SUMSUB_API_KEY?.substring(0, 10) + '...' // Log first 10 chars of API key for debugging
  });

  try {
    // Send the request with the raw body string
    const response = await axios.post(
      `${SUMSUB_BASE_URL}${path}`,
      body, // Send the raw body string instead of bodyObj
      { 
        headers, 
        timeout: 10000,
        transformRequest: [(data) => data], // Prevent axios from transforming the body
        validateStatus: (status) => status < 500 // Accept all responses for better error handling
      }
    );

    console.log('response.data :>> ', response.data);

    console.log('response.status :>> ', response.status);

    if (response.status >= 400) {
      throw new Error(`Sumsub API error: ${response.status} - ${JSON.stringify(response.data)}`);
    }

    logger.info('Sumsub applicant created', { 
      playerId, 
      applicantId: response.data.id,
      responseData: response.data 
    });
    return response.data.id;
  } catch (error: any) {
    const axiosError = error as AxiosError<SumsubErrorResponse>;
    const errorDescription = axiosError.response?.data?.description || '';
    const errorCode = axiosError.response?.data?.errorCode;
    const correlationId = axiosError.response?.data?.correlationId;

    logger.error('Applicant creation failed', {
      playerId,
      error: axiosError.response?.data || axiosError.message,
      errorCode,
      correlationId,
      status: axiosError.response?.status,
      headers: axiosError.response?.headers,
      requestBody: bodyObj,
      signature,
      timestamp,
      signatureData: `${timestamp}${method.toUpperCase()}${path}${body}`,
      requestHeaders: headers,
      apiKeyPrefix: SUMSUB_API_KEY?.substring(0, 10) + '...'
    });

    // const match = /already exists: ([a-z0-9]+)/i.exec(errorDescription);
    // if (match) {
    //   logger.warn('Applicant already exists', { playerId, existingId: match[1] });
    //   return match[1];
    // }

    // throw new Error(`Sumsub applicant creation failed: ${errorDescription || axiosError.message}`);
  }
};

export const validateWebhookSignature = (
  body: Buffer | string,
  signature: string,
): boolean => {
  if (!SUMSUB_WEBHOOK_SECRET) {
    logger.error('Webhook secret not configured');
    return false;
  }

  const rawBody = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  const computedSignature = crypto
    .createHmac('sha256', SUMSUB_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  logger.debug('Webhook signature validation', {
    receivedSignature: signature,
    computedSignature,
    body: rawBody.toString(),
  });

  return computedSignature === signature;
};

export const uploadDocumentToSumsub = async (
  applicantId: string,
  fileBuffer: Buffer,
  fileName: string,
  documentType: string = 'IDENTITY',
  documentSide: string = 'FRONT'
) => {
  try {
    const token = await generateSumsubAccessToken(
      applicantId,  // playerId
      applicantId,  // applicantId
      'upload@sumsub.com',  // email
      'id-only'  // levelName
    );
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto
      .createHmac('sha256', config.sumsub.secretKey)
      .update(`${config.sumsub.appToken}${timestamp}`)
      .digest('hex');

    const form = new FormData();
    form.append('file', fileBuffer, {
      filename: fileName,
      contentType: 'application/octet-stream'
    } as FormData.AppendOptions);
    form.append('type', documentType);
    form.append('side', documentSide);

    const formHeaders = form.getHeaders();
    const response = await axios.post(
      `${config.sumsub.baseUrl}/resources/applicants/${applicantId}/info/idDoc`,
      form,
      {
        headers: {
          'Accept': 'application/json',
          'X-App-Token': config.sumsub.appToken,
          'X-App-Access-Sig': signature,
          'X-App-Access-Ts': timestamp.toString(),
          'Authorization': `Bearer ${token}`,
          ...formHeaders
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error uploading document to Sumsub:', error);
    throw error;
  }
};

export const getSumsubApplicantDocuments = async (applicantId: string) => {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const method = 'GET';
    const path = `/resources/applicants/${applicantId}/documents`;
    const url = `${SUMSUB_BASE_URL}${path}`;

    const signature = generateSignature(method, path, '', timestamp);

    const headers = {
      'X-App-Token': SUMSUB_API_KEY!,
      'X-App-Access-Sig': signature,
      'X-App-Access-Ts': timestamp.toString(),
      'Accept': 'application/json'
    };

    const response = await axios.get(url, { headers });

    if (response.status !== 200) {
      throw new Error(`Failed to fetch documents: ${response.status}`);
    }

    return response.data.documents.map((doc: any) => ({
      id: doc.id,
      type: doc.type,
      side: doc.side,
      status: doc.status,
      url: doc.url,
      createdAt: doc.createdAt,
    }));
  } catch (error: any) {
    logger.error('Error fetching Sumsub documents:', error);
    throw new Error(error.response?.data?.description || 'Failed to fetch documents');
  }
};

export const approveSumsubApplicant = async (applicantId: string) => {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const method = 'POST';
    const path = `/resources/applicants/${applicantId}/status/approved`;
    const url = `${SUMSUB_BASE_URL}${path}`;

    const signature = generateSignature(method, path, '', timestamp);

    const headers = {
      'X-App-Token': SUMSUB_API_KEY!,
      'X-App-Access-Sig': signature,
      'X-App-Access-Ts': timestamp.toString(),
      'Accept': 'application/json'
    };

    const response = await axios.post(url, {}, { headers });

    if (response.status !== 200) {
      throw new Error(`Failed to approve applicant: ${response.status}`);
    }

    return response.data;
  } catch (error: any) {
    logger.error('Error approving Sumsub applicant:', error);
    throw new Error(error.response?.data?.description || 'Failed to approve applicant');
  }
};

export const rejectSumsubApplicant = async (applicantId: string) => {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const method = 'POST';
    const path = `/resources/applicants/${applicantId}/status/rejected`;
    const url = `${SUMSUB_BASE_URL}${path}`;

    const signature = generateSignature(method, path, '', timestamp);

    const headers = {
      'X-App-Token': SUMSUB_API_KEY!,
      'X-App-Access-Sig': signature,
      'X-App-Access-Ts': timestamp.toString(),
      'Accept': 'application/json'
    };

    const response = await axios.post(url, {}, { headers });

    if (response.status !== 200) {
      throw new Error(`Failed to reject applicant: ${response.status}`);
    }

    return response.data;
  } catch (error: any) {
    logger.error('Error rejecting Sumsub applicant:', error);
    throw new Error(error.response?.data?.description || 'Failed to reject applicant');
  }
};