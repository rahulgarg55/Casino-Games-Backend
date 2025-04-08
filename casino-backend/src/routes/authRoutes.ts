import express, { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import * as authController from '../controllers/authController';
import * as paymentController from '../controllers/paymentController';
import { body, oneOf } from 'express-validator';
import rateLimit from 'express-rate-limit';
import validateRequest from '../middlewares/validateRequest';
import { verifyToken, verifyAdmin } from '../utils/jwt';
import bodyParser from 'body-parser';
import passport, { authenticate } from 'passport';
import upload from '../middlewares/uploadMiddleware';
import { generateTokenResponse } from '../utils/auth';
import { IPlayer } from '../models/player';
import {validateStripeConfig,handleValidationErrors,validateAffiliate,affiliateloginValidation}from "../validation/authValidation";
import { startSumsubVerification, sumsubWebhook } from '../controllers/authController';

const router = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many attempts from this IP, please try again later',
});
const resendEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many attempts. Please try again later.',
});

const registrationValidation = [
  oneOf(
    [
      body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Valid email is required'),
      body('phone_number')
        .matches(/^\+?[1-9]\d{1,14}$/)
        .withMessage('Valid phone number is required'),
    ],
    { message: 'Either email or phone number is required' },
  ),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    )
    .withMessage(
      'Password must contain uppercase, lowercase, number, and special character',
    ),
  body('currency')
    .isInt({ min: 0, max: 2 })
    .withMessage('Invalid currency format'),
  body('username')
    .optional()
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3-30 characters'),
  body('fullname')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Full name is required'),
  body('patronymic')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Patronymic is required'),
];

const loginValidation = [
  oneOf(
    [
      body('email').isEmail().normalizeEmail(),
      body('phone_number').matches(/^\+?[1-9]\d{1,14}$/),
    ],
    { message: 'Either email or phone number is required' },
  ),
  body('password').notEmpty().withMessage('Password is required'),
];
const updateProfileValidation = [
  body('fullname')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Full name is required'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('phone_number')
    .optional()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Valid phone number is required'),
  body('username')
    .optional()
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3-30 characters'),
  body('language')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Language is required'),
  body('patronymic')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Patronymic is required'),
  // body('dob')
  //   .optional()
  //   .isDate()
  //   .withMessage('Date of birth must be a valid date'),
  body('gender').optional().trim().notEmpty().withMessage('Gender is required'),
  // body('city').optional().trim().notEmpty().withMessage('City is required'),
  body('country')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Country is required'),
];

router.post(
  '/register',
  authLimiter,
  registrationValidation,
  validateRequest,
  authController.register,
);

router.post(
  '/affiliate/register',
  authController.affiliateRegister
);

router.post('/login', loginValidation, validateRequest, authController.login);

router.post(
  '/affiliate/login',
  loginValidation,
  validateRequest,
  authController.affiliateLogin
);router.post(
  '/forgot-password',
  oneOf(
    [
      body('email').isEmail().normalizeEmail(),
      body('phone_number').matches(/^\+?[1-9]\d{1,14}$/),
    ],
    { message: 'Either email or phone number is required' },
  ),
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
router.get('/profile', verifyToken, authController.viewProfile);

router.get('/players', authController.getAllPlayers);
/*Get players statistics*/
router.get('/players/statistics', verifyAdmin, authController.getPlayerStats);

/*Get players region statistics*/
router.get(
  '/players/region/statistics',
  verifyAdmin,
  authController.getPlayerRegionStats,
);

router.delete('/players/:userId', verifyAdmin,authController.deletePlayer);
router.put(
  '/players/:userId/status',
  body('status').isInt({ min: 0, max: 1 }).withMessage('Status must be 0 or 1'),
  validateRequest,
  verifyAdmin,
  authController.updatePlayerStatus,
);

router.put(
  '/profile',
  verifyToken,
  updateProfileValidation,
  validateRequest,
  authController.updateProfile,
);
router.get('/verify-email', validateRequest, authController.verifyEmail);

// router.post(
//   '/send-verification-email',
//   verifyToken,
//   [
//     body('email')
//       .isEmail()
//       .normalizeEmail()
//       .withMessage('Valid email is required'),
//   ],
//   validateRequest,
//   authController.sendVerificationEmail,
// );

router.post(
  '/verify-phone',
  body('phone_number').matches(/^\+?[1-9]\d{1,14}$/),
  body('code').isLength({ min: 6, max: 6 }),
  validateRequest,
  authController.verifyPhone,
);

router.post(
  '/upload-photo',
  verifyToken,
  upload.single('photo'),
  authController.uploadPhoto,
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

router.get('/notifications', authController.getAdminNotifications);

router.post(
  '/payment-methods',
  verifyToken,
  [
    body('method_type').isIn(['credit_card', 'paypal', 'bank_transfer']),
    body('details').isObject(),
    body('is_default').isBoolean(),
  ],
  paymentController.addPaymentMethod,
);

router.get(
  '/payment-methods',
  verifyToken,
  paymentController.getPaymentMethods,
);

router.put(
  '/payment-methods/:id',
  verifyToken,
  [
    body('method_type')
      .optional()
      .isIn(['credit_card', 'paypal', 'bank_transfer']),
    body('details').optional().isObject(),
    body('is_default').optional().isBoolean(),
  ],
  paymentController.updatePaymentMethod,
);

// Delete a payment method
router.delete(
  '/payment-methods/:id',
  verifyToken,
  paymentController.deletePaymentMethod,
);

router.post(
  '/create-payment-intent',
  verifyToken,
  [
    body('amount').isInt({ min: 1 }).withMessage('Amount must be at least 1'),
    body('currency').isString().withMessage('Currency is required'),
  ],
  validateRequest,
  paymentController.createPaymentIntent,
);

router.get('/stripe-config', verifyToken, paymentController.getStripeConfig);
router.post(
  '/process-withdrawal',
  verifyToken,
  [
    body('amount').isInt({ min: 1 }).withMessage('Amount must be at least 1'),
    body('currency').isString().withMessage('Currency is required'),
    body('paymentMethodId').optional().isString(),
  ],
  validateRequest,
  paymentController.processWithdrawal,
);

router.get('/player/balance', verifyToken, paymentController.getPlayerBalance);

router.get(
  '/transactions',
  verifyToken,
  paymentController.getTransactionHistory,
);

router.get(
  '/transactions/:id',
  verifyToken,
  paymentController.getTransactionDetail,
);

// Google OAuth routes
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'] }),
);

router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/login',
    session: false,
  }),
  (req, res) => {
    const tokenResponse = generateTokenResponse(req.user as IPlayer);
    res.redirect(`${process.env.CLIENT_URL}?token=${tokenResponse.token}`);
  },
);

