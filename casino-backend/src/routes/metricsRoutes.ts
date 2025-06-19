import express from 'express';
import {
  getTotalRevenue,
  getGameSessions,
  getTotalTransactions,
  getRecentTransactions,
  getActivePlayersPerMonth,
  getPlayersByRegion,
} from '../controllers/metricsController';
import passport from 'passport';

const router = express.Router();

// All routes require authentication
router.use(passport.authenticate('jwt', { session: false }));

// Metrics endpoints
router.get('/total-revenue', getTotalRevenue);
router.get('/game-sessions', getGameSessions);
router.get('/total-transactions', getTotalTransactions);
router.get('/transactions/recent', getRecentTransactions);
router.get('/players/statistics', getActivePlayersPerMonth);
router.get('/players/region/statistics', getPlayersByRegion);

export default router; 