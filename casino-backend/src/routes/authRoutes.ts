import { Router } from 'express';
import * as authController from '../controllers/authController';
import { body, oneOf } from 'express-validator';
import rateLimit from 'express-rate-limit';
import validateRequest from '../middlewares/validateRequest';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many attempts from this IP, please try again later'
});

const registrationValidation = [
  oneOf([
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    body('phone_number')
      .matches(/^\+?[1-9]\d{1,14}$/)
      .withMessage('Valid phone number is required')
  ], { message: 'Either email or phone number is required' }),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
    .withMessage('Password must contain uppercase, lowercase, number, and special character'),
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
    .withMessage('Patronymic is required')
];

const loginValidation = [
  oneOf([
    body('email').isEmail().normalizeEmail(),
    body('phone_number').matches(/^\+?[1-9]\d{1,14}$/)
  ], { message: 'Either email or phone number is required' }),
  body('password').notEmpty().withMessage('Password is required')
];

router.post(
  '/register',
  authLimiter,
  registrationValidation,
  validateRequest,
  authController.register
);

router.post(
  '/login',
  authLimiter,
  loginValidation,
  validateRequest,
  authController.login
);

export default router;