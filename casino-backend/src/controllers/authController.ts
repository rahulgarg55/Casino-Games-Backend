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
    const message = 'Thank you for registering!';
    res.status(201).json({
      success: true,
      message,
      data: {
        user: {
          id: player._id,
          username: player.username,
          email: player.email,
          phone_number: player.phone_number,
          role_id: player.role_id,
          created_at: player.created_at,
          gender: player.gender,
          language: player.language,
          country: player.country,
          city: player.city,
        },
        token,
        expiresIn,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Registration failed',
    });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { user, token } = await authService.login(req.body);
    const message = 'Login successful!';
    res.status(200).json({
      success: true,
      message,
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
    res.status(401).json({
      success: false,
      error: error instanceof Error ? error.message : 'Authentication failed',
    });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email, phone_number } = req.body;

    if (!email && !phone_number) {
      throw new Error('Either email or phone number is required');
    }

    await authService.forgotPassword({ email, phone_number });

    res.status(200).json({
      success: true,
      message: 'Password reset instructions sent successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to send reset instructions',
    });
  }
};
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;

    await resetPasswordService({ token, password });

    // Respond to the client
    res.status(200).json({
      success: true,
      message: 'Password reset successful',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Password reset failed',
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
      message: 'Profile retrieved successfully',
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
      error:
        error instanceof Error ? error.message : 'Failed to retrieve profile',
    });
  }
};

export const updateProfile = async (req: CustomRequest, res: Response) => {
  try {
    const user = await authService.updateProfile(req.user!.sub, req.body);
    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        ...user.toObject(),
        gender: user.gender,
        language: user.language,
        country: user.country,
        city: user.city,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Profile update failed',
    });
  }
};

export const uploadPhoto = async (req: CustomRequest, res: Response) => {
  try {
    if (!req.file) {
      throw new Error('No file uploaded');
    }
    const playerId = req.user!.id;
    const player = await Player.findById(playerId);
    if (!player) {
      throw new Error('Player not found');
    }
    //Upload file to Cloudinary
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
      error: error instanceof Error ? error.message : 'Photo upload failed',
    });
  }
};

export const googleLogin = passport.authenticate('google', {
  scope: ['profile', 'email'],
});

export const googleCallback = (req: Request, res: Response) => {
  passport.authenticate('google', (err: any, user: any) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    if (!user) {
      return res
        .status(400)
        .json({ success: false, error: 'Authentication failed' });
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
      return res.status(400).json({ success: false, error: err.message });
    }
    if (!user) {
      return res
        .status(400)
        .json({ success: false, error: 'Authentication failed' });
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
  if (!token || typeof token !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Verification token is required and must be a string',
    });
  }
  try {
    const player = await Player.findOne({
      verification_token: token,
      verification_token_expires: { $gt: new Date() }, // Ensure token hasn't expired
    });
    if (!player) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired verification token',
      });
    }
    // Mark the user as verified
    player.is_verified = VERIFICATION.VERIFIED;
    player.verification_token = undefined;
    player.verification_token_expires = undefined;
    await player.save();
    res.status(200).json({
      success: true,
      message: 'Email verified successfully',
      redirectUrl: `${process.env.FRONTEND_URL}/login`, // Redirect to login page
    });
  } catch (error) {
    console.error('Error verifying email:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Verification failed',
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
        error: 'User not found',
      });
    }

    if (player.is_verified === VERIFICATION.VERIFIED) {
      return res.status(400).json({
        success: false,
        error: 'Email is already verified',
      });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    player.verification_token = verificationToken;
    player.verification_token_expires = new Date(Date.now() + 3600000);
    await player.save();

    // Send the verification email
    await sendVerificationEmail(email, verificationToken);

    res.status(200).json({
      success: true,
      message: 'Verification email resent successfully',
    });
  } catch (error) {
    console.error('Error resending verification email:', error);
    res.status(400).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to resend verification email',
    });
  }
};
