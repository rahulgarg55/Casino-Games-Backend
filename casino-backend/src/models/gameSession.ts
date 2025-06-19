import mongoose, { Document, Schema } from 'mongoose';

export interface IGameSession extends Document {
  player_id: mongoose.Types.ObjectId;
  game_id: string;
  game_type: string;
  start_time: Date;
  end_time?: Date;
  duration?: number;
  bet_amount: number;
  win_amount: number;
  status: 'active' | 'completed' | 'abandoned';
  created_at: Date;
  updated_at: Date;
}

const gameSessionSchema = new Schema<IGameSession>(
  {
    player_id: {
      type: Schema.Types.ObjectId,
      ref: 'Player',
      required: true,
    },
    game_id: {
      type: String,
      required: true,
    },
    game_type: {
      type: String,
      required: true,
      enum: ['slots', 'poker', 'roulette', 'blackjack', 'baccarat'],
    },
    start_time: {
      type: Date,
      required: true,
      default: Date.now,
    },
    end_time: {
      type: Date,
    },
    duration: {
      type: Number, // Duration in seconds
    },
    bet_amount: {
      type: Number,
      required: true,
      default: 0,
    },
    win_amount: {
      type: Number,
      required: true,
      default: 0,
    },
    status: {
      type: String,
      required: true,
      enum: ['active', 'completed', 'abandoned'],
      default: 'active',
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

// Indexes for better query performance
gameSessionSchema.index({ player_id: 1, created_at: -1 });
gameSessionSchema.index({ game_type: 1, created_at: -1 });
gameSessionSchema.index({ status: 1 });

export default mongoose.model<IGameSession>('GameSession', gameSessionSchema); 