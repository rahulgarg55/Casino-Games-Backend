import Player from '../models/player';
import PlayerBalance from '../models/playerBalance';
import Transaction from '../models/transaction';
import Payout from '../models/payout';
import CommissionTier from '../models/comissionTier';
import PromoMaterial from '../models/promoMaterial';
import { Affiliate } from '../models/affiliate';
import { sendEmail } from '../utils/sendEmail';
import { v2 as cloudinary } from 'cloudinary';
import { NotificationType } from '../constants';
import Notification from '../models/notification';

export const getAllPlayers = async () => {
  const players = await Player.find({ role_id: 0 })
    .select('-password_hash -verification_token -reset_password_token')
    .sort({ created_at: -1 });

  const playersWithBalance = await Promise.all(
    players.map(async (player) => {
      const balance = await PlayerBalance.findOne({ player_id: player._id });
      return {
        id: player._id,
        username: player.username,
        fullname: player.fullname,
        email: player.email,
        currency: player.currency,
        phone_number: player.phone_number,
        role_id: player.role_id,
        status: player.status,
        is_verified: player.is_verified,
        created_at: player.created_at,
        gender: player.gender,
        language: player.language,
        country: player.country,
        city: player.city,
        is_2fa_enabled: player.is_2fa_enabled,
        balance: balance?.balance || 0,
        referredByName: player.referredByName,
      };
    }),
  );

  return playersWithBalance;
};

export const getPlayerDetails = async (userId: string) => {
  const player = await Player.findById(userId)
    .select([
      '-password_hash',
      '-reset_password_token',
      '-reset_password_expires',
      '-verification_token',
      '-verification_token_expires',
      '-sms_code',
      '-sms_code_expires',
      '-two_factor_secret',
      '-two_factor_expires',
      '-refreshToken',
    ])
    .lean();

  if (!player) {
    throw new Error('Player not found');
  }

  const balance = await PlayerBalance.findOne({
    player_id: userId,
  }).lean();

  const currencyMap = { 0: 'USD', 1: 'INR', 2: 'GBP' };
  const playerCurrency = currencyMap[player.currency];

  const transactionStats = await Transaction.aggregate([
    {
      $match: {
        player_id: player._id,
        status: 'completed',
        transaction_type: { $in: ['topup', 'withdrawal'] },
        currency: playerCurrency,
      },
    },
    {
      $group: {
        _id: '$transaction_type',
        total: { $sum: '$amount' },
        last_date: { $max: '$created_at' },
      },
    },
  ]);

  const totalDeposits =
    transactionStats.find((t) => t._id === 'topup')?.total || 0;
  const totalWithdrawals =
    transactionStats.find((t) => t._id === 'withdrawal')?.total || 0;
  const lastDepositDate =
    transactionStats.find((t) => t._id === 'topup')?.last_date || null;
  const lastWithdrawalDate =
    transactionStats.find((t) => t._id === 'withdrawal')?.last_date || null;

  const winStats = await Transaction.aggregate([
    {
      $match: {
        player_id: player._id,
        status: 'completed',
        transaction_type: 'win',
        currency: playerCurrency,
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$amount' },
      },
    },
  ]);
  const bonusBalance = winStats[0]?.total || balance?.bonus_balance || 0;

  return {
    ...player,
    balance: balance?.balance || player.balance || 0,
    bonus_balance: bonusBalance,
    total_deposits: totalDeposits,
    total_withdrawals: totalWithdrawals,
    last_deposit_date: lastDepositDate,
    last_withdrawal_date: lastWithdrawalDate,
    is_2fa: player.is_2fa_enabled,
  };
};

