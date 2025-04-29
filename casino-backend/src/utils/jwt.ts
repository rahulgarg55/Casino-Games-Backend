import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const ROLE_IDS = {
  USER: 0,
  ADMIN: 1,
  AFFILIATE: 2, 
};

interface CustomRequest extends Request {
  user?: {
    id: string;
    role: number;
  };
}

const getJwtSecret = () => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  return process.env.JWT_SECRET;
};

const extractAndVerifyToken = (
  req: CustomRequest,
  res: Response,
  secret: string,
) => {
  const authHeader = req.header('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }
  try {
    const decoded = jwt.verify(token, secret) as { sub: string; role: number };
    req.user = { id: decoded.sub, role: decoded.role };
    return null; // No error
  } catch (error: any) {
    console.error('Token verification error:', error.message, error.name);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token has expired' });
    }
    return res.status(400).json({ message: 'Invalid token', error: error.message });
  }
};

export const verifyToken = (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) => {
  const errorResponse = extractAndVerifyToken(req, res, getJwtSecret());
  if (errorResponse) return errorResponse;
    // if (req.user?.role !== ROLE_IDS.AFFILIATE) {
    //   return res.status(403).json({ message: 'Invalid Affiliate credentials.' });
    // }
  next();
};

export const verifyAdmin = (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) => {
  const errorResponse = extractAndVerifyToken(req, res, getJwtSecret());
  if (errorResponse) return errorResponse;
  if (req.user?.role !== ROLE_IDS.ADMIN) {
    return res.status(403).json({ message: 'Invalid admin credentials.' });
  }
  next();
};