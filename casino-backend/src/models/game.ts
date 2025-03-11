import mongoose, { Schema, Document } from 'mongoose';

export interface IGame extends Document {
  name: string;
  image_url: string;
  provider: string;
  status: number;
  created_at: Date;  // Fixed typo from create_at to created_at
  updated_at: Date;
}

const gameSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  image_url: {
    type: String,
    required: true,
  },
  provider: {
    type: String,
    required: true,
    trim: true,
  },
  status: {
    type: Number,
    default: 1,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model<IGame>('Game', gameSchema);