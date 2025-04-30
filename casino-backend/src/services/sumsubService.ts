import {
  generateSumsubAccessToken,
  createSumsubApplicant,
} from '../utils/sumsub';
import Player from '../models/player';
import { VERIFICATION } from '../constants';
import Notification, { NotificationType } from '../models/notification';

export const initiateSumsubVerification = async (playerId: string) => {
  const player = await Player.findById(playerId);
  if (!player) {
    throw new Error('Player not found');
  }

  if (!player.email) {
    throw new Error('Player email is required for Sumsub verification');
  }

  // Create Sumsub applicant if not exists
  if (!player.sumsub_id) {
    const applicantId = await createSumsubApplicant(
      playerId,
      player.email,
      player.phone_number,
    );
    player.sumsub_id = applicantId;
    player.sumsub_status = 'pending';
    await player.save();
  }

  return generateSumsubAccessToken(playerId, playerId, 'basic-kyc');
};

export const updateSumsubStatus = async (
  playerId: string,
  status: 'pending' | 'approved' | 'rejected',
) => {
  const player = await Player.findById(playerId);
  if (!player) {
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

  const notification = new Notification({
    type: NotificationType.KYC_UPDATE,
    message: `KYC status updated to ${status} for user ${player.username || player.email}`,
    user_id: player._id,
    metadata: { sumsub_id: player.sumsub_id, status },
  });
  await notification.save();

  return player;
};
