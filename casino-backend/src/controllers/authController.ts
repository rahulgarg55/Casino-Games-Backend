import { Request, Response } from 'express';
import * as authService from '../services/authService';
import { generateTokenResponse } from '../utils/auth';
import passport from 'passport';
import { generateResetToken } from '../services/authService';
import { resetPassword as resetPasswordService } from '../services/authService';
import cloudinary from '../utils/cloudinary';
import Player from '../models/player';
import { VERIFICATION } from '../constants';
import crypto from 'crypto';
import { sendVerificationEmail } from '../utils/sendEmail';

interface CustomRequest extends Request {
  user?: {
    sub: string;
    id: string;
    role: number;
  };
}

export const register = async (req: Request, res: Response) => {
  try {
    const { player, token, expiresIn } = await authService.register(req.body);
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: player._id,
          username: player.username,
          fullname:player.fullname,
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
        },
        token,
        expiresIn,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Invalid request. Please check your input';
    res.status(400).json({
      success: false,
      error: errorMessage
    });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { user, token } = await authService.login(req.body);
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
    const errorMessage = error instanceof Error ? error.message : 'Invalid username or password';
    res.status(401).json({
      success: false,
      error: errorMessage
    });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email, phone_number } = req.body;

    if (!email && !phone_number) {
      return res.status(400).json({
        success: false,
        error: 'Please provide all required fields: username, password, email'
      });
    }
    await authService.forgotPassword({ email, phone_number });

  
    res.status(200).json({
      success: true,
      message: 'Password reset link has been sent to your email'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Invalid request. Please check your input';
    res.status(400).json({
      success: false,
      error: errorMessage
    });
  }
};
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;

    await resetPasswordService({ token, password });

    res.status(200).json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Invalid or expired reset token';
    res.status(400).json({
      success: false,
      error: errorMessage
    });
  }
};

export const viewProfile = async (req: CustomRequest, res: Response) => {
  try {
    const playerId = req.user!.id;
    const player = await Player.findById(playerId).select('-password_hash');
    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }
    res.status(200).json({
      success: true,
      message: 'User profile retrieved successfully',
      data: {
        user: player.toObject(),
        gender: player.gender,
        language: player.language,
        country: player.country,
        city: player.city,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'An unexpected error occurred. Please try again later'
    });
  }
};

export const getAllPlayers = async (req: Request, res: Response) => {
  try {
    const players = await Player.find()
      .select('-password_hash')
      .sort({ created_at: -1 });

    res.status(200).json({
      success: true,
      message: 'Players retrieved successfully',
      data: {
        players: players.map(player => ({
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
        }))
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'An unexpected error occurred. Please try again later'
    });
  }
};

export const updatePlayerStatus = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;
    console.log('userId', userId)
    console.log('status', status)

    if (status !== 0 && status !== 1) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status value. Status must be 0 (inactive) or 1 (active).',
      });
    }

    const player = await Player.findByIdAndUpdate(
      userId,
      { status },
      { new: true }
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
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred. Please try again later';
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
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred. Please try again later';
    res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
};
export const updateProfile = async (req: CustomRequest, res: Response) => {
  try {
    const user = await authService.updateProfile(req.user!.id, req.body);
    res.status(200).json({
      success: true,
      message: 'User profile retrieved successfully',
      data: {
        ...user.toObject(),
        gender: user.gender,
        language: user.language,
        country: user.country,
        city: user.city,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred. Please try again later';
    res.status(400).json({
      success: false,
      error: errorMessage
    });
  }
};

export const uploadPhoto = async (req: CustomRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request. Please check your input'
      });
    }
    const playerId = req.user!.id;
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
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
      error: 'An unexpected error occurred. Please try again later'
    });
  }
};

export const googleLogin = passport.authenticate('google', {
  scope: ['profile', 'email'],
});

export const googleCallback = (req: Request, res: Response) => {
  passport.authenticate('google', (err: any, user: any) => {
    if (err) {
      return res.status(400).json({ 
        success: false, 
        error: 'An unexpected error occurred. Please try again later'
      });
    }
    if (!user) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid username or password'
      });
    }
    res.status(200).json({
      success: true,
      message: 'Login successful!',
      data: {
        user: {
          id: user.player._id,
          username: user.player.username,
          email: user.player.email,
          phone_number: user.player.phone_number,
          role_id: user.player.role_id,
          created_at: user.player.created_at,
          gender: user.player.gender,
          language: user.player.language,
          country: user.player.country,
          city: user.player.city,
        },
        token: user.token,
        expiresIn: user.expiresIn,
      },
    });
  })(req, res);
};

export const facebookLogin = passport.authenticate('facebook', {
  scope: ['email'],
});

export const facebookCallback = (req: Request, res: Response) => {
  passport.authenticate('facebook', (err: any, user: any) => {
    if (err) {
      return res.status(400).json({ 
        success: false, 
        error: 'An unexpected error occurred. Please try again later'
      });
    }
    if (!user) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid username or password'
      });
    }
    res.status(200).json({
      success: true,
      message: 'Login successful!',
      data: {
        user: {
          id: user.player._id,
          username: user.player.username,
          email: user.player.email,
          phone_number: user.player.phone_number,
          role_id: user.player.role_id,
          created_at: user.player.created_at,
          gender: user.player.gender,
          language: user.player.language,
          country: user.player.country,
          city: user.player.city,
        },
        token: user.token,
        expiresIn: user.expiresIn,
      },
    });
  })(req, res);
};
export const verifyEmail = async (req: Request, res: Response) => {
  const { token } = req.query;
  console.log('token', token)
  if (!token || typeof token !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Invalid or expired token. Please login again'
    });
  }
  try {
    const player = await Player.findOne({
      verification_token: token,
      verification_token_expires: { $gt: new Date() },
    });
    console.log('player', player)
    if (!player) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired token. Please login again'
      });
    }

    player.is_verified = VERIFICATION.VERIFIED;
    player.verification_token = undefined;
    player.verification_token_expires = undefined;
    console.log('player', player)
    await player.save();
    res.status(200).json({
      success: true,
      message: 'User registered successfully',
      redirectUrl: `${process.env.CLIENT_URL}/login`,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'An unexpected error occurred. Please try again later'
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
        error: 'No account found with this email address'
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
      message: 'Verification email has been sent'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'An unexpected error occurred. Please try again later'
    });
  }
};

export const verifyPhone = async (req: Request, res: Response) => {
  try {
      const { phone_number, code } = req.body;
      await authService.verifyPhoneNumber(phone_number, code);
      res.status(200).json({
          success: true,
          message: 'Phone number verified successfully'
      });
  } catch (error) {
      res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : 'Verification failed'
      });
  }
};
