import { Router } from 'express';
import authRouter from './authRoutes';
import roleRouter from './roleRoutes';
import gameRoutes from './gameRoutes';
import affiliateRouter from './affiliateRoutes';
import adminRouter from './adminRoutes';
import paymentRouter from './paymentRoutes';
import sumsubRouter from './sumsubRoutes';
import platformFeeRoutes from './platformFeeRoutes';

const router = Router();

router.get('/api', (req, res) => {
  res.status(200).json({ message: 'Welcome to the API!' });
});

router.use('/api/auth', authRouter);
router.use('/api/roles', roleRouter);
router.use('/api/games', gameRoutes);
router.use('/api/affiliate', affiliateRouter);
router.use('/api/admin', adminRouter);
router.use('/api/payment', paymentRouter);
router.use('/api/sumsub', sumsubRouter);
router.use('/platform-fee', platformFeeRoutes);

export default router;
