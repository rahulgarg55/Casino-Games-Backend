import { Request, Response } from 'express';
import { Affiliate } from '../models/affiliate';
import Player from '../models/player';
import Payout from '../models/payout';
import CommissionTier from '../models/comissionTier';
import PromoMaterial from '../models/promoMaterial';
import { sendErrorResponse } from './authController';
import { sendEmail } from '../utils/sendEmail';
import Notification from '../models/notification';
import { NotificationType } from '../constants';

interface CustomRequest extends Request {
  user: {
    id: string;
    role: number;
  };
}

export const getAffiliateDashboard = async (
  req: CustomRequest,
  res: Response,
) => {
  try {
    const affiliateId = req.user.id;
    const affiliate = await Affiliate.findById(affiliateId)
      .select('-password_hash -verification_token -reset_password_token')
      .lean();

    if (!affiliate) {
      return sendErrorResponse(res, 404, 'Affiliate not found');
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

    const dashboardData = {
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

    res.status(200).json({
      success: true,
      message: 'Dashboard data retrieved successfully',
      data: dashboardData,
    });
  } catch (error) {
    sendErrorResponse(
      res,
      500,
      error instanceof Error ? error.message : 'Failed to fetch dashboard data',
    );
  }
};

export const requestPayout = async (req: CustomRequest, res: Response) => {
  try {
    const affiliateId = req.user.id;
    const { amount, currency } = req.body;

    const affiliate = await Affiliate.findById(affiliateId);
    if (!affiliate) {
      return sendErrorResponse(res, 404, 'Affiliate not found');
    }

    if (amount > affiliate.pendingEarnings) {
      return sendErrorResponse(
        res,
        400,
        'Requested amount exceeds pending earnings',
      );
    }

    const payout = new Payout({
      affiliateId,
      amount,
      currency,
      status: 'pending',
    });

    await payout.save();

    const notification = new Notification({
      type: NotificationType.WITHDRAWAL_REQUESTED,
      message: `Payout request of ${amount} ${currency} has been submitted`,
      user_id: affiliateId,
      metadata: { payoutId: payout._id },
    });
    await notification.save();

    res.status(201).json({
      success: true,
      message: 'Payout request submitted successfully',
      data: { payoutId: payout._id },
    });
  } catch (error) {
    sendErrorResponse(
      res,
      500,
      error instanceof Error
        ? error.message
        : 'Failed to submit payout request',
    );
  }
};

export const getPayoutHistory = async (req: CustomRequest, res: Response) => {
  try {
    const affiliateId = req.user.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const payouts = await Payout.find({ affiliateId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Payout.countDocuments({ affiliateId });

    res.status(200).json({
      success: true,
      message: 'Payout history retrieved successfully',
      data: {
        payouts,
        pagination: {
          total,
          page,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    sendErrorResponse(
      res,
      500,
      error instanceof Error ? error.message : 'Failed to fetch payout history',
    );
  }
};

export const getPromoMaterials = async (req: CustomRequest, res: Response) => {
  try {
    const materials = await PromoMaterial.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: 'Promotional materials retrieved successfully',
      data: { materials },
    });
  } catch (error) {
    sendErrorResponse(
      res,
      500,
      error instanceof Error
        ? error.message
        : 'Failed to fetch promotional materials',
    );
  }
};

export const updateNotificationPreferences = async (
  req: CustomRequest,
  res: Response,
) => {
  try {
    const affiliateId = req.user.id;
    const { preferences } = req.body;

    const affiliate = await Affiliate.findByIdAndUpdate(
      affiliateId,
      { notificationPreferences: preferences },
      { new: true },
    );

    if (!affiliate) {
      return sendErrorResponse(res, 404, 'Affiliate not found');
    }

    res.status(200).json({
      success: true,
      message: 'Notification preferences updated successfully',
      data: { preferences: affiliate.notificationPreferences },
    });
  } catch (error) {
    sendErrorResponse(
      res,
      500,
      error instanceof Error
        ? error.message
        : 'Failed to update notification preferences',
    );
  }
};

export const getReferralLink = async (req: CustomRequest, res: Response) => {
  try {
    const affiliateId = req.user.id;
    const affiliate = await Affiliate.findById(affiliateId);

    if (!affiliate) {
      return sendErrorResponse(res, 404, 'Affiliate not found');
    }

    const referralLink = `${process.env.FRONTEND_URL}/register?ref=${affiliate.referralCode}`;

    res.status(200).json({
      success: true,
      message: 'Referral link retrieved successfully',
      data: { referralLink },
    });
  } catch (error) {
    sendErrorResponse(
      res,
      500,
      error instanceof Error
        ? error.message
        : 'Failed to generate referral link',
    );
  }
};
