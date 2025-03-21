import { Router } from 'express';
import * as gameController from '../controllers/gameController';
import { verifyToken } from '../utils/jwt';
import upload from '../middlewares/uploadMiddleware';

const router = Router();

router.post('/', upload.single('image'), gameController.createGame);

router.get('/', gameController.getAllGames);

router.put('/:gameId/status', verifyToken, gameController.updateGameStatus);

// New RGS Integration Routes
router.get('/rgs/games', verifyToken, gameController.getRGSGames);
router.post('/rgs/launch', verifyToken, gameController.launchRGSGame);

// RGS Callback Endpoints
router.get('/rgs/player/balance', gameController.getPlayerBalance);
router.post('/rgs/player/debit', gameController.debitPlayerBalance);
router.post('/rgs/player/credit', gameController.creditPlayerBalance);
export default router;
