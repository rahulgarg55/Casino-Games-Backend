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
import moment from 'moment'
import { messages } from '../utils/messages';
import { months, quarters, daysOfWeek } from '../utils/constant';

interface CustomRequest extends Request {
  user?: {
    sub: string;
    id: string;
    role: number;
  };
}

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
    let errorMessage = 'Invalid request. Please check your input';
    let statusCode = 400;

    if (error instanceof Error) {
      errorMessage = error.message;

      if (
        errorMessage.includes('Username is already taken') ||
        errorMessage.includes('Email is already registered') ||
        errorMessage.includes('Phone number is already registered')
      ) {
        statusCode = 409;
      }
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
    });
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
        data: {
          requires2FA: true,
          playerId: user.id,
        },
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
    const errorMessage =
      error instanceof Error ? error.message : 'Invalid username or password';
    res.status(401).json({
      success: false,
      error: errorMessage,
    });
  }
};

export const verify2FA = async (req: Request, res: Response) => {
  try {
    const { playerId, otp } = req.body;
    const { token, expiresIn, user } = await authService.verify2FA(
      playerId,
      otp,
    );

    res.status(200).json({
      success: true,
      message: '2FA verification successful',
      data: {
        user,
        token,
        expiresIn,
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Invalid OTP or server error';
    res.status(401).json({
      success: false,
      error: errorMessage,
    });
  }
};

export const toggle2FA = async (req: CustomRequest, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }
    const { enabled, method, password } = req.body;
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
    const errorMessage =
      error instanceof Error ? error.message : 'Server error toggling 2FA';
    res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email, phone_number } = req.body;

    if (!email && !phone_number) {
      return res.status(400).json({
        success: false,
        error: 'Please provide all required fields, i.e. username, password, email',
      });
    }
    await authService.forgotPassword({ email, phone_number });

    res.status(200).json({
      success: true,
      message: 'Password reset link has been sent to your email',
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Invalid request. Please check your input';
    res.status(400).json({
      success: false,
      error: errorMessage,
    });
  }
};
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;

    await resetPasswordService({ token, password });

    res.status(200).json({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Invalid or expired reset token';
    res.status(400).json({
      success: false,
      error: errorMessage,
    });
  }
};

export const viewProfile = async (req: CustomRequest, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required or invalid token',
      });
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
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
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
    res.status(400).json({
      success: false,
      error:
        error.message || 'An unexpected error occurred. Please try again later',
    });
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
      data: {
        players: playersWithBalance,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'An unexpected error occurred. Please try again later',
    });
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
    }).select('created_at');

    if (filter === 'daily') {
      // **Daily Stats**
      return res.status(200).json({
        success: true,
        message: `Daily ${messages.stats}`,
        data: {
          activePlayersToday: players.length,
        },
      });
    }

    if (filter === 'weekly') {
      // **Weekly Stats **
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
        data: {
          activePlayersPerDay: statsWithDays,
        },
      });
    }

    if (filter === 'monthly') {
      // **Monthly Stats **
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
        data: {
          activePlayersPerDayInMonth: statsWithDays,
        },
      });
    }

    if (filter === 'quarterly') {
      // **Quarterly Stats (Q1, Q2, Q3, Q4)**
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
        data: {
          activePlayersPerQuarter: statsWithQuarters,
        },
      });
    }

    // **Default: Yearly  Stats**
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
      data: {
        activePlayersPerMonth: statsWithMonths,
      },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: messages.error,
    });
  }
};
export const updatePlayerStatus = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;

    if (status !== 0 && status !== 1) {
      return res.status(400).json({
        success: false,
        error:
          'Invalid status value. Status must be 0 (inactive) or 1 (active).',
      });
    }

    const player = await Player.findByIdAndUpdate(
      userId,
      { status },
      { new: true },
    );

    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'Player not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Player status updated successfully',
      data: {
        id: player._id,
        status: player.status,
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'An unexpected error occurred. Please try again later';
    res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
};

export const deletePlayer = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const player = await Player.findByIdAndDelete(userId);

    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'Player not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Player deleted successfully',
      data: {
        id: player._id,
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'An unexpected error occurred. Please try again later';
    res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
};
export const getAdminNotifications = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await getNotifications(page, limit);
    // console.log('result', result);
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications',
    });
  }
};
export const updateProfile = async (req: CustomRequest, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }
    const playerId = req.user!.id;
    const player = await authService.updateProfile(playerId, req.body);
    const balance = await PlayerBalance.findOne({ player_id: playerId });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          ...player.toObject(),
          balance: balance?.balance || 0,
          is_2fa_enabled: player.is_2fa_enabled,
        },
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(400).json({
      success: false,
      error: errorMessage,
    });
  }
};