export const updatePayoutStatus = async (payoutId: string, status: 'approved' | 'rejected' | 'paid' | 'pending', adminNotes?: string) => {
  const payout = await Payout.findById(payoutId).populate('affiliateId');
  if (!payout) {
    throw new Error('Payout not found');
  }

  const affiliate = payout.affiliateId as any;

  if (status === 'approved') {
    payout.stripePayoutId = `po_${Math.random().toString(36).substring(2, 10)}`;
  } else if (status === 'paid') {
    await affiliate.updateOne(
      { _id: affiliate._id },
      {
        $inc: { paidEarnings: payout.amount, pendingEarnings: -payout.amount },
      },
    );
  } else if (status === 'rejected') {
    await affiliate.updateOne(
      { _id: affiliate._id },
      { $inc: { pendingEarnings: -payout.amount } },
    );
  }

  payout.status = status;
  payout.adminNotes = adminNotes || payout.adminNotes;
  await payout.save();

  if (affiliate.notificationPreferences?.payoutProcessed) {
    await sendEmail(
      affiliate.email,
      'Payout Status Update',
      `Your payout request of ${payout.amount} ${payout.currency} has been ${status}.${adminNotes ? ` Notes: ${adminNotes}` : ''}`,
      `${affiliate.firstname} ${affiliate.lastname}`,
    );
  }

  const notification = new Notification({
    type: NotificationType.WITHDRAWAL_REQUESTED,
    message: `Your payout request of ${payout.amount} ${payout.currency} was ${status}${adminNotes ? `: ${adminNotes}` : ''}`,
    user_id: affiliate._id,
    metadata: { payoutId, status, adminNotes },
  });
  await notification.save();

  return payout;
};

export const createCommissionTier = async (tierData: {
  tierName: string;
  minReferrals: number;
  commissionRate: number;
  currency: string;
}) => {
  const existingTier = await CommissionTier.findOne({ tierName: tierData.tierName });
  if (existingTier) {
    throw new Error('Tier name already exists');
  }

  const tier = new CommissionTier(tierData);
  await tier.save();

  return tier;
};

export const updateCommissionTier = async (tierId: string, updateData: {
  tierName?: string;
  minReferrals?: number;
  commissionRate?: number;
  currency?: string;
}) => {
  const tier = await CommissionTier.findById(tierId);
  if (!tier) {
    throw new Error('Commission tier not found');
  }

  if (updateData.tierName) tier.tierName = updateData.tierName;
  if (updateData.minReferrals !== undefined) tier.minReferrals = updateData.minReferrals;
  if (updateData.commissionRate !== undefined) tier.commissionRate = updateData.commissionRate;
  if (updateData.currency) tier.currency = updateData.currency;

  await tier.save();

  if (updateData.commissionRate !== undefined) {
    await Affiliate.updateMany(
      { totalSignups: { $gte: tier.minReferrals } },
      { commissionRate: tier.commissionRate },
    );

    const affectedAffiliates = await Affiliate.find({
      totalSignups: { $gte: tier.minReferrals },
    });
    for (const affiliate of affectedAffiliates) {
      if (affiliate.notificationPreferences?.campaignUpdates) {
        await sendEmail(
          affiliate.email,
          'Commission Rate Updated',
          `Your commission rate has been updated to ${tier.commissionRate}% due to your performance in the ${tier.tierName} tier.`,
          `${affiliate.firstname} ${affiliate.lastname}`,
        );
      }
    }
  }

  return tier;
};

export const uploadPromoMaterial = async (file: Express.Multer.File, materialData: {
  type: string;
  dimensions: string;
}) => {
  if (!file) {
    throw new Error('File is required');
  }

  const result = await cloudinary.uploader.upload(file.path, {
    folder: 'promo_materials',
    resource_type: 'auto',
  });

  const material = new PromoMaterial({
    type: materialData.type,
    url: result.secure_url,
    dimensions: materialData.dimensions,
  });

  await material.save();

  const affiliates = await Affiliate.find({
    'notificationPreferences.campaignUpdates': true,
  });
  for (const affiliate of affiliates) {
    await sendEmail(
      affiliate.email,
      'New Promotional Material Available',
      `A new ${materialData.type} has been added to your affiliate dashboard. Check it out to boost your campaigns!`,
      `${affiliate.firstname} ${affiliate.lastname}`,
    );
  }

  return material;
}; 