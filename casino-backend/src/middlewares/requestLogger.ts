/**
 * Middleware function to log incoming HTTP requests.
 *
 * Logs the HTTP method and the request path along with the current timestamp
 * in ISO format to the console.
 *
 * @param req - The incoming HTTP request object.
 * @param res - The outgoing HTTP response object.
 * @param next - The next middleware function in the stack.
 */
import { Request, Response, NextFunction } from 'express';

const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
};

export default requestLogger;