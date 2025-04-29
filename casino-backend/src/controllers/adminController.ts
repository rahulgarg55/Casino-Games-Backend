import { Request, Response } from 'express';
import mongoose from 'mongoose';
import moment from 'moment';
import Player from '../models/player';
import PlayerBalance from '../models/playerBalance';
import Transaction from '../models/transaction';
import { sendErrorResponse } from './authController';
import { STATUS, NotificationType } from '../constants';
import { sendEmail } from '../utils/sendEmail';
import {Affiliate} from '../models/affiliate';
import Payout from '../models/payout';
import CommissionTier from '../models/comissionTier';
import PromoMaterial from '../models/promoMaterial';
import Notification from '../models/notification';
import { getNotifications } from '../utils/notifications';
import { v2 as cloudinary } from 'cloudinary';
import {
  getAllPlayers,
  getPlayerDetails,
  updatePayoutStatus,
  createCommissionTier,
  updateCommissionTier,
  uploadPromoMaterial,
} from '../services/adminService';

const messages = {
  stats: 'statistics',
  error: 'An error occurred',
  dataNotFound: 'No data found',
  regionStats: 'Region statistics retrieved successfully'
};

const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];

interface CustomRequest extends Request {
  user?: {
    id: string;
    role: number;
  };
}

export const getAllPlayersController = async (req: CustomRequest, res: Response) => {
  try {
    if (!req.user?.id || req.user.role !== 1) {
      return sendErrorResponse(res, 401, 'Unauthorized access');
    }

    const players = await getAllPlayers();
    res.status(200).json({
      success: true,
      data: players,
    });
  } catch (error) {
    console.error('Get all players error:', error);
    sendErrorResponse(
      res,
      500,
      error instanceof Error ? error.message : 'Failed to get players',
    );
  }
};

export const getPlayerDetailsController = async (req: CustomRequest, res: Response) => {
  try {
    if (!req.user?.id || req.user.role !== 1) {
      return sendErrorResponse(res, 401, 'Unauthorized access');
    }

    const { userId } = req.params;
    const playerDetails = await getPlayerDetails(userId);

    res.status(200).json({
      success: true,
      data: playerDetails,
    });
  } catch (error) {
    console.error('Get player details error:', error);
    sendErrorResponse(
      res,
      500,
      error instanceof Error ? error.message : 'Failed to get player details',
    );
  }
};

