import { Request, Response } from 'express';
import * as authService from '../services/authService';
import { generateTokenResponse } from '../utils/auth';
import passport from 'passport';
import { generateResetToken, getNotifications } from '../services/authService';
import { resetPassword as resetPasswordService } from '../services/authService';
import cloudinary from '../utils/cloudinary';
import Player from '../models/player';
import PlayerBalance from '../models/playerBalance';
import { VERIFICATION } from '../constants';
import crypto from 'crypto';
import { sendVerificationEmail } from '../utils/sendEmail';
import bcrypt from 'bcryptjs';
import moment from 'moment';
import { messages } from '../utils/messages';
import { months, quarters, daysOfWeek } from '../utils/constant';
import { StripeConfig } from '../models/stripeConfig';
import { Affiliate } from '../models/affiliate';
import { initiateSumsubVerification, updateSumsubStatus } from '../services/authService';
import { validateWebhookSignature } from '../utils/sumsub';

interface CustomRequest extends Request {
  user?: {
    sub: string;
    id: string;
    role: number;
  };
}

const sendErrorResponse = (
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
    const players = await Player.find()
      .select('-password_hash')
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
    if (updateData.phone_number && updateData.phone_number !== currentPlayer.phone_number) {
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
      message: updateData.email && updateData.email !== currentPlayer.email
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
    });

    if (!player) {
      return sendErrorResponse(res, 400, 'Invalid or expired token');
    }

    // Verify the email and clear verification fields
    player.is_verified = VERIFICATION.VERIFIED;
    player.email_verified = true;
    player.verification_token = undefined;
    player.verification_token_expires = undefined;
    
    // Invalidate all sessions
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

    const player = await Player.findOne({ email });
    if (!player) {
      return sendErrorResponse(
        res,
        404,
        'No account found with this email address',
      );
    }

    if (player.email_verified) return sendErrorResponse(res, 400, 'Email is already verified');

    const verificationToken = crypto.randomBytes(32).toString('hex');
    player.verification_token = verificationToken;
    player.verification_token_expires = new Date(Date.now() + 3600000);
    await player.save();

    await sendVerificationEmail(email, verificationToken);

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

export const geAffliateUsers = async (req: Request, res: Response) => {
  try {
    let page = parseInt(req.query.page as string) || 1; 
    let limit = parseInt(req.query.limit as string) || 10;

    const affiliateUserList = await Affiliate.find()
      .sort({ createdAt: -1 })
      .populate('user_id')
      .skip((page - 1) * limit)
      .limit(limit);

    const totalAffiliates = await Affiliate.countDocuments();

    if (!affiliateUserList) {
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
        page,
        limit,
        totalPages: Math.ceil(totalAffiliates / limit),
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
export const startSumsubVerification = async (req: CustomRequest, res: Response) => {
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
      error instanceof Error ? error.message : 'Failed to initiate Sumsub verification'
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

    const status = reviewStatus === 'completed' && reviewResult?.reviewAnswer === 'GREEN'
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
      error instanceof Error ? error.message : 'Failed to process Sumsub webhook'
    );
  }
};


