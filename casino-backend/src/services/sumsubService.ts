import {
  generateSumsubAccessToken,
  createSumsubApplicant,
  uploadDocumentToSumsub as uploadToSumsub,
} from '../utils/sumsub';
import Player from '../models/player';
import { VERIFICATION } from '../constants';
import Notification, { NotificationType } from '../models/notification';
import winston from 'winston';
import { Express } from 'express';
import axios, { AxiosError } from 'axios';
import { config } from '../config';
import { generateSignature } from '../utils/sumsub';
import { SumsubErrorResponse } from '../types/sumsub';

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

interface SumsubDocument {
  id: string;
  type: string;
  side: string;
  status: string;
  fileName: string;
  createdAt: string;
  previewId: string;
  inspectionId: string;
  country?: string;
  fileType?: string;
  fileSize?: number;
  resolution?: {
    width: number;
    height: number;
  };
  reviewResult?: {
    moderationComment?: string;
    clientComment?: string;
    reviewAnswer: string;
    rejectLabels?: string[];
    reviewRejectType?: string;
    buttonIds?: string[];
  };
  source?: string;
  deactivated?: boolean;
}

export const initiateSumsubVerification = async (playerId: string) => {
  let player = await Player.findById(playerId);
  if (!player) {
    logger.error('Player not found', { playerId });
    throw new Error('Player not found');
  }
  if (!player.email && !player.phone_number) {
    logger.error('Player email or phone number is required for Sumsub verification', { playerId });
    throw new Error('Player email or phone number is required for Sumsub verification');
  }
  if (player.sumsub_attempts <= 0) {
    logger.error('No verification attempts remaining', { playerId });
    throw new Error('No verification attempts remaining');
  }

  const externalUserId = playerId;

  if (!player.sumsub_id) {
    try {
      const applicantId = await createSumsubApplicant(
        playerId,
        player.email || undefined,
        externalUserId,
        player.phone_number || undefined
      );
      player.sumsub_id = applicantId;
      player.sumsub_status = 'not_started';
      await player.save();
      logger.info('Sumsub applicant created and player updated', { playerId, applicantId, attempts: player.sumsub_attempts });
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        const match = /already exists: ([a-z0-9]+)/i.exec(error.message);
        if (match) {
          player.sumsub_id = match[1];
          player.sumsub_status = 'not_started';
          await player.save();
          logger.info('Sumsub applicant already exists, updated player', { playerId, sumsubId: match[1], attempts: player.sumsub_attempts });
        } else {
          logger.error('Sumsub applicant creation error', { playerId, error: error.message });
          throw error;
        }
      } else if (error.message.includes('duplicate documents')) {
        player.sumsub_status = 'rejected_sumsub';
        player.sumsub_notes = 'Duplicate documents detected';
        await player.save();
        logger.error('Duplicate documents detected during applicant creation', { playerId, attempts: player.sumsub_attempts });
        throw new Error('Duplicate documents detected');
      } else {
        logger.error('Sumsub applicant creation error', { playerId, error: error.message });
        throw error;
      }
    }
  }
  // Do NOT decrement attempts here! Attempts are only decremented in updateSumsubStatus when status transitions to 'in_review'.

  player = await Player.findById(playerId);
  if (!player?.sumsub_id) {
    logger.error('Sumsub applicantId could not be determined for player', { playerId });
    throw new Error('Sumsub applicantId could not be determined');
  }

  logger.info('Generating Sumsub access token', {
    playerId,
    sumsubId: player.sumsub_id,
    email: player.email,
    phone_number: player.phone_number,
    externalUserId,
  });

  return generateSumsubAccessToken(playerId, player.sumsub_id, player.email || '', 'id-only');
};

