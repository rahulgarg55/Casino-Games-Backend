import mongoose from 'mongoose';
import { Request, Response } from 'express';
import * as authService from '../services/authService';
import { generateTokenResponse } from '../utils/auth';
import passport from 'passport';
import { generateResetToken, getNotifications } from '../services/authService';
import { resetPassword as resetPasswordService } from '../services/authService';
import cloudinary from '../utils/cloudinary';
import Player, { IPlayer } from '../models/player';
import PlayerBalance, { IPlayerBalance } from '../models/playerBalance';
import Notification, { NotificationType } from '../models/notification';
import { STATUS, VERIFICATION } from '../constants';
import Click from '../models/click';
import Payout from '../models/payout';
import ReferralLink from '../models/referralLink';
import PromoMaterial from '../models/promoMaterial';
import { Parser } from 'json2csv';
import PDFDocument from 'pdfkit';
import { sendEmail } from '../utils/sendEmail';
import CommissionTier from '../models/comissionTier';
import crypto from 'crypto';
import {
  sendVerificationEmail,
  sendStatusUpdateEmail,
} from '../utils/sendEmail';
import bcrypt from 'bcryptjs';
import moment from 'moment';
import { messages } from '../utils/messages';
import { months, quarters, daysOfWeek } from '../utils/constant';
import { StripeConfig } from '../models/stripeConfig';
import { Affiliate } from '../models/affiliate';
import Transaction, { ITransaction } from '../models/transaction';
import {
  initiateSumsubVerification,
  updateSumsubStatus,
} from '../services/authService';
import { validateWebhookSignature } from '../utils/sumsub';
const allowedStatuses = ['Active', 'Inactive', 'Banned'] as const;

interface CustomRequest extends Request {
  user?: {
    sub: string;
    id: string;
    role: number;
  };
}

const ensureAffiliate = (user: any) => {
  if (!user || (user.role_id !== undefined && user.role_id !== 2)) {
    throw new Error('Access denied: Affiliate account required');
  }
};

export const sendErrorResponse = (
  res: Response,
  statusCode: number,
  message: string | Array<{ param?: string; message: string }>,
) => {
  const response = {
    success: false,
    ...(typeof message === 'string' ? { error: message } : { errors: message }),
  };
  res.status(statusCode).json(response);
};

export const register = async (req: Request, res: Response) => {
  try {
    const { player, balance, token, expiresIn } = await authService.register(
      req.body,
    );
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: player._id,
          username: player.username,
          fullname: player.fullname,
          email: player.email,
          phone_number: player.phone_number,
          role_id: player.role_id,
          created_at: player.created_at,
          gender: player.gender,
          language: player.language,
          country: player.country,
          city: player.city,
          status: player.status,
          is_verified: player.is_verified,
          is_2fa_enabled: player.is_2fa_enabled,
          balance: balance.balance,
          currency: player.currency,
          referredBy: player.referredBy,
          referredByName: player.referredByName,
        },
        token,
        expiresIn,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Username is already taken')) {
        sendErrorResponse(res, 409, [
          { param: 'username', message: 'Username is already taken' },
        ]);
      } else if (error.message.includes('Email is already registered')) {
        sendErrorResponse(res, 409, [
          { param: 'email', message: 'Email is already registered' },
        ]);
      } else if (error.message.includes('Phone number is already registered')) {
        sendErrorResponse(res, 409, [
          {
            param: 'phone_number',
            message: 'Phone number is already registered',
          },
        ]);
      } else {
        sendErrorResponse(res, 400, error.message);
      }
    } else {
      sendErrorResponse(res, 400, 'Invalid request. Please check your input');
    }
  }
};

export const affiliateRegister = async (req: Request, res: Response) => {
  try {
    const { user, token } = await authService.affiliateRegister(req.body);

    res.status(201).json({
      success: true,
      message: 'Affiliate registration successful',
      data: {
        user,
        token,
        expiresIn: 28800,
      },
    });
  } catch (error) {
    sendErrorResponse(
      res,
      400,
      error instanceof Error ? error.message : 'Registration failed',
    );
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { user, token } = await authService.login(req.body);

    if (user.requires2FA) {
      await authService.initiate2FA(user.id);
      return res.status(200).json({
        success: true,
        message: 'OTP sent for 2FA verification',
        data: { requires2FA: true, playerId: user.id },
      });
    }
    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          ...user,
          gender: user.gender,
          language: user.language,
          country: user.country,
          city: user.city,
        },
        token,
        expiresIn: 28800,
      },
    });
  } catch (error) {
    sendErrorResponse(
      res,
      401,
      error instanceof Error ? error.message : 'Invalid username or password',
    );
  }
};

export const affiliateLogin = async (req: Request, res: Response) => {
  try {
    const { user, token } = await authService.affiliateLogin(req.body);

    res.status(200).json({
      success: true,
      message: 'Affiliate login successful',
      data: {
        user: {
          ...user,
          gender: user.gender,
          language: user.language,
          country: user.country,
          city: user.city,
        },
        token,
        expiresIn: 28800,
      },
    });
  } catch (error) {
    sendErrorResponse(
      res,
      401,
      error instanceof Error ? error.message : 'Invalid credentials',
    );
  }
};

export const verify2FA = async (req: Request, res: Response) => {
  try {
    const { playerId, otp } = req.body;
    if (!playerId || !otp) {
      return sendErrorResponse(res, 400, 'Player ID and OTP are required');
    }
    const { token, expiresIn, user } = await authService.verify2FA(
      playerId,
      otp,
    );

    res.status(200).json({
      success: true,
      message: '2FA verification successful',
      data: { user, token, expiresIn },
    });
  } catch (error) {
    sendErrorResponse(
      res,
      401,
      error instanceof Error ? error.message : 'Invalid OTP',
    );
  }
};

