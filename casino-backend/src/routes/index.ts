import { Router } from 'express';
import authRouter from './authRoutes';
import roleRouter from './roleRoutes';
import gameRoutes from './gameRoutes';

const router = Router();

router.use('/api/auth', authRouter);
router.use('/api/roles', roleRouter);
router.use('/api/games', gameRoutes);

export default router;
