import { Request, Response } from 'express';
import { validateWebhookSignature, generateSumsubWebSDKLink, getApplicantReviewId } from '../utils/sumsub';
import { sendErrorResponse } from './authController';
import {
  initiateSumsubVerification,
  updateSumsubStatus,
  updateAdminStatus,
  uploadDocumentToSumsub,
  getSumsubApplicantStatus,
  getSumsubDocumentImages,
  getSumsubSDKState,
  getSumsubApplicantDocuments,
  getSumsubInspectionImage,
  getSumsubDocumentImage
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
      message: (req as any).__('SUBMITTED_VERIFICATION'),
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
    if (error.message === 'No verification attempts remaining') {
      sendErrorResponse(res, 403, 'No verification attempts remaining');
    } else if (error.message.includes('duplicate documents')) {
      sendErrorResponse(res, 400, 'Duplicate documents detected');
    } else {
      sendErrorResponse(
        res,
        400,
        error.message || (req as any).__('FAILED_SUB_VERIFICATION')
      );
    }
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

    const player = await Player.findById(req.user.id);
    if (!player) {
      logger.error('Player not found', { userId: req.user.id });
      return sendErrorResponse(res, 404, (req as any).__('PLAYER_NOT_FOUND'));
    }

    if (!player.email) {
      logger.error('Player email is required for Sumsub verification', { userId: req.user.id });
      return sendErrorResponse(res, 400, (req as any).__('EMAIL_REQUIRED'));
    }

    if (player.sumsub_attempts <= 0) {
      logger.error('No verification attempts remaining', { userId: req.user.id });
      return sendErrorResponse(res, 403, 'No verification attempts remaining');
    }

    const { url } = await generateSumsubWebSDKLink(
      req.user.id,
      player.email,
      player.phone_number
    );

    logger.info('Verification link generated', { userId: req.user.id, url, attempts: player.sumsub_attempts });
    
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
    if (error.message.includes('duplicate documents')) {
      sendErrorResponse(res, 400, 'Duplicate documents detected');
    } else {
      sendErrorResponse(
        res,
        400,
        error.message || (req as any).__('FAILED_SUB_VERIFICATION')
      );
    }
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

    let sumsubStatus: 'not_started' | 'in_review' | 'approved_sumsub' | 'rejected_sumsub';
    let sumsubNotes: string | undefined;
    let details: { documents?: string[]; nextSteps?: string[] } = {};

    switch (type) {
      case 'applicantPending':
        sumsubStatus = 'in_review';
        break;
      case 'applicantReviewed':
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
        logger.info('Unhandled webhook type', { type });
        return res.status(200).json({
          success: true,
          message: (req as any).__('WEBHOOK_PROCESSED'),
        });
    }

    await updateSumsubStatus(player._id.toString(), sumsubStatus, sumsubNotes, details);
    logger.info('Status updated', { playerId: player._id, sumsubStatus, sumsubNotes, details, attempts: player.sumsub_attempts });

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

    let sumsubStatus = player.sumsub_status || 'not_started';
    let sumsubNotes = player.sumsub_notes;
    let adminStatus = player.admin_status;
    let adminNotes = player.admin_notes;
    let lastUpdated = player.sumsub_verification_date;
    let details = player.sumsub_details || {};
    let attempts = player.sumsub_attempts;
    let lastAttemptDate = player.sumsub_last_attempt_date;

    if (player.sumsub_id) {
      try {
        const sumsubData = await getSumsubApplicantStatus(player.sumsub_id);
        sumsubStatus = sumsubData.sumsubStatus;
        sumsubNotes = sumsubData.sumsubNotes;
        details = sumsubData.details || {};
        lastUpdated = sumsubData.lastUpdated || player.sumsub_verification_date;

        if (player.sumsub_status !== sumsubStatus && sumsubStatus !== 'not_started') {
          await updateSumsubStatus(player._id.toString(), sumsubStatus, sumsubNotes, details);
        }
      } catch (error: any) {
        logger.warn('Failed to fetch detailed status from Sumsub, falling back to stored status', {
          userId: req.user.id,
          sumsubId: player.sumsub_id,
          error: error.message
        });
      }
    }

    const displayStatus = adminStatus || (sumsubStatus === 'not_started' ? 'not_started' : 'in_review');

    res.status(200).json({
      success: true,
      message: (req as any).__('STATUS_RETRIEVED'),
      data: {
        status: displayStatus,
        sumsubStatus,
        sumsubNotes,
        adminStatus,
        adminNotes,
        lastUpdated: lastUpdated?.toISOString(),
        details,
        attempts,
        lastAttemptDate: lastAttemptDate?.toISOString()
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

    if (player.sumsub_attempts <= 0) {
      logger.error('No verification attempts remaining', { userId: req.user.id });
      return sendErrorResponse(res, 403, 'No verification attempts remaining');
    }

    const documentType = req.body.documentType || 'IDENTITY';
    const documentSide = req.body.documentSide || 'FRONT';

    const uploadResult = await uploadDocumentToSumsub(
      player.sumsub_id,
      req.file,
      documentType,
      documentSide
    );

    if (uploadResult.inspectionId) {
      player.sumsub_inspection_id = uploadResult.inspectionId;
      await player.save();
    }

    await updateSumsubStatus(player._id.toString(), 'in_review', null, {
      documents: [uploadResult.idDocId]
    });

    logger.info('Document uploaded to Sumsub', {
      userId: req.user.id,
      documentType,
      documentSide,
      sumsubId: player.sumsub_id,
      attempts: player.sumsub_attempts
    });

    res.status(200).json({
      success: true,
      message: (req as any).__('DOCUMENT_UPLOADED'),
      data: {
        documentId: uploadResult.idDocId,
        documentType,
        documentSide,
        status: uploadResult.status,
        attempts: player.sumsub_attempts
      }
    });
  } catch (error: any) {
    logger.error('Document upload error', {
      userId: req.user?.id,
      error: error.message
    });
    if (error.message.includes('duplicate documents')) {
      sendErrorResponse(res, 400, 'Duplicate documents detected');
    } else {
      sendErrorResponse(
        res,
        500,
        error.message || (req as any).__('FAILED_DOCUMENT_UPLOAD')
      );
    }
  }
};

export const approvePlayerKYC = async (req: CustomRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const { adminNotes } = req.body;
    const player = await Player.findById(playerId);
    if (!player) {
      logger.warn('Player not found', { playerId });
      return sendErrorResponse(res, 404, (req as any).__('PLAYER_NOT_FOUND'));
    }

    if (!player.sumsub_id) {
      logger.warn('Player has no Sumsub ID', { playerId });
      return sendErrorResponse(res, 400, (req as any).__('SUMSUB_ID_NOT_FOUND'));
    }

    await updateAdminStatus(player._id.toString(), 'approved', adminNotes || 'Approved by admin', {
      documents: player.sumsub_details?.documents || []
    });

    logger.info('Player KYC approved', { playerId, adminNotes });

    res.status(200).json({
      success: true,
      message: (req as any).__('KYC_APPROVED'),
      data: {
        playerId,
        status: 'approved',
        adminNotes
      }
    });
  } catch (error: any) {
    logger.error('KYC approval error', {
      playerId: req.params.playerId,
      error: error.message
    });
    sendErrorResponse(
      res,
      500,
      error.message || (req as any).__('FAILED_KYC_APPROVAL')
    );
  }
};

export const rejectPlayerKYC = async (req: CustomRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const { adminNotes } = req.body;
    const player = await Player.findById(playerId);
    if (!player) {
      logger.warn('Player not found', { playerId });
      return sendErrorResponse(res, 404, (req as any).__('PLAYER_NOT_FOUND'));
    }

    if (!player.sumsub_id) {
      logger.warn('Player has no Sumsub ID', { playerId });
      return sendErrorResponse(res, 400, (req as any).__('SUMSUB_ID_NOT_FOUND'));
    }

    await updateAdminStatus(player._id.toString(), 'rejected', adminNotes || 'Rejected by admin', {
      documents: player.sumsub_details?.documents || [],
      nextSteps: [
        'Review the rejection reason',
        'Correct any issues with your documents',
        'Resubmit your verification'
      ]
    });

    logger.info('Player KYC rejected', { playerId, adminNotes });

    res.status(200).json({
      success: true,
      message: (req as any).__('KYC_REJECTED'),
      data: {
        playerId,
        status: 'rejected',
        adminNotes
      }
    });
  } catch (error: any) {
    logger.error('KYC rejection error', {
      playerId: req.params.playerId,
      error: error.message
    });
    sendErrorResponse(
      res,
      500,
      error.message || (req as any).__('FAILED_KYC_REJECTION')
    );
  }
};

