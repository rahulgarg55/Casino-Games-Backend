import mongoose, { Schema, Document } from 'mongoose';

export type TransactionType = 'topup' | 'withdrawal' | 'wager' | 'win';
export type PaymentMethodType =
  | 'stripe'
  | 'basta_pay'
  | 'credit_card'
  | 'paypal'
  | 'bank_transfer';
export type TransactionStatus =
  | 'pending'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'disputed';

export interface ITransaction extends Document {
  player_id: mongoose.Types.ObjectId;
  amount: number;
  currency: string;
  transaction_type: TransactionType;
  payment_method: PaymentMethodType;
  status: TransactionStatus;
  payment_intent_id?: string;
  dispute_id?: string;
  error?: string;
  created_at: Date;
  completed_at?: Date;
  metadata?: Record<string, any>;
  external_reference?: string;
  stripe_charge_id?: string;
  affiliateId?: mongoose.Types.ObjectId; // Affiliate who referred the player
  affiliateCommission?: number; // Commission earned by the affiliate (e.g., 2% of win)
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
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
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
      trim: true,
    },
    dispute_id: {
      type: String,
      index: true,
      sparse: true,
      trim: true,
    },
    error: {
      type: String,
      trim: true,
    },
    completed_at: {
      type: Date,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    external_reference: {
      type: String,
      trim: true,
    },
    stripe_charge_id: {
      type: String,
      trim: true,
    },
    affiliateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Affiliate',
      default: null,
    },
    affiliateCommission: {
      type: Number,
      default: 0,
      min: 0,
    },
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
        ret.id = ret._id;
        delete ret._id;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
    },
  },
);

transactionSchema.index({ player_id: 1, created_at: -1 });
transactionSchema.index(
  { payment_intent_id: 1 },
  { unique: true, sparse: true },
);
transactionSchema.index({ dispute_id: 1 }, { sparse: true });
transactionSchema.index({ status: 1 });
transactionSchema.index({ transaction_type: 1 });

transactionSchema.pre<ITransaction>('save', function (next) {
  if (this.completed_at && this.status === 'pending') {
    this.status = 'completed';
  }
  next();
});

export default mongoose.model<ITransaction>('Transaction', transactionSchema);
