import jwt from 'jsonwebtoken';
import { IPlayer } from '../models/player';

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