import { Request, Response } from 'express';
import Player from '../models/player';
import { getSumsubSDKState, approveSumsubApplicant, rejectSumsubApplicant, getApplicantReviewId } from '../utils/sumsub';
import { updateAdminStatus } from '../services/sumsubService';
import { logger } from '../utils/logger';
import axios from 'axios';
import { config } from '../config';
import { generateSignature } from '../utils/sumsub';

export const getApplicantDocuments = async (req: Request, res: Response) => {
  try {
    const { sumsubId } = req.params;

    const player = await Player.findOne({ sumsub_id: sumsubId });
    if (!player) {
      return res.status(404).json({
        success: false,
        message: 'Player not found',
      });
    }

    // Fetch document details from SDK state
    const sdkState = await getSumsubSDKState(sumsubId);
    const documentStatus = sdkState.step?.documentStatus;
    const documents = documentStatus?.imageStatuses?.map((img: any) => ({
      id: img.imageId.toString(),
      type: documentStatus.idDocType || 'UNKNOWN',
      side: img.idDocSubType || 'FRONT',
      status: 'uploaded',
      createdAt: new Date().toISOString(),
    })) || [];

    return res.status(200).json({
      success: true,
      message: 'DOCUMENTS_RETRIEVED',
      data: {
        documents,
        sumsubNotes: player.sumsub_notes,
        adminNotes: player.admin_notes,
      },
    });
  } catch (error: any) {
    logger.error('Error fetching applicant documents:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch documents',
    });
  }
};

export const approveApplicant = async (req: Request, res: Response) => {
  try {
    const { sumsubId } = req.params;
    const { adminNotes } = req.body;

    const player = await Player.findOne({ sumsub_id: sumsubId });
    if (!player) {
      return res.status(404).json({
        success: false,
        message: 'Player not found',
      });
    }

    await approveSumsubApplicant(sumsubId);
    await updateAdminStatus(player._id.toString(), 'approved', adminNotes || 'Approved by admin', {
      documents: player.sumsub_details?.documents || [],
    });

    return res.status(200).json({
      success: true,
      message: 'KYC approved successfully',
    });
  } catch (error: any) {
    logger.error('Error approving applicant:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to approve KYC',
    });
  }
};

export const rejectApplicant = async (req: Request, res: Response) => {
  try {
    const { sumsubId } = req.params;
    const { adminNotes } = req.body;

    const player = await Player.findOne({ sumsub_id: sumsubId });
    if (!player) {
      return res.status(404).json({
        success: false,
        message: 'Player not found',
      });
    }

    await rejectSumsubApplicant(sumsubId);
    await updateAdminStatus(player._id.toString(), 'rejected', adminNotes || 'Rejected by admin', {
      documents: player.sumsub_details?.documents || [],
      nextSteps: [
        'Review the rejection reason',
        'Correct any issues with your documents',
        'Resubmit your verification',
      ],
    });

    return res.status(200).json({
      success: true,
      message: 'KYC rejected successfully',
    });
  } catch (error: any) {
    logger.error('Error rejecting applicant:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to reject KYC',
    });
  }
};

export const getDocumentDownload = async (req: Request, res: Response) => {
  try {
    const { sumsubId, documentId } = req.params;

    const player = await Player.findOne({ sumsub_id: sumsubId });
    if (!player) {
      return res.status(404).json({
        success: false,
        message: 'Player not found',
      });
    }

    const reviewId = await getApplicantReviewId(sumsubId);
    if (!reviewId) {
      return res.status(404).json({
        success: false,
        message: 'No review found for applicant',
      });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const method = 'GET';
    const path = `/resources/inspections/${reviewId}/resources/${documentId}`;
    const url = `${config.sumsub.baseUrl}${path}`;

    const signature = generateSignature(method, path, '', timestamp);

    const headers = {
      'X-App-Token': config.sumsub.appToken,
      'X-App-Access-Sig': signature,
      'X-App-Access-Ts': timestamp.toString(),
      'Accept': 'application/octet-stream',
    };

    const response = await axios.get(url, {
      headers,
      responseType: 'stream',
    });

    res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="document-${documentId}.jpg"`);

    response.data.pipe(res);
  } catch (error: any) {
    logger.error('Error downloading document:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to download document',
    });
  }
};