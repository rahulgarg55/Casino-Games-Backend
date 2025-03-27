import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationError } from 'express-validator';

const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map((err: ValidationError) => ({
        param: err.type === 'field' ? err.path : '',
        message: err.msg,
      })),
    });
  }

  next();
};

export default validateRequest;
