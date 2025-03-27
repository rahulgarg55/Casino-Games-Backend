import { body,validationResult } from "express-validator";
import { Request, Response, NextFunction } from "express";

export const validateStripeConfig = [
  body("stripeWebhookSecret")
    .notEmpty()
    .withMessage("Stripe Webhook Secret is required")
    .isString()
    .withMessage("Stripe Webhook Secret must be a string"),

  body("stripeSecretKey")
    .notEmpty()
    .withMessage("Stripe Secret Key is required")
    .isString()
    .withMessage("Stripe Secret Key must be a string"),

  body("stripePublishableKey")
    .notEmpty()
    .withMessage("Stripe Publishable Key is required")
    .isString()
    .withMessage("Stripe Publishable Key must be a string"),
];




/**
 * Middleware to handle Express Validator validation errors
 */
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};
