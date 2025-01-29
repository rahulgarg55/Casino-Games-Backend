import { Router } from 'express';
import * as authController from '../controllers/authController';
import { body } from 'express-validator';
import rateLimit from 'express-rate-limit';
import validateRequest from '../middlewares/validateRequest';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many attempts from this IP, please try again later'
});

/**
 * An array of validation rules for user registration.
 * 
 * The following fields are validated:
 * - `username`: Must be a string between 3 and 30 characters.
 * - `email`: Must be a valid email address.
 * - `password`: Must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.
 * - `fullname`: Must be a non-empty string.
 * - `patronymic`: Must be a non-empty string.
 * - `role_id`: Must be a valid MongoDB ObjectId.
 * 
 * Each validation rule includes a corresponding error message if the validation fails.
 */
const registrationValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3-30 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
    .withMessage('Password must contain uppercase, lowercase, number, and special character'),
  body('fullname')
    .trim()
    .notEmpty()
    .withMessage('Full name is required'),
  body('patronymic')
    .trim()
    .notEmpty()
    .withMessage('Patronymic is required'),
  body('role_id')
    .isMongoId()
    .withMessage('Invalid role ID format')
];

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
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