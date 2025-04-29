import { Request, Response } from 'express';
import { validateWebhookSignature } from '../utils/sumsub';
import { sendErrorResponse } from './authController';
import { initiateSumsubVerification, updateSumsubStatus } from '../services/sumsubService';
import Player from '../models/player';

interface CustomRequest extends Request {
  user?: {
    id: string;
    role: number;
  };
}

export const startSumsubVerification = async (req: CustomRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return sendErrorResponse(res, 401, 'Authentication required');
    }

    const tokenResponse = await initiateSumsubVerification(req.user.id);

    res.status(200).json({
      success: true,
      message: 'Sumsub verification initiated successfully',
      data: {
        accessToken: tokenResponse.token,
        externalUserId: tokenResponse.userId,
      },
    });
  } catch (error) {
    console.error('Sumsub verification error:', error);
    sendErrorResponse(
      res,
      400,
      error instanceof Error
        ? error.message
        : 'Failed to initiate Sumsub verification',
    );
  }
};

export const sumsubWebhook = async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-payload-signature'] as string;
    if (!signature) {
      return sendErrorResponse(res, 400, 'Missing webhook signature');
    }

    if (!validateWebhookSignature(req.body, signature)) {
      return sendErrorResponse(res, 401, 'Invalid webhook signature');
    }

    const { applicantId, reviewStatus, reviewResult } = req.body;
    if (!applicantId || !reviewStatus) {
      return sendErrorResponse(res, 400, 'Invalid webhook payload');
    }

    const player = await Player.findOne({ sumsub_id: applicantId });
    if (!player) {
      return sendErrorResponse(res, 404, 'Player not found');
    }

    const status =
      reviewStatus === 'completed' && reviewResult?.reviewAnswer === 'GREEN'
        ? 'approved'
        : 'rejected';
    
    await updateSumsubStatus(player._id.toString(), status);

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
    });
  } catch (error) {
    console.error('Webhook error:', error);
    sendErrorResponse(
      res,
      500,
      error instanceof Error
        ? error.message
        : 'Failed to process Sumsub webhook',
    );
  }
}; 