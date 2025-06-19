import Game, { IGame } from '../models/game';
import { PlatformFeeService } from './platformFeeService';
import Player from '../models/player';
import Transaction from '../models/transaction';
import { logger } from '../utils/logger';

interface GameFilters {
  provider?: string;
  status?: number;
}

export const createGame = async (data: {
  name: string;
  provider: string;
  image_url: string;
}): Promise<IGame> => {
  const game = new Game(data);
  await game.save();
  return game;
};

export const getAllGames = async (
  page: number = 1,
  limit: number = 20,
  filters: GameFilters = {},
) => {
  const query: any = {};
  if (filters.provider) query.provider = filters.provider;
  if (typeof filters.status !== 'undefined') query.status = filters.status;

  const games = await Game.find(query)
    .sort({ created_at: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
  const total = await Game.countDocuments(query);

  return {
    games,
    pagination: { total, page, totalPages: Math.ceil(total / limit) },
  };
};

export const updateGameStatus = async (
  gameId: string,
  status: number,
  req:any
): Promise<IGame> => {
  const game = await Game.findByIdAndUpdate(
    gameId,
    { status, updated_at: new Date() },
    { new: true },
  );
  if (!game) throw new Error((req as any).__('GAME_NOT_FOUND'));
  return game;
};

export const processGameWin = async (playerId: string, amount: number, gameRoundId: string) => {
  try {
    const player = await Player.findById(playerId);
    if (!player) {
      throw new Error('Player not found');
    }

    // Calculate and deduct platform fee
    const platformFeeService = PlatformFeeService.getInstance();
    const { netAmount, feeAmount } = await platformFeeService.calculateAndDeductFee(
      playerId,
      amount
    );

    // Update player balance with net amount (after fee deduction)
    player.balance += netAmount;
    await player.save();

    // Create transaction record for the win
    const transaction = new Transaction({
      player_id: playerId,
      amount: netAmount,
      currency: player.currency,
      transaction_type: 'win',
      payment_method: 'game_win',
      status: 'completed',
      metadata: {
        game_round_id: gameRoundId,
        original_amount: amount,
        platform_fee: feeAmount,
        fee_percentage: 2 // 2% platform fee
      }
    });

    await transaction.save();

    logger.info('Game win processed', {
      playerId,
      originalAmount: amount,
      netAmount,
      platformFee: feeAmount,
      gameRoundId
    });

    return {
      success: true,
      newBalance: player.balance,
      platformFee: feeAmount,
      netAmount
    };
  } catch (error) {
    logger.error('Failed to process game win', {
      playerId,
      amount,
      gameRoundId,
      error
    });
    throw error;
  }
};