export const toggle2FA = async (req: CustomRequest, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return sendErrorResponse(res, 401, 'Authentication required');
    }
    const { enabled, method, password } = req.body;
    if (typeof enabled !== 'boolean' || !method || !password) {
      return sendErrorResponse(
        res,
        400,
        'Enabled, method, and password are required',
      );
    }
    const result = await authService.toggle2FA(
      req.user.id,
      enabled,
      method,
      password,
    );

    res.status(200).json({
      success: true,
      message: `2FA ${enabled ? 'enabled' : 'disabled'} successfully`,
      data: result,
    });
  } catch (error) {
    sendErrorResponse(
      res,
      500,
      error instanceof Error ? error.message : 'Failed to toggle 2FA',
    );
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email, phone_number } = req.body;
    if (!email && !phone_number) {
      return sendErrorResponse(
        res,
        400,
        'Please provide either email or phone number',
      );
    }
    await authService.forgotPassword({ email, phone_number });

    res.status(200).json({
      success: true,
      message: 'Password reset link has been sent to your email',
    });
  } catch (error) {
    sendErrorResponse(
      res,
      400,
      error instanceof Error
        ? error.message
        : 'Failed to process password reset',
    );
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return sendErrorResponse(res, 400, 'Token and password are required');
    }
    await resetPasswordService({ token, password });

    res.status(200).json({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (error) {
    sendErrorResponse(
      res,
      400,
      error instanceof Error ? error.message : 'Invalid or expired reset token',
    );
  }
};

export const viewProfile = async (req: CustomRequest, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return sendErrorResponse(res, 401, 'Authentication required');
    }

    const playerId = req.user.id;
    const player = await Player.findById(playerId).select([
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
    ]);

    if (!player) {
      return sendErrorResponse(res, 404, 'User not found');
    }

    const balance = await PlayerBalance.findOne({ player_id: playerId });

    res.status(200).json({
      success: true,
      message: 'User profile retrieved successfully',
      data: {
        user: {
          ...player.toObject(),
          balance: balance?.balance || 0,
          is_2fa_enabled: player.is_2fa_enabled,
          two_factor_method: player.two_factor_method,
        },
      },
    });
  } catch (error) {
    console.error('Error in viewProfile:', error);
    sendErrorResponse(
      res,
      400,
      error instanceof Error ? error.message : 'Failed to retrieve profile',
    );
  }
};

export const getAllPlayers = async (req: Request, res: Response) => {
  try {
    const players = await Player.find({ role_id: 0 }) // Only get non-admin users
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

    res.status(200).json({
      success: true,
      message: 'Players retrieved successfully',
      data: { players: playersWithBalance },
    });
  } catch (error) {
    sendErrorResponse(
      res,
      400,
      error instanceof Error ? error.message : 'Failed to retrieve players',
    );
  }
};

