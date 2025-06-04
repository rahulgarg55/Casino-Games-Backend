import { Request, Response } from 'express';
import Player from '../models/player';
import { getSumsubApplicantDocuments, approveSumsubApplicant, rejectSumsubApplicant } from '../utils/sumsub';
import { logger } from '../utils/logger';

export const getApplicantDocuments = async (req: Request, res: Response) => {
  try {
    const { sumsubId } = req.params;

    // Get the player to verify the sumsubId
    const player = await Player.findOne({ sumsub_id: sumsubId });
    if (!player) {
      return res.status(404).json({
        success: false,
        message: 'Player not found',
      });
    }

    // Fetch documents from Sumsub
    const documents = await getSumsubApplicantDocuments(sumsubId);

    return res.status(200).json({
      success: true,
      data: {
        documents,
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

    // Get the player
    const player = await Player.findOne({ sumsub_id: sumsubId });
    if (!player) {
      return res.status(404).json({
        success: false,
        message: 'Player not found',
      });
    }

    // Approve in Sumsub
    await approveSumsubApplicant(sumsubId);

    // Update player status
    player.sumsub_status = 'approved';
    player.is_verified = 1;
    await player.save();

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

    // Get the player
    const player = await Player.findOne({ sumsub_id: sumsubId });
    if (!player) {
      return res.status(404).json({
        success: false,
        message: 'Player not found',
      });
    }

    // Reject in Sumsub
    await rejectSumsubApplicant(sumsubId);

    // Update player status
    player.sumsub_status = 'rejected';
    player.is_verified = 0;
    await player.save();

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