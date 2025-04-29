import express, { Router } from 'express';
import * as adminController from '../controllers/adminController';
import * as paymentController from '../controllers/paymentController';
import * as authController from '../controllers/authController';
import { body } from 'express-validator';
import validateRequest from '../middlewares/validateRequest';
import { verifyToken, verifyAdmin } from '../utils/jwt';

const router = Router();

router.get('/players', adminController.getAllPlayersController);

router.get('/players/:userId', verifyToken, verifyAdmin, adminController.getPlayerDetailsController);

router.get('/players/statistics', verifyAdmin, adminController.getPlayerStats);

router.get('/players/region/statistics', verifyAdmin, adminController.getPlayerRegionStats);

router.delete('/players/:userId', verifyAdmin, adminController.deletePlayer);

router.put(
  '/players/:userId/status',
  body('status').isInt({ min: 0, max: 1 }).withMessage('Status must be 0 or 1'),
  validateRequest,
  verifyAdmin,
  adminController.updatePlayerStatus,
);

router.get('/notifications', adminController.getAdminNotifications);

router.get('/stripe-config-details', verifyAdmin, paymentController.getStripeConfig);

router.patch('/stripe-config-details', verifyAdmin, authController.updateStripeConfig);

router.patch(
  '/affiliate/payouts/:payoutId',
  verifyToken,
  verifyAdmin,
  [
    body('status')
      .isIn(['approved', 'rejected', 'paid'])
      .withMessage('Invalid status'),
    body('adminNotes').optional().trim(),
  ],
  validateRequest,
  adminController.updatePayoutStatusController,
);

router.get('/affiliate/payouts', verifyToken, verifyAdmin, adminController.getAllPayouts);

router.post(
  '/affiliate/tiers',
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
  adminController.createCommissionTierController,
);

router.patch(
  '/affiliate/tiers/:tierId',
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
  adminController.updateCommissionTierController,
);

export default router;