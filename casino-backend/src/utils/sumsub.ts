import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import crypto from 'crypto';
import winston from 'winston';
import { config } from '../config';
import FormData from 'form-data';

const SUMSUB_BASE_URL = config.sumsub.baseUrl || 'https://api.sumsub.com';
const SUMSUB_API_KEY = config.sumsub.appToken;
const SUMSUB_SECRET_KEY = config.sumsub.secretKey;
const SUMSUB_WEBHOOK_SECRET = config.sumsub.webhookSecret;

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

export const generateSignature = (
  method: string,
  path: string,
  body: string,
  timestamp: number,
): string => {
  const cleanPath = path.replace(/\/+$/, '');
  const cleanBody = body ? body.trim() : '';
  const signatureData = `${timestamp}${method.toUpperCase()}${cleanPath}${cleanBody}`;
  
  logger.debug('Signature generation details', {
    components: { timestamp, method: method.toUpperCase(), path: cleanPath, body: cleanBody },
    finalSignatureData: signatureData
  });
  
  if (!SUMSUB_SECRET_KEY) {
    throw new Error('SUMSUB_SECRET_KEY is not configured');
  }

  const signature = crypto
    .createHmac('sha256', SUMSUB_SECRET_KEY)
    .update(signatureData)
    .digest('hex');

  return signature;
};

