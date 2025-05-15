import { Request, Response } from 'express';
import { validateWebhookSignature } from '../utils/sumsub';
import { sendErrorResponse } from './authController';
import {
  initiateSumsubVerification,
  updateSumsubStatus,
} from '../services/sumsubService';
import Player from '../models/player';

interface CustomRequest extends Request {
  user?: {
    id: string;
    role: number;
  };
}

export const startSumsubVerification = async (
  req: CustomRequest,
  res: Response,
) => {
  try {
    console.log('startSumsubVerification: Request received', {
      user: req.user,
      headers: req.headers,
      token: req.headers.authorization,
    });
    if (!req.user?.id) {
      console.log('startSumsubVerification: No user ID found');
      return sendErrorResponse(res, 401, (req as any).__('AUTHENTICATION_REQUIRED'));
    }

    const tokenResponse = await initiateSumsubVerification(req.user.id);

    res.status(200).json({
      success: true,
      message: (req as any).__('SUB_VERIFICATION'),
      data: {
        accessToken: tokenResponse.token,
        externalUserId: tokenResponse.userId,
      },
    });
  } catch (error) {
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
    // Extract the signature from the header
    const signature = req.headers['x-payload-signature'] as string;
    if (!signature) {
      console.log('Webhook error: Missing x-payload-signature header');
      return sendErrorResponse(res, 400, (req as any).__('MISSING_WEBHOOK_SIGNATURE'));
    }

    // Validate the webhook signature
    if (!validateWebhookSignature(req.body, signature)) {
      console.log('Webhook error: Invalid signature', { signature, body: req.body });
      return sendErrorResponse(res, 401, (req as any).__('INVALID_WEBHOOK_SIGNATURE'));
    }

    // Log the webhook payload for debugging
    console.log('Sumsub Webhook Received:', req.body);

    // Extract relevant fields from the webhook payload
    const { applicantId, inspectionId, type, reviewStatus, reviewResult } = req.body;

    if (!applicantId || !type) {
      console.log('Webhook error: Invalid payload', { applicantId, type });
      return sendErrorResponse(res, 400, (req as any).__('INVALID_WEBHOOK_PAYLOAD'));
    }

    // Find the player associated with the applicantId
    const player = await Player.findOne({ sumsub_id: applicantId });
    if (!player) {
      console.log('Webhook error: Player not found for applicantId', { applicantId });
      return sendErrorResponse(res, 404, (req as any).__('PLAYER_NOT_FOUND'));
    }

    // Handle different webhook types
    let status: 'pending' | 'approved' | 'rejected';
    switch (type) {
      case 'applicantPending':
        status = 'pending';
        break;
      case 'applicantReviewed':
        status = reviewResult?.reviewAnswer === 'GREEN' ? 'approved' : 'rejected';
        break;
      default:
        console.log('Webhook type not handled:', type);
        return res.status(200).json({
          success: true,
          message: (req as any).__('WEBHOOK_PROCESSED'),
        });
    }

    // Update the player's Sumsub status
    await updateSumsubStatus(player._id.toString(), status);

    // Respond with success
    res.status(200).json({
      success: true,
      message: (req as any).__('WEBHOOK_PROCESSED'),
    });
  } catch (error) {
    console.error('Webhook error:', error);
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

    res.status(200).json({
      success: true,
      message: (req as any).__('STATUS_RETRIEVED'),
      data: {
        status: player.sumsub_status,
      },
    });
  } catch (error) {
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