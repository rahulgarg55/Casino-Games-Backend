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

// Curried authentication middleware factory
export const createAuthMiddleware = (requiredRole?: string) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (requiredRole && req.user.role as any !== requiredRole) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  
  next();
};

// Usage examples:
// app.use('/admin', createAuthMiddleware('admin'));
// app.use('/user', createAuthMiddleware('user'));
// app.use('/api', createAuthMiddleware()); // Any authenticated user 