export const generateSumsubAccessToken = async (
  playerId: string,
  applicantId: string,
  email?: string, // Made email optional
  levelName: string = 'id-only',
  retries: number = 3,
  delayMs: number = 1000,
  phone?: string
): Promise<SumsubTokenResponse> => {
  if (!email && !phone) {
    logger.error('No email or phone provided', { playerId });
    throw new Error('No email or phone number provided');
  }

  // Only validate email if it’s provided
  if (email && !validateEmail(email)) {
    logger.error('Invalid email provided', { playerId, email });
    throw new Error('Invalid email address provided');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const method = 'POST';
  const path = '/resources/accessTokens/sdk';
  const url = `${SUMSUB_BASE_URL}${path}`;

  const bodyObj: any = {
    userId: playerId,
    ttlInSecs: 3600,
    levelName,
  };
  if (email) bodyObj.email = email;
  if (phone) bodyObj.phone = phone;
  const body = JSON.stringify(bodyObj);
  const signature = generateSignature(method, path, body, timestamp);

  const headers = {
    'X-App-Token': SUMSUB_API_KEY,
    'X-App-Access-Sig': signature,
    'X-App-Access-Ts': timestamp.toString(),
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  const config: AxiosRequestConfig = {
    headers,
    timeout: 10000,
    transformRequest: [(data) => data],
  };

  logger.info('Attempting to generate Sumsub access token for SDK', {
    playerId,
    applicantId,
    url,
    method,
    requestBody: bodyObj,
  });

  let lastError: any;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.post(url, body, config);
      return {
        token: response.data.token,
        userId: playerId,
      };
    } catch (error: any) {
      lastError = error;
      const axiosError = error as AxiosError<SumsubErrorResponse>;
      logger.error('Sumsub access token generation failed', {
        attempt,
        playerId,
        error: axiosError.message,
        responseStatus: axiosError.response?.status,
        responseData: axiosError.response?.data,
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
  email: string | undefined,
  externalUserId: string,
  phone?: string,
): Promise<string> => {
  const timestamp = Math.floor(Date.now() / 1000);
  const method = 'POST';
  const levelName = 'id-only';
  const path = `/resources/applicants?levelName=${levelName}`;
  const url = `${SUMSUB_BASE_URL}${path}`;

  const bodyObj: any = {
    externalUserId,
    requiredIdDocs: {
      docSets: [{
        idDocSetType: 'IDENTITY',
        types: ['PASSPORT', 'ID_CARD', 'DRIVERS', 'RESIDENCE_PERMIT'],
      }],
    },
  };
  if (email) bodyObj.email = email;
  if (phone) bodyObj.phone = phone;

  const body = JSON.stringify(bodyObj);
  const signature = generateSignature(method, path, body, timestamp);

  const headers = {
    'X-App-Token': SUMSUB_API_KEY,
    'X-App-Access-Sig': signature,
    'X-App-Access-Ts': timestamp.toString(),
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  logger.info('Creating Sumsub applicant', {
    playerId,
    externalUserId,
    email,
    phone,
    signature,
    timestamp,
    bodyObj,
  });

  try {
    const response = await axios.post(url, body, {
      headers,
      timeout: 10000,
      transformRequest: [(data) => data],
      validateStatus: (status) => status < 500
    });

    if (response.status >= 400) {
      throw new Error(`Sumsub API error: ${response.status} - ${JSON.stringify(response.data)}`);
    }

    return response.data.id;
  } catch (error: any) {
    const axiosError = error as AxiosError<SumsubErrorResponse>;
    const errorDescription = axiosError.response?.data?.description || '';
    logger.error('Applicant creation failed', {
      playerId,
      error: axiosError.response?.data || axiosError.message,
      status: axiosError.response?.status,
    });

    const match = /already exists: ([a-z0-9]+)/i.exec(errorDescription);
    if (match) {
      return match[1];
    }

    throw new Error(`Sumsub applicant creation failed: ${errorDescription || axiosError.message}`);
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

  return computedSignature === signature;
};

export const uploadDocumentToSumsub = async (
  applicantId: string,
  fileBuffer: Buffer,
  fileName: string,
  documentType: string = 'IDENTITY',
  documentSide: string = 'FRONT'
) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const method = 'POST';
  const path = `/resources/applicants/${applicantId}/info/idDoc`;
  const url = `${SUMSUB_BASE_URL}${path}`;

  const signature = generateSignature(method, path, '', timestamp);

  const form = new FormData();
  form.append('file', fileBuffer, {
    filename: fileName,
    contentType: 'application/octet-stream'
  } as FormData.AppendOptions);
  form.append('type', documentType);
  form.append('side', documentSide);

  const formHeaders = form.getHeaders();

  const headers = {
    'X-App-Token': SUMSUB_API_KEY,
    'X-App-Access-Sig': signature,
    'X-App-Access-Ts': timestamp.toString(),
    'Accept': 'application/json',
    ...formHeaders
  };

  try {
    const response = await axios.post(url, form, {
      headers,
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });

    return response.data;
  } catch (error: any) {
    const axiosError = error as AxiosError<SumsubErrorResponse>;
    logger.error('Error uploading document to Sumsub', {
      applicantId,
      error: axiosError.response?.data || axiosError.message,
      status: axiosError.response?.status
    });
    throw new Error(axiosError.response?.data?.description || 'Failed to upload document to Sumsub');
  }
};

export const getSumsubApplicantDocuments = async (applicantId: string) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const method = 'GET';
  const path = `/resources/applicants/${applicantId}/one`;
  const url = `${SUMSUB_BASE_URL}${path}`;

  const signature = generateSignature(method, path, '', timestamp);

  const headers = {
    'X-App-Token': SUMSUB_API_KEY,
    'X-App-Access-Sig': signature,
    'X-App-Access-Ts': timestamp.toString(),
    'Accept': 'application/json'
  };

  try {
    const response = await axios.get(url, { headers });
    if (response.status !== 200) {
      throw new Error(`Failed to fetch applicant data: ${response.status}`);
    }

    const idDocs = response.data.idDocs || [];
    const documents = idDocs.map((doc: any) => ({
      id: doc.idDocId,
      type: doc.idDocType,
      side: doc.idDocSubType || 'N/A',
      status: doc.review?.reviewAnswer || 'unknown',
      createdAt: doc.createdAt,
    }));

    return documents;
  } catch (error: any) {
    logger.error('Error fetching Sumsub documents', {
      applicantId,
      error: error.message
    });
    throw error;
  }
};

export const approveSumsubApplicant = async (applicantId: string) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const method = 'POST';
  const path = `/resources/applicants/${applicantId}/status/approved`;
  const url = `${SUMSUB_BASE_URL}${path}`;

  const signature = generateSignature(method, path, '', timestamp);

  const headers = {
    'X-App-Token': SUMSUB_API_KEY,
    'X-App-Access-Sig': signature,
    'X-App-Access-Ts': timestamp.toString(),
    'Accept': 'application/json'
  };

  try {
    const response = await axios.post(url, {}, { headers });

    if (response.status !== 200) {
      throw new Error(`Failed to approve applicant: ${response.status}`);
    }

    return response.data;
  } catch (error: any) {
    const axiosError = error as AxiosError<SumsubErrorResponse>;
    logger.error('Error approving Sumsub applicant', {
      applicantId,
      error: axiosError.response?.data || axiosError.message,
      status: axiosError.response?.status
    });
    throw new Error(axiosError.response?.data?.description || 'Failed to approve applicant');
  }
};

export const rejectSumsubApplicant = async (applicantId: string) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const method = 'POST';
  const path = `/resources/applicants/${applicantId}/status/rejected`;
  const url = `${SUMSUB_BASE_URL}${path}`;

  const signature = generateSignature(method, path, '', timestamp);

  const headers = {
    'X-App-Token': SUMSUB_API_KEY,
    'X-App-Access-Sig': signature,
    'X-App-Access-Ts': timestamp.toString(),
    'Accept': 'application/json'
  };

  try {
    const response = await axios.post(url, {}, { headers });

    if (response.status !== 200) {
      throw new Error(`Failed to reject applicant: ${response.status}`);
    }

    return response.data;
  } catch (error: any) {
    const axiosError = error as AxiosError<SumsubErrorResponse>;
    logger.error('Error rejecting Sumsub applicant', {
      applicantId,
      error: axiosError.response?.data || axiosError.message,
      status: axiosError.response?.status
    });
    throw new Error(axiosError.response?.data?.description || 'Failed to reject applicant');
  }
};

export const generateSumsubWebSDKLink = async (
  playerId: string,
  email: string,
  phone?: string,
  levelName: string = 'id-only',
  ttlInSecs: number = 1800,
  retries: number = 3,
  delayMs: number = 1000,
): Promise<{ url: string }> => {
  if (!validateEmail(email)) {
    logger.error('Invalid email provided', { playerId, email });
    throw new Error('Invalid email address provided');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const method = 'POST';
  const path = '/resources/sdkIntegrations/levels/-/websdkLink';
  const url = `${SUMSUB_BASE_URL}${path}`;

  const bodyObj = {
    levelName,
    userId: playerId,
    applicantIdentifiers: {
      email,
      ...(phone && { phone })
    },
    ttlInSecs
  };

  const body = JSON.stringify(bodyObj);
  const signature = generateSignature(method, path, body, timestamp);

  const headers = {
    'X-App-Token': SUMSUB_API_KEY,
    'X-App-Access-Sig': signature,
    'X-App-Access-Ts': timestamp.toString(),
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  const config: AxiosRequestConfig = {
    headers,
    timeout: 10000,
    transformRequest: [(data) => data],
  };

  let lastError: any;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.post(url, body, config);
      return response.data;
    } catch (error: any) {
      lastError = error;
      const axiosError = error as AxiosError<SumsubErrorResponse>;
      logger.error('Sumsub WebSDK link generation failed', {
        attempt,
        playerId,
        error: axiosError.message,
        responseStatus: axiosError.response?.status,
        responseData: axiosError.response?.data,
      });
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  throw new Error(`Failed to generate Sumsub WebSDK link after ${retries} attempts: ${lastError?.message}`);
};

export const getSumsubSDKState = async (applicantId: string) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const method = 'GET';
  const path = `/resources/sdk/state?full=true&applicantId=${applicantId}`;
  const url = `${SUMSUB_BASE_URL}${path}`;

  const signature = generateSignature(method, path, '', timestamp);

  const headers = {
    'X-App-Token': SUMSUB_API_KEY,
    'X-App-Access-Sig': signature,
    'X-App-Access-Ts': timestamp.toString(),
    'Accept': 'application/json'
  };

  logger.info('Fetching Sumsub SDK state', { applicantId, path, signature, timestamp });

  try {
    const response = await axios.get(url, { headers });

    if (response.status !== 200) {
      throw new Error(`Failed to fetch SDK state: ${response.status}`);
    }

    logger.info('Sumsub SDK state fetched', { applicantId, responseData: response.data });
    return response.data;
  } catch (error: any) {
    const axiosError = error as AxiosError<SumsubErrorResponse>;
    logger.error('Error fetching Sumsub SDK state', {
      applicantId,
      error: axiosError.response?.data || axiosError.message,
      status: axiosError.response?.status
    });
    throw new Error(axiosError.response?.data?.description || 'Failed to fetch SDK state');
  }
};

export const getSumsubDocumentImages = async (
  applicantId: string,
  imageId: string
): Promise<{ buffer: Buffer; contentType: string }> => {
  const timestamp = Math.floor(Date.now() / 1000);
  const method = 'GET';
  const path = `/resources/inspections/${applicantId}/resources/${imageId}`;
  const url = `${SUMSUB_BASE_URL}${path}`;

  const signature = generateSignature(method, path, '', timestamp);

  const headers = {
    'X-App-Token': SUMSUB_API_KEY,
    'X-App-Access-Sig': signature,
    'X-App-Access-Ts': timestamp.toString(),
    'Accept': '*/*'
  };

  try {
    const response = await axios.get(url, {
      headers,
      responseType: 'arraybuffer'
    });

    return {
      buffer: Buffer.from(response.data),
      contentType: response.headers['content-type'] || 'application/octet-stream'
    };
  } catch (error: any) {
    const axiosError = error as AxiosError<SumsubErrorResponse>;
    logger.error('Error fetching document image from Sumsub', {
      applicantId,
      imageId,
      error: axiosError.message,
      status: axiosError.response?.status
    });
    throw new Error(axiosError.response?.data?.description || 'Failed to fetch document image from Sumsub');
  }
};

export const getApplicantReviewId = async (applicantId: string): Promise<string> => {
  const timestamp = Math.floor(Date.now() / 1000);
  const method = 'GET';
  const path = `/resources/applicants/${applicantId}/one`;
  const url = `${SUMSUB_BASE_URL}${path}`;

  const signature = generateSignature(method, path, '', timestamp);

  const headers = {
    'X-App-Token': SUMSUB_API_KEY,
    'X-App-Access-Sig': signature,
    'X-App-Access-Ts': timestamp.toString(),
    'Accept': 'application/json'
  };

  try {
    const response = await axios.get(url, { headers });
    if (response.status !== 200) {
      throw new Error(`Failed to fetch applicant data: ${response.status}`);
    }
    const review = response.data.review;
    if (!review || !review.reviewId) {
      throw new Error('No review found for applicant');
    }
    return review.reviewId;
  } catch (error: any) {
    logger.error('Error fetching applicant review ID', { applicantId, error: error.message });
    throw error;
  }
};