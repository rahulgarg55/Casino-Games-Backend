import express, { Router } from 'express';
import * as paymentController from '../controllers/paymentController';
import { body } from 'express-validator';
import validateRequest from '../middlewares/validateRequest';
import { verifyToken, verifyAdmin } from '../utils/jwt';

const router = Router();

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

export default router;
