import { Router } from 'express';
import * as gameController from '../controllers/gameController';
import { verifyToken } from '../utils/jwt';
import upload from '../middlewares/uploadMiddleware';

const router = Router();

router.post('/', upload.single('image'), gameController.createGame);

router.get('/', gameController.getAllGames);

router.put('/:gameId/status', verifyToken, gameController.updateGameStatus);

export default router;
