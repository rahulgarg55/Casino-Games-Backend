import { Router } from 'express';
import * as authController from '../controllers/authController';
import { body, oneOf } from 'express-validator';
import rateLimit from 'express-rate-limit';
import validateRequest from '../middlewares/validateRequest';
import { verifyToken } from '../utils/jwt';
import passport, { authenticate } from 'passport';
import upload from '../middlewares/uploadMiddleware';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many attempts from this IP, please try again later',
});
const resendEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
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
  body('dob')
    .optional()
    .isDate()
    .withMessage('Date of birth must be a valid date'),
  body('gender').optional().trim().notEmpty().withMessage('Gender is required'),
  body('city').optional().trim().notEmpty().withMessage('City is required'),
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
  '/login',
  authLimiter,
  loginValidation,
  validateRequest,
  authController.login,
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
router.get('/profile', authController.viewProfile);

router.get('/players', authController.getAllPlayers);

router.put(
  '/profile',
  verifyToken,
  updateProfileValidation,
  validateRequest,
  authController.updateProfile,
);
router.get(
  '/verify-email',
  validateRequest,
  authController.verifyEmail,
);

router.post('/verify-phone',
  body('phone_number').matches(/^\+?[1-9]\d{1,14}$/),
  body('code').isLength({ min: 6, max: 6 }),
  validateRequest,
  authController.verifyPhone
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
// Google OAuth routes
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'] }),
);
router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  authController.googleCallback,
);

// Facebook OAuth routes
router.get(
  '/facebook',
  passport.authenticate('facebook', { scope: ['email'] }),
);
router.get(
  '/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/login' }),
  authController.facebookCallback,
);

export default router;
