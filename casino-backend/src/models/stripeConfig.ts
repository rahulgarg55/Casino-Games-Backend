import mongoose, { Schema, Document } from 'mongoose';

export interface IStripeConfig extends Document {
  stripeWebhookSecret: string;
  stripeSecretKey: string;
  stripePublishableKey: string;
  stripeTestMode: boolean;
}

const StripeConfigSchema: Schema = new Schema(
  {
    stripeWebhookSecret: { type: String, required: true },
    stripeSecretKey: { type: String, required: true },
    stripePublishableKey: { type: String, required: true },
    stripeTestMode: { type: Boolean, required: true },
  },
  { timestamps: true },
);

export const StripeConfig = mongoose.model<IStripeConfig>(
  'StripeConfig',
  StripeConfigSchema,
);
