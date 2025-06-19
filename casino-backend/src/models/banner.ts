import mongoose, { Schema, Document } from 'mongoose';

export interface IBannerConfig extends Document {
  title: string;
  subtitle: string;
  buttonText: string;
  countdown: string;
  updatedAt: Date;
  createdAt: Date;
  startTime?: string;
}

const bannerConfigSchema: Schema = new Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      default: 'YOUR ULTIMATE CASINO ADVENTURE AWAITS',
    },
    subtitle: {
      type: String,
      required: [true, 'Subtitle is required'],
      trim: true,
      default: "DON'T MISS THE MAIN EVENT",
    },
    buttonText: {
      type: String,
      required: [true, 'Button text is required'],
      trim: true,
      default: 'PLAY',
    },
    countdown: {
      type: String,
      required: [true, 'Countdown is required'],
      match: [/^\d{2}:\d{2}:\d{2}$/, 'Countdown must be in hh:mm:ss format'],
      default: '15:40:24',
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    startTime: { type: String },
  },
  { timestamps: true }
);

export const BannerConfig = mongoose.model<IBannerConfig>('BannerConfig', bannerConfigSchema);