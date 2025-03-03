import mongoose, { Schema, Document } from 'mongoose';

export interface IPaymentMethod extends Document {
  player_id: mongoose.Types.ObjectId;
  method_type: string; // 'credit_card', 'paypal', 'bank_transfer', etc.
  details: Record<string, any>;
  is_default: boolean;
  stripe_payment_method_id?: string;
  created_at: Date;
  updated_at: Date;
}

const paymentMethodSchema: Schema = new Schema(
  {
    player_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      required: true,
    },
    method_type: {
      type: String,
      required: true,
      enum: ['credit_card', 'paypal', 'bank_transfer'],
    },
    details: {
      type: Map,
      of: Schema.Types.Mixed,
      required: true,
    },
    is_default: {
      type: Boolean,
      default: false,
    },
    stripe_payment_method_id: {
      type: String,
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
);

// Create index for faster queries
paymentMethodSchema.index({ player_id: 1 });

export default mongoose.model<IPaymentMethod>(
  'PaymentMethod',
  paymentMethodSchema,
);
