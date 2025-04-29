import { Router } from 'express';
import authRouter from './authRoutes';
import roleRouter from './roleRoutes';
import gameRoutes from './gameRoutes';
import affiliateRouter from './affiliateRoutes';
import adminRouter from './adminRoutes';
import paymentRouter from './paymentRoutes';
import sumsubRouter from './sumsubRoutes';

const router = Router();

router.use('/api/auth', authRouter);
router.use('/api/roles', roleRouter);
router.use('/api/games', gameRoutes);
router.use('/api/affiliate', affiliateRouter);
router.use('/api/admin', adminRouter);
router.use('/api/payment', paymentRouter);
router.use('/api/sumsub', sumsubRouter);

export default router;