export const getPlayerDetails = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return sendErrorResponse(res, 400, 'Invalid user ID format');
    }

    const player = (await Player.findById(userId)
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
      .lean()) as IPlayer | null;

    if (!player) {
      return sendErrorResponse(res, 404, 'Player not found');
    }

    const balance = (await PlayerBalance.findOne({
      player_id: userId,
    }).lean()) as IPlayerBalance | null;

    const currencyMap = { 0: 'USD', 1: 'INR', 2: 'GBP' };
    const playerCurrency = currencyMap[player.currency];

    const transactionStats = await Transaction.aggregate([
      {
        $match: {
          player_id: new mongoose.Types.ObjectId(userId),
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
          player_id: new mongoose.Types.ObjectId(userId),
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

    const playerData = {
      ...player,
      balance: balance?.balance || player.balance || 0,
      bonus_balance: bonusBalance,
      total_deposits: totalDeposits,
      total_withdrawals: totalWithdrawals,
      last_deposit_date: lastDepositDate,
      last_withdrawal_date: lastWithdrawalDate,
      is_2fa: player.is_2fa_enabled,
    };

    res.status(200).json({
      success: true,
      message: 'Player details retrieved successfully',
      data: { player: playerData },
    });
  } catch (error) {
    console.error('Error in getPlayerDetails:', error);
    sendErrorResponse(
      res,
      500,
      error instanceof Error
        ? `Server error: ${error.message}`
        : 'Failed to retrieve player details',
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

export const updateProfile = async (req: CustomRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return sendErrorResponse(res, 401, 'Authentication required');
    }

    const playerId = req.user.id;
    const updateData = req.body;

    const currentPlayer = await Player.findById(playerId);
    if (!currentPlayer) {
      return sendErrorResponse(res, 404, 'Player not found');
    }

    const errors: Array<{ param: string; message: string }> = [];

    // Only check for username and phone conflicts
    if (
      updateData.phone_number &&
      updateData.phone_number !== currentPlayer.phone_number
    ) {
      const phoneExists = await Player.exists({
        phone_number: updateData.phone_number,
        _id: { $ne: playerId },
      });
      if (phoneExists) {
        errors.push({
          param: 'phone_number',
          message: 'Phone number already in use',
        });
      }
    }

    if (updateData.username && updateData.username !== currentPlayer.username) {
      const usernameExists = await Player.exists({
        username: updateData.username,
        _id: { $ne: playerId },
      });
      if (usernameExists) {
        errors.push({ param: 'username', message: 'Username already in use' });
      }
    }

    if (errors.length > 0) {
      return sendErrorResponse(res, 409, errors);
    }

    const updatedPlayer = await authService.updateProfile(playerId, updateData);
    const balance = await PlayerBalance.findOne({ player_id: playerId });

    res.status(200).json({
      success: true,
      message:
        updateData.email && updateData.email !== currentPlayer.email
          ? 'Verification email sent to your new email address. Please verify to complete the update.'
          : 'Profile updated successfully',
      data: {
        user: {
          ...updatedPlayer,
          balance: balance?.balance || 0,
          is_2fa_enabled: updatedPlayer.is_2fa_enabled,
          logoutRequired: updatedPlayer.logoutRequired || false,
        },
      },
    });
  } catch (error) {
    console.error('Profile update error:', error);
    const statusCode = error.name === 'ValidationError' ? 400 : 500;
    sendErrorResponse(
      res,
      statusCode,
      error instanceof Error ? error.message : 'Failed to update profile',
    );
  }
};

export const uploadPhoto = async (req: CustomRequest, res: Response) => {
  try {
    if (!req.file) {
      return sendErrorResponse(res, 400, 'No photo provided');
    }
    if (!req.user?.id) {
      return sendErrorResponse(res, 401, 'Authentication required');
    }

    const playerId = req.user.id;
    const player = await Player.findById(playerId);
    if (!player) {
      return sendErrorResponse(res, 404, 'User not found');
    }

    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'player_photos',
    });
    player.photo = result.secure_url;
    await player.save();

    res.status(200).json({
      success: true,
      message: 'Photo uploaded successfully',
      data: { photo: player.photo },
    });
  } catch (error) {
    sendErrorResponse(
      res,
      400,
      error instanceof Error ? error.message : 'Failed to upload photo',
    );
  }
};

export const googleLogin = passport.authenticate('google', {
  scope: ['profile', 'email'],
});

export const googleCallback = (req: Request, res: Response) => {
  passport.authenticate('google', { session: false }, (err: any, user: any) => {
    if (err || !user) {
      let errorMessage = err?.message || 'Authentication failed';
      console.error('Google Callback Authentication Error:', err);
      if (err?.code) {
        errorMessage += ` (Error Code: ${err.code})`;
      }
      return res.redirect(
        `${process.env.CLIENT_URL}/login?error=${encodeURIComponent(errorMessage)}`,
      );
    }

    res.redirect(
      `${process.env.CLIENT_URL}/login?token=${user.token}&expiresIn=${user.expiresIn}`,
    );
  })(req, res);
};

export const facebookLogin = passport.authenticate('facebook', {
  scope: ['email'],
});

export const facebookCallback = (req: Request, res: Response) => {
  passport.authenticate(
    'facebook',
    { session: false },
    (err: any, user: any) => {
      if (err) {
        return res.redirect(
          `${process.env.CLIENT_URL}/login?error=${encodeURIComponent('An unexpected error occurred')}`,
        );
      }
      if (!user) {
        return res.redirect(
          `${process.env.CLIENT_URL}/login?error=${encodeURIComponent('Invalid credentials')}`,
        );
      }
      res.redirect(
        `${process.env.CLIENT_URL}/login?token=${user.token}&expiresIn=${user.expiresIn}`,
      );
    },
  )(req, res);
};

export const verifyEmail = async (req: Request, res: Response) => {
  const { token } = req.query;
  if (!token || typeof token !== 'string') {
    return sendErrorResponse(res, 400, 'Invalid or missing token');
  }

  try {
    const player = await Player.findOne({
      verification_token: token,
      verification_token_expires: { $gt: new Date() },
      //   $or: [
      //     { new_email: { $exists: false } },
      //     { new_email: null },
      //     { new_email: { $exists: true, $ne: null } },
      //   ],
      // });

      // email: { $exists: true, $ne: null },
    });

    if (!player) {
      return sendErrorResponse(res, 400, 'Invalid or expired token');
    }
    if (player.new_email) {
      player.email = player.new_email;
      player.new_email = undefined;
    }

    player.is_verified = VERIFICATION.VERIFIED;
    player.email_verified = true;
    player.verification_token = undefined;
    player.verification_token_expires = undefined;
    player.refreshToken = undefined;

    await player.save();

    res.status(200).json({
      success: true,
      message: 'Email verified successfully. Please login with your new email.',
      redirectUrl: `${process.env.CLIENT_URL}/login`,
    });
  } catch (error) {
    sendErrorResponse(
      res,
      400,
      error instanceof Error ? error.message : 'Failed to verify email',
    );
  }
};

export const resendVerificationEmail = async (req: Request, res: Response) => {
  const { email } = req.body;

  try {
    if (!email) {
      return sendErrorResponse(res, 400, 'Email is required');
    }

    // Log the incoming email for debugging
    console.log(`Resend verification email requested for: ${email}`);

    const player = await Player.findOne({
      $or: [{ email: email }, { new_email: email }],
    });

    if (!player) {
      console.log(`No player found for email: ${email}`);
      return sendErrorResponse(
        res,
        404,
        'No account found with this email address',
      );
    }

    // If email is already verified and no new_email is pending, no need to resend
    if (player.email_verified && !player.new_email) {
      return sendErrorResponse(res, 400, 'Email is already verified');
    }

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    player.verification_token = verificationToken;
    player.verification_token_expires = new Date(Date.now() + 3600000); // 1 hour
    await player.save();

    // Send verification email to new_email if set, otherwise current email
    const targetEmail = player.new_email || player.email;
    console.log(`Sending verification email to: ${targetEmail}`);
    await sendVerificationEmail(targetEmail, verificationToken);

    res.status(200).json({
      success: true,
      message: 'Verification email has been sent',
      data: { verification_token: verificationToken },
    });
  } catch (error) {
    console.error('Error in resendVerificationEmail:', error);
    sendErrorResponse(
      res,
      400,
      error instanceof Error
        ? error.message
        : 'Failed to resend verification email',
    );
  }
};

export const verifyPhone = async (req: Request, res: Response) => {
  try {
    const { phone_number, code } = req.body;
    if (!phone_number || !code) {
      return sendErrorResponse(res, 400, 'Phone number and code are required');
    }

    await authService.verifyPhoneNumber(phone_number, code);
    res.status(200).json({
      success: true,
      message: 'Phone number verified successfully',
    });
  } catch (error) {
    sendErrorResponse(
      res,
      400,
      error instanceof Error ? error.message : 'Phone verification failed',
    );
  }
};

export const verifyOTP = async (req: Request, res: Response) => {
  try {
    const { playerId, otp } = req.body;
    if (!playerId || !otp) {
      return sendErrorResponse(res, 400, 'Player ID and OTP are required');
    }

    const { token, expiresIn, user } = await authService.verifyOTP(
      playerId,
      otp,
    );

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
      data: { user, token, expiresIn },
    });
  } catch (error) {
    sendErrorResponse(
      res,
      401,
      error instanceof Error ? error.message : 'Invalid OTP',
    );
  }
};

export const updateCookieConsent = async (req: Request, res: Response) => {
  try {
    const { playerId, consent } = req.body;
    if (!playerId || consent === undefined) {
      return sendErrorResponse(res, 400, 'Player ID and consent are required');
    }

    const player = await Player.findById(playerId);
    if (!player) {
      return sendErrorResponse(res, 404, 'Player not found');
    }

    player.cookieConsent = consent;
    await player.save();

    res.status(200).json({
      success: true,
      message: 'Cookie consent updated successfully',
      data: { playerId: player._id, cookieConsent: player.cookieConsent },
    });
  } catch (error) {
    sendErrorResponse(
      res,
      500,
      error instanceof Error
        ? error.message
        : 'Failed to update cookie consent',
    );
  }
};

