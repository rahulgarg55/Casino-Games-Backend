import express, { Router } from 'express';
import * as affiliateController from '../controllers/affiliateController';
import * as authController from '../controllers/authController';
import { body, query } from 'express-validator';
import rateLimit from 'express-rate-limit';
import validateRequest from '../middlewares/validateRequest';
import { verifyToken, verifyAdmin } from '../utils/jwt';
import {
  validateAffiliate,
  handleValidationErrors,
  affiliateloginValidation,
} from '../validation/authValidation';
import upload from '../middlewares/uploadMiddleware';

const router = Router();

const resendEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many attempts. Please try again later.',
});

const clickLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message:
    'Too many click tracking requests from this IP, please try again later',
});

router.post(
  '/register',
  validateAffiliate,
  handleValidationErrors,
  authController.register,
);

router.post(
  '/login',
  affiliateloginValidation,
  handleValidationErrors,
  authController.login,
);

router.post(
  '/forgot-password',
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  validateRequest,
  authController.forgotPassword,
);

router.post(
  '/reset-password',
  body('token').notEmpty().withMessage('Token is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    )
    .withMessage(
      'Password must contain uppercase, lowercase, number, and special character',
    ),
  validateRequest,
  authController.resetPassword,
);

router.post(
  '/resend-verification-email',
  resendEmailLimiter,
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  validateRequest,
  authController.resendVerificationEmail,
);

router.get('/verify-email', validateRequest, authController.verifyEmail);

router.get(
  '/dashboard',
  verifyToken,
  affiliateController.getAffiliateDashboard,
);

router.post(
  '/payouts/request',
  verifyToken,
  [
    body('amount').isFloat({ min: 1 }).withMessage('Amount must be at least 1'),
    body('currency').isString().withMessage('Currency is required'),
  ],
  validateRequest,
  affiliateController.requestPayout,
);

router.get('/payouts', verifyToken, affiliateController.getPayoutHistory);

router.get(
  '/promo-materials',
  verifyToken,
  affiliateController.getPromoMaterials,
);

router.get('/referral-link', verifyToken, affiliateController.getReferralLink);

router.patch(
  '/preferences',
  verifyToken,
  [
    body('preferences').isObject().withMessage('Preferences must be an object'),
    body('preferences.newReferral')
      .optional()
      .isBoolean()
      .withMessage('New referral preference must be a boolean'),
    body('preferences.payoutProcessed')
      .optional()
      .isBoolean()
      .withMessage('Payout processed preference must be a boolean'),
    body('preferences.campaignUpdates')
      .optional()
      .isBoolean()
      .withMessage('Campaign updates preference must be a boolean'),
  ],
  validateRequest,
  affiliateController.updateNotificationPreferences,
);

export default router;