export const updateSumsubStatus = async (
  playerId: string,
  sumsubStatus: 'not_started' | 'in_review' | 'approved_sumsub' | 'rejected_sumsub',
  sumsubNotes?: string,
  details: { documents?: string[]; nextSteps?: string[]; inspectionId?: string } = {}
) => {
  const player = await Player.findById(playerId);
  if (!player) {
    logger.error('Player not found for Sumsub status update', { playerId });
    throw new Error('Player not found');
  }

  const previousStatus = player.sumsub_status;
  player.sumsub_status = sumsubStatus;
  player.sumsub_notes = sumsubNotes || player.sumsub_notes;
  player.sumsub_verification_date = new Date();
  player.sumsub_details = { ...player.sumsub_details, ...details };

  // Only decrement attempts when status transitions to 'in_review' (i.e., after real document submission)
  if (sumsubStatus === 'in_review' && previousStatus !== 'in_review') {
    if (player.sumsub_attempts > 0) {
      player.sumsub_attempts -= 1;
      player.sumsub_last_attempt_date = new Date();
    }
  }

  if (details.inspectionId && !player.sumsub_inspection_id) {
    player.sumsub_inspection_id = details.inspectionId;
    logger.info('Stored inspection ID for player', { playerId, inspectionId: details.inspectionId });
  }

  await player.save();
  logger.info('Player Sumsub status updated', { playerId, sumsubStatus, sumsubNotes, details, attempts: player.sumsub_attempts });

  const notification = new Notification({
    type: NotificationType.KYC_UPDATE,
    message: `KYC documents submitted by user ${player.username || player.email} are under review`,
    user_id: null,
    metadata: { sumsub_id: player.sumsub_id, sumsubStatus, sumsubNotes, attempts: player.sumsub_attempts, ...details },
  });
  await notification.save();

  logger.info('Admin notification created for KYC submission', { playerId, sumsubStatus });
  return player;
};

export const updateAdminStatus = async (
  playerId: string,
  adminStatus: 'approved' | 'rejected',
  adminNotes: string,
  details: { documents?: string[]; nextSteps?: string[] } = {}
) => {
  const player = await Player.findById(playerId);
  if (!player) {
    logger.error('Player not found for admin status update', { playerId });
    throw new Error('Player not found');
  }

  player.admin_status = adminStatus;
  player.admin_notes = adminNotes;
  player.sumsub_verification_date = new Date();
  player.is_verified = adminStatus === 'approved' ? VERIFICATION.VERIFIED : VERIFICATION.UNVERIFIED;
  player.sumsub_details = { ...player.sumsub_details, ...details };

  await player.save();
  logger.info('Player admin status updated', { playerId, adminStatus, adminNotes, details });

  const notification = new Notification({
    type: NotificationType.KYC_UPDATE,
    message: `KYC status updated to ${adminStatus} for user ${player.username || player.email}`,
    user_id: player._id,
    metadata: { sumsub_id: player.sumsub_id, adminStatus, adminNotes, attempts: player.sumsub_attempts, ...details },
  });
  await notification.save();

  logger.info('Player notification created for KYC status update', { playerId, adminStatus });
  return player;
};

export const uploadDocumentToSumsub = async (
  applicantId: string,
  file: Express.Multer.File,
  documentType: string = 'IDENTITY',
  documentSide: string = 'FRONT'
) => {
  try {
    logger.info('Uploading document to Sumsub', {
      applicantId,
      documentType,
      documentSide,
      fileName: file.originalname
    });

    const result = await uploadToSumsub(
      applicantId,
      file.buffer,
      file.originalname,
      documentType,
      documentSide
    );

    logger.info('Document uploaded successfully', {
      applicantId,
      documentId: result.idDocId,
      status: result.status,
      inspectionId: result.inspectionId
    });

    return result;
  } catch (error: any) {
    if (error.message.includes('duplicate documents')) {
      const player = await Player.findOne({ sumsub_id: applicantId });
      if (player) {
        player.sumsub_status = 'rejected_sumsub';
        player.sumsub_notes = 'Duplicate documents detected';
        player.sumsub_attempts = player.sumsub_attempts > 0 ? player.sumsub_attempts - 1 : 0;
        player.sumsub_last_attempt_date = new Date();
        await player.save();
        logger.error('Duplicate documents detected during upload', { applicantId, attempts: player.sumsub_attempts });
      }
      throw new Error('Duplicate documents detected');
    }
    logger.error('Failed to upload document to Sumsub', {
      applicantId,
      error: error.message
    });
    throw error;
  }
};

