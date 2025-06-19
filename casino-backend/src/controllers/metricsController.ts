import { Request, Response } from 'express';
import Player from '../models/player';
import Transaction, { ITransaction } from '../models/transaction';
import GameSession from '../models/gameSession';
import { sendErrorResponse, sendSuccessResponse } from '../utils/response';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/metrics.log' }),
    new winston.transports.Console()
  ]
});

// Get total revenue (sum of all deposits minus withdrawals)
export const getTotalRevenue = async (req: Request, res: Response) => {
  try {
    const deposits = await Transaction.aggregate([
      { $match: { transaction_type: 'topup', status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const withdrawals = await Transaction.aggregate([
      { $match: { transaction_type: 'withdrawal', status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const totalDeposits = deposits[0]?.total || 0;
    const totalWithdrawals = withdrawals[0]?.total || 0;
    const totalRevenue = totalDeposits - totalWithdrawals;

    sendSuccessResponse(res, { totalRevenue });
  } catch (error: any) {
    logger.error('Error fetching total revenue:', error);
    sendErrorResponse(res, 500, error.message);
  }
};

// Get total game sessions
export const getGameSessions = async (req: Request, res: Response) => {
  try {
    const totalSessions = await GameSession.countDocuments();
    sendSuccessResponse(res, { gameSessions: totalSessions });
  } catch (error: any) {
    logger.error('Error fetching game sessions:', error);
    sendErrorResponse(res, 500, error.message);
  }
};

// Get total transactions
export const getTotalTransactions = async (req: Request, res: Response) => {
  try {
    const totalTransactions = await Transaction.countDocuments({ status: 'completed' });
    sendSuccessResponse(res, { totalTransactions });
  } catch (error: any) {
    logger.error('Error fetching total transactions:', error);
    sendErrorResponse(res, 500, error.message);
  }
};

// Get recent transactions
export const getRecentTransactions = async (req: Request, res: Response) => {
  try {
    const transactions = await Transaction.find({ status: 'completed' })
      .sort({ created_at: -1 })
      .limit(10)
      .populate<{ player_id: { username: string; email: string } }>('player_id', 'username email');

    const formattedTransactions = transactions.map(tx => ({
      id: tx._id,
      type: tx.transaction_type,
      amount: tx.amount,
      status: tx.status,
      timeAgo: getTimeAgo(tx.created_at),
      player: tx.player_id ? {
        username: tx.player_id.username,
        email: tx.player_id.email
      } : null
    }));

    sendSuccessResponse(res, { transactions: formattedTransactions });
  } catch (error: any) {
    logger.error('Error fetching recent transactions:', error);
    sendErrorResponse(res, 500, error.message);
  }
};

// Get active players per month
export const getActivePlayersPerMonth = async (req: Request, res: Response) => {
  try {
    const currentYear = new Date().getFullYear();
    const activePlayersPerMonth = await Player.aggregate([
      {
        $match: {
          last_login: {
            $gte: new Date(currentYear, 0, 1),
            $lte: new Date(currentYear, 11, 31)
          }
        }
      },
      {
        $group: {
          _id: { $month: '$last_login' },
          activePlayers: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Fill in missing months with 0
    const result = Array(12).fill(0).map((_, index) => {
      const monthData = activePlayersPerMonth.find(m => m._id === index + 1);
      return {
        month: index + 1,
        activePlayers: monthData ? monthData.activePlayers : 0
      };
    });

    sendSuccessResponse(res, { activePlayersPerMonth: result });
  } catch (error: any) {
    logger.error('Error fetching active players per month:', error);
    sendErrorResponse(res, 500, error.message);
  }
};

// Get players by region
export const getPlayersByRegion = async (req: Request, res: Response) => {
  try {
    const playersByRegion = await Player.aggregate([
      {
        $group: {
          _id: '$country',
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          label: '$_id',
          value: '$count',
          _id: 0
        }
      }
    ]);

    sendSuccessResponse(res, { playersByRegion });
  } catch (error: any) {
    logger.error('Error fetching players by region:', error);
    sendErrorResponse(res, 500, error.message);
  }
};

// Helper function to get time ago
function getTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
  
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + ' years ago';
  
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + ' months ago';
  
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + ' days ago';
  
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + ' hours ago';
  
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + ' minutes ago';
  
  return Math.floor(seconds) + ' seconds ago';
} 