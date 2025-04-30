import { Affiliate } from '../models/affiliate';
import Player from '../models/player';
import Payout from '../models/payout';
import CommissionTier from '../models/comissionTier';
import PromoMaterial from '../models/promoMaterial';
import { sendEmail } from '../utils/sendEmail';
import { NotificationType } from '../constants';
import Notification from '../models/notification';

export const getAffiliateDashboard = async (affiliateId: string) => {
  const affiliate = await Affiliate.findById(affiliateId)
    .select('-password_hash -verification_token -reset_password_token')
    .lean();

  if (!affiliate) {
    throw new Error('Affiliate not found');
  }

  const referredPlayers = await Player.find({ referredBy: affiliateId })
    .select('username email created_at status')
    .sort({ created_at: -1 });

  const totalEarnings = await Payout.aggregate([
    { $match: { affiliateId, status: 'paid' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  const pendingEarnings = await Payout.aggregate([
    { $match: { affiliateId, status: 'pending' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  const commissionTier = await CommissionTier.findOne({
    minReferrals: { $lte: referredPlayers.length },
  }).sort({ minReferrals: -1 });

  return {
    affiliate: {
      id: affiliate._id,
      name: `${affiliate.firstname} ${affiliate.lastname}`,
      email: affiliate.email,
      commissionRate:
        commissionTier?.commissionRate || affiliate.commissionRate,
      totalSignups: referredPlayers.length,
      totalEarnings: totalEarnings[0]?.total || 0,
      pendingEarnings: pendingEarnings[0]?.total || 0,
    },
    referredPlayers,
  };
};

export const requestPayout = async (
  affiliateId: string,
  payoutData: {
    amount: number;
    currency: string;
  },
) => {
  const affiliate = await Affiliate.findById(affiliateId);
  if (!affiliate) {
    throw new Error('Affiliate not found');
  }

  if (payoutData.amount > affiliate.pendingEarnings) {
    throw new Error('Requested amount exceeds pending earnings');
  }

  const payout = new Payout({
    affiliateId,
    amount: payoutData.amount,
    currency: payoutData.currency,
    status: 'pending',
  });

  await payout.save();

  const notification = new Notification({
    type: NotificationType.WITHDRAWAL_REQUESTED,
    message: `Payout request of ${payoutData.amount} ${payoutData.currency} has been submitted`,
    user_id: affiliateId,
    metadata: { payoutId: payout._id },
  });
  await notification.save();

  return payout;
};

export const getPayoutHistory = async (
  affiliateId: string,
  page: number = 1,
  limit: number = 20,
) => {
  const payouts = await Payout.find({ affiliateId })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  const total = await Payout.countDocuments({ affiliateId });

  return {
    payouts,
    pagination: {
      total,
      page,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const getPromoMaterials = async () => {
  const materials = await PromoMaterial.find().sort({ createdAt: -1 });
  return materials;
};

export const updateNotificationPreferences = async (
  affiliateId: string,
  preferences: any,
) => {
  const affiliate = await Affiliate.findByIdAndUpdate(
    affiliateId,
    { notificationPreferences: preferences },
    { new: true },
  );

  if (!affiliate) {
    throw new Error('Affiliate not found');
  }

  return affiliate.notificationPreferences;
};

export const getReferralLink = async (affiliateId: string) => {
  const affiliate = await Affiliate.findById(affiliateId);
  if (!affiliate) {
    throw new Error('Affiliate not found');
  }

  return `${process.env.FRONTEND_URL}/register?ref=${affiliate.referralCode}`;
};
