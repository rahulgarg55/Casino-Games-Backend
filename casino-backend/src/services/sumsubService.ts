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

export const initiateSumsubVerification = async (playerId: string) => {
  let player = await Player.findById(playerId);
  if (!player) {
    logger.error('Player not found', { playerId });
    throw new Error('Player not found');
  }
  if (!player.email) {
    logger.error('Player email is required for Sumsub verification', { playerId });
    throw new Error('Player email is required for Sumsub verification');
  }

  const externalUserId = playerId;

  if (!player.sumsub_id) {
    try {
      const applicantId = await createSumsubApplicant(
        playerId,
        player.email,
        externalUserId,
        player.phone_number
      );
      player.sumsub_id = applicantId;
      player.sumsub_status = 'not_started';
      await player.save();
      logger.info('Sumsub applicant created and player updated', { playerId, applicantId });
    } catch (error: any) {
      const match = /already exists: ([a-z0-9]+)/i.exec(error.message);
      if (match) {
        player.sumsub_id = match[1];
        player.sumsub_status = 'not_started';
        await player.save();
        logger.info('Sumsub applicant already exists, updated player', { playerId, sumsubId: match[1] });
      } else {
        logger.error('Sumsub applicant creation error', { playerId, error: error.message });
        throw error;
      }
    }
  }

  player = await Player.findById(playerId);
  if (!player?.sumsub_id) {
    logger.error('Sumsub applicantId could not be determined for player', { playerId });
    throw new Error('Sumsub applicantId could not be determined');
  }

  logger.info('Generating Sumsub access token', {
    playerId,
    sumsubId: player.sumsub_id,
    email: player.email,
    externalUserId,
  });

  try {
    return await generateSumsubAccessToken(
      playerId,
      player.sumsub_id,
      player.email,
      'id-only'
    );
  } catch (error: any) {
    logger.error('Failed to generate access token', {
      playerId,
      sumsubId: player.sumsub_id,
      error: error.message
    });
    throw error;
  }
};

export const updateSumsubStatus = async (
  playerId: string,
  sumsubStatus: 'not_started' | 'in_review' | 'approved_sumsub' | 'rejected_sumsub',
  sumsubNotes?: string,
  details: { documents?: string[]; nextSteps?: string[] } = {}
) => {
  const player = await Player.findById(playerId);
  if (!player) {
    logger.error('Player not found for Sumsub status update', { playerId });
    throw new Error('Player not found');
  }

  player.sumsub_status = sumsubStatus;
  player.sumsub_notes = sumsubNotes || player.sumsub_notes;
  player.sumsub_verification_date = new Date();
  player.sumsub_details = { ...player.sumsub_details, ...details };

  await player.save();
  logger.info('Player Sumsub status updated', { playerId, sumsubStatus, sumsubNotes, details });

  const notification = new Notification({
    type: NotificationType.KYC_UPDATE,
    message: `KYC documents submitted by user ${player.username || player.email} are under review`,
    user_id: null,
    metadata: { sumsub_id: player.sumsub_id, sumsubStatus, sumsubNotes, ...details },
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
    metadata: { sumsub_id: player.sumsub_id, adminStatus, adminNotes, ...details },
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
      status: result.status
    });

    return result;
  } catch (error: any) {
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
    let details: { documents?: string[]; nextSteps?: string[] } = {};

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

export const getSumsubApplicantDocuments = async (applicantId: string) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const method = 'GET';
  const path = `/resources/applicants/${applicantId}/metadata/resources`;
  const url = `${config.sumsub.baseUrl}${path}`;

  const signature = generateSignature(method, path, '', timestamp);

  const headers = {
    'X-App-Token': config.sumsub.appToken,
    'X-App-Access-Sig': signature,
    'X-App-Access-Ts': timestamp.toString(),
    'Accept': 'application/json'
  };

  try {
    const response = await axios.get(url, { headers });

    if (response.status !== 200) {
      throw new Error(`Failed to fetch documents: ${response.status}`);
    }

    const documents = response.data.items.map((doc: any) => ({
      id: doc.id,
      type: doc.idDocDef.idDocType,
      side: doc.idDocDef.idDocSubType || 'N/A',
      status: doc.reviewResult?.reviewAnswer || 'unknown',
      createdAt: doc.addedDate,
    }));

    return documents;
  } catch (error: any) {
    const axiosError = error as AxiosError<SumsubErrorResponse>;
    logger.error('Error fetching Sumsub documents', {
      applicantId,
      error: axiosError.response?.data || axiosError.message,
      status: axiosError.response?.status
    });
    throw new Error(axiosError.response?.data?.description || 'Failed to fetch documents');
  }
};

export const getSumsubDocumentImages = async (
  applicantId: string,
  imageId: string
): Promise<{ buffer: Buffer; contentType: string }> => {
  const timestamp = Math.floor(Date.now() / 1000);
  const method = 'GET';
  const path = `/resources/inspections/${applicantId}/resources/${imageId}`;
  const url = `${config.sumsub.baseUrl}${path}`;

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

    return {
      buffer: Buffer.from(response.data),
      contentType: response.headers['content-type'] || 'application/octet-stream'
    };
  } catch (error: any) {
    logger.error('Error fetching document image from Sumsub', {
      applicantId,
      imageId,
      error: error.message
    });
    throw error;
  }
};