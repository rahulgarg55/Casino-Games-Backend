import mongoose, { Schema, Document } from 'mongoose';
import { IPlayer } from './player';

export interface IPlayerBalance extends Document {
  player_id: IPlayer['_id'];
  balance: number;
  currency: number;
  is_deleted: number;
  created_at: Date;
  updated_at: Date;
  bonus_balance?: number;
}

const playerBalanceSchema: Schema = new Schema(
  {
    player_id: {
      type: Schema.Types.ObjectId,
      ref: 'Player',
      required: true,
      unique: true,
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Balance cannot be negative'],
    },
    currency: {
      type: Number,
      required: true,
      enum: [0, 1, 2], //0 = USD, 1 = INR, 2 = POUND
    },
    is_deleted: {
      type: Number,
      enum: [0, 1],
      default: 0,
    },
    bonus_balance: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret.__v;
        return ret;
      },
    },
  },
);
playerBalanceSchema.index({ player_id: 1 });
playerBalanceSchema.index({ currency: 1 });

playerBalanceSchema.pre(
  /^find/,
  function (
    this: mongoose.Query<any, any> & { options: { withDeleted?: boolean } },
    next,
  ) {
    if (!this.options.withDeleted) {
      this.where({ is_deleted: 0 });
    }
    next();
  },
);

export default mongoose.model<IPlayerBalance>(
  'PlayerBalance',
  playerBalanceSchema,
);
