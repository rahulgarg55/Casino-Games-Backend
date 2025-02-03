import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to handle errors in the application.
 *
 * Logs the error message with a timestamp and sends a JSON response with the error details.
 *
 * @param err - The error object.
 * @param req - The request object.
 * @param res - The response object.
 * @param next - The next middleware function.
 *
 * @returns A JSON response with the error message and stack trace (if not in production).
 */
const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  console.error(`[${new Date().toISOString()}] Error: ${err.message}`);

  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
  res.status(statusCode).json({
    success: false,
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  });
};

export default errorHandler;