export const getSumsubApplicantStatus = async (applicantId: string) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const method = 'GET';
  const path = `/resources/applicants/${applicantId}/status`;
  const url = `${config.sumsub.baseUrl}${path}`;

  const signature = generateSignature(method, path, '', timestamp);

  const headers = {
    'X-App-Token': config.sumsub.appToken,
    'X-App-Access-Sig': signature,
    'X-App-Access-Ts': timestamp.toString(),
    'Accept': 'application/json'
  };

  logger.info('Fetching Sumsub applicant status', { applicantId, path, signature, timestamp });

  try {
    const response = await axios.get(url, { headers });

    if (response.status !== 200) {
      throw new Error(`Failed to fetch applicant status: ${response.status}`);
    }

    const { reviewStatus, reviewResult } = response.data;
    let sumsubStatus: 'not_started' | 'in_review' | 'approved_sumsub' | 'rejected_sumsub';
    let sumsubNotes: string | undefined;
    let details: { documents?: string[]; nextSteps?: string[]; inspectionId?: string } = {};

    switch (reviewStatus) {
      case 'init':
        sumsubStatus = 'not_started';
        break;
      case 'pending':
        sumsubStatus = 'in_review';
        break;
      case 'completed':
        sumsubStatus = reviewResult?.reviewAnswer === 'GREEN' ? 'approved_sumsub' : 'rejected_sumsub';
        if (reviewResult?.reviewAnswer !== 'GREEN') {
          sumsubNotes = reviewResult?.rejectLabels?.join(', ') || 'Review failed';
          if (sumsubNotes.includes('duplicate')) {
            sumsubNotes = 'Duplicate documents detected';
          }
          details.nextSteps = [
            'Review the rejection reasons',
            'Correct any issues with your documents',
            'Resubmit your verification'
          ];
        }
        break;
      default:
        sumsubStatus = 'not_started';
    }

    try {
      const documents = await getSumsubApplicantDocuments(applicantId);
      details.documents = documents.map((doc: any) => doc.id);
      
      if (documents.length > 0 && documents[0].inspectionId) {
        details.inspectionId = documents[0].inspectionId;
        logger.info('Captured inspection ID from documents', { 
          applicantId, 
          inspectionId: details.inspectionId 
        });
      }
    } catch (error: any) {
      logger.warn('Failed to fetch document details', { applicantId, error: error.message });
    }

    logger.info('Sumsub applicant status fetched', { applicantId, sumsubStatus, sumsubNotes, details });

    return {
      sumsubStatus,
      sumsubNotes,
      details,
      lastUpdated: response.data.createdAt ? new Date(response.data.createdAt) : undefined
    };
  } catch (error: any) {
    const axiosError = error as AxiosError<SumsubErrorResponse>;
    logger.error('Error fetching Sumsub applicant status', {
      applicantId,
      error: axiosError.response?.data || axiosError.message,
      status: axiosError.response?.status
    });
    throw new Error(axiosError.response?.data?.description || 'Failed to fetch applicant status');
  }
};

export const getSumsubSDKState = async (applicantId: string) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const method = 'GET';
  const path = `/resources/sdk/state?full=true&externalUserId=${applicantId}`;
  const url = `${config.sumsub.baseUrl}${path}`;

  console.log('Fetching Sumsub SDK state:', { applicantId, url });

  const signature = generateSignature(method, path, '', timestamp);

  const headers = {
    'X-App-Token': config.sumsub.appToken,
    'X-App-Access-Sig': signature,
    'X-App-Access-Ts': timestamp.toString(),
    'Accept': 'application/json'
  };

  try {
    console.log('Sending request to Sumsub for SDK state');
    const response = await axios.get(url, { headers });
    console.log('Received SDK state response:', {
      status: response.status,
      hasStep: !!response.data.step,
      hasDocumentStatus: !!response.data.step?.documentStatus,
      inspectionId: response.data.step?.documentStatus?.attemptId
    });

    const inspectionId = response.data.step?.documentStatus?.attemptId;
    if (inspectionId) {
      try {
        const player = await Player.findOne({ sumsub_id: applicantId });
        if (player && !player.sumsub_inspection_id) {
          player.sumsub_inspection_id = inspectionId;
          await player.save();
          logger.info('Updated player with inspection ID from SDK state', { 
            applicantId, 
            playerId: player._id, 
            inspectionId 
          });
        }
      } catch (error: any) {
        logger.warn('Failed to update player with inspection ID', { 
          applicantId, 
          inspectionId, 
          error: error.message 
        });
      }
    }

    return response.data;
  } catch (error: any) {
    console.error('Error in getSumsubSDKState:', error);
    logger.error('Error fetching Sumsub SDK state', {
      applicantId,
      error: error.message
    });
    throw error;
  }
};

