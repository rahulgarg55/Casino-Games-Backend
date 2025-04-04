import jwt from 'jsonwebtoken';
import { IPlayer } from '../models/player';
import { IAffiliate } from '../models/affiliate';

/**
 * Generates a JWT token response for a given user.
 *
 * @param {IPlayer} user - The user object containing user details.
 * @returns {Object} An object containing the generated token and its expiration time in seconds.
 * @throws {Error} If the JWT secret is not configured in the environment variables.
 */
export const generateTokenResponse = (user: IPlayer) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT secret not configured');
  }

  const payload = {
    sub: user._id,
    role: user.role_id,
    email: user.email,
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '8h',
  });

  return {
    token,
    expiresIn: 28800,
  };
};

/**
 * Generates a JWT token response for a given user.
 *
 * @param {IAffiliate} user - The user object containing user details.
 * @returns {Object} An object containing the generated token and its expiration time in seconds.
 * @throws {Error} If the JWT secret is not configured in the environment variables.
 */

export const generateTokenForAffialite = (user: IAffiliate) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT secret not configured');
  }

  const payload = {
    sub: user._id,
    email: user.email,
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '8h',
  });

  return {
    token,
    expiresIn: 28800,
  };
};


/*Function for generate Referral code */
export const generateReferralCode = (userId: any) => {
  const userIdStr = userId.toString();

  // Generate 4-digit random number
  const randomPart = Math.floor(1000 + Math.random() * 9000);

  return `AFF-${userIdStr.substring(0, 6)}-${randomPart}`;
};
