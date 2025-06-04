import { Request, Response, NextFunction } from 'express';

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  // Assuming user information is attached to req.user after authentication
  // And admin role_id is 1
  if (req.user && (req.user as any).role_id === 1) {
    next(); // User is admin, proceed
  } else {
    res.status(403).json({ message: 'Forbidden: Admins only' }); // User is not admin, send forbidden status
  }
}; 