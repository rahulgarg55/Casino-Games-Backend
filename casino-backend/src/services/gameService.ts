import Game, { IGame } from '../models/game';

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
): Promise<IGame> => {
  const game = await Game.findByIdAndUpdate(
    gameId,
    { status, updated_at: new Date() },
    { new: true },
  );
  if (!game) throw new Error('Game not found');
  return game;
};
