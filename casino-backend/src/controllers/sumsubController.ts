import { Request, Response } from 'express';
import { validateWebhookSignature, generateSumsubWebSDKLink } from '../utils/sumsub';
import { sendErrorResponse } from './authController';
import {
  initiateSumsubVerification,
  updateSumsubStatus,
  uploadDocumentToSumsub,
  getSumsubApplicantStatus,
} from '../services/sumsubService';
import Player from '../models/player';
import winston from 'winston';

interface CustomRequest extends Request {
  user?: {
    id: string;
    role: number;
    email?: string;
  };
  file?: Express.Multer.File;
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

export const startSumsubVerification = async (
  req: CustomRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      logger.error('Authentication required', { user: req.user });
      return sendErrorResponse(res, 401, (req as any).__('AUTHENTICATION_REQUIRED'));
    }

    logger.info('Initiating Sumsub verification', { userId: req.user.id });
    const tokenResponse = await initiateSumsubVerification(req.user.id);

    logger.info('Verification started', { userId: req.user.id, token: tokenResponse.token });
    res.status(200).json({
      success: true,
      message: (req as any).__('SUB_VERIFICATION'),
      data: {
        accessToken: tokenResponse.token,
        externalUserId: tokenResponse.userId,
      },
    });
  } catch (error: any) {
    logger.error('Verification error', {
      userId: req.user?.id,
      error: error.message,
    });
    sendErrorResponse(
      res,
      400,
      error.message || (req as any).__('FAILED_SUB_VERIFICATION')
    );
  }
};

export const startSumsubVerificationWithLink = async (
  req: CustomRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      logger.error('Authentication required', { user: req.user });
      return sendErrorResponse(res, 401, (req as any).__('AUTHENTICATION_REQUIRED'));
    }

    logger.info('Initiating Sumsub verification with WebSDK link', { userId: req.user.id });
    
    const player = await Player.findById(req.user.id);
    if (!player) {
      logger.error('Player not found', { userId: req.user.id });
      return sendErrorResponse(res, 404, (req as any).__('PLAYER_NOT_FOUND'));
    }

    if (!player.email) {
      logger.error('Player email is required for Sumsub verification', { userId: req.user.id });
      return sendErrorResponse(res, 400, (req as any).__('EMAIL_REQUIRED'));
    }

    const { url } = await generateSumsubWebSDKLink(
      req.user.id,
      player.email,
      player.phone_number
    );

    logger.info('Verification link generated', { userId: req.user.id, url });
    
    res.status(200).json({
      success: true,
      message: (req as any).__('SUB_VERIFICATION'),
      data: {
        verificationUrl: url,
        externalUserId: req.user.id,
      },
    });
  } catch (error: any) {
    logger.error('Verification link generation error', {
      userId: req.user?.id,
      error: error.message,
    });
    sendErrorResponse(
      res,
      400,
      error.message || (req as any).__('FAILED_SUB_VERIFICATION')
    );
  }
};

export const sumsubWebhook = async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-sumsub-signature'] as string;
    if (!signature) {
      logger.warn('Missing webhook signature', { headers: req.headers });
      return res.status(400).json({
        success: false,
        error: (req as any).__('MISSING_WEBHOOK_SIGNATURE'),
      });
    }

    if (!validateWebhookSignature(req.body, signature)) {
      logger.warn('Invalid webhook signature', { signature, body: req.body.toString() });
      return res.status(401).json({
        success: false,
        error: (req as any).__('INVALID_WEBHOOK_SIGNATURE'),
      });
    }

    const { applicantId, type, reviewResult } = req.body;
    logger.debug('Webhook payload', { applicantId, type, reviewResult });

    if (!applicantId || !type) {
      logger.warn('Invalid webhook payload', { applicantId, type });
      return res.status(400).json({
        success: false,
        error: (req as any).__('INVALID_WEBHOOK_PAYLOAD'),
      });
    }

    const player = await Player.findOne({ sumsub_id: applicantId });
    if (!player) {
      logger.warn('Player not found', { applicantId });
      return res.status(404).json({
        success: false,
        error: (req as any).__('PLAYER_NOT_FOUND'),
      });
    }

    let status: 'pending' | 'approved' | 'rejected' | 'duplicate_documents';
    let details: { reason?: string; documents?: string[]; nextSteps?: string[] } = {};

    switch (type) {
      case 'applicantPending':
        status = 'pending';
        break;
      case 'applicantReviewed':
        status = reviewResult?.reviewAnswer === 'GREEN' ? 'approved' : 'rejected';
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
        logger.info('Unhandled webhook type', { type });
        return res.status(200).json({
          success: true,
          message: (req as any).__('WEBHOOK_PROCESSED'),
        });
    }

    await updateSumsubStatus(player._id.toString(), status, details);
    logger.info('Status updated', { playerId: player._id, status, details });

    res.status(200).json({
      success: true,
      message: (req as any).__('WEBHOOK_PROCESSED'),
    });
  } catch (error: any) {
    logger.error('Webhook processing error', {
      error: error.message,
      body: req.body.toString(),
    });
    res.status(500).json({
      success: false,
      error: error.message || (req as any).__('FAILED_WEBHOOK'),
    });
  }
};

