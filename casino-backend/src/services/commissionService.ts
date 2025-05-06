import CommissionTier, { ICommissionTier } from '../models/comissionTier';
import { Affiliate } from '../models/affiliate';
import { sendEmail } from '../utils/sendEmail';

export const setGlobalCommission = async (commissionRate: number): Promise<ICommissionTier> => {
  if (Number.isNaN(commissionRate) || commissionRate < 0 || commissionRate > 4) {
    throw new Error('Commission rate must be between 0% and 4%');
  }

  const tier = await CommissionTier.findOneAndUpdate(
    { tierName: 'Global' },
    {
      tierName: 'Global',
      minReferrals: 0,
      commissionRate,
      currency: 'USD',
      updatedAt: new Date(),
    },
    { upsert: true, new: true, runValidators: true }
  );

  await Affiliate.updateMany(
    {},
    { $set: { commissionRate } }
  );

  const affiliates = await Affiliate.find({
    'notificationPreferences.campaignUpdates': true,
  });
  for (const affiliate of affiliates) {
    await sendEmail(
      affiliate.email,
      'Commission Rate Updated',
      `The global commission rate has been updated to ${commissionRate}%. This applies to all your referrals.`,
      `${affiliate.firstname} ${affiliate.lastname}`
    );
  }

  return tier;
};

export const getGlobalCommission = async (): Promise<ICommissionTier | null> => {
  return await CommissionTier.findOne({ tierName: 'Global' });
};