export const getSumsubApplicantDocuments = async (applicantId: string): Promise<SumsubDocument[]> => {
  const timestamp = Math.floor(Date.now() / 1000);
  const method = 'GET';
  const path = `/resources/applicants/${applicantId}/metadata/resources`;
  const url = `${config.sumsub.baseUrl}${path}`;

  console.log('Getting Sumsub applicant documents');
  console.log('Preparing request:', {
    url,
    timestamp
  });

  const signature = generateSignature(method, path, '', timestamp);

  const headers = {
    'X-App-Token': config.sumsub.appToken,
    'X-App-Access-Sig': signature,
    'X-App-Access-Ts': timestamp.toString(),
    'Accept': 'application/json'
  };

  try {
    console.log('Sending request to Sumsub for documents');
    const response = await axios.get(url, { headers });

    console.log('Received response from Sumsub:', {
      status: response.status,
      hasDocuments: response.data?.items?.length > 0
    });

    if (!response.data?.items || !Array.isArray(response.data.items)) {
      console.log('No documents found in response');
      return [];
    }

    const documents = response.data.items.map((doc: any) => ({
      id: doc.id,
      type: doc.idDocDef?.idDocType || 'UNKNOWN',
      side: doc.idDocDef?.idDocSubType || 'UNKNOWN',
      status: doc.reviewResult?.reviewAnswer || 'UNKNOWN',
      fileName: doc.fileMetadata?.fileName || 'unknown',
      createdAt: doc.addedDate,
      previewId: doc.previewId,
      inspectionId: doc.attemptId,
      country: doc.idDocDef?.country,
      fileType: doc.fileMetadata?.fileType,
      fileSize: doc.fileMetadata?.fileSize,
      resolution: doc.fileMetadata?.resolution,
      reviewResult: doc.reviewResult,
      source: doc.source,
      deactivated: doc.deactivated
    }));

    if (documents.length > 0 && documents[0].inspectionId) {
      try {
        const player = await Player.findOne({ sumsub_id: applicantId });
        if (player && !player.sumsub_inspection_id) {
          player.sumsub_inspection_id = documents[0].inspectionId;
          await player.save();
          logger.info('Updated player with inspection ID from documents', { 
            applicantId, 
            playerId: player._id, 
            inspectionId: documents[0].inspectionId 
          });
        }
      } catch (error: any) {
        logger.warn('Failed to update player with inspection ID from documents', { 
          applicantId, 
          inspectionId: documents[0].inspectionId, 
          error: error.message 
        });
      }
    }

    return documents;
  } catch (error: any) {
    console.error('Error in getSumsubApplicantDocuments:', error);
    logger.error('Error fetching Sumsub documents', {
      applicantId,
      error: error.message
    });
    throw error;
  }
};

export const getSumsubDocumentImages = async (
  applicantId: string,
  documentId: string,
  inspectionId: string
): Promise<{ buffer: Buffer; contentType: string }> => {
  const timestamp = Math.floor(Date.now() / 1000);
  const method = 'GET';
  const path = `/resources/applicants/${applicantId}/info/idDoc/${documentId}/content?inspectionId=${inspectionId}`;
  const url = `${config.sumsub.baseUrl}${path}`;

  logger.info('Fetching Sumsub document image', { url, applicantId, documentId, inspectionId });

  const signature = generateSignature(method, path, '', timestamp);

  const headers = {
    'X-App-Token': config.sumsub.appToken,
    'X-App-Access-Sig': signature,
    'X-App-Access-Ts': timestamp.toString(),
    'Accept': '*/*'
  };

  try {
    const response = await axios.get(url, {
      headers,
      responseType: 'arraybuffer'
    });

    logger.info('Successfully fetched image', {
      status: response.status,
      contentType: response.headers['content-type'],
      size: response.data.byteLength
    });

    return {
      buffer: Buffer.from(response.data),
      contentType: response.headers['content-type'] || 'image/jpeg'
    };
  } catch (error: any) {
    if (error.response && error.response.status === 404) {
      logger.error('Sumsub returned 404 for document image', {
        url,
        status: error.response.status,
        headers: error.response.headers,
        data: error.response.data
      });
    }
    logger.error('Error fetching document image from Sumsub', {
      applicantId,
      documentId,
      inspectionId,
      error: error.message,
      status: error.response?.status,
      responseData: error.response?.data
    });
    throw error;
  }
};

