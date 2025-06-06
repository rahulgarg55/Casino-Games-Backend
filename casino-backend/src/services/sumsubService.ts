import {
  generateSumsubAccessToken,
  createSumsubApplicant,
  uploadDocumentToSumsub as uploadToSumsub,
  getSumsubApplicantDocuments,
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
      player.sumsub_status = 'pending';
      await player.save();
      logger.info('Sumsub applicant created and player updated', { playerId, applicantId });
    } catch (error: any) {
      const match = /already exists: ([a-z0-9]+)/i.exec(error.message);
      if (match) {
        player.sumsub_id = match[1];
        player.sumsub_status = 'pending';
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
  status: 'pending' | 'approved' | 'rejected' | 'duplicate_documents',
  details: { reason?: string; documents?: string[]; nextSteps?: string[] } = {}
) => {
  const player = await Player.findById(playerId);
  if (!player) {
    logger.error('Player not found for Sumsub status update', { playerId });
    throw new Error('Player not found');
  }

  player.sumsub_status = status;
  player.sumsub_verification_date = new Date();

  if (status === 'approved') {
    player.is_verified = VERIFICATION.VERIFIED;
  } else if (status === 'rejected' || status === 'duplicate_documents') {
    player.is_verified = VERIFICATION.UNVERIFIED;
  }

  await player.save();
  logger.info('Player Sumsub status updated', { playerId, status, details });

  const notification = new Notification({
    type: NotificationType.KYC_UPDATE,
    message: `KYC status updated to ${status} for user ${player.username || player.email}`,
    user_id: player._id,
    metadata: { sumsub_id: player.sumsub_id, status, ...details },
  });
  await notification.save();

  logger.info('Notification created for KYC status update', { playerId, status, details });
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
    let status: 'not_started' | 'pending' | 'approved' | 'rejected' | 'duplicate_documents';
    let message: string | undefined;
    let details: { reason?: string; documents?: string[]; nextSteps?: string[] } = {};

    switch (reviewStatus) {
      case 'init':
        status = 'not_started';
        message = 'Verification not started';
        break;
      case 'pending':
        status = 'pending';
        message = 'Verification is under review';
        break;
      case 'completed':
        status = reviewResult?.reviewAnswer === 'GREEN' ? 'approved' : 'rejected';
        message = reviewResult?.reviewAnswer === 'GREEN' 
          ? 'Verification approved'
          : 'Verification rejected';
        if (reviewResult?.reviewAnswer !== 'GREEN') {
          details = {
            reason: reviewResult?.rejectLabels?.join(', ') || 'Review failed',
            nextSteps: [
              'Review the rejection reasons',
              'Correct any issues with your documents',
              'Resubmit your verification'
            ]
          };
        }
        break;
      default:
        status = 'not_started';
        message = 'Unknown verification status';
    }

    // Check for duplicate documents in rejection reasons
    if (reviewResult?.rejectLabels?.some((label: string) => 
      label.toLowerCase().includes('duplicate') || label.toLowerCase().includes('already submitted')
    )) {
      status = 'duplicate_documents';
      message = 'Documents have been submitted on another profile';
      details = {
        reason: 'Duplicate documents detected',
        nextSteps: [
          'Verify your account details',
          'Contact support if you believe this is an error',
          'Submit unique, valid documents'
        ]
      };
    }

    // Fetch document details if available
    try {
      const documents = await getSumsubApplicantDocuments(applicantId);
      details.documents = documents.map((doc: any) => doc.id);
    } catch (error: any) {
      logger.warn('Failed to fetch document details', { applicantId, error: error.message });
    }

    logger.info('Sumsub applicant status fetched', { applicantId, status, message, details });

    return {
      status,
      message,
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