import { Request, Response, NextFunction } from 'express';
import Player from '../models/player';

export const checkCookieConsent = async (req: Request, res: Response, next: NextFunction) => {
  const playerId = req.user!.id;
  const player = await Player.findById(playerId);
  if (!player || player.cookieConsent !== 'accepted') {
    return res.status(403).json({
      success: false,
      error: 'Cookie consent not accepted',
    });
  }
  next();
};