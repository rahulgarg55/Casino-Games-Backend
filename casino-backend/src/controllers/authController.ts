import { Request, Response } from 'express';
import * as authService from '../services/authService';
import { generateTokenResponse } from '../utils/auth';

export const register = async (req: Request, res: Response) => {
  try {
    const user = await authService.register(req.body);
    const tokenData = generateTokenResponse(user);
    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          role_id: user.role_id,
          created_at: user.created_at
        },
        token: tokenData.token,
        expiresIn: tokenData.expiresIn
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Registration failed'
    });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { user, token } = await authService.login(req.body);
    res.status(200).json({
      success: true,
      data: {
        user,
        token,
        expiresIn:28800
      }
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: error instanceof Error ? error.message : 'Authentication failed'
    });
  }
};