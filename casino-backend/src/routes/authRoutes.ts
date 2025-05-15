import express, { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import * as authController from '../controllers/authController';
import * as paymentController from '../controllers/paymentController';
import { setGlobalCommission,getGlobalCommission } from '../controllers/commissionController';
import { body, oneOf, query } from 'express-validator';
import rateLimit from 'express-rate-limit';
import validateRequest from '../middlewares/validateRequest';
import { verifyToken, verifyAdmin } from '../utils/jwt';
import bodyParser from 'body-parser';
import passport, { authenticate } from 'passport';
import upload from '../middlewares/uploadMiddleware';
import { generateTokenResponse } from '../utils/auth';
import { IPlayer } from '../models/player';
import {
  validateStripeConfig,
  handleValidationErrors,
  validateAffiliate,
  affiliateloginValidation,
} from '../validation/authValidation';
import {
  startSumsubVerification,  
  sumsubWebhook,
  getSumsubStatus,
} from '../controllers/sumsubController';

const router = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many attempts from this IP, please try again later',
});

const clickLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message:
    'Too many click tracking requests from this IP, please try again later',
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

router.post('/affiliate/register', authController.affiliateRegister);

router.post('/login', loginValidation, validateRequest, authController.login);

router.post(
  '/affiliate/login',
  loginValidation,
  validateRequest,
  authController.affiliateLogin,
);
router.post(
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

router.get(
  '/players/:userId',
  verifyToken,
  verifyAdmin,
  authController.getPlayerDetails,
);
/*Get players statistics*/
router.get('/players/statistics', verifyAdmin, authController.getPlayerStats);

/*Get players region statistics*/
router.get(
  '/players/region/statistics',
  verifyAdmin,
  authController.getPlayerRegionStats,
);

router.delete('/players/:userId', verifyAdmin, authController.deletePlayer);
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
  verifyAdmin,
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
router.get(
  '/stripe-config-details',
  verifyAdmin,
  authController.geStripeConfig,
);
router.patch(
  '/stripe-config-details',
  verifyAdmin,
  authController.updateStripeConfig,
);

/*Affiliate users apis */
router.post(
  '/register-affiliate-users',
  validateAffiliate,
  handleValidationErrors,
  authController.addAffliateUsers,
);

router.post(
  '/affiliate/resend-verification-email',
  resendEmailLimiter,
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  validateRequest,
  authController.resendVerificationEmailAffiliate,
);

router.get('/verify-affiliate-email', authController.verifyAffiliateEmail);
router.get('/affiliate-users', verifyAdmin, authController.getAffliateUsers);
router.patch(
  '/affiliate-users/status/:id',
  verifyAdmin,
  authController.updateAffliateUsersStatus,
);
router.get(
  '/affiliate-users/:id',
  verifyAdmin,
  authController.getAffliateUsersDetails,
);
router.patch(
  '/affiliate-users',
  verifyToken,
  authController.updateAffliateUsersDetails,
);
router.post(
  '/affiliate-login',
  affiliateloginValidation,
  handleValidationErrors,
  authController.affiliatelogin,
);

router.post(
  '/affiliate/forgot-password',
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  validateRequest,
  authController.affiliateForgotPassword,
);

router.post(
  '/affiliate/reset-password',
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
  authController.affiliateResetPassword,
);

router.get(
  '/verify-affiliate-email',
  validateRequest,
  authController.verifyAffiliateEmail,
);
router.get('/affiliate-users', verifyAdmin, authController.getAffliateUsers);
router.patch(
  '/affiliate-users/status/:id',
  verifyAdmin,
  authController.updateAffliateUsersStatus,
);
router.get(
  '/affiliate-users/:id',
  verifyAdmin,
  authController.getAffliateUsersDetails,
);
router.patch(
  '/affiliate-users',
  verifyToken,
  authController.updateAffliateUsersDetails,
);
router.post(
  '/affiliate-login',
  affiliateloginValidation,
  handleValidationErrors,
  authController.affiliatelogin,
);
router.get(
  '/affiliate/earnings',
  verifyToken,
  authController.getAffiliateEarnings,
);
/* SumSub Apis */

router.post(
  '/sumsub/start',
  passport.authenticate('jwt', { session: false }),
  startSumsubVerification,
);
router.post('/sumsub/webhook', sumsubWebhook);

router.get(
  '/sumsub/status',
  passport.authenticate('jwt', { session: false }),
  getSumsubStatus
);

//Payment Configuration Routes

router.get(
  '/payment-configs/all',
  verifyToken,
  verifyAdmin,
  paymentController.getPaymentConfigs,
);

router.get(
  '/payment-configs/:id',
  verifyToken,
  verifyAdmin,
  paymentController.getPaymentConfig,
);

router.put(
  '/payment-configs/:id',
  verifyToken,
  verifyAdmin,
  [
    body('config')
      .optional()
      .isObject()
      .withMessage('Config must be an object'),
    body('mode')
      .optional()
      .isIn(['test', 'live'])
      .withMessage('Mode must be either "test" or "live"'),
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean'),
  ],
  validateRequest,
  paymentController.updatePaymentConfig,
);

router.delete(
  '/payment-configs/:id',
  verifyToken,
  verifyAdmin,
  paymentController.deletePaymentConfig,
);

// Affiliate Dashboard
router.get(
  '/affiliate/dashboard',
  verifyToken,
  authController.getAffiliateDashboard,
);

// Create Referral Link
router.post(
  '/affiliate/referral-links',
  verifyToken,
  [
    body('campaignName')
      .trim()
      .notEmpty()
      .withMessage('Campaign name is required'),
    body('destinationUrl').isURL().withMessage('Invalid destination URL'),
  ],
  validateRequest,
  authController.createReferralLink,
);

// List Referral Links
router.get(
  '/affiliate/referral-links',
  verifyToken,
  authController.getReferralLinks,
);

// Track Referral Click
router.post(
  '/affiliate/track-click',
  clickLimiter,
  [
    body('trackingId').notEmpty().withMessage('Tracking ID is required'),
    body('ipAddress').optional().isIP().withMessage('Invalid IP address'),
  ],
  validateRequest,
  authController.trackReferralClick,
);

router.post(
  '/affiliate/payouts/request',
  verifyToken,
  [
    body('amount').isFloat({ min: 1 }).withMessage('Amount must be at least 1'),
    body('paymentMethodId')
      .optional()
      .isString()
      .withMessage('Invalid payment method ID'),
    body('currency').isString().withMessage('Currency is required'),
  ],
  validateRequest,
  authController.requestPayout,
);

// List Payouts
router.get('/affiliate/payouts', verifyToken, authController.getPayouts);

// Admin Update Payout Status
router.patch(
  '/admin/affiliate/payouts/:payoutId',
  verifyToken,
  verifyAdmin,
  [
    body('status')
      .isIn(['approved', 'rejected', 'paid'])
      .withMessage('Invalid status'),
    body('adminNotes').optional().trim(),
  ],
  validateRequest,
  authController.updatePayoutStatus,
);

// Admin List All Payouts
router.get(
  '/admin/affiliate/payouts',
  verifyToken,
  verifyAdmin,
  authController.getAllPayouts,
);

// Create Commission Tier
router.post(
  '/admin/affiliate/tiers',
  verifyToken,
  verifyAdmin,
  [
    body('tierName').trim().notEmpty().withMessage('Tier name is required'),
    body('minReferrals')
      .isInt({ min: 0 })
      .withMessage('Minimum referrals must be a non-negative integer'),
    body('commissionRate')
      .isFloat({ min: 0, max: 100 })
      .withMessage('Commission rate must be between 0 and 100'),
    body('currency').isString().withMessage('Currency is required'),
  ],
  validateRequest,
  authController.createCommissionTier,
);

// Update Commission Tier
router.patch(
  '/admin/affiliate/tiers/:tierId',
  verifyToken,
  verifyAdmin,
  [
    body('tierName')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Tier name cannot be empty'),
    body('minReferrals')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Minimum referrals must be a non-negative integer'),
    body('commissionRate')
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage('Commission rate must be between 0 and 100'),
    body('currency').optional().isString().withMessage('Currency is required'),
  ],
  validateRequest,
  authController.updateCommissionTier,
);

// List Referrals
router.get('/affiliate/referrals', verifyToken, authController.getReferrals);

// List Promotional Materials
router.get(
  '/affiliate/promo-materials',
  verifyToken,
  authController.getPromoMaterials,
);

// Admin Upload Promotional Material
router.post(
  '/admin/affiliate/promo-materials',
  verifyToken,
  verifyAdmin,
  upload.single('file'),
  [
    body('type')
      .isIn(['banner', 'logo', 'video'])
      .withMessage('Invalid material type'),
    body('dimensions').optional().trim(),
  ],
  validateRequest,
  authController.uploadPromoMaterial,
);

// Generate Performance Report
router.get(
  '/affiliate/reports',
  verifyToken,
  [
    query('startDate').optional().isISO8601().withMessage('Invalid start date'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date'),
    query('format').isIn(['csv', 'pdf']).withMessage('Invalid format'),
  ],
  validateRequest,
  authController.generatePerformanceReport,
);

// Update Communication Preferences
router.patch(
  '/affiliate/preferences',
  verifyToken,
  [
    body('marketingEmailsOptIn')
      .optional()
      .isBoolean()
      .withMessage('Marketing emails opt-in must be a boolean'),
    body('notificationPreferences.newReferral')
      .optional()
      .isBoolean()
      .withMessage('New referral preference must be a boolean'),
    body('notificationPreferences.payoutProcessed')
      .optional()
      .isBoolean()
      .withMessage('Payout processed preference must be a boolean'),
    body('notificationPreferences.campaignUpdates')
      .optional()
      .isBoolean()
      .withMessage('Campaign updates preference must be a boolean'),
  ],
  validateRequest,
  authController.updatePreferences,
);

/*Get languages*/
router.get('/languages',authController.getLanguages);
router.post('/admin/banner', verifyToken, verifyAdmin, authController.saveBannerConfig);
router.get('/banner', verifyToken, verifyAdmin, authController.getBannerConfig);
router.post('/admin/commission', verifyToken, verifyAdmin, setGlobalCommission);
router.get('/admin/commission', verifyToken, verifyAdmin, getGlobalCommission); 

router.get(
  '/apple',
  passport.authenticate('apple', { scope: ['name', 'email'] }),
);

router.post(
  '/apple/callback',
  passport.authenticate('apple', {
    failureRedirect: '/login',
    session: false,
  }),
  (req, res) => {
    console.log("=======apple callback====")
    const tokenResponse = generateTokenResponse(req.user as IPlayer);
    console.log("=====tokenResponse======",tokenResponse)
    res.redirect(`${process.env.CLIENT_URL}?token=${tokenResponse.token}`);
  },
);

export default router;