export const changePassword = async (req: CustomRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  const playerId = req.user?.id;

  try {
    if (!playerId) {
      return sendErrorResponse(res, 401, 'Authentication required');
    }

    if (!currentPassword || !newPassword) {
      return sendErrorResponse(
        res,
        400,
        'Both current and new passwords are required',
      );
    }

    if (newPassword.length < 8 || !/\d/.test(newPassword)) {
      return sendErrorResponse(
        res,
        400,
        'Password must be at least 8 characters long and include a number',
      );
    }

    const player = await Player.findById(playerId).select('+password_hash');
    if (!player) {
      return sendErrorResponse(res, 404, 'Player not found');
    }

    const isMatch = await bcrypt.compare(currentPassword, player.password_hash);
    if (!isMatch) {
      return sendErrorResponse(res, 400, 'Current password is incorrect');
    }

    const isSamePassword = await bcrypt.compare(
      newPassword,
      player.password_hash,
    );
    if (isSamePassword) {
      return sendErrorResponse(
        res,
        400,
        'New password must be different from current password',
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    player.password_hash = hashedPassword;
    await player.save();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    console.error('Error changing password:', error);
    sendErrorResponse(
      res,
      500,
      error instanceof Error ? error.message : 'Failed to change password',
    );
  }
};

export const geStripeConfig = async (req: Request, res: Response) => {
  try {
    const existingConfig = await StripeConfig.findOne();

    if (!existingConfig) {
      return res.status(404).json({
        success: false,
        message: messages.stripeConfigNotFound,
      });
    }

    return res.status(200).json({
      success: true,
      message: messages.stripeConfigFound,
      data: existingConfig,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: messages.error,
    });
  }
};

export const updateStripeConfig = async (req: Request, res: Response) => {
  try {
    const updateData = req.body;

    // Find existing record
    const existingConfig = await StripeConfig.findOne();

    if (!existingConfig) {
      return res.status(404).json({
        success: false,
        message: messages.stripeConfigNotFound,
      });
    }

    // Merge new updates while keeping existing values
    const updatedData = { ...existingConfig.toObject(), ...updateData };

    const updatedStripeConfig = await StripeConfig.findByIdAndUpdate(
      existingConfig._id,
      { $set: updatedData },
      { new: true },
    );

    return res.status(200).json({
      success: true,
      message: messages.stripeConfigUpdated,
      data: updatedStripeConfig,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: messages.error,
    });
  }
};

export const getAffliateUsers = async (req: Request, res: Response) => {
  try {
    const affiliateUserList = await Affiliate.find()
      .sort({ createdAt: -1 })
      .select('-password');

    const totalAffiliates = await Affiliate.countDocuments();

    if (!affiliateUserList.length) {
      return res.status(404).json({
        success: false,
        message: messages.dataNotFound,
      });
    }

    return res.status(200).json({
      success: true,
      message: messages.affiliateUserList,
      data: {
        total: totalAffiliates,
        data: affiliateUserList,
      },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: messages.error,
    });
  }
};

export const updateAffliateUsersStatus = async (
  req: Request,
  res: Response,
) => {
  try {
    const id = req.params.id;
    const status = req.query.status;

    // Check if status is provided
    if (!status) {
      return res.status(400).json({
        success: false,
        message: messages.statusRequired,
      });
    }

    const statusString = Number(status);

    // Find Affiliate user
    const affiliateUser = await Affiliate.findById(id);
    if (!affiliateUser) {
      return res.status(404).json({
        success: false,
        message: messages.invalidAffiliateId,
      });
    }

    // Update status
    const updatedAffiliate = await Affiliate.findByIdAndUpdate(
      id,
      { status: statusString },
      { new: true },
    );

    if (!updatedAffiliate) {
      return res.status(400).json({
        success: false,
        message: messages.failedToUpdateAffiliateStatus,
      });
    }

    const newStatus =
      updatedAffiliate.status === 1
        ? 'Active'
        : updatedAffiliate.status === 0
          ? 'InActive'
          : 'Banned';

    /*Send update status email by Admin*/
    await sendStatusUpdateEmail(
      updatedAffiliate.email,
      newStatus,
      updatedAffiliate.firstname,
    );

    return res.status(200).json({
      success: true,
      message: messages.updateAffiliateUserStatus,
      data: {},
    });
  } catch (error) {
    console.error('Error updating affiliate status:', error);
    return res.status(500).json({
      success: false,
      message: messages.error,
    });
  }
};
export const getAffliateUsersDetails = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;

    // Find Affiliate user
    const affiliateUser = await Affiliate.findById(id).select('-password');

    if (!affiliateUser) {
      return res.status(404).json({
        success: false,
        message: messages.invalidAffiliateId,
      });
    }
    const referredPlayers = await Player.find({
      referredBy: affiliateUser._id,
      is_verified: 1,
      status: STATUS.ACTIVE,
    }).sort({ created_at: -1 });

    const referredPlayersCount = await Player.countDocuments({
      referredBy: affiliateUser._id,
    });

    return res.status(200).json({
      success: true,
      message: messages.affiliateFound,
      data: {
        affiliateUser,
        referredPlayers: referredPlayers || [],
        referredPlayersCount: referredPlayersCount || 0,
      },
    });
  } catch (error) {
    console.error('Error get affiliate user details:', error);
    return res.status(500).json({
      success: false,
      message: messages.error,
    });
  }
};
export const updateAffliateUsersDetails = async (
  req: Request,
  res: Response,
) => {
  try {
    const user = req.user as { id: string };
    const id = user.id;

    // Find Affiliate user
    const affiliateUser = await Affiliate.findById(id);
    if (!affiliateUser) {
      return res.status(404).json({
        success: false,
        message: messages.invalidAffiliateId,
      });
    }

    const {
      firstname,
      lastname,
      country,
      promotionMethod,
      hearAboutUs,
      status,
      marketingEmailsOptIn,
      phonenumber,
    } = req.body;

    // Directly update fields on the fetched document
    affiliateUser.firstname = firstname || affiliateUser.firstname;
    affiliateUser.lastname = lastname || affiliateUser.lastname;
    affiliateUser.country = country || affiliateUser.country;
    affiliateUser.promotionMethod =
      promotionMethod || affiliateUser.promotionMethod;
    affiliateUser.hearAboutUs = hearAboutUs || affiliateUser.hearAboutUs;
    affiliateUser.status = status || affiliateUser.status;
    affiliateUser.phonenumber = phonenumber || affiliateUser.phonenumber;
    affiliateUser.marketingEmailsOptIn =
      marketingEmailsOptIn !== undefined
        ? marketingEmailsOptIn
        : affiliateUser.marketingEmailsOptIn;

    // Save the updated document
    const updatedAffiliate = await affiliateUser.save();

    if (!updatedAffiliate) {
      return res.status(400).json({
        success: false,
        message: messages.failedToUpdateAffiliate,
      });
    }

    return res.status(200).json({
      success: true,
      message: messages.updateAffiliateUser,
      data: {},
    });
  } catch (error) {
    console.error('Error updating affiliate:', error);
    return res.status(500).json({
      success: false,
      message: messages.error,
    });
  }
};

