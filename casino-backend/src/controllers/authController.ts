import { Request, Response } from 'express';
import * as authService from '../services/authService';
import { generateTokenResponse } from '../utils/auth';

interface CustomRequest extends Request {
  user?: {
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
    await authService.forgotPassword(req.body);
    res.status(200).json({
      success: true,
      message: 'Password reset email sent',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Password reset failed',
    });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    await authService.resetPassword(req.body);
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

export const updateProfile = async (req: CustomRequest, res: Response) => {
  try {
    console.log('req.user', req.user);
    const user = await authService.updateProfile(req.user!.id, req.body);
    console.log('user', user);
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
