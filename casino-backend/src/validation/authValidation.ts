import { body, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

export const validateStripeConfig = [
  body('stripeWebhookSecret')
    .notEmpty()
    .withMessage('Stripe Webhook Secret is required')
    .isString()
    .withMessage('Stripe Webhook Secret must be a string'),

  body('stripeSecretKey')
    .notEmpty()
    .withMessage('Stripe Secret Key is required')
    .isString()
    .withMessage('Stripe Secret Key must be a string'),

  body('stripePublishableKey')
    .notEmpty()
    .withMessage('Stripe Publishable Key is required')
    .isString()
    .withMessage('Stripe Publishable Key must be a string'),
];

// Express validation middleware for affiliate registration
export const validateAffiliate = [
  body('firstname').notEmpty().withMessage('First name is required'),
  body('lastname').notEmpty().withMessage('Last name is required'),
  body('password')
  .notEmpty()
  .withMessage('Password is required')
  .isLength({ min: 8 })
  .withMessage('Password must be at least 8 characters')
  .matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
  )
  .withMessage(
    'Password must contain uppercase, lowercase, number, and special character',
  ),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('country').notEmpty().withMessage('Country is required'),
  body('hearAboutUs')
    .notEmpty()
    .withMessage('Please specify how you heard about us'),
];

/**
 * Middleware to handle Express Validator validation errors
 */
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

export const affiliateloginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

export const loginSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  password: Joi.string().min(8).required(),
});