export const uploadPhoto = async (req: CustomRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request. Please check your input',
      });
    }
    const playerId = req.user!.id;
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'player_photos',
    });
    player.photo = result.secure_url;
    await player.save();
    res.status(200).json({
      success: true,
      message: 'Photo uploaded successfully',
      data: {
        photo: player.photo,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'An unexpected error occurred. Please try again later',
    });
  }
};

export const googleLogin = passport.authenticate('google', {
  scope: ['profile', 'email'],
});

export const googleCallback = (req: Request, res: Response) => {
  passport.authenticate('google', { session: false }, (err: any, user: any) => {
    console.log('Google Callback - User:', user);
    console.log('Google Callback - Error:', err);

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
          `${process.env.CLIENT_URL}/login?error=${encodeURIComponent(
            'An unexpected error occurred. Please try again later',
          )}`,
        );
      }
      if (!user) {
        return res.redirect(
          `${process.env.CLIENT_URL}/login?error=${encodeURIComponent(
            'Invalid credentials',
          )}`,
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
  console.log('token', token);
  if (!token || typeof token !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Invalid or expired token. Please login again',
    });
  }
  try {
    const player = await Player.findOne({
      verification_token: token,
      verification_token_expires: { $gt: new Date() },
    });
    console.log('player', player);
    if (!player) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired token. Please login again',
      });
    }

    player.is_verified = VERIFICATION.VERIFIED;
    player.verification_token = undefined;
    player.verification_token_expires = undefined;
    console.log('player', player);
    await player.save();
    res.status(200).json({
      success: true,
      message: 'User registered successfully',
      redirectUrl: `${process.env.CLIENT_URL}/login`,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'An unexpected error occurred. Please try again later',
    });
  }
};

export const resendVerificationEmail = async (req: Request, res: Response) => {
  const { email } = req.body;

  try {
    const player = await Player.findOne({ email });

    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'No account found with this email address',
      });
    }

    if (player.is_verified === VERIFICATION.VERIFIED) {
      return res.status(400).json({
        success: false,
        error: 'Email is already registered',
      });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    player.verification_token = verificationToken;
    player.verification_token_expires = new Date(Date.now() + 3600000);
    await player.save();

    await sendVerificationEmail(email, verificationToken);

    res.status(200).json({
      success: true,
      message: 'Verification email has been sent',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'An unexpected error occurred. Please try again later',
    });
  }
};

export const verifyPhone = async (req: Request, res: Response) => {
  try {
    const { phone_number, code } = req.body;
    await authService.verifyPhoneNumber(phone_number, code);
    res.status(200).json({
      success: true,
      message: 'Phone number verified successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Verification failed',
    });
  }
};

export const verifyOTP = async (req: Request, res: Response) => {
  try {
    const { playerId, otp } = req.body;

    const { token, expiresIn, user } = await authService.verifyOTP(
      playerId,
      otp,
    );

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
      data: {
        user,
        token,
        expiresIn,
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Invalid OTP or server error';
    res.status(401).json({
      success: false,
      error: errorMessage,
    });
  }
};

export const updateCookieConsent = async (req: Request, res: Response) => {
  try {
    const { playerId, consent } = req.body;

    if (!playerId || !consent) {
      return res.status(400).json({
        success: false,
        error: 'Player ID and consent are required',
      });
    }

    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'Player not found',
      });
    }

    player.cookieConsent = consent;
    await player.save();

    res.status(200).json({
      success: true,
      message: 'Cookie consent updated successfully',
      data: {
        playerId: player._id,
        cookieConsent: player.cookieConsent,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'An unexpected error occurred. Please try again later',
    });
  }
};

export const changePassword = async (req: CustomRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  const playerId = req.user?.id;

  try {
    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Both current password and new password are required',
      });
    }

    // Password strength validation
    if (newPassword.length < 8 || !/\d/.test(newPassword)) {
      return res.status(400).json({
        success: false,
        error:
          'Password must be at least 8 characters long and include a number',
      });
    }

    const player = await Player.findById(playerId).select('+password_hash');
    if (!player) {
      return res
        .status(404)
        .json({ success: false, error: 'Player not found' });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, player.password_hash);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        error: 'Current password is incorrect',
      });
    }

    // Check if new password is same as current password
    const isSamePassword = await bcrypt.compare(
      newPassword,
      player.password_hash,
    );
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        error: 'New password must be different from current password',
      });
    }

    // Hash and save new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    player.password_hash = hashedPassword;
    await player.save();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({
      success: false,
      error: 'An error occurred while changing the password',
    });
  }
};
