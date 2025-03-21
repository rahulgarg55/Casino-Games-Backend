import { Request, Response } from 'express';
import * as gameService from '../services/gameService';
import cloudinary from '../utils/cloudinary';
import axios from 'axios';
import Player from '../models/player';
import Transaction from '../models/transaction';

const RGS_API_URL =
  process.env.RGS_API_URL || 'https://test-api.progaindia.com/v1/';
const RGS_GAME_URL =
  process.env.RGS_GAME_URL ||
  'https://test-games.progaindia.com/game_launcher.php';
const RGS_API_KEY = process.env.RGS_API_KEY || 'your-api-key-here';

interface CustomRequest extends Request {
  user?: {
    sub: string;
    id: string;
    role: number;
  };
}

export const createGame = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Game image is required',
      });
    }

    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'game-images',
    });

    const gameData = {
      name: req.body.name,
      provider: req.body.provider,
      image_url: result.secure_url,
    };

    const game = await gameService.createGame(gameData);

    res.status(201).json({
      success: true,
      message: 'Game created successfully',
      data: game,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create game',
    });
  }
};

export const getAllGames = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const provider = req.query.provider as string;
    const status = req.query.status
      ? parseInt(req.query.status as string)
      : undefined;

    const result = await gameService.getAllGames(page, limit, {
      provider,
      status,
    });

    res.status(200).json({
      success: true,
      message: 'Games retrieved successfully',
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'Failed to retrieve games',
    });
  }
};

export const updateGameStatus = async (req: Request, res: Response) => {
  try {
    const { gameId } = req.params;
    const { status } = req.body;

    const game = await gameService.updateGameStatus(gameId, status);

    res.status(200).json({
      success: true,
      message: 'Game status updated successfully',
      data: game,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to update game status',
    });
  }
};

// RGS Functions

export const getRGSGames = async (req: Request, res: Response) => {
  try {
    const response = await axios.get(`${RGS_API_URL}getGames`, {
      headers: { API_KEY: RGS_API_KEY },
    });

    res.status(200).json({
      success: true,
      message: 'RGS games retrieved',
      data: response.data,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to retrieve RGS games',
    });
  }
};

export const launchRGSGame = async (req: CustomRequest, res: Response) => {
  try {
    const { gameId, amountType = 1 } = req.body; // amountType default to 1 (real cash mode)

    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required or invalid token',
      });
    }

    const playerId = req.user.id;
    const player = await Player.findById(playerId);

    if (!player) {
      throw new Error('Player not found');
    }

    const sessionResponse = await axios.post(
      `${RGS_API_URL}registerSessionData`,
      {
        playerId: player._id.toString(),
        username: player.username,
        currency: player.currency,
      },
      {
        headers: { API_KEY: RGS_API_KEY },
      },
    );

    if (!sessionResponse.data || !sessionResponse.data.sessionId) {
      throw new Error('Failed to register session with RGS');
    }

    const sessId = sessionResponse.data.sessionId;

    const launchUrl = `${RGS_GAME_URL}?gameId=${gameId}&amountType=${amountType}&sessId=${sessId}&playerId=${player._id}&lang=${player.language || 'en'}`;

    res.status(200).json({
      success: true,
      launchUrl,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to launch RGS game',
    });
  }
};

// RGS Callback Endpoints
export const getPlayerBalance = async (req: Request, res: Response) => {
  try {
    const { playerId } = req.query;

    if (!playerId) {
      return res.status(400).json({
        success: false,
        error: 'Player ID is required',
      });
    }

    const player = await Player.findById(playerId);

    if (!player) {
      throw new Error('Player not found');
    }

    res.status(200).json({
      balance: player.balance,
      currency: player.currency,
    });
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error ? error.message : 'Failed to get player balance',
    });
  }
};

export const debitPlayerBalance = async (req: Request, res: Response) => {
  try {
    const { playerId, amount, gameRoundId } = req.body;

    if (!playerId || !amount || !gameRoundId) {
      return res.status(400).json({
        success: false,
        error: 'Player ID, amount, and game round ID are required',
      });
    }

    const player = await Player.findById(playerId);

    if (!player) {
      throw new Error('Player not found');
    }

    if (player.balance < amount) {
      throw new Error('Insufficient balance');
    }

    player.balance -= amount;
    await player.save();

    const transaction = new Transaction({
      player_id: playerId,
      amount: -amount,
      currency: player.currency,
      transaction_type: 'debit',
      game_round_id: gameRoundId,
      status: 'completed',
    });

    await transaction.save();

    res.status(200).json({
      success: true,
      newBalance: player.balance,
    });
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : 'Failed to debit player balance',
    });
  }
};

export const creditPlayerBalance = async (req: Request, res: Response) => {
  try {
    const { playerId, amount, gameRoundId } = req.body;

    if (!playerId || !amount || !gameRoundId) {
      return res.status(400).json({
        success: false,
        error: 'Player ID, amount, and game round ID are required',
      });
    }

    const player = await Player.findById(playerId);

    if (!player) {
      throw new Error('Player not found');
    }

    player.balance += amount;
    await player.save();

    const transaction = new Transaction({
      player_id: playerId,
      amount,
      currency: player.currency,
      transaction_type: 'credit',
      game_round_id: gameRoundId,
      status: 'completed',
    });

    await transaction.save();

    res.status(200).json({
      success: true,
      newBalance: player.balance,
    });
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : 'Failed to credit player balance',
    });
  }
};
