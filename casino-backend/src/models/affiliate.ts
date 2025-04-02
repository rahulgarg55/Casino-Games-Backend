import mongoose, { Schema, Document } from 'mongoose';

// Define the interface for TypeScript
export interface IAffiliate extends Document {
  user_id: mongoose.Types.ObjectId;
  referral_code: string;
  commission_rate: number;
  total_earnings: number;
  status: 'Active' | 'Inactive' | 'Banned';
}

// Define the Mongoose schema
const AffiliateSchema: Schema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'Player', required: true },
  referral_code: { type: String, required: true, unique: true },
  commission_rate: { type: Number, required: true, default: 10 },
  total_earnings: { type: Number, required: true, default: 0 },
  status: { type: String, enum: ['Active', 'Inactive', 'Banned'], required: true, default: 'Inactive' }
}, { timestamps: true });

// Export the model
export const Affiliate = mongoose.model<IAffiliate>('Affiliate', AffiliateSchema);
