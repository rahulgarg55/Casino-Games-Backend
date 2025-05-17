import { Request, Response } from 'express';
import { validateWebhookSignature } from '../utils/sumsub';
import { sendErrorResponse } from './authController';
import {
  initiateSumsubVerification,
  updateSumsubStatus,
} from '../services/sumsubService';
import Player from '../models/player';
import winston from 'winston';

interface CustomRequest extends Request {
  user?: {
    id: string;
    role: number;
    email?: string; // Add email to user object for consistency
  };
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
    logger.info('startSumsubVerification: Request received', {
      user: req.user,
      headers: req.headers,
      token: req.headers.authorization,
    });
    console.log('startSumsubVerification: Request received', {
      user: req.user,
      headers: req.headers,
      token: req.headers.authorization,
    });

    if (!req.user?.id) {
      logger.error('startSumsubVerification: No user ID found');
      return sendErrorResponse(res, 401, (req as any).__('AUTHENTICATION_REQUIRED'));
    }

    const tokenResponse = await initiateSumsubVerification(req.user.id);

    logger.info('Sumsub verification started successfully', { userId: req.user.id, tokenResponse });
    res.status(200).json({
      success: true,
      message: (req as any).__('SUB_VERIFICATION'),
      data: {
        accessToken: tokenResponse.token,
        externalUserId: tokenResponse.userId,
      },
    });
  } catch (error) {
    logger.error('Sumsub verification error:', error);
    console.error('Sumsub verification error:', error, {
      resDefined: !!res,
      resStatus: res?.status,
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
    const signature = req.headers['x-payload-signature'] as string;
    if (!signature) {
      logger.warn('Webhook error: Missing x-payload-signature header');
      return sendErrorResponse(res, 400, (req as any).__('MISSING_WEBHOOK_SIGNATURE'));
    }

    if (!validateWebhookSignature(req.body, signature)) {
      logger.warn('Webhook error: Invalid signature', { signature, body: req.body });
      return sendErrorResponse(res, 401, (req as any).__('INVALID_WEBHOOK_SIGNATURE'));
    }

    logger.info('Sumsub Webhook Received:', req.body);

    const { applicantId, inspectionId, type, reviewStatus, reviewResult } = req.body;

    if (!applicantId || !type) {
      logger.warn('Webhook error: Invalid payload', { applicantId, type });
      return sendErrorResponse(res, 400, (req as any).__('INVALID_WEBHOOK_PAYLOAD'));
    }

    const player = await Player.findOne({ sumsub_id: applicantId });
    if (!player) {
      logger.warn('Webhook error: Player not found for applicantId', { applicantId });
      return sendErrorResponse(res, 404, (req as any).__('PLAYER_NOT_FOUND'));
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
        logger.info('Webhook type not handled:', type);
        return res.status(200).json({
          success: true,
          message: (req as any).__('WEBHOOK_PROCESSED'),
        });
    }

    await updateSumsubStatus(player._id.toString(), status);
    logger.info('Player Sumsub status updated', { playerId: player._id, status });

    res.status(200).json({
      success: true,
      message: (req as any).__('WEBHOOK_PROCESSED'),
    });
  } catch (error) {
    logger.error('Webhook error:', error);
    sendErrorResponse(
      res,
      500,
      error instanceof Error
        ? error.message
        : (req as any).__('FAILED_WEBHOOK')
    );
  }
};

export const getSumsubStatus = async (req: CustomRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return sendErrorResponse(res, 401, (req as any).__('AUTHENTICATION_REQUIRED'));
    }

    const player = await Player.findById(req.user.id);
    if (!player) {
      return sendErrorResponse(res, 404, (req as any).__('PLAYER_NOT_FOUND'));
    }

    logger.info('Sumsub status retrieved', { playerId: req.user.id, status: player.sumsub_status });
    res.status(200).json({
      success: true,
      message: (req as any).__('STATUS_RETRIEVED'),
      data: {
        status: player.sumsub_status,
      },
    });
  } catch (error) {
    logger.error('Error fetching Sumsub status:', error);
    console.error('Error fetching Sumsub status:', error);
    sendErrorResponse(
      res,
      500,
      error instanceof Error
        ? error.message
        : (req as any).__('FAILED_TO_FETCH_STATUS')
    );
  }
};