import mongoose, { Schema, Document } from 'mongoose';

export interface IPaymentMethod extends Document {
  player_id: mongoose.Types.ObjectId;
  method_type: string; // 'credit_card', 'paypal', 'bank_transfer' etc.
  details: {
    card_number?: string;
    expiry_date?: string;
    cvv?: string;
    paypal_email?: string;
    bank_account_number?: string;
    bank_name?: string;
  };
  is_default: boolean;
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
      card_number: { type: String, select: false },
      expiry_date: { type: String, select: false },
      cvv: { type: String, select: false },
      paypal_email: { type: String },
      bank_account_number: { type: String, select: false },
      bank_name: { type: String },
    },
    is_default: {
      type: Boolean,
      default: false,
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
        delete ret.details.card_number;
        delete ret.details.expiry_date;
        delete ret.details.cvv;
        delete ret.details.bank_account_number;
        return ret;
      },
    },
  },
);

export default mongoose.model<IPaymentMethod>(
  'PaymentMethod',
  paymentMethodSchema,
);
