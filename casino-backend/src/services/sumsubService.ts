import {
  generateSumsubAccessToken,
  createSumsubApplicant,
} from '../utils/sumsub';
import Player from '../models/player';
import { VERIFICATION } from '../constants';
import Notification, { NotificationType } from '../models/notification';
import winston from 'winston';

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
  console.log('externalUserId :>> ', externalUserId);

  if (!player.sumsub_id) {
    try {
      const applicantId = await createSumsubApplicant(
        playerId,
        player.email,
        externalUserId,
        player.phone_number
      );
      player.sumsub_id = applicantId;
      console.log('applicantId :>> ', applicantId);
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
  status: 'pending' | 'approved' | 'rejected',
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
  } else if (status === 'rejected') {
    player.is_verified = VERIFICATION.UNVERIFIED;
  }

  await player.save();
  logger.info('Player Sumsub status updated', { playerId, status });

  const notification = new Notification({
    type: NotificationType.KYC_UPDATE,
    message: `KYC status updated to ${status} for user ${player.username || player.email}`,
    user_id: player._id,
    metadata: { sumsub_id: player.sumsub_id, status },
  });
  await notification.save();

  return player;
};