export const captureInspectionId = async (applicantId: string): Promise<string | null> => {
  try {
    logger.info('Attempting to capture inspection ID', { applicantId });
    
    const documents = await getSumsubApplicantDocuments(applicantId);
    if (documents.length > 0 && documents[0].inspectionId) {
      logger.info('Found inspection ID from documents', { 
        applicantId, 
        inspectionId: documents[0].inspectionId 
      });
      return documents[0].inspectionId;
    }

    const sdkState = await getSumsubSDKState(applicantId);
    const inspectionId = sdkState.step?.documentStatus?.attemptId;
    if (inspectionId) {
      logger.info('Found inspection ID from SDK state', { 
        applicantId, 
        inspectionId 
      });
      return inspectionId;
    }

    logger.warn('No inspection ID found for applicant', { applicantId });
    return null;
  } catch (error: any) {
    logger.error('Error capturing inspection ID', { 
      applicantId, 
      error: error.message 
    });
    return null;
  }
};

export const getSumsubDocumentImage = async (
  applicantId: string,
  documentId: string
): Promise<{ buffer: Buffer; contentType: string }> => {
  const timestamp = Math.floor(Date.now() / 1000);
  const method = 'GET';
  const path = `/resources/applicants/${applicantId}/info/idDoc/${documentId}/image`;
  const url = `${config.sumsub.baseUrl}${path}`;

  console.log('Fetching document image:', { applicantId, documentId, url });

  const signature = generateSignature(method, path, '', timestamp);

  const headers = {
    'X-App-Token': config.sumsub.appToken,
    'X-App-Access-Sig': signature,
    'X-App-Access-Ts': timestamp.toString(),
    'Accept': '*/*'
  };

  try {
    const response = await axios.get(url, {
      headers,
      responseType: 'arraybuffer'
    });

    console.log('Successfully fetched image:', {
      status: response.status,
      contentType: response.headers['content-type'],
      size: response.data.byteLength
    });

    return {
      buffer: Buffer.from(response.data),
      contentType: response.headers['content-type'] || 'image/jpeg'
    };
  } catch (error: any) {
    console.error('Error fetching document image:', error.response?.data || error.message);
    logger.error('Error fetching document image from Sumsub', {
      applicantId,
      documentId,
      error: error.message,
      status: error.response?.status,
      responseData: error.response?.data
    });
    throw error;
  }
};

export const getSumsubInspectionImage = async (
  applicantId: string,
  inspectionId: string,
  imageId: string
): Promise<{ buffer: Buffer; contentType: string }> => {
  const timestamp = Math.floor(Date.now() / 1000);
  const method = 'GET';
  const path = `/resources/applicants/${applicantId}/info/inspections/${inspectionId}/images/${imageId}`;
  const url = `${config.sumsub.baseUrl}${path}`;

  console.log('Fetching inspection image:', { applicantId, inspectionId, imageId, url });

  const signature = generateSignature(method, path, '', timestamp);

  const headers = {
    'X-App-Token': config.sumsub.appToken,
    'X-App-Access-Sig': signature,
    'X-App-Access-Ts': timestamp.toString(),
    'Accept': '*/*'
  };

  try {
    const response = await axios.get(url, {
      headers,
      responseType: 'arraybuffer'
    });

    console.log('Successfully fetched inspection image:', {
      status: response.status,
      contentType: response.headers['content-type'],
      size: response.data.byteLength
    });

    return {
      buffer: Buffer.from(response.data),
      contentType: response.headers['content-type'] || 'image/jpeg'
    };
  } catch (error: any) {
    console.error('Error fetching inspection image:', error.response?.data || error.message);
    logger.error('Error fetching inspection image from Sumsub', {
      applicantId,
      inspectionId,
      imageId,
      error: error.message,
      status: error.response?.status,
      responseData: error.response?.data
    });
    throw error;
  }
};