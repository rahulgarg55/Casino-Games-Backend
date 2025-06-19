import express from 'express';
import { body } from 'express-validator';
import validateRequest from '../middlewares/validateRequest';
import { verifyToken, verifyAdmin } from '../utils/jwt';
import * as platformFeeController from '../controllers/platformFeeController';

const router = express.Router();

// Get platform fee configuration
router.get(
  '/config',
  verifyToken,
  platformFeeController.getPlatformFeeConfig
);

// Update platform fee configuration (admin only)
router.put(
  '/config',
  verifyToken,
  verifyAdmin,
  [
    body('fee_percentage')
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage('Fee percentage must be between 0 and 100'),
    body('is_active')
      .optional()
      .isBoolean()
      .withMessage('is_active must be a boolean'),
    body('min_fee_amount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Minimum fee amount must be non-negative'),
    body('max_fee_amount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Maximum fee amount must be non-negative')
  ],
  validateRequest,
  platformFeeController.updatePlatformFeeConfig
);

// Calculate fee for a given amount
router.post(
  '/calculate',
  verifyToken,
  [
    body('amount')
      .isFloat({ min: 0 })
      .withMessage('Amount must be non-negative')
  ],
  validateRequest,
  platformFeeController.calculateFee
);

export default router; 