export const affiliatelogin = async (req: Request, res: Response) => {
  try {
    const { user, token } = await authService.loginAffiliate(req.body);

    res.status(200).json({
      success: true,
      message: messages.login,
      data: {
        user,
        token,
        expiresIn: 28800,
      },
    });
  } catch (error) {
    sendErrorResponse(
      res,
      401,
      error instanceof Error ? error.message : 'Invalid username or password',
    );
  }
};

export const startSumsubVerification = async (
  req: CustomRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return sendErrorResponse(res, 401, 'Authentication required');
    }

    const tokenResponse = await initiateSumsubVerification(req.user.id);

    res.status(200).json({
      success: true,
      message: 'Sumsub verification initiated successfully',
      data: {
        accessToken: tokenResponse.token,
        externalUserId: tokenResponse.userId,
      },
    });
  } catch (error) {
    console.error('Sumsub verification error:', error);
    sendErrorResponse(
      res,
      400,
      error instanceof Error
        ? error.message
        : 'Failed to initiate Sumsub verification',
    );
  }
};

export const sumsubWebhook = async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-payload-signature'] as string;
    if (!signature) {
      return sendErrorResponse(res, 400, 'Missing webhook signature');
    }

    if (!validateWebhookSignature(req.body, signature)) {
      return sendErrorResponse(res, 401, 'Invalid webhook signature');
    }

    const { applicantId, reviewStatus, reviewResult } = req.body;
    if (!applicantId || !reviewStatus) {
      return sendErrorResponse(res, 400, 'Invalid webhook payload');
    }

    const player = await Player.findOne({ sumsub_id: applicantId });
    if (!player) {
      return sendErrorResponse(res, 404, 'Player not found');
    }

    const status =
      reviewStatus === 'completed' && reviewResult?.reviewAnswer === 'GREEN'
        ? 'approved'
        : 'rejected';
    await updateSumsubStatus(player._id.toString(), status);

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
    });
  } catch (error) {
    console.error('Webhook error:', error);
    sendErrorResponse(
      res,
      500,
      error instanceof Error
        ? error.message
        : 'Failed to process Sumsub webhook',
    );
  }
};

export const addAffliateUsers = async (req: Request, res: Response) => {
  try {
    const AffiliateUserData = await authService.registerAffiliate(req.body);
    res.status(200).json({
      success: true,
      message: messages.registerAffiliate,
      data: AffiliateUserData || {},
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Username is already taken')) {
        sendErrorResponse(res, 409, [
          { param: 'username', message: 'Username is already taken' },
        ]);
      } else if (error.message.includes('Email is already registered')) {
        sendErrorResponse(res, 409, [
          { param: 'email', message: 'Email is already registered' },
        ]);
      } else if (error.message.includes('Phone number is already registered')) {
        sendErrorResponse(res, 409, [
          {
            param: 'phone_number',
            message: 'Phone number is already registered',
          },
        ]);
      } else {
        sendErrorResponse(res, 400, error.message);
      }
    } else {
      sendErrorResponse(res, 400, 'Invalid request. Please check your input');
    }
  }
};

export const verifyAffiliateEmail = async (req: Request, res: Response) => {
  const { token } = req.query;
  if (!token || typeof token !== 'string') {
    return sendErrorResponse(res, 400, 'Invalid or missing token');
  }

  try {
    const affiliate = await Affiliate.findOne({
      verification_token: token,
      verification_token_expires: { $gt: new Date() },
    });

    if (!affiliate) {
      return sendErrorResponse(res, 400, 'Invalid or expired token');
    }

    affiliate.status = STATUS.ACTIVE;
    affiliate.verification_token = undefined;
    affiliate.verification_token_expires = undefined;

    await affiliate.save();

    res.status(200).json({
      success: true,
      message: 'Email verified successfully. Please login with your new email.',
      redirectUrl: `${process.env.CLIENT_URL}/login`,
    });
  } catch (error) {
    sendErrorResponse(
      res,
      400,
      error instanceof Error ? error.message : 'Failed to verify email',
    );
  }
};

export const resendVerificationEmailAffiliate = async (
  req: Request,
  res: Response,
) => {
  const { email } = req.body;

  try {
    if (!email) {
      return sendErrorResponse(res, 400, 'Email is required');
    }

    const affiliate = await Affiliate.findOne({ email });
    if (!affiliate) {
      return sendErrorResponse(
        res,
        404,
        'No account found with this email address',
      );
    }

    if (affiliate.status === STATUS.ACTIVE)
      return sendErrorResponse(res, 400, 'Email is already verified');

    const verificationToken = crypto.randomBytes(32).toString('hex');
    affiliate.verification_token = verificationToken;
    affiliate.verification_token_expires = new Date(Date.now() + 3600000);
    await affiliate.save();

    await sendVerificationEmail(email, verificationToken, true);

    res.status(200).json({
      success: true,
      message: 'Verification email has been sent',
      data: { verification_token: verificationToken },
    });
  } catch (error) {
    sendErrorResponse(
      res,
      400,
      error instanceof Error
        ? error.message
        : 'Failed to resend verification email',
    );
  }
};

