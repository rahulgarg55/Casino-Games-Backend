import { Request, Response } from 'express';
import { validateWebhookSignature, generateSumsubWebSDKLink } from '../utils/sumsub';
import { sendErrorResponse } from './authController';
import {
  initiateSumsubVerification,
  updateSumsubStatus,
  uploadDocumentToSumsub,
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
  } catch (error) {
    logger.error('Verification error', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    sendErrorResponse(
      res,
      400,
      error instanceof Error
        ? error.message
        : (req as any).__('FAILED_SUB_VERIFICATION')
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

    // Validate signature using raw body
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

    let status: 'pending' | 'approved' | 'rejected';
    switch (type) {
      case 'applicantPending':
        status = 'pending';
        break;
      case 'applicantReviewed':
        status = reviewResult?.reviewAnswer === 'GREEN' ? 'approved' : 'rejected';
        break;
      default:
        logger.info('Unhandled webhook type', { type });
        return res.status(200).json({
          success: true,
          message: (req as any).__('WEBHOOK_PROCESSED'),
        });
    }

    await updateSumsubStatus(player._id.toString(), status);
    logger.info('Status updated', { playerId: player._id, status });

    res.status(200).json({
      success: true,
      message: (req as any).__('WEBHOOK_PROCESSED'),
    });
  } catch (error) {
    logger.error('Webhook processing error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      body: req.body.toString(),
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error
        ? error.message
        : (req as any).__('FAILED_WEBHOOK'),
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

    res.status(200).json({
      success: true,
      message: (req as any).__('STATUS_RETRIEVED'),
      data: {
        status: player.sumsub_status || 'not_started',
      },
    });
  } catch (error) {
    logger.error('Status fetch error', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    sendErrorResponse(
      res,
      500,
      error instanceof Error
        ? error.message
        : (req as any).__('FAILED_TO_FETCH_STATUS')
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

    // Upload document to Sumsub
    const documentType = req.body.documentType || 'IDENTITY'; // Default to ID document
    const documentSide = req.body.documentSide || 'FRONT'; // Default to front side

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
  } catch (error) {
    logger.error('Document upload error', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    sendErrorResponse(
      res,
      500,
      error instanceof Error
        ? error.message
        : (req as any).__('FAILED_DOCUMENT_UPLOAD')
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

    // Generate WebSDK link
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
  } catch (error) {
    logger.error('Verification link generation error', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    sendErrorResponse(
      res,
      400,
      error instanceof Error
        ? error.message
        : (req as any).__('FAILED_SUB_VERIFICATION')
    );
  }
};