import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const ROLE_IDS = {
  USER: 0,
  ADMIN: 1,
  AFFFILIATE: 2,
};

interface CustomRequest extends Request {
  user?: {
    id: string;
    role: number;
  };
}

export const verifyToken = (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.header('Authorization');
  console.log('Authorization Header:', authHeader);
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return res
      .status(401)
      .json({ message: 'Access denied. No token provided.' });
  }

  console.log('JWT_SECRET during verification:', process.env.JWT_SECRET);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      sub: string;
      role: number;
    };
    console.log('decoded :>> ', decoded);
    if (decoded.role !== ROLE_IDS.AFFFILIATE) {
      return res.status(403).json({ message: 'Invalid Affiliate credentials.' });
    }

    req.user = { id: decoded.sub, role: decoded.role };
    console.log('req.user :>> ', req.user);
    next();
  } catch (error: any) {
    console.error('Token verification error:', error.message, error.name);
    res.status(400).json({ message: 'Invalid token.', error: error.message });
  }
};

export const verifyAdmin = (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res
      .status(401)
      .json({ message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      sub: string;
      role: number;
    };
     
    /*Check Admin role*/
    if (decoded.role !== ROLE_IDS.ADMIN) {
      return res.status(403).json({ message: 'Invalid admin credentials.' });
    }

    req.user = { id: decoded.sub, role: decoded.role };
    next();
  } catch (error) {
    res.status(400).json({ message: 'Invalid token.' });
  }
};