export const affiliateForgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    await authService.affiliateforgotPassword({ email });

    res.status(200).json({
      success: true,
      message: 'Password reset link has been sent to your email',
    });
  } catch (error) {
    sendErrorResponse(
      res,
      400,
      error instanceof Error
        ? error.message
        : 'Failed to process password reset',
    );
  }
};

export const affiliateResetPassword = async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return sendErrorResponse(res, 400, 'Token and password are required');
    }
    await authService.affiliateResetPassword({ token, password });

    res.status(200).json({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (error) {
    sendErrorResponse(
      res,
      400,
      error instanceof Error ? error.message : 'Invalid or expired reset token',
    );
  }
};
export const getAffiliateEarnings = async (
  req: CustomRequest,
  res: Response,
) => {
  try {
    if (!req.user?.id) {
      return sendErrorResponse(res, 401, 'Authentication required');
    }

    const affiliateId = req.user.id;

    const referredPlayers = await Player.find({
      referredBy: new mongoose.Types.ObjectId(affiliateId),
      is_verified: VERIFICATION.VERIFIED,
      status: STATUS.ACTIVE,
    }).lean();

    if (!referredPlayers.length) {
      return res.status(200).json({
        success: true,
        message: 'No referred players found',
        data: { earnings: [], totalEarnings: 0 },
      });
    }

    const earningsData = await Promise.all(
      referredPlayers.map(async (player) => {
        const transactions = await Transaction.aggregate([
          {
            $match: {
              player_id: player._id,
              status: 'completed',
              transaction_type: 'topup',
            },
          },
          {
            $group: {
              _id: null,
              totalDeposits: { $sum: '$amount' },
            },
          },
        ]);

        const totalDeposits = transactions[0]?.totalDeposits || 0;
        const earnings = totalDeposits * 0.1; // 10% commission

        return {
          id: player._id.toString(),
          username: player.username || 'Anonymous',
          email: player.email || 'N/A',
          earnings,
          date: player.created_at.toISOString().split('T')[0],
        };
      }),
    );

    const totalEarnings = earningsData.reduce(
      (sum, entry) => sum + entry.earnings,
      0,
    );

    res.status(200).json({
      success: true,
      message: 'Affiliate earnings retrieved successfully',
      data: {
        earnings: earningsData,
        totalEarnings,
      },
    });
  } catch (error) {
    console.error('Error fetching affiliate earnings:', error);
    sendErrorResponse(
      res,
      500,
      error instanceof Error
        ? error.message
        : 'Failed to fetch affiliate earnings',
    );
  }
};

export const getAffiliateDashboard = async (
  req: CustomRequest,
  res: Response,
) => {
  try {
    const affiliateId = req.user.id;
    ensureAffiliate(req.user);

    const affiliate = await Affiliate.findById(affiliateId);
    if (!affiliate) {
      return res.status(404).json({ message: 'Affiliate not found' });
    }

    const startDate = req.query.startDate
      ? new Date(req.query.startDate as string)
      : undefined;
    const endDate = req.query.endDate
      ? new Date(req.query.endDate as string)
      : undefined;

    // Aggregate referral stats
    const referralStats = await Player.aggregate([
      {
        $match: {
          referredBy: affiliate._id,
          ...(startDate &&
            endDate && { created_at: { $gte: startDate, $lte: endDate } }),
        },
      },
      {
        $group: {
          _id: null,
          totalSignups: { $sum: 1 },
          activeUsers: { $sum: { $cond: [{ $eq: ['$status', 1] }, 1, 0] } },
        },
      },
    ]);

    // Aggregate earnings
    const earningsStats = await Transaction.aggregate([
      {
        $match: {
          player_id: {
            $in: await Player.find({ referredBy: affiliate._id }).distinct(
              '_id',
            ),
          },
          transaction_type: 'win',
          status: 'completed',
          ...(startDate &&
            endDate && { created_at: { $gte: startDate, $lte: endDate } }),
        },
      },
      {
        $group: {
          _id: null,
          totalEarnings: {
            $sum: { $multiply: ['$amount', affiliate.commissionRate / 100] },
          },
        },
      },
    ]);

    res.json({
      clicks: affiliate.totalClicks || 0,
      signups: referralStats[0]?.totalSignups || 0,
      conversions: referralStats[0]?.activeUsers || 0,
      conversionRate: referralStats[0]?.totalSignups
        ? (
            (referralStats[0].activeUsers / referralStats[0].totalSignups) *
            100
          ).toFixed(2)
        : 0,
      totalEarnings:
        earningsStats[0]?.totalEarnings || affiliate.totalEarnings || 0,
      pendingEarnings: affiliate.totalEarnings - (affiliate.paidEarnings || 0),
      currency: 'USD',
      recentActivity: await Notification.find({ user_id: affiliate._id })
        .sort({ created_at: -1 })
        .limit(5)
        .select('type message created_at'),
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Server error', error: (error as Error).message });
  }
};

// 2. Create Referral Link
export const createReferralLink = async (req: CustomRequest, res: Response) => {
  try {
    const affiliateId = req.user.id;
    ensureAffiliate(req.user);

    const { campaignName, destinationUrl } = req.body;
    const trackingId = `AFF${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    const referralLink = new ReferralLink({
      affiliateId,
      trackingId,
      campaignName,
      destinationUrl,
    });

    await referralLink.save();

    res.status(201).json({
      trackingId,
      referralLink: `${destinationUrl}?ref=${trackingId}`,
      campaignName,
      createdAt: referralLink.createdAt,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Server error', error: (error as Error).message });
  }
};

// 3. List Referral Links
export const getReferralLinks = async (req: CustomRequest, res: Response) => {
  try {
    const affiliateId = req.user.id;
    ensureAffiliate(req.user);

    const referralLinks = await ReferralLink.find({ affiliateId }).select(
      'trackingId campaignName destinationUrl clicks signups conversions createdAt',
    );

    res.json(
      referralLinks.map((link) => ({
        trackingId: link.trackingId,
        referralLink: `${link.destinationUrl}?ref=${link.trackingId}`,
        campaignName: link.campaignName,
        clicks: link.clicks,
        signups: link.signups,
        conversions: link.conversions,
      })),
    );
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Server error', error: (error as Error).message });
  }
};

// 4. Track Referral Click
export const trackReferralClick = async (req: Request, res: Response) => {
  try {
    const { trackingId, ipAddress, userAgent, referrer } = req.body;

    const referralLink = await ReferralLink.findOne({ trackingId });
    if (!referralLink) {
      return res.status(404).json({ message: 'Invalid tracking ID' });
    }

    const click = new Click({
      affiliateId: referralLink.affiliateId,
      trackingId,
      ipAddress,
      userAgent,
      referrer,
    });

    await click.save();

    await ReferralLink.updateOne({ trackingId }, { $inc: { clicks: 1 } });
    await Affiliate.updateOne(
      { _id: referralLink.affiliateId },
      { $inc: { totalClicks: 1 } },
    );

    res.json({ status: 'Click recorded' });
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Server error', error: (error as Error).message });
  }
};

// 5. Request Payout
export const requestPayout = async (req: CustomRequest, res: Response) => {
  try {
    const affiliateId = req.user.id;
    ensureAffiliate(req.user);

    const { amount, paymentMethodId, currency } = req.body;

    const affiliate = await Affiliate.findById(affiliateId);
    if (!affiliate) {
      return res.status(404).json({ message: 'Affiliate not found' });
    }

    const availableEarnings =
      affiliate.totalEarnings - (affiliate.paidEarnings || 0);
    if (amount > availableEarnings) {
      return res
        .status(400)
        .json({ message: 'Requested amount exceeds available earnings' });
    }

    const payout = new Payout({
      affiliateId,
      amount,
      currency,
      paymentMethodId,
      status: 'pending',
    });

    await payout.save();

    const notification = new Notification({
      type: NotificationType.WITHDRAWAL_REQUESTED,
      message: `Affiliate ${affiliate.email} requested a payout of ${amount} ${currency}`,
      user_id: affiliateId,
      metadata: { payoutId: payout._id, amount, currency },
    });
    await notification.save();

    // Notify admin (assuming admin email is configured)
    await sendEmail(
      process.env.ADMIN_EMAIL || 'admin@bastaxcasino.com',
      'New Payout Request',
      `Affiliate ${affiliate.firstname} ${affiliate.lastname} (${affiliate.email}) has requested a payout of ${amount} ${currency}. Please review in the admin dashboard.`,
    );

    res.status(201).json({
      payoutId: payout._id,
      amount,
      status: payout.status,
      requestedAt: payout.createdAt,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Server error', error: (error as Error).message });
  }
};

// 6. List Payouts
export const getPayouts = async (req: CustomRequest, res: Response) => {
  try {
    const affiliateId = req.user.id;
    ensureAffiliate(req.user);

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const payouts = await Payout.find({ affiliateId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('amount currency status adminNotes createdAt');

    const total = await Payout.countDocuments({ affiliateId });

    res.json({
      payouts,
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

// 7. Admin Update Payout Status
export const updatePayoutStatus = async (req: CustomRequest, res: Response) => {
  try {
    const { payoutId } = req.params;
    const { status, adminNotes } = req.body;

    const payout = await Payout.findById(payoutId).populate('affiliateId');
    if (!payout) {
      return res.status(404).json({ message: 'Payout not found' });
    }

    const affiliate = payout.affiliateId as any;

    if (status === 'approved') {
      // Simulate Stripe payout (replace with actual Stripe API as in paymentController)
      payout.stripePayoutId = `po_${Math.random().toString(36).substring(2, 10)}`;
    } else if (status === 'paid') {
      await Affiliate.updateOne(
        { _id: affiliate._id },
        { $inc: { paidEarnings: payout.amount } },
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
      message: `Payout ${payoutId} updated to ${status} for affiliate ${affiliate.email}`,
      user_id: affiliate._id,
      metadata: { payoutId, status, adminNotes },
    });
    await notification.save();

    res.json({
      payoutId,
      status: payout.status,
      updatedAt: payout.updatedAt,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Server error', error: (error as Error).message });
  }
};

// 8. Admin List All Payouts
export const getAllPayouts = async (req: CustomRequest, res: Response) => {
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

// 9. Create Commission Tier
export const createCommissionTier = async (
  req: CustomRequest,
  res: Response,
) => {
  try {
    const { tierName, minReferrals, commissionRate, currency } = req.body;

    const existingTier = await CommissionTier.findOne({ tierName });
    if (existingTier) {
      return res.status(400).json({ message: 'Tier name already exists' });
    }

    const tier = new CommissionTier({
      tierName,
      minReferrals,
      commissionRate,
      currency,
    });

    await tier.save();

    res.status(201).json({
      tierId: tier._id,
      tierName,
      commissionRate,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Server error', error: (error as Error).message });
  }
};

// 10. Update Commission Tier
export const updateCommissionTier = async (
  req: CustomRequest,
  res: Response,
) => {
  try {
    const { tierId } = req.params;
    const { tierName, minReferrals, commissionRate, currency } = req.body;

    const tier = await CommissionTier.findById(tierId);
    if (!tier) {
      return res.status(404).json({ message: 'Commission tier not found' });
    }

    if (tierName) tier.tierName = tierName;
    if (minReferrals !== undefined) tier.minReferrals = minReferrals;
    if (commissionRate !== undefined) tier.commissionRate = commissionRate;
    if (currency) tier.currency = currency;

    await tier.save();

    // Update affiliate commission rates if necessary
    if (commissionRate !== undefined) {
      await Affiliate.updateMany(
        { totalSignups: { $gte: tier.minReferrals } },
        { commissionRate: tier.commissionRate },
      );

      // Notify affected affiliates
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

    res.json({
      tierId: tier._id,
      tierName: tier.tierName,
      commissionRate: tier.commissionRate,
      minReferrals: tier.minReferrals,
      currency: tier.currency,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Server error', error: (error as Error).message });
  }
};

// 11. List Referrals
export const getReferrals = async (req: CustomRequest, res: Response) => {
  try {
    const affiliateId = req.user.id;
    ensureAffiliate(req.user);

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string;

    const query: any = { referredBy: affiliateId };
    if (status) query.status = parseInt(status);

    const referrals = await Player.find(query)
      .sort({ created_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('username created_at status');

    const total = await Player.countDocuments(query);

    const referralEarnings = await Transaction.aggregate([
      {
        $match: {
          player_id: { $in: referrals.map((r) => r._id) },
          transaction_type: 'win',
          status: 'completed',
        },
      },
      {
        $group: {
          _id: '$player_id',
          earnings: { $sum: '$amount' },
        },
      },
    ]);

    const affiliate =
      await Affiliate.findById(affiliateId).select('commissionRate');

    res.json({
      referrals: referrals.map((referral) => {
        const earningsEntry = referralEarnings.find((e) =>
          e._id.equals(referral._id),
        );
        return {
          userId: referral._id,
          username: referral.username,
          signupDate: referral.created_at,
          status: referral.status,
          earnings: earningsEntry
            ? earningsEntry.earnings * (affiliate.commissionRate / 100)
            : 0,
        };
      }),
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

// 12. List Promotional Materials
export const getPromoMaterials = async (req: CustomRequest, res: Response) => {
  try {
    const affiliateId = req.user.id;
    ensureAffiliate(req.user);

    const affiliate =
      await Affiliate.findById(affiliateId).select('referralCode');
    const materials = await PromoMaterial.find().select(
      'type url dimensions trackingLink',
    );

    res.json(
      materials.map((material) => ({
        materialId: material._id,
        type: material.type,
        url: material.url,
        dimensions: material.dimensions,
        trackingLink: material.trackingLink
          ? `${material.trackingLink}?ref=${affiliate.referralCode}`
          : undefined,
      })),
    );
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Server error', error: (error as Error).message });
  }
};

// 13. Admin Upload Promotional Material
export const uploadPromoMaterial = async (
  req: CustomRequest,
  res: Response,
) => {
  try {
    const { type, dimensions } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: 'File is required' });
    }

    const result = await cloudinary.uploader.upload(file.path, {
      folder: 'promo_materials',
      resource_type: 'auto',
    });

    const material = new PromoMaterial({
      type,
      url: result.secure_url,
      dimensions,
    });

    await material.save();

    // Notify affiliates about new promotional material
    const affiliates = await Affiliate.find({
      'notificationPreferences.campaignUpdates': true,
    });
    for (const affiliate of affiliates) {
      await sendEmail(
        affiliate.email,
        'New Promotional Material Available',
        `A new ${type} has been added to your affiliate dashboard. Check it out to boost your campaigns!`,
        `${affiliate.firstname} ${affiliate.lastname}`,
      );
    }

    res.status(201).json({
      materialId: material._id,
      type: material.type,
      url: material.url,
      dimensions: material.dimensions,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Server error', error: (error as Error).message });
  }
};

// 14. Generate Performance Report
export const generatePerformanceReport = async (
  req: CustomRequest,
  res: Response,
) => {
  try {
    const affiliateId = req.user.id;
    ensureAffiliate(req.user);

    const { startDate, endDate, format } = req.query;

    const affiliate =
      await Affiliate.findById(affiliateId).select('commissionRate');
    const query: any = { referredBy: affiliateId };
    if (startDate && endDate) {
      query.created_at = {
        $gte: new Date(startDate as string),
        $lte: new Date(endDate as string),
      };
    }

    const referrals = await Player.find(query).select(
      'username created_at status',
    );
    const clicks = await Click.find({
      affiliateId,
      ...(startDate && endDate && query.created_at),
    }).countDocuments();
    const earnings = await Transaction.aggregate([
      {
        $match: {
          player_id: { $in: referrals.map((r) => r._id) },
          transaction_type: 'win',
          status: 'completed',
          ...(startDate && endDate && { created_at: query.created_at }),
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
        },
      },
    ]);

    const data = {
      clicks,
      signups: referrals.length,
      conversions: referrals.filter((r) => r.status === 1).length,
      totalEarnings: earnings[0]?.total
        ? earnings[0].total * (affiliate.commissionRate / 100)
        : 0,
      referrals: referrals.map((r) => ({
        username: r.username,
        signupDate: r.created_at,
        status: r.status,
      })),
    };

    if (format === 'csv') {
      const fields = ['clicks', 'signups', 'conversions', 'totalEarnings'];
      const csvParser = new Parser({ fields });
      const csv = csvParser.parse([data]);
      res.header('Content-Type', 'text/csv');
      res.attachment(`affiliate_report_${Date.now()}.csv`);
      return res.send(csv);
    } else {
      const doc = new PDFDocument();
      res.header('Content-Type', 'application/pdf');
      res.attachment(`affiliate_report_${Date.now()}.pdf`);

      doc
        .fontSize(20)
        .text('Affiliate Performance Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(14).text(`Clicks: ${data.clicks}`);
      doc.text(`Signups: ${data.signups}`);
      doc.text(`Conversions: ${data.conversions}`);
      doc.text(`Total Earnings: ${data.totalEarnings.toFixed(2)} USD`);
      doc.moveDown();
      doc.text('Referrals:', { underline: true });
      data.referrals.forEach((r) => {
        doc.text(`- ${r.username} (Signed up: ${r.signupDate.toISOString()})`);
      });

      doc.pipe(res);
      doc.end();
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Server error', error: (error as Error).message });
  }
};

// 15. Update Communication Preferences
export const updatePreferences = async (req: CustomRequest, res: Response) => {
  try {
    const affiliateId = req.user.id;
    ensureAffiliate(req.user);

    const { marketingEmailsOptIn, notificationPreferences } = req.body;

    const affiliate = await Affiliate.findById(affiliateId);
    if (!affiliate) {
      return res.status(404).json({ message: 'Affiliate not found' });
    }

    if (marketingEmailsOptIn !== undefined) {
      affiliate.marketingEmailsOptIn = marketingEmailsOptIn;
      if (marketingEmailsOptIn) {
        await sendEmail(
          affiliate.email,
          'Welcome to Our Newsletter',
          'You’ve subscribed to our marketing emails. Stay tuned for exclusive updates and offers!',
          `${affiliate.firstname} ${affiliate.lastname}`,
        );
      }
    }
    if (notificationPreferences) {
      affiliate.notificationPreferences = {
        ...affiliate.notificationPreferences,
        ...notificationPreferences,
      };
    }

    await affiliate.save();

    res.json({
      marketingEmailsOptIn: affiliate.marketingEmailsOptIn,
      notificationPreferences: affiliate.notificationPreferences,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Server error', error: (error as Error).message });
  }
};
