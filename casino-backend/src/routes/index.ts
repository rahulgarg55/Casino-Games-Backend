import { Router } from 'express';
import authRouter from './authRoutes';
import roleRouter from './roleRoutes';

const router = Router();

router.use('/api/auth', authRouter);
router.use('/api/roles', roleRouter);

export default router;
