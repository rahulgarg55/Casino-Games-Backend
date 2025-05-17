import mongoose, { Schema, Document } from 'mongoose';

export interface ICommissionTier extends Document {
  tierName: string;
  minReferrals: number;
  commissionRate: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

const CommissionTierSchema: Schema = new Schema(
  {
    tierName: { type: String, required: true },
    minReferrals: { type: Number, required: true, min: 0 },
    commissionRate: { type: Number, required: true, min: 0, max: 100 },
    currency: { type: String, required: true },
  },
  { timestamps: true },
);

CommissionTierSchema.index({ tierName: 1 }, { unique: true });

export default mongoose.model<ICommissionTier>(
  'CommissionTier',
  CommissionTierSchema,
);
