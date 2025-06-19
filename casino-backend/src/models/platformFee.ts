import mongoose, { Document, Schema } from 'mongoose';

export interface IPlatformFee extends Document {
  fee_percentage: number;
  is_active: boolean;
  min_fee_amount: number;
  max_fee_amount: number;
  created_at: Date;
  updated_at: Date;
}

const platformFeeSchema = new Schema({
  fee_percentage: {
    type: Number,
    required: true,
    default: 2, // 2% default fee
    min: 0,
    max: 100
  },
  is_active: {
    type: Boolean,
    required: true,
    default: true
  },
  min_fee_amount: {
    type: Number,
    required: true,
    default: 0
  },
  max_fee_amount: {
    type: Number,
    required: true,
    default: 1000
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model<IPlatformFee>('PlatformFee', platformFeeSchema); 