export const getDocumentImage = async (req: CustomRequest, res: Response) => {
  try {
    const applicantId = req.params.applicantId as string;
    const imageId = req.params.imageId as string;

    console.log('Fetching document image:', { applicantId, imageId });

    if (!applicantId || !imageId) {
      console.log('Missing parameters:', { applicantId, imageId });
      logger.warn('Missing required parameters', { applicantId, imageId });
      return sendErrorResponse(res, 400, 'Missing applicantId or imageId');
    }

    const player = await Player.findOne({ sumsub_id: applicantId });
    if (!player) {
      console.log('Player not found for applicantId:', applicantId);
      logger.warn('Player not found', { applicantId });
      return sendErrorResponse(res, 404, 'Player not found');
    }

    try {
      console.log('Attempting to fetch as document image...');
      const { buffer, contentType } = await getSumsubDocumentImage(applicantId, imageId);
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="document-${imageId}.jpg"`);
      res.send(buffer);

      logger.info('Document image retrieved successfully', {
        applicantId,
        imageId,
        method: 'document'
      });
      return;
    } catch (docError: any) {
      console.log('Failed to fetch as document image, trying inspection image...');
      
      if (player.sumsub_inspection_id) {
        try {
          const { buffer, contentType } = await getSumsubInspectionImage(
            applicantId, 
            player.sumsub_inspection_id, 
            imageId
          );
          
          res.setHeader('Content-Type', contentType);
          res.setHeader('Content-Disposition', `inline; filename="inspection-${imageId}.jpg"`);
          res.send(buffer);

          logger.info('Inspection image retrieved successfully', {
            applicantId,
            imageId,
            inspectionId: player.sumsub_inspection_id,
            method: 'inspection'
          });
          return;
        } catch (inspectionError: any) {
          console.log('Failed to fetch as inspection image as well');
        }
      }

      try {
        console.log('Attempting to get inspection ID from SDK state...');
        const sdkState = await getSumsubSDKState(applicantId);
        const inspectionId = sdkState.step?.documentStatus?.attemptId;
        
        if (inspectionId) {
          console.log('Found inspection ID from SDK state:', inspectionId);
          
          if (!player.sumsub_inspection_id) {
            player.sumsub_inspection_id = inspectionId;
            await player.save();
          }
          
          const { buffer, contentType } = await getSumsubInspectionImage(
            applicantId, 
            inspectionId, 
            imageId
          );
          
          res.setHeader('Content-Type', contentType);
          res.setHeader('Content-Disposition', `inline; filename="inspection-${imageId}.jpg"`);
          res.send(buffer);

          logger.info('Image retrieved using SDK state inspection ID', {
            applicantId,
            imageId,
            inspectionId,
            method: 'sdk-state'
          });
          return;
        }
      } catch (sdkError: any) {
        console.log('Failed to get inspection ID from SDK state');
      }

      throw docError;
    }
  } catch (error: any) {
    console.error('Error retrieving document image:', error);
    logger.error('Error retrieving document image', {
      applicantId: req.params.applicantId,
      imageId: req.params.imageId,
      error: error.message,
      status: error.response?.status,
      responseData: error.response?.data
    });
    sendErrorResponse(
      res,
      500,
      error.message || 'Failed to retrieve document image'
    );
  }
};

export const getPendingKYCs = async (req: CustomRequest, res: Response) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const query: any = {
      sumsub_id: { $exists: true, $ne: null }
    };

    if (status) {
      query.sumsub_status = status;
    } else {
      query.sumsub_status = { $in: ['not_started', 'in_review'] };
    }

    const [players, total] = await Promise.all([
      Player.find(query)
        .select('username email phone_number sumsub_status sumsub_verification_date sumsub_notes sumsub_details sumsub_attempts sumsub_last_attempt_date')
        .sort({ sumsub_verification_date: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Player.countDocuments(query)
    ]);

    logger.info('Pending KYCs fetched', { 
      count: players.length,
      total,
      page,
      limit
    });

    res.status(200).json({
      success: true,
      message: (req as any).__('PENDING_KYCS_FETCHED'),
      data: {
        players,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit))
        }
      }
    });
  } catch (error: any) {
    logger.error('Error fetching pending KYCs', {
      error: error.message
    });
    sendErrorResponse(
      res,
      500,
      error.message || (req as any).__('FAILED_TO_FETCH_KYCS')
    );
  }
};

export const getSumsubDocumentImagesList = async (req: CustomRequest, res: Response) => {
  try {
    const { applicantId } = req.params;
    if (!applicantId) {
      return res.status(400).json({ success: false, message: 'Missing applicantId' });
    }

    const player = await Player.findOne({ sumsub_id: applicantId });
    if (!player) {
      return res.status(404).json({ success: false, message: 'Player not found' });
    }

    console.log('Getting document images list for:', applicantId);

    try {
      const sdkState = await getSumsubSDKState(applicantId);
      console.log('SDK State:', JSON.stringify(sdkState, null, 2));
      
      const documentStatus = sdkState.step?.documentStatus;
      if (documentStatus && documentStatus.imageStatuses && documentStatus.attemptId) {
        const inspectionId = documentStatus.attemptId;
        
        if (!player.sumsub_inspection_id) {
          player.sumsub_inspection_id = inspectionId;
          await player.save();
          console.log('Updated player with inspection ID:', inspectionId);
        }
        
        const images = documentStatus.imageStatuses.map((img: any) => ({
          imageId: img.imageId,
          idDocSubType: img.idDocSubType,
          imageFileName: img.imageFileName,
          inspectionId,
          url: `/sumsub/documents/${applicantId}/images/${img.imageId}`,
          source: 'websdk'
        }));

        console.log('Found WebSDK images:', images);
        return res.status(200).json({ success: true, data: { images, source: 'websdk' } });
      }
    } catch (sdkError: any) {
      console.log('Failed to get SDK state:', sdkError.message);
    }

    try {
      const documents = await getSumsubApplicantDocuments(applicantId);
      console.log('Found documents:', documents);
      
      if (documents && documents.length > 0) {
        const images = documents.map((doc: any) => ({
          imageId: doc.id,
          idDocSubType: doc.side,
          imageFileName: doc.fileName,
          inspectionId: doc.inspectionId,
          url: `/sumsub/documents/${applicantId}/images/${doc.id}`,
          source: 'api'
        }));

        console.log('Mapped document images:', images);
        return res.status(200).json({ success: true, data: { images, source: 'api' } });
      }
    } catch (docError: any) {
      console.log('Failed to get documents:', docError.message);
    }

    return res.status(404).json({ 
      success: false, 
      message: 'No document images found',
      debug: {
        hasPlayer: !!player,
        hasInspectionId: !!player.sumsub_inspection_id,
        sumsubId: player.sumsub_id
      }
    });
  } catch (error: any) {
    console.error('Error fetching document images list:', error);
    logger.error('Error fetching Sumsub document images list', { 
      applicantId: req.params.applicantId,
      error: error.message 
    });
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to fetch document images' 
    });
  }
};