router.get(
  '/facebook',
  passport.authenticate('facebook', { scope: ['email'] }),
);

router.get(
  '/facebook/callback',
  passport.authenticate('facebook', {
    failureRedirect: '/login',
    session: false,
  }),
  (req, res) => {
    const tokenResponse = generateTokenResponse(req.user as IPlayer);
    res.redirect(`${process.env.CLIENT_URL}?token=${tokenResponse.token}`);
  },
);

router.post(
  '/verify-2fa',
  [
    body('playerId').notEmpty().withMessage('Player ID is required'),
    body('otp')
      .isLength({ min: 6, max: 6 })
      .withMessage('OTP must be 6 digits'),
  ],
  validateRequest,
  authController.verify2FA,
);

router.post(
  '/verify-otp',
  [
    body('playerId').notEmpty().withMessage('Player ID is required'),
    body('otp')
      .isLength({ min: 6, max: 6 })
      .withMessage('OTP must be 6 digits'),
  ],
  validateRequest,
  authController.verifyOTP,
);

router.post(
  '/toggle-2fa',
  verifyToken,
  [
    body('enabled').isBoolean().withMessage('Enabled must be a boolean'),
    body('method')
      .optional()
      .isIn(['email', 'phone'])
      .withMessage('Method must be "email" or "phone"'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validateRequest,
  authController.toggle2FA,
);

router.post(
  '/resend-verification-email',
  verifyToken,
  resendEmailLimiter,
  authController.resendVerificationEmail,
);

router.post(
  '/update-cookie-consent',
  verifyToken,
  [
    body('playerId').notEmpty().withMessage('Player ID is required'),
    body('consent')
      .isIn(['accepted', 'rejected'])
      .withMessage('Consent must be "accepted" or "rejected"'),
  ],
  validateRequest,
  authController.updateCookieConsent,
);

router.post(
  '/change-password',
  verifyToken,
  [
    body('currentPassword')
      .notEmpty()
      .withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
      )
      .withMessage(
        'Password must contain uppercase, lowercase, number, and special character',
      ),
  ],
  validateRequest,
  authController.changePassword,
);

/*Stripe config apis*/
router.get('/stripe-config-details',verifyAdmin,authController.geStripeConfig);
router.patch('/stripe-config-details',verifyAdmin,authController.updateStripeConfig);

/*Affiliate users apis */
router.post('/register-affiliate-users',validateAffiliate,handleValidationErrors,authController.addAffliateUsers);
router.get('/verify-affiliate-email', validateRequest, authController.verifyAffiliateEmail);
router.get('/affiliate-users',verifyAdmin,authController.getAffliateUsers);
router.patch('/affiliate-users/status/:id',verifyAdmin,authController.updateAffliateUsersStatus);
router.get('/affiliate-users/:id',verifyAdmin,authController.getAffliateUsersDetails);
router.patch('/affiliate-users',verifyToken,authController.updateAffliateUsersDetails);
router.post('/affiliate-login', affiliateloginValidation, handleValidationErrors, authController.affiliatelogin);

/* SumSub Apis */

router.post(
  '/sumsub/start',
  passport.authenticate('jwt', { session: false }),
  startSumsubVerification
);
router.post('/sumsub/webhook', sumsubWebhook);


//Payment Configuration Routes

router.get(
  '/payment-configs/all',
  verifyToken,
  verifyAdmin,
  paymentController.getPaymentConfigs
);

router.get(
  '/payment-configs/:id',
  verifyToken,
  verifyAdmin,
  paymentController.getPaymentConfig
);

router.put(
  '/payment-configs/:id',
  verifyToken,
  verifyAdmin,
  [
    body('config').optional().isObject().withMessage('Config must be an object'),
    body('mode').optional().isIn(['test', 'live']).withMessage('Mode must be either "test" or "live"'),
    body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  ],
  validateRequest,
  paymentController.updatePaymentConfig
);

router.delete(
  '/payment-configs/:id',
  verifyToken,
  verifyAdmin,
  paymentController.deletePaymentConfig
);

export default router;
