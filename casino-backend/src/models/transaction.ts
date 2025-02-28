import mongoose, { Schema, Document } from 'mongoose';

export interface ITransaction extends Document {
  player_id: mongoose.Types.ObjectId;
  amount: number;
  currency: string;
  transaction_type: string; // 'topup', 'withdrawal', 'wager', 'win'
  payment_method: string; // 'stripe', 'basta_pay'
  status: string; // 'pending', 'completed', 'failed', 'cancelled', 'disputed'
  payment_intent_id?: string; // For Stripe
  dispute_id?: string; // For Stripe disputes
  error?: string;
  created_at: Date;
  completed_at?: Date;
  metadata?: Record<string, any>;
  external_reference?: string;
}

const transactionSchema: Schema = new Schema(
  {
    player_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      required: true,
    },
    transaction_type: {
      type: String,
      required: true,
      enum: ['topup', 'withdrawal', 'wager', 'win'],
    },
    payment_method: {
      type: String,
      required: true,
      enum: ['stripe', 'basta_pay', 'credit_card', 'paypal', 'bank_transfer'],
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'completed', 'failed', 'cancelled', 'disputed'],
      default: 'pending',
    },
    payment_intent_id: {
      type: String,
      sparse: true,
    },
    dispute_id: {
      type: String,
      sparse: true,
    },
    error: {
      type: String,
    },
    completed_at: {
      type: Date,
    },
    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
    },
    external_reference: {
      type: String,
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

// Index for faster queries
transactionSchema.index({ player_id: 1, created_at: -1 });
transactionSchema.index({ payment_intent_id: 1 }, { sparse: true });
transactionSchema.index({ dispute_id: 1 }, { sparse: true });

export default mongoose.model<ITransaction>('Transaction', transactionSchema);