export const getPlayerStats = async (req: Request, res: Response) => {
  try {
    const { filter } = req.query;

    const now = moment();
    const startOfYear = now.clone().startOf('year');
    const endOfYear = now.clone().endOf('year');
    const startOfMonth = now.clone().startOf('month');
    const endOfMonth = now.clone().endOf('month');
    const startOfWeek = now.clone().startOf('isoWeek');
    const endOfWeek = now.clone().endOf('isoWeek');
    const startOfDay = now.clone().startOf('day');
    const endOfDay = now.clone().endOf('day');

    let dateFilter = { $gte: startOfYear.toDate(), $lte: endOfYear.toDate() };

    if (filter === 'monthly') {
      dateFilter = { $gte: startOfMonth.toDate(), $lte: endOfMonth.toDate() };
    } else if (filter === 'weekly') {
      dateFilter = { $gte: startOfWeek.toDate(), $lte: endOfWeek.toDate() };
    } else if (filter === 'daily') {
      dateFilter = { $gte: startOfDay.toDate(), $lte: endOfDay.toDate() };
    }

    const players = await Player.find({
      created_at: dateFilter,
      role_id: 0,
      is_verified: 1,
      status: 1,
    }).select('created_at');

    if (filter === 'daily') {
      return res.status(200).json({
        success: true,
        message: `Daily ${messages.stats}`,
        data: { activePlayersToday: players.length },
      });
    }

    if (filter === 'weekly') {
      const weeklyStats = Array(7).fill(0);
      players.forEach((player) => {
        const dayIndex = moment(player.created_at).isoWeekday() - 1;
        weeklyStats[dayIndex] += 1;
      });
      const statsWithDays = daysOfWeek.map((day, index) => ({
        day,
        activePlayers: weeklyStats[index],
      }));
      return res.status(200).json({
        success: true,
        message: `Weekly ${messages.stats}`,
        data: { activePlayersPerDay: statsWithDays },
      });
    }

    if (filter === 'monthly') {
      const daysInMonth = moment().daysInMonth();
      const monthlyStats = Array(daysInMonth).fill(0);
      players.forEach((player) => {
        const dayIndex = moment(player.created_at).date() - 1;
        monthlyStats[dayIndex] += 1;
      });
      const statsWithDays = Array.from({ length: daysInMonth }, (_, index) => ({
        day: index + 1,
        activePlayers: monthlyStats[index],
      }));
      return res.status(200).json({
        success: true,
        message: `Monthly ${messages.stats}`,
        data: { activePlayersPerDayInMonth: statsWithDays },
      });
    }

    if (filter === 'quarterly') {
      const quarterlyStats = [0, 0, 0, 0];
      players.forEach((player) => {
        const month = moment(player.created_at).month();
        const quarter = Math.floor(month / 3);
        quarterlyStats[quarter] += 1;
      });
      const statsWithQuarters = quarters.map((quarter, index) => ({
        quarter,
        activePlayers: quarterlyStats[index],
      }));
      return res.status(200).json({
        success: true,
        message: `Quarterly ${messages.stats}`,
        data: { activePlayersPerQuarter: statsWithQuarters },
      });
    }

    const monthlyStats = Array(12).fill(0);
    players.forEach((player) => {
      const month = moment(player.created_at).month();
      monthlyStats[month] += 1;
    });
    const statsWithMonths = months.map((month, index) => ({
      month,
      activePlayers: monthlyStats[index],
    }));

    return res.status(200).json({
      success: true,
      message: `Yearly ${messages.stats}`,
      data: { activePlayersPerMonth: statsWithMonths },
    });
  } catch (error) {
    sendErrorResponse(
      res,
      400,
      error instanceof Error ? error.message : messages.error,
    );
  }
};

export const getPlayerRegionStats = async (req: Request, res: Response) => {
  try {
    const playerStats = await Player.aggregate([
      { $match: { is_verified: 1, status: 1 } },
      { $group: { _id: '$country', playerCount: { $sum: 1 } } },
      {
        $facet: {
          totalPlayers: [
            { $group: { _id: null, total: { $sum: '$playerCount' } } },
          ],
          countryStats: [
            { $project: { country: '$_id', playerCount: 1, _id: 0 } },
          ],
        },
      },
      { $unwind: '$totalPlayers' },
      {
        $project: {
          countryStats: {
            $map: {
              input: '$countryStats',
              as: 'stat',
              in: {
                label: { $concat: ['$$stat.country', ' Players'] },
                value: '$$stat.playerCount',
              },
            },
          },
        },
      },
    ]);

    if (!playerStats.length) {
      return res.status(200).json({
        success: true,
        message: messages.dataNotFound,
        data: [],
      });
    }

    return res.status(200).json({
      success: true,
      message: messages.regionStats,
      data: playerStats[0].countryStats || [],
    });
  } catch (error) {
    sendErrorResponse(
      res,
      400,
      error instanceof Error ? error.message : messages.error,
    );
  }
};

export const updatePlayerStatus = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;

    if (status !== 0 && status !== 1) {
      return sendErrorResponse(
        res,
        400,
        'Invalid status value. Status must be 0 (inactive) or 1 (active)',
      );
    }

    const player = await Player.findByIdAndUpdate(
      userId,
      { status },
      { new: true },
    );
    if (!player) {
      return sendErrorResponse(res, 404, 'Player not found');
    }

    res.status(200).json({
      success: true,
      message: 'Player status updated successfully',
      data: { id: player._id, status: player.status },
    });
  } catch (error) {
    sendErrorResponse(
      res,
      500,
      error instanceof Error ? error.message : 'Failed to update player status',
    );
  }
};

export const deletePlayer = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const player = await Player.findByIdAndDelete(userId);
    if (!player) {
      return sendErrorResponse(res, 404, 'Player not found');
    }

    res.status(200).json({
      success: true,
      message: 'Player deleted successfully',
      data: { id: player._id },
    });
  } catch (error) {
    sendErrorResponse(
      res,
      500,
      error instanceof Error ? error.message : 'Failed to delete player',
    );
  }
};