export const getSumsubStatus = async (req: CustomRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      logger.error('Authentication required', { user: req.user });
      return sendErrorResponse(res, 401, (req as any).__('AUTHENTICATION_REQUIRED'));
    }

    const player = await Player.findById(req.user.id);
    if (!player) {
      logger.warn('Player not found', { userId: req.user.id });
      return sendErrorResponse(res, 404, (req as any).__('PLAYER_NOT_FOUND'));
    }

    let status: 'not_started' | 'pending' | 'approved' | 'rejected' | 'duplicate_documents' = player.sumsub_status || 'not_started';
    let message: string | undefined = undefined;
    let lastUpdated: Date | undefined = player.sumsub_verification_date;
    let details: { reason?: string; documents?: string[]; nextSteps?: string[] } = {};

    // If player has a sumsub_id, fetch detailed status from Sumsub
    if (player.sumsub_id) {
      try {
        const sumsubStatus = await getSumsubApplicantStatus(player.sumsub_id);
        status = sumsubStatus.status;
        message = sumsubStatus.message;
        details = sumsubStatus.details || {};
        lastUpdated = sumsubStatus.lastUpdated || player.sumsub_verification_date;

        // Update player record if status has changed
        if (player.sumsub_status !== status && status !== 'not_started') {
          await updateSumsubStatus(player._id.toString(), status, details);
        }
      } catch (error: any) {
        logger.warn('Failed to fetch detailed status from Sumsub, falling back to stored status', {
          userId: req.user.id,
          sumsubId: player.sumsub_id,
          error: error.message
        });
        // Fallback to stored status
        status = player.sumsub_status || 'not_started';
        message = undefined;
        details = {};
        lastUpdated = player.sumsub_verification_date;
      }
    }

    res.status(200).json({
      success: true,
      message: (req as any).__('STATUS_RETRIEVED'),
      data: {
        status,
        message,
        lastUpdated: lastUpdated?.toISOString(),
        details
      },
    });
  } catch (error: any) {
    logger.error('Status fetch error', {
      userId: req.user?.id,
      error: error.message,
    });
    sendErrorResponse(
      res,
      500,
      error.message || (req as any).__('FAILED_TO_FETCH_STATUS')
    );
  }
};

export const uploadDocument = async (req: CustomRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      logger.error('Authentication required', { user: req.user });
      return sendErrorResponse(res, 401, (req as any).__('AUTHENTICATION_REQUIRED'));
    }

    if (!req.file) {
      logger.warn('No file uploaded', { userId: req.user.id });
      return sendErrorResponse(res, 400, (req as any).__('NO_FILE_UPLOADED'));
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      logger.warn('Invalid file type', { userId: req.user.id, mimetype: req.file.mimetype });
      return sendErrorResponse(res, 400, (req as any).__('INVALID_FILE_TYPE'));
    }

    const player = await Player.findById(req.user.id);
    if (!player) {
      logger.warn('Player not found', { userId: req.user.id });
      return sendErrorResponse(res, 404, (req as any).__('PLAYER_NOT_FOUND'));
    }

    if (!player.sumsub_id) {
      logger.warn('Player has no Sumsub ID', { userId: req.user.id });
      return sendErrorResponse(res, 400, (req as any).__('SUMSUB_ID_NOT_FOUND'));
    }

    const documentType = req.body.documentType || 'IDENTITY';
    const documentSide = req.body.documentSide || 'FRONT';

    const uploadResult = await uploadDocumentToSumsub(
      player.sumsub_id,
      req.file,
      documentType,
      documentSide
    );

    logger.info('Document uploaded to Sumsub', {
      userId: req.user.id,
      documentType,
      documentSide,
      sumsubId: player.sumsub_id
    });

    res.status(200).json({
      success: true,
      message: (req as any).__('DOCUMENT_UPLOADED'),
      data: {
        documentId: uploadResult.idDocId,
        documentType,
        documentSide,
        status: uploadResult.status
      }
    });
  } catch (error: any) {
    logger.error('Document upload error', {
      userId: req.user?.id,
      error: error.message
    });
    sendErrorResponse(
      res,
      500,
      error.message || (req as any).__('FAILED_DOCUMENT_UPLOAD')
    );
  }
};