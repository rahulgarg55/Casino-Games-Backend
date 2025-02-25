import { Request, Response } from 'express';
import * as gameService from '../services/gameService';
import cloudinary from '../utils/cloudinary';

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
      name: req.body.game,
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
