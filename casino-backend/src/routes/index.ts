import { Router } from 'express';
import authRouter from './authRoutes';
import roleRouter from './roleRoutes';

/**
 * Initializes and configures the main router for the application.
 * This router will handle all the routes defined in the application.
 */
const router = Router();

router.use('/api/auth', authRouter);
router.use('/api/roles', roleRouter);

export default router;