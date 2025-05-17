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
    email?: string;
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
    const signature = req.headers['x-payload-signature'] as string;
    if (!signature) {
      logger.warn('Missing webhook signature');
      return sendErrorResponse(res, 400, (req as any).__('MISSING_WEBHOOK_SIGNATURE'));
    }

    if (!validateWebhookSignature(req.body, signature)) {
      logger.warn('Invalid webhook signature');
      return sendErrorResponse(res, 401, (req as any).__('INVALID_WEBHOOK_SIGNATURE'));
    }

    const { applicantId, type, reviewResult } = req.body;

    if (!applicantId || !type) {
      logger.warn('Invalid webhook payload', { applicantId, type });
      return sendErrorResponse(res, 400, (req as any).__('INVALID_WEBHOOK_PAYLOAD'));
    }

    const player = await Player.findOne({ sumsub_id: applicantId });
    if (!player) {
      logger.warn('Player not found', { applicantId });
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
    });
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