import mongoose, { Schema, Document } from 'mongoose';

export type PaymentMode = 'test' | 'live';

export interface IPaymentConfig extends Document {
  paymentMethodId: number;
  name: string;
  config: Record<string, string>;
  mode: PaymentMode;
  isActive: boolean;
  updatedAt: Date;
}

const paymentConfigSchema: Schema = new Schema(
  {
    paymentMethodId: {
      type: Number,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
      enum: ['stripe', 'bastapay'],
    },
    config: {
      type: Map,
      of: String,
      required: true,
    },
    mode: {
      type: String,
      enum: ['test', 'live'],
      default: 'test',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: {
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
  },
);

export default mongoose.model<IPaymentConfig>(
  'PaymentConfig',
  paymentConfigSchema,
);
