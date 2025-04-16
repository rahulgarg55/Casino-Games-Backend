import mongoose, { Schema, Document } from 'mongoose';

export interface IPayout extends Document {
  affiliateId: mongoose.Types.ObjectId;
  amount: number;
  currency: string;
  paymentMethodId?: string;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  adminNotes?: string;
  stripePayoutId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PayoutSchema: Schema = new Schema(
  {
    affiliateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Affiliate',
      required: true,
    },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, required: true },
    paymentMethodId: { type: String },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'paid'],
      default: 'pending',
    },
    adminNotes: { type: String },
    stripePayoutId: { type: String },
  },
  { timestamps: true },
);

PayoutSchema.index({ affiliateId: 1, createdAt: -1 });
PayoutSchema.index({ status: 1 });

export default mongoose.model<IPayout>('Payout', PayoutSchema);