export const getAdminNotifications = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await getNotifications(page, limit);
    res.status(200).json({
      success: true,
      message: 'Notifications retrieved successfully',
      data: result,
    });
  } catch (error) {
    sendErrorResponse(
      res,
      500,
      error instanceof Error ? error.message : 'Failed to fetch notifications',
    );
  }
};

export const updatePayoutStatusController = async (req: CustomRequest, res: Response) => {
  try {
    if (!req.user?.id || req.user.role !== 1) {
      return sendErrorResponse(res, 401, 'Unauthorized access');
    }

    const { payoutId } = req.params;
    const { status } = req.body;

    await updatePayoutStatus(payoutId, status);

    res.status(200).json({
      success: true,
      message: 'Payout status updated successfully',
    });
  } catch (error) {
    console.error('Update payout status error:', error);
    sendErrorResponse(
      res,
      500,
      error instanceof Error ? error.message : 'Failed to update payout status',
    );
  }
};

export const getAllPayouts = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string;

    const query: any = {};
    if (status) query.status = status;

    const payouts = await Payout.find(query)
      .populate('affiliateId', 'email firstname lastname')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('affiliateId amount currency status createdAt');

    const total = await Payout.countDocuments(query);

    res.json({
      payouts: payouts.map((payout) => ({
        payoutId: payout._id,
        affiliate: {
          id: (payout.affiliateId as any)._id,
          email: (payout.affiliateId as any).email,
          name: `${(payout.affiliateId as any).firstname} ${(payout.affiliateId as any).lastname}`,
        },
        amount: payout.amount,
        currency: payout.currency,
        status: payout.status,
        requestedAt: payout.createdAt,
      })),
      pagination: {
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Server error', error: (error as Error).message });
  }
};

export const createCommissionTierController = async (req: CustomRequest, res: Response) => {
  try {
    if (!req.user?.id || req.user.role !== 1) {
      return sendErrorResponse(res, 401, 'Unauthorized access');
    }

    const { name, minPlayers, commissionRate } = req.body;
    const tier = await createCommissionTier({ tierName: name, minReferrals: minPlayers, commissionRate, currency: 'USD' });

    res.status(201).json({
      success: true,
      data: tier,
    });
  } catch (error) {
    console.error('Create commission tier error:', error);
    sendErrorResponse(
      res,
      500,
      error instanceof Error ? error.message : 'Failed to create commission tier',
    );
  }
};

export const updateCommissionTierController = async (req: CustomRequest, res: Response) => {
  try {
    if (!req.user?.id || req.user.role !== 1) {
      return sendErrorResponse(res, 401, 'Unauthorized access');
    }

    const { tierId } = req.params;
    const { name, minPlayers, commissionRate } = req.body;
    const tier = await updateCommissionTier(tierId, { tierName: name, minReferrals: minPlayers, commissionRate });

    res.status(200).json({
      success: true,
      data: tier,
    });
  } catch (error) {
    console.error('Update commission tier error:', error);
    sendErrorResponse(
      res,
      500,
      error instanceof Error ? error.message : 'Failed to update commission tier',
    );
  }
};

export const uploadPromoMaterialController = async (req: CustomRequest, res: Response) => {
  try {
    if (!req.user?.id || req.user.role !== 1) {
      return sendErrorResponse(res, 401, 'Unauthorized access');
    }

    if (!req.file) {
      return sendErrorResponse(res, 400, 'No file uploaded');
    }

    const { type, dimensions } = req.body;
    if (!['banner', 'logo', 'video'].includes(type)) {
      return sendErrorResponse(res, 400, 'Invalid material type. Must be banner, logo, or video');
    }

    const material = await uploadPromoMaterial(req.file, { type, dimensions });

    res.status(201).json({
      success: true,
      data: material,
    });
  } catch (error) {
    console.error('Upload promo material error:', error);
    sendErrorResponse(
      res,
      500,
      error instanceof Error ? error.message : 'Failed to upload promo material',
    );
  }
}; 