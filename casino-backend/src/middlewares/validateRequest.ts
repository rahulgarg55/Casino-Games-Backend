import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationError } from 'express-validator';

/**
 * Middleware to validate the request using express-validator.
 * If validation errors are found, it responds with a 400 status code and a JSON object containing the errors.
 * Otherwise, it passes control to the next middleware.
 *
 * @param req - The request object.
 * @param res - The response object.
 * @param next - The next middleware function.
 * @returns A response with validation errors if any, otherwise calls the next middleware.
 */
const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map((err: ValidationError) => ({
        param: err.type === 'field' ? err.path : '',
        message: err.msg
      }))
    });
  }

  next();
};

export default validateRequest;