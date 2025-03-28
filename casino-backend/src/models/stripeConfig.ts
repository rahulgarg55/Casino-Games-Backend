import mongoose, { Schema, Document } from 'mongoose';

export interface IStripeConfig extends Document {
  stripeWebhookSecret: string;
  stripeSecretKey: string;
  stripePublishableKey: string;
  stripeMode: number; // 0 = test , 1= live
}

const StripeConfigSchema: Schema = new Schema(
  {
    stripeWebhookSecret: { type: String, required: true },
    stripeSecretKey: { type: String, required: true },
    stripePublishableKey: { type: String, required: true },
    stripeMode: { type: Number, required: true }, // 0 = test , 1= live
  },
  { timestamps: true },
);

export const StripeConfig = mongoose.model<IStripeConfig>(
  'StripeConfig',
  StripeConfigSchema,
);
